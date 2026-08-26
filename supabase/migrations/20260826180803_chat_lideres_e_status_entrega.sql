-- ============================================================================
-- Chat: líderes nas equipes explícitas + estados enviada/entregue/visualizada
-- ============================================================================

-- A leitura já existia. A entrega é um corte separado, atualizado pelo cliente
-- do destinatário quando ele recebe a mensagem pelo Realtime (ou baixa a lista
-- ao reconectar). Assim "online" não é confundido com "recebeu".
ALTER TABLE public.chat_participantes
  ADD COLUMN IF NOT EXISTS ultima_entrega_em TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_participantes.ultima_entrega_em IS
  'Mensagem com criado_em <= este valor já chegou ao cliente deste participante.';

-- Tudo que já foi visualizado necessariamente também foi entregue.
UPDATE public.chat_participantes
   SET ultima_entrega_em = ultima_leitura_em
 WHERE ultima_leitura_em IS NOT NULL
   AND (ultima_entrega_em IS NULL OR ultima_entrega_em < ultima_leitura_em);

-- ── Equipes e setores válidos especificamente para o chat ──────────────────
--
-- fn_equipes_do_operador representa associação operacional (perfil + clones).
-- O líder escolhido no campo próprio mora em equipe_lideres e não pode ser
-- misturado globalmente nessa função, porque relatórios têm regras diferentes.
-- O chat une as duas fontes aqui, sem alterar nenhum outro módulo.

CREATE OR REPLACE FUNCTION public.fn_chat_equipes_do_perfil(p_perfil UUID)
RETURNS TABLE (equipe_id UUID, setor_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT q.equipe_id, q.setor_id
    FROM public.fn_equipes_do_operador(p_perfil) q
  UNION
  SELECT el.equipe_id, e.setor_id
    FROM public.equipe_lideres el
    JOIN public.equipes e ON e.id = el.equipe_id
   WHERE el.lider_id = p_perfil;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_equipes_do_perfil(UUID) FROM PUBLIC;

COMMENT ON FUNCTION public.fn_chat_equipes_do_perfil(UUID) IS
  'Equipes do perfil para o chat: associação operacional mais equipes em que '
  'ele foi escolhido explicitamente como líder.';

CREATE OR REPLACE FUNCTION public.fn_chat_setores_do_perfil(p_perfil UUID)
RETURNS TABLE (setor_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT s.setor_id
    FROM public.fn_setores_do_operador(p_perfil) AS s(setor_id)
  UNION
  SELECT e.setor_id
    FROM public.fn_chat_equipes_do_perfil(p_perfil) e
   WHERE e.setor_id IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_setores_do_perfil(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.fn_chat_alcanca(p_alvo UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p_alvo <> (SELECT auth.uid())
     AND public.fn_chat_pode_usar()
     AND public.fn_chat_pode_usar(p_alvo)
     AND EXISTS (
       SELECT 1
         FROM public.perfis b
        WHERE b.id = p_alvo
          AND public.fn_can_access_empresa(b.empresa_id)
          AND (
            public.fn_user_is_super_admin()
            OR public.fn_user_tem('chat_cargo_' || b.perfil)
          )
     )
     AND (
       public.fn_user_is_super_admin()
       OR public.fn_user_tem('chat_escopo_todos_setores')
       OR (public.fn_user_tem('chat_escopo_setor') AND EXISTS (
             SELECT 1
               FROM public.fn_chat_setores_do_perfil((SELECT auth.uid())) meu
              WHERE meu.setor_id IN (
                SELECT alvo.setor_id
                  FROM public.fn_chat_setores_do_perfil(p_alvo) alvo
              )))
       OR (public.fn_user_tem('chat_escopo_equipe') AND EXISTS (
             SELECT 1
               FROM public.fn_chat_equipes_do_perfil((SELECT auth.uid())) minha
              WHERE minha.equipe_id IN (
                SELECT alvo.equipe_id
                  FROM public.fn_chat_equipes_do_perfil(p_alvo) alvo
              )))
     );
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_alcanca(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_alcanca(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_chat_contatos()
RETURNS TABLE (
  perfil_id     UUID,
  nome          TEXT,
  usuario       TEXT,
  foto_url      TEXT,
  cargo         TEXT,
  setor_id      UUID,
  setor_nome    TEXT,
  equipe_id     UUID,
  equipe_nome   TEXT,
  empresa_slug  TEXT,
  multiempresa  BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT contatos.*
    FROM (
      SELECT DISTINCT
             p.id AS perfil_id, p.nome, p.usuario, p.foto_url,
             p.perfil::TEXT AS cargo,
             s.id AS setor_id, s.nome AS setor_nome,
             e.id AS equipe_id, e.nome AS equipe_nome,
             emp.slug AS empresa_slug,
             (p.perfil = 'super_admin' OR COALESCE(p.acesso_multiempresa, FALSE))
               AS multiempresa
        FROM public.perfis p
        LEFT JOIN public.equipes e ON e.id IN (
          SELECT q.equipe_id FROM public.fn_chat_equipes_do_perfil(p.id) q
        )
        LEFT JOIN public.setores s ON s.id = COALESCE(e.setor_id, p.setor_id)
        LEFT JOIN public.empresas emp ON emp.id = p.empresa_id
       WHERE COALESCE(p.ativo, TRUE)
         AND NOT COALESCE(p.arquivado, FALSE)
         AND p.id <> (SELECT auth.uid())
         AND public.fn_chat_alcanca(p.id)
    ) AS contatos
   ORDER BY contatos.multiempresa, contatos.setor_nome, contatos.equipe_nome,
            (contatos.cargo = 'lider') DESC, contatos.nome;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_contatos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_contatos() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_contatos() IS
  'Contatos do chat agrupados pelas associações operacionais e também pelas '
  'equipes em que o perfil foi escolhido explicitamente como líder.';

-- ── Lista com os cortes de entrega dos dois participantes ──────────────────

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
  WITH eu AS (SELECT (SELECT auth.uid()) AS id),
  minhas AS (
    SELECT c.id, c.par_menor, c.par_maior, c.ultima_mensagem_em,
           p.ultima_leitura_em, p.ultima_entrega_em,
           CASE WHEN c.par_menor = eu.id THEN c.par_maior ELSE c.par_menor END AS outro
      FROM public.chat_participantes p
      JOIN public.chat_conversas c ON c.id = p.conversa_id
      CROSS JOIN eu
     WHERE p.perfil_id = eu.id
       AND p.apagada_em IS NULL
       AND p.oculta_em IS NULL
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
         u.texto,
         u.anexos,
         u.autor_id,
         COALESCE(ct.nao_lidas, 0),
         po.ultima_leitura_em,
         mi.ultima_entrega_em,
         po.ultima_entrega_em
    FROM minhas mi
    JOIN public.perfis o ON o.id = mi.outro
    LEFT JOIN public.empresas emp ON emp.id = o.empresa_id
    LEFT JOIN ultima u ON u.conversa_id = mi.id
    LEFT JOIN contagem ct ON ct.conversa_id = mi.id
    LEFT JOIN public.chat_participantes po
           ON po.conversa_id = mi.id AND po.perfil_id = mi.outro
   ORDER BY mi.ultima_mensagem_em DESC NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_minhas_conversas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_minhas_conversas() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_minhas_conversas() IS
  'Lista de conversas com leitura e entrega persistentes dos dois participantes.';
