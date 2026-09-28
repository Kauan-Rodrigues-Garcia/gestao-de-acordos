-- ============================================================================
-- PaguePlay: o H.O. volta a vir do relatório, e o percentual vira configuração
-- ============================================================================
--
-- ## O pedido (29/09/2026)
--
-- 1. «O relatório analítico da PaguePlay não faz mais conta: ele pega a coluna
--    HO já com o valor correto. O H.O. passa a vir do relatório, e não de um
--    cálculo do sistema.»
--
-- 2. «Na aba Metas, a conversão automática usa 24,96%. Quero um campo para
--    alterar essa porcentagem, e o padrão agora é 22,60%.»
--
-- ## O que existia
--
-- Em 18/08/2026 (migration 20260818280000) o H.O. passou a ser CALCULADO: o
-- trigger `trg_analitico_recebimentos_ho` sobrescrevia `total_ho` com
-- `valor_recebido × 0,2496` em todo insert e update, porque a coluna do ERP
-- trazia 25,00% cravado (dividia por 4). O parser do front fazia a mesma conta
-- para a prévia. O número da planilha era jogado fora.
--
-- O ERP passou a mandar o H.O. certo — hoje ~22,60% do recebido. Com o trigger
-- no lugar, nem o parser lendo a coluna adiantaria: o banco descartaria.
--
-- ## O que muda
--
-- • `fn_pp_ho_percentual()` deixa de devolver a constante 0,2496 e passa a ler
--   `empresas.config.ho_percentual` da PaguePlay (padrão 0,2260). É ela que o
--   resumo mensal usa para o H.O. dos ajustes manuais.
--
-- • `fn_analitico_ho_calculado()` (o trigger) PARA DE SOBRESCREVER na PaguePlay:
--     - veio H.O. (o do relatório)          ... fica como veio;
--     - veio zero/nulo com valor recebido   ... calcula pelo percentual
--       configurado (quem grava sem relatório: o 59, se um dia a PaguePlay usar,
--       e escritas antigas que mandavam 0);
--     - num UPDATE, mudou o valor e ninguém mandou H.O. novo ... mantém a
--       proporção que a linha já tinha (a do relatório), em vez de trocar por
--       um percentual de fora.
--   Na BookPlay continua forçando zero.
--
-- • `fn_empresa_definir_ho_percentual` grava o campo da aba Metas, conferindo
--   `metas_editar` e o intervalo. `empresas` não é tabela que o navegador
--   atualiza direto.
--
-- • A PaguePlay passa a ter `ho_percentual = 0,2260`.
--
-- ## O que NÃO muda
--
-- Nenhuma linha de `analitico_recebimentos` é regravada aqui. O que já está no
-- banco foi gravado a 24,96% e continua assim até o mês ser reimportado: a
-- importação agora reconcilia o H.O. também (src/services/analitico/
-- analitico.service.ts) e troca o número de cada NR pelo do relatório.
-- Recalcular aqui a 22,60% seria trocar um palpite por outro.
--
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

-- ── 1. O percentual, lido da configuração da empresa ───────────────────────
--
-- SECURITY DEFINER: `empresas` tem RLS, e o trigger roda como quem importa.
-- Sem DEFINER, quem não enxerga a linha da empresa faria o percentual cair no
-- padrão em silêncio.
CREATE OR REPLACE FUNCTION public.fn_pp_ho_percentual()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT COALESCE(
    (SELECT CASE
              WHEN (e.config->>'ho_percentual') ~ '^[0-9]*\.?[0-9]+$'
               AND (e.config->>'ho_percentual')::numeric > 0
               AND (e.config->>'ho_percentual')::numeric < 1
              THEN (e.config->>'ho_percentual')::numeric
            END
       FROM public.empresas e
      WHERE e.slug = 'pagueplay'
      LIMIT 1),
    0.2260::numeric)
$fn$;

COMMENT ON FUNCTION public.fn_pp_ho_percentual() IS
  'Percentual de H.O. da PaguePlay: empresas.config.ho_percentual, padrão 0,2260. '
  'Editável na aba Metas. Espelha getHoPercentual() em src/lib/hoPercentual.ts. '
  'Migration 20260929030000.';

-- ── 2. O trigger para de sobrescrever o H.O. do relatório ──────────────────
CREATE OR REPLACE FUNCTION public.fn_analitico_ho_calculado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_pagueplay    boolean;
  v_proporcional boolean := false;
