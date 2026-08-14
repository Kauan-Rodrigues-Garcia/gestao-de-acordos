-- ============================================================================
-- 20260803d_chat_cpf_expurgo.sql
-- CPF no chat de Solicitar Atendimento: avisa, e apaga em 12 horas.
-- ============================================================================
--
-- ## O problema
--
-- A diretoria fixou em 28/07/2026 que nenhum CPF de cliente fica no sistema.
-- As migrations 20260803a/b fecharam a porta dos ACORDOS: lá o CPF é recusado
-- na hora, porque existe substituto (o código do cliente no ERP).
--
-- No chat não dá para simplesmente recusar. Ele é conversa entre pessoas: se a
-- mensagem for bloqueada, o atendimento trava e a pessoa manda o CPF por fora —
-- WhatsApp, papel, voz — onde não há trava nenhuma. Bloquear pioraria.
--
-- ## A regra
--
-- Manda, mas com prazo. A mensagem passa, nasce marcada, a tela avisa que
-- contém CPF e que será apagada, e 12 horas depois o TEXTO É SOBRESCRITO no
-- banco. Não é ocultar na tela: o conteúdo deixa de existir na linha.
--
-- Doze horas cobrem um turno inteiro — quem precisa do dado trabalha com ele
-- hoje e ele não amanhece no banco.
--
-- ## Onde
--
-- Nas mensagens do chat E no campo `mensagem` da própria solicitação: é o mesmo
-- formulário e o mesmo risco. `codigo_cliente` e `nome_cliente` ficam de fora
-- de propósito — são campos curtos e identificados, e a trava dos acordos já
-- cuida do caminho onde eles viram acordo.
--
-- Depende de `fn_texto_tem_cpf` (migration 20260803b): dígito verificador de
-- verdade, com e sem pontuação, e sem lookbehind (Safari antigo e Postgres
-- antigo quebram com lookbehind).
-- ============================================================================

-- ── Colunas de controle ─────────────────────────────────────────────────────

ALTER TABLE public.solicitacoes_whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS tem_cpf      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expurgar_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expurgado_em TIMESTAMPTZ;

ALTER TABLE public.solicitacoes_whatsapp
  ADD COLUMN IF NOT EXISTS msg_tem_cpf      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS msg_expurgar_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS msg_expurgado_em TIMESTAMPTZ;

-- Índice parcial: o expurgo só procura o que ainda está pendente.
CREATE INDEX IF NOT EXISTS idx_msgs_cpf_pendente
  ON public.solicitacoes_whatsapp_mensagens (expurgar_em)
  WHERE tem_cpf AND expurgado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_solic_cpf_pendente
  ON public.solicitacoes_whatsapp (msg_expurgar_em)
  WHERE msg_tem_cpf AND msg_expurgado_em IS NULL;

-- ── Texto que fica no lugar ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_texto_censurado_cpf()
RETURNS TEXT LANGUAGE sql IMMUTABLE AS
$$ SELECT '[mensagem apagada automaticamente: continha CPF]'::TEXT $$;

-- ── Marcação na escrita ─────────────────────────────────────────────────────
--
-- No banco, e não na aplicação: é a única forma de a regra valer para toda
-- porta que grave mensagem, inclusive as que ainda não existem.

CREATE OR REPLACE FUNCTION public.fn_marcar_cpf_mensagem()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Mensagem já expurgada não volta a ser marcada: o texto censurado não tem
  -- CPF, e rearmar o relógio deixaria a linha em ciclo eterno.
  IF NEW.expurgado_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF public.fn_texto_tem_cpf(NEW.conteudo) THEN
    NEW.tem_cpf := TRUE;
    -- Só arma o relógio uma vez. Editar a mensagem depois não estica o prazo.
    NEW.expurgar_em := COALESCE(NEW.expurgar_em, now() + INTERVAL '12 hours');
  ELSE
    NEW.tem_cpf := FALSE;
    NEW.expurgar_em := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marcar_cpf_mensagem ON public.solicitacoes_whatsapp_mensagens;
CREATE TRIGGER trg_marcar_cpf_mensagem
  BEFORE INSERT OR UPDATE OF conteudo
  ON public.solicitacoes_whatsapp_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.fn_marcar_cpf_mensagem();

