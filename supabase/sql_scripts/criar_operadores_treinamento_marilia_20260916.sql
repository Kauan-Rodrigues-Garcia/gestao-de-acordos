-- =============================================================================
-- Operadores novos do Play 5 e do Play Mix Marília, clonados no Treinamento Marília
-- 16/09/2026 · BookPlay
-- =============================================================================
--
-- Rodar INTEIRO no SQL Editor do Supabase. Tudo que grava está num bloco `do`
-- só: se qualquer conferência falhar, nada é gravado e a mensagem de erro diz
-- o que faltou. A última consulta mostra o resultado (14 linhas).
--
-- Para cada login da lista:
--   1. cria o acesso (auth.users + auth.identities) com o e-mail
--      <login>@interno.sistema e a senha 123456 — o mesmo formato que a tela de
--      Usuários grava. O gatilho `trg_novo_usuario` cria a linha em `perfis`
--      com cargo operador, setor e empresa;
--   2. põe a pessoa na equipe Treinamento do setor de origem;
--   3. clona na equipe do Treinamento Marília (TreiPlay 5 ou TreiPlayMix), com
--      `conta_recebimento` ligado (o padrão).
--
-- Nome = login sem "_", com as iniciais maiúsculas (`initcap`).
-- Senha: `perfis.senha_alterada` nasce false, então o botão de trocar a senha
-- aparece para a pessoa assim que ela entra.
--
-- Nomes de setor e equipe são comparados sem acento, sem espaço e sem
-- maiúscula ("Play Mix Marília" = "PLAYMIX MARILIA"). Precisa achar exatamente
-- um; se achar zero ou dois, aborta e lista o que existe.
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

-- Setor ativo pelo nome. p_empresa nulo = qualquer empresa.
create or replace function pg_temp.setor_unico(p_empresa uuid, p_nome text) returns uuid
language plpgsql as $fn$
declare
  v_n     integer;
  v_id    text;
  v_achei text;
begin
  select count(*), min(s.id::text),
         string_agg(format('%s (%s)', s.nome, e.slug), ' | ' order by s.nome)
    into v_n, v_id, v_achei
    from public.setores s
    join public.empresas e on e.id = s.empresa_id
   where s.ativo
     and (p_empresa is null or s.empresa_id = p_empresa)
     and pg_temp.norm(s.nome) = pg_temp.norm(p_nome);
  if v_n = 1 then
    return v_id::uuid;
  end if;
  raise exception 'Setor "%": esperava 1, achei % (%)', p_nome, v_n, coalesce(v_achei, 'nenhum');
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

drop table if exists pg_temp._novos;
create temp table _novos (
  login           text primary key,
  nome            text,
  setor_nome      text not null,
  equipe_nome     text not null,
  clone_nome      text not null,
  setor_id        uuid,
  equipe_id       uuid,
  clone_equipe_id uuid
);

insert into _novos (login, setor_nome, equipe_nome, clone_nome) values
  -- PLAY MIX MARÍLIA → equipe Treinamento → clone em TreiPlayMix
  ('ellen_alves',         'Play Mix Marília', 'Treinamento', 'TreiPlayMix'),
  ('raissa_mesquita',     'Play Mix Marília', 'Treinamento', 'TreiPlayMix'),
  ('maria_v_souza',       'Play Mix Marília', 'Treinamento', 'TreiPlayMix'),
  ('isabella_lima',       'Play Mix Marília', 'Treinamento', 'TreiPlayMix'),
  ('rhuan_silva',         'Play Mix Marília', 'Treinamento', 'TreiPlayMix'),
  ('luan_pinto',          'Play Mix Marília', 'Treinamento', 'TreiPlayMix'),
  ('caroline_basta',      'Play Mix Marília', 'Treinamento', 'TreiPlayMix'),
  ('pamela_goncalves',    'Play Mix Marília', 'Treinamento', 'TreiPlayMix'),
  -- PLAY 5 → equipe Treinamento → clone em TreiPlay 5
  ('isabella_nascimento', 'Play 5',           'Treinamento', 'TreiPlay 5'),
  ('kenay_cazarini',      'Play 5',           'Treinamento', 'TreiPlay 5'),
  ('maria_mattos',        'Play 5',           'Treinamento', 'TreiPlay 5'),
  ('moliveira',           'Play 5',           'Treinamento', 'TreiPlay 5'),
  ('pamela_faria',        'Play 5',           'Treinamento', 'TreiPlay 5'),
  ('yasmin_cruz',         'Play 5',           'Treinamento', 'TreiPlay 5');

