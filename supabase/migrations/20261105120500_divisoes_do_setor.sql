-- ============================================================================
-- 20261105120500_divisoes_do_setor.sql
--
-- (Era 20261105120000: renomeada em 05/11/2026 porque a main trouxe outra
-- migration com o mesmo número, 20261105120000_desafio_so_quem_disputa. Já estava
-- aplicada no banco pelo SQL Editor; o conteúdo não mudou.)
--
-- Divisões do setor (pedido de 05/11/2026).
--
-- Um setor pode ter metas separadas que funcionam como dois setores — o
-- Receptivo com «0800» e «Time a vencer» —, cada uma com as próprias equipes,
-- líder e meta, mas continuando a ser UM setor: o 59, o carimbo da importação,
-- a Diretoria e as permissões não mudam. A divisão é um recorte de LEITURA
-- sobre o setor.
--
-- ## Quem está em cada divisão
--
--   equipes     `setor_divisao_equipes` — a equipe inteira (membros, líder e
--               clones que contam) entra na divisão. Uma equipe, uma divisão.
--   recebedor   `setor_divisao_recebedores` — login do relatório que recebe
--               sem estar em equipe nenhuma (ex.: pagueplay_play1,
--               pagueplay_jornadaplay). Um login, uma divisão por setor.
--
-- O que é do setor e não cai em divisão nenhuma aparece na tela como «Sem
-- divisão»: as divisões + «Sem divisão» = o total do setor, ao centavo.
--
-- ## Meta
--
-- `metas.tipo` ganha 'divisao' (referencia_id = setor_divisoes.id). A meta do
-- setor continua como estava.
--
-- ## O que NÃO muda
--
-- Nenhuma tabela existente ganha coluna, e nenhuma função é reescrita. A
-- única mudança em objeto existente é a CHECK de `metas.tipo`, que passa a
-- aceitar 'divisao'. Se alguma linha de `metas` tiver outro tipo, o ADD
-- CONSTRAINT falha e a transação inteira é desfeita — nada fica pela metade.
--
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. As divisões ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.setor_divisoes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id   UUID        NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  nome       TEXT        NOT NULL CHECK (btrim(nome) <> ''),
  ordem      INTEGER     NOT NULL DEFAULT 0,
  ativo      BOOLEAN     NOT NULL DEFAULT TRUE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID        REFERENCES public.perfis(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_setor_divisoes_setor_nome
  ON public.setor_divisoes (setor_id, lower(btrim(nome)));
CREATE INDEX IF NOT EXISTS idx_setor_divisoes_empresa
  ON public.setor_divisoes (empresa_id);

COMMENT ON TABLE public.setor_divisoes IS
  'Divisao de um setor com meta propria (ex.: Receptivo 0800 / Time a vencer). '
  'Recorte de LEITURA: o total do setor nao muda. Ver 20261105120500.';

-- ── 2. As equipes de cada divisão ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.setor_divisao_equipes (
  equipe_id  UUID        PRIMARY KEY REFERENCES public.equipes(id) ON DELETE CASCADE,
  divisao_id UUID        NOT NULL REFERENCES public.setor_divisoes(id) ON DELETE CASCADE,
  empresa_id UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_setor_divisao_equipes_divisao
  ON public.setor_divisao_equipes (divisao_id);
CREATE INDEX IF NOT EXISTS idx_setor_divisao_equipes_empresa
  ON public.setor_divisao_equipes (empresa_id);

COMMENT ON TABLE public.setor_divisao_equipes IS
  'Em que divisao do setor cada equipe esta. Uma equipe, uma divisao. A equipe '
  'tem de ser do setor da divisao (gatilho). 20261105120500.';

-- ── 3. Os recebedores sem equipe ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.setor_divisao_recebedores (
  setor_id   UUID        NOT NULL REFERENCES public.setores(id) ON DELETE CASCADE,
  usuario    TEXT        NOT NULL CHECK (usuario = lower(btrim(usuario)) AND usuario <> ''),
  divisao_id UUID        NOT NULL REFERENCES public.setor_divisoes(id) ON DELETE CASCADE,
  empresa_id UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (setor_id, usuario)
);

CREATE INDEX IF NOT EXISTS idx_setor_divisao_recebedores_divisao
  ON public.setor_divisao_recebedores (divisao_id);
CREATE INDEX IF NOT EXISTS idx_setor_divisao_recebedores_empresa
  ON public.setor_divisao_recebedores (empresa_id);

COMMENT ON TABLE public.setor_divisao_recebedores IS
  'Login do relatorio (operador_usuario / perfis.usuario) que recebe sem equipe '
  'e soma numa divisao do setor. Um login, uma divisao por setor. 20261105120500.';

-- ── 4. Coerência: tudo da mesma empresa e do mesmo setor ───────────────────
-- A tela manda só `divisao_id` e o alvo; o gatilho preenche setor e empresa a
-- partir da divisão e recusa equipe de outro setor.

CREATE OR REPLACE FUNCTION public.fn_setor_divisao_coerente()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_setor   UUID;
  v_empresa UUID;
  v_setor_equipe UUID;
BEGIN
  SELECT d.setor_id, d.empresa_id INTO v_setor, v_empresa
    FROM public.setor_divisoes d WHERE d.id = NEW.divisao_id;
  IF v_setor IS NULL THEN
    RAISE EXCEPTION 'Divisão não encontrada';
  END IF;

  NEW.empresa_id := v_empresa;

  IF TG_TABLE_NAME = 'setor_divisao_equipes' THEN
    SELECT e.setor_id INTO v_setor_equipe FROM public.equipes e WHERE e.id = NEW.equipe_id;
    IF v_setor_equipe IS DISTINCT FROM v_setor THEN
      RAISE EXCEPTION 'A equipe não é do setor desta divisão';
    END IF;
  ELSE
    NEW.setor_id := v_setor;
    NEW.usuario  := lower(btrim(NEW.usuario));
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_setor_divisao_equipes_coerente ON public.setor_divisao_equipes;
CREATE TRIGGER trg_setor_divisao_equipes_coerente
  BEFORE INSERT OR UPDATE ON public.setor_divisao_equipes
  FOR EACH ROW EXECUTE FUNCTION public.fn_setor_divisao_coerente();

DROP TRIGGER IF EXISTS trg_setor_divisao_recebedores_coerente ON public.setor_divisao_recebedores;
CREATE TRIGGER trg_setor_divisao_recebedores_coerente
  BEFORE INSERT OR UPDATE ON public.setor_divisao_recebedores
  FOR EACH ROW EXECUTE FUNCTION public.fn_setor_divisao_coerente();

-- ── 5. RLS ─────────────────────────────────────────────────────────────────
-- Ler: a empresa inteira (o Dashboard de todo mundo precisa do recorte).
-- Escrever: a mesma chave de criar e editar setor.

DO $rls$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['setor_divisoes', 'setor_divisao_equipes', 'setor_divisao_recebedores'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING ((SELECT public.fn_can_access_empresa(empresa_id)))',
      t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL '
      'USING ((SELECT public.fn_can_access_empresa(empresa_id)) AND (SELECT public.fn_user_tem(''setores_criar_editar''))) '
      'WITH CHECK ((SELECT public.fn_can_access_empresa(empresa_id)) AND (SELECT public.fn_user_tem(''setores_criar_editar'')))',
      t || '_write', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_super_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING ((SELECT public.fn_user_is_super_admin())) WITH CHECK ((SELECT public.fn_user_is_super_admin()))',
      t || '_super_admin', t);

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END;
$rls$;

-- ── 6. Meta da divisão ─────────────────────────────────────────────────────

ALTER TABLE public.metas DROP CONSTRAINT IF EXISTS metas_tipo_check;
ALTER TABLE public.metas ADD CONSTRAINT metas_tipo_check
  CHECK (tipo = ANY (ARRAY['setor'::text, 'equipe'::text, 'operador'::text, 'divisao'::text]));

COMMIT;

-- ── Conferência (rodar depois, só leitura) ─────────────────────────────────
-- SELECT to_regclass('public.setor_divisoes'),
--        to_regclass('public.setor_divisao_equipes'),
--        to_regclass('public.setor_divisao_recebedores'),
--        pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conname = 'metas_tipo_check';
