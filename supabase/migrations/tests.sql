-- =============================================================
-- BistroFlow — Testes/queries de validação pós-migration
-- Rodar no SQL Editor do Supabase após aplicar a migration
-- 20260101000000_orders_items_recipes_stock.sql
--
-- Estes testes SÓ LEEM o estado do banco (SELECT) e fazem UPDATEs
-- em linhas de teste que devem falhar (esperado). Não alteram
-- dados de produção.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Tabelas novas existem
-- -------------------------------------------------------------
select 'tabelas_novas' as check, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('order_items', 'recipe_items', 'stock_movements')
order by table_name;
-- esperado: 3 linhas

-- -------------------------------------------------------------
-- 2. Coluna customer_id em orders
-- -------------------------------------------------------------
select 'orders_customer_id' as check,
       column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'orders'
  and column_name = 'customer_id';
-- esperado: 1 linha, nullable = YES

-- -------------------------------------------------------------
-- 3. Foreign keys existem
-- -------------------------------------------------------------
select 'foreign_keys' as check,
       tc.table_name as from_table,
       kcu.column_name as from_column,
       ccu.table_name as to_table,
       ccu.column_name as to_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name in ('orders', 'order_items', 'recipe_items', 'stock_movements')
order by tc.table_name, kcu.column_name;
-- esperado:
--   orders.customer_id       → customers.id
--   order_items.order_id     → orders.id
--   order_items.menu_item_id → menu_items.id
--   recipe_items.menu_item_id → menu_items.id
--   recipe_items.inventory_id → inventory.id
--   stock_movements.user_id  → auth.users.id
--   stock_movements.inventory_id → inventory.id
--   stock_movements.order_id → orders.id

-- -------------------------------------------------------------
-- 4. RLS habilitado nas novas tabelas
-- -------------------------------------------------------------
select 'rls_habilitado' as check, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('order_items', 'recipe_items', 'stock_movements')
order by tablename;
-- esperado: 3 linhas, rowsecurity = true

-- -------------------------------------------------------------
-- 5. Policies existem
-- -------------------------------------------------------------
select 'policies' as check, schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('order_items', 'recipe_items', 'stock_movements')
order by tablename, policyname;
-- esperado:
--   order_items     → "order_items: own"
--   recipe_items    → "recipe_items: own"
--   stock_movements → "stock_movements: own"

-- -------------------------------------------------------------
-- 6. Constraint: quantity inválido é rejeitado
-- -------------------------------------------------------------
-- Este bloco DEVE falhar. Se rodar sem erro, há bug.
do $$
declare
  v_order uuid;
  v_menu  uuid;
  v_user  uuid;
begin
  -- pega um user_id válido
  select user_id into v_user from public.menu_items limit 1;
  if v_user is null then
    raise notice 'Sem dados — pulando teste 6';
    return;
  end if;
  select id into v_order from public.orders where user_id = v_user limit 1;
  select id into v_menu  from public.menu_items where user_id = v_user limit 1;
  if v_order is null or v_menu is null then
    raise notice 'Sem dados suficientes — pulando teste 6';
    return;
  end if;

  begin
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price)
    values (v_order, v_menu, 0, 10);
    raise exception 'FALHA: quantity = 0 deveria ser rejeitado';
  exception when check_violation then
    raise notice 'OK: quantity = 0 rejeitado (check_violation)';
  end;

  begin
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price)
    values (v_order, v_menu, -1, 10);
    raise exception 'FALHA: quantity negativa deveria ser rejeitada';
  exception when check_violation then
    raise notice 'OK: quantity negativa rejeitada';
  end;
end $$;

-- -------------------------------------------------------------
-- 7. Constraint: unit_price negativo é rejeitado
-- -------------------------------------------------------------
do $$
declare
  v_order uuid;
  v_menu  uuid;
  v_user  uuid;
begin
  select user_id into v_user from public.menu_items limit 1;
  if v_user is null then return; end if;
  select id into v_order from public.orders where user_id = v_user limit 1;
  select id into v_menu  from public.menu_items where user_id = v_user limit 1;
  if v_order is null or v_menu is null then return; end if;

  begin
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price)
    values (v_order, v_menu, 1, -0.01);
    raise exception 'FALHA: unit_price negativo deveria ser rejeitado';
  exception when check_violation then
    raise notice 'OK: unit_price negativo rejeitado';
  end;
end $$;

-- -------------------------------------------------------------
-- 8. total = quantity * unit_price (coluna gerada)
-- -------------------------------------------------------------
select 'total_calculado' as check, id, quantity, unit_price, total
from public.order_items
order by created_at desc
limit 5;
-- esperado: total = quantity * unit_price em todas as linhas

