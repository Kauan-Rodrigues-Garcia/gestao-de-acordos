-- O Realtime parava de entregar eventos por falta de GRANT.
--
-- ## O erro, 33 vezes nas últimas 24h
--
--   PoolingReplicationError: %Postgrex.Error{
--     code: :insufficient_privilege,
--     message: "permission denied for function fn_user_is_super_admin",
--     where: "SQL statement \"execute walrus_rls_stmt\"
--             PL/pgSQL function realtime.apply_rls(jsonb,integer) line 219
--             SQL function \"list_changes\" statement 1"
--   }
--
-- ## Por que acontece
--
-- O walrus (o `apply_rls` do Realtime) reavalia a policy de RLS de cada linha
-- do WAL no PAPEL de quem assinou o canal. As policies deste projeto perguntam
-- ao painel — `fn_user_is_super_admin`, `fn_user_tem`, `fn_user_escopo` e a
-- família `fn_user_*` —, e todas essas funções foram criadas com
--
--   REVOKE ALL ... FROM PUBLIC;  GRANT ... TO authenticated, service_role;
--
-- Nenhuma delas foi concedida a `anon`. E `anon` assina canal: o cliente do
-- supabase-js abre o WebSocket com a chave anônima assim que a tela monta, e só
-- troca para o token do usuário quando a sessão termina de ser restaurada do
-- localStorage. Nessa janela — e em toda sessão cujo refresh de token falhou —
-- o papel do assinante é `anon`, e a policy estoura.
--
-- ## Por que isso é pior do que parece
--
-- O erro NÃO é isolado no assinante que o causou. Ele sobe de `apply_rls` para
-- `list_changes`, que é a leitura do slot de replicação inteira: o lote de
-- mudanças daquele ciclo é perdido para TODOS os assinantes, não só para o
-- anônimo. É a explicação dos eventos que "às vezes não chegam" — a mensagem
-- de chat que só aparece no F5, o acordo que não atualiza sozinho na tela do
-- colega. Trinta e três lotes perdidos em um dia.
--
-- ## A correção
--
-- Conceder a família inteira a `anon`. Não abre nada: são funções `STABLE
-- SECURITY DEFINER` que respondem sobre `auth.uid()`, e para o anônimo
-- `auth.uid()` é NULL — `fn_user_is_super_admin()` devolve FALSE, os `fn_user_*`
-- devolvem NULL, `fn_user_tem` devolve FALSE. A policy continua negando tudo
-- para o anônimo; a diferença é que agora ela NEGA em vez de ESTOURAR, e o
-- lote dos outros assinantes sobrevive.
--
-- Conceder é a correção certa mesmo depois de o cliente passar a esperar a
-- sessão: o walrus não pode depender de disciplina do front. Um token expirado
-- no meio da madrugada devolve o papel para `anon` sem que nenhuma linha de
-- código nossa tenha rodado.

-- ── A família do painel ─────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.fn_user_tem(TEXT)              TO anon;
GRANT EXECUTE ON FUNCTION public.fn_user_escopo(TEXT)           TO anon;

-- ── As primitivas antigas, ainda usadas por dezenas de policies ─────────────
GRANT EXECUTE ON FUNCTION public.fn_user_is_super_admin()       TO anon;
GRANT EXECUTE ON FUNCTION public.fn_user_empresa_id()           TO anon;
GRANT EXECUTE ON FUNCTION public.fn_user_empresa_is_bookplay()  TO anon;
GRANT EXECUTE ON FUNCTION public.fn_user_empresa_is_pagueplay() TO anon;
GRANT EXECUTE ON FUNCTION public.fn_user_has_any_role(TEXT[])   TO anon;
GRANT EXECUTE ON FUNCTION public.fn_user_perfil()               TO anon;
GRANT EXECUTE ON FUNCTION public.fn_user_setor_id()             TO anon;

-- ── As auxiliares que as policies chamam junto ──────────────────────────────
--
-- `DO` com checagem de existência: estas variam entre os ambientes (algumas
-- nasceram em migrations que o dashboard aplicou sem registrar), e um GRANT
-- sobre função ausente aborta a migration inteira.
DO $$
DECLARE
  fn TEXT;
  alvos TEXT[] := ARRAY[
    'public.fn_can_access_empresa(uuid)',
    'public.fn_operador_setor_id(uuid)',
    'public.fn_operador_clonado_no_setor(uuid,uuid)',
    'public.fn_perfil_tem(uuid,text)',
    'public.fn_chat_sou_parte(uuid)',
    'public.fn_chat_pode_usar(uuid)',
    'public.fn_chat_alcanca(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY alvos LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', fn);
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.fn_user_is_super_admin() IS
  'Concedida a anon desde 01/09/2026 — nao por acesso, mas porque o walrus do '
  'Realtime reavalia as policies no papel do assinante, e o assinante e anon '
  'na janela entre montar a tela e restaurar a sessao. Sem o GRANT o erro sobe '
  'para list_changes e derruba o lote de eventos de TODOS os assinantes.';
