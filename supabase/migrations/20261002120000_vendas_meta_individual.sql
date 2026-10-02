-- ============================================================================
-- Comercial: meta individual por operador
-- ============================================================================
--
-- Pedido de 02/10/2026: o Comercial passou a ter meta por pessoa (12 vendas
-- por operador em outubro). Até aqui `metas` do Comercial só tinha `setor` e
-- `equipe`, e o painel media cada um pela PARTE dele na meta do time.
--
-- A linha da meta individual já cabe em `metas` (tipo `operador`) e
-- `fn_vendas_meta_salvar` já aceita o tipo — falta só ler. Função NOVA, e não
-- uma terceira parte em `fn_vendas_metas_do_mes`: aquela devolve todo setor e
-- toda equipe para a tela de Metas listar o que falta configurar, e cinco
-- telas percorrem o resultado dela. Pessoas ali mudariam o que elas contam.
--
-- Só vem meta com régua: a do Comercial. A meta individual da cobrança tem
-- `regua` nula e nada a ver com isto.
--
-- Quem lê: quem tem `ver_metas_vendas` vê todas da empresa; sem a chave, cada
-- um vê a sua.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_metas_individuais_do_mes(
  p_empresa_id UUID, p_ano INTEGER, p_mes INTEGER
)
RETURNS TABLE(
  perfil_id  UUID,
  nome       TEXT,
  equipe_id  UUID,
  setor_id   UUID,
  regua      TEXT,
  quantidade INTEGER,
  valor      NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT m.referencia_id, p.nome, p.equipe_id, p.setor_id,
         m.regua, m.meta_acordos, m.meta_valor
    FROM public.metas m
    JOIN public.perfis p ON p.id = m.referencia_id
   WHERE m.empresa_id = p_empresa_id
     AND m.tipo = 'operador'
     AND m.ano = p_ano AND m.mes = p_mes
     AND m.regua IS NOT NULL
     AND public.fn_can_access_empresa(p_empresa_id)
     AND (public.fn_user_tem('ver_metas_vendas') OR m.referencia_id = auth.uid())
   ORDER BY p.nome;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_metas_individuais_do_mes(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_metas_individuais_do_mes(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_metas_individuais_do_mes(UUID, INTEGER, INTEGER) IS
  'Metas individuais do Comercial no mes (tipo operador, com regua). Com '
  'ver_metas_vendas, todas da empresa; sem, so a propria.';
