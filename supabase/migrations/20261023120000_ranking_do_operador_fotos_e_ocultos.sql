-- ============================================================================
-- Ranking do Analítico na visão do operador: as fotos e quem some — 23/10/2026
-- ============================================================================
--
-- O ranking do operador vem de `fn_analitico_resumo_por_operador`, que é
-- SECURITY DEFINER e devolve o NOME de todo mundo do ranking. Duas coisas da
-- tela, porém, eram lidas direto de `perfis`:
--
--   • a foto de cada linha;
--   • quem some do ranking no mês corrente (férias e cargo que não conta no
--     recebimento — `buscarForaDoRanking`).
--
-- A policy `perfis_select` dá ao operador o MAIOR escopo dele entre as abas.
-- Na PaguePlay, na Cantina, na Comercial e no RH esse escopo é 0 (individual):
-- o operador só lê o próprio perfil. Resultado, conferido no banco em 23/10:
-- o ranking dele saía só com iniciais, e líderes e gente de férias apareciam
-- na lista que, na tela do líder, os esconde.
--
-- Esta função devolve SÓ o que o ranking precisa, e só de quem a pessoa já vê
-- no ranking: a foto e um sim/não de «fica fora». Situação e cargo não saem
-- daqui — o operador não precisa saber POR QUE alguém sumiu.
--
-- A guarda é a mesma de `fn_analitico_resumo_por_operador`: quem não pode ver o
-- ranking recebe zero linhas.
--
-- Mês fechado: o «fica fora» do retrato vem de `composicao_mes`, que o operador
-- já lê (mesma empresa). A tela só usa o `fora_do_ranking` daqui no mês corrente.
--
-- Reverter:
--   DROP FUNCTION IF EXISTS public.fn_analitico_ranking_pessoas(uuid, uuid[]);
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_analitico_ranking_pessoas(
  p_empresa_id UUID,
  p_ids        UUID[]
)
RETURNS TABLE (
  id              UUID,
  foto_url        TEXT,
  fora_do_ranking BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('ver_analitico')
     OR NOT public.fn_user_tem('analitico_sub_analitico')
     OR NOT public.fn_user_tem('analitico_sub_ranking') THEN
    RETURN;
  END IF;

  -- O ranking de uma empresa não passa de algumas centenas de pessoas.
  IF coalesce(cardinality(p_ids), 0) = 0 OR cardinality(p_ids) > 1000 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.foto_url,
         -- A mesma regra de `buscarForaDoRanking`: férias, ou cargo que não
         -- conta no recebimento (cargo desconhecido também fica fora).
         (coalesce(p.situacao = 'ferias', false)
          OR (p.perfil IS NOT NULL AND NOT coalesce(c.conta_no_recebimento, false)))
    FROM public.perfis p
    LEFT JOIN public.cargos c ON c.slug = p.perfil
   WHERE p.id = ANY (p_ids)
     AND p.empresa_id = p_empresa_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_analitico_ranking_pessoas(UUID, UUID[]) IS
  'Ranking do Analitico: foto e «fica fora» (ferias ou cargo que nao conta) de quem esta no ranking. Mesma guarda de fn_analitico_resumo_por_operador. Ver 20261023120000.';

REVOKE ALL ON FUNCTION public.fn_analitico_ranking_pessoas(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_ranking_pessoas(UUID, UUID[]) TO authenticated;

COMMIT;
