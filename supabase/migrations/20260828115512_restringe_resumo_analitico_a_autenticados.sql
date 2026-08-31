-- Endurecimento preventivo da ACL da RPC do resumo por operador.
--
-- NAO ha b.o. conhecido por tras: a auditoria de 31/08/2026 nao encontrou grant
-- de `anon` para esta funcao em lugar nenhum. O baseline (20260813225412) lista
-- so `authenticated` e `service_role` — e ele concede `anon` explicitamente em
-- dezenas de OUTRAS funcoes, entao o dump mostraria se existisse. Tambem nao ha
-- DROP FUNCTION no historico, que e o unico caminho pelo qual a funcao pegaria
-- de volta o default do schema public do Supabase (esse sim inclui anon).
--
-- E, mesmo que o grant existisse, nao vazaria dado: a primeira coisa que o
-- corpo faz e `IF NOT fn_user_tem(...) THEN RETURN`, e fn_user_tem cai no
-- `ELSE FALSE` para sessao anonima — o CTE `ctx` sai vazio quando auth.uid()
-- e nulo. Sao duas camadas antes de qualquer leitura.
--
-- O que este arquivo compra, entao: deixa a ACL escrita por extenso em vez de
-- depender do default do schema, e devolve o grant de `service_role` que a
-- 20260827190000 deixou de fora do bloco explicito dela (sobreviveu la so
-- porque nada o revogou). Tudo idempotente.

REVOKE ALL ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT) TO service_role;
