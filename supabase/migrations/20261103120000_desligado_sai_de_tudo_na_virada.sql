-- ============================================================================
-- Desligado de mês anterior sai de tudo na virada, como se fosse excluído
-- ============================================================================
--
-- Pedido do Cleber, 03/11/2026: «usuários desligados, ao virar o mês, devem
-- sumir como se tivesse excluído o usuário. O único lugar que eles permanecem
-- é o fechamento.» No Play 5 havia desligados de meses passados dentro de
-- equipes e na lista «Sem equipe» da aba Equipes.
--
-- ## O que estava errado
--
-- 1. Arquivar (20260831160000) só ligava `perfis.arquivado`. A pessoa seguia
--    na equipe (`perfis.equipe_id`), como líder (`equipe_lideres`), como clone
--    e no subgrupo. Cada tela tinha de lembrar de esconder `arquivado` — e a
--    aba Equipes, entre outras, não escondia.
-- 2. Os vínculos Direto/Extra do desligado só eram soltos pela aba Usuários,
--    para quem ELA arquivasse. O pg_cron arquiva às 00:10 do dia 1º, antes de
--    qualquer um abrir a tela — e a tela, achando zero arquivados novos, não
--    soltava nada. Na prática, ninguém tinha os vínculos soltos.
-- 3. E mesmo quando a tela soltava: promover o EXTRA do colega a DIRETO era
--    recusado pelo banco (`fn_nr_exigir_livre`: o NR ainda estava registrado
--    no acordo do desligado). A tela só escrevia um aviso no console.
--
-- ## O que muda
--
-- `fn_desligado_sai_de_tudo(ids)` — chamada pelo arquivamento (cron e tela):
--   a. garante o retrato do mês do desligamento (`fn_composicao_mes_snapshot`
--      só acrescenta em mês fechado) — é lá que a pessoa continua existindo;
--   b. solta os pares Direto/Extra de acordos do mês corrente em diante: o
--      EXTRA do colega vira DIRETO e assume o NR (o registro do NR no acordo
--      do desligado é liberado antes); se o NR for de outra pessoa, o EXTRA só
--      perde o vínculo. O colega recebe uma notificação. Meses passados não
--      são tocados;
--   c. tira a pessoa de toda equipe: membro (`perfis.equipe_id`), líder,
--      clone e subgrupo.
-- `perfis.setor_id` NÃO muda: telas de mês antigo que ainda leem o cadastro
-- ao vivo perderiam o dinheiro da pessoa no setor.
--
-- `fn_arquivar_desligados_ids` e `fn_arquivar_desligados_virada` passam a
-- chamá-la (mesmas assinaturas). E a carga do fim aplica a regra a quem já
-- estava arquivado.
--
-- Funciona com as tabelas antigas de equipe ou com a fase 7 (20261101120000,
-- que as troca por views): a limpeza grava direto em `equipe_membros`.
--
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── 1. Sair de tudo ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_desligado_sai_de_tudo(p_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inicio_mes  DATE := date_trunc('month', timezone('America/Sao_Paulo', now()))::DATE;
  v_mes_atual   TEXT := to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM');
  v_r           RECORD;
  v_campo       TEXT;
  v_chave       TEXT;
  v_promovidos  INTEGER := 0;
  v_soltos      INTEGER := 0;
  v_equipes     INTEGER := 0;
  v_n           INTEGER;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN jsonb_build_object('pessoas', 0);
  END IF;

  -- a. O retrato do mês em que a pessoa saiu. Mês fechado só ganha linha que
  --    falta; falhar aqui não impede o resto (o cron de 23:50 já congelou).
  FOR v_r IN
    SELECT DISTINCT p.empresa_id, to_char(timezone('America/Sao_Paulo', p.desligado_em), 'YYYY-MM') AS mes
      FROM public.perfis p
     WHERE p.id = ANY(p_ids) AND p.desligado_em IS NOT NULL AND p.empresa_id IS NOT NULL
  LOOP
    IF v_r.mes < v_mes_atual AND v_r.mes >= '2026-08' THEN
      BEGIN
        PERFORM public.fn_composicao_mes_snapshot(v_r.empresa_id, v_r.mes);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'fn_desligado_sai_de_tudo: retrato % de % não conferido: %', v_r.mes, v_r.empresa_id, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- b. Pares Direto/Extra, do mês corrente em diante. O gatilho do par fica de
  --    fora (`app.par_vinculo_em_curso`): quem solta as duas metades é aqui, e
  --    sem card no chat — não há pessoa fazendo isso. O gatilho do NR continua
  --    valendo.
  PERFORM set_config('app.par_vinculo_em_curso', 'on', true);

  -- b1. EXTRA de colega pareado com o desligado: vira DIRETO e assume o NR.
  FOR v_r IN
    SELECT a.id, a.empresa_id, a.operador_id, a.nr_cliente, a.instituicao
      FROM public.acordos a
     WHERE a.vinculo_operador_id = ANY(p_ids)
       AND NOT (a.operador_id = ANY(p_ids))
       AND COALESCE(a.tipo_vinculo, 'direto') = 'extra'
       AND a.vencimento >= v_inicio_mes
  LOOP
    v_campo := public.fn_nr_campo_chave(v_r.nr_cliente, v_r.instituicao);
    v_chave := public.fn_acordo_chave_valor(v_r.nr_cliente, v_r.instituicao);
    BEGIN
      -- O NR ainda está no acordo do desligado: libera antes de promover.
      DELETE FROM public.nr_registros r
       WHERE r.empresa_id = v_r.empresa_id AND r.campo = v_campo AND r.nr_value = v_chave
         AND r.operador_id = ANY(p_ids);
      UPDATE public.acordos
         SET tipo_vinculo = 'direto', vinculo_operador_id = NULL,
             vinculo_operador_nome = NULL, par_acordo_id = NULL
       WHERE id = v_r.id;
      v_promovidos := v_promovidos + 1;

      INSERT INTO public.notificacoes (usuario_id, empresa_id, acordo_id, titulo, mensagem)
      VALUES (v_r.operador_id, v_r.empresa_id, v_r.id, 'Seu acordo EXTRA virou DIRETO',
              format('O operador com quem você tinha vínculo foi desligado. Seu acordo %s passou a ser DIRETO e você assumiu a titularidade.',
                     CASE WHEN v_chave IS NOT NULL
                          THEN format('(%s %s) ', CASE WHEN v_campo = 'instituicao' THEN 'Código' ELSE 'NR' END, v_chave)
                          ELSE '' END));
    EXCEPTION WHEN OTHERS THEN
      -- NR de outra pessoa (outra parcela, outro acordo): só perde o vínculo.
      UPDATE public.acordos
         SET vinculo_operador_id = NULL, vinculo_operador_nome = NULL, par_acordo_id = NULL
       WHERE id = v_r.id;
      v_soltos := v_soltos + 1;
    END;
  END LOOP;

  -- b2. O resto: DIRETO de colega que tinha o desligado como EXTRA, e os
  --     acordos do próprio desligado. Só perdem o vínculo.
  UPDATE public.acordos a
     SET vinculo_operador_id = NULL, vinculo_operador_nome = NULL, par_acordo_id = NULL
   WHERE a.vencimento >= v_inicio_mes
     AND (a.vinculo_operador_id = ANY(p_ids)
          OR (a.operador_id = ANY(p_ids) AND (a.vinculo_operador_id IS NOT NULL OR a.par_acordo_id IS NOT NULL)));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_soltos := v_soltos + v_n;

  PERFORM set_config('app.par_vinculo_em_curso', 'off', true);

  -- c. Equipes: líder e clone (em `equipe_membros`, que é a fonte com ou sem a
  --    fase 7), membro e subgrupo (no cadastro; o gatilho tira de
  --    `equipe_membros`).
  IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.equipe_lideres')) = 'r' THEN
    DELETE FROM public.equipe_lideres WHERE lider_id = ANY(p_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_equipes := v_equipes + v_n;
    DELETE FROM public.equipe_operadores_clones WHERE operador_id = ANY(p_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_equipes := v_equipes + v_n;
  END IF;
  IF to_regclass('public.equipe_membros') IS NOT NULL THEN
    DELETE FROM public.equipe_membros WHERE pessoa_id = ANY(p_ids) AND papel IN ('lider', 'clone');
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_equipes := v_equipes + v_n;
  END IF;

  UPDATE public.perfis
     SET equipe_id = NULL, subgrupo_id = NULL
   WHERE id = ANY(p_ids)
     AND (equipe_id IS NOT NULL OR subgrupo_id IS NOT NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_equipes := v_equipes + v_n;

  RETURN jsonb_build_object(
    'pessoas', cardinality(p_ids), 'extras_promovidos', v_promovidos,
    'vinculos_soltos', v_soltos, 'vinculos_de_equipe', v_equipes);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_desligado_sai_de_tudo(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_desligado_sai_de_tudo(UUID[]) TO service_role;

COMMENT ON FUNCTION public.fn_desligado_sai_de_tudo(UUID[]) IS
  'Desligado arquivado sai de tudo: retrato garantido, pares Direto/Extra do mes corrente '
  'em diante soltos (EXTRA do colega vira DIRETO e assume o NR), e fora de toda equipe, '
  'lideranca, clone e subgrupo. setor_id fica. Chamada pelo arquivamento. 20261103120000.';

-- ── 2. O arquivamento chama a limpeza ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_arquivar_desligados_ids(p_empresa_id UUID)
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_ids UUID[];
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN;
  END IF;

  WITH arquivados AS (
    UPDATE public.perfis p
       SET arquivado = TRUE
     WHERE p.empresa_id = p_empresa_id
       AND p.situacao = 'desligado'
       AND p.arquivado = FALSE
       AND p.desligado_em IS NOT NULL
       -- Estritamente antes do dia 1º deste mês: quem saiu neste mês continua
       -- contando até a virada.
       AND p.desligado_em < date_trunc('month', now())
    RETURNING p.id
  )
  SELECT array_agg(id) INTO v_ids FROM arquivados;

  IF v_ids IS NOT NULL THEN
    PERFORM public.fn_desligado_sai_de_tudo(v_ids);
    RETURN QUERY SELECT unnest(v_ids);
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.fn_arquivar_desligados_ids(UUID) IS
  'Arquiva os desligados de meses anteriores, tira cada um de tudo (fn_desligado_sai_de_tudo) '
  'e devolve quem foi arquivado. 20261103120000.';

CREATE OR REPLACE FUNCTION public.fn_arquivar_desligados_virada()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_ids UUID[];
BEGIN
  WITH arquivados AS (
    UPDATE public.perfis p
       SET arquivado = TRUE
     WHERE p.situacao = 'desligado'
       AND p.arquivado = FALSE
       AND p.desligado_em IS NOT NULL
       AND p.desligado_em < date_trunc('month', now())
    RETURNING p.id
  )
  SELECT array_agg(id) INTO v_ids FROM arquivados;

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;
  PERFORM public.fn_desligado_sai_de_tudo(v_ids);
  RETURN cardinality(v_ids);
END;
$function$;

COMMENT ON FUNCTION public.fn_arquivar_desligados_virada() IS
  'Arquivamento de todas as empresas, para o pg_cron diário (00:10 SP). Tira cada arquivado '
  'de tudo (fn_desligado_sai_de_tudo). Sem checagem de empresa: sob cron não há auth.uid(). 20261103120000.';

-- ── 3. Quem já estava arquivado ─────────────────────────────────────────────

DO $carga$
DECLARE
  v_ids   UUID[];
  v_res   JSONB;
  v_resto INTEGER;
BEGIN
  -- Primeiro arquiva o que estiver atrasado (cron fora do ar, por exemplo).
  PERFORM public.fn_arquivar_desligados_virada();

  SELECT array_agg(p.id) INTO v_ids
    FROM public.perfis p
   WHERE p.arquivado AND p.situacao = 'desligado'
     AND (p.equipe_id IS NOT NULL OR p.subgrupo_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.equipe_membros m WHERE m.pessoa_id = p.id)
          OR EXISTS (SELECT 1 FROM public.acordos a
                      WHERE a.vencimento >= date_trunc('month', timezone('America/Sao_Paulo', now()))::DATE
                        AND (a.vinculo_operador_id = p.id
                             OR (a.operador_id = p.id AND a.vinculo_operador_id IS NOT NULL))));

  v_res := public.fn_desligado_sai_de_tudo(v_ids);
  RAISE NOTICE 'Arquivados que ainda estavam em equipe ou par: %', v_res;

  -- Prova: nenhum arquivado em equipe.
  SELECT count(*) INTO v_resto
    FROM public.perfis p
   WHERE p.arquivado AND p.situacao = 'desligado'
     AND (p.equipe_id IS NOT NULL OR p.subgrupo_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.equipe_membros m WHERE m.pessoa_id = p.id));
  IF v_resto > 0 THEN
    RAISE EXCEPTION 'Ainda há % desligado(s) arquivado(s) em equipe. Nada aplicado.', v_resto;
  END IF;
END
$carga$;

COMMIT;
