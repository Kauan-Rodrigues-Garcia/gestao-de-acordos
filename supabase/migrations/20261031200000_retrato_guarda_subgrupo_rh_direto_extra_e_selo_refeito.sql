-- ============================================================================
-- Retrato do mês: subgrupo, remuneração do RH, Direto/Extra e bônus de Pix;
-- e o selo que se refaz enquanto o relatório do último dia chega
-- ============================================================================
--
-- Auditoria do fechamento de outubro (31/10/2026). Tem de estar no banco antes
-- do último congelamento de outubro (31/10, 23:50 e 23:59 São Paulo): depois
-- da virada o retrato de um mês fechado não se completa sozinho, por desenho
-- (20260903330000, 20261001100000, 20261029200000).
--
-- ## O buraco no retrato
--
-- Medido no banco em 31/10/2026. Quatro coisas entram na conta do mês, não têm
-- mês na tabela e não estavam no retrato — mudar qualquer uma em novembro
-- reescreve outubro em silêncio:
--
--   pessoa  `perfis.subgrupo_id` — 60 pessoas em 10 subgrupos; 4 configurações
--           de comissão de outubro são por subgrupo, e o ranking do Analítico
--           agrupa por ele. Trocar alguém de subgrupo em novembro troca a
--           comissão de outubro dele.
--   setor   `rh_config_setores` — premiação ou comissão, por setor. É o que o
--           RH e as premiações usam para pagar o mês.
--   escopo  `direto_extra_config` — a lógica Direto/Extra ligada por setor,
--           equipe ou pessoa.
--   Pix     `pix_automatico_bonus` — o bônus por período (três em outubro, de
--           28 a 31/10). Fica a cópia dos que tocam o mês.
--
-- Entram: `composicao_mes.subgrupo_id` e, em `composicao_mes_config`,
-- `subgrupos` (id, equipe, nome — o subgrupo pode ser excluído), `rh_setores`,
-- `direto_extra` e `pix_bonus`. A regra é a de 20261029200000: config só se
-- grava no mês corrente; mês fechado nunca recebe a de hoje. Meses fechados
-- antes disto ficam com as colunas nulas / listas vazias («não guardado»).
--
-- ## O selo da virada vinha cedo demais
--
-- O selo (20261029201000) roda no dia 1º às 00:02 — antes do relatório do
-- último dia. Em setembro chegaram DEPOIS das 00:02 do dia 1º R$ 169.989 da
-- BookPlay e R$ 56.108 da PaguePlay (última importação 01/10 18:07). A versão 1
-- nasce sem esse dinheiro, e nada selava de novo sem um super admin.
--
-- Agora o cron sela também nos dias 2 a 5, às 00:02. `fn_fechamento_mes_selar`
-- só grava versão nova quando algum número mudou (hash), então dia sem
-- importação não cria nada. A versão do dia 1º continua sendo a prova da
-- estrutura na virada; as seguintes levam o motivo «relatório importado depois
-- da virada».
--
-- ## Prova
--
-- No fim, o retrato do mês corrente é regravado (o mesmo que o cron faz às
-- 23:50) e conferido contra as tabelas de hoje: subgrupo de cada pessoa e as
-- quatro listas da config. Qualquer diferença desfaz a migration inteira — e a
-- função antiga continua no lugar.
--
-- Corpo de `fn_composicao_mes_snapshot` partindo do vigente no banco em
-- 31/10/2026 (= 20261029200000, conferido por leitura); só o subgrupo e as
-- quatro listas foram acrescentados.
--
-- Nenhuma linha de dado de mês fechado muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── Colunas novas ───────────────────────────────────────────────────────────
ALTER TABLE public.composicao_mes
  ADD COLUMN IF NOT EXISTS subgrupo_id UUID;

