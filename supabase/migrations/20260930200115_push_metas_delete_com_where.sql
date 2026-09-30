-- ============================================================================
-- Rodada das metas: DELETE com WHERE — correção de 30/09/2026
-- ============================================================================
--
-- Em produção, a `enviar-push` v5 recebeu de `fn_push_metas_da_rodada`:
--   «DELETE requires a WHERE clause»
-- O Supabase liga o `safeupdate` nas chamadas que chegam pela API (PostgREST):
-- DELETE/UPDATE sem WHERE é recusado, mesmo dentro de função. A rodada apaga
-- TODAS as marcas de verificação de uma vez (`DELETE … RETURNING`), e por isso
-- falhava — as marcas ficavam guardadas e nenhum aviso de meta saía. No
-- Postgres local (sem o safeupdate) o mesmo SQL passava.
--
-- A correção é só o `WHERE TRUE` — o resto da função é idêntico a
-- 20260930195304. Nenhuma linha muda. Na próxima rodada, as marcas guardadas
-- são processadas: como os marcos são por estado, avisa o que foi alcançado
-- desde então, uma vez.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_push_metas_da_rodada()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mes      TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'YYYY-MM');
  v_empresas UUID[];
  v_cfg      public.push_config%ROWTYPE;
  v_equipes  JSONB := '[]'::JSONB;
  v_ops      JSONB := '[]'::JSONB;
BEGIN
  WITH pegas AS (
    DELETE FROM public.push_equipes_verificar WHERE TRUE RETURNING empresa_id, mes
  )
  SELECT ARRAY(SELECT DISTINCT p.empresa_id FROM pegas p WHERE p.mes = v_mes)
    INTO v_empresas;

  SELECT * INTO v_cfg FROM public.push_config WHERE ativo;
  IF NOT FOUND OR COALESCE(array_length(v_empresas, 1), 0) = 0 THEN
    RETURN jsonb_build_object('equipes', v_equipes, 'operadores', v_ops);
  END IF;

  IF v_cfg.avisar_meta_equipe THEN
    WITH
    novas AS (
      INSERT INTO public.push_marcos_equipe (equipe_id, mes, empresa_id, origem)
      SELECT n.equipe_id, v_mes, n.empresa_id, 'avisado'
        FROM public.fn_push_equipes_na_meta(v_empresas, v_mes) n
      ON CONFLICT (equipe_id, mes) DO NOTHING
      RETURNING equipe_id, empresa_id
    ),
    dest AS (
      SELECT d.equipe_id, d.perfil_id
        FROM public.fn_push_destinatarios_equipe('meta_equipe') d
        JOIN novas n ON n.equipe_id = d.equipe_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'equipe_id',     n.equipe_id,
             'equipe_nome',   e.nome,
             'mes',           v_mes,
             'destinatarios', COALESCE((SELECT jsonb_agg(DISTINCT d.perfil_id) FROM dest d
                                         WHERE d.equipe_id = n.equipe_id), '[]'::JSONB)
           )), '[]'::JSONB)
      INTO v_equipes
      FROM novas n
      JOIN public.equipes e ON e.id = n.equipe_id;
  END IF;

  IF v_cfg.avisar_meta_operador THEN
    WITH
    atual AS (
      SELECT * FROM public.fn_push_operadores_na_faixa(v_empresas, v_mes)
    ),
    novas AS (
      INSERT INTO public.push_marcos_operador (perfil_id, mes, faixa, empresa_id, origem)
      SELECT a.perfil_id, v_mes, f.n, a.empresa_id, 'avisado'
        FROM atual a
        CROSS JOIN LATERAL generate_series(1, a.faixa) AS f(n)
      ON CONFLICT (perfil_id, mes, faixa) DO NOTHING
      RETURNING perfil_id, faixa, empresa_id
    ),
    maior AS (
      SELECT n.perfil_id, n.empresa_id, MAX(n.faixa) AS faixa
        FROM novas n
       GROUP BY n.perfil_id, n.empresa_id
    ),
    equipes_op AS (
      SELECT m.perfil_id, x.equipe_id
        FROM maior m
        CROSS JOIN LATERAL (
          SELECT p.equipe_id FROM public.perfis p
           WHERE p.id = m.perfil_id AND p.equipe_id IS NOT NULL
          UNION
          SELECT cl.equipe_id FROM public.equipe_operadores_clones cl
           WHERE cl.operador_id = m.perfil_id AND cl.conta_recebimento IS TRUE
        ) x
    ),
    dest AS (
      SELECT d.equipe_id, d.perfil_id
        FROM public.fn_push_destinatarios_equipe('metas_operadores') d
       WHERE d.equipe_id IN (SELECT eo.equipe_id FROM equipes_op eo)
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'perfil_id', m.perfil_id,
             'nome',      p.nome,
             'mes',       v_mes,
             'faixa',     m.faixa,
             'proprio',   public.fn_push_pode_receber(m.perfil_id, m.empresa_id),
             'equipes',   COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'equipe_id',     eo.equipe_id,
                        'equipe_nome',   e.nome,
                        'destinatarios', COALESCE((SELECT jsonb_agg(DISTINCT d.perfil_id) FROM dest d
                                                    WHERE d.equipe_id = eo.equipe_id
                                                      AND d.perfil_id <> m.perfil_id), '[]'::JSONB)))
                 FROM equipes_op eo
                 JOIN public.equipes e ON e.id = eo.equipe_id
                WHERE eo.perfil_id = m.perfil_id), '[]'::JSONB)
           )), '[]'::JSONB)
      INTO v_ops
      FROM maior m
      JOIN public.perfis p ON p.id = m.perfil_id;
  END IF;

  RETURN jsonb_build_object('equipes', v_equipes, 'operadores', v_ops);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_metas_da_rodada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_metas_da_rodada() TO service_role;
DO $guarda$
BEGIN
  IF position('WHERE TRUE RETURNING empresa_id, mes' IN pg_get_functiondef('public.fn_push_metas_da_rodada()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_push_metas_da_rodada continua com DELETE sem WHERE';
  END IF;
END
$guarda$;

COMMIT;
