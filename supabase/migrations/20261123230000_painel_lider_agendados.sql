-- ============================================================================
-- Painel Líder: aba «Agendados» (23/11/2026)
-- ============================================================================
--
-- A agenda dos acordos por vencimento, pessoa a pessoa: o que vence hoje,
-- amanhã e nos próximos dias, e como foi o que já venceu (pago, a verificar,
-- não pago, conversão).
--
-- A aba não cria tabela nem função: lê `acordos` com a RLS de sempre, no
-- alcance do próprio Painel Líder (`painel_lider_escopo_*`). Só ganha a chave
-- que a abre, como toda aba interna do painel:
--
--   painel_lider_sub_agendados ... nasce LIGADA para a liderança (lider, elite,
--                                  gerencia, diretoria), igual às outras abas
--                                  do painel. Administrador e super_admin por
--                                  acesso total.
--
-- A semeadura só escreve a chave onde ela FALTA: nenhum valor já configurado
-- em Admin → Cargos muda. Mapa próprio de setor não precisa de nada — ele é
-- somado por cima do mapa do cargo, e a chave ausente nele vem do cargo.
--
-- Pode rodar de novo: a cadeia `_antes_` só renomeia uma vez.
--
-- Reverter: renomear `fn_permissoes_catalogo_antes_agendados_20261123` de
-- volta para `fn_permissoes_catalogo` (depois de apagar a atual) e tirar a
-- chave dos mapas:
--   update public.cargos_permissoes set permissoes = permissoes - 'painel_lider_sub_agendados';
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. A chave no catálogo ──────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_agendados_20261123()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_agendados_20261123;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_agendados_20261123() IS
  'Retrato do catalogo antes da aba Agendados do Painel Lider (23/11/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_agendados_20261123() c
   WHERE c.chave <> 'painel_lider_sub_agendados'
  UNION ALL
  SELECT * FROM (VALUES
    ('painel_lider_sub_agendados', NULL::TEXT[], ARRAY['lider', 'elite', 'gerencia', 'diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261123230000 soma painel_lider_sub_agendados.';

-- ── 2. Semear ───────────────────────────────────────────────────────────────
--
-- `fn_permissoes_semear_empresa` preserva todo valor já gravado e só preenche
-- a chave nova, com o padrão do catálogo.

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- Cargo fora da lista da semeadura (rh, ou algum gravado à mão): só a chave,
-- com o padrão do catálogo — que, para esses cargos, é desligada.
UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
         'painel_lider_sub_agendados',
         cp.cargo = ANY (ARRAY['lider', 'elite', 'gerencia', 'diretoria']))
 WHERE cp.cargo NOT IN ('administrador', 'super_admin')
   AND NOT (cp.permissoes ? 'painel_lider_sub_agendados');

-- ── 3. Prova ────────────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF (SELECT count(*) FROM public.fn_permissoes_catalogo() c
       WHERE c.chave = 'painel_lider_sub_agendados') <> 1 THEN
    RAISE EXCEPTION 'painel_lider_sub_agendados nao entrou no catalogo (ou entrou duas vezes).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'painel_lider_sub_quartis')
     OR NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_banco_horas') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: chaves antigas sumiram.';
  END IF;
  -- Todo cargo de liderança que tem o Painel Líder ganhou a chave.
  IF EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp
     WHERE cp.cargo IN ('lider', 'elite', 'gerencia', 'diretoria')
       AND NOT (cp.permissoes ? 'painel_lider_sub_agendados')
  ) THEN
    RAISE EXCEPTION 'Algum cargo de lideranca ficou sem painel_lider_sub_agendados.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261123230000', 'painel_lider_agendados', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
--   select chave, tenants, padrao from public.fn_permissoes_catalogo()
--    where chave = 'painel_lider_sub_agendados';
--   select e.slug, cp.cargo, cp.permissoes->'painel_lider_sub_agendados' as agendados
--     from public.cargos_permissoes cp join public.empresas e on e.id = cp.empresa_id
--    order by 1, 2;
