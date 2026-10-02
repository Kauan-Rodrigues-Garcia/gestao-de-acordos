-- ============================================================================
-- Receptivo (BookPlay) — metas de outubro/2026
-- ============================================================================
--
-- Pedido de 02/10/2026: metas dos operadores, das equipes e do setor, coladas
-- da planilha. Cada operador é achado pelo `perfis.usuario` SEM diferenciar
-- maiúscula de minúscula (NAYARA_CRUZ = nayara_cruz); cada equipe, pelo nome.
-- Corrigidos pelo usuário após a 1ª tentativa: Erica = erika_eduarda,
-- Nicoly = nicole_pacheco, Leticia = leticia_andrade. Pedro (meta 30.000 /
-- 40.000 / 50.000 / 60.000) fica de fora até o usuário dele ser informado.
--
-- Operador: 1ª meta em `meta_valor`, 2ª/3ª/4ª em `metas_extras`. A linha de
-- outubro é criada ou SUBSTITUÍDA (meta + degraus); meta em quantidade, meta
-- indireta e régua ficam como estão.
-- Equipe e setor: só `meta_valor` (degraus que já existam não são tocados).
--
-- Meta proporcional marcada para quem entra no meio do mês — os valores já vêm
-- proporcionais da planilha, a marca só avisa quem lê:
--   tiago_almada      05/out a 26/out
--   LARISSA_PEREIRAA  05/out a 21/out
--
-- Antes de gravar, recusa TUDO (e lista o motivo de cada um) se:
--   - a meta do Receptivo estiver validada em outubro/2026;
--   - algum usuário não existir no Receptivo, ou existir mais de uma vez;
--   - alguma equipe não for achada no Receptivo, ou for ambígua.
--
-- Reexecutável: rodar de novo regrava os mesmos valores.
-- ============================================================================

BEGIN;

DO $metas$
DECLARE
  c_empresa CONSTANT UUID    := '9bed94cd-605d-4d43-9afb-352c72b05c50';
  c_setor   CONSTANT UUID    := '6dd54018-e78f-4f3b-bca3-4221fe97f38b';
  c_ano     CONSTANT INTEGER := 2026;
  c_mes     CONSTANT INTEGER := 10;
  c_meta_setor CONSTANT NUMERIC := 2650000;

  -- [usuario, meta1, meta2, meta3, meta4, proporcional]
  v_ops CONSTANT JSONB := $json$[
    ["eduarda_lorenzo",  120000,   130000,   140000,   150000,   false],
    ["jose_victor",      120000,   130000,   140000,   150000,   false],
    ["marianne_freitas", 120000,   130000,   140000,   150000,   false],
    ["NAYARA_CRUZ",      120000,   130000,   140000,   150000,   false],
    ["amanda_paulo",     120000,   130000,   140000,   150000,   false],
    ["THIAGO_ALVES",     120000,   130000,   140000,   150000,   false],
    ["gabriel_oliveira", 120000,   130000,   140000,   150000,   false],
    ["matheus_souza",     90000,   100000,   110000,   120000,   false],
    ["tiago_almada",      30000,    40000,    50000,    60000,   true ],
    ["agatha_rocha",     120000,   130000,   140000,   150000,   false],
    ["erika_eduarda",     50000,    60000,    70000,    80000,   false],
    ["juliana_itala",     70000,    80000,    90000,   100000,   false],
    ["MARIA_VALERIA",     70000,    80000,    90000,   100000,   false],
    ["eduardo_melo",      70000,    80000,    90000,   100000,   false],
    ["eriele_monteiro",   70000,    80000,    90000,   100000,   false],
    ["heloisa_camilo",    70000,    80000,    90000,   100000,   false],
    ["viviane_antonio",   70000,    80000,    90000,   100000,   false],
    ["LAYRA_CARINI",      70000,    80000,    90000,   100000,   false],
    ["nayara_macedo",     70000,    80000,    90000,   100000,   false],
    ["leticia_andrade",   70000,    80000,    90000,   100000,   false],
    ["nicole_pacheco",    30000,    40000,    50000,    60000,   false],
    ["GABRIELY_ALVES",    70000,    80000,    90000,   100000,   false],
    ["LARISSA_PEREIRAA",  23333.33, 33333.33, 43333.33, 58333.33, true ],
    ["HELOISA_LIMA",      70000,    80000,    90000,   100000,   false],
    ["NANCI_MOREIRA",     70000,    80000,    90000,   100000,   false],
    ["DEBORA_PORTELA",    70000,    80000,    90000,   100000,   false],
    ["ANA_SENA",          50000,    60000,    70000,    80000,   false],
    ["cibele_santos",     30000,    40000,    50000,    60000,   false],
    ["hayla_teixeira",    30000,    40000,    50000,    60000,   false],
    ["lucas_nascimento",  30000,    40000,    50000,    60000,   false]
  ]$json$;

  -- [nome da equipe, meta]
  v_eqs CONSTANT JSONB := $json$[
    ["Karol",   1240000],
    ["Luciana",  720000],
    ["MATHEUS",  540000]
  ]$json$;

  v_item     JSONB;
  v_nome     TEXT;
  v_ids      UUID[];
  v_erros    TEXT[] := '{}';
  v_ops_ok   JSONB  := '[]';
  v_eqs_ok   JSONB  := '[]';
  v_extras   JSONB;
  v_antes    public.metas%ROWTYPE;
  v_id       UUID;
  v_conferem INTEGER;
