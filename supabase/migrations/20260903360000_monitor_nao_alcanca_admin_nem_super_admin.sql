-- ═══════════════════════════════════════════════════════════════════════════
-- Administrador e super admin não são monitoráveis
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O furo
--
-- `fn_chat_posso_monitorar` decidia por empresa, setor e equipe — e **nunca
-- olhava o cargo do alvo**. Quem tem `chat_monitor_escopo_todos_setores`
-- alcançava qualquer pessoa da empresa, super admin incluído.
--
-- Medido em 02/09/2026:
--
--   diretoria .......................... empresa inteira → alcançava os 5 super admins
--   administrador ...................... idem (fn_user_tem concede tudo ao cargo)
--   gerencia, lider, elite, ouvidoria .. só o próprio setor
--   operador, rh ....................... não monitora
--
-- Gerência e líder não alcançavam por ACIDENTE: os super admins estão com
-- `setor_id` nulo, e `v_alvo.setor_id = v_meu.setor_id` dá NULL. Bastava um
-- super admin ganhar um setor para o alcance aparecer sozinho. Proteção que
-- depende de um campo estar vazio não é proteção.
--
-- ## A regra
--
-- Super admin alcança todo mundo, inclusive outro super admin. Nenhum outro
-- cargo alcança administrador nem super admin — e isso é decidido pelo CARGO
-- do alvo, não pelo escopo: escopo se mexe no painel de permissões, isto não.
--
-- ## O que continua funcionando
--
-- Ler a conversa de um monitorável NÃO muda. `fn_chat_monitoro_conversa` pede
-- «existe ALGUM participante que eu posso monitorar», então o líder que
-- monitora o Diego continua abrindo a conversa Diego ↔ super admin inteira. O
-- que sai do alcance é a conversa em que TODOS os participantes são
-- administradores ou super admins.
--
-- Uma função só, e as cinco portas fecham juntas: a lista de monitoráveis
-- (`fn_chat_monitoraveis`), os chats recentes (`fn_chat_monitor_recentes`), a
-- conversa (`chat_conversas_select`), as mensagens (`chat_msg_select`) e os
-- anexos (`fn_chat_posso_ler_anexo`, que passa pela leitura da mensagem).
--
-- Impacto medido antes de aplicar, sobre as 312 conversas existentes: 1 direta
-- e 2 grupos saem do monitor. As outras 176 que têm um admin dentro continuam
-- monitoráveis pelo participante que não é admin.

CREATE OR REPLACE FUNCTION public.fn_chat_posso_monitorar(p_alvo uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_eu    UUID := (SELECT auth.uid());
  v_meu   RECORD;
  v_alvo  RECORD;
BEGIN
  IF v_eu IS NULL OR p_alvo IS NULL OR p_alvo = v_eu THEN
    RETURN FALSE;
  END IF;

  SELECT perfil, empresa_id, setor_id, equipe_id, acesso_multiempresa
    INTO v_meu FROM public.perfis WHERE id = v_eu;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- `perfil` entrou aqui: é o cargo do ALVO que decide a linha logo abaixo.
  SELECT perfil, empresa_id, setor_id, equipe_id
    INTO v_alvo FROM public.perfis WHERE id = p_alvo;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Super admin alcança todo mundo, inclusive outro super admin. Fica ANTES da
  -- trava para não travar a si mesmo.
  IF v_meu.perfil = 'super_admin' THEN RETURN TRUE; END IF;

  -- Ninguém mais monitora administrador nem super admin. É trava de CARGO, e
  -- não de escopo: escopo se mexe no painel de permissões, isto não.
  IF v_alvo.perfil IN ('administrador', 'super_admin') THEN RETURN FALSE; END IF;

  IF NOT public.fn_user_tem('chat_monitor') THEN RETURN FALSE; END IF;

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

COMMENT ON FUNCTION public.fn_chat_posso_monitorar(uuid) IS
  'Posso monitorar esta pessoa? Super admin alcanca todos; ninguem mais alcanca '
  'administrador nem super admin (trava de CARGO, nao de escopo — 20260903360000). '
  'Ler a conversa de um monitoravel nao muda: fn_chat_monitoro_conversa pede '
  'ALGUM participante monitoravel, entao a conversa entre um operador e um super '
  'admin segue legivel pelo lado do operador.';
