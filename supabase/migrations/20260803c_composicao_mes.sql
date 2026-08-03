-- ============================================================================
-- 20260803c_composicao_mes.sql
-- Congela QUEM ESTAVA ONDE em cada mês.
-- ============================================================================
--
-- ## O problema
--
-- Os VALORES do analítico já são históricos: cada linha tem o seu mês, e só
-- mudam quando o relatório daquele mês é reimportado. As metas também
-- (`metas_config_mes` é por mês e ano).
--
-- Mas a COMPOSIÇÃO não era gravada em lugar nenhum. Quartis, Desempenho por
-- Equipe e Ranking montam os grupos lendo `perfis.equipe_id`, `perfis.setor_id`,
-- `perfis.situacao` e `equipe_operadores_clones` — as tabelas de HOJE. Então
-- mover alguém de equipe, colocar em férias ou desligar reescrevia o passado:
-- ao filtrar julho, o operador aparecia na equipe de agosto, ou sumia do
-- ranking de julho por estar de férias hoje.
--
-- Isso vale para as DUAS empresas: é a mesma função para as duas.
--
-- ## A regra
--
-- O retrato do mês é fato consumado. Só o relatório analítico daquele mês pode
-- mexer nele — que é exatamente quando a foto é retirada de novo.
--
-- ## Quando a foto é tirada
--
-- 1. Todo dia, às 23:50, para o mês corrente. Rodando todo dia, o último dia do
--    mês está sempre coberto sem depender de o cron de um único dia ter rodado.
-- 2. Ao importar o relatório analítico de um mês (a aplicação chama a RPC).
-- 3. Backfill no fim deste arquivo, para os meses que já têm dado.
--
-- ## O limite honesto do backfill
--
-- Para os meses já fechados, a composição da época NUNCA foi gravada — esse
-- dado não existe e não há de onde tirar. O backfill grava o estado de HOJE
-- como se fosse o daquele mês. É a melhor aproximação possível, e a partir de
-- agora o retrato passa a ser real.
-- ============================================================================

-- ── Tabelas ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.composicao_mes (
  empresa_id   UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  mes          TEXT NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  operador_id  UUID NOT NULL,
  equipe_id    UUID,
  equipe_nome  TEXT,
  setor_id     UUID,
  situacao     TEXT NOT NULL DEFAULT 'ativo',
  -- Equipes em que o operador era CLONE e o recebimento contava
  -- (`conta_recebimento`). Clone com a caixinha desligada não entra.
  equipes_clone UUID[] NOT NULL DEFAULT '{}',
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, mes, operador_id)
);

-- A lista de equipes do mês é gravada à parte: uma equipe formada só por
-- clones não tem nenhum perfil apontando para ela, e sem isto ela sumiria do
-- painel do mês passado — o mesmo defeito que já foi corrigido na visão ao vivo.
CREATE TABLE IF NOT EXISTS public.composicao_mes_equipe (
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  mes        TEXT NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  equipe_id  UUID NOT NULL,
  nome       TEXT NOT NULL,
  setor_id   UUID,
  PRIMARY KEY (empresa_id, mes, equipe_id)
);

CREATE INDEX IF NOT EXISTS idx_composicao_mes_empresa_mes
  ON public.composicao_mes (empresa_id, mes);
CREATE INDEX IF NOT EXISTS idx_composicao_mes_equipe_empresa_mes
  ON public.composicao_mes_equipe (empresa_id, mes);

-- ── RLS: leitura para quem é da empresa; escrita só pelas funções ───────────

