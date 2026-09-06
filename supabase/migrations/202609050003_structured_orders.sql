-- Fase 3. Pedidos e suas linhas são gravados na mesma transação.
begin;
do $$
begin
  if exists (select 1 from public.order_items where quantity <> trunc(quantity) or quantity > 2147483647) then
    raise exception 'Há pedidos com quantidades fracionadas ou fora do limite inteiro. Revise antes de migrar.';
  end if;
end $$;
-- Coluna calculada: recriada com os mesmos valores após ajustar o tipo de quantity.
alter table public.order_items drop column if exists total;
alter table public.order_items alter column quantity type integer using quantity::integer;
alter table public.order_items add column total numeric(10,2) generated always as (quantity * unit_price) stored;
alter table public.order_items add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.order_items oi set user_id = o.user_id from public.orders o
where o.id = oi.order_id and oi.user_id is null;
alter table public.order_items alter column user_id set not null;
create index if not exists idx_order_items_user_id on public.order_items(user_id);
drop policy if exists "order_items: own" on public.order_items;
create policy "order_items: own" on public.order_items for all
using (auth.uid() = user_id
  and exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  and exists (select 1 from public.menu_items m where m.id = menu_item_id and m.user_id = auth.uid()))
with check (auth.uid() = user_id
  and exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  and exists (select 1 from public.menu_items m where m.id = menu_item_id and m.user_id = auth.uid()));

create or replace function public.create_order(p_order jsonb, p_items jsonb)
returns public.orders language plpgsql security invoker set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_count integer;
  v_description text;
  v_total numeric;
begin
  if v_uid is null then raise exception 'Não autenticado.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Itens inválidos.'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Escolha ao menos um item.'; end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as x(menu_item_id uuid, quantity numeric)
             where x.menu_item_id is null or x.quantity is null or x.quantity <= 0
               or x.quantity > 2147483647 or x.quantity <> trunc(x.quantity)) then
    raise exception 'Use quantidades inteiras positivas.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as x(menu_item_id uuid)
             group by x.menu_item_id having count(*) > 1) then raise exception 'Item duplicado.'; end if;
  -- Trava os preços enquanto grava o pedido, em ordem estável para evitar deadlocks.
  perform m.id from public.menu_items m
  join jsonb_to_recordset(p_items) as x(menu_item_id uuid) on x.menu_item_id = m.id
  where m.user_id = v_uid and m.available order by m.id for share of m;
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_items) then raise exception 'Um item está indisponível ou não pertence ao seu cardápio.'; end if;
  select string_agg(x.quantity::integer || 'x ' || m.name, ', ' order by m.name, m.id),
         sum(m.price * x.quantity)
  into v_description, v_total
  from jsonb_to_recordset(p_items) as x(menu_item_id uuid, quantity numeric)
  join public.menu_items m on m.id = x.menu_item_id and m.user_id = v_uid;
  insert into public.orders (user_id, customer, phone, items, total, status, channel)
  values (v_uid, coalesce(nullif(trim(p_order->>'customer'), ''), 'Cliente'),
          nullif(trim(p_order->>'phone'), ''), v_description, v_total, 'novo',
          coalesce(nullif(p_order->>'channel', ''), 'balcao')) returning * into v_order;
  insert into public.order_items (order_id, menu_item_id, quantity, unit_price, user_id)
  select v_order.id, m.id, x.quantity, m.price, v_uid
  from jsonb_to_recordset(p_items) as x(menu_item_id uuid, quantity integer)
  join public.menu_items m on m.id = x.menu_item_id and m.user_id = v_uid;
  return v_order;
end $$;
revoke all on function public.create_order(jsonb, jsonb) from public;
grant execute on function public.create_order(jsonb, jsonb) to authenticated;
commit;
