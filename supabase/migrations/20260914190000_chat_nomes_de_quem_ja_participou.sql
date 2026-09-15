-- ─────────────────────────────────────────────────────────────────────────────
-- O nome de quem já saiu do grupo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Pedido de 14/09/2026: o aviso «X saiu do grupo» aparecia como «Alguém saiu do
-- grupo».
--
-- A conversa tira o nome de cada autor de `fn_chat_grupo_membros`, que filtra
-- `saiu_em IS NULL` — e precisa filtrar, porque é a lista de quem ESTÁ no grupo
-- (configurações, marcação, contagem). Quem saiu some dela, e junto some o nome
-- do autor do próprio aviso de saída.
--
-- Ler `perfis` direto no cliente não resolve: a RLS de `perfis` é por escopo, e
-- um operador não enxerga o nome de quem é de outro setor — exatamente o caso de
-- grupo que junta setores.
--
-- ## A guarda é a mesma da lista de membros
--
-- Só quem é parte da conversa, ou a monitora, lê. E devolve só `id` e `nome`:
-- nada que a própria conversa já não mostrasse enquanto a pessoa estava dentro.
--
-- Sem escrita, sem tabela nova. Reaplicar é inofensivo.

CREATE OR REPLACE FUNCTION public.fn_chat_participantes_nomes(p_conversa UUID)
RETURNS TABLE (perfil_id UUID, nome TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id, p.nome
    FROM public.chat_participantes cp
    JOIN public.perfis p ON p.id = cp.perfil_id
   WHERE cp.conversa_id = p_conversa
     AND (public.fn_chat_sou_parte(p_conversa)
          OR public.fn_chat_monitoro_conversa(p_conversa));
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_participantes_nomes(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_participantes_nomes(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_participantes_nomes(UUID) IS
  'Nome de todo mundo que ja participou da conversa, inclusive quem saiu. Mesma guarda de fn_chat_grupo_membros. Usada para nomear o autor de aviso e de mensagem antiga de ex-membro.';
