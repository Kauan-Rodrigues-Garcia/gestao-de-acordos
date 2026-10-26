-- =============================================================================
-- Ajuste de recebimento: por operador, por EQUIPE ou por SETOR — e em todo
-- lugar que mostra recebido.
--
-- ## Pedido (Cleber, 26/10/2026)
--
-- O ajuste (aba Ajuste de recebimento do Painel Líder) é recebimento feito por
-- fora, e tem de contar em TODO total de operador, equipe e setor. A auditoria
-- de 26/10 achou onde ele não chegava:
--
--   Painel Diretoria (59)   visão geral, cidades, dia, setor, equipe, alternativos
--   Painel Diretoria Cofen  fn_diretoria_cofen
--   App / desafios / push   fn_recebido_por_setor (sem ajuste nenhum)
--   Desafio do dia          contribuintes e total do setor
--   TV                      fn_tv_metricas_setor
--
-- E pediu o ajuste para uma EQUIPE (conta na equipe e no setor, em ninguém) e
-- para um SETOR (conta só no setor).
--
-- ## O desenho
--
-- 1. `analitico_ajustes_manuais.alvo` ∈ operador | equipe | setor. O card
--    continua único por alvo e mês. O operador deixa de ser obrigatório.
-- 2. `fn_ajustes_recebimento(empresas, ini, fim[, de, ate])`: a ÚNICA leitura
--    de ajuste das funções. Cada alteração do card (evento, com `delta`) cai no
--    dia em que foi lançada, dentro do mês de competência — o que o líder
--    lançou hoje entra no «hoje», e a soma do mês continua sendo o valor do card.
--    É invocadora: chamada pela tela, a RLS da tabela recorta; chamada de uma
--    função SECURITY DEFINER, enxerga tudo.
-- 3. `private.mestre_recebimentos_com_ajuste`: o 59 mais uma linha por ajuste e
--    dia, na carteira do setor do ajuste, forma «AJUSTE MANUAL». As funções de
--    EXIBIÇÃO do Painel Diretoria passam a ler daqui; as de conferência com o
--    ERP (comparar, divergências, sincronizar) continuam no 59 puro.
-- 4. As funções com regra própria somam o ajuste explicitamente.
--
-- As funções grandes do Painel Diretoria são remendadas na definição VIVA
-- (`pg_temp.remendar`): troca exata, com o número de ocorrências conferido —
-- se o texto mudou desde a conferência de 26/10, a migration inteira falha e
-- nada é aplicado. Preserva corpo, SET e comentários.
-- =============================================================================

-- ── 1. O alvo do ajuste ───────────────────────────────────────────────────────

ALTER TABLE public.analitico_ajustes_manuais
  ADD COLUMN IF NOT EXISTS alvo text NOT NULL DEFAULT 'operador';
ALTER TABLE public.analitico_ajustes_manuais ALTER COLUMN operador_id DROP NOT NULL;

ALTER TABLE public.analitico_ajustes_manuais DROP CONSTRAINT IF EXISTS ajuste_alvo_valido;
ALTER TABLE public.analitico_ajustes_manuais ADD CONSTRAINT ajuste_alvo_valido CHECK (
  alvo IN ('operador', 'equipe', 'setor')
  AND (alvo = 'operador') = (operador_id IS NOT NULL)
  AND (alvo <> 'setor' OR equipe_id IS NULL)
);

-- Um card por alvo e mês (o de operador já existia).
DROP INDEX IF EXISTS public.ux_ajuste_card_por_operador_mes;
CREATE UNIQUE INDEX ux_ajuste_card_por_operador_mes ON public.analitico_ajustes_manuais
  (empresa_id, operador_id, mes_referencia) WHERE NOT cancelado AND alvo = 'operador';
CREATE UNIQUE INDEX IF NOT EXISTS ux_ajuste_card_por_equipe_mes ON public.analitico_ajustes_manuais
  (empresa_id, equipe_id, mes_referencia) WHERE NOT cancelado AND alvo = 'equipe';
CREATE UNIQUE INDEX IF NOT EXISTS ux_ajuste_card_por_setor_mes ON public.analitico_ajustes_manuais
  (empresa_id, setor_id, mes_referencia) WHERE NOT cancelado AND alvo = 'setor';

-- Na criação: equipe exige equipe e herda o setor dela; setor exige setor.
CREATE OR REPLACE FUNCTION public.fn_ajuste_alvo_preencher()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.alvo = 'equipe' THEN
    IF NEW.equipe_id IS NULL THEN RAISE EXCEPTION 'ajuste_alvo: escolha a equipe.'; END IF;
    NEW.operador_id := NULL;
    SELECT e.setor_id INTO NEW.setor_id FROM public.equipes e WHERE e.id = NEW.equipe_id;
  ELSIF NEW.alvo = 'setor' THEN
    IF NEW.setor_id IS NULL THEN RAISE EXCEPTION 'ajuste_alvo: escolha o setor.'; END IF;
    NEW.operador_id := NULL;
    NEW.equipe_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ajuste_alvo_preencher ON public.analitico_ajustes_manuais;
