-- ============================================================================
-- Monitoramento de uso — a mesma pessoa uma vez so, e o perfil completo dela
-- ============================================================================
--
-- ## 1. A DUPLICIDADE
--
-- `uso_telas` tem chave primaria `(empresa_id, usuario_id, dia, tela)`. A
-- empresa faz parte da chave, e isso esta certo: o uso ACONTECEU numa operacao,
-- e somar Book com Pague num numero so apagaria de onde veio.
--
-- So que `fn_uso_por_pessoa` agrupava por `(usuario_id, empresa_id)`. Quem usa
-- as DUAS operacoes — super_admin, e quem tem acesso multiempresa — aparecia
-- DUAS VEZES na lista, com o tempo dividido entre as linhas. Somar as duas
-- mentalmente ninguem faz, entao a pessoa parecia usar metade do que usa. E, na
-- tabela de quem nao acessou, o mesmo nome podia sair de um lado e do outro.
--
-- A correcao agrupa por PESSOA. A empresa vira uma lista (`empresas`), e a
-- coluna `empresa_nome` passa a dizer "Book Play + Pague Play" quando for o
-- caso. Quem filtra por uma empresa continua vendo so aquela — o WHERE nao
-- mudou.
--
-- `empresa_id` continua no retorno por compatibilidade, com a empresa de MAIOR
-- uso: e a resposta util quando alguem precisa de uma so.
--
-- ## 2. O PERFIL DE UMA PESSOA
--
-- O pedido: "clicando no card da pessoa, saber tudo que ela fez — qual aba
-- acessou, quantas abas num dia, no mes, qual foi o dia que mais usou, quantas
-- acoes fez por dia".
--
-- Isso nao cabe em `uso_telas` sozinho. Navegacao mora ali; ACAO mora em
-- `logs_sistema`. `fn_uso_perfil_pessoa` junta as duas numa consulta so e
-- devolve JSON — e nao TABLE — porque sao sete recortes de formatos diferentes,
-- e sete RPCs seriam sete estados de carregamento numa janela que abre de uma
-- vez.
--
-- ### O que NAO entra aqui
--
-- O percentual de uso. Ele depende de DIAS UTEIS, que dependem de feriados
-- configurados em `metas_config_mes` — e a conta de dias uteis ja tem dono no
-- projeto (`src/lib/diasUteis.ts`), usada por metas, quartis e RH. Uma segunda
-- implementacao em SQL divergiria da primeira no primeiro feriado cadastrado.
-- A RPC devolve os dias em que a pessoa acessou; quem divide e o frontend.
--
-- ### SECURITY INVOKER
--
-- As duas tabelas tem RLS, e ela continua decidindo: administrador ve a propria
-- empresa, super_admin ve as duas. Pedir o id de alguem fora do escopo devolve
-- um perfil vazio, e nao um erro — que e o mesmo comportamento das outras
-- funcoes de uso.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Uso por pessoa: uma linha por PESSOA ────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_uso_por_pessoa(uuid, date, date, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_uso_por_pessoa(
  p_empresa_id uuid,          -- NULL = todas as empresas que a RLS permitir
  p_desde      date,
  p_ate        date,
  p_cargo      text DEFAULT NULL,
  p_setor_id   uuid DEFAULT NULL,
  p_equipe_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  usuario_id   uuid,
  nome         text,
  cargo        text,
  /** A empresa de MAIOR uso no periodo. Ver `empresas` para a lista inteira. */
  empresa_id   uuid,
  empresa_nome text,
  /** Todas as operacoes em que a pessoa teve uso no periodo. */
  empresas     text[],
  setor_nome   text,
  equipe_nome  text,
  aberturas    bigint,
  segundos     bigint,
  dias_ativos  bigint,
  telas_usadas bigint,
  ultimo_em    timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  WITH bruto AS (
    SELECT u.usuario_id,
           u.empresa_id,
           u.cargo,
           u.dia,
           u.tela,
           u.aberturas,
           u.segundos,
           u.ultimo_em
      FROM public.uso_telas u
      LEFT JOIN public.perfis p ON p.id = u.usuario_id
     WHERE (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
       AND u.dia BETWEEN p_desde AND p_ate
       AND (p_cargo     IS NULL OR u.cargo     = p_cargo)
       AND (p_setor_id  IS NULL OR p.setor_id  = p_setor_id)
       AND (p_equipe_id IS NULL OR p.equipe_id = p_equipe_id)
  ),
  -- A empresa de maior uso, uma por pessoa. `DISTINCT ON` em vez de agregado:
  -- nao existe `max(uuid)`, e o que se quer aqui nao e o maior id — e a empresa
  -- da linha com mais tempo.
  principal AS (
    SELECT DISTINCT ON (b.usuario_id)
           b.usuario_id, b.empresa_id
      FROM bruto b
     GROUP BY b.usuario_id, b.empresa_id
     ORDER BY b.usuario_id, SUM(b.segundos) DESC, b.empresa_id
  )
  SELECT b.usuario_id,
         COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario, '(removido)')::TEXT AS nome,
         -- Cargo da LINHA, nao do perfil: promover alguem nao pode reescrever o
         -- historico dele. `mode()` porque a pessoa pode ter mudado de cargo no
         -- meio da janela — vale aquele em que passou mais tempo.
         (mode() WITHIN GROUP (ORDER BY b.cargo))::TEXT AS cargo,
         pr.empresa_id,
         -- COALESCE por FORA da subconsulta: empresa fora do alcance da RLS faz
         -- a subconsulta devolver zero linhas, e um COALESCE lá dentro nunca
         -- chegaria a rodar — a coluna sairia nula em vez de '—'.
         COALESCE((SELECT e2.nome FROM public.empresas e2 WHERE e2.id = pr.empresa_id), '—')::TEXT
           AS empresa_nome,
         ARRAY(
           SELECT COALESCE(e3.nome, '—')
             FROM (SELECT DISTINCT b2.empresa_id FROM bruto b2 WHERE b2.usuario_id = b.usuario_id) x
             LEFT JOIN public.empresas e3 ON e3.id = x.empresa_id
            ORDER BY 1
         )::TEXT[] AS empresas,
         s.nome::TEXT  AS setor_nome,
         eq.nome::TEXT AS equipe_nome,
         SUM(b.aberturas)::BIGINT       AS aberturas,
         SUM(b.segundos)::BIGINT        AS segundos,
         -- DISTINCT no dia e na tela: a pessoa que abriu a mesma tela nas duas
         -- operacoes no mesmo dia usou UM dia e UMA tela, nao dois de cada.
         COUNT(DISTINCT b.dia)::BIGINT  AS dias_ativos,
         COUNT(DISTINCT b.tela)::BIGINT AS telas_usadas,
         MAX(b.ultimo_em)               AS ultimo_em
    FROM bruto b
    JOIN principal pr ON pr.usuario_id = b.usuario_id
    LEFT JOIN public.perfis  p  ON p.id = b.usuario_id
    LEFT JOIN public.setores s  ON s.id  = p.setor_id
    LEFT JOIN public.equipes eq ON eq.id = p.equipe_id
   GROUP BY b.usuario_id, pr.empresa_id, p.nome, p.usuario, s.nome, eq.nome
   ORDER BY SUM(b.segundos) DESC;
$function$;

-- ── 2. O perfil completo de uma pessoa ─────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_uso_perfil_pessoa(uuid, date, date);

CREATE OR REPLACE FUNCTION public.fn_uso_perfil_pessoa(
  p_usuario_id uuid,
  p_desde      date,
  p_ate        date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  WITH uso AS (
    SELECT u.* FROM public.uso_telas u
     WHERE u.usuario_id = p_usuario_id
       AND u.dia BETWEEN p_desde AND p_ate
  ),
  -- Acoes vem de `logs_sistema`: navegacao e uma coisa, ATO e outra. Quem abriu
  -- a tela de acordos dez vezes e nao mexeu em nada nao fez dez acoes.
  acoes AS (
    SELECT l.criado_em::DATE AS dia, l.categoria, l.acao, l.severidade
      FROM public.logs_sistema l
     WHERE l.usuario_id = p_usuario_id
       AND l.criado_em >= p_desde::TIMESTAMPTZ
       AND l.criado_em <  (p_ate + 1)::TIMESTAMPTZ
  ),
  por_dia AS (
    SELECT u.dia,
           SUM(u.aberturas)::BIGINT       AS aberturas,
           SUM(u.segundos)::BIGINT        AS segundos,
           COUNT(DISTINCT u.tela)::BIGINT AS telas
      FROM uso u GROUP BY u.dia
  ),
  por_tela AS (
    SELECT u.tela,
           SUM(u.aberturas)::BIGINT      AS aberturas,
           SUM(u.segundos)::BIGINT       AS segundos,
           COUNT(DISTINCT u.dia)::BIGINT AS dias,
           MIN(u.primeiro_em)            AS primeiro_em,
           MAX(u.ultimo_em)              AS ultimo_em
      FROM uso u GROUP BY u.tela
  )
  SELECT jsonb_build_object(
    'resumo', (
      SELECT jsonb_build_object(
        'aberturas',    COALESCE(SUM(u.aberturas), 0),
        'segundos',     COALESCE(SUM(u.segundos), 0),
        'dias_ativos',  COUNT(DISTINCT u.dia),
        'telas_usadas', COUNT(DISTINCT u.tela),
        'primeiro_em',  MIN(u.primeiro_em),
        'ultimo_em',    MAX(u.ultimo_em)
      ) FROM uso u
    ),
    -- O dia de maior uso. Empate resolve pelo mais recente: entre dois dias
    -- iguais, o que interessa e o ultimo.
    'melhor_dia', (
      SELECT jsonb_build_object(
        'dia', d.dia, 'segundos', d.segundos,
        'aberturas', d.aberturas, 'telas', d.telas)
        FROM por_dia d ORDER BY d.segundos DESC, d.dia DESC LIMIT 1
    ),
    'por_dia', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'dia', d.dia, 'aberturas', d.aberturas,
        'segundos', d.segundos, 'telas', d.telas) ORDER BY d.dia)
        FROM por_dia d
    ), '[]'::jsonb),
    'por_tela', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tela', t.tela, 'aberturas', t.aberturas, 'segundos', t.segundos,
        'dias', t.dias, 'primeiro_em', t.primeiro_em, 'ultimo_em', t.ultimo_em)
        ORDER BY t.segundos DESC)
        FROM por_tela t
    ), '[]'::jsonb),
    'acoes_total', (SELECT COUNT(*) FROM acoes),
    'acoes_por_dia', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dia', x.dia, 'total', x.total) ORDER BY x.dia)
        FROM (SELECT a.dia, COUNT(*)::BIGINT AS total FROM acoes a GROUP BY a.dia) x
    ), '[]'::jsonb),
    'acoes_por_categoria', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('categoria', x.categoria, 'total', x.total)
             ORDER BY x.total DESC)
        FROM (SELECT a.categoria, COUNT(*)::BIGINT AS total FROM acoes a GROUP BY a.categoria) x
    ), '[]'::jsonb),
    'acoes_top', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('acao', x.acao, 'total', x.total) ORDER BY x.total DESC)
        FROM (SELECT a.acao, COUNT(*)::BIGINT AS total FROM acoes a
               GROUP BY a.acao ORDER BY COUNT(*) DESC LIMIT 12) x
    ), '[]'::jsonb),
    -- Login e o unico evento que responde "entrou no sistema", e ele e
    -- diferente de "abriu uma tela": quem deixa a aba aberta a semana toda
    -- acumula tela sem logar de novo.
    'logins_total', (SELECT COUNT(*) FROM acoes a WHERE a.acao = 'login'),
    'logins_por_dia', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dia', x.dia, 'total', x.total) ORDER BY x.dia)
        FROM (SELECT a.dia, COUNT(*)::BIGINT AS total FROM acoes a
               WHERE a.acao = 'login' GROUP BY a.dia) x
    ), '[]'::jsonb),
    -- `por_dia` ja e uma linha por dia; o DISTINCT seria redundante e obrigaria
    -- o ORDER BY a repetir a mesma expressao.
    'dias_com_acesso', COALESCE((
      SELECT jsonb_agg(d.dia ORDER BY d.dia) FROM por_dia d
    ), '[]'::jsonb)
  );
$function$;

COMMENT ON FUNCTION public.fn_uso_perfil_pessoa(uuid, date, date) IS
  'Perfil de uso de uma pessoa: navegacao (uso_telas) + acoes e logins '
  '(logs_sistema) num JSON so. O percentual de uso NAO sai daqui — dias uteis '
  'tem dono em src/lib/diasUteis.ts. Ver 20260824160000.';

-- ── Permissoes ─────────────────────────────────────────────────────────────

DO $grants$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.fn_uso_por_pessoa(uuid, date, date, text, uuid, uuid)',
    'public.fn_uso_perfil_pessoa(uuid, date, date)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
  END LOOP;
END
$grants$;

COMMIT;
