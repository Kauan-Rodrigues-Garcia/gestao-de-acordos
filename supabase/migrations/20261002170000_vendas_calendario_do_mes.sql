-- ============================================================================
-- Comercial: dias uteis configuraveis por mes
-- ============================================================================
--
-- Pedido de 02/10/2026: «Em metas tem que colocar dias úteis também ser
-- configurado». Ate aqui o Comercial contava segunda a sexta, sem feriado, em
-- todo lugar — na tela (`diasUteisDoMes(ano, mes)` com lista vazia) e no
-- placar (`fn_vendas_placar_pessoas`, ISODOW <= 5). Feriado nacional baixava a
-- meta diaria de ninguem, e quem vende no sabado nao tinha como dizer.
--
-- ## Tabela propria, e nao `metas_config_mes`
--
-- `metas_config_mes` e da cobranca: quartis, `contar_dia_atual`, e escrita
-- presa a `metas_editar_dias_uteis`, chave que o painel do Comercial nao mostra.
-- Aqui o calendario tem duas perguntas — quais dias NAO contam (feriados) e se
-- o SABADO conta — e quem grava e quem define a meta (`editar_metas_vendas`).
--
-- ## Uma regra, dois lados
--
--   SQL  `fn_vendas_dia_util(empresa, dia)` (esta migration)
--   TS   `ehDiaUtilComercial` em `src/lib/vendasCalendario.ts`
--
-- O placar devolve `dias_uteis_do_mes` e os dias abatidos por ausencia; a tela
-- divide a meta por eles. Os dois TEM de contar o mesmo calendario, ou o
-- numerador e o denominador da meta proporcional falam de meses diferentes —
-- por isso `fn_vendas_placar_pessoas` e reescrita aqui, igual a 20260915230000
-- a menos do dia util.
--
-- Mes sem linha = segunda a sexta, sem feriado: exatamente o que valia antes.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';

-- ── 1. A tabela ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendas_calendario_mes (
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ano           INTEGER NOT NULL CHECK (ano >= 2024),
  mes           INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  -- Dias que NAO contam, mesmo caindo em dia de trabalho.
  feriados      DATE[] NOT NULL DEFAULT '{}',
  -- Sabado conta como dia util inteiro.
  sabado_util   BOOLEAN NOT NULL DEFAULT FALSE,
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, ano, mes)
);

COMMENT ON TABLE public.vendas_calendario_mes IS
  'Calendario de dias uteis do Comercial por mes: feriados e se sabado conta. '
  'Sem linha = segunda a sexta. Escrita so por fn_vendas_calendario_salvar.';

ALTER TABLE public.vendas_calendario_mes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vendas_calendario_mes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.vendas_calendario_mes FROM authenticated;
GRANT SELECT ON TABLE public.vendas_calendario_mes TO authenticated;

DROP POLICY IF EXISTS vendas_calendario_mes_select ON public.vendas_calendario_mes;
CREATE POLICY vendas_calendario_mes_select ON public.vendas_calendario_mes
  FOR SELECT TO authenticated
  USING (
    empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])
    OR (SELECT public.fn_user_is_super_admin())
  );

