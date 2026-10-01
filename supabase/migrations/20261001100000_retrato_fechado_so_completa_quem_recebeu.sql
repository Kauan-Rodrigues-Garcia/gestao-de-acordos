-- ============================================================================
-- Retrato de mês FECHADO: completar só quem recebeu naquele mês
-- ============================================================================
--
-- ## O buraco (achado na virada de 01/10/2026)
--
-- `20260903330000` decidiu que o retrato de um mês fechado não se reescreve:
-- a função só ACRESCENTA quem falta, pensando no «operador que apareceu numa
-- importação atrasada». Mas o código acrescentava TODO perfil que faltava no
-- retrato, recebesse ou não naquele mês — e, com ele, toda equipe, todo setor
-- e toda liderança que faltassem.
--
-- A importação do analítico chama esta função para o mês do arquivo
-- (`congelarComposicaoDoMes`). Subir em outubro um relatório com pagamento de
-- setembro, então, punha em SETEMBRO:
--
--   * todo usuário criado em outubro (aparecia em Usuários do mês, Quartis,
--     Metas de setembro);
--   * toda equipe e todo setor criados em outubro;
--   * o líder de HOJE de qualquer equipe nova.
--
-- A regra da operação (01/10/2026): «nada muda no mês passado, só o relatório
-- com pagamento daquele mês».
--
-- ## A regra nova
--
-- Mês corrente, ou mês fechado SEM retrato: igual a antes, reescreve inteiro.
--
-- Mês fechado COM retrato:
--
--   pessoas    só quem tem linha no analítico daquele mês e falta no retrato
--   equipes    só as dessas pessoas (a do rótulo e as demais em que estão)
--   liderança  só das equipes acrescentadas agora
--   setores    só os dessas pessoas e dessas equipes
--
-- Quem já está no retrato continua intocado, como sempre.
--
-- ## O que NÃO muda
--
-- Travas de autorização, a decisão de `v_fechado`, os DELETEs do mês corrente,
-- as regras de equipe do rótulo e de liderança, e o log ficam como estavam em
-- `20260929141516`. A ordem dos blocos mudou (pessoas primeiro): no mês
-- fechado as equipes e os setores a completar saem das pessoas acrescentadas.
-- No mês corrente a ordem não importa — tudo é apagado e regravado.
--
-- Só a função. Nenhuma linha de dado muda ao aplicar. Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

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
     nome, usuario, email, cargo, foto_url, ativo, desligado_em)
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
         COALESCE(p.ativo, TRUE), p.desligado_em
    FROM public.perfis p
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
    (empresa_id, mes, equipe_id, nome, setor_id)
  SELECT p_empresa_id, p_mes, e.id, e.nome, e.setor_id
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
    (empresa_id, mes, setor_id, nome, ativo, alternativo)
  SELECT p_empresa_id, p_mes, s.id, s.nome,
         COALESCE(s.ativo, TRUE), COALESCE(s.alternativo, FALSE)
    FROM public.setores s
   WHERE s.empresa_id = p_empresa_id
     AND (NOT v_fechado OR s.id = ANY(v_setores_novos))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_setores = ROW_COUNT;

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
      'operadores_antes', v_antes_operador, 'equipes_antes', v_antes_equipe
    ),
    p_origem     => 'automatico'
  );

  RETURN v_linhas;
END;
$function$;

COMMENT ON FUNCTION public.fn_composicao_mes_snapshot(uuid, text) IS
  'Congela o mes: vinculo (equipe, setor, TODAS as equipes em que a pessoa esta, '
  'situacao) E identidade (nome, login, email, cargo, foto). Mes corrente '
  'reescreve; mes fechado com retrato so acrescenta quem tem recebimento no '
  'analitico daquele mes e falta na foto, com as equipes, liderancas e setores '
  'dessas pessoas (20261001100000).';

commit;
