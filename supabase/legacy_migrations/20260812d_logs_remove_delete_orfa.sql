-- ═══════════════════════════════════════════════════════════════════════════
-- LOGS — remove a política de DELETE que sobrou fora do repositório
-- ═══════════════════════════════════════════════════════════════════════════
-- Encontrada em 12/08/2026, conferindo o banco de produção depois de aplicar a
-- 20260812a:
--
--   logs_sis_delete_admin  ON public.logs_sistema  FOR DELETE
--   USING (EXISTS (SELECT 1 FROM perfis p
--                   WHERE p.id = auth.uid()
--                     AND p.perfil = ANY (ARRAY['administrador','super_admin'])))
--
-- Ela não está em nenhuma migration — foi criada direto no SQL Editor. Duas
-- consequências:
--
-- 1. CORRIGE UMA AFIRMAÇÃO ERRADA. A 20260812a dizia que o botão "Limpar Logs"
--    da versão 1.0 nunca havia apagado nada, "porque a tabela não tinha política
--    de DELETE". Tinha — esta. Com o GRANT padrão da Supabase somado a ela, o
--    botão apagava a trilha inteira da empresa de verdade. Nada chegou a ser
--    perdido (o log mais antigo é de 01/04/2026, começo do projeto), mas a
--    afirmação era falsa e está corrigida no cabeçalho daquela migration.
--
-- 2. É UMA ARMADILHA ADORMECIDA. Hoje ela não faz nada: a 20260812a executou
--    `REVOKE UPDATE, DELETE ON logs_sistema FROM authenticated`, e política não
--    concede privilégio — sem o privilégio na tabela, a política não tem efeito.
--    Mas basta um `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated`
--    (linha comum em script de manutenção, e que a Supabase aplica por padrão a
--    tabelas novas) para a exclusão de log voltar a funcionar em silêncio,
--    contra a garantia append-only que a tela e a documentação anunciam.
--
-- Apagar log continua existindo — pela `fn_logs_expurgar`, que exige
-- super_admin, recusa retenção abaixo de 30 dias e registra o próprio expurgo.
-- O que deixa de existir é o caminho sem regra e sem rastro.
--
-- Idempotente.

DROP POLICY IF EXISTS "logs_sis_delete_admin" ON public.logs_sistema;

-- ─── Conferência ────────────────────────────────────────────────────────────
-- Falha alto se sobrar qualquer caminho de UPDATE/DELETE na trilha: é uma
-- garantia que a tela promete ao usuário ("nenhum evento pode ser editado ou
-- apagado individualmente, nem por administrador"), e promessa de auditoria que
-- não se verifica não vale nada.
DO $$
DECLARE
  v_politicas INT;
  v_upd       BOOLEAN := false;
  v_del       BOOLEAN := false;
BEGIN
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename  = 'logs_sistema'
     AND cmd IN ('UPDATE', 'DELETE', 'ALL');

  IF v_politicas > 0 THEN
    RAISE EXCEPTION
      'logs_sistema ainda tem % política(s) de UPDATE/DELETE/ALL — a trilha '
      'deveria ser append-only (ver 20260812a).', v_politicas;
  END IF;

  BEGIN
    v_upd := has_table_privilege('authenticated', 'public.logs_sistema', 'UPDATE');
    v_del := has_table_privilege('authenticated', 'public.logs_sistema', 'DELETE');
  EXCEPTION WHEN undefined_object THEN
    NULL;  -- banco local sem o papel `authenticated`
  END;

  IF v_upd OR v_del THEN
    RAISE WARNING
      'authenticated tem UPDATE=% DELETE=% em logs_sistema. Algum GRANT devolveu '
      'o privilégio; refaça o REVOKE da 20260812a.', v_upd, v_del;
  END IF;

  RAISE NOTICE 'logs_sistema: append-only confirmado (sem política de escrita, sem privilégio).';
END $$;
