-- ============================================================================
-- Senha inicial: campanha de troca obrigatória (auditoria de segurança, 10/11/2026)
-- ============================================================================
--
-- ## O que a auditoria achou
--
-- 236 contas ATIVAS ainda entravam com a senha inicial dos scripts de criação
-- (a mesma para todo mundo, a sequência mais óbvia que existe) — entre elas 3
-- dos 4 administradores. O login é o nome da pessoa, e tem de ser: é por ele
-- que o relatório do Mundial encontra o operador. Nome conhecido + senha
-- óbvia = qualquer um entra. E o repositório esteve público, com a lista de
-- logins e a senha nos scripts.
--
-- A troca era só um botão de chave (`perfis.senha_alterada = false`), que a
-- pessoa podia ignorar para sempre.
--
-- ## O desenho (pedido do Cleber)
--
-- Duas coisas separadas:
--
--   • A REGRA GERAL vale já, sem depender de nada daqui: conta nova e senha
--     resetada nascem com `perfis.senha_troca_obrigatoria` (api/criar-usuario,
--     api/alterar-senha, fn_senha_pedido_concluir) e a senha nova passa pela
--     régua de `src/lib/senhaForte.ts`.
--
--   • A CAMPANHA para quem já tinha conta: esta migration só MARCA quem está
--     com a senha inicial (`perfis.senha_inicial_pendente`). Ninguém é
--     barrado ainda. Quando o super admin aperta «Liberar a troca» em
--     Configurações › Geral (`fn_senha_inicial_liberar`), quem está marcado vê
--     o card «Uma senha só sua» e só usa o sistema depois de criar a senha.
--     Dá para recolher. Acabou a lista, a campanha acabou.
--
-- ## Objetos
--
--   perfis.senha_inicial_pendente     marcada aqui; sai ao trocar a senha.
--   perfis.senha_inicial_trocada_em   quando trocou (o andamento do card).
--   senha_inicial_liberacao           uma linha só: existe = liberado.
--   fn_senha_inicial_liberar(bool)    só o super_admin.
--   fn_senha_inicial_painel()         só o super_admin: quantos faltam, por setor.
--   fn_senha_troca_concluida()        recriada: só solta a trava se a senha
--                                     de fato deixou de ser a inicial (antes,
--                                     chamar a RPC sem trocar já soltava).
--   fn_perfis_guarda_troca_obrigatoria  recriada: a própria pessoa também não
--                                     desliga `senha_inicial_pendente` na mão.
--
-- ## O que ela NÃO resolve
--
-- O portão é da tela. Quem nunca mais entrar continua com a senha inicial, e
-- ela ainda abre a API. Por isso há um segundo passo, com prazo: trocar por
-- senha aleatória a de quem não tiver trocado (script à parte).
--
-- Reexecutável: rodar de novo só marca quem ainda estiver na senha inicial.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. As colunas ───────────────────────────────────────────────────────────

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS senha_inicial_pendente   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS senha_inicial_trocada_em TIMESTAMPTZ;

COMMENT ON COLUMN public.perfis.senha_inicial_pendente IS
  'Conta que ainda entrava com a senha inicial na auditoria de 10/11/2026. O card «Uma senha só sua» aparece quando senha_inicial_liberacao tem linha. Desliga só em fn_senha_troca_concluida. 20261110160000.';
COMMENT ON COLUMN public.perfis.senha_inicial_trocada_em IS
  'Quando a pessoa marcada em senha_inicial_pendente criou a senha própria. 20261110160000.';
COMMENT ON COLUMN public.perfis.senha_troca_obrigatoria IS
  'O sistema exige a troca da senha antes de qualquer uso. Liga: reset por pedido (fn_senha_pedido_concluir), reset direto e conta nova (api/alterar-senha, api/criar-usuario). Desliga só em fn_senha_troca_concluida.';

