-- ═══════════════════════════════════════════════════════════════════════════
-- Chat: o Histórico volta a soltar, quem saiu apaga, e a conversa se fixa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Três defeitos, dois deles regressão da migration de hoje de manhã
-- (20260903320000_chat_sair_admin_curtida_e_monitor).
--
--   1. Mensagem nova não tirava mais a conversa do Histórico. Aquela migration
--      reescreveu `fn_chat_apos_mensagem` para pular quem saiu do grupo e, no
--      caminho, perdeu as DUAS linhas que faziam a classificação funcionar:
--      `ultima_atividade_em` e `oculta_em`. Sem a primeira, a conversa nasce e
--      morre no Histórico; sem a segunda, a conversa criada por disparo nunca
--      reaparece quando alguém responde à mão.
--
--   2. Apagar um grupo de que eu saí não fazia nada — e nem dava erro. A policy
--      `chat_part_update` pergunta `fn_chat_sou_parte`, que a mesma migration
--      passou a responder «não» para quem saiu. A pergunta certa aqui é
--      `fn_chat_leio_conversa`: a linha ainda é minha, e apagá-la é justamente
--      o que encerra a relação com aquele grupo.
--
--   3. Fixar conversa não existia. A lista ordenava só por atividade, e o que
--      importa todo dia afundava embaixo do que chegou por último.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. O gatilho volta a carimbar a atividade
-- ═══════════════════════════════════════════════════════════════════════════
--
-- É a versão de 20260828122407 com a trava de 20260903320000 por cima: quem
-- saiu do grupo não é ressuscitado por mensagem que ele nem pode ler.
--
-- A distinção entre mensagem manual e disparo continua sendo o coração da
-- coisa: disparo NÃO é atividade para quem disparou, senão mandar a mesma
-- mensagem para vinte pessoas criaria vinte linhas em «Conversas» — que é o
-- defeito que a aba Disparos existe para não ter.

CREATE OR REPLACE FUNCTION public.fn_chat_apos_mensagem()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- O topo da conversa reflete QUALQUER mensagem, inclusive disparo. A
  -- classificação Conversas/Histórico usa o corte por participante, abaixo.
  UPDATE public.chat_conversas
     SET ultima_mensagem_em = NEW.criado_em
   WHERE id = NEW.conversa_id;

  IF NEW.disparo_id IS NULL THEN
    -- Mensagem manual: reativa os dois lados na mesma hora.
    UPDATE public.chat_participantes
       SET apagada_em          = NULL,
           oculta_em           = NULL,
           ultima_atividade_em = NEW.criado_em
     WHERE conversa_id = NEW.conversa_id
       AND saiu_em IS NULL;
  ELSE
    -- Disparo: reativa só quem RECEBEU. Para o autor não muda nada.
    UPDATE public.chat_participantes
       SET apagada_em          = NULL,
           oculta_em           = NULL,
           ultima_atividade_em = NEW.criado_em
     WHERE conversa_id = NEW.conversa_id
       AND saiu_em IS NULL
       AND perfil_id IS DISTINCT FROM NEW.autor_id;
  END IF;

  -- Quem escreveu leu o que escreveu.
  UPDATE public.chat_participantes
     SET ultima_leitura_em = NEW.criado_em
   WHERE conversa_id = NEW.conversa_id AND perfil_id = NEW.autor_id;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_apos_mensagem() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_chat_apos_mensagem() IS
  'Depois de cada mensagem: carimba o topo da conversa e a atividade de cada '
  'participante que ainda esta dentro. Disparo nao conta como atividade para '
  'quem disparou. Quem saiu do grupo nao e ressuscitado.';

-- ── Conserto do que passou pelo gatilho quebrado ────────────────────────────
--
-- Enquanto o gatilho esteve sem estas linhas, cada mensagem nova deixou a
-- conversa exatamente onde estava. Recalcular a atividade a partir das
-- mensagens devolve a verdade — e só para a frente: `<` garante que nada
-- recue no tempo, então uma conversa corretamente arquivada continua lá.

WITH atividade AS (
  SELECT p.conversa_id,
         p.perfil_id,
         MAX(m.criado_em) FILTER (
           WHERE m.disparo_id IS NULL
              OR m.autor_id IS DISTINCT FROM p.perfil_id
         ) AS ate
    FROM public.chat_participantes p
    JOIN public.chat_mensagens m ON m.conversa_id = p.conversa_id
   WHERE p.saiu_em IS NULL
   GROUP BY p.conversa_id, p.perfil_id
)
UPDATE public.chat_participantes p
   SET ultima_atividade_em = a.ate
  FROM atividade a
 WHERE a.conversa_id = p.conversa_id
   AND a.perfil_id   = p.perfil_id
   AND a.ate IS NOT NULL
   AND (p.ultima_atividade_em IS NULL OR p.ultima_atividade_em < a.ate);

