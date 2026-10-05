-- ============================================================================
-- Quem está online: batida no banco em vez de Presence do Realtime
-- ============================================================================
--
-- ## O sintoma (log do Realtime, 05/10/2026)
--
-- 25 `PresenceRateLimitReached: Too many presence events per second` entre
-- 09h57 e 10h32, espalhados pelo minuto — depois de um mês de remendos no
-- `PresenceProvider` (sem re-track, entrada sorteada, espera após o limite,
-- recarga do deploy só na troca de tela). Remendo não resolve: no Presence,
-- cada entrada de uma pessoa é avisada a TODAS as outras do canal, e o custo
-- cresce com o quadrado de quem está logado. O teto é do projeto inteiro.
--
-- ## O jeito novo
--
-- Cada aba chama `fn_presenca_bater` a cada 15 s. A mesma chamada grava «estou
-- aqui» e diz quem bateu nos últimos 150 s — uma requisição HTTP comum, que não
-- passa pelo Realtime. Quem entra aparece para os outros em até 15 s.
--
-- A lista só viaja quando MUDA: a aba manda a `versao` (md5 da lista) que já
-- tem, e se ela ainda vale a resposta é só a versão, uns 50 bytes. 150 pessoas
-- = 10 chamadas por segundo, quase todas desse tamanho. Mandar a lista inteira
-- a cada 15 s seriam gigabytes de saída por dia.
--
--   presenca_online     uma linha por pessoa: a empresa em que ela está e a
--                       hora da última batida. Ninguém lê nem escreve direto
--                       (RLS ligada, sem policy): só pelas duas funções.
--   fn_presenca_bater   grava a batida e devolve a versão (e a lista, se mudou).
--   fn_presenca_sair    apaga a linha ao fechar a aba ou sair do sistema: os
--                       outros veem a saída na batida seguinte deles.
--
-- Os 150 s só valem para quem cai sem avisar (máquina desligada no botão) e
-- para a aba escondida, que o navegador deixa bater só uma vez por minuto.
--
-- Duas abas da mesma pessoa batem na mesma linha; batida repetida em menos de
-- 10 s não reescreve nada.
--
-- Quem vê: todo logado vê todos os online, como já era no canal
-- `presence-global` (o recorte por empresa é feito na tela). Só sai o id e a
-- empresa — nome e cargo já não vão junto.
--
-- As policies de `presence-global` em `realtime.messages` ficam: aba aberta
-- antes do deploy continua no canal até recarregar. Saem numa limpeza depois.
--
-- Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.presenca_online (
  user_id     UUID        PRIMARY KEY REFERENCES public.perfis (id) ON DELETE CASCADE,
  empresa_id  UUID,
  visto_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.presenca_online IS
  'Quem está online: uma linha por pessoa, renovada a cada 15 s por fn_presenca_bater. '
  'Só as funções fn_presenca_* leem e escrevem. Ver 20261005150000.';

ALTER TABLE public.presenca_online ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.presenca_online FROM anon, authenticated;
GRANT ALL ON public.presenca_online TO service_role;

-- ── A batida ────────────────────────────────────────────────────────────────
-- Devolve `{versao}` quando a lista não mudou desde `p_versao`, e
-- `{versao, online: [[pessoa, empresa], ...]}` quando mudou.
CREATE OR REPLACE FUNCTION public.fn_presenca_bater(p_empresa uuid, p_versao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_empresa uuid;
  v_lista   jsonb;
  v_versao  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;

  -- A empresa em que a pessoa está, se ela alcança; senão a do cadastro.
  IF p_empresa IS NOT NULL AND public.fn_can_access_empresa(p_empresa) THEN
    v_empresa := p_empresa;
  ELSE
    SELECT p.empresa_id INTO v_empresa FROM public.perfis p WHERE p.id = v_uid;
  END IF;

  INSERT INTO public.presenca_online AS o (user_id, empresa_id, visto_em)
  VALUES (v_uid, v_empresa, now())
  ON CONFLICT ON CONSTRAINT presenca_online_pkey DO UPDATE
     SET empresa_id = excluded.empresa_id,
         visto_em   = excluded.visto_em
   WHERE o.visto_em < now() - interval '10 seconds'
      OR o.empresa_id IS DISTINCT FROM excluded.empresa_id;

  SELECT coalesce(jsonb_agg(jsonb_build_array(o.user_id, o.empresa_id) ORDER BY o.user_id), '[]'::jsonb)
    INTO v_lista
    FROM public.presenca_online o
   WHERE o.visto_em > now() - interval '150 seconds';

  v_versao := md5(v_lista::text);
  IF v_versao = p_versao THEN
    RETURN jsonb_build_object('versao', v_versao);
  END IF;
  RETURN jsonb_build_object('versao', v_versao, 'online', v_lista);
END;
$function$;

COMMENT ON FUNCTION public.fn_presenca_bater(uuid, text) IS
  'Grava a batida de quem chama e diz quem bateu nos últimos 150 s; a lista só vem '
  'quando difere de p_versao. Ver 20261005150000.';

-- ── A saída ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_presenca_sair()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  DELETE FROM public.presenca_online WHERE user_id = auth.uid();
$function$;

COMMENT ON FUNCTION public.fn_presenca_sair() IS
  'Tira quem chama da lista de online (aba fechada, logout). Ver 20261005150000.';

REVOKE ALL ON FUNCTION public.fn_presenca_bater(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_presenca_sair()      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_presenca_bater(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_presenca_sair()      TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.presenca_online') IS NULL THEN
    RAISE EXCEPTION 'presenca_online não criada';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.presenca_online'::regclass) THEN
    RAISE EXCEPTION 'presenca_online ficou sem RLS';
  END IF;
  IF has_table_privilege('authenticated', 'public.presenca_online', 'SELECT') THEN
    RAISE EXCEPTION 'presenca_online ficou legível direto pelo app';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_presenca_bater(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_presenca_sair()', 'EXECUTE') THEN
    RAISE EXCEPTION 'funções de presença sem EXECUTE para authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.fn_presenca_bater(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_presenca_bater ficou aberta para anon';
  END IF;
  IF to_regprocedure('public.fn_can_access_empresa(uuid)') IS NULL THEN
    RAISE EXCEPTION 'fn_can_access_empresa sumiu — a batida não teria como validar a empresa';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261005150000', 'presenca_por_batida')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT
  to_regclass('public.presenca_online') IS NOT NULL               AS tabela,
  to_regprocedure('public.fn_presenca_bater(uuid,text)') IS NOT NULL   AS bater,
  to_regprocedure('public.fn_presenca_sair()') IS NOT NULL        AS sair,
  (SELECT count(*) FROM public.presenca_online)                   AS linhas;
