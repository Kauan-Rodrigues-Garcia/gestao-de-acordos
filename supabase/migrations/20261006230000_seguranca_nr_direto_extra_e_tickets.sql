-- ============================================================================
-- Segurança: nr_registros e direto_extra_config presas à empresa; anexos de
-- ticket fora do endereço público
-- ============================================================================
--
-- Auditoria de segurança de 06/10/2026, item F (policies lidas no banco):
--
--   nr_registros         tinha as policies certas, presas à empresa
--                        (nr_*_authenticated), e QUATRO antigas com `true`
--                        (nr_registros_select/insert/update/delete). Policy
--                        permissiva SOMA: as antigas abriam a tabela inteira,
--                        de todas as empresas, para leitura e escrita de
--                        qualquer pessoa logada. Saem as antigas; as certas
--                        ficam como estão.
--
--   direto_extra_config  leitura `true` e escrita só pelo cargo (sem empresa;
--                        o UPDATE tinha CHECK `true`). Passa a exigir a
--                        empresa nas quatro, com a mesma régua de
--                        nr_registros (multiempresa ou a própria empresa). O
--                        cargo continua o mesmo: lider, administrador,
--                        super_admin, gerencia.
--
--   balde tickets        público, sem limite: print de chamado com dado de
--                        cliente em endereço aberto. Vira privado; lê e sobe
--                        anexo quem enxerga o ticket (RLS de `tickets`, pela
--                        pasta `empresa/ticket/arquivo`), ou quem tem
--                        `tickets_excluir` (a limpeza de ticket apagado lista
--                        a pasta depois que a linha já saiu). O app mostra o
--                        anexo por link assinado desde o commit desta migration.
--
-- Reaplicável.
--
-- APLICADA em 06/10/2026 pelo SQL Editor (Cleber), conferida pelo MCP e
-- registrada em schema_migrations à mão.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── nr_registros: saem as policies abertas ─────────────────────────────────

DROP POLICY IF EXISTS nr_registros_select ON public.nr_registros;
DROP POLICY IF EXISTS nr_registros_insert ON public.nr_registros;
DROP POLICY IF EXISTS nr_registros_update ON public.nr_registros;
DROP POLICY IF EXISTS nr_registros_delete ON public.nr_registros;

-- ── direto_extra_config: empresa nas quatro ────────────────────────────────

DROP POLICY IF EXISTS direto_extra_config_select ON public.direto_extra_config;
CREATE POLICY direto_extra_config_select ON public.direto_extra_config
FOR SELECT TO authenticated
USING (
  (SELECT public.fn_user_acesso_multiempresa())
  OR empresa_id = (SELECT public.fn_user_empresa_id())
);

DROP POLICY IF EXISTS direto_extra_config_insert ON public.direto_extra_config;
CREATE POLICY direto_extra_config_insert ON public.direto_extra_config
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.fn_user_perfil()) = ANY (ARRAY['lider', 'administrador', 'super_admin', 'gerencia'])
  AND ((SELECT public.fn_user_acesso_multiempresa()) OR empresa_id = (SELECT public.fn_user_empresa_id()))
);

DROP POLICY IF EXISTS direto_extra_config_update ON public.direto_extra_config;
CREATE POLICY direto_extra_config_update ON public.direto_extra_config
FOR UPDATE TO authenticated
USING (
  (SELECT public.fn_user_perfil()) = ANY (ARRAY['lider', 'administrador', 'super_admin', 'gerencia'])
  AND ((SELECT public.fn_user_acesso_multiempresa()) OR empresa_id = (SELECT public.fn_user_empresa_id()))
)
WITH CHECK (
  (SELECT public.fn_user_perfil()) = ANY (ARRAY['lider', 'administrador', 'super_admin', 'gerencia'])
  AND ((SELECT public.fn_user_acesso_multiempresa()) OR empresa_id = (SELECT public.fn_user_empresa_id()))
);

DROP POLICY IF EXISTS direto_extra_config_delete ON public.direto_extra_config;
CREATE POLICY direto_extra_config_delete ON public.direto_extra_config
FOR DELETE TO authenticated
USING (
  (SELECT public.fn_user_perfil()) = ANY (ARRAY['lider', 'administrador', 'super_admin', 'gerencia'])
  AND ((SELECT public.fn_user_acesso_multiempresa()) OR empresa_id = (SELECT public.fn_user_empresa_id()))
);

-- ── balde tickets: privado; lê e sobe quem enxerga o ticket ────────────────

UPDATE storage.buckets SET public = false WHERE id = 'tickets';

DROP POLICY IF EXISTS tickets_anexo_read ON storage.objects;
CREATE POLICY tickets_anexo_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'tickets'
  AND (
    EXISTS (SELECT 1 FROM public.tickets t WHERE t.id::TEXT = (storage.foldername(name))[2])
    OR (SELECT public.fn_user_tem('tickets_excluir'))
  )
);

DROP POLICY IF EXISTS tickets_anexo_write ON storage.objects;
CREATE POLICY tickets_anexo_write ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tickets'
  AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id::TEXT = (storage.foldername(name))[2])
);

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nr_registros'
              AND policyname IN ('nr_registros_select', 'nr_registros_insert', 'nr_registros_update', 'nr_registros_delete')) THEN
    RAISE EXCEPTION 'Sobrou policy aberta em nr_registros.';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nr_registros'
       AND policyname LIKE 'nr\_%\_authenticated') <> 4 THEN
    RAISE EXCEPTION 'As policies certas de nr_registros não estão inteiras.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'direto_extra_config'
              AND (qual = 'true' OR with_check = 'true')) THEN
    RAISE EXCEPTION 'Sobrou policy aberta em direto_extra_config.';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id = 'tickets') THEN
    RAISE EXCEPTION 'O balde tickets continua público.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'tickets_anexo_read'
              AND 'public' = ANY (roles)) THEN
    RAISE EXCEPTION 'A leitura de anexo de ticket continua para public.';
  END IF;
END
$prova$;

COMMIT;
