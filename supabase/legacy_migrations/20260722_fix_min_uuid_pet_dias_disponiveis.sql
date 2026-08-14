-- ============================================================
-- Fix: fn_pet_dias_disponiveis quebrada — "function min(uuid) does not exist"
-- (2026-07-22)
--
-- Postgres não tem agregado MIN nativo para o tipo uuid. A 20260721c
-- introduziu MIN(c.setor_id) pra achar o setor único do dia, e isso derruba
-- fn_pet_dias_disponiveis (e em cascata fn_pet_recompensa_disponivel, que a
-- chama) com erro 42883. Mesma lógica, só troca MIN(uuid) por
-- MIN(uuid::text)::uuid.
-- ============================================================

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
           -- MIN(uuid) não existe no Postgres: agrega via texto e volta pra uuid.
           CASE WHEN COUNT(DISTINCT c.setor_id) = 1 THEN MIN(c.setor_id::text)::uuid ELSE NULL END AS setor_unico
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
