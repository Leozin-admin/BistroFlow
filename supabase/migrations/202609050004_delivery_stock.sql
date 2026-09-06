-- Fase 4. Estoque negativo é permitido; entrega e custo são atômicos e idempotentes.
begin;
alter table public.inventory drop constraint if exists inventory_qty_nonneg;
-- Mantém a faixa de valores anterior e acrescenta precisão fracionária.
alter table public.inventory alter column qty type numeric(13,3);
alter table public.stock_movements alter column quantity_change type numeric(13,3);
alter table public.orders add column if not exists cost_total numeric(10,2);
alter table public.orders add column if not exists stock_deducted_at timestamptz;
-- Pedidos históricos não provocam baixa retroativa ao trocar o status.
update public.orders set stock_deducted_at = now()
where status = 'entregue' and stock_deducted_at is null;

create or replace function public.apply_order_delivery()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare
  v_consumption record;
  v_unit_cost numeric;
  v_cost numeric := 0;
  v_has_recipe boolean := false;
begin
  -- O marcador e o custo são controlados pela entrega, nunca pelo navegador.
  new.stock_deducted_at := old.stock_deducted_at;
  new.cost_total := old.cost_total;
  if new.status <> 'entregue' or old.stock_deducted_at is not null then return new; end if;
  if old.status = 'entregue' then
    new.stock_deducted_at := now();
    return new;
  end if;
  if auth.uid() is null or new.user_id <> auth.uid() then raise exception 'Pedido não autorizado.'; end if;

  -- Receitas não podem mudar no meio da entrega (set_recipe trava os mesmos pratos).
  perform m.id from public.menu_items m
  where m.id in (select oi.menu_item_id from public.order_items oi where oi.order_id = new.id)
    and m.user_id = new.user_id order by m.id for share;

  for v_consumption in
    select r.inventory_id, sum(r.qty_used * oi.quantity) as consumed
    from public.order_items oi
    join public.recipe_items r on r.menu_item_id = oi.menu_item_id and r.user_id = new.user_id
    where oi.order_id = new.id and oi.user_id = new.user_id
    group by r.inventory_id order by r.inventory_id
  loop
    -- UPDATE aritmético com lock de linha evita perda de baixas entre pedidos simultâneos.
    update public.inventory set qty = qty - v_consumption.consumed
    where id = v_consumption.inventory_id and user_id = new.user_id returning cost into v_unit_cost;
    if not found then raise exception 'Insumo da receita não encontrado.'; end if;
    v_has_recipe := true;
    v_cost := v_cost + v_unit_cost * v_consumption.consumed;
    insert into public.stock_movements (user_id, inventory_id, order_id, quantity_change, reason)
    values (new.user_id, v_consumption.inventory_id, new.id, -v_consumption.consumed, 'entrega');
  end loop;
  new.cost_total := case when v_has_recipe then round(v_cost, 2) else null end;
  new.stock_deducted_at := now();
  return new;
end $$;
revoke all on function public.apply_order_delivery() from public;
drop trigger if exists trg_apply_order_delivery on public.orders;
create trigger trg_apply_order_delivery before update on public.orders
for each row execute function public.apply_order_delivery();

-- As linhas do pedido usam o mesmo lock da entrega e ficam preservadas após a baixa.
create or replace function public.guard_delivered_order_items()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare
  v_order record;
  v_old_id uuid;
  v_new_id uuid;
begin
  if tg_op <> 'INSERT' then v_old_id := old.order_id; end if;
  if tg_op <> 'DELETE' then v_new_id := new.order_id; end if;
  for v_order in select id, stock_deducted_at from public.orders
                 where id in (v_old_id, v_new_id) order by id for update
  loop
    if v_order.stock_deducted_at is not null then
      raise exception 'Os itens de um pedido já entregue não podem ser alterados.';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.guard_delivered_order_items() from public;
drop trigger if exists trg_guard_delivered_order_items on public.order_items;
create trigger trg_guard_delivered_order_items before insert or update or delete on public.order_items
for each row execute function public.guard_delivered_order_items();

create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare
  v_order public.orders;
  v_negative jsonb;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if p_status is null or p_status not in ('novo','confirmado','preparando','pronto','entregue','cancelado') then
    raise exception 'Status inválido.';
  end if;
  update public.orders set status = p_status where id = p_order_id and user_id = auth.uid()
  returning * into v_order;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit', i.unit, 'qty', i.qty)
                            order by i.name), '[]'::jsonb)
  into v_negative from public.inventory i
  where p_status = 'entregue' and i.user_id = auth.uid() and i.qty < 0
    and exists (select 1 from public.stock_movements sm
                where sm.order_id = p_order_id and sm.inventory_id = i.id and sm.reason = 'entrega');
  return jsonb_build_object('order', to_jsonb(v_order), 'negative_inventory', v_negative);
end $$;
revoke all on function public.set_order_status(uuid, text) from public;
grant execute on function public.set_order_status(uuid, text) to authenticated;
commit;
