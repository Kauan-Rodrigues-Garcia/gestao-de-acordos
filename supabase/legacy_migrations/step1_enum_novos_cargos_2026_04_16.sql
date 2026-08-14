
-- ============================================================
-- Step 1: Garantir ENUMs dos novos cargos
-- ============================================================
-- ALTER TYPE ADD VALUE não pode rodar dentro de uma transação,
-- então cada bloco DO é autônomo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.perfil_usuario'::regtype
      AND enumlabel = 'elite'
  ) THEN
    ALTER TYPE public.perfil_usuario ADD VALUE 'elite';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.perfil_usuario'::regtype
      AND enumlabel = 'gerencia'
  ) THEN
    ALTER TYPE public.perfil_usuario ADD VALUE 'gerencia';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.perfil_usuario'::regtype
      AND enumlabel = 'diretoria'
  ) THEN
    ALTER TYPE public.perfil_usuario ADD VALUE 'diretoria';
  END IF;
END $$;
