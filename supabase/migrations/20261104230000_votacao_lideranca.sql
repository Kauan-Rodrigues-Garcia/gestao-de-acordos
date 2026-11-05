-- ============================================================================
-- Votação da Liderança: tudo registrado
-- 04/11/2026 · pedido do Kauan
-- ============================================================================
--
-- Os líderes votam uns nos outros em perguntas de personalidade. Em cada
-- pergunta aparecem TODOS os participantes; ninguém vota em si mesmo, e cada
-- colega só pode ser escolhido UMA vez por eleitor (em uma pergunta só).
--
--   votacao_lideranca              cada votação: título, operação (cobrança OU
--                                  Vendas), setores, cargos, perguntas e a
--                                  lista congelada de participantes; quem criou,
--                                  abriu, encerrou, liberou ou cancelou, e quando.
--                                  «Repetir» copia uma votação (copiada_de).
--   votacao_lideranca_votos        um voto por pergunta por eleitor, com o horário.
--   votacao_lideranca_envios       quando cada um começou e enviou, e quantas
--                                  respondeu (os horários da votação).
--   votacao_lideranca_desempates   empate no 1º lugar: a DIRETORIA escolhe um dos
--                                  empatados antes de liberar; quem e quando.
--   votacao_lideranca_eventos      o diário: criada, editada, aberta, votou,
--                                  encerrada, desempate, liberada, cancelada,
--                                  repetida. Nenhum evento guarda em quem votou.
--
-- Estados: rascunho → aberta → encerrada → liberada (ou cancelada).
--
-- Quem vê o quê (decisão do Kauan, 04/11/2026):
--   - em quem cada um votou: SÓ o super_admin (`fn_votacao_lideranca_registro`);
--   - diretoria: a apuração (contagem por pergunta), os desempates e os horários
--     de quem votou — nunca o voto de cada um;
--   - o líder: a votação aberta para ele e, depois de liberado, o resultado.
--
-- As tabelas não têm policy: leitura e escrita só pelas funções abaixo, que
-- conferem o cargo no banco. Nenhuma tabela existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── Tabelas ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.votacao_lideranca (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo         TEXT NOT NULL,
  produto        TEXT NOT NULL,
  setor_ids      UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  cargos         TEXT[] NOT NULL DEFAULT ARRAY['lider']::TEXT[],
  perguntas      JSONB NOT NULL,
  participantes  UUID[] NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'rascunho',
  copiada_de     UUID REFERENCES public.votacao_lideranca(id) ON DELETE SET NULL,
  criada_por     UUID,
  criada_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizada_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aberta_por     UUID,
  aberta_em      TIMESTAMPTZ,
  encerrada_por  UUID,
  encerrada_em   TIMESTAMPTZ,
  liberada_por   UUID,
  liberada_em    TIMESTAMPTZ,
  cancelada_por  UUID,
  cancelada_em   TIMESTAMPTZ,
  CONSTRAINT vl_estado    CHECK (estado IN ('rascunho','aberta','encerrada','liberada','cancelada')),
  CONSTRAINT vl_produto   CHECK (produto IN ('cobranca','comercial','rh')),
  CONSTRAINT vl_titulo    CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 120),
  CONSTRAINT vl_perguntas CHECK (jsonb_typeof(perguntas) = 'array')
);

COMMENT ON TABLE public.votacao_lideranca IS
  'Votação da Liderança: configuração congelada e o ciclo (rascunho, aberta, encerrada, liberada, cancelada). '
  'Escrita só pelas fn_votacao_lideranca_*. Ver 20261104230000.';

-- Uma votação aberta por operação de cada vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_votacao_lideranca_aberta
  ON public.votacao_lideranca (produto) WHERE estado = 'aberta';
CREATE INDEX IF NOT EXISTS idx_votacao_lideranca_criada ON public.votacao_lideranca (criada_em DESC);

CREATE TABLE IF NOT EXISTS public.votacao_lideranca_votos (
  votacao_id    UUID NOT NULL REFERENCES public.votacao_lideranca(id) ON DELETE CASCADE,
  pergunta_id   TEXT NOT NULL,
  eleitor_id    UUID NOT NULL,
  candidato_id  UUID NOT NULL,
  votado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (votacao_id, pergunta_id, eleitor_id),
  CONSTRAINT vl_voto_em_si CHECK (eleitor_id <> candidato_id),
  -- Cada colega uma vez só por eleitor: deu a Bianca em «comunicativo», não dá ela em «organizado».
  CONSTRAINT vl_um_por_colega UNIQUE (votacao_id, eleitor_id, candidato_id)
);

