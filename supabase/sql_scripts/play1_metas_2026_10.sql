-- ============================================================================
-- Play 1 (BookPlay) — metas de outubro/2026 e equipes pela coluna SUPERVISOR
-- ============================================================================
--
-- Pedido de 05/10/2026, planilha «10 - Progresso Mensal (Metas) play 1»,
-- aba Preencher. Cada operador é achado pelo `perfis.usuario` SEM diferenciar
-- maiúscula de minúscula; as equipes, pelo id (levantados em 05/10/2026).
--
-- 1. Equipes renomeadas como na coluna SUPERVISOR:
--      «Thais / Castro/ Cleitinho»  -> ARI/THAIS
--      «Rhaissa»                    -> RHAISSA/CLEITON
-- 2. Operadores postos na equipe da planilha (`perfis.equipe_id`; o gatilho
--    espelha em `equipe_membros`):
--      ana_zambelli, tayna_sobrinho, raiana_reis (vinha de Rhaissa) e
--      andriele_silva (THAIS/MATEUS na planilha; decidido: fica em ARI/THAIS)
--        -> ARI/THAIS
--      geovana_carvalho, leticia_albano -> RHAISSA/CLEITON
--    Quem está nas equipes e não está na planilha não é tocado.
-- 3. Metas dos 34 operadores: 1º desafio em `meta_valor`, os outros em
--    `metas_extras`. Linha de outubro criada ou SUBSTITUÍDA (meta + degraus +
--    proporcional); meta em quantidade, meta indireta e régua ficam como
--    estão. Os de 9.000 (PROPORCIONAL = SIM) não têm degraus.
-- 4. Metas das equipes: ARI/THAIS 850.000 e RHAISSA/CLEITON 1.078.000 (só
--    `meta_valor`). A meta do setor Play 1 não é tocada.
--
-- Antes de gravar, recusa TUDO (e lista o motivo de cada um) se:
--   - a meta do Play 1 estiver validada em outubro/2026;
--   - alguma das duas equipes não estiver no Play 1 com o nome esperado
--     (antigo ou já o novo);
--   - algum usuário não existir na BookPlay, existir mais de uma vez ou não
--     estiver no Play 1.
--
-- Reexecutável: rodar de novo regrava os mesmos valores.
-- ============================================================================

BEGIN;

