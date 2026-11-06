-- ============================================================================
-- Play 2 (BookPlay, Birigui, regra Nosso produto): equipes e metas de
-- NOVEMBRO/2026 pelo «11 - Progresso Mensal (Metas) (1).xlsx», aba Preencher
-- (Cleber, 05/11/2026)
-- ============================================================================
--
-- Rodar inteiro no SQL Editor. Uma transação só: se qualquer conferência
-- falhar, NADA é gravado e a mensagem diz o motivo.
--
-- Conferido no banco em 05/11/2026 (4 SELECTs autorizados): Play 2 =
-- 74b413e9…, BOOKPLAY 9bed94cd…, nosso_produto; nenhuma meta de novembro
-- lançada; os 32 logins da planilha JÁ estão no Play 2 (ninguém a
-- transferir); equipes «Luciano» (Luciano Costa), «Mateus / Kim» (Mateus
-- Castro + Kimberli Marin) e «Treinamento» (Samara, vazia).
--
-- 1. EQUIPES = o supervisor da planilha. A planilha separa KIM e Mateus:
--      «Luciano»      -> Luciano Costa   (renomeada, líder Luciano)
--      «Mateus / Kim» -> Mateus Castro   (renomeada; a Kimberli deixa de
--                                          liderar esta)
--      nova           -> Kimberli Marin  (criada, líder Kimberli)
--    «Treinamento» não é tocada.
--
-- 2. OPERADORES = 32 da planilha, cada um na equipe do supervisor.
--    ⚠ LETICIA_S_GONCALVES aparece duas vezes na planilha (Luciano 25.265 e
--    Mateus 8.000 — esta é a mesma linha da LOHAYNY_MAIA). Vale a do
--    LUCIANO, que é a equipe dela hoje. Se for a outra, troque a linha dela
--    em v_ops antes de rodar.
--    Lohayny Maia sai do Luciano e vai para a Kimberli, como na planilha.
--
-- 3. METAS de novembro/2026, em REAIS (Nosso produto): DESAFIO = 1ª meta
--    (`meta_valor`); DESAFIO 1, 2 e 4 = `metas_extras`, nessa ordem;
--    PROPORCIONAL SIM = `meta_proporcional = true`. A planilha não traz meta
--    de equipe nem de setor (a aba «Equipes - 1» está com #REF!): não são
--    tocadas. Dias trabalhados (19/16/15) não vão para o banco.
--
-- 4. QUEM ESTÁ NO PLAY 2 E NÃO ESTÁ NA PLANILHA (operador/elite) sai da
--    equipe. Em 05/11: Gabriel Fonseca (Mateus / Kim) e Laiza Santos
--    (Luciano) saem; Gabriely Ferreira já estava sem equipe. Líderes,
--    gerência (Ederlandia) e Suporte Play2 não são tocados.
--
-- Reexecutável: rodar de novo regrava os mesmos valores, sem duplicar equipe.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

DROP TABLE IF EXISTS pg_temp.p2_relatorio;
CREATE TEMP TABLE p2_relatorio (ordem SERIAL, tipo TEXT, usuario TEXT, nome TEXT, detalhe TEXT);

DO $play2$
DECLARE
  c_ano     CONSTANT INTEGER := 2026;
  c_mes     CONSTANT INTEGER := 11;
  c_setor   CONSTANT UUID := '74b413e9-c2ce-4f11-bb53-ad2be9efcf4a';
  c_empresa CONSTANT UUID := '9bed94cd-605d-4d43-9afb-352c72b05c50';
  c_eq_luciano CONSTANT UUID := '0e97c4bd-c0da-4bba-824b-b480cd72d3df';
  c_eq_mateus  CONSTANT UUID := 'b1840795-7bcf-4ae8-8300-8485e52868ae';
  c_kimberli   CONSTANT UUID := '760bfcc2-262e-4db1-8dfa-9d61aae0122f';
  c_luciano    CONSTANT UUID := 'c93265b5-178b-4406-ac30-3fcd4647a3dc';
  c_mateus     CONSTANT UUID := '495bc276-7247-421c-9227-f2939c4e1810';

  -- [login, equipe, DESAFIO, [DESAFIO 1, DESAFIO 2, DESAFIO 4], proporcional]
  v_ops CONSTANT JSONB := $json$[
    ["amanda_d_silva",       "Kimberli Marin", 30000, [35000, 40000, 48000], false],
    ["emilly_oliveira",      "Kimberli Marin", 20000, [25000, 30000, 35000], true ],
    ["danieli_trevizan",     "Kimberli Marin", 30000, [35000, 40000, 48000], false],
    ["maria_c_silva",        "Kimberli Marin", 30000, [35000, 40000, 48000], false],
    ["thaina_couto",         "Kimberli Marin", 30000, [35000, 40000, 48000], false],
    ["lohayny_maia",         "Kimberli Marin",  8000, [13000, 18000, 23000], true ],
    ["mirian_barbosa",       "Kimberli Marin", 30000, [35000, 40000, 48000], false],
    ["jhenifer_almeida",     "Kimberli Marin", 30000, [35000, 40000, 48000], false],
    ["stella_nascimento",    "Kimberli Marin", 20000, [25000, 30000, 35000], true ],
    ["isabella_rocha",       "Kimberli Marin", 30000, [35000, 40000, 48000], false],
    ["ingrid_nascimento",    "Kimberli Marin", 27000, [32000, 37000, 42000], true ],

    ["poliana_shueter",      "Luciano Costa",  42000, [47000, 52000, 60000], false],
    ["leonardo_nunes",       "Luciano Costa",  42000, [47000, 52000, 60000], false],
    ["isabele_barros",       "Luciano Costa",  42000, [47000, 52000, 60000], false],
    ["rayane_estevan",       "Luciano Costa",  42000, [47000, 52000, 60000], false],
    ["mariha_rodrigues",     "Luciano Costa",  42000, [47000, 52000, 60000], false],
    ["otavio_cestini",       "Luciano Costa",  36000, [41000, 46000, 54000], true ],
    ["igor_s_rocha",         "Luciano Costa",  20000, [25000, 30000, 38000], true ],
    ["thayra_ferreirasilva", "Luciano Costa",  42000, [47000, 52000, 60000], false],
    ["loami_ferraz",         "Luciano Costa",  42000, [47000, 52000, 60000], false],
    ["ayslan_silva",         "Luciano Costa",  42000, [47000, 52000, 60000], false],
    ["leticia_s_goncalves",  "Luciano Costa",  25265, [30265, 35265, 42265], true ],
    ["aline_rodrigues",      "Luciano Costa",  42000, [47000, 52000, 60000], false],
    ["fernanda_mata",        "Luciano Costa",  42000, [47000, 52000, 60000], false],

    ["camilly_carvalho",     "Mateus Castro",  20000, [25000, 30000, 35000], true ],
    ["rosane_piona",         "Mateus Castro",  30000, [35000, 40000, 48000], false],
    ["larissa_vieira",       "Mateus Castro",  30000, [35000, 40000, 48000], false],
    ["maria_segura",         "Mateus Castro",  30000, [35000, 40000, 48000], false],
    ["leticia_peres",        "Mateus Castro",  25265, [30265, 35265, 43265], true ],
    ["daniela_reis",         "Mateus Castro",  30000, [35000, 40000, 48000], false],
    ["alexia_silva",         "Mateus Castro",  27000, [32000, 37000, 42000], true ],
    ["thamires_souza",       "Mateus Castro",  30000, [35000, 40000, 48000], false]
  ]$json$;

  v_regra   TEXT;
  v_n       INTEGER;
  v_item    JSONB;
  v_erros   TEXT[] := '{}';
  v_ok      JSONB  := '[]';   -- item da planilha + id do perfil (posição 5)
  v_ids     UUID[] := '{}';
  v_eq_kim  UUID;
  v_eq_ids  JSONB;
  v_equipe  UUID;
  v_id      UUID;
  v_p       RECORD;
  v_antes   public.metas%ROWTYPE;
BEGIN
  -- ── 0. Setor, regra, mês aberto ───────────────────────────────────────────
  SELECT s.regra INTO v_regra FROM public.setores s
   WHERE s.id = c_setor AND s.empresa_id = c_empresa AND s.ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Play 2 (%) não está ativo na BookPlay. Nada gravado.', c_setor;
  END IF;
  IF v_regra = 'cofen' THEN
    RAISE EXCEPTION 'O Play 2 está como regra Cofen: a planilha viria em H.O. Nada gravado.';
  END IF;
  IF public.fn_metas_esta_validada(c_empresa, c_setor, c_mes, c_ano) THEN
    RAISE EXCEPTION 'A meta do Play 2 está validada em novembro/2026: reabra antes de gravar. Nada gravado.';
  END IF;

  -- ── 1. As 2 equipes conferidas (nome de hoje ou já o novo) ────────────────
  IF NOT EXISTS (SELECT 1 FROM public.equipes WHERE id = c_eq_luciano AND setor_id = c_setor
                    AND nome IN ('Luciano', 'Luciano Costa')) THEN
    v_erros := v_erros || 'equipe «Luciano» não está no Play 2 com esse nome'::TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.equipes WHERE id = c_eq_mateus AND setor_id = c_setor
                    AND nome IN ('Mateus / Kim', 'Mateus Castro')) THEN
    v_erros := v_erros || 'equipe «Mateus / Kim» não está no Play 2 com esse nome'::TEXT;
  END IF;
  SELECT count(*) INTO v_n FROM public.perfis
   WHERE id IN (c_kimberli, c_luciano, c_mateus) AND setor_id = c_setor AND perfil::TEXT = 'lider';
  IF v_n <> 3 THEN
    v_erros := v_erros || format('esperava Kimberli, Luciano e Mateus como líderes no Play 2, achei %s', v_n);
  END IF;

  -- ── 2. Cada login: uma vez, ativo, operador/elite, no Play 2 ──────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_ops) LOOP
    SELECT count(*) INTO v_n FROM public.perfis p
     WHERE lower(btrim(p.usuario)) = v_item->>0 AND p.arquivado IS NOT TRUE;
    IF v_n <> 1 THEN
      v_erros := v_erros || format('%s: achei %s perfis com esse login', v_item->>0, v_n);
      CONTINUE;
    END IF;
    SELECT p.id, p.nome, p.perfil::TEXT AS perfil, p.ativo, p.situacao::TEXT AS situacao,
           p.empresa_id, p.setor_id
      INTO v_p FROM public.perfis p
     WHERE lower(btrim(p.usuario)) = v_item->>0 AND p.arquivado IS NOT TRUE;
    IF v_p.empresa_id <> c_empresa OR v_p.setor_id IS DISTINCT FROM c_setor THEN
      v_erros := v_erros || format('%s (%s): não está no Play 2 (mudou desde 05/11?)', v_item->>0, v_p.nome);
    ELSIF v_p.ativo IS FALSE OR v_p.situacao = 'desligado' THEN
      v_erros := v_erros || format('%s (%s): desligado/inativo', v_item->>0, v_p.nome);
    ELSIF v_p.perfil NOT IN ('operador', 'elite') THEN
      v_erros := v_erros || format('%s (%s): cargo %s, não operador', v_item->>0, v_p.nome, v_p.perfil);
    ELSIF v_p.id = ANY (v_ids) THEN
      v_erros := v_erros || format('%s aparece duas vezes na lista', v_item->>0);
    ELSE
      v_ok  := v_ok || jsonb_build_array(v_item || to_jsonb(v_p.id::TEXT));
      v_ids := v_ids || v_p.id;
    END IF;
  END LOOP;

  IF cardinality(v_erros) > 0 THEN
    RAISE EXCEPTION E'Nada gravado. Corrigir:\n  - %', array_to_string(v_erros, E'\n  - ');
  END IF;

  -- ── 3. Equipes ─────────────────────────────────────────────────────────────
  UPDATE public.equipes SET nome = 'Luciano Costa' WHERE id = c_eq_luciano AND nome <> 'Luciano Costa';
  IF FOUND THEN INSERT INTO p2_relatorio (tipo, nome, detalhe) VALUES ('equipe renomeada', 'Luciano Costa', 'era «Luciano»'); END IF;
  UPDATE public.equipes SET nome = 'Mateus Castro' WHERE id = c_eq_mateus AND nome <> 'Mateus Castro';
  IF FOUND THEN INSERT INTO p2_relatorio (tipo, nome, detalhe) VALUES ('equipe renomeada', 'Mateus Castro', 'era «Mateus / Kim»'); END IF;

  -- A equipe da Kimberli: a que já existir com esse nome no Play 2, ou nova.
  SELECT id INTO v_eq_kim FROM public.equipes WHERE setor_id = c_setor AND nome = 'Kimberli Marin';
  IF v_eq_kim IS NULL THEN
    INSERT INTO public.equipes (nome, setor_id, empresa_id)
    VALUES ('Kimberli Marin', c_setor, c_empresa) RETURNING id INTO v_eq_kim;
    INSERT INTO p2_relatorio (tipo, nome, detalhe) VALUES ('equipe criada', 'Kimberli Marin', v_eq_kim::TEXT);
  END IF;

  -- Kimberli lidera a dela e deixa de liderar a do Mateus.
  INSERT INTO public.equipe_lideres (empresa_id, equipe_id, lider_id)
  SELECT c_empresa, v_eq_kim, c_kimberli
   WHERE NOT EXISTS (SELECT 1 FROM public.equipe_lideres WHERE equipe_id = v_eq_kim AND lider_id = c_kimberli);
  DELETE FROM public.equipe_lideres WHERE equipe_id = c_eq_mateus AND lider_id = c_kimberli;

  v_eq_ids := jsonb_build_object('Kimberli Marin', v_eq_kim::TEXT,
                                 'Luciano Costa',  c_eq_luciano::TEXT,
                                 'Mateus Castro',  c_eq_mateus::TEXT);

  -- ── 4. Operadores: equipe e meta ───────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_ok) LOOP
    v_id     := (v_item->>5)::UUID;
    v_equipe := (v_eq_ids->>(v_item->>1))::UUID;

    SELECT p.nome, e.nome AS equipe_nome INTO v_p
      FROM public.perfis p LEFT JOIN public.equipes e ON e.id = p.equipe_id WHERE p.id = v_id;
    UPDATE public.perfis SET equipe_id = v_equipe WHERE id = v_id AND equipe_id IS DISTINCT FROM v_equipe;
    IF FOUND THEN
      INSERT INTO p2_relatorio (tipo, usuario, nome, detalhe)
      VALUES ('mudou de equipe', v_item->>0, v_p.nome, format('%s -> %s', coalesce(v_p.equipe_nome, '(nenhuma)'), v_item->>1));
    END IF;

    SELECT m.* INTO v_antes FROM public.metas m
     WHERE m.tipo = 'operador' AND m.referencia_id = v_id AND m.empresa_id = c_empresa
       AND m.mes = c_mes AND m.ano = c_ano;
    IF FOUND THEN
      INSERT INTO p2_relatorio (tipo, usuario, nome, detalhe)
      VALUES ('meta substituída', v_item->>0, v_p.nome,
              format('era %s %s, fica %s %s', v_antes.meta_valor, v_antes.metas_extras, v_item->>2, v_item->3));
    END IF;

    INSERT INTO public.metas
      (tipo, referencia_id, empresa_id, meta_valor, metas_extras, meta_proporcional, mes, ano)
    VALUES
      ('operador', v_id, c_empresa, (v_item->>2)::NUMERIC, v_item->3, (v_item->>4)::BOOLEAN, c_mes, c_ano)
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
       SET meta_valor        = EXCLUDED.meta_valor,
           metas_extras      = EXCLUDED.metas_extras,
           meta_proporcional = EXCLUDED.meta_proporcional,
           updated_at        = NOW();
  END LOOP;

  -- ── 5. No Play 2 e fora da planilha: sem equipe ───────────────────────────
  INSERT INTO p2_relatorio (tipo, usuario, nome, detalhe)
  SELECT 'fora da planilha', p.usuario, p.nome,
         format('%s · %s · equipe antes: %s', p.perfil, coalesce(p.situacao::TEXT, 'ativo'), coalesce(e.nome, '(nenhuma)'))
    FROM public.perfis p LEFT JOIN public.equipes e ON e.id = p.equipe_id
   WHERE p.setor_id = c_setor AND p.arquivado IS NOT TRUE
     AND p.perfil::TEXT IN ('operador', 'elite') AND NOT (p.id = ANY (v_ids))
   ORDER BY p.nome;

  UPDATE public.perfis p SET equipe_id = NULL
   WHERE p.setor_id = c_setor AND p.arquivado IS NOT TRUE
     AND p.perfil::TEXT IN ('operador', 'elite') AND NOT (p.id = ANY (v_ids))
     AND p.equipe_id IS NOT NULL;

  -- ── Prova ──────────────────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements('[["Kimberli Marin", 11], ["Luciano Costa", 13], ["Mateus Castro", 8]]'::jsonb) LOOP
    SELECT count(*) INTO v_n FROM public.perfis
     WHERE equipe_id = (v_eq_ids->>(v_item->>0))::UUID AND arquivado IS NOT TRUE
       AND perfil::TEXT IN ('operador', 'elite');
    IF v_n <> (v_item->>1)::INT THEN
      RAISE EXCEPTION 'Equipe «%»: esperava % operadores, ficou com %. Nada gravado.', v_item->>0, v_item->>1, v_n;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM public.equipe_lideres
   WHERE (equipe_id = v_eq_kim AND lider_id = c_kimberli)
      OR (equipe_id = c_eq_luciano AND lider_id = c_luciano)
      OR (equipe_id = c_eq_mateus AND lider_id = c_mateus);
  IF v_n <> 3 THEN RAISE EXCEPTION 'Esperava os 3 líderes nas 3 equipes, achei %. Nada gravado.', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.equipe_lideres WHERE equipe_id = c_eq_mateus AND lider_id = c_kimberli) THEN
    RAISE EXCEPTION 'A Kimberli continua liderando a equipe do Mateus. Nada gravado.';
  END IF;

  SELECT count(*) INTO v_n
    FROM jsonb_array_elements(v_ok) o
    JOIN public.metas m ON m.tipo = 'operador' AND m.referencia_id = (o->>5)::UUID
     AND m.empresa_id = c_empresa AND m.mes = c_mes AND m.ano = c_ano
     AND m.meta_valor = (o->>2)::NUMERIC AND m.metas_extras = o->3
     AND m.meta_proporcional = (o->>4)::BOOLEAN;
  IF v_n <> 32 THEN RAISE EXCEPTION 'Esperava 32 metas de novembro gravadas, conferi %. Nada gravado.', v_n; END IF;

  RAISE NOTICE 'Play 2 novembro/2026: 3 equipes, 32 metas. Tudo conferido.';
END
$play2$;

COMMIT;

-- ── A. O que o script fez ───────────────────────────────────────────────────
SELECT tipo, usuario, nome, detalhe FROM p2_relatorio WHERE tipo <> 'fora da planilha' ORDER BY ordem;

-- ── B. Quem está no Play 2 e ficou FORA das equipes (para decidir) ──────────
SELECT usuario, nome, detalhe FROM p2_relatorio WHERE tipo = 'fora da planilha' ORDER BY nome;

-- ── C. As equipes como ficaram ───────────────────────────────────────────────
SELECT e.nome AS equipe,
       count(*) FILTER (WHERE m.papel = 'membro') AS membros,
       string_agg(p.nome, ', ' ORDER BY p.nome) FILTER (WHERE m.papel = 'lider') AS lideres
  FROM public.equipes e
  LEFT JOIN public.equipe_membros m ON m.equipe_id = e.id
  LEFT JOIN public.perfis p ON p.id = m.pessoa_id
 WHERE e.setor_id = '74b413e9-c2ce-4f11-bb53-ad2be9efcf4a'
 GROUP BY e.nome ORDER BY e.nome;
