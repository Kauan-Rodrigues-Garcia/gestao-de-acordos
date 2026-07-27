-- import_login_aliases — apelidos de login para a importação de planilhas de
-- operador. Usado quando o "Login" da planilha não bate exatamente com
-- perfis.usuario (ex.: variações de escrita). Opcional: sem linhas, a
-- importação casa apenas por perfis.usuario.
--
-- Não move dinheiro; só ajuda a vincular a linha ao operador certo.

create table if not exists public.import_login_aliases (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  perfil_id   uuid not null references public.perfis(id)   on delete cascade,
  login_excel text not null,
  criado_em   timestamptz not null default now(),
  -- um mesmo login (por empresa) só pode apontar para um operador
  unique (empresa_id, login_excel)
);

create index if not exists idx_import_login_aliases_empresa
  on public.import_login_aliases (empresa_id);

alter table public.import_login_aliases enable row level security;

-- Leitura: qualquer usuário autenticado da mesma empresa.
drop policy if exists import_login_aliases_select on public.import_login_aliases;
create policy import_login_aliases_select
  on public.import_login_aliases for select
  using (
    empresa_id in (select empresa_id from public.perfis where id = auth.uid())
  );

-- Escrita (insert/update/delete): apenas administradores/gerência da empresa.
drop policy if exists import_login_aliases_admin on public.import_login_aliases;
create policy import_login_aliases_admin
  on public.import_login_aliases for all
  using (
    exists (
      select 1 from public.perfis p
      where p.id = auth.uid()
        and p.empresa_id = import_login_aliases.empresa_id
        and p.perfil in ('administrador','super_admin','gerencia')
    )
  )
  with check (
    exists (
      select 1 from public.perfis p
      where p.id = auth.uid()
        and p.empresa_id = import_login_aliases.empresa_id
        and p.perfil in ('administrador','super_admin','gerencia')
    )
  );
