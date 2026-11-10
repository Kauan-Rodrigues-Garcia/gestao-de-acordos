-- ⚠ 10/11/2026 (auditoria de segurança): este script criava as contas com uma
-- senha fixa, igual para todo mundo. Não cria mais: cada conta nasce com uma
-- senha aleatória que ninguém conhece. Para a pessoa entrar, a liderança pede o
-- reset em Usuários (canal «Senhas») — ou crie a conta pela tela, que já
-- entrega uma senha provisória e obriga a troca no primeiro acesso.
-- =============================================================================
-- Operadores novos do Play Night
-- 04/11/2026 · marca PaguePlay (Marília) · 11 logins
-- =============================================================================
--
-- ✅ RODADO em 04/11/2026 no SQL Editor. Conferido no banco: os 11 ativos,
--    operador, setor Play Night (Marília), sem equipe, auth + identity e
--    tokens ok, senha_alterada false. Não precisa rodar de novo.
--
-- Rodar INTEIRO no SQL Editor do Supabase. Tudo que grava está num bloco `do`
-- só: se qualquer conferência falhar, nada é gravado e a mensagem de erro diz
-- o que faltou. A consulta do fim mostra o resultado (11 linhas).
--
-- Mesmo formato de criar_operadores_play5_playmix_treinamento_marilia_20261023.sql.
-- Para cada login:
--   1. cria o acesso (auth.users + auth.identities) com o e-mail
--      <login>@interno.sistema e uma senha aleatória (ver o aviso no topo). O gatilho `trg_novo_usuario`
--      cria a linha em `perfis` com cargo operador, setor e empresa;
--   2. grava o setor Play Night no perfil (cobre o caminho de exceção do
--      gatilho, que cria o perfil sem setor).
--
-- SEM EQUIPE: o pedido não disse equipe. A pessoa nasce no setor, sem equipe;
-- ponha na equipe pela aba Equipes.
-- Meta: este script NÃO grava meta. Lance pela aba Metas.
--
-- MARCA, NÃO EMPRESA: o Play Night é de Marília, logo PaguePlay
-- (`lib/marca.ts`), mas mora na empresa BookPlay. O script acha o setor pelo
-- nome E pela cidade Marília (`setores.cidade_id` → `rh_celulas`), nunca pelo
-- slug da empresa. A empresa gravada é a do setor, que é onde o dado mora.
--
-- Nome = login sem "_", com as iniciais maiúsculas (`initcap`).
-- Senha: `perfis.senha_alterada` nasce false, então o botão de trocar a senha
-- aparece para a pessoa assim que ela entra.
-- Tokens: as OITO colunas de token de auth.users vão '' e não nulo (ver o
-- script de 28/09) — com NULL o login falha com «Database error querying schema».
--
-- Rodar de novo não duplica: quem já existe no Play Night, como operador e
-- não desligado, não é recriado e não tem a senha trocada. Aborta sem gravar
-- se algum login já existir em OUTRO setor, com outro cargo, desligado, ou se
-- o e-mail já for de outra conta.
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

drop table if exists pg_temp._novos;
create temp table _novos (
  login    text primary key,
  nome     text,
  setor_id uuid
);

insert into _novos (login) values
  ('ana_balonecker'),
  ('giovanna_mizote'),
  ('ana_k_assuncao'),
  ('camila_bertarelli'),
  ('cintia_paulino'),
  ('danielle_felix'),
  ('dayane_rodrigues'),
  ('jose_moreira'),
  ('leticia_amorim'),
  ('nathaly_lima'),
  ('nicoly_oliveira');

-- "ana_k_assuncao" → "Ana K Assuncao"
update _novos set nome = initcap(replace(login, '_', ' '));

do $$
declare
  v_setor   uuid;
  v_empresa uuid;
  v_slug    text;
  v_erros   text;
  r         record;
  v_id      uuid;
  v_email   text;
  v_criados integer := 0;
begin
  -- ── 1. O setor (Play Night de Marília) e onde ele mora ──────────────────────
  v_setor := pg_temp.setor_de_marilia('Play Night');
  select s.empresa_id, e.slug
    into v_empresa, v_slug
    from public.setores s
    join public.empresas e on e.id = s.empresa_id
   where s.id = v_setor;

  update _novos set setor_id = v_setor;

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
      v_email, extensions.crypt(encode(extensions.gen_random_bytes(24), 'base64'), extensions.gen_salt('bf', 10)), now(),
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

  -- ── 4. Setor no perfil ──────────────────────────────────────────────────────
  update public.perfis p
     set setor_id = n.setor_id
    from _novos n
   where p.empresa_id = v_empresa
     and lower(btrim(p.usuario)) = n.login
     and p.setor_id is distinct from n.setor_id;

  -- ── 5. Prova: os 11 completos, ou nada fica ─────────────────────────────────
  select string_agg(n.login, ', ' order by n.login)
    into v_erros
    from _novos n
    left join public.perfis p
           on p.empresa_id = v_empresa
          and lower(btrim(p.usuario)) = n.login
    left join auth.users u on u.id = p.id
   where p.id is null
      or p.perfil   <> 'operador'
      or p.situacao =  'desligado'
      or p.setor_id is distinct from n.setor_id
      or u.id is null
      or not exists (select 1 from auth.identities i where i.user_id = p.id)
      or u.confirmation_token is null or u.recovery_token is null
      or u.email_change_token_new is null or u.email_change_token_current is null
      or u.email_change is null or u.phone_change is null
      or u.phone_change_token is null or u.reauthentication_token is null;

  if v_erros is not null then
    raise exception 'Prova falhou, nada foi gravado. Incompletos: %', v_erros;
  end if;

  raise notice 'OK: % acesso(s) criado(s), 11 conferidos.', v_criados;
end
$$;

-- ── Resultado: 11 linhas, nenhuma coluna vazia ────────────────────────────────
select n.login,
       p.nome,
       s.nome  as setor,
       p.perfil,
       p.situacao,
       p.senha_alterada
  from _novos n
  left join public.perfis p
         on p.empresa_id = (select empresa_id from public.setores where id = n.setor_id)
        and lower(btrim(p.usuario)) = n.login
  left join public.setores s on s.id = p.setor_id
 order by n.login;
