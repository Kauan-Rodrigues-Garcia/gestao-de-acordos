-- =============================================================================
-- Conecta Play: equipe nova «Layane Brito» com 8 operadores novos
-- 08/10/2026 · 8 logins · líder: Layane Brito
-- =============================================================================
--
-- ✅ RODADO em 08/10/2026 pelo Cleber (SQL Editor) e conferido: os 8 criados,
--    na equipe, com identidade e tokens ok; Layane (cargo lider) vinculada como
--    líder. Rodar de novo não recria ninguém.
--
-- Rodar INTEIRO no SQL Editor do Supabase. Tudo que grava está num bloco `do`
-- só: se qualquer conferência falhar, nada é gravado e a mensagem de erro diz
-- o que faltou. A última consulta mostra o resultado (8 linhas).
--
-- O que faz:
--   1. cria o acesso de cada login (auth.users + auth.identities), e-mail
--      <login>@interno.sistema e senha 123456 — o mesmo formato da tela de
--      Usuários. O gatilho `trg_novo_usuario` cria a linha em `perfis` como
--      operador, no setor Conecta Play;
--   2. cria a equipe «Layane Brito» no setor Conecta Play (se ela ainda não
--      existir — rodar de novo reaproveita a mesma);
--   3. põe os 8 nessa equipe (`perfis.equipe_id`);
--   4. põe a Layane Brito como líder da equipe (`equipe_lideres`, o mesmo
--      vínculo que o botão «adicionar líder» do quadro de Equipes grava). O
--      cadastro dela (cargo, setor, equipe) NÃO é mexido.
--
-- Nome = login sem "_", com as iniciais maiúsculas (`initcap`):
--   cibele_zaneli → «Cibele Zaneli», joao_v_santos → «Joao V Santos».
-- Sem acento: não dá para adivinhá-lo pelo login. Ajuste na tela depois.
--
-- Senha: `perfis.senha_alterada` nasce false, então o botão de trocar a senha
-- aparece para a pessoa assim que ela entra.
--
-- O setor é procurado pelo nome em TODAS as empresas, sem acento, sem espaço e
-- sem maiúscula ("Conecta Play" = "CONECTAPLAY"). Precisa achar exatamente um
-- setor ativo; se achar zero ou dois, aborta e lista o que existe. A empresa da
-- equipe é a do setor.
--
-- A Layane é procurada pelo nome («Layane Brito», sem acento e sem maiúscula)
-- DENTRO da empresa do setor, entre quem não está desligado. Aborta se achar
-- zero ou mais de uma, ou se o cargo dela não lidera equipe
-- (`cargos.lidera_equipe`): nesse caso, troque o cargo na tela de Usuários e
-- rode de novo. Se ela ainda não estiver no setor Conecta Play, o script avisa
-- (NOTICE) mas segue: o quadro de Equipes também aceita líder de outro setor.
--
-- Rodar de novo não duplica: quem já existe no setor certo, como operador e não
-- desligado, não é recriado e não tem a senha trocada. Aborta sem gravar se
-- algum login já existir em OUTRO setor, com outro cargo, desligado, ou se o
-- e-mail já for de outra conta.
--
-- Tokens: as OITO colunas de token de auth.users vão '' e não nulo. O GoTrue
-- não lê NULL nelas, e a conta falharia no login («Database error querying
-- schema») — ver corrigir_tokens_nulos_auth_users_20260921.sql.
-- =============================================================================