CREATE TRIGGER trg_ajuste_alvo_preencher BEFORE INSERT ON public.analitico_ajustes_manuais
  FOR EACH ROW EXECUTE FUNCTION public.fn_ajuste_alvo_preencher();

-- ── 2. Quem enxerga e lança cada alvo ─────────────────────────────────────────

-- Operador: a regra de sempre (`fn_ajuste_no_meu_alcance`). Equipe e setor:
-- quem administra, ou quem lança e é do setor (ou lidera/está na equipe).
CREATE OR REPLACE FUNCTION public.fn_ajuste_alvo_no_meu_alcance(
  p_alvo text, p_operador uuid, p_equipe uuid, p_setor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE COALESCE(p_alvo, 'operador')
    WHEN 'operador' THEN public.fn_ajuste_no_meu_alcance(p_operador)
    ELSE public.fn_user_tem('ajuste_recebimento_administrar')
      OR (public.fn_user_tem('ajuste_recebimento_lancar') AND (
            (p_setor IS NOT NULL AND public.fn_user_setor_id() = p_setor)
         OR (p_equipe IS NOT NULL AND (
                p_equipe = ANY (public.fn_user_equipes())
             OR EXISTS (SELECT 1 FROM public.equipe_lideres el
                         WHERE el.equipe_id = p_equipe AND el.lider_id = auth.uid())))))
  END;
$$;
REVOKE ALL ON FUNCTION public.fn_ajuste_alvo_no_meu_alcance(text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ajuste_alvo_no_meu_alcance(text, uuid, uuid, uuid) TO authenticated;

-- As mesmas policies de antes, com o alcance pelo alvo.
DROP POLICY IF EXISTS ajustes_select ON public.analitico_ajustes_manuais;
CREATE POLICY ajustes_select ON public.analitico_ajustes_manuais FOR SELECT TO authenticated
  USING (((empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])) OR (SELECT public.fn_user_is_super_admin()))
         AND public.fn_ajuste_alvo_no_meu_alcance(alvo, operador_id, equipe_id, setor_id));

DROP POLICY IF EXISTS ajustes_insert ON public.analitico_ajustes_manuais;
CREATE POLICY ajustes_insert ON public.analitico_ajustes_manuais FOR INSERT TO authenticated
  WITH CHECK (((empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])) OR (SELECT public.fn_user_is_super_admin()))
              AND ((SELECT public.fn_user_tem('ajuste_recebimento_lancar')) OR (SELECT public.fn_user_tem('ajuste_recebimento_administrar')))
              AND public.fn_ajuste_alvo_no_meu_alcance(alvo, operador_id, equipe_id, setor_id)
              AND (criado_por = (SELECT auth.uid())));

DROP POLICY IF EXISTS ajustes_update ON public.analitico_ajustes_manuais;
CREATE POLICY ajustes_update ON public.analitico_ajustes_manuais FOR UPDATE TO authenticated
  USING (((empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])) OR (SELECT public.fn_user_is_super_admin()))
         AND ((SELECT public.fn_user_tem('ajuste_recebimento_lancar')) OR (SELECT public.fn_user_tem('ajuste_recebimento_administrar')))
         AND public.fn_ajuste_alvo_no_meu_alcance(alvo, operador_id, equipe_id, setor_id))
  WITH CHECK (((empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])) OR (SELECT public.fn_user_is_super_admin()))
              AND public.fn_ajuste_alvo_no_meu_alcance(alvo, operador_id, equipe_id, setor_id));

DROP POLICY IF EXISTS ajustes_eventos_select ON public.analitico_ajustes_eventos;
CREATE POLICY ajustes_eventos_select ON public.analitico_ajustes_eventos FOR SELECT TO authenticated
  USING (((empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])) OR (SELECT public.fn_user_is_super_admin()))
         AND EXISTS (SELECT 1 FROM public.analitico_ajustes_manuais a
                      WHERE a.id = analitico_ajustes_eventos.ajuste_id
                        AND public.fn_ajuste_alvo_no_meu_alcance(a.alvo, a.operador_id, a.equipe_id, a.setor_id)));

-- ── 3. A leitura única do ajuste ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ajustes_recebimento(
  p_empresas uuid[], p_ini date, p_fim date,
  p_de timestamptz DEFAULT NULL, p_ate timestamptz DEFAULT NULL)
