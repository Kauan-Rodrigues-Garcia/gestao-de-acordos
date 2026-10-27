-- ============================================================================
-- Modo TV 2: conectar a TV sem a cota do backend (27/10/2026)
-- ============================================================================
--
-- No primeiro teste do Cleber, o líder digitou o código e recebeu
-- «NAO_AUTORIZADO: apenas o backend pode consumir a cota».
--
-- `fn_tv_conectar` (20261027170000) limitava as tentativas com
-- `fn_api_rate_limit_consumir`, que confere `auth.role() = 'service_role'`. O
-- papel vem do JWT de quem chama; SECURITY DEFINER não o troca. Chamada pela
-- tela, ela recusa sempre.
--
-- Agora o limite é da própria TV: `tv_conexao_tentativas`, uma linha por
-- tentativa, 10 por minuto por pessoa.
--
-- ## Por que a função deixa de LANÇAR erro
--
-- Lançar exceção desfaz a transação, e com ela a linha da tentativa: código
-- errado nunca seria contado e o limite não pararia ninguém. Por isso a
-- resposta passa a ser jsonb — `{ok: true, id}` ou `{ok: false, erro}` — e o
-- retorno muda de tipo (DROP + CREATE). A tela aceita as duas formas.
--
-- Reverter: reaplicar a seção de `fn_tv_conectar` de 20261027170000 e
--   DROP TABLE IF EXISTS public.tv_conexao_tentativas;
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.tv_conexao_tentativas (
  usuario_id UUID NOT NULL,
  em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tv_conexao_tentativas ON public.tv_conexao_tentativas (usuario_id, em);

COMMENT ON TABLE public.tv_conexao_tentativas IS
  'Modo TV 2: tentativas de conectar TV, para o limite de 10/min. Só fn_tv_conectar escreve.';

ALTER TABLE public.tv_conexao_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tv_conexao_tentativas FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.fn_tv_conectar(text, uuid, text);

CREATE FUNCTION public.fn_tv_conectar(p_codigo text, p_painel_id uuid, p_nome text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_eu UUID := auth.uid();
  v_p  public.tv_paineis%ROWTYPE;
  v_id UUID;
BEGIN
  IF v_eu IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'Entre no sistema para conectar a TV.');
  END IF;

  -- Faxina do que já não pesa no limite, e a tentativa de agora.
  DELETE FROM public.tv_conexao_tentativas
   WHERE usuario_id = v_eu AND em < now() - INTERVAL '1 hour';
  INSERT INTO public.tv_conexao_tentativas (usuario_id) VALUES (v_eu);

  -- Dez tentativas por minuto: chutar o código de outra TV não compensa.
  IF (SELECT count(*) FROM public.tv_conexao_tentativas
       WHERE usuario_id = v_eu AND em > now() - INTERVAL '1 minute') > 10 THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'Muitas tentativas. Espere um minuto e tente de novo.');
  END IF;

  SELECT * INTO v_p FROM public.tv_paineis WHERE id = p_painel_id;
  IF v_p.id IS NULL OR NOT public.fn_tv_alvo_no_meu_alcance(v_p.setor_id, v_p.equipe_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'Painel não encontrado.');
  END IF;

  UPDATE public.tv_conexoes
     SET painel_id        = v_p.id,
         codigo           = NULL,
         codigo_expira_em = NULL,
         nome             = NULLIF(left(btrim(COALESCE(p_nome, '')), 40), ''),
         conectada_em     = now(),
         conectada_por    = v_eu,
         ultimo_sinal     = now()
   WHERE codigo = regexp_replace(COALESCE(p_codigo, ''), '\D', '', 'g')
     AND painel_id IS NULL
     AND codigo_expira_em > now()
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'Código não encontrado ou vencido. Confira o número na TV.');
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_conectar(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tv_conectar(text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_tv_conectar(text, uuid, text) IS
  'Modo TV 2: liga a TV que mostra o codigo ao painel. Limite proprio de 10/min (20261027180000); '
  'devolve {ok, id} ou {ok:false, erro} sem lancar, para a tentativa errada contar.';

DO $conf$
BEGIN
  IF has_function_privilege('anon', 'public.fn_tv_conectar(text, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_tv_conectar não pode ser do anon.';
  END IF;
  IF pg_get_functiondef('public.fn_tv_conectar(text,uuid,text)'::regprocedure) ~ 'fn_api_rate_limit_consumir' THEN
    RAISE EXCEPTION 'fn_tv_conectar ainda chama a cota do backend.';
  END IF;
END
$conf$;

COMMIT;
