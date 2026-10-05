-- ============================================================================
-- Play Mix Marília (BookPlay) — metas de outubro/2026 e equipes pela coluna
-- SUPERVISOR
-- ============================================================================
--
-- Pedido de 05/10/2026, planilha «10 - Progresso Mensal (Metas) play mix
-- marilia», aba Preencher. Cada operador é achado pelo `perfis.usuario` SEM
-- diferenciar maiúscula de minúscula.
--
-- 1. Equipes com o nome da coluna SUPERVISOR:
--      «Equipe Camila»  -> CAMILA HITOMI    (renomeada)
--      «Equipe Amaury»  -> AMAURY PIMENTA   (renomeada)
--      BRUNNO PICCOLO, ISABELA SOBRINHO, MARIA ARAUJO -> criadas no setor
--    «Equipe Digital» e «Treinamento» ficam como estão. Os supervisores NÃO
--    são vinculados como líderes (não foi pedido).
-- 2. Cada operador da planilha vai para a equipe do seu supervisor
--    (`perfis.equipe_id`; o gatilho espelha em `equipe_membros`). Quem está
--    nas equipes e não está na planilha não é tocado.
-- 3. Metas: 1º desafio em `meta_valor`, os outros em `metas_extras`;
--    PROPORCIONAL = SIM vira `meta_proporcional = true`. Linha de outubro
--    criada ou SUBSTITUÍDA (meta + degraus + proporcional). Valores exatamente
--    como na planilha, por decisão do usuário, inclusive:
--      KETHYN_GONZAGA   12.000 / 15.000 / 18.000 / 17.000
--      BRUNA_C_OLIVEIRA 18.000 / 11.000 / 14.000 / 17.000
--    A planilha não traz meta de equipe; a meta do setor não é tocada.
--
-- FORA deste script (usuário não existe no banco com esse login):
--   JHONATHA_PINTO (Amaury, 8/11/14/17), YASMIN_VITORIA (Isabela, 8/11/14/17),
--   ISABELLE_LIMA (Maria Araujo, 8/11/14/17).
--
-- Antes de gravar, recusa TUDO (e lista o motivo de cada um) se:
--   - a meta do Play Mix Marília estiver validada em outubro/2026;
--   - Equipe Camila / Equipe Amaury não estiverem no setor com o nome
--     esperado (antigo ou já o novo);
--   - já houver mais de uma equipe com o nome de uma das novas;
--   - algum usuário não existir na BookPlay, existir mais de uma vez ou não
--     estiver no Play Mix Marília.
--
-- Reexecutável: rodar de novo regrava os mesmos valores e não duplica equipe.
-- ============================================================================

BEGIN;

