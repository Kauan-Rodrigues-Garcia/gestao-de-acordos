-- ============================================================================
-- Receptivo (BookPlay) — comissão de setembro/2026 pela planilha premiação.xlsx
-- ============================================================================
--
-- Pedido de 16/09/2026. Só percentuais: bônus e metas ficam como estão.
--
-- Cada faixa = prêmio ÷ meta da planilha (coluna «Mult»), com seis casas
-- (migration 20260916140000). «Setor bateu a meta» = % especial por faixa, na
-- regra do padrão (percentual_especial). Blocos marcados Fevereiro/Julho valem
-- para setembro. Erros de digitação corrigidos pela conta: 0.800 com a 4ª meta
-- de 120 mil também na tabela «setor bateu» (estava 115 mil); Thiago/Matheus com
-- a 4ª faixa «setor bateu» = 1003 ÷ 70.000 (estava 1,25% à mão).
--
-- Quem é quem: subgrupo (0800, Elite, CRM, Digital), nome do bloco e a meta de
-- setembro de cada pessoa. O padrão (0.800) vale para quem não está em exceção.
--
--   0.800 (padrão do setor)
--     normal:       0.518889 / 0.705263 / 0.954545 / 1.125000
--     setor bateu:  0.572000 / 0.789895 / 1.097727 / 1.327500
--   HOMEOFFICE/NAYARA & JULIANA 0.800
--     normal:       0.524286 / 0.760000 / 1.187500 / 1.388889
--     setor bateu:  0.576714 / 0.851200 / 1.365625 / 1.638889
--     pessoas:      Juliana Itala, Nayara Macedo
--   DIGITAL
--     normal:       0.359231 / 0.496296 / 0.750000 / 0.900000
--     setor bateu:  0.396000 / 0.555852 / 0.862500 / 1.062000
--     pessoas:      Amanda Paulo, Eduarda Lorenzo, Jose Victor Tavares, Marianne Freitas, Nayara Cruz, Thiago Alves
--   NOVATOS (Ana/Eliara)
--     normal:       1.000000 / 1.142857 / 1.333333 / 1.545455
--     setor bateu:  1.100000 / 1.280000 / 1.533333 / 1.823636
--     pessoas:      Ana Clara Da Silva Sena, Eliara Prado
--   NOVATOS (nanci_moreira)
--     normal:       0.600000 / 0.727273 / 1.000000 / 1.214286
--     setor bateu:  0.660000 / 0.814545 / 1.150000 / 1.432857
--     pessoas:      Nanci Moreira
--   PRESENCIAL/viviane
--     normal:       0.583750 / 0.788235 / 1.166667 / 1.350000
--     setor bateu:  0.643500 / 0.882824 / 1.341667 / 1.593000
--     pessoas:      Viviane Antonio
--   Thiago/Matheus
--     normal:       0.600000 / 0.727273 / 1.000000 / 1.214286
--     setor bateu:  0.660000 / 0.814545 / 1.150000 / 1.432857
--     pessoas:      Tiago Almada, Matheus Gonçalves de Souza
--   Desafio Renata/Eduardo
--     normal:       0.545455 / 0.615385 / 0.800000 / 1.000000
--     setor bateu:  0.600000 / 0.689231 / 0.920000 / 1.180000
--     pessoas:      Renata Costa, Eduardo Melo
--   Bianca
--     normal:       0.640980 / 0.860550 / 1.267241 / 1.453846
--     setor bateu:  0.706588 / 0.963817 / 1.457328 / 1.715539
--     pessoas:      Bianca Santelli Santos
--   ELITE
--     normal:       0.359231 / 0.496296 / 0.750000 / 0.900000
--     setor bateu:  0.396000 / 0.555852 / 0.862500 / 1.062000
--     pessoas:      Agatha Rocha, Kauan Rodrigues, Gabriel Oliveira
--   PRESENCIAL/ATIVO(TESTE)
--     normal:       0.667143 / 0.893333 / 1.312500 / 1.500000
--     setor bateu:  0.735429 / 1.000533 / 1.509375 / 1.770000
--     pessoas:      Debora Portela da Silva, Gabriely Alves, Heloisa Lima, Larissa Pereiraa, Layra Carini
--
-- Reexecutável: reescreve as faixas do padrão e recria as exceções por usuário
-- do Receptivo em setembro/2026. Recusa se a meta do setor estiver validada.
-- ============================================================================

BEGIN;

