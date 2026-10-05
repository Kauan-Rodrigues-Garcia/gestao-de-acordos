-- ============================================================================
-- Aviso no celular para mensagem nova do chat
-- ============================================================================
--
-- Pedido do Cleber (05/10/2026): o chat do gestão entra no app do celular, e
-- quem recebe mensagem é avisado no celular — com a foto de quem mandou no
-- Android (no iPhone o sistema usa o ícone do app). Regras combinadas:
--
--   - só avisa quem NÃO está online no gestão (`presenca_online`): quem está
--     no computador já tem o aviso e o som do chat lá;
--   - um aviso por pessoa e conversa, com a etiqueta da conversa — a mensagem
--     nova substitui o aviso anterior, como no WhatsApp;
--   - mensagem com CPF não mostra o texto (dado sensível no chat).
--
-- ## As peças
--
--   push_chat_fila          uma linha por mensagem × participante com celular
--                           registrado. Ninguém lê nem escreve pelo app.
--   fn_push_chat_enfileirar gatilho por COMANDO em `chat_mensagens`: enfileira
--                           e chama a Edge Function `enviar-push` (`acao:
--                           'chat'`) NA HORA — a fila de pagamentos anda de
--                           minuto em minuto, e chat não espera um minuto.
--                           Nunca derruba o envio da mensagem: erro aqui é
--                           engolido.
--   fn_push_chat_pegar      a Edge Function pega o pendente: marca quem está
--                           online (não recebe) e devolve uma linha por pessoa
--                           e conversa — a última mensagem e quantas a pessoa
--                           ainda não leu ali.
--   push_config.chat        liga e desliga só o aviso de chat.
--
-- Melhor esforço: aviso que falha não volta para a fila. Faxina de 7 dias.
-- Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

ALTER TABLE public.push_config ADD COLUMN IF NOT EXISTS chat boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.push_chat_fila (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  perfil_id    uuid        NOT NULL,
  conversa_id  uuid        NOT NULL,
  mensagem_id  uuid        NOT NULL,
  criada_em    timestamptz NOT NULL DEFAULT now(),
  situacao     text        NOT NULL DEFAULT 'pendente'
                           CHECK (situacao IN ('pendente', 'enviado', 'online')),
  tratada_em   timestamptz
);
CREATE INDEX IF NOT EXISTS push_chat_fila_pendente ON public.push_chat_fila (id) WHERE situacao = 'pendente';

COMMENT ON TABLE public.push_chat_fila IS
  'Mensagens de chat esperando o aviso no celular, uma linha por participante com aparelho. '
  'Ver 20261005235000.';

ALTER TABLE public.push_chat_fila ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_chat_fila FROM anon, authenticated;
GRANT ALL ON public.push_chat_fila TO service_role;

-- ── O gatilho ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_push_chat_enfileirar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cfg   public.push_config%ROWTYPE;
  v_novas integer;
BEGIN
  BEGIN
    SELECT * INTO v_cfg FROM public.push_config c WHERE c.ativo AND c.chat;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    -- Mensagem de pessoa (não de sistema), para quem participa, não é o autor,
    -- não saiu da conversa e tem celular registrado.
    INSERT INTO public.push_chat_fila (perfil_id, conversa_id, mensagem_id)
    SELECT cp.perfil_id, n.conversa_id, n.id
      FROM novas n
      JOIN public.chat_participantes cp ON cp.conversa_id = n.conversa_id
     WHERE n.sistema IS NULL
       AND n.autor_id IS NOT NULL
       AND cp.perfil_id <> n.autor_id
       AND cp.saiu_em IS NULL
       AND EXISTS (SELECT 1 FROM public.push_inscricoes i WHERE i.perfil_id = cp.perfil_id);
    GET DIAGNOSTICS v_novas = ROW_COUNT;

    IF v_novas > 0 THEN
      PERFORM net.http_post(
        url     := v_cfg.url_funcao,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-segredo', v_cfg.segredo),
        body    := jsonb_build_object('acao', 'chat'),
        timeout_milliseconds := 30000);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- O aviso é extra: a mensagem tem que ser gravada de qualquer jeito.
    RAISE WARNING 'fn_push_chat_enfileirar: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_chat_enfileirar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_push_chat_enfileirar ON public.chat_mensagens;
CREATE TRIGGER trg_push_chat_enfileirar
  AFTER INSERT ON public.chat_mensagens
  REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_push_chat_enfileirar();

