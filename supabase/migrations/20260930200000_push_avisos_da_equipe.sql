-- ============================================================================
-- Avisos da EQUIPE no celular — L2 da liderança (30/09/2026)
-- ============================================================================
--
-- Spec: docs/superpowers/specs/2026-09-30-mobile-lideranca-design.md §3.
--
-- Dois avisos novos, os dois para quem tem aparelho inscrito:
--
--   1. «🎯 Equipe X bateu a meta!» — uma vez por equipe por mês, ao chegar a
--      100% da meta do mês. Para os líderes e para a equipe toda (decisões 11 e
--      12). Sem valores no texto.
--
--   2. RESUMO POR HORA do recebido da equipe — pedido de 30/09/2026: «o líder
--      recebe notificação de quanto a equipe dele recebeu por horário; o elite,
--      que tem as duas visões, escolhe se quer». De hora em hora, só se entrou
--      pagamento: «+R$ 3.200 das 14h às 15h · hoje R$ 12.400». A qualquer hora.
--      Líder: ligado por padrão. Elite (e quem mais tiver a visão Equipe):
--      desligado até ligar na tela (`push_preferencias`).
--
-- ## Uma conta só para «quanto a equipe recebeu»
--
-- A conta do Painel do Líder em SQL já existia dentro de
-- `fn_desafio_contexto_equipe` (20260930115849). Ela sai para
-- `fn_recebido_por_equipe(empresas, mês, de, até, com_ajustes)` e o desafio
-- passa a chamá-la — mesmo corpo, com o período e o ajuste manual como
-- parâmetros. O desafio chama com o mês inteiro e SEM ajuste: o resultado dele
-- não muda. O aviso de meta chama COM ajuste, porque o card do Painel soma o
-- ajuste no recebido do operador (`buscarResumoOperadoresAnalitico`) — é o
-- número que o líder vê bater 100%.
--
-- ## Quem lidera: a regra do `lideresDaEquipe`, em SQL
--
-- `fn_push_quem_lidera` = `idsDosLideresPorEquipe` (o explícito manda; o
-- cadastro e os clones de líder são reserva; quem já lidera algo
-- explicitamente não entra pela reserva) + os vínculos explícitos de quem não
-- é `lider` (o elite que lidera) — `equipesQueLidero` invertida.
--
-- ## Detecção por estado
--
--   * meta: «a equipe está em 100% ou mais e ainda não avisou este mês?» —
--     `push_marcos_equipe` único por (equipe, mês). Reimportar não avisa de
--     novo. Ao ligar, grava o marco de quem JÁ passou de 100% no mês.
--   * resumo: o maior total do DIA já avisado fica em `push_resumo_equipe`;
--     a hora só avisa o que passou dele. Limpar e reimportar volta ao mesmo
--     total e não avisa nada.
--
-- ## Quando roda
--
--   * meta: o gatilho da importação marca `push_equipes_verificar` (uma linha
--     por empresa e mês, por comando) e o cron de cada minuto chama a rodada;
--   * resumo: cron próprio, de hora em hora (`push-resumo-equipes`), que só
--     chama a Edge Function se houver alguém com aparelho inscrito.
--
-- Chaves de desligar: `push_config.ativo` (tudo), `avisar_meta_equipe` e
-- `resumo_equipe` (cada aviso).
--
-- Tabelas novas, funções novas; redefinidas `fn_desafio_contexto_equipe`
-- (mesmo resultado), `fn_push_enfileirar` (+ marca de verificação) e
-- `fn_push_disparar` (+ acorda para a marca). Nenhuma linha existente muda.
-- Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

ALTER TABLE public.push_config
  ADD COLUMN IF NOT EXISTS avisar_meta_equipe BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS resumo_equipe      BOOLEAN NOT NULL DEFAULT TRUE;

