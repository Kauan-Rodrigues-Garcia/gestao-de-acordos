-- ============================================================================
-- RLS: a função de permissão roda UMA vez por consulta, não uma por linha
-- 09/10/2026
-- ============================================================================
--
-- Investigação das quedas de 09/10 (memória da máquina no limite): a lista de
-- `nr_registros` levava ~1 s por chamada, 7,4% de todo o tempo do banco.
-- EXPLAIN ANALYZE como operador: 952 ms dos 960 ms eram o filtro
-- `fn_user_acesso_multiempresa()` avaliado para cada uma das 6.241 linhas.
--
-- Chamada nua de função na policy é reavaliada linha a linha; dentro de
-- `(SELECT …)` o Postgres a calcula uma vez (InitPlan). As funções daqui são
-- todas STABLE e sem argumento de coluna — o resultado é o mesmo, só o custo
-- muda. Mesma regra já registrada em 09/30 («Como escrever policy aqui»).
--
-- `ALTER POLICY` troca só a expressão: nome, comando, papéis e PERMISSIVE
-- ficam. As expressões abaixo são as de `pg_policies` em 09/10/2026, com as
-- funções embrulhadas — nada além disso mudou.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── nr_registros (a lista de NR) ────────────────────────────────────────────

ALTER POLICY nr_select_authenticated ON public.nr_registros
  USING (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id IN (SELECT perfis.empresa_id FROM public.perfis WHERE perfis.id = (SELECT auth.uid())))));

ALTER POLICY nr_insert_authenticated ON public.nr_registros
  WITH CHECK (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id IN (SELECT perfis.empresa_id FROM public.perfis WHERE perfis.id = (SELECT auth.uid())))));

ALTER POLICY nr_update_authenticated ON public.nr_registros
  USING (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id IN (SELECT perfis.empresa_id FROM public.perfis WHERE perfis.id = (SELECT auth.uid())))))
  WITH CHECK (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id IN (SELECT perfis.empresa_id FROM public.perfis WHERE perfis.id = (SELECT auth.uid())))));

ALTER POLICY nr_delete_authenticated ON public.nr_registros
  USING (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id IN (SELECT perfis.empresa_id FROM public.perfis WHERE perfis.id = (SELECT auth.uid())))));

-- ── Leituras frequentes com o mesmo defeito ─────────────────────────────────

ALTER POLICY cargos_select_empresa ON public.cargos_permissoes
  USING (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id IN (SELECT perfis.empresa_id FROM public.perfis WHERE perfis.id = (SELECT auth.uid())))));

ALTER POLICY composicao_mes_leitura ON public.composicao_mes
  USING (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id = (SELECT p.empresa_id FROM public.perfis p WHERE p.id = (SELECT auth.uid())))));

ALTER POLICY composicao_mes_equipe_leitura ON public.composicao_mes_equipe
  USING (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id = (SELECT p.empresa_id FROM public.perfis p WHERE p.id = (SELECT auth.uid())))));

ALTER POLICY composicao_mes_lider_leitura ON public.composicao_mes_lider
  USING (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id = (SELECT p.empresa_id FROM public.perfis p WHERE p.id = (SELECT auth.uid())))));

ALTER POLICY composicao_mes_setor_leitura ON public.composicao_mes_setor
  USING (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id = (SELECT p.empresa_id FROM public.perfis p WHERE p.id = (SELECT auth.uid())))));

ALTER POLICY lixeira_acordos_select_empresa ON public.lixeira_acordos
  USING (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id IN (SELECT perfis.empresa_id FROM public.perfis WHERE perfis.id = (SELECT auth.uid())))));

ALTER POLICY lixeira_insert_empresa_2026 ON public.lixeira_acordos
  WITH CHECK (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id IN (SELECT perfis.empresa_id FROM public.perfis WHERE perfis.id = (SELECT auth.uid())))));

