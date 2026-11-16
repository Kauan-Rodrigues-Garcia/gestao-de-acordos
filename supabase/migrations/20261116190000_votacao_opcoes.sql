-- ============================================================================
-- Votação de opções (ex.: «Sorteio de prêmios OU Happy hour no Ibis»)
-- 16/11/2026 · pedido do Kauan
-- ============================================================================
--
-- Uma pergunta, de 2 a 6 opções. Quem organiza (super_admin) escolhe QUEM VOTA
-- em Configurações › Eventos e gincanas (operadores, equipes, um setor ou
-- vários) e libera; a lista de quem vota fica CONGELADA ao liberar. Cada pessoa
-- vota UMA vez e o voto não muda depois de confirmado.
--
--   votacao_opcoes        a votação: título, pergunta, opções (jsonb), quem vota
--                         (eleitores), o recorte usado para montar a lista
--                         (publico, só registro) e o ciclo aberta → encerrada
--                         (ou cancelada), com quem e quando.
--   votacao_opcoes_votos  um voto por pessoa: a opção e o horário.
--
-- Quem vê o quê:
--   - quem vota: só as votações abertas para ele e o próprio voto;
--   - o super_admin: a contagem por opção e quem já votou / quem falta.
--     Em QUAL opção cada pessoa votou não sai por nenhuma função.
--
-- As tabelas não têm policy: leitura e escrita só pelas funções abaixo.
-- Nenhuma tabela existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── Tabelas ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.votacao_opcoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo         TEXT NOT NULL,
  pergunta       TEXT NOT NULL DEFAULT '',
  opcoes         JSONB NOT NULL,
  eleitores      UUID[] NOT NULL,
  publico        JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado         TEXT NOT NULL DEFAULT 'aberta',
  criada_por     UUID,
  criada_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  encerrada_por  UUID,
  encerrada_em   TIMESTAMPTZ,
  cancelada_por  UUID,
  cancelada_em   TIMESTAMPTZ,
  CONSTRAINT vo_estado   CHECK (estado IN ('aberta','encerrada','cancelada')),
  CONSTRAINT vo_titulo   CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 120),
  CONSTRAINT vo_pergunta CHECK (char_length(pergunta) <= 300),
  CONSTRAINT vo_opcoes   CHECK (jsonb_typeof(opcoes) = 'array' AND jsonb_array_length(opcoes) BETWEEN 2 AND 6),
  CONSTRAINT vo_eleitores CHECK (cardinality(eleitores) >= 1)
);

COMMENT ON TABLE public.votacao_opcoes IS
  'Votação entre opções (prêmios × happy hour…). Escrita só pelas fn_votacao_opcoes_*. Ver 20261116190000.';

CREATE INDEX IF NOT EXISTS idx_votacao_opcoes_criada ON public.votacao_opcoes (criada_em DESC);
CREATE INDEX IF NOT EXISTS idx_votacao_opcoes_eleitores ON public.votacao_opcoes USING gin (eleitores) WHERE estado = 'aberta';

CREATE TABLE IF NOT EXISTS public.votacao_opcoes_votos (
  votacao_id  UUID NOT NULL REFERENCES public.votacao_opcoes(id) ON DELETE CASCADE,
  eleitor_id  UUID NOT NULL,
  opcao_id    TEXT NOT NULL,
  votado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (votacao_id, eleitor_id)
);

COMMENT ON TABLE public.votacao_opcoes_votos IS
  'Um voto por pessoa por votação. Nenhuma função devolve a opção de cada pessoa a outra pessoa.';

ALTER TABLE public.votacao_opcoes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votacao_opcoes_votos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.votacao_opcoes, public.votacao_opcoes_votos FROM PUBLIC, anon, authenticated;

-- ── Ajudante: a votação como o app lê ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vo_montar(p_id UUID, p_eu UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'id', v.id, 'titulo', v.titulo, 'pergunta', v.pergunta, 'opcoes', v.opcoes,
    'estado', v.estado, 'criada_em', v.criada_em,
    'meu_voto', (SELECT x.opcao_id FROM public.votacao_opcoes_votos x WHERE x.votacao_id = v.id AND x.eleitor_id = p_eu),
    'votado_em', (SELECT x.votado_em FROM public.votacao_opcoes_votos x WHERE x.votacao_id = v.id AND x.eleitor_id = p_eu))
  FROM public.votacao_opcoes v WHERE v.id = p_id;
