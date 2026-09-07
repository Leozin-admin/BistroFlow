-- =============================================================
-- BistroFlow — Schema + RLS
-- Cole tudo isso no SQL Editor do Supabase e rode uma vez.
-- =============================================================

-- 1. Tabela: profiles (1 usuário auth → 1 restaurante)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  restaurant text not null default 'Meu Restaurante',
  phone text,
  created_at timestamptz not null default now()
);

-- 2. Tabela: menu_items
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'Pratos',
  description text,
  price numeric(10,2) not null default 0,
  cost numeric(10,2) not null default 0,
  stock int not null default 0,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. Tabela: orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer text not null,
  phone text,
  items text not null,
  total numeric(10,2) not null default 0,
  status text not null default 'novo',
  channel text not null default 'whatsapp',
  created_at timestamptz not null default now()
);

-- 4. Tabela: customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  orders int not null default 0,
  total numeric(10,2) not null default 0,
  last_order date
);

-- 5. Tabela: inventory
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text not null default 'un',
  qty numeric(10,2) not null default 0,
  min numeric(10,2) not null default 0,
  cost numeric(10,2) not null default 0
);

-- 6. Tabela: settings (1 linha por usuário)
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  restaurant_name text,
  whatsapp text,
  notifications boolean not null default true,
  auto_confirm boolean not null default true
);

-- =============================================================
-- ROW LEVEL SECURITY
-- Cada usuário só vê/modifica os próprios dados.
-- =============================================================

alter table public.profiles  enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders     enable row level security;
alter table public.customers  enable row level security;
alter table public.inventory  enable row level security;
alter table public.settings   enable row level security;

-- profiles
create policy "profiles: read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id);

-- menu_items
create policy "menu_items: own"      on public.menu_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- orders
create policy "orders: own"          on public.orders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- customers
create policy "customers: own"       on public.customers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- inventory
create policy "inventory: own"       on public.inventory for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- settings
create policy "settings: read own"   on public.settings for select using (auth.uid() = user_id);
create policy "settings: insert own" on public.settings for insert with check (auth.uid() = user_id);
create policy "settings: update own" on public.settings for update using (auth.uid() = user_id);

-- =============================================================
-- Trigger: cria profile + settings automaticamente no signup
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_restaurant text;
  v_phone text;
begin
  v_name       := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_restaurant := coalesce(new.raw_user_meta_data->>'restaurant', 'Meu Restaurante');
  v_phone      := new.raw_user_meta_data->>'phone';

  insert into public.profiles (id, name, restaurant, phone)
  values (new.id, v_name, v_restaurant, v_phone)
  on conflict (id) do nothing;

  insert into public.settings (user_id) values (new.id) on conflict do nothing;

  -- Cardápio de exemplo. O estoque começa vazio e é cadastrado pelo usuário.
  insert into public.menu_items (user_id, name, category, description, price, cost, stock, available) values
    (new.id, 'Pizza Margherita',     'Pizzas',  'Molho de tomate artesanal, mussarela de búfala e manjericão.', 49.90, 14, 999, true),
    (new.id, 'Pizza Calabresa',      'Pizzas',  'Calabresa fatiada, cebola roxa e azeitonas pretas.',           45.90, 12, 999, true),
    (new.id, 'Combo Sushi 20 peças', 'Japonês', '20 peças variadas com salmão, atum e camarão.',                 89.90, 32,  25, true),
    (new.id, 'Hambúrguer Artesanal', 'Lanches', 'Pão brioche, blend 180g, cheddar e bacon.',                    42.50, 11,  60, true),
    (new.id, 'Bowl Vegetariano',     'Saudável','Quinoa, grão-de-bico, abóbora, folhas e molho de tahine.',     47.00, 13,  40, true),
    (new.id, 'Coca-Cola 350ml',      'Bebidas', 'Lata 350ml gelada.',                                              8.00,  3, 200, true);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- Habilitar confirmação por email (opcional, configurável)
-- Por padrão o Supabase exige confirmação. Descomente se quiser
-- permitir login imediato:
-- =============================================================
-- (Vá em Authentication → Providers → Email e desligue
--  "Confirm email" se quiser login sem confirmar)

-- =============================================================
-- PRONTO. Agora você pode cadastrar/login pelo app.
-- =============================================================