COMMENT ON TABLE public.votacao_lideranca_votos IS
  'Um voto por pergunta por eleitor. Em quem cada um votou: só o super_admin lê (fn_votacao_lideranca_registro).';

CREATE INDEX IF NOT EXISTS idx_vl_votos_contagem
  ON public.votacao_lideranca_votos (votacao_id, pergunta_id, candidato_id);

CREATE TABLE IF NOT EXISTS public.votacao_lideranca_envios (
  votacao_id   UUID NOT NULL REFERENCES public.votacao_lideranca(id) ON DELETE CASCADE,
  eleitor_id   UUID NOT NULL,
  comecou_em   TIMESTAMPTZ,
  enviado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  respondidas  INTEGER NOT NULL,
  PRIMARY KEY (votacao_id, eleitor_id)
);

COMMENT ON TABLE public.votacao_lideranca_envios IS
  'Quando cada eleitor começou e enviou, e quantas perguntas respondeu. Um envio por pessoa (o voto não muda depois).';

CREATE TABLE IF NOT EXISTS public.votacao_lideranca_desempates (
  votacao_id    UUID NOT NULL REFERENCES public.votacao_lideranca(id) ON DELETE CASCADE,
  pergunta_id   TEXT NOT NULL,
  empatados     UUID[] NOT NULL,
  escolhido_id  UUID NOT NULL,
  decidido_por  UUID,
  decidido_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (votacao_id, pergunta_id)
);

COMMENT ON TABLE public.votacao_lideranca_desempates IS
  'Empate no 1º lugar decidido pela diretoria antes de liberar o resultado.';

CREATE TABLE IF NOT EXISTS public.votacao_lideranca_eventos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  votacao_id  UUID NOT NULL REFERENCES public.votacao_lideranca(id) ON DELETE CASCADE,
  evento      TEXT NOT NULL,
  por         UUID,
  por_nome    TEXT,
  em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detalhe     JSONB
);

COMMENT ON TABLE public.votacao_lideranca_eventos IS
  'Diário da Votação da Liderança. Nunca guarda em quem alguém votou.';

CREATE INDEX IF NOT EXISTS idx_vl_eventos_votacao ON public.votacao_lideranca_eventos (votacao_id, em);

ALTER TABLE public.votacao_lideranca            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votacao_lideranca_votos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votacao_lideranca_envios     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votacao_lideranca_desempates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votacao_lideranca_eventos    ENABLE ROW LEVEL SECURITY;
-- Sem policy: só pelas funções.
REVOKE ALL ON public.votacao_lideranca            FROM anon, authenticated;
REVOKE ALL ON public.votacao_lideranca_votos      FROM anon, authenticated;
REVOKE ALL ON public.votacao_lideranca_envios     FROM anon, authenticated;
REVOKE ALL ON public.votacao_lideranca_desempates FROM anon, authenticated;
REVOKE ALL ON public.votacao_lideranca_eventos    FROM anon, authenticated;
GRANT ALL ON public.votacao_lideranca            TO service_role;
GRANT ALL ON public.votacao_lideranca_votos      TO service_role;
GRANT ALL ON public.votacao_lideranca_envios     TO service_role;
GRANT ALL ON public.votacao_lideranca_desempates TO service_role;
GRANT ALL ON public.votacao_lideranca_eventos    TO service_role;

-- ── Ajudantes (internos: ninguém chama direto) ──────────────────────────────

