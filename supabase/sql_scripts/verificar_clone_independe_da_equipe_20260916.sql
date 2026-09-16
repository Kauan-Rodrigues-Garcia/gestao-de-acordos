-- =============================================================================
-- Conferência: trocar a equipe da pessoa não apaga nem move o clone dela
-- 16/09/2026 · só leitura (catálogo do Postgres, nenhum dado de pessoa)
-- =============================================================================
--
-- O clone é uma linha em `equipe_operadores_clones` (equipe_id, operador_id).
-- Nas migrations nada liga essa linha a `perfis.equipe_id`: trocar de equipe
-- ou de setor não toca no clone, e só a troca de EMPRESA limpa (a equipe do
-- clone é da empresa antiga). Parte do schema foi aplicada pelo SQL Editor,
-- sem migration, então esta consulta confere o banco de verdade.
--
-- Esperado:
--   gatilhos em perfis ............ nenhum que cite equipe_operadores_clones
--   funções que apagam clone ...... só fn_transferencia_mover_empresa
--                                   (e fn_transferencia_desfazer, se citar)
-- Qualquer outra linha é um caminho que apaga clone e precisa ser lido.
-- =============================================================================

select 'gatilho em ' || c.relname as onde,
       t.tgname                  as nome,
       p.proname                 as funcao
  from pg_trigger t
  join pg_class   c on c.oid = t.tgrelid
  join pg_proc    p on p.oid = t.tgfoid
 where not t.tgisinternal
   and c.relname in ('perfis', 'equipe_operadores_clones', 'equipes')
   and p.prosrc ilike '%equipe_operadores_clones%'

union all

select 'funcao que apaga clone', p.proname, null
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosrc ~* 'delete\s+from\s+(public\.)?equipe_operadores_clones'

order by 1, 2;
