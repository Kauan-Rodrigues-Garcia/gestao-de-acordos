-- ============================================================================
-- Auditoria de RAM na Medium, lote 1 (09/11/2026)
-- ============================================================================
--
-- Pedido do Cleber (09/11/2026): a Medium (4 GB) fica acima de 70% de RAM
-- mesmo depois das otimizações feitas ainda na Small. Auditoria só de leitura
-- no mesmo dia; este é o primeiro lote do que ela achou. Nada de regra de
-- negócio muda: as mesmas respostas, com menos trabalho do banco.
--
--   1. `fn_analitico_mes_linhas` (20261030150000) gravava disco temporário:
--      14,9 GB em 20 mil chamadas. A função é SQL com `SET search_path`, então
--      não é embutida, e o resultado de uma função SQL passa por um tuplestore
--      limitado a `work_mem` (7 MB). O mês de outubro da BookPlay são 24,7 mil
--      linhas = ~8 MB de JSON: espalhava 1.025 blocos em disco a CADA leitura.
--      A mesma consulta solta não espalha (medido com EXPLAIN ANALYZE como
--      líder). Em plpgsql, `SELECT ... INTO` guarda o valor direto na
--      variável, sem tuplestore. A consulta é a MESMA, letra por letra: mesmas
--      colunas, mesma ordem (`ORDER BY r.id`), mesma RLS (continua invocadora).
--
--   2. `fn_calendario_setores`: 91 ms por chamada, 4% do tempo do banco. Para
--      cada setor chamava `fn_calendario_alcanca` duas vezes (no WHERE e de novo
--      dentro de `fn_calendario_edita`), e cada uma refazia
--      `fn_can_access_empresa`, `fn_user_is_super_admin`, até três
--      `fn_user_tem` (cada uma percorre o catálogo de permissões) e
--      `fn_setores_do_operador`. Agora as perguntas sobre a pessoa são feitas
--      UMA vez e os setores são filtrados em conjunto.
--      Equivalência conferida em produção antes de escrever esta migration
--      (09/11/2026, só leitura): as 501 pessoas ativas, cada uma na própria
--      empresa — 0 diferenças; 19,8 s → 2,0 s somando todas.
--      `fn_calendario_alcanca` e `fn_calendario_edita` não mudam: as outras
--      funções do calendário continuam usando as duas.
--
--   3. Cron `abobora-tick`: rodava a cada minuto (1.440 vezes por dia) para a
--      Caça às Abóboras, que saiu do sistema com o Halloween — não há mais tela
--      que a mostre. Só o agendamento sai; tabelas e funções ficam.
--
--   4. Histórico do pg_cron: `cron.job_run_details` guardava tudo desde 02/08
--      (140 mil linhas, 30 MB). Fica a última semana (~105 mil linhas saem
--      agora) e um job diário, às 04:45, mantém assim. As faxinas por job que
--      já existem (realtime-despachar, numeros, vendas) continuam.
--
-- Reaplicável. Nada destrutivo em dado de negócio: o único DELETE é no
-- histórico de execução do pg_cron.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 1. O mês do analítico sem disco temporário ──────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_analitico_mes_linhas(
  p_empresa_id uuid,
  p_inicio     date,
  p_fim        date,
  p_operadores uuid[] DEFAULT NULL::uuid[]
)
RETURNS json
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE
  v_linhas json;
BEGIN
  -- A consulta de 20261030150000, sem mudar nada. Só o invólucro mudou:
  -- `SELECT ... INTO` não passa pelo tuplestore da função SQL.
  SELECT COALESCE(json_agg(json_build_object(
           'operador_id',              r.operador_id,
           'setor_id',                 r.setor_id,
           'importado_por_id',         r.importado_por_id,
           'valor_recebido',           r.valor_recebido,
           'total_ho',                 r.total_ho,
           'data_pagamento',           r.data_pagamento,
           'procedencia',              r.procedencia,
           'contribuicao_de_setor_id', r.contribuicao_de_setor_id,
           'espelho_extra',            r.espelho_extra
         ) ORDER BY r.id), '[]'::json)
    INTO v_linhas
    FROM public.analitico_recebimentos r
   WHERE r.empresa_id = p_empresa_id
     AND r.data_pagamento >= p_inicio
     AND r.data_pagamento <= p_fim
     AND (p_operadores IS NULL OR r.operador_id = ANY (p_operadores));
  RETURN v_linhas;