ALTER TABLE public.composicao_mes_config
  ADD COLUMN IF NOT EXISTS subgrupos    JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS rh_setores   JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS direto_extra JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS pix_bonus    JSONB NOT NULL DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.composicao_mes.subgrupo_id IS
  'perfis.subgrupo_id no mes (sem FK: o subgrupo pode ser excluido). NULL em mes fechado antes de 20261031200000 = nao guardado.';
COMMENT ON COLUMN public.composicao_mes_config.subgrupos IS
  'equipe_subgrupos da empresa no mes: [{id, equipe_id, nome}] (20261031200000).';
COMMENT ON COLUMN public.composicao_mes_config.rh_setores IS
  'Linhas de rh_config_setores (premiacao/comissao por setor) no mes (20261031200000).';
COMMENT ON COLUMN public.composicao_mes_config.direto_extra IS
  'Linhas de direto_extra_config no mes (20261031200000).';
COMMENT ON COLUMN public.composicao_mes_config.pix_bonus IS
  'Linhas de pix_automatico_bonus cujo periodo toca o mes (20261031200000).';

-- ── O retrato, com o que faltava ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_composicao_mes_snapshot(p_empresa_id uuid, p_mes text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linhas          INTEGER;
  v_equipes         INTEGER;
  v_lideres         INTEGER;
  v_setores         INTEGER;
  v_antes_operador  INTEGER;
  v_antes_equipe    INTEGER;
  v_mes_corrente    TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_fechado         BOOLEAN;
  -- Mês fechado: o que esta chamada acrescenta (vazio no mês corrente).
  v_novos           UUID[] := '{}';
  v_equipes_novas   UUID[] := '{}';
  v_setores_novos   UUID[] := '{}';
  v_inicio          DATE;
  v_fim             DATE;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.fn_can_access_empresa(p_empresa_id)
    OR NOT (
      public.fn_user_is_super_admin()
      OR public.fn_user_has_any_role(
        ARRAY['lider','elite','gerencia','diretoria','administrador']
      )
    )
  ) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: usuário não pode gerar este retrato'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NULL
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: sessão ausente' USING ERRCODE = '42501';
  END IF;

  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  SELECT count(*) INTO v_antes_operador
    FROM public.composicao_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes;
  SELECT count(*) INTO v_antes_equipe
    FROM public.composicao_mes_equipe
   WHERE empresa_id = p_empresa_id AND mes = p_mes;

  v_fechado := p_mes < v_mes_corrente AND v_antes_operador > 0;

  IF NOT v_fechado THEN
    DELETE FROM public.composicao_mes        WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_equipe WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_lider  WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_setor  WHERE empresa_id = p_empresa_id AND mes = p_mes;
  ELSE
    -- Quem recebeu no mês e não está na foto. É o único caso que justifica
    -- mexer num mês fechado: o relatório trouxe dinheiro de alguém que o
    -- retrato não tinha, e sem a pessoa esse dinheiro cairia fora de todo card.
    v_inicio := (p_mes || '-01')::DATE;
    v_fim    := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_novos := ARRAY(
      SELECT DISTINCT ar.operador_id
        FROM public.analitico_recebimentos ar
        JOIN public.perfis p ON p.id = ar.operador_id AND p.empresa_id = p_empresa_id
       WHERE ar.empresa_id = p_empresa_id
         AND ar.data_pagamento BETWEEN v_inicio AND v_fim
         AND NOT EXISTS (
           SELECT 1 FROM public.composicao_mes cm
            WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes
              AND cm.operador_id = ar.operador_id)
    );
  END IF;

  -- ── Pessoas ───────────────────────────────────────────────────────────────
  INSERT INTO public.composicao_mes
    (empresa_id, mes, operador_id, equipe_id, equipe_nome, setor_id,
     situacao, equipes_clone,
     nome, usuario, email, cargo, foto_url, ativo, desligado_em,
     conta_no_recebimento, robo, subgrupo_id)
  SELECT p_empresa_id, p_mes, p.id, v.equipe_id,
         COALESCE(e.nome, 'Sem equipe'), COALESCE(e.setor_id, p.setor_id),
         COALESCE(p.situacao, 'ativo'),
         -- As OUTRAS equipes em que a pessoa está: as que lidera além da do
         -- rótulo, e os clones que contam. O app soma o recebimento em todas
         -- (`equipesExtrasPorOperador`) sem duplicar setor nem geral.
         COALESCE((
           SELECT array_agg(DISTINCT x.equipe_id)
             FROM (
               SELECT el.equipe_id
                 FROM public.equipe_lideres el
                WHERE el.empresa_id = p_empresa_id AND el.lider_id = p.id
               UNION
               SELECT c.equipe_id
                 FROM public.equipe_operadores_clones c
                WHERE c.empresa_id = p_empresa_id
                  AND c.operador_id = p.id
                  AND COALESCE(c.conta_recebimento, TRUE)
             ) x
            WHERE x.equipe_id IS DISTINCT FROM v.equipe_id
         ), '{}'::UUID[]),
         p.nome, p.usuario, p.email, p.perfil::TEXT, p.foto_url,
         COALESCE(p.ativo, TRUE), p.desligado_em,
         cg.conta_no_recebimento, COALESCE(p.robo, FALSE), p.subgrupo_id
    FROM public.perfis p
    LEFT JOIN public.cargos cg ON cg.slug = p.perfil::TEXT
    -- A equipe do RÓTULO: a de membro; sem ela, a primeira que lidera. No
    -- cargo `lider` o `perfis.equipe_id` é resíduo e não conta (20260929120000).
    LEFT JOIN LATERAL (
      SELECT el.equipe_id
        FROM public.equipe_lideres el
       WHERE el.empresa_id = p_empresa_id AND el.lider_id = p.id
       ORDER BY el.criado_em, el.equipe_id
       LIMIT 1
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT CASE
               WHEN p.perfil = 'lider' THEN l.equipe_id
               ELSE COALESCE(p.equipe_id, l.equipe_id)
             END AS equipe_id
    ) v ON TRUE
    LEFT JOIN public.equipes e ON e.id = v.equipe_id
   WHERE p.empresa_id = p_empresa_id
     AND (NOT v_fechado OR p.id = ANY(v_novos))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  IF v_fechado THEN
    -- As equipes das pessoas acrescentadas agora, que faltam na foto.
    v_equipes_novas := ARRAY(
      SELECT DISTINCT x.eq
        FROM public.composicao_mes cm
       CROSS JOIN LATERAL unnest(
         array_append(COALESCE(cm.equipes_clone, '{}'::UUID[]), cm.equipe_id)
       ) AS x(eq)
       WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes
         AND cm.operador_id = ANY(v_novos)
         AND x.eq IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.composicao_mes_equipe ce
            WHERE ce.empresa_id = p_empresa_id AND ce.mes = p_mes AND ce.equipe_id = x.eq)
    );
  END IF;

  -- ── Equipes ───────────────────────────────────────────────────────────────
  INSERT INTO public.composicao_mes_equipe
    (empresa_id, mes, equipe_id, nome, setor_id, treinamento, treinamento_inicio)
  SELECT p_empresa_id, p_mes, e.id, e.nome, e.setor_id,
         COALESCE(e.treinamento, FALSE), e.treinamento_inicio
    FROM public.equipes e
   WHERE e.empresa_id = p_empresa_id
     AND (NOT v_fechado OR e.id = ANY(v_equipes_novas))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_equipes = ROW_COUNT;

  -- ── Liderança ─────────────────────────────────────────────────────────────
  -- Mês fechado: só das equipes acrescentadas agora. Equipe que já estava na
  -- foto mantém a liderança que tinha — inclusive nenhuma.
  INSERT INTO public.composicao_mes_lider (empresa_id, mes, equipe_id, lider_id, ordem)
  WITH explicitos AS (
    SELECT el.equipe_id, el.lider_id, el.criado_em
      FROM public.equipe_lideres el
      JOIN public.perfis p ON p.id = el.lider_id AND p.perfil = 'lider'
     WHERE el.empresa_id = p_empresa_id
  ),
  ja_lidera AS (SELECT DISTINCT lider_id FROM explicitos),
  reserva AS (
    SELECT e.id AS equipe_id, p.id AS lider_id, p.nome
      FROM public.equipes e
      JOIN public.perfis p ON p.equipe_id = e.id AND p.perfil = 'lider'
     WHERE e.empresa_id = p_empresa_id
       AND p.id NOT IN (SELECT lider_id FROM ja_lidera)
       AND NOT EXISTS (SELECT 1 FROM explicitos x WHERE x.equipe_id = e.id)
    UNION
    SELECT c.equipe_id, p.id, p.nome
      FROM public.equipe_operadores_clones c
      JOIN public.perfis p ON p.id = c.operador_id AND p.perfil = 'lider'
     WHERE c.empresa_id = p_empresa_id
       AND p.id NOT IN (SELECT lider_id FROM ja_lidera)
       AND NOT EXISTS (SELECT 1 FROM explicitos x WHERE x.equipe_id = c.equipe_id)
  ),
  lista AS (
    SELECT equipe_id, lider_id,
           row_number() OVER (PARTITION BY equipe_id ORDER BY criado_em, lider_id)::INTEGER AS ordem
      FROM explicitos
    UNION ALL
    SELECT equipe_id, lider_id,
           (100 + row_number() OVER (PARTITION BY equipe_id ORDER BY nome, lider_id))::INTEGER
      FROM reserva
  )
  SELECT p_empresa_id, p_mes, l.equipe_id, l.lider_id, l.ordem
    FROM lista l
   WHERE NOT v_fechado OR l.equipe_id = ANY(v_equipes_novas)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_lideres = ROW_COUNT;

  IF v_fechado THEN
    -- Os setores das pessoas e das equipes acrescentadas agora.
    v_setores_novos := ARRAY(
      SELECT DISTINCT s.sid
        FROM (
          SELECT cm.setor_id AS sid
            FROM public.composicao_mes cm
           WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes
             AND cm.operador_id = ANY(v_novos)
          UNION
          SELECT ce.setor_id
            FROM public.composicao_mes_equipe ce
           WHERE ce.empresa_id = p_empresa_id AND ce.mes = p_mes
             AND ce.equipe_id = ANY(v_equipes_novas)
        ) s
       WHERE s.sid IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.composicao_mes_setor cs
            WHERE cs.empresa_id = p_empresa_id AND cs.mes = p_mes AND cs.setor_id = s.sid)
    );
  END IF;

  -- ── Setores ───────────────────────────────────────────────────────────────
  INSERT INTO public.composicao_mes_setor
    (empresa_id, mes, setor_id, nome, ativo, alternativo, regra, cidade_id, tipo)
  SELECT p_empresa_id, p_mes, s.id, s.nome,
         COALESCE(s.ativo, TRUE), COALESCE(s.alternativo, FALSE),
         s.regra, s.cidade_id, s.tipo
    FROM public.setores s
   WHERE s.empresa_id = p_empresa_id
     AND (NOT v_fechado OR s.id = ANY(v_setores_novos))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_setores = ROW_COUNT;

  -- ── Configuração do mês ───────────────────────────────────────────────────
  -- Só no mês corrente (ou no fechado que nunca teve retrato, que é regravado
  -- inteiro como antes). Mês fechado com retrato NÃO recebe a config de hoje.
  IF NOT v_fechado THEN
    DELETE FROM public.composicao_mes_config WHERE empresa_id = p_empresa_id AND mes = p_mes;
    INSERT INTO public.composicao_mes_config
      (empresa_id, mes, empresa_config, cargos, ranking, pix_config, carteiras,
       subgrupos, rh_setores, direto_extra, pix_bonus)
    SELECT p_empresa_id, p_mes,
           COALESCE((SELECT em.config FROM public.empresas em WHERE em.id = p_empresa_id), '{}'::JSONB),
           COALESCE((SELECT jsonb_object_agg(cg.slug, jsonb_build_object(
                       'conta_no_recebimento', cg.conta_no_recebimento,
                       'lidera_equipe',        cg.lidera_equipe,
                       'pertence_a_setor',     cg.pertence_a_setor,
                       'nivel',                cg.nivel))
                       FROM public.cargos cg), '{}'::JSONB),
           COALESCE((SELECT jsonb_agg(to_jsonb(rc) ORDER BY rc.setor_id)
                       FROM public.analitico_ranking_config rc
                      WHERE rc.empresa_id = p_empresa_id), '[]'::JSONB),
           COALESCE((SELECT jsonb_agg(to_jsonb(pc) ORDER BY pc.setor_id)
                       FROM public.pix_automatico_config pc
                      WHERE pc.empresa_id = p_empresa_id), '[]'::JSONB),
           jsonb_build_object(
             'grupos', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'cod_grupo_filtro',  g.cod_grupo_filtro,
                         'nome_grupo_filtro', g.nome_grupo_filtro,
                         'setor_id',          g.setor_id,
                         'estado',            g.estado) ORDER BY g.cod_grupo_filtro)
                         FROM public.mestre_grupos g
                        WHERE g.empresa_id = p_empresa_id), '[]'::JSONB),
             'equipes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'cod_grupo_filtro',  me.cod_grupo_filtro,
                         'nome_subgrupo',     me.nome_subgrupo,
                         'equipe_id',         me.equipe_id,
                         'destino',           me.destino,
                         'destino_setor_id',  me.destino_setor_id,
                         'estado',            me.estado) ORDER BY me.cod_grupo_filtro, me.nome_subgrupo)
                         FROM public.mestre_equipes me
                        WHERE me.empresa_id = p_empresa_id), '[]'::JSONB)
           ),
           -- 20261031200000: subgrupos, remuneração do RH, Direto/Extra e o
           -- bônus de Pix que cai no mês.
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'id', sg.id, 'equipe_id', sg.equipe_id, 'nome', sg.nome)
                       ORDER BY sg.equipe_id, sg.nome)
                       FROM public.equipe_subgrupos sg
                      WHERE sg.empresa_id = p_empresa_id), '[]'::JSONB),
           COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.setor_id)
                       FROM public.rh_config_setores r
                      WHERE r.empresa_id = p_empresa_id), '[]'::JSONB),
           COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.escopo, d.referencia_id)
                       FROM public.direto_extra_config d
                      WHERE d.empresa_id = p_empresa_id), '[]'::JSONB),
           COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.inicio, b.id)
                       FROM public.pix_automatico_bonus b
                      WHERE b.empresa_id = p_empresa_id
                        AND b.inicio <= ((p_mes || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE
                        AND b.fim    >= (p_mes || '-01')::DATE), '[]'::JSONB);
  END IF;

  PERFORM public.fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'info',
    p_descricao  => CASE WHEN v_fechado THEN format(
      'Completou a composição do mês fechado %s — %s operador(es) com recebimento no mês, %s equipe(s), %s liderança(s) e %s setor(es) que faltavam',
      p_mes, v_linhas, v_equipes, v_lideres, v_setores
    ) ELSE format(
      'Regerou a composição do mês %s — %s operador(es), %s equipe(s), %s liderança(s) e %s setor(es)',
      p_mes, v_linhas, v_equipes, v_lideres, v_setores
    ) END,
    p_empresa_id => p_empresa_id,
    p_tabela     => 'composicao_mes',
    p_alvo_tipo  => 'composicao_mes',
    p_alvo_rotulo=> p_mes,
    p_detalhes   => jsonb_build_object(
      'mes', p_mes, 'preservado', v_fechado,
      'operadores', v_linhas, 'equipes', v_equipes,
      'lideres', v_lideres, 'setores', v_setores,
      'operadores_antes', v_antes_operador, 'equipes_antes', v_antes_equipe,
      'config', NOT v_fechado
    ),
    p_origem     => 'automatico'
  );

  RETURN v_linhas;
