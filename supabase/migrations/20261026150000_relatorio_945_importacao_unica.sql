-- =============================================================================
-- Relatório 945 (recebimento diário da regra Cofen): uma importação, dois
-- destinos, e cobertura de verdade por dia.
--
-- ## Por que existe (conferência de 26/10/2026)
--
-- O mesmo arquivo 945 era importado duas vezes, por telas diferentes:
--   • no recorte Dia do Analítico, para `diario_recebimentos`;
--   • no Painel Diretoria › Relatório de pagamento, para `pp_relatorio_pagamentos`.
-- E cada lado errava de um jeito:
--   • o diário aceitava o relatório 58 (5.014 linhas, R$ 2,07 mi, em 06, 08 e
--     22/10, todas no dia da importação); corrigia só o VALOR das baixas já
--     salvas, deixando operador, próximo contato e tabulação congelados no
--     primeiro import (R$ 110.959,47 com operador errado em 01–22/10); e perdeu
--     633 baixas de 30/09 porque ninguém reimporta o mês anterior na virada;
--   • a diretoria marcava um dia como "completo" só porque foi importado num dia
--     posterior, e a trava «ontem e hoje» não enxerga sexta na segunda-feira nem
--     baixa retroativa (Data anterior à Dt.Baixa): faltavam 6994679, 7012498 e
--     7012551.
--
-- ## O que muda
--
-- 1. `fn_relatorio_945` grava as duas tabelas de uma vez, a partir de qualquer
--    uma das telas. O diário recebe só a janela operacional (do 1º dia do mês
--    anterior em diante): o 945 da diretoria costuma vir de janeiro até hoje.
-- 2. Baixa já salva é reconciliada por Id.Baixa, em qualquer dia: valor, data,
--    operador, código, próximo contato e tabulação seguem o arquivo mais novo.
--    Vínculo manual de operador é preservado enquanto o login do arquivo for o
--    mesmo.
-- 3. Cada lote guarda o CORTE do arquivo (maior Dt.Baixa + Horário), e
--    `private.r945_cobertura` guarda, por dia, o maior corte que já o cobriu.
--    Um dia está:
--      completo     quando um arquivo que o cobre tem corte depois do fim dele;
--      consolidado  quando esse corte passou 7 dias do fim dele (pega as baixas
--                   retroativas — medido: 3 de 14.709 linhas, até 5 dias);
--      parcial      quando só foi coberto antes de acabar.
-- 4. A trava passa a ser uma data, calculada: o arquivo precisa começar no dia
--    mais antigo dos últimos 35 que não está consolidado nem foi coberto por um
--    arquivo hoje. Fim de semana, feriado e virada de mês saem da conta sozinhos.
-- 5. `idx_diario_id_baixa`: Id.Baixa é único por empresa no diário. A única
--    duplicata existente (6888655, que o ERP mudou de 10/08 para 08/09) fica
--    com a versão mais nova.
--
-- A conciliação continua no fluxo antigo (`fn_pp_relatorio`), que não muda.
-- =============================================================================

ALTER TABLE private.pp_relatorio_lotes
  ADD COLUMN IF NOT EXISTS corte timestamptz,
  ADD COLUMN IF NOT EXISTS origem text,
  ADD COLUMN IF NOT EXISTS com_diario boolean NOT NULL DEFAULT false;
ALTER TABLE private.pp_relatorio_lotes DROP CONSTRAINT IF EXISTS pp_relatorio_lotes_origem_check;
ALTER TABLE private.pp_relatorio_lotes ADD CONSTRAINT pp_relatorio_lotes_origem_check
  CHECK (origem IS NULL OR origem IN ('diario', 'diretoria'));

-- Staging do 945: o pagamento (as 12 chaves da diretoria) e, para as linhas da
-- janela do diário, os campos do recebimento diário.
CREATE TABLE IF NOT EXISTS private.r945_linhas (
  lote_id uuid NOT NULL REFERENCES private.pp_relatorio_lotes(id) ON DELETE CASCADE,
  id_baixa text NOT NULL,
  pagamento jsonb NOT NULL,
  diario jsonb,
  PRIMARY KEY (lote_id, id_baixa)
);

