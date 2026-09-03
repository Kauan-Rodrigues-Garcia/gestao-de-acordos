-- ═══════════════════════════════════════════════════════════════════════════
-- O retrato do mês passa a guardar QUEM era cada um, não só onde estava
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que já existia
--
-- `composicao_mes` congela, por mês, o VÍNCULO de cada pessoa: equipe, setor,
-- situação e as equipes em que ela estava clonada. É o bastante para o
-- Desempenho Equipes, o Pix e o Dashboard agruparem dinheiro no lugar certo, e
-- foi para isso que a tabela nasceu.
--
-- Repare que ela já fotografa TODOS os perfis da empresa (`WHERE p.empresa_id =
-- p_empresa_id`), e não só quem produz recebimento. A população está completa;
-- o que falta é identidade.
--
-- ## O que falta, e por quê
--
-- Uma LISTA DE USUÁRIOS por mês precisa de nome, login, e-mail, cargo e foto —
-- nada disso está guardado. Hoje toda tela que mostra gente vai buscar esses
-- campos em `perfis`, ou seja, no estado de agora. Enquanto a pessoa existe e
-- não muda de cargo isso passa despercebido; quando ela é excluída, some da
-- lista de um mês que ela trabalhou inteiro.
--
-- Medido: o retrato de 2026-07 da BookPlay tem 8 pessoas que já não existem em
-- `perfis`. Sem estas colunas, julho é exibido com oito buracos.
--
-- ## A regra continua a mesma
--
-- Mês corrente reescreve; mês fechado só ACRESCENTA quem falta e nunca reescreve
-- quem já está lá (`20260903330000`). As colunas novas entram nesse mesmo
-- regime — o retrato de um mês fechado não muda de nome porque alguém foi
-- renomeado depois.
--
-- Por isso o backfill dos meses já fechados é feito aqui, uma vez: as linhas
-- deles existem e a função, por desenho, não vai voltar para preenchê-las.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. As colunas
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.composicao_mes
  ADD COLUMN IF NOT EXISTS nome         TEXT,
  ADD COLUMN IF NOT EXISTS usuario      TEXT,
  ADD COLUMN IF NOT EXISTS email        TEXT,
  ADD COLUMN IF NOT EXISTS cargo        TEXT,
  ADD COLUMN IF NOT EXISTS foto_url     TEXT,
  ADD COLUMN IF NOT EXISTS ativo        BOOLEAN,
  ADD COLUMN IF NOT EXISTS desligado_em TIMESTAMPTZ;

COMMENT ON COLUMN public.composicao_mes.nome IS
  'Nome da pessoa NAQUELE mes. Congelado: quem for renomeado ou excluido depois '
  'continua aparecendo no mes em que trabalhou, com o nome que tinha la.';
COMMENT ON COLUMN public.composicao_mes.cargo IS
  'perfis.perfil naquele mes. Quem virou lider em setembro aparece como operador '
  'em agosto, que e o que ele era.';

-- O setor guarda o que a aba Setores mostra: o nome já vinha, faltam as duas
-- chaves que mudam o comportamento dele.
ALTER TABLE public.composicao_mes_setor
  ADD COLUMN IF NOT EXISTS ativo       BOOLEAN,
  ADD COLUMN IF NOT EXISTS alternativo BOOLEAN;

COMMENT ON COLUMN public.composicao_mes_setor.alternativo IS
  'Setor alternativo (soma pelos usuarios, nao pelo carimbo) NAQUELE mes. '
  'Ligar a chave hoje nao pode reescrever como o mes passado foi somado.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. O snapshot passa a preencher
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só os três INSERTs mudam, e cada um ganha exatamente as colunas novas. As
-- travas de autorização, a decisão de `v_fechado`, os DELETEs do mês corrente e
-- o log ficam letra por letra como estavam.

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
  END IF;

  INSERT INTO public.composicao_mes_setor
    (empresa_id, mes, setor_id, nome, ativo, alternativo)
  SELECT p_empresa_id, p_mes, s.id, s.nome,
         COALESCE(s.ativo, TRUE), COALESCE(s.alternativo, FALSE)
    FROM public.setores s
   WHERE s.empresa_id = p_empresa_id
     AND (NOT v_fechado OR NOT EXISTS (
       SELECT 1 FROM public.composicao_mes_setor cs
        WHERE cs.empresa_id = p_empresa_id AND cs.mes = p_mes AND cs.setor_id = s.id))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_setores = ROW_COUNT;

  INSERT INTO public.composicao_mes_equipe
    (empresa_id, mes, equipe_id, nome, setor_id)
  SELECT p_empresa_id, p_mes, e.id, e.nome, e.setor_id
    FROM public.equipes e
   WHERE e.empresa_id = p_empresa_id
     AND (NOT v_fechado OR NOT EXISTS (
       SELECT 1 FROM public.composicao_mes_equipe ce
        WHERE ce.empresa_id = p_empresa_id AND ce.mes = p_mes AND ce.equipe_id = e.id))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_equipes = ROW_COUNT;

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
   WHERE NOT v_fechado OR NOT EXISTS (
     SELECT 1 FROM public.composicao_mes_lider cl
      WHERE cl.empresa_id = p_empresa_id AND cl.mes = p_mes AND cl.equipe_id = l.equipe_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_lideres = ROW_COUNT;

  INSERT INTO public.composicao_mes
    (empresa_id, mes, operador_id, equipe_id, equipe_nome, setor_id,
     situacao, equipes_clone,
     nome, usuario, email, cargo, foto_url, ativo, desligado_em)
  SELECT p_empresa_id, p_mes, p.id, v.equipe_id,
         COALESCE(e.nome, 'Sem equipe'), COALESCE(e.setor_id, p.setor_id),
         COALESCE(p.situacao, 'ativo'),
         COALESCE((
           SELECT array_agg(c.equipe_id)
             FROM public.equipe_operadores_clones c
            WHERE c.empresa_id = p_empresa_id
              AND c.operador_id = p.id
              AND COALESCE(c.conta_recebimento, TRUE)
         ), '{}'::UUID[]),
         p.nome, p.usuario, p.email, p.perfil::TEXT, p.foto_url,
         COALESCE(p.ativo, TRUE), p.desligado_em
    FROM public.perfis p
    LEFT JOIN LATERAL (
      SELECT (array_agg(DISTINCT el.equipe_id))[1] AS equipe_id
        FROM public.equipe_lideres el
       WHERE el.empresa_id = p_empresa_id AND el.lider_id = p.id
      HAVING count(DISTINCT el.equipe_id) = 1
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT CASE
               WHEN p.perfil = 'lider' THEN COALESCE(l.equipe_id, p.equipe_id)
               ELSE COALESCE(p.equipe_id, l.equipe_id)
             END AS equipe_id
    ) v ON TRUE
    LEFT JOIN public.equipes e ON e.id = v.equipe_id
   WHERE p.empresa_id = p_empresa_id
     AND (NOT v_fechado OR NOT EXISTS (
       SELECT 1 FROM public.composicao_mes cm
        WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes AND cm.operador_id = p.id))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  PERFORM public.fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'info',
    p_descricao  => CASE WHEN v_fechado THEN format(
      'Completou a composição do mês fechado %s — %s operador(es), %s equipe(s), %s liderança(s) e %s setor(es) que faltavam',
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
  'Congela o mes: vinculo (equipe, setor, clones, situacao) E identidade (nome, '
  'login, email, cargo, foto). Mes corrente reescreve; mes fechado so acrescenta '
  'quem falta e nunca reescreve quem ja esta la.';
