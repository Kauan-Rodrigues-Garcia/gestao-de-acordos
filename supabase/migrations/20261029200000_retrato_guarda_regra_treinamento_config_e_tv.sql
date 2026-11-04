-- ============================================================================
-- Retrato do mês: o que faltava para o mês fechado ser o mês que foi
-- ============================================================================
--
-- Fase 1 da auditoria de fechamento (29/10/2026). Tem de estar no banco antes
-- do último congelamento de outubro (31/10, 23:50 e 23:59 São Paulo): depois
-- da virada o retrato de um mês fechado não se completa sozinho — por desenho
-- (20260903330000, 20261001100000) — e o que faltar vira reconstrução pelos
-- logs.
--
-- ## O buraco
--
-- O retrato (`composicao_mes*`) já guarda quem estava em qual equipe, setor e
-- liderança, e o nome de cada um. Mas várias coisas que entram na CONTA de um
-- mês continuam vindo das tabelas de hoje, e editar qualquer uma delas em
-- novembro reescreve outubro em silêncio:
--
--   setor     regra (Cofen / Nosso produto), cidade (que dá a marca), tipo
--   equipe    treinamento e o início do treinamento (metas, quartis, RH)
--   pessoa    se o cargo conta no recebimento; se é robô
--   empresa   o percentual de H.O. e o resto de `empresas.config`
--   cargo     conta_no_recebimento, lidera_equipe, pertence_a_setor
--   ranking   `analitico_ranking_config` (critério, grupos, excluídos)
--   Pix       `pix_automatico_config` (percentual por setor)
--   59        o vínculo carteira → setor e subgrupo → equipe
--             (`mestre_grupos`, `mestre_equipes`) — a base do Painel Diretoria
--   Modo TV   o painel (telas, tema, alvo): editar em novembro muda o que
--             outubro mostrou; e excluir a equipe leva o painel junto (CASCADE)
--
-- ## O que entra
--
--   composicao_mes_setor   + regra, cidade_id, tipo
--   composicao_mes_equipe  + treinamento, treinamento_inicio
--   composicao_mes         + conta_no_recebimento, robo
--   composicao_mes_config  NOVA — a configuração do mês, uma linha por empresa
--   tv_paineis_mes         NOVA — cada painel como estava no fim do mês, com
--                          o pacote de números do último congelamento
--   fn_composicao_mes_snapshot   grava as colunas e a config
--   fn_tv_paineis_mes_congelar   NOVA — fotografa os painéis do mês corrente
--   fn_composicao_mes_congelar   chama as duas
--   cron composicao-mes-congelar 23:50 E 23:59 (era só 23:50): o que mudar no
--                                último dia depois das 23:50 também entra
--
-- ## O que NÃO muda
--
-- A regra do mês fechado continua a de 20261001100000: retrato existente não
-- se reescreve; importação atrasada só acrescenta quem recebeu e faltava.
-- A config do mês (`composicao_mes_config`) nunca é gravada para mês fechado
-- — gravar hoje a config de setembro seria a mesma contaminação de agosto.
--
-- Meses já fechados ficam com as colunas novas NULAS: «não guardado». Quem lê
-- cai na tabela de hoje, que é exatamente o comportamento atual. Outubro se
-- completa sozinho no próximo congelamento (mês corrente é regravado inteiro).
--
-- Corpo de `fn_composicao_mes_snapshot` partindo do vigente no banco em
-- 29/10/2026 (= 20261001100000, conferido por leitura); só as colunas novas e
-- o bloco da config foram acrescentados.
--
-- `equipe_lideres` e `equipe_operadores_clones` viram views em novembro
-- (20261101120000, fase 7) com as mesmas colunas: nada aqui depende de serem
-- tabelas.
--
-- Nenhuma linha de dado existente muda ao aplicar. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── Colunas novas do retrato ────────────────────────────────────────────────
ALTER TABLE public.composicao_mes_setor
  ADD COLUMN IF NOT EXISTS regra     TEXT,
  ADD COLUMN IF NOT EXISTS cidade_id UUID,
  ADD COLUMN IF NOT EXISTS tipo      TEXT;

