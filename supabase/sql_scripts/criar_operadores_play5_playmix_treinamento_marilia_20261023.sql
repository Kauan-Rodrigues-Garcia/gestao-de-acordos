-- =============================================================================
-- Operadores novos do Play 5 e do Play Mix Marília, clonados no Treinamento Marília
-- 23/10/2026 · marca PaguePlay (Marília) · 13 logins
-- =============================================================================
--
-- ✅ RODADO em 23/10/2026 no SQL Editor (2ª rodada; a 1ª parou sem gravar por
--    falta da equipe Treinamento no Play Mix Marília). Conferido no banco: os
--    13 ativos, operador, acesso completo, equipe Treinamento no setor de
--    origem e um clone cada; Play 5 Treinamento = 8 clones, Play Mix
--    Treinamento = 5. Não precisa rodar de novo.
--
-- Rodar INTEIRO no SQL Editor do Supabase. Tudo que grava está num bloco `do`
-- só: se qualquer conferência falhar, nada é gravado e a mensagem de erro diz
-- o que faltou. As consultas do fim mostram o resultado (13 linhas), as
-- equipes «Treinamento» criadas e quem saiu das equipes antigas do
-- Treinamento Marília.
--
-- Mesmo formato de criar_operadores_treinamento_marilia_20260916.sql e de
-- criar_operadores_treinamento_birigui_20261009.sql. Para cada login:
--   1. cria o acesso (auth.users + auth.identities) com o e-mail
--      <login>@interno.sistema e a senha 123456. O gatilho `trg_novo_usuario`
--      cria a linha em `perfis` com cargo operador, setor e empresa;
--   2. põe a pessoa na equipe «Treinamento» do setor de origem (Play 5 ou
--      Play Mix Marília). Se o setor não tiver essa equipe, ela é CRIADA — o
--      Play Mix Marília não tinha desde a fusão com o Play 4 (1ª rodada,
--      23/10, parou aí sem gravar nada). Nasce sem líder e sem a marcação
--      «equipe de treino» da aba Equipes;
--   3. clona na equipe do Treinamento Marília, com `conta_recebimento` ligado:
--      «Play 5 Treinamento» ou «Play Mix Treinamento».
--
-- AS DUAS EQUIPES DO TREINAMENTO MARÍLIA SÃO SUBSTITUÍDAS (pedido do Cleber):
--   • o setor tem de ter exatamente 2 equipes — a do Play Mix (nome com «mix»)
--     e a do Play 5 (nome com «5»), hoje TreiPlayMix e TreiPlay 5;
--   • elas são RENOMEADAS para «Play Mix Treinamento» e «Play 5 Treinamento».
--     Renomear, e não apagar: apagar equipe solta em CASCADE/SET NULL o que
--     aponta para ela e reescreve os meses passados;
--   • os clones da turma antiga saem delas (c_tirar_clones_antigos = true).
--     A pessoa continua no setor e na equipe dela; só deixa de contar no
--     Treinamento Marília. Para manter a turma antiga junto com a nova, troque
--     para false antes de rodar.
--
-- MARCA, NÃO EMPRESA: os três setores são de Marília, logo PaguePlay
-- (`lib/marca.ts`). O script acha cada setor pelo nome E pela cidade Marília
-- (`setores.cidade_id` → `rh_celulas`), nunca pelo slug da empresa — a
-- BookPlay e a PaguePlay têm setores «Play N». A empresa gravada é a do setor,
-- que é onde o dado mora. Se o setor de origem e o Treinamento Marília
-- morarem em empresas diferentes, o script para: clone entre empresas não
-- existe aqui.
--
-- Nome = login sem "_", com as iniciais maiúsculas (`initcap`).
-- Senha: `perfis.senha_alterada` nasce false, então o botão de trocar a senha
-- aparece para a pessoa assim que ela entra.
-- Tokens: as OITO colunas de token de auth.users vão '' e não nulo (ver o
-- script de 28/09) — com NULL o login falha com «Database error querying schema».
-- Meta: este script NÃO grava meta. Lance pela aba Metas.
--
-- Rodar de novo não duplica: quem já existe no setor certo, como operador e
-- não desligado, não é recriado e não tem a senha trocada — só confere equipe
-- e clone. Aborta sem gravar se algum login já existir em OUTRO setor, com
-- outro cargo, desligado, ou se o e-mail já for de outra conta.
-- =============================================================================

