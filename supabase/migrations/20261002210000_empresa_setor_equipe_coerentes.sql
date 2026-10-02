-- ============================================================================
-- Fase 4 da reorganizacao: empresa > setor > equipe amarrados no banco
-- ============================================================================
--
-- Ate aqui o banco aceitava tres incoerencias que o app so evitava por
-- disciplina das telas:
--
--   * equipe sem setor (`equipes.setor_id` nullable) ou sem empresa;
--   * equipe de uma empresa pendurada num setor de OUTRA empresa;
--   * pessoa com `setor_id` de um setor de outra empresa.
--
-- As contagens de 02/10/2026 deram zero para as tres, entao nada precisa de
-- limpeza: esta migration so impede que voltem. O passo 0 recusa aplicar,
-- dizendo quantas linhas, se alguma tiver aparecido desde a contagem.
--
-- ## O que entra
--
--   equipes.setor_id, equipes.empresa_id   NOT NULL
--   setores UNIQUE (id, empresa_id)        alvo das FKs compostas
--   equipes (setor_id, empresa_id) -> setores (id, empresa_id)   ON DELETE CASCADE
--   perfis  (setor_id, empresa_id) -> setores (id, empresa_id)
--
-- As FKs simples que ja existiam ficam: `equipes_setor_id_fkey` (CASCADE) e
-- `perfis_setor_id_fkey` (SET NULL) continuam decidindo o que acontece quando
-- um setor e apagado. A composta de `perfis` e NO ACTION: com setor_id ja
-- nulo pela SET NULL, ela nao tem o que conferir. E setor so se apaga zerado
-- (20260916100000).
--
-- Cupula (setor_id nulo) passa livre: FK composta com uma coluna nula nao
-- confere nada (MATCH SIMPLE).
--
-- ## O que fica de fora, de proposito
--
-- `perfis (equipe_id, setor_id) -> equipes (id, setor_id)`. O vinculo de
-- equipe sai de `perfis` na fase 5 (`equipe_membros`), e travar agora o campo
-- que vai embora so criaria um erro novo em tela que mexe nele.
--
-- FKs criadas NOT VALID e validadas em seguida. Reaplicavel.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 0. Nada fora do lugar ───────────────────────────────────────────────────

DO $antes$
DECLARE
  v_sem_setor   INTEGER;
  v_sem_empresa INTEGER;
  v_equipe_fora INTEGER;
  v_perfil_fora INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_sem_setor   FROM public.equipes WHERE setor_id IS NULL;
  SELECT COUNT(*) INTO v_sem_empresa FROM public.equipes WHERE empresa_id IS NULL;

  SELECT COUNT(*) INTO v_equipe_fora
    FROM public.equipes e JOIN public.setores s ON s.id = e.setor_id
   WHERE e.empresa_id IS DISTINCT FROM s.empresa_id;

  SELECT COUNT(*) INTO v_perfil_fora
    FROM public.perfis p JOIN public.setores s ON s.id = p.setor_id
   WHERE p.empresa_id IS DISTINCT FROM s.empresa_id;

  IF v_sem_setor + v_sem_empresa + v_equipe_fora + v_perfil_fora > 0 THEN
    RAISE EXCEPTION
      'Incoerencias: % equipe(s) sem setor, % sem empresa, % em setor de outra empresa, % pessoa(s) em setor de outra empresa.',
      v_sem_setor, v_sem_empresa, v_equipe_fora, v_perfil_fora;
  END IF;
END
$antes$;

-- ── 1. Equipe sempre tem setor e empresa ────────────────────────────────────

ALTER TABLE public.equipes ALTER COLUMN setor_id   SET NOT NULL;
ALTER TABLE public.equipes ALTER COLUMN empresa_id SET NOT NULL;

-- ── 2. Alvo das FKs compostas ───────────────────────────────────────────────

DO $uniq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.setores'::REGCLASS AND conname = 'setores_id_empresa_key'
  ) THEN
    ALTER TABLE public.setores ADD CONSTRAINT setores_id_empresa_key UNIQUE (id, empresa_id);
  END IF;
END
$uniq$;

-- ── 3. As FKs compostas ─────────────────────────────────────────────────────

DO $fks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.equipes'::REGCLASS AND conname = 'equipes_setor_da_empresa_fkey'
  ) THEN
    ALTER TABLE public.equipes
      ADD CONSTRAINT equipes_setor_da_empresa_fkey FOREIGN KEY (setor_id, empresa_id)
      REFERENCES public.setores (id, empresa_id) ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.perfis'::REGCLASS AND conname = 'perfis_setor_da_empresa_fkey'
  ) THEN
    ALTER TABLE public.perfis
      ADD CONSTRAINT perfis_setor_da_empresa_fkey FOREIGN KEY (setor_id, empresa_id)
      REFERENCES public.setores (id, empresa_id)
      NOT VALID;
  END IF;
END
$fks$;

ALTER TABLE public.equipes VALIDATE CONSTRAINT equipes_setor_da_empresa_fkey;
ALTER TABLE public.perfis  VALIDATE CONSTRAINT perfis_setor_da_empresa_fkey;

-- ── 4. Prova ────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF (SELECT COUNT(*) FROM pg_constraint
       WHERE conname IN ('equipes_setor_da_empresa_fkey', 'perfis_setor_da_empresa_fkey')
         AND convalidated) <> 2 THEN
    RAISE EXCEPTION 'As FKs compostas nao ficaram validadas.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'equipes'
       AND column_name IN ('setor_id', 'empresa_id') AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'equipes.setor_id/empresa_id ainda aceitam nulo.';
  END IF;
END
$prova$;

COMMIT;
