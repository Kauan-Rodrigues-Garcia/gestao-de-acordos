-- ============================================================================
-- Usuários: marcação de menor aprendiz
-- ============================================================================
--
-- O pedido (21/10/2026): marcar no cadastro se a pessoa é menor aprendiz, para
-- ter esse controle. É só cadastro: nenhuma meta, jornada ou régua lê a
-- coluna. Quem marca é quem mexe no cargo (`usuarios_editar_cargo`), na janela
-- de Usuários — a RLS de `perfis` já decide quem alcança quem.
--
-- A própria pessoa não muda a marcação dela: `perfis_update_own` deixa cada um
-- gravar a própria linha, e `fn_perfis_proprio_sem_alcance` (20261006210000)
-- só barra as colunas que lista. Em vez de reescrever aquela função, um
-- gatilho pequeno, só para esta coluna, com a mesma exceção de quem administra.
--
-- Todos nascem `false`. Reaplicável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS menor_aprendiz BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.perfis.menor_aprendiz IS
  'Contrato de menor aprendiz. Controle de cadastro; nada no calculo le. 20261021130000.';

CREATE OR REPLACE FUNCTION public.fn_perfis_proprio_sem_aprendiz()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NEW.id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;
  IF public.fn_user_is_super_admin() OR public.fn_user_tem('usuarios_administrar') THEN
    RETURN NEW;
  END IF;
  IF NEW.menor_aprendiz IS DISTINCT FROM OLD.menor_aprendiz THEN
    RAISE EXCEPTION 'Ninguém altera a própria marcação de menor aprendiz. Peça a um administrador.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_perfis_proprio_sem_aprendiz() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_perfis_proprio_sem_aprendiz ON public.perfis;
CREATE TRIGGER trg_perfis_proprio_sem_aprendiz
  BEFORE UPDATE OF menor_aprendiz ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_perfis_proprio_sem_aprendiz();

COMMIT;
