-- ============================================================================
-- Banco de Horas: travado até a autorização (18/11/2026)
-- ============================================================================
--
-- A aba vai para a main, mas não pode ser liberada para ninguém até haver
-- autorização. A 20261118180000 deixava o ADMINISTRADOR ler tudo por acesso
-- total (`fn_user_escopo` = 3) — e com isso a API entregava os dados mesmo com
-- o menu escondido. Aqui as duas portas do banco passam a exigir super_admin:
--
--   fn_banco_horas_alcanca ........ leitura de banco_horas_setores (RLS)
--   fn_banco_horas_pode_gerenciar . importar, apagar e «Ligar setores»
--   banco_horas_mapa_select ....... leitura do vínculo
--
-- O lado do app é `BANCO_HORAS_LIBERADO` (src/lib/bancoHoras/liberacao.ts).
--
-- Não apaga nem altera dado: só troca o corpo de duas funções e uma política.
-- Pode rodar de novo.
--
-- LIBERAR (quando houver autorização): rodar as duas funções e a política sem
-- a linha `AND public.fn_user_is_super_admin()` — ou seja, voltar ao corpo da
-- 20261118180000 — e virar `BANCO_HORAS_LIBERADO` para `true` no app.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.fn_banco_horas_alcanca(
  p_empresa_id UUID, p_empresa_codigo TEXT, p_setor_dp TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH nivel AS (SELECT public.fn_user_escopo('banco_horas') AS n)
  SELECT public.fn_user_is_super_admin()   -- TRAVA até a autorização
    AND public.fn_can_access_empresa(p_empresa_id)
    AND CASE
      WHEN (SELECT n FROM nivel) >= 3 THEN TRUE
      WHEN (SELECT n FROM nivel) = 2 THEN EXISTS (
        SELECT 1 FROM public.banco_horas_mapa m
         WHERE m.empresa_id     = p_empresa_id
           AND m.empresa_codigo = p_empresa_codigo
           AND m.setor_dp       = p_setor_dp
           AND m.setor_id IN (SELECT s FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s)
      )
      ELSE FALSE
    END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_banco_horas_pode_gerenciar(p_empresa_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_user_is_super_admin()   -- TRAVA até a autorização
    AND public.fn_can_access_empresa(p_empresa_id)
    AND public.fn_user_escopo('banco_horas') >= 3
    AND public.fn_user_tem('banco_horas_gerenciar');
$function$;

DROP POLICY IF EXISTS banco_horas_mapa_select ON public.banco_horas_mapa;
CREATE POLICY banco_horas_mapa_select ON public.banco_horas_mapa
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_is_super_admin())   -- TRAVA até a autorização
    AND (SELECT public.fn_can_access_empresa(empresa_id))
    AND (SELECT public.fn_user_escopo('banco_horas')) >= 2
  );

COMMENT ON FUNCTION public.fn_banco_horas_alcanca(UUID, TEXT, TEXT) IS
  'O usuario logado ve este setor do DP no Banco de horas? TRAVADO: so super_admin ate a autorizacao '
  '(20261118190000). nivel 3 = empresa; nivel 2 = setores do DP ligados (banco_horas_mapa) aos setores do usuario.';

COMMIT;
