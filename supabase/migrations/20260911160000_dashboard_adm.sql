-- ============================================================================
-- Dashboard – ADM — a aba propria do Nucleo de Inteligencia e Gestao
-- ============================================================================
--
-- ## O que muda
--
--   1. nasce `ver_dashboard_adm`, a chave da aba nova, com card proprio no painel
--      de permissoes (grupo «Dashboard ADM»). Nasce ligada so no
--      `assistente_adm`; administrador e super_admin a recebem por acesso total,
--      como toda chave nao explicita;
--   2. `ver_dashboard` deixa de nascer no `assistente_adm`, e as linhas que ja
--      existem sao desligadas. O Dashboard da cobranca nao mede nada do trabalho
--      do Nucleo, e o painel dele passa a morar na aba nova.
--
-- ## A porta de entrada deixa de olhar o setor
--
-- Ate aqui `/` desenhava o painel do Nucleo para quem estava no SETOR apontado
-- em `numeros_config` (`useNucleo`, no front). Agora a decisao e da chave: quem
-- nao tem `ver_dashboard` e tem `ver_dashboard_adm` e mandado para
-- `/dashboard-adm`. E a regra de 23/08/2026 — o painel de permissoes e a
-- autoridade unica.
--
-- ## O que a aba le
--
-- Nada novo. `numeros_whatsapp`, `numeros_celulares`, `numeros_movimentacoes` e
-- `numeros_lixeira`, com as policies que ja existem: quem nao e do Nucleo nem
-- super_admin abre a aba e ve zeros, como no Controle de Numeros.
--
-- ## Reaplicavel
--
-- Os UPDATEs so tocam linha que ainda nao esta no estado final. O RENAME do
-- catalogo e o unico passo que nao se repete — como nas migrations anteriores.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── 1. O catalogo ───────────────────────────────────────────────────────────
--
-- `ver_dashboard` e REDEFINIDA: sai da versao anterior pelo `NOT IN` e volta sem
-- o `assistente_adm`, como 20260911120000 fez com as chaves do Nucleo.

ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_dashboard_adm_20260911;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT c.* FROM public.fn_permissoes_catalogo_antes_dashboard_adm_20260911() c
   WHERE c.chave NOT IN ('ver_dashboard')
  UNION ALL
  SELECT * FROM (VALUES
    -- O Dashboard da cobranca volta a ser dos cargos que ele mede, e do RH.
    ('ver_dashboard',     NULL::TEXT[],              ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh']::TEXT[], false),
    -- A aba do Nucleo: so o Assistente ADM nasce com ela.
    ('ver_dashboard_adm', ARRAY['bookplay']::TEXT[], ARRAY['assistente_adm']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao 20260911 do Dashboard – ADM '
  'acrescenta ver_dashboard_adm e tira o assistente_adm do padrao de '
  'ver_dashboard, sem perder o catalogo anterior. Espelha '
  'src/lib/permissoes-catalogo.ts; o teste de contrato quebra a CI se os dois '
  'lados divergirem.';

-- ── 2. A chave nova nos cargos que ja existem ───────────────────────────────
--
-- So a linha que ainda nao tem a chave: configuracao feita a mao no painel nao
-- regride numa reaplicacao.

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
         'ver_dashboard_adm', cp.cargo IN ('assistente_adm', 'administrador', 'super_admin')),
       atualizado_em = NOW()
  FROM public.empresas e
 WHERE e.id = cp.empresa_id
   AND e.slug = 'bookplay'
   AND NOT (cp.permissoes ? 'ver_dashboard_adm');

-- ── 3. O Assistente ADM sai do Dashboard da cobranca ────────────────────────
--
-- So toca a linha que ainda esta ligada. Sem isto o menu dele continuaria com
-- os dois dashboards, e `/` abriria o da cobranca — vazio para ele.

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object('ver_dashboard', false),
       atualizado_em = NOW()
 WHERE cp.cargo = 'assistente_adm'
   AND COALESCE((cp.permissoes->>'ver_dashboard')::BOOLEAN, FALSE);

-- ── 4. Prova ────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'ver_dashboard_adm'
  ) THEN
    RAISE EXCEPTION 'ver_dashboard_adm ausente do catalogo.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fn_permissoes_catalogo() GROUP BY chave HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'O catalogo ficou com chave repetida.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fn_permissoes_catalogo()
     WHERE chave = 'ver_dashboard' AND 'assistente_adm' = ANY(padrao)
  ) THEN
    RAISE EXCEPTION 'ver_dashboard continua nascendo no assistente_adm.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp
     WHERE cp.cargo = 'assistente_adm'
       AND COALESCE((cp.permissoes->>'ver_dashboard')::BOOLEAN, FALSE)
  ) THEN
    RAISE EXCEPTION 'Algum Assistente ADM continua com o Dashboard da cobranca.';
  END IF;
END
$prova$;

COMMIT;
