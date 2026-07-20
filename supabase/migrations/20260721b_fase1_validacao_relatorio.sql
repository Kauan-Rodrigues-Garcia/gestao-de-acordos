-- ============================================================
-- Migration: Fase 1 (validação em duas etapas) — validação de relatório
-- por setor + dia (2026-07-21)
--
-- Contexto: hoje, assim que um relatório (Analítico ou Recebimento diário) é
-- importado, os dados já valem pra tudo — inclusive o pet, que lê direto de
-- diario_recebimentos. Se alguém importar o arquivo errado, a recompensa já
-- é creditada sem checagem nenhuma. Isso adiciona uma segunda validação:
-- só admin/super_admin pode "validar" um setor num mês, e o gate de crédito
-- do pet (próxima migration) só libera moeda para o que já foi validado.
--
-- Granularidade: por DIA, não por mês inteiro — uma correção pontual num dia
-- não derruba a validação do mês inteiro. A UI oferece um botão por mês, que
-- valida (ou revalida) todos os dias daquele mês de uma vez.
-- ============================================================

-- ── diario_recebimentos.setor_id (não existia — só analitico_recebimentos
--    tinha, ver 20260712a) ────────────────────────────────────────────────────

ALTER TABLE public.diario_recebimentos
  ADD COLUMN IF NOT EXISTS setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_diario_recebimentos_setor
  ON public.diario_recebimentos (setor_id)
  WHERE setor_id IS NOT NULL;

-- Backfill: setor do operador dono da linha; órfãos (sem operador) herdam o
-- setor de quem importou — mesmo critério já usado no analítico (20260712a).
UPDATE public.diario_recebimentos d
   SET setor_id = p.setor_id
  FROM public.perfis p
 WHERE d.setor_id IS NULL
   AND d.operador_id = p.id
   AND p.setor_id IS NOT NULL;

UPDATE public.diario_recebimentos d
   SET setor_id = p.setor_id
  FROM public.perfis p
 WHERE d.setor_id IS NULL
   AND d.operador_id IS NULL
   AND d.importado_por_id = p.id
   AND p.setor_id IS NOT NULL;

-- Trigger: preenche setor_id automaticamente em toda importação futura (cobre
-- BookPlay e PaguePlay, os dois fluxos de import, sem precisar mexer no código
-- de cada um). Recalcula se o operador mudar depois (ex.: revinculação de
-- órfão já existente).
CREATE OR REPLACE FUNCTION public.fn_diario_preencher_setor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.setor_id := NULL;
  ELSIF NEW.operador_id IS DISTINCT FROM OLD.operador_id THEN
    NEW.setor_id := NULL;
  END IF;

  IF NEW.setor_id IS NULL THEN
    IF NEW.operador_id IS NOT NULL THEN
      SELECT setor_id INTO NEW.setor_id FROM public.perfis WHERE id = NEW.operador_id;
    END IF;
    IF NEW.setor_id IS NULL AND NEW.importado_por_id IS NOT NULL THEN
      SELECT setor_id INTO NEW.setor_id FROM public.perfis WHERE id = NEW.importado_por_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_diario_preencher_setor ON public.diario_recebimentos;
CREATE TRIGGER trg_diario_preencher_setor
  BEFORE INSERT OR UPDATE ON public.diario_recebimentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_diario_preencher_setor();

-- ── Tabela: watermark de validação por setor/origem/dia ──────────────────────

CREATE TABLE IF NOT EXISTS public.relatorio_validacoes_dia (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id                UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  origem                  TEXT NOT NULL CHECK (origem IN ('analitico','diario')),
  dia_referencia          DATE NOT NULL,
  valor_validado          NUMERIC(12,2) NOT NULL DEFAULT 0,
  qtd_registros_validados INTEGER NOT NULL DEFAULT 0,
  validado_por            UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  validado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, setor_id, origem, dia_referencia)
);

ALTER TABLE public.relatorio_validacoes_dia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "relatorio_validacoes_select" ON public.relatorio_validacoes_dia;
CREATE POLICY "relatorio_validacoes_select" ON public.relatorio_validacoes_dia
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

-- ── RPC: status por origem (pra UI mostrar Pendente/Parcial/Validado) ────────
-- "setor dono" do analítico: setor_id da própria linha (BookPlay carimba na
-- importação, ver 20260712a) OU, se ausente (PaguePlay não carimba), o setor
-- do perfil do operador. Diário já vem com setor_id resolvido (trigger acima).

