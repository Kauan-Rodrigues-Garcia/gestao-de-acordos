-- ============================================================================
-- Metas: dias úteis do mês por setor
-- ============================================================================
--
-- O pedido (21/10/2026): os dias úteis da meta seguem uma configuração geral
-- do mês, mas o setor que trabalha diferente pode ter os dele. Ex.: um setor
-- que trabalha no feriado, ou que folga num dia em que os outros trabalham.
--
-- ## O que o setor troca
--
-- Só o que decide o dia útil: a lista de feriados e `contar_dia_atual`. Os
-- quartis continuam sendo da empresa (`metas_config_mes.quartis`), e a semana
-- continua de segunda a sexta.
--
-- ## Tabela própria, e não `setor_id` em `metas_config_mes`
--
-- `metas_config_mes` é UMA linha por empresa/mês (UNIQUE empresa_id, mes, ano),
-- e há funções do banco que a leem com `LIMIT 1` ou `jsonb_object_agg` por
-- empresa (desafios, resumo do app). Pendurar linhas de setor ali faria essas
-- funções lerem a exceção de um setor como se fosse a regra de todos. Aqui a
-- geral fica intacta, e a exceção mora ao lado.
--
-- ## A linha é a lista inteira
--
-- `feriados` é a lista COMPLETA do setor no mês, não uma diferença sobre a
-- geral: ligar a exceção na tela copia a lista geral, e dali o setor tira ou
-- põe dias. Sem linha = o setor segue a geral. Apagar a linha é voltar a ela.
--
-- Mesmas portas da config geral: ver exige alcançar a empresa; gravar exige
-- `metas_editar_dias_uteis`; apagar, `metas_excluir_dias_uteis`. Mês fechado
-- trava pela mesma `fn_trava_mes_fechado_ano_mes` (20261001130000).
--
-- Reaplicável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.metas_config_setor_mes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id         UUID        NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  mes              INTEGER     NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano              INTEGER     NOT NULL CHECK (ano >= 2024),
  feriados         JSONB       NOT NULL DEFAULT '[]'::JSONB
                               CHECK (jsonb_typeof(feriados) = 'array'),
  contar_dia_atual BOOLEAN     NOT NULL DEFAULT FALSE,
  atualizado_por   UUID        REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT metas_config_setor_mes_setor_mes_ano_key UNIQUE (setor_id, mes, ano)
);

CREATE INDEX IF NOT EXISTS metas_config_setor_mes_empresa_mes_idx
  ON public.metas_config_setor_mes (empresa_id, ano, mes);

COMMENT ON TABLE public.metas_config_setor_mes IS
  'Dias uteis do mes de um setor que trabalha diferente: a lista inteira de '
  'feriados e contar_dia_atual. Sem linha, o setor segue metas_config_mes. '
  'Quartis continuam na config geral. 20261021140000.';

ALTER TABLE public.metas_config_setor_mes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metas_config_setor_select ON public.metas_config_setor_mes;
CREATE POLICY metas_config_setor_select ON public.metas_config_setor_mes
FOR SELECT USING ((SELECT public.fn_can_access_empresa(empresa_id)));

DROP POLICY IF EXISTS metas_config_setor_insert ON public.metas_config_setor_mes;
CREATE POLICY metas_config_setor_insert ON public.metas_config_setor_mes
FOR INSERT WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('metas_editar_dias_uteis'))
);

DROP POLICY IF EXISTS metas_config_setor_update ON public.metas_config_setor_mes;
CREATE POLICY metas_config_setor_update ON public.metas_config_setor_mes
FOR UPDATE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('metas_editar_dias_uteis'))
);

DROP POLICY IF EXISTS metas_config_setor_delete ON public.metas_config_setor_mes;
CREATE POLICY metas_config_setor_delete ON public.metas_config_setor_mes
FOR DELETE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('metas_excluir_dias_uteis'))
);

DROP POLICY IF EXISTS metas_config_setor_super_admin_total ON public.metas_config_setor_mes;
CREATE POLICY metas_config_setor_super_admin_total ON public.metas_config_setor_mes
TO authenticated
USING (public.fn_user_is_super_admin())
WITH CHECK (public.fn_user_is_super_admin());

REVOKE ALL ON TABLE public.metas_config_setor_mes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.metas_config_setor_mes TO authenticated;
GRANT ALL ON TABLE public.metas_config_setor_mes TO service_role;

-- Mês fechado: a mesma trava da config geral.
DROP TRIGGER IF EXISTS trg_trava_mes_fechado ON public.metas_config_setor_mes;
CREATE TRIGGER trg_trava_mes_fechado
  BEFORE INSERT OR UPDATE OR DELETE ON public.metas_config_setor_mes
  FOR EACH ROW EXECUTE FUNCTION public.fn_trava_mes_fechado_ano_mes('Dias úteis do setor');

-- Auditoria: o mesmo registro da config geral.
DROP TRIGGER IF EXISTS trg_log_metas_config_setor_mes ON public.metas_config_setor_mes;
CREATE TRIGGER trg_log_metas_config_setor_mes
  AFTER INSERT OR DELETE OR UPDATE ON public.metas_config_setor_mes
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
    'meta', 'meta_config', 'os dias úteis do setor', '', '', 'empresa_id', 'aviso');

COMMIT;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
--   select to_regclass('public.metas_config_setor_mes');
--   select polname from pg_policy
--    where polrelid = 'public.metas_config_setor_mes'::regclass order by 1;
--   -- 5 linhas
--   select tgname from pg_trigger
--    where tgrelid = 'public.metas_config_setor_mes'::regclass and not tgisinternal;
--   -- trg_log_metas_config_setor_mes, trg_trava_mes_fechado
