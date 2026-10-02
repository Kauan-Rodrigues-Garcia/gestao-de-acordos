-- ============================================================================
-- O cargo ganha cadastro — fase 2 da reorganizacao empresa > setor > cargo
-- ============================================================================
--
-- ## Por que
--
-- Ate aqui o cargo existia so como texto em `perfis.perfil`. A lista dos cargos
-- validos morava no CHECK `perfis_perfil_check`, e o que cada cargo E (se
-- pertence a setor, se conta no recebimento, se tem acesso total) morava em
-- uma duzia de listas soltas em `src/lib/index.ts`, `permissoes-catalogo.ts`,
-- `cargoDoNucleo.ts` e em gatilhos como `fn_perfis_escopo_empresa`. Cargo novo
-- exigia mexer em uns dez lugares, e `PERFIL_NIVEL` ja tinha ficado para tras.
--
-- Esta migration cria `public.cargos`: uma linha por cargo, com os atributos
-- que hoje estao espalhados. Os cargos sao GLOBAIS (decisao de 02/10/2026):
-- a mesma lista vale para todas as empresas, e a empresa que nao usa um cargo
-- simplesmente nao tem ninguem nele. O que muda por empresa continua em
-- `cargos_permissoes`.
--
-- ## O que esta migration NAO faz
--
-- Ninguem le a tabela ainda. Nenhuma policy, funcao ou tela muda: a troca das
-- listas pelos atributos e a fase 3. O CHECK `perfis_perfil_check` fica de pe
-- ate a fase 7 — durante a transicao, CHECK e FK dizem a mesma coisa.
--
-- O espelho em TypeScript e `src/lib/cargos.ts`. O teste
-- `src/lib/__tests__/cargos.test.ts` confere que as linhas abaixo e o espelho
-- concordam, e que cada lista antiga e reproduzida pelos atributos.
--
-- ## As colunas
--
--   slug                  o valor gravado em `perfis.perfil`
--   nome                  o rotulo (PERFIL_LABELS)
--   nivel                 PERFIL_NIVEL; NULL onde ele nunca foi definido
--                         (rh, assistente_adm) — preencher e decisao, nao copia
--   ordem                 a ordem do painel de permissoes
--   pertence_a_setor      FALSE = cupula (PERFIS_ESCOPO_EMPRESA)
--   exige_tipo_setor      'nucleo' para o Assistente ADM (CARGO_DO_NUCLEO);
--                         vira FK quando `setores.tipo` existir (fase 6)
--   acesso_total          CARGOS_ACESSO_TOTAL
--   conta_no_recebimento  PERFIS_QUE_CONTAM_NO_RECEBIMENTO
--   lidera_equipe         quem lidera equipe; com conta_no_recebimento = FALSE
--                         da PERFIS_QUE_SO_LIDERAM
--   ativo                 permite aposentar um cargo sem apagar historico
--
-- ## As FKs
--
-- `perfis.perfil` e `cargos_permissoes.cargo` passam a apontar para
-- `cargos(slug)`. Criadas `NOT VALID` e validadas em seguida: a validacao nao
-- bloqueia escrita em `perfis` enquanto varre a tabela. O passo 3 recusa
-- aplicar, e diz o valor, se existir cargo gravado fora do cadastro.
--
-- `menu_lateral_ordem.cargo` fica de fora: a linha geral e `''` por decisao de
-- 20260824130000, e `''` nao e cargo. Ganha validacao por gatilho na fase 3.
--
-- ## Reaplicavel
--
-- CREATE IF NOT EXISTS, INSERT ... ON CONFLICT DO UPDATE e FKs criadas so
-- quando ausentes.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. A tabela ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cargos (
  slug                 TEXT PRIMARY KEY
                         CHECK (slug ~ '^[a-z][a-z_]*$'),
  nome                 TEXT NOT NULL,
  nivel                SMALLINT,
  ordem                SMALLINT NOT NULL,
  pertence_a_setor     BOOLEAN NOT NULL,
  exige_tipo_setor     TEXT,
  acesso_total         BOOLEAN NOT NULL DEFAULT FALSE,
  conta_no_recebimento BOOLEAN NOT NULL DEFAULT FALSE,
  lidera_equipe        BOOLEAN NOT NULL DEFAULT FALSE,
  ativo                BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Cargo exclusivo de um tipo de setor tem de pertencer a setor.
  CONSTRAINT cargos_exige_setor_pertence CHECK (
    exige_tipo_setor IS NULL OR pertence_a_setor
  )
);

COMMENT ON TABLE public.cargos IS
  'Cadastro dos cargos, globais para todas as empresas. perfis.perfil e '
  'cargos_permissoes.cargo apontam para slug. Espelho: src/lib/cargos.ts. '
  'Ver 20261002173500.';

-- ── 2. Os dez cargos de hoje ────────────────────────────────────────────────
--
-- Os atributos reproduzem as listas atuais, uma a uma. Mudou aqui, muda em
-- `src/lib/cargos.ts` — o teste de paridade recusa a divergencia.

INSERT INTO public.cargos
  (slug, nome, nivel, ordem, pertence_a_setor, exige_tipo_setor,
   acesso_total, conta_no_recebimento, lidera_equipe)
