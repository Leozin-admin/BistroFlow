-- =============================================================
-- BistroFlow — Migration: order_items + recipe_items + stock_movements
-- Data: 2026-01-01
--
-- Escopo:
--   * Adiciona orders.customer_id (nullable, FK → customers).
--   * Cria order_items (linhas reais dos pedidos).
--   * Cria recipe_items (composição de cada item do cardápio).
--   * Cria stock_movements (histórico de movimentações de estoque).
--   * Adiciona CHECKs de preço/custo/qty/mín (sem mexer em dados).
--   * Configura RLS com integridade multi-tenant:
--       - order_items:     owner do order E owner do menu_item
--       - recipe_items:    owner do menu_item E owner do inventory
--       - stock_movements: user_id direto, e se order_id/inventory_id
--                          existirem, eles também pertencem ao mesmo
--                          auth.uid()
--
-- NÃO-destrutivo:
--   * Não altera orders.items / customer / phone / total.
--   * Não mexe em menu_items.stock.
--   * Não apaga dados.
--   * Não altera auth/Stripe/frontend.
--   * Idempotente: pode rodar mais de uma vez sem erro.
-- =============================================================

-- -------------------------------------------------------------
-- 0. Pré-checagens (fail-fast se algo estiver divergente)
-- -------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='orders') then
    raise exception 'Tabela public.orders não encontrada. Rode o schema.sql antes.';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='menu_items') then
    raise exception 'Tabela public.menu_items não encontrada. Rode o schema.sql antes.';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='inventory') then
    raise exception 'Tabela public.inventory não encontrada. Rode o schema.sql antes.';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='customers') then
    raise exception 'Tabela public.customers não encontrada. Rode o schema.sql antes.';
  end if;

  -- Garantia multi-tenant: orders.menu_items.inventory precisam de user_id.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='menu_items' and column_name='user_id'
  ) then
    raise exception 'Coluna public.menu_items.user_id ausente. Schema incompatível.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='inventory' and column_name='user_id'
  ) then
    raise exception 'Coluna public.inventory.user_id ausente. Schema incompatível.';
  end if;
end $$;

-- =============================================================
-- 1. orders.customer_id
--    Nullable + on delete set null → preserva pedidos existentes
--    que ainda não têm cliente cadastrado.
-- =============================================================
alter table public.orders
  add column if not exists customer_id uuid
  references public.customers(id) on delete set null;

create index if not exists idx_orders_customer_id on public.orders(customer_id);

-- =============================================================
-- 2. order_items
-- =============================================================
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  quantity numeric(10,2) not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  total numeric(10,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id     on public.order_items(order_id);
create index if not exists idx_order_items_menu_item_id on public.order_items(menu_item_id);

-- =============================================================
-- 3. recipe_items
--    Um mesmo ingrediente (inventory_id) não pode aparecer
--    duas vezes na mesma receita (menu_item_id).
-- =============================================================
create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id)  on delete restrict,
  quantity numeric(10,2) not null check (quantity > 0),
  unit text not null default 'un',
  created_at timestamptz not null default now(),
  unique (menu_item_id, inventory_id)
);

create index if not exists idx_recipe_items_menu_item_id on public.recipe_items(menu_item_id);
create index if not exists idx_recipe_items_inventory_id on public.recipe_items(inventory_id);

-- =============================================================
-- 4. stock_movements
--    Razão de movimentações de estoque (entrada/saída/ajuste).
--    user_id identifica quem registrou; order_id é opcional
--    para ligar ao pedido que originou a saída.
-- =============================================================
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  quantity_change numeric(10,2) not null check (quantity_change <> 0),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movements_user_id      on public.stock_movements(user_id);
create index if not exists idx_stock_movements_inventory_id on public.stock_movements(inventory_id);
create index if not exists idx_stock_movements_order_id     on public.stock_movements(order_id);

-- =============================================================
-- 5. Constraints de integridade em tabelas existentes
--    Apenas CHECKs seguros — não mudam dados existentes.
--    Idempotentes via DROP IF EXISTS antes.
-- =============================================================

