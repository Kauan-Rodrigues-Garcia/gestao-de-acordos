-- ============================================================================
-- 20261112160000_votacao_gerentes_e_guardar.sql
--
-- Votação da Liderança: a OPERAÇÃO vota nos GERENTES, e guardar uma votação
-- sem liberar o resultado (12/11/2026, pedido do Kauan).
--
-- 1. Tipo «gerentes». Até aqui quem votava era quem concorria (os líderes
--    votam uns nos outros). Agora uma votação pode ter ELEITORES separados dos
--    candidatos: os operadores dos setores e equipes escolhidos votam nos
--    gerentes. `participantes` continua sendo quem CONCORRE; `eleitores` é
--    quem VOTA (nulo = os próprios participantes, como sempre foi).
--
--    Duas regras viram escolha de quem organiza (padrão = como era):
--      um_por_candidato  cada pessoa só pode ser escolhida uma vez por eleitor
--                        (com poucos gerentes, desligado deixa responder todas);
--      um_titulo         a mesma pessoa em 1º em mais de uma categoria pede
--                        decisão da diretoria (fn_vl_pendentes).
--    A trava `vl_um_por_colega` sai da tabela: quem confere é
--    fn_votacao_lideranca_votar, pela regra da votação.
--
-- 2. Guardar. Uma votação ENCERRADA pode ir para a gaveta: o resultado não sai,
--    ninguém decide nem libera, o card «Apurar» some da diretoria — e tudo fica
--    gravado. «Tirar da gaveta» volta ao encerrada, do jeito que estava.
--    E «reabrir» (encerrada → aberta) deixa quem faltou votar.
--
-- Votações que já existem: tipo lideranca, eleitores nulo, as duas regras
-- ligadas — nada muda nelas. Nenhum voto muda. Reaplicável.
-- Depende da 20261104230000, 20261110150000 e 20261111190000.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF to_regprocedure('public.fn_vl_pendentes(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes a 20261110150000 e a 20261111190000.';
  END IF;
END $$;

-- ============================================================================
-- 1. Colunas
-- ============================================================================

ALTER TABLE public.votacao_lideranca
  ADD COLUMN IF NOT EXISTS tipo              TEXT NOT NULL DEFAULT 'lideranca',
  ADD COLUMN IF NOT EXISTS eleitores         UUID[],
  ADD COLUMN IF NOT EXISTS equipe_ids        UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS cargos_eleitores  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS um_por_candidato  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS um_titulo         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS guardada_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guardada_por      UUID;

ALTER TABLE public.votacao_lideranca DROP CONSTRAINT IF EXISTS vl_tipo;
ALTER TABLE public.votacao_lideranca ADD CONSTRAINT vl_tipo CHECK (tipo IN ('lideranca', 'gerentes'));
-- Só a encerrada vai para a gaveta.
ALTER TABLE public.votacao_lideranca DROP CONSTRAINT IF EXISTS vl_guardada;
ALTER TABLE public.votacao_lideranca ADD CONSTRAINT vl_guardada CHECK (guardada_em IS NULL OR estado = 'encerrada');

COMMENT ON COLUMN public.votacao_lideranca.participantes IS
  'Quem CONCORRE (aparece nas categorias). Ver 20261112160000.';
COMMENT ON COLUMN public.votacao_lideranca.eleitores IS
  'Quem VOTA. Nulo = os próprios participantes (líderes votam entre si). 20261112160000.';
COMMENT ON COLUMN public.votacao_lideranca.um_por_candidato IS
  'Cada pessoa só pode ser escolhida uma vez por eleitor. 20261112160000.';
COMMENT ON COLUMN public.votacao_lideranca.um_titulo IS
  'A mesma pessoa em 1º em mais de uma categoria pede decisão da diretoria. 20261112160000.';
COMMENT ON COLUMN public.votacao_lideranca.guardada_em IS
  'Encerrada e guardada sem liberar: não decide, não libera, não avisa. 20261112160000.';

-- A regra «um por colega» passa a ser da votação (um_por_candidato), na função.
ALTER TABLE public.votacao_lideranca_votos DROP CONSTRAINT IF EXISTS vl_um_por_colega;

-- Uma aberta por operação E por tipo: a dos gerentes não trava a da liderança.
DROP INDEX IF EXISTS public.uq_votacao_lideranca_aberta;
CREATE UNIQUE INDEX IF NOT EXISTS uq_votacao_lideranca_aberta_tipo
  ON public.votacao_lideranca (produto, tipo) WHERE estado = 'aberta';

-- ============================================================================
-- 2. Ajudantes (internos)
-- ============================================================================

-- Os uuids de um array JSON (o que não for uuid fica de fora).
CREATE OR REPLACE FUNCTION public.fn_vl_uuids(p JSONB)
RETURNS UUID[]
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT x::uuid), ARRAY[]::UUID[])
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END) x
   WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- O retrato: agora com o tipo, as regras, a gaveta e — para quem acompanha