END;
$function$;

COMMENT ON FUNCTION public.fn_analitico_mes_linhas(uuid, date, date, uuid[]) IS
  'O mês de analitico_recebimentos num JSON só, com a RLS de quem chama (20261030150000). '
  'Em plpgsql desde 20261109200000: em SQL, o resultado de ~8 MB espalhava em disco.';

-- ── 2. Os setores do calendário em conjunto ─────────────────────────────────
--
-- É `fn_calendario_alcanca` aberta: acesso à empresa E (super admin OU
-- (ver_calendario E (todos os setores OU setor da pessoa))). O EXISTS do setor
-- na empresa é o próprio `s.empresa_id = p_empresa_id`. E `pode_editar` é
-- `fn_calendario_edita` = alcança E (super admin OU calendario_editar); quem
-- chega na linha já alcança. (Os nomes ficam aqui fora: a prova no fim
-- procura por eles dentro do corpo.)

CREATE OR REPLACE FUNCTION public.fn_calendario_setores(p_empresa_id uuid)
RETURNS TABLE(id uuid, nome text, pode_editar boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  -- As perguntas sobre QUEM pergunta, uma vez só (antes: duas por setor).
  WITH eu AS MATERIALIZED (
    SELECT public.fn_can_access_empresa(p_empresa_id)       AS acessa,
           public.fn_user_is_super_admin()                  AS super,
           public.fn_user_tem('ver_calendario')             AS ver,
           public.fn_user_tem('calendario_todos_setores')   AS todos,
           public.fn_user_tem('calendario_editar')          AS edita
  ),
  meus AS MATERIALIZED (
    SELECT s AS setor_id FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s
  )
  SELECT s.id, s.nome,
         (eu.super OR eu.edita)  -- quem chega na linha já alcança o setor
    FROM public.setores s
   CROSS JOIN eu
   WHERE s.empresa_id = p_empresa_id
     AND COALESCE(s.ativo, TRUE)
     AND eu.acessa
     AND (eu.super OR (eu.ver AND (eu.todos OR s.id IN (SELECT m.setor_id FROM meus m))))
   ORDER BY s.nome;
$function$;

-- ── 3 e 4. O pg_cron ────────────────────────────────────────────────────────

DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;  -- o teste local não tem pg_cron
  END IF;

  -- A Caça às Abóboras saiu do sistema: ninguém mais vê o que o tique solta.
  PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'abobora-tick';

  -- O histórico de execução: só a última semana.
  DELETE FROM cron.job_run_details WHERE start_time < now() - INTERVAL '7 days';

  PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'cron-historico-faxina';
  PERFORM cron.schedule('cron-historico-faxina', '45 4 * * *',
    $faxina$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days'$faxina$);
END
$cron$;

-- ── 5. Prova ────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF (SELECT l.lanname FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
       WHERE p.oid = 'public.fn_analitico_mes_linhas(uuid, date, date, uuid[])'::regprocedure) <> 'plpgsql' THEN
    RAISE EXCEPTION 'fn_analitico_mes_linhas não virou plpgsql.';
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p
       WHERE p.oid = 'public.fn_analitico_mes_linhas(uuid, date, date, uuid[])'::regprocedure) THEN
    RAISE EXCEPTION 'fn_analitico_mes_linhas tem de continuar invocadora (a RLS é de quem chama).';
  END IF;
  IF position('fn_calendario_alcanca' IN pg_get_functiondef('public.fn_calendario_setores(uuid)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'fn_calendario_setores ainda chama fn_calendario_alcanca por setor.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'abobora-tick') THEN
      RAISE EXCEPTION 'O cron abobora-tick continua agendado.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-historico-faxina') THEN
      RAISE EXCEPTION 'Faltou agendar cron-historico-faxina.';
    END IF;
  END IF;
END
$prova$;

COMMIT;
