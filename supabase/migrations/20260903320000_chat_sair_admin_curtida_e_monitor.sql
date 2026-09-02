-- ============================================================================
-- Chat: sair sem perder o histórico, administrador por pessoa, aviso de
-- curtida, galeria do grupo e os chats recentes do setor no monitor.
--
-- Seis mudanças que compartilham as mesmas tabelas e por isso viajam juntas.
-- Cada bloco explica a sua.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Sair do grupo para de apagar a conversa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `fn_chat_grupo_sair` marcava `saiu_em` E `apagada_em`. O segundo tirava a
-- linha da lista, e o histórico sumia junto — para reler era preciso alguém
-- readicionar a pessoa. O pedido é o do WhatsApp: sair tira do grupo, a
-- conversa continua na lista, e só some se a própria pessoa apagar.
--
-- Isso obriga a separar duas perguntas que até aqui eram a mesma:
--
--   `fn_chat_sou_parte`     — participo AGORA (escrevo, curto, sou contado)
--   `fn_chat_leio_conversa` — posso LER esta conversa
--
-- Quem saiu responde FALSE à primeira e TRUE à segunda. E o corte é a data da
-- saída: mensagem posterior a ela não é entregue a quem já não está no grupo.
-- Sem esse corte, «sair» viraria «sair e continuar lendo tudo», que é
-- exatamente o vazamento que o item 7 do pedido manda impedir.