create or replace function pg_temp.norm(t text) returns text
language sql immutable as $fn$
  select regexp_replace(
    lower(translate(coalesce(t, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')),
    '[^a-z0-9]', '', 'g')
$fn$;

drop table if exists pg_temp._cfg;
create temp table _cfg (setor_nome text not null, equipe_nome text not null, lider_nome text not null);
insert into _cfg values ('Conecta Play', 'Layane Brito', 'Layane Brito');

drop table if exists pg_temp._novos;
create temp table _novos (
  login text primary key,
  nome  text
);

insert into _novos (login) values
  ('cibele_zaneli'),
  ('livia_jacob'),
  ('silva_jessica'),
  ('joao_v_santos'),
  ('jasmim_sousa'),
  ('ingryd_oliveira'),
  ('vanessa_correa'),
  ('mariana_hilario');

-- "cibele_zaneli" → "Cibele Zaneli"
update _novos set nome = initcap(replace(login, '_', ' '));

do $$
declare
  c         record;
  v_setor   uuid;
  v_empresa uuid;
  v_slug    text;
  v_n       integer;
  v_lista   text;
  v_lider   uuid;
  v_lider_setor uuid;
  v_lidera  boolean;
  v_equipe  uuid;
  v_erros   text;
  r         record;
  v_id      uuid;
  v_email   text;
  v_criados integer := 0;
  v_total   integer;
begin
  select * into c from _cfg;
  select count(*) into v_total from _novos;

  -- ── 1. O setor ──────────────────────────────────────────────────────────────
  select count(*), min(s.id::text), string_agg(s.nome || ' (' || e.nome || ')', ' | ')
    into v_n, v_lista, v_erros
    from public.setores s
    join public.empresas e on e.id = s.empresa_id
   where s.ativo and pg_temp.norm(s.nome) = pg_temp.norm(c.setor_nome);
  if v_n <> 1 then
    select string_agg(s.nome, ' | ' order by s.nome) into v_lista
      from public.setores s where s.ativo;
    raise exception 'Setor "%": esperava 1, achei % (%). Setores ativos: %',
      c.setor_nome, v_n, coalesce(v_erros, 'nenhum'), coalesce(v_lista, 'nenhum');
  end if;
  v_setor := v_lista::uuid;
  v_erros := null;
  select s.empresa_id, e.slug into v_empresa, v_slug
    from public.setores s join public.empresas e on e.id = s.empresa_id
   where s.id = v_setor;

  -- ── 2. A líder ──────────────────────────────────────────────────────────────
  select count(*), min(p.id::text), string_agg(p.nome || ' / ' || coalesce(p.usuario, '?'), ' | ')
    into v_n, v_lista, v_erros
    from public.perfis p
   where p.empresa_id = v_empresa
     and p.situacao is distinct from 'desligado'
     and pg_temp.norm(p.nome) like '%' || pg_temp.norm(c.lider_nome) || '%';
  if v_n <> 1 then
    raise exception 'Líder "%": esperava 1 pessoa na empresa, achei % (%). Nada foi gravado.',
      c.lider_nome, v_n, coalesce(v_erros, 'nenhuma');
  end if;
  v_lider := v_lista::uuid;
  v_erros := null;

  select coalesce(cg.lidera_equipe, false), p.setor_id
    into v_lidera, v_lider_setor
    from public.perfis p
    left join public.cargos cg on cg.slug = p.perfil::text
   where p.id = v_lider;
  if not v_lidera then
    raise exception 'A % está com um cargo que não lidera equipe (%). Troque o cargo na tela de Usuários e rode de novo. Nada foi gravado.',
      c.lider_nome, (select perfil from public.perfis where id = v_lider);
  end if;
  if v_lider_setor is distinct from v_setor then
    raise notice 'Atenção: a % não está no setor % no cadastro. Ela vira líder da equipe mesmo assim.',
      c.lider_nome, c.setor_nome;
  end if;

  -- ── 3. Conflitos dos logins, todos numa mensagem só ─────────────────────────
  select string_agg(format('%s: %s', n.login, k.motivo), E'\n' order by n.login)
    into v_erros
    from _novos n
    cross join lateral (
      select case
        when p.id is not null and p.setor_id is distinct from v_setor
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
    ) k
   where k.motivo is not null;

  if v_erros is not null then
    raise exception E'Nada foi gravado. Conflitos:\n%', v_erros;
  end if;

  -- ── 4. Acesso de quem ainda não existe ──────────────────────────────────────
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
        'setor_id',     v_setor,
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

  -- ── 5. A equipe (reaproveita se já existir no setor) ────────────────────────
  select q.id into v_equipe
    from public.equipes q
   where q.setor_id = v_setor
     and pg_temp.norm(q.nome) = pg_temp.norm(c.equipe_nome)
   limit 1;
  if v_equipe is null then
    insert into public.equipes (nome, setor_id, empresa_id)
    values (c.equipe_nome, v_setor, v_empresa)
    returning id into v_equipe;
    raise notice 'Equipe "%" criada.', c.equipe_nome;
  else
    raise notice 'Equipe "%" já existia; reaproveitada.', c.equipe_nome;
  end if;

  -- ── 6. Setor e equipe dos 8 ─────────────────────────────────────────────────
  -- O gatilho já grava o setor; gravar de novo cobre o caminho de exceção dele,
  -- que cria o perfil sem setor.
  update public.perfis p
     set setor_id  = v_setor,
         equipe_id = v_equipe
    from _novos n
   where p.empresa_id = v_empresa
     and lower(btrim(p.usuario)) = n.login
     and (p.setor_id is distinct from v_setor or p.equipe_id is distinct from v_equipe);

  -- ── 7. A líder da equipe ────────────────────────────────────────────────────
  insert into public.equipe_lideres (empresa_id, equipe_id, lider_id, criado_por)
  select v_empresa, v_equipe, v_lider, null
   where not exists (
     select 1 from public.equipe_lideres l
      where l.equipe_id = v_equipe and l.lider_id = v_lider);

  -- ── 8. Prova: tudo completo, ou nada fica ───────────────────────────────────
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
      or p.setor_id  is distinct from v_setor
      or p.equipe_id is distinct from v_equipe
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

  if not exists (select 1 from public.equipe_lideres l
                  where l.equipe_id = v_equipe and l.lider_id = v_lider) then
    raise exception 'Prova falhou, nada foi gravado: a líder não ficou vinculada à equipe.';
  end if;

  raise notice 'OK: % acesso(s) criado(s), % na equipe "%", líder %.',
    v_criados, v_total, c.equipe_nome, c.lider_nome;
end
$$;

-- ── Resultado: 8 operadores + a líder ─────────────────────────────────────────
select 'operador'      as papel,
       n.login,
       p.nome,
       s.nome          as setor,
       q.nome          as equipe,
       p.perfil,
       p.situacao,
       p.senha_alterada,
       p.criado_em
  from _novos n
  left join public.perfis p  on lower(btrim(p.usuario)) = n.login
  left join public.setores s on s.id = p.setor_id
  left join public.equipes q on q.id = p.equipe_id
union all
select 'líder da equipe',
       lp.usuario,
       lp.nome,
       ls.nome,
       q.nome,
       lp.perfil,
       lp.situacao,
       lp.senha_alterada,
       lp.criado_em
  from public.equipes q
  join public.equipe_lideres l on l.equipe_id = q.id
  join public.perfis lp        on lp.id = l.lider_id
  left join public.setores ls  on ls.id = lp.setor_id
 where pg_temp.norm(q.nome) = pg_temp.norm((select equipe_nome from _cfg))
   and q.setor_id = (select s.id from public.setores s
                      where s.ativo and pg_temp.norm(s.nome) = pg_temp.norm((select setor_nome from _cfg)))
 order by 1 desc, 3;
