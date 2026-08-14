-- ═══════════════════════════════════════════════════════════════════════════════
-- 20260813f — Vínculos consistentes na transferência + limpeza dos casos P1
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Regra do produto:
--
--   • se o transferido era o EXTRA, o DIRETO sobrevivente fica sem EXTRA;
--   • se o transferido era o DIRETO, o EXTRA sobrevivente continua EXTRA, mas
--     sem operador direto associado (igual ao EXTRA criado pelo botão da tela).
--
-- As duas situações têm a mesma representação: todo acordo sobrevivente que
-- apontava para o perfil transferido perde somente `vinculo_operador_id/nome`.
-- `tipo_vinculo` nunca é alterado por esta limpeza.
--
-- A migração também:
--   1. torna a limpeza parte da mesma transação que muda a empresa do perfil;
--   2. impede novos acordos cujo dono ou vínculo pertença a outra empresa;
--   3. corrige os 2 vínculos e os 3 acordos de teste encontrados na auditoria;
--   4. remove as 7 contas Auth órfãs confirmadas pelo responsável do projeto.

-- ─── 1. Limpeza transacional de acordos e vínculos ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_admin_apagar_acordos_do_usuario(
  p_user_id    UUID,
  p_empresa_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_apagados       INT := 0;
  v_empresa_escopo UUID;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN
    RAISE EXCEPTION 'Sem permissão para apagar acordos de usuário'
      USING ERRCODE = '42501';
  END IF;

  IF p_empresa_id IS NULL THEN
    SELECT empresa_id INTO v_empresa_escopo
      FROM public.perfis
     WHERE id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Perfil % não encontrado', p_user_id;
    END IF;
  ELSE
    v_empresa_escopo := p_empresa_id;
  END IF;

  IF NOT public.fn_can_access_empresa(v_empresa_escopo) THEN
    RAISE EXCEPTION 'Sem permissão para apagar acordos de usuário de outra empresa'
      USING ERRCODE = '42501';
  END IF;

  -- O acordo do outro operador sobrevive. Só a referência ao transferido sai:
  -- DIRETO fica sem EXTRA; EXTRA continua EXTRA, porém sem DIRETO associado.
  UPDATE public.acordos
     SET vinculo_operador_id   = NULL,
         vinculo_operador_nome = NULL
   WHERE vinculo_operador_id = p_user_id
     AND operador_id IS DISTINCT FROM p_user_id
     AND (p_empresa_id IS NULL OR empresa_id = p_empresa_id);

  DELETE FROM public.acordos
   WHERE operador_id = p_user_id
     AND (p_empresa_id IS NULL OR empresa_id = p_empresa_id);
  GET DIAGNOSTICS v_apagados = ROW_COUNT;

  -- Rastro deixado pelo perfil em acordos de terceiros. Mantém o comportamento
  -- anterior da rotina de exclusão/transferência.
  DELETE FROM public.historico_acordos WHERE usuario_id = p_user_id;
  DELETE FROM public.logs_whatsapp     WHERE usuario_id = p_user_id;

  -- Sobra defensiva: `nr_registros` é índice derivado e não tem FK.
  DELETE FROM public.nr_registros nr
   WHERE nr.operador_id = p_user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.acordos a WHERE a.id = nr.acordo_id
     );

  RETURN v_apagados;
END;
$$;

COMMENT ON FUNCTION public.fn_admin_apagar_acordos_do_usuario(UUID, UUID) IS
  'Apaga acordos do perfil e, atomicamente, remove o perfil dos vínculos de acordos sobreviventes sem mudar tipo_vinculo.';