DO $metas$
DECLARE
  c_empresa CONSTANT UUID    := '9bed94cd-605d-4d43-9afb-352c72b05c50';
  c_setor   CONSTANT UUID    := 'd69898f2-4ec1-4140-86ea-1c04e0c8b484';
  c_ano     CONSTANT INTEGER := 2026;
  c_mes     CONSTANT INTEGER := 10;

  -- [id (null = criar), nome antigo, nome novo]
  v_eqs CONSTANT JSONB := $json$[
    ["ac037a4a-99a0-4cf7-b9ee-dfe0aaf82093", "Equipe Camila", "CAMILA HITOMI"],
    ["b4543729-8687-4f9f-9956-5eed3b1990db", "Equipe Amaury", "AMAURY PIMENTA"],
    [null, null, "BRUNNO PICCOLO"],
    [null, null, "ISABELA SOBRINHO"],
    [null, null, "MARIA ARAUJO"]
  ]$json$;

  -- [usuario, equipe, meta, [degraus], proporcional]
  v_ops CONSTANT JSONB := $json$[
    ["BRUNA_RAFAELA",        "CAMILA HITOMI",    18000, [21000, 24000, 27000], false],
    ["PRISCILA_KELLY",       "CAMILA HITOMI",    18000, [21000, 24000, 27000], false],
    ["BRUNA_XAVIER",         "CAMILA HITOMI",    12000, [15000, 18000, 21000], true ],
    ["DANIEL_FAGUNDES",      "CAMILA HITOMI",    12000, [15000, 18000, 21000], true ],
    ["SILVIA_ALVES",         "CAMILA HITOMI",    12000, [15000, 18000, 21000], true ],
    ["GABRIELA_SANTANA",     "CAMILA HITOMI",    12000, [15000, 18000, 21000], true ],
    ["MAURICIO_NOVE",        "CAMILA HITOMI",     8000, [11000, 14000, 17000], true ],
    ["EDUARDO_CARVALHO",     "CAMILA HITOMI",     8000, [11000, 14000, 17000], true ],
    ["THAIS_P_RODRIGUES",    "CAMILA HITOMI",     8000, [11000, 14000, 17000], true ],
    ["CAROLINE_BASTA",       "AMAURY PIMENTA",    8000, [11000, 14000, 17000], true ],
    ["GUSTAVO_GONCALVES",    "AMAURY PIMENTA",    8000, [11000, 14000, 17000], true ],
    ["KETHYN_GONZAGA",       "AMAURY PIMENTA",   12000, [15000, 18000, 17000], true ],
    ["LILIAN_CAVALCANTI",    "AMAURY PIMENTA",   18000, [21000, 24000, 27000], false],
    ["MARCOS_JUNIOR",        "AMAURY PIMENTA",   12000, [15000, 18000, 21000], true ],
    ["MARIA_BERNABE",        "AMAURY PIMENTA",   12000, [15000, 18000, 21000], true ],
    ["MARIA_L_MARTINS",      "AMAURY PIMENTA",   12000, [15000, 18000, 21000], true ],
    ["MIRELLY_MARINHO",      "AMAURY PIMENTA",    8000, [11000, 14000, 17000], true ],
    ["POLIANA_VARJAO",       "AMAURY PIMENTA",    8000, [11000, 14000, 17000], true ],
    ["JOAO_SANTOS",          "BRUNNO PICCOLO",   15000, [18000, 21000, 24000], true ],
    ["LAURA_BARBOSA",        "BRUNNO PICCOLO",   25000, [28000, 31000, 34000], false],
    ["THAYNARAOLIVEIRASANT", "BRUNNO PICCOLO",   25000, [28000, 31000, 34000], false],
    ["ANA_BENHAMES",         "ISABELA SOBRINHO", 12000, [15000, 18000, 21000], true ],
    ["BRUNA_C_OLIVEIRA",     "ISABELA SOBRINHO", 18000, [11000, 14000, 17000], true ],
    ["ELLEN_ALVES",          "ISABELA SOBRINHO",  8000, [11000, 14000, 17000], true ],
    ["ISABELLE_MOREIRA",     "ISABELA SOBRINHO", 18000, [21000, 24000, 27000], false],
    ["JENIFER_MAYARA",       "ISABELA SOBRINHO", 18000, [21000, 24000, 27000], false],
    ["KARINA_TEIXEIRA",      "ISABELA SOBRINHO", 18000, [21000, 24000, 27000], false],
    ["PAMELA_GONCALVES",     "ISABELA SOBRINHO",  8000, [11000, 14000, 17000], true ],
    ["PEDRO_H_SOUZA",        "ISABELA SOBRINHO", 12000, [15000, 18000, 21000], true ],
    ["MARYELLEN_ARAUJO",     "MARIA ARAUJO",      8000, [11000, 14000, 17000], true ],
    ["JAQUELINE_A_SILVA",    "MARIA ARAUJO",     12000, [15000, 18000, 21000], true ],
    ["JOYCE_ROSSETTO",       "MARIA ARAUJO",     12000, [15000, 18000, 21000], true ],
    ["JULIANE_VITORIA",      "MARIA ARAUJO",      8000, [11000, 14000, 17000], true ],
    ["RAFAELA_LISBOA",       "MARIA ARAUJO",      8000, [11000, 14000, 17000], true ],
    ["RHUAN_SILVA",          "MARIA ARAUJO",      8000, [11000, 14000, 17000], true ],
    ["VALERIA_ROMA",         "MARIA ARAUJO",      8000, [11000, 14000, 17000], true ],
    ["ANALIMASILVA",         "MARIA ARAUJO",      8000, [11000, 14000, 17000], true ]
  ]$json$;

  v_item     JSONB;
  v_nome     TEXT;
  v_ids      UUID[];
  v_erros    TEXT[] := '{}';
  v_ops_ok   JSONB  := '[]';
  v_eq_ids   JSONB  := '{}';   -- nome novo -> id
  v_equipe   UUID;
  v_antes    public.metas%ROWTYPE;
  v_id       UUID;
  v_n        INTEGER;
  v_conferem INTEGER;
