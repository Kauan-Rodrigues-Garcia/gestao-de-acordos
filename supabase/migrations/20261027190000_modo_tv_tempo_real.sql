-- ============================================================================
-- Modo TV 2: a TV troca na hora do «Publicar», e no mesmo compasso do PC
-- (27/10/2026)
-- ============================================================================
--
-- Pedido do Cleber no primeiro teste: o que está na TV e o que aparece no PC
-- não batiam, e o «Publicar» demorava a chegar.
--
-- ## 1. Aviso na hora
--
-- A TV perguntava a cada 5 s «o painel mudou?». Agora o banco AVISA: todo
-- UPDATE/DELETE em `tv_paineis` (publicar, fixar, soltar, excluir) e todo
-- DELETE em `tv_conexoes` (desconectar) manda um broadcast no tópico PÚBLICO
-- `tv-painel:<id do painel>`. A TV, que não tem login, ouve esse tópico e relê
-- na hora. A pergunta curta continua como rede de segurança.
--
-- Público de propósito: a TV não tem sessão, e canal privado exige uma. O que
-- trafega é só a versão (`atualizado_em`) — nenhum número, nenhum nome. Quem
-- souber o id de um painel e ouvir o tópico fica sabendo QUANDO ele mudou, e
-- nada mais. Mesmo modelo do «digitando» das Solicitações (canal público).
--
-- O envio nunca derruba a gravação: falhou o realtime, o UPDATE segue e a TV
-- pega pela pergunta curta.
--
-- ## 2. O mesmo relógio
--
-- O rodízio passa a ser calculado pelo relógio, e não pelo momento em que a
-- página abriu: dada a versão do painel e a hora, qualquer tela — a TV e a
-- prévia do PC — chega à MESMA tela. Para isso as duas precisam da hora do
-- BANCO (relógios de PC divergem em segundos): `fn_tv_ver`, `fn_tv_versao` e
-- `fn_tv_previa` passam a devolver `agora`.
--
-- Corpo das três: o de 20261027170000, só com `agora` a mais.
--
-- Reverter: DROP TRIGGER trg_tv_paineis_avisa ON public.tv_paineis;
--           DROP TRIGGER trg_tv_conexoes_avisa ON public.tv_conexoes;
--           DROP FUNCTION public.fn_tv_avisar_tvs(); e reaplicar as três
--           funções de 20261027170000.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. O aviso ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_tv_avisar_tvs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_painel UUID;
  v_versao TIMESTAMPTZ;
BEGIN
  IF TG_TABLE_NAME = 'tv_paineis' THEN
    v_painel := COALESCE(NEW.id, OLD.id);
    v_versao := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.atualizado_em END;
  ELSE
    v_painel := OLD.painel_id;
  END IF;

  IF v_painel IS NOT NULL THEN
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('versao', v_versao, 'operacao', TG_OP),
        'mudou',
        'tv-painel:' || v_painel::TEXT,
        FALSE);
    EXCEPTION WHEN OTHERS THEN
      -- Sem realtime a TV pega pela pergunta curta. A gravação não cai.
      NULL;
    END;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_avisar_tvs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tv_paineis_avisa ON public.tv_paineis;
CREATE TRIGGER trg_tv_paineis_avisa
  AFTER UPDATE OR DELETE ON public.tv_paineis
  FOR EACH ROW EXECUTE FUNCTION public.fn_tv_avisar_tvs();

DROP TRIGGER IF EXISTS trg_tv_conexoes_avisa ON public.tv_conexoes;
CREATE TRIGGER trg_tv_conexoes_avisa
  AFTER DELETE ON public.tv_conexoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_tv_avisar_tvs();

