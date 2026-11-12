-- ============================================================================
-- 20261112235500_votacao_gerentes_nao_votam.sql
--
-- Votação dos Gerentes: gerente NÃO vota e NÃO recebe aviso de que está sendo
-- votado (pedido de 12/11/2026).
--
-- ## O que estava aberto
--
--   * quem vota é a lista de eleitores; nada impedia um gerente de estar nela
--     (incluído à mão, ou o próprio candidato) — e aí ele recebia o card
--     «Votar agora» da votação sobre ele;
--   * o card «Ver resultado» (`fn_votacao_lideranca_meus_resultados`) e a
--     leitura do resultado valiam para os PARTICIPANTES — na votação dos
--     gerentes, os próprios gerentes.
--
-- ## A regra
--
-- Na votação de tipo 'gerentes', é «gerente» quem concorre nela ou tem o
-- cargo `gerencia` (`fn_vl_eh_gerente`). Para ele:
--   * `fn_votacao_lideranca_minha` não devolve a votação (sem card);
--   * `fn_votacao_lideranca_votar` recusa;
--   * `fn_votacao_lideranca_meus_resultados` não avisa o resultado;
--   * `fn_votacao_lideranca_resultado` não abre (a diretoria continua vendo).
--
-- A Votação da Liderança não muda: lá quem concorre também vota e recebe o
-- resultado, como sempre. Nenhum voto muda.
--
-- O corpo das quatro funções é o de 20261112160000 com a trava nova.
--
-- Reverter: reaplicar as quatro de 20261112160000; DROP de fn_vl_eh_gerente.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'votacao_lideranca' AND column_name = 'tipo') THEN
    RAISE EXCEPTION 'Aplique antes a 20261112160000_votacao_gerentes_e_guardar.sql.';
  END IF;
END $$;

-- ── 1. Quem é gerente nesta votação ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vl_eh_gerente(p_participantes UUID[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT (SELECT auth.uid()) = ANY (COALESCE(p_participantes, ARRAY[]::UUID[]))
      OR EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = (SELECT auth.uid()) AND p.perfil = 'gerencia');
$$;

REVOKE ALL ON FUNCTION public.fn_vl_eh_gerente(UUID[]) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_vl_eh_gerente(UUID[]) IS
  'Quem esta logado concorre na votacao (participantes) ou tem o cargo gerencia. Na Votacao '
  'dos Gerentes, ele nao vota nem recebe aviso. Interna. 20261112235500.';

-- ── 2. As quatro portas ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_minha()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  -- Cada um recebe só quem está na cédula dele (o gerente do próprio setor).
  SELECT COALESCE(jsonb_agg(
           jsonb_set(r.m, '{participantes}', COALESCE((
             SELECT jsonb_agg(p) FROM jsonb_array_elements(r.m->'participantes') p
              WHERE (p->>'id')::uuid = ANY (public.fn_vl_cedula_de(r.id, (SELECT auth.uid())))), '[]'::jsonb))
           || jsonb_build_object('enviado_em', (
                SELECT e.enviado_em FROM public.votacao_lideranca_envios e
                WHERE e.votacao_id = r.id AND e.eleitor_id = (SELECT auth.uid())))
           ORDER BY r.aberta_em), '[]'::jsonb)
  FROM (
    SELECT v.id, v.aberta_em, public.fn_vl_montar(v.id, FALSE, FALSE) AS m
      FROM public.votacao_lideranca v
     WHERE v.estado = 'aberta' AND (SELECT auth.uid()) = ANY (COALESCE(v.eleitores, v.participantes))
       -- 20261112235500: na dos gerentes, gerente não vota nem recebe o card.
       AND NOT (v.tipo = 'gerentes' AND public.fn_vl_eh_gerente(v.participantes))
  ) r;
$$;

CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_votar(p_id UUID, p_votos JSONB, p_comecou_em TIMESTAMPTZ DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_eu UUID := auth.uid();
  v RECORD;
  v_n INTEGER := 0;
  v_disponiveis INTEGER;
  v_exigidas INTEGER;
  v_cedula UUID[];
  r RECORD;
BEGIN
  SELECT * INTO v FROM public.votacao_lideranca WHERE id = p_id FOR SHARE;
  IF v.id IS NULL OR v.estado <> 'aberta' THEN
    RAISE EXCEPTION 'Esta votação não está aberta.' USING ERRCODE = '22023';
  END IF;
  IF v_eu IS NULL OR NOT (v_eu = ANY (COALESCE(v.eleitores, v.participantes))) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: você não vota nesta votação' USING ERRCODE = '42501';
  END IF;
  -- 20261112235500: na Votação dos Gerentes, gerente não vota.
  IF v.tipo = 'gerentes' AND public.fn_vl_eh_gerente(v.participantes) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: gerente não vota na Votação dos Gerentes' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.votacao_lideranca_envios e WHERE e.votacao_id = p_id AND e.eleitor_id = v_eu) THEN
    RAISE EXCEPTION 'Você já enviou os seus votos.' USING ERRCODE = '22023';
  END IF;
  -- Em quem esta pessoa pode votar (os gerentes do setor dela, ou todos).
  v_cedula := public.fn_vl_cedula_de(p_id, v_eu);
  IF jsonb_typeof(p_votos) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Os votos vieram num formato errado.' USING ERRCODE = '22023';
  END IF;
  IF v.um_por_candidato
     AND (SELECT count(*) FROM jsonb_each_text(p_votos)) <> (SELECT count(DISTINCT value) FROM jsonb_each_text(p_votos)) THEN
    RAISE EXCEPTION 'Cada pessoa só pode ser escolhida em uma pergunta.' USING ERRCODE = '22023';
  END IF;

  FOR r IN SELECT key AS pergunta_id, value AS candidato FROM jsonb_each_text(p_votos) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.perguntas) q WHERE q->>'id' = r.pergunta_id) THEN
      RAISE EXCEPTION 'Pergunta desconhecida: %', r.pergunta_id USING ERRCODE = '22023';
    END IF;
    IF r.candidato !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Voto em quem não participa.' USING ERRCODE = '22023';
    END IF;
    IF NOT (r.candidato::uuid = ANY (v_cedula)) THEN
      RAISE EXCEPTION 'Voto em quem não está na sua cédula.' USING ERRCODE = '22023';
    END IF;
    IF r.candidato::uuid = v_eu THEN
      RAISE EXCEPTION 'Não dá para votar em si mesmo.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.votacao_lideranca_votos (votacao_id, pergunta_id, eleitor_id, candidato_id)
    VALUES (p_id, r.pergunta_id, v_eu, r.candidato::uuid);
    v_n := v_n + 1;
  END LOOP;

  -- Só com tudo preenchido. Em quem dá para votar: a cédula dela, menos a
  -- própria pessoa se ela também concorre. Com «um por candidato», no máximo
  -- um candidato por pergunta; sem, todas as perguntas.
  v_disponiveis := cardinality(v_cedula) - CASE WHEN v_eu = ANY (v_cedula) THEN 1 ELSE 0 END;
  v_exigidas := CASE
    WHEN v_disponiveis <= 0 THEN 0
    WHEN v.um_por_candidato THEN least(jsonb_array_length(v.perguntas), v_disponiveis)
    ELSE jsonb_array_length(v.perguntas)
  END;
  IF v_n < v_exigidas THEN
    RAISE EXCEPTION 'Preencha todas as categorias antes de enviar: faltam %.', v_exigidas - v_n USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.votacao_lideranca_envios (votacao_id, eleitor_id, comecou_em, respondidas)
  VALUES (p_id, v_eu,
          CASE WHEN p_comecou_em BETWEEN v.aberta_em AND NOW() THEN p_comecou_em END,
          v_n);
  PERFORM public.fn_vl_registrar(p_id, 'votou', jsonb_build_object('respondidas', v_n));
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_meus_resultados()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', v.id, 'titulo', v.titulo, 'liberada_em', v.liberada_em, 'tipo', v.tipo)
           ORDER BY v.liberada_em DESC), '[]'::jsonb)
  FROM public.votacao_lideranca v
  WHERE v.estado = 'liberada'
    AND v.liberada_em > NOW() - INTERVAL '60 days'
    -- 20261112235500: na dos gerentes, o gerente não recebe o card do resultado.
    AND (((SELECT auth.uid()) = ANY (v.participantes) AND v.tipo <> 'gerentes')
      OR ((SELECT auth.uid()) = ANY (COALESCE(v.eleitores, ARRAY[]::UUID[]))
          AND NOT (v.tipo = 'gerentes' AND public.fn_vl_eh_gerente(v.participantes))));
