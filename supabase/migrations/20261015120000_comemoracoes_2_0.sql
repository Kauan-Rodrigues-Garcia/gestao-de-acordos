-- ============================================================================
-- Comemorações 2.0: o card com papel de parede e as buscas de GIF salvas
-- ============================================================================
--
-- ## Por que
--
-- A aba Comemorações foi refeita (pedido do Cleber, 15/10/2026). O card deixa
-- de ser texto solto sobre a tela e vira um cartão com papel de parede, letra,
-- entrada, efeito, selo, GIF do GIPHY e posição de cada elemento. Os GIFs da
-- empresa (upload) saem: a imagem vem da busca do GIPHY, e sem GIF aparece o
-- troféu desenhado no próprio app.
--
-- ## O que muda
--
-- 1. `comemoracoes.design JSONB` — tudo o que define a aparência do card 2.0.
--    NULL = comemoração da 1.0, que segue desenhada pelo card antigo. Quem
--    lê e saneia é `src/components/comemoracao2/design.ts`. O CHECK só barra
--    o que não é objeto ou passa de 8 KB (um design real tem ~1 KB).
--
-- 2. `comemoracao_gif_buscas` — cada busca de GIF que deu resultado fica
--    guardada por empresa e termo. A próxima pessoa que procurar o mesmo
--    termo vê na hora, sem gastar chamada do GIPHY, e o estúdio mostra as
--    buscas salvas como atalhos para a equipe navegar.
--
--    Quem lê e grava: quem pode criar comemoração (`fn_comemoracao_pode_criar`)
--    na própria empresa, ou o super_admin. Mesma régua das outras tabelas de
--    comemoração. Apagar fica só com o super_admin: a tabela é pequena (uma
--    linha por termo) e não precisa de faxina.
--
-- Nada aqui mexe em linha existente: as comemorações de hoje continuam com
-- `design` NULL e aparecem como sempre apareceram.
--
-- Reaplicável.

BEGIN;

-- ── 1. Design do card ────────────────────────────────────────────────────────

ALTER TABLE public.comemoracoes
  ADD COLUMN IF NOT EXISTS design jsonb;

ALTER TABLE public.comemoracoes
  DROP CONSTRAINT IF EXISTS comemoracoes_design_check;

ALTER TABLE public.comemoracoes
  ADD CONSTRAINT comemoracoes_design_check CHECK (
    design IS NULL
    OR (jsonb_typeof(design) = 'object' AND pg_column_size(design) <= 8192)
  );

COMMENT ON COLUMN public.comemoracoes.design IS
  'Card da Comemoração 2.0 (papel de parede, letra, GIF, posições). NULL = card da 1.0.';

-- ── 2. Buscas de GIF salvas ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comemoracao_gif_buscas (
  empresa_id    uuid        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  termo         text        NOT NULL CHECK (char_length(termo) BETWEEN 1 AND 60),
  resultados    jsonb       NOT NULL DEFAULT '[]'::jsonb
                            CHECK (jsonb_typeof(resultados) = 'array' AND pg_column_size(resultados) <= 65536),
  criado_por    uuid        REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, termo)
);

COMMENT ON TABLE public.comemoracao_gif_buscas IS
  'Buscas de GIF (GIPHY) da Comemoração 2.0, guardadas por empresa e termo para a equipe reaproveitar.';

-- "Buscas salvas" do estúdio: as mais recentes da empresa.
CREATE INDEX IF NOT EXISTS comemoracao_gif_buscas_recentes_idx
  ON public.comemoracao_gif_buscas (empresa_id, atualizado_em DESC);

-- FK para perfis: sem índice, apagar um perfil varreria a tabela.
CREATE INDEX IF NOT EXISTS comemoracao_gif_buscas_criado_por_idx
  ON public.comemoracao_gif_buscas (criado_por);

ALTER TABLE public.comemoracao_gif_buscas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comemoracao_gif_buscas_select ON public.comemoracao_gif_buscas;
CREATE POLICY comemoracao_gif_buscas_select ON public.comemoracao_gif_buscas
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_is_super_admin())
    OR (
      empresa_id = (SELECT public.fn_user_empresa_id())
      AND (SELECT public.fn_comemoracao_pode_criar())
    )
  );

DROP POLICY IF EXISTS comemoracao_gif_buscas_insert ON public.comemoracao_gif_buscas;
CREATE POLICY comemoracao_gif_buscas_insert ON public.comemoracao_gif_buscas
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.fn_user_is_super_admin())
    OR (
      empresa_id = (SELECT public.fn_user_empresa_id())
      AND criado_por = (SELECT auth.uid())
      AND (SELECT public.fn_comemoracao_pode_criar())
    )
  );

-- Refazer uma busca vencida atualiza a linha (upsert): quem refez vira o autor.
DROP POLICY IF EXISTS comemoracao_gif_buscas_update ON public.comemoracao_gif_buscas;
CREATE POLICY comemoracao_gif_buscas_update ON public.comemoracao_gif_buscas
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.fn_user_is_super_admin())
    OR (
      empresa_id = (SELECT public.fn_user_empresa_id())
      AND (SELECT public.fn_comemoracao_pode_criar())
    )
  )
  WITH CHECK (
    (SELECT public.fn_user_is_super_admin())
    OR (
      empresa_id = (SELECT public.fn_user_empresa_id())
      AND criado_por = (SELECT auth.uid())
      AND (SELECT public.fn_comemoracao_pode_criar())
    )
  );

DROP POLICY IF EXISTS comemoracao_gif_buscas_delete ON public.comemoracao_gif_buscas;
CREATE POLICY comemoracao_gif_buscas_delete ON public.comemoracao_gif_buscas
  FOR DELETE TO authenticated
  USING ((SELECT public.fn_user_is_super_admin()));

REVOKE ALL ON public.comemoracao_gif_buscas FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comemoracao_gif_buscas TO authenticated;
GRANT ALL ON public.comemoracao_gif_buscas TO service_role;

COMMIT;