RETURNS TABLE(empresa_id uuid, alvo text, operador_id uuid, equipe_id uuid, setor_id uuid,
              dia date, valor numeric, valor_ho numeric)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH aj AS (
    SELECT a.id, a.empresa_id, a.alvo, a.operador_id, a.equipe_id,
           -- Setor carimbado no lançamento; o da equipe ou o da pessoa de reserva.
           COALESCE(a.setor_id, eq.setor_id, pf.setor_id) AS setor_id,
           a.valor, a.cancelado,
           a.mes_referencia AS m_ini,
           (a.mes_referencia + INTERVAL '1 month' - INTERVAL '1 day')::date AS m_fim
      FROM public.analitico_ajustes_manuais a
      LEFT JOIN public.equipes eq ON eq.id = a.equipe_id
      LEFT JOIN public.perfis  pf ON pf.id = a.operador_id
     WHERE a.empresa_id = ANY (p_empresas)
       AND a.mes_referencia <= p_fim
       AND a.mes_referencia + INTERVAL '1 month' > p_ini
       AND COALESCE(pf.perfil, '') <> 'super_admin'
  ),
  -- Cada alteração do card no dia em que foi feita, preso ao mês de competência.
  ev AS (
    SELECT e.ajuste_id,
           LEAST(GREATEST((e.criado_em AT TIME ZONE 'America/Sao_Paulo')::date, aj.m_ini), aj.m_fim) AS dia,
           e.criado_em, e.delta
      FROM public.analitico_ajustes_eventos e
      JOIN aj ON aj.id = e.ajuste_id
  ),
  -- O que os eventos não explicam (card anterior ao histórico) fica no dia 1.
  residuo AS (
    SELECT aj.id AS ajuste_id, aj.m_ini AS dia, NULL::timestamptz AS criado_em,
           (CASE WHEN aj.cancelado THEN 0 ELSE aj.valor END)
             - COALESCE((SELECT SUM(ev.delta) FROM ev WHERE ev.ajuste_id = aj.id), 0) AS delta
      FROM aj
  ),
  partes AS (
    SELECT * FROM ev
    UNION ALL
    SELECT * FROM residuo WHERE delta <> 0
  )
  SELECT aj.empresa_id, aj.alvo, aj.operador_id, aj.equipe_id, aj.setor_id, p.dia,
         SUM(p.delta)::numeric,
         -- H.O. pela regra do setor (Cofen), não pela marca.
         ROUND(SUM(p.delta) * CASE WHEN st.regra = 'cofen' THEN public.fn_pp_ho_percentual() ELSE 0 END, 2)::numeric
    FROM partes p
    JOIN aj ON aj.id = p.ajuste_id
    LEFT JOIN public.setores st ON st.id = aj.setor_id
   WHERE p.dia BETWEEN p_ini AND p_fim
     -- Janela de chegada (desafio com horário): só o que foi lançado nela.
     AND (p_de  IS NULL OR (p.criado_em IS NOT NULL AND p.criado_em >= p_de))
     AND (p_ate IS NULL OR (p.criado_em IS NOT NULL AND p.criado_em <  p_ate))
   GROUP BY aj.empresa_id, aj.alvo, aj.operador_id, aj.equipe_id, aj.setor_id, p.dia, st.regra
  HAVING SUM(p.delta) <> 0;