DO $receptivo$
DECLARE
  c_empresa CONSTANT UUID    := '9bed94cd-605d-4d43-9afb-352c72b05c50';
  c_setor   CONSTANT UUID    := '6dd54018-e78f-4f3b-bca3-4221fe97f38b';
  c_ano     CONSTANT INTEGER := 2026;
  c_mes     CONSTANT INTEGER := 9;
  v_def     CONSTANT JSONB   := $json${
  "padrao": {
    "bloco": "0.800",
    "faixas": [
      {
        "ordem": 1,
        "pct": "0.518889",
        "pct_especial": "0.572000"
      },
      {
        "ordem": 2,
        "pct": "0.705263",
        "pct_especial": "0.789895"
      },
      {
        "ordem": 3,
        "pct": "0.954545",
        "pct_especial": "1.097727"
      },
      {
        "ordem": 4,
        "pct": "1.125000",
        "pct_especial": "1.327500"
      }
    ]
  },
  "grupos": [
    {
      "bloco": "HOMEOFFICE/NAYARA & JULIANA 0.800",
      "faixas": [
        {
          "ordem": 1,
          "pct": "0.524286",
          "pct_especial": "0.576714"
        },
        {
          "ordem": 2,
          "pct": "0.760000",
          "pct_especial": "0.851200"
        },
        {
          "ordem": 3,
          "pct": "1.187500",
          "pct_especial": "1.365625"
        },
        {
          "ordem": 4,
          "pct": "1.388889",
          "pct_especial": "1.638889"
        }
      ],
      "usuarios": [
        "63b36e53-b096-4085-94af-163546be17da",
        "bf33cd02-2638-49f4-8ecb-295fd8eeb031"
      ]
    },
    {
      "bloco": "DIGITAL",
      "faixas": [
        {
          "ordem": 1,
          "pct": "0.359231",
          "pct_especial": "0.396000"
        },
        {
          "ordem": 2,
          "pct": "0.496296",
          "pct_especial": "0.555852"
        },
        {
          "ordem": 3,
          "pct": "0.750000",
          "pct_especial": "0.862500"
        },
        {
          "ordem": 4,
          "pct": "0.900000",
          "pct_especial": "1.062000"
        }
      ],
      "usuarios": [
        "063ade4e-761e-44a8-ba87-74e80cefbfbc",
        "d6c509a8-3303-41e2-a2e4-16f8565889aa",
        "e9ff6750-f894-4e44-ada5-b4c321a7aa89",
        "c799c054-59f3-45ee-be51-26464dfa9fb7",
        "f9f5e829-c40f-4cdb-8405-3b861ec832cb",
        "73f36292-bffc-48df-903d-0276bdb0cf2b"
      ]
    },
    {
      "bloco": "NOVATOS (Ana/Eliara)",
      "faixas": [
        {
          "ordem": 1,
          "pct": "1.000000",
          "pct_especial": "1.100000"
        },
        {
          "ordem": 2,
          "pct": "1.142857",
          "pct_especial": "1.280000"
        },
        {
          "ordem": 3,
          "pct": "1.333333",
          "pct_especial": "1.533333"
        },
        {
          "ordem": 4,
          "pct": "1.545455",
          "pct_especial": "1.823636"
        }
      ],
      "usuarios": [
        "1d432841-ddc3-462a-bd99-4a2168f89e06",
        "da4c1a1f-58c8-42ca-abc9-3231f509e380"
      ]
    },
    {
      "bloco": "NOVATOS (nanci_moreira)",
      "faixas": [
        {
          "ordem": 1,
          "pct": "0.600000",
          "pct_especial": "0.660000"
        },
        {
          "ordem": 2,
          "pct": "0.727273",
          "pct_especial": "0.814545"
        },
        {
          "ordem": 3,
          "pct": "1.000000",
          "pct_especial": "1.150000"
        },
        {
          "ordem": 4,
          "pct": "1.214286",
          "pct_especial": "1.432857"
        }
      ],
      "usuarios": [
        "20f8aa44-957c-4fc8-a563-c515149005b1"
      ]
    },
    {
      "bloco": "PRESENCIAL/viviane",
      "faixas": [
        {
          "ordem": 1,
          "pct": "0.583750",
          "pct_especial": "0.643500"
        },
        {
          "ordem": 2,
          "pct": "0.788235",
          "pct_especial": "0.882824"
        },
        {
          "ordem": 3,
          "pct": "1.166667",
          "pct_especial": "1.341667"
        },
        {
          "ordem": 4,
          "pct": "1.350000",
          "pct_especial": "1.593000"
        }
      ],
      "usuarios": [
        "73e2ef4f-ffee-4cec-aaa7-8882adf29b3e"
      ]
    },
    {
      "bloco": "Thiago/Matheus",
      "faixas": [
        {
          "ordem": 1,
          "pct": "0.600000",
          "pct_especial": "0.660000"
        },
        {
          "ordem": 2,
          "pct": "0.727273",
          "pct_especial": "0.814545"
        },
        {
          "ordem": 3,
          "pct": "1.000000",
          "pct_especial": "1.150000"
        },
        {
          "ordem": 4,
          "pct": "1.214286",
          "pct_especial": "1.432857"
        }
      ],
      "usuarios": [
        "1d09ab1a-c762-42ff-9dee-6b772b55684e",
        "f0bb7f43-0055-4828-af08-c9930ea1b257"
      ]
    },
    {
      "bloco": "Desafio Renata/Eduardo",
      "faixas": [
        {
          "ordem": 1,
          "pct": "0.545455",
          "pct_especial": "0.600000"
        },
        {
          "ordem": 2,
          "pct": "0.615385",
          "pct_especial": "0.689231"
        },
        {
          "ordem": 3,
          "pct": "0.800000",
          "pct_especial": "0.920000"
        },
        {
          "ordem": 4,
          "pct": "1.000000",
          "pct_especial": "1.180000"
        }
      ],
      "usuarios": [
        "369c3594-d99d-4402-9513-bdc000b100f9",
        "6e825901-7a7a-412c-8d72-366572c2b89c"
      ]
    },
    {
      "bloco": "Bianca",
      "faixas": [
        {
          "ordem": 1,
          "pct": "0.640980",
          "pct_especial": "0.706588"
        },
        {
          "ordem": 2,
          "pct": "0.860550",
          "pct_especial": "0.963817"
        },
        {
          "ordem": 3,
          "pct": "1.267241",
          "pct_especial": "1.457328"
        },
        {
          "ordem": 4,
          "pct": "1.453846",
          "pct_especial": "1.715539"
        }
      ],
      "usuarios": [
        "08ed9c46-fd85-490e-9281-b40df6ab264a"
      ]
    },
    {
      "bloco": "ELITE",
      "faixas": [
        {
          "ordem": 1,
          "pct": "0.359231",
          "pct_especial": "0.396000"
        },
        {
          "ordem": 2,
          "pct": "0.496296",
          "pct_especial": "0.555852"
        },
        {
          "ordem": 3,
          "pct": "0.750000",
          "pct_especial": "0.862500"
        },
        {
          "ordem": 4,
          "pct": "0.900000",
          "pct_especial": "1.062000"
        }
      ],
      "usuarios": [
        "c55edfe0-ad2a-4d58-9033-4b5acd4dbc4e",
        "cd4f0c26-ad81-4782-81a7-ce74120ff2d7",
        "b7dddca3-7674-4b9c-99fe-ea4cd5cb889f"
      ]
    },
    {
      "bloco": "PRESENCIAL/ATIVO(TESTE)",
      "faixas": [
        {
          "ordem": 1,
          "pct": "0.667143",
          "pct_especial": "0.735429"
        },
        {
          "ordem": 2,
          "pct": "0.893333",
          "pct_especial": "1.000533"
        },
        {
          "ordem": 3,
          "pct": "1.312500",
          "pct_especial": "1.509375"
        },
        {
          "ordem": 4,
          "pct": "1.500000",
          "pct_especial": "1.770000"
        }
      ],
      "usuarios": [
        "827b8e43-675a-46ee-b9d5-bdfe28d8d038",
        "cb4afdb1-ef3f-4d05-bf75-a9b433aaecdf",
        "9f874549-1a68-4654-8452-63019c64f01e",
        "fa614b3b-4fbd-49f0-9f50-548ae4131130",
        "791cf84f-5378-459d-869f-e244b00d7df6"
      ]
    }
  ]
}$json$;
  v_grupo   JSONB;
  v_id      UUID;
  v_fora    TEXT;
