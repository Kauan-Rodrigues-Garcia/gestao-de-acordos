-- ============================================================================
-- Monitoramento de uso — tirar as subconsultas correlacionadas
-- ============================================================================
--
-- ## O que quebrou
--
--   POST /rpc/fn_uso_por_pessoa 500
--   canceling statement due to statement timeout
--
-- A correcao da duplicidade (20260824160000) resolveu o problema certo com a
-- forma errada. Para devolver a LISTA de empresas de cada pessoa, ela usava uma
-- subconsulta correlacionada dentro do SELECT:
--
--     ARRAY(SELECT ... FROM (SELECT DISTINCT empresa_id FROM bruto
--                             WHERE usuario_id = b.usuario_id) ...)
--
-- `bruto` e uma CTE referenciada tres vezes, entao o Postgres a MATERIALIZA — e
-- a subconsulta relia essa materializacao INTEIRA uma vez por pessoa. Com 180
-- dias de retencao (~97 mil linhas) e algumas dezenas de pessoas no recorte,
-- sao dezenas de varreduras completas para montar uma coluna de dois nomes.
--
-- `fn_uso_sem_acesso` tinha o mesmo vicio, e em dobro: a mesma subconsulta
-- correlacionada de ultimo acesso aparecia no SELECT **e** no ORDER BY, ou seja,
-- duas varreduras de `uso_telas` por pessoa da empresa.
--
-- ## A correcao
--
-- Nenhuma subconsulta por linha. Cada conjunto e agregado UMA vez, numa CTE, e
-- as CTEs se encontram por JOIN. O resultado e identico; o plano deixa de ser
-- quadratico.
--
-- Nao ha mudanca de assinatura nem de retorno — so do caminho ate eles.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Uso por pessoa ──────────────────────────────────────────────────────

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
  -- MATERIALIZED explicito: `bruto` e lido por tres CTEs, e deixar o planejador
  -- inlinar significaria refazer o filtro (e o join com `perfis`) tres vezes.
  WITH bruto AS MATERIALIZED (
    SELECT u.usuario_id, u.empresa_id, u.cargo, u.dia, u.tela,
           u.aberturas, u.segundos, u.ultimo_em
      FROM public.uso_telas u
      LEFT JOIN public.perfis p ON p.id = u.usuario_id
     WHERE (p_empresa_id IS NULL OR u.empresa_id = p_empresa_id)
       AND u.dia BETWEEN p_desde AND p_ate
       AND (p_cargo     IS NULL OR u.cargo     = p_cargo)
       AND (p_setor_id  IS NULL OR p.setor_id  = p_setor_id)
       AND (p_equipe_id IS NULL OR p.equipe_id = p_equipe_id)
  ),
  -- Uma linha por (pessoa, empresa). E daqui que saem as DUAS respostas sobre
  -- empresa — a principal e a lista —, cada uma com uma varredura desta CTE
  -- pequena, e nenhuma varredura de `uso_telas`.
  por_empresa AS (
    SELECT b.usuario_id, b.empresa_id, SUM(b.segundos) AS segundos
      FROM bruto b GROUP BY b.usuario_id, b.empresa_id
  ),
  -- A empresa de maior uso. `DISTINCT ON` porque nao existe `max(uuid)` — e
  -- porque o que se quer nao e o maior id, e a empresa da linha com mais tempo.
  principal AS (
    SELECT DISTINCT ON (pe.usuario_id) pe.usuario_id, pe.empresa_id
      FROM por_empresa pe
     ORDER BY pe.usuario_id, pe.segundos DESC, pe.empresa_id
  ),
  lista_empresas AS (
    SELECT pe.usuario_id,
           ARRAY_AGG(COALESCE(e.nome, '—') ORDER BY COALESCE(e.nome, '—')) AS empresas
      FROM por_empresa pe
      LEFT JOIN public.empresas e ON e.id = pe.empresa_id
     GROUP BY pe.usuario_id
  ),
  agregado AS (
    SELECT b.usuario_id,
           -- Cargo da LINHA, nao do perfil: promover alguem nao pode reescrever
           -- o historico dele. `mode()` porque a pessoa pode ter mudado de cargo
           -- no meio da janela — vale aquele em que passou mais tempo.
           (mode() WITHIN GROUP (ORDER BY b.cargo))::TEXT AS cargo,
           SUM(b.aberturas)::BIGINT       AS aberturas,
           SUM(b.segundos)::BIGINT        AS segundos,
           -- DISTINCT no dia e na tela: quem abriu a mesma tela nas duas
           -- operacoes no mesmo dia usou UM dia e UMA tela, nao dois de cada.
           COUNT(DISTINCT b.dia)::BIGINT  AS dias_ativos,
           COUNT(DISTINCT b.tela)::BIGINT AS telas_usadas,
           MAX(b.ultimo_em)               AS ultimo_em
      FROM bruto b GROUP BY b.usuario_id
  )
  SELECT a.usuario_id,
         COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario, '(removido)')::TEXT AS nome,
         a.cargo,
         pr.empresa_id,
         COALESCE(e.nome, '—')::TEXT AS empresa_nome,
         le.empresas::TEXT[],
         s.nome::TEXT  AS setor_nome,
         eq.nome::TEXT AS equipe_nome,
         a.aberturas, a.segundos, a.dias_ativos, a.telas_usadas, a.ultimo_em
    FROM agregado a
    JOIN principal      pr ON pr.usuario_id = a.usuario_id
    JOIN lista_empresas le ON le.usuario_id = a.usuario_id
    LEFT JOIN public.perfis   p  ON p.id  = a.usuario_id
    LEFT JOIN public.empresas e  ON e.id  = pr.empresa_id
    LEFT JOIN public.setores  s  ON s.id  = p.setor_id
    LEFT JOIN public.equipes  eq ON eq.id = p.equipe_id
   ORDER BY a.segundos DESC;
