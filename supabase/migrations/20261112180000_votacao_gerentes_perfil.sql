-- ============================================================================
-- 20261112180000_votacao_gerentes_perfil.sql
--
-- Votação dos Gerentes: o resultado é o PERFIL de cada gerente (12/11/2026).
--
-- Pedido do Kauan: o operador vê o gerente DELE e marca «a opção que mais se
-- encaixa» (Mais resolve problemas, Mais inspirador, Referência para todos…).
-- O voto continua no mesmo formato ({opção: gerente}, um_por_candidato), mas
-- o resultado não é mais «quem leva cada categoria»: é o que a equipe de cada
-- gerente mais marcou. Então não há empate nem «repetido» para a diretoria
-- decidir — `fn_vl_pendentes` não devolve nada para votação de tipo
-- «gerentes», e «Liberar o resultado» não trava por isso.
--
-- A votação da liderança não muda. Nenhum voto muda. Reaplicável.
-- Depende da 20261112160000.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'votacao_lideranca' AND column_name = 'tipo') THEN
    RAISE EXCEPTION 'Aplique antes a 20261112160000_votacao_gerentes_e_guardar.sql.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_vl_pendentes(p_id UUID)
RETURNS TABLE (pergunta_id TEXT, vencedores UUID[], empate BOOLEAN, repetido BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH vot AS (
    SELECT v.participantes, v.um_titulo, v.tipo,
           ARRAY(SELECT q->>'id' FROM jsonb_array_elements(v.perguntas) q) AS perguntas
      FROM public.votacao_lideranca v
     WHERE v.id = p_id
  ), c AS (
    SELECT x.pergunta_id, x.candidato_id, count(*)::int AS n
      FROM public.votacao_lideranca_votos x, vot
     WHERE x.votacao_id = p_id AND x.pergunta_id = ANY (vot.perguntas)
     GROUP BY 1, 2
  ), topo AS (
    SELECT c.pergunta_id, max(c.n) AS n FROM c GROUP BY 1
  ), venc AS (
    SELECT c.pergunta_id, c.candidato_id
      FROM c JOIN topo t ON t.pergunta_id = c.pergunta_id AND c.n = t.n
  ), decidida AS (
    SELECT d.pergunta_id, d.escolhido_id
      FROM public.votacao_lideranca_desempates d, vot
     WHERE d.votacao_id = p_id
       AND d.pergunta_id = ANY (vot.perguntas)
       AND d.escolhido_id = ANY (vot.participantes)
  ), quem_leva AS (
    SELECT d.pergunta_id, d.escolhido_id AS id FROM decidida d
    UNION ALL
    SELECT v.pergunta_id, v.candidato_id FROM venc v
     WHERE NOT EXISTS (SELECT 1 FROM decidida d WHERE d.pergunta_id = v.pergunta_id)
  ), aberta AS (
    SELECT v.pergunta_id, array_agg(v.candidato_id ORDER BY v.candidato_id) AS vencedores
      FROM venc v
     WHERE NOT EXISTS (SELECT 1 FROM decidida d WHERE d.pergunta_id = v.pergunta_id)
     GROUP BY v.pergunta_id
  ), marcada AS (
    SELECT a.pergunta_id, a.vencedores,
           cardinality(a.vencedores) > 1 AS empate,
           (SELECT vot.um_titulo FROM vot)
             AND EXISTS (SELECT 1 FROM quem_leva q WHERE q.pergunta_id <> a.pergunta_id AND q.id = ANY (a.vencedores)) AS repetido
      FROM aberta a
  )
  SELECT m.pergunta_id, m.vencedores, m.empate, m.repetido
    FROM marcada m
   WHERE (m.empate OR m.repetido)
     -- Gerentes (20261112180000): o resultado é o perfil de cada um; nada a decidir.
     AND (SELECT vot.tipo FROM vot) <> 'gerentes';
$$;

COMMENT ON FUNCTION public.fn_vl_pendentes(UUID) IS
  'Categorias que a diretoria ainda precisa decidir (só liderança): empate no 1º lugar, ou (com um_titulo) '
  '1º colocado que também leva outra. Votação de gerentes: nada a decidir. 20261112180000.';

REVOKE ALL ON FUNCTION public.fn_vl_pendentes(UUID) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_vl_pendentes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_vl_pendentes ficou aberta para o app.';
  END IF;
END $$;

COMMIT;
