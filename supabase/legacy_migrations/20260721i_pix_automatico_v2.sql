-- ═══════════════════════════════════════════════════════════════════════════
-- PIX AUTOMÁTICO v2 (BookPlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Interruptor por setor: líder+ ativa/desativa o registro MANUAL de
--    acordos pelos operadores (desligado, operador só visualiza).
-- 2. Registro histórico de NR: cada NR que entra no Pix automático é único
--    por empresa e fica registrado para sempre (status, quem validou/recusou
--    e quando) — base para lógica futura. Mantido por TRIGGERS na tabela de
--    acordos: nenhum caminho do cliente consegue esquecer de gravar.
-- 3. Insert por líder+: pode registrar acordo VINCULADO a outro operador
--    (a policy antiga exigia operador_id = auth.uid() para todo mundo, o que
--    também quebrava a importação de planilha com coluna Operador).
--
-- Unicidade do NR (regra de negócio):
--   • NR com registro 'pendente' ou 'validado' → novo insert é BLOQUEADO
--   • NR 'recusado' → pode ser registrado de novo (recusa costuma ser
--     correção); o registro volta a 'pendente' apontando o novo acordo
--   • excluir um acordo ainda pendente apaga o registro (limpeza de engano);
--     validado/recusado fica para sempre (histórico)

-- ─── 1. Interruptor por setor ────────────────────────────────────────────────
ALTER TABLE public.pix_automatico_config
  ADD COLUMN IF NOT EXISTS permite_registro_operador BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── 2. Registro histórico de NR ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pix_automatico_nr_registro (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- NR normalizado (trim + minúsculas): chave de unicidade por empresa
  nr_normalizado    TEXT NOT NULL,
  -- NR como foi digitado (última grafia)
  nr_cliente        TEXT NOT NULL,
  -- último acordo ligado a este NR (histórico sobrevive à exclusão do acordo)
  acordo_id         UUID REFERENCES public.pix_automatico_acordos(id) ON DELETE SET NULL,
  operador_id       UUID,
  operador_nome     TEXT,
  status            TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente', 'validado', 'recusado')),
  avaliado_por      UUID,
  avaliado_por_nome TEXT,
  avaliado_em       TIMESTAMPTZ,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, nr_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_pix_nr_reg_empresa ON public.pix_automatico_nr_registro(empresa_id, status);

ALTER TABLE public.pix_automatico_nr_registro ENABLE ROW LEVEL SECURITY;

-- Leitura por todos da empresa (o formulário e a importação checam duplicado
-- antes de inserir); escrita SÓ pelos triggers (SECURITY DEFINER — nenhuma
-- policy de INSERT/UPDATE/DELETE para o cliente).
DROP POLICY IF EXISTS "pix_nr_reg_select" ON public.pix_automatico_nr_registro;
CREATE POLICY "pix_nr_reg_select" ON public.pix_automatico_nr_registro
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

-- ─── 3. Triggers de sincronização ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pix_nr_normalizar(p_nr TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS
$$ SELECT lower(trim(p_nr)) $$;

-- BEFORE INSERT: bloqueia NR que já tem registro pendente/validado
CREATE OR REPLACE FUNCTION public.fn_pix_nr_bloqueia_duplicado()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status TEXT;
BEGIN
  SELECT r.status INTO v_status
    FROM public.pix_automatico_nr_registro r
   WHERE r.empresa_id = NEW.empresa_id
     AND r.nr_normalizado = public.fn_pix_nr_normalizar(NEW.nr_cliente);
  IF v_status IN ('pendente', 'validado') THEN
    RAISE EXCEPTION 'NR % já registrado no Pix automático (status: %)', NEW.nr_cliente, v_status
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- AFTER INSERT: cria/reaproveita o registro do NR (recusado volta a pendente)
CREATE OR REPLACE FUNCTION public.fn_pix_nr_apos_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.pix_automatico_nr_registro
    (empresa_id, nr_normalizado, nr_cliente, acordo_id, operador_id, operador_nome, status)
  VALUES
    (NEW.empresa_id, public.fn_pix_nr_normalizar(NEW.nr_cliente), NEW.nr_cliente,
     NEW.id, NEW.operador_id, NEW.operador_nome, 'pendente')
  ON CONFLICT (empresa_id, nr_normalizado) DO UPDATE SET
    nr_cliente        = EXCLUDED.nr_cliente,
    acordo_id         = EXCLUDED.acordo_id,
    operador_id       = EXCLUDED.operador_id,
    operador_nome     = EXCLUDED.operador_nome,
    status            = 'pendente',
    avaliado_por      = NULL,
    avaliado_por_nome = NULL,
    avaliado_em       = NULL,
    atualizado_em     = NOW();
  RETURN NEW;
END;
$$;

-- AFTER UPDATE: espelha avaliação (aprovado→validado, desaprovado→recusado)
CREATE OR REPLACE FUNCTION public.fn_pix_nr_apos_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.pix_automatico_nr_registro r SET
    status            = CASE NEW.status
                          WHEN 'aprovado'    THEN 'validado'
                          WHEN 'desaprovado' THEN 'recusado'
                          ELSE 'pendente'
                        END,
    avaliado_por      = NEW.avaliado_por,
    avaliado_por_nome = NEW.avaliado_por_nome,
    avaliado_em       = NEW.avaliado_em,
    atualizado_em     = NOW()
  WHERE r.empresa_id = NEW.empresa_id
    AND r.nr_normalizado = public.fn_pix_nr_normalizar(NEW.nr_cliente)
    AND (r.acordo_id = NEW.id OR r.acordo_id IS NULL);
  RETURN NEW;
END;
$$;

-- AFTER DELETE: acordo ainda pendente apagado → registro sai junto (engano);
-- validado/recusado permanece como histórico
CREATE OR REPLACE FUNCTION public.fn_pix_nr_apos_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.pix_automatico_nr_registro r
  WHERE r.empresa_id = OLD.empresa_id
    AND r.nr_normalizado = public.fn_pix_nr_normalizar(OLD.nr_cliente)
    AND r.acordo_id = OLD.id
    AND r.status = 'pendente';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_pix_nr_bloqueia ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_nr_bloqueia
  BEFORE INSERT ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_nr_bloqueia_duplicado();

DROP TRIGGER IF EXISTS trg_pix_nr_insert ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_nr_insert
  AFTER INSERT ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_nr_apos_insert();

DROP TRIGGER IF EXISTS trg_pix_nr_update ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_nr_update
  AFTER UPDATE OF status ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_nr_apos_update();

DROP TRIGGER IF EXISTS trg_pix_nr_delete ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_nr_delete
  AFTER DELETE ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_nr_apos_delete();

-- ─── 4. Backfill do registro com os acordos existentes ───────────────────────
-- Uma linha por NR (a mais recente define o estado). Duplicados antigos do
-- mesmo NR continuam existindo em pix_automatico_acordos; só novos inserts
-- passam a ser bloqueados.
INSERT INTO public.pix_automatico_nr_registro
  (empresa_id, nr_normalizado, nr_cliente, acordo_id, operador_id, operador_nome,
   status, avaliado_por, avaliado_por_nome, avaliado_em, criado_em)
SELECT DISTINCT ON (a.empresa_id, public.fn_pix_nr_normalizar(a.nr_cliente))
  a.empresa_id,
  public.fn_pix_nr_normalizar(a.nr_cliente),
  a.nr_cliente,
  a.id,
  a.operador_id,
  a.operador_nome,
  CASE a.status
    WHEN 'aprovado'    THEN 'validado'
    WHEN 'desaprovado' THEN 'recusado'
    ELSE 'pendente'
  END,
  a.avaliado_por,
  a.avaliado_por_nome,
  a.avaliado_em,
  a.criado_em
FROM public.pix_automatico_acordos a
ORDER BY a.empresa_id, public.fn_pix_nr_normalizar(a.nr_cliente), a.criado_em DESC
ON CONFLICT (empresa_id, nr_normalizado) DO NOTHING;

-- ─── 5. Insert: líder+ vincula a outro operador; operador respeita o toggle ──
DROP POLICY IF EXISTS "pix_auto_insert" ON public.pix_automatico_acordos;
CREATE POLICY "pix_auto_insert" ON public.pix_automatico_acordos
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND status = 'pendente'
    AND (
      -- líder+ registra em nome de qualquer operador da empresa
      public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin'])
      OR (
        -- operador: em nome próprio e só com o registro manual LIGADO no setor
        operador_id = auth.uid()
        AND COALESCE((
          SELECT c.permite_registro_operador
            FROM public.pix_automatico_config c
           WHERE c.empresa_id = pix_automatico_acordos.empresa_id
             AND c.setor_id   = pix_automatico_acordos.setor_id
        ), TRUE)
      )
    )
  );
