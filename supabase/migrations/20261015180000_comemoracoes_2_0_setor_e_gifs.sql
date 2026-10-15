-- ============================================================================
-- Comemorações 2.0: músicas por setor e GIFs compartilhados entre as empresas
-- ============================================================================
--
-- ## Por que
--
-- Pedido do Cleber, 15/10/2026, testando a 2.0:
--
--   • "Música também é separada por setor. Nada se mistura." A biblioteca de
--     músicas enviadas era uma só por empresa: o líder do setor A via e usava
--     a música que o líder do setor B enviou.
--   • "Os GIFs não precisam ser por setor, pode ser no geral." GIF do GIPHY é
--     público e não expõe nada da empresa; buscar de novo o que o colega já
--     achou só gasta a cota do GIPHY.
--
-- ## O que muda
--
-- 1. `comemoracao_midias.setor_id` — o setor de quem enviou, preenchido pelo
--    trigger no INSERT (a aba 1.0 continua enviando sem saber da coluna).
--    As músicas que já existem recebem o setor de quem as enviou.
--
--    A RLS de leitura NÃO muda, de propósito: a sobreposição resolve a música
--    de qualquer festa que aparece na tela, e a festa de meta de SETOR aparece
--    para a empresa inteira. Ler pelo setor deixaria essa festa muda em todos
--    os outros setores. Quem separa a biblioteca é o estúdio, ao listar.
--
-- 2. `comemoracao_gif_buscas` — a leitura deixa de ser por empresa: quem pode
--    criar comemoração, em qualquer empresa, vê as buscas salvas. Gravar e
--    atualizar continuam na própria empresa.
--
-- 3. `comemoracao_gifs_usados` — os GIFs que entraram numa comemoração de
--    verdade, de todas as empresas, para o estúdio mostrar "Usados
--    recentemente" sem buscar. Uma linha por GIF; a escrita é só pela RPC
--    `fn_comemoracao_gif_usado`, que confere quem chama e só aceita GIF do
--    GIPHY (o mesmo filtro de `urlDeGifConfiavel` no app).
--
-- Reaplicável. A única escrita em linha existente é o preenchimento de
-- `setor_id` nas músicas (no máximo 30 por empresa, pelo teto da biblioteca).

BEGIN;

-- ── 1. Músicas por setor ─────────────────────────────────────────────────────

ALTER TABLE public.comemoracao_midias
  ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.setores(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.comemoracao_midias.setor_id IS
  'Setor de quem enviou (trigger no INSERT). O estúdio 2.0 mostra a líder/elite só as do próprio setor. NULL = quem enviou não tem setor.';

CREATE INDEX IF NOT EXISTS comemoracao_midias_setor_idx
  ON public.comemoracao_midias (setor_id);

CREATE OR REPLACE FUNCTION public.fn_comemoracao_midia_setor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.setor_id IS NULL AND NEW.criado_por IS NOT NULL THEN
    SELECT p.setor_id INTO NEW.setor_id FROM public.perfis p WHERE p.id = NEW.criado_por;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_comemoracao_midia_setor() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.fn_comemoracao_midia_setor() TO service_role;

DROP TRIGGER IF EXISTS trg_comemoracao_midia_setor ON public.comemoracao_midias;
CREATE TRIGGER trg_comemoracao_midia_setor
  BEFORE INSERT ON public.comemoracao_midias
  FOR EACH ROW EXECUTE FUNCTION public.fn_comemoracao_midia_setor();

-- O que já está na biblioteca vai para o setor de quem enviou.
UPDATE public.comemoracao_midias m
   SET setor_id = p.setor_id
  FROM public.perfis p
 WHERE p.id = m.criado_por
   AND m.setor_id IS NULL
   AND p.setor_id IS NOT NULL;

-- ── 2. Buscas de GIF: leitura entre empresas ─────────────────────────────────

DROP POLICY IF EXISTS comemoracao_gif_buscas_select ON public.comemoracao_gif_buscas;
CREATE POLICY comemoracao_gif_buscas_select ON public.comemoracao_gif_buscas
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_is_super_admin())
    OR (SELECT public.fn_comemoracao_pode_criar())
  );

-- Ler uma busca pelo termo, de qualquer empresa, a mais nova primeiro.
CREATE INDEX IF NOT EXISTS comemoracao_gif_buscas_termo_idx
  ON public.comemoracao_gif_buscas (termo, atualizado_em DESC);

CREATE INDEX IF NOT EXISTS comemoracao_gif_buscas_atualizado_idx
  ON public.comemoracao_gif_buscas (atualizado_em DESC);

-- ── 3. GIFs usados ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comemoracao_gifs_usados (
  gif_id   text        PRIMARY KEY CHECK (char_length(gif_id) BETWEEN 1 AND 64),
  gif      jsonb       NOT NULL
                       CHECK (jsonb_typeof(gif) = 'object' AND pg_column_size(gif) <= 4096),
  usos     integer     NOT NULL DEFAULT 1 CHECK (usos > 0),
  usado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.comemoracao_gifs_usados IS
  'GIFs (GIPHY) que entraram em comemorações, de todas as empresas. Escrita só por fn_comemoracao_gif_usado.';

CREATE INDEX IF NOT EXISTS comemoracao_gifs_usados_recentes_idx
  ON public.comemoracao_gifs_usados (usado_em DESC);

ALTER TABLE public.comemoracao_gifs_usados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comemoracao_gifs_usados_select ON public.comemoracao_gifs_usados;
CREATE POLICY comemoracao_gifs_usados_select ON public.comemoracao_gifs_usados
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_is_super_admin())
    OR (SELECT public.fn_comemoracao_pode_criar())
  );

REVOKE ALL ON public.comemoracao_gifs_usados FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.comemoracao_gifs_usados TO authenticated;
GRANT ALL ON public.comemoracao_gifs_usados TO service_role;

CREATE OR REPLACE FUNCTION public.fn_comemoracao_gif_usado(p_gif jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id text := left(coalesce(p_gif->>'id', ''), 64);
BEGIN
  IF NOT (public.fn_user_is_super_admin() OR public.fn_comemoracao_pode_criar()) THEN
    RAISE EXCEPTION 'Sem permissão para registrar GIF.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_gif) IS DISTINCT FROM 'object'
     OR v_id = ''
     OR pg_column_size(p_gif) > 4096
     OR coalesce(p_gif->>'url', '') !~ '^https://([a-z0-9-]+\.)*giphy\.com/'
  THEN
    RAISE EXCEPTION 'GIF inválido.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.comemoracao_gifs_usados AS u (gif_id, gif)
  VALUES (v_id, p_gif)
  ON CONFLICT (gif_id) DO UPDATE
     SET gif = EXCLUDED.gif, usos = u.usos + 1, usado_em = now();

  -- A lista é de "recentes": o que ninguém usa há meio ano sai.
  DELETE FROM public.comemoracao_gifs_usados
   WHERE usado_em < now() - interval '180 days';
END;
$$;

REVOKE ALL ON FUNCTION public.fn_comemoracao_gif_usado(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_comemoracao_gif_usado(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_comemoracao_gif_usado(jsonb) TO service_role;

COMMIT;
