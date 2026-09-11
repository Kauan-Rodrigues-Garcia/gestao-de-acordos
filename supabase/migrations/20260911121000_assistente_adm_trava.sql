-- ============================================================================
-- Nucleo de Inteligencia e Gestao — a trava do cargo Assistente ADM
-- ============================================================================
--
-- Segunda metade de `..._assistente_adm_cargo`. Aplicar SO depois de converter
-- quem ja esta no setor do Nucleo
-- (`supabase/sql_scripts/assistente_adm_converter_nucleo_20260911.sql`). O
-- passo 0 recusa aplicar enquanto houver alguem em violacao, e diz quem.
--
-- ## A regra, nos dois sentidos
--
--   - `assistente_adm` so existe no setor apontado em `numeros_config`. Outro
--     setor, sem setor, ou empresa sem Nucleo configurado: recusa;
--   - o setor do Nucleo so aceita `assistente_adm`. Qualquer outro cargo: recusa.
--
-- Administrador e super_admin atravessam as duas: acesso total nao tem lado, e
-- a cupula nem pertence a setor (`fn_perfis_escopo_empresa` zera o vinculo).
--
-- ## Por que gatilho, e nao so a tela
--
-- A tela de usuarios vai oferecer so a combinacao certa, mas a tela nao e a
-- unica porta: a transferencia de setor, a de empresa (RPC), o desfazer da
-- transferencia e o SQL Editor tambem gravam cargo e setor. A regra tem de
-- valer em todas, e o unico lugar por onde todas passam e a tabela.
--
-- ## Trocar o setor do Nucleo
--
-- `fn_numeros_config_valida` passa a recusar apontar outro setor enquanto houver
-- Assistente ADM no setor atual, ou gente de cargo comum no setor novo. Sem
-- isso a regra acima ficaria violada em silencio pela tela de Configuracao.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── 0. Ninguem pode estar em violacao antes da trava ────────────────────────

DO $antes$
DECLARE
  v_lista TEXT;
BEGIN
  SELECT string_agg(format('%s (%s)', p.nome, p.perfil), ', ' ORDER BY p.nome)
    INTO v_lista
    FROM public.perfis p
    JOIN public.numeros_config c
      ON c.empresa_id = p.empresa_id AND p.setor_id = c.setor_nucleo_id
   WHERE p.perfil NOT IN ('assistente_adm', 'administrador', 'super_admin');

  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION
      'Converta primeiro quem esta no setor do Nucleo com cargo comum: %', v_lista;
  END IF;

  SELECT string_agg(p.nome, ', ' ORDER BY p.nome)
    INTO v_lista
    FROM public.perfis p
    LEFT JOIN public.numeros_config c ON c.empresa_id = p.empresa_id
   WHERE p.perfil = 'assistente_adm'
     AND (c.setor_nucleo_id IS NULL OR p.setor_id IS DISTINCT FROM c.setor_nucleo_id);

  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'Ha Assistente ADM fora do setor do Nucleo: %', v_lista;
  END IF;
END
$antes$;

-- ── 1. A trava em perfis ────────────────────────────────────────────────────
--
-- Nome com `b_`: gatilhos BEFORE da mesma tabela rodam em ordem alfabetica, e
-- este precisa vir DEPOIS de `a_trg_perfis_escopo_empresa`, que zera o setor da
-- cupula antes de alguem olhar para ele.

CREATE OR REPLACE FUNCTION public.fn_perfis_cargo_do_nucleo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_nucleo UUID;
BEGIN
  -- Acesso total atravessa: administrador e super_admin trabalham em qualquer
  -- setor, e a cupula nem tem setor.
  IF NEW.perfil IN ('administrador', 'super_admin') THEN
    RETURN NEW;
  END IF;

  SELECT c.setor_nucleo_id INTO v_nucleo
    FROM public.numeros_config c
   WHERE c.empresa_id = NEW.empresa_id;

  IF NEW.perfil = 'assistente_adm' THEN
    IF v_nucleo IS NULL THEN
      RAISE EXCEPTION
        'Assistente ADM é o cargo do Núcleo de Inteligência e Gestão, e esta empresa não tem o Núcleo configurado.'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.setor_id IS DISTINCT FROM v_nucleo THEN
      RAISE EXCEPTION
        'Assistente ADM só pode estar no setor Núcleo de Inteligência e Gestão.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF v_nucleo IS NOT NULL AND NEW.setor_id = v_nucleo THEN
    RAISE EXCEPTION
      'O setor Núcleo de Inteligência e Gestão só aceita o cargo Assistente ADM.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

-- Funcao de gatilho nao e chamavel pela API — a regra de 20260816150000.
REVOKE ALL ON FUNCTION public.fn_perfis_cargo_do_nucleo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS b_trg_perfis_cargo_do_nucleo ON public.perfis;
CREATE TRIGGER b_trg_perfis_cargo_do_nucleo
  BEFORE INSERT OR UPDATE OF perfil, setor_id, empresa_id ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_perfis_cargo_do_nucleo();

-- ── 2. Trocar o setor do Nucleo nao deixa ninguem em violacao ───────────────
--
-- A funcao inteira e reescrita (a de 20260910190000); o que muda e so o bloco
-- do meio.

CREATE OR REPLACE FUNCTION public.fn_numeros_config_valida()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_numeros_setor_e_da_empresa(NEW.setor_nucleo_id, NEW.empresa_id) THEN
    RAISE EXCEPTION 'O setor escolhido nao pertence a esta empresa.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' OR NEW.setor_nucleo_id IS DISTINCT FROM OLD.setor_nucleo_id THEN
    IF TG_OP = 'UPDATE' AND EXISTS (
      SELECT 1 FROM public.perfis p
       WHERE p.empresa_id = NEW.empresa_id
         AND p.perfil = 'assistente_adm'
         AND p.setor_id = OLD.setor_nucleo_id
    ) THEN
      RAISE EXCEPTION
        'Há Assistente ADM no setor atual do Núcleo. Transfira essas pessoas ou troque o cargo delas antes de apontar outro setor.'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.perfis p
       WHERE p.empresa_id = NEW.empresa_id
         AND p.setor_id = NEW.setor_nucleo_id
         AND p.perfil NOT IN ('assistente_adm', 'administrador', 'super_admin')
    ) THEN
      RAISE EXCEPTION
        'O setor escolhido tem pessoas com cargo comum, e o Núcleo só aceita Assistente ADM. Troque o cargo delas antes.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.atualizado_em := NOW();
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 3. Prova ────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.perfis'::REGCLASS
       AND tgname = 'b_trg_perfis_cargo_do_nucleo'
  ) THEN
    RAISE EXCEPTION 'A trava do cargo Assistente ADM nao foi criada.';
  END IF;
END
$prova$;

COMMIT;
