-- ============================================================================
-- Pesquisa de experiência: «Como tá sendo usar o Gestão de Acordos?»
-- ============================================================================
--
-- ## A regra (Cleber, 08/10/2026)
--
-- Card TEMPORÁRIO em Configurações → Geral. Nasce desligada; o super_admin
-- liga. Ligada, a pergunta aparece para todo mundo, uma vez por pessoa, no
-- canto da tela (modelo «Cafezinho»): Ruim · Tá ok · Tô curtindo. Não tem
-- «agora não» — é praticamente obrigatória, para a gerência e a diretoria
-- verem como está o uso do sistema.
--
--   - A nota vale no toque da carinha, e a pessoa pode trocar de carinha à
--     vontade até a janela fechar: cada troca reescreve a MESMA linha.
--   - O comentário é opcional e chega depois, em outra chamada.
--   - Respondeu, nunca mais aparece (a linha existe = respondeu).
--
-- ## As peças
--
--   pesquisa_experiencia_config      uma linha: ligada ou não, quem e quando.
--   pesquisa_experiencia_respostas   uma linha por pessoa. Guarda o retrato de
--                                    quem respondeu (nome, cargo, setor,
--                                    empresa) como era na hora: trocar a pessoa
--                                    de setor depois não muda a resposta dela.
--
-- Ninguém escreve nas tabelas direto: só pelas funções fn_pesquisa_experiencia_*.
-- Quem lê as respostas: a própria pessoa (a linha dela) e quem tem a chave
-- `config_sub_geral` — a mesma que abre a aba Geral onde o card mora.
--
-- Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── Liga e desliga ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pesquisa_experiencia_config (
  id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ligada              BOOLEAN     NOT NULL DEFAULT FALSE,
  ligada_em           TIMESTAMPTZ,
  ligada_por          UUID,
  ligada_por_nome     TEXT,
  desligada_em        TIMESTAMPTZ,
  desligada_por_nome  TEXT
);

COMMENT ON TABLE public.pesquisa_experiencia_config IS
  'Pesquisa de experiência: uma linha. Nasce desligada. Escrita só por '
  'fn_pesquisa_experiencia_ligar. Ver 20261008150000.';

INSERT INTO public.pesquisa_experiencia_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pesquisa_experiencia_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pesquisa_experiencia_config_leitura ON public.pesquisa_experiencia_config;
CREATE POLICY pesquisa_experiencia_config_leitura ON public.pesquisa_experiencia_config
  FOR SELECT TO authenticated USING (TRUE);

GRANT SELECT ON public.pesquisa_experiencia_config TO authenticated;
GRANT ALL    ON public.pesquisa_experiencia_config TO service_role;

-- ── As respostas ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pesquisa_experiencia_respostas (
  usuario_id     UUID PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  -- O retrato de quem respondeu, como era na hora.
  nome           TEXT,
  cargo          TEXT,
  empresa_id     UUID,
  empresa_nome   TEXT,
  setor_id       UUID,
  setor_nome     TEXT,
  nota           TEXT        NOT NULL CHECK (nota IN ('ruim', 'media', 'boa')),
  comentario     TEXT        CHECK (comentario IS NULL OR char_length(comentario) BETWEEN 1 AND 1000),
  respondida_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Última troca de carinha (igual a `respondida_em` se não trocou).
  nota_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  comentada_em   TIMESTAMPTZ
);

COMMENT ON TABLE public.pesquisa_experiencia_respostas IS
  'Pesquisa de experiência: uma linha por pessoa. Escrita só por '
  'fn_pesquisa_experiencia_votar/_comentar. Ver 20261008150000.';

CREATE INDEX IF NOT EXISTS pesquisa_experiencia_respostas_quando
  ON public.pesquisa_experiencia_respostas (respondida_em DESC);

ALTER TABLE public.pesquisa_experiencia_respostas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pesquisa_experiencia_respostas_leitura ON public.pesquisa_experiencia_respostas;
CREATE POLICY pesquisa_experiencia_respostas_leitura ON public.pesquisa_experiencia_respostas
  FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()) OR (SELECT public.fn_user_tem('config_sub_geral')));

GRANT SELECT ON public.pesquisa_experiencia_respostas TO authenticated;
GRANT ALL    ON public.pesquisa_experiencia_respostas TO service_role;

