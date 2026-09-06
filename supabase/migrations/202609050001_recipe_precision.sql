-- Fase 1. Aplicar depois de 20260101000000_orders_items_recipes_stock.sql.
-- Toda a migração é revertida se houver dados incompatíveis.
begin;

do $$
begin
  if to_regclass('public.recipe_items') is null then
    raise exception 'Aplique primeiro 20260101000000_orders_items_recipes_stock.sql.';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'recipe_items' and column_name = 'quantity') then
    -- As quantidades antigas só podem ser reaproveitadas se estiverem na unidade do estoque.
    if exists (select 1 from public.recipe_items r join public.inventory i on i.id = r.inventory_id
               where lower(trim(r.unit)) <> lower(trim(i.unit))) then
      raise exception 'Há receitas com unidade diferente do estoque. Converta suas quantidades/unidades antes de migrar.';
    end if;
    alter table public.recipe_items rename column quantity to qty_used;
  end if;
end $$;

alter table public.recipe_items alter column qty_used type numeric(10,3);
alter table public.recipe_items add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.recipe_items r set user_id = m.user_id from public.menu_items m
where m.id = r.menu_item_id and r.user_id is null;
alter table public.recipe_items alter column user_id set not null;
-- A unidade legada fica apenas para compatibilidade. O aplicativo usa inventory.unit.
alter table public.recipe_items drop constraint if exists recipe_items_inventory_id_fkey;
alter table public.recipe_items add constraint recipe_items_inventory_id_fkey
  foreign key (inventory_id) references public.inventory(id) on delete cascade;

alter table public.recipe_items enable row level security;
drop policy if exists "recipe_items: own" on public.recipe_items;
create policy "recipe_items: own" on public.recipe_items for all
using (auth.uid() = user_id
  and exists (select 1 from public.menu_items m where m.id = menu_item_id and m.user_id = auth.uid())
  and exists (select 1 from public.inventory i where i.id = inventory_id and i.user_id = auth.uid()))
with check (auth.uid() = user_id
  and exists (select 1 from public.menu_items m where m.id = menu_item_id and m.user_id = auth.uid())
  and exists (select 1 from public.inventory i where i.id = inventory_id and i.user_id = auth.uid()));
create index if not exists idx_recipe_items_user_id on public.recipe_items(user_id);

commit;
