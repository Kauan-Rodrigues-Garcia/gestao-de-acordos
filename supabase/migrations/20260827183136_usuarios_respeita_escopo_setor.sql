-- ============================================================================
-- Gestão de Pessoas: o painel passa a mandar também na RLS
--
-- A policy anterior tratava `fn_user_escopo('usuarios') >= 2` como autorização
-- para ler a empresa inteira. O nível 2, porém, significa SOMENTE o setor; o
-- nível 3 é que significa todos os setores. O navegador tentava reparar o
-- excesso depois de receber os dados, deixando uma falha de UI expor pessoas.
--
-- A regra abaixo preserva todos os mapas de cargo e exceções individuais. Ela
-- apenas executa o valor já resolvido por `fn_user_escopo`:
--   - aba desligada / sem nível: só o próprio perfil;
--   - setor (2): setor de origem e clones que atuam nesse setor;
--   - todos os setores (3): toda empresa à qual a pessoa tem acesso nominal.
--
-- `usuarios_administrar` deixa de ser uma policy ALL, pois ALL também concedia
-- SELECT e ampliava o alcance sem ninguém ligar o respectivo nível. As escritas
-- continuam autorizadas, mas dentro do mesmo escopo configurado para a aba.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

DROP POLICY IF EXISTS perfis_select ON public.perfis;
CREATE POLICY perfis_select ON public.perfis
FOR SELECT TO authenticated
USING (
  (SELECT auth.uid()) = id
  OR (SELECT public.fn_user_is_super_admin())
  OR (
    (SELECT public.fn_can_access_empresa(empresa_id))
    AND (
      (SELECT public.fn_user_escopo('usuarios')) >= 3
      OR (
        (SELECT public.fn_user_escopo('usuarios')) = 2
        AND (SELECT public.fn_user_setor_id()) IN (
          SELECT setor_id
            FROM public.fn_setores_do_operador(id) AS setores(setor_id)
        )
      )
    )
  )
);

-- A policy antiga de administração era FOR ALL. Separar os comandos mantém a
-- capacidade de administrar sem transformar uma ação em permissão de leitura.
DROP POLICY IF EXISTS perfis_admin_all ON public.perfis;
DROP POLICY IF EXISTS perfis_admin_insert ON public.perfis;
DROP POLICY IF EXISTS perfis_admin_update ON public.perfis;
DROP POLICY IF EXISTS perfis_admin_delete ON public.perfis;

CREATE POLICY perfis_admin_insert ON public.perfis
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.fn_user_tem('usuarios_administrar'))
  AND (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    (SELECT public.fn_user_escopo('usuarios')) >= 3
    OR (
      (SELECT public.fn_user_escopo('usuarios')) = 2
      AND setor_id IS NOT DISTINCT FROM (SELECT public.fn_user_setor_id())
    )
  )
);

CREATE POLICY perfis_admin_update ON public.perfis
FOR UPDATE TO authenticated
USING (
  (SELECT public.fn_user_tem('usuarios_administrar'))
  AND (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    (SELECT public.fn_user_escopo('usuarios')) >= 3
    OR (
      (SELECT public.fn_user_escopo('usuarios')) = 2
      AND setor_id IS NOT DISTINCT FROM (SELECT public.fn_user_setor_id())
    )
  )
)
WITH CHECK (
  (SELECT public.fn_user_tem('usuarios_administrar'))
  AND (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    (SELECT public.fn_user_escopo('usuarios')) >= 3
    OR (
      (SELECT public.fn_user_escopo('usuarios')) = 2
      AND setor_id IS NOT DISTINCT FROM (SELECT public.fn_user_setor_id())
    )
  )
);

CREATE POLICY perfis_admin_delete ON public.perfis
FOR DELETE TO authenticated
USING (
  (SELECT public.fn_user_tem('usuarios_administrar'))
  AND (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    (SELECT public.fn_user_escopo('usuarios')) >= 3
    OR (
      (SELECT public.fn_user_escopo('usuarios')) = 2
      AND setor_id IS NOT DISTINCT FROM (SELECT public.fn_user_setor_id())
    )
  )
);

COMMIT;