alter table public.menu_items
  drop constraint if exists menu_items_price_nonneg;
alter table public.menu_items
  add constraint menu_items_price_nonneg check (price >= 0) not valid;

alter table public.menu_items
  drop constraint if exists menu_items_cost_nonneg;
alter table public.menu_items
  add constraint menu_items_cost_nonneg check (cost >= 0) not valid;

alter table public.inventory
  drop constraint if exists inventory_qty_nonneg;
alter table public.inventory
  add constraint inventory_qty_nonneg check (qty >= 0) not valid;

alter table public.inventory
  drop constraint if exists inventory_min_nonneg;
alter table public.inventory
  add constraint inventory_min_nonneg check (min >= 0) not valid;

-- =============================================================
-- 6. ROW LEVEL SECURITY — novas tabelas
--    Padrão do projeto: usuário só acessa os próprios dados.
--    Multi-tenant estrito: TODOS os owners referenciados devem
--    coincidir com auth.uid().
--
--      order_items:
--        - order_id.order.user_id     = auth.uid()
--        - menu_item_id.user_id       = auth.uid()
--
--      recipe_items:
--        - menu_item_id.user_id       = auth.uid()
--        - inventory_id.user_id       = auth.uid()
--
--      stock_movements:
--        - user_id                    = auth.uid()
--        - inventory_id.user_id       = auth.uid()  (sempre presente)
--        - order_id.order.user_id     = auth.uid()  (quando não-nulo)
-- =============================================================

alter table public.order_items      enable row level security;
alter table public.recipe_items     enable row level security;
alter table public.stock_movements  enable row level security;

-- ----- order_items -----
drop policy if exists "order_items: own" on public.order_items;
create policy "order_items: own"
  on public.order_items for all
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.user_id = auth.uid()
    )
    and exists (
      select 1 from public.menu_items m
      where m.id = order_items.menu_item_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.user_id = auth.uid()
    )
    and exists (
      select 1 from public.menu_items m
      where m.id = order_items.menu_item_id
        and m.user_id = auth.uid()
    )
  );

-- ----- recipe_items -----
drop policy if exists "recipe_items: own" on public.recipe_items;
create policy "recipe_items: own"
  on public.recipe_items for all
  using (
    exists (
      select 1 from public.menu_items m
      where m.id = recipe_items.menu_item_id
        and m.user_id = auth.uid()
    )
    and exists (
      select 1 from public.inventory i
      where i.id = recipe_items.inventory_id
        and i.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.menu_items m
      where m.id = recipe_items.menu_item_id
        and m.user_id = auth.uid()
    )
    and exists (
      select 1 from public.inventory i
      where i.id = recipe_items.inventory_id
        and i.user_id = auth.uid()
    )
  );

-- ----- stock_movements -----
drop policy if exists "stock_movements: own" on public.stock_movements;
create policy "stock_movements: own"
  on public.stock_movements for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.inventory i
      where i.id = stock_movements.inventory_id
        and i.user_id = auth.uid()
    )
    and (
      order_id is null
      or exists (
        select 1 from public.orders o
        where o.id = stock_movements.order_id
          and o.user_id = auth.uid()
      )
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.inventory i
      where i.id = stock_movements.inventory_id
        and i.user_id = auth.uid()
    )
    and (
      order_id is null
      or exists (
        select 1 from public.orders o
        where o.id = stock_movements.order_id
          and o.user_id = auth.uid()
      )
    )
  );

-- =============================================================
-- 7. Trigger: garantir consistência de user_id em stock_movements
--    Se a chamada esquecer de passar user_id, preenche com auth.uid().
--    Defesa em profundidade — o with check da policy já protege.
-- =============================================================
create or replace function public.stock_movements_set_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stock_movements_set_user on public.stock_movements;
create trigger trg_stock_movements_set_user
  before insert on public.stock_movements
  for each row execute function public.stock_movements_set_user();

-- =============================================================
-- FIM DA MIGRATION
-- Nada é apagado; nada do schema.sql é sobrescrito.
-- Idempotente: re-rodar é seguro.
-- =============================================================
