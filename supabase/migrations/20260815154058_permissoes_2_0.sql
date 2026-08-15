-- Permissões 2.0 — a tela passa a dizer a verdade.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O PROBLEMA
-- ═══════════════════════════════════════════════════════════════════════════
-- A tela de permissões lê `permissoes[chave]`: chave ausente no JSON renderiza
-- o toggle DESLIGADO. O `temPermissao` do frontend tinha um fallback
-- (PERMISSOES_LEGADAS_PADRAO_TRUE) que devolvia TRUE para 13 chaves quando
-- ausentes. Os dois lados discordavam em silêncio.
--
-- Medido em produção antes desta migration: 25 casos onde a tela mostrava
-- "desligado" e o sistema concedia. Entre eles, o OPERADOR da BookPlay com
-- `editar_usuarios` e `editar_equipes`.
--
-- Outros três estados inconsistentes:
--
--   1. Cada cargo tinha um conjunto DIFERENTE de chaves — de 16 (ouvidoria) a
--      29 (super_admin). Não havia contrato.
--   2. `administrador` nunca ganhou linha em `cargos_permissoes`. A 20260812b
--      criou a de super_admin e esqueceu a dele: 7 linhas por empresa, não 8.
--   3. Três chaves de ouvidoria existiam no banco sem nenhum código
--      consultando-as, e sem aparecer na tela.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A CORREÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
-- O catálogo passa a viver em `src/lib/permissoes-catalogo.ts`, com testes de
-- CI que impedem permissão decorativa de nascer. Esta migration faz o banco
-- obedecer esse catálogo:
--
--   • toda chave em todos os 8 cargos das 2 empresas;
--   • valor existente PRESERVADO; chave ausente vira FALSE (a tela vence —
--     decisão do usuário em 15/08/2026). Ninguém ganha acesso que não tinha;
--   • `administrador` ganha a linha que nunca teve;
--   • as duas chaves decorativas saem.
--
-- Cria também `perfis_permissoes`: exceção POR PESSOA sobre o cargo, em três
-- estados (chave ausente herda, presente força sim ou não).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. O catálogo, como o banco o enxerga
-- ═══════════════════════════════════════════════════════════════════════════
-- Espelha `src/lib/permissoes-catalogo.ts`. Os dois precisam mudar juntos; o
-- teste `permissoes-catalogo.test.ts` guarda o lado do código.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[])
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT * FROM (VALUES
    -- Abas e telas
    ('ver_acordos',                 ARRAY['bookplay']),
    ('ver_analitico',               NULL::TEXT[]),
    ('ver_painel_lider',            NULL::TEXT[]),
    ('ver_painel_diretoria',        NULL::TEXT[]),
    ('ver_ouvidoria',               ARRAY['pagueplay']),
    ('ver_campanha_facil',          ARRAY['bookplay']),
    ('ver_solicitacoes_whatsapp',   NULL::TEXT[]),
    ('ver_pix_automatico',          ARRAY['bookplay']),
    ('ver_lixeira',                 NULL::TEXT[]),
    ('ver_logs',                    NULL::TEXT[]),
    ('ver_configuracoes',           NULL::TEXT[]),
    -- Acordos
    ('ver_acordos_gerais',          NULL::TEXT[]),
    ('criar_acordos',               NULL::TEXT[]),
    ('editar_acordos',              NULL::TEXT[]),
    ('excluir_acordos',             NULL::TEXT[]),
    ('excluir_em_lote',             NULL::TEXT[]),
    -- Importações
    ('importar_excel',              NULL::TEXT[]),
    ('importar_analitico',          NULL::TEXT[]),
    ('importar_diario',             NULL::TEXT[]),
    -- Gestão de pessoas
    ('ver_usuarios',                NULL::TEXT[]),
    ('editar_usuarios',             NULL::TEXT[]),
    ('ver_equipes',                 NULL::TEXT[]),
    ('editar_equipes',              NULL::TEXT[]),
    ('ver_operadores',              NULL::TEXT[]),
    -- Metas
    ('ver_metas',                   NULL::TEXT[]),
    ('gerenciar_metas',             NULL::TEXT[]),
    -- Filtros e visão
    ('ver_todos_setores',           NULL::TEXT[]),
    ('ver_analiticos_global',       NULL::TEXT[]),
    ('filtrar_por_setor',           NULL::TEXT[]),
    ('filtrar_por_equipe',          NULL::TEXT[]),
    ('filtrar_por_usuario',         NULL::TEXT[]),
    -- Ações específicas
    ('editar_ouvidoria',            ARRAY['pagueplay']),
    ('gerenciar_acessos_ouvidoria', ARRAY['pagueplay']),
    ('criar_solicitacao_whatsapp',  NULL::TEXT[]),
    ('aprovar_pix_automatico',      ARRAY['bookplay'])
  ) AS t(chave, tenants);