VALUES
  ('operador',       'Operador',       1,    1,  TRUE,  NULL,     FALSE, TRUE,  FALSE),
  ('ouvidoria',      'Ouvidoria',      2,    2,  TRUE,  NULL,     FALSE, FALSE, FALSE),
  ('lider',          'Líder',          2,    3,  TRUE,  NULL,     FALSE, FALSE, TRUE),
  ('elite',          'Elite',          3,    4,  TRUE,  NULL,     FALSE, TRUE,  TRUE),
  ('gerencia',       'Gerência',       4,    5,  TRUE,  NULL,     FALSE, FALSE, FALSE),
  ('diretoria',      'Diretoria',      5,    6,  FALSE, NULL,     FALSE, FALSE, FALSE),
  ('rh',             'RH',             NULL, 7,  TRUE,  NULL,     FALSE, FALSE, FALSE),
  ('assistente_adm', 'Assistente ADM', NULL, 8,  TRUE,  'nucleo', FALSE, FALSE, FALSE),
  ('administrador',  'Administrador',  6,    9,  FALSE, NULL,     TRUE,  FALSE, FALSE),
  ('super_admin',    'Super Admin',    7,    10, FALSE, NULL,     TRUE,  FALSE, FALSE)
ON CONFLICT (slug) DO UPDATE SET
  nome                 = EXCLUDED.nome,
  nivel                = EXCLUDED.nivel,
  ordem                = EXCLUDED.ordem,
  pertence_a_setor     = EXCLUDED.pertence_a_setor,
  exige_tipo_setor     = EXCLUDED.exige_tipo_setor,
  acesso_total         = EXCLUDED.acesso_total,
  conta_no_recebimento = EXCLUDED.conta_no_recebimento,
  lidera_equipe        = EXCLUDED.lidera_equipe,
  atualizado_em        = NOW();

-- ── 3. Ninguem pode estar fora do cadastro antes das FKs ────────────────────

DO $antes$
DECLARE
  v_perfis TEXT;
  v_perm   TEXT;
BEGIN
  SELECT string_agg(DISTINCT p.perfil, ', ')
    INTO v_perfis
    FROM public.perfis p
   WHERE NOT EXISTS (SELECT 1 FROM public.cargos c WHERE c.slug = p.perfil);

  SELECT string_agg(DISTINCT cp.cargo, ', ')
    INTO v_perm
    FROM public.cargos_permissoes cp
   WHERE NOT EXISTS (SELECT 1 FROM public.cargos c WHERE c.slug = cp.cargo);

  IF v_perfis IS NOT NULL OR v_perm IS NOT NULL THEN
    RAISE EXCEPTION 'Cargo fora do cadastro. perfis: [%]; cargos_permissoes: [%]',
      COALESCE(v_perfis, ''), COALESCE(v_perm, '');
  END IF;
END
$antes$;

-- ── 4. As FKs ───────────────────────────────────────────────────────────────
--
-- ON UPDATE CASCADE: renomear um slug leva junto quem o usa. ON DELETE
-- RESTRICT: cargo com gente ou com permissao nao se apaga — aposenta-se com
-- `ativo = FALSE`.

DO $fks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.perfis'::REGCLASS AND conname = 'perfis_perfil_fkey'
  ) THEN
    ALTER TABLE public.perfis
      ADD CONSTRAINT perfis_perfil_fkey FOREIGN KEY (perfil)
      REFERENCES public.cargos (slug) ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.cargos_permissoes'::REGCLASS AND conname = 'cargos_permissoes_cargo_fkey'
  ) THEN
    ALTER TABLE public.cargos_permissoes
      ADD CONSTRAINT cargos_permissoes_cargo_fkey FOREIGN KEY (cargo)
      REFERENCES public.cargos (slug) ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$fks$;

ALTER TABLE public.perfis            VALIDATE CONSTRAINT perfis_perfil_fkey;
ALTER TABLE public.cargos_permissoes VALIDATE CONSTRAINT cargos_permissoes_cargo_fkey;

-- ── 5. Acesso ───────────────────────────────────────────────────────────────
--
-- Ler: qualquer pessoa autenticada — o menu, os rotulos e o painel precisam do
-- cadastro no primeiro render, e ele nao tem dado pessoal. Escrever: so
-- super_admin, como o resto da configuracao estrutural.

ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cargos FROM anon;
GRANT SELECT ON public.cargos TO authenticated;
GRANT INSERT, UPDATE ON public.cargos TO authenticated;

DROP POLICY IF EXISTS cargos_select ON public.cargos;
CREATE POLICY cargos_select ON public.cargos FOR SELECT TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS cargos_insert ON public.cargos;
CREATE POLICY cargos_insert ON public.cargos FOR INSERT TO authenticated
WITH CHECK (public.fn_user_is_super_admin());

DROP POLICY IF EXISTS cargos_update ON public.cargos;
CREATE POLICY cargos_update ON public.cargos FOR UPDATE TO authenticated
USING (public.fn_user_is_super_admin())
WITH CHECK (public.fn_user_is_super_admin());

-- Sem DELETE: aposentar e `ativo = FALSE`, e a FK recusaria de qualquer forma.

-- ── 6. Prova ────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF (SELECT COUNT(*) FROM public.cargos) <> 10 THEN
    RAISE EXCEPTION 'Esperados 10 cargos, ha %', (SELECT COUNT(*) FROM public.cargos);
  END IF;

  -- O CHECK antigo e o cadastro tem de dizer a mesma coisa ate a fase 7.
  IF EXISTS (
    SELECT 1 FROM public.cargos c
     WHERE pg_get_constraintdef((
             SELECT oid FROM pg_constraint
              WHERE conrelid = 'public.perfis'::REGCLASS AND conname = 'perfis_perfil_check'
           )) NOT LIKE '%''' || c.slug || '''%'
  ) THEN
    RAISE EXCEPTION 'Ha cargo no cadastro que o CHECK de perfis nao aceita.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.perfis'::REGCLASS AND conname = 'perfis_perfil_fkey' AND convalidated
  ) THEN
    RAISE EXCEPTION 'perfis_perfil_fkey ausente ou nao validada.';
  END IF;
END
$prova$;

COMMIT;