-- Diretoria ou super_admin, ativo.
CREATE OR REPLACE FUNCTION public.fn_vl_eh_diretoria()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.id = (SELECT auth.uid()) AND p.ativo AND p.perfil::text IN ('diretoria', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_vl_registrar(p_votacao UUID, p_evento TEXT, p_detalhe JSONB DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  INSERT INTO public.votacao_lideranca_eventos (votacao_id, evento, por, por_nome, detalhe)
  SELECT p_votacao, p_evento, (SELECT auth.uid()),
         (SELECT btrim(p.nome) FROM public.perfis p WHERE p.id = (SELECT auth.uid())), p_detalhe;
$$;

-- Perguntas empatadas no 1º lugar (com pelo menos 1 voto).
CREATE OR REPLACE FUNCTION public.fn_vl_empates(p_id UUID)
RETURNS TABLE (pergunta_id TEXT, empatados UUID[], votos INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH c AS (
    SELECT v.pergunta_id, v.candidato_id, count(*)::int AS n
    FROM public.votacao_lideranca_votos v
    WHERE v.votacao_id = p_id
    GROUP BY 1, 2
  ), m AS (
    SELECT c.pergunta_id, max(c.n) AS topo FROM c GROUP BY 1
  )
  SELECT c.pergunta_id, array_agg(c.candidato_id ORDER BY c.candidato_id), m.topo
  FROM c JOIN m ON m.pergunta_id = c.pergunta_id AND c.n = m.topo
  GROUP BY c.pergunta_id, m.topo
  HAVING count(*) > 1;
$$;

-- O retrato de uma votação. `p_contagem`: votos por pergunta e candidato (sem
-- eleitor) e os desempates. `p_envios`: os horários de quem votou.
CREATE OR REPLACE FUNCTION public.fn_vl_montar(p_id UUID, p_contagem BOOLEAN, p_envios BOOLEAN)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'votacao', jsonb_build_object(
      'id', v.id, 'titulo', v.titulo, 'produto', v.produto, 'estado', v.estado,
      'setor_ids', to_jsonb(v.setor_ids), 'cargos', to_jsonb(v.cargos), 'copiada_de', v.copiada_de,
      'criada_em', v.criada_em, 'aberta_em', v.aberta_em, 'encerrada_em', v.encerrada_em,
      'liberada_em', v.liberada_em, 'cancelada_em', v.cancelada_em),
    'perguntas', v.perguntas,
    'participantes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'nome', btrim(p.nome), 'foto', p.foto_url, 'perfil', p.perfil::text, 'setor', s.nome)
             ORDER BY p.nome)
      FROM public.perfis p
      LEFT JOIN public.setores s ON s.id = p.setor_id
      WHERE p.id = ANY (v.participantes)), '[]'::jsonb),
    'contagem', CASE WHEN p_contagem THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('pergunta_id', c.pergunta_id, 'candidato_id', c.candidato_id, 'votos', c.n))
      FROM (
        SELECT x.pergunta_id, x.candidato_id, count(*)::int AS n
        FROM public.votacao_lideranca_votos x
        WHERE x.votacao_id = v.id
        GROUP BY 1, 2
      ) c), '[]'::jsonb) END,
    'desempates', CASE WHEN p_contagem THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'pergunta_id', d.pergunta_id, 'empatados', to_jsonb(d.empatados), 'escolhido_id', d.escolhido_id,
               'decidido_em', d.decidido_em, 'decidido_por', btrim(dp.nome)))
      FROM public.votacao_lideranca_desempates d
      LEFT JOIN public.perfis dp ON dp.id = d.decidido_por
      WHERE d.votacao_id = v.id), '[]'::jsonb) END,
    'envios', CASE WHEN p_envios THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'eleitor_id', e.eleitor_id, 'nome', btrim(ep.nome), 'comecou_em', e.comecou_em,
               'enviado_em', e.enviado_em, 'respondidas', e.respondidas)
             ORDER BY e.enviado_em)
      FROM public.votacao_lideranca_envios e
      LEFT JOIN public.perfis ep ON ep.id = e.eleitor_id
      WHERE e.votacao_id = v.id), '[]'::jsonb) END
  )
  FROM public.votacao_lideranca v
  WHERE v.id = p_id;
$$;

REVOKE ALL ON FUNCTION public.fn_vl_eh_diretoria()                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_vl_registrar(UUID, TEXT, JSONB)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_vl_empates(UUID)                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_vl_montar(UUID, BOOLEAN, BOOLEAN)     FROM PUBLIC, anon, authenticated;

-- ── Organizar (super_admin) ─────────────────────────────────────────────────

