-- ============================================================================
-- Painel Diretoria: o setor alternativo conta a linha só no setor da pessoa
-- ============================================================================
--
-- Irmã de 20261006180000 (desafio). `fn_mestre_diretoria_alternativos` somava
-- TODAS as linhas do 59 de quem está cadastrado ou clonado no setor
-- alternativo. O Painel Líder soma o alternativo pelo resumo por operador
-- (`fn_analitico_resumo_por_operador`), que desde 20260929211916 descarta, na
-- BookPlay a partir de set/2026, a linha carimbada num setor que não é da
-- pessoa. Thaynara Oliveira Santos, clonada no Marília Digital, tinha
-- R$ 1.432,83 carimbados no Play 4: o Painel Líder tirava, a diretoria somava.
--
-- O carimbo de uma linha do 59 é o que a sincronização grava no analítico
-- (`fn_mestre_projecao_analitico`): `fn_mestre_setor_resolvido` da carteira
-- vinculada e do destino da equipe. Linha sem carimbo (carteira sem setor,
-- equipe `somente_geral`) não chega ao analítico, então também sai daqui —
-- era o outro jeito de a diretoria somar o que o Painel Líder não vê.
--
-- A régua de «setor da pessoa» é `fn_analitico_setores_no_mes`: mês fechado
-- pelo retrato, mês corrente ao vivo. Só BookPlay, a partir de 2026-09, como
-- no resumo. Fora disso, todo carimbo conta.
--
-- O resto da função é o de 20260913201057 (colchão fora nas duas fatias).
-- Escrita: nenhuma. Reaplicável.
--
-- APLICADA em 06/10/2026 pelo MCP (apply_migration), registrada como
-- 20261006171409. O COMMENT da função cita 20261006200000, o número
-- provisório deste arquivo antes de aplicar — é esta mesma migration.
--
-- Medido no banco, BookPlay, antes → depois (corte de hoje, 06/10):
--   out/2026  Marília Digital ...... R$ 36.850,28 → R$ 36.729,28
--             Treinamento Marília .. R$ 17.396,33 → R$ 16.764,33
--             Treinamento .......... R$ 11.033,38 → R$  9.276,29
--   set/2026  Treinamento .......... R$ 27.048,36 → R$ 17.273,68
--             (Marília Digital e Treinamento Marília sem mudança)
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_alternativos(
  p_empresa_id uuid, p_mes text, p_dia_corte integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_mes      date;
  v_mes_ant  date;
  v_ult_dia  integer;
  v_corte    integer;
  v_hoje     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_mes_txt  text;
  v_ant_txt  text;
  v_regra    boolean;
  v_regra_ant boolean;
  v_res      jsonb;
BEGIN
  IF NOT (fn_user_is_super_admin() OR fn_can_access_empresa(p_empresa_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.';
  END IF;
  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  v_mes     := (p_mes || '-01')::date;
  v_mes_ant := (v_mes - interval '1 month')::date;
  v_ult_dia := extract(day FROM (v_mes + interval '1 month - 1 day'))::integer;
  v_corte   := coalesce(
    p_dia_corte,
    CASE WHEN date_trunc('month', v_hoje) = v_mes
         THEN extract(day FROM v_hoje)::integer ELSE v_ult_dia END);
  v_corte   := greatest(1, least(v_corte, v_ult_dia));
  v_mes_txt := p_mes;
  v_ant_txt := to_char(v_mes_ant, 'YYYY-MM');

  -- A regra do resumo por operador: BookPlay, a partir de set/2026.
  v_regra     := EXISTS (SELECT 1 FROM empresas e WHERE e.id = p_empresa_id AND e.slug = 'bookplay')
                 AND v_mes_txt >= '2026-09';
  v_regra_ant := v_regra AND v_ant_txt >= '2026-09';

  WITH
  alt AS (
    SELECT s.id, s.nome, s.foto_url
      FROM setores s
     WHERE s.empresa_id = p_empresa_id
       AND s.alternativo
       AND s.ativo IS NOT FALSE
  ),
  gente AS (
    SELECT a.id AS setor_id, p.id AS operador_id
      FROM alt a
      JOIN perfis p ON p.setor_id = a.id
    UNION
    SELECT a.id, c.operador_id
      FROM alt a
      JOIN equipes q ON q.setor_id = a.id
      JOIN equipe_operadores_clones c ON c.equipe_id = q.id
     WHERE coalesce(c.conta_recebimento, true)
  ),
  -- Colchão fora nas duas fatias (20260913201057). O carimbo é o da
  -- sincronização: só linha com carimbo chega ao analítico.
  linhas AS MATERIALIZED (
    SELECT r.operador_id, r.recebido,
           fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) AS carimbo
      FROM mestre_recebimentos r
      JOIN mestre_lotes l ON l.id = r.lote_id AND l.estado = 'vigente'
      JOIN mestre_grupos g
        ON g.empresa_id = r.empresa_id
       AND g.cod_grupo_filtro = r.cod_grupo_filtro
       AND g.estado = 'vinculado'
      LEFT JOIN mestre_equipes me
        ON me.empresa_id = r.empresa_id
       AND me.cod_grupo_filtro = r.cod_grupo_filtro
       AND me.nome_subgrupo = r.subgrupo_equipe
     WHERE r.empresa_id = p_empresa_id
       AND r.mes = v_mes
       AND r.operador_id IS NOT NULL
       AND fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       AND fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) IS NOT NULL
       AND (p_dia_corte IS NULL OR extract(day FROM r.dt_pgto) <= v_corte)
  ),
  linhas_ant AS MATERIALIZED (
    SELECT r.operador_id, r.recebido,
           fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) AS carimbo
      FROM mestre_recebimentos r
      JOIN mestre_lotes l ON l.id = r.lote_id AND l.estado = 'vigente'
      JOIN mestre_grupos g
        ON g.empresa_id = r.empresa_id
       AND g.cod_grupo_filtro = r.cod_grupo_filtro
       AND g.estado = 'vinculado'
      LEFT JOIN mestre_equipes me
        ON me.empresa_id = r.empresa_id
       AND me.cod_grupo_filtro = r.cod_grupo_filtro
       AND me.nome_subgrupo = r.subgrupo_equipe
     WHERE r.empresa_id = p_empresa_id
       AND r.mes = v_mes_ant
       AND r.operador_id IS NOT NULL
       AND fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       AND fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) IS NOT NULL
       AND extract(day FROM r.dt_pgto) <= v_corte
  ),
  -- Os setores de cada pessoa no mês; vazio quando a regra não vale, e então
  -- a condição de `soma` deixa tudo passar.
  casa AS MATERIALIZED (
    SELECT sm.operador_id, sm.setor_id
      FROM fn_analitico_setores_no_mes(
             p_empresa_id, v_mes_txt,
             ARRAY(SELECT DISTINCT g.operador_id FROM gente g)) sm
     WHERE v_regra
  ),
  casa_ant AS MATERIALIZED (
    SELECT sm.operador_id, sm.setor_id
      FROM fn_analitico_setores_no_mes(
             p_empresa_id, v_ant_txt,
             ARRAY(SELECT DISTINCT g.operador_id FROM gente g)) sm
     WHERE v_regra_ant
  ),
  soma AS (
    SELECT g.setor_id,
           coalesce(sum(l.recebido), 0)::numeric(14,2) valor,
           count(l.recebido)::bigint                   linhas,
           count(DISTINCT l.operador_id)::bigint       operadores
      FROM gente g
      LEFT JOIN linhas l
        ON l.operador_id = g.operador_id
       AND (NOT EXISTS (SELECT 1 FROM casa h WHERE h.operador_id = l.operador_id)
            OR EXISTS (SELECT 1 FROM casa h WHERE h.operador_id = l.operador_id AND h.setor_id = l.carimbo))
     GROUP BY g.setor_id
  ),
  soma_ant AS (
    SELECT g.setor_id,
           coalesce(sum(l.recebido), 0)::numeric(14,2) valor,
           count(l.recebido)::bigint                   linhas
      FROM gente g
      LEFT JOIN linhas_ant l
        ON l.operador_id = g.operador_id
       AND (NOT EXISTS (SELECT 1 FROM casa_ant h WHERE h.operador_id = l.operador_id)
            OR EXISTS (SELECT 1 FROM casa_ant h WHERE h.operador_id = l.operador_id AND h.setor_id = l.carimbo))
     GROUP BY g.setor_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'setor_id',          a.id,
           'setor_nome',        a.nome,
           'foto_url',          a.foto_url,
           'valor',             coalesce(s.valor, 0),
           'linhas',            coalesce(s.linhas, 0),
           'operadores',        coalesce(s.operadores, 0),
           'pessoas',           (SELECT count(*) FROM gente g WHERE g.setor_id = a.id),
           'valor_anterior',    coalesce(sa.valor, 0),
           'tem_anterior',      coalesce(sa.linhas, 0) > 0,
           'carteiras',         0,
           'tem_grupo',         false,
           'integral_recebido', 0,
           'movido_para_ca',    0
         ) ORDER BY coalesce(s.valor, 0) DESC), '[]'::jsonb)
    INTO v_res
    FROM alt a
    LEFT JOIN soma     s  ON s.setor_id  = a.id
    LEFT JOIN soma_ant sa ON sa.setor_id = a.id;

  RETURN v_res;
END;
$function$;

COMMENT ON FUNCTION public.fn_mestre_diretoria_alternativos(uuid, text, integer) IS
  'Setores alternativos, somados pela GENTE deles e nao por carteira. Colchao fora (20260913201057). '
  'Desde 20261006200000: so linha com carimbo (o setor que a sincronizacao grava no analitico), e na '
  'BookPlay a partir de 2026-09 so se o carimbo for um setor da pessoa no mes (fn_analitico_setores_no_mes) '
  '- a regra do resumo por operador do Painel Lider.';

COMMIT;