CREATE OR REPLACE FUNCTION public.fn_chat_grupo_sair(p_conversa UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu       UUID := (SELECT auth.uid());
  v_herdeiro UUID;
BEGIN
  /*
   * Só `saiu_em`. `apagada_em` fica para o botão de apagar a conversa.
   *
   * A versão anterior marcava os dois e explicava por quê: uma linha muda na
   * lista, que dá para abrir e não dá para usar, confunde. A resposta agora é
   * outra — a linha não fica muda, fica ARQUIVADA: mostra o histórico até o
   * instante da saída e troca o campo de escrita por um aviso.
   */
  -- Sair também tira a administração: voltar ao grupo não devolve o cargo.
  UPDATE public.chat_participantes
     SET saiu_em = NOW(), admin = FALSE
   WHERE conversa_id = p_conversa AND perfil_id = v_eu AND saiu_em IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM public.fn_chat_avisar(p_conversa, 'saiu', jsonb_build_object('quem', v_eu));

  /*
   * A herança pergunta ao GRUPO, não à linha que acabou de sair.
   *
   * A versão anterior guardava `admin` num RETURNING e só herdava se quem saiu
   * era administrador. Com o `admin = FALSE` acima no mesmo UPDATE, o RETURNING
   * passaria a devolver o valor JÁ ZERADO e a herança nunca aconteceria. Olhar
   * para o grupo responde a pergunta certa e não depende dessa ordem: se não
   * sobrou administrador, promove — não importa quem saiu.
   */
  IF NOT EXISTS (
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

COMMENT ON FUNCTION public.fn_chat_grupo_sair(UUID) IS
  'Sai do grupo. Marca saiu_em e NAO apaga a conversa: o historico ate a saida '
  'continua na lista ate a pessoa apagar. Se o grupo ficar sem admin, promove '
  'quem entrou primeiro.';

-- ── Quem lê o quê ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_leio_conversa(p_conversa UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participantes p
     WHERE p.conversa_id = p_conversa
       AND p.perfil_id   = (SELECT auth.uid())
       AND p.apagada_em IS NULL
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_leio_conversa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_leio_conversa(UUID) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.fn_chat_leio_conversa(UUID) IS
  'Posso ABRIR esta conversa? Participo agora, ou sai e ainda nao apaguei. Nao '
  'confundir com fn_chat_sou_parte, que responde "participo AGORA" e e a que '
  'autoriza escrever, curtir e ser contado.';

/**
 * Até quando eu leio esta conversa.
 *
 * `infinity` para quem está dentro; o instante da saída para quem saiu. É o
 * corte que impede o grupo de continuar entregando mensagem a ex-integrante.
 */
CREATE OR REPLACE FUNCTION public.fn_chat_leio_ate(p_conversa UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(MAX(COALESCE(p.saiu_em, 'infinity'::TIMESTAMPTZ)),
                  '-infinity'::TIMESTAMPTZ)
    FROM public.chat_participantes p
   WHERE p.conversa_id = p_conversa
     AND p.perfil_id   = (SELECT auth.uid())
     AND p.apagada_em IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_leio_ate(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_leio_ate(UUID) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.fn_chat_leio_ate(UUID) IS
  'Ate que instante eu leio esta conversa: infinity para quem esta dentro, a '
  'data da saida para quem saiu. -infinity quando nao ha linha (nada a ler).';

-- As policies passam a usar a pergunta certa.
DROP POLICY IF EXISTS chat_conversas_select ON public.chat_conversas;
CREATE POLICY chat_conversas_select ON public.chat_conversas FOR SELECT TO authenticated
  USING (public.fn_chat_leio_conversa(id) OR public.fn_chat_monitoro_conversa(id));

DROP POLICY IF EXISTS chat_part_select ON public.chat_participantes;
CREATE POLICY chat_part_select ON public.chat_participantes FOR SELECT TO authenticated
  USING (public.fn_chat_leio_conversa(conversa_id) OR public.fn_chat_monitoro_conversa(conversa_id));

-- A mensagem tem o corte no tempo: quem saiu lê o que existia até a saída.
DROP POLICY IF EXISTS chat_msg_select ON public.chat_mensagens;
CREATE POLICY chat_msg_select ON public.chat_mensagens FOR SELECT TO authenticated
  USING (
    public.fn_chat_monitoro_conversa(conversa_id)
    OR (
      public.fn_chat_leio_conversa(conversa_id)
      AND criado_em <= public.fn_chat_leio_ate(conversa_id)
    )
  );

/*
 * O gatilho que ressuscita a conversa apagada passa a pular quem saiu.
 *
 * Ele existe para que apagar não vire bloqueio silencioso: mensagem nova traz
 * a conversa de volta para os dois lados. Só que agora `saiu_em` sobrevive ao
 * `apagada_em`, e sem esta condição o grupo voltaria à lista de quem saiu toda
 * vez que alguém lá dentro escrevesse — uma linha que reaparece sozinha e não
 * mostra a mensagem que a trouxe.
 */
CREATE OR REPLACE FUNCTION public.fn_chat_apos_mensagem()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.chat_conversas
     SET ultima_mensagem_em = NEW.criado_em
   WHERE id = NEW.conversa_id;

  UPDATE public.chat_participantes
     SET apagada_em = NULL
   WHERE conversa_id = NEW.conversa_id
     AND apagada_em IS NOT NULL
     AND saiu_em IS NULL;

  UPDATE public.chat_participantes
     SET ultima_leitura_em = NEW.criado_em
   WHERE conversa_id = NEW.conversa_id AND perfil_id = NEW.autor_id;

  RETURN NEW;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Administrador por pessoa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Faltava a operação: `admin` só era escrito na criação do grupo e na herança
-- do último administrador que sai. Agora quem administra promove e rebaixa.
--
-- Rebaixar a si mesmo é permitido, com uma trava: o grupo não pode ficar sem
-- nenhum administrador. Sem ela, bastava o único admin se rebaixar por engano
-- para o grupo virar inconfigurável para sempre.

CREATE OR REPLACE FUNCTION public.fn_chat_grupo_admin(
  p_conversa UUID, p_membro UUID, p_admin BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_nome TEXT;
  v_tipo TEXT;
BEGIN
  IF NOT public.fn_chat_grupo_administro(p_conversa) THEN
    RAISE EXCEPTION 'Só quem administra o grupo pode mudar quem administra.';
  END IF;

  SELECT c.tipo INTO v_tipo FROM public.chat_conversas c WHERE c.id = p_conversa;
  IF v_tipo IS DISTINCT FROM 'grupo' THEN
    RAISE EXCEPTION 'Conversa direta não tem administrador.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chat_participantes
     WHERE conversa_id = p_conversa AND perfil_id = p_membro AND saiu_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Essa pessoa não está no grupo.';
  END IF;

  -- Nunca deixar o grupo sem ninguém que o administre.
  IF NOT p_admin AND NOT EXISTS (
    SELECT 1 FROM public.chat_participantes
     WHERE conversa_id = p_conversa AND saiu_em IS NULL
       AND admin AND perfil_id <> p_membro
  ) THEN
    RAISE EXCEPTION 'O grupo ficaria sem administrador. Promova outra pessoa antes.';
  END IF;

  UPDATE public.chat_participantes
     SET admin = p_admin
   WHERE conversa_id = p_conversa AND perfil_id = p_membro AND saiu_em IS NULL
     AND admin IS DISTINCT FROM p_admin;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT nome INTO v_nome FROM public.perfis WHERE id = p_membro;
  PERFORM public.fn_chat_avisar(
    p_conversa,
    CASE WHEN p_admin THEN 'promovido' ELSE 'rebaixado' END,
    jsonb_build_object('quem', p_membro, 'quem_nome', v_nome)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_grupo_admin(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupo_admin(UUID, UUID, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_grupo_admin(UUID, UUID, BOOLEAN) IS
  'Promove ou rebaixa quem administra o grupo. Exige administrar o grupo e '
  'recusa deixar o grupo sem nenhum administrador.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A curtida volta a dizer quem curtiu
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `curtida_por` foi zerado quando a curtida virou contagem — `chat_curtidas`
-- passou a guardar a lista, e o campo ficou sem uso. Ele volta agora com um
-- sentido novo e estreito: QUEM CURTIU POR ÚLTIMO, para o autor da mensagem
-- receber o aviso «fulano curtiu sua mensagem».
--
-- Por que aqui e não numa tabela de notificação: `chat_curtidas` não está na
-- publicação do Realtime, e já existe um UPDATE em `chat_mensagens` a cada
-- curtida só para acordar o tempo real. O nome pega carona nesse UPDATE que já
-- acontece — nenhuma consulta a mais, nenhuma linha a mais.

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
  -- apareceria para o grupo inteiro e denunciaria a monitoria. Quem saiu do
  -- grupo também não curte — lê o histórico e nada mais.
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
   * `curtida_por` só é preenchido ao CURTIR. Descurtir o zera: o aviso é de
   * uma coisa que aconteceu, e reaproveitar o campo no caminho de volta faria
   * o autor receber «fulano curtiu» no instante em que fulano descurtiu.
   */
  UPDATE public.chat_mensagens
     SET curtida_em  = NOW(),
         curtida_por = CASE WHEN p_curtir THEN v_eu ELSE NULL END
   WHERE id = p_mensagem_id;

  RETURN v_total;
END;
$function$;

COMMENT ON COLUMN public.chat_mensagens.curtida_por IS
  'Quem curtiu POR ULTIMO, so para o aviso ao autor. A lista de quem curtiu e '
  'chat_curtidas; este campo nao conta nem desenha o selo.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. A lista de conversas mostra o grupo de que eu saí
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Duas mudanças em `fn_chat_minhas_conversas`:
--
--   • o grupo entra por `apagada_em IS NULL` em vez de `saiu_em IS NULL`;
--   • a coluna nova `sai` diz à tela que aquilo é um arquivo, não um grupo
--     ativo — é ela que troca o campo de escrita pelo aviso.
--
-- A última mensagem e a contagem de não lidas de quem saiu param na saída:
-- contar mensagem que a pessoa não pode abrir mostraria um número que nunca
-- zera. Coluna nova obriga DROP + CREATE — `CREATE OR REPLACE` não muda a
-- assinatura de retorno.

DROP FUNCTION IF EXISTS public.fn_chat_minhas_conversas();

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
  somente_lideranca   BOOLEAN,
  sai                 BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH eu AS (SELECT (SELECT auth.uid()) AS id),
  grupos AS (
    SELECT c.id, c.nome, c.foto_url, c.somente_lideranca,
           p.ultima_leitura_em, p.ultima_entrega_em, p.admin,
           p.saiu_em,
           -- O relógio de quem saiu para na saída: a linha desce na lista e
           -- deixa de subir a cada mensagem de um grupo que já não é dela.
           LEAST(c.ultima_mensagem_em,
                 COALESCE(p.saiu_em, 'infinity'::TIMESTAMPTZ)) AS ultima_mensagem_em
      FROM public.chat_participantes p
      JOIN public.chat_conversas c ON c.id = p.conversa_id
      CROSS JOIN eu
     WHERE p.perfil_id = eu.id
       AND p.apagada_em IS NULL
       AND c.tipo = 'grupo'
       AND c.ultima_mensagem_em IS NOT NULL
       AND public.fn_chat_pode_usar()
  ),
  ultima_g AS (
    SELECT DISTINCT ON (m.conversa_id)
           m.conversa_id, m.texto, m.anexos, m.autor_id
      FROM public.chat_mensagens m
      JOIN grupos g ON g.id = m.conversa_id
     WHERE m.criado_em <= COALESCE(g.saiu_em, 'infinity'::TIMESTAMPTZ)
     ORDER BY m.conversa_id, m.criado_em DESC
  ),
  contagem_g AS (
    SELECT m.conversa_id, count(*)::INTEGER AS nao_lidas
      FROM public.chat_mensagens m
      JOIN grupos g ON g.id = m.conversa_id
     WHERE m.autor_id IS DISTINCT FROM (SELECT e.id FROM eu e)
       AND m.criado_em > COALESCE(g.ultima_leitura_em, '-infinity'::TIMESTAMPTZ)
       AND m.criado_em <= COALESCE(g.saiu_em, 'infinity'::TIMESTAMPTZ)
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
         'direta'::TEXT, 1, FALSE, FALSE, FALSE
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
         COALESCE(og.quantos, 0) + CASE WHEN g.saiu_em IS NULL THEN 1 ELSE 0 END,
         g.admin,
         g.somente_lideranca,
         g.saiu_em IS NOT NULL
    FROM grupos g
    LEFT JOIN ultima_g  ug ON ug.conversa_id = g.id
    LEFT JOIN contagem_g cg ON cg.conversa_id = g.id
    LEFT JOIN outros_g  og ON og.conversa_id = g.id

  ORDER BY 8 DESC NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_minhas_conversas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_minhas_conversas() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_minhas_conversas() IS
  'Lista unica do chat: conversas diretas (versao anterior, encadeada) e grupos, '
  'inclusive os de que eu sai e ainda nao apaguei (sai = true). Para quem saiu, '
  'ultima mensagem e nao lidas param no instante da saida.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. A galeria do grupo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- As imagens, GIFs e vídeos da conversa inteira, e não só das mensagens que a
-- rolagem já carregou — a galeria existe justamente para não obrigar ninguém a
-- subir a conversa toda para reencontrar uma foto.
--
-- A RLS de `chat_mensagens` NÃO se aplica dentro de uma função SECURITY
-- DEFINER, então o recorte é repetido aqui à mão, igual ao da policy: leio a
-- conversa e a mensagem é anterior ao meu corte, ou eu monitoro.

CREATE OR REPLACE FUNCTION public.fn_chat_midias(p_conversa UUID, p_limite INTEGER DEFAULT 120)
RETURNS TABLE (
  mensagem_id UUID,
  criado_em   TIMESTAMPTZ,
  autor_id    UUID,
  autor_nome  TEXT,
  anexo       JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT m.id, m.criado_em, m.autor_id, p.nome, a.anexo
    FROM public.chat_mensagens m
    LEFT JOIN public.perfis p ON p.id = m.autor_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.anexos, '[]'::JSONB)) AS a(anexo)
   WHERE m.conversa_id = p_conversa
     AND (
       public.fn_chat_monitoro_conversa(p_conversa)
       OR (public.fn_chat_leio_conversa(p_conversa)
           AND m.criado_em <= public.fn_chat_leio_ate(p_conversa))
     )
     AND COALESCE(a.anexo->>'tipo', '') ~ '^(image|video)/'
   ORDER BY m.criado_em DESC
   LIMIT GREATEST(COALESCE(p_limite, 120), 1);
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_midias(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_midias(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_midias(UUID, INTEGER) IS
  'Imagens, GIFs e videos de uma conversa, do mais novo para o mais velho, para '
  'a galeria do grupo. Repete o recorte da policy de chat_mensagens porque '
  'SECURITY DEFINER nao passa pela RLS.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Chats recentes do setor, no monitor
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O monitor abria numa lista de PESSOAS, e para achar o que estava acontecendo
-- era preciso adivinhar em quem clicar. Esta função responde a pergunta que a
-- pessoa realmente faz ao abrir a aba: o que se conversou por último, dentro do
-- que eu já posso acompanhar.
--
-- O alcance é o mesmo de sempre — `fn_chat_posso_monitorar`, pessoa a pessoa.
-- Nada aqui amplia quem eu vejo: se nenhum participante da conversa está no meu
-- alcance, ela não aparece. Conversa em que EU participo também não entra: ela
-- já está na minha lista, e o monitor não é para me ver.

CREATE OR REPLACE FUNCTION public.fn_chat_monitor_recentes(p_limite INTEGER DEFAULT 15)
RETURNS TABLE (
  conversa_id        UUID,
  tipo               TEXT,
  titulo             TEXT,
  foto_url           TEXT,
  participantes      INTEGER,
  ultima_mensagem_em TIMESTAMPTZ,
  ultimo_texto       TEXT,
  ultimo_anexos      JSONB,
  ultimo_autor_id    UUID,
  ultimo_autor_nome  TEXT,
  quem_id            UUID,
  quem_nome          TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH visiveis AS (
    SELECT c.id, c.tipo, c.nome, c.foto_url, c.ultima_mensagem_em
      FROM public.chat_conversas c
     WHERE public.fn_user_tem('chat_monitor')
       AND c.ultima_mensagem_em IS NOT NULL
       AND NOT public.fn_chat_sou_parte(c.id)
       AND EXISTS (
         SELECT 1 FROM public.chat_participantes p
          WHERE p.conversa_id = c.id
            AND p.saiu_em IS NULL
            AND public.fn_chat_posso_monitorar(p.perfil_id)
       )
     ORDER BY c.ultima_mensagem_em DESC
     LIMIT GREATEST(COALESCE(p_limite, 15), 1)
  ),
  -- A pessoa do meu alcance que justifica a linha. É por ela que a tela abre a
  -- réplica, e é o nome que explica ao monitor por que a conversa aparece.
  ancora AS (
    SELECT DISTINCT ON (p.conversa_id) p.conversa_id, p.perfil_id, pe.nome
      FROM public.chat_participantes p
      JOIN public.perfis pe ON pe.id = p.perfil_id
     WHERE p.conversa_id IN (SELECT v.id FROM visiveis v)
       AND p.saiu_em IS NULL
       AND public.fn_chat_posso_monitorar(p.perfil_id)
     ORDER BY p.conversa_id, pe.nome
  ),
  quantos AS (
    SELECT p.conversa_id, count(*)::INTEGER AS n
      FROM public.chat_participantes p
     WHERE p.conversa_id IN (SELECT v.id FROM visiveis v) AND p.saiu_em IS NULL
     GROUP BY p.conversa_id
  ),
  ultima AS (
    SELECT DISTINCT ON (m.conversa_id)
           m.conversa_id, m.texto, m.anexos, m.autor_id, pe.nome
      FROM public.chat_mensagens m
      LEFT JOIN public.perfis pe ON pe.id = m.autor_id
     WHERE m.conversa_id IN (SELECT v.id FROM visiveis v)
     ORDER BY m.conversa_id, m.criado_em DESC
  ),
  -- Numa conversa direta o título é «Fulano e Beltrano»: sem os dois nomes a
  -- linha diria só quem eu alcanço, e duas conversas dele ficariam iguais.
  nomes AS (
    SELECT p.conversa_id, string_agg(pe.nome, ' e ' ORDER BY pe.nome) AS titulo
      FROM public.chat_participantes p
      JOIN public.perfis pe ON pe.id = p.perfil_id
     WHERE p.conversa_id IN (SELECT v.id FROM visiveis v) AND p.saiu_em IS NULL
     GROUP BY p.conversa_id
  )
  SELECT v.id,
         v.tipo,
         COALESCE(NULLIF(v.nome, ''), n.titulo, 'Conversa'),
         v.foto_url,
         COALESCE(q.n, 0),
         v.ultima_mensagem_em,
         u.texto, u.anexos, u.autor_id, u.nome,
         a.perfil_id, a.nome
    FROM visiveis v
    LEFT JOIN ancora  a ON a.conversa_id = v.id
    LEFT JOIN quantos q ON q.conversa_id = v.id
    LEFT JOIN ultima  u ON u.conversa_id = v.id
    LEFT JOIN nomes   n ON n.conversa_id = v.id
   ORDER BY v.ultima_mensagem_em DESC;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_monitor_recentes(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_monitor_recentes(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_monitor_recentes(INTEGER) IS
  'Conversas mais recentes dentro do alcance de monitoria de quem chama. Mesmo '
  'alcance de fn_chat_posso_monitorar — nao amplia nada. Exclui as conversas de '
  'que eu mesmo participo: essas ja estao na minha lista.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. O anexo passa a ser da conversa, e não do balde
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Este é um vazamento de verdade, achado na auditoria pedida no item 7.
--
-- A policy de leitura do balde `chat` dizia, inteira:
--
--     USING (bucket_id = 'chat' AND public.fn_chat_pode_usar())
--
-- Ou seja: QUALQUER pessoa que possa usar o chat podia assinar a URL de
-- QUALQUER anexo já enviado — toda foto, áudio, vídeo e PDF de toda conversa
-- da empresa, incluindo conversas privadas entre duas outras pessoas. A tabela
-- `chat_mensagens` está protegida por RLS e não entrega o caminho a quem não
-- deve; mas quem obtivesse um caminho por qualquer outro meio — um print, um
-- link colado, um caminho visto quando ainda participava do grupo — continuava
-- lendo o arquivo para sempre, muito depois de perder o acesso à conversa.
--
-- O balde é privado e os caminhos têm UUID, então na prática o que protegia o
-- arquivo era ninguém saber o caminho. Isso é obscuridade, não permissão.
--
-- A regra nova amarra o arquivo à conversa. Três formas de caminho, três
-- respostas, na ordem em que aparecem:
--
--   <conversa_uuid>/<arquivo>          anexo de conversa — leio a conversa?
--   grupos/<conversa_uuid>/<arquivo>   foto do grupo     — leio a conversa?
--   disparos/<rascunho>/<arquivo>      disparo — o caminho NÃO diz a conversa,
--                                      então vale se existe uma mensagem que
--                                      eu posso ler carregando este anexo.
--
-- E quem subiu sempre lê o que subiu: é o que permite ver o anexo do disparo
-- enquanto ele ainda está sendo montado, antes de existir mensagem nenhuma.

CREATE OR REPLACE FUNCTION public.fn_chat_posso_ler_anexo(p_caminho TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_primeiro TEXT;
  v_segundo  TEXT;
  v_conversa UUID;
BEGIN
  IF p_caminho IS NULL OR NOT public.fn_chat_pode_usar() THEN RETURN FALSE; END IF;

  v_primeiro := split_part(p_caminho, '/', 1);
  v_segundo  := split_part(p_caminho, '/', 2);

  -- `grupos/<conversa>/…`: a foto do grupo.
  IF v_primeiro = 'grupos' THEN
    BEGIN v_conversa := v_segundo::UUID; EXCEPTION WHEN others THEN RETURN FALSE; END;
    RETURN public.fn_chat_leio_conversa(v_conversa)
        OR public.fn_chat_monitoro_conversa(v_conversa);
  END IF;

  -- `<conversa>/…`: o caminho comum, e o caso rápido.
  BEGIN
    v_conversa := v_primeiro::UUID;
  EXCEPTION WHEN others THEN
    v_conversa := NULL;
  END;

  IF v_conversa IS NOT NULL THEN
    RETURN public.fn_chat_leio_conversa(v_conversa)
        OR public.fn_chat_monitoro_conversa(v_conversa);
  END IF;

  /*
   * Sobrou o disparo, cujo caminho é o rascunho e não a conversa. A pergunta
   * vira: existe uma mensagem QUE EU POSSO LER carregando este anexo? O
   * recorte repetido aqui é o mesmo da policy de `chat_mensagens` — SECURITY
   * DEFINER não passa pela RLS, então ela precisa ser reescrita, não herdada.
   */
  RETURN EXISTS (
    SELECT 1
      FROM public.chat_mensagens m
     WHERE m.anexos @> jsonb_build_array(jsonb_build_object('url', p_caminho))
       AND (
         public.fn_chat_monitoro_conversa(m.conversa_id)
         OR (public.fn_chat_leio_conversa(m.conversa_id)
             AND m.criado_em <= public.fn_chat_leio_ate(m.conversa_id))
       )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_posso_ler_anexo(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_posso_ler_anexo(TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_posso_ler_anexo(TEXT) IS
  'Este caminho do balde chat pertence a uma conversa que eu posso ler? Amarra '
  'o arquivo a conversa: ate 03/09/2026 a policy so perguntava se a pessoa '
  'podia usar o chat, e com isso qualquer anexo era legivel por qualquer um.';

-- Sem este índice a busca do disparo varre `chat_mensagens` a cada leitura de
-- anexo. O `@>` de jsonb é exatamente o que o GIN resolve.
CREATE INDEX IF NOT EXISTS idx_chat_mensagens_anexos_gin
  ON public.chat_mensagens USING GIN (anexos jsonb_path_ops);

DROP POLICY IF EXISTS chat_anexo_read ON storage.objects;
CREATE POLICY chat_anexo_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat'
  AND (
    -- Quem subiu sempre lê o que subiu: é o que deixa ver o anexo do disparo
    -- enquanto ele está sendo montado, antes de existir mensagem.
    owner = (SELECT auth.uid())
    OR public.fn_chat_posso_ler_anexo(name)
  )
);

COMMIT;