CREATE OR REPLACE FUNCTION public.fn_marcar_cpf_solicitacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.msg_expurgado_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF public.fn_texto_tem_cpf(NEW.mensagem) THEN
    NEW.msg_tem_cpf := TRUE;
    NEW.msg_expurgar_em := COALESCE(NEW.msg_expurgar_em, now() + INTERVAL '12 hours');
  ELSE
    NEW.msg_tem_cpf := FALSE;
    NEW.msg_expurgar_em := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marcar_cpf_solicitacao ON public.solicitacoes_whatsapp;
CREATE TRIGGER trg_marcar_cpf_solicitacao
  BEFORE INSERT OR UPDATE OF mensagem
  ON public.solicitacoes_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.fn_marcar_cpf_solicitacao();

-- ── O expurgo ───────────────────────────────────────────────────────────────
--
-- SOBRESCREVE o texto. Não é máscara de exibição: depois disto o CPF não está
-- mais na linha, e nem um dump do banco o traz de volta.
--
-- A linha continua existindo, com `tem_cpf` e `expurgado_em` preenchidos, para
-- a conversa não ficar com buraco e para haver registro de que houve censura.

CREATE OR REPLACE FUNCTION public.fn_expurgar_cpf_chat()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msgs   INTEGER;
  v_solic  INTEGER;
BEGIN
  UPDATE public.solicitacoes_whatsapp_mensagens
     SET conteudo     = public.fn_texto_censurado_cpf(),
         expurgado_em = now()
   WHERE tem_cpf
     AND expurgado_em IS NULL
     AND expurgar_em IS NOT NULL
     AND expurgar_em <= now();
  GET DIAGNOSTICS v_msgs = ROW_COUNT;

  UPDATE public.solicitacoes_whatsapp
     SET mensagem         = public.fn_texto_censurado_cpf(),
         msg_expurgado_em = now()
   WHERE msg_tem_cpf
     AND msg_expurgado_em IS NULL
     AND msg_expurgar_em IS NOT NULL
     AND msg_expurgar_em <= now();
  GET DIAGNOSTICS v_solic = ROW_COUNT;

  RETURN v_msgs + v_solic;
END;
$$;

-- De 10 em 10 minutos. O prazo prometido na tela é de 12 horas; dez minutos de
-- folga não mudam nada para quem lê e evitam uma varredura pesada de hora em
-- hora. O índice parcial deixa a consulta barata mesmo com a tabela grande.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('expurgar-cpf-chat')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expurgar-cpf-chat');

    PERFORM cron.schedule(
      'expurgar-cpf-chat',
      '*/10 * * * *',
      'SELECT public.fn_expurgar_cpf_chat();'
    );
  ELSE
    RAISE NOTICE 'pg_cron ausente: agende fn_expurgar_cpf_chat() por fora, ou o CPF nao sai sozinho.';
  END IF;
END;
$$;

-- ── Retroativo ──────────────────────────────────────────────────────────────
--
-- Mensagens que já estão no banco com CPF nunca foram marcadas. Elas recebem o
-- prazo de 12 horas a partir de AGORA, e não da data em que foram escritas:
-- apagar de imediato tiraria da tela, sem aviso, uma conversa que alguém pode
-- estar usando hoje. Amanhã não estarão mais lá.

UPDATE public.solicitacoes_whatsapp_mensagens
   SET tem_cpf = TRUE, expurgar_em = now() + INTERVAL '12 hours'
 WHERE expurgado_em IS NULL
   AND NOT tem_cpf
   AND public.fn_texto_tem_cpf(conteudo);

UPDATE public.solicitacoes_whatsapp
   SET msg_tem_cpf = TRUE, msg_expurgar_em = now() + INTERVAL '12 hours'
 WHERE msg_expurgado_em IS NULL
   AND NOT msg_tem_cpf
   AND public.fn_texto_tem_cpf(mensagem);

-- Quanto foi encontrado.
SELECT
  (SELECT COUNT(*) FROM public.solicitacoes_whatsapp_mensagens
    WHERE tem_cpf AND expurgado_em IS NULL)     AS mensagens_com_cpf,
  (SELECT COUNT(*) FROM public.solicitacoes_whatsapp
    WHERE msg_tem_cpf AND msg_expurgado_em IS NULL) AS solicitacoes_com_cpf;