BEGIN
  IF public.fn_metas_esta_validada(c_empresa, c_setor, c_mes, c_ano) THEN
    RAISE EXCEPTION 'A meta do Receptivo está validada em outubro/2026: reabra antes de gravar.';
  END IF;

  -- 1. Resolver operadores pelo usuário, sem diferenciar maiúscula.
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
      v_erros := v_erros || format('usuário %s não está no Receptivo', v_nome);
    ELSE
      v_ops_ok := v_ops_ok || jsonb_build_array(v_item || to_jsonb(v_ids[1]::TEXT));
    END IF;
  END LOOP;

  -- 2. Resolver equipes pelo nome: exato primeiro, depois «contém».
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_eqs) LOOP
    v_nome := v_item->>0;
    SELECT array_agg(e.id) INTO v_ids
      FROM public.equipes e
     WHERE e.setor_id = c_setor AND lower(btrim(e.nome)) = lower(v_nome);
    IF v_ids IS NULL THEN
      SELECT array_agg(e.id) INTO v_ids
        FROM public.equipes e
       WHERE e.setor_id = c_setor AND e.nome ILIKE '%' || v_nome || '%';
    END IF;

    IF v_ids IS NULL THEN
      v_erros := v_erros || format('equipe %s não existe no Receptivo', v_nome);
    ELSIF cardinality(v_ids) > 1 THEN
      v_erros := v_erros || format('equipe %s é ambígua (%s equipes)', v_nome, cardinality(v_ids));
    ELSE
      v_eqs_ok := v_eqs_ok || jsonb_build_array(v_item || to_jsonb(v_ids[1]::TEXT));
    END IF;
  END LOOP;

  IF cardinality(v_erros) > 0 THEN
    RAISE EXCEPTION 'Nada gravado. Corrigir: %', array_to_string(v_erros, '; ');
  END IF;

  -- 3. Operadores: cria ou substitui meta + degraus.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_ops_ok) LOOP
    v_id     := (v_item->>6)::UUID;
    v_extras := jsonb_build_array(v_item->2, v_item->3, v_item->4);

    SELECT m.* INTO v_antes FROM public.metas m
     WHERE m.tipo = 'operador' AND m.referencia_id = v_id AND m.empresa_id = c_empresa
       AND m.mes = c_mes AND m.ano = c_ano;
    IF FOUND THEN
      RAISE NOTICE '% : era % %, fica % %', v_item->>0,
        v_antes.meta_valor, v_antes.metas_extras, v_item->>1, v_extras;
    ELSE
      RAISE NOTICE '% : nova, % %', v_item->>0, v_item->>1, v_extras;
    END IF;

    INSERT INTO public.metas
      (tipo, referencia_id, empresa_id, meta_valor, metas_extras, meta_proporcional, mes, ano)
    VALUES
      ('operador', v_id, c_empresa, (v_item->>1)::NUMERIC, v_extras,
       (v_item->>5)::BOOLEAN, c_mes, c_ano)
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
       SET meta_valor        = EXCLUDED.meta_valor,
           metas_extras      = EXCLUDED.metas_extras,
           meta_proporcional = EXCLUDED.meta_proporcional,
           updated_at        = NOW();
  END LOOP;

  -- 4. Equipes e setor: só a meta.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_eqs_ok) LOOP
    INSERT INTO public.metas (tipo, referencia_id, empresa_id, meta_valor, mes, ano)
    VALUES ('equipe', (v_item->>2)::UUID, c_empresa, (v_item->>1)::NUMERIC, c_mes, c_ano)
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
       SET meta_valor = EXCLUDED.meta_valor, updated_at = NOW();
    RAISE NOTICE 'Equipe % : %', v_item->>0, v_item->>1;
  END LOOP;

  INSERT INTO public.metas (tipo, referencia_id, empresa_id, meta_valor, mes, ano)
  VALUES ('setor', c_setor, c_empresa, c_meta_setor, c_mes, c_ano)
  ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
     SET meta_valor = EXCLUDED.meta_valor, updated_at = NOW();

  -- 5. Prova: 30 operadores + 3 equipes + 1 setor com os valores da planilha.
  SELECT count(*) INTO v_conferem
    FROM jsonb_array_elements(v_ops_ok) AS o
    JOIN public.metas m
      ON m.tipo = 'operador' AND m.referencia_id = (o->>6)::UUID
     AND m.empresa_id = c_empresa AND m.mes = c_mes AND m.ano = c_ano
   WHERE m.meta_valor = (o->>1)::NUMERIC
     AND m.metas_extras = jsonb_build_array(o->2, o->3, o->4);
  IF v_conferem <> jsonb_array_length(v_ops) THEN
    RAISE EXCEPTION 'Operadores: esperados %, conferem %.', jsonb_array_length(v_ops), v_conferem;
  END IF;

  SELECT count(*) INTO v_conferem
    FROM public.metas m
   WHERE m.empresa_id = c_empresa AND m.mes = c_mes AND m.ano = c_ano
     AND ((m.tipo = 'setor' AND m.referencia_id = c_setor AND m.meta_valor = c_meta_setor)
       OR (m.tipo = 'equipe' AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(v_eqs_ok) e
              WHERE (e->>2)::UUID = m.referencia_id AND (e->>1)::NUMERIC = m.meta_valor)));
  IF v_conferem <> jsonb_array_length(v_eqs) + 1 THEN
    RAISE EXCEPTION 'Equipes + setor: esperados %, conferem %.', jsonb_array_length(v_eqs) + 1, v_conferem;
  END IF;

  RAISE NOTICE 'Outubro/2026 gravado: % operadores, % equipes e o setor.',
    jsonb_array_length(v_ops), jsonb_array_length(v_eqs);
END
$metas$;

COMMIT;

-- Conferência na tela do SQL Editor: quem ficou com qual meta em outubro.
SELECT p.usuario, p.nome, e.nome AS equipe, m.meta_valor, m.metas_extras, m.meta_proporcional
  FROM public.metas m
  JOIN public.perfis p ON p.id = m.referencia_id
  LEFT JOIN public.equipes e ON e.id = p.equipe_id
 WHERE m.tipo = 'operador'
   AND m.empresa_id = '9bed94cd-605d-4d43-9afb-352c72b05c50'
   AND p.setor_id   = '6dd54018-e78f-4f3b-bca3-4221fe97f38b'
   AND m.ano = 2026 AND m.mes = 10
 ORDER BY e.nome, p.usuario;