-- (`p_envios`) — a lista de ELEITORES quando ela é separada dos candidatos.
CREATE OR REPLACE FUNCTION public.fn_vl_montar(p_id UUID, p_contagem BOOLEAN, p_envios BOOLEAN)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'votacao', jsonb_build_object(
      'id', v.id, 'titulo', v.titulo, 'produto', v.produto, 'estado', v.estado, 'tipo', v.tipo,
      'setor_ids', to_jsonb(v.setor_ids), 'equipe_ids', to_jsonb(v.equipe_ids),
      'cargos', to_jsonb(v.cargos), 'cargos_eleitores', to_jsonb(v.cargos_eleitores), 'copiada_de', v.copiada_de,
      'um_por_candidato', v.um_por_candidato, 'um_titulo', v.um_titulo,
      'eleitores_total', cardinality(COALESCE(v.eleitores, v.participantes)),
      'criada_em', v.criada_em, 'aberta_em', v.aberta_em, 'encerrada_em', v.encerrada_em,
      'liberada_em', v.liberada_em, 'cancelada_em', v.cancelada_em, 'guardada_em', v.guardada_em),
    'perguntas', v.perguntas,
    'participantes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'nome', btrim(p.nome), 'foto', p.foto_url, 'perfil', p.perfil::text, 'setor', s.nome)
             ORDER BY p.nome)
      FROM public.perfis p
      LEFT JOIN public.setores s ON s.id = p.setor_id
      WHERE p.id = ANY (v.participantes)), '[]'::jsonb),
    'eleitores', CASE WHEN p_envios AND v.eleitores IS NOT NULL THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'nome', btrim(p.nome), 'foto', p.foto_url, 'perfil', p.perfil::text,
               'setor', s.nome, 'equipe', eq.nome)
             ORDER BY p.nome)
      FROM public.perfis p
      LEFT JOIN public.setores s ON s.id = p.setor_id
      LEFT JOIN public.equipes eq ON eq.id = p.equipe_id
      WHERE p.id = ANY (v.eleitores)), '[]'::jsonb) END,
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

