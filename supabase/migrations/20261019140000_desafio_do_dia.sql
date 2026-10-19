-- ============================================================================
-- Desafio do dia — 19/10/2026
-- ============================================================================
--
-- Pedido do Cleber: a gerência (ex.: Play 1) lança um desafio de UM DIA para o
-- setor, uma equipe ou um operador — valor, quantidade de pagamentos ou % da
-- meta diária —, o dia inteiro ou de um horário a outro. Quem participa vê na
-- barra superior a contagem regressiva e a barra de progresso andando a cada
-- pagamento que entra.
--
-- ## Onde o desafio do dia mora
--
-- Na mesma tabela `desafios`, sem coluna nova: `tipo = 'meta_coletiva'`,
-- `data_inicio = data_fim = o dia`, e a configuração do dia em
-- `regra->'diario'`. Uma linha assim, lida por código que ainda não conhece o
-- campo, é uma meta coletiva de um dia — coerente, e nada quebra.
--
-- ## O número: o mesmo do Painel do Líder
--
-- O total do desafio é a conta do Painel, que já existe em SQL:
--
--   setor    fn_recebido_por_setor  (carimbo da linha; alternativo pela gente)
--   equipe   fn_recebido_por_equipe (líder único, clones, fantasma, setor da
--            pessoa na BookPlay)
--   operador as linhas dele, pela regra do setor da pessoa
--            (`fn_analitico_setores_no_mes`) — a do card do operador
--
-- Analítico = relatório 58 (importação do dia) + 59 (o robô que reconcilia).
--
-- ## A janela de horário
--
-- O analítico não tem hora de PAGAMENTO, só a data. A hora que existe é a de
-- CHEGADA (`importado_em`): o robô do 59 roda no minuto :07 de cada hora e traz
-- o que foi pago até ali. É a convenção do Plantão Elite (20260919100000): o que
-- CHEGOU entre 10:00 e 10:59 foi pago até as 10h e conta na faixa 09h-10h.
--
-- Então o desafio «das 14h às 17h» conta o que chega de 15:00 a 17:59 com
-- `data_pagamento` do dia. O placar fecha com o robô das 17:07; a tela diz isso.
-- Linha alterada depois (valor corrigido no ERP) muda de hora junto — o preço de
-- não haver hora no relatório, o mesmo do Plantão Elite.
--
-- Para isso as duas somas ganham uma versão com janela de chegada
-- (`p_chegada_de`, `p_chegada_ate`). A versão antiga passa a chamar a nova com
-- a janela vazia: continua UMA conta só, e quem a chama (desafio, avisos,
-- resumo do app) recebe exatamente o que recebia — o corpo é letra por letra o
-- de 20261006180729 e 20261006230500, mais as duas linhas da janela. O teste
-- `desafioDoDia.sql.test.ts` confere isso.
--
-- ## Regra Cofen
--
-- Fora desta versão. No setor Cofen o «hoje» do Painel vem do diário (945) e o
-- total do setor da conciliação — outra fonte, sem hora. A função responde
-- `suportado = false` e a tela não deixa criar (CLAUDE.md: regra pelo setor).
--
-- ## Quem vê
--
-- Os MESMOS três portões de `fn_desafio_dados`. E `participo` diz se quem chama
-- está no alvo — é o que decide a barra superior; ver o placar inteiro continua
-- sendo das chaves `desafios_escopo_*`, pela RLS.
--
-- Só funções. Nenhuma linha de dado muda. Reaplicável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. Recebido por equipe, com janela de chegada ───────────────────────────
--
-- Corpo de 20261006180729, com a janela em `linhas_op`.

