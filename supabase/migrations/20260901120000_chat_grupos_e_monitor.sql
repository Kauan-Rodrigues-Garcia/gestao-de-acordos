-- Grupos e monitoramento no chat interno.
--
-- ## Duas coisas, uma migration, porque compartilham a mesma raiz
--
-- O chat nasceu estritamente em PARES: `chat_conversas` tem `par_menor` e
-- `par_maior`, ambos NOT NULL, com CHECK de ordem. Grupo e monitoria são as
-- duas formas de quebrar isso — uma conversa com N pessoas, e uma conversa que
-- alguém lê sem estar nela. Separá-las em duas migrations faria a segunda
-- reescrever as policies que a primeira acabou de escrever.
--
-- ## Grupos
--
-- `tipo = 'grupo'` solta o par e liga `nome`, `foto_url`, `criado_por` e
-- `somente_lideranca`. Quem participa continua em `chat_participantes`, que já
-- era uma tabela por pessoa — é ela que faz o modelo aguentar N gente sem
-- inventar estrutura nova.
--
-- ### Entregue e lido no grupo são o MÍNIMO, não o máximo
--
-- No WhatsApp o segundo tique só fecha quando todos receberam, e só fica azul
-- quando todos leram. Aqui isso cai naturalmente: a lista devolve
-- `MIN(ultima_leitura_em)` e `MIN(ultima_entrega_em)` entre os OUTROS
-- participantes, e `estadoMensagem` — que já compara data de mensagem com esses
-- dois cortes — passa a responder certo sem uma linha de mudança no cliente.
-- Se uma pessoa não leu, o mínimo é o corte dela, e a mensagem não está lida.
--
-- ### Avisos de sistema
--
-- «Beatriz adicionou Kleber», «Kleber saiu», «Beatriz mudou a foto» são
-- MENSAGENS, com `sistema` preenchido. Poderiam ser uma tabela de eventos à
-- parte; seriam a mesma coisa com o dobro do trabalho, porque a tela precisa
-- exibi-las intercaladas com as mensagens, na ordem, com paginação — que é
-- exatamente o que `chat_mensagens` já faz.
--
-- ## Curtidas viram CONTAGEM
--
-- A migration 20260831140000 gravou a curtida em `chat_mensagens.curtida_por`:
-- uma coluna, uma pessoa. Isso funcionava porque a conversa tinha duas pessoas.
-- Em grupo, a segunda curtida apagava a primeira em silêncio. Agora existe
-- `chat_curtidas`, uma linha por pessoa, e o que a tela mostra é quantas e
-- quem. As curtidas já dadas são migradas — ninguém perde a que deu.
--
-- ## Monitoria
--
-- Líder para cima pode abrir uma RÉPLICA do chat de outra pessoa e acompanhar
-- em tempo real. Quem alcança quem é decisão do painel
-- (`chat_monitor` + os três níveis de escopo), nunca de lista de cargo.
--
-- O acesso entra na RLS em vez de virar RPC de leitura, e isso é deliberado: o
-- Realtime reavalia a policy para decidir o que empurrar, então uma monitoria
-- que vive fora da RLS seria uma tela que só atualiza no F5 — o oposto do
-- pedido. O custo é uma chamada a `fn_user_tem` por linha de WAL do chat, e o
-- volume de mensagens comporta.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A conversa deixa de ser obrigatoriamente um par
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.chat_conversas
  ADD COLUMN IF NOT EXISTS tipo              TEXT NOT NULL DEFAULT 'direta',
  ADD COLUMN IF NOT EXISTS nome              TEXT,
  ADD COLUMN IF NOT EXISTS foto_url          TEXT,
  ADD COLUMN IF NOT EXISTS criado_por        UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS somente_lideranca BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.chat_conversas ALTER COLUMN par_menor DROP NOT NULL;
ALTER TABLE public.chat_conversas ALTER COLUMN par_maior DROP NOT NULL;

-- O CHECK antigo (`par_menor < par_maior`) some e volta mais completo: ele
-- agora diz o que é cada tipo, e é o que impede um grupo sem nome ou uma
-- conversa direta com nome de grupo.
ALTER TABLE public.chat_conversas DROP CONSTRAINT IF EXISTS chat_par_ordenado;
ALTER TABLE public.chat_conversas DROP CONSTRAINT IF EXISTS chat_conversa_coerente;
ALTER TABLE public.chat_conversas ADD CONSTRAINT chat_conversa_coerente CHECK (
  (tipo = 'direta'
     AND par_menor IS NOT NULL AND par_maior IS NOT NULL
     AND par_menor < par_maior)
  OR
  (tipo = 'grupo'
     AND par_menor IS NULL AND par_maior IS NULL
     AND COALESCE(TRIM(nome), '') <> '')
);

-- A unicidade do par só faz sentido para conversa direta: dois grupos com as
-- mesmas pessoas são dois grupos, e o índice antigo não os distinguiria.
DROP INDEX IF EXISTS public.ux_chat_conversa_par;
CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_conversa_par
  ON public.chat_conversas (empresa_id, par_menor, par_maior)
  WHERE tipo = 'direta';

COMMENT ON COLUMN public.chat_conversas.somente_lideranca IS
  'Ligado, so quem e admin do grupo escreve. O campo de digitar do operador e '
  'trocado por um aviso — ele continua LENDO tudo.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Participante ganha papel e saída
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.chat_participantes
  ADD COLUMN IF NOT EXISTS admin          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS entrou_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS saiu_em        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adicionado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.chat_participantes.saiu_em IS
  'Saiu ou foi removido. A linha FICA: apagá-la levaria junto o corte de '
  'leitura e o historico de quem esteve no grupo, e o aviso «fulano saiu» '
  'aponta para ela.';
COMMENT ON COLUMN public.chat_participantes.admin IS
  'Administra o grupo: foto, nome, quem entra, quem sai, e a trava de escrita. '
  'Varios por grupo, de proposito — grupo de um dono so morre com o dono.';

