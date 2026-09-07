-- Novas contas iniciam com estoque vazio. Não altera insumos já cadastrados.
-- Preserva perfil, configurações e cardápio inicial.
begin;

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

commit;
