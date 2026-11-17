-- ============================================================================
-- Tira o código do ERP da frente do nome do cliente nos acordos
-- ============================================================================
--
-- 17/11/2026: o preenchimento de preencher_cliente_dos_acordos_20261117.sql
-- trouxe nomes do relatório 59 como «1994034 - NOME». Este script deixa só o
-- nome, pela mesma regra do `extrairNome` do relatório 58.
--
-- PRÉ-REQUISITO: a migration 20261117150000 aplicada (fn_nome_sem_codigo).
-- RODAR SÓ COM AUTORIZAÇÃO: primeiro a PRÉVIA, depois a LIMPEZA.
--
-- Pega TODO acordo cujo nome começa com «números + hífen», não só os
-- preenchidos hoje — a prévia separa os dois. Nome que é só o código não é
-- tocado (fica para corrigir à mão).
--
-- Gatilhos: uma linha de auditoria e uma em historico_acordos por acordo;
-- o tempo real manda um «recarregar» por empresa; o par fica desligado na
-- transação (as duas metades têm o mesmo nome e são limpas juntas).

-- ── PRÉVIA (só leitura) ─────────────────────────────────────────────────────

SELECT e.slug,
       count(*)                                                     AS com_codigo_na_frente,
       count(*) FILTER (WHERE a.atualizado_em >= date '2026-11-17') AS mexidos_desde_hoje,
       count(*) FILTER (WHERE public.fn_nome_sem_codigo(a.nome_cliente) IS NULL) AS so_o_codigo
  FROM public.acordos a
  JOIN public.empresas e ON e.id = a.empresa_id
 WHERE a.nome_cliente ~ '^\s*\d+\s*[-–]'
 GROUP BY e.slug;

-- ── LIMPEZA ─────────────────────────────────────────────────────────────────

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '300s';
SET LOCAL app.par_vinculo_em_curso = 'on';

WITH feito AS (
  UPDATE public.acordos a
     SET nome_cliente = public.fn_nome_sem_codigo(a.nome_cliente)
   WHERE a.nome_cliente ~ '^\s*\d+\s*[-–]'
     AND public.fn_nome_sem_codigo(a.nome_cliente) IS NOT NULL
  RETURNING a.empresa_id
)
SELECT e.slug, count(*) AS nomes_limpos
  FROM feito f
  JOIN public.empresas e ON e.id = f.empresa_id
 GROUP BY e.slug;

COMMIT;
