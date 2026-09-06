-- SOMENTE banco local descartável: simula o mínimo de auth do Supabase.
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to authenticated;
grant execute on function auth.uid() to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
