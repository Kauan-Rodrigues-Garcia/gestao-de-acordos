-- ============================================================
-- Migration: Fase 1 (validação em duas etapas) — gate no crédito do pet
-- (2026-07-21)
--
-- Mudança cirúrgica: fn_pet_dias_disponiveis passa a capar o recebimento do
-- dia pelo watermark validado daquele setor-dia (relatorio_validacoes_dia,
-- origem 'diario'). Recebimento de setor ainda não validado simplesmente não
-- conta como disponível — sem erro, sem trava visível pro operador. O resto
-- do pipeline (fn_pet_resgatar_recompensa, o watermark de "já resgatado" em
-- pet_recompensas) não muda de lógica, só passa a receber o valor já capado.
--
-- Sem estorno automático (decisão registrada no plano de gamificação):
-- correção pra baixo depois de validado nunca reverte moeda já creditada —
-- só fica visível no relatório de discrepância (fn_pet_discrepancias_validacao)
-- pro admin decidir manualmente via fn_pet_admin_ajustar_moedas.
-- ============================================================

-- ── Rastreabilidade: de qual setor/validação veio a moeda ────────────────────

ALTER TABLE public.pet_recompensas
  ADD COLUMN IF NOT EXISTS setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL;
ALTER TABLE public.pet_recompensas
  ADD COLUMN IF NOT EXISTS valor_validado_no_momento NUMERIC(12,2);

-- ── fn_pet_dias_disponiveis: agora capado por watermark, por setor-dia ──────

