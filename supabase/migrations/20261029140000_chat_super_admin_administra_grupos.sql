-- ============================================================================
-- Chat: o super admin administra qualquer grupo, mesmo sem estar nele
-- 29/10/2026 · pedido do Kauan
-- ============================================================================
--
-- «Super admin tem que conseguir colocar e excluir pessoas de qualquer grupo,
-- não importando qual — mesmo um grupo de que eu nem participo —, assim como
-- trocar a foto, entre outros.»
--
-- Até aqui só quem administra O GRUPO (`chat_participantes.admin`) mexia nele.
-- A pergunta é uma só, `fn_chat_grupo_administro`, e todas as escritas passam
-- por ela: nome, foto e trava (`fn_chat_grupo_config`), adicionar, remover,
-- tornar administrador (`fn_chat_grupo_admin`) e subir a foto no storage
-- (`fn_chat_grupo_foto_minha`). Ela passa a responder «sim» também para o
-- super admin em qualquer grupo — e nenhuma dessas funções precisa ser
-- recriada.
--
-- ## Administrar não é ler
--
-- Em 28/10 (20261028140000) o Cleber pediu que conversa com super admin fosse
-- privada, até de outro super admin. Isto não abre essa porta: o super admin
-- que não está no grupo vê o nome, a foto e quem está dentro, e não lê
-- nenhuma mensagem. As policies de mensagem não mudam.
--
-- Para ele achar o grupo, `fn_chat_grupos_todos` lista todos (nome, foto,
-- quantos, se ele está dentro) — só para super admin.
--
-- ## O que muda junto
--
--   - `fn_chat_grupo_membros`: o super admin lista os membros de qualquer
--     grupo (é a tela onde ele adiciona e remove).
--   - `fn_chat_participantes_nomes`: devolve também o nome de quem escreveu
--     aviso na conversa sem ser participante. Sem isso, o «Kauan adicionou
--     Fulano» aparecia como «Alguém adicionou Fulano» para quem está no grupo.
--   - `fn_chat_posso_ler_anexo`: a FOTO do grupo (`grupos/<id>/…`) também
--     para quem administra — o super admin vê a foto que está trocando.
--   - `fn_chat_grupo_remover`: tirar o último administrador promove quem
--     entrou primeiro entre os que ficam (a regra que `fn_chat_grupo_sair` já
--     tinha). Antes só um administrador removia outro, e sobrava ele; agora o
--     super admin de fora pode tirar o último.
--
-- ## Histórico de quem entra depois (conferido, não mudou)
--
-- Quem é adicionado depois lê o grupo INTEIRO, desde a criação: a policy
-- `chat_msg_select` corta só pela saída (`fn_chat_leio_ate`), nunca pela
-- entrada. As mensagens antigas chegam como não lidas.
--
-- Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. A pergunta: administro este grupo? ───────────────────────────────────
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
  )
  -- O super admin administra qualquer grupo, mesmo sem estar nele (20261029140000).
  OR (
    (SELECT public.fn_user_is_super_admin())
    AND EXISTS (SELECT 1 FROM public.chat_conversas c WHERE c.id = p_conversa AND c.tipo = 'grupo')
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_grupo_administro(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupo_administro(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_grupo_administro(UUID) IS
  'Administro este grupo? Admin do grupo, ou super admin em qualquer grupo (20261029140000). '
  'Administrar nao e ler: as mensagens continuam so para quem participa.';

-- ── 2. Quem está no grupo ───────────────────────────────────────────────────
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
          OR public.fn_chat_monitoro_conversa(p_conversa)
          OR public.fn_chat_grupo_administro(p_conversa))
   ORDER BY cp.admin DESC, p.nome;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_grupo_membros(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupo_membros(UUID) TO authenticated;

-- ── 3. O nome do autor do aviso ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chat_participantes_nomes(p_conversa UUID)
RETURNS TABLE (perfil_id UUID, nome TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id, p.nome
    FROM public.perfis p
   WHERE (public.fn_chat_sou_parte(p_conversa)
          OR public.fn_chat_monitoro_conversa(p_conversa))
     AND (
       p.id IN (SELECT cp.perfil_id FROM public.chat_participantes cp WHERE cp.conversa_id = p_conversa)
       -- Quem mexeu no grupo de fora (o super admin): só o autor de aviso.
       OR p.id IN (SELECT m.autor_id FROM public.chat_mensagens m
                    WHERE m.conversa_id = p_conversa AND m.sistema IS NOT NULL)
     );
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_participantes_nomes(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_participantes_nomes(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_participantes_nomes(UUID) IS
  'Nome de todo mundo que ja participou da conversa, inclusive quem saiu, e de quem deixou aviso '
  'sem participar (o super admin que administra de fora, 20261029140000). Mesma guarda de '
  'fn_chat_grupo_membros. Usada para nomear o autor de aviso e de mensagem antiga de ex-membro.';

-- ── 4. A foto do grupo, para quem administra ────────────────────────────────
-- Igual a 20261028140000, com `fn_chat_grupo_administro` no ramo `grupos/`.
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
        OR public.fn_chat_monitoro_conversa(v_conversa)
        OR public.fn_chat_grupo_administro(v_conversa);
  END IF;

  -- `<conversa>/…`: o caminho comum, e o caso rápido.
  BEGIN
    v_conversa := v_primeiro::UUID;
  EXCEPTION WHEN others THEN
    v_conversa := NULL;
  END;

  IF v_conversa IS NOT NULL
     AND (public.fn_chat_leio_conversa(v_conversa)
          OR public.fn_chat_monitoro_conversa(v_conversa)) THEN
    RETURN TRUE;
  END IF;

  -- O disparo (o caminho é o rascunho) e a mensagem que mudou de conversa.
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

-- ── 5. Remover: o grupo nunca fica sem administrador ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chat_grupo_remover(p_conversa UUID, p_membro UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_nome      TEXT;
  v_era_admin BOOLEAN;
  v_herdeiro  UUID;
BEGIN
  IF NOT public.fn_user_tem('chat_grupo_remover') OR NOT public.fn_chat_grupo_administro(p_conversa) THEN
    RAISE EXCEPTION 'Só quem administra o grupo pode remover pessoas.';
  END IF;
  IF p_membro = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Para sair do grupo use "Sair do grupo".';
  END IF;

  UPDATE public.chat_participantes cp
     SET saiu_em = NOW(), admin = FALSE
    FROM (SELECT admin FROM public.chat_participantes
           WHERE conversa_id = p_conversa AND perfil_id = p_membro AND saiu_em IS NULL) antes
   WHERE cp.conversa_id = p_conversa AND cp.perfil_id = p_membro AND cp.saiu_em IS NULL
  RETURNING antes.admin INTO v_era_admin;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT nome INTO v_nome FROM public.perfis WHERE id = p_membro;
  PERFORM public.fn_chat_avisar(p_conversa, 'removido',
    jsonb_build_object('quem', p_membro, 'quem_nome', v_nome));

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

REVOKE ALL ON FUNCTION public.fn_chat_grupo_remover(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupo_remover(UUID, UUID) TO authenticated;

-- ── 6. Todos os grupos (só super admin) ─────────────────────────────────────
-- Nome, foto e contagem — nada de mensagem: administrar não é ler.
CREATE OR REPLACE FUNCTION public.fn_chat_grupos_todos()
RETURNS TABLE (
  id                 UUID,
  nome               TEXT,
  foto_url           TEXT,
  somente_lideranca  BOOLEAN,
  participantes      INTEGER,
  sou_parte          BOOLEAN,
  criado_em          TIMESTAMPTZ,
  ultima_mensagem_em TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super admin vê todos os grupos' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.id, c.nome, c.foto_url, c.somente_lideranca,
         (SELECT count(*)::INTEGER FROM public.chat_participantes p
           WHERE p.conversa_id = c.id AND p.saiu_em IS NULL),
         EXISTS (SELECT 1 FROM public.chat_participantes p
                  WHERE p.conversa_id = c.id AND p.perfil_id = (SELECT auth.uid()) AND p.saiu_em IS NULL),
         c.criado_em, c.ultima_mensagem_em
    FROM public.chat_conversas c
   WHERE c.tipo = 'grupo'
   ORDER BY c.nome;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_grupos_todos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_grupos_todos() TO authenticated;

-- ── Prova ──────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_chat_grupos_todos') THEN
    RAISE EXCEPTION 'chat: faltou fn_chat_grupos_todos';
  END IF;
  IF position('fn_user_is_super_admin' IN pg_get_functiondef('public.fn_chat_grupo_administro(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'chat: fn_chat_grupo_administro sem o super admin';
  END IF;
  IF position('fn_chat_grupo_administro' IN pg_get_functiondef('public.fn_chat_posso_ler_anexo(text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'chat: foto do grupo sem quem administra';
  END IF;
END;
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Para desfazer ──────────────────────────────────────────────────────────
-- Reaplicar as definições anteriores: fn_chat_grupo_administro, fn_chat_grupo_membros
-- e fn_chat_grupo_remover de 20260901120000; fn_chat_participantes_nomes de
-- 20260914190000; fn_chat_posso_ler_anexo de 20261028140000. E:
-- DROP FUNCTION IF EXISTS public.fn_chat_grupos_todos();
