-- ============================================================================
-- RLS: a empresa acessivel e calculada UMA vez por consulta, nao por linha
-- ============================================================================
--
-- ## O achado (30/09/2026, ~200 pessoas online, RAM 88%)
--
-- 131 policies em 76 tabelas perguntam `fn_can_access_empresa(empresa_id)`.
-- A funcao recebe a COLUNA, entao o PostgreSQL a executa para cada linha — e
-- o `( SELECT ... )` em volta, que em outras policies vira InitPlan, aqui nao
-- ajuda: com a coluna dentro ele vira SubPlan correlacionado, uma vez por linha.
--
-- Cada execucao le `perfis` duas vezes e, quando a linha e de OUTRA empresa,
-- chama `fn_user_tem('acesso_multiempresa_permitido')`, que monta o catalogo
-- inteiro de permissoes (228 chaves). Medido como operador da BookPlay:
--
--   pix_automatico_acordos   2.436 linhas lidas   819 ms   (81 visiveis)
--   metas                      666 linhas         377 ms   (0,7 ms por linha)
--   equipe_lideres              52 linhas         100 ms   (2,5 ms por linha)
--
-- Em pg_stat_statements, na janela de 50 min: a leitura de Pix 187 x 720 ms,
-- metas 785 x 114 ms, clones 550 x 93 ms, lideres 549 x 53 ms. Nao e falta de
-- memoria (cache hit 99,95 %, zero spill em disco, 37 de 90 conexoes): e CPU
-- gasta repetindo a mesma pergunta — «quais empresas esta pessoa enxerga?» —
-- milhares de vezes por consulta.
--
-- ## A troca
--
--   fn_can_access_empresa(X)
--     →  (X = ANY ((SELECT fn_empresas_acessiveis())::uuid[])
--         OR (SELECT fn_user_is_super_admin()))
--
-- `fn_empresas_acessiveis()` nao tem argumento: vira InitPlan, roda UMA vez
-- por consulta e devolve o conjunto. E ela e montada chamando a propria
-- `fn_can_access_empresa` em cada empresa — a regra continua morando num lugar
-- so, e a equivalencia e exata:
--
--   • X de uma empresa existente → X esta no conjunto sse fn_can_access_empresa(X);
--   • X nulo → antes: super_admin OR nulo; agora: nulo OR super_admin. Igual;
--   • X de empresa inexistente → so super_admin passava; continua so ele.
--
-- De carona, o `fn_user_is_super_admin()` SOLTO (sem SELECT em volta) de 8
-- policies — entre elas `notificacoes_own`, sobre 102 mil linhas — ganha o
-- SELECT e vira InitPlan tambem.
--
-- ## Seguranca da troca
--
-- • A reescrita e textual sobre `pg_policies`, com um padrao que so casa
--   argumento que e nome de coluna (conferido: 34 formas, todas `col` ou
--   `tabela.col`). Qualquer outra forma falha no ALTER e desfaz tudo.
-- • O texto original de cada policy fica em
--   `rls_policies_backup_20260930` (so postgres le), para voltar se preciso.
-- • `lock_timeout` curto: ALTER POLICY pede lock exclusivo por um instante;
--   se alguma tabela estiver ocupada, a migration desiste inteira em vez de
--   enfileirar as leituras de todo mundo atras dela.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- ── 1. O conjunto, calculado uma vez ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_empresas_acessiveis()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(e.id), '{}'::uuid[])
    FROM public.empresas e
   WHERE public.fn_can_access_empresa(e.id);
$function$;

COMMENT ON FUNCTION public.fn_empresas_acessiveis() IS
  'Empresas que quem esta logado enxerga — fn_can_access_empresa aplicada a cada '
  'empresa. Sem argumento, para as policies a chamarem UMA vez por consulta '
  '(InitPlan) em vez de uma vez por linha. Ver 20260930160000.';

REVOKE ALL ON FUNCTION public.fn_empresas_acessiveis() FROM PUBLIC;
-- anon tambem: o Realtime reavalia as policies no papel do assinante
-- (20260901110000), e as outras primitivas ja sao concedidas a ele.
GRANT EXECUTE ON FUNCTION public.fn_empresas_acessiveis() TO authenticated, anon;

-- ── 2. Guardar o original ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rls_policies_backup_20260930 (
  tabela     text NOT NULL,
  policy     text NOT NULL,
  qual       text,
  with_check text,
  salvo_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tabela, policy)
);
ALTER TABLE public.rls_policies_backup_20260930 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rls_policies_backup_20260930 FROM anon, authenticated;

COMMENT ON TABLE public.rls_policies_backup_20260930 IS
  'Texto das policies ANTES da troca de fn_can_access_empresa(col) pelo conjunto '
  'calculado uma vez (20260930160000). Para reverter: ALTER POLICY ... USING (qual) '
  'WITH CHECK (with_check). Pode ser apagada quando a troca estiver assentada.';

INSERT INTO public.rls_policies_backup_20260930 (tabela, policy, qual, with_check)
SELECT tablename, policyname, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public'
   AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~ 'fn_can_access_empresa\('
ON CONFLICT (tabela, policy) DO NOTHING;

-- ── 3. A reescrita ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.reescrever(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(t,
             'fn_can_access_empresa\(([A-Za-z_][A-Za-z0-9_.]*)\)',
             '(\1 = ANY ((SELECT fn_empresas_acessiveis())::uuid[]) OR (SELECT fn_user_is_super_admin()))',
             'g'),
           '(?<!SELECT )fn_user_is_super_admin\(\)',
           '(SELECT fn_user_is_super_admin())',
           'g');
$$;

DO $$
DECLARE
  p   record;
  sql text;
  n   integer := 0;
BEGIN
  FOR p IN
    SELECT tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~ 'fn_can_access_empresa\('
     ORDER BY tablename, policyname
  LOOP
    sql := format('ALTER POLICY %I ON public.%I', p.policyname, p.tablename);
    IF p.qual IS NOT NULL THEN
      sql := sql || format(' USING (%s)', pg_temp.reescrever(p.qual));
    END IF;
    IF p.with_check IS NOT NULL THEN
      sql := sql || format(' WITH CHECK (%s)', pg_temp.reescrever(p.with_check));
    END IF;
    EXECUTE sql;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'policies reescritas: %', n;
END $$;

-- ── 4. Prova ────────────────────────────────────────────────────────────────

DO $$
DECLARE v_resto integer; v_backup integer;
BEGIN
  SELECT count(*) INTO v_resto FROM pg_policies
   WHERE schemaname = 'public'
     AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~ 'fn_can_access_empresa\(';
  IF v_resto > 0 THEN
    RAISE EXCEPTION '% policies ainda chamam fn_can_access_empresa por linha', v_resto;
  END IF;

  SELECT count(*) INTO v_backup FROM public.rls_policies_backup_20260930;
  IF v_backup = 0 THEN
    RAISE EXCEPTION 'backup das policies vazio';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fn_empresas_acessiveis()', 'execute') THEN
    RAISE EXCEPTION 'fn_empresas_acessiveis sem acesso para authenticated';
  END IF;
END $$;

COMMIT;