DO $metas$
DECLARE
  c_empresa CONSTANT UUID    := '9bed94cd-605d-4d43-9afb-352c72b05c50';
  c_setor   CONSTANT UUID    := '8c8b8107-c12d-417a-a29f-87d06153f5d9';
  c_ano     CONSTANT INTEGER := 2026;
  c_mes     CONSTANT INTEGER := 10;

  -- [id, nome antigo, nome novo, meta da equipe]
  v_eqs CONSTANT JSONB := $json$[
    ["49eaf9eb-e125-473e-b0b3-7588b07ae69b", "Thais / Castro/ Cleitinho", "ARI/THAIS",        850000],
    ["30a1a69a-5f9e-4b31-aaec-80beb1d8b433", "Rhaissa",                   "RHAISSA/CLEITON", 1078000]
  ]$json$;

  -- [usuario, equipe (nome novo), meta, [degraus], proporcional]
  v_ops CONSTANT JSONB := $json$[
    ["JULIANA_SPEREIRA",   "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["ANDREINA_FRATUCCI",  "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["THALITA_ANGELO",     "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["JULIA_BARBOZA",      "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["RAIANA_REIS",        "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["rosineide_mendes",   "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["juliano_silva",      "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["TAYNA_SOBRINHO",     "ARI/THAIS",        9000, [],                    true ],
    ["ANA_ZAMBELLI",       "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["MARIA_SILVA",        "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["CAMILA@RIBEIRO",     "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["CAROLINA_MURAI",     "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["ANA_DIAS",           "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["MONIQUE_MELO",       "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["JULIA_CAETANO",      "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["jaqueline_barbosa",  "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["ISABELLY_TELES",     "ARI/THAIS",        9000, [],                    true ],
    ["andriele_silva",     "ARI/THAIS",       49000, [58000, 67000, 76000], false],
    ["MICAELA_SOUZA",      "RHAISSA/CLEITON", 55000, [58000, 67000, 77000], false],
    ["CAMILLY_PEREIRA",    "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["JOZILAINE_LIMA",     "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["KARINA_SILVA",       "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["EMILY_JARDIM",       "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["STEPHANIE_ANDRADE",  "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["SHAKIRA_SANTOS",     "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["LAIZA_DANIELE",      "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["MAURO_SANTOS",       "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["JOSE_SILVA",         "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["CINTIA_DUARTEBRITO", "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["RAQUEL_PRISCILA",    "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["giovanni_fagundes",  "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["monique_lima",       "RHAISSA/CLEITON", 61000, [70000, 79000, 89000], false],
    ["LETICIA_ALBANO",     "RHAISSA/CLEITON",  9000, [],                    true ],
    ["GEOVANA_CARVALHO",   "RHAISSA/CLEITON",  9000, [],                    true ]
  ]$json$;

  v_item     JSONB;
  v_nome     TEXT;
  v_ids      UUID[];
  v_erros    TEXT[] := '{}';
  v_ops_ok   JSONB  := '[]';
  v_equipe   UUID;
  v_antes    public.metas%ROWTYPE;
  v_id       UUID;
  v_n        INTEGER;
  v_conferem INTEGER;
BEGIN
  IF public.fn_metas_esta_validada(c_empresa, c_setor, c_mes, c_ano) THEN
    RAISE EXCEPTION 'A meta do Play 1 está validada em outubro/2026: reabra antes de gravar.';
  END IF;

  -- 1. As equipes ainda são as levantadas (nome antigo, ou já o novo).
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_eqs) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.equipes e
       WHERE e.id = (v_item->>0)::UUID AND e.setor_id = c_setor
         AND e.nome IN (v_item->>1, v_item->>2)) THEN
      v_erros := v_erros || format('equipe %s (%s) não está no Play 1 com esse nome',
                                   v_item->>1, v_item->>0);
    END IF;
  END LOOP;

  -- 2. Resolver operadores pelo usuário, sem diferenciar maiúscula.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_ops) LOOP
    v_nome := v_item->>0;
    SELECT array_agg(p.id) INTO v_ids
      FROM public.perfis p
     WHERE p.empresa_id = c_empresa
       AND lower(btrim(p.usuario)) = lower(btrim(v_nome));

    IF v_ids IS NULL THEN
      v_erros := v_erros || format('usuário %s não existe na BookPlay', v_nome);
    ELSIF cardinality(v_ids) > 1 THEN
      v_erros := v_erros || format('usuário %s aparece %s vezes', v_nome, cardinality(v_ids));
    ELSIF NOT EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = v_ids[1] AND p.setor_id = c_setor) THEN
      v_erros := v_erros || format('usuário %s não está no Play 1', v_nome);
    ELSE
      v_ops_ok := v_ops_ok || jsonb_build_array(v_item || to_jsonb(v_ids[1]::TEXT));
    END IF;
  END LOOP;

  IF cardinality(v_erros) > 0 THEN
    RAISE EXCEPTION 'Nada gravado. Corrigir: %', array_to_string(v_erros, '; ');
  END IF;

  -- 3. Renomear as equipes e gravar a meta delas.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_eqs) LOOP
    v_equipe := (v_item->>0)::UUID;
    UPDATE public.equipes SET nome = v_item->>2
     WHERE id = v_equipe AND nome IS DISTINCT FROM v_item->>2;

    INSERT INTO public.metas (tipo, referencia_id, empresa_id, meta_valor, mes, ano)
    VALUES ('equipe', v_equipe, c_empresa, (v_item->>3)::NUMERIC, c_mes, c_ano)
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
       SET meta_valor = EXCLUDED.meta_valor, updated_at = NOW();
    RAISE NOTICE 'Equipe % -> % : meta %', v_item->>1, v_item->>2, v_item->>3;
  END LOOP;

  -- 4. Operadores: equipe da planilha e meta + degraus.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_ops_ok) LOOP
    v_id := (v_item->>5)::UUID;
    SELECT (e->>0)::UUID INTO v_equipe
      FROM jsonb_array_elements(v_eqs) e WHERE e->>2 = v_item->>1;

    UPDATE public.perfis SET equipe_id = v_equipe
     WHERE id = v_id AND equipe_id IS DISTINCT FROM v_equipe;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      RAISE NOTICE '% : entra na equipe %', v_item->>0, v_item->>1;
    END IF;

    SELECT m.* INTO v_antes FROM public.metas m
     WHERE m.tipo = 'operador' AND m.referencia_id = v_id AND m.empresa_id = c_empresa
       AND m.mes = c_mes AND m.ano = c_ano;
    IF FOUND THEN
      RAISE NOTICE '% : era % %, fica % %', v_item->>0,
        v_antes.meta_valor, v_antes.metas_extras, v_item->>2, v_item->3;
    ELSE
      RAISE NOTICE '% : nova, % %', v_item->>0, v_item->>2, v_item->3;
    END IF;

    INSERT INTO public.metas
      (tipo, referencia_id, empresa_id, meta_valor, metas_extras, meta_proporcional, mes, ano)
    VALUES
      ('operador', v_id, c_empresa, (v_item->>2)::NUMERIC, v_item->3,
       (v_item->>4)::BOOLEAN, c_mes, c_ano)
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
       SET meta_valor        = EXCLUDED.meta_valor,
           metas_extras      = EXCLUDED.metas_extras,
           meta_proporcional = EXCLUDED.meta_proporcional,
           updated_at        = NOW();
  END LOOP;

  -- 5. Prova: 34 operadores com equipe e meta da planilha; 2 equipes com nome e meta.
  SELECT count(*) INTO v_conferem
    FROM jsonb_array_elements(v_ops_ok) AS o
    JOIN public.perfis  p ON p.id = (o->>5)::UUID
    JOIN public.equipes e ON e.id = p.equipe_id AND e.nome = o->>1
    JOIN public.metas   m
      ON m.tipo = 'operador' AND m.referencia_id = p.id
     AND m.empresa_id = c_empresa AND m.mes = c_mes AND m.ano = c_ano
   WHERE m.meta_valor = (o->>2)::NUMERIC
     AND m.metas_extras = o->3
     AND m.meta_proporcional = (o->>4)::BOOLEAN;
  IF v_conferem <> jsonb_array_length(v_ops) THEN
    RAISE EXCEPTION 'Operadores: esperados %, conferem %.', jsonb_array_length(v_ops), v_conferem;
  END IF;

  SELECT count(*) INTO v_conferem
    FROM jsonb_array_elements(v_eqs) AS q
    JOIN public.equipes e ON e.id = (q->>0)::UUID AND e.nome = q->>2
    JOIN public.metas   m
      ON m.tipo = 'equipe' AND m.referencia_id = e.id
     AND m.empresa_id = c_empresa AND m.mes = c_mes AND m.ano = c_ano
   WHERE m.meta_valor = (q->>3)::NUMERIC;
  IF v_conferem <> jsonb_array_length(v_eqs) THEN
    RAISE EXCEPTION 'Equipes: esperadas %, conferem %.', jsonb_array_length(v_eqs), v_conferem;
  END IF;

  RAISE NOTICE 'Outubro/2026 gravado: % operadores e % equipes.',
    jsonb_array_length(v_ops), jsonb_array_length(v_eqs);
END
$metas$;

COMMIT;

-- Conferência: quem ficou em qual equipe, com qual meta, em outubro.
SELECT e.nome AS equipe, p.usuario, p.nome, m.meta_valor, m.metas_extras, m.meta_proporcional
  FROM public.perfis p
  LEFT JOIN public.equipes e ON e.id = p.equipe_id
  LEFT JOIN public.metas m
    ON m.tipo = 'operador' AND m.referencia_id = p.id
   AND m.empresa_id = '9bed94cd-605d-4d43-9afb-352c72b05c50' AND m.ano = 2026 AND m.mes = 10
 WHERE p.setor_id = '8c8b8107-c12d-417a-a29f-87d06153f5d9' AND p.ativo
 ORDER BY e.nome NULLS LAST, p.usuario;
