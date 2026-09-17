-- ============================================================================
-- Receptivo (BookPlay) — degraus de meta que faltavam em setembro/2026
-- ============================================================================
--
-- Pedido de 17/09/2026, pela planilha premiação.xlsx — a mesma dos percentuais
-- de receptivo_comissao_2026_09.sql. A faixa N da comissão mede o N-ésimo degrau
-- da meta da pessoa; sem a 2ª, 3ª e 4ª metas, o % dessas faixas nunca é usado.
--
-- Só completa: grava `metas_extras` (2ª, 3ª e 4ª metas) de quem tinha a 1ª meta
-- IGUAL à do bloco e NENHUM degrau além dela. A 1ª meta não muda.
--
-- Bloco = nome no cabeçalho da planilha, ou o subgrupo (Digital, Elite) para
-- quem não está em outro bloco:
--
--   0.800                    90.000 → 95.000 / 110.000 / 120.000
--                            Jeniffer Oliveira, Maria Valeria
--   DIGITAL                 130.000 → 135.000 / 140.000 / 150.000
--                            Jose Victor Tavares, Marianne Freitas, Nayara Cruz
--   ELITE                   130.000 → 135.000 / 140.000 / 150.000
--                            Kauan Rodrigues
--   Thiago/Matheus           50.000 → 55.000 / 60.000 / 70.000
--                            Tiago Almada, Matheus Gonçalves de Souza
--   NOVATOS (nanci_moreira)  50.000 → 55.000 / 60.000 / 70.000
--                            Nanci Moreira
--   PRESENCIAL/ATIVO(TESTE)  70.000 → 75.000 / 80.000 / 90.000
--                            Gabriely Alves, Heloisa Lima, Larissa Pereiraa, Layra Carini
--   PRESENCIAL/viviane       80.000 → 85.000 / 90.000 / 100.000
--                            Viviane Antonio
--   Desafio Renata/Eduardo   55.000 → 65.000 / 75.000 / 85.000
--                            Renata Costa
--
-- Ficam de fora de propósito — as metas deles são diferentes da planilha e não
-- são atualizadas por ela:
--   1ª meta diferente do bloco: Juliana Itala (53.333,33), Nayara Macedo (60.000),
--     Thiago Alves (90.000), Heloisa Camilo (55.000).
--   Já com quatro degraus diferentes da planilha: Bianca Santelli, Eduardo Melo,
--     Eriele Monteiro, Ana Clara, Eliara Prado, Gabriel Oliveira.
--   Sem bloco na planilha: Treinamento (Hayla Teixeira e Lucas Nascimento com
--     três degraus), e quem não tem meta no mês.
--
-- Reexecutável: quem já está com os degraus do bloco é pulado. Recusa tudo se a
-- meta do setor estiver validada, se a 1ª meta de alguém mudou ou se alguém
-- ganhou outros degraus depois da conferência de 17/09.
-- ============================================================================

BEGIN;

DO $metas$
DECLARE
  c_empresa CONSTANT UUID    := '9bed94cd-605d-4d43-9afb-352c72b05c50';
  c_setor   CONSTANT UUID    := '6dd54018-e78f-4f3b-bca3-4221fe97f38b';
  c_ano     CONSTANT INTEGER := 2026;
  c_mes     CONSTANT INTEGER := 9;
  c_pessoas CONSTANT INTEGER := 15;
  v_def     CONSTANT JSONB   := $json$[
    {
      "bloco": "0.800",
      "meta": 90000,
      "extras": [95000, 110000, 120000],
      "usuarios": [
        "76cc435c-6a78-44dd-8568-19568da096f7",
        "81976348-a7f9-412a-bcaf-5a226782148e"
      ]
    },
    {
      "bloco": "DIGITAL",
      "meta": 130000,
      "extras": [135000, 140000, 150000],
      "usuarios": [
        "e9ff6750-f894-4e44-ada5-b4c321a7aa89",
        "c799c054-59f3-45ee-be51-26464dfa9fb7",
        "f9f5e829-c40f-4cdb-8405-3b861ec832cb"
      ]
    },
    {
      "bloco": "ELITE",
      "meta": 130000,
      "extras": [135000, 140000, 150000],
      "usuarios": [
        "cd4f0c26-ad81-4782-81a7-ce74120ff2d7"
      ]
    },
    {
      "bloco": "Thiago/Matheus",
      "meta": 50000,
      "extras": [55000, 60000, 70000],
      "usuarios": [
        "1d09ab1a-c762-42ff-9dee-6b772b55684e",
        "f0bb7f43-0055-4828-af08-c9930ea1b257"
      ]
    },
    {
      "bloco": "NOVATOS (nanci_moreira)",
      "meta": 50000,
      "extras": [55000, 60000, 70000],
      "usuarios": [
        "20f8aa44-957c-4fc8-a563-c515149005b1"
      ]
    },
    {
      "bloco": "PRESENCIAL/ATIVO(TESTE)",
      "meta": 70000,
      "extras": [75000, 80000, 90000],
      "usuarios": [
        "cb4afdb1-ef3f-4d05-bf75-a9b433aaecdf",
        "9f874549-1a68-4654-8452-63019c64f01e",
        "fa614b3b-4fbd-49f0-9f50-548ae4131130",
        "791cf84f-5378-459d-869f-e244b00d7df6"
      ]
    },
    {
      "bloco": "PRESENCIAL/viviane",
      "meta": 80000,
      "extras": [85000, 90000, 100000],
      "usuarios": [
        "73e2ef4f-ffee-4cec-aaa7-8882adf29b3e"
      ]
    },
    {
      "bloco": "Desafio Renata/Eduardo",
      "meta": 55000,
      "extras": [65000, 75000, 85000],
      "usuarios": [
        "369c3594-d99d-4402-9513-bdc000b100f9"
      ]
    }
  ]$json$;
  v_bloco    JSONB;
  v_uid      UUID;
  v_meta     public.metas%ROWTYPE;
  v_gravados INTEGER := 0;
  v_ja_ok    INTEGER := 0;
  v_conferem INTEGER;