BEGIN
  SELECT e.slug = 'pagueplay' INTO v_pagueplay
    FROM public.empresas e
   WHERE e.id = new.empresa_id;

  -- BookPlay (e qualquer outra): não há H.O.
  IF NOT COALESCE(v_pagueplay, false) THEN
    new.total_ho := 0;
    RETURN new;
  END IF;

  -- `old` só é lido dentro do ramo de UPDATE: no INSERT ele não existe.
  IF TG_OP = 'UPDATE' THEN
    v_proporcional := new.valor_recebido IS DISTINCT FROM old.valor_recebido
                  AND new.total_ho IS NOT DISTINCT FROM old.total_ho
                  AND COALESCE(old.valor_recebido, 0) <> 0
                  AND COALESCE(old.total_ho, 0) <> 0;
  END IF;

  IF v_proporcional THEN
    -- Mudou o valor e ninguém mandou H.O. novo: a linha mantém a proporção
    -- que já tinha — a do relatório de onde ela veio.
    new.total_ho := round(new.valor_recebido * old.total_ho / old.valor_recebido, 2);
  ELSIF COALESCE(new.total_ho, 0) = 0 AND COALESCE(new.valor_recebido, 0) <> 0 THEN
    -- Sem H.O. de relatório: o percentual configurado da empresa.
    new.total_ho := round(new.valor_recebido * public.fn_pp_ho_percentual(), 2);
  ELSE
    -- O H.O. do relatório, como veio.
    new.total_ho := round(new.total_ho, 2);
  END IF;

  RETURN new;
END;
$fn$;

COMMENT ON FUNCTION public.fn_analitico_ho_calculado() IS
  'PaguePlay: mantém o total_ho que vem do relatório. Só calcula (percentual '
  'configurado) quando a linha chega sem H.O.; num update só de valor, mantém a '
  'proporção da linha. Demais empresas: zero. Migration 20260929030000 — até '
  'ela, sobrescrevia tudo com 24,96%.';

-- ── 3. Gravar o percentual pela aba Metas ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_empresa_definir_ho_percentual(
  p_empresa_id uuid,
  p_percentual numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_valor numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: sessão ausente' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('metas_editar') THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: seu cargo não pode editar metas' USING ERRCODE = '42501';
  END IF;
  IF p_percentual IS NULL OR p_percentual <= 0 OR p_percentual >= 1 THEN
    RAISE EXCEPTION 'PERCENTUAL_INVALIDO: use um valor entre 0%% e 100%%' USING ERRCODE = '22023';
  END IF;

  v_valor := round(p_percentual, 4);

  UPDATE public.empresas
     SET config        = COALESCE(config, '{}'::jsonb) || jsonb_build_object('ho_percentual', v_valor),
         atualizado_em = now()
   WHERE id = p_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EMPRESA_NAO_ENCONTRADA' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_valor;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_empresa_definir_ho_percentual(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_empresa_definir_ho_percentual(uuid, numeric) TO authenticated;

COMMENT ON FUNCTION public.fn_empresa_definir_ho_percentual(uuid, numeric) IS
  'Grava empresas.config.ho_percentual (fração, 0 < p < 1). Exige metas_editar. '
  'Usado pelo card «Percentual de H.O.» da aba Metas. Migration 20260929030000.';

-- ── 4. O padrão novo da PaguePlay ──────────────────────────────────────────
UPDATE public.empresas
   SET config        = COALESCE(config, '{}'::jsonb) || jsonb_build_object('ho_percentual', 0.2260),
       atualizado_em = now()
 WHERE slug = 'pagueplay'
   AND (config->>'ho_percentual') IS DISTINCT FROM '0.2260';

-- ── Verificação ────────────────────────────────────────────────────────────
DO $ver$
BEGIN
  IF public.fn_pp_ho_percentual() <> 0.2260 THEN
    RAISE EXCEPTION 'fn_pp_ho_percentual() devolveu %, esperado 0.2260', public.fn_pp_ho_percentual();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'analitico_recebimentos' AND t.tgname = 'trg_analitico_recebimentos_ho'
  ) THEN
    RAISE EXCEPTION 'trg_analitico_recebimentos_ho sumiu: a importação gravaria H.O. sem regra';
  END IF;
END $ver$;

commit;
