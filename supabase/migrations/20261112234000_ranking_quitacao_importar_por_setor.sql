-- ============================================================================
-- 20261112234000_ranking_quitacao_importar_por_setor.sql
--
-- Ranking de quitação: cada setor importa o SEU relatório sem mexer nos
-- outros (pedido de 12/11/2026).
--
-- ## Por quê
--
-- Importar apagava o mês da EMPRESA inteira e gravava o que vinha no arquivo
-- (20261006120000). O relatório é tirado por grupo no ERP: quando o Play 2
-- importou o dele (12/11, 14h10), o novembro do Play 3, do Play 5 e do Play
-- Mix Marília sumiu, e eles tinham de reimportar. O aviso da prévia
-- (20261112210000) só impedia o acidente; o pedido é que não aconteça.
--
-- ## A regra nova
--
-- `fn_ranking_quitacao_importar` ganha `p_setores` (os setores que esta
-- importação atualiza — a prévia mostra e a pessoa confirma):
--
--   * apaga do mês só as quitações de quem é desses setores (o setor da
--     pessoa é o da equipe, senão o do cadastro — a régua da conta) e as que
--     têm o mesmo Cód. Acordo de uma linha que entra (o acordo mudou de mãos);
--   * grava só as linhas de quem é desses setores. Linha de outro setor que
--     veio no arquivo fica de fora: aquele setor não foi marcado;
--   * os outros setores ficam exatamente como estavam.
--
-- `p_setores` nulo (front antigo) = o de antes, a empresa inteira. A função
-- de 3 parâmetros sai (com o DEFAULT a chamada antiga cai nesta).
--
-- Login sem usuário no sistema não tem setor: na importação por setor não é
-- gravado (já não aparecia no ranking de ninguém).
--
-- Reverter: DROP desta função de 4 parâmetros e reaplicar a seção 2 de
-- 20261112233000.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

DROP FUNCTION IF EXISTS public.fn_ranking_quitacao_importar(UUID, DATE, JSONB);

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao_importar(
  p_empresa_id UUID, p_mes DATE, p_linhas JSONB, p_setores UUID[] DEFAULT NULL
)
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
  IF p_setores IS NOT NULL THEN
    IF cardinality(p_setores) = 0 THEN
      RAISE EXCEPTION 'Marque pelo menos um setor para importar.';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_setores) x
                WHERE NOT EXISTS (SELECT 1 FROM public.setores s WHERE s.id = x AND s.empresa_id = p_empresa_id)) THEN
      RAISE EXCEPTION 'Um dos setores nao e desta empresa.';
    END IF;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _rq_linhas (
    cod_acordo TEXT, operador_usuario TEXT, operador_id UUID, valor_acordo NUMERIC,
    data_quitacao DATE, tipo TEXT, setor_id UUID
  ) ON COMMIT DROP;
  TRUNCATE pg_temp._rq_linhas;

  -- As linhas válidas do mês, cada uma com o setor de quem quitou.
  INSERT INTO pg_temp._rq_linhas
  SELECT l.cod_acordo, l.operador_usuario, p.id, l.valor_acordo, l.data_quitacao,
         -- A origem da quitação; o leitor antigo não manda (fica nula = conta).
         CASE WHEN l.tipo IN ('quitacao', 'quitacao_boleto', 'juncao', 'saldo_zerado') THEN l.tipo END,
         COALESCE(e.setor_id, p.setor_id)
    FROM jsonb_to_recordset(p_linhas)
         AS l(cod_acordo TEXT, operador_usuario TEXT, operador_id UUID, valor_acordo NUMERIC, data_quitacao DATE, tipo TEXT)
    LEFT JOIN public.perfis p  ON p.id = l.operador_id AND p.empresa_id = p_empresa_id
    LEFT JOIN public.equipes e ON e.id = p.equipe_id
   WHERE NULLIF(trim(l.cod_acordo), '') IS NOT NULL
     AND NULLIF(trim(l.operador_usuario), '') IS NOT NULL
     AND l.valor_acordo IS NOT NULL
     AND date_trunc('month', l.data_quitacao)::DATE = v_mes;

  IF p_setores IS NULL THEN
    -- O de antes: a empresa inteira.
    DELETE FROM public.ranking_quitacao_acordos
     WHERE empresa_id = p_empresa_id AND mes = v_mes;
  ELSE
    -- Só o que é dos setores marcados entra.
    DELETE FROM pg_temp._rq_linhas WHERE setor_id IS NULL OR NOT (setor_id = ANY (p_setores));

    -- Sai do mês: quem é desses setores, e o acordo que volta pelo arquivo.
    DELETE FROM public.ranking_quitacao_acordos a
     WHERE a.empresa_id = p_empresa_id AND a.mes = v_mes
       AND (a.cod_acordo IN (SELECT r.cod_acordo FROM pg_temp._rq_linhas r)
            OR EXISTS (SELECT 1
                         FROM public.perfis p
                         LEFT JOIN public.equipes e ON e.id = p.equipe_id
                        WHERE p.id = a.operador_id
                          AND COALESCE(e.setor_id, p.setor_id) = ANY (p_setores)));
  END IF;

  INSERT INTO public.ranking_quitacao_acordos
         (empresa_id, mes, cod_acordo, operador_usuario, operador_id, valor_acordo, data_quitacao, importado_por, tipo)
  SELECT p_empresa_id, v_mes, r.cod_acordo, r.operador_usuario, r.operador_id, r.valor_acordo, r.data_quitacao,
         (SELECT auth.uid()), r.tipo
    FROM pg_temp._rq_linhas r
  ON CONFLICT (empresa_id, mes, cod_acordo) DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM public.fn_ranking_quitacao_avisar(p_empresa_id);
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ranking_quitacao_importar(UUID, DATE, JSONB, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ranking_quitacao_importar(UUID, DATE, JSONB, UUID[]) TO authenticated;

COMMENT ON FUNCTION public.fn_ranking_quitacao_importar(UUID, DATE, JSONB, UUID[]) IS
  'Grava os acordos quitados do mes e avisa TVs e aba. Com p_setores: substitui SO as '
  'quitacoes desses setores (os outros ficam como estavam) e grava so as linhas deles. '
  'p_setores nulo = a empresa inteira (o de antes). 20261112234000.';

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF to_regprocedure('public.fn_ranking_quitacao_importar(uuid,date,jsonb,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'PROVA: a importacao por setor nao foi criada.';
  END IF;
  IF to_regprocedure('public.fn_ranking_quitacao_importar(uuid,date,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'PROVA: a importacao antiga (3 parametros) ficou, e a chamada fica ambigua.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_ranking_quitacao_importar(uuid,date,jsonb,uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_ranking_quitacao_importar(uuid,date,jsonb,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVA: os grants da importacao ficaram errados.';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261112234000', 'ranking_quitacao_importar_por_setor', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
