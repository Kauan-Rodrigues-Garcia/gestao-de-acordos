-- ============================================================================
-- Conecta Play (regra Cofen): equipes e metas de NOVEMBRO/2026
-- pela lista do Cleber de 05/11/2026 (OPERADOR · SUPERVISOR · DESAFIO)
-- ============================================================================
--
-- Rodar inteiro no SQL Editor. Uma transação só: se qualquer conferência
-- falhar, NADA é gravado e a mensagem diz o motivo.
--
-- Conferido no banco em 05/11/2026 (4 SELECTs autorizados):
--   setor Conecta Play 4c44cd71…, empresa PAGUEPLAY e6bfb6ac…, regra cofen,
--   ho_percentual 0,2260; 5 equipes; 29 metas de operador de novembro já
--   digitadas (4 proporcionais, nenhuma com níveis extras).
--
-- 1. EQUIPES = o nome do supervisor. As que já existem são RENOMEADAS (os
--    líderes e o histórico ficam):
--      «COFEN MARÍLIA - STEPHANIE» -> Stephanie Bernardes
--      «COFEN BRUNA CHATPLAY»      -> Bruna Justimiano
--      «COFEN KÁTIA 2º TURNO»      -> Katia Regina
--      «TREINAMENTO / ISABELLA»    -> Isabela / Layane  (Isabela Monteiro +
--                                     Layane Brito, as duas líderes)
--    A equipe «Layane Brito» (vazia) perde a líder e fica vazia, para não
--    dividir o crédito da Layane entre duas equipes. Apague pela tela se não
--    for mais usar.
--
-- 2. OPERADORES = os 42 da lista. Logins corrigidos para os do sistema:
--      rebeca_caramgo -> rebeca_camargo   silvia_beatriz -> silva_beatriz
--      amabely        -> amabelly_santos  joão_v_santos  -> joao_v_santos
--      kauê_nadai     -> kaue_nadai       Manuela_ marini -> manuela_marini
--      Poliana_varjão -> poliana_varjao
--    Leticia Romeu entra como operadora da equipe da Bruna (é como está hoje).
--
-- 3. QUEM ESTÁ EM OUTRO SETOR: os 5 do R$ 5.000 (thais_p_rodrigues,
--    rhuan_silva, poliana_varjao, isabelle_moreira, rafaela_lisboa) estão no
--    Play Mix Marília.
--      - mesma empresa: transferidos aqui, como no Play 5 — registro em
--        `perfis_transferencias` (fantasma ligado, desfazível pela tela),
--        sem apagar nem mover acordos;
--      - OUTRA empresa: o script NÃO move (troca de empresa só pela tela de
--        Usuários). Grava a meta deles na PaguePlay e lista no fim: transferir
--        pela tela para o Conecta Play e pôr na equipe «Isabela / Layane».
--
-- 4. METAS de novembro/2026: só a meta principal (o DESAFIO). A lista vem em
--    H.O.; o banco guarda BRUTO = H.O. ÷ ho_percentual da PaguePlay, ao
--    centavo — é o que a aba Metas mostra de volta em H.O. exato.
--    Os níveis extras e o «proporcional» que já estiverem na linha NÃO mudam.
--    Metas de equipe e de setor: não estão na lista, não são tocadas.
--
-- 5. QUEM ESTÁ NO CONECTA PLAY E NÃO ESTÁ NA LISTA (operador/elite) sai da
--    equipe. Em 05/11: Jade Faustino (equipe Kátia) sai; Ingryd Oliveira,
--    Jasmim Sousa, Kethely Santos e Silva Jessica já estavam sem equipe.
--    Líderes, gerência (Fábio) e ouvidoria (Jhonata) não são tocados.
--    A consulta B do fim lista todos.
--
-- Reexecutável: rodar de novo regrava os mesmos valores, sem duplicar.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

DROP TABLE IF EXISTS pg_temp.cp_relatorio;
CREATE TEMP TABLE cp_relatorio (
  ordem SERIAL, tipo TEXT, usuario TEXT, nome TEXT, detalhe TEXT
);