-- ── O recebido por equipe (a conta do Painel) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_recebido_por_equipe(
  p_empresas    UUID[],
  p_mes         TEXT,
  p_ini         DATE,
  p_fim         DATE,
  p_com_ajustes BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(equipe_id UUID, total NUMERIC, total_ho NUMERIC, qtd BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  -- Vínculo de liderança, e só quando é ÚNICO. Quem lidera três equipes não
  -- tem «a sua equipe»: creditá-lo nas três contaria o mesmo dinheiro três
  -- vezes. Mesma decisão de `equipeUnicaPorLider`.
  lider_unico AS (
    SELECT el.lider_id, MIN(el.equipe_id::TEXT)::UUID AS equipe_id
      FROM public.equipe_lideres el
     WHERE el.empresa_id = ANY (p_empresas)
     GROUP BY el.lider_id
    HAVING COUNT(DISTINCT el.equipe_id) = 1
  ),
  -- BookPlay, set/2026 em diante: a linha só conta no setor onde a pessoa
  -- está. Mesma condição de `fn_analitico_resumo_por_operador`.
  por_setor AS (
    SELECT em.id AS empresa_id
      FROM public.empresas em
     WHERE em.id = ANY (p_empresas)
       AND em.slug = 'bookplay'
       AND p_mes >= '2026-09'
  ),
  -- As linhas do período com operador. `super_admin` fora, como em
  -- `fn_analitico_resumo_por_operador`.
  linhas_op AS (
    SELECT ar.empresa_id, ar.operador_id, ar.setor_id,
           ar.valor_recebido AS valor, COALESCE(ar.total_ho, 0) AS ho
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis p ON p.id = ar.operador_id
     WHERE ar.empresa_id      = ANY (p_empresas)
       AND ar.operador_id    IS NOT NULL
       AND COALESCE(p.perfil, '') <> 'super_admin'
       AND ar.data_pagamento >= p_ini
       AND ar.data_pagamento <= p_fim
  ),
  -- Onde cada pessoa está no mês — a MESMA função do resumo do Painel.
  casa AS (
    SELECT sm.operador_id, sm.setor_id
      FROM por_setor ps
     CROSS JOIN LATERAL public.fn_analitico_setores_no_mes(
             ps.empresa_id, p_mes,
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
     WHERE t.empresa_id     = ANY (p_empresas)
       AND t.mes            = p_mes
       AND t.fantasma_ativo IS TRUE
       AND t.desfeita_em    IS NULL
     ORDER BY t.perfil_id, t.id
  ),
  -- Ajuste manual do mês (competência), só quando pedido: o card do Painel o
  -- soma no recebido do operador (`buscarResumoOperadoresAnalitico`), em H.O.
  -- na PaguePlay. Não é pagamento: não conta em `qtd`.
  ajuste AS (
    SELECT a.operador_id,
           SUM(a.valor)::NUMERIC AS total,
           (SUM(a.valor) * CASE WHEN em.slug = 'pagueplay'
                                THEN public.fn_pp_ho_percentual() ELSE 0 END)::NUMERIC AS total_ho
      FROM public.analitico_ajustes_manuais a
      JOIN public.empresas em ON em.id = a.empresa_id
      LEFT JOIN public.perfis p ON p.id = a.operador_id
     WHERE p_com_ajustes
       AND a.empresa_id     = ANY (p_empresas)
       AND a.operador_id   IS NOT NULL
       AND a.mes_referencia = to_date(p_mes || '-01', 'YYYY-MM-DD')
       AND a.cancelado     IS NOT TRUE
       AND COALESCE(p.perfil, '') <> 'super_admin'
     GROUP BY a.operador_id, em.slug
  ),
  -- O caixa do período por operador, só com as linhas que contam para ele.
  soma AS (
    SELECT x.operador_id,
           SUM(x.total)::NUMERIC    AS total,
           SUM(x.total_ho)::NUMERIC AS total_ho,
           SUM(x.qtd)::BIGINT       AS qtd
      FROM (
        SELECT l.operador_id, SUM(l.valor) AS total, SUM(l.ho) AS total_ho, COUNT(*) AS qtd
          FROM linhas l
         WHERE NOT l.fora
         GROUP BY l.operador_id
        UNION ALL
        SELECT aj.operador_id, aj.total, aj.total_ho, 0
          FROM ajuste aj
      ) x
     GROUP BY x.operador_id
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
     WHERE cl.empresa_id        = ANY (p_empresas)
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
  SELECT pe.equipe_id,
         SUM(pe.total)::NUMERIC    AS total,
         SUM(pe.total_ho)::NUMERIC AS total_ho,
         SUM(pe.qtd)::BIGINT       AS qtd
    FROM por_equipe pe
   GROUP BY pe.equipe_id;
$function$;

REVOKE ALL ON FUNCTION public.fn_recebido_por_equipe(UUID[], TEXT, DATE, DATE, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_recebido_por_equipe(UUID[], TEXT, DATE, DATE, BOOLEAN) IS
  'Recebido por equipe no periodo, pelas regras do Painel do Lider (Desempenho '
  'Equipes): lider unico, clones que contam, fantasma de setor, setor da pessoa '
  'na BookPlay. Bruto e H.O.; ajuste manual so com p_com_ajustes. Usada pelo '
  'desafio (mes, sem ajuste) e pelos avisos da equipe (20260930200000).';

-- ── O desafio passa a chamar a conta extraída ──────────────────────────────
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
  -- A conta saiu para `fn_recebido_por_equipe` (20260930200000), que os avisos
  -- da equipe também usam. O mês inteiro, SEM ajuste manual: o mesmo corpo de
  -- antes, o mesmo resultado.
  SELECT COALESCE(jsonb_object_agg(r.equipe_id, jsonb_build_object(
           'total', r.total, 'total_ho', r.total_ho, 'qtd', r.qtd
         )), '{}'::JSONB)
    INTO v_receb_equipe
    FROM public.fn_recebido_por_equipe(v_empresas, v_mes_txt, v_ini, v_fim, FALSE) r;

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


-- ── Quem lidera cada equipe (a regra do Painel) ─────────────────────────────
-- `idsDosLideresPorEquipe` + o vínculo explícito de quem não é `lider` (o
-- elite que lidera) — ver o cabeçalho. `lider` = quem só lidera
-- (`PERFIS_QUE_SO_LIDERAM`), a mesma fonte que o Painel busca.
CREATE OR REPLACE FUNCTION public.fn_push_quem_lidera(p_empresas UUID[])
RETURNS TABLE(equipe_id UUID, perfil_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  lideres AS (
    SELECT p.id, p.equipe_id
      FROM public.perfis p
     WHERE p.empresa_id = ANY (p_empresas)
       AND p.perfil = 'lider'
  ),
  explicitos AS (
    SELECT DISTINCT el.equipe_id, el.lider_id
      FROM public.equipe_lideres el
     WHERE el.empresa_id = ANY (p_empresas)
       AND el.equipe_id IS NOT NULL
       AND el.lider_id  IS NOT NULL
  ),
  -- Só líderes conhecidos entram pelo explícito na regra do Painel.
  do_explicito AS (
    SELECT e.equipe_id, e.lider_id AS perfil_id
      FROM explicitos e
      JOIN lideres l ON l.id = e.lider_id
  ),
  -- Reserva: cadastro e clones de líder, menos quem já lidera algo explícito.
  da_reserva AS (
    SELECT l.equipe_id, l.id AS perfil_id
      FROM lideres l
     WHERE l.equipe_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM explicitos e WHERE e.lider_id = l.id)
    UNION
    SELECT c.equipe_id, c.operador_id
      FROM public.equipe_operadores_clones c
      JOIN lideres l ON l.id = c.operador_id
     WHERE c.empresa_id = ANY (p_empresas)
       AND c.equipe_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM explicitos e WHERE e.lider_id = c.operador_id)
  )
  -- O explícito sobrescreve a equipe inteira; a reserva só onde não há explícito.
  SELECT d.equipe_id, d.perfil_id FROM do_explicito d
  UNION
  SELECT r.equipe_id, r.perfil_id
    FROM da_reserva r
   WHERE NOT EXISTS (SELECT 1 FROM do_explicito d WHERE d.equipe_id = r.equipe_id)
  UNION
  -- `equipesQueLidero`: quem não é `lider` lidera só pelo vínculo explícito.
  SELECT e.equipe_id, e.lider_id
    FROM explicitos e
   WHERE NOT EXISTS (SELECT 1 FROM lideres l WHERE l.id = e.lider_id);
$function$;

REVOKE ALL ON FUNCTION public.fn_push_quem_lidera(UUID[]) FROM PUBLIC, anon, authenticated;

-- ── Preferência da pessoa: o resumo por hora ────────────────────────────────
-- NULL = o padrão: ligado para quem só lidera (`lider`), desligado para os
-- outros (o elite liga na visão Equipe). Uma linha por pessoa, não por aparelho.
CREATE TABLE IF NOT EXISTS public.push_preferencias (
  perfil_id      UUID        PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  resumo_equipe  BOOLEAN,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.push_preferencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_preferencias FROM anon;

DROP POLICY IF EXISTS push_preferencias_select ON public.push_preferencias;
CREATE POLICY push_preferencias_select
  ON public.push_preferencias FOR SELECT TO authenticated
  USING (perfil_id = (SELECT auth.uid()));

COMMENT ON TABLE public.push_preferencias IS
  'Preferencias de aviso da pessoa. resumo_equipe NULL = padrao (ligado para '
  'lider, desligado para os outros). Gravada so por fn_push_definir_resumo_equipe '
  '(20260930200000).';

CREATE OR REPLACE FUNCTION public.fn_push_resumo_equipe_ligado()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT pr.resumo_equipe FROM public.push_preferencias pr WHERE pr.perfil_id = (SELECT auth.uid())),
    (SELECT p.perfil = 'lider' FROM public.perfis p WHERE p.id = (SELECT auth.uid())),
    FALSE
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_push_definir_resumo_equipe(p_ligado BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eu UUID := (SELECT auth.uid());
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem sessão';
  END IF;
  INSERT INTO public.push_preferencias (perfil_id, resumo_equipe, atualizado_em)
  VALUES (v_eu, p_ligado, now())
  ON CONFLICT (perfil_id) DO UPDATE
     SET resumo_equipe = EXCLUDED.resumo_equipe,
         atualizado_em = EXCLUDED.atualizado_em;
  RETURN p_ligado;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_resumo_equipe_ligado() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_push_definir_resumo_equipe(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_push_resumo_equipe_ligado() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_definir_resumo_equipe(BOOLEAN) TO authenticated;

-- ── Meta da equipe: marcos e marca de verificação ───────────────────────────
CREATE TABLE IF NOT EXISTS public.push_marcos_equipe (
  equipe_id   UUID        NOT NULL,
  mes         TEXT        NOT NULL,
  empresa_id  UUID        NOT NULL,
  batida_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'semente' (já estava em 100% ao ligar) | 'avisado'
  origem      TEXT        NOT NULL DEFAULT 'avisado',
  PRIMARY KEY (equipe_id, mes)
);

CREATE TABLE IF NOT EXISTS public.push_equipes_verificar (
  empresa_id  UUID        NOT NULL,
  mes         TEXT        NOT NULL,
  criada_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, mes)
);

-- ── Resumo por hora: o maior total do dia já avisado ────────────────────────
CREATE TABLE IF NOT EXISTS public.push_resumo_equipe (
  equipe_id   UUID          NOT NULL,
  dia         DATE          NOT NULL,
  pico        NUMERIC(14,2) NOT NULL DEFAULT 0,
  qtd_pico    BIGINT        NOT NULL DEFAULT 0,
  avisado_em  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (equipe_id, dia)
);

ALTER TABLE public.push_marcos_equipe     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_equipes_verificar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_resumo_equipe     ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_marcos_equipe     FROM anon, authenticated;
REVOKE ALL ON public.push_equipes_verificar FROM anon, authenticated;
REVOKE ALL ON public.push_resumo_equipe     FROM anon, authenticated;

COMMENT ON TABLE public.push_marcos_equipe IS
  'Um aviso de meta batida por equipe por mes. Semente ao ligar para quem ja '
  'estava em 100% (20260930200000).';
COMMENT ON TABLE public.push_equipes_verificar IS
  'Marca do gatilho da importacao: conferir a meta das equipes desta empresa '
  'neste mes na proxima rodada (20260930200000).';
COMMENT ON TABLE public.push_resumo_equipe IS
  'Resumo por hora do recebido da equipe: o maior total do dia ja avisado. '
  'Limpar e reimportar volta ao mesmo total e nao avisa (20260930200000).';

-- ── Equipes em 100% ou mais da meta do mês ──────────────────────────────────
-- Na unidade do card do Painel: H.O. na PaguePlay (recebido `total_ho`, meta ×
-- percentual arredondada como `metaNaUnidade`), bruto nas outras. Equipe sem
-- meta (> 0) nunca entra.
CREATE OR REPLACE FUNCTION public.fn_push_equipes_na_meta(p_empresas UUID[], p_mes TEXT)
RETURNS TABLE(equipe_id UUID, empresa_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  ref AS (SELECT to_date(p_mes || '-01', 'YYYY-MM-DD') AS ini),
  receb AS (
    SELECT r.*
      FROM ref, public.fn_recebido_por_equipe(
             p_empresas, p_mes, ref.ini, (ref.ini + INTERVAL '1 month' - INTERVAL '1 day')::DATE, TRUE) r
  ),
  meta AS (
    SELECT DISTINCT ON (m.referencia_id) m.referencia_id AS equipe_id, m.empresa_id, m.meta_valor
      FROM public.metas m, ref
     WHERE m.empresa_id = ANY (p_empresas)
       AND m.tipo       = 'equipe'
       AND m.mes        = EXTRACT(MONTH FROM ref.ini)
       AND m.ano        = EXTRACT(YEAR  FROM ref.ini)
       AND m.meta_valor > 0
     ORDER BY m.referencia_id, m.meta_valor DESC
  )
  SELECT mt.equipe_id, mt.empresa_id
    FROM meta mt
    JOIN receb r ON r.equipe_id = mt.equipe_id
    JOIN public.empresas em ON em.id = mt.empresa_id
   WHERE CASE WHEN em.slug = 'pagueplay'
              THEN r.total_ho >= ROUND(mt.meta_valor * public.fn_pp_ho_percentual(), 2)
              ELSE r.total    >= mt.meta_valor
         END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_equipes_na_meta(UUID[], TEXT) FROM PUBLIC, anon, authenticated;

-- ── Os aparelhos que recebem avisos da equipe ───────────────────────────────
-- Ativo, com aparelho inscrito, da empresa da equipe.
CREATE OR REPLACE FUNCTION public.fn_push_pode_receber(p_perfil UUID, p_empresa UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.perfis p
     WHERE p.id = p_perfil
       AND p.empresa_id = p_empresa
       AND p.ativo IS NOT FALSE
       AND COALESCE(p.situacao, 'ativo') = 'ativo'
       AND p.arquivado IS NOT TRUE
       AND EXISTS (SELECT 1 FROM public.push_inscricoes i WHERE i.perfil_id = p.id)
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_push_pode_receber(UUID, UUID) FROM PUBLIC, anon, authenticated;

/*
 * A rodada da META da equipe. Pega as marcas de verificação, confere as
 * equipes dessas empresas no mês corrente, grava os marcos novos e devolve só
 * as equipes que bateram AGORA, com os destinatários:
 *   • lideres: quem lidera (a regra do Painel + o elite que lidera);
 *   • membros: quem trabalha nela e conta no recebimento (cadastro + clones que
 *     contam), menos quem já está em `lideres` (recebe um aviso só).
 * Marca de mês que já passou só é apagada.
 */
CREATE OR REPLACE FUNCTION public.fn_push_metas_equipe_batidas()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mes      TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'YYYY-MM');
  v_empresas UUID[];
  v_saida    JSONB;
BEGIN
  WITH pegas AS (
    DELETE FROM public.push_equipes_verificar RETURNING empresa_id, mes
  )
  SELECT ARRAY(SELECT DISTINCT p.empresa_id FROM pegas p WHERE p.mes = v_mes)
    INTO v_empresas;

  IF COALESCE(array_length(v_empresas, 1), 0) = 0
     OR NOT EXISTS (SELECT 1 FROM public.push_config c WHERE c.ativo AND c.avisar_meta_equipe) THEN
    RETURN '[]'::JSONB;
  END IF;

  WITH
  novas AS (
    INSERT INTO public.push_marcos_equipe (equipe_id, mes, empresa_id, origem)
    SELECT n.equipe_id, v_mes, n.empresa_id, 'avisado'
      FROM public.fn_push_equipes_na_meta(v_empresas, v_mes) n
    ON CONFLICT (equipe_id, mes) DO NOTHING
    RETURNING equipe_id, empresa_id
  ),
  lidera AS (
    SELECT q.equipe_id, q.perfil_id
      FROM public.fn_push_quem_lidera(v_empresas) q
      JOIN novas n ON n.equipe_id = q.equipe_id
     WHERE public.fn_push_pode_receber(q.perfil_id, n.empresa_id)
  ),
  membros AS (
    SELECT x.equipe_id, x.perfil_id
      FROM (
        SELECT p.equipe_id, p.id AS perfil_id
          FROM public.perfis p
          JOIN novas n ON n.equipe_id = p.equipe_id
         WHERE p.perfil IN ('operador', 'elite')
        UNION
        SELECT cl.equipe_id, cl.operador_id
          FROM public.equipe_operadores_clones cl
          JOIN novas n ON n.equipe_id = cl.equipe_id
         WHERE cl.conta_recebimento IS TRUE
      ) x
      JOIN novas n ON n.equipe_id = x.equipe_id
     WHERE public.fn_push_pode_receber(x.perfil_id, n.empresa_id)
       AND NOT EXISTS (SELECT 1 FROM lidera l
                        WHERE l.equipe_id = x.equipe_id AND l.perfil_id = x.perfil_id)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'equipe_id',   n.equipe_id,
           'equipe_nome', e.nome,
           'mes',         v_mes,
           'lideres', COALESCE((SELECT jsonb_agg(l.perfil_id) FROM lidera l WHERE l.equipe_id = n.equipe_id), '[]'::JSONB),
           'membros', COALESCE((SELECT jsonb_agg(m.perfil_id) FROM membros m WHERE m.equipe_id = n.equipe_id), '[]'::JSONB)
         )), '[]'::JSONB)
    INTO v_saida
    FROM novas n
    JOIN public.equipes e ON e.id = n.equipe_id;

  RETURN v_saida;
END;
$function$;

/*
 * Quem recebe o RESUMO POR HORA de cada equipe:
 *   • quem lidera a equipe (`fn_push_quem_lidera`);
 *   • quem trabalha nela e conta no recebimento (cadastro + clones que contam)
 *     — é a visão Equipe do elite;
 * com a chave `ver_painel_lider` (a mesma da rota `/m/equipe`), ativo, com
 * aparelho, e com a preferência ligada (padrão: só `lider`).
 */
CREATE OR REPLACE FUNCTION public.fn_push_destinatarios_resumo()
RETURNS TABLE(equipe_id UUID, empresa_id UUID, perfil_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  com_aparelho AS (
    SELECT DISTINCT i.perfil_id FROM public.push_inscricoes i
  ),
  empresas AS (
    SELECT ARRAY(SELECT DISTINCT p.empresa_id
                   FROM public.perfis p JOIN com_aparelho c ON c.perfil_id = p.id
                  WHERE p.empresa_id IS NOT NULL) AS ids
  ),
  candidatos AS (
    SELECT q.equipe_id, q.perfil_id
      FROM empresas
      CROSS JOIN LATERAL public.fn_push_quem_lidera(empresas.ids) q
      JOIN com_aparelho c ON c.perfil_id = q.perfil_id
    UNION
    SELECT p.equipe_id, p.id
      FROM public.perfis p
      JOIN com_aparelho c ON c.perfil_id = p.id
     WHERE p.equipe_id IS NOT NULL
       AND p.perfil IN ('operador', 'elite')
    UNION
    SELECT cl.equipe_id, cl.operador_id
      FROM public.equipe_operadores_clones cl
      JOIN com_aparelho c ON c.perfil_id = cl.operador_id
     WHERE cl.conta_recebimento IS TRUE
  )
  SELECT ca.equipe_id, e.empresa_id, ca.perfil_id
    FROM candidatos ca
    JOIN public.equipes e ON e.id = ca.equipe_id
    JOIN public.perfis  p ON p.id = ca.perfil_id
    LEFT JOIN public.push_preferencias pr ON pr.perfil_id = p.id
   WHERE COALESCE(pr.resumo_equipe, p.perfil = 'lider')
     AND public.fn_push_pode_receber(p.id, e.empresa_id)
     AND public.fn_perfil_tem(p.id, 'ver_painel_lider');
$function$;

REVOKE ALL ON FUNCTION public.fn_push_destinatarios_resumo() FROM PUBLIC, anon, authenticated;

/*
 * A rodada do RESUMO POR HORA. Para cada equipe com destinatário: o recebido
 * de HOJE (São Paulo, bruto — como a aba Hoje); se passou do maior total já
 * avisado no dia, avisa a diferença e guarda o novo pico. Se caiu (pagamento
 * saiu, limpeza no meio da reimportação), não avisa e mantém o pico — assim a
 * reimportação não avisa de novo o que já tinha sido avisado.
 */
CREATE OR REPLACE FUNCTION public.fn_push_resumo_equipes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje     DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_mes      TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'YYYY-MM');
  v_dest     JSONB;
  v_empresas UUID[];
  v_saida    JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.push_config c WHERE c.ativo AND c.resumo_equipe) THEN
    RETURN '[]'::JSONB;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'equipe_id', d.equipe_id, 'empresa_id', d.empresa_id, 'perfil_id', d.perfil_id)), '[]'::JSONB)
    INTO v_dest
    FROM public.fn_push_destinatarios_resumo() d;

  SELECT ARRAY(SELECT DISTINCT (x->>'empresa_id')::UUID FROM jsonb_array_elements(v_dest) x)
    INTO v_empresas;
  IF COALESCE(array_length(v_empresas, 1), 0) = 0 THEN
    RETURN '[]'::JSONB;
  END IF;

  WITH
  equipes_dest AS (
    SELECT DISTINCT (x->>'equipe_id')::UUID AS equipe_id FROM jsonb_array_elements(v_dest) x
  ),
  receb AS (
    SELECT r.equipe_id, r.total, r.qtd
      FROM public.fn_recebido_por_equipe(v_empresas, v_mes, v_hoje, v_hoje, FALSE) r
      JOIN equipes_dest ed ON ed.equipe_id = r.equipe_id
  ),
  subiu AS (
    SELECT r.equipe_id, ROUND(r.total, 2) AS total, r.qtd,
           COALESCE(a.pico, 0) AS pico, COALESCE(a.qtd_pico, 0) AS qtd_pico,
           a.avisado_em AS desde
      FROM receb r
      LEFT JOIN public.push_resumo_equipe a ON a.equipe_id = r.equipe_id AND a.dia = v_hoje
     WHERE ROUND(r.total, 2) > COALESCE(a.pico, 0)
  ),
  grava AS (
    INSERT INTO public.push_resumo_equipe (equipe_id, dia, pico, qtd_pico, avisado_em)
    SELECT s.equipe_id, v_hoje, s.total, GREATEST(s.qtd, s.qtd_pico), now()
      FROM subiu s
    ON CONFLICT (equipe_id, dia) DO UPDATE
       SET pico       = EXCLUDED.pico,
           qtd_pico   = EXCLUDED.qtd_pico,
           avisado_em = EXCLUDED.avisado_em
    RETURNING equipe_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'equipe_id',   s.equipe_id,
           'equipe_nome', e.nome,
           'dia',         v_hoje,
           'novo',        s.total - s.pico,
           'qtd_novos',   GREATEST(0, s.qtd - s.qtd_pico),
           'hoje',        s.total,
           'desde',       s.desde,
           'ate',         now(),
           'destinatarios', (SELECT jsonb_agg(DISTINCT x->'perfil_id')
                               FROM jsonb_array_elements(v_dest) x
                              WHERE (x->>'equipe_id')::UUID = s.equipe_id)
         )), '[]'::JSONB)
    INTO v_saida
    FROM subiu s
    JOIN public.equipes e ON e.id = s.equipe_id
   WHERE EXISTS (SELECT 1 FROM grava g WHERE g.equipe_id = s.equipe_id);

  RETURN v_saida;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_metas_equipe_batidas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_push_resumo_equipes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_metas_equipe_batidas() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_push_resumo_equipes() TO service_role;

