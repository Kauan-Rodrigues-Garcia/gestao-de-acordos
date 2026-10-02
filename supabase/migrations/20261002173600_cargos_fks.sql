-- ============================================================================
-- O cargo ganha cadastro — fase 2, parte 2 de 2: as FKs
-- ============================================================================
--
-- `perfis.perfil` e `cargos_permissoes.cargo` passam a apontar para
-- `cargos(slug)`, criada na parte 1 (20261002173500_cargos_cadastro.sql).
--
-- Separada da parte 1 porque e a unica que precisa de trava em `perfis`, tabela
-- que o app usa o tempo todo. Com `lock_timeout` curto, se a trava nao vier
-- logo a migration desiste sem mexer em nada, em vez de enfileirar o app atras
-- dela. Basta reaplicar.
--
-- Criadas `NOT VALID` e validadas em seguida. O passo 1 recusa aplicar, e diz
-- o valor, se existir cargo gravado fora do cadastro.
--
-- Reaplicavel: as FKs so sao criadas quando ausentes.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. Ninguem pode estar fora do cadastro antes das FKs ────────────────────

DO $antes$
DECLARE
  v_perfis TEXT;
  v_perm   TEXT;
BEGIN
  SELECT string_agg(DISTINCT p.perfil, ', ')
    INTO v_perfis
    FROM public.perfis p
   WHERE NOT EXISTS (SELECT 1 FROM public.cargos c WHERE c.slug = p.perfil);

  SELECT string_agg(DISTINCT cp.cargo, ', ')
    INTO v_perm
    FROM public.cargos_permissoes cp
   WHERE NOT EXISTS (SELECT 1 FROM public.cargos c WHERE c.slug = cp.cargo);

  IF v_perfis IS NOT NULL OR v_perm IS NOT NULL THEN
    RAISE EXCEPTION 'Cargo fora do cadastro. perfis: [%]; cargos_permissoes: [%]',
      COALESCE(v_perfis, ''), COALESCE(v_perm, '');
  END IF;
END
$antes$;

-- ── 2. As FKs ───────────────────────────────────────────────────────────────
--
-- ON UPDATE CASCADE: renomear um slug leva junto quem o usa. ON DELETE
-- RESTRICT: cargo com gente ou com permissao nao se apaga — aposenta-se com
-- `ativo = FALSE`.

DO $fks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.perfis'::REGCLASS AND conname = 'perfis_perfil_fkey'
  ) THEN
    ALTER TABLE public.perfis
      ADD CONSTRAINT perfis_perfil_fkey FOREIGN KEY (perfil)
      REFERENCES public.cargos (slug) ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.cargos_permissoes'::REGCLASS AND conname = 'cargos_permissoes_cargo_fkey'
  ) THEN
    ALTER TABLE public.cargos_permissoes
      ADD CONSTRAINT cargos_permissoes_cargo_fkey FOREIGN KEY (cargo)
      REFERENCES public.cargos (slug) ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END
$fks$;

ALTER TABLE public.perfis            VALIDATE CONSTRAINT perfis_perfil_fkey;
ALTER TABLE public.cargos_permissoes VALIDATE CONSTRAINT cargos_permissoes_cargo_fkey;

-- ── 3. Prova ────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.perfis'::REGCLASS AND conname = 'perfis_perfil_fkey' AND convalidated
  ) THEN
    RAISE EXCEPTION 'perfis_perfil_fkey ausente ou nao validada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.cargos_permissoes'::REGCLASS AND conname = 'cargos_permissoes_cargo_fkey' AND convalidated
  ) THEN
    RAISE EXCEPTION 'cargos_permissoes_cargo_fkey ausente ou nao validada.';
  END IF;
END
$prova$;

COMMIT;
