-- Fase 2. Substituição atômica da receita; RLS continua em vigor.
begin;
create or replace function public.set_recipe(p_menu_item_id uuid, p_items jsonb)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Não autenticado.'; end if;
  -- Serializa edições simultâneas da mesma receita.
  perform 1 from public.menu_items where id = p_menu_item_id and user_id = v_uid for update;
  if not found then raise exception 'Item do cardápio não encontrado.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Receita inválida.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as x(inventory_id uuid, qty_used numeric)
             where x.inventory_id is null or x.qty_used is null or x.qty_used <= 0
               or x.qty_used >= 10000000 or x.qty_used <> round(x.qty_used, 3)) then
    raise exception 'Use quantidades positivas com até três casas decimais.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_items) as x(inventory_id uuid, qty_used numeric)
             where not exists (select 1 from public.inventory i where i.id = x.inventory_id and i.user_id = v_uid)) then
    raise exception 'Insumo não encontrado no seu estoque.';
  end if;
  delete from public.recipe_items where menu_item_id = p_menu_item_id and user_id = v_uid;
  insert into public.recipe_items (menu_item_id, inventory_id, qty_used, unit, user_id)
  select p_menu_item_id, i.id, x.qty_used, i.unit, v_uid
  from jsonb_to_recordset(p_items) as x(inventory_id uuid, qty_used numeric)
  join public.inventory i on i.id = x.inventory_id and i.user_id = v_uid;
end $$;
revoke all on function public.set_recipe(uuid, jsonb) from public;
grant execute on function public.set_recipe(uuid, jsonb) to authenticated;
commit;
