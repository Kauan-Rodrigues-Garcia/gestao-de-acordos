-- ============================================================================
-- equipe_membros: a policy de leitura calcula as empresas UMA vez por consulta
-- ============================================================================
--
-- Auditoria de 05/10/2026: listar `equipe_membros` de uma empresa levava 330 ms
-- em média (4.509 chamadas em 5 dias), numa tabela de 434 linhas. A policy era
--
--     USING (fn_can_access_empresa(empresa_id))
--
-- — uma chamada por LINHA, e cada chamada consulta perfis e concessões.
--
-- `fn_empresas_acessiveis()` é, por definição, a lista das empresas em que
-- `fn_can_access_empresa` dá verdadeiro. Dentro de `(SELECT ...)` o Postgres
-- calcula a lista uma vez e compara cada linha contra ela: quem enxerga o quê
-- não muda. Mesma forma da policy de `analitico_removidos` e da regra do
-- projeto (TO authenticated explícito; função em `(SELECT ...)`).
--
-- Reexecutável. Nenhuma linha de dado muda.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

DROP POLICY IF EXISTS equipe_membros_select_empresa ON public.equipe_membros;
CREATE POLICY equipe_membros_select_empresa ON public.equipe_membros
  FOR SELECT
  TO authenticated
  USING (empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[]));

DO $prova$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'equipe_membros'
                    AND policyname = 'equipe_membros_select_empresa'
                    AND qual LIKE '%fn_empresas_acessiveis%') THEN
    RAISE EXCEPTION 'policy de equipe_membros não ficou na forma nova';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.equipe_membros'::regclass) THEN
    RAISE EXCEPTION 'equipe_membros ficou sem RLS';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261005210000', 'equipe_membros_policy_por_consulta')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT policyname, roles::text, qual FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'equipe_membros';