ALTER TABLE public.composicao_mes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.composicao_mes_equipe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS composicao_mes_leitura ON public.composicao_mes;
CREATE POLICY composicao_mes_leitura ON public.composicao_mes
  FOR SELECT TO authenticated
  USING (empresa_id = (SELECT p.empresa_id FROM public.perfis p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS composicao_mes_equipe_leitura ON public.composicao_mes_equipe;
CREATE POLICY composicao_mes_equipe_leitura ON public.composicao_mes_equipe
  FOR SELECT TO authenticated
  USING (empresa_id = (SELECT p.empresa_id FROM public.perfis p WHERE p.id = auth.uid()));

-- ── A foto ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_composicao_mes_snapshot(
  p_empresa_id UUID,
  p_mes        TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linhas INTEGER;
BEGIN
  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  -- Regravar por inteiro é mais simples e mais seguro que reconciliar linha a
  -- linha: a foto é sempre o estado completo daquele instante.
  DELETE FROM public.composicao_mes        WHERE empresa_id = p_empresa_id AND mes = p_mes;
  DELETE FROM public.composicao_mes_equipe WHERE empresa_id = p_empresa_id AND mes = p_mes;

  INSERT INTO public.composicao_mes_equipe (empresa_id, mes, equipe_id, nome, setor_id)
  SELECT p_empresa_id, p_mes, e.id, e.nome, e.setor_id
  FROM public.equipes e
  WHERE e.empresa_id = p_empresa_id;

  INSERT INTO public.composicao_mes
    (empresa_id, mes, operador_id, equipe_id, equipe_nome, setor_id, situacao, equipes_clone)
  SELECT
    p_empresa_id,
    p_mes,
    p.id,
    p.equipe_id,
    COALESCE(e.nome, 'Sem equipe'),
    -- Mesma precedência da visão ao vivo: o setor é o da EQUIPE; quem não tem
    -- equipe usa o setor do próprio perfil.
    COALESCE(e.setor_id, p.setor_id),
    COALESCE(p.situacao, 'ativo'),
    COALESCE(
      (SELECT array_agg(c.equipe_id)
         FROM public.equipe_operadores_clones c
        WHERE c.empresa_id = p_empresa_id
          AND c.operador_id = p.id
          AND COALESCE(c.conta_recebimento, TRUE)),
      '{}'::UUID[]
    )
  FROM public.perfis p
  LEFT JOIN public.equipes e ON e.id = p.equipe_id
  WHERE p.empresa_id = p_empresa_id;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_composicao_mes_snapshot(UUID, TEXT) TO authenticated;

-- ── Congelamento diário do mês corrente ─────────────────────────────────────
--
-- Roda todo dia às 23:50 em vez de só no último dia: assim o último dia do mês
-- está sempre coberto, mesmo que o cron de um dia específico falhe. Refazer a
-- foto do mês corrente é inofensivo — ele ainda está aberto.
--
-- O mês é o de São Paulo, não o do servidor: em UTC, às 23:50 do dia 31 já é
-- dia 1º do mês seguinte, e a foto seria gravada no mês errado.

CREATE OR REPLACE FUNCTION public.fn_composicao_mes_congelar()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes      TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_empresa  RECORD;
  v_total    INTEGER := 0;
BEGIN
  FOR v_empresa IN SELECT id FROM public.empresas LOOP
    v_total := v_total + public.fn_composicao_mes_snapshot(v_empresa.id, v_mes);
  END LOOP;
  RETURN v_total;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('composicao-mes-congelar')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'composicao-mes-congelar');

    -- 23:50 em São Paulo = 02:50 UTC do dia seguinte. O pg_cron do Supabase
    -- roda em UTC, e a função resolve o mês pelo fuso de São Paulo.
    PERFORM cron.schedule(
      'composicao-mes-congelar',
      '50 2 * * *',
      'SELECT public.fn_composicao_mes_congelar();'
    );
  ELSE
    RAISE NOTICE 'pg_cron ausente: rode fn_composicao_mes_congelar() por outro agendador.';
  END IF;
END;
$$;

-- ── Backfill ────────────────────────────────────────────────────────────────
--
-- Um retrato para cada (empresa, mês) que já tem analítico ou recebimento
-- diário. Repetindo o aviso do topo: para os meses já fechados isto grava o
-- estado de HOJE, porque a composição da época nunca foi registrada. É o melhor
-- que existe; daqui para a frente o retrato é real.

DO $$
DECLARE
  v_par RECORD;
BEGIN
  FOR v_par IN
    SELECT DISTINCT empresa_id, to_char(data_pagamento, 'YYYY-MM') AS mes
      FROM public.analitico_recebimentos
     WHERE data_pagamento IS NOT NULL
    UNION
    SELECT DISTINCT empresa_id, to_char(dia_referencia, 'YYYY-MM') AS mes
      FROM public.diario_recebimentos
     WHERE dia_referencia IS NOT NULL
  LOOP
    PERFORM public.fn_composicao_mes_snapshot(v_par.empresa_id, v_par.mes);
  END LOOP;
END;
$$;

-- Confere o que ficou gravado.
SELECT mes, COUNT(*) AS operadores, COUNT(DISTINCT equipe_id) AS equipes
  FROM public.composicao_mes
 GROUP BY mes
 ORDER BY mes DESC;