$$;

CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_resultado(p_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.votacao_lideranca v
    WHERE v.id = p_id AND v.estado = 'liberada'
      AND (((SELECT auth.uid()) = ANY (v.participantes) AND v.tipo <> 'gerentes')
        OR ((SELECT auth.uid()) = ANY (COALESCE(v.eleitores, ARRAY[]::UUID[]))
            AND NOT (v.tipo = 'gerentes' AND public.fn_vl_eh_gerente(v.participantes)))
        OR (SELECT public.fn_vl_eh_diretoria()))
  ) THEN
    RAISE EXCEPTION 'Resultado ainda não liberado.' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_vl_montar(p_id, TRUE, FALSE);
END;
$$;

-- ── 3. Prova ────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_vl_eh_gerente(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVA: fn_vl_eh_gerente ficou aberta para o app.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_votacao_lideranca_minha()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_votacao_lideranca_votar(uuid,jsonb,timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_votacao_lideranca_meus_resultados()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_votacao_lideranca_resultado(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROVA: o app perdeu o acesso a votacao.';
  END IF;
  IF position('fn_vl_eh_gerente' in pg_get_functiondef('public.fn_votacao_lideranca_minha()'::regprocedure)) = 0
     OR position('fn_vl_eh_gerente' in pg_get_functiondef('public.fn_votacao_lideranca_votar(uuid,jsonb,timestamptz)'::regprocedure)) = 0
     OR position('fn_vl_eh_gerente' in pg_get_functiondef('public.fn_votacao_lideranca_meus_resultados()'::regprocedure)) = 0
     OR position('fn_vl_eh_gerente' in pg_get_functiondef('public.fn_votacao_lideranca_resultado(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'PROVA: uma das portas ficou sem a trava do gerente.';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261112235500', 'votacao_gerentes_nao_votam', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
