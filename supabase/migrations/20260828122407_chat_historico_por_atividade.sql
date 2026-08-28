-- ============================================================================
-- Chat: Conversas de hoje, Historico e reativacao por mensagem manual
-- ============================================================================
--
-- Nao existe movimentacao fisica nem cron. Cada participante guarda a ultima
-- atividade que realmente reativa a SUA lista:
--
--   * mensagem comum .............. reativa os dois lados;
--   * disparo ..................... reativa apenas quem recebeu;
--   * disparo feito por mim ....... nao tira a conversa do Historico e nao
--                                    cria uma linha em Conversas;
--   * mensagem manual depois dele . reativa imediatamente os dois lados.
--
-- A RPC compara esse instante com a meia-noite de America/Sao_Paulo. Portanto,
-- abrir o chat num novo dia ja devolve a conversa como historica, sem depender
-- de a tela ter ficado aberta na virada.

ALTER TABLE public.chat_participantes
  ADD COLUMN IF NOT EXISTS ultima_atividade_em TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_participantes.ultima_atividade_em IS
  'Ultima mensagem que ativa a lista deste participante. Mensagem comum conta '
  'para ambos; disparo conta somente para quem recebeu.';

-- Preserva o comportamento que os dados existentes ja tinham. Para o autor,
-- um disparo nao e atividade; para o destinatario, e uma mensagem recebida e
-- continua acessivel como conversa.
WITH atividade AS (
  SELECT p.conversa_id,
         p.perfil_id,
         MAX(m.criado_em) FILTER (
           WHERE m.disparo_id IS NULL
              OR m.autor_id IS DISTINCT FROM p.perfil_id
         ) AS ultima_atividade_em
    FROM public.chat_participantes p
    LEFT JOIN public.chat_mensagens m ON m.conversa_id = p.conversa_id
   GROUP BY p.conversa_id, p.perfil_id
)
UPDATE public.chat_participantes p
   SET ultima_atividade_em = a.ultima_atividade_em
  FROM atividade a
 WHERE a.conversa_id = p.conversa_id
   AND a.perfil_id = p.perfil_id
   AND p.ultima_atividade_em IS DISTINCT FROM a.ultima_atividade_em;

-- A lista parte de perfil_id, ignora apagadas/ocultas e ordena pela atividade.
-- O mesmo indice serve Conversas e Historico; a separacao por dia acontece
-- depois que o pequeno conjunto daquele participante ja foi encontrado.
DROP INDEX IF EXISTS public.idx_chat_part_pessoa;
CREATE INDEX idx_chat_part_pessoa
  ON public.chat_participantes (perfil_id, ultima_atividade_em DESC)
  WHERE apagada_em IS NULL
    AND oculta_em IS NULL
    AND ultima_atividade_em IS NOT NULL;

-- ── Mensagem nova: atualiza a atividade correta de cada lado ────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_apos_mensagem()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- O topo da conversa continua refletindo qualquer mensagem, inclusive
  -- disparo. A classificacao Conversas/Historico usa o corte por participante.
  UPDATE public.chat_conversas
     SET ultima_mensagem_em = NEW.criado_em
   WHERE id = NEW.conversa_id;

  IF NEW.disparo_id IS NULL THEN
    -- Mensagem manual: aparece imediatamente para quem escreveu e para quem
    -- recebeu. E esta condicao que corrige a conversa presa em Disparos.
    UPDATE public.chat_participantes
       SET apagada_em          = NULL,
           oculta_em           = NULL,
           ultima_atividade_em = NEW.criado_em
     WHERE conversa_id = NEW.conversa_id;
  ELSE
    -- Disparo: quem recebeu precisa enxergar a mensagem. Para o autor, nao
    -- altera atividade nem visibilidade; a conversa fica em Historico ou
    -- continua oculta se nunca houve conversa individual.
    UPDATE public.chat_participantes
       SET apagada_em          = NULL,
           oculta_em           = NULL,
           ultima_atividade_em = NEW.criado_em
     WHERE conversa_id = NEW.conversa_id
       AND perfil_id IS DISTINCT FROM NEW.autor_id;
  END IF;

  -- Quem escreveu leu o que escreveu.
  UPDATE public.chat_participantes
     SET ultima_leitura_em = NEW.criado_em
   WHERE conversa_id = NEW.conversa_id
     AND perfil_id = NEW.autor_id;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_apos_mensagem() FROM PUBLIC, anon, authenticated;

