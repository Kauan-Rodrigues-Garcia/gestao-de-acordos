-- =============================================================================
-- Operadores novos do Play 4, do Play Mix Marília e do Play 5
-- 28/09/2026 · BookPlay · 21 logins
-- =============================================================================
--
-- ✅ RODADO em 28/09/2026 via MCP, com «pode» do usuário. Os 21 foram criados
--    (nenhum preexistia); a prova interna passou. Não precisa rodar de novo —
--    rodar de novo não recria ninguém.
--
-- Rodar INTEIRO no SQL Editor do Supabase. Tudo que grava está num bloco `do`
-- só: se qualquer conferência falhar, nada é gravado e a mensagem de erro diz
-- o que faltou. A última consulta mostra o resultado (21 linhas).
--
-- Para cada login da lista:
--   1. cria o acesso (auth.users + auth.identities) com o e-mail
--      <login>@interno.sistema e a senha 123456 — o mesmo formato que a tela de
--      Usuários grava. O gatilho `trg_novo_usuario` cria a linha em `perfis`
--      com cargo operador, setor e empresa;
--   2. deixa a pessoa no setor, SEM equipe (equipe_id nulo) — a equipe fica
--      para o líder definir depois.
--
-- Nome = login sem "_", com as iniciais maiúsculas (`initcap`), com duas
-- exceções pedidas: thais_p_rodrigues → «Thaís Rodrigues» e
-- mauricio_nove → «Isabela».
-- Senha: `perfis.senha_alterada` nasce false, então o botão de trocar a senha
-- aparece para a pessoa assim que ela entra.
--
-- EMPRESA: BookPlay (slug 'bookplay'), onde o lote de 16/09 já criou Play 5 e
-- Play Mix Marília. A PaguePlay também tem setores «Play N» — por isso os
-- setores são procurados SÓ dentro da empresa abaixo. Se for outra, troque o
-- slug em `_alvo`.
--
-- Nomes de setor são comparados sem acento, sem espaço e sem maiúscula
-- ("Play Mix Marília" = "PLAYMIX MARILIA"). Precisa achar exatamente um; se
-- achar zero ou dois, aborta e lista o que existe.
--
-- Rodar de novo não duplica: quem já existe no setor certo, como operador e
-- não desligado, não é recriado e não tem a senha trocada. Aborta sem gravar se
-- algum login já existir em OUTRO setor, com outro cargo, desligado, ou se o
-- e-mail já for de outra conta.
--
-- Tokens: as OITO colunas de token de auth.users vão '' e não nulo. O GoTrue
-- não lê NULL nelas, e a conta falharia no login («Database error querying
-- schema») e no «Entrar como» («Database error finding user») — ver
-- corrigir_tokens_nulos_auth_users_20260921.sql.
-- =============================================================================

