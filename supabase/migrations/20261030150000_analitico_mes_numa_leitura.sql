-- ============================================================================
-- O mês do analítico numa leitura só
-- ============================================================================
--
-- Auditoria de CPU/RAM de 30/10/2026.
--
-- ## O problema
--
-- `lerMesAnalitico` (Painel Líder, Analítico, gráfico, comissão) e
-- `buscarRecebidoPorDiaDosOperadores` (tela Equipe do app) baixam o mês de
-- `analitico_recebimentos` em páginas de 1.000 linhas, por `range` (OFFSET),
-- ordenadas por `id`. Cada página é uma consulta independente: o Postgres
-- filtra o mês INTEIRO, ordena e só então pula as páginas anteriores. O mês da
-- BookPlay em outubro são ~16 mil linhas = 16 páginas = o mês lido 16 vezes.
--
-- Medido desde 20/10: 193 mil páginas de 77–94 ms, 15,4% de todo o tempo do
-- banco — o maior item do pg_stat_statements.
--
-- ## A correção
--
-- Uma função que devolve o mês num único JSON: o mês é lido uma vez, e o
-- `max-rows` do PostgREST não corta (é um valor só, não um conjunto).
--
--   - SECURITY INVOKER: a RLS de `analitico_recebimentos` (`analitico_select`)
--     recorta exatamente como na leitura paginada. Nada muda em quem vê o quê.
--   - Mesmas colunas, mesmo filtro (empresa + data_pagamento no mês), mesma
--     ordem (`id`). `p_operadores` = o `.in('operador_id', …)` da tela Equipe.
--   - Só leitura. Não altera tabela, policy nem dado.
--
-- O front tenta a função e, se ela não existir (banco sem esta migration) ou
-- falhar, cai na leitura paginada de antes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_analitico_mes_linhas(
  p_empresa_id uuid,
  p_inicio     date,
  p_fim        date,
  p_operadores uuid[] DEFAULT NULL)
RETURNS json
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(json_agg(json_build_object(
           'operador_id',              r.operador_id,
           'setor_id',                 r.setor_id,
           'importado_por_id',         r.importado_por_id,
           'valor_recebido',           r.valor_recebido,
           'total_ho',                 r.total_ho,
           'data_pagamento',           r.data_pagamento,
           'procedencia',              r.procedencia,
           'contribuicao_de_setor_id', r.contribuicao_de_setor_id,
           'espelho_extra',            r.espelho_extra
         ) ORDER BY r.id), '[]'::json)
    FROM public.analitico_recebimentos r
   WHERE r.empresa_id = p_empresa_id
     AND r.data_pagamento >= p_inicio
     AND r.data_pagamento <= p_fim
     AND (p_operadores IS NULL OR r.operador_id = ANY (p_operadores));
$$;

COMMENT ON FUNCTION public.fn_analitico_mes_linhas(uuid, date, date, uuid[]) IS
  'O mês de analitico_recebimentos num JSON só (auditoria 30/10/2026). Invocadora: a RLS da tabela recorta. Substitui a leitura paginada por OFFSET.';

REVOKE ALL ON FUNCTION public.fn_analitico_mes_linhas(uuid, date, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_mes_linhas(uuid, date, date, uuid[]) TO authenticated;
