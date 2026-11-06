-- ============================================================================
-- Setor excluído: as equipes somem junto, e o retrato do mês em aberto o deixa
-- ============================================================================
--
-- Complemento de 20261103170000. O ensaio do Play 4 (03/11/2026) mostrou duas
-- coisas que a primeira migration não cobria.
--
-- ## 1. As equipes não podem ser apagadas
--
-- `mestre_equipes.equipe_id` tem FK para `equipes` com SET NULL, e 8 subgrupos
-- do 59 apontam para equipes do Play 4. Agosto e setembro/2026 leem
-- `mestre_equipes` AO VIVO (`fn_mestre_equipes_do_mes`: o retrato do 59 só
-- existe de outubro em diante). Apagar as equipes soltaria esses subgrupos nos
-- dois meses fechados.
--
-- Então a equipe de setor excluído fica, e some do app como o setor: policy
-- RESTRICTIVE de SELECT em `equipes`. A lista dos excluídos vem de uma função
-- SECURITY DEFINER — lida de dentro da policy, `setores` já esconderia os
-- excluídos e a lista viria vazia. Em `(SELECT ...)`, ela roda uma vez por
-- consulta, não por linha.
--
-- ## 2. O retrato do mês em aberto regravaria o setor todo dia
--
-- `fn_composicao_mes_snapshot` reescreve o mês corrente inteiro a partir de
-- TODOS os setores e equipes da empresa. O Play 4 estava no retrato de
-- 2026-11, e quando novembro fechasse `listaDoFiltroDeSetores` o devolveria ao
-- filtro do mês. Em vez de recriar a função (grande, e mexida muitas vezes),
-- um gatilho BEFORE INSERT descarta a linha de setor/equipe excluído a partir
-- do mês da exclusão. Mês anterior à exclusão continua recebendo normalmente.
--
-- Nenhuma linha de dado muda aqui. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── Lista dos setores excluídos ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_setores_excluidos()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(array_agg(s.id), '{}'::uuid[])
    FROM public.setores s
   WHERE s.excluido_em IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.fn_setores_excluidos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_setores_excluidos() TO authenticated;

COMMENT ON FUNCTION public.fn_setores_excluidos() IS
  'Ids dos setores com excluido_em. Para policy que precisa enxergar o que '
  'setores_esconde_excluido esconde. Ver 20261103180000.';

-- ── Equipe de setor excluído some do app ────────────────────────────────────
DROP POLICY IF EXISTS equipes_esconde_do_setor_excluido ON public.equipes;
CREATE POLICY equipes_esconde_do_setor_excluido ON public.equipes
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  -- O `::uuid[]` é o que faz o ALL ler um array; sem ele, `ALL ((SELECT ...))`
  -- é ALL de subconsulta, e compara uuid com uuid[].
  USING (setor_id IS NULL OR setor_id <> ALL ((SELECT public.fn_setores_excluidos())::uuid[]));

-- ── O retrato não guarda setor excluído do mês da exclusão em diante ────────
CREATE OR REPLACE FUNCTION public.fn_retrato_descarta_setor_excluido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_setor     uuid := NEW.setor_id;
  v_excluido  timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'composicao_mes_equipe' AND v_setor IS NULL THEN
    SELECT q.setor_id INTO v_setor FROM public.equipes q WHERE q.id = NEW.equipe_id;
  END IF;
  IF v_setor IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.excluido_em INTO v_excluido FROM public.setores s WHERE s.id = v_setor;
  IF v_excluido IS NOT NULL
     AND NEW.mes >= to_char(v_excluido AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_retrato_descarta_setor_excluido() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_retrato_descarta_setor_excluido ON public.composicao_mes_setor;
CREATE TRIGGER trg_retrato_descarta_setor_excluido
  BEFORE INSERT ON public.composicao_mes_setor
  FOR EACH ROW EXECUTE FUNCTION public.fn_retrato_descarta_setor_excluido();

DROP TRIGGER IF EXISTS trg_retrato_descarta_setor_excluido ON public.composicao_mes_equipe;
CREATE TRIGGER trg_retrato_descarta_setor_excluido
  BEFORE INSERT ON public.composicao_mes_equipe
  FOR EACH ROW EXECUTE FUNCTION public.fn_retrato_descarta_setor_excluido();

COMMIT;