-- A conversa nascida de disparo que já recebeu resposta manual precisa
-- aparecer. `oculta_em` é a marca de «disparei e ninguém respondeu ainda».
UPDATE public.chat_participantes p
   SET oculta_em = NULL
 WHERE p.oculta_em IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.chat_mensagens m
      WHERE m.conversa_id = p.conversa_id
        AND m.disparo_id IS NULL
        AND m.criado_em > p.oculta_em
   );

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Quem saiu do grupo apaga a própria linha
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `fn_chat_sou_parte` responde «participo AGORA» — a pergunta que autoriza
-- escrever e ser contado. Mexer na PRÓPRIA linha é outra coisa: continua sendo
-- minha depois da saída, e apagá-la é o único jeito de tirar da lista o grupo
-- de que já saí. A pergunta certa é `fn_chat_leio_conversa`.
--
-- ## E por que os GRANTs de coluna aparecem aqui
--
-- Alargar o `USING` sem isto abriria um buraco: a policy só confere de QUEM é
-- a linha, não QUAL coluna mudou. Quem saiu poderia mandar
-- `SET saiu_em = NULL` e voltar sozinho a um grupo de que foi removido.
--
-- O buraco, aliás, já existia para quem está dentro: `UPDATE ... SET admin =
-- true` na própria linha passava pela policy e transformava qualquer membro em
-- administrador do grupo. As permissões de coluna fecham os dois: o cliente
-- escreve leitura, entrega, apagada, oculta e fixada — nada mais. Quem entra,
-- sai, administra e é removido continua sendo assunto das `fn_chat_grupo_*`,
-- que são SECURITY DEFINER e conferem quem pode.

DROP POLICY IF EXISTS chat_part_update ON public.chat_participantes;
CREATE POLICY chat_part_update ON public.chat_participantes FOR UPDATE TO authenticated
USING      (perfil_id = (SELECT auth.uid()) AND public.fn_chat_leio_conversa(conversa_id))
WITH CHECK (perfil_id = (SELECT auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Fixar conversa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Por participante, e não por conversa: fixar é uma decisão sobre a MINHA
-- lista. Fixar para o outro seria mexer na tela de alguém que não pediu.

ALTER TABLE public.chat_participantes
  ADD COLUMN IF NOT EXISTS fixada_em TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_participantes.fixada_em IS
  'Quando EU fixei esta conversa no topo da minha lista. NULL = nao fixada. '
  'Vale so para mim: a lista do outro nao muda.';

-- As colunas que o cliente pode escrever na própria linha. Ver a seção 2.
REVOKE UPDATE ON public.chat_participantes FROM authenticated;
GRANT UPDATE (ultima_leitura_em, ultima_entrega_em, apagada_em, oculta_em, fixada_em)
  ON public.chat_participantes TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. A lista entrega o «fixada» e ordena por ele
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Coluna nova obriga DROP + CREATE: `CREATE OR REPLACE` não muda a assinatura
-- de retorno. O corpo é o de 20260903320000 com dois acréscimos — a coluna e a
-- ordenação — e a cadeia de funções encadeadas continua intacta.

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
  sai                 BOOLEAN,
  fixada              BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH eu AS (SELECT (SELECT auth.uid()) AS id),
  grupos AS (
    SELECT c.id, c.nome, c.foto_url, c.somente_lideranca,
           p.ultima_leitura_em, p.ultima_entrega_em, p.admin,
           p.saiu_em, p.fixada_em,
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
  ),
  -- A conversa DIRETA vem da cadeia encadeada, que não conhece `fixada_em`.
  -- A minha linha em `chat_participantes` responde por ela aqui em cima, sem
  -- obrigar a reescrever as três funções anteriores.
  fixadas AS (
    SELECT p.conversa_id
      FROM public.chat_participantes p
      CROSS JOIN eu
     WHERE p.perfil_id = eu.id AND p.fixada_em IS NOT NULL
  )
  SELECT c.id, c.outro_id, c.outro_nome, c.outro_usuario, c.outro_foto,
         c.outro_empresa, c.ultima_mensagem_em, c.ultima_atividade_em,
         c.em_historico, c.ultimo_texto, c.ultimo_anexos, c.ultimo_autor_id,
         c.nao_lidas, c.leitura_do_outro, c.entrega_minha, c.entrega_do_outro,
         c.outro_perfil,
         'direta'::TEXT, 1, FALSE, FALSE, FALSE,
         EXISTS (SELECT 1 FROM fixadas f WHERE f.conversa_id = c.id)
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
         g.saiu_em IS NOT NULL,
         g.fixada_em IS NOT NULL
    FROM grupos g
    LEFT JOIN ultima_g  ug ON ug.conversa_id = g.id
    LEFT JOIN contagem_g cg ON cg.conversa_id = g.id
    LEFT JOIN outros_g  og ON og.conversa_id = g.id

  -- 23 = fixada, 8 = ultima_atividade_em. Fixada primeiro, e dentro de cada
  -- grupo a ordem de sempre.
  ORDER BY 23 DESC, 8 DESC NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_minhas_conversas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_minhas_conversas() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_minhas_conversas() IS
  'Lista unica do chat: conversas diretas (versao anterior, encadeada) e grupos, '
  'inclusive os de que eu sai e ainda nao apaguei (sai = true). As fixadas por '
  'mim vem primeiro. Para quem saiu, ultima mensagem e nao lidas param no '
  'instante da saida.';
