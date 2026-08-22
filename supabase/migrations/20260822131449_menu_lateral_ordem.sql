-- ============================================================================
-- Ordem das abas do menu lateral, por empresa
-- ============================================================================
--
-- ## O problema
--
-- A ordem do menu era a ordem literal do array `NAV_ITEMS` em `Layout.tsx`.
-- Mudar a posicao de uma aba exigia deploy, e as duas operacoes usam o mesmo
-- codigo com prioridades diferentes: o que a BookPlay quer no topo nao e o que
-- a PaguePlay quer.
--
-- ## O desenho
--
-- Uma linha por empresa, guardando SO a ordem: um array de rotas na sequencia
-- desejada. Nao guarda rotulo, icone, permissao nem quais abas existem — isso
-- continua no codigo, que e a fonte da verdade sobre o que o menu PODE ter.
-- Aqui fica apenas em que ordem mostrar.
--
-- Guardar a rota, e nao um indice, e o que faz a tabela envelhecer bem: aba
-- nova nao quebra a ordem salva (cai no fim, ver o resolvedor no frontend), e
-- aba removida do codigo vira uma entrada orfa que o frontend ignora.
--
-- ## Quem pode o que
--
--   * ler ...... qualquer pessoa autenticada da empresa. Precisa: o menu e
--                montado no primeiro render, para todo mundo.
--   * escrever . somente super_admin, via `fn_user_is_super_admin()`.
--
-- Sem realtime de proposito. A ordem muda de vez em quando e vale a partir do
-- proximo carregamento — foi o pedido. Assinar a tabela custaria um canal
-- aberto em toda sessao para um evento que quase nunca acontece.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.menu_lateral_ordem (
  empresa_id    UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Rotas (`to` do NAV_ITEMS) na ordem desejada.
  ordem         TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.menu_lateral_ordem IS
  'Ordem das abas do menu lateral por empresa. Guarda rotas, nao indices: aba nova cai no fim e aba removida vira entrada orfa ignorada pelo frontend.';

ALTER TABLE public.menu_lateral_ordem ENABLE ROW LEVEL SECURITY;

-- Leitura: a empresa inteira. O menu precisa dela no primeiro render.
DROP POLICY IF EXISTS menu_lateral_ordem_select ON public.menu_lateral_ordem;
CREATE POLICY menu_lateral_ordem_select ON public.menu_lateral_ordem FOR SELECT TO authenticated
USING (public.fn_can_access_empresa(empresa_id));

-- Escrita: so super_admin. INSERT e UPDATE separados porque o painel usa
-- upsert, e um WITH CHECK sem USING deixaria o UPDATE passar sem dono.
DROP POLICY IF EXISTS menu_lateral_ordem_insert ON public.menu_lateral_ordem;
CREATE POLICY menu_lateral_ordem_insert ON public.menu_lateral_ordem FOR INSERT TO authenticated
WITH CHECK (public.fn_user_is_super_admin() AND public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS menu_lateral_ordem_update ON public.menu_lateral_ordem;
CREATE POLICY menu_lateral_ordem_update ON public.menu_lateral_ordem FOR UPDATE TO authenticated
USING (public.fn_user_is_super_admin() AND public.fn_can_access_empresa(empresa_id))
WITH CHECK (public.fn_user_is_super_admin() AND public.fn_can_access_empresa(empresa_id));

-- Sem DELETE: apagar a linha e o mesmo que "ordem padrao", e para isso o painel
-- grava um array vazio. Uma politica a menos e uma porta a menos.

-- O config.toml mantem a exposicao automatica desligada; sem estes GRANTs a
-- tabela existe mas o frontend recebe 401. Ver MIGRATIONS.md, "Exposicao pela
-- Data API".
GRANT SELECT ON TABLE public.menu_lateral_ordem TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.menu_lateral_ordem TO authenticated;
REVOKE ALL ON TABLE public.menu_lateral_ordem FROM anon;

COMMIT;