DO $conecta$
DECLARE
  c_ano     CONSTANT INTEGER := 2026;
  c_mes     CONSTANT INTEGER := 11;
  c_mes_txt CONSTANT TEXT    := '2026-11';
  c_setor   CONSTANT UUID := '4c44cd71-378d-43aa-a1f6-7dd39339839f';
  c_empresa CONSTANT UUID := 'e6bfb6ac-c08b-468b-86e8-853c25fb7ef0';
  c_layane  CONSTANT UUID := '109a44a6-d346-4cfe-8290-e477e236fc55';
  c_eq_layane_antiga CONSTANT UUID := '54a9f393-1580-4dc6-ba5a-01643809741d';

  -- [nome novo, id, nome de hoje]
  v_eqs CONSTANT JSONB := $json$[
    ["Stephanie Bernardes", "81d8066f-ee60-44f1-85e9-c7406edd2db7", "COFEN MARÍLIA - STEPHANIE"],
    ["Bruna Justimiano",    "5bd254de-89b9-4fb2-97b8-3c5ecbfa92a7", "COFEN BRUNA CHATPLAY"],
    ["Katia Regina",        "14ad6964-17cc-4d84-8518-cda220db53fb", "COFEN KÁTIA 2º TURNO"],
    ["Isabela / Layane",    "5db02ddb-e313-44f9-950a-8216d3377621", "TREINAMENTO / ISABELLA"]
  ]$json$;

  -- [login no sistema, equipe, DESAFIO em H.O.]
  v_ops CONSTANT JSONB := $json$[
    ["karina_colonez",     "Stephanie Bernardes", 18000],
    ["itallo_cardamoni",   "Stephanie Bernardes", 18000],
    ["bruna_garbi",        "Stephanie Bernardes", 18000],
    ["claudineia_messias", "Stephanie Bernardes", 18000],
    ["bruna_teles",        "Stephanie Bernardes", 18000],
    ["isabella_santos",    "Stephanie Bernardes", 18000],
    ["leonardo_costa",     "Stephanie Bernardes", 18000],
    ["rebeca_camargo",     "Stephanie Bernardes", 18000],
    ["joao_v_santos",      "Stephanie Bernardes", 12000],
    ["mariana_hilario",    "Stephanie Bernardes", 12000],
    ["livia_jacob",        "Stephanie Bernardes", 12000],
    ["vanessa_correa",     "Stephanie Bernardes", 12000],

    ["silva_beatriz",      "Bruna Justimiano",    30000],
    ["caio_shimite",       "Bruna Justimiano",    30000],
    ["thayla_santana",     "Bruna Justimiano",    30000],
    ["raissa_paloma",      "Bruna Justimiano",    30000],
    ["stephanie_fagundes", "Bruna Justimiano",    30000],
    ["amabelly_santos",    "Bruna Justimiano",    30000],
    ["caroline_valverde",  "Bruna Justimiano",    30000],
    ["diego_rodrigues",    "Bruna Justimiano",    30000],
    ["leticia_romeu",      "Bruna Justimiano",    30000],
    ["tassiane_viana",     "Bruna Justimiano",    22000],
    ["thais_mayara",       "Bruna Justimiano",    22000],
    ["thauany_moura",      "Bruna Justimiano",    22000],
    ["kaue_nadai",         "Bruna Justimiano",    22000],
    ["mirella_arias",      "Bruna Justimiano",    18000],

    ["kauane_azevedo",     "Katia Regina",        18000],
    ["rayssa_r_oliveira",  "Katia Regina",        18000],
    ["giovana_souza",      "Katia Regina",        18000],
    ["gisleide_guedes",    "Katia Regina",        18000],
    ["luan_pinto",         "Katia Regina",        12000],
    ["debora_sobrinho",    "Katia Regina",        18000],
    ["cibele_zaneli",      "Katia Regina",        18000],

    ["manuela_marini",     "Isabela / Layane",    12000],
    ["allana_barbosa",     "Isabela / Layane",    12000],
    ["sophia_costa",       "Isabela / Layane",    12000],
    ["leticia_quinallia",  "Isabela / Layane",    12000],
    ["thais_p_rodrigues",  "Isabela / Layane",     5000],
    ["rhuan_silva",        "Isabela / Layane",     5000],
    ["poliana_varjao",     "Isabela / Layane",     5000],
    ["isabelle_moreira",   "Isabela / Layane",     5000],
    ["rafaela_lisboa",     "Isabela / Layane",     5000]
  ]$json$;

  v_pct      NUMERIC;
  v_regra    TEXT;
  v_n        INTEGER;
  v_item     JSONB;
  v_erros    TEXT[] := '{}';
  v_ok       JSONB  := '[]';   -- item da lista + id do perfil (posição 3)
  v_eq_ids   JSONB  := '{}';   -- nome da equipe -> id
  v_ids      UUID[] := '{}';
  v_id       UUID;
  v_equipe   UUID;
  v_bruto    NUMERIC;
  v_p        RECORD;
  v_antes    NUMERIC;
  v_esperado JSONB := '{}';    -- equipe -> nº de membros esperado
