-- ============================================================================
-- O selo do fechamento: os números do mês, gravados na virada e imutáveis
-- ============================================================================
--
-- Fase 1 da auditoria de fechamento (29/10/2026).
--
-- ## Por que
--
-- O retrato (`composicao_mes*`) guarda a ESTRUTURA do mês. Os NÚMEROS de um
-- mês fechado continuam sendo calculados toda vez que alguém abre a tela — e
-- várias contas do banco (`fn_recebido_por_equipe`, o setor alternativo de
-- `fn_recebido_por_setor`, o Modo TV, os desafios) ainda usam a estrutura de
-- HOJE. Mover uma pessoa em novembro muda a conta de outubro, e nada registra
-- que mudou.
--
-- O selo é a prova: logo depois da meia-noite do dia 1º, com a estrutura
-- ainda idêntica à do último dia, ele grava recebido, H.O., pagamentos e meta
-- de cada setor, equipe e operador. A partir daí:
--
--   * é o número oficial do fechamento — meta, premiação, comissão;
--   * nunca é alterado nem apagado (gatilho recusa UPDATE e DELETE, para
--     todo mundo). Correção = versão nova, com motivo e autor;
--   * é a régua contra a qual a vigia (fase 4) confere o mês recalculado.
--
-- ## Quando sela
--
--   virada  cron `fechamento-mes-selar`, dia 1º às 00:02 de São Paulo
--           (03:02 UTC) — ANTES de `desligados-arquivar-virada` (00:10), que
--           arquiva os desligados e os tiraria das contas por equipe.
--   manual  super admin, com motivo, para registrar o mês depois de uma
--           importação atrasada ou de uma correção. Só grava versão nova se
--           algum número mudou (o hash diz).
--
-- Só sela mês FECHADO. Setembro e antes não são selados aqui: calculados hoje
-- com a estrutura de hoje, o selo deles já nasceria errado nas equipes.
--
-- ## De onde vem cada número
--
--   setor     fn_recebido_por_setor (a conta do Painel Diretoria/Modo TV)
--   equipe    fn_recebido_por_equipe, com ajustes (a do Painel do Líder)
--   operador  as linhas do relatório, com a régua «só no setor da pessoa» da
--             BookPlay (a de fn_analitico_resumo_por_operador, que exige sessão
--             e por isso não serve ao cron) + o ajuste manual do operador à
--             parte, em `ajuste`
--   meta      `metas` do mês (tipo + referencia_id)
--   nomes     o retrato do mês; sem retrato, a tabela de hoje
--
-- Nenhuma linha de dado existente muda ao aplicar. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.fechamento_mes (
  empresa_id      UUID        NOT NULL REFERENCES public.empresas(id),
  mes             TEXT        NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  versao          INTEGER     NOT NULL CHECK (versao >= 1),
  origem          TEXT        NOT NULL CHECK (origem IN ('virada', 'manual')),
  motivo          TEXT,
  selado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  selado_por      UUID,
  selado_por_nome TEXT,
  hash            TEXT        NOT NULL,
  -- total da empresa no relatório e contagens do retrato
  resumo          JSONB       NOT NULL DEFAULT '{}'::JSONB,
  PRIMARY KEY (empresa_id, mes, versao)
);

CREATE TABLE IF NOT EXISTS public.fechamento_mes_numeros (
  empresa_id  UUID          NOT NULL,
  mes         TEXT          NOT NULL,
  versao      INTEGER       NOT NULL,
  nivel       TEXT          NOT NULL CHECK (nivel IN ('setor', 'equipe', 'operador')),
  alvo_id     UUID          NOT NULL,
  nome        TEXT,
  -- Onde o alvo estava no mês (do retrato): setor da equipe; setor e equipe
  -- da pessoa.
  setor_id    UUID,
  equipe_id   UUID,
  recebido    NUMERIC(14,2) NOT NULL DEFAULT 0,
  recebido_ho NUMERIC(14,2) NOT NULL DEFAULT 0,
  pagamentos  BIGINT        NOT NULL DEFAULT 0,
  -- Só no operador: ajuste manual do mês, FORA de `recebido`. Em setor e
  -- equipe o ajuste já está dentro de `recebido` (é o que as funções devolvem).
  ajuste      NUMERIC(14,2),
  meta        NUMERIC(14,2),
  PRIMARY KEY (empresa_id, mes, versao, nivel, alvo_id),
  FOREIGN KEY (empresa_id, mes, versao)
    REFERENCES public.fechamento_mes (empresa_id, mes, versao)
);

