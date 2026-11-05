-- ============================================================================
-- A aba Acordos nas duas regras (Nosso produto e Cofen)
-- ============================================================================
--
-- Pedido do Cleber, 05/11/2026: «deixar a aba separada tanto nosso produto
-- quanto cofen». A mesa de acordos da regra Cofen morava DENTRO do Dashboard e
-- a aba Acordos era escondida para ela; agora as duas regras têm a mesma
-- estrutura — Dashboard para os indicadores, Acordos para a mesa
-- (`src/pages/Acordos/AcordosCofen.tsx`).
--
-- ## O problema
--
-- A aba e o alcance dela eram chaves «só da BookPlay» no catálogo
-- (`tenants = ['bookplay']`). A empresa `pagueplay` — onde mora o setor da
-- regra Cofen (Marília) — nunca as recebeu, e o painel dela nem as mostrava.
-- Ausente = negado (`useCargoPermissoes`): sem esta migration, quem é Cofen
-- perderia a mesa (ela sai do Dashboard e a aba continuaria fechada).
--
-- Os setores de Marília com regra Nosso produto moram na empresa `bookplay` e
-- já têm a aba configurada — esta migration não mexe neles (valor gravado manda).
--
-- ## O que faz
--
--   1. As cinco chaves passam a valer para `bookplay` E `pagueplay` (as duas
--      empresas da cobrança; Comercial, RH e Cantina continuam sem elas).
--   2. Na `pagueplay`, NINGUÉM passa a ver mais nem menos do que vê hoje: até
--      aqui a mesa seguia o Dashboard, então cada chave nova nasce com o valor
--      que a do Dashboard tem — no cargo, no setor e na pessoa:
--        ver_acordos                  ← ver_dashboard
--        acordos_escopo_individual    ← dashboard_escopo_individual
--        acordos_escopo_equipe        ← dashboard_escopo_equipe
--        acordos_escopo_setor         ← dashboard_escopo_setor
--        acordos_escopo_todos_setores ← dashboard_escopo_todos_setores
--      (O padrão do catálogo tiraria da ouvidoria a visão do setor, por
--      exemplo — conferido no banco em 05/11/2026.) Só onde a chave nova ainda
--      não existe: o que já estiver configurado não muda.
--   3. Semeia o que faltar em cada empresa (a semeadura de sempre: valor
--      gravado manda; o que falta nasce no padrão do catálogo).
--   4. Confere: na `pagueplay`, cada cargo ficou com a aba e o alcance iguais
--      aos do Dashboard. Se não, desfaz tudo.
--
-- Depois disso, quem decide é o painel, como em toda aba.
--
-- O catálogo é uma cadeia: o de agora é congelado numa função `_antes_` e o
-- novo lê dela. A `_antes_` NÃO é objeto morto (ver o COMMENT).
--
-- Reaplicável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. O catálogo ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_acordos_cofen_20261105()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_acordos_cofen_20261105;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_acordos_cofen_20261105() IS
  'Retrato do catalogo antes da aba Acordos valer para as duas regras (05/11/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_acordos_cofen_20261105() c
   WHERE c.chave NOT IN ('ver_acordos', 'acordos_escopo_individual', 'acordos_escopo_equipe',
                         'acordos_escopo_setor', 'acordos_escopo_todos_setores')
  UNION ALL
  SELECT * FROM (VALUES
    -- As mesmas cinco, agora nas duas empresas da cobrança.
    ('ver_acordos',                  ARRAY['bookplay','pagueplay']::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[], false),
    ('acordos_escopo_individual',    ARRAY['bookplay','pagueplay']::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[], false),
    ('acordos_escopo_equipe',        ARRAY['bookplay','pagueplay']::TEXT[], ARRAY['lider','elite','gerencia','ouvidoria']::TEXT[], false),
    ('acordos_escopo_setor',         ARRAY['bookplay','pagueplay']::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('acordos_escopo_todos_setores', ARRAY['bookplay','pagueplay']::TEXT[], ARRAY['gerencia','diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261105150000: a aba Acordos e o alcance dela valem para bookplay e pagueplay.';

-- ── 2. Na pagueplay, a aba e o alcance nascem iguais aos do Dashboard ───────

CREATE TEMP TABLE _de_para_acordos (acordos TEXT PRIMARY KEY, dashboard TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO _de_para_acordos VALUES
  ('ver_acordos',                  'ver_dashboard'),
  ('acordos_escopo_individual',    'dashboard_escopo_individual'),
  ('acordos_escopo_equipe',        'dashboard_escopo_equipe'),
  ('acordos_escopo_setor',         'dashboard_escopo_setor'),
  ('acordos_escopo_todos_setores', 'dashboard_escopo_todos_setores');

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || COALESCE((
         SELECT jsonb_object_agg(d.acordos, cp.permissoes -> d.dashboard)
           FROM _de_para_acordos d
          WHERE NOT cp.permissoes ? d.acordos AND cp.permissoes ? d.dashboard), '{}'::jsonb)
 WHERE cp.empresa_id IN (SELECT id FROM public.empresas WHERE slug = 'pagueplay');

UPDATE public.cargos_permissoes_setor cs
   SET permissoes = cs.permissoes || COALESCE((
         SELECT jsonb_object_agg(d.acordos, cs.permissoes -> d.dashboard)
           FROM _de_para_acordos d
          WHERE NOT cs.permissoes ? d.acordos AND cs.permissoes ? d.dashboard), '{}'::jsonb)
 WHERE cs.empresa_id IN (SELECT id FROM public.empresas WHERE slug = 'pagueplay');

UPDATE public.perfis_permissoes pr
   SET permissoes = pr.permissoes || COALESCE((
         SELECT jsonb_object_agg(d.acordos, pr.permissoes -> d.dashboard)
           FROM _de_para_acordos d
          WHERE NOT pr.permissoes ? d.acordos AND pr.permissoes ? d.dashboard), '{}'::jsonb)
 WHERE pr.empresa_id IN (SELECT id FROM public.empresas WHERE slug = 'pagueplay');

-- ── 3. Semeia o que faltar (valor gravado manda) ────────────────────────────

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ── 4. Conferência ──────────────────────────────────────────────────────────

DO $$
DECLARE
  v_divergentes TEXT;
BEGIN
  IF (SELECT count(*) FROM public.fn_permissoes_catalogo() c
       WHERE c.chave IN (SELECT acordos FROM _de_para_acordos)
         AND c.tenants = ARRAY['bookplay','pagueplay']::TEXT[]) <> 5 THEN
    RAISE EXCEPTION 'O catálogo não ficou com as cinco chaves da aba Acordos em bookplay e pagueplay.';
  END IF;

  -- Na pagueplay, cada cargo com a aba e o alcance do Dashboard.
  SELECT string_agg(cp.cargo || ':' || d.acordos, ', ') INTO v_divergentes
    FROM public.cargos_permissoes cp
    JOIN public.empresas e ON e.id = cp.empresa_id AND e.slug = 'pagueplay'
    CROSS JOIN _de_para_acordos d
   WHERE cp.permissoes ? d.dashboard
     AND cp.cargo NOT IN ('administrador', 'super_admin')
     AND (cp.permissoes -> d.acordos) IS DISTINCT FROM (cp.permissoes -> d.dashboard);
  IF v_divergentes IS NOT NULL THEN
    RAISE EXCEPTION 'Na pagueplay, a aba Acordos ficou diferente do Dashboard em: %', v_divergentes;
  END IF;

  -- A bookplay não muda: as cinco continuam lá, com valor.
  IF EXISTS (SELECT 1 FROM public.cargos_permissoes cp
               JOIN public.empresas e ON e.id = cp.empresa_id AND e.slug = 'bookplay'
               CROSS JOIN _de_para_acordos d
              WHERE cp.cargo IN ('operador','ouvidoria','lider','elite','gerencia','diretoria')
                AND NOT cp.permissoes ? d.acordos) THEN
    RAISE EXCEPTION 'A bookplay perdeu alguma chave da aba Acordos.';
  END IF;
END $$;

COMMIT;