create or replace function pg_temp.norm(t text) returns text
language sql immutable as $fn$
  select regexp_replace(
    lower(translate(coalesce(t, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')),
    '[^a-z0-9]', '', 'g')
$fn$;

-- Setor ativo pelo nome, dentro da empresa.
create or replace function pg_temp.setor_unico(p_empresa uuid, p_nome text) returns uuid
language plpgsql as $fn$
declare
  v_n     integer;
  v_id    text;
  v_achei text;
  v_todos text;
begin
  select count(*), min(s.id::text), string_agg(s.nome, ' | ' order by s.nome)
    into v_n, v_id, v_achei
    from public.setores s
   where s.ativo
     and s.empresa_id = p_empresa
     and pg_temp.norm(s.nome) = pg_temp.norm(p_nome);
  if v_n = 1 then
    return v_id::uuid;
  end if;
  select string_agg(s.nome, ' | ' order by s.nome) into v_todos
    from public.setores s where s.ativo and s.empresa_id = p_empresa;
  raise exception 'Setor "%": esperava 1, achei % (%). Setores ativos da empresa: %',
    p_nome, v_n, coalesce(v_achei, 'nenhum'), coalesce(v_todos, 'nenhum');
end
$fn$;

drop table if exists pg_temp._alvo;
create temp table _alvo (slug text not null);
insert into _alvo values ('bookplay');

drop table if exists pg_temp._novos;
create temp table _novos (
  login      text primary key,
  nome       text,
  setor_nome text not null,
  setor_id   uuid
);

insert into _novos (login, setor_nome) values
  -- PLAY 4
  ('thais_p_rodrigues',  'Play 4'),
  ('alessandra_beatriz', 'Play 4'),
  ('juliane_vitoria',    'Play 4'),
  ('poliana_varjao',     'Play 4'),
  ('analimasilva',       'Play 4'),
  ('valeria_roma',       'Play 4'),
  ('mirelly_marinho',    'Play 4'),
  -- PLAY MIX MARÍLIA
  ('gustavo_goncalves',  'Play Mix Marília'),
  ('rafaela_lisboa',     'Play Mix Marília'),
  ('demylly_batista',    'Play Mix Marília'),
  ('mauricio_nove',      'Play Mix Marília'),
  ('yasmim_vitoria',     'Play Mix Marília'),
  ('fabio_galhardo',     'Play Mix Marília'),
  ('eduardo_carvalho',   'Play Mix Marília'),
  -- PLAY 5
  ('michelle_bertocco',  'Play 5'),
  ('beatriz_guerra',     'Play 5'),
  ('michelle_oliveira',  'Play 5'),
  ('kauane_santos',      'Play 5'),
  ('yasmim_inacio',      'Play 5'),
  ('nicoly_morais',      'Play 5'),
  ('emilly_nascimento',  'Play 5');

-- "poliana_varjao" → "Poliana Varjao"
update _novos set nome = initcap(replace(login, '_', ' '));
-- As duas exceções pedidas
update _novos set nome = 'Thaís Rodrigues' where login = 'thais_p_rodrigues';
update _novos set nome = 'Isabela'         where login = 'mauricio_nove';

do $$
declare
  v_empresa uuid;
  v_slug    text;
  v_erros   text;
  r         record;
  v_id      uuid;
  v_email   text;
  v_criados integer := 0;
  v_total   integer;
begin
  select count(*) into v_total from _novos;

  -- ── 1. Empresa e setores ────────────────────────────────────────────────────
  select e.id, e.slug
    into v_empresa, v_slug
    from public.empresas e
   where lower(e.slug) = (select lower(slug) from _alvo);
  if v_empresa is null then
    raise exception 'Empresa "%" não encontrada.', (select slug from _alvo);
  end if;

  for r in select * from _novos loop
    update _novos
       set setor_id = pg_temp.setor_unico(v_empresa, r.setor_nome)
     where login = r.login;
  end loop;

  -- ── 2. Conflitos, todos numa mensagem só ────────────────────────────────────
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
               select 1 from auth.users u
                where lower(u.email) = n.login || '@interno.sistema')
          then format('o e-mail %s@interno.sistema já é de outra conta', n.login)
      end as motivo
        from (select 1) as um
        left join public.perfis p
               on p.empresa_id = v_empresa
              and lower(btrim(p.usuario)) = n.login
        left join public.setores s on s.id = p.setor_id
    ) c
   where c.motivo is not null;

  if v_erros is not null then
    raise exception E'Nada foi gravado. Conflitos:\n%', v_erros;
  end if;

  -- ── 3. Acesso de quem ainda não existe ──────────────────────────────────────
  for r in
    select n.*
      from _novos n
     where not exists (
             select 1 from public.perfis p
              where p.empresa_id = v_empresa
                and lower(btrim(p.usuario)) = n.login)
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
        'nome',         r.nome,
        'perfil',       'operador',
        'usuario',      r.login,
        'setor_id',     r.setor_id,
        'empresa_id',   v_empresa,
        'empresa_slug', v_slug),
      now(), now(),
      '', '',
      '', '', '',
      '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      v_id::text, v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email,
                         'email_verified', true, 'phone_verified', false),
      'email', now(), now()
    );

    v_criados := v_criados + 1;
  end loop;

  -- ── 4. Setor (sem equipe) ───────────────────────────────────────────────────
  -- O gatilho já grava o setor; gravar de novo cobre o caminho de exceção dele,
  -- que cria o perfil sem setor. Equipe fica nula de propósito — só em quem
  -- acabou de nascer: quem já existia e já tem equipe não perde a dele.
  update public.perfis p
     set setor_id = n.setor_id
    from _novos n
   where p.empresa_id = v_empresa
     and lower(btrim(p.usuario)) = n.login
     and p.setor_id is distinct from n.setor_id;

  -- ── 5. Prova: os 21 completos, ou nada fica ─────────────────────────────────
  select string_agg(n.login, ', ' order by n.login)
    into v_erros
    from _novos n
    left join public.perfis p
           on p.empresa_id = v_empresa
          and lower(btrim(p.usuario)) = n.login
    left join auth.users u on u.id = p.id
   where p.id is null
      or p.perfil    <> 'operador'
      or p.situacao  =  'desligado'
      or p.setor_id  is distinct from n.setor_id
      or u.id is null
      or not exists (select 1 from auth.identities i where i.user_id = p.id)
      or u.confirmation_token         is null
      or u.recovery_token             is null
      or u.email_change_token_new     is null
      or u.email_change_token_current is null
      or u.email_change               is null
      or u.phone_change               is null
      or u.phone_change_token         is null
      or u.reauthentication_token     is null;

  if v_erros is not null then
    raise exception 'Prova falhou, nada foi gravado. Incompletos: %', v_erros;
  end if;

  raise notice 'OK: % acesso(s) criado(s), % conferidos.', v_criados, v_total;
end
$$;

-- ── Resultado: 21 linhas, equipe vazia ────────────────────────────────────────
select n.login,
       p.nome,
       s.nome          as setor,
       q.nome          as equipe,
       p.perfil,
       p.situacao,
       p.senha_alterada,
       p.criado_em
  from _novos n
  left join public.perfis p
         on p.empresa_id = (select empresa_id from public.setores where id = n.setor_id)
        and lower(btrim(p.usuario)) = n.login
  left join public.setores s on s.id = p.setor_id
  left join public.equipes q on q.id = p.equipe_id
 order by n.setor_nome, n.login;