CREATE INDEX IF NOT EXISTS fechamento_mes_numeros_alvo
  ON public.fechamento_mes_numeros (alvo_id, mes);

COMMENT ON TABLE public.fechamento_mes IS
  'Selo do fechamento: uma versao por selagem; nunca alterado nem apagado (20261029201000).';
COMMENT ON TABLE public.fechamento_mes_numeros IS
  'Numeros de cada versao do selo, por setor, equipe e operador (20261029201000).';

-- ── Imutável ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_fechamento_mes_imutavel()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'SELO_IMUTAVEL: o selo do fechamento não se altera nem se apaga — sele uma versão nova com o motivo.'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS trg_fechamento_mes_imutavel ON public.fechamento_mes;
CREATE TRIGGER trg_fechamento_mes_imutavel
  BEFORE UPDATE OR DELETE ON public.fechamento_mes
  FOR EACH ROW EXECUTE FUNCTION public.fn_fechamento_mes_imutavel();

DROP TRIGGER IF EXISTS trg_fechamento_mes_numeros_imutavel ON public.fechamento_mes_numeros;
CREATE TRIGGER trg_fechamento_mes_numeros_imutavel
  BEFORE UPDATE OR DELETE ON public.fechamento_mes_numeros
  FOR EACH ROW EXECUTE FUNCTION public.fn_fechamento_mes_imutavel();

-- ── Leitura: quem alcança a empresa. Escrita: só pela função ────────────────
ALTER TABLE public.fechamento_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamento_mes_numeros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fechamento_mes_leitura ON public.fechamento_mes;
CREATE POLICY fechamento_mes_leitura ON public.fechamento_mes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_acesso_multiempresa())
    OR empresa_id = (SELECT p.empresa_id FROM public.perfis p WHERE p.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS fechamento_mes_numeros_leitura ON public.fechamento_mes_numeros;
CREATE POLICY fechamento_mes_numeros_leitura ON public.fechamento_mes_numeros
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_acesso_multiempresa())
    OR empresa_id = (SELECT p.empresa_id FROM public.perfis p WHERE p.id = (SELECT auth.uid()))
  );