$function$;

-- ── 2. Quem nao acessou ────────────────────────────────────────────────────

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
  -- As duas perguntas sobre `uso_telas` viram DUAS agregacoes, e nao duas
  -- subconsultas por pessoa. Antes, o ultimo acesso era relido no SELECT e de
  -- novo no ORDER BY — duas varreduras por linha da empresa.
  WITH ultimo AS (
    SELECT u.usuario_id, MAX(u.ultimo_em) AS ultimo_em
      FROM public.uso_telas u GROUP BY u.usuario_id
  ),
  no_periodo AS (
    SELECT DISTINCT u.usuario_id
      FROM public.uso_telas u
     WHERE u.dia BETWEEN p_desde AND p_ate
  )
  SELECT p.id AS usuario_id,
         COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario, '—')::TEXT AS nome,
         p.usuario::TEXT,
         p.perfil::TEXT AS cargo,
         p.empresa_id,
         COALESCE(e.nome, '—')::TEXT AS empresa_nome,
         s.nome::TEXT  AS setor_nome,
         eq.nome::TEXT AS equipe_nome,
         COALESCE(p.situacao, 'ativo')::TEXT AS situacao,
         p.criado_em,
         ul.ultimo_em
    FROM public.perfis p
    LEFT JOIN public.empresas e  ON e.id  = p.empresa_id
    LEFT JOIN public.setores  s  ON s.id  = p.setor_id
    LEFT JOIN public.equipes  eq ON eq.id = p.equipe_id
    LEFT JOIN ultimo ul ON ul.usuario_id = p.id
   WHERE (p_empresa_id IS NULL OR p.empresa_id = p_empresa_id)
     AND (p_cargo     IS NULL OR p.perfil    = p_cargo)
     AND (p_setor_id  IS NULL OR p.setor_id  = p_setor_id)
     AND (p_equipe_id IS NULL OR p.equipe_id = p_equipe_id)
     AND p.ativo
     AND NOT p.arquivado
     AND NOT EXISTS (SELECT 1 FROM no_periodo n WHERE n.usuario_id = p.id)
   -- Nunca acessou primeiro: e o caso que exige acao imediata. Depois, quem
   -- esta parado ha mais tempo.
   ORDER BY ul.ultimo_em ASC NULLS FIRST,
            COALESCE(NULLIF(TRIM(p.nome), ''), p.usuario);
$function$;

-- ── 3. A RLS de `uso_telas` deixa de rodar POR LINHA ───────────────────────
--
-- Esta e a correcao de maior efeito do arquivo, e ela nao esta em nenhuma das
-- funcoes acima — esta na policy que TODAS elas atravessam.
--
--   using (
--     public.fn_user_is_super_admin()
--     or (empresa_id = public.fn_user_empresa_id()
--         and public.fn_user_has_any_role(array['administrador']))
--   )
--
-- Escrita assim, as tres funcoes sao chamadas **uma vez por linha varrida**.
-- Com 180 dias de retencao a tabela passa de 97 mil linhas, e cada uma das tres
-- consulta `perfis` por dentro: e uma consulta a `perfis` por linha de
-- `uso_telas`, tres vezes. Nenhuma reescrita de agregacao salva uma consulta
-- que gasta o orcamento inteiro antes de agregar coisa nenhuma.
--
-- Envolver cada chamada em `(select ...)` faz o planejador trata-la como
-- InitPlan: avaliada UMA vez, no inicio, e reaproveitada em todas as linhas. E
-- a recomendacao explicita do guia de RLS do Supabase, e vale aqui porque as
-- tres sao `STABLE` — o resultado nao muda no meio da consulta.
--
-- A regra de acesso e IDENTICA. Muda quantas vezes ela e perguntada.
DROP POLICY IF EXISTS uso_telas_select ON public.uso_telas;
CREATE POLICY uso_telas_select ON public.uso_telas
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_is_super_admin())
    OR (empresa_id = (SELECT public.fn_user_empresa_id())
        AND (SELECT public.fn_user_has_any_role(ARRAY['administrador'])))
  );

-- ── 4. Um indice para o "ultimo acesso de todos os tempos" ─────────────────
--
-- `ultimo` agrupa `uso_telas` inteira por usuario. Os indices existentes sao
-- `(empresa_id, dia)`, `(usuario_id, dia)` e `(empresa_id, tela, dia)` — nenhum
-- cobre `(usuario_id, ultimo_em)`, entao o agrupamento le a tabela toda.
CREATE INDEX IF NOT EXISTS idx_uso_telas_usuario_ultimo
  ON public.uso_telas (usuario_id, ultimo_em DESC);

COMMIT;
