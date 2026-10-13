-- O Modo TV saiu do produto em 13/10/2026 e o código foi para
-- `arquivo-morto/modo-tv/`. Saem com ele CINCO chaves, que sem esta migration
-- continuariam no catálogo SQL — aparecendo em Admin → Cargos de toda empresa
-- nova como interruptores que não ligam nada, porque a mesa que elas abriam
-- deixou de existir.
--
-- REMOVE_PERMISSOES: ver_modo_tv, tv_editar_cenas, tv_cortar, tv_gerenciar_telas, tv_enviar_midia
--
-- A linha acima não é decoração: `permissoes-catalogo.sql.test.ts` a lê para
-- subtrair as chaves do catálogo que monta a partir das migrations. Mesmo
-- padrão da remoção da Ouvidoria (20260905154019).
--
-- Também NÃO se apaga nada das tabelas do Modo TV (`tv_telas`, `tv_cenas` e as
-- demais das migrations 20260902*/20260903*), da `fn_tv_palco`, do bucket de
-- mídia, nem do valor guardado em `cargos_permissoes.permissoes` /
-- `perfis_permissoes`. Uma chave fora do catálogo cai no ramo "ausente vale
-- negado" de `fn_user_tem`, e nada mais a consulta. Apagar tabela, função ou
-- bucket é decisão à parte, com o dono do banco na sala.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_remocao_modo_tv_20261013()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_remocao_modo_tv_20261013;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_remocao_modo_tv_20261013() IS
  'Retrato do catalogo antes da remocao do Modo TV (13/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT c.chave, c.tenants, c.padrao, c.explicita
    FROM public.fn_permissoes_catalogo_antes_remocao_modo_tv_20261013() c
   WHERE c.chave NOT IN (
     'ver_modo_tv',
     'tv_editar_cenas',
     'tv_cortar',
     'tv_gerenciar_telas',
     'tv_enviar_midia'
   );
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261013160000 subtrai as cinco chaves do Modo TV.';

-- Verificação: as cinco sumiram e o resto do catálogo continua de pé.
DO $$
DECLARE
  v_total INT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo()
              WHERE chave IN ('ver_modo_tv', 'tv_editar_cenas', 'tv_cortar',
                              'tv_gerenciar_telas', 'tv_enviar_midia')) THEN
    RAISE EXCEPTION 'chave aposentada ainda esta no catalogo';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.fn_permissoes_catalogo();
  IF v_total < 30 THEN
    RAISE EXCEPTION 'catalogo voltou so % chaves — o encadeamento quebrou', v_total;
  END IF;
END;
$$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261013160000', 'remove_permissoes_modo_tv', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
