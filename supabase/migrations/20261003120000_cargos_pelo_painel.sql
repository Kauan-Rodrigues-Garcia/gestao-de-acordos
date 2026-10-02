-- ============================================================================
-- Cargos editados pelo painel (Configurações > Cargos)
-- ============================================================================
--
-- ## Por que
--
-- As fases 2 a 6 criaram `public.cargos` e fizeram banco e front lerem dela,
-- mas ninguém conseguia criar, renomear ou desativar um cargo: a tabela só
-- mudava por migration. Esta migration prepara o banco para a tela nova.
--
-- ## O que muda
--
-- 1. Sai o CHECK `perfis_perfil_check`. Ele repetia a lista dos dez cargos e
--    recusaria qualquer cargo criado pela tela. A FK `perfis_perfil_fkey`
--    (20261002173600) já diz a mesma coisa lendo do cadastro.
-- 2. Guarda em `cargos` (gatilho `fn_cargos_guarda`):
--      - o slug não muda depois de criado (ele está gravado em `perfis`,
--        `cargos_permissoes`, `menu_lateral_ordem`);
--      - `super_admin` continua ativo, com acesso total e fora de setor — é o
--        único cargo que edita o cadastro, perder isso trancaria a tela;
--      - `pertence_a_setor` e `exige_tipo_setor` só mudam em cargo sem
--        ninguém: com gente dentro, a troca deixaria pessoas fora da regra
--        de lotação que os gatilhos de `perfis` cobram.
-- 3. Cargo desativado não é atribuído a ninguém (gatilho
--    `fn_perfis_cargo_ativo`). Quem já está nele continua.
--
-- Escrita em `cargos` continua só para super_admin (policies de 20261002173500).
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. O CHECK antigo sai; a FK fica ────────────────────────────────────────

DO $antes$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.perfis'::REGCLASS
       AND conname = 'perfis_perfil_fkey' AND convalidated
  ) THEN
    RAISE EXCEPTION 'perfis_perfil_fkey ausente: aplique 20261002173600 antes.';
  END IF;
END
$antes$;

ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_perfil_check;

-- ── 2. Guarda do cadastro ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cargos_guarda()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_pessoas INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'O identificador do cargo (%) não muda. Renomeie pelo nome.', OLD.slug;
  END IF;

  IF NEW.slug = 'super_admin'
     AND (NOT NEW.ativo OR NOT NEW.acesso_total OR NEW.pertence_a_setor) THEN
    RAISE EXCEPTION 'Super Admin continua ativo, com acesso total e sem setor.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.pertence_a_setor IS DISTINCT FROM OLD.pertence_a_setor
          OR NEW.exige_tipo_setor IS DISTINCT FROM OLD.exige_tipo_setor) THEN
    SELECT COUNT(*) INTO v_pessoas FROM public.perfis WHERE perfil = OLD.slug;
    IF v_pessoas > 0 THEN
      RAISE EXCEPTION 'O cargo % tem % pessoa(s). Mude o cargo delas antes de trocar a regra de setor.',
        OLD.nome, v_pessoas;
    END IF;
  END IF;

  NEW.atualizado_em := NOW();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_cargos_guarda ON public.cargos;
CREATE TRIGGER trg_cargos_guarda
  BEFORE INSERT OR UPDATE ON public.cargos
  FOR EACH ROW EXECUTE FUNCTION public.fn_cargos_guarda();

-- ── 3. Cargo desativado não recebe ninguém ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_perfis_cargo_ativo()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.perfil IS NOT DISTINCT FROM OLD.perfil THEN
    RETURN NEW;
  END IF;
  SELECT nome INTO v_nome FROM public.cargos WHERE slug = NEW.perfil AND NOT ativo;
  IF FOUND THEN
    RAISE EXCEPTION 'O cargo % está desativado.', v_nome;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_perfis_cargo_ativo ON public.perfis;
CREATE TRIGGER trg_perfis_cargo_ativo
  BEFORE INSERT OR UPDATE OF perfil ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_perfis_cargo_ativo();

-- ── 4. Registro e prova ─────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.perfis'::REGCLASS AND conname = 'perfis_perfil_check'
  ) THEN
    RAISE EXCEPTION 'perfis_perfil_check continua de pé.';
  END IF;
  IF (SELECT COUNT(*) FROM pg_trigger
       WHERE tgname IN ('trg_cargos_guarda', 'trg_perfis_cargo_ativo') AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'Gatilhos de cargos ausentes.';
  END IF;
END
$prova$;

COMMIT;
