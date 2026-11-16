-- ============================================================================
-- Votação de opções: o RESULTADO para quem votou (16/11/2026)
-- ============================================================================
--
-- Depois de encerrada, a votação aparece como um card de resultado na tela de
-- quem estava na lista de eleitores (ou é do setor que foi chamado a votar),
-- por 15 dias. Sai só a contagem por opção — em qual opção cada pessoa votou
-- continua sem sair por nenhuma função.
--
-- Nenhuma tabela muda. Reexecutável.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_votacao_opcoes_resultados()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', v.id, 'titulo', v.titulo, 'pergunta', v.pergunta, 'opcoes', v.opcoes,
    'eleitores', cardinality(v.eleitores),
    'votaram', (SELECT count(*) FROM public.votacao_opcoes_votos x WHERE x.votacao_id = v.id),
    'contagem', (SELECT COALESCE(jsonb_object_agg(c.opcao_id, c.n), '{}'::jsonb)
                 FROM (SELECT x.opcao_id, count(*) AS n FROM public.votacao_opcoes_votos x
                       WHERE x.votacao_id = v.id GROUP BY x.opcao_id) c),
    'encerrada_em', v.encerrada_em)
    ORDER BY v.encerrada_em DESC), '[]'::jsonb)
  FROM public.votacao_opcoes v
  WHERE v.estado = 'encerrada'
    AND v.encerrada_em > NOW() - INTERVAL '15 days'
    AND (
      (SELECT auth.uid()) = ANY (v.eleitores)
      OR EXISTS (
        SELECT 1 FROM public.perfis p
        WHERE p.id = (SELECT auth.uid()) AND p.ativo
          AND p.setor_id IS NOT NULL
          AND v.publico->'setores' ? p.setor_id::text
      )
    );
$$;

REVOKE ALL ON FUNCTION public.fn_votacao_opcoes_resultados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_votacao_opcoes_resultados() TO authenticated;

COMMIT;