-- ── A rodada (chamada pela Edge Function, com a service role) ───────────────
CREATE OR REPLACE FUNCTION public.fn_push_chat_pegar(p_limite integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_saida jsonb;
BEGIN
  WITH escolhidas AS (
    SELECT f.id
      FROM public.push_chat_fila f
     WHERE f.situacao = 'pendente'
     ORDER BY f.id
     LIMIT greatest(1, least(coalesce(p_limite, 500), 2000))
     FOR UPDATE SKIP LOCKED
  ),
  tratadas AS (
    UPDATE public.push_chat_fila f
       SET situacao = CASE WHEN EXISTS (
                        SELECT 1 FROM public.presenca_online po
                         WHERE po.user_id = f.perfil_id
                           AND po.visto_em > now() - interval '150 seconds'
                           AND (po.saindo_em IS NULL OR po.saindo_em > now() - interval '15 seconds'))
                        THEN 'online' ELSE 'enviado' END,
           tratada_em = now()
      FROM escolhidas e
     WHERE f.id = e.id
    RETURNING f.perfil_id, f.conversa_id, f.mensagem_id, f.situacao
  ),
  -- A última mensagem de cada pessoa + conversa, entre as que vão sair.
  ultima AS (
    SELECT DISTINCT ON (t.perfil_id, t.conversa_id)
           t.perfil_id, t.conversa_id, m.id AS mensagem_id, m.autor_id, m.texto, m.tem_cpf, m.anexos
      FROM tratadas t
      JOIN public.chat_mensagens m ON m.id = t.mensagem_id
     WHERE t.situacao = 'enviado'
     ORDER BY t.perfil_id, t.conversa_id, m.criado_em DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'perfil_id',     u.perfil_id,
           'conversa_id',   u.conversa_id,
           'conversa_tipo', c.tipo,
           'conversa_nome', c.nome,
           'autor_nome',    a.nome,
           'autor_foto',    nullif(btrim(a.foto_url), ''),
           'texto',         CASE WHEN u.tem_cpf THEN NULL ELSE u.texto END,
           'tem_cpf',       coalesce(u.tem_cpf, false),
           'anexos',        coalesce(u.anexos, '[]'::jsonb),
           'nao_lidas',     (SELECT count(*)
                               FROM public.chat_mensagens mm
                               JOIN public.chat_participantes cp
                                 ON cp.conversa_id = mm.conversa_id AND cp.perfil_id = u.perfil_id
                              WHERE mm.conversa_id = u.conversa_id
                                AND mm.sistema IS NULL
                                AND mm.autor_id IS DISTINCT FROM u.perfil_id
                                AND mm.criado_em > coalesce(cp.ultima_leitura_em, '-infinity'::timestamptz))
         )), '[]'::jsonb)
    INTO v_saida
    FROM ultima u
    JOIN public.chat_conversas c ON c.id = u.conversa_id
    LEFT JOIN public.perfis a    ON a.id = u.autor_id;

  RETURN v_saida;
END;
$function$;

COMMENT ON FUNCTION public.fn_push_chat_pegar(integer) IS
  'Pega o aviso de chat pendente: marca quem está online e devolve, por pessoa e conversa, a '
  'última mensagem e as não lidas. Só a Edge Function enviar-push chama. Ver 20261005235000.';

REVOKE ALL ON FUNCTION public.fn_push_chat_pegar(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_chat_pegar(integer) TO service_role;

-- ── Faxina ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('push-chat-faxina')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-chat-faxina');
  PERFORM cron.schedule('push-chat-faxina', '55 3 * * *',
    $faxina$DELETE FROM public.push_chat_fila WHERE criada_em < now() - interval '7 days'$faxina$);
END;
$$;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.push_chat_fila') IS NULL THEN
    RAISE EXCEPTION 'push_chat_fila não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_push_chat_enfileirar'
                    AND tgrelid = 'public.chat_mensagens'::regclass) THEN
    RAISE EXCEPTION 'gatilho do aviso de chat não criado';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_push_chat_pegar(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_push_chat_pegar ficou aberta ao app';
  END IF;
  IF has_table_privilege('authenticated', 'public.push_chat_fila', 'SELECT') THEN
    RAISE EXCEPTION 'push_chat_fila ficou legível pelo app';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'push_config' AND column_name = 'chat') THEN
    RAISE EXCEPTION 'push_config.chat não criada';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261005235000', 'push_chat')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT
  to_regclass('public.push_chat_fila') IS NOT NULL                                           AS fila,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_push_chat_enfileirar')                AS gatilho,
  (SELECT chat FROM public.push_config LIMIT 1)                                              AS aviso_de_chat_ligado,
  (SELECT count(DISTINCT perfil_id) FROM public.push_inscricoes)                             AS pessoas_com_celular;
