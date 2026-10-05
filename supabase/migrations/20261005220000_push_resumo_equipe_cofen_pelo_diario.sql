-- ============================================================================
-- Avisos de equipe e de faixa pela REGRA do setor; o de equipe Cofen pelo diário
-- ============================================================================
--
-- ## O que estava errado (conferido em 05/10/2026)
--
-- O resumo de hora em hora para quem lidera (`fn_push_resumo_equipes`) somava
-- o recebido de hoje SEMPRE pelo analítico (`fn_recebido_por_equipe`). Na
-- regra Cofen, a aba Hoje do celular e o resto do app contam o recebimento
-- pelo relatório DIÁRIO (o 945) — o analítico do ERP não credita Coren nem o
-- indireto. Resultado no Conecta Play, no mesmo instante:
--
--     COFEN BRUNA CHATPLAY        aviso R$ 49.716   tela R$ 54.717
--     COFEN MARÍLIA - STEPHANIE   aviso R$ 10.963   tela R$ 12.677
--
-- ## A regra
--
-- Decidido pela REGRA DO SETOR da equipe (`setores.regra`), não pela empresa
-- (CLAUDE.md, «Cofen não é PaguePlay»):
--
--   nosso_produto  como antes: `fn_recebido_por_equipe` (analítico, com a
--                  regra do setor da pessoa, fantasma e clones);
--   cofen          diário de hoje dos membros, clones e líderes da equipe
--                  (`equipe_membros`) — o mesmo recorte da aba Hoje.
--
-- Valores em bruto nos dois casos, como a aba Hoje. Cada linha do diário é um
-- pagamento: a contagem «N pagamentos» continua valendo.
--
-- ## E o aviso de faixa do operador
--
-- `fn_push_operadores_na_faixa` decidia H.O. pela empresa (`slug = 'pagueplay'`);
-- passa a decidir pela regra do setor da pessoa. Conferido antes: hoje as duas
-- dão o mesmo resultado (regra e empresa coincidem em todos os setores).
--
-- Só essas duas funções mudam. Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_push_resumo_equipes()
RETURNS jsonb
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
  -- A regra do setor da equipe decide a fonte do recebido.
  regra AS (
    SELECT ed.equipe_id, e.empresa_id, (s.regra = 'cofen') AS cofen
      FROM equipes_dest ed
      JOIN public.equipes e ON e.id = ed.equipe_id
      LEFT JOIN public.setores s ON s.id = e.setor_id
  ),
  receb_analitico AS (
    SELECT r.equipe_id, r.total, r.qtd
      FROM public.fn_recebido_por_equipe(v_empresas, v_mes, v_hoje, v_hoje, FALSE) r
      JOIN regra rg ON rg.equipe_id = r.equipe_id AND rg.cofen IS NOT TRUE
  ),
  receb_diario AS (
    SELECT rg.equipe_id, SUM(d.valor_recebido)::NUMERIC AS total, COUNT(*)::BIGINT AS qtd
      FROM regra rg
      JOIN (SELECT DISTINCT m.equipe_id, m.pessoa_id FROM public.equipe_membros m) m
        ON m.equipe_id = rg.equipe_id
      JOIN public.diario_recebimentos d
        ON d.operador_id    = m.pessoa_id
       AND d.empresa_id     = rg.empresa_id
       AND d.data_pagamento = v_hoje
     WHERE rg.cofen
     GROUP BY rg.equipe_id
  ),
  receb AS (
    SELECT * FROM receb_analitico
    UNION ALL
    SELECT * FROM receb_diario
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

COMMENT ON FUNCTION public.fn_push_resumo_equipes() IS
  'Resumo de hora em hora do recebido de hoje por equipe, para quem lidera. A fonte segue a '
  'regra do setor da equipe: Nosso produto pelo analítico (fn_recebido_por_equipe), Cofen pelo '
  'relatório diário. Ver 20261005220000.';

-- ── Aviso de faixa do operador: H.O. pela regra do setor da pessoa ──────────
-- Era `empresas.slug = 'pagueplay'`. Agora é `setores.regra = 'cofen'` do setor
-- da pessoa (sem setor ou sem regra lida: a empresa, como antes). A conta é a
-- mesma do cartão do celular: recebido do analítico (H.O. no Cofen) contra a
-- meta e as faixas convertidas pelo percentual de H.O.
CREATE OR REPLACE FUNCTION public.fn_push_operadores_na_faixa(p_empresas uuid[], p_mes text)
RETURNS TABLE(perfil_id uuid, empresa_id uuid, faixa integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  ref AS (SELECT to_date(p_mes || '-01', 'YYYY-MM-DD') AS ini),
  pct AS (SELECT public.fn_pp_ho_percentual() AS v),
  metas_op AS (
    SELECT DISTINCT ON (m.referencia_id, m.empresa_id)
           m.referencia_id AS perfil_id, m.empresa_id, m.meta_valor, m.metas_extras
      FROM public.metas m, ref
     WHERE m.empresa_id = ANY (p_empresas)
       AND m.tipo = 'operador'
       AND m.mes = EXTRACT(MONTH FROM ref.ini)
       AND m.ano = EXTRACT(YEAR FROM ref.ini)
     ORDER BY m.referencia_id, m.empresa_id
  ),
  -- A unidade de cada pessoa: H.O. quando o setor dela é Cofen.
  unidade AS (
    SELECT mo.perfil_id, mo.empresa_id,
           COALESCE(s.regra = 'cofen', em.slug = 'pagueplay') AS em_ho
      FROM metas_op mo
      JOIN public.empresas em ON em.id = mo.empresa_id
      LEFT JOIN public.perfis p  ON p.id = mo.perfil_id
      LEFT JOIN public.setores s ON s.id = p.setor_id
  ),
  receb AS (
    SELECT ar.operador_id AS perfil_id, ar.empresa_id,
           SUM(CASE WHEN u.em_ho THEN COALESCE(ar.total_ho, 0) ELSE ar.valor_recebido END) AS v
      FROM public.analitico_recebimentos ar
      JOIN unidade u ON u.perfil_id = ar.operador_id AND u.empresa_id = ar.empresa_id, ref
     WHERE ar.data_pagamento >= ref.ini
       AND ar.data_pagamento < (ref.ini + INTERVAL '1 month')::DATE
     GROUP BY ar.operador_id, ar.empresa_id
  ),
  ajuste AS (
    SELECT a.operador_id AS perfil_id, a.empresa_id,
           SUM(a.valor) * CASE WHEN u.em_ho THEN (SELECT v FROM pct) ELSE 1 END AS v
      FROM public.analitico_ajustes_manuais a
      JOIN unidade u ON u.perfil_id = a.operador_id AND u.empresa_id = a.empresa_id, ref
     WHERE a.mes_referencia = ref.ini
       AND a.cancelado IS NOT TRUE
     GROUP BY a.operador_id, a.empresa_id, u.em_ho
  ),
  total AS (
    SELECT mo.perfil_id, mo.empresa_id, COALESCE(r.v, 0) + COALESCE(aj.v, 0) AS recebido
      FROM metas_op mo
      LEFT JOIN receb r   ON r.perfil_id  = mo.perfil_id AND r.empresa_id  = mo.empresa_id
      LEFT JOIN ajuste aj ON aj.perfil_id = mo.perfil_id AND aj.empresa_id = mo.empresa_id
  ),
  degraus AS (
    SELECT mo.perfil_id, mo.empresa_id,
           ROUND(d.v * CASE WHEN u.em_ho THEN (SELECT v FROM pct) ELSE 1 END, 2) AS valor
      FROM metas_op mo
      JOIN unidade u ON u.perfil_id = mo.perfil_id AND u.empresa_id = mo.empresa_id
     CROSS JOIN LATERAL (
       SELECT mo.meta_valor::NUMERIC AS v
       UNION ALL
       SELECT x::NUMERIC FROM jsonb_array_elements_text(COALESCE(mo.metas_extras, '[]'::JSONB)) x
     ) d
     WHERE d.v > 0
  )
  SELECT t.perfil_id, t.empresa_id, COUNT(*)::INT AS faixa
    FROM total t
    JOIN degraus g ON g.perfil_id = t.perfil_id AND g.empresa_id = t.empresa_id
   WHERE t.recebido >= g.valor
   GROUP BY t.perfil_id, t.empresa_id;
$function$;

DO $prova$
BEGIN
  IF position('regra' IN pg_get_functiondef('public.fn_push_operadores_na_faixa(uuid[],text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_push_operadores_na_faixa não ficou pela regra do setor';
  END IF;
  IF to_regprocedure('public.fn_push_resumo_equipes()') IS NULL THEN
    RAISE EXCEPTION 'fn_push_resumo_equipes sumiu';
  END IF;
  IF position('diario_recebimentos' IN pg_get_functiondef('public.fn_push_resumo_equipes()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_push_resumo_equipes não ficou na versão com o diário';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261005220000', 'push_resumo_equipe_cofen_pelo_diario')
ON CONFLICT DO NOTHING;

COMMIT;
