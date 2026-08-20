-- Ordem do menu lateral por empresa.
-- Leitura: usuários que podem acessar a empresa.
-- Escrita: somente super_admin. Não entra no Realtime por decisão de produto.

create table if not exists public.menu_lateral_config (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  ordem text[] not null default '{}'::text[],
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid null references public.perfis(id) on delete set null
);

alter table public.menu_lateral_config enable row level security;

drop policy if exists menu_lateral_config_select on public.menu_lateral_config;
create policy menu_lateral_config_select
  on public.menu_lateral_config
  for select
  to authenticated
  using (public.fn_can_access_empresa(empresa_id));

drop policy if exists menu_lateral_config_super_admin_insert on public.menu_lateral_config;
create policy menu_lateral_config_super_admin_insert
  on public.menu_lateral_config
  for insert
  to authenticated
  with check (public.fn_user_is_super_admin());

drop policy if exists menu_lateral_config_super_admin_update on public.menu_lateral_config;
create policy menu_lateral_config_super_admin_update
  on public.menu_lateral_config
  for update
  to authenticated
  using (public.fn_user_is_super_admin())
  with check (public.fn_user_is_super_admin());

revoke all on table public.menu_lateral_config from anon;
grant select, insert, update on table public.menu_lateral_config to authenticated;

comment on table public.menu_lateral_config is
  'Ordem global das abas do menu lateral por empresa; somente superadmins alteram.';