-- ── O que a tela de todo mundo chama ────────────────────────────────────────

-- Devo ver a pergunta? { ligada, respondeu }.
CREATE OR REPLACE FUNCTION public.fn_pesquisa_experiencia_estado()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'ligada', COALESCE((SELECT c.ligada FROM public.pesquisa_experiencia_config c WHERE c.id = 1), FALSE),
    'respondeu', EXISTS (
      SELECT 1 FROM public.pesquisa_experiencia_respostas r WHERE r.usuario_id = (SELECT auth.uid())
    )
  );
$function$;

-- O toque na carinha. Primeira vez grava o retrato; as trocas só mudam a nota.
CREATE OR REPLACE FUNCTION public.fn_pesquisa_experiencia_votar(p_nota text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sem sessão' USING ERRCODE = '42501';
  END IF;
  IF p_nota IS NULL OR p_nota NOT IN ('ruim', 'media', 'boa') THEN
    RAISE EXCEPTION 'nota inválida: %', p_nota USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE((SELECT c.ligada FROM public.pesquisa_experiencia_config c WHERE c.id = 1), FALSE) THEN
    RAISE EXCEPTION 'a pesquisa está desligada' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pesquisa_experiencia_respostas
         (usuario_id, nome, cargo, empresa_id, empresa_nome, setor_id, setor_nome, nota)
  SELECT p.id, p.nome, COALESCE(cg.nome, p.perfil::text), p.empresa_id, e.nome, p.setor_id, s.nome, p_nota
    FROM public.perfis p
    LEFT JOIN public.cargos   cg ON cg.slug = p.perfil::text
    LEFT JOIN public.empresas e  ON e.id = p.empresa_id
    LEFT JOIN public.setores  s  ON s.id = p.setor_id
   WHERE p.id = v_uid
  ON CONFLICT (usuario_id) DO UPDATE
     SET nota = EXCLUDED.nota, nota_em = now();
END;
$function$;

-- O comentário, depois da nota. Texto vazio apaga o comentário.
CREATE OR REPLACE FUNCTION public.fn_pesquisa_experiencia_comentar(p_texto text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid   uuid := (SELECT auth.uid());
  v_texto text := NULLIF(btrim(COALESCE(p_texto, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sem sessão' USING ERRCODE = '42501';
  END IF;
  UPDATE public.pesquisa_experiencia_respostas
     SET comentario   = left(v_texto, 1000),
         comentada_em = CASE WHEN v_texto IS NULL THEN NULL ELSE now() END
   WHERE usuario_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'escolha uma carinha antes de comentar' USING ERRCODE = '22023';
  END IF;
END;
$function$;

-- ── O que o card de Configurações chama ─────────────────────────────────────

-- Liga ou desliga. Só o super_admin.
CREATE OR REPLACE FUNCTION public.fn_pesquisa_experiencia_ligar(p_ligada boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_nome text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'só o super admin liga a pesquisa' USING ERRCODE = '42501';
  END IF;
  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = v_uid;

  IF p_ligada THEN
    UPDATE public.pesquisa_experiencia_config
       SET ligada = TRUE, ligada_em = now(), ligada_por = v_uid, ligada_por_nome = v_nome
     WHERE id = 1;
  ELSE
    UPDATE public.pesquisa_experiencia_config
       SET ligada = FALSE, desligada_em = now(), desligada_por_nome = v_nome
     WHERE id = 1;
  END IF;
END;
$function$;

-- Quantas pessoas podem responder: perfis ativos, sem o super_admin.
CREATE OR REPLACE FUNCTION public.fn_pesquisa_experiencia_publico()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('config_sub_geral')) THEN
    RAISE EXCEPTION 'sem acesso' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT count(*)::int FROM public.perfis p WHERE p.ativo AND p.perfil::text <> 'super_admin');
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pesquisa_experiencia_estado()        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pesquisa_experiencia_votar(text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pesquisa_experiencia_comentar(text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pesquisa_experiencia_ligar(boolean)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pesquisa_experiencia_publico()       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pesquisa_experiencia_estado()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pesquisa_experiencia_votar(text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pesquisa_experiencia_comentar(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pesquisa_experiencia_ligar(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pesquisa_experiencia_publico()      TO authenticated;

COMMIT;
