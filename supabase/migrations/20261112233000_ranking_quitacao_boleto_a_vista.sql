-- ============================================================================
-- 20261112233000_ranking_quitacao_boleto_a_vista.sql
--
-- Ranking de quitação: a Quitação paga no BOLETO à vista ganha origem própria
-- (pedido de 12/11/2026, NR 12779516 da Thaina Couto).
--
-- ## Por quê
--
-- O NR 12779516 era um reparcelamento que ficou só na última parcela: o
-- acordo de R$ 275,00 é um boleto de 1 parcela que pagou as parcelas 23 e 24
-- do contrato, vencidas. O ERP diz «Quitação» porque o contrato fechou, mas
-- ninguém negociou uma quitação. No 671.xlsx (novembro, Play 2) os 9 boletos
-- à vista com «Quitação» são todos assim: as 2–4 últimas parcelas vencidas.
--
-- O Play 2 («Só acordo de Quitação», 20261112230000) não quer esses. O Play 3
-- («todas») aceita, como aceita o saldo zerado desde 28/10 (NR 12552080).
--
-- ## O que entra
--
-- `ranking_quitacao_acordos.tipo` aceita 'quitacao_boleto', que o leitor do
-- relatório passa a mandar. A conta (20261112230000) já deixa de fora, no
-- setor «só Quitação», tudo o que não é 'quitacao' — nada muda nela.
--
-- Depende de 20261112230000 — colar depois.
--
-- NOME: nasceu 20261112240000 («hora 24», que a CI recusa) e foi APLICADA no
-- banco assim em 12/11/2026; renomeada para 20261112233000 no mesmo dia. O
-- registro em schema_migrations precisa trocar 20261112240000 por esta.
--
-- Reverter: reaplicar as seções 1 e 2 de 20261112230000 (linhas com
-- 'quitacao_boleto' precisam virar 'quitacao' antes).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'ranking_quitacao_acordos' AND column_name = 'tipo') THEN
    RAISE EXCEPTION 'Aplique antes a 20261112230000_ranking_quitacao_aceita_por_setor.sql.';
  END IF;
END $$;

-- ── 1. A origem nova ────────────────────────────────────────────────────────

ALTER TABLE public.ranking_quitacao_acordos
  DROP CONSTRAINT IF EXISTS ranking_quitacao_acordos_tipo;
ALTER TABLE public.ranking_quitacao_acordos
  ADD CONSTRAINT ranking_quitacao_acordos_tipo
  CHECK (tipo IS NULL OR tipo IN ('quitacao', 'quitacao_boleto', 'juncao', 'saldo_zerado'));

COMMENT ON COLUMN public.ranking_quitacao_acordos.tipo IS
  'De onde a quitacao veio: quitacao (acordo Quitacao), quitacao_boleto (acordo Quitacao num '
  'boleto a vista: o fim do contrato), juncao (Juncao que fechou o contrato, troca de plano) ou '
  'saldo_zerado (outro rotulo com saldo zero). Nula = importada antes de 20261112230000, conta '
  'como quitacao. O setor com config aceita = so_quitacao so conta quitacao.';

-- ── 2. Importar ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao_importar(p_empresa_id UUID, p_mes DATE, p_linhas JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mes DATE := date_trunc('month', p_mes)::DATE;
  v_n   INTEGER;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('ranking_quitacao_importar')) THEN
    RAISE EXCEPTION 'Sem permissao para importar o Ranking de quitacao.' USING ERRCODE = '42501';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'As linhas do relatorio vieram em formato invalido.';
  END IF;

  DELETE FROM public.ranking_quitacao_acordos
   WHERE empresa_id = p_empresa_id AND mes = v_mes;

  INSERT INTO public.ranking_quitacao_acordos
         (empresa_id, mes, cod_acordo, operador_usuario, operador_id, valor_acordo, data_quitacao, importado_por, tipo)
  SELECT p_empresa_id, v_mes, l.cod_acordo, l.operador_usuario, p.id, l.valor_acordo, l.data_quitacao, (SELECT auth.uid()),
         -- A origem da quitação; o leitor antigo não manda (fica nula = conta).
         CASE WHEN l.tipo IN ('quitacao', 'quitacao_boleto', 'juncao', 'saldo_zerado') THEN l.tipo END
    FROM jsonb_to_recordset(p_linhas)
         AS l(cod_acordo TEXT, operador_usuario TEXT, operador_id UUID, valor_acordo NUMERIC, data_quitacao DATE, tipo TEXT)
    LEFT JOIN public.perfis p ON p.id = l.operador_id AND p.empresa_id = p_empresa_id
   WHERE NULLIF(trim(l.cod_acordo), '') IS NOT NULL
     AND NULLIF(trim(l.operador_usuario), '') IS NOT NULL
     AND l.valor_acordo IS NOT NULL
     AND date_trunc('month', l.data_quitacao)::DATE = v_mes
  ON CONFLICT (empresa_id, mes, cod_acordo) DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM public.fn_ranking_quitacao_avisar(p_empresa_id);
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.fn_ranking_quitacao_importar(UUID, DATE, JSONB) IS
  'Grava os acordos quitados do mes, substituindo a importacao anterior do mesmo mes, e '
  'grava a origem (tipo) e avisa TVs e aba (fn_ranking_quitacao_avisar). '
  '20261111150500, 20261112230000, 20261112233000.';

-- ── 3. Prova ────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'ranking_quitacao_acordos_tipo'
                    AND pg_get_constraintdef(oid) LIKE '%quitacao_boleto%') THEN
    RAISE EXCEPTION 'PROVA: a constraint de tipo nao aceita quitacao_boleto.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_ranking_quitacao_importar(uuid,date,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVA: fn_ranking_quitacao_importar perdeu o grant.';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261112233000', 'ranking_quitacao_boleto_a_vista', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
