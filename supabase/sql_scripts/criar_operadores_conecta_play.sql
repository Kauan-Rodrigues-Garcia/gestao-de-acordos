-- ═══════════════════════════════════════════════════════════════════════════
-- Cria 9 operadores no setor Conecta Play — senha padrão 123456
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ESCREVE EM PRODUÇÃO, E ESCREVE NO SCHEMA `auth`. Leia a ressalva antes.
--
-- ## A ressalva
--
-- O caminho suportado para criar conta é a Admin API do Auth
-- (`POST /auth/v1/admin/users`, com a SERVICE_ROLE_KEY) — é o que
-- `api/alterar-senha.ts` já usa. Escrever direto em `auth.users` é caminho de
-- fora da trilha: significa montar à mão o hash bcrypt e a linha irmã em
-- `auth.identities`, que o GoTrue normalmente monta sozinho. Errar um detalhe
-- produz conta que EXISTE e não LOGA — o pior resultado, porque parece que deu
-- certo.
--
-- Este arquivo faz o caminho de fora da trilha com os detalhes cobertos:
--   • `encrypted_password` com bcrypt de verdade (`crypt` + `gen_salt('bf')`),
--     que é o que o GoTrue confere no login;
--   • `auth.identities` com `provider_id`, obrigatório e sem default — sem essa
--     linha o login por e-mail não encontra a identidade e falha;
--   • colunas de token com string vazia em vez de NULL: versões do GoTrue
--     estouram «converting NULL to string» ao ler NULL nesses campos;
--   • `email_confirmed_at` preenchido, senão a conta nasce pendente.
--
-- ## O que NÃO é preciso fazer aqui
--
-- Inserir em `public.perfis`. O gatilho `fn_criar_perfil_novo_usuario()` em
-- `auth.users` lê o `raw_user_meta_data` e cria o perfil sozinho — daí os
-- metadados `nome`, `usuario`, `perfil`, `setor_id` e `empresa_id` irem no
-- INSERT. A Parte 3 confere se o gatilho fez o que devia: ele tem um ramo de
-- exceção que grava o perfil SEM setor, e sem conferir alguém nasceria fora do
-- Conecta Play em silêncio.
--
-- `senha_alterada` fica no default `false` de propósito: é ele que faz o botão
-- de definir a própria senha aparecer para a pessoa (Layout.tsx:261). Com senha
-- padrão compartilhada, é exatamente o que se quer.
--
-- ## Sobre `crypt` e `gen_salt`
--
-- Vêm da pgcrypto, que no Supabase mora no schema `extensions` — daí a
-- qualificação. Se der «function extensions.crypt does not exist», troque por
-- `crypt(...)` e `gen_salt(...)` sem prefixo.
--
-- ## Ordem de execução
--
-- Rode a Parte 1 sozinha primeiro e leia o resultado. Só depois a Parte 2.
--
-- ═══════════════════════════════════════════════════════════════════════════


-- ── PARTE 1 — Conferência. SOMENTE LEITURA, nada grava ──────────────────────
--
-- Duas perguntas: o setor é um só, e quem dessa lista já existe?

SELECT s.id AS setor_id, s.nome AS setor, e.nome AS empresa, e.slug, s.empresa_id
  FROM public.setores s
  JOIN public.empresas e ON e.id = s.empresa_id
 WHERE s.nome ILIKE '%conecta%play%';
-- Espere UMA linha. Se vierem duas (o mesmo nome em duas empresas), PARE:
-- a Parte 2 aborta sozinha, mas é melhor você saber qual é antes.

SELECT p.usuario, p.nome, p.perfil, p.setor_id, p.ativo
  FROM public.perfis p
 WHERE p.usuario IN (
   'leonardo_costa','isabella_santos','bruna_teles','diego_rodrigues',
   'kaue_nadai','rebeca_camargo','debora_sobrinho','mirella_arias','jade_faustino'
 );
-- Espere ZERO linhas. Quem aparecer aqui será pulado pela Parte 2.


-- ── PARTE 2 — Criação. ESTA PARTE ESCREVE ───────────────────────────────────
--
-- Tudo ou nada: qualquer falha desfaz as 9. Criar 4 e estourar na 5ª deixaria
-- um estado pela metade que ninguém sabe onde começou.

BEGIN;

DO $criar$
DECLARE
  v_setor    UUID;
  v_empresa  UUID;
  v_qtd      INT;
  v_pessoa   RECORD;
  v_id       UUID;
  v_email    TEXT;
  v_criados  INT := 0;
  v_pulados  INT := 0;
