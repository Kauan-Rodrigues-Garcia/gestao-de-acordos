-- Votação de surpresa (23/10/2026).
--
-- O pedido: a Guerra na Corrida é uma surpresa no meio de uma corrida de
-- cavalos valendo prêmio. A votação entre bichinhos e cavalos continua (para
-- ninguém desconfiar), mas o super_admin pode fechar dizendo quem ganha
-- (`p_forcar`). Aí:
--
--   - vence a forçada, seja qual for a contagem;
--   - o placar que todo mundo vê dá UM voto a mais para ela: se ela já ganhava
--     de verdade, fica o placar de verdade; se não, ela fica com o voto da outra
--     mais um (sem passar do número de quem foi chamado, senão a conta não fecha);
--   - ninguém vê quem votou em quê (já era assim: o card só mostra o número e o
--     próprio voto);
--   - o resultado de verdade fica guardado (`votos_reais`) e volta só para o
--     super_admin, na resposta do fechar.
--
-- Sem `p_forcar`, nada muda: vence a mais votada, empate vai no sorteio.
--
-- Reexecutável. Desfazer: ver o fim do arquivo.

BEGIN;

SET LOCAL lock_timeout = '15s';

ALTER TABLE public.corrida_enquetes
  ADD COLUMN IF NOT EXISTS forcada     TEXT CHECK (forcada IN ('bichinhos', 'cavalos')),
  ADD COLUMN IF NOT EXISTS votos_reais JSONB;

COMMENT ON COLUMN public.corrida_enquetes.forcada IS
  'Votação de surpresa: a categoria que o super_admin mandou ganhar (o placar mostrado dá um voto a mais para ela). Nulo: votação normal. Ver 20261023180000.';
COMMENT ON COLUMN public.corrida_enquetes.votos_reais IS
  'Votação de surpresa: a contagem de verdade, que só o super_admin vê. Ver 20261023180000.';

-- A assinatura muda (o p_forcar, com padrão): a antiga sai para não ficarem duas.
DROP FUNCTION IF EXISTS public.fn_corrida_enquete_fechar(bigint);

CREATE OR REPLACE FUNCTION public.fn_corrida_enquete_fechar(p_enquete bigint, p_forcar text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  e public.corrida_enquetes;
  v_b integer;
  v_c integer;
  v_vencedora text;
  v_ganha integer;
  v_perde integer;
  v_mostra_b integer;
  v_mostra_c integer;
BEGIN
  PERFORM public.fn_corrida_exigir_admin();
  IF p_forcar IS NOT NULL AND p_forcar NOT IN ('bichinhos', 'cavalos') THEN
    RAISE EXCEPTION 'CATEGORIA_INVALIDA: escolha bichinhos ou cavalos' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM public.corrida_enquetes WHERE id = p_enquete FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_ACHOU: votação não encontrada' USING ERRCODE = 'P0002';
  END IF;
  -- Já fechada (clique repetido): devolve o mesmo resultado.
  IF e.vencedora IS NOT NULL THEN
    RETURN jsonb_build_object('agora', clock_timestamp(), 'enquete',
      public.fn_corrida_enquete_json(p_enquete, auth.uid()) || jsonb_build_object('forcada', e.forcada, 'votos_reais', e.votos_reais));
  END IF;
  IF e.fechada_em IS NOT NULL THEN
    RAISE EXCEPTION 'VOTACAO_DESCARTADA: esta votação foi substituída por outra' USING ERRCODE = '22023';
  END IF;
  -- Folga de 2 s para o relógio do painel adiantado.
  IF clock_timestamp() < e.encerra_em - interval '2 seconds' THEN
    RAISE EXCEPTION 'AINDA_VOTANDO: a votação ainda está no ar' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) FILTER (WHERE categoria = 'bichinhos'), count(*) FILTER (WHERE categoria = 'cavalos')
    INTO v_b, v_c
    FROM public.corrida_enquete_votos WHERE enquete_id = p_enquete;

  IF p_forcar IS NULL THEN
    v_vencedora := CASE WHEN v_b > v_c THEN 'bichinhos'
                        WHEN v_c > v_b THEN 'cavalos'
                        WHEN random() < 0.5 THEN 'bichinhos' ELSE 'cavalos' END;
    v_mostra_b := v_b; v_mostra_c := v_c;
  ELSE
    v_vencedora := p_forcar;
    v_ganha := CASE WHEN p_forcar = 'cavalos' THEN v_c ELSE v_b END;
    v_perde := CASE WHEN p_forcar = 'cavalos' THEN v_b ELSE v_c END;
    IF v_ganha <= v_perde THEN
      -- um voto a mais que a outra, sem passar de quem foi chamado
      v_perde := LEAST(v_perde, GREATEST(0, (cardinality(e.votantes) - 1) / 2));
      v_ganha := v_perde + 1;
    END IF;
    v_mostra_c := CASE WHEN p_forcar = 'cavalos' THEN v_ganha ELSE v_perde END;
    v_mostra_b := CASE WHEN p_forcar = 'cavalos' THEN v_perde ELSE v_ganha END;
  END IF;

  UPDATE public.corrida_enquetes
     SET fechada_em = clock_timestamp(), vencedora = v_vencedora,
         votos_bichinhos = v_mostra_b, votos_cavalos = v_mostra_c, empate = (v_mostra_b = v_mostra_c),
         forcada = p_forcar,
         votos_reais = CASE WHEN p_forcar IS NULL THEN NULL ELSE jsonb_build_object('bichinhos', v_b, 'cavalos', v_c) END
   WHERE id = p_enquete;

  PERFORM public.fn_corrida_enquete_avisar(p_enquete);
  RETURN jsonb_build_object('agora', clock_timestamp(), 'enquete',
    public.fn_corrida_enquete_json(p_enquete, auth.uid())
      || jsonb_build_object('forcada', p_forcar, 'votos_reais', CASE WHEN p_forcar IS NULL THEN NULL ELSE jsonb_build_object('bichinhos', v_b, 'cavalos', v_c) END));
END;
$function$;

COMMENT ON FUNCTION public.fn_corrida_enquete_fechar(bigint, text) IS
  'Corrida da Sorte: fecha a votação de 30 s (super_admin). p_forcar (bichinhos | cavalos): a votação de surpresa, que vence com um voto a mais no placar. Ver 20261022130000 e 20261023180000.';

REVOKE ALL ON FUNCTION public.fn_corrida_enquete_fechar(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_corrida_enquete_fechar(bigint, text) TO authenticated;

-- ── Prova ──────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regprocedure('public.fn_corrida_enquete_fechar(bigint, text)') IS NULL THEN
    RAISE EXCEPTION 'enquete surpresa: faltou a função';
  END IF;
  IF to_regprocedure('public.fn_corrida_enquete_fechar(bigint)') IS NOT NULL THEN
    RAISE EXCEPTION 'enquete surpresa: a assinatura antiga ficou';
  END IF;
  IF has_function_privilege('anon', 'public.fn_corrida_enquete_fechar(bigint, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'enquete surpresa: função aberta demais';
  END IF;
END;
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Para desfazer ──────────────────────────────────────────────────────────
-- Volta a função de 20261022130000 (rode aquele arquivo de novo depois deste bloco):
-- DROP FUNCTION IF EXISTS public.fn_corrida_enquete_fechar(bigint, text);
-- ALTER TABLE public.corrida_enquetes DROP COLUMN IF EXISTS forcada, DROP COLUMN IF EXISTS votos_reais;