-- O que falta decidir: «repetido» só conta quando a votação pede (um_titulo).
CREATE OR REPLACE FUNCTION public.fn_vl_pendentes(p_id UUID)
RETURNS TABLE (pergunta_id TEXT, vencedores UUID[], empate BOOLEAN, repetido BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH vot AS (
    SELECT v.participantes, v.um_titulo,
           ARRAY(SELECT q->>'id' FROM jsonb_array_elements(v.perguntas) q) AS perguntas
      FROM public.votacao_lideranca v
     WHERE v.id = p_id
  ), c AS (
    SELECT x.pergunta_id, x.candidato_id, count(*)::int AS n
      FROM public.votacao_lideranca_votos x, vot
     WHERE x.votacao_id = p_id AND x.pergunta_id = ANY (vot.perguntas)
     GROUP BY 1, 2
  ), topo AS (
    SELECT c.pergunta_id, max(c.n) AS n FROM c GROUP BY 1
  ), venc AS (
    SELECT c.pergunta_id, c.candidato_id
      FROM c JOIN topo t ON t.pergunta_id = c.pergunta_id AND c.n = t.n
  ), decidida AS (
    SELECT d.pergunta_id, d.escolhido_id
      FROM public.votacao_lideranca_desempates d, vot
     WHERE d.votacao_id = p_id
       AND d.pergunta_id = ANY (vot.perguntas)
       AND d.escolhido_id = ANY (vot.participantes)
  ), quem_leva AS (
    SELECT d.pergunta_id, d.escolhido_id AS id FROM decidida d
    UNION ALL
    SELECT v.pergunta_id, v.candidato_id FROM venc v
     WHERE NOT EXISTS (SELECT 1 FROM decidida d WHERE d.pergunta_id = v.pergunta_id)
  ), aberta AS (
    SELECT v.pergunta_id, array_agg(v.candidato_id ORDER BY v.candidato_id) AS vencedores
      FROM venc v
     WHERE NOT EXISTS (SELECT 1 FROM decidida d WHERE d.pergunta_id = v.pergunta_id)
     GROUP BY v.pergunta_id
  ), marcada AS (
    SELECT a.pergunta_id, a.vencedores,
           cardinality(a.vencedores) > 1 AS empate,
           (SELECT vot.um_titulo FROM vot)
             AND EXISTS (SELECT 1 FROM quem_leva q WHERE q.pergunta_id <> a.pergunta_id AND q.id = ANY (a.vencedores)) AS repetido
      FROM aberta a
  )
  SELECT m.pergunta_id, m.vencedores, m.empate, m.repetido
    FROM marcada m
   WHERE m.empate OR m.repetido;
$$;

COMMENT ON FUNCTION public.fn_vl_pendentes(UUID) IS
  'Categorias que a diretoria ainda precisa decidir: empate no 1º lugar, ou (com um_titulo) '
  '1º colocado que também leva outra categoria. 20261112160000.';

REVOKE ALL ON FUNCTION public.fn_vl_uuids(JSONB)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_vl_montar(UUID, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_vl_pendentes(UUID)                FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. Gravar uma votação de qualquer tipo (super_admin)
-- ============================================================================
--
-- p_dados: titulo, produto, tipo, setor_ids, equipe_ids, cargos,
-- cargos_eleitores, perguntas, participantes, eleitores, um_por_candidato,
-- um_titulo. Liderança: mínimo 15 perguntas e 3 participantes; os eleitores
-- são os próprios participantes. Gerentes: mínimo 3 perguntas, 2 candidatos e
-- 1 eleitor. Cria (p_id nulo) ou edita um rascunho.

CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_gravar(p_id UUID, p_dados JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tipo          TEXT := COALESCE(NULLIF(btrim(p_dados->>'tipo'), ''), 'lideranca');
  v_perguntas     JSONB;
  v_participantes UUID[];
  v_eleitores     UUID[];
  v_min_perg      INTEGER;
  v_um_cand       BOOLEAN := COALESCE((p_dados->>'um_por_candidato')::boolean, TRUE);
  v_um_tit        BOOLEAN := COALESCE((p_dados->>'um_titulo')::boolean, TRUE);
  v_textos        TEXT[];
  v_id            UUID;
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin organiza a votação' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'A votação veio num formato errado.' USING ERRCODE = '22023';
  END IF;
  IF v_tipo NOT IN ('lideranca', 'gerentes') THEN
    RAISE EXCEPTION 'Tipo de votação desconhecido: %', v_tipo USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_dados->'perguntas') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'As perguntas vieram num formato errado.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', btrim(q->>'id'), 'emoji', COALESCE(q->>'emoji', ''), 'texto', btrim(q->>'texto'))
         ORDER BY n), '[]'::jsonb)
    INTO v_perguntas
  FROM jsonb_array_elements(p_dados->'perguntas') WITH ORDINALITY AS t(q, n)
  WHERE btrim(COALESCE(q->>'id', '')) <> '' AND btrim(COALESCE(q->>'texto', '')) <> '';

  v_min_perg := CASE v_tipo WHEN 'lideranca' THEN 15 ELSE 3 END;
  IF jsonb_array_length(v_perguntas) < v_min_perg THEN
    RAISE EXCEPTION 'São % perguntas; o mínimo é %.', jsonb_array_length(v_perguntas), v_min_perg USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT q->>'id') FROM jsonb_array_elements(v_perguntas) q) <> jsonb_array_length(v_perguntas) THEN
    RAISE EXCEPTION 'Há perguntas repetidas.' USING ERRCODE = '22023';
  END IF;

  -- Quem concorre e quem vota: só quem existe e está ativo, sem repetir.
  SELECT COALESCE(array_agg(p.id ORDER BY p.id), ARRAY[]::UUID[]) INTO v_participantes
    FROM public.perfis p WHERE p.id = ANY (public.fn_vl_uuids(p_dados->'participantes')) AND p.ativo;

  IF v_tipo = 'lideranca' THEN
    v_eleitores := NULL;
    IF cardinality(v_participantes) < 3 THEN
      RAISE EXCEPTION 'Precisa de pelo menos 3 participantes ativos.' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT COALESCE(array_agg(p.id ORDER BY p.id), ARRAY[]::UUID[]) INTO v_eleitores
      FROM public.perfis p WHERE p.id = ANY (public.fn_vl_uuids(p_dados->'eleitores')) AND p.ativo;
    IF cardinality(v_participantes) < 2 THEN
      RAISE EXCEPTION 'Precisa de pelo menos 2 gerentes concorrendo.' USING ERRCODE = '22023';
    END IF;
    IF cardinality(v_eleitores) < 1 THEN
      RAISE EXCEPTION 'Escolha quem vota (setores, equipes ou pessoas).' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::TEXT[]) INTO v_textos
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_dados->'cargos_eleitores') = 'array'
                                        THEN p_dados->'cargos_eleitores' ELSE '[]'::jsonb END) x;

  IF p_id IS NULL THEN
    INSERT INTO public.votacao_lideranca (
      titulo, produto, tipo, setor_ids, equipe_ids, cargos, cargos_eleitores, perguntas,
      participantes, eleitores, um_por_candidato, um_titulo, criada_por)
    VALUES (
      btrim(COALESCE(p_dados->>'titulo', '')), p_dados->>'produto', v_tipo,
      public.fn_vl_uuids(p_dados->'setor_ids'), public.fn_vl_uuids(p_dados->'equipe_ids'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_dados->'cargos') = 'array'
                                                           THEN p_dados->'cargos' ELSE '[]'::jsonb END)), ARRAY[]::TEXT[]),
      v_textos, v_perguntas, v_participantes, v_eleitores, v_um_cand, v_um_tit, auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.fn_vl_registrar(v_id, 'criada', jsonb_build_object(
      'tipo', v_tipo, 'perguntas', jsonb_array_length(v_perguntas), 'participantes', cardinality(v_participantes),
      'eleitores', cardinality(COALESCE(v_eleitores, v_participantes))));
  ELSE
    UPDATE public.votacao_lideranca
       SET titulo = btrim(COALESCE(p_dados->>'titulo', '')), produto = p_dados->>'produto', tipo = v_tipo,
           setor_ids = public.fn_vl_uuids(p_dados->'setor_ids'), equipe_ids = public.fn_vl_uuids(p_dados->'equipe_ids'),
           cargos = COALESCE(ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_dados->'cargos') = 'array'
                                                                         THEN p_dados->'cargos' ELSE '[]'::jsonb END)), ARRAY[]::TEXT[]),
           cargos_eleitores = v_textos, perguntas = v_perguntas, participantes = v_participantes,
           eleitores = v_eleitores, um_por_candidato = v_um_cand, um_titulo = v_um_tit, atualizada_em = NOW()
     WHERE id = p_id AND estado = 'rascunho'
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Só dá para editar a votação enquanto ela é rascunho.' USING ERRCODE = '22023';
    END IF;
    PERFORM public.fn_vl_registrar(v_id, 'editada', jsonb_build_object(
      'tipo', v_tipo, 'perguntas', jsonb_array_length(v_perguntas), 'participantes', cardinality(v_participantes),
      'eleitores', cardinality(COALESCE(v_eleitores, v_participantes))));
  END IF;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.fn_votacao_lideranca_gravar(UUID, JSONB) IS
  'Cria ou edita (rascunho) uma votação de liderança ou de gerentes, com eleitores e regras. 20261112160000.';

