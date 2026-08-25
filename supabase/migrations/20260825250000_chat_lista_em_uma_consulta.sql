-- ============================================================================
-- Chat — a lista de conversas em UMA consulta, e nao cinco
-- ============================================================================
--
-- ## O que estava caro
--
-- `listarConversas` montava a lista com cinco idas ao banco, e DUAS delas
-- baixavam o historico inteiro:
--
--   * a previa da ultima mensagem pedia TODAS as mensagens de TODAS as
--     conversas, ordenadas, e jogava fora tudo menos a primeira de cada;
--   * a contagem de nao lidas pedia as mesmas linhas de novo, para contar.
--
-- Isso rodava a cada evento de tempo real. Ou seja: cada mensagem que chegasse,
-- de qualquer conversa, baixava o historico completo duas vezes. Com um mes de
-- uso ja seriam milhares de linhas por mensagem recebida — o tipo de conta que
-- funciona no primeiro dia e trava no terceiro mes.
--
-- ## O desenho
--
-- `DISTINCT ON` resolve a ultima mensagem por conversa lendo o indice
-- `(conversa_id, criado_em)` de tras para frente — uma linha por conversa, sem
-- varrer o resto. A contagem sai de um `count(*) FILTER`, que o Postgres faz
-- num passe so.
--
-- A funcao devolve a lista PRONTA: quem e o outro, foto, empresa, previa, nao
-- lidas e a leitura do outro. Uma ida ao banco, e o cliente so desenha.
--
-- ## O recorte continua sendo do banco
--
-- SECURITY DEFINER para poder ler o perfil de quem esta do outro lado mesmo
-- quando ele e de outra empresa (o chat atravessa desde a 20260825230000). Mas
-- a consulta parte SEMPRE de `chat_participantes` do proprio `auth.uid()`: nao
-- ha argumento, nao ha como pedir a lista de outra pessoa.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_chat_msg_conversa_desc
  ON public.chat_mensagens (conversa_id, criado_em DESC);

CREATE OR REPLACE FUNCTION public.fn_chat_minhas_conversas()
RETURNS TABLE (
  id                 UUID,
  outro_id           UUID,
  outro_nome         TEXT,
  outro_usuario      TEXT,
  outro_foto         TEXT,
  outro_empresa      TEXT,
  ultima_mensagem_em TIMESTAMPTZ,
  ultimo_texto       TEXT,
  ultimo_anexos      JSONB,
  ultimo_autor_id    UUID,
  nao_lidas          INTEGER,
  leitura_do_outro   TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH eu AS (SELECT (SELECT auth.uid()) AS id),
  minhas AS (
    SELECT c.id, c.par_menor, c.par_maior, c.ultima_mensagem_em,
           p.ultima_leitura_em,
           CASE WHEN c.par_menor = eu.id THEN c.par_maior ELSE c.par_menor END AS outro
      FROM public.chat_participantes p
      JOIN public.chat_conversas c ON c.id = p.conversa_id
      CROSS JOIN eu
     WHERE p.perfil_id = eu.id
       AND p.apagada_em IS NULL
       AND p.oculta_em  IS NULL
       -- Conversa sem nenhuma mensagem nao e conversa ainda: foi aberta e a
       -- pessoa desistiu de escrever. Na lista seria uma linha vazia que nao
       -- some sozinha.
       AND c.ultima_mensagem_em IS NOT NULL
       AND public.fn_chat_pode_usar()
  ),
  ultima AS (
    -- Uma linha por conversa, lendo o indice de tras para frente.
    SELECT DISTINCT ON (m.conversa_id)
           m.conversa_id, m.texto, m.anexos, m.autor_id
      FROM public.chat_mensagens m
     WHERE m.conversa_id IN (SELECT id FROM minhas)
     ORDER BY m.conversa_id, m.criado_em DESC
  ),
  contagem AS (
    -- O corte de data vive no WHERE, e nao num FILTER sobre tudo: assim o
    -- indice `(conversa_id, criado_em DESC)` pula direto para o trecho nao
    -- lido, em vez de varrer a conversa inteira para descartar quase tudo.
    -- Numa conversa de mil mensagens com duas nao lidas, e a diferenca entre
    -- ler duas linhas e ler mil.
    SELECT m.conversa_id, count(*)::INTEGER AS nao_lidas
      FROM public.chat_mensagens m
      JOIN minhas mi ON mi.id = m.conversa_id
     WHERE m.autor_id IS DISTINCT FROM (SELECT id FROM eu)
       AND m.criado_em > COALESCE(mi.ultima_leitura_em, '-infinity'::TIMESTAMPTZ)
     GROUP BY m.conversa_id
  )
  SELECT mi.id,
         mi.outro,
         o.nome,
         o.usuario,
         o.foto_url,
         -- Quem atende as duas nao ganha tag: rotular de uma so seria dizer uma
         -- meia verdade sobre onde a pessoa esta.
         CASE WHEN o.perfil = 'super_admin' OR COALESCE(o.acesso_multiempresa, FALSE)
              THEN NULL ELSE emp.slug END,
         mi.ultima_mensagem_em,
         u.texto,
         u.anexos,
         u.autor_id,
         COALESCE(ct.nao_lidas, 0),
         po.ultima_leitura_em
    FROM minhas mi
    JOIN public.perfis o        ON o.id = mi.outro
    LEFT JOIN public.empresas emp ON emp.id = o.empresa_id
    LEFT JOIN ultima u          ON u.conversa_id = mi.id
    LEFT JOIN contagem ct       ON ct.conversa_id = mi.id
    LEFT JOIN public.chat_participantes po
           ON po.conversa_id = mi.id AND po.perfil_id = mi.outro
   ORDER BY mi.ultima_mensagem_em DESC NULLS LAST;
$$;

REVOKE ALL     ON FUNCTION public.fn_chat_minhas_conversas() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_chat_minhas_conversas() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_minhas_conversas() IS
  'A lista de conversas pronta, numa consulta. Substitui cinco idas ao banco, '
  'duas delas baixando o historico inteiro a cada mensagem recebida.';

-- ── Uma conversa so, mesmo sem mensagem ─────────────────────────────────────
--
-- A recem-criada nao aparece na lista (sem mensagem, ver acima), e a tela
-- precisa dela para nao abrir em branco.

CREATE OR REPLACE FUNCTION public.fn_chat_uma_conversa(p_conversa UUID)
RETURNS TABLE (
  id UUID, outro_id UUID, outro_nome TEXT, outro_usuario TEXT,
  outro_foto TEXT, outro_empresa TEXT, ultima_mensagem_em TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id,
         o.id, o.nome, o.usuario, o.foto_url,
         CASE WHEN o.perfil = 'super_admin' OR COALESCE(o.acesso_multiempresa, FALSE)
              THEN NULL ELSE emp.slug END,
         c.ultima_mensagem_em
    FROM public.chat_conversas c
    JOIN public.perfis o
      ON o.id = CASE WHEN c.par_menor = (SELECT auth.uid())
                     THEN c.par_maior ELSE c.par_menor END
    LEFT JOIN public.empresas emp ON emp.id = o.empresa_id
   WHERE c.id = p_conversa
     AND (SELECT auth.uid()) IN (c.par_menor, c.par_maior)
     AND public.fn_chat_pode_usar();
$$;

REVOKE ALL     ON FUNCTION public.fn_chat_uma_conversa(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_chat_uma_conversa(UUID) TO authenticated;
