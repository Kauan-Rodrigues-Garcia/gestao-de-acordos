-- Dois erros que os logs do Postgres acusavam todo dia (auditoria de 31/08/2026).
--
-- ── 1. `empresas_admin`: a tela de login quebrando 22x por dia ───────────────
--
-- A policy nasceu SEM clausula `TO`, o que em Postgres significa PUBLIC — vale
-- para `anon` tambem. Ela chama `fn_user_is_super_admin()`, que so tem grant
-- para `authenticated` e `service_role`. Resultado: todo `SELECT ... FROM
-- empresas WHERE slug = $1` feito por sessao anonima (a resolucao de tenant da
-- tela de login) morria em 42501 — "permission denied for function
-- fn_user_is_super_admin". Erro de permissao em UMA policy aplicavel aborta a
-- consulta inteira, entao a `empresas_select` (`ativo = true`), que era quem
-- devia atender o anonimo, nunca chegava a ser avaliada.
--
-- A policy e redundante: `empresas_super_admin_total` faz exatamente o mesmo
-- predicado, com o `TO authenticated` correto. Some sem perda.

DROP POLICY IF EXISTS "empresas_admin" ON public.empresas;

-- ── 2. `fn_comemoracao_faxina`: a faxina inteira abortando ──────────────────
--
-- A funcao dava `DELETE FROM storage.objects`, que o Supabase passou a barrar
-- ("Direct deletion from storage tables is not allowed. Use the Storage API
-- instead."). Como tudo roda em uma transacao so, a excecao derrubava a funcao
-- INTEIRA: as linhas de `comemoracao_midias` voltavam pelo rollback e as
-- comemoracoes nem chegavam a ser finalizadas. Nao era "o arquivo ficou no
-- bucket" — era a faxina nao fazer absolutamente nada, em silencio, desde que
-- a Supabase ligou o bloqueio.
--
-- SQL nao apaga arquivo de storage, e nao existe API SQL para isso. Entao a
-- funcao para de tentar e passa a ANOTAR o caminho numa fila. Quem tem Storage
-- API na mao — o app, na tela de Comemoracoes — drena a fila.

CREATE TABLE IF NOT EXISTS public.comemoracao_midias_expurgo (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  bucket     TEXT NOT NULL DEFAULT 'comemoracoes',
  caminho    TEXT NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removido_em TIMESTAMPTZ
);

COMMENT ON TABLE public.comemoracao_midias_expurgo IS
  'Arquivos de comemoracao cuja linha ja foi apagada e que ainda ocupam o '
  'bucket. SQL nao apaga storage; o app drena esta fila pela Storage API e '
  'carimba removido_em. Ver 20260831120000.';

CREATE INDEX IF NOT EXISTS idx_comemoracao_expurgo_pendente
  ON public.comemoracao_midias_expurgo (empresa_id, criado_em)
  WHERE removido_em IS NULL;

-- Mesma unicidade do bucket: o caminho e a chave do arquivo. Reenfileirar o
-- mesmo caminho nao cria linha nova.
CREATE UNIQUE INDEX IF NOT EXISTS idx_comemoracao_expurgo_caminho
  ON public.comemoracao_midias_expurgo (bucket, caminho);

ALTER TABLE public.comemoracao_midias_expurgo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.comemoracao_midias_expurgo FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON TABLE public.comemoracao_midias_expurgo TO authenticated;
GRANT ALL    ON TABLE public.comemoracao_midias_expurgo TO service_role;

-- Quem administra as comemoracoes da empresa e quem drena a fila dela. Sem
-- INSERT: a linha nasce da faxina (SECURITY DEFINER), nunca do cliente.
DROP POLICY IF EXISTS comemoracao_expurgo_select ON public.comemoracao_midias_expurgo;
CREATE POLICY comemoracao_expurgo_select ON public.comemoracao_midias_expurgo
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_can_access_empresa(empresa_id))
    AND (SELECT public.fn_user_tem('comemoracoes_gerenciar'))
  );

DROP POLICY IF EXISTS comemoracao_expurgo_update ON public.comemoracao_midias_expurgo;
CREATE POLICY comemoracao_expurgo_update ON public.comemoracao_midias_expurgo
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.fn_can_access_empresa(empresa_id))
    AND (SELECT public.fn_user_tem('comemoracoes_gerenciar'))
  )
  WITH CHECK (
    (SELECT public.fn_can_access_empresa(empresa_id))
    AND (SELECT public.fn_user_tem('comemoracoes_gerenciar'))
  );

CREATE OR REPLACE FUNCTION public.fn_comemoracao_faxina()
RETURNS TABLE(midias_apagadas INTEGER, comemoracoes_finalizadas INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_midias INT := 0;
  v_comem  INT := 0;
BEGIN
  WITH vencidas AS (
    DELETE FROM public.comemoracao_midias m
     WHERE m.expira_em IS NOT NULL AND m.expira_em <= NOW()
    RETURNING m.empresa_id, m.caminho
  ), enfileiradas AS (
    INSERT INTO public.comemoracao_midias_expurgo (empresa_id, bucket, caminho)
    SELECT v.empresa_id, 'comemoracoes', v.caminho
      FROM vencidas v
     WHERE v.caminho IS NOT NULL
    ON CONFLICT (bucket, caminho) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_midias FROM vencidas;

  WITH fechadas AS (
    UPDATE public.comemoracoes c
       SET finalizada_em = NOW()
     WHERE c.finalizada_em IS NULL
       AND NOW() >= c.inicia_em + (c.duracao_s || ' seconds')::INTERVAL
    RETURNING c.id
  )
  SELECT COUNT(*) INTO v_comem FROM fechadas;

  RETURN QUERY SELECT COALESCE(v_midias, 0), COALESCE(v_comem, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_comemoracao_faxina() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_comemoracao_faxina() TO service_role;

COMMENT ON FUNCTION public.fn_comemoracao_faxina() IS
  'Apaga midia vencida e finaliza comemoracao fora da janela. O ARQUIVO nao e '
  'apagado aqui: storage.objects recusa DELETE direto e a excecao abortava a '
  'faxina inteira — o caminho vai para comemoracao_midias_expurgo e o app o '
  'remove pela Storage API. Agendada no pg_cron.';

-- ── Verificacao ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'empresas' AND policyname = 'empresas_admin'
  ) THEN
    RAISE EXCEPTION 'empresas_admin ainda existe — o login anonimo continua quebrado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'empresas'
       AND policyname = 'empresas_super_admin_total'
  ) THEN
    RAISE EXCEPTION 'empresas_super_admin_total nao existe — apagar empresas_admin deixaria o super admin sem policy de escrita';
  END IF;
END;
$$;