-- ── Uma consulta continua entregando a lista inteira ────────────────────────

DROP FUNCTION IF EXISTS public.fn_chat_minhas_conversas();

CREATE FUNCTION public.fn_chat_minhas_conversas()
RETURNS TABLE (
  id                 UUID,
  outro_id           UUID,
  outro_nome         TEXT,
  outro_usuario      TEXT,
  outro_foto         TEXT,
  outro_empresa      TEXT,
  ultima_mensagem_em TIMESTAMPTZ,
  ultima_atividade_em TIMESTAMPTZ,
  em_historico       BOOLEAN,
  ultimo_texto       TEXT,
  ultimo_anexos      JSONB,
  ultimo_autor_id    UUID,
  nao_lidas          INTEGER,
  leitura_do_outro   TIMESTAMPTZ,
  entrega_minha      TIMESTAMPTZ,
  entrega_do_outro   TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH eu AS (
    SELECT (SELECT auth.uid()) AS id
  ),
  limite AS (
    SELECT date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
             AT TIME ZONE 'America/Sao_Paulo' AS inicio_de_hoje
  ),
  minhas AS (
    SELECT c.id, c.par_menor, c.par_maior, c.ultima_mensagem_em,
           p.ultima_atividade_em, p.ultima_leitura_em, p.ultima_entrega_em,
           CASE WHEN c.par_menor = eu.id THEN c.par_maior ELSE c.par_menor END AS outro
      FROM public.chat_participantes p
      JOIN public.chat_conversas c ON c.id = p.conversa_id
      CROSS JOIN eu
     WHERE p.perfil_id = eu.id
       AND p.apagada_em IS NULL
       AND p.oculta_em IS NULL
       AND p.ultima_atividade_em IS NOT NULL
       AND c.ultima_mensagem_em IS NOT NULL
       AND public.fn_chat_pode_usar()
  ),
  ultima AS (
    SELECT DISTINCT ON (m.conversa_id)
           m.conversa_id, m.texto, m.anexos, m.autor_id
      FROM public.chat_mensagens m
     WHERE m.conversa_id IN (SELECT mi.id FROM minhas mi)
     ORDER BY m.conversa_id, m.criado_em DESC
  ),
  contagem AS (
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
         CASE WHEN o.perfil = 'super_admin' OR COALESCE(o.acesso_multiempresa, FALSE)
              THEN NULL ELSE emp.slug END,
         mi.ultima_mensagem_em,
         mi.ultima_atividade_em,
         mi.ultima_atividade_em < limite.inicio_de_hoje,
         u.texto,
         u.anexos,
         u.autor_id,
         COALESCE(ct.nao_lidas, 0),
         po.ultima_leitura_em,
         mi.ultima_entrega_em,
         po.ultima_entrega_em
    FROM minhas mi
    CROSS JOIN limite
    JOIN public.perfis o ON o.id = mi.outro
    LEFT JOIN public.empresas emp ON emp.id = o.empresa_id
    LEFT JOIN ultima u ON u.conversa_id = mi.id
    LEFT JOIN contagem ct ON ct.conversa_id = mi.id
    LEFT JOIN public.chat_participantes po
           ON po.conversa_id = mi.id AND po.perfil_id = mi.outro
   ORDER BY mi.ultima_atividade_em DESC;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_minhas_conversas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_minhas_conversas() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_minhas_conversas() IS
  'Lista unica do chat, classificada entre Conversas de hoje e Historico pela '
  'ultima atividade valida de cada participante no horario de Sao Paulo.';
