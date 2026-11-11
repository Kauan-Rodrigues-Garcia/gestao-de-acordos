-- ============================================================================
-- Acordo vinculado (Direto + Extra) aparece UMA vez para quem vê os dois lados
-- ============================================================================
--
-- ## Por que
--
-- Pedido do Cleber, 11/11/2026. Quem enxerga acordos de mais de uma pessoa
-- (líder, elite, gerência, diretoria, admin, super admin) deve ver o acordo
-- vinculado uma vez só, com os dois operadores marcados.
--
-- A tela já juntava o par, mas só DENTRO da página de 20 linhas. A paginação é
-- do servidor e ordena só por vencimento: o Direto caía numa página e o Extra
-- na outra, os dois apareciam, e o total «N acordos» contava os dois.
--
-- ## O que muda
--
-- 1. `acordos_deduplicados` passa a expor `par_acordo_id` (coluna nova no fim;
--    o resto da definição é a de produção em 11/11/2026, 20260917140000).
-- 2. `extra_absorvido(acordos)` e `extra_absorvido(acordos_deduplicados)` —
--    campo calculado do PostgREST. Verdadeiro quando a linha é o EXTRA de um par
--    ligado E o DIRETO desse par é visível PARA QUEM CONSULTA.
--
--    A função é SECURITY INVOKER de propósito: o EXISTS passa pela RLS de quem
--    olha. O líder de uma equipe cujo operador é EXTRA de um DIRETO de outra
--    equipe (que ele não enxerga) continua vendo o EXTRA — esconder sem olhar o
--    alcance faria o acordo sumir da tela dele.
--
--    SQL puro, sem SET: assim o planejador embute o corpo na consulta (ver
--    memória «Função SQL com SET não embute»).
--
-- A tela usa `extra_absorvido=eq.false` só quando a lista não está recortada
-- por operador, equipe, setor, tag ou estado — com recorte, o DIRETO pode ficar
-- fora da lista mesmo sendo visível, e o acordo sumiria.
--
-- Reaplicável. Não escreve em nenhuma linha.

BEGIN;

CREATE OR REPLACE VIEW public.acordos_deduplicados
WITH (security_invoker = true) AS
SELECT a.id,
       a.nome_cliente,
       a.nr_cliente,
       a.data_cadastro,
       a.vencimento,
       a.valor,
       a.tipo,
       a.parcelas,
       a.whatsapp,
       a.status,
       a.operador_id,
       a.observacoes,
       a.criado_em,
       a.atualizado_em,
       a.setor_id,
       a.instituicao,
       a.empresa_id,
       a.acordo_grupo_id,
       a.numero_parcela,
       a.tipo_receptivo,
       a.operador_vinculado_id,
       a.tipo_vinculo,
       a.vinculo_operador_id,
       a.vinculo_operador_nome,
       a.estado_uf,
       a.tag_ids,
       a.par_acordo_id
  FROM public.acordos a
 WHERE a.id = (
   SELECT b.id
     FROM public.acordos b
    WHERE (CASE WHEN b.acordo_grupo_id IS NULL THEN b.id ELSE b.acordo_grupo_id END)
        = (CASE WHEN a.acordo_grupo_id IS NULL THEN a.id ELSE a.acordo_grupo_id END)
    ORDER BY b.numero_parcela DESC NULLS LAST, b.criado_em DESC, b.id DESC
    LIMIT 1
 );

COMMENT ON VIEW public.acordos_deduplicados IS
  'Um acordo por grupo: a ultima parcela (numero_parcela, depois criado_em, depois id). '
  'Filtro e ordenacao descem ate acordos; a subconsulta usa idx_acordos_dedup_uuid. '
  'par_acordo_id exposto em 20261111150000 (campo calculado extra_absorvido).';

CREATE OR REPLACE FUNCTION public.extra_absorvido(a public.acordos)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(a.tipo_vinculo, 'direto') = 'extra'
     AND a.par_acordo_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.acordos p
                  WHERE p.id = a.par_acordo_id
                    AND p.par_acordo_id = a.id);
$function$;

CREATE OR REPLACE FUNCTION public.extra_absorvido(a public.acordos_deduplicados)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(a.tipo_vinculo, 'direto') = 'extra'
     AND a.par_acordo_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.acordos p
                  WHERE p.id = a.par_acordo_id
                    AND p.par_acordo_id = a.id);
$function$;

COMMENT ON FUNCTION public.extra_absorvido(public.acordos) IS
  'Campo calculado: EXTRA de par ligado cujo DIRETO a pessoa que consulta enxerga (RLS). Ver 20261111150000.';
COMMENT ON FUNCTION public.extra_absorvido(public.acordos_deduplicados) IS
  'Campo calculado: EXTRA de par ligado cujo DIRETO a pessoa que consulta enxerga (RLS). Ver 20261111150000.';

REVOKE ALL ON FUNCTION public.extra_absorvido(public.acordos) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.extra_absorvido(public.acordos_deduplicados) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extra_absorvido(public.acordos) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extra_absorvido(public.acordos_deduplicados) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Conferência depois de aplicar:
--   SELECT count(*) FILTER (WHERE public.extra_absorvido(a)) AS extras_absorvidos
--     FROM public.acordos a;           -- como postgres: conta todos os pares ligados