-- Cria (p_id nulo) ou edita um rascunho. Mínimo 15 perguntas e 3 participantes.
CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_salvar(
  p_id UUID, p_titulo TEXT, p_produto TEXT, p_setor_ids UUID[], p_cargos TEXT[],
  p_perguntas JSONB, p_participantes UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_perguntas JSONB;
  v_participantes UUID[];
  v_id UUID;
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin organiza a votação' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_perguntas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'As perguntas vieram num formato errado.' USING ERRCODE = '22023';
  END IF;

  -- Perguntas: id e texto, sem repetir id; o emoji é opcional.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', btrim(q->>'id'), 'emoji', COALESCE(q->>'emoji', ''), 'texto', btrim(q->>'texto'))
         ORDER BY n), '[]'::jsonb)
    INTO v_perguntas
  FROM jsonb_array_elements(p_perguntas) WITH ORDINALITY AS t(q, n)
  WHERE btrim(COALESCE(q->>'id', '')) <> '' AND btrim(COALESCE(q->>'texto', '')) <> '';

  IF jsonb_array_length(v_perguntas) < 15 THEN
    RAISE EXCEPTION 'São % perguntas; o mínimo é 15.', jsonb_array_length(v_perguntas) USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT q->>'id') FROM jsonb_array_elements(v_perguntas) q) <> jsonb_array_length(v_perguntas) THEN
    RAISE EXCEPTION 'Há perguntas repetidas.' USING ERRCODE = '22023';
  END IF;

  -- Participantes: só quem existe e está ativo, sem repetir.
  SELECT COALESCE(array_agg(DISTINCT p.id), ARRAY[]::UUID[])
    INTO v_participantes
  FROM public.perfis p
  WHERE p.id = ANY (COALESCE(p_participantes, ARRAY[]::UUID[])) AND p.ativo;

  IF cardinality(v_participantes) < 3 THEN
    RAISE EXCEPTION 'Precisa de pelo menos 3 participantes ativos.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.votacao_lideranca (titulo, produto, setor_ids, cargos, perguntas, participantes, criada_por)
    VALUES (btrim(p_titulo), p_produto, COALESCE(p_setor_ids, ARRAY[]::UUID[]),
            COALESCE(p_cargos, ARRAY['lider']::TEXT[]), v_perguntas, v_participantes, auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.fn_vl_registrar(v_id, 'criada',
      jsonb_build_object('perguntas', jsonb_array_length(v_perguntas), 'participantes', cardinality(v_participantes)));
  ELSE
    UPDATE public.votacao_lideranca
       SET titulo = btrim(p_titulo), produto = p_produto, setor_ids = COALESCE(p_setor_ids, ARRAY[]::UUID[]),
           cargos = COALESCE(p_cargos, ARRAY['lider']::TEXT[]), perguntas = v_perguntas,
           participantes = v_participantes, atualizada_em = NOW()
     WHERE id = p_id AND estado = 'rascunho'
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Só dá para editar a votação enquanto ela é rascunho.' USING ERRCODE = '22023';
    END IF;
    PERFORM public.fn_vl_registrar(v_id, 'editada',
      jsonb_build_object('perguntas', jsonb_array_length(v_perguntas), 'participantes', cardinality(v_participantes)));
  END IF;
  RETURN v_id;
END;
$$;

-- Muda o estado: abrir (rascunho → aberta), encerrar (aberta → encerrada),
-- cancelar (qualquer um antes de liberada). Encerrar a diretoria também pode.
CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_mudar(p_id UUID, p_acao TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  IF p_acao IS NULL OR p_acao NOT IN ('abrir', 'encerrar', 'cancelar') THEN
    RAISE EXCEPTION 'Ação desconhecida: %', p_acao USING ERRCODE = '22023';
  END IF;
  IF p_acao = 'encerrar' THEN
    IF NOT (SELECT public.fn_vl_eh_diretoria()) THEN
      RAISE EXCEPTION 'NAO_AUTORIZADO: só a diretoria ou o super_admin encerram' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin organiza a votação' USING ERRCODE = '42501';
  END IF;

  BEGIN
    UPDATE public.votacao_lideranca v
       SET estado = CASE p_acao WHEN 'abrir' THEN 'aberta' WHEN 'encerrar' THEN 'encerrada' ELSE 'cancelada' END,
           aberta_por    = CASE WHEN p_acao = 'abrir'    THEN auth.uid() ELSE v.aberta_por END,
           aberta_em     = CASE WHEN p_acao = 'abrir'    THEN NOW()      ELSE v.aberta_em END,
           encerrada_por = CASE WHEN p_acao = 'encerrar' THEN auth.uid() ELSE v.encerrada_por END,
           encerrada_em  = CASE WHEN p_acao = 'encerrar' THEN NOW()      ELSE v.encerrada_em END,
           cancelada_por = CASE WHEN p_acao = 'cancelar' THEN auth.uid() ELSE v.cancelada_por END,
           cancelada_em  = CASE WHEN p_acao = 'cancelar' THEN NOW()      ELSE v.cancelada_em END,
           atualizada_em = NOW()
     WHERE v.id = p_id
       AND ((p_acao = 'abrir' AND v.estado = 'rascunho')
         OR (p_acao = 'encerrar' AND v.estado = 'aberta')
         OR (p_acao = 'cancelar' AND v.estado IN ('rascunho', 'aberta', 'encerrada')))
    RETURNING TRUE INTO v_ok;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe uma votação aberta nesta operação. Encerre a outra antes.' USING ERRCODE = '22023';
  END;

  IF v_ok IS NULL THEN
    RAISE EXCEPTION 'Não dá para % esta votação no estado atual.', p_acao USING ERRCODE = '22023';
  END IF;
  PERFORM public.fn_vl_registrar(p_id, CASE p_acao WHEN 'abrir' THEN 'aberta' WHEN 'encerrar' THEN 'encerrada' ELSE 'cancelada' END);
END;
$$;

-- Repetir: um rascunho novo com a mesma configuração (copiada_de aponta a original).
CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_repetir(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin organiza a votação' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.votacao_lideranca (titulo, produto, setor_ids, cargos, perguntas, participantes, copiada_de, criada_por)
  SELECT left(v.titulo || ' (repetição)', 120), v.produto, v.setor_ids, v.cargos, v.perguntas, v.participantes, v.id, auth.uid()
  FROM public.votacao_lideranca v WHERE v.id = p_id
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Votação não encontrada.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.fn_vl_registrar(v_id, 'criada', jsonb_build_object('copiada_de', p_id));
  PERFORM public.fn_vl_registrar(p_id, 'repetida', jsonb_build_object('nova', v_id));
  RETURN v_id;
END;
$$;

-- ── Votar (o líder) ─────────────────────────────────────────────────────────

-- As votações abertas em que a pessoa participa (normalmente uma), com
-- perguntas, participantes e se ela já enviou.
CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_minha()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(
           public.fn_vl_montar(v.id, FALSE, FALSE)
           || jsonb_build_object('enviado_em', (
                SELECT e.enviado_em FROM public.votacao_lideranca_envios e
                WHERE e.votacao_id = v.id AND e.eleitor_id = (SELECT auth.uid())))
           ORDER BY v.aberta_em), '[]'::jsonb)
  FROM public.votacao_lideranca v
  WHERE v.estado = 'aberta' AND (SELECT auth.uid()) = ANY (v.participantes);
$$;

-- Envia os votos de uma vez ({pergunta_id: candidato_id}). Uma vez por pessoa;
-- depois de enviado não muda. `p_comecou_em`: quando a pessoa clicou em
-- «Começar» (vale só se cair entre a abertura e agora).
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
  v_exigidas INTEGER;
  r RECORD;
BEGIN
  SELECT * INTO v FROM public.votacao_lideranca WHERE id = p_id FOR SHARE;
  IF v.id IS NULL OR v.estado <> 'aberta' THEN
    RAISE EXCEPTION 'Esta votação não está aberta.' USING ERRCODE = '22023';
  END IF;
  IF v_eu IS NULL OR NOT (v_eu = ANY (v.participantes)) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: você não participa desta votação' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.votacao_lideranca_envios e WHERE e.votacao_id = p_id AND e.eleitor_id = v_eu) THEN
    RAISE EXCEPTION 'Você já enviou os seus votos.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_votos) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Os votos vieram num formato errado.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_each_text(p_votos)) <> (SELECT count(DISTINCT value) FROM jsonb_each_text(p_votos)) THEN
    RAISE EXCEPTION 'Cada colega só pode ser escolhido em uma pergunta.' USING ERRCODE = '22023';
  END IF;

  FOR r IN SELECT key AS pergunta_id, value AS candidato FROM jsonb_each_text(p_votos) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.perguntas) q WHERE q->>'id' = r.pergunta_id) THEN
      RAISE EXCEPTION 'Pergunta desconhecida: %', r.pergunta_id USING ERRCODE = '22023';
    END IF;
    -- Dois IFs: o SQL não garante a ordem do OR, e o cast de um texto ruim estoura.
    IF r.candidato !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Voto em quem não participa.' USING ERRCODE = '22023';
    END IF;
    IF NOT (r.candidato::uuid = ANY (v.participantes)) THEN
      RAISE EXCEPTION 'Voto em quem não participa.' USING ERRCODE = '22023';
    END IF;
    IF r.candidato::uuid = v_eu THEN
      RAISE EXCEPTION 'Não dá para votar em si mesmo.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.votacao_lideranca_votos (votacao_id, pergunta_id, eleitor_id, candidato_id)
    VALUES (p_id, r.pergunta_id, v_eu, r.candidato::uuid);
    v_n := v_n + 1;
  END LOOP;

  -- Só com tudo preenchido: todas as perguntas, ou o máximo possível quando há
  -- mais perguntas que colegas (cada colega vale uma vez, e ninguém vota em si).
  v_exigidas := least(jsonb_array_length(v.perguntas), cardinality(v.participantes) - 1);
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

