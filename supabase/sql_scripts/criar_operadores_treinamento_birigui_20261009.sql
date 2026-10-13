-- =============================================================================
-- Operadores novos do Treinamento (Birigui) — outubro/2026
-- 09/10/2026 · BookPlay · 6 logins
-- =============================================================================
--
-- ✅ RODADO em 09/10/2026 no SQL Editor. Os 6 foram criados (nenhum
--    preexistia); a prova interna passou e o resultado veio com as 6 linhas
--    completas. Não precisa rodar de novo — rodar de novo não recria ninguém.
--
-- Rodar INTEIRO no SQL Editor do Supabase. Tudo que grava está num bloco `do`
-- só: se qualquer conferência falhar, nada é gravado e a mensagem de erro diz
-- o que faltou. A última consulta mostra o resultado (6 linhas).
--
-- Mesmo formato de criar_operadores_play4_playmix_play5_20260928.sql. Para
-- cada login:
--   1. cria o acesso (auth.users + auth.identities) com o e-mail
--      <login>@interno.sistema e a senha 123456. O gatilho `trg_novo_usuario`
--      cria a linha em `perfis` com cargo operador, setor e empresa;
--   2. põe a pessoa na equipe «Treinamento» do setor de origem — o padrão de
--      quem está em treinamento (Play 1, Play 3; a do Playmix foi criada hoje);
--   3. clona na equipe do setor alternativo Treinamento, contando no
--      recebimento;
--   4. grava a meta de outubro/2026 (Meta 1 + extras 2 e 3).
--
-- Tokens: as OITO colunas de token de auth.users vão '' e não nulo (ver o
-- script de 28/09).
--
-- Rodar de novo não duplica: quem já existe no setor certo não é recriado nem
-- tem a senha trocada; clone e meta são idempotentes.
-- =============================================================================

drop table if exists pg_temp._novos;
create temp table _novos (
  login     text primary key,
  nome      text not null,
  setor_id  uuid not null,
  equipe_id uuid not null,
  m1 numeric not null, m2 numeric not null, m3 numeric not null
);

insert into _novos values
  -- PLAY 1 · equipe Treinamento
  ('marco_santos',     'Marco Santos',      '8c8b8107-c12d-417a-a29f-87d06153f5d9', 'f9f32341-ab27-43c6-b8b7-e1f546914f90', 10000, 13000, 16000),
  ('erica_carvalho',   'Erica Carvalho',    '8c8b8107-c12d-417a-a29f-87d06153f5d9', 'f9f32341-ab27-43c6-b8b7-e1f546914f90', 10000, 13000, 16000),
  ('luanamarchi_polo', 'Luana Marchi Polo', '8c8b8107-c12d-417a-a29f-87d06153f5d9', 'f9f32341-ab27-43c6-b8b7-e1f546914f90', 10000, 13000, 16000),
  -- PLAY 3 · equipe Treinamento
  ('benjamin_ayala',   'Benjamin Ayala',    '84a7e60b-dcb5-4962-90a4-f7d842438661', '5da8c2b4-5adf-4323-a817-548db12a817d',  5500,  8500, 11500),
  ('jessica_lucena',   'Jessica Lucena',    '84a7e60b-dcb5-4962-90a4-f7d842438661', '5da8c2b4-5adf-4323-a817-548db12a817d',  5500,  8500, 11500),
  -- PLAYMIX (Birigui) · equipe Treinamento
  ('beatriz_matos',    'Beatriz Matos',     '45457530-4aba-4194-863e-899c8e0673f3', '802c88cf-1f15-4339-a1d3-f8c9fc28db0e',  4700,  7000,  9300);

do $$
declare
  c_treino  constant uuid := 'f44b422a-2ef1-4eec-9fd0-1b46b370dd1d';  -- equipe do setor Treinamento
  v_empresa uuid;
  v_slug    text;
  v_erros   text;
  r         record;
  v_id      uuid;
  v_email   text;
  v_criados integer := 0;