CREATE INDEX IF NOT EXISTS idx_chat_part_ativos
  ON public.chat_participantes (conversa_id)
  WHERE saiu_em IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Mensagem de sistema
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.chat_mensagens
  ADD COLUMN IF NOT EXISTS sistema       TEXT,
  ADD COLUMN IF NOT EXISTS sistema_dados JSONB;

COMMENT ON COLUMN public.chat_mensagens.sistema IS
  'entrou | saiu | removido | foto | nome | escrita — o aviso cinza no meio da '
  'conversa. NULL e mensagem de gente.';

-- A mensagem de sistema não tem anexo nem precisa de texto para existir: o
-- cliente monta a frase a partir de `sistema` + `sistema_dados`. Sem esta
-- alteração o CHECK antigo recusaria a linha.
ALTER TABLE public.chat_mensagens DROP CONSTRAINT IF EXISTS chat_msg_nao_vazia;
ALTER TABLE public.chat_mensagens ADD CONSTRAINT chat_msg_nao_vazia CHECK (
  sistema IS NOT NULL
  OR COALESCE(TRIM(texto), '') <> ''
  OR jsonb_array_length(anexos) > 0
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Curtida deixa de ser de um para virar contagem
-- ═══════════════════════════════════════════════════════════════════════════

-- `curtida_em` é escrita por `fn_chat_curtir` para acordar o Realtime, e nasceu
-- na 20260831140000. Garantida aqui porque o histórico de migrations deste
-- projeto está defasado (ver CLAUDE.md): o corpo de uma função plpgsql não é
-- validado na criação, então a falta da coluna só apareceria na primeira
-- curtida de alguém, em produção.
ALTER TABLE public.chat_mensagens
  ADD COLUMN IF NOT EXISTS curtida_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS curtida_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.chat_curtidas (
  mensagem_id UUID NOT NULL REFERENCES public.chat_mensagens(id) ON DELETE CASCADE,
  perfil_id   UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mensagem_id, perfil_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_curtidas_msg
  ON public.chat_curtidas (mensagem_id);

-- As curtidas de 31/08 a 01/09 estavam na coluna. Migram para a tabela em vez
-- de sumirem: são poucas, e uma curtida que desaparece no deploy parece bug.
--
-- Sob `DO` com checagem de coluna porque `curtida_por` nasceu na 20260831140000,
-- e o histórico de migrations deste projeto está defasado (ver CLAUDE.md): num
-- ambiente onde aquela não passou, um SELECT da coluna abortaria esta migration
-- inteira por causa de um backfill que não tinha nada para fazer.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'chat_mensagens'
       AND column_name = 'curtida_por'
  ) THEN
    INSERT INTO public.chat_curtidas (mensagem_id, perfil_id, criado_em)
    SELECT m.id, m.curtida_por, COALESCE(m.curtida_em, m.criado_em)
      FROM public.chat_mensagens m
     WHERE m.curtida_por IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

ALTER TABLE public.chat_curtidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_curtidas REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS chat_curtidas_select ON public.chat_curtidas;
CREATE POLICY chat_curtidas_select ON public.chat_curtidas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_mensagens m
     WHERE m.id = mensagem_id AND public.fn_chat_sou_parte(m.conversa_id)
  ));