-- ── 2. A hora do banco ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_tv_ver(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_c public.tv_conexoes%ROWTYPE;
  v_p public.tv_paineis%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('estado', 'desconhecida');
  END IF;

  SELECT * INTO v_c FROM public.tv_conexoes
   WHERE segredo_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF v_c.id IS NULL THEN
    RETURN jsonb_build_object('estado', 'desconhecida');
  END IF;

  IF v_c.painel_id IS NULL THEN
    IF v_c.codigo_expira_em IS NULL OR v_c.codigo_expira_em < now() THEN
      RETURN jsonb_build_object('estado', 'expirada');
    END IF;
    RETURN jsonb_build_object('estado', 'aguardando',
                              'codigo', v_c.codigo, 'expira_em', v_c.codigo_expira_em);
  END IF;

  SELECT * INTO v_p FROM public.tv_paineis WHERE id = v_c.painel_id;

  -- A TV vai mostrar ESTA versão: a montagem lê daqui se ela já chegou.
  IF v_c.versao_exibida IS DISTINCT FROM v_p.atualizado_em
     OR v_c.ultimo_sinal IS NULL OR v_c.ultimo_sinal < now() - INTERVAL '30 seconds'
     OR v_c.saiu_em >= v_c.ultimo_sinal THEN
    UPDATE public.tv_conexoes
       SET ultimo_sinal = now(), versao_exibida = v_p.atualizado_em
     WHERE id = v_c.id;
  END IF;

  RETURN jsonb_build_object(
    'estado', 'conectada',
    'agora', clock_timestamp(),
    'painel', jsonb_build_object(
      'id', v_p.id, 'nome', v_p.nome, 'tema', v_p.tema, 'unidade', v_p.unidade,
      'segundos_por_tela', v_p.segundos_por_tela, 'telas', v_p.telas,
      'tela_fixa', v_p.tela_fixa, 'atualizado_em', v_p.atualizado_em),
    'numeros', public.fn_tv_numeros(v_p.setor_id, v_p.equipe_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_tv_versao(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_c      public.tv_conexoes%ROWTYPE;
  v_versao TIMESTAMPTZ;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('estado', 'desconhecida');
  END IF;

  SELECT * INTO v_c FROM public.tv_conexoes
   WHERE segredo_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF v_c.id IS NULL THEN
    RETURN jsonb_build_object('estado', 'desconhecida');
  END IF;
  IF v_c.painel_id IS NULL THEN
    RETURN jsonb_build_object('estado', 'aguardando');
  END IF;

  IF v_c.ultimo_sinal IS NULL OR v_c.ultimo_sinal < now() - INTERVAL '30 seconds'
     OR v_c.saiu_em >= v_c.ultimo_sinal THEN
    UPDATE public.tv_conexoes SET ultimo_sinal = now() WHERE id = v_c.id;
  END IF;

  SELECT tp.atualizado_em INTO v_versao FROM public.tv_paineis tp WHERE tp.id = v_c.painel_id;
  RETURN jsonb_build_object('estado', 'conectada', 'versao', v_versao, 'agora', clock_timestamp());
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_tv_previa(p_painel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_p public.tv_paineis%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM public.tv_paineis WHERE id = p_painel_id;
  IF v_p.id IS NULL OR NOT public.fn_tv_alvo_no_meu_alcance(v_p.setor_id, v_p.equipe_id) THEN
    RETURN NULL;
  END IF;
  RETURN COALESCE(public.fn_tv_numeros(v_p.setor_id, v_p.equipe_id), '{}'::JSONB)
         || jsonb_build_object('agora', clock_timestamp());
END;
$function$;

-- Os grants de 20261027170000 continuam (CREATE OR REPLACE os preserva); a
-- conferência garante.
DO $conf$
BEGIN
  IF NOT has_function_privilege('anon', 'public.fn_tv_ver(text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.fn_tv_versao(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_tv_previa(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_tv_avisar_tvs()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Modo TV 2 tempo real: permissões fora do previsto.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tv_paineis_avisa')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tv_conexoes_avisa') THEN
    RAISE EXCEPTION 'Modo TV 2 tempo real: gatilho faltando.';
  END IF;
END
$conf$;

COMMIT;