-- ── 2. A regra do dia util ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vendas_dia_util(p_empresa_id UUID, p_dia DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE EXTRACT(ISODOW FROM p_dia)::INTEGER
           WHEN 7 THEN FALSE
           WHEN 6 THEN COALESCE(c.sabado_util, FALSE)
           ELSE TRUE
         END
         AND NOT (p_dia = ANY (COALESCE(c.feriados, '{}'::DATE[])))
    FROM (SELECT 1) AS um
    LEFT JOIN public.vendas_calendario_mes c
      ON c.empresa_id = p_empresa_id
     AND c.ano = EXTRACT(YEAR FROM p_dia)::INTEGER
     AND c.mes = EXTRACT(MONTH FROM p_dia)::INTEGER;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_dia_util(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_dia_util(UUID, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_dia_util(UUID, DATE) IS
  'Dia util do Comercial: seg-sex (e sabado, se o mes disser), menos feriados. '
  'Espelho em TS: ehDiaUtilComercial (src/lib/vendasCalendario.ts).';

-- ── 3. Gravar ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vendas_calendario_salvar(
  p_empresa_id  UUID,
  p_ano         INTEGER,
  p_mes         INTEGER,
  p_feriados    DATE[],
  p_sabado_util BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_inicio   DATE;
  v_feriados DATE[];
BEGIN
  IF NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('editar_metas_vendas')) THEN
    RAISE EXCEPTION 'Configurar os dias úteis exige a permissão de definir a meta de vendas.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;
  IF p_ano IS NULL OR p_mes IS NULL OR p_mes NOT BETWEEN 1 AND 12 OR p_ano < 2024 THEN
    RAISE EXCEPTION 'Competência inválida.' USING ERRCODE = '22023';
  END IF;

  v_inicio := make_date(p_ano, p_mes, 1);

  -- Feriado fora do mes e ignorado (e nao recusado): a tela manda a lista do
  -- mes, e uma data colada errada nao deveria travar o resto.
  SELECT COALESCE(array_agg(DISTINCT d ORDER BY d), '{}'::DATE[]) INTO v_feriados
    FROM unnest(COALESCE(p_feriados, '{}'::DATE[])) AS d
   WHERE d >= v_inicio AND d < (v_inicio + INTERVAL '1 month')::DATE;

  IF cardinality(v_feriados) = 0 AND NOT COALESCE(p_sabado_util, FALSE) THEN
    -- O padrao nao precisa de linha.
    DELETE FROM public.vendas_calendario_mes
     WHERE empresa_id = p_empresa_id AND ano = p_ano AND mes = p_mes;
    RETURN;
  END IF;

  INSERT INTO public.vendas_calendario_mes
    (empresa_id, ano, mes, feriados, sabado_util, atualizado_por, atualizado_em)
  VALUES
    (p_empresa_id, p_ano, p_mes, v_feriados, COALESCE(p_sabado_util, FALSE), (SELECT auth.uid()), NOW())
  ON CONFLICT (empresa_id, ano, mes) DO UPDATE SET
    feriados       = EXCLUDED.feriados,
    sabado_util    = EXCLUDED.sabado_util,
    atualizado_por = EXCLUDED.atualizado_por,
    atualizado_em  = NOW();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_calendario_salvar(UUID, INTEGER, INTEGER, DATE[], BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_calendario_salvar(UUID, INTEGER, INTEGER, DATE[], BOOLEAN) TO authenticated;

-- ── 4. O placar conta o mesmo calendario ────────────────────────────────────
--
-- Igual a 20260915230000, com `fn_vendas_dia_util` no lugar de ISODOW <= 5 nos
-- dois pontos: o total de dias uteis e os dias abatidos por ausencia.

CREATE OR REPLACE FUNCTION public.fn_vendas_placar_pessoas(
  p_empresa_id UUID,
  p_mes        DATE DEFAULT NULL
)
RETURNS TABLE(
  id                 UUID,
  nome               TEXT,
  foto_url           TEXT,
  cargo              TEXT,
  situacao           TEXT,
  robo               BOOLEAN,
  equipe_id          UUID,
  equipe_nome        TEXT,
  setor_id           UUID,
  setor_nome         TEXT,
  dias_abatidos      NUMERIC,
  dias_uteis_do_mes  INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH janela AS (
    SELECT DATE_TRUNC('month', p_mes)::DATE                       AS ini,
           (DATE_TRUNC('month', p_mes) + INTERVAL '1 month -1 day')::DATE AS fim
     WHERE p_mes IS NOT NULL
  ),
  uteis AS (
    SELECT COUNT(*)::INTEGER AS n
      FROM janela j,
           LATERAL generate_series(j.ini, j.fim, INTERVAL '1 day') AS d(dia)
     WHERE public.fn_vendas_dia_util(p_empresa_id, d.dia::DATE)
  ),
  pessoas AS (
    SELECT p.id, p.nome, p.foto_url, p.perfil, p.situacao, p.setor_id,
           COALESCE(p.robo, false) AS robo,
           public.fn_vendas_equipe_que_credita(p.id) AS equipe_credita
      FROM public.perfis p
     WHERE p.empresa_id = p_empresa_id
       AND public.fn_can_access_empresa(p_empresa_id)
       AND NOT COALESCE(p.arquivado, false)
       AND p.perfil NOT IN ('administrador', 'super_admin')
  )
  SELECT p.id,
         p.nome,
         p.foto_url,
         p.perfil,
         p.situacao,
         p.robo,
         p.equipe_credita,
         e.nome,
         COALESCE(p.setor_id, e.setor_id),
         s.nome,
         COALESCE(a.dias, 0)::NUMERIC,
         COALESCE((SELECT n FROM uteis), 0)
    FROM pessoas p
    LEFT JOIN public.equipes e ON e.id = p.equipe_credita
    LEFT JOIN public.setores s ON s.id = COALESCE(p.setor_id, e.setor_id)
    LEFT JOIN LATERAL (
      SELECT SUM(x.peso) AS dias
        FROM (
          SELECT d.dia,
                 MAX(CASE WHEN au.meio_periodo AND au.inicio = au.fim THEN 0.5 ELSE 1 END) AS peso
            FROM public.ausencias au
            JOIN public.ausencias_tipos t ON t.tipo = au.tipo AND t.abate_meta
            CROSS JOIN janela j
            CROSS JOIN LATERAL generate_series(
                         GREATEST(au.inicio, j.ini),
                         LEAST(au.fim,       j.fim),
                         INTERVAL '1 day') AS d(dia)
           WHERE au.operador_id = p.id
             AND public.fn_vendas_dia_util(p_empresa_id, d.dia::DATE)
           GROUP BY d.dia
        ) x
    ) a ON TRUE
   WHERE public.fn_vendas_alcanca(
           p_empresa_id, p.id,
           COALESCE(p.setor_id, e.setor_id),
           p.equipe_credita)
   ORDER BY p.nome;
$function$;

COMMENT ON FUNCTION public.fn_vendas_placar_pessoas(UUID, DATE) IS
  'O cadastro que o placar do Comercial pergunta: quem e robo, em que equipe '
  'credita, e quantos dias uteis do mes perdeu em ausencia que abate meta. Dia '
  'util = fn_vendas_dia_util (20261002170000). Alcance por fn_vendas_alcanca.';

-- ── 5. Verificacao ──────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF to_regclass('public.vendas_calendario_mes') IS NULL THEN
    RAISE EXCEPTION 'vendas_calendario_mes nao foi criada.';
  END IF;
  -- Outubro/2026 sem linha: 22 dias de segunda a sexta.
  IF (SELECT COUNT(*) FROM generate_series('2026-10-01'::DATE, '2026-10-31'::DATE, INTERVAL '1 day') d
       WHERE public.fn_vendas_dia_util('00000000-0000-0000-0000-000000000000'::UUID, d::DATE)) <> 22 THEN
    RAISE EXCEPTION 'fn_vendas_dia_util nao reproduz o calendario padrao.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_vendas_placar_pessoas'
       AND pg_get_functiondef(p.oid) ILIKE '%fn_vendas_dia_util%'
  ) THEN
    RAISE EXCEPTION 'fn_vendas_placar_pessoas nao usa o calendario.';
  END IF;
END;
$verificacao$;

COMMIT;
