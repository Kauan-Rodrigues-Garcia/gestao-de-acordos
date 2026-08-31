-- A aba "Acompanhamento" do Painel do Líder foi removida em 31/08/2026. Saem
-- com ela DUAS chaves: a que abria a aba e a `ver_operadores`, cujo unico
-- consumidor no codigo era o drill-down da lista de operadores daquela aba
-- ("ver informacoes detalhadas de outras pessoas do setor" era exatamente
-- aquele painel). Sem esta migration a chave continuaria no
-- catálogo SQL — aparecendo em Admin → Cargos de toda empresa nova como um
-- toggle que não liga nada.
--
-- REMOVE_PERMISSOES: painel_lider_sub_acompanhamento, ver_operadores
--
-- A linha acima não é decoração: `permissoes-catalogo.sql.test.ts` a lê para
-- subtrair a chave do catálogo que monta a partir das migrations. O catálogo é
-- construído por acumulação (cada migration soma um VALUES ao anterior), então
-- sem uma forma declarada de REMOVER, o teste de contrato TS ↔ SQL acusaria
-- divergência para sempre — e a saída fácil seria deixar a chave morta nos dois
-- lados, que é exatamente o que este projeto já tem demais.
--
-- O valor guardado em `cargos_permissoes.permissoes` / `perfis_permissoes` NÃO
-- é apagado. Varrer o JSONB de cada empresa para tirar uma chave que já não tem
-- efeito é risco sem retorno: `fn_user_tem` de uma chave fora do catálogo cai no
-- ramo "ausente vale negado", e nada mais a consulta.

ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_remocao_20260831;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT c.chave, c.tenants, c.padrao, c.explicita
    FROM public.fn_permissoes_catalogo_antes_remocao_20260831() c
   WHERE c.chave NOT IN ('painel_lider_sub_acompanhamento', 'ver_operadores');
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catálogo completo de permissões. A partir de 20260831 a função também '
  'SUBTRAI chaves aposentadas do catálogo herdado, em vez de só somar.';

-- Verificação: a chave sumiu e o resto do catálogo continua de pé.
DO $$
DECLARE
  v_total INT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo()
              WHERE chave IN ('painel_lider_sub_acompanhamento', 'ver_operadores')) THEN
    RAISE EXCEPTION 'chave aposentada ainda esta no catalogo';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.fn_permissoes_catalogo();
  IF v_total < 30 THEN
    RAISE EXCEPTION 'catalogo voltou so % chaves — o encadeamento quebrou', v_total;
  END IF;
END;
$$;