$$;

-- ── Organizar (super_admin) ────────────────────────────────────────────────

-- Cria e já abre. `p_opcoes`: [{id, titulo, ...}] — o resto (resumo, itens,
-- foto) é do app; aqui só se confere id e título.
CREATE OR REPLACE FUNCTION public.fn_votacao_opcoes_liberar(
  p_titulo TEXT, p_pergunta TEXT, p_opcoes JSONB, p_eleitores UUID[], p_publico JSONB DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id UUID;
  v_ids TEXT[];
  v_eleitores UUID[];
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin libera a votação' USING ERRCODE = '42501';
  END IF;
  IF p_opcoes IS NULL OR jsonb_typeof(p_opcoes) <> 'array' OR jsonb_array_length(p_opcoes) NOT BETWEEN 2 AND 6 THEN
    RAISE EXCEPTION 'A votação precisa de 2 a 6 opções.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_opcoes) o
             WHERE jsonb_typeof(o) <> 'object'
                OR btrim(COALESCE(o->>'id', '')) = ''
                OR btrim(COALESCE(o->>'titulo', '')) = '') THEN
    RAISE EXCEPTION 'Toda opção precisa de um título.' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(o->>'id') INTO v_ids FROM jsonb_array_elements(p_opcoes) o;
  IF (SELECT count(DISTINCT x) FROM unnest(v_ids) x) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Há opções repetidas.' USING ERRCODE = '22023';
  END IF;
  -- Só pessoas que existem e estão ativas; sem repetir.
  SELECT array_agg(DISTINCT p.id) INTO v_eleitores
  FROM public.perfis p WHERE p.id = ANY (COALESCE(p_eleitores, ARRAY[]::UUID[])) AND p.ativo;
  IF COALESCE(cardinality(v_eleitores), 0) = 0 THEN
    RAISE EXCEPTION 'Escolha quem vota.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.votacao_opcoes (titulo, pergunta, opcoes, eleitores, publico, criada_por)
  VALUES (btrim(p_titulo), COALESCE(btrim(p_pergunta), ''), p_opcoes, v_eleitores, COALESCE(p_publico, '{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- encerrar (aberta) · reabrir (encerrada) · cancelar (aberta ou encerrada).
CREATE OR REPLACE FUNCTION public.fn_votacao_opcoes_mudar(p_id UUID, p_acao TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_estado TEXT;
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin organiza a votação' USING ERRCODE = '42501';
  END IF;
  SELECT estado INTO v_estado FROM public.votacao_opcoes WHERE id = p_id FOR UPDATE;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Votação não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF p_acao = 'encerrar' THEN
    IF v_estado <> 'aberta' THEN RAISE EXCEPTION 'Só dá para encerrar uma votação aberta.' USING ERRCODE = '22023'; END IF;
    UPDATE public.votacao_opcoes SET estado = 'encerrada', encerrada_por = auth.uid(), encerrada_em = NOW() WHERE id = p_id;
  ELSIF p_acao = 'reabrir' THEN
    IF v_estado <> 'encerrada' THEN RAISE EXCEPTION 'Só dá para reabrir uma votação encerrada.' USING ERRCODE = '22023'; END IF;
    UPDATE public.votacao_opcoes SET estado = 'aberta', encerrada_por = NULL, encerrada_em = NULL WHERE id = p_id;
  ELSIF p_acao = 'cancelar' THEN
    IF v_estado = 'cancelada' THEN RAISE EXCEPTION 'A votação já está cancelada.' USING ERRCODE = '22023'; END IF;
    UPDATE public.votacao_opcoes SET estado = 'cancelada', cancelada_por = auth.uid(), cancelada_em = NOW() WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Ação desconhecida: %', p_acao USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Todas as votações, com a contagem por opção (super_admin).
CREATE OR REPLACE FUNCTION public.fn_votacao_opcoes_listar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin acompanha a votação' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', v.id, 'titulo', v.titulo, 'pergunta', v.pergunta, 'opcoes', v.opcoes, 'estado', v.estado,
      'publico', v.publico, 'eleitores', cardinality(v.eleitores),
      'votaram', (SELECT count(*) FROM public.votacao_opcoes_votos x WHERE x.votacao_id = v.id),
      'contagem', (SELECT COALESCE(jsonb_object_agg(c.opcao_id, c.n), '{}'::jsonb)
                   FROM (SELECT x.opcao_id, count(*) AS n FROM public.votacao_opcoes_votos x
                         WHERE x.votacao_id = v.id GROUP BY x.opcao_id) c),
      'criada_em', v.criada_em, 'encerrada_em', v.encerrada_em, 'cancelada_em', v.cancelada_em)
      ORDER BY v.criada_em DESC), '[]'::jsonb)
    FROM public.votacao_opcoes v
  );
