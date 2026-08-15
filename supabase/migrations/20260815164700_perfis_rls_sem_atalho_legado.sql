-- ============================================================================
-- perfis: derrubar as políticas legadas e fechar a escalada de cargo
-- ============================================================================
--
-- ⚠️ Esta migration RESTRINGE acesso. Leia antes de aplicar.
--
-- A tabela `perfis` acumulou duas gerações de políticas. As novas conferem
-- empresa e setor (`perfis_admin_all`, `perfis_lider_update`, `perfis_select`);
-- as antigas conferem só o cargo de quem chama. Como políticas PERMISSIVE são
-- unidas por OR, a mais frouxa é a que vale — as novas nunca chegaram a
-- restringir nada.
--
-- ## O que as antigas permitem hoje
--
--   «Lideres podem atualizar perfis do setor»  (UPDATE)
--       EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND perfil = 'lider')
--       Sem filtro de empresa e sem filtro de setor — apesar do nome. Qualquer
--       líder edita QUALQUER perfil das duas operações, inclusive promovendo
--       alguém a administrador, o que `perfis_lider_update` proíbe.
--
--   «Admins podem atualizar qualquer perfil»  (UPDATE)
--       Mesmo formato. Administrador da BookPlay edita perfil da PaguePlay.
--
--   `perfis_select_elevated`  (SELECT)
--       fn_get_perfil_usuario(auth.uid()) IN ('lider','administrador')
--       Sem filtro de empresa: líder de uma operação LÊ a lista inteira de
--       pessoas da outra. Esta é a mais silenciosa das três, porque vazamento de
--       leitura não gera erro em lugar nenhum.
--
-- ## O que sobra depois
--
--   super_admin        tudo, nas duas operações
--   administrador      tudo, dentro da própria empresa
--   lider/elite/gerencia   perfis do próprio setor e da própria empresa, sem
--                      poder criar administrador nem super_admin
--   qualquer pessoa    o próprio perfil
--
-- Ou seja: exatamente o que as políticas novas já diziam, e que só agora passa
-- a valer.
--
-- ## A escalada de cargo
--
-- Descoberta ao revisar as políticas acima, e ela é independente delas:
-- `perfis_update_own` permite `auth.uid() = id` sem restringir COLUNA. Nenhuma
-- trigger cobria isso. Na prática, qualquer pessoa autenticada podia virar
-- super admin com um PATCH em `/rest/v1/perfis?id=eq.<o próprio id>` mandando
-- `{"perfil":"super_admin"}` — sem passar por tela nenhuma, e o log de auditoria
-- registraria a mudança como alteração de perfil comum.
--
-- Derrubar as políticas antigas não fecharia esse buraco, e deixaria a migration
-- com cara de ter resolvido. A trigger abaixo fecha.
--
-- Idempotente: pode rodar duas vezes.
-- ============================================================================

-- ── 1. As três políticas legadas ────────────────────────────────────────────

DROP POLICY IF EXISTS "Lideres podem atualizar perfis do setor" ON public.perfis;
DROP POLICY IF EXISTS "Admins podem atualizar qualquer perfil"  ON public.perfis;
DROP POLICY IF EXISTS perfis_select_elevated                    ON public.perfis;

-- ── 2. Ninguém muda o próprio cargo ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_impedir_escalada_de_cargo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- O caminho comum: a tela de usuários manda `perfil` no payload mesmo quando
  -- só corrigiu o nome. Valor igual não é mudança de cargo.
  IF NEW.perfil IS NOT DISTINCT FROM OLD.perfil THEN
    RETURN NEW;
  END IF;

  -- Sem sessão de usuário: service_role, SQL Editor, migrations, seeds. Barrar
  -- aqui deixaria o banco sem manutenção possível.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- super_admin é a saída de manutenção, a mesma do cadeado do mês.
  IF public.fn_user_is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id = auth.uid() THEN
    RAISE EXCEPTION
      'Ninguém altera o próprio cargo. Peça a um administrador.'
      USING ERRCODE = '42501';
  END IF;

  -- Mudar o cargo de OUTRA pessoa continua sendo assunto da RLS: quem chega até
  -- aqui já passou por `perfis_admin_all` ou `perfis_lider_update`. Repetir a
  -- regra na trigger criaria duas fontes para a mesma pergunta, que é como as
  -- políticas desta tabela divergiram em primeiro lugar.
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_impedir_escalada_de_cargo() IS
  'Impede que alguém eleve o próprio cargo via perfis_update_own, que permite '
  'UPDATE na própria linha sem restringir coluna.';

DROP TRIGGER IF EXISTS trg_impedir_escalada_de_cargo ON public.perfis;
CREATE TRIGGER trg_impedir_escalada_de_cargo
  BEFORE UPDATE OF perfil ON public.perfis
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_impedir_escalada_de_cargo();

-- ── 3. Verificação ──────────────────────────────────────────────────────────

DO $$
DECLARE v_restantes TEXT;
BEGIN
  SELECT string_agg(policyname, ', ') INTO v_restantes
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'perfis'
     AND policyname IN (
       'Lideres podem atualizar perfis do setor',
       'Admins podem atualizar qualquer perfil',
       'perfis_select_elevated'
     );

  IF v_restantes IS NOT NULL THEN
    RAISE EXCEPTION 'Políticas legadas continuam de pé: %', v_restantes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.perfis'::regclass
       AND tgname  = 'trg_impedir_escalada_de_cargo'
  ) THEN
    RAISE EXCEPTION 'A trigger de escalada de cargo não foi criada.';
  END IF;
END $$;