-- Escrita só pela RPC: um INSERT solto poderia curtir em nome de outro.
DROP POLICY IF EXISTS chat_curtidas_write ON public.chat_curtidas;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Ser parte da conversa passa a considerar quem SAIU
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Quem saiu do grupo para de receber: continua com a linha (para o corte de
-- leitura e o aviso), mas não é mais parte.
CREATE OR REPLACE FUNCTION public.fn_chat_sou_parte(p_conversa UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participantes p
     WHERE p.conversa_id = p_conversa
       AND p.perfil_id   = (SELECT auth.uid())
       AND p.saiu_em IS NULL
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_sou_parte(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_sou_parte(UUID) TO authenticated, anon, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Monitoria: quem eu posso acompanhar
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_chat_posso_monitorar(p_alvo UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu    UUID := (SELECT auth.uid());
  v_meu   RECORD;
  v_alvo  RECORD;
BEGIN
  IF v_eu IS NULL OR p_alvo IS NULL OR p_alvo = v_eu THEN
    RETURN FALSE;   -- monitorar a si mesmo e a propria conversa, nao monitoria
  END IF;

  SELECT perfil, empresa_id, setor_id, equipe_id, acesso_multiempresa
    INTO v_meu FROM public.perfis WHERE id = v_eu;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT empresa_id, setor_id, equipe_id
    INTO v_alvo FROM public.perfis WHERE id = p_alvo;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Super admin passa por cima, como em todo o resto do sistema, e atravessa
  -- empresa: e ele quem administra as duas operacoes.
  IF v_meu.perfil = 'super_admin' THEN RETURN TRUE; END IF;

  IF NOT public.fn_user_tem('chat_monitor') THEN RETURN FALSE; END IF;

  -- Fora da empresa so quem tem acesso multiempresa. Sem isto, "todos os
  -- setores" vazaria a operacao vizinha para um diretor de uma so.
  IF v_alvo.empresa_id IS DISTINCT FROM v_meu.empresa_id
     AND NOT COALESCE(v_meu.acesso_multiempresa, FALSE) THEN
    RETURN FALSE;
  END IF;

  IF public.fn_user_tem('chat_monitor_escopo_todos_setores') THEN
    RETURN TRUE;
  END IF;

  IF public.fn_user_tem('chat_monitor_escopo_setor')
     AND v_meu.setor_id IS NOT NULL
     AND v_alvo.setor_id = v_meu.setor_id THEN
    RETURN TRUE;
  END IF;

  IF public.fn_user_tem('chat_monitor_escopo_equipe')
     AND v_meu.equipe_id IS NOT NULL
     AND v_alvo.equipe_id = v_meu.equipe_id THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_posso_monitorar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_posso_monitorar(UUID) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.fn_chat_posso_monitorar(UUID) IS
  'Posso acompanhar o chat desta pessoa? Decidido pelo painel '
  '(chat_monitor + escopo), nunca por lista de cargo. Super admin passa.';

/**
 * A conversa que estou monitorando.
 *
 * Guardada em funcao propria para a policy ficar legivel, e com a checagem
 * BARATA primeiro: `fn_user_tem('chat_monitor')` responde FALSE para a imensa
 * maioria e corta antes de tocar em `chat_participantes`. Isso importa porque
 * esta policy tambem e reavaliada pelo walrus do Realtime, linha a linha.
 */
CREATE OR REPLACE FUNCTION public.fn_chat_monitoro_conversa(p_conversa UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_user_tem('chat_monitor')
     AND EXISTS (
       SELECT 1 FROM public.chat_participantes p
        WHERE p.conversa_id = p_conversa
          AND public.fn_chat_posso_monitorar(p.perfil_id)
     );
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_monitoro_conversa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_monitoro_conversa(UUID) TO authenticated, anon, service_role;

-- ── As policies passam a admitir o monitor ─────────────────────────────────
DROP POLICY IF EXISTS chat_conversas_select ON public.chat_conversas;
CREATE POLICY chat_conversas_select ON public.chat_conversas FOR SELECT TO authenticated
  USING (public.fn_chat_sou_parte(id) OR public.fn_chat_monitoro_conversa(id));

DROP POLICY IF EXISTS chat_part_select ON public.chat_participantes;
CREATE POLICY chat_part_select ON public.chat_participantes FOR SELECT TO authenticated
  USING (public.fn_chat_sou_parte(conversa_id) OR public.fn_chat_monitoro_conversa(conversa_id));

DROP POLICY IF EXISTS chat_msg_select ON public.chat_mensagens;
CREATE POLICY chat_msg_select ON public.chat_mensagens FOR SELECT TO authenticated
  USING (public.fn_chat_sou_parte(conversa_id) OR public.fn_chat_monitoro_conversa(conversa_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Escrever no grupo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sou parte E (o grupo não está travado OU eu administro). A conversa direta
-- nunca trava, então a segunda metade é sempre verdadeira lá.
--
-- O monitor NÃO entra aqui de propósito: monitoria é leitura. Quem acompanha
-- não escreve na conversa de outra pessoa — isso não é monitoramento, é
-- personificação.
CREATE OR REPLACE FUNCTION public.fn_chat_posso_escrever(p_conversa UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.chat_participantes p
      JOIN public.chat_conversas c ON c.id = p.conversa_id
     WHERE p.conversa_id = p_conversa
       AND p.perfil_id   = (SELECT auth.uid())
       AND p.saiu_em IS NULL
       AND (
         NOT c.somente_lideranca
         OR p.admin
         /*
          * A trava separa LIDERANÇA de OPERAÇÃO, não «o dono do grupo» de todo
          * o resto — foi assim que ela nasceu e estava errado: um segundo líder
          * convidado para o grupo ficava mudo, e a gerência também.
          *
          * Quem é liderança aqui é quem o painel deixa criar grupo. É a mesma
          * régua, e ela é CONFIGURÁVEL: por padrão vale líder, elite, ouvidoria,
          * gerência e diretoria, e o administrador muda isso na tela de Cargos
          * sem ninguém tocar em SQL. Uma lista de cargos escrita aqui dentro
          * seria o modelo antigo que este projeto passou agosto inteiro
          * desmontando (ver o cabeçalho de permissoes-catalogo.ts).
          */
         OR public.fn_user_tem('chat_grupo_criar')
       )
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_posso_escrever(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_posso_escrever(UUID) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS chat_msg_insert ON public.chat_mensagens;
CREATE POLICY chat_msg_insert ON public.chat_mensagens FOR INSERT TO authenticated
  WITH CHECK (
    autor_id = (SELECT auth.uid())
    AND public.fn_chat_posso_escrever(conversa_id)
    -- Aviso de sistema só nasce por RPC (SECURITY DEFINER), nunca pelo
    -- cliente: senão qualquer um forja «Beatriz removeu Kleber».
    AND sistema IS NULL
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Curtir — agora acumula
-- ═══════════════════════════════════════════════════════════════════════════

-- A versão de 20260831140000 devolvia VOID; esta devolve a CONTAGEM, para a
-- tela não precisar de uma segunda consulta só para saber o novo total.
-- `CREATE OR REPLACE` não troca o tipo de retorno («cannot change return type
-- of existing function») — tem de derrubar antes.
DROP FUNCTION IF EXISTS public.fn_chat_curtir(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.fn_chat_curtir(p_mensagem_id UUID, p_curtir BOOLEAN)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu       UUID := (SELECT auth.uid());
  v_conversa UUID;
  v_total    INTEGER;
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'Sem sessão.'; END IF;

  SELECT m.conversa_id INTO v_conversa
    FROM public.chat_mensagens m WHERE m.id = p_mensagem_id;
  IF v_conversa IS NULL THEN RAISE EXCEPTION 'Mensagem não encontrada.'; END IF;

  -- Curtir é participar. O monitor lê e não interage: uma curtida dele
  -- apareceria para o grupo inteiro e denunciaria a monitoria.
  IF NOT public.fn_chat_sou_parte(v_conversa) THEN
    RAISE EXCEPTION 'Você não participa desta conversa.';
  END IF;

  IF p_curtir THEN
    INSERT INTO public.chat_curtidas (mensagem_id, perfil_id)
    VALUES (p_mensagem_id, v_eu)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.chat_curtidas
     WHERE mensagem_id = p_mensagem_id AND perfil_id = v_eu;
  END IF;

  SELECT count(*)::INTEGER INTO v_total
    FROM public.chat_curtidas WHERE mensagem_id = p_mensagem_id;

  /*
   * `curtida_em` vira o carimbo de QUALQUER mudança de curtida.
   *
   * Ele não descreve mais quem curtiu — `chat_curtidas` faz isso. O que ele
   * ainda serve é acordar o Realtime: `chat_curtidas` não está na publicação,
   * e sem um UPDATE na mensagem a curtida só apareceria no F5 do outro lado.
   */
  UPDATE public.chat_mensagens
     SET curtida_em = NOW(), curtida_por = NULL
   WHERE id = p_mensagem_id;

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_curtir(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_curtir(UUID, BOOLEAN) TO authenticated;

/** Quem curtiu — nome e foto, para o cartão que abre ao passar o mouse. */
CREATE OR REPLACE FUNCTION public.fn_chat_quem_curtiu(p_mensagem_id UUID)
RETURNS TABLE (perfil_id UUID, nome TEXT, foto_url TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id, p.nome, p.foto_url
    FROM public.chat_curtidas cu
    JOIN public.perfis p ON p.id = cu.perfil_id
    JOIN public.chat_mensagens m ON m.id = cu.mensagem_id
   WHERE cu.mensagem_id = p_mensagem_id
     AND (public.fn_chat_sou_parte(m.conversa_id)
          OR public.fn_chat_monitoro_conversa(m.conversa_id))
   ORDER BY cu.criado_em;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_quem_curtiu(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_quem_curtiu(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. O aviso de sistema
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_chat_avisar(
  p_conversa UUID, p_tipo TEXT, p_dados JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_empresa UUID;
BEGIN
  SELECT empresa_id INTO v_empresa FROM public.chat_conversas WHERE id = p_conversa;
  INSERT INTO public.chat_mensagens (conversa_id, empresa_id, autor_id, texto, sistema, sistema_dados)
  VALUES (p_conversa, v_empresa, (SELECT auth.uid()), NULL, p_tipo, COALESCE(p_dados, '{}'::JSONB));

  UPDATE public.chat_conversas SET ultima_mensagem_em = NOW() WHERE id = p_conversa;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_avisar(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chat_avisar(UUID, TEXT, JSONB) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Criar, configurar e mexer no grupo
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Cria o grupo com quem eu alcanço.
 *
 * O alcance é `fn_chat_alcanca`, o MESMO da conversa direta: quem eu posso
 * colocar num grupo é quem eu poderia chamar no privado. Não há regra nova
 * para decorar, e ampliar o chat amplia o grupo junto.
 *
 * Depois de dentro, o alcance não vale mais: quem está no grupo conversa com
 * quem está no grupo. Foi pedido assim, e é o comportamento de qualquer
 * mensageiro — um líder que entra num grupo com gente de outro setor fala com
 * eles ali, sem que isso abra o privado.
 */
CREATE OR REPLACE FUNCTION public.fn_chat_grupo_criar(
  p_nome TEXT, p_membros UUID[], p_foto_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu      UUID := (SELECT auth.uid());
  v_empresa UUID;
  v_id      UUID;
  v_membro  UUID;
  v_nome    TEXT := NULLIF(TRIM(p_nome), '');
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'Sem sessão.'; END IF;
  IF v_nome IS NULL THEN RAISE EXCEPTION 'O grupo precisa de um nome.'; END IF;
  IF NOT public.fn_chat_pode_usar() THEN RAISE EXCEPTION 'Chat indisponível.'; END IF;
  IF NOT public.fn_user_tem('chat_grupo_criar') THEN
    RAISE EXCEPTION 'Você não pode criar grupos.';
  END IF;

  SELECT empresa_id INTO v_empresa FROM public.perfis WHERE id = v_eu;

  INSERT INTO public.chat_conversas (empresa_id, tipo, nome, foto_url, criado_por, ultima_mensagem_em)
  VALUES (v_empresa, 'grupo', v_nome, NULLIF(TRIM(p_foto_url), ''), v_eu, NOW())
  RETURNING id INTO v_id;

  -- Quem cria administra. Sem isso o grupo nasce sem ninguém que possa mudar
  -- a foto ou adicionar gente.
  INSERT INTO public.chat_participantes (conversa_id, perfil_id, admin, adicionado_por)
  VALUES (v_id, v_eu, TRUE, v_eu);

  FOREACH v_membro IN ARRAY COALESCE(p_membros, ARRAY[]::UUID[]) LOOP
    CONTINUE WHEN v_membro = v_eu;
    CONTINUE WHEN NOT public.fn_chat_alcanca(v_membro);
    INSERT INTO public.chat_participantes (conversa_id, perfil_id, adicionado_por)
    VALUES (v_id, v_membro, v_eu)
    ON CONFLICT DO NOTHING;
  END LOOP;

  PERFORM public.fn_chat_avisar(v_id, 'criou', jsonb_build_object('nome', v_nome));
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_grupo_criar(TEXT, UUID[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupo_criar(TEXT, UUID[], TEXT) TO authenticated;

/** Sou admin DESTE grupo? A pergunta que abre o painel de configurações. */
CREATE OR REPLACE FUNCTION public.fn_chat_grupo_administro(p_conversa UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participantes p
     WHERE p.conversa_id = p_conversa
       AND p.perfil_id   = (SELECT auth.uid())
       AND p.saiu_em IS NULL
       AND p.admin
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_grupo_administro(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupo_administro(UUID) TO authenticated;

/**
 * Nome, foto e trava de escrita.
 *
 * Cada campo é opcional: passar NULL significa «não mexe nisto», e não «apaga
 * isto». Apagar a foto é `p_foto_url = ''`, que é o que o botão «remover foto»
 * manda — sem essa distinção, salvar o nome limparia a foto junto.
 */
CREATE OR REPLACE FUNCTION public.fn_chat_grupo_config(
  p_conversa UUID,
  p_nome TEXT DEFAULT NULL,
  p_foto_url TEXT DEFAULT NULL,
  p_somente_lideranca BOOLEAN DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_atual RECORD;
  v_nome  TEXT;
BEGIN
  IF NOT public.fn_user_tem('chat_grupo_editar') OR NOT public.fn_chat_grupo_administro(p_conversa) THEN
    RAISE EXCEPTION 'Só quem administra o grupo pode alterar isto.';
  END IF;

  SELECT nome, foto_url, somente_lideranca INTO v_atual
    FROM public.chat_conversas WHERE id = p_conversa AND tipo = 'grupo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Grupo não encontrado.'; END IF;

  IF p_nome IS NOT NULL THEN
    v_nome := NULLIF(TRIM(p_nome), '');
    IF v_nome IS NULL THEN RAISE EXCEPTION 'O grupo precisa de um nome.'; END IF;
    IF v_nome IS DISTINCT FROM v_atual.nome THEN
      UPDATE public.chat_conversas SET nome = v_nome WHERE id = p_conversa;
      PERFORM public.fn_chat_avisar(p_conversa, 'nome',
        jsonb_build_object('de', v_atual.nome, 'para', v_nome));
    END IF;
  END IF;

  IF p_foto_url IS NOT NULL THEN
    -- '' é o pedido de REMOVER; qualquer outro texto é a foto nova.
    UPDATE public.chat_conversas SET foto_url = NULLIF(TRIM(p_foto_url), '') WHERE id = p_conversa;
    PERFORM public.fn_chat_avisar(p_conversa, 'foto',
      jsonb_build_object('de', v_atual.foto_url, 'para', NULLIF(TRIM(p_foto_url), '')));
  END IF;

  IF p_somente_lideranca IS NOT NULL
     AND p_somente_lideranca IS DISTINCT FROM v_atual.somente_lideranca THEN
    UPDATE public.chat_conversas SET somente_lideranca = p_somente_lideranca WHERE id = p_conversa;
    PERFORM public.fn_chat_avisar(p_conversa, 'escrita',
      jsonb_build_object('travado', p_somente_lideranca));
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_grupo_config(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupo_config(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

/** Adiciona gente. Um aviso por pessoa, como no WhatsApp. */
CREATE OR REPLACE FUNCTION public.fn_chat_grupo_adicionar(p_conversa UUID, p_membros UUID[])
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu     UUID := (SELECT auth.uid());
  v_membro UUID;
  v_n      INTEGER := 0;
  v_nome   TEXT;
BEGIN
  IF NOT public.fn_user_tem('chat_grupo_adicionar') OR NOT public.fn_chat_grupo_administro(p_conversa) THEN
    RAISE EXCEPTION 'Só quem administra o grupo pode adicionar pessoas.';
  END IF;

  FOREACH v_membro IN ARRAY COALESCE(p_membros, ARRAY[]::UUID[]) LOOP
    CONTINUE WHEN NOT public.fn_chat_alcanca(v_membro);

    -- Quem já saiu volta pela mesma linha: recriar apagaria o corte de leitura
    -- e o grupo reapareceria com tudo por ler.
    --
    -- `apagada_em` volta a NULL junto: sair marca os dois (ver
    -- `fn_chat_grupo_sair`), e limpar só um devolveria a pessoa ao grupo com a
    -- conversa ainda escondida da lista dela.
    UPDATE public.chat_participantes
       SET saiu_em = NULL, apagada_em = NULL, entrou_em = NOW(), adicionado_por = v_eu
     WHERE conversa_id = p_conversa AND perfil_id = v_membro AND saiu_em IS NOT NULL;

    IF NOT FOUND THEN
      INSERT INTO public.chat_participantes (conversa_id, perfil_id, adicionado_por)
      VALUES (p_conversa, v_membro, v_eu)
      ON CONFLICT DO NOTHING;
      CONTINUE WHEN NOT FOUND;
    END IF;

    SELECT nome INTO v_nome FROM public.perfis WHERE id = v_membro;
    PERFORM public.fn_chat_avisar(p_conversa, 'entrou',
      jsonb_build_object('quem', v_membro, 'quem_nome', v_nome));
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_grupo_adicionar(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupo_adicionar(UUID, UUID[]) TO authenticated;

/** Remove alguém. Quem administra remove; ninguém remove a si por aqui. */
CREATE OR REPLACE FUNCTION public.fn_chat_grupo_remover(p_conversa UUID, p_membro UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_nome TEXT;
BEGIN
  IF NOT public.fn_user_tem('chat_grupo_remover') OR NOT public.fn_chat_grupo_administro(p_conversa) THEN
    RAISE EXCEPTION 'Só quem administra o grupo pode remover pessoas.';
  END IF;
  IF p_membro = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Para sair do grupo use "Sair do grupo".';
  END IF;

  UPDATE public.chat_participantes
     SET saiu_em = NOW(), admin = FALSE
   WHERE conversa_id = p_conversa AND perfil_id = p_membro AND saiu_em IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT nome INTO v_nome FROM public.perfis WHERE id = p_membro;
  PERFORM public.fn_chat_avisar(p_conversa, 'removido',
    jsonb_build_object('quem', p_membro, 'quem_nome', v_nome));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_grupo_remover(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupo_remover(UUID, UUID) TO authenticated;

/**
 * Sair do grupo. Não precisa de permissão nenhuma: ninguém fica preso.
 *
 * O último administrador que sai promove quem entrou primeiro entre os que
 * ficam — grupo sem admin é grupo que ninguém mais consegue configurar.
 */
CREATE OR REPLACE FUNCTION public.fn_chat_grupo_sair(p_conversa UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu       UUID := (SELECT auth.uid());
  v_era_admin BOOLEAN;
  v_herdeiro UUID;
BEGIN
  /*
   * `apagada_em` junto com `saiu_em`, e não só o segundo.
   *
   * São duas coisas diferentes que precisam acontecer juntas aqui: `saiu_em`
   * tira a pessoa do grupo (para de receber, não escreve mais), e `apagada_em`
   * tira a conversa da LISTA dela. Sem o segundo o grupo continuava aparecendo
   * na lista, mudo — dava para abrir e ler o histórico, e não dava para
   * escrever nem receber mensagem nova. Quem saiu não entende por que a linha
   * ficou ali, e quem não saiu não entende por que ela não responde.
   *
   * O histórico não some do banco: as mensagens ficam, e readicionar a pessoa
   * (`fn_chat_grupo_adicionar` limpa os dois campos) devolve a conversa
   * inteira, com o corte de leitura onde estava.
   */
  UPDATE public.chat_participantes
     SET saiu_em = NOW(), apagada_em = NOW()
   WHERE conversa_id = p_conversa AND perfil_id = v_eu AND saiu_em IS NULL
  RETURNING admin INTO v_era_admin;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM public.fn_chat_avisar(p_conversa, 'saiu', jsonb_build_object('quem', v_eu));

  IF v_era_admin AND NOT EXISTS (
    SELECT 1 FROM public.chat_participantes
     WHERE conversa_id = p_conversa AND saiu_em IS NULL AND admin
  ) THEN
    SELECT perfil_id INTO v_herdeiro
      FROM public.chat_participantes
     WHERE conversa_id = p_conversa AND saiu_em IS NULL
     ORDER BY entrou_em
     LIMIT 1;
    IF v_herdeiro IS NOT NULL THEN
      UPDATE public.chat_participantes SET admin = TRUE
       WHERE conversa_id = p_conversa AND perfil_id = v_herdeiro;
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_grupo_sair(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupo_sair(UUID) TO authenticated;

/** Quem está no grupo, com papel — alimenta o painel de configurações. */
CREATE OR REPLACE FUNCTION public.fn_chat_grupo_membros(p_conversa UUID)
RETURNS TABLE (perfil_id UUID, nome TEXT, usuario TEXT, foto_url TEXT, cargo TEXT, admin BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id, p.nome, p.usuario, p.foto_url, p.perfil::TEXT, cp.admin
    FROM public.chat_participantes cp
    JOIN public.perfis p ON p.id = cp.perfil_id
   WHERE cp.conversa_id = p_conversa
     AND cp.saiu_em IS NULL
     AND (public.fn_chat_sou_parte(p_conversa)
          OR public.fn_chat_monitoro_conversa(p_conversa))
   ORDER BY cp.admin DESC, p.nome;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_grupo_membros(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupo_membros(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. A lista de conversas passa a devolver grupos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Mesmo encadeamento de 20260831150000: a versão que funciona é renomeada e a
-- nova a consome. Aqui, porém, a antiga só sabe de pares, então os GRUPOS são
-- calculados à parte e entram por UNION ALL.
--
-- `leitura_do_outro` e `entrega_do_outro` do grupo são o MÍNIMO entre os
-- outros participantes — é isso que faz «lida» significar «todos leram».

ALTER FUNCTION public.fn_chat_minhas_conversas()
  RENAME TO fn_chat_minhas_conversas_antes_grupos_20260901;

CREATE FUNCTION public.fn_chat_minhas_conversas()
RETURNS TABLE (
  id                  UUID,
  outro_id            UUID,
  outro_nome          TEXT,
  outro_usuario       TEXT,
  outro_foto          TEXT,
  outro_empresa       TEXT,
  ultima_mensagem_em  TIMESTAMPTZ,
  ultima_atividade_em TIMESTAMPTZ,
  em_historico        BOOLEAN,
  ultimo_texto        TEXT,
  ultimo_anexos       JSONB,
  ultimo_autor_id     UUID,
  nao_lidas           INTEGER,
  leitura_do_outro    TIMESTAMPTZ,
  entrega_minha       TIMESTAMPTZ,
  entrega_do_outro    TIMESTAMPTZ,
  outro_perfil        TEXT,
  tipo                TEXT,
  participantes       INTEGER,
  sou_admin           BOOLEAN,
  somente_lideranca   BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH eu AS (SELECT (SELECT auth.uid()) AS id),
  grupos AS (
    SELECT c.id, c.nome, c.foto_url, c.ultima_mensagem_em, c.somente_lideranca,
           p.ultima_leitura_em, p.ultima_entrega_em, p.admin
      FROM public.chat_participantes p
      JOIN public.chat_conversas c ON c.id = p.conversa_id
      CROSS JOIN eu
     WHERE p.perfil_id = eu.id
       AND p.saiu_em IS NULL
       AND p.apagada_em IS NULL
       AND c.tipo = 'grupo'
       AND c.ultima_mensagem_em IS NOT NULL
       AND public.fn_chat_pode_usar()
  ),
  ultima_g AS (
    SELECT DISTINCT ON (m.conversa_id)
           m.conversa_id, m.texto, m.anexos, m.autor_id
      FROM public.chat_mensagens m
     WHERE m.conversa_id IN (SELECT g.id FROM grupos g)
     ORDER BY m.conversa_id, m.criado_em DESC
  ),
  contagem_g AS (
    SELECT m.conversa_id, count(*)::INTEGER AS nao_lidas
      FROM public.chat_mensagens m
      JOIN grupos g ON g.id = m.conversa_id
     WHERE m.autor_id IS DISTINCT FROM (SELECT e.id FROM eu e)
       AND m.criado_em > COALESCE(g.ultima_leitura_em, '-infinity'::TIMESTAMPTZ)
     GROUP BY m.conversa_id
  ),
  outros_g AS (
    -- O MÍNIMO é a regra do WhatsApp: enquanto UMA pessoa não leu, ninguém leu.
    SELECT p.conversa_id,
           count(*)::INTEGER            AS quantos,
           min(p.ultima_leitura_em)     AS leitura,
           min(p.ultima_entrega_em)     AS entrega
      FROM public.chat_participantes p
      CROSS JOIN eu
     WHERE p.conversa_id IN (SELECT g.id FROM grupos g)
       AND p.saiu_em IS NULL
       AND p.perfil_id <> eu.id
     GROUP BY p.conversa_id
  )
  SELECT c.id, c.outro_id, c.outro_nome, c.outro_usuario, c.outro_foto,
         c.outro_empresa, c.ultima_mensagem_em, c.ultima_atividade_em,
         c.em_historico, c.ultimo_texto, c.ultimo_anexos, c.ultimo_autor_id,
         c.nao_lidas, c.leitura_do_outro, c.entrega_minha, c.entrega_do_outro,
         c.outro_perfil,
         'direta'::TEXT, 1, FALSE, FALSE
    FROM public.fn_chat_minhas_conversas_antes_grupos_20260901() c

  UNION ALL

  SELECT g.id,
         NULL::UUID,
         g.nome,
         NULL::TEXT,
         g.foto_url,
         NULL::TEXT,
         g.ultima_mensagem_em,
         g.ultima_mensagem_em,
         -- Grupo nunca cai no Histórico: a classificação por «atividade do
         -- outro» pressupõe UM outro, e com dez pessoas ela não significa nada.
         FALSE,
         ug.texto, ug.anexos, ug.autor_id,
         COALESCE(cg.nao_lidas, 0),
         og.leitura,
         g.ultima_entrega_em,
         og.entrega,
         NULL::TEXT,
         'grupo'::TEXT,
         COALESCE(og.quantos, 0) + 1,
         g.admin,
         g.somente_lideranca
    FROM grupos g
    LEFT JOIN ultima_g  ug ON ug.conversa_id = g.id
    LEFT JOIN contagem_g cg ON cg.conversa_id = g.id
    LEFT JOIN outros_g  og ON og.conversa_id = g.id

  ORDER BY 8 DESC NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_minhas_conversas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_minhas_conversas() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_minhas_conversas() IS
  'Lista unica do chat: conversas diretas (pela versao anterior, encadeada) e '
  'grupos. No grupo, leitura_do_outro e entrega_do_outro sao o MINIMO entre os '
  'outros participantes — e o que faz "lida" significar "todos leram".';

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Monitoria: quem posso ver, e o que ele vê
-- ═══════════════════════════════════════════════════════════════════════════

/** Pessoas que eu posso acompanhar, para o seletor da aba Monitor. */
CREATE OR REPLACE FUNCTION public.fn_chat_monitoraveis(p_busca TEXT DEFAULT NULL)
RETURNS TABLE (
  perfil_id UUID, nome TEXT, usuario TEXT, foto_url TEXT,
  cargo TEXT, setor_nome TEXT, empresa_slug TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id, p.nome, p.usuario, p.foto_url, p.perfil::TEXT, s.nome, e.slug
    FROM public.perfis p
    LEFT JOIN public.setores  s ON s.id = p.setor_id
    LEFT JOIN public.empresas e ON e.id = p.empresa_id
   WHERE public.fn_user_tem('chat_monitor')
     AND COALESCE(p.arquivado, FALSE) = FALSE
     AND p.ativo
     AND public.fn_chat_posso_monitorar(p.id)
     AND (
       NULLIF(TRIM(p_busca), '') IS NULL
       OR p.nome    ILIKE '%' || TRIM(p_busca) || '%'
       OR p.usuario ILIKE '%' || TRIM(p_busca) || '%'
     )
   ORDER BY p.nome
   LIMIT 60;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_monitoraveis(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_monitoraveis(TEXT) TO authenticated;

/**
 * A lista de conversas DA PESSOA MONITORADA.
 *
 * É a réplica: mesma forma da lista própria, do ponto de vista dela. Não traz
 * `nao_lidas` nem os cortes de entrega — quem monitora não lê nem entrega
 * nada, e mostrar «2 não lidas» num painel de observação sugeriria que o
 * contador é dele.
 */
CREATE OR REPLACE FUNCTION public.fn_chat_monitor_conversas(p_alvo UUID)
RETURNS TABLE (
  id                 UUID,
  outro_id           UUID,
  outro_nome         TEXT,
  outro_foto         TEXT,
  outro_perfil       TEXT,
  tipo               TEXT,
  participantes      INTEGER,
  ultima_mensagem_em TIMESTAMPTZ,
  ultimo_texto       TEXT,
  ultimo_anexos      JSONB,
  ultimo_autor_id    UUID
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH dele AS (
    SELECT c.id, c.tipo, c.nome, c.foto_url, c.ultima_mensagem_em,
           CASE WHEN c.tipo = 'direta'
                THEN CASE WHEN c.par_menor = p_alvo THEN c.par_maior ELSE c.par_menor END
           END AS outro
      FROM public.chat_participantes p
      JOIN public.chat_conversas c ON c.id = p.conversa_id
     WHERE p.perfil_id = p_alvo
       AND p.saiu_em IS NULL
       AND c.ultima_mensagem_em IS NOT NULL
       AND public.fn_chat_posso_monitorar(p_alvo)
  ),
  ultima AS (
    SELECT DISTINCT ON (m.conversa_id) m.conversa_id, m.texto, m.anexos, m.autor_id
      FROM public.chat_mensagens m
     WHERE m.conversa_id IN (SELECT d.id FROM dele d)
     ORDER BY m.conversa_id, m.criado_em DESC
  ),
  quantos AS (
    SELECT p.conversa_id, count(*)::INTEGER AS n
      FROM public.chat_participantes p
     WHERE p.conversa_id IN (SELECT d.id FROM dele d) AND p.saiu_em IS NULL
     GROUP BY p.conversa_id
  )
  SELECT d.id,
         d.outro,
         COALESCE(d.nome, o.nome),
         COALESCE(d.foto_url, o.foto_url),
         o.perfil::TEXT,
         d.tipo,
         COALESCE(q.n, 2),
         d.ultima_mensagem_em,
         u.texto, u.anexos, u.autor_id
    FROM dele d
    LEFT JOIN public.perfis o ON o.id = d.outro
    LEFT JOIN ultima u  ON u.conversa_id = d.id
    LEFT JOIN quantos q ON q.conversa_id = d.id
   ORDER BY d.ultima_mensagem_em DESC NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_monitor_conversas(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_monitor_conversas(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_monitor_conversas(UUID) IS
  'Replica da lista de conversas de outra pessoa, para a aba Monitor. Sem '
  'contador de nao lidas: quem observa nao le por ela.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. Permissões novas no catálogo do banco
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `fn_permissoes_catalogo` é encadeada (ver 20260825210000): a versão anterior
-- vira a fonte, e esta acrescenta as linhas novas por UNION. As chaves precisam
-- existir aqui porque `fn_user_tem` consulta este catálogo para saber se uma
-- chave exige concessão nominal.

ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_grupos_20260901;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_grupos_20260901()
  UNION ALL
  SELECT * FROM (VALUES
    ('chat_monitor',                      NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','ouvidoria']::TEXT[], false),
    ('chat_monitor_escopo_equipe',        NULL::TEXT[], ARRAY[]::TEXT[], false),
    ('chat_monitor_escopo_setor',         NULL::TEXT[], ARRAY['lider','elite','gerencia','ouvidoria']::TEXT[], false),
    ('chat_monitor_escopo_todos_setores', NULL::TEXT[], ARRAY['diretoria']::TEXT[], false),
    ('chat_grupo_criar',                  NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','ouvidoria']::TEXT[], false),
    ('chat_grupo_editar',                 NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','ouvidoria']::TEXT[], false),
    ('chat_grupo_adicionar',              NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','ouvidoria']::TEXT[], false),
    ('chat_grupo_remover',                NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','ouvidoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

REVOKE ALL ON FUNCTION public.fn_permissoes_catalogo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_permissoes_catalogo() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao 20260901 adiciona monitoria e '
  'grupos do chat sem reescrever nem perder o catalogo anterior.';

/*
 * As empresas QUE JÁ EXISTEM não passam pela trigger de semeadura.
 *
 * Sem este UPDATE as chaves novas nasceriam ausentes nas duas operações, e
 * `fn_user_tem` trata ausente como negado: o painel mostraria os toggles
 * desligados e ninguém teria monitoria nem grupo até alguém ligar à mão, cargo
 * por cargo, empresa por empresa.
 *
 * `||` sobre o JSONB existente, e não `jsonb_build_object` puro: sobrescrever
 * o objeto apagaria todas as permissões já configuradas da empresa. É o mesmo
 * cuidado que faltou no seed com ON CONFLICT DO NOTHING, que deixou a BookPlay
 * com zero permissões.
 */
UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
     'chat_monitor',                      cp.cargo IN ('lider','elite','gerencia','diretoria','ouvidoria'),
     'chat_monitor_escopo_equipe',        false,
     'chat_monitor_escopo_setor',         cp.cargo IN ('lider','elite','gerencia','ouvidoria'),
     'chat_monitor_escopo_todos_setores', cp.cargo IN ('diretoria'),
     'chat_grupo_criar',                  cp.cargo IN ('lider','elite','gerencia','diretoria','ouvidoria'),
     'chat_grupo_editar',                 cp.cargo IN ('lider','elite','gerencia','diretoria','ouvidoria'),
     'chat_grupo_adicionar',              cp.cargo IN ('lider','elite','gerencia','diretoria','ouvidoria'),
     'chat_grupo_remover',                cp.cargo IN ('lider','elite','gerencia','diretoria','ouvidoria')
   )
 WHERE NOT (cp.permissoes ? 'chat_monitor');

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. Foto do grupo no balde do chat
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Reaproveita o balde `chat`, que já existe e já tem policy de leitura para
-- quem está autenticado. A foto vai para `grupos/<conversa_id>/…`.

/**
 * `grupos/<conversa_id>/<arquivo>` → administro aquele grupo?
 *
 * O cast para UUID mora AQUI, dentro de um CASE, e não solto na policy. Um
 * `((storage.foldername(name))[2])::UUID` na condição parece protegido pelo
 * `[1] = 'grupos'` ao lado, mas o Postgres não promete avaliar os ramos de um
 * AND em ordem: ele pode tentar o cast primeiro, e aí QUALQUER anexo comum do
 * chat (`anexos/<uuid>/foto.png`, `audio/…`) faria a policy estourar com
 * «invalid input syntax for type uuid» — quebrando o upload de anexo, que não
 * tem nada a ver com grupo.
 *
 * `CASE` garante a ordem, e o regex garante que só texto de UUID chega ao cast.
 */
CREATE OR REPLACE FUNCTION public.fn_chat_grupo_foto_minha(p_caminho TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN (storage.foldername(p_caminho))[1] <> 'grupos' THEN FALSE
    WHEN COALESCE((storage.foldername(p_caminho))[2], '') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN FALSE
    ELSE public.fn_chat_grupo_administro(((storage.foldername(p_caminho))[2])::UUID)
  END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_grupo_foto_minha(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupo_foto_minha(TEXT) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS chat_grupo_foto_write ON storage.objects;
CREATE POLICY chat_grupo_foto_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat' AND public.fn_chat_grupo_foto_minha(name));

DROP POLICY IF EXISTS chat_grupo_foto_del ON storage.objects;
CREATE POLICY chat_grupo_foto_del ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat' AND public.fn_chat_grupo_foto_minha(name));

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. Realtime
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `chat_curtidas` NÃO entra na publicação de propósito: a curtida já acorda o
-- Realtime pelo UPDATE em `chat_mensagens` (ver `fn_chat_curtir`), e publicar a
-- tabela dobraria o tráfego para dizer a mesma coisa.
ALTER TABLE public.chat_conversas REPLICA IDENTITY FULL;
