-- Etiqueta "ADM" no chat para quem e super_admin.
--
-- A lista de conversas ja resolve a outra pessoa (nome, foto, empresa), mas nao
-- trazia o CARGO — e sem ele a tela nao tem como saber de quem por a etiqueta.
-- Buscar o perfil por linha no cliente seria uma consulta por conversa aberta.
--
-- Em vez de reescrever a funcao inteira (85 linhas de CTEs que nao mudam), ela
-- e renomeada e a nova encapsula a antiga com um LEFT JOIN em `perfis`. Mesmo
-- padrao de encadeamento que `fn_permissoes_catalogo` ja usa aqui: o corpo que
-- funciona continua sendo a fonte, e o risco fica restrito a coluna nova.
--
-- Trocar o tipo de retorno exige recriar, entao e ALTER ... RENAME em vez de
-- CREATE OR REPLACE.

ALTER FUNCTION public.fn_chat_minhas_conversas()
  RENAME TO fn_chat_minhas_conversas_antes_adm_20260831;

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
  entrega_do_outro   TIMESTAMPTZ,
  outro_perfil       TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT c.id, c.outro_id, c.outro_nome, c.outro_usuario, c.outro_foto,
         c.outro_empresa, c.ultima_mensagem_em, c.ultima_atividade_em,
         c.em_historico, c.ultimo_texto, c.ultimo_anexos, c.ultimo_autor_id,
         c.nao_lidas, c.leitura_do_outro, c.entrega_minha, c.entrega_do_outro,
         p.perfil
    FROM public.fn_chat_minhas_conversas_antes_adm_20260831() c
    LEFT JOIN public.perfis p ON p.id = c.outro_id
   ORDER BY c.ultima_atividade_em DESC NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_minhas_conversas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_minhas_conversas() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_minhas_conversas() IS
  'Lista unica do chat, classificada entre Conversas de hoje e Historico pela '
  'ultima atividade valida de cada participante no horario de Sao Paulo. Desde '
  '20260831 devolve tambem o cargo do outro, para a tela marcar quem e '
  'super_admin.';
