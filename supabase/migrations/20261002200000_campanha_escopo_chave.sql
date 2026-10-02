-- ============================================================================
-- Fase 3 de cargos: «preso ao setor» na Campanha Facil vira chave do painel
-- ============================================================================
--
-- A Campanha Facil decidia quem escolhe o setor dos operadores pela lista
-- `PERFIS_VISAO_SETOR` em `src/lib/index.ts` (operador, lider, elite,
-- ouvidoria ficavam presos ao proprio setor). Era a ultima lista de cargo que
-- decidia acesso no front sem passar pelo painel.
--
-- Chave nova, so da BookPlay (a unica com Campanha Facil):
--
--   campanha_escopo_todos_setores   escolher o setor da campanha
--
-- Nasce com o COMPLEMENTO exato da lista antiga, em todo cargo ja gravado:
-- quem escolhia setor ontem continua escolhendo, quem estava preso continua
-- preso. Empresa nova segue o padrao do catalogo, que e o mesmo complemento.
--
-- ## Renomear, nao reescrever
--
-- Como em 20261002150000: `fn_permissoes_catalogo` e renomeada para o elo
-- `_antes_campanha_20261002` e redefinida por cima, preservando o corpo que
-- estiver em producao.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. Catalogo ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_campanha_20261002()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_campanha_20261002;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_campanha_20261002() IS
  'Retrato do catalogo antes de campanha_escopo_todos_setores (02/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_campanha_20261002()
  UNION ALL
  SELECT * FROM (VALUES
    ('campanha_escopo_todos_setores', ARRAY['bookplay']::TEXT[], ARRAY['gerencia','diretoria','rh','assistente_adm']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. A extensao 20261002200000 adiciona '
  'campanha_escopo_todos_setores (Campanha Facil, fase 3 de cargos).';

-- ── 2. Semear, preservando o comportamento de hoje ──────────────────────────
--
-- So onde a chave ainda nao existe. Acesso total fica de fora: o painel ja
-- responde sim para eles antes de olhar o mapa.

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
         'campanha_escopo_todos_setores',
         cp.cargo NOT IN ('operador', 'lider', 'elite', 'ouvidoria'))
 WHERE cp.empresa_id IN (SELECT e.id FROM public.empresas e WHERE e.slug = 'bookplay')
   AND cp.cargo NOT IN (SELECT c.slug FROM public.cargos c WHERE c.acesso_total)
   AND NOT (cp.permissoes ? 'campanha_escopo_todos_setores');

-- ── 3. Verificacao ──────────────────────────────────────────────────────────

DO $verificacao$
DECLARE n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'campanha_escopo_todos_setores') THEN
    RAISE EXCEPTION 'A chave nova nao entrou no catalogo.';
  END IF;

  -- O elo de baixo nao pode ter se perdido.
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_campanha_facil')
     OR NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_ias_vendas') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: chaves antigas sumiram.';
  END IF;

  -- Todo cargo configuravel da BookPlay tem a chave, com o valor da lista antiga.
  SELECT COUNT(*) INTO n
    FROM public.cargos_permissoes cp
    JOIN public.empresas e ON e.id = cp.empresa_id AND e.slug = 'bookplay'
   WHERE cp.cargo NOT IN (SELECT c.slug FROM public.cargos c WHERE c.acesso_total)
     AND (cp.permissoes ->> 'campanha_escopo_todos_setores')::boolean
         IS DISTINCT FROM (cp.cargo NOT IN ('operador', 'lider', 'elite', 'ouvidoria'));
  IF n > 0 THEN
    RAISE EXCEPTION '% cargo(s) da BookPlay ficaram com a chave diferente da lista antiga.', n;
  END IF;
END;
$verificacao$;

COMMIT;
