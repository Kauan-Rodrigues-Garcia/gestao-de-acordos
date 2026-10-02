-- ============================================================================
-- Comercial: a aba IAs ganha chaves PROPRIAS no painel, e escopo por setor
-- ============================================================================
--
-- Pedido de 02/10/2026:
--   «Permissões: não estou a localizar a permissão em usuários sobre a IA para
--    permitir ou não vincular»
--   «o setor Performance está a ver a IA das vendas BookPlay, porém não é para
--    ser assim: cada setor vê o próprio, só caso alterado nas permissões»
--
-- Ate aqui a aba IAs (Usuarios > IAs, 20261001150000) nao tinha chave: abria
-- para quem via a lista de usuarios, mostrava TODA IA da empresa, e vincular
-- pedia `usuarios_editar_cargo` — uma chave de outro assunto, que ninguem
-- procuraria para isso.
--
-- Chaves novas, todas so do Comercial:
--
--   ver_ias_vendas           abre a aba IAs              lideranca
--   ias_escopo_setor         ve as IAs do proprio setor  lider, elite
--   ias_escopo_todos_setores ve as IAs de todo setor     gerencia, diretoria
--   vincular_ias_vendas      vincular, trocar, desvincular e definir o tipo
--
-- `vincular_ias_vendas` NAO nasce no padrao do catalogo nos cargos que ja
-- existem: nasce com o valor que `usuarios_editar_cargo` tem hoje no cargo.
-- Quem vinculava ontem continua vinculando; quem nao podia continua sem poder.
-- Empresa nova (sem cargo gravado) segue o padrao: gerencia e diretoria.
--
-- O escopo entra em `fn_abas_escopo` como aba `ias`, e `fn_user_escopo('ias')`
-- passa a responder 2 (setor) ou 3 (todos). As RPCs que usam isso estao na
-- migration seguinte (20261002160000).
--
-- ## Renomear, nao reescrever
--
-- `fn_permissoes_catalogo` e `fn_abas_escopo` sao RENOMEADAS para o elo
-- `_antes_ias_20261002` e redefinidas por cima. Copiar o corpo exigiria
-- confiar que o arquivo e o que roda em producao — e o CLAUDE.md, § Migrations,
-- diz que nao e garantido. Renomear preserva o corpo que existe, seja qual for.
--
-- Rodar de novo: o DO de cada renomeacao so renomeia se o elo ainda nao existe.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. Catalogo de permissoes
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_ias_20261002()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_ias_20261002;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_ias_20261002() IS
  'Retrato do catalogo antes das chaves da aba IAs do Comercial (02/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_ias_20261002()
  UNION ALL
  SELECT * FROM (VALUES
    ('ver_ias_vendas',           ARRAY['comercial']::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('ias_escopo_setor',         ARRAY['comercial']::TEXT[], ARRAY['lider','elite']::TEXT[], false),
    ('ias_escopo_todos_setores', ARRAY['comercial']::TEXT[], ARRAY['gerencia','diretoria']::TEXT[], false),
    ('vincular_ias_vendas',      ARRAY['comercial']::TEXT[], ARRAY['gerencia','diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. A extensao 20261002150000 adiciona as chaves da aba IAs '
  'do Comercial (ver_ias_vendas, ias_escopo_*, vincular_ias_vendas).';

-- ============================================================================
-- 2. A aba `ias` no registro de escopo
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.fn_abas_escopo_antes_ias_20261002()') IS NULL THEN
    ALTER FUNCTION public.fn_abas_escopo() RENAME TO fn_abas_escopo_antes_ias_20261002;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_abas_escopo()
RETURNS TABLE(aba TEXT, chave_aba TEXT)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT a.aba, a.chave_aba
    FROM public.fn_abas_escopo_antes_ias_20261002() a
   WHERE a.aba <> 'ias'
  UNION ALL
  VALUES ('ias', 'ver_ias_vendas');
$function$;

COMMENT ON FUNCTION public.fn_abas_escopo() IS
  'Registro de abas com escopo. `ias` entrou em 20261002150000 (aba IAs do '
  'Comercial, niveis setor e todos_setores).';

-- ============================================================================
-- 3. Semear, preservando quem ja vinculava
-- ============================================================================
--
-- ANTES de semear: nos cargos do Comercial que ainda nao tem a chave, o
-- vinculo herda o que a tela usava ate hoje (`usuarios_editar_cargo`). Depois
-- a semeadura completa o resto com o padrao — e, como a chave ja esta
-- gravada, ela mantem o valor herdado.

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes
         || CASE WHEN cp.permissoes ? 'vincular_ias_vendas' THEN '{}'::jsonb
                 ELSE jsonb_build_object('vincular_ias_vendas',
                        COALESCE((cp.permissoes ->> 'usuarios_editar_cargo')::boolean, false))
            END
 WHERE cp.empresa_id IN (SELECT e.id FROM public.empresas e WHERE e.slug = 'comercial')
   AND cp.cargo NOT IN ('administrador', 'super_admin')
   AND NOT (cp.permissoes ? 'vincular_ias_vendas');

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- `fn_permissoes_semear_empresa` so percorre os nove cargos conhecidos. Um
-- cargo gravado fora dessa lista (achado em producao em 02/10/2026: um no
-- Comercial) nao e tocado e ficaria sem as chaves. Completa aqui so as que
-- FALTAM, com o padrao do catalogo — cargo fora do padrao nasce negado.
UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || (
         SELECT COALESCE(jsonb_object_agg(c.chave, cp.cargo = ANY (COALESCE(c.padrao, ARRAY[]::TEXT[]))), '{}'::jsonb)
           FROM public.fn_permissoes_catalogo() c
          WHERE c.chave IN ('ver_ias_vendas', 'ias_escopo_setor', 'ias_escopo_todos_setores', 'vincular_ias_vendas')
            AND NOT (cp.permissoes ? c.chave)
       )
 WHERE cp.empresa_id IN (SELECT e.id FROM public.empresas e WHERE e.slug = 'comercial')
   AND NOT (cp.permissoes ? 'ver_ias_vendas' AND cp.permissoes ? 'vincular_ias_vendas'
            AND cp.permissoes ? 'ias_escopo_setor' AND cp.permissoes ? 'ias_escopo_todos_setores');

-- ============================================================================
-- 4. Verificacao
-- ============================================================================

DO $verificacao$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM public.fn_permissoes_catalogo() c
   WHERE c.chave IN ('ver_ias_vendas', 'ias_escopo_setor', 'ias_escopo_todos_setores', 'vincular_ias_vendas');
  IF n <> 4 THEN
    RAISE EXCEPTION 'Esperava 4 chaves novas no catalogo, achei %.', n;
  END IF;

  -- O elo de baixo nao pode ter se perdido: as chaves de antes continuam la.
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'acordos_autorizar_tornar_direto')
     OR NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_vendas') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: chaves antigas sumiram.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fn_abas_escopo() a WHERE a.aba = 'ias' AND a.chave_aba = 'ver_ias_vendas') THEN
    RAISE EXCEPTION 'fn_abas_escopo nao conhece a aba ias.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_abas_escopo() a WHERE a.aba = 'vendas')
     OR NOT EXISTS (SELECT 1 FROM public.fn_abas_escopo() a WHERE a.aba = 'acordos') THEN
    RAISE EXCEPTION 'fn_abas_escopo perdeu abas antigas.';
  END IF;

  -- Toda empresa do Comercial com cargo gravado tem as quatro chaves.
  SELECT COUNT(*) INTO n
    FROM public.cargos_permissoes cp
    JOIN public.empresas e ON e.id = cp.empresa_id AND e.slug = 'comercial'
   WHERE NOT (cp.permissoes ? 'ver_ias_vendas' AND cp.permissoes ? 'vincular_ias_vendas'
              AND cp.permissoes ? 'ias_escopo_setor' AND cp.permissoes ? 'ias_escopo_todos_setores');
  IF n > 0 THEN
    RAISE EXCEPTION '% cargo(s) do Comercial ficaram sem as chaves das IAs.', n;
  END IF;
END;
$verificacao$;

COMMIT;
