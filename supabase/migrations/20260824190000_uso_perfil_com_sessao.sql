-- ============================================================================
-- fn_uso_perfil_pessoa — presenca deixa de depender de a sessao ter expirado
-- ============================================================================
--
-- Complemento de 20260824180000, que criou `uso_sessoes`. Aqui a leitura passa
-- a enxergar a tabela nova.
--
-- ## Tres numeros que nao sao a mesma coisa
--
--   * `entradas_total` .... quantas vezes o sistema foi ABERTO. Recarregar a
--                           pagina conta. E a resposta honesta para «quantas
--                           vezes entrou», e nao muda de significado quando a
--                           politica de token muda.
--   * `logins_total` ...... quantas vezes a SENHA foi digitada. Continua util
--                           — e sinal de troca de maquina, de sessao expirada,
--                           de conta compartilhada —, mas era o numero que
--                           estava sendo lido como presenca, e nunca foi.
--   * `dias_com_acesso` ... em quantos DIAS distintos a pessoa apareceu. E o
--                           numerador do percentual de uso, e o unico dos tres
--                           que responde a pergunta da gerencia.
--
-- Manter os tres separados e o ponto: foi juntar «entrou» com «digitou senha»
-- que produziu «usa todo dia, consta 1 login».
--
-- ## dias_com_acesso agora e uniao
--
-- `uso_telas` OU `uso_sessoes`. Antes so a primeira, e ela tem piso de 2
-- segundos por tela e ignora rota fora do catalogo — quem abre o sistema, olha
-- e sai ficava de fora do dia. Com a uniao, abrir o sistema ja e presenca.
-- ============================================================================

BEGIN;

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
  sessoes AS (
    SELECT s.* FROM public.uso_sessoes s
     WHERE s.usuario_id = p_usuario_id
       AND s.dia BETWEEN p_desde AND p_ate
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
  ),
  -- `UNION` e nao `UNION ALL`: quem navegou E tem sessao no mesmo dia apareceu
  -- UMA vez. Com `ALL` o dia contaria em dobro e o percentual passaria de 100%.
  dias AS (
    SELECT d.dia FROM por_dia d
    UNION
    SELECT s.dia FROM sessoes s
  )
  SELECT jsonb_build_object(
    'resumo', jsonb_build_object(
      'aberturas',    (SELECT COALESCE(SUM(u.aberturas), 0) FROM uso u),
      'segundos',     (SELECT COALESCE(SUM(u.segundos), 0) FROM uso u),
      -- Dias da UNIAO, para casar com o percentual exibido ao lado. Um card
      -- «dias ativos: 3» ao lado de «apareceu em 5 dias» seria um defeito.
      'dias_ativos',  (SELECT COUNT(*) FROM dias),
      'telas_usadas', (SELECT COUNT(DISTINCT u.tela) FROM uso u),
      -- LEAST/GREATEST ignoram NULL: quem so tem uma das duas fontes ainda
      -- recebe a data certa em vez de nulo.
      'primeiro_em',  LEAST(
                        (SELECT MIN(u.primeiro_em) FROM uso u),
                        (SELECT MIN(s.primeiro_em) FROM sessoes s)),
      'ultimo_em',    GREATEST(
                        (SELECT MAX(u.ultimo_em) FROM uso u),
                        (SELECT MAX(s.ultimo_em) FROM sessoes s))
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
    -- Aberturas do sistema. NAO depende de a sessao ter expirado — e por isso
    -- que este campo existe.
    'entradas_total', (SELECT COALESCE(SUM(s.entradas), 0) FROM sessoes s),
    'dias_com_sessao', (SELECT COUNT(*) FROM sessoes s),
    'entradas_por_dia', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dia', s.dia, 'total', s.entradas) ORDER BY s.dia)
        FROM sessoes s
    ), '[]'::jsonb),
    -- Senha digitada. Fica como sinal secundario: e util para «trocou de
    -- maquina» e «sessao caiu», e nunca foi medida de presenca.
    'logins_total', (SELECT COUNT(*) FROM acoes a WHERE a.acao = 'login'),
    'logins_por_dia', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dia', x.dia, 'total', x.total) ORDER BY x.dia)
        FROM (SELECT a.dia, COUNT(*)::BIGINT AS total FROM acoes a
               WHERE a.acao = 'login' GROUP BY a.dia) x
    ), '[]'::jsonb),
    'dias_com_acesso', COALESCE((
      SELECT jsonb_agg(d.dia ORDER BY d.dia) FROM dias d
    ), '[]'::jsonb)
  );
$function$;

COMMENT ON FUNCTION public.fn_uso_perfil_pessoa(uuid, date, date) IS
  'Perfil de uso de uma pessoa: navegacao (uso_telas), entradas no sistema '
  '(uso_sessoes) e acoes/logins (logs_sistema) num JSON so. dias_com_acesso e '
  'a uniao de tela e sessao. O percentual de uso NAO sai daqui — dias uteis tem '
  'dono em src/lib/diasUteis.ts. Ver 20260824190000.';

COMMIT;
