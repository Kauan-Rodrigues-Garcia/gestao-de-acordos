-- ============================================================================
-- 20261112134434_search_path_fixo_funcoes_frias.sql
--
-- O advisor apontava 18 funções sem `search_path` fixo (12/11/2026). Esta
-- migration fixa nas 7 em que isso não custa nada, e deixa as outras 11 como
-- estão DE PROPÓSITO.
--
-- ## Por que não as 18
--
-- Uma função `LANGUAGE sql` simples é «embutida» pelo planejador na consulta
-- que a chama: o corpo vira parte do plano e ela não é chamada linha a linha.
-- Um `SET search_path` na função DESLIGA isso. Nas que rodam por linha em
-- tabela grande, o conserto do aviso viraria lentidão:
--
--   extra_absorvido (2) ........ coluna calculada de `acordos` no PostgREST
--   fn_mestre_conta_na_meta .... 21 funções + 2 views sobre mestre_recebimentos
--   fn_mestre_setor_resolvido .. 5 funções + 2 views
--   fn_mestre_e_equipe ......... 6 funções
--   fn_mestre_grupos_do_mes .... 6 funções
--   fn_mestre_equipes_do_mes ... 4 funções
--   fn_setores_do_mes .......... 7 funções
--   fn_mes_fechado ............. 13 funções
--   fn_analitico_forma_do_tpdoc  2 views do analítico
--   fn_acordo_encerrado_mes_anterior  por acordo, em 2 funções
--
-- E o risco que o aviso descreve não existe aqui: ninguém além do dono cria
-- objeto no `public` (conferido: anon e authenticated sem CREATE), nenhuma
-- delas é SECURITY DEFINER, e o `pg_temp` nunca é procurado para funções.
--
-- ## As 7 desta migration
--
-- Trigger, chamadas uma vez por consulta, ou de tela pequena — sem plano a
-- perder. `public, pg_temp` é o que o projeto já usa nas outras funções.
--
-- Reaplicável. Não muda o que nenhuma função faz.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

ALTER FUNCTION public.fn_fechamento_mes_imutavel()            SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_campanha_facil_progresso(uuid[])     SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_chefona_ritmo(numeric, numeric)      SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_radio_pode_ouvir()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_cargo_supervisiona_setor(text)       SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_mes_texto(integer, integer)          SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_cf_mascarar_cpf(text)                SET search_path = public, pg_temp;

COMMIT;

-- Conferência (rodar depois): as 7 com search_path fixo.
--
-- SELECT p.oid::regprocedure, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND p.proname IN ('fn_fechamento_mes_imutavel','fn_campanha_facil_progresso',
--      'fn_chefona_ritmo','fn_radio_pode_ouvir','fn_cargo_supervisiona_setor',
--      'fn_mes_texto','fn_cf_mascarar_cpf');
