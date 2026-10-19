-- ============================================================================
-- Desafio do dia: o receptivo e o «sem operador» aparecem no placar — 19/10/2026
-- ============================================================================
--
-- Conferência do Cleber no desafio do Play 1 (19/10/2026, dia inteiro): o total
-- da função bateu ao centavo com as linhas do dia carimbadas no setor —
-- R$ 5.687,23 = R$ 4.030,42 de operadores + R$ 1.430,81 de Contribuição do
-- Receptivo (`contribuicao_59`) + R$ 226,00 de pagamento sem operador.
--
-- O total estava certo; o PLACAR não mostrava de onde vinha. «Quem fez entrar»
-- lista pessoas, e as linhas sem operador (o receptivo e o órfão) entravam no
-- total sem aparecer em lugar nenhum — parecia que o receptivo não contava.
--
-- Agora `fn_desafio_diario` devolve os dois à parte, nas mesmas linhas que o
-- total conta:
--
--   contribuicao_receptivo  { total, qtd }  — procedencia = contribuicao_59
--   sem_operador            { total, qtd }  — as outras linhas sem operador
--
-- Só no desafio de SETOR: equipe e operador são de pessoas, e esse dinheiro é
-- do setor. `ultima_chegada` passa a ser a do setor inteiro.
--
-- Só a função muda. Nenhuma linha de dado. Reaplicável. O corpo é o de
-- 20261019140000 com os acréscimos marcados «19/10/2026».
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_desafio_diario(p_desafio_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_d          public.desafios%ROWTYPE;
  v_empresas   UUID[];
  v_cfg        JSONB;
  v_publico    TEXT;
  v_alvo       UUID;
  v_setor      UUID;
  v_dia        DATE;
  v_mes        TEXT;
  v_h_ini      INT;
  v_h_fim      INT;
  v_de         TIMESTAMPTZ;
  v_ate        TIMESTAMPTZ;
  v_regra      TEXT;
  v_alt        BOOLEAN;
  v_total      NUMERIC := 0;
  v_total_ho   NUMERIC := 0;
  v_qtd        BIGINT  := 0;
  v_contrib    JSONB;
  v_op_total   NUMERIC;
  v_op_ho      NUMERIC;
  v_op_qtd     BIGINT;
  v_ultima     TIMESTAMPTZ;
  v_meta_mes   NUMERIC;
  v_config_mes JSONB;
  v_participo  BOOLEAN := FALSE;
  v_rec_total  NUMERIC := 0;
  v_rec_qtd    BIGINT  := 0;
  v_orf_total  NUMERIC := 0;
  v_orf_qtd    BIGINT  := 0;
  v_orf_ultima TIMESTAMPTZ;
  v_uid        UUID := auth.uid();
BEGIN
  SELECT * INTO v_d FROM public.desafios WHERE id = p_desafio_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_empresas := public.fn_desafio_empresas(v_d.empresa_id, v_d.empresas);

  -- ── Os mesmos três portões de fn_desafio_dados ────────────────────────────
  IF NOT public.fn_desafio_alcanca_empresa(v_empresas) THEN
    RETURN NULL;
  END IF;

  IF v_d.status = 'rascunho'
     AND NOT public.fn_user_tem('desafios_configurar')
     AND NOT public.fn_user_tem('desafios_configurar_setor') THEN
    RETURN NULL;
  END IF;

  IF NOT public.fn_desafio_no_meu_alcance(v_d.setor_id, v_d.regra, v_d.visibilidade) THEN
    RETURN NULL;
  END IF;

  -- ── A configuração do dia ─────────────────────────────────────────────────
  v_cfg := v_d.regra->'diario';
  IF v_cfg IS NULL OR jsonb_typeof(v_cfg) <> 'object' THEN
    RETURN NULL;
  END IF;

  v_publico := CASE WHEN v_cfg->>'publico' IN ('setor', 'equipe', 'operador')
                    THEN v_cfg->>'publico' ELSE 'setor' END;
  BEGIN
    v_alvo := NULLIF(v_cfg->>'alvoId', '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_alvo := NULL;
  END;
  IF v_alvo IS NULL THEN
    RETURN NULL;
  END IF;

  -- O setor do desafio: o dono da linha; no desafio do setor, o próprio alvo.
  v_setor := COALESCE(v_d.setor_id, CASE WHEN v_publico = 'setor' THEN v_alvo END);
  v_dia   := v_d.data_inicio;
  v_mes   := to_char(v_dia, 'YYYY-MM');

  -- Horário: inteiros 0-23 (início) e 1-24 (fim), fim depois do início. Fora
  -- disso, dia inteiro — um JSON torto não pode virar uma janela vazia.
  v_h_ini := CASE WHEN (v_cfg->>'horaInicio') ~ '^\d{1,2}$' THEN (v_cfg->>'horaInicio')::INT END;
  v_h_fim := CASE WHEN (v_cfg->>'horaFim')    ~ '^\d{1,2}$' THEN (v_cfg->>'horaFim')::INT    END;
  IF v_h_ini IS NULL OR v_h_fim IS NULL
     OR v_h_ini < 0 OR v_h_ini > 23 OR v_h_fim < 1 OR v_h_fim > 24 OR v_h_fim <= v_h_ini THEN
    v_h_ini := NULL;
    v_h_fim := NULL;
  END IF;

  -- A chegada da hora H traz o que foi pago até H (convenção do Plantão Elite).
  IF v_h_ini IS NOT NULL THEN
    v_de  := (v_dia + make_interval(hours => v_h_ini + 1)) AT TIME ZONE 'America/Sao_Paulo';
    v_ate := (v_dia + make_interval(hours => v_h_fim + 1)) AT TIME ZONE 'America/Sao_Paulo';
  END IF;

  SELECT st.regra, COALESCE(st.alternativo, FALSE) INTO v_regra, v_alt
    FROM public.setores st WHERE st.id = v_setor;

  -- Quem chama está no alvo? É o que acende a barra superior.
  v_participo := CASE v_publico
    WHEN 'operador' THEN v_uid = v_alvo
    WHEN 'equipe'   THEN v_alvo = ANY (public.fn_user_equipes())
    ELSE public.fn_user_setor_id() = v_setor
      OR EXISTS (SELECT 1 FROM public.equipes e
                  WHERE e.setor_id = v_setor AND e.id = ANY (public.fn_user_equipes()))
  END;

  IF v_regra = 'cofen' THEN
    RETURN jsonb_build_object(
      'suportado',   FALSE,
      'regra_setor', v_regra,
      'publico',     v_publico,
      'participo',   COALESCE(v_participo, FALSE),
      'acompanho',   v_d.criado_por = v_uid,
      'agora',       now()
    );
  END IF;

  -- ── O total oficial: a conta do Painel ────────────────────────────────────
  IF v_publico = 'setor' THEN
    SELECT COALESCE(r.total, 0), COALESCE(r.total_ho, 0), COALESCE(r.qtd, 0)
      INTO v_total, v_total_ho, v_qtd
      FROM public.fn_recebido_por_setor(v_empresas, v_mes, v_dia, v_dia, v_de, v_ate) r
     WHERE r.setor_id = v_alvo;
  ELSIF v_publico = 'equipe' THEN
    SELECT COALESCE(r.total, 0), COALESCE(r.total_ho, 0), COALESCE(r.qtd, 0)
      INTO v_total, v_total_ho, v_qtd
      FROM public.fn_recebido_por_equipe(v_empresas, v_mes, v_dia, v_dia, FALSE, v_de, v_ate) r
     WHERE r.equipe_id = v_alvo;
  END IF;

  -- ── Quem fez entrar ───────────────────────────────────────────────────────
  --
  -- As linhas do dia, na janela, de quem pertence ao alvo. No operador é a
  -- própria soma oficial: a regra do setor da pessoa (BookPlay, set/2026+) tira
  -- a linha carimbada num setor onde ela não está, como no card dela.
  WITH
  linhas AS (
    SELECT ar.empresa_id, ar.operador_id, ar.setor_id, ar.valor_recebido,
           COALESCE(ar.total_ho, 0) AS ho, ar.importado_em
      FROM public.analitico_recebimentos ar
      JOIN public.perfis p ON p.id = ar.operador_id
     WHERE ar.empresa_id      = ANY (v_empresas)
       AND ar.data_pagamento  = v_dia
       AND COALESCE(p.perfil, '') <> 'super_admin'
       AND (v_de  IS NULL OR ar.importado_em >= v_de)
       AND (v_ate IS NULL OR ar.importado_em <  v_ate)
  ),
  do_alvo AS (
    SELECT l.* FROM linhas l
     WHERE CASE v_publico
       WHEN 'operador' THEN l.operador_id = v_alvo
       WHEN 'equipe'   THEN EXISTS (
              SELECT 1 FROM public.perfis p WHERE p.id = l.operador_id AND p.equipe_id = v_alvo
              UNION ALL
              SELECT 1 FROM public.equipe_lideres el WHERE el.lider_id = l.operador_id AND el.equipe_id = v_alvo
              UNION ALL
              SELECT 1 FROM public.equipe_operadores_clones c
               WHERE c.operador_id = l.operador_id AND c.equipe_id = v_alvo AND c.conta_recebimento IS TRUE)
       ELSE CASE WHEN v_alt
              THEN EXISTS (
                     SELECT 1 FROM public.perfis p WHERE p.id = l.operador_id AND p.setor_id = v_alvo
                     UNION ALL
                     SELECT 1 FROM public.equipe_operadores_clones c
                       JOIN public.equipes e ON e.id = c.equipe_id
                      WHERE c.operador_id = l.operador_id AND e.setor_id = v_alvo
                        AND c.conta_recebimento IS TRUE)
              ELSE l.setor_id = v_alvo
            END
     END
  ),
  casa AS (
    SELECT sm.operador_id, sm.setor_id
      FROM public.empresas em
     CROSS JOIN LATERAL public.fn_analitico_setores_no_mes(
             em.id, v_mes,
             ARRAY(SELECT DISTINCT a.operador_id FROM do_alvo a WHERE a.empresa_id = em.id)) sm
     WHERE em.id = ANY (v_empresas)
       AND em.slug = 'bookplay'
       AND v_mes >= '2026-09'
  ),
  contam AS (
    SELECT a.* FROM do_alvo a
     WHERE a.setor_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM casa h WHERE h.operador_id = a.operador_id)
        OR EXISTS (SELECT 1 FROM casa h WHERE h.operador_id = a.operador_id AND h.setor_id = a.setor_id)
  ),
  por_pessoa AS (
    SELECT c.operador_id,
           SUM(c.valor_recebido)::NUMERIC AS total,
           SUM(c.ho)::NUMERIC             AS total_ho,
           COUNT(*)::BIGINT               AS qtd,
           MAX(c.importado_em)            AS ultima
      FROM contam c
     GROUP BY c.operador_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id',       pp.operador_id,
           'nome',     p.nome,
           'foto_url', p.foto_url,
           'equipe',   e.nome,
           'total',    pp.total,
           'total_ho', pp.total_ho,
           'qtd',      pp.qtd,
           'ultima',   pp.ultima
         ) ORDER BY pp.total DESC, p.nome), '[]'::JSONB),
         MAX(pp.ultima),
         COALESCE(SUM(pp.total), 0),
         COALESCE(SUM(pp.total_ho), 0),
         COALESCE(SUM(pp.qtd), 0)
    INTO v_contrib, v_ultima, v_op_total, v_op_ho, v_op_qtd
    FROM por_pessoa pp
    JOIN public.perfis p ON p.id = pp.operador_id
    LEFT JOIN public.equipes e ON e.id = p.equipe_id;

  -- ── O dinheiro do setor que não é de ninguém (19/10/2026) ─────────────────
  --
  -- O total do setor (fn_recebido_por_setor) já conta as linhas SEM operador
  -- carimbadas no setor: a Contribuição do Receptivo que o 59 grava
  -- (`procedencia = contribuicao_59`) e o pagamento de quem não tem conta. Só
  -- que «quem fez entrar» lista pessoas, e esse dinheiro ficava invisível no
  -- placar: o total subia e ninguém aparecia. Aqui ele vem separado, nas MESMAS
  -- linhas que o total conta — setor normal e alternativo, sem operador,
  -- carimbadas no alvo, na janela.
  IF v_publico = 'setor' THEN
    SELECT COALESCE(SUM(ar.valor_recebido) FILTER (WHERE ar.procedencia = 'contribuicao_59'), 0),
           COUNT(*) FILTER (WHERE ar.procedencia = 'contribuicao_59'),
           COALESCE(SUM(ar.valor_recebido) FILTER (WHERE ar.procedencia IS DISTINCT FROM 'contribuicao_59'), 0),
           COUNT(*) FILTER (WHERE ar.procedencia IS DISTINCT FROM 'contribuicao_59'),
           MAX(ar.importado_em)
      INTO v_rec_total, v_rec_qtd, v_orf_total, v_orf_qtd, v_orf_ultima
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id     = ANY (v_empresas)
       AND ar.setor_id       = v_alvo
       AND ar.operador_id   IS NULL
       AND ar.data_pagamento = v_dia
       AND (v_de  IS NULL OR ar.importado_em >= v_de)
       AND (v_ate IS NULL OR ar.importado_em <  v_ate);
    -- A última chegada é a do setor inteiro, não só a das pessoas.
    v_ultima := GREATEST(v_ultima, v_orf_ultima);
  END IF;

  -- O operador não tem conta oficial à parte: a dele É esta soma.
  IF v_publico = 'operador' THEN
    v_total    := v_op_total;
    v_total_ho := v_op_ho;
    v_qtd      := v_op_qtd;
  END IF;

  -- ── A meta do mês do alvo, para «% da meta diária» ───────────────────────
  SELECT m.meta_valor INTO v_meta_mes
    FROM public.metas m
   WHERE m.empresa_id    = ANY (v_empresas)
     AND m.tipo          = v_publico
     AND m.referencia_id = v_alvo
     AND m.mes           = EXTRACT(MONTH FROM v_dia)::INT
     AND m.ano           = EXTRACT(YEAR  FROM v_dia)::INT
     AND m.meta_valor    > 0
   LIMIT 1;

  SELECT jsonb_build_object(
           'feriados',         COALESCE(c.feriados, '[]'::JSONB),
           'contar_dia_atual', COALESCE(c.contar_dia_atual, FALSE))
    INTO v_config_mes
    FROM public.metas_config_mes c
   WHERE c.empresa_id = v_d.empresa_id
     AND c.mes        = EXTRACT(MONTH FROM v_dia)::INT
     AND c.ano        = EXTRACT(YEAR  FROM v_dia)::INT
   LIMIT 1;

  RETURN jsonb_build_object(
    'suportado',      TRUE,
    'regra_setor',    COALESCE(v_regra, 'nosso_produto'),
    'publico',        v_publico,
    'alvo_id',        v_alvo,
    'dia',            v_dia,
    'hora_inicio',    v_h_ini,
    'hora_fim',       v_h_fim,
    'chegada_de',     v_de,
    'chegada_ate',    v_ate,
    'total',          COALESCE(v_total, 0),
    'total_ho',       COALESCE(v_total_ho, 0),
    'qtd',            COALESCE(v_qtd, 0),
    'contribuintes',  COALESCE(v_contrib, '[]'::JSONB),
    'contribuicao_receptivo', jsonb_build_object('total', COALESCE(v_rec_total, 0), 'qtd', COALESCE(v_rec_qtd, 0)),
    'sem_operador',   jsonb_build_object('total', COALESCE(v_orf_total, 0), 'qtd', COALESCE(v_orf_qtd, 0)),
    'ultima_chegada', v_ultima,
    'meta_mes',       v_meta_mes,
    'config_mes',     COALESCE(v_config_mes,
                        jsonb_build_object('feriados', '[]'::JSONB, 'contar_dia_atual', FALSE)),
    'participo',      COALESCE(v_participo, FALSE),
    'acompanho',      COALESCE(v_d.criado_por = v_uid, FALSE),
    'agora',          now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_desafio_diario(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_diario(UUID) TO authenticated;
-- CREATE OR REPLACE refaz o proconfig com o que está no corpo (só o
-- search_path): o limite de tempo de 20261019140000 precisa voltar.
ALTER FUNCTION public.fn_desafio_diario(UUID) SET statement_timeout = '15s';

COMMENT ON FUNCTION public.fn_desafio_diario(UUID) IS
  'Placar do desafio do dia (regra->diario): total pela conta do Painel do Lider '
  '(setor, equipe ou operador), janela de chegada por importado_em, quem fez '
  'entrar, a Contribuicao do Receptivo e o sem operador do setor a parte, meta do '
  'mes do alvo e se quem chama participa. Os tres portoes de fn_desafio_dados. '
  'Cofen: suportado=false. 20261019140000, 20261019180000.';

DO $prova$
BEGIN
  IF pg_get_functiondef('public.fn_desafio_diario(uuid)'::regprocedure) NOT LIKE '%contribuicao_receptivo%' THEN
    RAISE EXCEPTION 'fn_desafio_diario não foi trocada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                  WHERE oid = 'public.fn_desafio_diario(uuid)'::regprocedure
                    AND 'statement_timeout=15s' = ANY (proconfig)) THEN
    RAISE EXCEPTION 'fn_desafio_diario ficou sem o statement_timeout.';
  END IF;
END
$prova$;

COMMIT;