END;
$$;

-- Quem já votou e quem falta, com o setor e o horário — sem a opção (super_admin).
CREATE OR REPLACE FUNCTION public.fn_votacao_opcoes_participacao(p_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin acompanha a votação' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', e.id, 'nome', COALESCE(p.nome, '—'), 'setor', s.nome, 'votado_em', x.votado_em)
      ORDER BY p.nome), '[]'::jsonb)
    FROM public.votacao_opcoes v
    CROSS JOIN LATERAL unnest(v.eleitores) AS e(id)
    LEFT JOIN public.perfis p ON p.id = e.id
    LEFT JOIN public.setores s ON s.id = p.setor_id
    LEFT JOIN public.votacao_opcoes_votos x ON x.votacao_id = v.id AND x.eleitor_id = e.id
    WHERE v.id = p_id
  );
END;
$$;

-- ── Quem vota ──────────────────────────────────────────────────────────────

-- As votações abertas em que eu voto, com o meu voto (nulo = ainda não votei).
CREATE OR REPLACE FUNCTION public.fn_votacao_opcoes_minhas()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(jsonb_agg(public.fn_vo_montar(v.id, (SELECT auth.uid())) ORDER BY v.criada_em), '[]'::jsonb)
  FROM public.votacao_opcoes v
  WHERE v.estado = 'aberta' AND (SELECT auth.uid()) = ANY (v.eleitores);
$$;

-- Um voto por pessoa; depois de confirmado não muda.
CREATE OR REPLACE FUNCTION public.fn_votacao_opcoes_votar(p_id UUID, p_opcao TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_eu UUID := auth.uid();
  v RECORD;
BEGIN
  SELECT * INTO v FROM public.votacao_opcoes WHERE id = p_id FOR SHARE;
  IF v.id IS NULL OR v.estado <> 'aberta' THEN
    RAISE EXCEPTION 'Esta votação não está aberta.' USING ERRCODE = '22023';
  END IF;
  IF v_eu IS NULL OR NOT (v_eu = ANY (v.eleitores)) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: você não participa desta votação' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.opcoes) o WHERE o->>'id' = p_opcao) THEN
    RAISE EXCEPTION 'Opção inválida.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.votacao_opcoes_votos (votacao_id, eleitor_id, opcao_id)
  VALUES (p_id, v_eu, p_opcao)
  ON CONFLICT (votacao_id, eleitor_id) DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Você já votou nesta votação.' USING ERRCODE = '23505';
  END IF;
END;
$$;

-- ── Permissões ─────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_vo_montar(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_votacao_opcoes_liberar(TEXT, TEXT, JSONB, UUID[], JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_opcoes_mudar(UUID, TEXT)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_opcoes_listar()                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_opcoes_participacao(UUID)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_opcoes_minhas()                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_votacao_opcoes_votar(UUID, TEXT)       FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_votacao_opcoes_liberar(TEXT, TEXT, JSONB, UUID[], JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_opcoes_mudar(UUID, TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_opcoes_listar()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_opcoes_participacao(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_opcoes_minhas()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_votacao_opcoes_votar(UUID, TEXT)       TO authenticated;

COMMIT;