BEGIN
  -- 1. O setor precisa ser um só. Chutar entre dois criaria 9 pessoas na
  --    empresa errada, e isso só apareceria no relatório do mês.
  SELECT count(*) INTO v_qtd
    FROM public.setores WHERE nome ILIKE '%conecta%play%';

  IF v_qtd = 0 THEN
    RAISE EXCEPTION 'Nenhum setor casa com "Conecta Play". Confira o nome no cadastro.';
  ELSIF v_qtd > 1 THEN
    RAISE EXCEPTION '% setores casam com "Conecta Play". Desfaca a ambiguidade antes.', v_qtd;
  END IF;

  SELECT id, empresa_id INTO v_setor, v_empresa
    FROM public.setores WHERE nome ILIKE '%conecta%play%';

  RAISE NOTICE 'Setor % / empresa %', v_setor, v_empresa;

  -- 2. A lista. O nome sai do usuário: tira o "_", primeira letra maiúscula.
  --    Sem acento — não dá para adivinhá-lo a partir do login.
  FOR v_pessoa IN
    SELECT * FROM (VALUES
      ('leonardo_costa',  'Leonardo Costa'),
      ('isabella_santos', 'Isabella Santos'),
      ('bruna_teles',     'Bruna Teles'),
      ('diego_rodrigues', 'Diego Rodrigues'),
      ('kaue_nadai',      'Kaue Nadai'),
      ('rebeca_camargo',  'Rebeca Camargo'),
      ('debora_sobrinho', 'Debora Sobrinho'),
      ('mirella_arias',   'Mirella Arias'),
      ('jade_faustino',   'Jade Faustino')
    ) AS t(usuario, nome)
  LOOP
    v_email := v_pessoa.usuario || '@interno.sistema';

    -- Idempotência: rodar duas vezes não duplica ninguém.
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email)
       OR EXISTS (SELECT 1 FROM public.perfis
                   WHERE usuario = v_pessoa.usuario AND empresa_id = v_empresa) THEN
      RAISE NOTICE 'pulado (ja existe): %', v_pessoa.usuario;
      v_pulados := v_pulados + 1;
      CONTINUE;
    END IF;

    v_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_id, 'authenticated', 'authenticated', v_email,
      extensions.crypt('123456', extensions.gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider":"email","providers":["email"]}'::JSONB,
      JSONB_BUILD_OBJECT(
        'nome',       v_pessoa.nome,
        'usuario',    v_pessoa.usuario,
        'perfil',     'operador',
        'setor_id',   v_setor::TEXT,
        'empresa_id', v_empresa::TEXT,
        'source',     'criacao_em_lote_sql'
      ),
      '', '', '', '', ''
    );

    -- Sem esta linha o login por e-mail não acha a identidade. `provider_id`
    -- é NOT NULL e não tem default: para o provedor `email`, é o id do usuário.
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_id, v_id::TEXT,
      JSONB_BUILD_OBJECT('sub', v_id::TEXT, 'email', v_email, 'email_verified', true),
      'email', NOW(), NOW(), NOW()
    );

    v_criados := v_criados + 1;
    RAISE NOTICE 'criado: % (%)', v_pessoa.usuario, v_pessoa.nome;
  END LOOP;

  RAISE NOTICE 'criados: % / pulados: %', v_criados, v_pulados;
END
$criar$;

COMMIT;


-- ── PARTE 3 — Conferência do resultado. SOMENTE LEITURA ─────────────────────
--
-- O gatilho pode ter caído no ramo de exceção e gravado o perfil sem setor.
-- Esta consulta mostra as 9 como ficaram: espere `operador`, o setor Conecta
-- Play em todas, `senha_alterada` false e uma identidade por pessoa.

SELECT p.usuario,
       p.nome,
       p.perfil,
       s.nome                           AS setor,
       e.nome                           AS empresa,
       p.ativo,
       p.senha_alterada,
       u.email_confirmed_at IS NOT NULL AS email_confirmado,
       (SELECT count(*) FROM auth.identities i WHERE i.user_id = p.id) AS identidades
  FROM public.perfis p
  JOIN auth.users u           ON u.id = p.id
  LEFT JOIN public.setores  s ON s.id = p.setor_id
  LEFT JOIN public.empresas e ON e.id = p.empresa_id
 WHERE p.usuario IN (
   'leonardo_costa','isabella_santos','bruna_teles','diego_rodrigues',
   'kaue_nadai','rebeca_camargo','debora_sobrinho','mirella_arias','jade_faustino'
 )
 ORDER BY p.nome;

-- Se alguma vier com setor NULL (ramo de exceção do gatilho), corrija com:
--
--   UPDATE public.perfis
--      SET setor_id = (SELECT id FROM public.setores WHERE nome ILIKE '%conecta%play%'),
--          perfil   = 'operador'
--    WHERE usuario IN (...os que falharam...)
--      AND setor_id IS NULL;