-- ── 2. A própria pessoa não desliga nenhuma das duas travas na mão ──────────
--
-- Passam o SQL Editor/service_role (sem auth.uid()), o super admin e
-- `fn_senha_troca_concluida` (`app.senha_troca`).

CREATE OR REPLACE FUNCTION public.fn_perfis_guarda_troca_obrigatoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.senha_troca_obrigatoria IS NOT DISTINCT FROM OLD.senha_troca_obrigatoria
     AND NEW.senha_inicial_pendente IS NOT DISTINCT FROM OLD.senha_inicial_pendente THEN
    RETURN NEW;
  END IF;
  IF (SELECT auth.uid()) IS NULL
     OR current_setting('app.senha_troca', true) = 'ok'
     OR public.fn_user_is_super_admin() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A troca obrigatória de senha só sai trocando a senha.'
    USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_perfis_guarda_troca_obrigatoria() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_perfis_guarda_troca_obrigatoria ON public.perfis;
CREATE TRIGGER trg_perfis_guarda_troca_obrigatoria
  BEFORE UPDATE OF senha_troca_obrigatoria, senha_inicial_pendente ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_perfis_guarda_troca_obrigatoria();

-- ── 3. A trava só sai com a senha realmente trocada ─────────────────────────

CREATE OR REPLACE FUNCTION public.fn_senha_troca_concluida()
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu UUID := (SELECT auth.uid());
BEGIN
  IF v_eu IS NULL THEN RETURN; END IF;

  -- A senha ainda é a inicial: nada foi trocado. Um bcrypt por chamada, e a
  -- chamada acontece uma vez por troca de senha.
  IF EXISTS (
    SELECT 1 FROM auth.users u
     WHERE u.id = v_eu
       AND u.encrypted_password = extensions.crypt('123456', u.encrypted_password)
  ) THEN
    RAISE EXCEPTION 'A senha inicial não vale como senha nova. Crie outra.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.senha_troca', 'ok', true);
  UPDATE public.perfis p
     SET senha_troca_obrigatoria  = FALSE,
         senha_alterada           = TRUE,
         senha_inicial_trocada_em = CASE WHEN p.senha_inicial_pendente THEN now()
                                         ELSE p.senha_inicial_trocada_em END,
         senha_inicial_pendente   = FALSE
   WHERE p.id = v_eu;
  PERFORM set_config('app.senha_troca', '', true);

  UPDATE public.senha_pedidos
     SET senha_provisoria = NULL, trocada_em = now()
   WHERE alvo_id = v_eu AND status = 'aprovado' AND trocada_em IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_troca_concluida() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_troca_concluida() TO authenticated;

-- ── 4. A liberação ──────────────────────────────────────────────────────────
--
-- Mesmo molde de `natal_liberacao` (20261109150000).

CREATE TABLE IF NOT EXISTS public.senha_inicial_liberacao (
  id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  liberado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  liberado_por      UUID,
  liberado_por_nome TEXT
);

COMMENT ON TABLE public.senha_inicial_liberacao IS
  'Uma linha = troca da senha inicial liberada (o card aparece para quem tem perfis.senha_inicial_pendente). Escrita só por fn_senha_inicial_liberar (super_admin). Ver 20261110160000.';

ALTER TABLE public.senha_inicial_liberacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS senha_inicial_liberacao_leitura ON public.senha_inicial_liberacao;
CREATE POLICY senha_inicial_liberacao_leitura ON public.senha_inicial_liberacao
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.senha_inicial_liberacao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.senha_inicial_liberacao TO authenticated;
GRANT ALL    ON public.senha_inicial_liberacao TO service_role;

-- Liberar (ou recolher) avisa quem está logado em todas as empresas.
CREATE OR REPLACE FUNCTION public.fn_senha_inicial_avisar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa uuid;
BEGIN
  FOR v_empresa IN SELECT e.id FROM public.empresas e LOOP
    PERFORM realtime.send(
      jsonb_build_object('tabela', 'senha_inicial_liberacao', 'operacao', tg_op, 'importado_por', '[]'::jsonb),
      'mudou',
      'permissoes:' || v_empresa::text,
      true);
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_inicial_avisar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_senha_inicial_avisar ON public.senha_inicial_liberacao;
CREATE TRIGGER trg_senha_inicial_avisar
  AFTER INSERT OR DELETE ON public.senha_inicial_liberacao
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_senha_inicial_avisar();

