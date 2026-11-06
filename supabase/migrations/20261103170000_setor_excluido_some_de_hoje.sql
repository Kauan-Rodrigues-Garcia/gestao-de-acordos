-- ============================================================================
-- Setor excluído: some de hoje, o mês fechado fica
-- ============================================================================
--
-- Pedido do Cleber em 03/11/2026: «apagar o setor do Play 4 sem prejudicar
-- meses fechados». O setor não deve aparecer em nada, nem em filtro, nem em
-- cadastro, nem na aba Setores. Se um dia precisar de novo, cria-se outro.
--
-- ## Por que não é um DELETE
--
-- 44 colunas apontam para `setores` (ver 20260916100000). Um DELETE:
--
--   SET NULL .. solta do setor todo acordo, recebimento (analítico, diário,
--               59), Pix e transferência que passou por ele. O mês fechado
--               perde o setor em Acordos, Diretoria e 59;
--   CASCADE ... apaga metas de Pix, validações, contribuição do Receptivo,
--               desafios, Modo TV do setor — inclusive de mês fechado.
--
-- E não dá para tirar as FKs como 20261029221000 fez com `equipes`: a lista de
-- Acordos lê o setor pelo embed `setores(id, nome)`, que precisa da FK.
--
-- ## A correção
--
-- `setores.excluido_em`. Setor com a coluna preenchida:
--
--   * some para o app inteiro — policy RESTRICTIVE de SELECT, vale até para o
--     super admin. Para a tela, é como se a linha tivesse sido apagada;
--   * continua existindo para a história — a linha fica, as FKs ficam, todo
--     `setor_id` antigo continua apontando para ela, e as funções SECURITY
--     DEFINER (recebido, Diretoria, 59) continuam enxergando o setor.
--
-- O mês fechado é lido do retrato (`composicao_mes*`, sem FK), e
-- `listaDoFiltroDeSetores` já devolve ao filtro do mês fechado o setor que
-- sumiu do cadastro depois. Nenhuma tela muda.
--
-- Só o super admin preenche ou limpa `excluido_em` pelo app; o SQL Editor (sem
-- usuário) também pode. Nenhuma linha de dado muda aqui. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ;

COMMENT ON COLUMN public.setores.excluido_em IS
  'Setor excluido: some do app (policy setores_esconde_excluido) e a linha '
  'fica so como ancora da historia. Ver 20261103170000.';

-- RESTRICTIVE: entra em AND com setores_select / setores_super_admin_total,
-- sem precisar recriar nenhuma delas.
DROP POLICY IF EXISTS setores_esconde_excluido ON public.setores;
CREATE POLICY setores_esconde_excluido ON public.setores
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (excluido_em IS NULL);

-- `setores_update_permissao` deixaria qualquer `setores_criar_editar` excluir
-- setor pela API. Fica com o super admin (e com o SQL Editor, sem auth.uid()).
CREATE OR REPLACE FUNCTION public.fn_setores_excluido_so_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.excluido_em IS DISTINCT FROM OLD.excluido_em
     AND auth.uid() IS NOT NULL
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Só o super admin exclui setor.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_setores_excluido_so_super_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_setores_excluido_so_super_admin ON public.setores;
CREATE TRIGGER trg_setores_excluido_so_super_admin
  BEFORE UPDATE OF excluido_em ON public.setores
  FOR EACH ROW EXECUTE FUNCTION public.fn_setores_excluido_so_super_admin();

COMMIT;