create or replace function pg_temp.norm(t text) returns text
language sql immutable as $fn$
  select regexp_replace(
    lower(translate(coalesce(t, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')),
    '[^a-z0-9]', '', 'g')
$fn$;

-- Setor ativo de MARÍLIA pelo nome, em qualquer empresa: a marca é a cidade.
create or replace function pg_temp.setor_de_marilia(p_nome text) returns uuid
language plpgsql as $fn$
declare
  v_n     integer;
  v_id    text;
  v_achei text;
begin
  select count(*), min(s.id::text)
    into v_n, v_id
    from public.setores s
    join public.rh_celulas c on c.id = s.cidade_id
   where s.ativo
     and pg_temp.norm(c.nome) = 'marilia'
     and pg_temp.norm(s.nome) = pg_temp.norm(p_nome);
  if v_n = 1 then
    return v_id::uuid;
  end if;
  -- O que existe com esse nome, e de que cidade: para a mensagem.
  select string_agg(format('%s (cidade: %s)', s.nome, coalesce(c.nome, 'sem cidade')), ' | ' order by s.nome)
    into v_achei
    from public.setores s
    left join public.rh_celulas c on c.id = s.cidade_id
   where s.ativo
     and pg_temp.norm(s.nome) = pg_temp.norm(p_nome);
  raise exception 'Setor "%" de Marília: esperava 1, achei %. Com esse nome existem: %',
    p_nome, v_n, coalesce(v_achei, 'nenhum');
end
$fn$;

create or replace function pg_temp.equipe_unica(p_setor uuid, p_nome text) returns uuid
language plpgsql as $fn$
declare
  v_n     integer;
  v_id    text;
  v_setor text;
  v_todas text;
begin
  select count(*), min(q.id::text)
    into v_n, v_id
    from public.equipes q
   where q.setor_id = p_setor
     and pg_temp.norm(q.nome) = pg_temp.norm(p_nome);
  if v_n = 1 then
    return v_id::uuid;
  end if;
  select s.nome, string_agg(q.nome, ' | ' order by q.nome)
    into v_setor, v_todas
    from public.setores s
    left join public.equipes q on q.setor_id = s.id
   where s.id = p_setor
   group by s.nome;
  raise exception 'Equipe "%" no setor "%": esperava 1, achei %. Equipes do setor: %',
    p_nome, v_setor, v_n, coalesce(v_todas, 'nenhuma');
end
$fn$;

-- Equipes «Treinamento» que o script precisou criar (preenchida no bloco).
drop table if exists pg_temp._equipes_criadas;
create temp table _equipes_criadas (equipe_id uuid, setor text, equipe text);

-- A equipe pelo nome no setor; se não houver nenhuma, CRIA (23/10/2026: o Play
-- Mix Marília não tinha «Treinamento» desde a fusão com o Play 4). Duas com o
-- mesmo nome param o script — não dá para saber qual é a certa.
create or replace function pg_temp.equipe_ou_cria(p_setor uuid, p_nome text) returns uuid
language plpgsql as $fn$
declare
  v_n   integer;
  v_id  uuid;
  v_emp uuid;
  v_set text;
begin
  select count(*) into v_n
    from public.equipes q
   where q.setor_id = p_setor
     and pg_temp.norm(q.nome) = pg_temp.norm(p_nome);
  if v_n >= 1 then
    return pg_temp.equipe_unica(p_setor, p_nome);  -- com 2 ou mais, levanta o erro com a lista
  end if;
  select s.empresa_id, s.nome into v_emp, v_set from public.setores s where s.id = p_setor;
  insert into public.equipes (nome, setor_id, empresa_id)
  values (p_nome, p_setor, v_emp)
  returning id into v_id;
  insert into _equipes_criadas values (v_id, v_set, p_nome);
  return v_id;
end
$fn$;

drop table if exists pg_temp._novos;
create temp table _novos (
  login           text primary key,
  nome            text,
  setor_nome      text not null,
  clone_de        text not null,   -- 'play5' ou 'playmix': qual equipe do Treinamento Marília
  setor_id        uuid,
  equipe_id       uuid,
  clone_equipe_id uuid
);

insert into _novos (login, setor_nome, clone_de) values
  -- PLAY 5 → equipe Treinamento → clone em «Play 5 Treinamento»
  ('suellen_ramiro',     'Play 5',           'play5'),
  ('rayssa_souza',       'Play 5',           'play5'),
  ('mateus_sola',        'Play 5',           'play5'),
  ('giovana_almeida',    'Play 5',           'play5'),
  ('jhenifer_aparecida', 'Play 5',           'play5'),
  ('fernanda_andrade',   'Play 5',           'play5'),
  ('carlos_reduzino',    'Play 5',           'play5'),
  ('jean_nogueira',      'Play 5',           'play5'),
  -- PLAY MIX MARÍLIA → equipe Treinamento → clone em «Play Mix Treinamento»
  ('eva_deus',           'Play Mix Marília', 'playmix'),
  ('felipe_rui',         'Play Mix Marília', 'playmix'),
  ('davi_santos',        'Play Mix Marília', 'playmix'),
  ('janaina_barbosa',    'Play Mix Marília', 'playmix'),
  ('yessica_silva',      'Play Mix Marília', 'playmix');

-- "jhenifer_aparecida" → "Jhenifer Aparecida"
update _novos set nome = initcap(replace(login, '_', ' '));

-- Quem sai das equipes antigas do Treinamento Marília (preenchida no bloco).
drop table if exists pg_temp._tirados;
create temp table _tirados (operador_id uuid, nome text, equipe_antiga text);

do $$
declare
  -- true = a turma antiga sai das duas equipes do Treinamento Marília.
  c_tirar_clones_antigos constant boolean := true;

  v_trein   uuid;
  v_empresa uuid;
  v_slug    text;
  v_erros   text;
  v_eq_p5   uuid;
  v_eq_mix  uuid;
  v_n       integer;
  r         record;
  v_setor   uuid;
  v_id      uuid;
  v_email   text;
  v_criados integer := 0;
begin
  -- ── 1. Onde cada um vai ─────────────────────────────────────────────────────
  -- Os três setores são achados pela cidade (Marília = PaguePlay). A empresa é
  -- a do Treinamento Marília — onde o dado mora —, e os setores de origem têm
  -- de morar nela também.
  v_trein := pg_temp.setor_de_marilia('Treinamento Marília');
  select s.empresa_id, e.slug
    into v_empresa, v_slug
    from public.setores s
    join public.empresas e on e.id = s.empresa_id
   where s.id = v_trein;

  -- As duas equipes do Treinamento Marília: exatamente 2, uma «mix» e uma «5».
  select count(*),
         string_agg(q.nome, ' | ' order by q.nome)
    into v_n, v_erros
    from public.equipes q
   where q.setor_id = v_trein;
  select min(q.id::text)::uuid into v_eq_mix
    from public.equipes q
   where q.setor_id = v_trein and pg_temp.norm(q.nome) like '%mix%';
  select min(q.id::text)::uuid into v_eq_p5
    from public.equipes q
   where q.setor_id = v_trein and pg_temp.norm(q.nome) not like '%mix%' and pg_temp.norm(q.nome) like '%5%';
  if v_n <> 2 or v_eq_mix is null or v_eq_p5 is null then
    raise exception 'Treinamento Marília: esperava 2 equipes (uma do Play Mix e uma do Play 5), achei %: %',
      v_n, coalesce(v_erros, 'nenhuma');
  end if;
  v_erros := null;

  for r in select * from _novos loop
    v_setor := pg_temp.setor_de_marilia(r.setor_nome);
    if (select empresa_id from public.setores where id = v_setor) is distinct from v_empresa then
      raise exception 'O setor "%" e o Treinamento Marília moram em empresas diferentes — clone entre empresas não existe. Nada foi gravado.',
        r.setor_nome;
    end if;
    update _novos
       set setor_id        = v_setor,
           equipe_id       = pg_temp.equipe_ou_cria(v_setor, 'Treinamento'),
           clone_equipe_id = case r.clone_de when 'play5' then v_eq_p5 else v_eq_mix end
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

  -- ── 3. As duas equipes do Treinamento Marília: nome novo, turma antiga fora ─
  update public.equipes set nome = 'Play 5 Treinamento'   where id = v_eq_p5  and nome <> 'Play 5 Treinamento';
  update public.equipes set nome = 'Play Mix Treinamento' where id = v_eq_mix and nome <> 'Play Mix Treinamento';

  if c_tirar_clones_antigos then
    insert into _tirados (operador_id, nome, equipe_antiga)
    select c.operador_id, p.nome, q.nome
      from public.equipe_operadores_clones c
      join public.equipes q on q.id = c.equipe_id
      left join public.perfis p on p.id = c.operador_id
     where c.equipe_id in (v_eq_p5, v_eq_mix)
       and not exists (select 1 from _novos n
                        where lower(btrim(p.usuario)) = n.login and p.empresa_id = v_empresa);

    delete from public.equipe_operadores_clones c
     using _tirados t
     where c.operador_id = t.operador_id
       and c.equipe_id in (v_eq_p5, v_eq_mix);
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

  -- ── 5. Setor e equipe Treinamento de origem ─────────────────────────────────
  -- O gatilho já grava o setor; gravar de novo cobre o caminho de exceção dele,
  -- que cria o perfil sem setor.
  update public.perfis p
     set setor_id  = n.setor_id,
         equipe_id = n.equipe_id
    from _novos n
   where p.empresa_id = v_empresa
     and lower(btrim(p.usuario)) = n.login
     and (p.setor_id  is distinct from n.setor_id
       or p.equipe_id is distinct from n.equipe_id);

  -- ── 6. Clone no Treinamento Marília, contando no recebimento ────────────────
  insert into public.equipe_operadores_clones (empresa_id, equipe_id, operador_id, conta_recebimento)
  select v_empresa, n.clone_equipe_id, p.id, true
    from _novos n
    join public.perfis p
      on p.empresa_id = v_empresa
     and lower(btrim(p.usuario)) = n.login
  on conflict (equipe_id, operador_id) do nothing;

  -- ── 7. Prova: os 13 completos, ou nada fica ─────────────────────────────────
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
      or p.equipe_id is distinct from n.equipe_id
      or u.id is null
      or not exists (select 1 from auth.identities i where i.user_id = p.id)
      or not exists (select 1 from public.equipe_operadores_clones c
                      where c.operador_id = p.id and c.equipe_id = n.clone_equipe_id)
      or u.confirmation_token is null or u.recovery_token is null
      or u.email_change_token_new is null or u.email_change_token_current is null
      or u.email_change is null or u.phone_change is null
      or u.phone_change_token is null or u.reauthentication_token is null;

  if v_erros is not null then
    raise exception 'Prova falhou, nada foi gravado. Incompletos: %', v_erros;
  end if;

  if (select count(*) from public.equipes
       where id in (v_eq_p5, v_eq_mix)
         and nome in ('Play 5 Treinamento', 'Play Mix Treinamento')) <> 2 then
    raise exception 'Prova falhou, nada foi gravado: as equipes do Treinamento Marília não ficaram com o nome novo.';
  end if;

  raise notice 'OK: % acesso(s) criado(s), 13 conferidos, % clone(s) antigo(s) retirado(s).',
    v_criados, (select count(*) from _tirados);
end
$$;

-- ── Resultado: 13 linhas, nenhuma coluna vazia ────────────────────────────────
select n.login,
       p.nome,
       so.nome             as setor_origem,
       eo.nome             as equipe_origem,
       ec.nome             as clonado_em,
       c.conta_recebimento,
       p.perfil,
       p.situacao,
       p.senha_alterada
  from _novos n
  left join public.perfis p
         on p.empresa_id = (select empresa_id from public.setores where id = n.setor_id)
        and lower(btrim(p.usuario)) = n.login
  left join public.setores so on so.id = p.setor_id
  left join public.equipes eo on eo.id = p.equipe_id
  left join public.equipe_operadores_clones c
         on c.operador_id = p.id and c.equipe_id = n.clone_equipe_id
  left join public.equipes ec on ec.id = c.equipe_id
 order by n.setor_nome, n.login;

-- ── Equipes «Treinamento» criadas agora (vazio = já existiam) ─────────────────
select setor, equipe, equipe_id from _equipes_criadas order by setor;

-- ── Quem saiu das equipes antigas do Treinamento Marília ──────────────────────
select nome, equipe_antiga from _tirados order by equipe_antiga, nome;
