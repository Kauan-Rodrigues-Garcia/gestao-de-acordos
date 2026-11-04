-- ============================================================================
-- Play 5 (Marília): equipes, metas de operador, de equipe e do setor
-- novembro/2026 — «11 - Progresso Mensal (Metas).xlsx», aba Preencher
-- Pedido do Cleber, 03/11/2026.
-- ✅ APLICADO em 03/11/2026 pelo MCP, com autorização do Cleber, depois de
--    uma simulação desfeita. Conferido no banco: 30 operadores com equipe e
--    meta, 4 equipes renomeadas com as metas da planilha, setor 425.000, 9
--    fora da planilha sem equipe. Não precisa rodar de novo.
-- ============================================================================
--
-- O que a planilha manda, e o que este script faz com cada coisa:
--
-- 1. EQUIPES = coluna SUPERVISOR. As quatro equipes JÁ EXISTEM no Play 5
--    (conferido no banco em 03/11/2026) e são RENOMEADAS com o nome do
--    supervisor — renomear, e não criar outra, mantém os líderes vinculados,
--    o histórico e as metas da equipe:
--      «Digital - Brunno» -> BRUNNO PICCOLO
--      «Cintia Mengue»    -> CINTIA MENGUE
--      «Rafaela»          -> RAFAELA BRUMATI
--      «Tauana»           -> TAUANA LARISSA
--    A equipe «Treinamento» fica como está (vazia, depois deste script: os 5
--    dela que estão na planilha vão para as equipes dos supervisores).
--
-- 2. OPERADORES = os 30 logins da planilha, achados pelo `perfis.usuario`
--    (sem diferenciar maiúscula). Cada um vai para a equipe do seu supervisor.
--    `supervisao_digitalplay5` (USUÁRIO LIDERANÇA, sem meta) continua na
--    equipe do Brunno, sem meta.
--
-- 3. QUEM ESTÁ EM OUTRO SETOR é transferido para o Play 5, como a troca de
--    setor da tela de Usuários, menos a parte dos acordos:
--      - o perfil muda de setor e já entra na equipe da planilha;
--      - fica registrado em `perfis_transferencias` (mês 2026-11, tipo setor),
--        com o fantasma ligado: o pouco que a pessoa já recebeu em novembro no
--        setor antigo continua na equipe de origem, e a tela de Usuários
--        consegue DESFAZER a transferência;
--      - os acordos NÃO são apagados nem mudam de setor (levou_acordos =
--        false, acordos_apagados = 0). Nada se perde.
--    Quem estiver em OUTRA EMPRESA não é movido aqui (a troca de empresa só
--    roda com usuário logado): o script para e diz quem é — transferir pela
--    tela de Usuários e rodar de novo.
--
-- 4. METAS de novembro/2026 (linha criada ou SUBSTITUÍDA):
--      operador: 4 metas. DESAFIO = 1ª meta (`meta_valor`); DESAFIO 1 = 2ª,
--                DESAFIO 2 = 3ª e DESAFIO 4 = 4ª (`metas_extras`, nessa ordem);
--                PROPORCIONAL SIM = `meta_proporcional = true`;
--      equipe:   a tabela de baixo da planilha, em `meta_valor` — os degraus
--                da equipe, se houver, ficam como estão. No banco em 03/11:
--                Brunno 140.000 -> 142.000, Cintia 50.000 -> 40.000,
--                Rafaela e Tauana 100.000 (iguais);
--      setor:    425.000, em `meta_valor`, idem (já estava assim).
--    Valores em reais, como na planilha: o Play 5 é regra Nosso produto. Se o
--    setor estiver como regra Cofen, o script para (lá a planilha vem em H.O.).
--
-- 5. QUEM ESTÁ NO PLAY 5 E NÃO ESTÁ NA PLANILHA (operador ou elite, ativo, não
--    desligado) sai da equipe e fica sem equipe, no setor. A consulta do fim
--    lista essas pessoas — é a lista para o Cleber decidir. Em 03/11 eram 9:
--    Adriele Dutra e Beatriz Guerra (Cintia), Eduarda Siviero (Brunno), Jean
--    Nogueira e Suellen Ramiro (Treinamento) — saem da equipe —; Gabrielly
--    Barraca, Julia Fernanda e Silmara Silva (férias) e Glória Ferreira
--    (afastada) — já estavam sem equipe. Líderes e gerência não são tocados.
--
-- DIAS TRABALHADOS (19): não é gravado aqui. A meta proporcional usa os dias
-- úteis do mês do setor (Usuários → Metas). Novembro/2026 tem 21 dias de
-- segunda a sexta; 19 = sem 02/11 (Finados) e 20/11 (Consciência Negra).
-- Falta lançar o feriado que ainda não está lá.
--
-- Antes de gravar, recusa TUDO (e lista o motivo de cada um) se:
--   - não houver exatamente 1 setor ativo «Play 5» em Marília;
--   - o Play 5 estiver como regra Cofen, ou a meta de novembro já validada;
--   - alguma das 4 equipes não estiver no Play 5 com o nome antigo ou o novo;
--   - algum login não existir, existir mais de uma vez, estiver em outra
--     empresa, desligado/inativo, ou não for operador/elite.
--
-- Reexecutável: rodar de novo regrava os mesmos valores, não duplica equipe
-- nem transferência (quem já está no Play 5 não é transferido de novo).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION pg_temp.norm(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT regexp_replace(
    lower(translate(coalesce(t, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')),
    '[^a-z0-9]', '', 'g')
$fn$;

-- O que o bloco grava para as consultas do fim (somem ao fechar a conexão).
DROP TABLE IF EXISTS pg_temp.play5_transferidos;
DROP TABLE IF EXISTS pg_temp.play5_fora_da_planilha;
CREATE TEMP TABLE play5_transferidos (
  usuario TEXT, nome TEXT, setor_anterior TEXT, equipe_anterior TEXT, equipe_nova TEXT
);
CREATE TEMP TABLE play5_fora_da_planilha (
  usuario TEXT, nome TEXT, cargo TEXT, situacao TEXT, equipe_anterior TEXT
);

DO $play5$
DECLARE
  c_ano     CONSTANT INTEGER := 2026;
  c_mes     CONSTANT INTEGER := 11;
  c_mes_txt CONSTANT TEXT    := '2026-11';

  c_setor_esperado CONSTANT UUID := '8e20366d-6771-4dc9-9d4a-3ec579ad066e';

  -- [nome novo (= supervisor), meta da equipe, id, nome de hoje]
  v_eqs CONSTANT JSONB := $json$[
    ["BRUNNO PICCOLO",  142000, "16c83992-7f77-479c-949f-29a5429a5927", "Digital - Brunno"],
    ["CINTIA MENGUE",    40000, "d88cba56-e6ca-4d85-ae9e-d0c29f7c8644", "Cintia Mengue"],
    ["RAFAELA BRUMATI", 100000, "abd3b087-e6e6-4741-a8d5-aeee283e1992", "Rafaela"],
    ["TAUANA LARISSA",  100000, "9f06fd09-2cd9-4286-bb46-6e8b473841fb", "Tauana"]
  ]$json$;
  c_meta_setor CONSTANT NUMERIC := 425000;

  -- Na planilha sem meta: só a equipe.
  v_sem_meta CONSTANT JSONB := $json$[
    ["supervisao_digitalplay5", "BRUNNO PICCOLO"]
  ]$json$;

  -- [usuario, equipe, DESAFIO, [DESAFIO 1, DESAFIO 2, DESAFIO 4], proporcional]
  v_ops CONSTANT JSONB := $json$[
    ["camila_isidoromoraes",  "BRUNNO PICCOLO",  27000, [29000, 32000, 35000], false],
    ["izadora_alexandre",     "BRUNNO PICCOLO",  27000, [29000, 32000, 35000], false],
    ["juliana_s_oliveira",    "BRUNNO PICCOLO",  27000, [29000, 32000, 35000], false],
    ["miria_teles",           "BRUNNO PICCOLO",  27000, [29000, 32000, 35000], false],
    ["sirlei_stephanie",      "BRUNNO PICCOLO",  27000, [29000, 32000, 35000], false],
    ["agatha_silva",          "CINTIA MENGUE",    8000, [11000, 14000, 17000], true ],
    ["ana_franco",            "CINTIA MENGUE",    5000, [ 7000,  9000, 12000], true ],
    ["fernanda_andrade",      "CINTIA MENGUE",    5000, [ 7000,  9000, 11000], true ],
    ["giovana_almeida",       "CINTIA MENGUE",    5000, [ 7000,  9000, 11000], true ],
    ["jhenifer_aparecida",    "CINTIA MENGUE",    5000, [ 7000,  9000, 11000], true ],
    ["michelle_oliveira",     "CINTIA MENGUE",    8000, [11000, 14000, 17000], true ],
    ["raissa_mesquita",       "CINTIA MENGUE",    8000, [11000, 14000, 17000], true ],
    ["rayssa_souza",          "CINTIA MENGUE",    5000, [ 7000,  9000, 11000], true ],
    ["yasmim_inacio",         "CINTIA MENGUE",    8000, [11000, 14000, 17000], true ],
    ["aline_costa",           "RAFAELA BRUMATI", 15000, [18000, 21000, 24000], true ],
    ["amanda_alcasa",         "RAFAELA BRUMATI", 15000, [18000, 21000, 24000], true ],
    ["isabella_nascimento",   "RAFAELA BRUMATI", 12000, [15000, 18000, 21000], true ],
    ["jacqueline_nascimento", "RAFAELA BRUMATI", 12000, [15000, 18000, 21000], true ],
    ["milena_lima",           "RAFAELA BRUMATI", 20000, [23000, 26000, 30000], false],
    ["moliveira",             "RAFAELA BRUMATI", 12000, [15000, 18000, 21000], true ],
    ["pamela_faria",          "RAFAELA BRUMATI", 12000, [15000, 18000, 21000], true ],
    ["vinicius_manculi",      "RAFAELA BRUMATI", 15000, [18000, 21000, 24000], true ],
    ["adriely_lima",          "TAUANA LARISSA",  20000, [23000, 26000, 30000], false],
    ["bianca_oliveira",       "TAUANA LARISSA",  15000, [18000, 21000, 24000], true ],
    ["ivanir_clarentinosou",  "TAUANA LARISSA",  20000, [23000, 26000, 30000], false],
    ["kenay_cazarini",        "TAUANA LARISSA",  12000, [15000, 18000, 21000], true ],
    ["luana_nascimento",      "TAUANA LARISSA",  15000, [18000, 21000, 24000], true ],
    ["mateus_sola",           "TAUANA LARISSA",   5000, [ 7000,  9000, 11000], true ],
    ["patricia_cruz",         "TAUANA LARISSA",  20000, [23000, 26000, 30000], false],
    ["rebeca_bueno",          "TAUANA LARISSA",  15000, [18000, 21000, 24000], true ]
  ]$json$;

  v_setor    UUID;
  v_empresa  UUID;
  v_regra    TEXT;
  v_n        INTEGER;
  v_achei    TEXT;
  v_item     JSONB;
  v_erros    TEXT[] := '{}';
  v_ops_ok   JSONB  := '[]';   -- cada item da planilha + o id do perfil (posição 5)
  v_eq_ids   JSONB  := '{}';   -- nome da equipe -> id
  v_ids_ok   UUID[] := '{}';
  v_equipe   UUID;
  v_id       UUID;
  v_p        RECORD;
  v_antes    public.metas%ROWTYPE;
  v_conferem INTEGER;
BEGIN
  -- ── 0. O Play 5 de Marília ──────────────────────────────────────────────────
  SELECT count(*), min(s.id::TEXT) INTO v_n, v_achei
    FROM public.setores s
    JOIN public.rh_celulas c ON c.id = s.cidade_id
   WHERE s.ativo
     AND pg_temp.norm(c.nome) = 'marilia'
     AND pg_temp.norm(s.nome) = 'play5';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Setor «Play 5» de Marília: esperava 1 ativo, achei %. Nada gravado.', v_n;
  END IF;
  v_setor := v_achei::UUID;
  IF v_setor <> c_setor_esperado THEN
    RAISE EXCEPTION 'O Play 5 de Marília é %, não o % conferido em 03/11. Nada gravado.', v_setor, c_setor_esperado;
  END IF;
  SELECT s.empresa_id, s.regra INTO v_empresa, v_regra FROM public.setores s WHERE s.id = v_setor;
  RAISE NOTICE 'Play 5 = setor %, empresa %, regra %', v_setor, v_empresa, coalesce(v_regra, '(sem regra)');

  IF v_regra = 'cofen' THEN
    RAISE EXCEPTION 'O Play 5 está como regra Cofen: a planilha viria em H.O. e os valores teriam de ser convertidos. Nada gravado.';
  END IF;
  IF public.fn_metas_esta_validada(v_empresa, v_setor, c_mes, c_ano) THEN
    RAISE EXCEPTION 'A meta do Play 5 está validada em novembro/2026: reabra antes de gravar. Nada gravado.';
  END IF;

  -- ── 1. Equipes: as 4 ainda são as conferidas (nome de hoje ou já o novo) ────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_eqs) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.equipes e
       WHERE e.id = (v_item->>2)::UUID AND e.setor_id = v_setor
         AND e.nome IN (v_item->>3, v_item->>0)) THEN
      v_erros := v_erros || format('equipe «%s» (%s) não está no Play 5 com esse nome', v_item->>3, v_item->>2);
    END IF;
  END LOOP;

  -- O usuário da liderança (sem meta) tem de estar no Play 5.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sem_meta) LOOP
    SELECT p.id INTO v_id FROM public.perfis p
     WHERE lower(btrim(p.usuario)) = lower(btrim(v_item->>0)) AND p.setor_id = v_setor AND p.ativo;
    IF v_id IS NULL THEN
      v_erros := v_erros || format('%s não está ativo no Play 5', v_item->>0);
    ELSE
      v_ids_ok := v_ids_ok || v_id;
    END IF;
    v_id := NULL;
  END LOOP;

  -- ── 2. Operadores: achar cada login, em qualquer empresa ────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_ops) LOOP
    SELECT count(*) INTO v_n FROM public.perfis p
     WHERE lower(btrim(p.usuario)) = lower(btrim(v_item->>0));

    IF v_n = 0 THEN
      v_erros := v_erros || format('%s: login não existe', v_item->>0);
      CONTINUE;
    ELSIF v_n > 1 THEN
      SELECT string_agg(format('%s (empresa %s, setor %s)', p.nome, p.empresa_id, coalesce(s.nome, 'sem setor')), ', ')
        INTO v_achei
        FROM public.perfis p LEFT JOIN public.setores s ON s.id = p.setor_id
       WHERE lower(btrim(p.usuario)) = lower(btrim(v_item->>0));
      v_erros := v_erros || format('%s: login aparece %s vezes — %s', v_item->>0, v_n, v_achei);
      CONTINUE;
    END IF;

    SELECT p.id, p.nome, p.empresa_id, p.setor_id, p.perfil, p.ativo, p.situacao,
           coalesce(p.arquivado, false) AS arquivado, s.nome AS setor_nome
      INTO v_p
      FROM public.perfis p LEFT JOIN public.setores s ON s.id = p.setor_id
     WHERE lower(btrim(p.usuario)) = lower(btrim(v_item->>0));

    IF v_p.empresa_id <> v_empresa THEN
      v_erros := v_erros || format('%s (%s): está em OUTRA EMPRESA, setor %s — transferir pela tela de Usuários e rodar de novo',
                                   v_item->>0, v_p.nome, coalesce(v_p.setor_nome, 'sem setor'));
    ELSIF NOT v_p.ativo OR v_p.arquivado OR v_p.situacao = 'desligado' THEN
      v_erros := v_erros || format('%s (%s): está desligado/inativo', v_item->>0, v_p.nome);
    ELSIF v_p.perfil NOT IN ('operador', 'elite') THEN
      v_erros := v_erros || format('%s (%s): cargo %s, não operador', v_item->>0, v_p.nome, v_p.perfil);
    ELSE
      v_ops_ok := v_ops_ok || jsonb_build_array(v_item || to_jsonb(v_p.id::TEXT));
      v_ids_ok := v_ids_ok || v_p.id;
    END IF;
  END LOOP;

  IF cardinality(v_erros) > 0 THEN
    RAISE EXCEPTION E'Nada gravado. Corrigir:\n  - %', array_to_string(v_erros, E'\n  - ');
  END IF;

  -- ── 3. Renomear as 4 equipes com o nome do supervisor ───────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_eqs) LOOP
    v_equipe := (v_item->>2)::UUID;
    UPDATE public.equipes SET nome = v_item->>0
     WHERE id = v_equipe AND nome IS DISTINCT FROM v_item->>0;
    IF FOUND THEN
      RAISE NOTICE 'Equipe «%» -> %', v_item->>3, v_item->>0;
    END IF;
    v_eq_ids := v_eq_ids || jsonb_build_object(v_item->>0, v_equipe::TEXT);
  END LOOP;

  -- O usuário da liderança fica na equipe da planilha.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sem_meta) LOOP
    UPDATE public.perfis p SET equipe_id = (v_eq_ids->>(v_item->>1))::UUID
     WHERE lower(btrim(p.usuario)) = lower(btrim(v_item->>0)) AND p.setor_id = v_setor
       AND p.equipe_id IS DISTINCT FROM (v_eq_ids->>(v_item->>1))::UUID;
  END LOOP;

  -- ── 4. Operadores: transferir quem está fora, pôr na equipe, gravar meta ────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_ops_ok) LOOP
    v_id     := (v_item->>5)::UUID;
    v_equipe := (v_eq_ids->>(v_item->>1))::UUID;

    SELECT p.nome, p.setor_id, p.equipe_id, s.nome AS setor_nome, e.nome AS equipe_nome
      INTO v_p
      FROM public.perfis p
      LEFT JOIN public.setores s ON s.id = p.setor_id
      LEFT JOIN public.equipes e ON e.id = p.equipe_id
     WHERE p.id = v_id;

    IF v_p.setor_id IS DISTINCT FROM v_setor THEN
      -- O registro da tela: origem, destino e fantasma ligado (o padrão da coluna).
      INSERT INTO public.perfis_transferencias
        (empresa_id, perfil_id, perfil_nome, mes, tipo, origem_setor_id, origem_equipe_id,
         destino_empresa_id, destino_setor_id, levou_acordos, acordos_apagados)
      VALUES
        (v_empresa, v_id, v_p.nome, c_mes_txt, 'setor', v_p.setor_id, v_p.equipe_id,
         v_empresa, v_setor, false, 0);

      UPDATE public.perfis SET setor_id = v_setor, equipe_id = v_equipe WHERE id = v_id;

      INSERT INTO play5_transferidos
      VALUES (v_item->>0, v_p.nome, coalesce(v_p.setor_nome, 'sem setor'), v_p.equipe_nome, v_item->>1);
      RAISE NOTICE '% : transferido de % para o Play 5, equipe %',
        v_item->>0, coalesce(v_p.setor_nome, 'sem setor'), v_item->>1;
    ELSE
      UPDATE public.perfis SET equipe_id = v_equipe
       WHERE id = v_id AND equipe_id IS DISTINCT FROM v_equipe;
      IF FOUND THEN
        RAISE NOTICE '% : equipe % -> %', v_item->>0, coalesce(v_p.equipe_nome, '(nenhuma)'), v_item->>1;
      END IF;
    END IF;

    SELECT m.* INTO v_antes FROM public.metas m
     WHERE m.tipo = 'operador' AND m.referencia_id = v_id AND m.empresa_id = v_empresa
       AND m.mes = c_mes AND m.ano = c_ano;
    IF FOUND THEN
      RAISE NOTICE '% : meta era % %, fica % %', v_item->>0,
        v_antes.meta_valor, v_antes.metas_extras, v_item->>2, v_item->3;
    END IF;

    INSERT INTO public.metas
      (tipo, referencia_id, empresa_id, meta_valor, metas_extras, meta_proporcional, mes, ano)
    VALUES
      ('operador', v_id, v_empresa, (v_item->>2)::NUMERIC, v_item->3, (v_item->>4)::BOOLEAN, c_mes, c_ano)
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
       SET meta_valor        = EXCLUDED.meta_valor,
           metas_extras      = EXCLUDED.metas_extras,
           meta_proporcional = EXCLUDED.meta_proporcional,
           updated_at        = NOW();
  END LOOP;

  -- ── 5. Metas das equipes e do setor (só o valor; degraus ficam) ─────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_eqs) LOOP
    INSERT INTO public.metas (tipo, referencia_id, empresa_id, meta_valor, mes, ano)
    VALUES ('equipe', (v_eq_ids->>(v_item->>0))::UUID, v_empresa, (v_item->>1)::NUMERIC, c_mes, c_ano)
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
       SET meta_valor = EXCLUDED.meta_valor, updated_at = NOW();
  END LOOP;

  INSERT INTO public.metas (tipo, referencia_id, empresa_id, meta_valor, mes, ano)
  VALUES ('setor', v_setor, v_empresa, c_meta_setor, c_mes, c_ano)
  ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
     SET meta_valor = EXCLUDED.meta_valor, updated_at = NOW();

  -- ── 6. No Play 5 e fora da planilha: sem equipe ─────────────────────────────
  INSERT INTO play5_fora_da_planilha
  SELECT p.usuario, p.nome, p.perfil, p.situacao, e.nome
    FROM public.perfis p
    LEFT JOIN public.equipes e ON e.id = p.equipe_id
   WHERE p.setor_id = v_setor
     AND p.ativo AND NOT coalesce(p.arquivado, false)
     AND p.situacao IS DISTINCT FROM 'desligado'
     AND p.perfil IN ('operador', 'elite')
     AND p.id <> ALL (v_ids_ok);

  UPDATE public.perfis p SET equipe_id = NULL
   WHERE p.setor_id = v_setor
     AND p.ativo AND NOT coalesce(p.arquivado, false)
     AND p.situacao IS DISTINCT FROM 'desligado'
     AND p.perfil IN ('operador', 'elite')
     AND p.id <> ALL (v_ids_ok)
     AND p.equipe_id IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Fora da planilha: % pessoa(s) no Play 5, % tirada(s) de equipe agora.',
    (SELECT count(*) FROM play5_fora_da_planilha), v_n;

  -- ── 7. Prova: tudo bate, senão nada fica gravado ────────────────────────────
  SELECT count(*) INTO v_conferem
    FROM jsonb_array_elements(v_ops_ok) AS o
    JOIN public.perfis  p ON p.id = (o->>5)::UUID AND p.setor_id = v_setor
    JOIN public.equipes e ON e.id = p.equipe_id AND e.setor_id = v_setor
                         AND pg_temp.norm(e.nome) = pg_temp.norm(o->>1)
    JOIN public.metas   m ON m.tipo = 'operador' AND m.referencia_id = p.id
                         AND m.empresa_id = v_empresa AND m.mes = c_mes AND m.ano = c_ano
   WHERE m.meta_valor = (o->>2)::NUMERIC
     AND m.metas_extras = o->3
     AND m.meta_proporcional = (o->>4)::BOOLEAN;
  IF v_conferem <> jsonb_array_length(v_ops) THEN
    RAISE EXCEPTION 'Operadores: esperados %, conferem %. Nada gravado.', jsonb_array_length(v_ops), v_conferem;
  END IF;

  SELECT count(*) INTO v_conferem
    FROM jsonb_array_elements(v_eqs) AS q
    JOIN public.metas m ON m.tipo = 'equipe' AND m.referencia_id = (v_eq_ids->>(q->>0))::UUID
                       AND m.empresa_id = v_empresa AND m.mes = c_mes AND m.ano = c_ano
                       AND m.meta_valor = (q->>1)::NUMERIC;
  IF v_conferem <> jsonb_array_length(v_eqs) THEN
    RAISE EXCEPTION 'Metas de equipe: esperadas %, conferem %. Nada gravado.', jsonb_array_length(v_eqs), v_conferem;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.metas m
                  WHERE m.tipo = 'setor' AND m.referencia_id = v_setor AND m.empresa_id = v_empresa
                    AND m.mes = c_mes AND m.ano = c_ano AND m.meta_valor = c_meta_setor) THEN
    RAISE EXCEPTION 'Meta do setor não ficou em %. Nada gravado.', c_meta_setor;
  END IF;

  RAISE NOTICE 'Novembro/2026 gravado: % operadores em % equipes, % transferido(s), meta do setor %.',
    jsonb_array_length(v_ops), jsonb_array_length(v_eqs),
    (SELECT count(*) FROM play5_transferidos), c_meta_setor;