-- ── Diretoria ───────────────────────────────────────────────────────────────

-- As votações (mais novas primeiro), com quantos participam e quantos já votaram.
CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_listar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT (SELECT public.fn_vl_eh_diretoria()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só a diretoria ou o super_admin' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', v.id, 'titulo', v.titulo, 'produto', v.produto, 'estado', v.estado, 'copiada_de', v.copiada_de,
             'perguntas', jsonb_array_length(v.perguntas), 'participantes', cardinality(v.participantes),
             'votaram', (SELECT count(*) FROM public.votacao_lideranca_envios e WHERE e.votacao_id = v.id),
             'criada_em', v.criada_em, 'aberta_em', v.aberta_em, 'encerrada_em', v.encerrada_em,
             'liberada_em', v.liberada_em, 'cancelada_em', v.cancelada_em)
           ORDER BY v.criada_em DESC)
    FROM public.votacao_lideranca v), '[]'::jsonb);
END;
$$;

-- A visão da diretoria. Aberta: só os horários de quem votou (andamento).
-- Encerrada ou liberada: também a contagem e os desempates. Nunca o voto de cada um.
CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_apuracao(p_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_estado TEXT;
BEGIN
  IF NOT (SELECT public.fn_vl_eh_diretoria()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só a diretoria ou o super_admin' USING ERRCODE = '42501';
  END IF;
  SELECT estado INTO v_estado FROM public.votacao_lideranca WHERE id = p_id;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Votação não encontrada.' USING ERRCODE = '22023';
  END IF;
  RETURN public.fn_vl_montar(p_id, v_estado IN ('encerrada', 'liberada'), TRUE);
END;
$$;

-- Decide um empate: o escolhido tem que estar entre os empatados de agora.
CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_desempatar(p_id UUID, p_pergunta TEXT, p_escolhido UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_empatados UUID[];
BEGIN
  IF NOT (SELECT public.fn_vl_eh_diretoria()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só a diretoria decide os empates' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.votacao_lideranca v WHERE v.id = p_id AND v.estado = 'encerrada') THEN
    RAISE EXCEPTION 'Só dá para desempatar com a votação encerrada e antes de liberar.' USING ERRCODE = '22023';
  END IF;
  SELECT e.empatados INTO v_empatados FROM public.fn_vl_empates(p_id) e WHERE e.pergunta_id = p_pergunta;
  IF v_empatados IS NULL OR NOT (p_escolhido = ANY (v_empatados)) THEN
    RAISE EXCEPTION 'Esta pessoa não está entre os empatados desta pergunta.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.votacao_lideranca_desempates (votacao_id, pergunta_id, empatados, escolhido_id, decidido_por)
  VALUES (p_id, p_pergunta, v_empatados, p_escolhido, auth.uid())
  ON CONFLICT (votacao_id, pergunta_id) DO UPDATE
    SET empatados = EXCLUDED.empatados, escolhido_id = EXCLUDED.escolhido_id,
        decidido_por = EXCLUDED.decidido_por, decidido_em = NOW();
  PERFORM public.fn_vl_registrar(p_id, 'desempate',
    jsonb_build_object('pergunta_id', p_pergunta, 'empatados', to_jsonb(v_empatados), 'escolhido_id', p_escolhido));
END;
$$;

-- Libera o resultado: só com todos os empates decididos.
CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_liberar(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_pendentes INTEGER;
BEGIN
  IF NOT (SELECT public.fn_vl_eh_diretoria()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só a diretoria libera o resultado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.votacao_lideranca v WHERE v.id = p_id AND v.estado = 'encerrada') THEN
    RAISE EXCEPTION 'Só dá para liberar uma votação encerrada.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_pendentes
  FROM public.fn_vl_empates(p_id) e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.votacao_lideranca_desempates d
    WHERE d.votacao_id = p_id AND d.pergunta_id = e.pergunta_id AND d.escolhido_id = ANY (e.empatados));
  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'Falta decidir % empate(s) antes de liberar.', v_pendentes USING ERRCODE = '22023';
  END IF;

  UPDATE public.votacao_lideranca
     SET estado = 'liberada', liberada_por = auth.uid(), liberada_em = NOW(), atualizada_em = NOW()
   WHERE id = p_id;
  PERFORM public.fn_vl_registrar(p_id, 'liberada');
END;
$$;

-- ── Resultado (depois de liberado) ──────────────────────────────────────────

-- Quem participou, a diretoria e o super_admin veem a contagem e os desempates.
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
      AND ((SELECT auth.uid()) = ANY (v.participantes) OR (SELECT public.fn_vl_eh_diretoria()))
  ) THEN
    RAISE EXCEPTION 'Resultado ainda não liberado.' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_vl_montar(p_id, TRUE, FALSE);
END;
$$;

-- Os resultados liberados nos últimos 60 dias em que a pessoa participou: o
-- card «Saiu o resultado» no canto da tela.
CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_meus_resultados()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', v.id, 'titulo', v.titulo, 'liberada_em', v.liberada_em)
           ORDER BY v.liberada_em DESC), '[]'::jsonb)
  FROM public.votacao_lideranca v
  WHERE v.estado = 'liberada'
    AND v.liberada_em > NOW() - INTERVAL '60 days'
    AND (SELECT auth.uid()) = ANY (v.participantes);
$$;

-- ── O registro completo (só super_admin) ────────────────────────────────────

-- Tudo: a votação, os horários, os desempates, o diário e EM QUEM CADA UM VOTOU.
CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_registro(p_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin vê em quem cada um votou' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_vl_montar(p_id, TRUE, TRUE) || jsonb_build_object(
    'votos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'pergunta_id', x.pergunta_id, 'eleitor_id', x.eleitor_id, 'eleitor', btrim(pe.nome),
               'candidato_id', x.candidato_id, 'candidato', btrim(pc.nome), 'votado_em', x.votado_em)
             ORDER BY x.votado_em, x.eleitor_id, x.pergunta_id)
      FROM public.votacao_lideranca_votos x
      LEFT JOIN public.perfis pe ON pe.id = x.eleitor_id
      LEFT JOIN public.perfis pc ON pc.id = x.candidato_id
      WHERE x.votacao_id = p_id), '[]'::jsonb),
    'eventos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('evento', e.evento, 'por', e.por_nome, 'em', e.em, 'detalhe', e.detalhe) ORDER BY e.em, e.id)
      FROM public.votacao_lideranca_eventos e
      WHERE e.votacao_id = p_id), '[]'::jsonb));
END;
$$;

-- ── Quem chama o quê ────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_salvar(UUID, TEXT, TEXT, UUID[], TEXT[], JSONB, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_mudar(UUID, TEXT)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_repetir(UUID)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_minha()                           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_votar(UUID, JSONB, TIMESTAMPTZ)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_listar()                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_apuracao(UUID)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_desempatar(UUID, TEXT, UUID)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_liberar(UUID)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_resultado(UUID)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_registro(UUID)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_meus_resultados()                 FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_salvar(UUID, TEXT, TEXT, UUID[], TEXT[], JSONB, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_mudar(UUID, TEXT)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_repetir(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_minha()                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_votar(UUID, JSONB, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_listar()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_apuracao(UUID)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_desempatar(UUID, TEXT, UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_liberar(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_resultado(UUID)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_registro(UUID)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_meus_resultados()               TO authenticated;

COMMIT;
