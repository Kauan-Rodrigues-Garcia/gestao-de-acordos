-- ============================================================================
-- 20260823140000_acordos_replica_identity_full.sql
--
-- Excluir um acordo deixa de ser invisível para quem está olhando o painel.
--
-- ## O defeito
--
-- O payload de um DELETE do Postgres carrega apenas a *replica identity* da
-- linha. Com a identidade padrão (`DEFAULT`), isso é só a chave primária: o
-- `empresa_id` não está lá.
--
-- O canal de tempo real de acordos assina com `filter: empresa_id=eq.<id>`.
-- Para INSERT e UPDATE o filtro casa; para DELETE ele nunca casa, porque a
-- coluna não existe no payload — e o evento simplesmente não é entregue.
--
-- Medido em 23/08/2026: excluir um acordo não mexia em nada do Dashboard.
-- A aba de quem clicou parecia funcionar porque ela remove o item da lista
-- localmente; nas outras telas — e nos cartões e no gráfico da própria — o
-- acordo excluído seguia contando até alguém recarregar a página.
--
-- ## O que muda
--
-- `REPLICA IDENTITY FULL` faz o WAL carregar a linha ANTIGA inteira no DELETE
-- (e no UPDATE). Com ela:
--
--   • o filtro por `empresa_id` passa a casar no DELETE;
--   • a RLS consegue avaliar o registro antigo e decidir quem pode receber o
--     evento — com a identidade padrão isso é impossível, e é por isso que o
--     Supabase entrega o DELETE sem recorte de RLS;
--   • o payload traz o que foi apagado, e não só o id.
--
-- ## O custo, dito na cara
--
-- O WAL cresce: cada UPDATE e cada DELETE passam a gravar a linha inteira em
-- vez de só a chave. Para `acordos` isso é aceitável — a linha é estreita
-- (colunas escalares, sem `jsonb` grande) e o volume de escrita é de dezenas
-- a centenas de linhas por dia, não de milhões. Se um dia a tabela virar
-- alto-volume, o caminho é `REPLICA IDENTITY USING INDEX` sobre um índice que
-- contenha `empresa_id`.
--
-- ## O código não depende desta migration
--
-- `RealtimeAcordosProvider` passou a ter uma escuta de DELETE **sem filtro**,
-- que funciona com a identidade padrão. Esta migration é o conserto correto,
-- não o remendo: ela devolve o recorte por RLS ao evento de exclusão. Aplicar
-- ou não aplicar não quebra a tela em nenhum dos dois sentidos.
-- ============================================================================

ALTER TABLE public.acordos REPLICA IDENTITY FULL;

-- Conferência: deve devolver 'f' (full).
--   SELECT relreplident FROM pg_class WHERE oid = 'public.acordos'::regclass;
--   d = default (só a PK)  ·  f = full (linha inteira)
DO $$
DECLARE
  identidade "char";
BEGIN
  SELECT relreplident INTO identidade
  FROM pg_class WHERE oid = 'public.acordos'::regclass;

  IF identidade IS DISTINCT FROM 'f' THEN
    RAISE EXCEPTION
      'acordos deveria estar com REPLICA IDENTITY FULL, mas está com "%"', identidade;
  END IF;
END $$;