CREATE OR REPLACE FUNCTION public.fn_relatorio_status_validacao(
  p_empresa_id UUID, p_setor_id UUID, p_mes INTEGER, p_ano INTEGER
) RETURNS TABLE(
  origem TEXT, dias_com_dado INTEGER, dias_validados INTEGER,
  valor_atual NUMERIC, valor_validado NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio DATE := make_date(p_ano, p_mes, 1);
  v_fim    DATE := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;

  RETURN QUERY
  WITH atual_analitico AS (
    SELECT ar.data_pagamento AS dia, SUM(ar.valor_recebido) AS total
    FROM public.analitico_recebimentos ar
    LEFT JOIN public.perfis p ON p.id = ar.operador_id
    WHERE ar.empresa_id = p_empresa_id
      AND COALESCE(ar.setor_id, p.setor_id) = p_setor_id
      AND ar.data_pagamento BETWEEN v_inicio AND v_fim
    GROUP BY ar.data_pagamento
  ),
  valid_analitico AS (
    SELECT dia_referencia AS dia, valor_validado AS total
    FROM public.relatorio_validacoes_dia
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id AND origem = 'analitico'
      AND dia_referencia BETWEEN v_inicio AND v_fim
  ),
  atual_diario AS (
    SELECT dia_referencia AS dia, SUM(valor_recebido) AS total
    FROM public.diario_recebimentos
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id
      AND dia_referencia BETWEEN v_inicio AND v_fim
    GROUP BY dia_referencia
  ),
  valid_diario AS (
    SELECT dia_referencia AS dia, valor_validado AS total
    FROM public.relatorio_validacoes_dia
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id AND origem = 'diario'
      AND dia_referencia BETWEEN v_inicio AND v_fim
  )
  SELECT 'analitico'::TEXT,
         (SELECT COUNT(*) FROM atual_analitico)::INTEGER,
         (SELECT COUNT(*) FROM atual_analitico a JOIN valid_analitico v ON v.dia = a.dia AND v.total = a.total)::INTEGER,
         (SELECT COALESCE(SUM(total), 0) FROM atual_analitico),
         (SELECT COALESCE(SUM(total), 0) FROM valid_analitico)
  UNION ALL
  SELECT 'diario'::TEXT,
         (SELECT COUNT(*) FROM atual_diario)::INTEGER,
         (SELECT COUNT(*) FROM atual_diario a JOIN valid_diario v ON v.dia = a.dia AND v.total = a.total)::INTEGER,
         (SELECT COALESCE(SUM(total), 0) FROM atual_diario),
         (SELECT COALESCE(SUM(total), 0) FROM valid_diario);
END;
$$;

-- ── RPC: validar (padrão = as duas origens; p_origem força só uma) ──────────

CREATE OR REPLACE FUNCTION public.fn_relatorio_validar_setor(
  p_empresa_id UUID, p_setor_id UUID, p_mes INTEGER, p_ano INTEGER, p_origem TEXT DEFAULT NULL
) RETURNS TABLE(ok BOOLEAN, erro TEXT, dias_validados INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_inicio  DATE := make_date(p_ano, p_mes, 1);
  v_fim     DATE := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_count_a INTEGER := 0;
  v_count_d INTEGER := 0;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN QUERY SELECT false, 'sem_permissao'::TEXT, 0; RETURN;
  END IF;
  IF p_origem IS NOT NULL AND p_origem NOT IN ('analitico','diario') THEN
    RETURN QUERY SELECT false, 'origem_invalida'::TEXT, 0; RETURN;
  END IF;

  IF p_origem IS NULL OR p_origem = 'analitico' THEN
    INSERT INTO public.relatorio_validacoes_dia
      (empresa_id, setor_id, origem, dia_referencia, valor_validado, qtd_registros_validados, validado_por, validado_em)
    SELECT p_empresa_id, p_setor_id, 'analitico', ar.data_pagamento,
           SUM(ar.valor_recebido), COUNT(*), v_uid, NOW()
    FROM public.analitico_recebimentos ar
    LEFT JOIN public.perfis p ON p.id = ar.operador_id
    WHERE ar.empresa_id = p_empresa_id
      AND COALESCE(ar.setor_id, p.setor_id) = p_setor_id
      AND ar.data_pagamento BETWEEN v_inicio AND v_fim
    GROUP BY ar.data_pagamento
    ON CONFLICT (empresa_id, setor_id, origem, dia_referencia) DO UPDATE
      SET valor_validado           = EXCLUDED.valor_validado,
          qtd_registros_validados  = EXCLUDED.qtd_registros_validados,
          validado_por             = EXCLUDED.validado_por,
          validado_em              = NOW();
    GET DIAGNOSTICS v_count_a = ROW_COUNT;
  END IF;

  IF p_origem IS NULL OR p_origem = 'diario' THEN
    INSERT INTO public.relatorio_validacoes_dia
      (empresa_id, setor_id, origem, dia_referencia, valor_validado, qtd_registros_validados, validado_por, validado_em)
    SELECT p_empresa_id, p_setor_id, 'diario', d.dia_referencia,
           SUM(d.valor_recebido), COUNT(*), v_uid, NOW()
    FROM public.diario_recebimentos d
    WHERE d.empresa_id = p_empresa_id AND d.setor_id = p_setor_id
      AND d.dia_referencia BETWEEN v_inicio AND v_fim
    GROUP BY d.dia_referencia
    ON CONFLICT (empresa_id, setor_id, origem, dia_referencia) DO UPDATE
      SET valor_validado           = EXCLUDED.valor_validado,
          qtd_registros_validados  = EXCLUDED.qtd_registros_validados,
          validado_por             = EXCLUDED.validado_por,
          validado_em              = NOW();
    GET DIAGNOSTICS v_count_d = ROW_COUNT;
  END IF;

  INSERT INTO public.logs_sistema (usuario_id, empresa_id, acao, tabela, registro_id, detalhes)
  VALUES (v_uid, p_empresa_id, 'RELATORIO_VALIDADO', 'relatorio_validacoes_dia', p_setor_id::TEXT,
          jsonb_build_object('setor_id', p_setor_id, 'mes', p_mes, 'ano', p_ano, 'origem', COALESCE(p_origem, 'ambas')));

  RETURN QUERY SELECT true, NULL::TEXT, v_count_a + v_count_d;
END;
$$;

-- ── RPC: reabrir (remove watermarks — motivo obrigatório, snapshot no log) ───

CREATE OR REPLACE FUNCTION public.fn_relatorio_reabrir_setor(
  p_empresa_id UUID, p_setor_id UUID, p_mes INTEGER, p_ano INTEGER, p_motivo TEXT, p_origem TEXT DEFAULT NULL
) RETURNS TABLE(ok BOOLEAN, erro TEXT, dias_removidos INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_inicio   DATE := make_date(p_ano, p_mes, 1);
  v_fim      DATE := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_snapshot JSONB;
  v_count    INTEGER;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN QUERY SELECT false, 'sem_permissao'::TEXT, 0; RETURN;
  END IF;
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RETURN QUERY SELECT false, 'motivo_obrigatorio'::TEXT, 0; RETURN;
  END IF;

  SELECT jsonb_agg(to_jsonb(t)) INTO v_snapshot
  FROM (
    SELECT origem, dia_referencia, valor_validado, qtd_registros_validados
    FROM public.relatorio_validacoes_dia
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id
      AND dia_referencia BETWEEN v_inicio AND v_fim
      AND (p_origem IS NULL OR origem = p_origem)
  ) t;

  DELETE FROM public.relatorio_validacoes_dia
  WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id
    AND dia_referencia BETWEEN v_inicio AND v_fim
    AND (p_origem IS NULL OR origem = p_origem);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.logs_sistema (usuario_id, empresa_id, acao, tabela, registro_id, detalhes)
  VALUES (v_uid, p_empresa_id, 'RELATORIO_REABERTO', 'relatorio_validacoes_dia', p_setor_id::TEXT,
          jsonb_build_object('setor_id', p_setor_id, 'mes', p_mes, 'ano', p_ano, 'origem', COALESCE(p_origem, 'ambas'),
                              'motivo', p_motivo, 'watermarks_removidos', COALESCE(v_snapshot, '[]'::jsonb)));

  RETURN QUERY SELECT true, NULL::TEXT, v_count;
END;
$$;
