-- ============================================================================
-- Mês fechado: as três configurações que ainda se editavam depois da virada
-- ============================================================================
--
-- Auditoria do fechamento de outubro (31/10/2026). Conferido em produção: as
-- três tabelas abaixo entram na conta do mês e não tinham `trg_trava_mes_fechado`
-- — qualquer líder reescrevia outubro em novembro.
--
--   analitico_exclusoes_setor  as origens que ficam FORA do acumulado do setor
--                              (`mes` texto). Tirar ou pôr uma origem muda o
--                              total do setor no mês.
--   contribuicao_receptivo     a META de contribuição do Receptivo por setor
--                              (`mes` texto). O acumulado vem do 59 desde
--                              14/09/2026; a linha guarda só a meta.
--   pix_automatico_bonus       o bônus de comissão do Pix por período
--                              (`inicio`..`fim`). Mudar o percentual de um
--                              bônus de outubro muda a comissão de outubro.
--
-- A trava é a de sempre (`fn_mes_fechado_barrar`, 20261029220000): só o super
-- admin escreve em mês fechado; o banco sem sessão (cron, service role) passa.
-- O bônus conta pelo mês do INÍCIO: começou num mês fechado, é do mês fechado.
--
-- Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── Trava para tabela com `mes` em texto (yyyy-MM) ──────────────────────────
-- Mesmos argumentos de fn_trava_mes_fechado_ano_mes: o rótulo e as colunas
-- livres (UPDATE que só mexe nelas passa).
CREATE OR REPLACE FUNCTION public.fn_trava_mes_fechado_mes_texto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_oque   TEXT := COALESCE(TG_ARGV[0], 'Este registro');
  v_livres TEXT[] := CASE WHEN TG_NARGS > 1 THEN string_to_array(TG_ARGV[1], ',') ELSE '{}' END;
BEGIN
  IF TG_OP = 'UPDATE' AND cardinality(v_livres) > 0
     AND (to_jsonb(NEW) - v_livres) = (to_jsonb(OLD) - v_livres) THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.fn_mes_fechado_barrar(to_jsonb(OLD)->>'mes', v_oque);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.fn_mes_fechado_barrar(to_jsonb(NEW)->>'mes', v_oque);
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_trava_mes_fechado ON public.analitico_exclusoes_setor;
CREATE TRIGGER trg_trava_mes_fechado
  BEFORE INSERT OR UPDATE OR DELETE ON public.analitico_exclusoes_setor
  FOR EACH ROW EXECUTE FUNCTION public.fn_trava_mes_fechado_mes_texto('Origens fora do acumulado');

DROP TRIGGER IF EXISTS trg_trava_mes_fechado ON public.contribuicao_receptivo;
CREATE TRIGGER trg_trava_mes_fechado
  BEFORE INSERT OR UPDATE OR DELETE ON public.contribuicao_receptivo
  FOR EACH ROW EXECUTE FUNCTION public.fn_trava_mes_fechado_mes_texto(
    'Meta de contribuição do Receptivo', 'atualizado_em,atualizado_por');

-- ── Bônus de Pix: o mês do início ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trava_mes_fechado_pix_bonus()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - ARRAY['atualizado_em']) = (to_jsonb(OLD) - ARRAY['atualizado_em']) THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.fn_mes_fechado_barrar(to_char(OLD.inicio, 'YYYY-MM'), 'Bônus de Pix');
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.fn_mes_fechado_barrar(to_char(NEW.inicio, 'YYYY-MM'), 'Bônus de Pix');
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_trava_mes_fechado ON public.pix_automatico_bonus;
CREATE TRIGGER trg_trava_mes_fechado
  BEFORE INSERT OR UPDATE OR DELETE ON public.pix_automatico_bonus
  FOR EACH ROW EXECUTE FUNCTION public.fn_trava_mes_fechado_pix_bonus();

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF (SELECT count(*) FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
       WHERE t.tgname = 'trg_trava_mes_fechado'
         AND c.relname IN ('analitico_exclusoes_setor', 'contribuicao_receptivo', 'pix_automatico_bonus')) <> 3 THEN
    RAISE EXCEPTION 'PROVA: as três travas não ficaram no lugar — nada foi aplicado';
  END IF;
END
$prova$;

COMMIT;