END;
$function$;

-- ── O selo da virada, de novo nos dias 2 a 5 ────────────────────────────────
-- Dia 1º: a versão da virada, sem motivo. Dias 2 a 5: só vira versão nova se o
-- relatório trouxe número diferente (o hash de fn_fechamento_mes_selar diz), e
-- leva o motivo.
CREATE OR REPLACE FUNCTION public.fn_fechamento_mes_selar_virada()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mes TEXT := to_char(
    date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')) - INTERVAL '1 day', 'YYYY-MM');
  v_dia INTEGER := extract(day FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER;
  v_motivo TEXT;
  v_emp RECORD;
  v_n   INTEGER := 0;
BEGIN
  IF v_dia > 1 THEN
    v_motivo := format('Relatório importado depois da virada (releitura automática do dia %s)', v_dia);
  END IF;

  FOR v_emp IN SELECT id FROM public.empresas LOOP
    -- Uma empresa com problema não impede o selo das outras.
    BEGIN
      PERFORM public.fn_fechamento_mes_selar(v_emp.id, v_mes, v_motivo);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'selo de % da empresa % falhou: %', v_mes, v_emp.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_fechamento_mes_selar_virada() FROM PUBLIC, anon, authenticated;

-- Dias 1 a 5, 00:02 de São Paulo = 03:02 UTC (o cron está em GMT).
DO $cron$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron ausente: agenda não alterada';
    RETURN;
  END IF;
  PERFORM cron.alter_job(j.jobid, schedule := '2 3 1-5 * *')
     FROM cron.job j
    WHERE j.jobname = 'fechamento-mes-selar';
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fechamento-mes-selar' AND schedule = '2 3 1-5 * *') THEN
    RAISE EXCEPTION 'PROVA: o cron fechamento-mes-selar não ficou em 2 3 1-5 * *';
  END IF;
END
$cron$;

-- ── Prova: regrava o mês corrente e confere contra as tabelas de hoje ───────
DO $prova$
DECLARE
  v_mes TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_emp RECORD;
  v_dif BIGINT;
BEGIN
  FOR v_emp IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_composicao_mes_snapshot(v_emp.id, v_mes);
  END LOOP;

  SELECT count(*) INTO v_dif
    FROM public.perfis p
    LEFT JOIN public.composicao_mes cm
      ON cm.empresa_id = p.empresa_id AND cm.mes = v_mes AND cm.operador_id = p.id
   WHERE p.empresa_id IS NOT NULL
     AND (cm.operador_id IS NULL OR cm.subgrupo_id IS DISTINCT FROM p.subgrupo_id);
  IF v_dif > 0 THEN
    RAISE EXCEPTION 'PROVA: % pessoa(s) fora do retrato ou com subgrupo diferente — nada foi aplicado', v_dif;
  END IF;

  SELECT count(*) INTO v_dif
    FROM public.empresas e
    LEFT JOIN public.composicao_mes_config c ON c.empresa_id = e.id AND c.mes = v_mes
   WHERE c.empresa_id IS NULL
      OR jsonb_array_length(c.subgrupos)    <> (SELECT count(*) FROM public.equipe_subgrupos s    WHERE s.empresa_id = e.id)
      OR jsonb_array_length(c.rh_setores)   <> (SELECT count(*) FROM public.rh_config_setores r   WHERE r.empresa_id = e.id)
      OR jsonb_array_length(c.direto_extra) <> (SELECT count(*) FROM public.direto_extra_config d WHERE d.empresa_id = e.id);
  IF v_dif > 0 THEN
    RAISE EXCEPTION 'PROVA: config do mês incompleta em % empresa(s) — nada foi aplicado', v_dif;
  END IF;

  RAISE NOTICE 'PROVA: retrato de % regravado com subgrupo e config completos', v_mes;
END
$prova$;

COMMIT;
