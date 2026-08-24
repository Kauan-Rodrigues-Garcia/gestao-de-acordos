-- ============================================================================
-- Monitoramento de uso — filtros de setor e equipe, e quem NUNCA acessou
-- ============================================================================
--
-- ## O que faltava
--
-- O painel filtrava por periodo, cargo e empresa. "Quais lideres do Play 5 nao
-- abrem o Desempenho Equipes" nao tinha resposta: nao havia recorte por setor
-- nem por equipe, e a unica saida era ler a lista inteira procurando nomes.
--
-- E faltava a metade acionavel da pergunta: **quem nunca acessou**. O painel
-- respondia isso so para UMA tela por vez (`fn_uso_adocao_tela`). Quem nunca
-- entrou no sistema — nenhuma tela, nenhum dia — nao aparecia em lugar nenhum,
-- porque quem nao usou nao tem linha em `uso_telas`.
--
-- ## De onde vem setor e equipe
--
-- De `perfis`, no estado de HOJE — e nao de um carimbo na linha de uso.
--
-- E deliberado, e diferente do que vale para o CARGO. O cargo e desnormalizado
-- em `uso_telas` porque a pergunta e historica: "quanto os lideres usaram em
-- julho" nao pode mudar porque alguem foi promovido em agosto. Setor e equipe
-- respondem outra pergunta — "de quem eu cobro isso agora" —, e essa e sempre
-- sobre a estrutura atual. Carimbar o setor do mes passado faria o gerente de
-- hoje nao encontrar a propria equipe no filtro.
--
-- ## Por que DROP e nao CREATE OR REPLACE
--
-- As quatro funcoes ganham parametros e duas ganham colunas no retorno.
-- `create or replace` nao muda nem a lista de argumentos (cria uma SOBRECARGA,
-- e a chamada por nome fica ambigua) nem o TABLE de retorno (42P13). O DROP e
-- seguro: quem chama e so `src/services/uso.service.ts`.
--
-- ## SECURITY INVOKER em todas
--
-- O parametro amplia o PEDIDO, nunca o direito. A policy de `uso_telas` e a de
-- `perfis` continuam decidindo: administrador que pedir empresa NULL recebe so
-- a propria, e o setor de outra empresa devolve lista vazia em vez de erro.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Uso por pessoa ──────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_uso_por_pessoa(uuid, date, date, text);

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
  empresa_id   uuid,
  empresa_nome text,
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
  -- SECURITY INVOKER: a policy de `uso_telas` decide o que aparece. Com NULL em
  -- `p_empresa_id`, o administrador continua vendo so a propria empresa porque a
  -- policy o restringe — o parametro amplia o pedido, nunca o direito.
  --
  -- Tudo que nao e soma entra no GROUP BY, e nao num agregado. Postgres nao tem
  -- `max(uuid)`, e envolver a empresa num agregado so para satisfazer o
  -- agrupamento seria esconder a pergunta: a linha JA e por (pessoa, empresa).
  SELECT u.usuario_id,
         COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario, '(removido)')::TEXT AS nome,
         -- Cargo da LINHA, nao do perfil: promover alguem nao pode reescrever o
         -- historico dele como se sempre tivesse sido lider. `mode()` porque a
         -- pessoa pode ter mudado de cargo NO MEIO da janela — ali vale o cargo
         -- em que ela passou mais tempo, e nao o alfabeticamente maior.
         (mode() WITHIN GROUP (ORDER BY u.cargo))::TEXT AS cargo,
         u.empresa_id,
         COALESCE(e.nome, '—')::TEXT            AS empresa_nome,
         s.nome::TEXT                           AS setor_nome,
         eq.nome::TEXT                          AS equipe_nome,
         SUM(u.aberturas)::BIGINT               AS aberturas,
         SUM(u.segundos)::BIGINT                AS segundos,
         COUNT(DISTINCT u.dia)::BIGINT          AS dias_ativos,
         COUNT(DISTINCT u.tela)::BIGINT         AS telas_usadas,
         MAX(u.ultimo_em)                       AS ultimo_em
    FROM public.uso_telas u
    -- LEFT nos dois: perfil apagado nao pode sumir com o uso que ja aconteceu,
    -- e e por isso que o nome cai em '(removido)' em vez de a linha desaparecer.
    LEFT JOIN public.perfis   p  ON p.id = u.usuario_id
    LEFT JOIN public.empresas e  ON e.id = u.empresa_id
    LEFT JOIN public.setores  s  ON s.id  = p.setor_id
    LEFT JOIN public.equipes  eq ON eq.id = p.equipe_id
   WHERE (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
     AND u.dia BETWEEN p_desde AND p_ate
     AND (p_cargo     IS NULL OR u.cargo     = p_cargo)
     AND (p_setor_id  IS NULL OR p.setor_id  = p_setor_id)
     AND (p_equipe_id IS NULL OR p.equipe_id = p_equipe_id)
   -- Agrupa por (usuario, empresa): a mesma pessoa nao existe em duas empresas
   -- (perfis tem PK no id de auth.users), mas agrupar pela empresa mantem a
   -- coluna honesta se um dia isso mudar.
   GROUP BY u.usuario_id, u.empresa_id, p.nome, p.usuario, e.nome, s.nome, eq.nome
   ORDER BY SUM(u.segundos) DESC;
$function$;

-- ── 2. Uso por tela ────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_uso_por_tela(uuid, date, date, text);

CREATE OR REPLACE FUNCTION public.fn_uso_por_tela(
  p_empresa_id uuid,
  p_desde      date,
  p_ate        date,
  p_cargo      text DEFAULT NULL,
  p_setor_id   uuid DEFAULT NULL,
  p_equipe_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  tela       text,
  aberturas  bigint,
  segundos   bigint,
  pessoas    bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT u.tela,
         SUM(u.aberturas)::BIGINT             AS aberturas,
         SUM(u.segundos)::BIGINT              AS segundos,
         COUNT(DISTINCT u.usuario_id)::BIGINT AS pessoas
    FROM public.uso_telas u
    JOIN public.perfis p ON p.id = u.usuario_id
   WHERE (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
     AND u.dia BETWEEN p_desde AND p_ate
     AND (p_cargo     IS NULL OR u.cargo     = p_cargo)
     AND (p_setor_id  IS NULL OR p.setor_id  = p_setor_id)
     AND (p_equipe_id IS NULL OR p.equipe_id = p_equipe_id)
   GROUP BY u.tela
   ORDER BY SUM(u.segundos) DESC;
$function$;

-- ── 3. Atividade por dia ───────────────────────────────────────────────────
--
-- Continua devolvendo SO os dias com uso. O preenchimento dos dias vazios e do
-- frontend, de proposito: a serie completa e desenho (o grafico precisa do eixo
-- inteiro para nao mentir sobre a frequencia), e `generate_series` aqui faria a
-- funcao devolver 90 linhas de zero para um periodo de 90 dias sem uso.

DROP FUNCTION IF EXISTS public.fn_uso_por_dia(uuid, date, date, text);

CREATE OR REPLACE FUNCTION public.fn_uso_por_dia(
  p_empresa_id uuid,
  p_desde      date,
  p_ate        date,
  p_cargo      text DEFAULT NULL,
  p_setor_id   uuid DEFAULT NULL,
  p_equipe_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  dia       date,
  aberturas bigint,
  segundos  bigint,
  pessoas   bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT u.dia,
         SUM(u.aberturas)::BIGINT             AS aberturas,
         SUM(u.segundos)::BIGINT              AS segundos,
         COUNT(DISTINCT u.usuario_id)::BIGINT AS pessoas
    FROM public.uso_telas u
    JOIN public.perfis p ON p.id = u.usuario_id
   WHERE (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
     AND u.dia BETWEEN p_desde AND p_ate
     AND (p_cargo     IS NULL OR u.cargo     = p_cargo)
     AND (p_setor_id  IS NULL OR p.setor_id  = p_setor_id)
     AND (p_equipe_id IS NULL OR p.equipe_id = p_equipe_id)
   GROUP BY u.dia
   ORDER BY u.dia;
$function$;

-- ── 4. Adocao de uma tela ──────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_uso_adocao_tela(uuid, date, date, text, text);

CREATE OR REPLACE FUNCTION public.fn_uso_adocao_tela(
  p_empresa_id uuid,
  p_desde      date,
  p_ate        date,
  p_cargo      text DEFAULT NULL,
  p_tela       text DEFAULT NULL,
  p_setor_id   uuid DEFAULT NULL,
  p_equipe_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  usuario_id   uuid,
  nome         text,
  cargo        text,
  empresa_id   uuid,
  empresa_nome text,
  setor_nome   text,
  equipe_nome  text,
  aberturas    bigint,
  segundos     bigint,
  ultimo_em    timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  -- Parte de `perfis`, e nao de `uso_telas`: quem nunca abriu a tela nao tem
  -- linha de uso, e e exatamente essa pessoa que a consulta existe para achar.
  SELECT p.id                                     AS usuario_id,
         COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario, '—')::TEXT AS nome,
         p.perfil::TEXT                           AS cargo,
         p.empresa_id,
         e.nome::TEXT                             AS empresa_nome,
         s.nome::TEXT                             AS setor_nome,
         eq.nome::TEXT                            AS equipe_nome,
         COALESCE(SUM(u.aberturas), 0)::BIGINT    AS aberturas,
         COALESCE(SUM(u.segundos), 0)::BIGINT     AS segundos,
         MAX(u.ultimo_em)                         AS ultimo_em
    FROM public.perfis p
    JOIN public.empresas e ON e.id = p.empresa_id
    LEFT JOIN public.setores s  ON s.id  = p.setor_id
    LEFT JOIN public.equipes eq ON eq.id = p.equipe_id
    LEFT JOIN public.uso_telas u
           ON u.usuario_id = p.id
          AND u.tela       = p_tela
          AND u.dia BETWEEN p_desde AND p_ate
   WHERE (p_empresa_id IS NULL OR p.empresa_id = p_empresa_id)
     AND (p_cargo     IS NULL OR p.perfil    = p_cargo)
     AND (p_setor_id  IS NULL OR p.setor_id  = p_setor_id)
     AND (p_equipe_id IS NULL OR p.equipe_id = p_equipe_id)
     AND p.ativo
     AND NOT p.arquivado
   GROUP BY p.id, p.nome, p.usuario, p.perfil, p.empresa_id, e.nome, s.nome, eq.nome
   ORDER BY COALESCE(SUM(u.segundos), 0) DESC,
            COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario);
$function$;

-- ── 5. Quem NAO acessou (novo) ─────────────────────────────────────────────
--
-- ## A pergunta
--
-- "Quem nunca entrou?" — sem escolher tela nenhuma. A adocao responde por UMA
-- tela; esta responde pelo sistema inteiro, que e a pergunta que se faz antes.
--
-- ## Duas ausencias diferentes, e a tela precisa distinguir
--
--   * `ultimo_em IS NULL` .... **nunca acessou**. Nenhuma linha de uso, nunca.
--     E onboarding que nao aconteceu, ou conta criada e nao entregue.
--   * `ultimo_em` preenchido .. acessou antes, **nao acessou no periodo**. E
--     abandono, e a cobranca e outra.
--
-- Devolver so "sem uso no periodo" juntaria as duas num numero que nao diz o
-- que fazer. `ultimo_em` aqui e GLOBAL de proposito — ele e a resposta para
-- "desde quando", e limita-lo a janela o deixaria sempre nulo.
--
-- ## Quem entra na conta
--
-- So gente ativa e nao arquivada. Cobrar acesso de quem foi desligado e ruido,
-- e a lista existe para virar acao.

DROP FUNCTION IF EXISTS public.fn_uso_sem_acesso(uuid, date, date, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.fn_uso_sem_acesso(
  p_empresa_id uuid,
  p_desde      date,
  p_ate        date,
  p_cargo      text DEFAULT NULL,
  p_setor_id   uuid DEFAULT NULL,
  p_equipe_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  usuario_id   uuid,
  nome         text,
  usuario      text,
  cargo        text,
  empresa_id   uuid,
  empresa_nome text,
  setor_nome   text,
  equipe_nome  text,
  situacao     text,
  criado_em    timestamptz,
  /** Ultimo acesso de TODOS os tempos. NULL = nunca acessou. */
  ultimo_em    timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT p.id                                     AS usuario_id,
         COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario, '—')::TEXT AS nome,
         p.usuario::TEXT,
         p.perfil::TEXT                           AS cargo,
         p.empresa_id,
         e.nome::TEXT                             AS empresa_nome,
         s.nome::TEXT                             AS setor_nome,
         eq.nome::TEXT                            AS equipe_nome,
         COALESCE(p.situacao, 'ativo')::TEXT      AS situacao,
         p.criado_em,
         (SELECT MAX(u2.ultimo_em) FROM public.uso_telas u2
           WHERE u2.usuario_id = p.id)            AS ultimo_em
    FROM public.perfis p
    JOIN public.empresas e ON e.id = p.empresa_id
    LEFT JOIN public.setores s  ON s.id  = p.setor_id
    LEFT JOIN public.equipes eq ON eq.id = p.equipe_id
   WHERE (p_empresa_id IS NULL OR p.empresa_id = p_empresa_id)
     AND (p_cargo     IS NULL OR p.perfil    = p_cargo)
     AND (p_setor_id  IS NULL OR p.setor_id  = p_setor_id)
     AND (p_equipe_id IS NULL OR p.equipe_id = p_equipe_id)
     AND p.ativo
     AND NOT p.arquivado
     -- Sem uso NO PERIODO. `NOT EXISTS` e nao `LEFT JOIN ... IS NULL`: a
     -- primeira para na primeira linha encontrada, e aqui a maioria das pessoas
     -- TEM uso — o caminho rapido e o de descartar.
     AND NOT EXISTS (
       SELECT 1 FROM public.uso_telas u
        WHERE u.usuario_id = p.id
          AND u.dia BETWEEN p_desde AND p_ate
     )
   -- Nunca acessou primeiro: e o caso que exige acao imediata. Depois, quem
   -- esta parado ha mais tempo.
   ORDER BY (SELECT MAX(u2.ultimo_em) FROM public.uso_telas u2
              WHERE u2.usuario_id = p.id) ASC NULLS FIRST,
            COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario);
$function$;

COMMENT ON FUNCTION public.fn_uso_sem_acesso(uuid, date, date, text, uuid, uuid) IS
  'Pessoas ativas SEM uso no periodo. ultimo_em nulo = nunca acessou; '
  'preenchido = acessou antes e parou. Ver 20260824150000.';

-- ── Permissoes ─────────────────────────────────────────────────────────────
--
-- `anon` fica de fora (mesma regra da 20260818240000): telemetria de uso nao e
-- dado publico, e a RLS so protege quem tem sessao.

DO $grants$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.fn_uso_por_pessoa(uuid, date, date, text, uuid, uuid)',
    'public.fn_uso_por_tela(uuid, date, date, text, uuid, uuid)',
    'public.fn_uso_por_dia(uuid, date, date, text, uuid, uuid)',
    'public.fn_uso_adocao_tela(uuid, date, date, text, text, uuid, uuid)',
    'public.fn_uso_sem_acesso(uuid, date, date, text, uuid, uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
  END LOOP;
END
$grants$;

COMMIT;