CREATE OR REPLACE FUNCTION public.fn_recebido_por_equipe(
  p_empresas    UUID[],
  p_mes         TEXT,
  p_ini         DATE,
  p_fim         DATE,
  p_com_ajustes BOOLEAN,
  p_chegada_de  TIMESTAMPTZ,
  p_chegada_ate TIMESTAMPTZ
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
  -- Equipes de setor ALTERNATIVO (06/10/2026): o líder não conta em nenhuma
  -- delas, só no total do setor. Ver o cabeçalho de 20261006190000.
  equipe_alternativa AS (
    SELECT e.id AS equipe_id
      FROM public.equipes e
      JOIN public.setores st ON st.id = e.setor_id
     WHERE e.empresa_id = ANY (p_empresas)
       AND st.alternativo IS TRUE
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
       -- Janela de CHEGADA (desafio do dia, 20261019140000). Nula = sem janela.
       AND (p_chegada_de  IS NULL OR ar.importado_em >= p_chegada_de)
       AND (p_chegada_ate IS NULL OR ar.importado_em <  p_chegada_ate)
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
                  -- No líder, tanto a equipe que lidera quanto o resíduo de
                  -- `perfis.equipe_id` caem quando são de setor alternativo.
                  THEN COALESCE(
                         CASE WHEN lu.equipe_id IN (SELECT equipe_id FROM equipe_alternativa) THEN NULL ELSE lu.equipe_id END,
                         CASE WHEN p.equipe_id  IN (SELECT equipe_id FROM equipe_alternativa) THEN NULL ELSE p.equipe_id END)
                  ELSE COALESCE(
                         p.equipe_id,
                         CASE WHEN lu.equipe_id IN (SELECT equipe_id FROM equipe_alternativa) THEN NULL ELSE lu.equipe_id END)
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

REVOKE ALL ON FUNCTION public.fn_recebido_por_equipe(UUID[], TEXT, DATE, DATE, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_recebido_por_equipe(UUID[], TEXT, DATE, DATE, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Recebido por equipe no periodo, pelas regras do Painel do Lider, com janela '
  'opcional de CHEGADA (importado_em) para o desafio do dia. Nula = sem janela. '
  'Corpo de 20261006180729. 20261019140000.';

-- A versão de cinco argumentos passa a ser a de sete sem janela. Mesma
-- assinatura, mesmo retorno, mesmo dono e mesmas permissões: quem a chama não
-- percebe a troca.
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
  SELECT r.equipe_id, r.total, r.total_ho, r.qtd
    FROM public.fn_recebido_por_equipe(
           p_empresas, p_mes, p_ini, p_fim, p_com_ajustes,
           NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ) r;
$function$;

REVOKE ALL ON FUNCTION public.fn_recebido_por_equipe(UUID[], TEXT, DATE, DATE, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_recebido_por_equipe(UUID[], TEXT, DATE, DATE, BOOLEAN) IS
  'Recebido por equipe no periodo, pelas regras do Painel do Lider (Desempenho '
  'Equipes): lider unico, clones que contam, fantasma de setor, setor da pessoa '
  'na BookPlay. Bruto e H.O.; ajuste manual so com p_com_ajustes. Chama a versao '
  'com janela de chegada vazia (20261019140000).';

-- ── 2. Recebido por setor, com janela de chegada ────────────────────────────
--
-- Corpo de 20261006230500, com a janela em `linhas`.

CREATE OR REPLACE FUNCTION public.fn_recebido_por_setor(
  p_empresas    UUID[],
  p_mes         TEXT,
  p_ini         DATE,
  p_fim         DATE,
  p_chegada_de  TIMESTAMPTZ,
  p_chegada_ate TIMESTAMPTZ
)
RETURNS TABLE(setor_id UUID, total NUMERIC, total_ho NUMERIC, qtd BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  linhas AS (
    SELECT ar.empresa_id, ar.operador_id, ar.setor_id, ar.valor_recebido,
           COALESCE(ar.total_ho, 0) AS ho
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis p ON p.id = ar.operador_id
     WHERE ar.empresa_id      = ANY (p_empresas)
       AND COALESCE(p.perfil, '') <> 'super_admin'
       AND ar.data_pagamento >= p_ini
       AND ar.data_pagamento <= p_fim
       -- Janela de CHEGADA (desafio do dia, 20261019140000). Nula = sem janela.
       AND (p_chegada_de  IS NULL OR ar.importado_em >= p_chegada_de)
       AND (p_chegada_ate IS NULL OR ar.importado_em <  p_chegada_ate)
  ),
  setores_emp AS (
    SELECT st.id, COALESCE(st.alternativo, FALSE) AS alternativo
      FROM public.setores st
     WHERE st.empresa_id = ANY (p_empresas)
  ),
  conta_no_setor AS (
    SELECT p.setor_id, p.id AS operador_id
      FROM public.perfis p
     WHERE p.empresa_id  = ANY (p_empresas)
       AND p.setor_id   IS NOT NULL
    UNION
    SELECT e.setor_id, cl.operador_id
      FROM public.equipe_operadores_clones cl
      JOIN public.equipes e ON e.id = cl.equipe_id
     WHERE cl.empresa_id        = ANY (p_empresas)
       AND cl.conta_recebimento IS TRUE
       AND e.setor_id          IS NOT NULL
  ),
  -- Os setores de cada pessoa no mês (régua de fn_analitico_resumo_por_operador):
  -- só BookPlay, de set/2026 em diante. Fora disso, vazio, e tudo conta.
  casa AS (
    SELECT sm.operador_id, sm.setor_id
      FROM public.empresas em
     CROSS JOIN LATERAL public.fn_analitico_setores_no_mes(
             em.id, p_mes,
             ARRAY(SELECT DISTINCT l.operador_id FROM linhas l
                    WHERE l.empresa_id = em.id AND l.operador_id IS NOT NULL)) sm
     WHERE em.id = ANY (p_empresas)
       AND em.slug = 'bookplay'
       AND p_mes >= '2026-09'
  ),
  receb_setor AS (
    SELECT se.id AS setor_id, l.valor_recebido, l.ho
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND NOT se.alternativo
    UNION ALL
    SELECT c.setor_id, l.valor_recebido, l.ho
      FROM linhas l
      JOIN conta_no_setor c  ON c.operador_id = l.operador_id
      JOIN setores_emp    se ON se.id = c.setor_id AND se.alternativo
     WHERE l.operador_id IS NOT NULL
       AND (l.setor_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM casa h WHERE h.operador_id = l.operador_id)
            OR EXISTS (SELECT 1 FROM casa h
                        WHERE h.operador_id = l.operador_id AND h.setor_id = l.setor_id))
    UNION ALL
    SELECT se.id, l.valor_recebido, l.ho
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND se.alternativo
     WHERE l.operador_id IS NULL
  )
  SELECT r.setor_id,
         SUM(r.valor_recebido)::NUMERIC AS total,
         SUM(r.ho)::NUMERIC             AS total_ho,
         COUNT(*)::BIGINT               AS qtd
    FROM receb_setor r
   GROUP BY r.setor_id;
$function$;

REVOKE ALL ON FUNCTION public.fn_recebido_por_setor(UUID[], TEXT, DATE, DATE, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recebido_por_setor(UUID[], TEXT, DATE, DATE, TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;

COMMENT ON FUNCTION public.fn_recebido_por_setor(UUID[], TEXT, DATE, DATE, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Recebido de cada setor no periodo, com janela opcional de CHEGADA (importado_em) '
  'para o desafio do dia. Nula = sem janela. Corpo de 20261006230500. 20261019140000.';

CREATE OR REPLACE FUNCTION public.fn_recebido_por_setor(
  p_empresas UUID[],
  p_mes      TEXT,
  p_ini      DATE,
  p_fim      DATE
)
RETURNS TABLE(setor_id UUID, total NUMERIC, total_ho NUMERIC, qtd BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.setor_id, r.total, r.total_ho, r.qtd
    FROM public.fn_recebido_por_setor(
           p_empresas, p_mes, p_ini, p_fim,
           NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ) r;
$function$;

COMMENT ON FUNCTION public.fn_recebido_por_setor(UUID[], TEXT, DATE, DATE) IS
  'Recebido de cada setor no periodo: normal pelo carimbo da linha; alternativo pela gente dele, '
  'so no setor da pessoa (BookPlay, set/2026+). A regra do total de setor do desafio '
  '(20261006180000). Interna: so para funcoes SECURITY DEFINER. Chama a versao com '
  'janela de chegada vazia (20261019140000).';

REVOKE ALL ON FUNCTION public.fn_recebido_por_setor(UUID[], TEXT, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recebido_por_setor(UUID[], TEXT, DATE, DATE) TO service_role;

-- ── 3. O placar do desafio do dia ───────────────────────────────────────────

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
ALTER FUNCTION public.fn_desafio_diario(UUID) SET statement_timeout = '15s';

COMMENT ON FUNCTION public.fn_desafio_diario(UUID) IS
  'Placar do desafio do dia (regra->diario): total pela conta do Painel do Lider '
  '(setor, equipe ou operador), janela de chegada por importado_em, quem fez '
  'entrar, meta do mes do alvo e se quem chama participa. Os tres portoes de '
  'fn_desafio_dados. Cofen: suportado=false. 20261019140000.';

COMMIT;