BEGIN
  -- ── 0. Setor, regra, percentual, mês aberto ────────────────────────────────
  SELECT s.regra INTO v_regra FROM public.setores s
   WHERE s.id = c_setor AND s.empresa_id = c_empresa AND s.ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conecta Play (%) não está ativo na PaguePlay. Nada gravado.', c_setor;
  END IF;
  IF v_regra IS DISTINCT FROM 'cofen' THEN
    RAISE EXCEPTION 'Conecta Play está com regra %, não cofen: a lista vem em H.O. Nada gravado.', v_regra;
  END IF;

  SELECT NULLIF(e.config->>'ho_percentual', '')::NUMERIC INTO v_pct
    FROM public.empresas e WHERE e.id = c_empresa;
  IF v_pct IS NULL OR v_pct <= 0 OR v_pct >= 1 THEN
    RAISE EXCEPTION 'ho_percentual da PaguePlay inválido (%). Nada gravado.', v_pct;
  END IF;
  IF v_pct <> 0.2260 THEN
    RAISE NOTICE 'Atenção: ho_percentual mudou desde a conferência (era 0,2260, agora %). Usando o atual.', v_pct;
  END IF;

  IF public.fn_metas_esta_validada(c_empresa, c_setor, c_mes, c_ano) THEN
    RAISE EXCEPTION 'A meta do Conecta Play está validada em novembro/2026: reabra antes de gravar. Nada gravado.';
  END IF;

  -- ── 1. As 4 equipes ainda são as conferidas (nome de hoje ou já o novo) ────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_eqs) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.equipes e
                    WHERE e.id = (v_item->>1)::UUID AND e.setor_id = c_setor
                      AND e.nome IN (v_item->>2, v_item->>0)) THEN
      v_erros := v_erros || format('equipe «%s» (%s) não está no Conecta Play com esse nome', v_item->>2, v_item->>1);
    END IF;
    v_eq_ids := v_eq_ids || jsonb_build_object(v_item->>0, v_item->>1);
  END LOOP;

  -- ── 2. Cada login: existe uma vez, ativo, operador/elite ───────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_ops) LOOP
    SELECT count(*) INTO v_n FROM public.perfis p
     WHERE lower(btrim(p.usuario)) = v_item->>0 AND p.arquivado IS NOT TRUE;
    IF v_n <> 1 THEN
      v_erros := v_erros || format('%s: achei %s perfis com esse login', v_item->>0, v_n);
      CONTINUE;
    END IF;
    SELECT p.id, p.nome, p.perfil::TEXT AS perfil, p.ativo, p.situacao::TEXT AS situacao
      INTO v_p FROM public.perfis p
     WHERE lower(btrim(p.usuario)) = v_item->>0 AND p.arquivado IS NOT TRUE;
    IF v_p.ativo IS FALSE OR v_p.situacao = 'desligado' THEN
      v_erros := v_erros || format('%s (%s): desligado/inativo', v_item->>0, v_p.nome);
    ELSIF v_p.perfil NOT IN ('operador', 'elite') THEN
      v_erros := v_erros || format('%s (%s): cargo %s, não operador', v_item->>0, v_p.nome, v_p.perfil);
    ELSE
      v_ok  := v_ok || jsonb_build_array(v_item || to_jsonb(v_p.id::TEXT));
      v_ids := v_ids || v_p.id;
    END IF;
  END LOOP;

  IF cardinality(v_erros) > 0 THEN
    RAISE EXCEPTION E'Nada gravado. Corrigir:\n  - %', array_to_string(v_erros, E'\n  - ');
  END IF;

  -- ── 3. Renomear as equipes ─────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_eqs) LOOP
    UPDATE public.equipes SET nome = v_item->>0
     WHERE id = (v_item->>1)::UUID AND nome IS DISTINCT FROM v_item->>0;
    IF FOUND THEN
      INSERT INTO cp_relatorio (tipo, usuario, nome, detalhe)
      VALUES ('equipe renomeada', NULL, v_item->>0, 'era «' || (v_item->>2) || '»');
    END IF;
  END LOOP;

  -- Layane Brito: co-líder da «Isabela / Layane», sai da equipe antiga (vazia).
  INSERT INTO public.equipe_lideres (empresa_id, equipe_id, lider_id)
  SELECT c_empresa, (v_eq_ids->>'Isabela / Layane')::UUID, c_layane
   WHERE NOT EXISTS (SELECT 1 FROM public.equipe_lideres
                      WHERE equipe_id = (v_eq_ids->>'Isabela / Layane')::UUID AND lider_id = c_layane);
  DELETE FROM public.equipe_lideres
   WHERE equipe_id = c_eq_layane_antiga AND lider_id = c_layane;

  -- ── 4. Operadores: transferir/equipe/meta ──────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_ok) LOOP
    v_id     := (v_item->>3)::UUID;
    v_equipe := (v_eq_ids->>(v_item->>1))::UUID;
    v_bruto  := round((v_item->>2)::NUMERIC / v_pct, 2);

    SELECT p.nome, p.empresa_id, p.setor_id, p.equipe_id,
           s.nome AS setor_nome, e.nome AS equipe_nome
      INTO v_p
      FROM public.perfis p
      LEFT JOIN public.setores s ON s.id = p.setor_id
      LEFT JOIN public.equipes e ON e.id = p.equipe_id
     WHERE p.id = v_id;

    IF v_p.empresa_id IS DISTINCT FROM c_empresa THEN
      -- Outra empresa: só pela tela. A meta já fica gravada na PaguePlay.
      INSERT INTO cp_relatorio (tipo, usuario, nome, detalhe)
      VALUES ('TRANSFERIR PELA TELA', v_item->>0, v_p.nome,
              format('está em %s (outra empresa) — transferir para o Conecta Play e pôr na equipe «%s»',
                     coalesce(v_p.setor_nome, 'sem setor'), v_item->>1));
    ELSIF v_p.setor_id IS DISTINCT FROM c_setor THEN
      INSERT INTO public.perfis_transferencias
        (empresa_id, perfil_id, perfil_nome, mes, tipo, origem_setor_id, origem_equipe_id,
         destino_empresa_id, destino_setor_id, levou_acordos, acordos_apagados)
      VALUES
        (c_empresa, v_id, v_p.nome, c_mes_txt, 'setor', v_p.setor_id, v_p.equipe_id,
         c_empresa, c_setor, false, 0);
      UPDATE public.perfis SET setor_id = c_setor, equipe_id = v_equipe WHERE id = v_id;
      INSERT INTO cp_relatorio (tipo, usuario, nome, detalhe)
      VALUES ('transferido', v_item->>0, v_p.nome,
              format('%s -> Conecta Play, equipe %s', coalesce(v_p.setor_nome, 'sem setor'), v_item->>1));
    ELSE
      UPDATE public.perfis SET equipe_id = v_equipe
       WHERE id = v_id AND equipe_id IS DISTINCT FROM v_equipe;
      IF FOUND THEN
        INSERT INTO cp_relatorio (tipo, usuario, nome, detalhe)
        VALUES ('mudou de equipe', v_item->>0, v_p.nome,
                format('%s -> %s', coalesce(v_p.equipe_nome, '(nenhuma)'), v_item->>1));
      END IF;
    END IF;

    SELECT m.meta_valor INTO v_antes FROM public.metas m
     WHERE m.tipo = 'operador' AND m.referencia_id = v_id AND m.empresa_id = c_empresa
       AND m.mes = c_mes AND m.ano = c_ano;
    IF v_antes IS DISTINCT FROM v_bruto THEN
      INSERT INTO cp_relatorio (tipo, usuario, nome, detalhe)
      VALUES ('meta', v_item->>0, v_p.nome,
              format('H.O. %s (bruto %s) — antes: %s', v_item->>2, v_bruto,
                     coalesce('bruto ' || v_antes || ' = H.O. ' || round(v_antes * v_pct, 2), 'sem meta')));
    END IF;
    v_antes := NULL;

    INSERT INTO public.metas (tipo, referencia_id, empresa_id, meta_valor, mes, ano)
    VALUES ('operador', v_id, c_empresa, v_bruto, c_mes, c_ano)
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
       SET meta_valor = EXCLUDED.meta_valor, updated_at = NOW();
  END LOOP;

  -- ── 5. No Conecta Play e fora da lista: sem equipe ─────────────────────────
  INSERT INTO cp_relatorio (tipo, usuario, nome, detalhe)
  SELECT 'fora da lista', p.usuario, p.nome,
         format('%s · %s · equipe antes: %s', p.perfil, coalesce(p.situacao::TEXT, 'ativo'), coalesce(e.nome, '(nenhuma)'))
    FROM public.perfis p
    LEFT JOIN public.equipes e ON e.id = p.equipe_id
   WHERE p.setor_id = c_setor
     AND p.arquivado IS NOT TRUE
     AND p.perfil::TEXT IN ('operador', 'elite')
     AND NOT (p.id = ANY (v_ids))
   ORDER BY p.nome;

  UPDATE public.perfis p SET equipe_id = NULL
   WHERE p.setor_id = c_setor
     AND p.arquivado IS NOT TRUE
     AND p.perfil::TEXT IN ('operador', 'elite')
     AND NOT (p.id = ANY (v_ids))
     AND p.equipe_id IS NOT NULL;

  -- ── Prova: confere e desfaz tudo se algo não bater ─────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_eqs) LOOP
    SELECT count(*) INTO v_n
      FROM jsonb_array_elements(v_ok) o
      JOIN public.perfis p ON p.id = (o->>3)::UUID
     WHERE o->>1 = v_item->>0 AND p.empresa_id = c_empresa;
    v_esperado := v_esperado || jsonb_build_object(v_item->>0, v_n);

    -- Só operador/elite: a líder Bruna tem `equipe_id` na própria equipe.
    SELECT count(*) INTO v_n FROM public.perfis p
     WHERE p.equipe_id = (v_item->>1)::UUID AND p.arquivado IS NOT TRUE
       AND p.perfil::TEXT IN ('operador', 'elite');
    IF v_n <> (v_esperado->>(v_item->>0))::INT THEN
      RAISE EXCEPTION 'Equipe «%»: esperava % membros, ficou com %. Nada gravado.',
        v_item->>0, v_esperado->>(v_item->>0), v_n;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM public.equipe_lideres
   WHERE equipe_id = (v_eq_ids->>'Isabela / Layane')::UUID
     AND lider_id IN (c_layane, '8259396e-8c88-44c2-b12f-474f3df51776');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Isabela e Layane deveriam liderar «Isabela / Layane», achei % líderes. Nada gravado.', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM jsonb_array_elements(v_ok) o
    JOIN public.metas m ON m.tipo = 'operador' AND m.referencia_id = (o->>3)::UUID
     AND m.empresa_id = c_empresa AND m.mes = c_mes AND m.ano = c_ano
     AND m.meta_valor = round((o->>2)::NUMERIC / v_pct, 2);
  IF v_n <> 42 THEN
    RAISE EXCEPTION 'Esperava 42 metas de novembro gravadas, conferi %. Nada gravado.', v_n;
  END IF;

  RAISE NOTICE 'Conecta Play novembro/2026: 4 equipes, 42 metas. Tudo conferido.';
END
$conecta$;

COMMIT;

-- ── A. O que o script fez (transferências, equipes, metas que mudaram) ──────
SELECT tipo, usuario, nome, detalhe FROM cp_relatorio
 WHERE tipo <> 'fora da lista' ORDER BY ordem;

-- ── B. Quem está no Conecta Play e ficou FORA das equipes (para decidir) ────
SELECT usuario, nome, detalhe FROM cp_relatorio
 WHERE tipo = 'fora da lista' ORDER BY nome;

-- ── C. As equipes como ficaram ───────────────────────────────────────────────
SELECT e.nome AS equipe,
       count(*) FILTER (WHERE m.papel = 'membro') AS membros,
       string_agg(p.nome, ', ' ORDER BY p.nome) FILTER (WHERE m.papel = 'lider') AS lideres
  FROM public.equipes e
  LEFT JOIN public.equipe_membros m ON m.equipe_id = e.id
  LEFT JOIN public.perfis p ON p.id = m.pessoa_id
 WHERE e.setor_id = '4c44cd71-378d-43aa-a1f6-7dd39339839f'
 GROUP BY e.nome ORDER BY e.nome;
