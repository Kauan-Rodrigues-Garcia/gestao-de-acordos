-- A aba Colchão do Analítico saiu do produto em 21/10/2026 e o código foi para
-- `arquivo-morto/colchao-controle/`. Sai com ela UMA chave, que sem esta
-- migration continuaria no catálogo SQL — aparecendo em Admin → Cargos de toda
-- empresa nova como um interruptor que não liga nada.
--
-- REMOVE_PERMISSOES: analitico_sub_colchao
--
-- A linha acima não é decoração: `permissoes-catalogo.sql.test.ts` a lê para
-- subtrair a chave do catálogo que monta a partir das migrations. Mesmo padrão
-- da remoção do Modo TV (20261013160000).
--
-- O que NÃO muda:
--   • a REGRA do colchão — `fn_mestre_conta_na_meta` continua igual: colchão
--     entra no total da empresa e não conta para setor, equipe ou operador;
--   • a tabela `analitico_colchao_fora_meta` e as linhas já gravadas. O código
--     só parou de gravar nela. Apagar a tabela é decisão à parte, com o dono do
--     banco na sala;
--   • o valor guardado em `cargos_permissoes.permissoes` / `perfis_permissoes`.
--     Uma chave fora do catálogo cai no ramo "ausente vale negado" de
--     `fn_user_tem`, e nada mais a consulta.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_remocao_colchao_20261021()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_remocao_colchao_20261021;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_remocao_colchao_20261021() IS
  'Retrato do catalogo antes da remocao da aba Colchao (21/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT c.chave, c.tenants, c.padrao, c.explicita
    FROM public.fn_permissoes_catalogo_antes_remocao_colchao_20261021() c
   WHERE c.chave <> 'analitico_sub_colchao';
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261021150000 subtrai a chave da aba Colchao.';

-- Verificação: a chave sumiu e o resto do catálogo continua de pé.
DO $$
DECLARE
  v_total INT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'analitico_sub_colchao') THEN
    RAISE EXCEPTION 'chave aposentada ainda esta no catalogo';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.fn_permissoes_catalogo();
  IF v_total < 30 THEN
    RAISE EXCEPTION 'catalogo voltou so % chaves — o encadeamento quebrou', v_total;
  END IF;
END;
$$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261021150000', 'remove_permissao_colchao', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