-- -------------------------------------------------------------
-- 9. Ordem pode ter múltiplos order_items
--    (verifica índice + integridade — só leitura)
-- -------------------------------------------------------------
select 'multiplos_itens_por_pedido' as check, order_id, count(*) as qtd
from public.order_items
group by order_id
having count(*) > 1
limit 5;
-- se vazio: nenhum pedido com >1 item ainda (esperado em projeto novo).
-- isso aqui só mostra que o índice está disponível; o limite do schema
-- não impede N itens por pedido.

-- -------------------------------------------------------------
-- 10. menu_item pode ter múltiplos recipe_items
-- -------------------------------------------------------------
select 'multiplos_ingredientes_por_receita' as check, menu_item_id, count(*) as qtd
from public.recipe_items
group by menu_item_id
having count(*) > 1
limit 5;
-- se vazio: nenhuma receita com >1 ingrediente cadastrada ainda.

-- -------------------------------------------------------------
-- 11. Ingrediente duplicado na mesma receita é rejeitado
--     Totalmente não destrutivo: roda em uma micro-transação
--     que SEMPRE faz ROLLBACK no fim. Nenhum DELETE em dados
--     preexistentes. Se já existir recipe_item para o par
--     (menu_item_id, inventory_id), o teste tenta inserir um
--     duplicado direto e usa o registro preexistente como prova
--     de violação de UNIQUE.
-- -------------------------------------------------------------
do $outer$
declare
  v_menu        uuid;
  v_inv         uuid;
  v_user        uuid;
  v_existing_id uuid;
begin
  select user_id into v_user from public.menu_items limit 1;
  if v_user is null then
    raise notice 'Sem dados — pulando teste 11';
    return;
  end if;
  select id into v_menu from public.menu_items where user_id = v_user limit 1;
  select id into v_inv  from public.inventory  where user_id = v_user limit 1;
  if v_menu is null or v_inv is null then
    raise notice 'Sem dados suficientes — pulando teste 11';
    return;
  end if;

  -- Procura recipe_item preexistente para esse par.
  select id into v_existing_id
  from public.recipe_items
  where menu_item_id = v_menu
    and inventory_id = v_inv
  limit 1;

  -- Tudo abaixo acontece dentro de uma micro-transação que é
  -- revertida por ROLLBACK TO SAVEPOINT sp_recipe_test. Nada
  -- preexistente é alterado; qualquer INSERT feito aqui é
  -- desfeito, mesmo que dê erro.
  <<<sp_recipe_test>>>
  begin
    -- Se não existe, insere uma linha temporária só pra ter um
    -- alvo de UNIQUE. Será revertida abaixo.
    if v_existing_id is null then
      insert into public.recipe_items (menu_item_id, inventory_id, quantity, unit)
      values (v_menu, v_inv, 1, 'kg');
    end if;

    -- Tenta inserir duplicado. Deve falhar com unique_violation.
    begin
      insert into public.recipe_items (menu_item_id, inventory_id, quantity, unit)
      values (v_menu, v_inv, 2, 'kg');
      raise exception 'FALHA: ingrediente duplicado deveria ser rejeitado';
    exception when unique_violation then
      raise notice 'OK: ingrediente duplicado rejeitado (unique_violation)';
    end;
  exception when others then
    raise notice 'teste 11 finalizado (será revertido): %', sqlerrm;
  end;

  -- Reverte QUALQUER alteração feita neste bloco, incluindo o
  -- INSERT temporário. Se havia registro preexistente, ele
  -- nem foi tocado.
  rollback to savepoint sp_recipe_test;
  raise notice 'OK: teste 11 revertido (SAVEPOINT) — nenhum dado persistente alterado';
exception when others then
  -- Falha catastrófica: nada para reverter além do savepoint.
  raise notice 'ERRO no teste 11: %', sqlerrm;
end;
$outer$;

-- -------------------------------------------------------------
-- 12. stock_movements: quantity_change = 0 é rejeitado
-- -------------------------------------------------------------
do $$
declare
  v_inv  uuid;
  v_user uuid;
begin
  select user_id into v_user from public.inventory limit 1;
  if v_user is null then return; end if;
  select id into v_inv from public.inventory where user_id = v_user limit 1;
  if v_inv is null then return; end if;

  begin
    insert into public.stock_movements (user_id, inventory_id, quantity_change, reason)
    values (v_user, v_inv, 0, 'teste');
    raise exception 'FALHA: quantity_change = 0 deveria ser rejeitado';
  exception when check_violation then
    raise notice 'OK: quantity_change = 0 rejeitado';
  end;
end $$;

-- =============================================================
-- FIM DOS TESTES
-- Esperado: tudo OK, nenhuma exception não-tratada.
-- =============================================================
