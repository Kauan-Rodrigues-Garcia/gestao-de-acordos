-- ============================================================================
-- Halloween: a liberação, a escolha de cada pessoa e a mensagem de outubro
-- ============================================================================
--
-- ## A liberação (01/10/2026)
--
-- O tema sobe DESLIGADO para todos — só o super_admin vê, para validar. Quando
-- ele aperta «Liberar» na primeira aba de Configurações, quem está logado
-- recebe a mensagem de outubro na hora e quem entrar depois recebe ao entrar.
--
--   halloween_liberacao        uma linha só: existe = liberado. Grava quem
--                              liberou e quando. Só `fn_halloween_liberar`
--                              escreve, e só para super_admin.
--
-- «Na hora» é um Broadcast no tópico `permissoes:<empresa>` de TODAS as
-- empresas. O tópico já existe, todo mundo logado já o escuta
-- (`useCargoPermissoes`), e a policy de `realtime.messages` não precisa mudar:
-- um sinal a mais, uma vez só, custa uma releitura de permissões por aba.
--
-- ## A escolha de cada pessoa
--
--   halloween_desligado        desligou os enfeites no botão de tema
--   halloween_boas_vindas_em   quando viu a mensagem que abre outubro
--
-- Mesmo molde de `tour_visto_em` (20260928113233): coluna em `perfis`, com o
-- `localStorage` de atalho. As duas entram na lista de ignoradas do
-- `trg_log_perfis`: ligar e desligar enfeite não é alteração de cadastro.
--
-- Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS halloween_desligado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS halloween_boas_vindas_em TIMESTAMPTZ;

COMMENT ON COLUMN public.perfis.halloween_desligado IS
  'A pessoa desligou os enfeites de Halloween no botão de tema. Conferido na tela.';
COMMENT ON COLUMN public.perfis.halloween_boas_vindas_em IS
  'Quando a pessoa viu a mensagem de boas-vindas de outubro. NULL = ainda não viu.';

-- ── A liberação ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.halloween_liberacao (
  id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  liberado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  liberado_por      UUID,
  liberado_por_nome TEXT
);

COMMENT ON TABLE public.halloween_liberacao IS
  'Uma linha = tema de Halloween liberado para todos. Escrita só por fn_halloween_liberar '
  '(super_admin). Ver 20261001140000.';

ALTER TABLE public.halloween_liberacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS halloween_liberacao_leitura ON public.halloween_liberacao;
CREATE POLICY halloween_liberacao_leitura ON public.halloween_liberacao
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.halloween_liberacao TO authenticated;
GRANT ALL    ON public.halloween_liberacao TO service_role;

-- Liberar avisa quem está logado em todas as empresas.
CREATE OR REPLACE FUNCTION public.fn_halloween_avisar()
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
      jsonb_build_object('tabela', 'halloween_liberacao', 'operacao', tg_op, 'importado_por', '[]'::jsonb),
      'mudou',
      'permissoes:' || v_empresa::text,
      true);
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_halloween_avisar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_halloween_avisar ON public.halloween_liberacao;
CREATE TRIGGER trg_halloween_avisar
  AFTER INSERT OR UPDATE OR DELETE ON public.halloween_liberacao
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_halloween_avisar();

CREATE OR REPLACE FUNCTION public.fn_halloween_liberar()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_em   timestamptz;
  v_nome text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin libera o Halloween' USING ERRCODE = '42501';
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = auth.uid();

  -- Já liberado: devolve a data de antes e NÃO insere — o gatilho é por
  -- comando e dispararia o aviso a todo mundo mesmo com zero linhas.
  SELECT liberado_em INTO v_em FROM public.halloween_liberacao WHERE id = 1;
  IF v_em IS NOT NULL THEN
    RETURN v_em;
  END IF;

  INSERT INTO public.halloween_liberacao (id, liberado_por, liberado_por_nome)
  VALUES (1, auth.uid(), v_nome)
  RETURNING liberado_em INTO v_em;
  RETURN v_em;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_halloween_liberar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_halloween_liberar() TO authenticated;

-- ── Fora da auditoria ──────────────────────────────────────────────────────
-- O gatilho é recriado a partir da definição ATUAL, só com o 5º argumento de
-- `fn_log_auditoria` acrescido — mesma técnica de 20260928113233.
DO $gatilho$
DECLARE
  v_def  TEXT;
  v_novo TEXT;
  v_col  TEXT;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['halloween_desligado', 'halloween_boas_vindas_em'] LOOP
    SELECT pg_get_triggerdef(t.oid)
      INTO v_def
      FROM pg_trigger t
     WHERE t.tgrelid = 'public.perfis'::regclass
       AND t.tgname  = 'trg_log_perfis'
       AND NOT t.tgisinternal;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'trg_log_perfis nao encontrado em public.perfis';
    END IF;

    CONTINUE WHEN position(v_col IN v_def) > 0;  -- já ignorada

    v_novo := regexp_replace(
      v_def,
      '(fn_log_auditoria\((''[^'']*'',\s*){4}'')',
      '\1' || v_col || ',');

    IF v_novo = v_def OR position(v_col IN v_novo) = 0 THEN
      RAISE EXCEPTION 'nao consegui acrescentar % aos ignorados de: %', v_col, v_def;
    END IF;

    DROP TRIGGER trg_log_perfis ON public.perfis;
    EXECUTE v_novo;
  END LOOP;
END
$gatilho$;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.perfis'::regclass
       AND t.tgname = 'trg_log_perfis' AND t.tgenabled = 'O'
       AND position('halloween_desligado' IN pg_get_triggerdef(t.oid)) > 0
       AND position('halloween_boas_vindas_em' IN pg_get_triggerdef(t.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'trg_log_perfis precisa estar ligado e ignorando as colunas do Halloween';
  END IF;

END
$prova$;

COMMIT;