-- "maria_v_souza" → "Maria V Souza"
update _novos set nome = initcap(replace(login, '_', ' '));

do $$
declare
  v_trein   uuid;
  v_empresa uuid;
  v_slug    text;
  v_erros   text;
  r         record;
  v_setor   uuid;
  v_id      uuid;
  v_email   text;
  v_criados integer := 0;
begin
  -- ── 1. Onde cada um vai ─────────────────────────────────────────────────────
  -- A empresa sai do Treinamento Marília; os setores de origem são procurados
  -- só dentro dela (a PaguePlay também tem um Play 5).
  v_trein := pg_temp.setor_unico(null, 'Treinamento Marília');
  select s.empresa_id, e.slug
    into v_empresa, v_slug
    from public.setores s
    join public.empresas e on e.id = s.empresa_id
   where s.id = v_trein;

  for r in select * from _novos loop
    v_setor := pg_temp.setor_unico(v_empresa, r.setor_nome);
    update _novos
       set setor_id        = v_setor,
           equipe_id       = pg_temp.equipe_unica(v_setor, r.equipe_nome),
           clone_equipe_id = pg_temp.equipe_unica(v_trein, r.clone_nome)
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

    -- Os quatro tokens vão '' e não nulo: o GoTrue não lê NULL nessas colunas
    -- e o login falharia com «Database error querying schema».
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
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
      '', '', '', ''
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

  -- ── 4. Setor e equipe de origem ─────────────────────────────────────────────
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

  -- ── 5. Clone no Treinamento Marília ─────────────────────────────────────────
  insert into public.equipe_operadores_clones (empresa_id, equipe_id, operador_id)
  select v_empresa, n.clone_equipe_id, p.id
    from _novos n
    join public.perfis p
      on p.empresa_id = v_empresa
     and lower(btrim(p.usuario)) = n.login
  on conflict (equipe_id, operador_id) do nothing;

  -- ── 6. Prova: os 14 completos, ou nada fica ─────────────────────────────────
  select string_agg(n.login, ', ' order by n.login)
    into v_erros
    from _novos n
    left join public.perfis p
           on p.empresa_id = v_empresa
          and lower(btrim(p.usuario)) = n.login
   where p.id is null
      or p.perfil    <> 'operador'
      or p.situacao  =  'desligado'
      or p.setor_id  is distinct from n.setor_id
      or p.equipe_id is distinct from n.equipe_id
      or not exists (select 1 from auth.users u where u.id = p.id)
      or not exists (select 1 from auth.identities i where i.user_id = p.id)
      or not exists (select 1 from public.equipe_operadores_clones c
                      where c.operador_id = p.id and c.equipe_id = n.clone_equipe_id);

  if v_erros is not null then
    raise exception 'Prova falhou, nada foi gravado. Incompletos: %', v_erros;
  end if;

  raise notice 'OK: % acesso(s) criado(s), 14 conferidos.', v_criados;
end
$$;

-- ── Resultado: 14 linhas, nenhuma coluna vazia ────────────────────────────────
select n.login,
       p.nome,
       so.nome             as setor_origem,
       eo.nome             as equipe_origem,
       ec.nome             as clonado_em,
       c.conta_recebimento,
       p.perfil,
       p.situacao,
       p.senha_alterada,
       p.criado_em
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
