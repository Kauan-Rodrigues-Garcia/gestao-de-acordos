-- ============================================================================
-- Desafio mede a equipe como o Painel do Líder mede — 30/09/2026
-- ============================================================================
--
-- ## O que estava diferente
--
-- A corrida de projeção de líderes mostrava uma projeção por equipe e o Painel
-- do Líder (Desempenho Equipes) outra. Duas causas:
--
--   1. PaguePlay, H.O. (29/09/2026). O card do Painel lê em H.O.: recebido pela
--      coluna `total_ho` do relatório, meta convertida pelo percentual da aba
--      Metas (`empresas.config.ho_percentual`, 22,60%). O desafio lia em bruto
--      contra a meta bruta. Enquanto o H.O. era 24,96% cravado nos dois lados
--      as duas razões coincidiam; com o H.O. vindo do relatório, não mais.
--
--   2. BookPlay, setor da pessoa (20260929211916). O resumo do Painel passou a
--      contar só as linhas do setor onde a pessoa está, e o fantasma de SETOR
--      deixou de devolver a pessoa inteira para a origem — a origem recebe só as
--      linhas carimbadas no setor de origem. Esta função seguia a regra antiga.
--
-- ## O que muda
--
--   * `recebido_mes_equipe` aplica a regra do setor da pessoa (mesma condição e
--     mesma `fn_analitico_setores_no_mes` do resumo) e o fantasma de setor como
--     `aplicarFantasmas({ setorFicaNoLugar })` + `creditosDeOrigem`;
--   * `recebido_mes_equipe` e `recebido_mes_setor` trazem `total_ho`;
--   * `equipe_empresa` passa a cobrir TODAS as equipes das empresas do desafio
--     (antes só as com meta) — o cliente precisa saber a empresa para decidir
--     se a equipe mede em H.O.;
--   * `empresas_ho` novo: empresa → percentual de H.O., só as que medem em H.O.
--
-- O cliente (`buscarContextoEquipe`) converte para H.O. o que é da PaguePlay.
-- Sem esta migration ele lê como antes, em bruto.
--
-- Só a função. Nenhuma linha de dados muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_desafio_contexto_equipe(p_desafio_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_desafio      public.desafios%ROWTYPE;
  v_empresas     UUID[];
  v_ano          INT;
  v_mes          INT;
  v_ini          DATE;
  v_fim          DATE;
  v_mes_txt      TEXT;
  v_metas        JSONB;
  v_equipe_emp   JSONB;
  v_config       JSONB;
  v_receb_equipe JSONB;
  v_metas_setor  JSONB;
  v_setor_emp    JSONB;
  v_setores_alt  JSONB;
  v_receb_setor  JSONB;
  v_empresas_ho  JSONB;
BEGIN
  SELECT * INTO v_desafio FROM public.desafios WHERE id = p_desafio_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_empresas := public.fn_desafio_empresas(v_desafio.empresa_id, v_desafio.empresas);

  -- ── Os mesmos três portões de fn_desafio_dados ────────────────────────────
  IF NOT public.fn_desafio_alcanca_empresa(v_empresas) THEN
    RETURN NULL;
  END IF;

  IF v_desafio.status = 'rascunho'
     AND NOT public.fn_user_tem('desafios_configurar')
     AND NOT public.fn_user_tem('desafios_configurar_setor') THEN
    RETURN NULL;
  END IF;

  IF NOT public.fn_desafio_no_meu_alcance(
           v_desafio.setor_id, v_desafio.regra, v_desafio.visibilidade) THEN
    RETURN NULL;
  END IF;

  v_ano     := EXTRACT(YEAR  FROM v_desafio.data_fim)::INT;
  v_mes     := EXTRACT(MONTH FROM v_desafio.data_fim)::INT;
  v_ini     := make_date(v_ano, v_mes, 1);
  v_fim     := (v_ini + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_mes_txt := to_char(v_ini, 'YYYY-MM');

  -- Meta mensal por equipe. `meta_valor > 0` porque equipe com meta zero é
  -- equipe sem meta — é assim que o cliente já lia.
  SELECT COALESCE(jsonb_object_agg(m.referencia_id, m.meta_valor), '{}'::JSONB)
    INTO v_metas
    FROM public.metas m
   WHERE m.empresa_id = ANY (v_empresas)
     AND m.tipo       = 'equipe'
     AND m.mes        = v_mes
     AND m.ano        = v_ano
     AND m.meta_valor > 0;

  -- Meta mensal por SETOR, pela mesma régua do `> 0`.
  SELECT COALESCE(jsonb_object_agg(m.referencia_id, m.meta_valor), '{}'::JSONB)
    INTO v_metas_setor
    FROM public.metas m
   WHERE m.empresa_id = ANY (v_empresas)
     AND m.tipo       = 'setor'
     AND m.mes        = v_mes
     AND m.ano        = v_ano
     AND m.meta_valor > 0;

  -- De qual empresa é cada equipe — liga a equipe à régua de dias úteis dela e
  -- diz ao cliente se ela mede em H.O. Todas as equipes, não só as com meta.
  SELECT COALESCE(jsonb_object_agg(e.id, e.empresa_id), '{}'::JSONB)
    INTO v_equipe_emp
    FROM public.equipes e
   WHERE e.empresa_id = ANY (v_empresas);

  -- O mesmo para os setores, e a lista dos alternativos. Aqui não se filtra por
  -- «tem meta»: o cliente precisa saber que o setor é alternativo mesmo quando
  -- ninguém configurou meta para ele — é o que o faz dizer «sem meta» em vez de
  -- cair na média das equipes pelas costas.
  SELECT COALESCE(jsonb_object_agg(st.id, st.empresa_id), '{}'::JSONB),
         COALESCE(jsonb_agg(st.id) FILTER (WHERE st.alternativo IS TRUE), '[]'::JSONB)
    INTO v_setor_emp, v_setores_alt
    FROM public.setores st
   WHERE st.empresa_id = ANY (v_empresas);

  -- Feriados e `contar_dia_atual` de cada empresa do desafio. Empresa sem
  -- linha de config não aparece; o cliente trata a ausência como «sem feriado
  -- e sem contar o dia atual», que é o padrão de `getMetasConfig`.
  SELECT COALESCE(jsonb_object_agg(c.empresa_id, jsonb_build_object(
           'feriados',         COALESCE(c.feriados, '[]'::JSONB),
           'contar_dia_atual', COALESCE(c.contar_dia_atual, FALSE)
         )), '{}'::JSONB)
    INTO v_config
    FROM public.metas_config_mes c
   WHERE c.empresa_id = ANY (v_empresas)
     AND c.mes = v_mes
     AND c.ano = v_ano;

  -- ── O recebido do mês POR EQUIPE ──────────────────────────────────────────
  -- Ver o cabeçalho da 20260909160000: as três regras de Desempenho Equipes.
  -- E, desde 20260930115849, a regra do SETOR DA PESSOA (20260929211916) e o
  -- H.O. — ver o cabeçalho desta migration.
  WITH
  -- Vínculo de liderança, e só quando é ÚNICO. Quem lidera três equipes não
  -- tem «a sua equipe»: creditá-lo nas três contaria o mesmo dinheiro três
  -- vezes. Mesma decisão de `equipeUnicaPorLider`.
  lider_unico AS (
    SELECT el.lider_id, MIN(el.equipe_id::TEXT)::UUID AS equipe_id
      FROM public.equipe_lideres el
     WHERE el.empresa_id = ANY (v_empresas)
     GROUP BY el.lider_id
    HAVING COUNT(DISTINCT el.equipe_id) = 1
  ),
  -- BookPlay, set/2026 em diante: a linha só conta no setor onde a pessoa
  -- está. Mesma condição de `fn_analitico_resumo_por_operador`.
  por_setor AS (
    SELECT em.id AS empresa_id
      FROM public.empresas em
     WHERE em.id = ANY (v_empresas)
       AND em.slug = 'bookplay'
       AND v_mes_txt >= '2026-09'
  ),
  -- As linhas do mês com operador. `super_admin` fora, como em
  -- `fn_analitico_resumo_por_operador`.
  linhas_op AS (
    SELECT ar.empresa_id, ar.operador_id, ar.setor_id,
           ar.valor_recebido AS valor, COALESCE(ar.total_ho, 0) AS ho
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis p ON p.id = ar.operador_id
     WHERE ar.empresa_id      = ANY (v_empresas)
       AND ar.operador_id    IS NOT NULL
       AND COALESCE(p.perfil, '') <> 'super_admin'
       AND ar.data_pagamento >= v_ini
       AND ar.data_pagamento <= v_fim
  ),
  -- Onde cada pessoa está no mês — a MESMA função do resumo do Painel.
  casa AS (
    SELECT sm.operador_id, sm.setor_id
      FROM por_setor ps
     CROSS JOIN LATERAL public.fn_analitico_setores_no_mes(
             ps.empresa_id, v_mes_txt,
             ARRAY(SELECT DISTINCT l.operador_id FROM linhas_op l WHERE l.empresa_id = ps.empresa_id)
           ) sm
  ),
  -- `fora` = linha carimbada num setor onde a pessoa não está. Não conta para
  -- ela; se ela deixou fantasma de SETOR, vai para a equipe de origem abaixo.
  linhas AS (
    SELECT l.*,
           (l.setor_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM por_setor ps WHERE ps.empresa_id = l.empresa_id)
            AND EXISTS (SELECT 1 FROM casa c WHERE c.operador_id = l.operador_id)
            AND NOT EXISTS (SELECT 1 FROM casa c
                             WHERE c.operador_id = l.operador_id AND c.setor_id = l.setor_id)
           ) AS fora
      FROM linhas_op l
  ),
  -- Transferido no mês. Na BookPlay (set/2026+) o fantasma de SETOR deixa a
  -- pessoa onde está — `aplicarFantasmas(..., { setorFicaNoLugar })`; nos
  -- outros casos ela volta inteira para a equipe de ORIGEM, como antes.
  fantasma AS (
    SELECT DISTINCT ON (t.perfil_id)
           t.perfil_id, t.origem_equipe_id, t.origem_setor_id,
           (COALESCE(t.tipo, 'setor') = 'setor'
            AND EXISTS (SELECT 1 FROM por_setor ps WHERE ps.empresa_id = t.empresa_id)
           ) AS fica_no_lugar
      FROM public.perfis_transferencias t
     WHERE t.empresa_id     = ANY (v_empresas)
       AND t.mes            = v_mes_txt
       AND t.fantasma_ativo IS TRUE
       AND t.desfeita_em    IS NULL
     ORDER BY t.perfil_id, t.id
  ),
  -- O caixa do mês por operador, só com as linhas que contam para ele.
  soma AS (
    SELECT l.operador_id,
           SUM(l.valor)::NUMERIC AS total,
           SUM(l.ho)::NUMERIC    AS total_ho,
           COUNT(*)::BIGINT      AS qtd
      FROM linhas l
     WHERE NOT l.fora
     GROUP BY l.operador_id
  ),
  -- A equipe principal de cada um. Arquivado e desativado-à-mão ficam de fora,
  -- como em `buscarComposicaoAnalitica`; o fantasma entra mesmo sem perfil
  -- visível, porque quem mudou de empresa não aparece mais na consulta de lá.
  principal AS (
    SELECT s.operador_id,
           COALESCE(
             CASE WHEN f.fica_no_lugar THEN NULL ELSE f.origem_equipe_id END,
             CASE WHEN p.perfil = 'lider'
                  THEN COALESCE(lu.equipe_id, p.equipe_id)
                  ELSE COALESCE(p.equipe_id, lu.equipe_id)
             END
           ) AS equipe_id
      FROM soma s
      LEFT JOIN public.perfis p  ON p.id       = s.operador_id
      LEFT JOIN lider_unico  lu  ON lu.lider_id = s.operador_id
      LEFT JOIN fantasma     f   ON f.perfil_id = s.operador_id
     WHERE (f.perfil_id IS NOT NULL AND NOT f.fica_no_lugar)
        OR (p.id IS NOT NULL
            AND p.arquivado IS NOT TRUE
            AND NOT (p.ativo IS FALSE
                     AND COALESCE(p.situacao, 'ativo') <> 'desligado'))
  ),
  -- Principal mais as equipes em que a pessoa é clone que conta. `UNION`
  -- deduplica o par, então clone dentro da própria equipe não conta duas vezes.
  vinculos AS (
    SELECT pr.operador_id, pr.equipe_id
      FROM principal pr
     WHERE pr.equipe_id IS NOT NULL
    UNION
    SELECT cl.operador_id, cl.equipe_id
      FROM public.equipe_operadores_clones cl
      JOIN soma s2 ON s2.operador_id = cl.operador_id
     WHERE cl.empresa_id        = ANY (v_empresas)
       AND cl.conta_recebimento IS TRUE
  ),
  -- A equipe de ORIGEM de um fantasma de setor recebe as linhas carimbadas no
  -- setor de origem — `creditosDeOrigem` do Painel.
  credito_origem AS (
    SELECT f.origem_equipe_id AS equipe_id,
           SUM(l.valor)::NUMERIC AS total,
           SUM(l.ho)::NUMERIC    AS total_ho,
           COUNT(*)::BIGINT      AS qtd
      FROM fantasma f
      JOIN linhas l ON l.operador_id = f.perfil_id
                   AND l.fora
                   AND l.setor_id    = f.origem_setor_id
     WHERE f.fica_no_lugar
       AND f.origem_equipe_id IS NOT NULL
     GROUP BY f.origem_equipe_id
  ),
  por_equipe AS (
    SELECT v.equipe_id, s.total, s.total_ho, s.qtd
      FROM vinculos v
      JOIN soma s ON s.operador_id = v.operador_id
    UNION ALL
    SELECT co.equipe_id, co.total, co.total_ho, co.qtd
      FROM credito_origem co
  )
  SELECT COALESCE(jsonb_object_agg(x.equipe_id, jsonb_build_object(
           'total', x.total, 'total_ho', x.total_ho, 'qtd', x.qtd
         )), '{}'::JSONB)
    INTO v_receb_equipe
    FROM (
      SELECT pe.equipe_id,
             SUM(pe.total)::NUMERIC    AS total,
             SUM(pe.total_ho)::NUMERIC AS total_ho,
             SUM(pe.qtd)::BIGINT       AS qtd
        FROM por_equipe pe
       GROUP BY pe.equipe_id
    ) x;

  -- ── O recebido do mês POR SETOR ───────────────────────────────────────────
  -- A régua de `linhaNoEscopo`: carimbo no setor normal, soma dos usuários no
  -- alternativo. Ver o cabeçalho.
  WITH
  setores_emp AS (
    SELECT st.id, COALESCE(st.alternativo, FALSE) AS alternativo
      FROM public.setores st
     WHERE st.empresa_id = ANY (v_empresas)
  ),
  linhas AS (
    SELECT ar.operador_id, ar.setor_id, ar.valor_recebido,
           COALESCE(ar.total_ho, 0) AS ho
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis p ON p.id = ar.operador_id
     WHERE ar.empresa_id      = ANY (v_empresas)
       AND COALESCE(p.perfil, '') <> 'super_admin'
       AND ar.data_pagamento >= v_ini
       AND ar.data_pagamento <= v_fim
  ),
  -- Quem CONTA em cada setor: o cadastro mais os clones com
  -- `conta_recebimento`. É a mesma pergunta de `setoresDoOperador`.
  conta_no_setor AS (
    SELECT p.setor_id, p.id AS operador_id
      FROM public.perfis p
     WHERE p.empresa_id  = ANY (v_empresas)
       AND p.setor_id   IS NOT NULL
    UNION
    SELECT e.setor_id, cl.operador_id
      FROM public.equipe_operadores_clones cl
      JOIN public.equipes e ON e.id = cl.equipe_id
     WHERE cl.empresa_id        = ANY (v_empresas)
       AND cl.conta_recebimento IS TRUE
       AND e.setor_id          IS NOT NULL
  ),
  receb_setor AS (
    -- Setor NORMAL: o carimbo do relatório, inclusive o das órfãs.
    SELECT se.id AS setor_id, l.valor_recebido, l.ho
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND NOT se.alternativo
    UNION ALL
    -- ALTERNATIVO: os usuários que contam nele.
    SELECT c.setor_id, l.valor_recebido, l.ho
      FROM linhas l
      JOIN conta_no_setor c  ON c.operador_id = l.operador_id
      JOIN setores_emp    se ON se.id = c.setor_id AND se.alternativo
     WHERE l.operador_id IS NOT NULL
    UNION ALL
    -- ALTERNATIVO: mais as órfãs carimbadas nele.
    SELECT se.id, l.valor_recebido, l.ho
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND se.alternativo
     WHERE l.operador_id IS NULL
  )
  SELECT COALESCE(jsonb_object_agg(y.setor_id, jsonb_build_object(
           'total', y.total, 'total_ho', y.total_ho, 'qtd', y.qtd
         )), '{}'::JSONB)
    INTO v_receb_setor
    FROM (
      SELECT setor_id,
             SUM(valor_recebido)::NUMERIC AS total,
             SUM(ho)::NUMERIC             AS total_ho,
             COUNT(*)::BIGINT             AS qtd
        FROM receb_setor
       GROUP BY setor_id
    ) y;

  -- Quais empresas do desafio medem em H.O., e com que percentual — o que a aba
  -- Metas configura (`fn_pp_ho_percentual`). O card do Painel converte a meta
  -- com ele; o desafio precisa do mesmo número, mesmo quando quem olha é da
  -- outra empresa.
  SELECT COALESCE(jsonb_object_agg(em.id, public.fn_pp_ho_percentual()), '{}'::JSONB)
    INTO v_empresas_ho
    FROM public.empresas em
   WHERE em.id = ANY (v_empresas)
     AND em.slug = 'pagueplay';

  RETURN jsonb_build_object(
    'mes',                 v_mes,
    'ano',                 v_ano,
    'empresas',            to_jsonb(v_empresas),
    'metas',               v_metas,
    'equipe_empresa',      v_equipe_emp,
    'config',              v_config,
    'recebido_mes_equipe', v_receb_equipe,
    'metas_setor',         v_metas_setor,
    'setor_empresa',       v_setor_emp,
    'setores_alternativos', v_setores_alt,
    'recebido_mes_setor',  v_receb_setor,
    'empresas_ho',         v_empresas_ho
  );
END;
$function$;

-- `anon` não tem o que fazer aqui — ver 20260917180000.
REVOKE ALL ON FUNCTION public.fn_desafio_contexto_equipe(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_contexto_equipe(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_desafio_contexto_equipe(UUID) IS
  'Metas de equipe e de setor, config de dias uteis e recebido do mes (bruto e '
  'H.O.) por equipe e por setor das empresas do desafio, pelas regras de '
  'Desempenho Equipes: lider credita a equipe que lidera, clone com '
  'conta_recebimento tambem a clonada, transferido a de origem - na BookPlay '
  '(set/2026+) a linha so conta no setor onde a pessoa esta e o fantasma de '
  'setor leva a origem so as linhas do setor de origem. empresas_ho diz quem '
  'mede em H.O. Repete os tres portoes de fn_desafio_dados (20260930115849).';

DO $guarda$
BEGIN
  IF to_regprocedure('public.fn_desafio_contexto_equipe(uuid)') IS NULL THEN
    RAISE EXCEPTION 'fn_desafio_contexto_equipe nao foi criada';
  END IF;
  IF to_regprocedure('public.fn_analitico_setores_no_mes(uuid, text, uuid[])') IS NULL THEN
    RAISE EXCEPTION 'falta fn_analitico_setores_no_mes (migration 20260929211916)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public'
       AND routine_name   = 'fn_desafio_contexto_equipe'
       AND grantee        = 'anon'
  ) THEN
    RAISE EXCEPTION 'fn_desafio_contexto_equipe continua alcancavel pelo anon';
  END IF;
END
$guarda$;

COMMIT;