$$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Espelho do catálogo de src/lib/permissoes-catalogo.ts. tenants NULL = vale nas duas operações. Mudou lá, mude aqui.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Exceção por pessoa
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.perfis_permissoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id     UUID NOT NULL REFERENCES public.perfis(id)  ON DELETE CASCADE,
  permissoes     JSONB NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID REFERENCES public.perfis(id),
  UNIQUE (empresa_id, usuario_id)
);

COMMENT ON TABLE public.perfis_permissoes IS
  'Exceções de permissão por pessoa, sobre o que o cargo dela já concede. Chave PRESENTE no JSON é exceção (true força sim, false força não); chave AUSENTE herda do cargo. Só admin e super_admin escrevem.';

CREATE INDEX IF NOT EXISTS idx_perfis_permissoes_empresa
  ON public.perfis_permissoes(empresa_id);

ALTER TABLE public.perfis_permissoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Leitura: a própria pessoa PRECISA ler a linha dela, senão o hook não
  -- resolve as permissões dela. Admin lê todas as da empresa.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='perfis_permissoes'
                    AND policyname='perfis_permissoes_select') THEN
    CREATE POLICY perfis_permissoes_select ON public.perfis_permissoes
      FOR SELECT USING (
        usuario_id = auth.uid()
        OR (
          public.fn_can_access_empresa(empresa_id)
          AND public.fn_user_has_any_role(ARRAY['administrador'])
        )
      );
  END IF;

  -- Escrita: só administrador, e só na empresa que ele pode acessar.
  -- `fn_can_access_empresa` em vez de comparar empresa_id na mão — foi essa a
  -- fresta que a 20260812b fechou em duas políticas de outras tabelas.
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='perfis_permissoes'
                    AND policyname='perfis_permissoes_admin_escreve') THEN
    CREATE POLICY perfis_permissoes_admin_escreve ON public.perfis_permissoes
      FOR ALL USING (
        public.fn_can_access_empresa(empresa_id)
        AND public.fn_user_has_any_role(ARRAY['administrador'])
      ) WITH CHECK (
        public.fn_can_access_empresa(empresa_id)
        AND public.fn_user_has_any_role(ARRAY['administrador'])
      );
  END IF;

  -- Super admin: mesma política FOR ALL que as outras 58 tabelas têm (20260812b).
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='perfis_permissoes'
                    AND policyname='perfis_permissoes_super_admin_total') THEN
    CREATE POLICY perfis_permissoes_super_admin_total ON public.perfis_permissoes
      FOR ALL USING (public.fn_user_is_super_admin())
      WITH CHECK (public.fn_user_is_super_admin());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Normalização: todo cargo com o catálogo inteiro
-- ═══════════════════════════════════════════════════════════════════════════
-- Preserva o valor existente; chave ausente vira FALSE.
--
-- É aqui que os 25 casos são alinhados. Nenhum cargo sai desta migration com
-- MAIS acesso do que a tela já mostrava — só com menos, onde a tela mostrava
-- desligado e o fallback concedia.

