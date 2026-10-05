-- ============================================================================
-- Quem está online volta a ser na hora: o banco avisa entrada e saída
-- ============================================================================
--
-- ## Por quê (Cleber, 05/10/2026)
--
-- A batida de 15 s (20261005150000) tirou o online do Presence e acabou com o
-- `PresenceRateLimitReached`, mas quem entra levava até 15 s para aparecer. O
-- pedido é voltar ao tempo real sem voltar ao erro.
--
-- O erro era do PRESENCE, que tem o teto mais baixo do Realtime (Pro: 50
-- mensagens por segundo; sem teto de gastos, 1.000) e avisa cada entrada a
-- todo o canal. Mensagem comum de Broadcast tem outro teto (Pro: 500/s; sem
-- teto de gastos, 2.500/s).
--
-- ## Como fica
--
-- A batida continua sendo a verdade (`presenca_online`), agora a cada 60 s. O
-- que muda é que o banco AVISA no tópico `presenca:global` quando alguém:
--
--   entrou   a batida criou a linha, ou a linha estava vencida (> 150 s), ou a
--            pessoa trocou de empresa;
--   saiu     `fn_presenca_sair` apagou a linha (aba fechada, logout).
--
-- Renovação de batida não avisa nada. Num dia comum são poucas mensagens por
-- minuto; recarregar a página é um «saiu» seguido de um «entrou», e quem
-- recebe espera 15 s antes de tirar alguém da lista — ninguém pisca.
--
-- Os avisos levam `em` (milissegundos do banco) e a batida devolve `agora`: a
-- aba reaplica sobre a lista os avisos mais novos que ela, e uma lista que
-- chegou atrasada não apaga quem acabou de entrar.
--
-- O aviso nunca derruba a batida: se o `realtime.send` falhar, a batida segue
-- e a lista corrige na próxima.
--
-- Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── A batida, agora com aviso de entrada ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_presenca_bater(p_empresa uuid, p_versao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_empresa     uuid;
  v_visto_antes timestamptz;
  v_emp_antes   uuid;
  v_entrou      boolean;
  v_lista       jsonb;
  v_versao      text;
  v_agora_ms    bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;

  -- A empresa em que a pessoa está, se ela alcança; senão a do cadastro.
  IF p_empresa IS NOT NULL AND public.fn_can_access_empresa(p_empresa) THEN
    v_empresa := p_empresa;
  ELSE
    SELECT p.empresa_id INTO v_empresa FROM public.perfis p WHERE p.id = v_uid;
  END IF;

  SELECT o.visto_em, o.empresa_id INTO v_visto_antes, v_emp_antes
    FROM public.presenca_online o WHERE o.user_id = v_uid;
  v_entrou := v_visto_antes IS NULL
           OR v_visto_antes <= now() - interval '150 seconds'
           OR v_emp_antes IS DISTINCT FROM v_empresa;

  INSERT INTO public.presenca_online AS o (user_id, empresa_id, visto_em)
  VALUES (v_uid, v_empresa, now())
  ON CONFLICT ON CONSTRAINT presenca_online_pkey DO UPDATE
     SET empresa_id = excluded.empresa_id,
         visto_em   = excluded.visto_em
   WHERE o.visto_em < now() - interval '10 seconds'
      OR o.empresa_id IS DISTINCT FROM excluded.empresa_id;

  IF v_entrou THEN
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('tipo', 'entrou', 'pessoa', v_uid, 'empresa', v_empresa, 'em', v_agora_ms),
        'presenca', 'presenca:global', true);
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- o aviso é atalho; a lista da próxima batida corrige
    END;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_array(o.user_id, o.empresa_id) ORDER BY o.user_id), '[]'::jsonb)
    INTO v_lista
    FROM public.presenca_online o
   WHERE o.visto_em > now() - interval '150 seconds';

  v_versao := md5(v_lista::text);
  IF v_versao = p_versao THEN
    RETURN jsonb_build_object('versao', v_versao, 'agora', v_agora_ms);
  END IF;
  RETURN jsonb_build_object('versao', v_versao, 'agora', v_agora_ms, 'online', v_lista);
END;
$function$;

COMMENT ON FUNCTION public.fn_presenca_bater(uuid, text) IS
  'Grava a batida de quem chama, avisa «entrou» em presenca:global quando a pessoa chega, '
  'e diz quem bateu nos últimos 150 s (a lista só vem quando difere de p_versao). '
  'Ver 20261005150000 e 20261005170000.';

-- ── A saída, agora com aviso ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_presenca_sair()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_empresa uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.presenca_online o WHERE o.user_id = v_uid RETURNING o.empresa_id INTO v_empresa;
  IF FOUND THEN
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('tipo', 'saiu', 'pessoa', v_uid, 'empresa', v_empresa,
                           'em', floor(extract(epoch FROM clock_timestamp()) * 1000)),
        'presenca', 'presenca:global', true);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.fn_presenca_sair() IS
  'Tira quem chama da lista de online (aba fechada, logout) e avisa «saiu» em presenca:global. '
  'Ver 20261005150000 e 20261005170000.';

REVOKE ALL ON FUNCTION public.fn_presenca_bater(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_presenca_sair()            FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_presenca_bater(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_presenca_sair()            TO authenticated;

-- ── O tópico `presenca:global` ──────────────────────────────────────────────
-- Todo logado ouve, como era no `presence-global`. Sem policy de INSERT: só o
-- banco avisa.
DROP POLICY IF EXISTS presenca_aviso_receber ON realtime.messages;
CREATE POLICY presenca_aviso_receber ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension = 'broadcast'
    AND (SELECT realtime.topic()) = 'presenca:global'
    AND (SELECT auth.uid()) IS NOT NULL
  );

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regprocedure('public.fn_presenca_bater(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_presenca_sair()') IS NULL THEN
    RAISE EXCEPTION 'funções de presença sumiram';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_presenca_bater(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_presenca_sair()', 'EXECUTE') THEN
    RAISE EXCEPTION 'funções de presença sem EXECUTE para authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.fn_presenca_sair()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_presenca_sair ficou aberta para anon';
  END IF;
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'realtime.send não existe com a assinatura esperada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'realtime' AND tablename = 'messages'
                    AND policyname = 'presenca_aviso_receber') THEN
    RAISE EXCEPTION 'policy presenca_aviso_receber não criada';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261005170000', 'presenca_aviso_em_tempo_real')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT
  to_regprocedure('public.fn_presenca_bater(uuid,text)') IS NOT NULL AS bater,
  to_regprocedure('public.fn_presenca_sair()') IS NOT NULL           AS sair,
  EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'presenca_aviso_receber') AS policy,
  (SELECT count(*) FROM public.presenca_online
    WHERE visto_em > now() - interval '150 seconds')                 AS online_agora;