REVOKE ALL ON FUNCTION public.fn_admin_apagar_acordos_do_usuario(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_admin_apagar_acordos_do_usuario(UUID, UUID) TO authenticated;

-- ─── 2. Troca de empresa e limpeza no mesmo COMMIT ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_transferencia_mover_empresa(
  p_perfil_id  UUID,
  p_empresa_id UUID,
  p_setor_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_antes            public.perfis%ROWTYPE;
  v_usuario          TEXT;
  v_colide           BOOLEAN;
  v_acordos_apagados INT := 0;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'sem permissão: mover alguém de empresa é de super_admin';
  END IF;

  IF p_setor_id IS NULL THEN
    RAISE EXCEPTION 'escolha o setor de destino';
  END IF;

  SELECT * INTO v_antes
    FROM public.perfis
   WHERE id = p_perfil_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'perfil % não encontrado', p_perfil_id;
  END IF;

  IF v_antes.empresa_id = p_empresa_id THEN
    RAISE EXCEPTION 'a empresa de destino é igual à empresa atual';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.setores
     WHERE id = p_setor_id
       AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'o setor escolhido não pertence à empresa de destino';
  END IF;

  v_usuario := v_antes.usuario;
  IF v_usuario IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.perfis
       WHERE usuario = v_usuario
         AND empresa_id = p_empresa_id
         AND id <> p_perfil_id
    ) INTO v_colide;

    IF v_colide THEN
      RAISE EXCEPTION
        'o login "%" já está em uso na empresa de destino; renomeie um dos dois antes',
        v_usuario;
    END IF;
  END IF;

  -- Relatório já foi gerado no cliente. Daqui até o UPDATE tudo é uma única
  -- transação: se qualquer passo falhar, acordos, vínculos e perfil voltam.
  v_acordos_apagados := public.fn_admin_apagar_acordos_do_usuario(
    p_perfil_id,
    v_antes.empresa_id
  );

  PERFORM set_config('app.transferencia_em_curso', 'on', true);

  UPDATE public.perfis
     SET empresa_id = p_empresa_id,
         setor_id   = p_setor_id,
         equipe_id  = NULL
   WHERE id = p_perfil_id;

  PERFORM set_config('app.transferencia_em_curso', 'off', true);

  RETURN jsonb_build_object(
    'ok',                TRUE,
    'origem_empresa',    v_antes.empresa_id,
    'origem_setor',      v_antes.setor_id,
    'origem_equipe',     v_antes.equipe_id,
    'acordos_apagados',  v_acordos_apagados
  );
END;
$$;

COMMENT ON FUNCTION public.fn_transferencia_mover_empresa(UUID, UUID, UUID) IS
  'Move perfil entre empresas e limpa acordos/vínculos da origem na mesma transação. Exige super_admin.';

REVOKE ALL ON FUNCTION public.fn_transferencia_mover_empresa(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_mover_empresa(UUID, UUID, UUID) TO authenticated;

-- ─── 3. Corrigir os casos encontrados na auditoria ──────────────────────────
DO $$
DECLARE
  v_vinculos_corrigidos INT := 0;
  v_acordos_teste       INT := 0;
  v_contas_removidas    INT := 0;
BEGIN
  -- Inclui tanto perfil inexistente quanto perfil que hoje pertence a outra
  -- empresa. No estado auditado são Eliara e Maria Fernanda (2 linhas).
  UPDATE public.acordos a
     SET vinculo_operador_id   = NULL,
         vinculo_operador_nome = NULL
   WHERE a.vinculo_operador_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.perfis p
        WHERE p.id = a.vinculo_operador_id
          AND p.empresa_id = a.empresa_id
     );
  GET DIAGNOSTICS v_vinculos_corrigidos = ROW_COUNT;

  -- Os três acordos que `clebin_admin` gravou na empresa diferente da empresa
  -- atual do próprio perfil foram confirmados como testes.
  DELETE FROM public.acordos a
   USING public.perfis p
   WHERE p.id = a.operador_id
     AND p.usuario = 'clebin_admin'
     AND p.empresa_id IS DISTINCT FROM a.empresa_id;
  GET DIAGNOSTICS v_acordos_teste = ROW_COUNT;

  -- Somente contas Auth sem perfil público, pelos usuários nominalmente
  -- confirmados. A checagem por ID ausente em perfis protege a conta real que
  -- hoje reutiliza o login `cleber_junior` em outro registro de perfil.
  DELETE FROM auth.users u
   WHERE NOT EXISTS (
     SELECT 1 FROM public.perfis p WHERE p.id = u.id
   )
     AND COALESCE(
       u.raw_user_meta_data->>'usuario',
       u.raw_user_meta_data->>'username'
     ) = ANY (ARRAY[
       'cleber_junior',
       'biruleibe_teste',
       'cleber_operador',
       'lider_teste',
       'robson_teste',
       'gabriel_guimaraes',
       'eterarwag'
     ]::TEXT[]);
  GET DIAGNOSTICS v_contas_removidas = ROW_COUNT;

  RAISE NOTICE
    'P1 limpa: % vínculo(s), % acordo(s) de teste e % conta(s) Auth órfã(s).',
    v_vinculos_corrigidos, v_acordos_teste, v_contas_removidas;
END;
$$;

-- ─── 4. Trava estrutural: acordo e perfis precisam ser do mesmo tenant ───────
CREATE OR REPLACE FUNCTION public.fn_validar_empresa_dos_perfis_do_acordo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.operador_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.perfis p
     WHERE p.id = NEW.operador_id
       AND p.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'o operador do acordo não pertence à empresa do acordo'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.vinculo_operador_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.perfis p
     WHERE p.id = NEW.vinculo_operador_id
       AND p.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'o operador vinculado não pertence à empresa do acordo'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_validar_empresa_dos_perfis_do_acordo()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validar_empresa_dos_perfis_do_acordo ON public.acordos;
CREATE TRIGGER trg_validar_empresa_dos_perfis_do_acordo
  BEFORE INSERT OR UPDATE OF operador_id, vinculo_operador_id, empresa_id
  ON public.acordos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validar_empresa_dos_perfis_do_acordo();

-- Acordos são limpos antes da troca de empresa. Esta segunda trava impede que
-- outro caminho mova o perfil e deixe acordos próprios ou vínculos para trás.
CREATE OR REPLACE FUNCTION public.fn_impedir_transferencia_com_acordos_pendentes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id AND EXISTS (
    SELECT 1
      FROM public.acordos a
     WHERE a.operador_id = OLD.id
        OR a.vinculo_operador_id = OLD.id
  ) THEN
    RAISE EXCEPTION
      'não é possível mudar a empresa: ainda existem acordos ou vínculos do perfil na empresa atual'
      USING ERRCODE = '23503',
            HINT = 'Use a transferência completa, que limpa os vínculos na mesma transação.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_impedir_transferencia_com_acordos_pendentes()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_impedir_transferencia_com_acordos_pendentes ON public.perfis;
CREATE TRIGGER trg_impedir_transferencia_com_acordos_pendentes
  BEFORE UPDATE OF empresa_id
  ON public.perfis
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_impedir_transferencia_com_acordos_pendentes();

-- ─── 5. Conferência da própria migration ─────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.acordos a
      LEFT JOIN public.perfis p ON p.id = a.operador_id
     WHERE p.id IS NULL
        OR p.empresa_id IS DISTINCT FROM a.empresa_id
  ) THEN
    RAISE EXCEPTION 'ainda existe acordo cujo operador não pertence à empresa';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.acordos a
      LEFT JOIN public.perfis p ON p.id = a.vinculo_operador_id
     WHERE a.vinculo_operador_id IS NOT NULL
       AND (p.id IS NULL OR p.empresa_id IS DISTINCT FROM a.empresa_id)
  ) THEN
    RAISE EXCEPTION 'ainda existe vínculo cujo operador não pertence à empresa';
  END IF;

  RAISE NOTICE 'Transferência e vínculos validados: nenhum acordo cruza empresas.';
END;
$$;