CREATE TABLE IF NOT EXISTS private.r945_cobertura (
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  data date NOT NULL,
  corte timestamptz NOT NULL,
  atualizado_em timestamptz NOT NULL,
  PRIMARY KEY (empresa_id, data)
);
REVOKE ALL ON private.r945_linhas, private.r945_cobertura FROM PUBLIC, anon, authenticated;

-- Histórico: lote antigo não tem corte. Vale o início do dia da importação —
-- a mesma régua do `completo` antigo (importado num dia posterior = completo),
-- nunca mais otimista que ela.
INSERT INTO private.r945_cobertura (empresa_id, data, corte, atualizado_em)
SELECT l.empresa_id, d::date,
       max(date_trunc('day', l.criado_em AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'),
       max(l.concluido_em)
  FROM private.pp_relatorio_lotes l
 CROSS JOIN LATERAL generate_series(l.inicio::timestamp, l.fim::timestamp, interval '1 day') d
 WHERE l.modalidade = 'pagamento' AND l.concluido_em IS NOT NULL
 GROUP BY 1, 2
ON CONFLICT (empresa_id, data) DO NOTHING;

-- Id.Baixa único por empresa no diário. A duplicata fica com a importação mais
-- recente: é a que o ERP mandou depois de reajustar a baixa.
DELETE FROM public.diario_recebimentos d
 USING public.diario_recebimentos n
 WHERE d.id_baixa IS NOT NULL
   AND n.empresa_id = d.empresa_id AND n.id_baixa = d.id_baixa
   AND (n.importado_em, n.id) > (d.importado_em, d.id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_diario_id_baixa
  ON public.diario_recebimentos (empresa_id, id_baixa) WHERE id_baixa IS NOT NULL;

-- Quem importa o 945: quem já tinha o Relatório de pagamento, ou quem importa
-- o recebimento diário. Só em empresa com setor da regra Cofen — a regra decide,
-- não o nome da empresa.
CREATE OR REPLACE FUNCTION private.r945_pode(e uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
     AND (coalesce(public.fn_pp_relatorio_acesso(e), false)
          OR (coalesce(public.fn_can_access_empresa(e), false)
              AND coalesce(public.fn_user_tem('importar_diario'), false)))
     AND EXISTS (SELECT 1 FROM public.setores s WHERE s.empresa_id = e AND s.regra = 'cofen');
$$;

-- Início local de um dia, como timestamptz.
CREATE OR REPLACE FUNCTION private.r945_inicio_do_dia(d date)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT d::timestamp AT TIME ZONE 'America/Sao_Paulo';
$$;

-- O dia mais antigo dos últimos 35 que ainda precisa vir no arquivo: nem
-- consolidado (corte 7 dias depois do fim dele) nem coberto por um arquivo hoje.
CREATE OR REPLACE FUNCTION private.r945_inicio_exigido(e uuid, hoje date)
RETURNS date LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT min(d)::date
    FROM generate_series((hoje - 35)::timestamp, (hoje - 1)::timestamp, interval '1 day') d
   WHERE NOT EXISTS (
     SELECT 1 FROM private.r945_cobertura c
      WHERE c.empresa_id = e AND c.data = d::date
        AND (c.corte >= private.r945_inicio_do_dia(d::date + 7)
             OR (c.atualizado_em AT TIME ZONE 'America/Sao_Paulo')::date = hoje));
$$;

-- Os últimos 21 dias como a tela desenha: estado, corte e quantas baixas há em
-- cada tabela.
CREATE OR REPLACE FUNCTION private.r945_cobertura_json(e uuid, hoje date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'hoje', hoje,
    'inicio_exigido', private.r945_inicio_exigido(e, hoje),
    'piso_diario', (date_trunc('month', hoje) - interval '1 month')::date,
    'ultimo_corte', (SELECT max(l.corte) FROM private.pp_relatorio_lotes l
                      WHERE l.empresa_id = e AND l.modalidade = 'pagamento' AND l.concluido_em IS NOT NULL),
    'dias', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'data', d::date,
        'estado', CASE
          WHEN c.corte IS NULL THEN 'sem_importacao'
          WHEN c.corte >= private.r945_inicio_do_dia(d::date + 7) THEN 'consolidado'
          WHEN c.corte >= private.r945_inicio_do_dia(d::date + 1) THEN 'completo'
          ELSE 'parcial' END,
        'corte', c.corte,
        'atualizado_em', c.atualizado_em,
        'diario', (SELECT count(*) FROM public.diario_recebimentos r
                    WHERE r.empresa_id = e AND r.dia_referencia = d::date AND r.id_baixa IS NOT NULL),
        'diretoria', (SELECT count(*) FROM public.pp_relatorio_pagamentos a
                       WHERE a.empresa_id = e AND a.data = d::date)
      ) ORDER BY d), '[]'::jsonb)
        FROM generate_series((hoje - 20)::timestamp, hoje::timestamp, interval '1 day') d
        LEFT JOIN private.r945_cobertura c ON c.empresa_id = e AND c.data = d::date
    ));
