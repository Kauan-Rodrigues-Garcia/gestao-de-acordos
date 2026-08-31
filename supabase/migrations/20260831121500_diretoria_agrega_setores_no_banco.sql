-- O Painel da Diretoria agregava no navegador: `useSetoresExtras` baixava TODO
-- acordo do mes (e do mes anterior) e somava em JavaScript.
--
-- Dois problemas, sendo o primeiro grave:
--
-- 1. `.select()` sem paginacao e sem `order` — o PostgREST corta em 1000 linhas
--    por padrao. Passando disso, agendado, recebido, nao pago, "pendente",
--    conversao e composicao por tipo saiam todos de uma FATIA ARBITRARIA do
--    mes. Foi o que zerou o card "Pendente" enquanto o agendado continuava
--    mostrando numero: nenhum `verificar_pendente` caiu nas 1000 linhas que
--    vieram. Nao ha erro na tela quando isso acontece — o painel mente calado.
--
-- 2. Custo. Milhares de linhas trafegadas e percorridas em JS a cada abertura,
--    para produzir algumas dezenas de numeros.
--
-- Aqui o banco devolve o agregado pronto: uma linha por setor. O `LEFT JOIN`
-- mantem setor sem acordo na lista (o painel ja os mostrava, com zeros), e a
-- linha de `setor_id NULL` recolhe os acordos sem setor — que ate agora sumiam
-- do painel, porque o filtro por `setor_id` no cliente os descartava calado.
--
-- Escopo: `fn_user_escopo('painel_diretoria')`, a mesma chave que as permissoes
-- `painel_diretoria_escopo_setor` e `_todos_setores` alimentam. Recebido aqui e
-- o TABULADO; quando o relatorio analitico existe, o painel continua trocando
-- pelo numero do relatorio, como ja fazia.

CREATE OR REPLACE FUNCTION public.fn_diretoria_setores_do_mes(
  p_empresa_id UUID,
  p_mes TEXT
)
RETURNS TABLE(
  setor_id       UUID,
  setor_nome     TEXT,
  total_agendado NUMERIC,
  total_recebido NUMERIC,
  total_nao_pago NUMERIC,
  total_restante NUMERIC,
  total_acordos  BIGINT,
  qtd_restante   BIGINT,
  por_tipo       JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_escopo  INTEGER;
  v_setor   UUID;
  v_inicio  DATE;
  v_fim     DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('ver_painel_diretoria') THEN
    RETURN;
  END IF;

  v_escopo := public.fn_user_escopo('painel_diretoria');
  -- -1 e "aba fechada ou sem nivel nenhum", e 0/1 nao existem para esta aba:
  -- o catalogo so oferece `_escopo_setor` (2) e `_escopo_todos_setores` (3).
  -- Sem nivel, nao ve nada — e nao cai no ramo de setor por acidente.
  IF v_escopo < 2 THEN
    RETURN;
  END IF;

  SELECT p.setor_id INTO v_setor FROM public.perfis p WHERE p.id = auth.uid();
  IF v_escopo = 2 AND v_setor IS NULL THEN
    RETURN;
  END IF;

  v_inicio := (p_mes || '-01')::DATE;
  v_fim    := (v_inicio + INTERVAL '1 month')::DATE;

  RETURN QUERY
  WITH acordos_mes AS (
    SELECT a.setor_id AS sid, a.status, a.tipo, a.valor
      FROM public.acordos a
     WHERE a.empresa_id = p_empresa_id
       AND a.tipo_vinculo IS DISTINCT FROM 'extra'
       AND a.vencimento >= v_inicio
       AND a.vencimento <  v_fim
       AND (v_escopo >= 3 OR a.setor_id = v_setor)
  ),
  -- Duas passadas rasas em vez de uma subconsulta correlacionada por setor:
  -- aquela forma re-varria o mes inteiro uma vez para cada setor.
  por_tipo_raw AS (
    SELECT am.sid,
           COALESCE(am.tipo, 'sem_tipo') AS tipo,
           COALESCE(SUM(am.valor), 0)::NUMERIC AS agendado,
           COALESCE(SUM(am.valor) FILTER (WHERE am.status = 'pago'), 0)::NUMERIC AS recebido,
           COUNT(*)::BIGINT AS qtd
      FROM acordos_mes am
     GROUP BY am.sid, COALESCE(am.tipo, 'sem_tipo')
  ),
  tipos AS (
    SELECT r.sid,
           jsonb_object_agg(r.tipo, jsonb_build_object(
             'agendado', r.agendado, 'recebido', r.recebido, 'qtd', r.qtd)) AS mapa
      FROM por_tipo_raw r
     GROUP BY r.sid
  ),
  agregado AS (
    SELECT
      am.sid,
      COALESCE(SUM(am.valor), 0)::NUMERIC AS agendado,
      COALESCE(SUM(am.valor) FILTER (WHERE am.status = 'pago'), 0)::NUMERIC AS recebido,
      COALESCE(SUM(am.valor) FILTER (WHERE am.status = 'nao_pago'), 0)::NUMERIC AS nao_pago,
      COALESCE(SUM(am.valor) FILTER (WHERE am.status = 'verificar_pendente'), 0)::NUMERIC AS restante,
      COUNT(*)::BIGINT AS acordos,
      COUNT(*) FILTER (WHERE am.status = 'verificar_pendente')::BIGINT AS acordos_restante
    FROM acordos_mes am
    GROUP BY am.sid
  )
  -- Setores da empresa, inclusive os sem acordo no mes.
  SELECT s.id, s.nome,
         COALESCE(g.agendado, 0)::NUMERIC,
         COALESCE(g.recebido, 0)::NUMERIC,
         COALESCE(g.nao_pago, 0)::NUMERIC,
         COALESCE(g.restante, 0)::NUMERIC,
         COALESCE(g.acordos, 0)::BIGINT,
         COALESCE(g.acordos_restante, 0)::BIGINT,
         COALESCE(t.mapa, '{}'::JSONB)
    FROM public.setores s
    LEFT JOIN agregado g ON g.sid = s.id
    LEFT JOIN tipos    t ON t.sid = s.id
   WHERE s.empresa_id = p_empresa_id
     AND (v_escopo >= 3 OR s.id = v_setor)

  UNION ALL

  -- Acordos sem setor. Nao vira card, mas entra nos totais do painel — que era
  -- exatamente o que o filtro por setor no cliente perdia sem avisar.
  SELECT NULL::UUID, NULL::TEXT,
         g.agendado, g.recebido, g.nao_pago, g.restante,
         g.acordos, g.acordos_restante,
         COALESCE((SELECT t.mapa FROM tipos t WHERE t.sid IS NULL), '{}'::JSONB)
    FROM agregado g
   WHERE g.sid IS NULL

   ORDER BY 3 DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_diretoria_setores_do_mes(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_setores_do_mes(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_setores_do_mes(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.fn_diretoria_setores_do_mes(UUID, TEXT) IS
  'Agregado mensal por setor do Painel da Diretoria, uma linha por setor. '
  'Substitui o download de todo acordo do mes, que o teto de 1000 linhas do '
  'PostgREST truncava em silencio. Linha com setor_id NULL = acordos sem '
  'setor. Recebido e o TABULADO. Ver 20260831121500.';
