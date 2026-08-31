-- Indice do caminho quente de `fn_diretoria_setores_do_mes` (20260831121500):
-- empresa + faixa de vencimento, com o setor junto para o agrupamento sair do
-- proprio indice.
--
-- SEPARADO da migration da funcao, e CONCURRENTLY, de proposito: `CREATE INDEX`
-- comum toma SHARE em `acordos` e BLOQUEIA toda escrita ate terminar. Em
-- horario de expediente isso e operador tomando erro ao salvar acordo.
-- CONCURRENTLY nao pode rodar dentro de transacao — este arquivo tem que ser
-- executado sozinho, fora de bloco transacional, e nao via `apply_migration`.
--
-- Se falhar no meio, o indice fica INVALID e precisa de DROP antes de refazer:
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_acordos_empresa_venc_setor
  ON public.acordos (empresa_id, vencimento, setor_id)
  WHERE tipo_vinculo IS DISTINCT FROM 'extra';