$$;

CREATE OR REPLACE FUNCTION private.r945_operar(p_acao text, p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e uuid; l private.pp_relatorio_lotes%ROWTYPE;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  piso date := (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')) - interval '1 month')::date;
  inicio date; fim date; exigido date; v_corte timestamptz; dmin date;
  n integer; soma jsonb; escritos integer; atualizados integer; removidos_dir integer := 0;
  d_ins integer := 0; d_upd integer := 0; d_sem_id integer := 0; d_ausentes integer := 0;
  novos jsonb; v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária.'; END IF;
  IF p_acao IN ('adicionar', 'concluir', 'cancelar') THEN
    SELECT * INTO l FROM private.pp_relatorio_lotes WHERE id = (p->>'lote')::uuid;
    IF NOT FOUND OR l.criado_por <> auth.uid() OR l.origem IS NULL THEN RAISE EXCEPTION 'Lote indisponível.'; END IF;
    e := l.empresa_id;
  ELSE
    e := (p->>'empresa')::uuid;
  END IF;
  IF e IS NULL OR NOT coalesce(private.r945_pode(e), false) THEN
    RAISE EXCEPTION 'Sem permissão para importar o relatório 945 desta empresa.';
  END IF;

  IF p_acao = 'cobertura' THEN
    RETURN private.r945_cobertura_json(e, hoje);
  END IF;

  IF p_acao = 'conferir' THEN
    -- Antes de gravar: o que o banco tem dentro da janela do arquivo e o
    -- arquivo não trouxe, e o que há no diário sem Id.Baixa (nunca é do 945).
    inicio := (p->>'inicio')::date; fim := (p->>'fim')::date;
    IF inicio IS NULL OR fim IS NULL OR inicio > fim THEN RAISE EXCEPTION 'Período inválido.'; END IF;
    IF jsonb_typeof(p->'ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de baixas inválida.'; END IF;
    dmin := greatest(inicio, piso);
    RETURN private.r945_cobertura_json(e, hoje) || jsonb_build_object(
      'ausentes_diretoria', (
        WITH arq AS (SELECT DISTINCT v AS id FROM jsonb_array_elements_text(p->'ids') v)
        SELECT coalesce(jsonb_agg(jsonb_build_object('data', x.data, 'quantidade', x.n, 'total', x.t) ORDER BY x.data), '[]'::jsonb)
          FROM (SELECT a.data, count(*) n, sum(a.total) t FROM public.pp_relatorio_pagamentos a
                 WHERE a.empresa_id = e AND a.data BETWEEN inicio AND fim
                   AND NOT EXISTS (SELECT 1 FROM arq WHERE arq.id = a.id_baixa)
                 GROUP BY a.data) x),
      'ausentes_diario', (
        WITH arq AS (SELECT DISTINCT v AS id FROM jsonb_array_elements_text(p->'ids') v)
        SELECT coalesce(jsonb_agg(jsonb_build_object('data', x.dia, 'quantidade', x.n, 'valor', x.v) ORDER BY x.dia), '[]'::jsonb)
          FROM (SELECT r.dia_referencia dia, count(*) n, sum(r.valor_recebido) v FROM public.diario_recebimentos r
                 WHERE r.empresa_id = e AND r.id_baixa IS NOT NULL AND r.dia_referencia BETWEEN dmin AND fim
                   AND NOT EXISTS (SELECT 1 FROM arq WHERE arq.id = r.id_baixa)
                 GROUP BY r.dia_referencia) x),
      'sem_id_diario', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('data', x.dia, 'quantidade', x.n, 'valor', x.v) ORDER BY x.dia), '[]'::jsonb)
          FROM (SELECT r.dia_referencia dia, count(*) n, sum(r.valor_recebido) v FROM public.diario_recebimentos r
                 WHERE r.empresa_id = e AND r.id_baixa IS NULL AND r.dia_referencia BETWEEN dmin AND fim
                 GROUP BY r.dia_referencia) x));
  END IF;

  -- Mesma chave de lock do fluxo antigo de pagamento: as duas telas nunca
  -- gravam a mesma empresa ao mesmo tempo.
  PERFORM pg_advisory_xact_lock(hashtextextended(e::text || ':pagamento', 0));

  IF p_acao = 'invalidar' THEN
    -- Limpar dia/mês ou excluir histórico: os dias voltam a exigir arquivo.
    inicio := (p->>'inicio')::date; fim := (p->>'fim')::date;
    IF inicio IS NULL OR fim IS NULL OR inicio > fim THEN RAISE EXCEPTION 'Período inválido.'; END IF;
    DELETE FROM private.r945_cobertura WHERE empresa_id = e AND data BETWEEN inicio AND fim;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN to_jsonb(n);
  END IF;

  IF p_acao IN ('adicionar', 'concluir', 'cancelar') THEN
    SELECT * INTO l FROM private.pp_relatorio_lotes WHERE id = (p->>'lote')::uuid FOR UPDATE;
    IF NOT FOUND OR l.criado_por <> auth.uid() THEN RAISE EXCEPTION 'Lote indisponível.'; END IF;
  END IF;

  IF p_acao = 'abrir' THEN
    inicio := (p->>'inicio')::date; fim := (p->>'fim')::date;
    IF inicio IS NULL OR fim IS NULL OR inicio < '2000-01-01' OR inicio > fim OR fim > hoje THEN
      RAISE EXCEPTION 'Período inválido.';
    END IF;
    IF coalesce(p->>'origem', '') NOT IN ('diario', 'diretoria') THEN RAISE EXCEPTION 'Origem inválida.'; END IF;
    -- O corte vem do arquivo (hora local de São Paulo). Sem ele, o arquivo só
    -- fecha os dias anteriores ao último.
    v_corte := CASE WHEN nullif(p->>'corte', '') IS NULL THEN private.r945_inicio_do_dia(fim)
                    ELSE (p->>'corte')::timestamp AT TIME ZONE 'America/Sao_Paulo' END;
    IF v_corte > now() + interval '15 minutes' OR v_corte < private.r945_inicio_do_dia(inicio) THEN
      RAISE EXCEPTION 'Horário da última baixa do arquivo é inválido.';
    END IF;
    exigido := private.r945_inicio_exigido(e, hoje);
    IF exigido IS NOT NULL AND fim >= exigido AND inicio > exigido THEN
      RAISE EXCEPTION 'Faltam dias no arquivo: exporte o relatório 945 a partir de % até hoje (este começa em %).',
        to_char(exigido, 'DD/MM/YYYY'), to_char(inicio, 'DD/MM/YYYY');
    END IF;
    DELETE FROM private.pp_relatorio_lotes
     WHERE empresa_id = e AND modalidade = 'pagamento' AND concluido_em IS NULL AND criado_em < now() - interval '2 days';
    INSERT INTO private.pp_relatorio_lotes (empresa_id, modalidade, inicio, fim, arquivo, quantidade, totais, criado_por, corte, origem, com_diario)
      VALUES (e, 'pagamento', inicio, fim, p->>'arquivo', (p->>'quantidade')::integer, p->'totais', auth.uid(),
              v_corte, p->>'origem', coalesce((p->>'com_diario')::boolean, false))
      RETURNING id INTO l.id;
    RETURN to_jsonb(l.id);

  ELSIF p_acao = 'adicionar' THEN
    IF l.concluido_em IS NOT NULL THEN RAISE EXCEPTION 'Lote já concluído.'; END IF;
    IF jsonb_typeof(p->'linhas') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'linhas') NOT BETWEEN 1 AND 1500 THEN
      RAISE EXCEPTION 'Bloco de importação inválido.';
    END IF;
    -- Pagamento: exatamente as 12 chaves do relatório da diretoria.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p->'linhas') x, LATERAL (SELECT x->'p' r) y WHERE
         jsonb_typeof(y.r) IS DISTINCT FROM 'object'
      OR NOT y.r ?& ARRAY['id_baixa','data','data_pagamento','uf','acordo','parcela','forma','ia','total','coren','cofen','pp']
      OR (SELECT count(*) FROM jsonb_object_keys(y.r)) <> 12
      OR EXISTS (SELECT 1 FROM jsonb_each(y.r) v WHERE v.value = 'null'::jsonb)
      OR coalesce(y.r->>'id_baixa', '') !~ '^[0-9]+$'
      OR (y.r->>'data')::date NOT BETWEEN l.inicio AND l.fim
      OR (y.r->>'data_pagamento')::date NOT BETWEEN '2000-01-01' AND hoje
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['total','coren','cofen','pp']) k
                  WHERE coalesce(y.r->>k, '') !~ '^-?[0-9]+$' OR abs((y.r->>k)::numeric) > 9007199254740991)
    ) THEN RAISE EXCEPTION 'Pagamento inválido ou fora do período declarado.'; END IF;
    -- Diário: objeto com as 8 chaves, ou null.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p->'linhas') x WHERE
         jsonb_typeof(x->'d') NOT IN ('object', 'null')
      OR (jsonb_typeof(x->'d') = 'object' AND (
             NOT (x->'d') ?& ARRAY['operador_usuario','operador_id','cliente_codigo','nome_cliente','acordo_codigo','forma','prox_contato','tabulacao']
          OR (SELECT count(*) FROM jsonb_object_keys(x->'d')) <> 8
          OR jsonb_typeof(x->'d'->'operador_usuario') <> 'string'
          OR (x->'d'->>'operador_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          OR (x->'d'->>'prox_contato') !~ '^\d{4}-\d{2}-\d{2}$'))
    ) THEN RAISE EXCEPTION 'Dados do recebimento diário inválidos.'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p->'linhas') x GROUP BY x->'p'->>'id_baixa' HAVING count(DISTINCT x) > 1) THEN
      RAISE EXCEPTION 'Identificador duplicado divergente.';
    END IF;
    -- Repetir o mesmo bloco após falha de rede é seguro; alterar um bloco não.
    IF EXISTS (SELECT 1 FROM private.r945_linhas s JOIN jsonb_array_elements(p->'linhas') x ON s.id_baixa = x->'p'->>'id_baixa'
                WHERE s.lote_id = l.id AND s.pagamento IS DISTINCT FROM x->'p') THEN
      RAISE EXCEPTION 'Pagamento divergente dentro do lote.';
    END IF;
    -- O diário só guarda a janela operacional, e só quando o arquivo traz Operador.
    INSERT INTO private.r945_linhas (lote_id, id_baixa, pagamento, diario)
    SELECT l.id, x->'p'->>'id_baixa', x->'p',
           CASE WHEN l.com_diario AND (x->'p'->>'data')::date >= piso AND jsonb_typeof(x->'d') = 'object' THEN x->'d' END
      FROM jsonb_array_elements(p->'linhas') x
    ON CONFLICT (lote_id, id_baixa) DO NOTHING;
    RETURN 'null'::jsonb;

  ELSIF p_acao = 'concluir' THEN
    IF l.concluido_em IS NOT NULL THEN RETURN l.resultado; END IF;
    IF (l.criado_em AT TIME ZONE 'America/Sao_Paulo')::date <> hoje THEN
      RAISE EXCEPTION 'O dia mudou durante a importação. Selecione o arquivo novamente.';
    END IF;
    exigido := private.r945_inicio_exigido(e, hoje);
    IF exigido IS NOT NULL AND l.fim >= exigido AND l.inicio > exigido THEN
      RAISE EXCEPTION 'Faltam dias no arquivo: exporte o relatório 945 a partir de % até hoje.', to_char(exigido, 'DD/MM/YYYY');
    END IF;
    SELECT count(*), jsonb_build_object('total', sum((pagamento->>'total')::numeric), 'coren', sum((pagamento->>'coren')::numeric),
           'cofen', sum((pagamento->>'cofen')::numeric), 'pp', sum((pagamento->>'pp')::numeric))
      INTO n, soma FROM private.r945_linhas WHERE lote_id = l.id;
    IF n <> l.quantidade OR soma IS DISTINCT FROM l.totais THEN
      RAISE EXCEPTION 'A quantidade ou os totais recebidos não conferem com o arquivo. Nada foi gravado.';
    END IF;

    -- ── Relatório de pagamento (diretoria): vale o arquivo mais novo ─────────
    SELECT count(*) INTO atualizados
      FROM public.pp_relatorio_pagamentos a
      JOIN private.r945_linhas s ON s.lote_id = l.id AND s.id_baixa = a.id_baixa
     CROSS JOIN LATERAL jsonb_to_record(s.pagamento) r(data date, data_pagamento date, uf text, acordo text, parcela text,
                                                       forma text, ia text, total bigint, coren bigint, cofen bigint, pp bigint)
     WHERE a.empresa_id = e
       AND (a.data, a.data_pagamento, a.uf, a.acordo, a.parcela, a.forma, a.ia, a.total, a.coren, a.cofen, a.pp)
           IS DISTINCT FROM (r.data, r.data_pagamento, r.uf, r.acordo, r.parcela, r.forma, r.ia, r.total, r.coren, r.cofen, r.pp);
    INSERT INTO public.pp_relatorio_pagamentos AS a
    SELECT e, r.* FROM private.r945_linhas s
     CROSS JOIN LATERAL jsonb_to_record(s.pagamento) r(id_baixa text, data date, data_pagamento date, uf text, acordo text,
                                                       parcela text, forma text, ia text, total bigint, coren bigint, cofen bigint, pp bigint)
     WHERE s.lote_id = l.id
    ON CONFLICT (empresa_id, id_baixa) DO UPDATE SET
      data = excluded.data, data_pagamento = excluded.data_pagamento, uf = excluded.uf, acordo = excluded.acordo,
      parcela = excluded.parcela, forma = excluded.forma, ia = excluded.ia,
      total = excluded.total, coren = excluded.coren, cofen = excluded.cofen, pp = excluded.pp
    WHERE (a.data, a.data_pagamento, a.uf, a.acordo, a.parcela, a.forma, a.ia, a.total, a.coren, a.cofen, a.pp)
          IS DISTINCT FROM (excluded.data, excluded.data_pagamento, excluded.uf, excluded.acordo, excluded.parcela,
                            excluded.forma, excluded.ia, excluded.total, excluded.coren, excluded.cofen, excluded.pp);
    GET DIAGNOSTICS escritos = ROW_COUNT;
    IF coalesce((p->>'remover_ausentes')::boolean, false) THEN
      DELETE FROM public.pp_relatorio_pagamentos a
       WHERE a.empresa_id = e AND a.data BETWEEN l.inicio AND l.fim
         AND NOT EXISTS (SELECT 1 FROM private.r945_linhas s WHERE s.lote_id = l.id AND s.id_baixa = a.id_baixa);
      GET DIAGNOSTICS removidos_dir = ROW_COUNT;
    END IF;
    SELECT jsonb_build_object('total', sum(total), 'coren', sum(coren), 'cofen', sum(cofen), 'pp', sum(pp))
      INTO soma FROM public.pp_relatorio_pagamentos WHERE empresa_id = e;
    IF EXISTS (SELECT 1 FROM jsonb_each_text(soma) v WHERE abs(v.value::numeric) > 9007199254740991) THEN
      RAISE EXCEPTION 'Acumulado excede o limite de precisão.';
    END IF;

    -- ── Recebimento diário ───────────────────────────────────────────────────
    IF l.com_diario THEN
      dmin := greatest(l.inicio, piso);
      PERFORM pg_advisory_xact_lock(hashtextextended(e::text || ':diario', 0));

      -- Linha sem Id.Baixa nunca é do 945 (relatório 58 importado no lugar,
      -- rodapé de contagem que passou como pagamento).
      IF coalesce((p->>'remover_sem_id')::boolean, false) THEN
        DELETE FROM public.diario_recebimentos r
         WHERE r.empresa_id = e AND r.id_baixa IS NULL AND r.dia_referencia BETWEEN dmin AND l.fim;
        GET DIAGNOSTICS d_sem_id = ROW_COUNT;
      END IF;
      IF coalesce((p->>'remover_ausentes')::boolean, false) THEN
        DELETE FROM public.diario_recebimentos r
         WHERE r.empresa_id = e AND r.id_baixa IS NOT NULL AND r.dia_referencia BETWEEN dmin AND l.fim
           AND NOT EXISTS (SELECT 1 FROM private.r945_linhas s
                            WHERE s.lote_id = l.id AND s.id_baixa = r.id_baixa AND s.diario IS NOT NULL);
        GET DIAGNOSTICS d_ausentes = ROW_COUNT;
      END IF;

      CREATE TEMP TABLE r945_novo ON COMMIT DROP AS
      SELECT s.id_baixa,
             (s.pagamento->>'data')::date AS dia,
             round((s.pagamento->>'total')::numeric / 100, 2) AS valor,
             s.diario->>'operador_usuario' AS operador_usuario,
             (s.diario->>'operador_id')::uuid AS operador_id,
             nullif(s.diario->>'cliente_codigo', '') AS cliente_codigo,
             nullif(s.diario->>'nome_cliente', '') AS nome_cliente,
             nullif(s.diario->>'acordo_codigo', '') AS acordo_codigo,
             coalesce(nullif(s.diario->>'forma', ''), '—') AS forma,
             (s.diario->>'prox_contato')::date AS prox_contato,
             nullif(s.diario->>'tabulacao', '') AS tabulacao
        FROM private.r945_linhas s
       WHERE s.lote_id = l.id AND s.diario IS NOT NULL;

      -- Baixa já salva: o arquivo mais novo manda em tudo. O vínculo manual
      -- sobrevive enquanto o login do arquivo for o mesmo; login novo, vínculo
      -- novo. Quem passa a ser dono da linha vê a linha como nova.
      CREATE TEMP TABLE r945_mudou (operador_id uuid, valor_recebido numeric, trocou boolean) ON COMMIT DROP;
      WITH alvo AS (
        SELECT r.id, r.operador_id AS antigo, n.*,
               CASE WHEN n.operador_usuario = r.operador_usuario THEN coalesce(n.operador_id, r.operador_id)
                    ELSE n.operador_id END AS op_final
          FROM public.diario_recebimentos r
          JOIN r945_novo n ON r.empresa_id = e AND r.id_baixa = n.id_baixa
      ), upd AS (
        UPDATE public.diario_recebimentos r SET
          dia_referencia = a.dia, data_pagamento = a.dia, valor_recebido = a.valor, forma_pagamento = a.forma,
          operador_usuario = a.operador_usuario, operador_id = a.op_final,
          cliente_codigo = a.cliente_codigo, nome_cliente = a.nome_cliente, acordo_codigo = a.acordo_codigo,
          prox_contato = a.prox_contato, tabulacao = a.tabulacao, chave_unica = a.id_baixa,
          visto = CASE WHEN a.op_final IS DISTINCT FROM a.antigo THEN false ELSE r.visto END
          FROM alvo a
         WHERE r.id = a.id
           AND (r.dia_referencia, r.data_pagamento, r.valor_recebido, r.forma_pagamento, r.operador_usuario, r.operador_id,
                r.cliente_codigo, r.nome_cliente, r.acordo_codigo, r.prox_contato, r.tabulacao, r.chave_unica)
               IS DISTINCT FROM (a.dia, a.dia, a.valor, a.forma, a.operador_usuario, a.op_final,
                                 a.cliente_codigo, a.nome_cliente, a.acordo_codigo, a.prox_contato, a.tabulacao, a.id_baixa)
        RETURNING r.operador_id, r.valor_recebido, (a.op_final IS DISTINCT FROM a.antigo) AS trocou
      )
      INSERT INTO r945_mudou SELECT * FROM upd;
      SELECT count(*) INTO d_upd FROM r945_mudou;

      CREATE TEMP TABLE r945_inseridos (operador_id uuid, valor_recebido numeric) ON COMMIT DROP;
      WITH ins AS (
        INSERT INTO public.diario_recebimentos (empresa_id, operador_id, operador_usuario, cliente_codigo, nome_cliente,
               acordo_codigo, forma_pagamento, valor_recebido, data_pagamento, dia_referencia, prox_contato, tabulacao,
               id_baixa, chave_unica, import_index, visto, importado_por_id, lote_id)
        SELECT e, n.operador_id, n.operador_usuario, n.cliente_codigo, n.nome_cliente, n.acordo_codigo, n.forma, n.valor,
               n.dia, n.dia, n.prox_contato, n.tabulacao, n.id_baixa, n.id_baixa, coalesce(ix.proximo, 1), false, auth.uid(), l.id
          FROM r945_novo n
          LEFT JOIN (SELECT r.dia_referencia, max(r.import_index) + 1 AS proximo FROM public.diario_recebimentos r
                      WHERE r.empresa_id = e AND r.dia_referencia BETWEEN dmin AND l.fim GROUP BY 1) ix
                 ON ix.dia_referencia = n.dia
         WHERE NOT EXISTS (SELECT 1 FROM public.diario_recebimentos r WHERE r.empresa_id = e AND r.id_baixa = n.id_baixa)
        ON CONFLICT DO NOTHING
        RETURNING operador_id, valor_recebido
      )
      INSERT INTO r945_inseridos SELECT * FROM ins;
      SELECT count(*) INTO d_ins FROM r945_inseridos;

      -- Quem notificar: linhas novas e linhas que mudaram de dono, por operador.
      SELECT coalesce(jsonb_agg(jsonb_build_object('operadorId', x.op, 'novosPagamentos', x.n, 'totalNovo', x.v)), '[]'::jsonb)
        INTO novos
        FROM (SELECT operador_id op, count(*) n, sum(valor_recebido) v
                FROM (SELECT operador_id, valor_recebido FROM r945_inseridos
                      UNION ALL SELECT operador_id, valor_recebido FROM r945_mudou WHERE trocou) t
               WHERE operador_id IS NOT NULL GROUP BY operador_id) x;
    END IF;

    -- ── Cobertura ────────────────────────────────────────────────────────────
    INSERT INTO private.pp_relatorio_dias (empresa_id, modalidade, data, importado_em, completo)
    SELECT e, 'pagamento', d::date, now(), l.corte >= private.r945_inicio_do_dia(d::date + 1)
      FROM generate_series(l.inicio::timestamp, l.fim::timestamp, interval '1 day') d
    ON CONFLICT (empresa_id, modalidade, data) DO UPDATE
      SET importado_em = excluded.importado_em,
          completo = private.pp_relatorio_dias.completo OR excluded.completo;
    INSERT INTO private.r945_cobertura (empresa_id, data, corte, atualizado_em)
    SELECT e, d::date, l.corte, now()
      FROM generate_series(l.inicio::timestamp, l.fim::timestamp, interval '1 day') d
    ON CONFLICT (empresa_id, data) DO UPDATE
      SET corte = greatest(private.r945_cobertura.corte, excluded.corte), atualizado_em = excluded.atualizado_em;
    -- Compatibilidade com o resumo antigo da tela da diretoria.
    IF l.fim = hoje AND l.inicio <= hoje - 1 THEN
      INSERT INTO private.pp_relatorio_controle_diario VALUES (e, 'pagamento', hoje) ON CONFLICT DO NOTHING;
    END IF;

    v_resultado := jsonb_build_object(
      'inseridos', escritos - atualizados, 'atualizados', atualizados, 'ignorados', n - escritos,
      'removidos', removidos_dir,
      'diario', CASE WHEN l.com_diario THEN jsonb_build_object(
        'inseridos', d_ins, 'atualizados', d_upd, 'removidos_sem_id', d_sem_id, 'removidos_ausentes', d_ausentes,
        'novos_por_operador', coalesce(novos, '[]'::jsonb)) END);
    UPDATE private.pp_relatorio_lotes SET concluido_em = now(), resultado = v_resultado WHERE id = l.id;
    DELETE FROM private.r945_linhas WHERE lote_id = l.id;
    RETURN v_resultado;

  ELSIF p_acao = 'cancelar' THEN
    IF l.concluido_em IS NULL THEN DELETE FROM private.pp_relatorio_lotes WHERE id = l.id; END IF;
    RETURN 'null'::jsonb;
  END IF;
  RAISE EXCEPTION 'Operação desconhecida.';
END;
$$;
REVOKE ALL ON FUNCTION private.r945_pode(uuid), private.r945_inicio_do_dia(date),
  private.r945_inicio_exigido(uuid, date), private.r945_cobertura_json(uuid, date) FROM PUBLIC, anon, authenticated;
-- Mesmo desenho de `fn_pp_relatorio`: a pública é SECURITY INVOKER e só repassa;
-- quem confere identidade, empresa e permissão é a privada, em cada chamada.
REVOKE ALL ON FUNCTION private.r945_operar(text, jsonb) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.r945_operar(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_relatorio_945(p_acao text, p_dados jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' SET work_mem = '32MB' AS $$
  SELECT private.r945_operar(p_acao, p_dados);
$$;
REVOKE ALL ON FUNCTION public.fn_relatorio_945(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_relatorio_945(text, jsonb) TO authenticated;