begin
  select e.id, e.slug into v_empresa, v_slug
    from public.empresas e where lower(e.slug) = 'bookplay';
  if v_empresa is null then raise exception 'Empresa bookplay não encontrada.'; end if;

  -- ── 1. Setores e equipes são da BookPlay e batem entre si ──────────────────
  select string_agg(n.login, ', ') into v_erros
    from _novos n
    left join public.equipes q on q.id = n.equipe_id
   where q.id is null or q.setor_id <> n.setor_id or q.empresa_id <> v_empresa;
  if v_erros is not null then raise exception 'Equipe/setor inválido para: %', v_erros; end if;

  if not exists (select 1 from public.equipes where id = c_treino and empresa_id = v_empresa) then
    raise exception 'Equipe do setor Treinamento não encontrada.';
  end if;

  -- ── 2. Conflitos, todos numa mensagem só ───────────────────────────────────
  select string_agg(format('%s: %s', n.login, c.motivo), E'\n' order by n.login)
    into v_erros
    from _novos n
    cross join lateral (
      select case
        when p.id is not null and p.setor_id is distinct from n.setor_id
          then format('login já existe no setor "%s"', coalesce(s.nome, 'sem setor'))
        when p.id is not null and p.situacao = 'desligado'
          then 'login já existe e está desligado'
        when p.id is not null and p.perfil <> 'operador'
          then format('login já existe com o cargo %s', p.perfil)
        when p.id is null and exists (
               select 1 from auth.users u where lower(u.email) = n.login || '@interno.sistema')
          then format('o e-mail %s@interno.sistema já é de outra conta', n.login)
      end as motivo
        from (select 1) as um
        left join public.perfis p
               on p.empresa_id = v_empresa and lower(btrim(p.usuario)) = n.login
        left join public.setores s on s.id = p.setor_id
    ) c
   where c.motivo is not null;
  if v_erros is not null then raise exception E'Nada foi gravado. Conflitos:\n%', v_erros; end if;

  -- ── 3. Acesso de quem ainda não existe ─────────────────────────────────────
  for r in
    select n.* from _novos n
     where not exists (select 1 from public.perfis p
                        where p.empresa_id = v_empresa and lower(btrim(p.usuario)) = n.login)
  loop
    v_id    := gen_random_uuid();
    v_email := r.login || '@interno.sistema';

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token,
      email_change_token_new, email_change_token_current, email_change,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt('123456', extensions.gen_salt('bf', 10)), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object(
        'nome', r.nome, 'perfil', 'operador', 'usuario', r.login,
        'setor_id', r.setor_id, 'empresa_id', v_empresa, 'empresa_slug', v_slug),
      now(), now(),
      '', '',
      '', '', '',
      '', '', ''
    );

    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (
      v_id::text, v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email,
                         'email_verified', true, 'phone_verified', false),
      'email', now(), now()
    );

    v_criados := v_criados + 1;
  end loop;

  -- ── 4. Setor de origem + equipe Treinamento do setor ───────────────────────
  update public.perfis p
     set setor_id = n.setor_id, equipe_id = n.equipe_id
    from _novos n
   where p.empresa_id = v_empresa and lower(btrim(p.usuario)) = n.login
     and (p.setor_id is distinct from n.setor_id or p.equipe_id is distinct from n.equipe_id);

  -- ── 5. Clone no setor Treinamento, contando no recebimento ─────────────────
  insert into public.equipe_operadores_clones (empresa_id, equipe_id, operador_id, conta_recebimento)
  select v_empresa, c_treino, p.id, true
    from _novos n
    join public.perfis p on p.empresa_id = v_empresa and lower(btrim(p.usuario)) = n.login
   where not exists (select 1 from public.equipe_operadores_clones c
                      where c.operador_id = p.id and c.equipe_id = c_treino);

  -- ── 6. Meta de outubro/2026 ────────────────────────────────────────────────
  insert into public.metas (tipo, referencia_id, empresa_id, meta_valor, meta_acordos,
                            metas_extras, meta_proporcional, mes, ano)
  select 'operador', p.id, v_empresa, n.m1, 0, jsonb_build_array(n.m2, n.m3), false, 10, 2026
    from _novos n
    join public.perfis p on p.empresa_id = v_empresa and lower(btrim(p.usuario)) = n.login
  on conflict (tipo, referencia_id, empresa_id, mes, ano)
  do update set meta_valor = excluded.meta_valor, metas_extras = excluded.metas_extras, updated_at = now();

  -- ── 7. Prova: os 6 completos, ou nada fica ─────────────────────────────────
  select string_agg(n.login, ', ' order by n.login) into v_erros
    from _novos n
    left join public.perfis p on p.empresa_id = v_empresa and lower(btrim(p.usuario)) = n.login
    left join auth.users u on u.id = p.id
   where p.id is null
      or p.perfil <> 'operador'
      or p.setor_id  is distinct from n.setor_id
      or p.equipe_id is distinct from n.equipe_id
      or u.id is null
      or not exists (select 1 from auth.identities i where i.user_id = p.id)
      or not exists (select 1 from public.equipe_operadores_clones c
                      where c.operador_id = p.id and c.equipe_id = c_treino)
      or not exists (select 1 from public.metas m
                      where m.tipo = 'operador' and m.referencia_id = p.id
                        and m.mes = 10 and m.ano = 2026 and m.meta_valor = n.m1)
      or u.confirmation_token is null or u.recovery_token is null
      or u.email_change_token_new is null or u.email_change_token_current is null
      or u.email_change is null or u.phone_change is null
      or u.phone_change_token is null or u.reauthentication_token is null;
  if v_erros is not null then
    raise exception 'Prova falhou, nada foi gravado. Incompletos: %', v_erros;
  end if;

  raise notice 'OK: % acesso(s) criado(s), 6 conferidos.', v_criados;
end
$$;

-- ── Resultado: 6 linhas ──────────────────────────────────────────────────────
select n.login, p.nome, s.nome as setor, q.nome as equipe,
       exists (select 1 from public.equipe_operadores_clones c
                where c.operador_id = p.id
                  and c.equipe_id = 'f44b422a-2ef1-4eec-9fd0-1b46b370dd1d') as no_treinamento,
       m.meta_valor as meta1, m.metas_extras as meta2_3, p.senha_alterada
  from _novos n
  left join public.perfis p on lower(btrim(p.usuario)) = n.login
       and p.empresa_id = (select empresa_id from public.setores where id = n.setor_id)
  left join public.setores s on s.id = p.setor_id
  left join public.equipes q on q.id = p.equipe_id
  left join public.metas m on m.tipo = 'operador' and m.referencia_id = p.id and m.mes = 10 and m.ano = 2026
 order by s.nome, n.login;