$$;
REVOKE ALL ON FUNCTION public.fn_ajustes_recebimento(uuid[], date, date, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ajustes_recebimento(uuid[], date, date, timestamptz, timestamptz) TO authenticated;

-- ── 4. O 59 com o ajuste, para as telas do Painel Diretoria ──────────────────
--
-- Uma linha por ajuste e dia, no lote VIGENTE do mês, na carteira do setor do
-- ajuste (a que tem a equipe dele mapeada, se houver). Setor sem carteira
-- vinculada recebe a carteira «AJUSTE»: entra no total da empresa e aparece
-- como carteira sem vínculo. `colchao = false`: conta na meta.
CREATE OR REPLACE VIEW private.mestre_recebimentos_com_ajuste AS
SELECT r.id, r.lote_id, r.empresa_id, r.mes, r.setor, r.cod_grupo_filtro, r.nome_grupo_filtro, r.cod_grupo,
       r.cod_grupo_representa, r.setor_orig, r.cobradora, r.operador_orig, r.subgrupo_equipe, r.cliente, r.cod_cli,
       r.titulo, r.nr_documento, r.parcela, r.empresa_erp, r.tipo_venda, r.tp_doc, r.colchao, r.tipo, r.dt_lig,
       r.prev_pgto, r.dt_pgto, r.dias, r.dias_atraso, r.dias_ligacao_baixa, r.recebido, r.linha_num,
       r.operador_id, r.operador_setor_id
  FROM public.mestre_recebimentos r
UNION ALL
SELECT -1 - (hashtextextended(l.id::text || x.alvo || COALESCE(x.operador_id, x.equipe_id, x.setor_id)::text || x.dia::text, 0)
             & 9223372036854775807),
       l.id, l.empresa_id, l.mes, '', c.cod, c.nome, '', NULL, NULL,
       COALESCE(pf.usuario, ''), NULL, COALESCE(c.subgrupo, ''), 'AJUSTE DE RECEBIMENTO', '', '', '', '', '', NULL,
       'AJUSTE MANUAL', false, '', NULL, NULL, x.dia, NULL, NULL, NULL, x.valor, 0,
       x.operador_id, x.setor_id
  FROM public.mestre_lotes l
 CROSS JOIN LATERAL public.fn_ajustes_recebimento(
         ARRAY[l.empresa_id], l.mes, (l.mes + INTERVAL '1 month' - INTERVAL '1 day')::date) x
  LEFT JOIN public.perfis pf ON pf.id = x.operador_id
 CROSS JOIN LATERAL (
   SELECT COALESCE(g.cod_grupo_filtro, 'AJUSTE') AS cod,
          COALESCE(g.nome_grupo_filtro, 'AJUSTE DE RECEBIMENTO') AS nome,
          me.nome_subgrupo AS subgrupo
     FROM (SELECT 1) um
     LEFT JOIN LATERAL (
       SELECT g.cod_grupo_filtro, g.nome_grupo_filtro
         FROM public.mestre_grupos g
        WHERE g.empresa_id = l.empresa_id AND g.estado = 'vinculado' AND g.setor_id = x.setor_id
        ORDER BY EXISTS (SELECT 1 FROM public.mestre_equipes e2
                          WHERE e2.empresa_id = g.empresa_id AND e2.cod_grupo_filtro = g.cod_grupo_filtro
                            AND e2.equipe_id = x.equipe_id) DESC,
                 g.cod_grupo_filtro
        LIMIT 1) g ON true
     LEFT JOIN LATERAL (
       SELECT e.nome_subgrupo
         FROM public.mestre_equipes e
        WHERE e.empresa_id = l.empresa_id AND e.cod_grupo_filtro = g.cod_grupo_filtro
          AND e.equipe_id = x.equipe_id
        ORDER BY e.ultima_aparicao DESC NULLS LAST
        LIMIT 1) me ON true
 ) c
 WHERE l.estado = 'vigente';
REVOKE ALL ON private.mestre_recebimentos_com_ajuste FROM PUBLIC, anon, authenticated;

-- ── 5. Remendos na definição viva ─────────────────────────────────────────────

CREATE FUNCTION pg_temp.remendar(p_fn regprocedure, p_re text, p_por text, p_vezes integer)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text; n integer;
BEGIN
  d := pg_get_functiondef(p_fn);
  SELECT count(*) INTO n FROM regexp_matches(d, p_re, 'g');
  IF n <> p_vezes THEN
    RAISE EXCEPTION 'Remendo em %: esperava % ocorrência(s) de «%», achou %. Nada foi aplicado.',
      p_fn, p_vezes, left(p_re, 80), n;
  END IF;
  EXECUTE regexp_replace(d, p_re, p_por, 'g');
END;
$$;

-- 5a. Painel Diretoria (59): as telas leem o 59 com o ajuste.
SELECT pg_temp.remendar(f::regprocedure, '\m(from|FROM)(\s+)mestre_recebimentos(\s+)r\M',
                        '\1\2private.mestre_recebimentos_com_ajuste\3r', n)
  FROM (VALUES
    ('public.fn_mestre_diretoria_visao_geral(uuid,text,integer)', 2),
    ('public.fn_mestre_diretoria_cidades(uuid,text,integer)', 2),
    ('public.fn_mestre_diretoria_dia(uuid,text,integer,text,integer)', 3),
    ('public.fn_mestre_diretoria_linhas(uuid,text,integer)', 2),
    ('public.fn_mestre_diretoria_setor(uuid,text,uuid,text,integer)', 2),
    ('public.fn_mestre_diretoria_equipe_operadores(uuid,text,uuid,text,text,integer)', 1),
    ('public.fn_mestre_diretoria_alternativos(uuid,text,integer)', 2)
  ) v(f, n);

-- 5b. Setor alternativo: o ajuste de equipe/setor dele (o de pessoa já entra
-- pela linha da pessoa, acima).
SELECT pg_temp.remendar('public.fn_mestre_diretoria_alternativos(uuid,text,integer)'::regprocedure,
  '''valor'',\s+coalesce\(s\.valor,\s+0\),',
  '''valor'', coalesce(s.valor, 0) + coalesce(ax.valor, 0),', 1);
SELECT pg_temp.remendar('public.fn_mestre_diretoria_alternativos(uuid,text,integer)'::regprocedure,
  'LEFT JOIN soma_ant sa ON sa\.setor_id = a\.id;',
  'LEFT JOIN soma_ant sa ON sa.setor_id = a.id
    LEFT JOIN LATERAL (
      SELECT sum(x.valor)::numeric(14,2) AS valor
        FROM public.fn_ajustes_recebimento(ARRAY[p_empresa_id], v_mes,
               (v_mes + CASE WHEN p_dia_corte IS NULL THEN v_ult_dia ELSE v_corte END - 1)) x
       WHERE x.alvo <> ''operador'' AND x.setor_id = a.id) ax ON true;', 1);

-- 5c. Painel Diretoria Cofen: o ajuste do setor Cofen no total (em centavos,
-- como a conciliação), e o de cada operador na lista.
SELECT pg_temp.remendar('public.fn_diretoria_cofen(uuid,text,integer)'::regprocedure,
  '(AND extract\(day FROM r\.data\) <= v_corte)(\s*\),\s*conc_ant AS)',
  '\1
      UNION ALL
      SELECT extract(day FROM x.dia)::INTEGER, ''AJUSTE MANUAL'', round(x.valor * 100), round(x.valor_ho * 100), 0, 0
        FROM public.fn_ajustes_recebimento(ARRAY[v_pp], v_mes, (v_mes + v_corte - 1)) x
       WHERE x.setor_id = v_setor\2', 1);
SELECT pg_temp.remendar('public.fn_diretoria_cofen(uuid,text,integer)'::regprocedure,
  '(AND r\.data >= v_mes_ant\s+AND r\.data < v_mes)(\s*\),\s*ana AS)',
  '\1
      UNION ALL
      SELECT extract(day FROM x.dia)::INTEGER, round(x.valor * 100), round(x.valor_ho * 100)
        FROM public.fn_ajustes_recebimento(ARRAY[v_pp], v_mes_ant::date, (v_mes - 1)) x
       WHERE x.setor_id = v_setor\2', 1);
SELECT pg_temp.remendar('public.fn_diretoria_cofen(uuid,text,integer)'::regprocedure,
  '(AND coalesce\(p\.perfil, ''''\) <> ''super_admin'')(\s*\),\s*-- O nome do m)',
  '\1
      UNION ALL
      SELECT x.operador_id, extract(day FROM x.dia)::INTEGER, x.valor, x.valor_ho
        FROM public.fn_ajustes_recebimento(ARRAY[v_pp], v_mes, (v_mes + v_corte - 1)) x
       WHERE x.alvo = ''operador'' AND x.setor_id = v_setor\2', 1);
-- Ajuste não é pagamento: fora da quantidade do mês.
SELECT pg_temp.remendar('public.fn_diretoria_cofen(uuid,text,integer)'::regprocedure,
  '''quantidade'', count\(\*\)\)(\s*)FROM conc\)',
  '''quantidade'', count(*) FILTER (WHERE forma <> ''AJUSTE MANUAL''))\1FROM conc)', 1);

-- 5d. App: o setor Cofen (que lê a conciliação) com o ajuste.
SELECT pg_temp.remendar('public.fn_app_resumo_visoes(text)'::regprocedure,
  'AND c\.data <= v_fim;',
  'AND c.data <= v_fim;
      v_st := v_st || (
        SELECT jsonb_build_object(
          ''recebido'',    ((v_st->>''recebido'')::NUMERIC    + COALESCE(SUM(x.valor), 0))::NUMERIC(14,2),
          ''recebido_ho'', ((v_st->>''recebido_ho'')::NUMERIC + COALESCE(SUM(x.valor_ho), 0))::NUMERIC(14,2),
          ''hoje'',        ((v_st->>''hoje'')::NUMERIC        + COALESCE(SUM(x.valor) FILTER (WHERE x.dia = v_hoje), 0))::NUMERIC(14,2),
          ''hoje_ho'',     ((v_st->>''hoje_ho'')::NUMERIC     + COALESCE(SUM(x.valor_ho) FILTER (WHERE x.dia = v_hoje), 0))::NUMERIC(14,2))
          FROM public.fn_ajustes_recebimento(ARRAY[v_emp], v_ini, v_fim) x
         WHERE x.setor_id = v_setor);', 1);

-- 5e. Resumo mensal: ajuste de equipe/setor não é uma pessoa.
SELECT pg_temp.remendar('public.fn_analitico_atualizar_resumo(uuid,text)'::regprocedure,
  'ARRAY_AGG\(DISTINCT a\.operador_id\)',
  'ARRAY_AGG(DISTINCT a.operador_id) FILTER (WHERE a.operador_id IS NOT NULL)', 1);

-- 5f. Desafio do dia: o ajuste lançado hoje conta para a pessoa (sem virar
-- pagamento) e o de equipe/setor aparece como uma linha do placar.
SELECT pg_temp.remendar('public.fn_desafio_diario(uuid)'::regprocedure,
  '(v_uid\s+UUID := auth\.uid\(\);)',
  '\1
  v_aj_total   NUMERIC := 0;', 1);
SELECT pg_temp.remendar('public.fn_desafio_diario(uuid)'::regprocedure,
  '(AND \(v_ate IS NULL OR ar\.importado_em <\s+v_ate\))(\s*\),\s*do_alvo AS)',
  '\1
    UNION ALL
    -- Ajuste de recebimento da pessoa, lançado no dia (sem importado_em: não é pagamento).
    SELECT x.empresa_id, x.operador_id, x.setor_id, x.valor, x.valor_ho, NULL::TIMESTAMPTZ
      FROM public.fn_ajustes_recebimento(v_empresas, v_dia, v_dia, v_de, v_ate) x
     WHERE x.alvo = ''operador''\2', 1);
SELECT pg_temp.remendar('public.fn_desafio_diario(uuid)'::regprocedure,
  'COUNT\(\*\)::BIGINT(\s+)AS qtd,(\s+)MAX\(c\.importado_em\)',
  'COUNT(c.importado_em)::BIGINT\1AS qtd,\2MAX(c.importado_em)', 1);
SELECT pg_temp.remendar('public.fn_desafio_diario(uuid)'::regprocedure,
  '(IF v_publico = ''operador'' THEN\s+v_total\s+:= v_op_total;)',
  '-- Ajuste de recebimento sem pessoa: o do setor (e das equipes dele) ou o da equipe.
  SELECT COALESCE(SUM(x.valor), 0) INTO v_aj_total
    FROM public.fn_ajustes_recebimento(v_empresas, v_dia, v_dia, v_de, v_ate) x
   WHERE x.alvo <> ''operador''
     AND ((v_publico = ''setor''  AND x.setor_id  = v_alvo)
       OR (v_publico = ''equipe'' AND x.alvo = ''equipe'' AND x.equipe_id = v_alvo));

  \1', 1);
SELECT pg_temp.remendar('public.fn_desafio_diario(uuid)'::regprocedure,
  '(''sem_operador'',\s+jsonb_build_object\(''total'', COALESCE\(v_orf_total, 0\), ''qtd'', COALESCE\(v_orf_qtd, 0\)\),)',
  '\1
    ''ajuste'',         jsonb_build_object(''total'', COALESCE(v_aj_total, 0), ''qtd'', 0),', 1);

-- 5g. Recebido por equipe: o ajuste da pessoa pela leitura única (no período,
-- sempre — o dia da alteração já separa o «hoje» do mês), e o da EQUIPE direto
-- nela. `p_com_ajustes` fica na assinatura por compatibilidade e não filtra mais.
SELECT pg_temp.remendar(
  'public.fn_recebido_por_equipe(uuid[],text,date,date,boolean,timestamp with time zone,timestamp with time zone)'::regprocedure,
  '-- Ajuste manual do m.s \(compet.ncia\), s. quando pedido.*?GROUP BY a\.operador_id, a\.empresa_id, em\.slug\s*\),',
  '-- Ajuste de recebimento da PESSOA no período (26/10/2026): cada alteração
  -- do card no dia em que foi lançada (`fn_ajustes_recebimento`). Não é
  -- pagamento: não conta em `qtd`.
  ajuste AS (
    SELECT x.operador_id, x.empresa_id,
           SUM(x.valor)::NUMERIC    AS total,
           SUM(x.valor_ho)::NUMERIC AS total_ho
      FROM public.fn_ajustes_recebimento(p_empresas, p_ini, p_fim, p_chegada_de, p_chegada_ate) x
     WHERE x.alvo = ''operador''
     GROUP BY x.operador_id, x.empresa_id
  ),
  -- Ajuste lançado para a EQUIPE (26/10/2026): conta nela, em ninguém.
  ajuste_equipe AS (
    SELECT x.equipe_id,
           SUM(x.valor)::NUMERIC    AS total,
           SUM(x.valor_ho)::NUMERIC AS total_ho
      FROM public.fn_ajustes_recebimento(p_empresas, p_ini, p_fim, p_chegada_de, p_chegada_ate) x
     WHERE x.alvo = ''equipe'' AND x.equipe_id IS NOT NULL
     GROUP BY x.equipe_id
  ),', 1);
SELECT pg_temp.remendar(
  'public.fn_recebido_por_equipe(uuid[],text,date,date,boolean,timestamp with time zone,timestamp with time zone)'::regprocedure,
  '(SELECT co\.equipe_id, co\.total, co\.total_ho, co\.qtd\s+FROM credito_origem co)',
  '\1
    UNION ALL
    SELECT ae.equipe_id, ae.total, ae.total_ho, 0::BIGINT
      FROM ajuste_equipe ae', 1);

-- ── 6. Recebido por setor, com o ajuste ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_recebido_por_setor(
  p_empresas uuid[], p_mes text, p_ini date, p_fim date,
  p_chegada_de timestamp with time zone, p_chegada_ate timestamp with time zone)
RETURNS TABLE(setor_id uuid, total numeric, total_ho numeric, qtd bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
  -- Ajuste de recebimento (26/10/2026): da pessoa, da equipe ou do setor.
  ajuste AS (
    SELECT x.alvo, x.operador_id, x.setor_id, x.valor, x.valor_ho
      FROM public.fn_ajustes_recebimento(p_empresas, p_ini, p_fim, p_chegada_de, p_chegada_ate) x
  ),
  -- `pg`: é pagamento? O ajuste soma no dinheiro e fica fora da quantidade.
  receb_setor AS (
    SELECT se.id AS setor_id, l.valor_recebido, l.ho, 1 AS pg
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND NOT se.alternativo
    UNION ALL
    SELECT c.setor_id, l.valor_recebido, l.ho, 1
      FROM linhas l
      JOIN conta_no_setor c  ON c.operador_id = l.operador_id
      JOIN setores_emp    se ON se.id = c.setor_id AND se.alternativo
     WHERE l.operador_id IS NOT NULL
       AND (l.setor_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM casa h WHERE h.operador_id = l.operador_id)
            OR EXISTS (SELECT 1 FROM casa h
                        WHERE h.operador_id = l.operador_id AND h.setor_id = l.setor_id))
    UNION ALL
    SELECT se.id, l.valor_recebido, l.ho, 1
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND se.alternativo
     WHERE l.operador_id IS NULL
    UNION ALL
    -- Ajuste no setor carimbado. No alternativo, o da pessoa entra pelos
    -- setores dela (abaixo), como as linhas dela.
    SELECT se.id, a.valor, a.valor_ho, 0
      FROM ajuste a
      JOIN setores_emp se ON se.id = a.setor_id AND (NOT se.alternativo OR a.alvo <> 'operador')
    UNION ALL
    SELECT c.setor_id, a.valor, a.valor_ho, 0
      FROM ajuste a
      JOIN conta_no_setor c  ON c.operador_id = a.operador_id
      JOIN setores_emp    se ON se.id = c.setor_id AND se.alternativo
     WHERE a.alvo = 'operador'
  )
  SELECT r.setor_id,
         SUM(r.valor_recebido)::NUMERIC AS total,
         SUM(r.ho)::NUMERIC             AS total_ho,
         SUM(r.pg)::BIGINT              AS qtd
    FROM receb_setor r
   GROUP BY r.setor_id;
$function$;

-- ── 7. Contexto do desafio por equipe: o setor pela MESMA função ─────────────
--
-- O bloco do setor era uma cópia de `fn_recebido_por_setor` — e foi por isso
-- que ficou sem o ajuste. Agora chama a função.

CREATE OR REPLACE FUNCTION public.fn_desafio_contexto_equipe(p_desafio_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
  SELECT COALESCE(jsonb_object_agg(m.referencia_id, m.meta_valor), '{}'::JSONB)
    INTO v_metas
    FROM public.metas m
   WHERE m.empresa_id = ANY (v_empresas)
     AND m.tipo       = 'equipe'
     AND m.mes        = v_mes
     AND m.ano        = v_ano
     AND m.meta_valor > 0;
  SELECT COALESCE(jsonb_object_agg(m.referencia_id, m.meta_valor), '{}'::JSONB)
    INTO v_metas_setor
    FROM public.metas m
   WHERE m.empresa_id = ANY (v_empresas)
     AND m.tipo       = 'setor'
     AND m.mes        = v_mes
     AND m.ano        = v_ano
     AND m.meta_valor > 0;
  SELECT COALESCE(jsonb_object_agg(e.id, e.empresa_id), '{}'::JSONB)
    INTO v_equipe_emp
    FROM public.equipes e
   WHERE e.empresa_id = ANY (v_empresas);
  SELECT COALESCE(jsonb_object_agg(st.id, st.empresa_id), '{}'::JSONB),
         COALESCE(jsonb_agg(st.id) FILTER (WHERE st.alternativo IS TRUE), '[]'::JSONB)
    INTO v_setor_emp, v_setores_alt
    FROM public.setores st
   WHERE st.empresa_id = ANY (v_empresas);
  SELECT COALESCE(jsonb_object_agg(c.empresa_id, jsonb_build_object(
           'feriados',         COALESCE(c.feriados, '[]'::JSONB),
           'contar_dia_atual', COALESCE(c.contar_dia_atual, FALSE)
         )), '{}'::JSONB)
    INTO v_config
    FROM public.metas_config_mes c
   WHERE c.empresa_id = ANY (v_empresas)
     AND c.mes = v_mes
     AND c.ano = v_ano;
  SELECT COALESCE(jsonb_object_agg(r.equipe_id, jsonb_build_object(
           'total', r.total, 'total_ho', r.total_ho, 'qtd', r.qtd
         )), '{}'::JSONB)
    INTO v_receb_equipe
    FROM public.fn_recebido_por_equipe(v_empresas, v_mes_txt, v_ini, v_fim, TRUE) r;
  SELECT COALESCE(jsonb_object_agg(r.setor_id, jsonb_build_object(
           'total', r.total, 'total_ho', r.total_ho, 'qtd', r.qtd
         )), '{}'::JSONB)
    INTO v_receb_setor
    FROM public.fn_recebido_por_setor(v_empresas, v_mes_txt, v_ini, v_fim) r;
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

-- ── 8. TV: o ajuste do setor no realizado e na série ──────────────────────────

CREATE OR REPLACE FUNCTION public.fn_tv_metricas_setor(p_empresa_id uuid, p_setor_id uuid, p_mes date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  WITH cfg AS (
    SELECT COALESCE(mc.feriados, '[]'::JSONB) AS feriados,
           COALESCE(mc.contar_dia_atual, TRUE) AS conta_hoje
      FROM public.metas_config_mes mc
     WHERE mc.empresa_id = p_empresa_id
       AND mc.mes = EXTRACT(MONTH FROM p_mes)::INT
       AND mc.ano = EXTRACT(YEAR FROM p_mes)::INT
     LIMIT 1
  ),
  parametros AS (
    SELECT COALESCE((SELECT feriados FROM cfg), '[]'::JSONB) AS feriados,
           COALESCE((SELECT conta_hoje FROM cfg), TRUE) AS conta_hoje,
           (now() AT TIME ZONE 'America/Sao_Paulo')::DATE AS hoje
  ),
  -- Dias uteis do mes: seg-sex menos feriados. Feriado em fim de semana nao
  -- subtrai nada, porque ja nao era dia util.
  dias AS (
    SELECT d::DATE AS dia
      FROM generate_series(p_mes, (p_mes + INTERVAL '1 month - 1 day')::DATE, INTERVAL '1 day') d
     WHERE EXTRACT(ISODOW FROM d) < 6
       AND NOT (to_char(d, 'YYYY-MM-DD') IN (
             SELECT jsonb_array_elements_text((SELECT feriados FROM parametros))))
  ),
  contagem AS (
    SELECT COUNT(*)::INT AS total,
           COUNT(*) FILTER (
             WHERE d.dia < (SELECT hoje FROM parametros)
                OR (d.dia = (SELECT hoje FROM parametros) AND (SELECT conta_hoje FROM parametros))
           )::INT AS decorridos
      FROM dias d
  ),
  meta AS (
    SELECT COALESCE(MAX(m.meta_valor), 0)::NUMERIC AS alvo
      FROM public.metas m
     WHERE m.empresa_id = p_empresa_id
       AND m.tipo = 'setor'
       AND m.referencia_id = p_setor_id
       AND m.mes = EXTRACT(MONTH FROM p_mes)::INT
       AND m.ano = EXTRACT(YEAR FROM p_mes)::INT
  ),
  -- O dinheiro do setor no mês: o analítico carimbado nele e o ajuste de
  -- recebimento lançado para ele (pessoa, equipe ou o próprio setor).
  movimento AS (
    SELECT ar.data_pagamento AS dia, ar.valor_recebido AS valor
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id = p_empresa_id
       AND ar.setor_id = p_setor_id
       AND ar.mes_referencia = p_mes
    UNION ALL
    SELECT x.dia, x.valor
      FROM public.fn_ajustes_recebimento(ARRAY[p_empresa_id], p_mes,
             (p_mes + INTERVAL '1 month - 1 day')::DATE) x
     WHERE x.setor_id = p_setor_id
  ),
  recebido AS (
    SELECT COALESCE(SUM(mv.valor), 0)::NUMERIC AS total,
           COALESCE(SUM(mv.valor) FILTER (
             WHERE mv.dia = (SELECT hoje FROM parametros)), 0)::NUMERIC AS hoje
      FROM movimento mv
  ),
  -- A serie por dia alimenta o grafico de evolucao. So dias COM movimento: a
  -- linha nao deve cair a zero no domingo, ela deve simplesmente nao ter ponto.
  serie AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('dia', s.dia, 'valor', s.valor)
                              ORDER BY s.dia), '[]'::JSONB) AS pontos
      FROM (
        SELECT mv.dia, SUM(mv.valor)::NUMERIC AS valor
          FROM movimento mv
         GROUP BY mv.dia
      ) s
  )
  SELECT jsonb_build_object(
    'alvo',              (SELECT alvo FROM meta),
    'realizado',         (SELECT total FROM recebido),
    'realizado_hoje',    (SELECT hoje FROM recebido),
    'falta',             GREATEST(0, (SELECT alvo FROM meta) - (SELECT total FROM recebido)),
    'dias_uteis',        (SELECT total FROM contagem),
    'dias_decorridos',   (SELECT decorridos FROM contagem),
    'dias_restantes',    GREATEST(0, (SELECT total FROM contagem) - (SELECT decorridos FROM contagem)),
    -- Meta diaria "normal": a mensal dividida pelos dias uteis do mes.
    'meta_diaria',       CASE WHEN (SELECT total FROM contagem) > 0
                              THEN ROUND((SELECT alvo FROM meta) / (SELECT total FROM contagem), 2)
                              ELSE 0 END,
    -- Ritmo que AINDA falta por dia. E outro numero, e o mais util quando o mes
    -- ja andou: a meta diaria nao muda, este sobe quando se fica para tras.
    'ritmo_necessario',  CASE WHEN (SELECT total FROM contagem) - (SELECT decorridos FROM contagem) > 0
                              THEN ROUND(GREATEST(0, (SELECT alvo FROM meta) - (SELECT total FROM recebido))
                                         / ((SELECT total FROM contagem) - (SELECT decorridos FROM contagem)), 2)
                              ELSE 0 END,
    'esperado_ate_hoje', CASE WHEN (SELECT total FROM contagem) > 0
                              THEN ROUND((SELECT alvo FROM meta) / (SELECT total FROM contagem)
                                         * (SELECT decorridos FROM contagem), 2)
                              ELSE 0 END,
    -- Projecao: o ritmo de ate agora mantido ate o fim do mes.
    'projecao',          CASE WHEN (SELECT decorridos FROM contagem) > 0
                              THEN ROUND((SELECT total FROM recebido)
                                         / (SELECT decorridos FROM contagem)
                                         * (SELECT total FROM contagem), 2)
                              ELSE 0 END,
    'serie',             (SELECT pontos FROM serie)
  );
$function$;