BEGIN
  IF public.fn_metas_esta_validada(c_empresa, c_setor, c_mes, c_ano) THEN
    RAISE EXCEPTION 'A meta do Receptivo está validada em setembro/2026: reabra antes de completar os degraus.';
  END IF;

  FOR v_bloco IN SELECT * FROM jsonb_array_elements(v_def) LOOP
    FOR v_uid IN SELECT (u #>> '{}')::UUID FROM jsonb_array_elements(v_bloco->'usuarios') AS u LOOP
      IF NOT EXISTS (SELECT 1 FROM public.perfis p
                      WHERE p.id = v_uid AND p.empresa_id = c_empresa AND p.setor_id = c_setor) THEN
        RAISE EXCEPTION 'Fora do Receptivo: % (bloco %).', v_uid, v_bloco->>'bloco';
      END IF;

      SELECT m.* INTO v_meta
        FROM public.metas m
       WHERE m.tipo = 'operador' AND m.referencia_id = v_uid AND m.empresa_id = c_empresa
         AND m.ano = c_ano AND m.mes = c_mes
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Sem meta em setembro/2026: % (bloco %).', v_uid, v_bloco->>'bloco';
      END IF;

      IF v_meta.meta_valor <> (v_bloco->>'meta')::NUMERIC THEN
        RAISE EXCEPTION '1ª meta mudou desde a conferência: % tem %, esperado % (bloco %).',
          v_uid, v_meta.meta_valor, v_bloco->>'meta', v_bloco->>'bloco';
      END IF;

      IF v_meta.metas_extras = v_bloco->'extras' THEN
        v_ja_ok := v_ja_ok + 1;
      ELSIF v_meta.metas_extras = '[]'::JSONB THEN
        UPDATE public.metas
           SET metas_extras = v_bloco->'extras', updated_at = NOW()
         WHERE id = v_meta.id;
        v_gravados := v_gravados + 1;
      ELSE
        RAISE EXCEPTION 'Degraus mudaram desde a conferência: % tem %, não mexi (bloco %).',
          v_uid, v_meta.metas_extras, v_bloco->>'bloco';
      END IF;
    END LOOP;
  END LOOP;

  -- Prova: as quinze linhas estão com a 1ª meta e os degraus do bloco.
  SELECT count(*) INTO v_conferem
    FROM jsonb_array_elements(v_def) AS b,
         LATERAL jsonb_array_elements(b->'usuarios') AS u
    JOIN public.metas m
      ON m.tipo = 'operador' AND m.referencia_id = (u #>> '{}')::UUID
     AND m.empresa_id = c_empresa AND m.ano = c_ano AND m.mes = c_mes
   WHERE m.meta_valor = (b->>'meta')::NUMERIC
     AND m.metas_extras = b->'extras';

  IF v_gravados + v_ja_ok <> c_pessoas OR v_conferem <> c_pessoas THEN
    RAISE EXCEPTION 'Esperadas % pessoas: % gravadas, % já certas, % conferem.',
      c_pessoas, v_gravados, v_ja_ok, v_conferem;
  END IF;

  RAISE NOTICE 'Degraus gravados: %; já estavam certos: %.', v_gravados, v_ja_ok;
END
$metas$;

COMMIT;