ALTER TABLE public.composicao_mes_equipe
  ADD COLUMN IF NOT EXISTS treinamento        BOOLEAN,
  ADD COLUMN IF NOT EXISTS treinamento_inicio DATE;

ALTER TABLE public.composicao_mes
  ADD COLUMN IF NOT EXISTS conta_no_recebimento BOOLEAN,
  ADD COLUMN IF NOT EXISTS robo                 BOOLEAN;

COMMENT ON COLUMN public.composicao_mes_setor.regra IS
  'setores.regra no mes (cofen / nosso_produto). NULL = mes fechado antes de 20261029200000: ler setores.';
COMMENT ON COLUMN public.composicao_mes_equipe.treinamento IS
  'equipes.treinamento no mes. NULL = nao guardado (antes de 20261029200000).';
COMMENT ON COLUMN public.composicao_mes.conta_no_recebimento IS
  'cargos.conta_no_recebimento do cargo da pessoa no mes. NULL = nao guardado.';

-- ── A configuração do mês ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.composicao_mes_config (
  empresa_id     UUID        NOT NULL REFERENCES public.empresas(id),
  mes            TEXT        NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  -- `empresas.config` inteira: o H.O. mora em `ho_percentual`.
  empresa_config JSONB       NOT NULL DEFAULT '{}'::JSONB,
  -- slug → {conta_no_recebimento, lidera_equipe, pertence_a_setor, nivel}
  cargos         JSONB       NOT NULL DEFAULT '{}'::JSONB,
  -- linhas de analitico_ranking_config da empresa
  ranking        JSONB       NOT NULL DEFAULT '[]'::JSONB,
  -- linhas de pix_automatico_config da empresa
  pix_config     JSONB       NOT NULL DEFAULT '[]'::JSONB,
  -- {grupos: [mestre_grupos], equipes: [mestre_equipes]}
  carteiras      JSONB       NOT NULL DEFAULT '{}'::JSONB,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, mes)
);

COMMENT ON TABLE public.composicao_mes_config IS
  'Configuracao que entra na conta do mes, congelada com o retrato (20261029200000). '
  'Mes corrente: regravada a cada congelamento. Mes fechado: nunca gravada.';

ALTER TABLE public.composicao_mes_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS composicao_mes_config_leitura ON public.composicao_mes_config;
CREATE POLICY composicao_mes_config_leitura ON public.composicao_mes_config
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_acesso_multiempresa())
    OR empresa_id = (SELECT p.empresa_id FROM public.perfis p WHERE p.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS composicao_mes_config_super_admin_total ON public.composicao_mes_config;
CREATE POLICY composicao_mes_config_super_admin_total ON public.composicao_mes_config
  FOR ALL TO authenticated
  USING ((SELECT public.fn_user_is_super_admin()));

-- ── Os painéis do Modo TV no mês ────────────────────────────────────────────
-- Sem FK para tv_paineis nem para equipes: o painel e a equipe podem ser
-- apagados, e o mês continua sabendo o que a parede mostrava.
CREATE TABLE IF NOT EXISTS public.tv_paineis_mes (
  empresa_id           UUID        NOT NULL REFERENCES public.empresas(id),
  mes                  TEXT        NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  painel_id            UUID        NOT NULL,
  setor_id             UUID,
  equipe_id            UUID,
  nome                 TEXT        NOT NULL,
  tema                 TEXT,
  unidade              TEXT,
  segundos_por_tela    SMALLINT,
  telas                JSONB       NOT NULL DEFAULT '[]'::JSONB,
  tela_fixa            TEXT,
  -- O pacote de fn_tv_numeros_calcular no último congelamento do mês: o que
  -- a TV mostrava no último dia. O número FINAL do mês (com o relatório que
  -- chega depois da virada) é o do selo — `fechamento_mes`.
  numeros              JSONB,
  painel_atualizado_em TIMESTAMPTZ,
  congelado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, mes, painel_id)
);