CREATE OR REPLACE FUNCTION public.fn_pet_dias_disponiveis()
RETURNS TABLE(dia DATE, total_dia NUMERIC, ja_resgatado NUMERIC, delta NUMERIC, setor_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_cargo  TEXT;
  v_base   TEXT;
  v_janela INTEGER;
  v_ativo  BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT p.perfil::text INTO v_cargo FROM public.perfis p WHERE p.id = v_uid;

  SELECT r.base_recebimento, r.janela_dias, r.ativo
    INTO v_base, v_janela, v_ativo
    FROM public.pet_economia_regras r
    WHERE r.cargo = v_cargo;

  IF NOT COALESCE(v_ativo, false) THEN RETURN; END IF;

  RETURN QUERY
  WITH receb AS (
    SELECT d.dia_referencia AS dia, d.setor_id AS setor_id, SUM(d.valor_recebido) AS total_setor_dia
    FROM public.diario_recebimentos d
    WHERE d.dia_referencia >= (CURRENT_DATE - (COALESCE(v_janela, 7) - 1))
      AND (d.prox_contato IS NULL OR d.prox_contato > CURRENT_DATE)
      AND (
        (v_base = 'proprio' AND d.operador_id = v_uid)
        OR (v_base = 'empresa' AND public.fn_can_access_empresa(d.empresa_id))
      )
    GROUP BY d.dia_referencia, d.setor_id
  ),
  capado AS (
    SELECT r.dia, r.setor_id,
           LEAST(r.total_setor_dia, COALESCE(v.valor_validado, 0)) AS valor_liberado
    FROM receb r
    LEFT JOIN public.relatorio_validacoes_dia v
      ON v.origem = 'diario' AND v.dia_referencia = r.dia AND v.setor_id = r.setor_id
  ),
  por_dia AS (
    SELECT c.dia,
           SUM(c.valor_liberado) AS total_dia,
           -- Só marca um setor "dono" quando o dia inteiro veio de um único
           -- setor (o caso normal de base 'proprio'). Base 'empresa' pode
           -- somar vários setores no mesmo dia — aí fica sem dono único.
           CASE WHEN COUNT(DISTINCT c.setor_id) = 1 THEN MIN(c.setor_id) ELSE NULL END AS setor_unico
    FROM capado c
    GROUP BY c.dia
  )
  SELECT pd.dia,
         pd.total_dia,
         COALESCE(pr.valor_resgatado, 0),
         GREATEST(pd.total_dia - COALESCE(pr.valor_resgatado, 0), 0),
         pd.setor_unico
  FROM por_dia pd
  LEFT JOIN public.pet_recompensas pr
    ON pr.usuario_id = v_uid AND pr.dia_referencia = pd.dia;
END;
$$;

-- ── fn_pet_resgatar_recompensa: grava setor_id + valor_validado_no_momento ──

CREATE OR REPLACE FUNCTION public.fn_pet_resgatar_recompensa()
RETURNS TABLE(moedas_creditadas INTEGER, valor_base NUMERIC, moedas_total INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID    := auth.uid();
  v_taxa   NUMERIC := public.fn_pet_taxa();
  v_valor  NUMERIC := 0;
  v_moedas INTEGER := 0;
  rec      RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 0, 0::NUMERIC, 0; RETURN;
  END IF;

  INSERT INTO public.pet_estado (usuario_id) VALUES (v_uid)
    ON CONFLICT (usuario_id) DO NOTHING;

  FOR rec IN SELECT * FROM public.fn_pet_dias_disponiveis() WHERE delta > 0 LOOP
    v_valor := v_valor + rec.delta;
    INSERT INTO public.pet_recompensas
      (usuario_id, dia_referencia, valor_resgatado, moedas_creditadas, setor_id, valor_validado_no_momento)
      VALUES (v_uid, rec.dia, rec.total_dia, FLOOR(rec.delta * v_taxa)::INTEGER, rec.setor_id, rec.total_dia)
    ON CONFLICT (usuario_id, dia_referencia) DO UPDATE
      SET valor_resgatado           = EXCLUDED.valor_resgatado,
          moedas_creditadas         = public.pet_recompensas.moedas_creditadas + EXCLUDED.moedas_creditadas,
          setor_id                  = EXCLUDED.setor_id,
          valor_validado_no_momento = EXCLUDED.valor_validado_no_momento,
          atualizado_em             = NOW();
  END LOOP;

  v_moedas := FLOOR(v_valor * v_taxa)::INTEGER;

  IF v_moedas > 0 THEN
    UPDATE public.pet_estado
      SET moedas              = moedas + v_moedas,
          moedas_ganhas_total = moedas_ganhas_total + v_moedas,
          xp                  = xp + v_moedas,
          ultimo_dia_ativo    = CURRENT_DATE,
          atualizado_em       = NOW()
      WHERE usuario_id = v_uid;
  END IF;

  RETURN QUERY
    SELECT v_moedas, v_valor,
           (SELECT moedas FROM public.pet_estado WHERE usuario_id = v_uid);
END;
$$;

-- ── fn_pet_admin_ajustar_moedas: motivo agora obrigatório + log em logs_sistema
-- (antes não deixava rastro nenhum de por que o saldo mudou) ─────────────────

CREATE OR REPLACE FUNCTION public.fn_pet_admin_ajustar_moedas(p_usuario UUID, p_delta INTEGER, p_motivo TEXT)
RETURNS TABLE(ok BOOLEAN, moedas_total INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_saldo   INTEGER;
  v_empresa UUID;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR p_usuario IS NULL OR p_delta IS NULL OR p_delta = 0
     OR p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RETURN QUERY SELECT false, 0; RETURN;
  END IF;

  INSERT INTO public.pet_estado (usuario_id) VALUES (p_usuario)
    ON CONFLICT (usuario_id) DO NOTHING;

  SELECT moedas INTO v_saldo FROM public.pet_estado WHERE usuario_id = p_usuario FOR UPDATE;

  IF v_saldo + p_delta < 0 THEN
    RETURN QUERY SELECT false, v_saldo; RETURN;
  END IF;

  UPDATE public.pet_estado
    SET moedas              = moedas + p_delta,
        moedas_ganhas_total = moedas_ganhas_total + GREATEST(p_delta, 0),
        moedas_gastas_total = moedas_gastas_total + GREATEST(-p_delta, 0),
        atualizado_em       = NOW()
    WHERE usuario_id = p_usuario
    RETURNING moedas INTO v_saldo;

  SELECT empresa_id INTO v_empresa FROM public.perfis WHERE id = p_usuario;

  INSERT INTO public.logs_sistema (usuario_id, empresa_id, acao, tabela, registro_id, detalhes)
  VALUES (v_uid, v_empresa, 'PET_AJUSTE_MANUAL', 'pet_estado', p_usuario::TEXT,
          jsonb_build_object('usuario_alvo', p_usuario, 'delta', p_delta, 'motivo', p_motivo, 'saldo_resultante', v_saldo));

  RETURN QUERY SELECT true, v_saldo;
END;
$$;

-- ── RPC de diagnóstico: onde o valor validado ficou MAIOR que o atual ────────
-- (dado encolheu depois de validado) — sustenta a decisão de "sem estorno
-- automático": o admin vê e decide manualmente via fn_pet_admin_ajustar_moedas.

CREATE OR REPLACE FUNCTION public.fn_pet_discrepancias_validacao(
  p_empresa_id UUID, p_mes INTEGER, p_ano INTEGER
) RETURNS TABLE(
  setor_id UUID, setor_nome TEXT, dia_referencia DATE,
  valor_validado NUMERIC, valor_atual NUMERIC, diferenca NUMERIC,
  usuario_id UUID, usuario_nome TEXT, moedas_creditadas INTEGER
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
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN RETURN; END IF;
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;

  RETURN QUERY
  WITH atual AS (
    SELECT setor_id, dia_referencia AS dia, SUM(valor_recebido) AS total
    FROM public.diario_recebimentos
    WHERE empresa_id = p_empresa_id AND dia_referencia BETWEEN v_inicio AND v_fim
    GROUP BY setor_id, dia_referencia
  ),
  encolhidos AS (
    SELECT v.setor_id, v.dia_referencia AS dia, v.valor_validado,
           COALESCE(a.total, 0) AS valor_atual
    FROM public.relatorio_validacoes_dia v
    LEFT JOIN atual a ON a.setor_id = v.setor_id AND a.dia = v.dia_referencia
    WHERE v.empresa_id = p_empresa_id AND v.origem = 'diario'
      AND v.dia_referencia BETWEEN v_inicio AND v_fim
      AND v.valor_validado > COALESCE(a.total, 0)
  )
  SELECT e.setor_id, s.nome, e.dia, e.valor_validado, e.valor_atual,
         e.valor_validado - e.valor_atual,
         pr.usuario_id, p.nome, pr.moedas_creditadas
  FROM encolhidos e
  JOIN public.setores s ON s.id = e.setor_id
  LEFT JOIN public.pet_recompensas pr ON pr.setor_id = e.setor_id AND pr.dia_referencia = e.dia
  LEFT JOIN public.perfis p ON p.id = pr.usuario_id
  ORDER BY e.dia, s.nome;
END;
$$;
