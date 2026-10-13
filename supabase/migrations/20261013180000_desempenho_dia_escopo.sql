-- O painel Desempenho do Dia ganha o PRÓPRIO alcance, 13/10/2026.
--
-- Até aqui ele lia os níveis do Dashboard (`dashboard_escopo_*`). Na BookPlay
-- o operador tem `dashboard_escopo_setor` e `_equipe` (20260903220000), e com
-- eles o painel do dia abria no recebimento da equipe ou do setor — quando o
-- que o operador quer ver ali é o próprio recebimento.
--
-- Desligar os níveis do Dashboard para o operador estreitaria o Dashboard
-- junto. Então o painel ganha quatro chaves só dele, que o painel de
-- Permissões mostra no card do Dashboard, na seção «Desempenho do Dia: quem vê»:
--
--   desempenho_dia_escopo_individual
--   desempenho_dia_escopo_equipe
--   desempenho_dia_escopo_setor
--   desempenho_dia_escopo_todos_setores
--
-- ## Ninguém muda de alcance, menos o operador
--
-- Cada cargo recebe nas chaves novas o valor que já tinha no Dashboard — o
-- painel continua mostrando o que mostrava. A exceção é o pedido: o operador
-- fica só com o individual.
--
-- As exceções por pessoa (`perfis_permissoes`) com nível de Dashboard são
-- copiadas do mesmo jeito, menos para quem é operador.
--
-- ## Antes desta migration
--
-- O app só passa a ler as chaves novas quando ao menos uma está gravada para a
-- pessoa (`niveisDoPainelDoDia`). Até lá vale a régua antiga, a do Dashboard.

BEGIN;

-- ── 1. O catálogo ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_desempenho_dia_20261013()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_desempenho_dia_20261013;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_desempenho_dia_20261013() IS
  'Retrato do catalogo antes de desempenho_dia_escopo_* (13/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_desempenho_dia_20261013()
  UNION ALL
  SELECT * FROM (VALUES
    -- Os padrões repetem os do Dashboard. Empresa nova nasce com eles.
    ('desempenho_dia_escopo_individual',    NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[], false),
    ('desempenho_dia_escopo_equipe',        NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('desempenho_dia_escopo_setor',         NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('desempenho_dia_escopo_todos_setores', NULL::TEXT[], ARRAY['gerencia','diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261013180000 soma desempenho_dia_escopo_*.';

-- ── 2. Cada cargo herda o valor do Dashboard; o operador fica no individual ─

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || CASE
     WHEN cp.cargo = 'operador' THEN jsonb_build_object(
       'desempenho_dia_escopo_individual',    true,
       'desempenho_dia_escopo_equipe',        false,
       'desempenho_dia_escopo_setor',         false,
       'desempenho_dia_escopo_todos_setores', false)
     ELSE jsonb_build_object(
       'desempenho_dia_escopo_individual',    COALESCE((cp.permissoes ->> 'dashboard_escopo_individual')::boolean, false),
       'desempenho_dia_escopo_equipe',        COALESCE((cp.permissoes ->> 'dashboard_escopo_equipe')::boolean, false),
       'desempenho_dia_escopo_setor',         COALESCE((cp.permissoes ->> 'dashboard_escopo_setor')::boolean, false),
       'desempenho_dia_escopo_todos_setores', COALESCE((cp.permissoes ->> 'dashboard_escopo_todos_setores')::boolean, false))
   END
 WHERE NOT (cp.permissoes ? 'desempenho_dia_escopo_individual');

-- ── 3. Exceções por pessoa: só os níveis que a pessoa já tinha no Dashboard ─

UPDATE public.perfis_permissoes pp
   SET permissoes = pp.permissoes || (
     SELECT COALESCE(jsonb_object_agg('desempenho_dia_escopo_' || nivel, pp.permissoes -> ('dashboard_escopo_' || nivel)), '{}'::jsonb)
       FROM unnest(ARRAY['individual','equipe','setor','todos_setores']) AS nivel
      WHERE pp.permissoes ? ('dashboard_escopo_' || nivel)
   )
  FROM public.perfis p
 WHERE p.id = pp.usuario_id
   AND p.perfil IS DISTINCT FROM 'operador'
   AND (pp.permissoes ?| ARRAY['dashboard_escopo_individual','dashboard_escopo_equipe',
                               'dashboard_escopo_setor','dashboard_escopo_todos_setores'])
   AND NOT (pp.permissoes ?| ARRAY['desempenho_dia_escopo_individual','desempenho_dia_escopo_equipe',
                                   'desempenho_dia_escopo_setor','desempenho_dia_escopo_todos_setores']);

-- ── 4. Cargo que ainda não tinha linha nasce no padrão do catálogo ─────────

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ── 5. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF (SELECT count(*) FROM public.fn_permissoes_catalogo() c
       WHERE c.chave LIKE 'desempenho_dia_escopo_%') <> 4 THEN
    RAISE EXCEPTION 'As quatro chaves novas nao entraram no catalogo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_campanhas_whatsapp') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: chaves antigas sumiram.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp
     WHERE cp.cargo = 'operador'
       AND (   (cp.permissoes ->> 'desempenho_dia_escopo_equipe')::boolean
            OR (cp.permissoes ->> 'desempenho_dia_escopo_setor')::boolean
            OR (cp.permissoes ->> 'desempenho_dia_escopo_todos_setores')::boolean)
  ) THEN
    RAISE EXCEPTION 'Algum operador ficou com alcance alem do individual no painel do dia.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp
     WHERE cp.cargo NOT IN ('operador', 'administrador', 'super_admin')
       AND (   (cp.permissoes ->> 'desempenho_dia_escopo_setor')::boolean
                 IS DISTINCT FROM COALESCE((cp.permissoes ->> 'dashboard_escopo_setor')::boolean, false)
            OR (cp.permissoes ->> 'desempenho_dia_escopo_equipe')::boolean
                 IS DISTINCT FROM COALESCE((cp.permissoes ->> 'dashboard_escopo_equipe')::boolean, false))
  ) THEN
    RAISE EXCEPTION 'Algum cargo mudou de alcance no painel do dia sem ter sido pedido.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261013180000', 'desempenho_dia_escopo', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