CREATE OR REPLACE FUNCTION public.fn_senha_inicial_liberar(p_liberar BOOLEAN DEFAULT TRUE)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_em   timestamptz;
  v_nome text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin libera a troca da senha inicial' USING ERRCODE = '42501';
  END IF;

  SELECT l.liberado_em INTO v_em FROM public.senha_inicial_liberacao l WHERE l.id = 1;

  IF NOT COALESCE(p_liberar, TRUE) THEN
    -- Recolher: só apaga (e só avisa) se estava liberado.
    IF v_em IS NOT NULL THEN
      DELETE FROM public.senha_inicial_liberacao WHERE id = 1;
    END IF;
    RETURN NULL;
  END IF;

  -- Já liberado: devolve a data de antes e NÃO insere.
  IF v_em IS NOT NULL THEN
    RETURN v_em;
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = (SELECT auth.uid());

  INSERT INTO public.senha_inicial_liberacao (id, liberado_por, liberado_por_nome)
  VALUES (1, (SELECT auth.uid()), v_nome)
  RETURNING liberado_em INTO v_em;
  RETURN v_em;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_inicial_liberar(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_inicial_liberar(BOOLEAN) TO authenticated;

-- ── 5. O andamento (card de Configurações) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_senha_inicial_painel()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_em        TIMESTAMPTZ;
  v_por       TEXT;
  v_pendentes INTEGER;
  v_trocaram  INTEGER;
  v_setores   JSONB;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin vê o andamento' USING ERRCODE = '42501';
  END IF;

  SELECT l.liberado_em, l.liberado_por_nome INTO v_em, v_por
    FROM public.senha_inicial_liberacao l WHERE l.id = 1;

  SELECT count(*) INTO v_pendentes
    FROM public.perfis p
   WHERE p.senha_inicial_pendente
     AND p.ativo AND NOT p.arquivado
     AND p.situacao IS DISTINCT FROM 'desligado';

  SELECT count(*) INTO v_trocaram
    FROM public.perfis p
   WHERE p.senha_inicial_trocada_em IS NOT NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('setor', x.setor, 'pendentes', x.pendentes)
                            ORDER BY x.pendentes DESC, x.setor), '[]'::jsonb)
    INTO v_setores
    FROM (
      SELECT COALESCE(s.nome, 'Sem setor') AS setor, count(*) AS pendentes
        FROM public.perfis p
        LEFT JOIN public.setores s ON s.id = p.setor_id
       WHERE p.senha_inicial_pendente
         AND p.ativo AND NOT p.arquivado
         AND p.situacao IS DISTINCT FROM 'desligado'
       GROUP BY 1
    ) x;

  RETURN jsonb_build_object(
    'liberado_em',       v_em,
    'liberado_por_nome', v_por,
    'pendentes',         v_pendentes,
    'trocaram',          v_trocaram,
    'por_setor',         v_setores);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_inicial_painel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_inicial_painel() TO authenticated;

-- ── 6. Quem ainda está na senha inicial ─────────────────────────────────────
--
-- Só marca; ninguém é barrado até a liberação. `senha_alterada = FALSE` faz o
-- botão de chave aparecer desde já, para quem quiser trocar antes.
-- Um bcrypt por conta (~600): alguns segundos de CPU, uma vez.

UPDATE public.perfis p
   SET senha_inicial_pendente = TRUE,
       senha_alterada = FALSE
  FROM auth.users u
 WHERE u.id = p.id
   AND p.senha_inicial_pendente IS DISTINCT FROM TRUE
   AND u.encrypted_password = extensions.crypt('123456', u.encrypted_password);

COMMIT;
