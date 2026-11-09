-- ============================================================================
-- Metas: dias úteis do mês por pessoa
-- ============================================================================
--
-- O pedido (09/11/2026): tem gente que começa no meio do mês. Na aba Metas,
-- quando a «Meta proporcional» da pessoa está marcada, a liderança escolhe se
-- ela segue os dias úteis do setor ou os dias dela.
--
-- ## A linha é a lista dos dias que a pessoa TRABALHA
--
-- `dias` é a lista completa, em ISO ('2026-11-16'), sempre dentro dos dias
-- úteis do setor: a pessoa só tira dias, nunca põe. O app aplica como feriados
-- a mais (os dias do setor que não estão na lista), então feriado do setor
-- continua fora mesmo que esteja aqui. Sem linha = a pessoa segue o setor.
-- Apagar a linha é voltar a ele.
--
-- Ver exige alcançar a empresa; gravar e apagar exigem `metas_editar` (a mesma
-- chave da meta da pessoa). Mês fechado trava pela mesma
-- `fn_trava_mes_fechado_ano_mes` das outras tabelas de meta.
--
-- Reaplicável. Não mexe em nenhuma tabela ou função que já existe.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.metas_dias_uteis_pessoa (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  perfil_id      UUID        NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  mes            INTEGER     NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano            INTEGER     NOT NULL CHECK (ano >= 2024),
  dias           JSONB       NOT NULL DEFAULT '[]'::JSONB
                             CHECK (jsonb_typeof(dias) = 'array'),
  atualizado_por UUID        REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT metas_dias_uteis_pessoa_perfil_mes_ano_key UNIQUE (perfil_id, mes, ano)
);

CREATE INDEX IF NOT EXISTS metas_dias_uteis_pessoa_empresa_mes_idx
  ON public.metas_dias_uteis_pessoa (empresa_id, ano, mes);

COMMENT ON TABLE public.metas_dias_uteis_pessoa IS
  'Dias que a pessoa trabalha no mes (meta proporcional), dentro dos dias '
  'uteis do setor. Sem linha, a pessoa segue o setor. 20261109170000.';

ALTER TABLE public.metas_dias_uteis_pessoa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metas_dias_pessoa_select ON public.metas_dias_uteis_pessoa;
CREATE POLICY metas_dias_pessoa_select ON public.metas_dias_uteis_pessoa
FOR SELECT USING ((SELECT public.fn_can_access_empresa(empresa_id)));

DROP POLICY IF EXISTS metas_dias_pessoa_insert ON public.metas_dias_uteis_pessoa;
CREATE POLICY metas_dias_pessoa_insert ON public.metas_dias_uteis_pessoa
FOR INSERT WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('metas_editar'))
);

DROP POLICY IF EXISTS metas_dias_pessoa_update ON public.metas_dias_uteis_pessoa;
CREATE POLICY metas_dias_pessoa_update ON public.metas_dias_uteis_pessoa
FOR UPDATE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('metas_editar'))
);

DROP POLICY IF EXISTS metas_dias_pessoa_delete ON public.metas_dias_uteis_pessoa;
CREATE POLICY metas_dias_pessoa_delete ON public.metas_dias_uteis_pessoa
FOR DELETE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('metas_editar'))
);

DROP POLICY IF EXISTS metas_dias_pessoa_super_admin_total ON public.metas_dias_uteis_pessoa;
CREATE POLICY metas_dias_pessoa_super_admin_total ON public.metas_dias_uteis_pessoa
TO authenticated
USING (public.fn_user_is_super_admin())
WITH CHECK (public.fn_user_is_super_admin());

REVOKE ALL ON TABLE public.metas_dias_uteis_pessoa FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.metas_dias_uteis_pessoa TO authenticated;
GRANT ALL ON TABLE public.metas_dias_uteis_pessoa TO service_role;

-- Mês fechado: a mesma trava da config de dias úteis.
DROP TRIGGER IF EXISTS trg_trava_mes_fechado ON public.metas_dias_uteis_pessoa;
CREATE TRIGGER trg_trava_mes_fechado
  BEFORE INSERT OR UPDATE OR DELETE ON public.metas_dias_uteis_pessoa
  FOR EACH ROW EXECUTE FUNCTION public.fn_trava_mes_fechado_ano_mes('Dias úteis da pessoa');

-- Auditoria: o mesmo registro dos dias úteis do setor.
DROP TRIGGER IF EXISTS trg_log_metas_dias_uteis_pessoa ON public.metas_dias_uteis_pessoa;
CREATE TRIGGER trg_log_metas_dias_uteis_pessoa
  AFTER INSERT OR DELETE OR UPDATE ON public.metas_dias_uteis_pessoa
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
    'meta', 'meta_config', 'os dias úteis da pessoa', '', '', 'empresa_id', 'aviso');

COMMIT;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
--   select to_regclass('public.metas_dias_uteis_pessoa');
--   select polname from pg_policy
--    where polrelid = 'public.metas_dias_uteis_pessoa'::regclass order by 1;
--   select tgname from pg_trigger
--    where tgrelid = 'public.metas_dias_uteis_pessoa'::regclass and not tgisinternal order by 1;