CREATE OR REPLACE FUNCTION public.fn_permissoes_semear_empresa(p_empresa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug    TEXT;
  v_cargo   TEXT;
  v_mapa    JSONB;
  v_atual   JSONB;
  r         RECORD;
  v_total   INTEGER := 0;
BEGIN
  SELECT slug INTO v_slug FROM public.empresas WHERE id = p_empresa_id;

  FOREACH v_cargo IN ARRAY ARRAY[
    'operador','ouvidoria','lider','elite','gerencia','diretoria',
    'administrador','super_admin'
  ] LOOP
    SELECT COALESCE(permissoes, '{}'::jsonb) INTO v_atual
      FROM public.cargos_permissoes
     WHERE empresa_id = p_empresa_id AND cargo = v_cargo;
    v_atual := COALESCE(v_atual, '{}'::jsonb);

    v_mapa := '{}'::jsonb;

    FOR r IN
      SELECT c.chave, c.tenants FROM public.fn_permissoes_catalogo() c
    LOOP
      -- Permissão de outra operação não entra: um toggle de Ouvidoria na
      -- BookPlay controlaria um módulo que não existe lá.
      CONTINUE WHEN r.tenants IS NOT NULL
                AND (v_slug IS NULL OR NOT (v_slug = ANY(r.tenants)));

      v_mapa := v_mapa || jsonb_build_object(
        r.chave,
        CASE
          -- Acesso total por construção (20260812b).
          WHEN v_cargo IN ('administrador','super_admin') THEN true
          -- Valor já gravado manda.
          WHEN v_atual ? r.chave THEN (v_atual -> r.chave)::boolean
          -- Ausente = NEGADO. A tela sempre mostrou desligado.
          ELSE false
        END
      );
    END LOOP;

    INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes)
    VALUES (p_empresa_id, v_cargo, v_mapa)
    ON CONFLICT (empresa_id, cargo) DO UPDATE SET permissoes = EXCLUDED.permissoes;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.fn_permissoes_semear_empresa(UUID) IS
  'Grava o catálogo inteiro nos 8 cargos da empresa, recortado pelo tenant. Preserva valor existente; chave ausente nasce false. Idempotente.';

REVOKE ALL ON FUNCTION public.fn_permissoes_semear_empresa(UUID) FROM PUBLIC, anon, authenticated;

-- Aplica nas empresas existentes.
DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id, slug FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
    RAISE NOTICE 'Permissões 2.0: empresa % normalizada.', e.slug;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Empresa nova nasce completa
-- ═══════════════════════════════════════════════════════════════════════════
-- Sem isto, a próxima empresa reabre exatamente o problema de chave ausente.

CREATE OR REPLACE FUNCTION public.fn_permissoes_semear_nova_empresa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_permissoes_semear_empresa(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_permissoes_nova_empresa ON public.empresas;
CREATE TRIGGER trg_permissoes_nova_empresa
  AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.fn_permissoes_semear_nova_empresa();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Auditoria
-- ═══════════════════════════════════════════════════════════════════════════
-- Mudar o que uma pessoa pode fazer é evento de segurança. `cargos_permissoes`
-- já é auditada com severidade crítica desde a 20260812a; a tabela nova entra
-- na mesma trigger genérica.

DROP TRIGGER IF EXISTS trg_log_perfis_permissoes ON public.perfis_permissoes;
CREATE TRIGGER trg_log_perfis_permissoes
  AFTER INSERT OR UPDATE OR DELETE ON public.perfis_permissoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
    'seguranca', 'permissoes_pessoa', 'as permissões da pessoa',
    '', '', 'empresa_id', 'critico'
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Conferência
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_cargos    INTEGER;
  v_faltando  INTEGER;
BEGIN
  SELECT count(*) INTO v_cargos FROM public.cargos_permissoes;

  SELECT count(*) INTO v_faltando
    FROM public.cargos_permissoes cp
    JOIN public.empresas e ON e.id = cp.empresa_id
    CROSS JOIN public.fn_permissoes_catalogo() c
   WHERE (c.tenants IS NULL OR e.slug = ANY(c.tenants))
     AND NOT (cp.permissoes ? c.chave);

  RAISE NOTICE 'Permissões 2.0: % linhas de cargo, % chaves faltando (esperado 0).',
    v_cargos, v_faltando;

  IF v_faltando > 0 THEN
    RAISE EXCEPTION 'Normalização incompleta: % chaves ausentes.', v_faltando;
  END IF;
END $$;
