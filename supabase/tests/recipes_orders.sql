-- Executar somente em banco de teste após todas as migrations. Fixtures revertidas ao final.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email) values
 ('10000000-0000-0000-0000-000000000001', 'recipe-test@example.invalid'),
 ('10000000-0000-0000-0000-000000000002', 'other-test@example.invalid');
do $$
begin
  assert not exists (select 1 from public.inventory where user_id in
    ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')),
    'Novas contas devem iniciar com estoque vazio';
  assert (select count(*) = 2 from public.profiles where id in
    ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')),
    'Cadastro continua criando os perfis';
  assert (select count(*) = 2 from public.settings where user_id in
    ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')),
    'Cadastro continua criando as configurações';
end $$;
insert into public.inventory (id, user_id, name, unit, qty, cost) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Farinha teste','kg',0.1,10),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Queijo teste','kg',1,20),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','Insumo alheio','kg',1,20);
insert into public.menu_items (id,user_id,name,price) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Pizza teste',30),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Pão teste',5),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Sem receita',8),
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','Prato alheio',8);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $$
declare
  v_order public.orders;
  v_plain public.orders;
  v_result jsonb;
  v_failed boolean;
  v_count integer;
  v_inventory numeric;
begin
  perform public.set_recipe('30000000-0000-0000-0000-000000000001',
    '[{"inventory_id":"20000000-0000-0000-0000-000000000001","qty_used":0.125},
      {"inventory_id":"20000000-0000-0000-0000-000000000002","qty_used":0.1}]');
  perform public.set_recipe('30000000-0000-0000-0000-000000000002',
    '[{"inventory_id":"20000000-0000-0000-0000-000000000001","qty_used":0.05}]');
  assert (select qty_used = 0.125 from public.recipe_items where menu_item_id = '30000000-0000-0000-0000-000000000001' and inventory_id = '20000000-0000-0000-0000-000000000001'), 'Precisão de receita';
  v_failed := false;
  begin
    perform public.set_recipe('30000000-0000-0000-0000-000000000001',
      '[{"inventory_id":"20000000-0000-0000-0000-000000000001","qty_used":1},
        {"inventory_id":"20000000-0000-0000-0000-000000000001","qty_used":2}]');
  exception when unique_violation then v_failed := true; end;
  assert v_failed, 'Duplicação de insumo rejeitada';
  assert (select count(*) = 2 and min(qty_used) = 0.1 from public.recipe_items where menu_item_id = '30000000-0000-0000-0000-000000000001'), 'Receita anterior preservada após falha';
  v_failed := false;
  begin
    perform public.set_recipe('30000000-0000-0000-0000-000000000001',
      '[{"inventory_id":"20000000-0000-0000-0000-000000000003","qty_used":1}]');
  exception when raise_exception then v_failed := true; end;
  assert v_failed, 'Insumo de outro usuário rejeitado';
  v_failed := false;
  begin
    insert into public.recipe_items (menu_item_id, inventory_id, qty_used, user_id) values
    ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003',1,auth.uid());
  exception when insufficient_privilege then v_failed := true; end;
  assert v_failed, 'RLS rejeita vínculo direto com insumo alheio';

  select count(*) into v_count from public.orders;
  v_failed := false;
  begin
    perform public.create_order('{}', '[{"menu_item_id":"30000000-0000-0000-0000-000000000001","quantity":1.5}]');
  exception when raise_exception then v_failed := true; end;
  assert v_failed and (select count(*) = v_count from public.orders), 'Quantidade fracionada não cria pedido';
  v_failed := false;
  begin
    perform public.create_order('{}', '[{"menu_item_id":"30000000-0000-0000-0000-000000000004","quantity":1}]');
  exception when raise_exception then v_failed := true; end;
  assert v_failed, 'Prato de outro usuário rejeitado';
  update public.menu_items set available = false where id = '30000000-0000-0000-0000-000000000003';
  v_failed := false;
  begin
    perform public.create_order('{}', '[{"menu_item_id":"30000000-0000-0000-0000-000000000003","quantity":1}]');
  exception when raise_exception then v_failed := true; end;
  assert v_failed, 'Prato indisponível rejeitado';
  update public.menu_items set available = true where id = '30000000-0000-0000-0000-000000000003';

  v_order := public.create_order('{"customer":"Teste","total":0}',
    '[{"menu_item_id":"30000000-0000-0000-0000-000000000001","quantity":2,"unit_price":0},
      {"menu_item_id":"30000000-0000-0000-0000-000000000002","quantity":3},
      {"menu_item_id":"30000000-0000-0000-0000-000000000003","quantity":1}]');
  assert v_order.total = 83, 'Total calculado com preços reais';
  assert (select count(*) = 3 and sum(total) = 83 from public.order_items where order_id = v_order.id), 'Linhas do pedido';
  assert v_order.items like '%2x Pizza teste%', 'Texto compatível';
  perform public.set_order_status(v_order.id, 'preparando');
  assert (select qty = 0.1 from public.inventory where id = '20000000-0000-0000-0000-000000000001'), 'Sem baixa antes de entregar';
  v_result := public.set_order_status(v_order.id, 'entregue');
  assert v_result->'order'->>'status' = 'entregue', 'Entrega permitida sem estoque';
  assert (v_result->'order'->>'cost_total')::numeric = 8, 'Custo compartilhado e item sem receita';
  assert jsonb_array_length(v_result->'negative_inventory') = 1, 'Aviso de estoque negativo';
  assert (select qty = -0.3 from public.inventory where id = '20000000-0000-0000-0000-000000000001'), 'Baixa agrupada de farinha';
  assert (select qty = 0.8 from public.inventory where id = '20000000-0000-0000-0000-000000000002'), 'Baixa de queijo';
  assert (select count(*) = 2 from public.stock_movements where order_id = v_order.id), 'Uma movimentação por insumo';
  perform public.set_order_status(v_order.id, 'entregue');
  perform public.set_order_status(v_order.id, 'preparando');
  perform public.set_order_status(v_order.id, 'entregue');
  assert (select qty = -0.3 from public.inventory where id = '20000000-0000-0000-0000-000000000001'), 'Sem baixa duplicada';
  update public.orders set stock_deducted_at = null, cost_total = 0 where id = v_order.id;
  assert (select cost_total = 8 and stock_deducted_at is not null from public.orders where id = v_order.id), 'Marcador e custo protegidos';
  v_failed := false;
  begin
    update public.order_items set quantity = 99 where order_id = v_order.id;
  exception when raise_exception then v_failed := true; end;
  assert v_failed, 'Itens entregues preservados';
  update public.inventory set cost = 90 where id = '20000000-0000-0000-0000-000000000001';
  perform public.set_order_status(v_order.id, 'entregue');
  assert (select cost_total = 8 from public.orders where id = v_order.id), 'Custo histórico preservado';
  v_plain := public.create_order('{}','[{"menu_item_id":"30000000-0000-0000-0000-000000000003","quantity":1}]');
  v_result := public.set_order_status(v_plain.id, 'entregue');
  assert v_result->'order'->>'status' = 'entregue' and v_result->'order'->>'cost_total' is null, 'Pedido sem receita entregue com custo null';
  assert (select count(*) = 0 from public.stock_movements where order_id = v_plain.id), 'Sem receita não movimenta estoque';
  perform public.set_recipe('30000000-0000-0000-0000-000000000002', '[]');
  assert (select count(*) = 0 from public.recipe_items where menu_item_id = '30000000-0000-0000-0000-000000000002'), 'Limpar receita';

  -- Força overflow de custo DEPOIS dos updates de estoque: tudo deve voltar.
  perform public.set_recipe('30000000-0000-0000-0000-000000000002',
    '[{"inventory_id":"20000000-0000-0000-0000-000000000001","qty_used":9999999}]');
  v_plain := public.create_order('{}','[{"menu_item_id":"30000000-0000-0000-0000-000000000002","quantity":1}]');
  select qty into v_inventory from public.inventory where id = '20000000-0000-0000-0000-000000000001';
  v_failed := false;
  begin perform public.set_order_status(v_plain.id, 'entregue');
  exception when numeric_value_out_of_range then v_failed := true; end;
  assert v_failed, 'Falha técnica simulada';
  assert (select qty = v_inventory from public.inventory where id = '20000000-0000-0000-0000-000000000001'), 'Rollback do estoque';
  assert (select status = 'novo' and stock_deducted_at is null from public.orders where id = v_plain.id), 'Rollback do status';
  assert (select count(*) = 0 from public.stock_movements where order_id = v_plain.id), 'Rollback das movimentações';

  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
  assert (select count(*) = 0 from public.orders where id = v_order.id), 'Pedidos invisíveis para outro usuário';
  v_failed := false;
  begin perform public.set_order_status(v_order.id, 'entregue');
  exception when raise_exception then v_failed := true; end;
  assert v_failed, 'Outro usuário não entrega pedido';
  raise notice 'PASS: receitas, RLS, pedidos, entrega negativa, custo, idempotência e rollback.';
end $$;
rollback;