-- ── O gatilho da importação marca a verificação da meta ─────────────────────
-- O mesmo `fn_push_enfileirar` de 20260930124757, com a marca por empresa e
-- mês (uma linha por comando, só com linha do mês corrente). A meta sobe com o
-- pagamento de QUALQUER operador, não só de quem tem aparelho.
CREATE OR REPLACE FUNCTION public.fn_push_enfileirar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_janela INTEGER;
  v_meta   BOOLEAN;
  v_hoje   DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
BEGIN
  SELECT c.janela_dias, c.avisar_meta_equipe INTO v_janela, v_meta
    FROM public.push_config c
   WHERE c.ativo;
  IF v_janela IS NULL THEN
    RETURN NULL;   -- desligado (ou sem configuração)
  END IF;

  IF v_meta THEN
    INSERT INTO public.push_equipes_verificar (empresa_id, mes)
    SELECT DISTINCT n.empresa_id, to_char(v_hoje, 'YYYY-MM')
      FROM novas n
     WHERE n.data_pagamento >= date_trunc('month', v_hoje)::DATE
       AND n.data_pagamento <  (date_trunc('month', v_hoje) + INTERVAL '1 month')::DATE
    ON CONFLICT (empresa_id, mes) DO NOTHING;
  END IF;

  INSERT INTO public.push_fila (
    empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario,
    perfil_id, valor, valor_ho, forma_detalhe, nome_cliente
  )
  SELECT n.empresa_id, n.codigo, n.data_pagamento, n.forma_pagamento, n.operador_usuario,
         n.operador_id, COALESCE(n.valor_recebido, 0), COALESCE(n.total_ho, 0),
         n.forma_detalhe, n.nome_cliente
    FROM novas n
   WHERE n.operador_id IS NOT NULL
     AND n.data_pagamento >= (now() AT TIME ZONE 'America/Sao_Paulo')::DATE - v_janela
     AND EXISTS (SELECT 1 FROM public.push_inscricoes i WHERE i.perfil_id = n.operador_id)
  ON CONFLICT ON CONSTRAINT push_fila_chave_natural DO NOTHING;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- O aviso nunca derruba a importação.
  RAISE WARNING '[push] fila nao gravada: %', SQLERRM;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_enfileirar() FROM PUBLIC, anon, authenticated;

