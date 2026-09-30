-- ============================================================================
-- Aparelhos inscritos para o aviso de pagamento (PWA) — Etapa 2 do mobile
-- ============================================================================
--
-- Spec: docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md §3.
--
-- Uma linha por APARELHO (o `endpoint` do Web Push é único por navegador). A
-- mesma pessoa pode ter vários: celular, PC.
--
-- ## Quem lê o quê
--
-- A pessoa lê, grava, atualiza e apaga só as próprias linhas — padrão de
-- `acordos_mensagens_whatsapp`, com `(SELECT auth.uid())` para a RLS avaliar
-- uma vez por consulta. Ninguém mais pela API: quem lê as de todos é a Edge
-- Function `enviar-push`, com service_role (que ignora RLS). `anon` fora.
--
-- As chaves (`p256dh`, `auth`) são da inscrição do navegador, não segredo do
-- servidor: sozinhas não mandam aviso nenhum — é a chave VAPID privada, que
-- mora só no secret da Edge Function, que assina o envio.
--
-- Tabela nova. Nenhuma linha existente muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.push_inscricoes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id        UUID        NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  empresa_id       UUID        NOT NULL,
  endpoint         TEXT        NOT NULL,
  p256dh           TEXT        NOT NULL,
  auth             TEXT        NOT NULL,
  -- Rótulo legível («Android · Chrome»). Só para a pessoa reconhecer o aparelho.
  aparelho         TEXT,
  criada_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_envio_em  TIMESTAMPTZ,
  falhas           INTEGER     NOT NULL DEFAULT 0,
  CONSTRAINT push_inscricoes_endpoint_unico UNIQUE (endpoint),
  CONSTRAINT push_inscricoes_endpoint_https CHECK (endpoint LIKE 'https://%')
);

-- O envio procura «os aparelhos desta pessoa».
CREATE INDEX IF NOT EXISTS push_inscricoes_perfil_idx ON public.push_inscricoes (perfil_id);

COMMENT ON TABLE public.push_inscricoes IS
  'Aparelhos inscritos no aviso de pagamento (Web Push). Uma linha por endpoint. '
  'A pessoa ve e mexe so nas proprias; a Edge Function enviar-push le todas com '
  'service_role (20260930120624).';

ALTER TABLE public.push_inscricoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_inscricoes_select ON public.push_inscricoes;
CREATE POLICY push_inscricoes_select
  ON public.push_inscricoes FOR SELECT TO authenticated
  USING (perfil_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_inscricoes_insert ON public.push_inscricoes;
CREATE POLICY push_inscricoes_insert
  ON public.push_inscricoes FOR INSERT TO authenticated
  WITH CHECK (perfil_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_inscricoes_update ON public.push_inscricoes;
CREATE POLICY push_inscricoes_update
  ON public.push_inscricoes FOR UPDATE TO authenticated
  USING      (perfil_id = (SELECT auth.uid()))
  WITH CHECK (perfil_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_inscricoes_delete ON public.push_inscricoes;
CREATE POLICY push_inscricoes_delete
  ON public.push_inscricoes FOR DELETE TO authenticated
  USING (perfil_id = (SELECT auth.uid()));

REVOKE ALL ON public.push_inscricoes FROM anon;

-- ── Trocar de conta no mesmo aparelho ───────────────────────────────────────
--
-- O endpoint é do NAVEGADOR, não da pessoa. Se a Ana sai e o Bruno entra no
-- mesmo celular e ativa o aviso, o upsert por `endpoint` bateria na linha da
-- Ana — que a RLS não deixa o Bruno ver nem mudar. Esta função troca o dono
-- da linha para quem está logado, e só isso.
CREATE OR REPLACE FUNCTION public.fn_push_inscrever(
  p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT, p_aparelho TEXT, p_empresa_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eu UUID := (SELECT auth.uid());
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem sessão';
  END IF;
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'empresa fora do alcance';
  END IF;

  INSERT INTO public.push_inscricoes (perfil_id, empresa_id, endpoint, p256dh, auth, aparelho)
  VALUES (v_eu, p_empresa_id, p_endpoint, p_p256dh, p_auth, left(p_aparelho, 120))
  ON CONFLICT (endpoint) DO UPDATE
     SET perfil_id  = EXCLUDED.perfil_id,
         empresa_id = EXCLUDED.empresa_id,
         p256dh     = EXCLUDED.p256dh,
         auth       = EXCLUDED.auth,
         aparelho   = EXCLUDED.aparelho,
         falhas     = 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_inscrever(TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_push_inscrever(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

DO $guarda$
BEGIN
  IF to_regclass('public.push_inscricoes') IS NULL THEN
    RAISE EXCEPTION 'push_inscricoes nao foi criada';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.push_inscricoes'::regclass) THEN
    RAISE EXCEPTION 'push_inscricoes sem RLS';
  END IF;
END
$guarda$;

COMMIT;
