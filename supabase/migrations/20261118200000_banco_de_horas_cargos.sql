-- ============================================================================
-- Banco de Horas: só a liderança, e um interruptor só para liberar (18/11/2026)
-- ============================================================================
--
-- Decisão do usuário (18/11/2026): depois de liberado, o Banco de Horas é só de
-- líder, gerência e diretoria (além do administrador e do super_admin). Operador,
-- ouvidoria, elite, RH e assistente ADM ficam de fora de vez — mesmo que alguém
-- ligue `ver_banco_horas` para o cargo no painel ou por exceção da pessoa.
--
-- Até a liberação, continua como a 20261118190000 deixou: só o super_admin.
--
--   fn_banco_horas_liberado() ..... o interruptor. Devolve FALSE.
--   fn_banco_horas_cargo_passa() .. super_admin sempre; liberado, os cargos da lista.
--
-- E a trava de super_admin das três portas (fn_banco_horas_alcanca,
-- fn_banco_horas_pode_gerenciar e a política banco_horas_mapa_select) passa a
-- ser `fn_banco_horas_cargo_passa()`. Para quem está na lista, quem decide
-- continua sendo o painel (ver_banco_horas e banco_horas_escopo_*).
--
-- O lado do app é `src/lib/bancoHoras/liberacao.ts` (BANCO_HORAS_LIBERADO e
-- CARGOS_DO_BANCO_HORAS): a lista precisa ser a mesma nos dois.
--
-- Não apaga nem altera dado: duas funções novas, duas trocadas e uma política.
-- Pode rodar de novo.
--
-- LIBERAR (quando houver autorização), só isto no banco:
--
--   CREATE OR REPLACE FUNCTION public.fn_banco_horas_liberado()
--   RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path TO '' AS $f$ SELECT TRUE $f$;
--
-- e `BANCO_HORAS_LIBERADO = true` no app.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

-- ── O interruptor ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_banco_horas_liberado()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$ SELECT FALSE $function$;

REVOKE ALL ON FUNCTION public.fn_banco_horas_liberado() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_banco_horas_liberado() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_banco_horas_liberado() TO authenticated;

COMMENT ON FUNCTION public.fn_banco_horas_liberado() IS
  'Banco de Horas liberado? FALSE ate a autorizacao (so super_admin). Liberar = devolver TRUE '
  'e BANCO_HORAS_LIBERADO = true no app (20261118200000).';

-- ── Quem passa pelo cargo ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_banco_horas_cargo_passa()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_user_is_super_admin()
      OR (public.fn_banco_horas_liberado()
          AND COALESCE(public.fn_user_perfil(), '') IN ('lider', 'gerencia', 'diretoria', 'administrador'));
$function$;

REVOKE ALL ON FUNCTION public.fn_banco_horas_cargo_passa() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_banco_horas_cargo_passa() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_banco_horas_cargo_passa() TO authenticated;

COMMENT ON FUNCTION public.fn_banco_horas_cargo_passa() IS
  'O cargo do usuario logado pode ter o Banco de Horas? super_admin sempre; liberado, '
  'lider, gerencia, diretoria e administrador. Operador e os demais nunca (20261118200000).';

-- ── As três portas ──────────────────────────────────────────────────────────

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
  SELECT public.fn_banco_horas_cargo_passa()   -- só a liderança (e até liberar, só super_admin)
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

COMMENT ON FUNCTION public.fn_banco_horas_alcanca(UUID, TEXT, TEXT) IS
  'O usuario logado ve este setor do DP no Banco de horas? Antes: fn_banco_horas_cargo_passa '
  '(so lideranca; ate liberar, so super_admin). nivel 3 = empresa; nivel 2 = setores do DP ligados '
  '(banco_horas_mapa) aos setores do usuario.';

CREATE OR REPLACE FUNCTION public.fn_banco_horas_pode_gerenciar(p_empresa_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_banco_horas_cargo_passa()   -- só a liderança (e até liberar, só super_admin)
    AND public.fn_can_access_empresa(p_empresa_id)
    AND public.fn_user_escopo('banco_horas') >= 3
    AND public.fn_user_tem('banco_horas_gerenciar');
$function$;

DROP POLICY IF EXISTS banco_horas_mapa_select ON public.banco_horas_mapa;
CREATE POLICY banco_horas_mapa_select ON public.banco_horas_mapa
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_banco_horas_cargo_passa())   -- só a liderança (e até liberar, só super_admin)
    AND (SELECT public.fn_can_access_empresa(empresa_id))
    AND (SELECT public.fn_user_escopo('banco_horas')) >= 2
  );

COMMIT;