BEGIN
  IF public.fn_metas_esta_validada(c_empresa, c_setor, c_mes, c_ano) THEN
    RAISE EXCEPTION 'A meta do Play Mix Marília está validada em outubro/2026: reabra antes de gravar.';
  END IF;

  -- 1. Equipes: as renomeadas ainda são as levantadas; as novas não estão duplicadas.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_eqs) LOOP
    IF v_item->>0 IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.equipes e
         WHERE e.id = (v_item->>0)::UUID AND e.setor_id = c_setor
           AND e.nome IN (v_item->>1, v_item->>2)) THEN
        v_erros := v_erros || format('equipe %s (%s) não está no Play Mix Marília com esse nome',
                                     v_item->>1, v_item->>0);
      END IF;
    ELSE
      SELECT count(*) INTO v_n FROM public.equipes e
       WHERE e.setor_id = c_setor AND lower(btrim(e.nome)) = lower(v_item->>2);
      IF v_n > 1 THEN
        v_erros := v_erros || format('já há %s equipes chamadas %s', v_n, v_item->>2);
      END IF;
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
      v_erros := v_erros || format('usuário %s não está no Play Mix Marília', v_nome);
    ELSE
      v_ops_ok := v_ops_ok || jsonb_build_array(v_item || to_jsonb(v_ids[1]::TEXT));
    END IF;
  END LOOP;

  IF cardinality(v_erros) > 0 THEN
    RAISE EXCEPTION 'Nada gravado. Corrigir: %', array_to_string(v_erros, '; ');
  END IF;

  -- 3. Renomear / criar as equipes.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_eqs) LOOP
    IF v_item->>0 IS NOT NULL THEN
      v_equipe := (v_item->>0)::UUID;
      UPDATE public.equipes SET nome = v_item->>2
       WHERE id = v_equipe AND nome IS DISTINCT FROM v_item->>2;
      RAISE NOTICE 'Equipe % -> %', v_item->>1, v_item->>2;
    ELSE
      SELECT e.id INTO v_equipe FROM public.equipes e
       WHERE e.setor_id = c_setor AND lower(btrim(e.nome)) = lower(v_item->>2);
      IF v_equipe IS NULL THEN
        INSERT INTO public.equipes (empresa_id, setor_id, nome, treinamento)
        VALUES (c_empresa, c_setor, v_item->>2, false)
        RETURNING id INTO v_equipe;
        RAISE NOTICE 'Equipe % criada', v_item->>2;
      END IF;
    END IF;
    v_eq_ids := v_eq_ids || jsonb_build_object(v_item->>2, v_equipe::TEXT);
    v_equipe := NULL;
  END LOOP;

  -- 4. Operadores: equipe da planilha e meta + degraus.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_ops_ok) LOOP
    v_id     := (v_item->>5)::UUID;
    v_equipe := (v_eq_ids->>(v_item->>1))::UUID;

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

  -- 5. Prova: 37 operadores com equipe e meta da planilha; 5 equipes no setor.
  SELECT count(*) INTO v_conferem
    FROM jsonb_array_elements(v_ops_ok) AS o
    JOIN public.perfis  p ON p.id = (o->>5)::UUID
    JOIN public.equipes e ON e.id = p.equipe_id AND e.nome = o->>1 AND e.setor_id = c_setor
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
    JOIN public.equipes e ON e.setor_id = c_setor AND e.nome = q->>2;
  IF v_conferem <> jsonb_array_length(v_eqs) THEN
    RAISE EXCEPTION 'Equipes: esperadas %, conferem %.', jsonb_array_length(v_eqs), v_conferem;
  END IF;

  RAISE NOTICE 'Outubro/2026 gravado: % operadores em % equipes.',
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
 WHERE p.setor_id = 'd69898f2-4ec1-4140-86ea-1c04e0c8b484' AND p.ativo
 ORDER BY e.nome NULLS LAST, p.usuario;