BEGIN
  IF public.fn_metas_esta_validada(c_empresa, c_setor, c_mes, c_ano) THEN
    RAISE EXCEPTION 'A meta do Receptivo está validada em setembro/2026: reabra antes de configurar.';
  END IF;

  -- Todas as pessoas são do Receptivo, na BookPlay.
  SELECT string_agg(u.id, ', ') INTO v_fora
    FROM jsonb_array_elements(v_def->'grupos') AS g,
         LATERAL (SELECT x #>> '{}' AS id FROM jsonb_array_elements(g->'usuarios') AS x) AS u
   WHERE NOT EXISTS (SELECT 1 FROM public.perfis p
                      WHERE p.id = u.id::UUID AND p.empresa_id = c_empresa AND p.setor_id = c_setor);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'Pessoas fora do Receptivo: %', v_fora;
  END IF;

  -- ── Padrão do setor: bloco 0.800, com a regra de quando o setor bate a meta ──
  SELECT c.id INTO v_id FROM public.comissao_config c
   WHERE c.empresa_id = c_empresa AND c.setor_id = c_setor AND c.ano = c_ano AND c.mes = c_mes
     AND c.equipe_id IS NULL AND NOT c.grupo_usuarios
   FOR UPDATE;
  IF v_id IS NULL THEN
    INSERT INTO public.comissao_config (empresa_id, setor_id, ano, mes, modo_indireta, regra_setor)
    VALUES (c_empresa, c_setor, c_ano, c_mes, 'junto', 'percentual_especial')
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.comissao_config
       SET regra_setor = 'percentual_especial', multiplicador = NULL, atualizado_em = NOW()
     WHERE id = v_id;
  END IF;

  DELETE FROM public.comissao_faixas WHERE config_id = v_id;
  INSERT INTO public.comissao_faixas (config_id, ordem, pct, pct_especial)
  SELECT v_id, (f->>'ordem')::SMALLINT, (f->>'pct')::NUMERIC, (f->>'pct_especial')::NUMERIC
    FROM jsonb_array_elements(v_def #> '{padrao,faixas}') AS f;

  -- ── Exceções por usuário: recriadas do zero ────────────────────────────────
  DELETE FROM public.comissao_config c
   WHERE c.empresa_id = c_empresa AND c.setor_id = c_setor AND c.ano = c_ano AND c.mes = c_mes
     AND c.grupo_usuarios;

  FOR v_grupo IN SELECT * FROM jsonb_array_elements(v_def->'grupos') LOOP
    INSERT INTO public.comissao_config (empresa_id, setor_id, grupo_usuarios, ano, mes, modo_indireta, regra_setor)
    VALUES (c_empresa, c_setor, TRUE, c_ano, c_mes, 'junto', 'nenhuma')
    RETURNING id INTO v_id;

    INSERT INTO public.comissao_faixas (config_id, ordem, pct, pct_especial)
    SELECT v_id, (f->>'ordem')::SMALLINT, (f->>'pct')::NUMERIC, (f->>'pct_especial')::NUMERIC
      FROM jsonb_array_elements(v_grupo->'faixas') AS f;

    INSERT INTO public.comissao_config_usuarios (config_id, usuario_id, empresa_id, ano, mes)
    SELECT v_id, (u #>> '{}')::UUID, c_empresa, c_ano, c_mes
      FROM jsonb_array_elements(v_grupo->'usuarios') AS u;
  END LOOP;
END
$receptivo$;

DO $prova$
DECLARE
  v_grupos  INTEGER;
  v_pessoas INTEGER;
  v_faixas  INTEGER;
BEGIN
  SELECT count(*) FILTER (WHERE c.grupo_usuarios) INTO v_grupos
    FROM public.comissao_config c
   WHERE c.setor_id = '6dd54018-e78f-4f3b-bca3-4221fe97f38b' AND c.ano = 2026 AND c.mes = 9;

  SELECT count(*) INTO v_pessoas
    FROM public.comissao_config_usuarios cu
    JOIN public.comissao_config x ON x.id = cu.config_id
   WHERE x.setor_id = '6dd54018-e78f-4f3b-bca3-4221fe97f38b' AND x.ano = 2026 AND x.mes = 9;

  SELECT count(*) INTO v_faixas
    FROM public.comissao_faixas f
    JOIN public.comissao_config x ON x.id = f.config_id
   WHERE x.setor_id = '6dd54018-e78f-4f3b-bca3-4221fe97f38b' AND x.ano = 2026 AND x.mes = 9;

  IF v_grupos <> 10 OR v_pessoas <> 25 OR v_faixas <> 44 THEN
    RAISE EXCEPTION 'Configuração incompleta: % exceções (esperado 10), % pessoas (25), % faixas (44).',
      v_grupos, v_pessoas, v_faixas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.comissao_config c
     WHERE c.setor_id = '6dd54018-e78f-4f3b-bca3-4221fe97f38b' AND c.ano = 2026 AND c.mes = 9
       AND c.equipe_id IS NULL AND NOT c.grupo_usuarios AND c.regra_setor = 'percentual_especial'
  ) THEN
    RAISE EXCEPTION 'O padrão do Receptivo não ficou com a regra de percentual especial.';
  END IF;
END
$prova$;

COMMIT;
