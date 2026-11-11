-- ============================================================================
-- NR / Código do acordo só com números — agora também no banco
-- ============================================================================
--
-- ## Por que
--
-- Pedido do Cleber, 11/11/2026: nas duas regras (Nosso produto = NR, Cofen =
-- Código) a chave do acordo não aceita mais letra, ponto nem símbolo, venha o
-- acordo de onde vier.
--
-- As telas de cadastro já filtravam desde 26/10/2026 (`lib/soNumeros.ts`), mas
-- o banco aceitava qualquer coisa: importação, RPC antiga, aba aberta com a
-- versão velha. Conferido em 11/11: 101 acordos com chave suja (Cofen 18,
-- Nosso produto 83), 5 deles de novembro.
--
-- ## A regra
--
-- A chave é a de sempre (`fn_nr_campo_chave` / `fn_acordo_chave_valor`): o
-- `nr_cliente` quando preenchido, senão a `instituicao`.
--
--   - INSERT: a chave tem de ser só dígitos.
--     Exceção: parcela nova de um GRUPO que já existe com essa mesma chave
--     (reagendar, espelhar a parcela do par, adicionar parcela). O acordo
--     antigo com chave suja continua andando; o que não entra é acordo NOVO
--     com chave suja.
--   - UPDATE: só quando a chave MUDA. Editar valor, vencimento ou situação de
--     um acordo antigo com chave suja continua permitido — e corrigir a chave
--     para só números também.
--   - Sem chave (NR e Código vazios): este gatilho não opina.
--
-- O erro começa com `CHAVE_SO_NUMEROS:` — a tela traduz (`mensagemErroNr`).
--
-- Reaplicável. Não escreve em nenhuma linha.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_acordos_chave_so_numeros()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_chave text := public.fn_acordo_chave_valor(NEW.nr_cliente, NEW.instituicao);
  v_campo text := public.fn_nr_campo_chave(NEW.nr_cliente, NEW.instituicao);
BEGIN
  IF v_chave IS NULL OR v_chave ~ '^\d+$' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND v_chave IS NOT DISTINCT FROM public.fn_acordo_chave_valor(OLD.nr_cliente, OLD.instituicao) THEN
    RETURN NEW;
  END IF;

  -- SECURITY DEFINER por causa deste EXISTS: a parcela do par é gravada por
  -- RPC no acordo de outra pessoa, e a RLS de quem chamou não enxergaria o grupo.
  IF TG_OP = 'INSERT' AND NEW.acordo_grupo_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.acordos g
        WHERE g.acordo_grupo_id = NEW.acordo_grupo_id
          AND public.fn_acordo_chave_valor(g.nr_cliente, g.instituicao) = v_chave) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'CHAVE_SO_NUMEROS: o % só aceita números (sem letras, pontos ou símbolos).',
    CASE WHEN v_campo = 'instituicao' THEN 'Código' ELSE 'NR' END
    USING ERRCODE = '23514';
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_acordos_chave_so_numeros() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_acordos_chave_so_numeros() IS
  'NR/Código só com dígitos: INSERT (exceto parcela de grupo existente com a mesma chave) e UPDATE que muda a chave. Ver 20261111150100.';

DROP TRIGGER IF EXISTS trg_acordos_chave_so_numeros ON public.acordos;
CREATE TRIGGER trg_acordos_chave_so_numeros
  BEFORE INSERT OR UPDATE OF nr_cliente, instituicao ON public.acordos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_acordos_chave_so_numeros();

COMMIT;

-- Conferência depois de aplicar:
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'public.acordos'::regclass AND tgname = 'trg_acordos_chave_so_numeros';
