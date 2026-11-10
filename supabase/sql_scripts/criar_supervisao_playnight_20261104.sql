-- ⚠ 10/11/2026 (auditoria de segurança): este script criava as contas com uma
-- senha fixa, igual para todo mundo. Não cria mais: cada conta nasce com uma
-- senha aleatória que ninguém conhece. Para a pessoa entrar, a liderança pede o
-- reset em Usuários (canal «Senhas») — ou crie a conta pela tela, que já
-- entrega uma senha provisória e obriga a troca no primeiro acesso.
-- =============================================================================
-- Conta supervisao_playnight
-- 04/11/2026 · marca PaguePlay (Marília) · 1 login
-- =============================================================================
--
-- Rodar INTEIRO no SQL Editor do Supabase. Tudo que grava está num bloco `do`
-- só: se qualquer conferência falhar, nada é gravado. A consulta do fim mostra
-- o resultado (1 linha).
--
-- O que faz (decidido pelo Cleber em 04/11/2026):
--   1. cria o acesso supervisao_playnight@interno.sistema, senha aleatória (ver o aviso no topo),
--      cargo operador, nome «Supervisao Playnight»;
--   2. põe no setor Play Night, equipe «Play Night» (líder Laysa Lopes). O
--      Brunno Piccolo não lidera equipe no setor Play Night;
--   3. clona no Marília Digital, equipe «Play Night» (a do Brunno), com
--      `conta_recebimento` ligado — igual aos outros clones das equipes do
--      Brunno no Digital (todos true em 04/11).
--
-- As equipes vão por id (conferidos no banco em 04/11) e o script confere o
-- nome e o setor de cada uma antes de gravar. Se o Play Night e o Marília
-- Digital morarem em empresas diferentes, para: clone entre empresas não
-- existe aqui.
--
-- Senha: `perfis.senha_alterada` nasce false. Tokens de auth.users vão '' e
-- não nulo (ver o script de 28/09). Meta: não grava; lance pela aba Metas.
--
-- Rodar de novo não duplica: se o login já existir no Play Night como operador
-- ativo, não recria nem troca a senha — só confere equipe e clone.
-- =============================================================================

do $$
declare
  c_login     constant text := 'supervisao_playnight';
  c_nome      constant text := 'Supervisao Playnight';
  c_setor     constant uuid := '8e7db35a-0510-4e33-81ee-1eb9c77495b3';  -- Play Night
  c_equipe    constant uuid := '7d4e4214-2096-43aa-b8e1-7e4c5d6327bf';  -- Play Night › Play Night
  c_digital   constant uuid := 'fb674f35-afe8-4b69-998d-a4d47aeb4999';  -- Marília Digital
  c_clone_eq  constant uuid := '77f15d33-93d8-488f-9d9d-4e77a5b36286';  -- Marília Digital › Play Night

  v_empresa uuid;
  v_slug    text;
  v_email   text := c_login || '@interno.sistema';
  v_id      uuid;
  p         record;