COMMENT ON TABLE public.tv_paineis_mes IS
  'Cada painel do Modo TV como estava no fim do mes (20261029200000). '
  'Mes corrente: regravado a cada congelamento. Mes fechado: nunca mexido.';

ALTER TABLE public.tv_paineis_mes ENABLE ROW LEVEL SECURITY;

-- Mesmo alcance de quem vê o painel vivo.
DROP POLICY IF EXISTS tv_paineis_mes_select ON public.tv_paineis_mes;
CREATE POLICY tv_paineis_mes_select ON public.tv_paineis_mes
  FOR SELECT TO authenticated
  USING (public.fn_tv_alvo_no_meu_alcance(setor_id, equipe_id));

CREATE OR REPLACE FUNCTION public.fn_tv_paineis_mes_congelar(p_mes text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n INTEGER;
BEGIN
  -- Só o banco (cron) chama. O pacote de números é sempre do mês corrente
  -- (fn_tv_numeros_calcular não tem mês), então mês fechado é recusado.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o congelamento automático grava os painéis do mês'
      USING ERRCODE = '42501';
  END IF;
  IF p_mes IS DISTINCT FROM to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') THEN
    RETURN 0;
  END IF;

  DELETE FROM public.tv_paineis_mes WHERE mes = p_mes;

  INSERT INTO public.tv_paineis_mes
    (empresa_id, mes, painel_id, setor_id, equipe_id, nome, tema, unidade,
     segundos_por_tela, telas, tela_fixa, numeros, painel_atualizado_em)
  SELECT tp.empresa_id, p_mes, tp.id, tp.setor_id, tp.equipe_id, tp.nome, tp.tema,
         tp.unidade, tp.segundos_por_tela, COALESCE(tp.telas, '[]'::JSONB), tp.tela_fixa,
         public.fn_tv_numeros_calcular(tp.setor_id, tp.equipe_id),
         tp.atualizado_em
    FROM public.tv_paineis tp;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_paineis_mes_congelar(text) FROM PUBLIC, anon, authenticated;

-- ── O retrato, agora completo ───────────────────────────────────────────────
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
     conta_no_recebimento, robo)
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
         cg.conta_no_recebimento, COALESCE(p.robo, FALSE)
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
      (empresa_id, mes, empresa_config, cargos, ranking, pix_config, carteiras)
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
           );
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

-- ── O congelamento diário chama as duas fotos ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_composicao_mes_congelar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mes      TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_empresa  RECORD;
  v_total    INTEGER := 0;
BEGIN
  FOR v_empresa IN SELECT id FROM public.empresas LOOP
    v_total := v_total + public.fn_composicao_mes_snapshot(v_empresa.id, v_mes);
  END LOOP;

  -- Painel da TV com defeito não pode derrubar o retrato: cai só a foto dele.
  BEGIN
    PERFORM public.fn_tv_paineis_mes_congelar(v_mes);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_tv_paineis_mes_congelar falhou: %', SQLERRM;
  END;

  RETURN v_total;
END;
$function$;

-- ── 23:50 e 23:59 de São Paulo (02:50 e 02:59 UTC) ──────────────────────────
-- O congelamento roda em menos de 1 s. A segunda rodada pega o que mudou no
-- último dia depois das 23:50; `now()` é o início da transação, então mesmo
-- terminando depois da meia-noite ela ainda grava o mês que acabou.
DO $cron$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron ausente: agenda não alterada';
    RETURN;
  END IF;
  PERFORM cron.alter_job(j.jobid, schedule := '50,59 2 * * *')
     FROM cron.job j
    WHERE j.jobname = 'composicao-mes-congelar';
END
$cron$;

COMMIT;
