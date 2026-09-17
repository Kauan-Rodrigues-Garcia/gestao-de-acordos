-- ============================================================================
-- As duas views do 59 e duas funções internas: fora do alcance de `anon`
-- ============================================================================
--
-- ## O que o Advisor acusou (17/09/2026)
--
--   ERROR  security_definer_view  public.vw_mestre_contribuicao_analitico
--   ERROR  security_definer_view  public.vw_mestre_projecao_analitico
--
-- View sem `security_invoker` roda com as permissões do DONO (`postgres`, que
-- tem BYPASSRLS): quem consegue ler a view lê `mestre_recebimentos` inteiro,
-- de todas as empresas, sem RLS.
--
-- ## Por que era exposição de verdade, e não só aviso
--
-- As migrations 20260914110614 e 20260914220000 revogaram a leitura de
-- `public` e de `authenticated`, mas não de `anon`. No Supabase o privilégio
-- padrão do schema `public` concede a `anon` DIRETAMENTE (não via `public`),
-- então o revoke não o alcançou. Conferido no banco antes desta migration:
--
--   has_table_privilege('anon', 'vw_mestre_contribuicao_analitico', 'SELECT') = true
--   has_table_privilege('anon', 'vw_mestre_projecao_analitico',     'SELECT') = true
--
-- A chave `anon` vai no bundle do front. Com ela, um GET em
-- `/rest/v1/vw_mestre_projecao_analitico` devolvia cliente, NR e valor de todas
-- as empresas.
--
-- O mesmo esquecimento deixou duas funções SECURITY DEFINER executáveis por
-- `anon` (e só por ele — `authenticated` já estava fora):
--
--   fn_mestre_aplicar_no_analitico_interno  apaga e regrava o analítico de um setor
--   fn_desafio_pessoas_interna              lista as pessoas de uma empresa
--
-- ## O conserto
--
-- 1. `anon` (e `public`, de quem ele herda) perde tudo nas duas views e nas
--    duas funções.
-- 2. As views passam a `security_invoker = true`. Quem as lê hoje são só
--    funções SECURITY DEFINER do dono `postgres` (fn_mestre_aplicar_no_analitico_interno,
--    fn_mestre_fontes_dos_setores, fn_mestre_projecao_analitico e o gatilho
--    fn_mestre_sincronizar_analitico). Dentro delas o invocador é o próprio
--    `postgres`, que tem BYPASSRLS — o resultado não muda. E view continua sendo
--    expandida na consulta de quem chama, com ou sem `security_invoker`: os 17 ms
--    medidos na 20260914110614 não dependem disso.
--
-- Reexecutável: `revoke` e `alter view ... set` não falham se já aplicados.
-- ============================================================================

begin;

set local lock_timeout = '10s';

-- `public` junto: `anon` herda dele, e revogar só um dos dois não fecha nada.
revoke all on public.vw_mestre_contribuicao_analitico from public, anon;
revoke all on public.vw_mestre_projecao_analitico     from public, anon;

alter view public.vw_mestre_contribuicao_analitico set (security_invoker = true);
alter view public.vw_mestre_projecao_analitico     set (security_invoker = true);

revoke all on function public.fn_mestre_aplicar_no_analitico_interno(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.fn_desafio_pessoas_interna(uuid) from public, anon;

commit;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
--   select c.relname, c.reloptions,
--          has_table_privilege('anon', c.oid, 'SELECT')          as anon_le,
--          has_table_privilege('authenticated', c.oid, 'SELECT') as auth_le
--     from pg_class c
--    where c.oid in ('public.vw_mestre_contribuicao_analitico'::regclass,
--                    'public.vw_mestre_projecao_analitico'::regclass);
--   -- esperado: reloptions = {security_invoker=true}, anon_le = false, auth_le = false
--
--   select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_executa
--     from pg_proc p
--    where p.oid in ('public.fn_mestre_aplicar_no_analitico_interno(uuid,text,uuid,uuid)'::regprocedure,
--                    'public.fn_desafio_pessoas_interna(uuid)'::regprocedure);
--   -- esperado: anon_executa = false