-- ============================================================================
-- 4. Mudar o estado: + reabrir, guardar, tirar da gaveta
-- ============================================================================
--
--   abrir       rascunho → aberta                         super_admin
--   encerrar    aberta → encerrada                        diretoria ou super_admin
--   cancelar    rascunho/aberta/encerrada → cancelada     super_admin
--   reabrir     encerrada (fora da gaveta) → aberta       super_admin
--   guardar     encerrada → encerrada guardada            super_admin
--   desguardar  guardada → encerrada                      super_admin

CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_mudar(p_id UUID, p_acao TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  IF p_acao IS NULL OR p_acao NOT IN ('abrir', 'encerrar', 'cancelar', 'reabrir', 'guardar', 'desguardar') THEN
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
    IF p_acao = 'abrir' THEN
      UPDATE public.votacao_lideranca v
         SET estado = 'aberta', aberta_por = auth.uid(), aberta_em = NOW(), atualizada_em = NOW()
       WHERE v.id = p_id AND v.estado = 'rascunho'
      RETURNING TRUE INTO v_ok;
    ELSIF p_acao = 'encerrar' THEN
      UPDATE public.votacao_lideranca v
         SET estado = 'encerrada', encerrada_por = auth.uid(), encerrada_em = NOW(), atualizada_em = NOW()
       WHERE v.id = p_id AND v.estado = 'aberta'
      RETURNING TRUE INTO v_ok;
    ELSIF p_acao = 'cancelar' THEN
      UPDATE public.votacao_lideranca v
         SET estado = 'cancelada', cancelada_por = auth.uid(), cancelada_em = NOW(),
             guardada_em = NULL, guardada_por = NULL, atualizada_em = NOW()
       WHERE v.id = p_id AND v.estado IN ('rascunho', 'aberta', 'encerrada')
      RETURNING TRUE INTO v_ok;
    ELSIF p_acao = 'reabrir' THEN
      UPDATE public.votacao_lideranca v
         SET estado = 'aberta', encerrada_por = NULL, encerrada_em = NULL, atualizada_em = NOW()
       WHERE v.id = p_id AND v.estado = 'encerrada' AND v.guardada_em IS NULL
      RETURNING TRUE INTO v_ok;
    ELSIF p_acao = 'guardar' THEN
      UPDATE public.votacao_lideranca v
         SET guardada_em = NOW(), guardada_por = auth.uid(), atualizada_em = NOW()
       WHERE v.id = p_id AND v.estado = 'encerrada' AND v.guardada_em IS NULL
      RETURNING TRUE INTO v_ok;
    ELSE -- desguardar
      UPDATE public.votacao_lideranca v
         SET guardada_em = NULL, guardada_por = NULL, atualizada_em = NOW()
       WHERE v.id = p_id AND v.estado = 'encerrada' AND v.guardada_em IS NOT NULL
      RETURNING TRUE INTO v_ok;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe uma votação deste tipo aberta nesta operação. Encerre a outra antes.' USING ERRCODE = '22023';
  END;

  IF v_ok IS NULL THEN
    RAISE EXCEPTION 'Não dá para % esta votação no estado atual.', p_acao USING ERRCODE = '22023';
  END IF;
  PERFORM public.fn_vl_registrar(p_id, CASE p_acao
    WHEN 'abrir' THEN 'aberta' WHEN 'encerrar' THEN 'encerrada' WHEN 'cancelar' THEN 'cancelada'
    WHEN 'reabrir' THEN 'reaberta' WHEN 'guardar' THEN 'guardada' ELSE 'tirada_da_gaveta' END);
END;
$$;

-- Repetir: copia também o tipo, os eleitores e as regras.
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
  INSERT INTO public.votacao_lideranca (
    titulo, produto, tipo, setor_ids, equipe_ids, cargos, cargos_eleitores, perguntas,
    participantes, eleitores, um_por_candidato, um_titulo, copiada_de, criada_por)
  SELECT left(v.titulo || ' (repetição)', 120), v.produto, v.tipo, v.setor_ids, v.equipe_ids, v.cargos,
         v.cargos_eleitores, v.perguntas, v.participantes, v.eleitores, v.um_por_candidato, v.um_titulo, v.id, auth.uid()
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

-- ============================================================================
-- 5. Votar: quem vota são os eleitores; as regras são da votação
-- ============================================================================

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
  WHERE v.estado = 'aberta' AND (SELECT auth.uid()) = ANY (COALESCE(v.eleitores, v.participantes));
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
  r RECORD;
BEGIN
  SELECT * INTO v FROM public.votacao_lideranca WHERE id = p_id FOR SHARE;
  IF v.id IS NULL OR v.estado <> 'aberta' THEN
    RAISE EXCEPTION 'Esta votação não está aberta.' USING ERRCODE = '22023';
  END IF;
  IF v_eu IS NULL OR NOT (v_eu = ANY (COALESCE(v.eleitores, v.participantes))) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: você não vota nesta votação' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.votacao_lideranca_envios e WHERE e.votacao_id = p_id AND e.eleitor_id = v_eu) THEN
    RAISE EXCEPTION 'Você já enviou os seus votos.' USING ERRCODE = '22023';
  END IF;
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

  -- Só com tudo preenchido. Em quem dá para votar: os candidatos, menos a
  -- própria pessoa se ela também concorre. Com «um por candidato», no máximo
  -- um candidato por pergunta; sem, todas as perguntas.
  v_disponiveis := cardinality(v.participantes) - CASE WHEN v_eu = ANY (v.participantes) THEN 1 ELSE 0 END;
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

-- ============================================================================
-- 6. Diretoria: lista, decidir e liberar respeitam a gaveta
-- ============================================================================

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
             'id', v.id, 'titulo', v.titulo, 'produto', v.produto, 'estado', v.estado, 'tipo', v.tipo,
             'copiada_de', v.copiada_de,
             'perguntas', jsonb_array_length(v.perguntas), 'participantes', cardinality(v.participantes),
             'eleitores', cardinality(COALESCE(v.eleitores, v.participantes)),
             'um_por_candidato', v.um_por_candidato, 'um_titulo', v.um_titulo,
             'votaram', (SELECT count(*) FROM public.votacao_lideranca_envios e WHERE e.votacao_id = v.id),
             'criada_em', v.criada_em, 'aberta_em', v.aberta_em, 'encerrada_em', v.encerrada_em,
             'liberada_em', v.liberada_em, 'cancelada_em', v.cancelada_em, 'guardada_em', v.guardada_em)
           ORDER BY v.criada_em DESC)
    FROM public.votacao_lideranca v), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_votacao_lideranca_desempatar(p_id UUID, p_pergunta TEXT, p_escolhido UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_pend    RECORD;
  v_ja      BOOLEAN;
  v_topo    UUID[];
  v_motivo  TEXT;
BEGIN
  IF NOT (SELECT public.fn_vl_eh_diretoria()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só a diretoria decide as categorias' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.votacao_lideranca v WHERE v.id = p_id AND v.estado = 'encerrada') THEN
    RAISE EXCEPTION 'Só dá para decidir com a votação encerrada e antes de liberar.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.votacao_lideranca v WHERE v.id = p_id AND v.guardada_em IS NOT NULL) THEN
    RAISE EXCEPTION 'A votação está guardada: tire da gaveta antes de decidir.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.votacao_lideranca v, jsonb_array_elements(v.perguntas) q
                  WHERE v.id = p_id AND q->>'id' = p_pergunta) THEN
    RAISE EXCEPTION 'Esta categoria não está na votação.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.votacao_lideranca v WHERE v.id = p_id AND p_escolhido = ANY (v.participantes)) THEN
    RAISE EXCEPTION 'Esta pessoa não participa da votação.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pend FROM public.fn_vl_pendentes(p_id) p WHERE p.pergunta_id = p_pergunta;
  v_ja := EXISTS (SELECT 1 FROM public.votacao_lideranca_desempates d WHERE d.votacao_id = p_id AND d.pergunta_id = p_pergunta);
  IF v_pend.pergunta_id IS NULL AND NOT v_ja THEN
    RAISE EXCEPTION 'Esta categoria já tem vencedor: não precisa de decisão.' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(c.candidato_id ORDER BY c.candidato_id) INTO v_topo
    FROM (
      SELECT x.candidato_id, count(*) AS n, max(count(*)) OVER () AS m
        FROM public.votacao_lideranca_votos x
       WHERE x.votacao_id = p_id AND x.pergunta_id = p_pergunta
       GROUP BY x.candidato_id
    ) c
   WHERE c.n = c.m;

  v_motivo := CASE
    WHEN v_pend.pergunta_id IS NULL THEN (SELECT d.motivo FROM public.votacao_lideranca_desempates d
                                           WHERE d.votacao_id = p_id AND d.pergunta_id = p_pergunta)
    ELSE concat_ws(',', CASE WHEN v_pend.empate THEN 'empate' END, CASE WHEN v_pend.repetido THEN 'repetido' END)
  END;

  INSERT INTO public.votacao_lideranca_desempates (votacao_id, pergunta_id, empatados, escolhido_id, decidido_por, motivo)
  VALUES (p_id, p_pergunta, COALESCE(v_topo, '{}'), p_escolhido, auth.uid(), v_motivo)
  ON CONFLICT (votacao_id, pergunta_id) DO UPDATE
    SET empatados = EXCLUDED.empatados, escolhido_id = EXCLUDED.escolhido_id,
        decidido_por = EXCLUDED.decidido_por, decidido_em = NOW(),
        motivo = COALESCE(EXCLUDED.motivo, public.votacao_lideranca_desempates.motivo);
  PERFORM public.fn_vl_registrar(p_id, 'desempate',
    jsonb_build_object('pergunta_id', p_pergunta, 'primeiros', to_jsonb(COALESCE(v_topo, '{}')),
                       'escolhido_id', p_escolhido, 'motivo', v_motivo));
END;
$$;

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
  IF EXISTS (SELECT 1 FROM public.votacao_lideranca v WHERE v.id = p_id AND v.guardada_em IS NOT NULL) THEN
    RAISE EXCEPTION 'A votação está guardada: tire da gaveta antes de liberar.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_pendentes FROM public.fn_vl_pendentes(p_id);
  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'Falta decidir % categoria(s) antes de liberar.', v_pendentes USING ERRCODE = '22023';
  END IF;

  UPDATE public.votacao_lideranca
     SET estado = 'liberada', liberada_por = auth.uid(), liberada_em = NOW(), atualizada_em = NOW()
   WHERE id = p_id;
  PERFORM public.fn_vl_registrar(p_id, 'liberada');
END;
$$;

-- ============================================================================
-- 7. Resultado: quem votou e quem concorreu veem
-- ============================================================================

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
      AND ((SELECT auth.uid()) = ANY (v.participantes)
        OR (SELECT auth.uid()) = ANY (COALESCE(v.eleitores, ARRAY[]::UUID[]))
        OR (SELECT public.fn_vl_eh_diretoria()))
  ) THEN
    RAISE EXCEPTION 'Resultado ainda não liberado.' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_vl_montar(p_id, TRUE, FALSE);
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
    AND ((SELECT auth.uid()) = ANY (v.participantes)
      OR (SELECT auth.uid()) = ANY (COALESCE(v.eleitores, ARRAY[]::UUID[])));
$$;

-- ============================================================================
-- 8. Quem chama o quê
-- ============================================================================

REVOKE ALL ON FUNCTION public.fn_votacao_lideranca_gravar(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_votacao_lideranca_gravar(UUID, JSONB) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_vl_pendentes(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_vl_montar(uuid,boolean,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_vl_uuids(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Um ajudante interno ficou aberto para o app.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_votacao_lideranca_gravar(uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_votacao_lideranca_mudar(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_votacao_lideranca_votar(uuid,jsonb,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'O app perdeu o acesso à votação.';
  END IF;
END $$;

COMMIT;
