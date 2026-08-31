-- Curtir e responder mensagem no chat interno.
--
-- ## Por que colunas, e não tabelas
--
-- O chat é 1 para 1 (`chat_conversas` guarda `par_menor`/`par_maior`), então
-- uma mensagem tem no máximo UMA curtida possível vinda do outro lado. Uma
-- tabela `chat_mensagem_curtidas` custaria RLS própria, publicação de realtime
-- própria e um JOIN por mensagem para desenhar um coração. Duas colunas na
-- própria mensagem viajam no MESMO evento de UPDATE que o cliente já escuta
-- (ver `useChat.ts`, que funde `payload.new` na mensagem aberta) — o coração
-- aparece nos dois lados sem uma linha de realtime nova.
--
-- Se um dia o chat virar grupo, isto vira tabela. Enquanto for par, não vira.
--
-- ## Por que curtir é RPC, e não uma policy de UPDATE
--
-- Uma policy `FOR UPDATE` no participante deixaria a pessoa reescrever `texto`
-- e `anexos` da mensagem do OUTRO — reescrever a fala alheia é pior que não
-- ter curtida. Barrar isso por trigger esbarra no expurgo de CPF, que
-- legitimamente reescreve `texto` e roda como SECURITY DEFINER.
--
-- Com RPC, a tabela continua sem UPDATE para `authenticated`: só a função
-- toca nas duas colunas, e ela verifica `fn_chat_sou_parte` antes.

ALTER TABLE public.chat_mensagens
  ADD COLUMN IF NOT EXISTS respondendo_id UUID
    REFERENCES public.chat_mensagens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curtida_por UUID
    REFERENCES public.perfis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curtida_em TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_mensagens.respondendo_id IS
  'Mensagem citada por esta. ON DELETE SET NULL: apagar a citada nao pode '
  'levar junto a resposta — a tela cai para "mensagem removida".';
COMMENT ON COLUMN public.chat_mensagens.curtida_por IS
  'Quem curtiu. Uma curtida por mensagem: o chat e 1 para 1.';

-- Desenhar a citação é buscar a mensagem por id (chave primária). O índice
-- aqui serve ao caminho inverso — apagar uma mensagem citada precisa achar
-- quem a cita para aplicar o SET NULL sem varrer a tabela.
CREATE INDEX IF NOT EXISTS idx_chat_msg_respondendo
  ON public.chat_mensagens (respondendo_id)
  WHERE respondendo_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_chat_curtir(
  p_mensagem_id UUID,
  p_curtir BOOLEAN
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conversa UUID;
  v_uid      UUID := (SELECT auth.uid());
  v_em       TIMESTAMPTZ;
BEGIN
  SELECT m.conversa_id INTO v_conversa
    FROM public.chat_mensagens m
   WHERE m.id = p_mensagem_id;

  -- Mesma resposta para "não existe" e "não é sua": quem não é parte da
  -- conversa não deve conseguir descobrir se um id existe.
  IF v_conversa IS NULL OR NOT public.fn_chat_sou_parte(v_conversa) THEN
    RAISE EXCEPTION 'Mensagem fora do seu alcance.';
  END IF;

  UPDATE public.chat_mensagens m
     SET curtida_por = CASE WHEN p_curtir THEN v_uid ELSE NULL END,
         curtida_em  = CASE WHEN p_curtir THEN NOW()  ELSE NULL END
   WHERE m.id = p_mensagem_id
  RETURNING m.curtida_em INTO v_em;

  RETURN v_em;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_curtir(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_curtir(UUID, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_curtir(UUID, BOOLEAN) IS
  'Liga ou desliga a curtida de uma mensagem do chat. E RPC, e nao policy de '
  'UPDATE, para que participante nao ganhe permissao de reescrever texto e '
  'anexos da mensagem alheia. Ver 20260831140000.';

-- Verificação: a citação não pode apontar para outra conversa.
--
-- O cliente só oferece o botão nas mensagens que estão na tela, mas a API é
-- aberta a quem souber montar o POST — e uma citação cruzada vazaria o texto
-- de uma conversa dentro de outra quando a tela fosse desenhar a prévia.
CREATE OR REPLACE FUNCTION public.fn_chat_resposta_mesma_conversa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.respondendo_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_mensagens m
     WHERE m.id = NEW.respondendo_id AND m.conversa_id = NEW.conversa_id
  ) THEN
    RAISE EXCEPTION 'So da para responder mensagem da mesma conversa.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_chat_resposta_mesma_conversa ON public.chat_mensagens;
CREATE TRIGGER trg_chat_resposta_mesma_conversa
  BEFORE INSERT ON public.chat_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.fn_chat_resposta_mesma_conversa();