begin
  -- ── 1. Conferências ─────────────────────────────────────────────────────────
  if not exists (select 1 from public.setores where id = c_setor and nome = 'Play Night' and ativo) then
    raise exception 'Setor Play Night (%) não encontrado ou inativo. Nada foi gravado.', c_setor;
  end if;
  if not exists (select 1 from public.equipes where id = c_equipe and setor_id = c_setor and nome = 'Play Night') then
    raise exception 'Equipe «Play Night» do setor Play Night não confere. Nada foi gravado.';
  end if;
  if not exists (select 1 from public.setores where id = c_digital and nome = 'Marília Digital' and ativo) then
    raise exception 'Setor Marília Digital (%) não encontrado ou inativo. Nada foi gravado.', c_digital;
  end if;
  if not exists (select 1 from public.equipes where id = c_clone_eq and setor_id = c_digital and nome = 'Play Night') then
    raise exception 'Equipe «Play Night» do Marília Digital não confere. Nada foi gravado.';
  end if;

  select s.empresa_id, e.slug into v_empresa, v_slug
    from public.setores s join public.empresas e on e.id = s.empresa_id
   where s.id = c_setor;
  if (select empresa_id from public.setores where id = c_digital) is distinct from v_empresa then
    raise exception 'Play Night e Marília Digital moram em empresas diferentes — clone entre empresas não existe. Nada foi gravado.';
  end if;

  -- ── 2. Conflito ─────────────────────────────────────────────────────────────
  select * into p from public.perfis
   where empresa_id = v_empresa and lower(btrim(usuario)) = c_login;
  if found then
    if p.setor_id is distinct from c_setor then
      raise exception 'Login % já existe em outro setor. Nada foi gravado.', c_login;
    elsif p.situacao = 'desligado' then
      raise exception 'Login % já existe e está desligado. Nada foi gravado.', c_login;
    elsif p.perfil <> 'operador' then
      raise exception 'Login % já existe com o cargo %. Nada foi gravado.', c_login, p.perfil;
    end if;
  elsif exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'O e-mail % já é de outra conta. Nada foi gravado.', v_email;
  end if;

  -- ── 3. Acesso ───────────────────────────────────────────────────────────────
  if p.id is null then
    v_id := gen_random_uuid();

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
        'nome',         c_nome,
        'perfil',       'operador',
        'usuario',      c_login,
        'setor_id',     c_setor,
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
  else
    v_id := p.id;
  end if;

  -- ── 4. Setor e equipe ───────────────────────────────────────────────────────
  update public.perfis
     set setor_id = c_setor, equipe_id = c_equipe
   where id = v_id
     and (setor_id is distinct from c_setor or equipe_id is distinct from c_equipe);

  -- ── 5. Clone no Marília Digital › Play Night ────────────────────────────────
  insert into public.equipe_operadores_clones (empresa_id, equipe_id, operador_id, conta_recebimento)
  values (v_empresa, c_clone_eq, v_id, true)
  on conflict (equipe_id, operador_id) do nothing;

  -- ── 6. Prova ────────────────────────────────────────────────────────────────
  if not exists (
    select 1
      from public.perfis pf
      join auth.users u on u.id = pf.id
     where pf.id = v_id
       and pf.perfil = 'operador'
       and pf.situacao <> 'desligado'
       and pf.setor_id = c_setor
       and pf.equipe_id = c_equipe
       and exists (select 1 from auth.identities i where i.user_id = pf.id)
       and exists (select 1 from public.equipe_operadores_clones c
                    where c.operador_id = pf.id and c.equipe_id = c_clone_eq and c.conta_recebimento)
       and u.confirmation_token is not null and u.recovery_token is not null
       and u.email_change_token_new is not null and u.email_change_token_current is not null
       and u.email_change is not null and u.phone_change is not null
       and u.phone_change_token is not null and u.reauthentication_token is not null
  ) then
    raise exception 'Prova falhou, nada foi gravado.';
  end if;

  raise notice 'OK: supervisao_playnight no Play Night › Play Night, clone em Marília Digital › Play Night.';
end
$$;

-- ── Resultado: 1 linha ────────────────────────────────────────────────────────
select p.usuario, p.nome, p.perfil, p.situacao, p.senha_alterada,
       s.nome  as setor, q.nome as equipe,
       sc.nome as clone_setor, qc.nome as clone_equipe, c.conta_recebimento
  from public.perfis p
  left join public.setores s  on s.id = p.setor_id
  left join public.equipes q  on q.id = p.equipe_id
  left join public.equipe_operadores_clones c on c.operador_id = p.id
  left join public.equipes qc on qc.id = c.equipe_id
  left join public.setores sc on sc.id = qc.setor_id
 where lower(btrim(p.usuario)) = 'supervisao_playnight';