-- ── O cron de cada minuto acorda também para a marca da meta ────────────────
CREATE OR REPLACE FUNCTION public.fn_push_disparar()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.push_config%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.push_config WHERE ativo;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_fila WHERE enviado_em IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.push_saidas
                      WHERE enviado_em IS NULL AND verificar_apos <= now())
     AND NOT EXISTS (SELECT 1 FROM public.push_equipes_verificar) THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_cfg.url_funcao,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-segredo', v_cfg.segredo),
    body    := jsonb_build_object('acao', 'rodada'),
    timeout_milliseconds := 55000
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_disparar() FROM PUBLIC, anon, authenticated;

-- ── O cron de cada hora: o resumo da equipe ─────────────────────────────────
-- Só chama a Edge Function se o resumo estiver ligado e existir aparelho
-- inscrito. Quem recebe e o quê, a própria rodada decide.
CREATE OR REPLACE FUNCTION public.fn_push_resumo_disparar()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.push_config%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.push_config WHERE ativo AND resumo_equipe;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_inscricoes) THEN RETURN; END IF;
  PERFORM net.http_post(
    url     := v_cfg.url_funcao,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-segredo', v_cfg.segredo),
    body    := jsonb_build_object('acao', 'resumo_equipes'),
    timeout_milliseconds := 55000
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_resumo_disparar() FROM PUBLIC, anon, authenticated;

-- ── Semente: quem já passou de 100% no mês corrente não recebe aviso velho ──
INSERT INTO public.push_marcos_equipe (equipe_id, mes, empresa_id, origem)
SELECT n.equipe_id, to_char((now() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'YYYY-MM'), n.empresa_id, 'semente'
  FROM public.fn_push_equipes_na_meta(
         ARRAY(SELECT em.id FROM public.empresas em),
         to_char((now() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'YYYY-MM')) n
ON CONFLICT (equipe_id, mes) DO NOTHING;

-- ── Agendas ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('push-resumo-equipes')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-resumo-equipes');
  PERFORM cron.schedule('push-resumo-equipes', '0 * * * *', 'SELECT public.fn_push_resumo_disparar();');

  PERFORM cron.unschedule('push-faxina-equipes')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-faxina-equipes');
  PERFORM cron.schedule('push-faxina-equipes', '50 3 * * *',
    $sql$DELETE FROM public.push_resumo_equipe WHERE dia < (now() AT TIME ZONE 'America/Sao_Paulo')::DATE - 7;$sql$);
END;
$$;

DO $guarda$
BEGIN
  IF to_regprocedure('public.fn_recebido_por_equipe(uuid[], text, date, date, boolean)') IS NULL
     OR to_regprocedure('public.fn_push_metas_equipe_batidas()') IS NULL
     OR to_regprocedure('public.fn_push_resumo_equipes()') IS NULL THEN
    RAISE EXCEPTION 'funcoes dos avisos da equipe nao foram criadas';
  END IF;
  IF to_regprocedure('public.fn_perfil_tem(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'falta fn_perfil_tem (migration 20260825210000)';
  END IF;
  IF to_regclass('public.push_marcos_equipe') IS NULL
     OR to_regclass('public.push_equipes_verificar') IS NULL
     OR to_regclass('public.push_resumo_equipe') IS NULL
     OR to_regclass('public.push_preferencias') IS NULL THEN
    RAISE EXCEPTION 'tabelas dos avisos da equipe nao foram criadas';
  END IF;
  IF has_table_privilege('authenticated', 'public.push_marcos_equipe', 'SELECT')
     OR has_table_privilege('authenticated', 'public.push_resumo_equipe', 'SELECT')
     OR has_table_privilege('anon', 'public.push_preferencias', 'SELECT') THEN
    RAISE EXCEPTION 'tabela dos avisos da equipe ficou legivel pela API';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_push_resumo_equipes()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_recebido_por_equipe(uuid[], text, date, date, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rodada da equipe alcancavel pela API';
  END IF;
END
$guarda$;

COMMIT;
