-- ============================================================================
-- 20261006150000_ranking_quitacao_top10.sql
--
-- Ranking de quitação: o top 10 aparece, e o prêmio continua só até o 6º
-- (pedido de 06/10/2026). Do 7º ao 10º a tela mostra quanto falta para passar
-- quem está logo acima — com os valores do top 10 à vista, é conta da tela.
--
-- Quem está abaixo do 10º vê, só para si, quanto falta para passar quem está
-- logo acima dele (`eu.acima_*`). O nome desse vizinho só vai quando ele está
-- no top 10 (já à vista); fora dele vai só a posição e o valor, para o ranking
-- não expor nome de quem não aparece na lista.
--
-- Só redefine `fn_ranking_quitacao` (mesma assinatura, mesmos grants). Nenhuma
-- tabela, nenhum dado.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao(p_empresa_id UUID, p_setor_id UUID, p_mes DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mes     DATE := date_trunc('month', p_mes)::DATE;
  v_premios NUMERIC(12,2)[];
  v_out     JSONB;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('analitico_sub_ranking_quitacao')) THEN
    RAISE EXCEPTION 'Sem permissao para ver o Ranking de quitacao.' USING ERRCODE = '42501';
  END IF;

  SELECT s.premios INTO v_premios
    FROM public.ranking_quitacao_setores s
   WHERE s.empresa_id = p_empresa_id AND s.setor_id = p_setor_id AND s.ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('habilitado', false);
  END IF;

  WITH por_operador AS (
    SELECT a.operador_id,
           COUNT(*)::INTEGER   AS quitacoes,
           SUM(a.valor_acordo) AS valor
      FROM public.ranking_quitacao_acordos a
      JOIN public.perfis p        ON p.id = a.operador_id
      LEFT JOIN public.equipes e  ON e.id = p.equipe_id
     WHERE a.empresa_id = p_empresa_id
       AND a.mes = v_mes
       AND COALESCE(e.setor_id, p.setor_id) = p_setor_id
     GROUP BY a.operador_id
  ),
  ordenado AS (
    SELECT po.operador_id, po.quitacoes, po.valor, p.nome, p.foto_url,
           ROW_NUMBER() OVER (ORDER BY po.valor DESC, po.quitacoes DESC, p.nome) AS posicao
      FROM por_operador po
      JOIN public.perfis p ON p.id = po.operador_id
  ),
  eu AS (
    SELECT o.posicao, o.quitacoes, o.valor
      FROM ordenado o WHERE o.operador_id = (SELECT auth.uid())
  )
  SELECT jsonb_build_object(
    'habilitado',    true,
    'premios',       to_jsonb(v_premios),
    'participantes', (SELECT COUNT(*) FROM ordenado),
    'importado_em',  (SELECT MAX(a.importado_em) FROM public.ranking_quitacao_acordos a
                       WHERE a.empresa_id = p_empresa_id AND a.mes = v_mes),
    'posicoes',      COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                                'posicao', o.posicao, 'operador_id', o.operador_id, 'nome', o.nome,
                                'foto_url', o.foto_url, 'quitacoes', o.quitacoes, 'valor', o.valor)
                              ORDER BY o.posicao)
                         FROM ordenado o WHERE o.posicao <= 10), '[]'::JSONB),
    -- Quem está olhando, e quem está logo acima dele (nome só se estiver no top 10).
    'eu',            (SELECT jsonb_build_object(
                               'posicao', eu.posicao, 'quitacoes', eu.quitacoes, 'valor', eu.valor,
                               'acima_posicao', ac.posicao, 'acima_valor', ac.valor,
                               'acima_nome', CASE WHEN ac.posicao <= 10 THEN ac.nome END)
                        FROM eu
                        LEFT JOIN ordenado ac ON ac.posicao = eu.posicao - 1)
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public.fn_ranking_quitacao(UUID, UUID, DATE) IS
  'O top 10 de quitacao (por valor, desempate por quantidade) no setor e mes, com os '
  'premios do setor (ate o 6o) e, para quem olha, quem esta logo acima. 20261006150000.';

DO $prova$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.fn_ranking_quitacao(uuid,uuid,date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_ranking_quitacao(uuid,uuid,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Os grants de fn_ranking_quitacao mudaram.';
  END IF;
END
$prova$;

COMMIT;