-- ── Selar ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_fechamento_mes_selar(
  p_empresa_id uuid,
  p_mes        text,
  p_motivo     text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eu       UUID := auth.uid();
  v_origem   TEXT;
  v_ini      DATE;
  v_fim      DATE;
  v_ano      INTEGER;
  v_mesn     INTEGER;
  v_por_setor BOOLEAN;
  v_hash     TEXT;
  v_ult_versao INTEGER;
  v_ult_hash   TEXT;
  v_versao   INTEGER;
  v_resumo   JSONB;
  v_nome     TEXT;
BEGIN
  IF v_eu IS NOT NULL THEN
    IF NOT public.fn_user_is_super_admin() THEN
      RAISE EXCEPTION 'NAO_AUTORIZADO: só super admin sela o fechamento à mão' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(COALESCE(p_motivo, '')), '') IS NULL THEN
      RAISE EXCEPTION 'MOTIVO_OBRIGATORIO: diga por que o mês está sendo selado de novo';
    END IF;
    v_origem := 'manual';
    SELECT nome INTO v_nome FROM public.perfis WHERE id = v_eu;
  ELSIF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: sessão ausente' USING ERRCODE = '42501';
  ELSE
    v_origem := 'virada';
  END IF;

  IF NOT public.fn_mes_fechado(p_mes) THEN
    RAISE EXCEPTION 'MES_ABERTO: % ainda não fechou — o selo é do mês fechado', p_mes;
  END IF;

  v_ini  := (p_mes || '-01')::DATE;
  v_fim  := (v_ini + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_ano  := extract(year FROM v_ini)::INTEGER;
  v_mesn := extract(month FROM v_ini)::INTEGER;
  v_por_setor := p_mes >= '2026-09'
    AND EXISTS (SELECT 1 FROM public.empresas em WHERE em.id = p_empresa_id AND em.slug = 'bookplay');

  -- Calcula numa tabela temporária; só vira versão se algum número mudou.
  CREATE TEMP TABLE IF NOT EXISTS _selo (
    nivel TEXT, alvo_id UUID, nome TEXT, setor_id UUID, equipe_id UUID,
    recebido NUMERIC(14,2), recebido_ho NUMERIC(14,2), pagamentos BIGINT,
    ajuste NUMERIC(14,2), meta NUMERIC(14,2)
  ) ON COMMIT DROP;
  TRUNCATE _selo;

  -- Setores
  INSERT INTO _selo (nivel, alvo_id, recebido, recebido_ho, pagamentos)
  SELECT 'setor', r.setor_id, COALESCE(r.total, 0), COALESCE(r.total_ho, 0), COALESCE(r.qtd, 0)
    FROM public.fn_recebido_por_setor(ARRAY[p_empresa_id], p_mes, v_ini, v_fim, NULL, NULL) r
   WHERE r.setor_id IS NOT NULL;

  -- Equipes
  INSERT INTO _selo (nivel, alvo_id, recebido, recebido_ho, pagamentos)
  SELECT 'equipe', r.equipe_id, COALESCE(r.total, 0), COALESCE(r.total_ho, 0), COALESCE(r.qtd, 0)
    FROM public.fn_recebido_por_equipe(ARRAY[p_empresa_id], p_mes, v_ini, v_fim, TRUE, NULL, NULL) r
   WHERE r.equipe_id IS NOT NULL;

  -- Operadores: as linhas do relatório, com a régua do resumo do Painel.
  INSERT INTO _selo (nivel, alvo_id, recebido, recebido_ho, pagamentos)
  WITH linhas AS (
    SELECT ar.operador_id AS op, ar.setor_id AS setor,
           ar.valor_recebido AS valor, COALESCE(ar.total_ho, 0) AS ho
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id = p_empresa_id
       AND ar.operador_id IS NOT NULL
       AND ar.data_pagamento BETWEEN v_ini AND v_fim
  ),
  casa AS (
    SELECT sm.operador_id AS op, sm.setor_id AS setor
      FROM public.fn_analitico_setores_no_mes(
             p_empresa_id, p_mes, ARRAY(SELECT DISTINCT x.op FROM linhas x)) sm
     WHERE v_por_setor
  )
  SELECT 'operador', li.op, SUM(li.valor), SUM(li.ho), COUNT(*)
    FROM linhas li
    LEFT JOIN public.perfis p ON p.id = li.op
   WHERE COALESCE(p.perfil::TEXT, '') <> 'super_admin'
     AND (NOT v_por_setor
          OR li.setor IS NULL
          OR NOT EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op)
          OR EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op AND c.setor = li.setor))
   GROUP BY li.op;

  -- Ajuste manual do operador, à parte.
  WITH aj AS (
    SELECT a.operador_id AS op, SUM(a.valor)::NUMERIC(14,2) AS v
      FROM public.analitico_ajustes_manuais a
     WHERE a.empresa_id = p_empresa_id
       AND a.operador_id IS NOT NULL
       AND a.mes_referencia = v_ini
       AND a.cancelado IS NOT TRUE
     GROUP BY a.operador_id
  )
  INSERT INTO _selo (nivel, alvo_id, recebido, recebido_ho, pagamentos)
  SELECT 'operador', aj.op, 0, 0, 0
    FROM aj
   WHERE NOT EXISTS (SELECT 1 FROM _selo s WHERE s.nivel = 'operador' AND s.alvo_id = aj.op);

  UPDATE _selo s SET ajuste = aj.v
    FROM (
      SELECT a.operador_id AS op, SUM(a.valor)::NUMERIC(14,2) AS v
        FROM public.analitico_ajustes_manuais a
       WHERE a.empresa_id = p_empresa_id
         AND a.operador_id IS NOT NULL
         AND a.mes_referencia = v_ini
         AND a.cancelado IS NOT TRUE
       GROUP BY a.operador_id
    ) aj
   WHERE s.nivel = 'operador' AND s.alvo_id = aj.op;

  -- Metas: entra também quem tinha meta e não recebeu nada.
  INSERT INTO _selo (nivel, alvo_id, recebido, recebido_ho, pagamentos)
  SELECT DISTINCT m.tipo, m.referencia_id, 0, 0, 0
    FROM public.metas m
   WHERE m.empresa_id = p_empresa_id AND m.ano = v_ano AND m.mes = v_mesn
     AND m.tipo IN ('setor', 'equipe', 'operador')
     AND m.referencia_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM _selo s WHERE s.nivel = m.tipo AND s.alvo_id = m.referencia_id);

  UPDATE _selo s SET meta = mm.v
    FROM (
      SELECT m.tipo, m.referencia_id AS ref, MAX(m.meta_valor)::NUMERIC(14,2) AS v
        FROM public.metas m
       WHERE m.empresa_id = p_empresa_id AND m.ano = v_ano AND m.mes = v_mesn
       GROUP BY m.tipo, m.referencia_id
    ) mm
   WHERE s.nivel = mm.tipo AND s.alvo_id = mm.ref;

  -- Nomes e lugar no mês: retrato primeiro, tabela de hoje na falta.
  UPDATE _selo s SET nome = COALESCE(cs.nome, st.nome)
    FROM public.setores st
    LEFT JOIN public.composicao_mes_setor cs
      ON cs.empresa_id = p_empresa_id AND cs.mes = p_mes AND cs.setor_id = st.id
   WHERE s.nivel = 'setor' AND st.id = s.alvo_id;
  UPDATE _selo s SET nome = cs.nome
    FROM public.composicao_mes_setor cs
   WHERE s.nivel = 'setor' AND s.nome IS NULL
     AND cs.empresa_id = p_empresa_id AND cs.mes = p_mes AND cs.setor_id = s.alvo_id;

  UPDATE _selo s SET nome = ce.nome, setor_id = ce.setor_id
    FROM public.composicao_mes_equipe ce
   WHERE s.nivel = 'equipe'
     AND ce.empresa_id = p_empresa_id AND ce.mes = p_mes AND ce.equipe_id = s.alvo_id;
  UPDATE _selo s SET nome = e.nome, setor_id = e.setor_id
    FROM public.equipes e
   WHERE s.nivel = 'equipe' AND s.nome IS NULL AND e.id = s.alvo_id;

  UPDATE _selo s SET nome = cm.nome, setor_id = cm.setor_id, equipe_id = cm.equipe_id
    FROM public.composicao_mes cm
   WHERE s.nivel = 'operador'
     AND cm.empresa_id = p_empresa_id AND cm.mes = p_mes AND cm.operador_id = s.alvo_id;
  UPDATE _selo s SET nome = p.nome, setor_id = p.setor_id, equipe_id = p.equipe_id
    FROM public.perfis p
   WHERE s.nivel = 'operador' AND s.nome IS NULL AND p.id = s.alvo_id;

  SELECT md5(COALESCE(string_agg(
           concat_ws('|', nivel, alvo_id, recebido, recebido_ho, pagamentos, ajuste, meta),
           ';' ORDER BY nivel, alvo_id), ''))
    INTO v_hash
    FROM _selo;

  SELECT versao, hash INTO v_ult_versao, v_ult_hash
    FROM public.fechamento_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes
   ORDER BY versao DESC
   LIMIT 1;

  IF v_ult_versao IS NOT NULL AND v_ult_hash = v_hash THEN
    RETURN v_ult_versao;   -- nada mudou: a versão vigente continua valendo
  END IF;

  v_versao := COALESCE(v_ult_versao, 0) + 1;

  SELECT jsonb_build_object(
           'relatorio_total',      COALESCE(SUM(ar.valor_recebido), 0),
           'relatorio_total_ho',   COALESCE(SUM(ar.total_ho), 0),
           'relatorio_pagamentos', COUNT(*),
           'sem_operador',         COALESCE(SUM(ar.valor_recebido) FILTER (WHERE ar.operador_id IS NULL), 0),
           'setores',   (SELECT count(*) FROM _selo WHERE nivel = 'setor'),
           'equipes',   (SELECT count(*) FROM _selo WHERE nivel = 'equipe'),
           'operadores',(SELECT count(*) FROM _selo WHERE nivel = 'operador'),
           'retrato_pessoas', (SELECT count(*) FROM public.composicao_mes cm
                                WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes),
           'versao_anterior', v_ult_versao,
           'hash_anterior',   v_ult_hash)
    INTO v_resumo
    FROM public.analitico_recebimentos ar
   WHERE ar.empresa_id = p_empresa_id
     AND ar.data_pagamento BETWEEN v_ini AND v_fim;

  INSERT INTO public.fechamento_mes
    (empresa_id, mes, versao, origem, motivo, selado_por, selado_por_nome, hash, resumo)
  VALUES
    (p_empresa_id, p_mes, v_versao, v_origem, NULLIF(btrim(COALESCE(p_motivo, '')), ''),
     v_eu, v_nome, v_hash, v_resumo);

  INSERT INTO public.fechamento_mes_numeros
    (empresa_id, mes, versao, nivel, alvo_id, nome, setor_id, equipe_id,
     recebido, recebido_ho, pagamentos, ajuste, meta)
  SELECT p_empresa_id, p_mes, v_versao, s.nivel, s.alvo_id, s.nome, s.setor_id, s.equipe_id,
         COALESCE(s.recebido, 0), COALESCE(s.recebido_ho, 0), COALESCE(s.pagamentos, 0),
         s.ajuste, s.meta
    FROM _selo s;

  PERFORM public.fn_log_registrar(
    p_acao       => 'fechamento_mes_selado',
    p_categoria  => 'sistema',
    p_severidade => CASE WHEN v_versao > 1 THEN 'aviso' ELSE 'info' END,
    p_descricao  => format('Selou o fechamento de %s — versão %s (%s)', p_mes, v_versao, v_origem),
    p_empresa_id => p_empresa_id,
    p_tabela     => 'fechamento_mes',
    p_alvo_tipo  => 'fechamento_mes',
    p_alvo_rotulo=> p_mes,
    p_detalhes   => v_resumo || jsonb_build_object('mes', p_mes, 'versao', v_versao,
                                                   'origem', v_origem, 'motivo', p_motivo),
    p_origem     => CASE WHEN v_origem = 'virada' THEN 'automatico' ELSE 'api' END
  );

  RETURN v_versao;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_fechamento_mes_selar(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fechamento_mes_selar(uuid, text, text) TO authenticated;

-- A virada: todas as empresas, o mês que acabou de fechar.
CREATE OR REPLACE FUNCTION public.fn_fechamento_mes_selar_virada()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mes TEXT := to_char(
    date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')) - INTERVAL '1 day', 'YYYY-MM');
  v_emp RECORD;
  v_n   INTEGER := 0;
BEGIN
  FOR v_emp IN SELECT id FROM public.empresas LOOP
    -- Uma empresa com problema não impede o selo das outras.
    BEGIN
      PERFORM public.fn_fechamento_mes_selar(v_emp.id, v_mes, NULL);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'selo de % da empresa % falhou: %', v_mes, v_emp.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_fechamento_mes_selar_virada() FROM PUBLIC, anon, authenticated;

-- Dia 1º, 00:02 de São Paulo = 03:02 UTC (o cron está em GMT).
DO $cron$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron ausente: selo da virada não agendado';
    RETURN;
  END IF;
  PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'fechamento-mes-selar';
  PERFORM cron.schedule('fechamento-mes-selar', '2 3 1 * *',
                        'SELECT public.fn_fechamento_mes_selar_virada();');
END
$cron$;

COMMIT;
