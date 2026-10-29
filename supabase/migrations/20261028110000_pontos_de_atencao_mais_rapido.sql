-- ============================================================================
-- Pontos de atenção de uso: a mesma conta, sem refazer nada por pessoa — 28/10/2026
-- ============================================================================
--
-- Medido em produção logo depois de 20261028100000 (super admin, leitura):
--
--     PaguePlay    93 ms     42 mil páginas
--     BookPlay   1.925 ms    646 mil páginas    ← 20 pessoas na lista
--
-- A versão em SQL puro deixava o planejador decidir quando avaliar cada CTE, e
-- os pedaços que não dependem da pessoa — permissão, alcance, os dias válidos
-- (que agrupam 90 dias de `uso_sessoes`) — podiam ser refeitos para cada linha.
--
-- Esta versão é plpgsql e calcula UMA vez, antes de olhar a primeira pessoa:
--
--   • a porta (empresa e `ver_usuarios`) — se não passa, nem começa;
--   • o alcance, num array;
--   • os dias válidos, num array (útil, sem feriado, com telemetria);
--   • as ausências e o último «ignorar» de quem entra, MATERIALIZED.
--
-- A regra é a de 20261028100000, linha por linha; só o caminho mudou. A
-- assinatura e as colunas são as mesmas: a tela não muda.
--
-- Reverter: reaplicar `fn_uso_pontos_de_atencao` de 20261028100000.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_uso_pontos_de_atencao(p_empresa_id uuid)
RETURNS TABLE (
  operador_id         uuid,
  nome                text,
  foto_url            text,
  setor_nome          text,
  equipe_nome         text,
  menor_aprendiz      boolean,
  ultimo_uso          date,      -- NULL = nunca usou
  dias_sem_uso        integer,
  limite              integer,
  ignorado_em         timestamptz,
  ignorado_comentario text,
  ignorado_por_nome   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_hoje    date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ini     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 90;
  v_alcance uuid[];
  v_dias    date[];
  v_base    integer;
BEGIN
  -- A porta, uma vez.
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT (public.fn_user_tem('ver_usuarios') OR public.fn_user_is_super_admin()) THEN
    RETURN;
  END IF;

  v_alcance := ARRAY(SELECT public.fn_usuarios_alcancados());

  -- Operadores ativos da empresa: a base dos 20% de telemetria.
  SELECT count(*) INTO v_base
    FROM public.perfis p
    JOIN public.cargos c ON c.slug = p.perfil
   WHERE p.empresa_id = p_empresa_id
     AND c.conta_no_recebimento AND p.ativo
     AND COALESCE(p.situacao, 'ativo') = 'ativo'
     AND NOT COALESCE(p.robo, false);

  -- Os dias que podem contar: úteis, já terminados, sem feriado da empresa,
  -- e com telemetria de pelo menos 20% dos operadores.
  v_dias := ARRAY(
    SELECT s.dia
      FROM public.uso_sessoes s
     WHERE s.empresa_id = p_empresa_id
       AND s.dia >= v_ini AND s.dia < v_hoje
       AND extract(isodow FROM s.dia) < 6
       AND to_char(s.dia, 'YYYY-MM-DD') NOT IN (
             SELECT left(f, 10)
               FROM public.metas_config_mes m,
                    LATERAL jsonb_array_elements_text(
                      CASE WHEN jsonb_typeof(m.feriados::jsonb) = 'array' THEN m.feriados::jsonb
                           ELSE '[]'::jsonb END) f
              WHERE m.empresa_id = p_empresa_id
                AND make_date(m.ano, m.mes, 1) >= date_trunc('month', v_ini)::date)
     GROUP BY s.dia
    HAVING count(DISTINCT s.usuario_id) >= GREATEST(1, 0.2 * v_base)
  );

  RETURN QUERY
  WITH alvo AS MATERIALIZED (
    SELECT p.id, p.nome AS pnome, p.foto_url AS pfoto, p.setor_id, p.equipe_id,
           COALESCE(p.menor_aprendiz, false) AS aprendiz,
           (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS criado
      FROM public.perfis p
      JOIN public.cargos c ON c.slug = p.perfil
     WHERE p.empresa_id = p_empresa_id
       AND p.id = ANY (v_alcance)
       AND c.conta_no_recebimento
       AND p.ativo
       AND COALESCE(p.situacao, 'ativo') = 'ativo'
       AND NOT COALESCE(p.robo, false)
       AND NOT COALESCE(p.arquivado, false)
       AND p.nome !~* 'superv'
  ),
  ultimo_ignorar AS MATERIALIZED (
    SELECT DISTINCT ON (i.operador_id)
           i.operador_id AS pid, i.ignorado_em AS quando, i.comentario AS texto, i.ignorado_por AS por
      FROM public.uso_atencao_ignorados i
     WHERE i.operador_id IN (SELECT a.id FROM alvo a)
     ORDER BY i.operador_id, i.ignorado_em DESC
  ),
  aus AS MATERIALIZED (
    SELECT au.operador_id AS pid, au.inicio, au.fim
      FROM public.ausencias au
     WHERE au.operador_id IN (SELECT a.id FROM alvo a)
       AND au.fim >= v_ini
  ),
  base AS MATERIALIZED (
    SELECT a.*,
           GREATEST(
             (SELECT max(s.dia) FROM public.uso_sessoes s WHERE s.usuario_id = a.id),
             (SELECT max(t.dia) FROM public.uso_telas t WHERE t.usuario_id = a.id),
             (SELECT (o.visto_em AT TIME ZONE 'America/Sao_Paulo')::date
                FROM public.presenca_online o WHERE o.user_id = a.id),
             (SELECT (u.last_sign_in_at AT TIME ZONE 'America/Sao_Paulo')::date
                FROM auth.users u WHERE u.id = a.id)
           ) AS uso,
           ui.quando, ui.texto, ui.por,
           (SELECT max(x.fim) FROM aus x WHERE x.pid = a.id AND x.fim < v_hoje) AS aus_fim
      FROM alvo a
      LEFT JOIN ultimo_ignorar ui ON ui.pid = a.id
  ),
  partida AS MATERIALIZED (
    SELECT b.*,
           GREATEST(b.uso, b.criado, (b.quando AT TIME ZONE 'America/Sao_Paulo')::date, b.aus_fim) AS desde
      FROM base b
  ),
  contagem AS (
    SELECT pa.id AS pid,
           (SELECT count(*)
              FROM unnest(v_dias) d(dia)
             WHERE d.dia > pa.desde
               AND NOT EXISTS (
                 SELECT 1 FROM aus x
                  WHERE x.pid = pa.id AND d.dia BETWEEN x.inicio AND x.fim))::int AS dias
      FROM partida pa
  )
  SELECT pa.id, pa.pnome, pa.pfoto, s.nome, e.nome, pa.aprendiz,
         pa.uso, ct.dias,
         CASE WHEN pa.aprendiz THEN 5 ELSE 4 END,
         pa.quando, pa.texto, ip.nome
    FROM partida pa
    JOIN contagem ct ON ct.pid = pa.id
    LEFT JOIN public.setores s ON s.id = pa.setor_id
    LEFT JOIN public.equipes e ON e.id = pa.equipe_id
    LEFT JOIN public.perfis ip ON ip.id = pa.por
   WHERE ct.dias >= CASE WHEN pa.aprendiz THEN 5 ELSE 4 END
   ORDER BY ct.dias DESC, pa.pnome;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_uso_pontos_de_atencao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_uso_pontos_de_atencao(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_uso_pontos_de_atencao(uuid) IS
  'Quem está ativo e há 4+ dias úteis (aprendiz 5+) sem abrir o Gestão, no alcance '
  'da aba Usuários. Quatro fontes de uso; dia sem telemetria não conta. '
  'plpgsql: porta, alcance e dias válidos calculados uma vez (20261028110000).';

DO $conf$
BEGIN
  IF has_function_privilege('anon', 'public.fn_uso_pontos_de_atencao(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_uso_pontos_de_atencao não pode ser do anon.';
  END IF;
END
$conf$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261028110000', 'pontos_de_atencao_mais_rapido', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
