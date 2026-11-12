-- ============================================================================
-- 20261112210000_ranking_quitacao_previa_importacao.sql
--
-- Ranking de quitação: a prévia da importação diz, por setor, o que já está
-- gravado no mês e o que vem no arquivo (pedido de 12/11/2026).
--
-- ## Por quê
--
-- Importar SUBSTITUI o mês da empresa inteira (20261006120000): o relatório do
-- ERP é um só para todos os setores. Em 12/11/2026, às 14h10, entrou um
-- arquivo só com gente do Play 2 — 110 quitações — e o novembro do Play 3, do
-- Play 5 e do Play Mix Marília (mesma empresa) sumiu sem ninguém perceber.
--
-- A regra de substituir fica. O que muda é a prévia: antes de gravar, a tela
-- pergunta aqui quantas quitações cada setor tem hoje no mês e quantas o
-- arquivo traz. Setor que tinha e vai ficar sem nenhuma aparece em destaque,
-- e gravar pede uma confirmação a mais (ImportarRankingModal).
--
-- `ranking_quitacao_acordos` não tem policy de leitura (tudo passa por
-- função), por isso a contagem é uma função.
--
-- O setor de cada pessoa é o da equipe, senão o do cadastro — a mesma régua
-- da conta do ranking. Só sai contagem por setor, nenhum nome.
--
-- Reverter: DROP FUNCTION public.fn_ranking_quitacao_previa(uuid, date, uuid[]);
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao_previa(
  p_empresa_id  UUID,
  p_mes         DATE,
  -- O operador de cada quitação do arquivo (repetido = uma quitação a mais).
  p_operadores  UUID[]
)
RETURNS TABLE (setor_id UUID, setor_nome TEXT, no_banco INTEGER, no_arquivo INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('ranking_quitacao_importar')) THEN
    RAISE EXCEPTION 'Sem permissao para importar o Ranking de quitacao.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(cardinality(p_operadores), 0) > 50000 THEN
    RAISE EXCEPTION 'O arquivo tem quitacoes demais para a previa.';
  END IF;

  RETURN QUERY
  WITH banco AS (
    SELECT COALESCE(e.setor_id, p.setor_id) AS setor, COUNT(*)::INTEGER AS n
      FROM public.ranking_quitacao_acordos a
      JOIN public.perfis p       ON p.id = a.operador_id
      LEFT JOIN public.equipes e ON e.id = p.equipe_id
     WHERE a.empresa_id = p_empresa_id
       AND a.mes = date_trunc('month', p_mes)::DATE
     GROUP BY 1
  ),
  arquivo AS (
    SELECT COALESCE(e.setor_id, p.setor_id) AS setor, COUNT(*)::INTEGER AS n
      FROM unnest(COALESCE(p_operadores, ARRAY[]::UUID[])) AS o(id)
      JOIN public.perfis p       ON p.id = o.id AND p.empresa_id = p_empresa_id
      LEFT JOIN public.equipes e ON e.id = p.equipe_id
     GROUP BY 1
  )
  SELECT s.id, s.nome::TEXT, COALESCE(b.n, 0), COALESCE(f.n, 0)
    FROM public.setores s
    LEFT JOIN banco b   ON b.setor = s.id
    LEFT JOIN arquivo f ON f.setor = s.id
   WHERE s.empresa_id = p_empresa_id
     AND (b.n IS NOT NULL OR f.n IS NOT NULL)
   ORDER BY s.nome;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ranking_quitacao_previa(UUID, DATE, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ranking_quitacao_previa(UUID, DATE, UUID[]) TO authenticated;

COMMENT ON FUNCTION public.fn_ranking_quitacao_previa(UUID, DATE, UUID[]) IS
  'Previa da importacao do Ranking de quitacao: por setor, quantas quitacoes o mes tem gravadas '
  'e quantas o arquivo traz. So contagem. Mesma trava de fn_ranking_quitacao_importar. 20261112210000.';

DO $prova$
BEGIN
  IF to_regprocedure('public.fn_ranking_quitacao_previa(uuid,date,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'PROVA: fn_ranking_quitacao_previa nao foi criada.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_ranking_quitacao_previa(uuid,date,uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_ranking_quitacao_previa(uuid,date,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVA: os grants de fn_ranking_quitacao_previa ficaram errados.';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261112210000', 'ranking_quitacao_previa_importacao', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