END
$play5$;

COMMIT;

-- ── Resultado ────────────────────────────────────────────────────────────────

-- A. PARA DECIDIR: estão no Play 5, não estão na planilha, ficaram sem equipe.
SELECT 'fora da planilha' AS lista, usuario, nome, cargo, situacao, equipe_anterior
  FROM pg_temp.play5_fora_da_planilha
 ORDER BY nome;

-- B. Vieram de outro setor.
SELECT 'transferido' AS lista, usuario, nome, setor_anterior, equipe_anterior, equipe_nova
  FROM pg_temp.play5_transferidos
 ORDER BY equipe_nova, nome;

-- C. Conferência: cada pessoa do Play 5, equipe e meta de novembro.
SELECT e.nome AS equipe, p.usuario, p.nome, p.perfil AS cargo,
       m.meta_valor, m.metas_extras, m.meta_proporcional
  FROM public.perfis p
  JOIN public.setores s ON s.id = p.setor_id
  JOIN public.rh_celulas c ON c.id = s.cidade_id
  LEFT JOIN public.equipes e ON e.id = p.equipe_id
  LEFT JOIN public.metas m
    ON m.tipo = 'operador' AND m.referencia_id = p.id
   AND m.empresa_id = p.empresa_id AND m.ano = 2026 AND m.mes = 11
 WHERE pg_temp.norm(s.nome) = 'play5' AND pg_temp.norm(c.nome) = 'marilia' AND s.ativo
   AND p.ativo AND p.situacao IS DISTINCT FROM 'desligado'
 ORDER BY e.nome NULLS LAST, p.nome;

-- D. Equipes do Play 5 (inclusive as antigas), membros e meta de novembro; e o setor.
SELECT 'equipe' AS tipo, e.nome,
       (SELECT count(*) FROM public.perfis p WHERE p.equipe_id = e.id AND p.ativo) AS membros,
       m.meta_valor
  FROM public.equipes e
  JOIN public.setores s ON s.id = e.setor_id
  JOIN public.rh_celulas c ON c.id = s.cidade_id
  LEFT JOIN public.metas m ON m.tipo = 'equipe' AND m.referencia_id = e.id AND m.ano = 2026 AND m.mes = 11
 WHERE pg_temp.norm(s.nome) = 'play5' AND pg_temp.norm(c.nome) = 'marilia' AND s.ativo
UNION ALL
SELECT 'setor', s.nome, NULL, m.meta_valor
  FROM public.setores s
  JOIN public.rh_celulas c ON c.id = s.cidade_id
  LEFT JOIN public.metas m ON m.tipo = 'setor' AND m.referencia_id = s.id AND m.ano = 2026 AND m.mes = 11
 WHERE pg_temp.norm(s.nome) = 'play5' AND pg_temp.norm(c.nome) = 'marilia' AND s.ativo
 ORDER BY 1, 2;
