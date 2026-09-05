-- A aba Ouvidoria foi removida do produto em 05/09/2026 e o código foi para
-- `arquivo-morto/ouvidoria/`. Saem com ela QUATRO chaves, que sem esta migration
-- continuariam no catálogo SQL — aparecendo em Admin → Cargos de toda empresa
-- nova como interruptores que não ligam nada, porque a tela que eles abriam
-- deixou de existir.
--
-- REMOVE_PERMISSOES: ver_ouvidoria, editar_ouvidoria, gerenciar_acessos_ouvidoria, ouvidoria_responsavel
--
-- A linha acima não é decoração: `permissoes-catalogo.sql.test.ts` a lê para
-- subtrair as chaves do catálogo que monta a partir das migrations. O catálogo é
-- construído por acumulação (cada migration soma um VALUES ao anterior), então
-- sem uma forma declarada de REMOVER, o teste de contrato TS ↔ SQL acusaria
-- divergência para sempre.
--
-- O CARGO `ouvidoria` NÃO sai. Ele continua em `perfis.perfil`, continua na
-- liderança (`PERFIS_LIDER`), continua com nível de escopo próprio e continua
-- recebendo permissões como qualquer outro cargo. O que saiu foi a ABA — são
-- coisas diferentes, e confundi-las apagaria o cargo de gente que trabalha.
--
-- Também NÃO se apaga nada de `ouvidoria_acessos`, `ouvidoria_atendimentos` nem
-- o valor guardado em `cargos_permissoes.permissoes` / `perfis_permissoes`.
-- Varrer o JSONB de cada empresa para tirar chave que já não tem efeito é risco
-- sem retorno: `fn_user_tem` de uma chave fora do catálogo cai no ramo
-- "ausente vale negado", e nada mais a consulta.

ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_remocao_20260905;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT c.chave, c.tenants, c.padrao, c.explicita
    FROM public.fn_permissoes_catalogo_antes_remocao_20260905() c
   WHERE c.chave NOT IN (
     'ver_ouvidoria',
     'editar_ouvidoria',
     'gerenciar_acessos_ouvidoria',
     'ouvidoria_responsavel'
   );
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catálogo completo de permissões. Subtrai as chaves aposentadas em 20260831 '
  '(aba Acompanhamento) e em 20260905 (aba Ouvidoria).';

-- Verificação: as quatro sumiram e o resto do catálogo continua de pé.
DO $$
DECLARE
  v_total INT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo()
              WHERE chave IN ('ver_ouvidoria', 'editar_ouvidoria',
                              'gerenciar_acessos_ouvidoria', 'ouvidoria_responsavel')) THEN
    RAISE EXCEPTION 'chave aposentada ainda esta no catalogo';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.fn_permissoes_catalogo();
  IF v_total < 30 THEN
    RAISE EXCEPTION 'catalogo voltou so % chaves — o encadeamento quebrou', v_total;
  END IF;
END;
$$;