ALTER POLICY notificacoes_insert_empresa_2026 ON public.notificacoes
  WITH CHECK (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id IN (SELECT perfis.empresa_id FROM public.perfis WHERE perfis.id = (SELECT auth.uid())))));

ALTER POLICY prof_select ON public.profissionais
  USING (((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id = (SELECT perfis.empresa_id FROM public.perfis WHERE perfis.id = (SELECT auth.uid())))));

ALTER POLICY chat_disparos_select ON public.chat_disparos
  USING (((autor_id = (SELECT auth.uid())) AND (SELECT public.fn_chat_pode_usar())));

-- ── Escritas (raras, mas pela mesma regra) ──────────────────────────────────

ALTER POLICY acordos_delete_own ON public.acordos
  USING ((((SELECT public.fn_user_acesso_multiempresa()) OR (empresa_id = (SELECT public.fn_user_empresa_id()))) AND (operador_id = (SELECT auth.uid()))));

ALTER POLICY cargos_insert ON public.cargos
  WITH CHECK ((SELECT public.fn_user_is_super_admin()));

ALTER POLICY cargos_update ON public.cargos
  USING ((SELECT public.fn_user_is_super_admin()))
  WITH CHECK ((SELECT public.fn_user_is_super_admin()));

ALTER POLICY desafios_delete ON public.desafios
  USING ((((empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])) OR (SELECT public.fn_user_is_super_admin()))
    AND ((SELECT public.fn_user_tem('administrar_sistema'::text)) OR (SELECT public.fn_user_tem('desafios_excluir'::text))
      OR ((SELECT public.fn_user_tem('desafios_configurar_setor'::text)) AND (setor_id IS NOT NULL) AND (setor_id = (SELECT public.fn_user_setor_id()))))));

ALTER POLICY desafios_update ON public.desafios
  USING ((((empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])) OR (SELECT public.fn_user_is_super_admin()))
    AND ((SELECT public.fn_user_tem('desafios_configurar'::text))
      OR ((SELECT public.fn_user_tem('desafios_configurar_setor'::text)) AND (setor_id IS NOT NULL) AND (setor_id = (SELECT public.fn_user_setor_id()))))))
  WITH CHECK ((((empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])) OR (SELECT public.fn_user_is_super_admin()))
    AND ((SELECT public.fn_user_tem('desafios_configurar'::text))
      OR ((SELECT public.fn_user_tem('desafios_configurar_setor'::text)) AND (setor_id IS NOT NULL) AND (setor_id = (SELECT public.fn_user_setor_id()))))
    AND ((cardinality(COALESCE(empresas, '{}'::uuid[])) = 0) OR (empresas <@ ARRAY[empresa_id]) OR (SELECT public.fn_user_tem('desafios_multiempresa'::text)))));

ALTER POLICY tickets_insert ON public.tickets
  WITH CHECK ((((empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])) OR (SELECT public.fn_user_is_super_admin()))
    AND (aberto_por = (SELECT auth.uid())) AND (SELECT public.fn_ticket_pode_abrir())));

ALTER POLICY tickets_update ON public.tickets
  USING ((public.fn_ticket_visivel(empresa_id, setor_id, aberto_por) AND ((SELECT public.fn_ticket_pode_atender()) OR (aberto_por = (SELECT auth.uid())))))
  WITH CHECK ((public.fn_ticket_visivel(empresa_id, setor_id, aberto_por) AND ((SELECT public.fn_ticket_pode_atender()) OR (aberto_por = (SELECT auth.uid())))));

-- ── Verificação: nenhuma função sem argumento ficou nua numa policy ──────────

DO $verificacao$
DECLARE v_resto TEXT;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_resto
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) ~ '(?<!SELECT )(fn_[a-z_]+|auth\.uid|auth\.jwt)\(\)';
  IF v_resto IS NOT NULL THEN
    RAISE EXCEPTION 'Ainda há função avaliada por linha em: %', v_resto;
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261009200000', 'rls_funcao_uma_vez_por_consulta', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
