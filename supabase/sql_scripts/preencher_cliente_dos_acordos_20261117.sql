-- ============================================================================
-- Preenche nome do cliente e instituição VAZIOS dos acordos já salvos
-- ============================================================================
--
-- Pedido do Cleber, 17/11/2026. Mesma regra do gatilho da migration
-- 20261117120000 (`fn_cliente_conhecido`), aplicada uma vez ao que já existe:
--
--   - só campo vazio; nada é sobrescrito;
--   - nome: acordo anterior da mesma chave, senão o relatório;
--   - instituição: só em acordo COM NR (sem NR ela é a chave — Código da
--     regra Cofen); só as quatro da tela, com UNIVERSIDADE PLAY e EDIT BRASIL
--     como MUNDIAL EDITORA;
--   - nome com CPF não entra.
--
-- PRÉ-REQUISITO: a migration 20261117120000 aplicada.
-- RODAR SÓ COM AUTORIZAÇÃO, e em duas etapas: primeiro a PRÉVIA (só conta),
-- depois o PREENCHIMENTO.
--
-- O que o UPDATE dispara nos gatilhos de `acordos` (conferido em 17/11):
--   - trg_log_acordos: uma linha de auditoria «Alterou o acordo» por acordo;
--   - trg_log_historico_acordo: uma linha em historico_acordos por NOME
--     preenchido (instituição não entra no histórico);
--   - atualizado_em muda; o tempo real manda UM aviso por empresa
--     («recarregar», acima de 200 acordos);
--   - trg_sync_nr_registros e trg_acordos_chave_so_numeros: a chave não muda,
--     então não fazem nada;
--   - trg_vinculo_par_upd: desligado neste script (app.par_vinculo_em_curso),
--     senão cada metade do par reescreveria a outra e mandaria card no chat.
--     As duas metades têm a mesma chave e são preenchidas do mesmo jeito.

-- ── PRÉVIA (só leitura) ─────────────────────────────────────────────────────

SELECT e.slug,
       count(*) FILTER (WHERE x.nome_novo IS NOT NULL) AS nomes_a_preencher,
       count(*) FILTER (WHERE x.inst_nova IS NOT NULL) AS instituicoes_a_preencher,
       count(*) FILTER (WHERE x.inst_nova = 'MUNDIAL EDITORA') AS das_quais_mundial
  FROM (
    SELECT a.empresa_id,
           CASE WHEN btrim(coalesce(a.nome_cliente, '')) = '' THEN c.cliente_nome END AS nome_novo,
           CASE WHEN btrim(coalesce(a.nr_cliente, '')) <> ''
                 AND btrim(coalesce(a.instituicao, '')) = '' THEN c.cliente_instituicao END AS inst_nova
      FROM public.acordos a
      CROSS JOIN LATERAL public.fn_cliente_conhecido(a.empresa_id, a.nr_cliente, a.instituicao) c
     WHERE btrim(coalesce(a.nome_cliente, '')) = ''
        OR (btrim(coalesce(a.nr_cliente, '')) <> '' AND btrim(coalesce(a.instituicao, '')) = '')
  ) x
  JOIN public.empresas e ON e.id = x.empresa_id
 WHERE x.nome_novo IS NOT NULL OR x.inst_nova IS NOT NULL
 GROUP BY e.slug;

-- ── PREENCHIMENTO ───────────────────────────────────────────────────────────

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '300s';
SET LOCAL app.par_vinculo_em_curso = 'on';

WITH alvo AS (
  SELECT a.id,
         CASE WHEN btrim(coalesce(a.nome_cliente, '')) = '' THEN c.cliente_nome END AS nome_novo,
         CASE WHEN btrim(coalesce(a.nr_cliente, '')) <> ''
               AND btrim(coalesce(a.instituicao, '')) = '' THEN c.cliente_instituicao END AS inst_nova
    FROM public.acordos a
    CROSS JOIN LATERAL public.fn_cliente_conhecido(a.empresa_id, a.nr_cliente, a.instituicao) c
   WHERE btrim(coalesce(a.nome_cliente, '')) = ''
      OR (btrim(coalesce(a.nr_cliente, '')) <> '' AND btrim(coalesce(a.instituicao, '')) = '')
), feito AS (
  UPDATE public.acordos a
     SET nome_cliente = coalesce(alvo.nome_novo, a.nome_cliente),
         instituicao  = coalesce(alvo.inst_nova, a.instituicao)
    FROM alvo
   WHERE a.id = alvo.id
     AND (alvo.nome_novo IS NOT NULL OR alvo.inst_nova IS NOT NULL)
  RETURNING a.empresa_id, alvo.nome_novo IS NOT NULL AS nome, alvo.inst_nova IS NOT NULL AS inst
)
SELECT e.slug,
       count(*) FILTER (WHERE f.nome) AS nomes_preenchidos,
       count(*) FILTER (WHERE f.inst) AS instituicoes_preenchidas
  FROM feito f
  JOIN public.empresas e ON e.id = f.empresa_id
 GROUP BY e.slug;

COMMIT;
