-- ============================================================================
-- 20260825200000_multiempresa_por_empresa.sql
--
-- Acesso multiempresa deixa de ser SIM/NAO e passa a ser UMA LISTA.
--
-- ## O problema, encontrado na auditoria de 25/08
--
-- `fn_can_access_empresa` dizia:
--
--     fn_user_is_super_admin() OR fn_user_acesso_multiempresa() OR target = minha
--
-- Repare no meio: `fn_user_acesso_multiempresa()` nao recebe empresa nenhuma.
-- E um booleano. Quem o tem, tem TODAS -- as que existem hoje e as que forem
-- criadas amanha.
--
-- Isso passou despercebido porque, quando a flag foi criada (20260818300000),
-- «todas» eram BookPlay e PaguePlay, e conceder uma era conceder a outra. Em
-- 25/08 entraram COMERCIAL e RH, e duas pessoas de diretoria -- Anderson
-- Ribeiro Marinho e Robson Roberto, liberadas em 20/08 -- ganharam acesso de
-- leitura a elas sem que ninguem decidisse isso. Nao vazou nada porque as
-- empresas novas estao vazias; vazaria no dia em que a primeira pessoa do
-- Comercial fosse cadastrada.
--
-- Ampliar o alcance de uma permissao por efeito colateral de uma empresa nova e
-- exatamente como as permissoes deste sistema viraram bagunca antes da reforma
-- de agosto.
--
-- ## O desenho novo
--
-- Uma tabela de concessoes: para CADA pessoa, QUAIS empresas. O super_admin
-- marca uma a uma na aba Multiempresa. Empresa criada amanha nasce sem
-- ninguem, e so entra na lista de quem for marcado.
--
-- As duas travas antigas continuam de pe, e nenhuma delas some:
--
--   * `acesso_multiempresa_permitido` -- o CARGO pode receber concessao. Quem
--     for rebaixado perde tudo na hora, sem depender de alguem revogar.
--   * `super_admin` -- atravessa por cargo, e nao por concessao. E a garantia
--     de que ninguem se tranca para fora editando o proprio painel.
--
-- A coluna `perfis.acesso_multiempresa` NAO morre: vira um resumo mantido por
-- gatilho («tem pelo menos uma concessao»). E o que faz o seletor de empresa, o
-- `perfilVeDuasEmpresas` do cliente e `fn_user_acesso_multiempresa` seguirem
-- funcionando sem uma linha de mudanca -- eles sempre perguntaram «esta pessoa
-- alterna entre empresas?», e essa pergunta continua tendo resposta.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── A tabela de concessoes ──────────────────────────────────────────────────
--
-- So as empresas EXTRAS. A propria empresa da pessoa nunca entra aqui: ela ja
-- vem de `perfis.empresa_id`, e duplica-la criaria dois lugares para revogar o
-- acesso de alguem a si mesmo -- um deles seria esquecido.

CREATE TABLE IF NOT EXISTS public.perfis_empresas_acesso (
  perfil_id     UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,

  concedido_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  concedido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (perfil_id, empresa_id)
);

COMMENT ON TABLE public.perfis_empresas_acesso IS
  'Quais empresas EXTRAS cada pessoa enxerga. A propria empresa vem de '
  'perfis.empresa_id e nao aparece aqui. Ver 20260825200000.';

-- A pergunta quente é «esta pessoa alcança esta empresa?», e a PK já responde.
-- Este índice serve a outra: «quem alcança esta empresa?», que a tela de
-- administração faz ao listar.
CREATE INDEX IF NOT EXISTS idx_perfis_empresas_acesso_empresa
  ON public.perfis_empresas_acesso (empresa_id);

-- ── Conversao do que ja existe ──────────────────────────────────────────────
--
-- Quem tem a flag hoje recebe concessao explicita para as outras empresas do
-- MESMO PRODUTO -- na pratica, a outra empresa de cobranca.
--
-- E deliberado nao dar Comercial nem RH: a flag foi concedida em 20/08, num
-- mundo de duas empresas, e quem a concedeu nao estava decidindo sobre elas.
-- Converter para «tudo» seria carimbar como intencional um acesso que a
-- auditoria identificou como acidental.

INSERT INTO public.perfis_empresas_acesso (perfil_id, empresa_id, concedido_por, concedido_em)
SELECT p.id, outra.id, p.acesso_multiempresa_por_id, COALESCE(p.acesso_multiempresa_em, NOW())
  FROM public.perfis p
  JOIN public.empresas minha ON minha.id = p.empresa_id
  JOIN public.empresas outra ON outra.produto = minha.produto AND outra.id <> minha.id
 WHERE p.acesso_multiempresa
ON CONFLICT DO NOTHING;

-- ── O resumo na coluna antiga ───────────────────────────────────────────────
--
-- `perfis.acesso_multiempresa` passa a ser DERIVADA: verdadeira quando existe
-- ao menos uma concessao. Mantida por gatilho e nao calculada na leitura porque
-- o cliente ja a le do perfil carregado no login, e transformar isso em
-- consulta faria toda tela pagar por uma informacao que quase ninguem usa.

CREATE OR REPLACE FUNCTION public.fn_multiempresa_sincronizar_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_perfil UUID := COALESCE(NEW.perfil_id, OLD.perfil_id);
  v_tem    BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.perfis_empresas_acesso a WHERE a.perfil_id = v_perfil
  ) INTO v_tem;

  UPDATE public.perfis
     SET acesso_multiempresa = v_tem,
         -- Sem concessao nenhuma, some tambem quem concedeu e quando: manter o
         -- carimbo de uma liberacao revogada faria a tela dizer que a pessoa
         -- «foi liberada em 20/08» enquanto ela nao alcança empresa nenhuma.
         acesso_multiempresa_por_id = CASE WHEN v_tem THEN acesso_multiempresa_por_id ELSE NULL END,
         acesso_multiempresa_em     = CASE WHEN v_tem THEN COALESCE(acesso_multiempresa_em, NOW()) ELSE NULL END
   WHERE id = v_perfil
     AND acesso_multiempresa IS DISTINCT FROM v_tem;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_multiempresa_sincronizar ON public.perfis_empresas_acesso;
CREATE TRIGGER trg_multiempresa_sincronizar
  AFTER INSERT OR DELETE ON public.perfis_empresas_acesso
  FOR EACH ROW EXECUTE FUNCTION public.fn_multiempresa_sincronizar_flag();

-- ── A porta ─────────────────────────────────────────────────────────────────
--
-- Esta funcao esta em toda policy do sistema. A forma da consulta continua a
-- mesma de antes -- um EXISTS por linha --, so que agora ele casa (pessoa,
-- empresa) pela chave primaria, em vez de perguntar so pela pessoa.

CREATE OR REPLACE FUNCTION public.fn_can_access_empresa(target_empresa_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    -- Chave-mestra, por cargo. Nunca dependeu de concessao.
    public.fn_user_is_super_admin()
    -- A propria empresa. Nao mora na tabela de concessoes de proposito.
    OR target_empresa_id = public.fn_user_empresa_id()
    -- E a concessao nominal, que agora sabe QUAL empresa. O cargo continua
    -- valendo por cima: quem for rebaixado perde o alcance no mesmo instante,
    -- sem que ninguem precise lembrar de apagar as linhas.
    OR (
      public.fn_user_tem('acesso_multiempresa_permitido')
      AND EXISTS (
        SELECT 1 FROM public.perfis_empresas_acesso a
         WHERE a.perfil_id = auth.uid()
           AND a.empresa_id = target_empresa_id
      )
    );
$fn$;

COMMENT ON FUNCTION public.fn_can_access_empresa(UUID) IS
  'A pessoa alcanca esta empresa? Propria empresa + concessoes nominais em '
  'perfis_empresas_acesso, com o cargo valendo por cima. Ver 20260825200000.';

/**
 * As empresas que a pessoa logada alcanca, para o seletor de empresa.
 *
 * Devolve ids, e nao nomes: quem monta a tela ja le `empresas` e precisa do id
 * para trocar. Super_admin recebe todas.
 */
CREATE OR REPLACE FUNCTION public.fn_user_empresas_liberadas()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT e.id
    FROM public.empresas e
   WHERE e.ativo
     AND public.fn_can_access_empresa(e.id);
$fn$;

-- ── RLS da tabela nova ──────────────────────────────────────────────────────
--
-- Leitura: a propria pessoa (para a tela saber o que oferecer no seletor) e o
-- super_admin. Escrita NAO tem policy: passa pelas RPCs abaixo, que sao
-- `SECURITY DEFINER` e conferem super_admin na primeira linha. Deixar a
-- concessao editavel por policy seria permitir que alguem ampliasse o proprio
-- alcance com um INSERT.

ALTER TABLE public.perfis_empresas_acesso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perfis_empresas_acesso_select ON public.perfis_empresas_acesso;
CREATE POLICY perfis_empresas_acesso_select ON public.perfis_empresas_acesso
  FOR SELECT TO authenticated
  USING (perfil_id = auth.uid() OR public.fn_user_is_super_admin());

-- ── As RPCs de administracao ────────────────────────────────────────────────

/**
 * Liga ou desliga UMA empresa para UMA pessoa.
 *
 * Revogar vale para qualquer cargo -- e assim que se limpa o alcance de quem
 * foi rebaixado. Conceder exige que o cargo possa receber, e o banco confere de
 * novo: a lista da tela pode estar velha na hora do clique.
 */
CREATE OR REPLACE FUNCTION public.fn_multiempresa_definir_empresa(
  p_usuario_id UUID,
  p_empresa_id UUID,
  p_liberado   BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_perfil       TEXT;
  v_nome         TEXT;
  v_empresa_dele UUID;
  v_empresa_nome TEXT;
  v_permitido    BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  IF NOT public.fn_user_is_super_admin() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;

  SELECT p.perfil, p.nome, p.empresa_id
    INTO v_perfil, v_nome, v_empresa_dele
    FROM public.perfis p WHERE p.id = p_usuario_id;

  IF v_perfil IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'usuario_nao_encontrado');
  END IF;

  IF v_perfil = 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'super_admin_ja_tem');
  END IF;

  SELECT e.nome INTO v_empresa_nome FROM public.empresas e WHERE e.id = p_empresa_id;
  IF v_empresa_nome IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_nao_encontrada');
  END IF;

  -- A propria empresa nao e concessao. Grava-la criaria um segundo lugar de
  -- onde revogar o acesso de alguem a si mesmo.
  IF p_empresa_id = v_empresa_dele THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_propria');
  END IF;

  IF p_liberado THEN
    -- O cargo precisa poder receber. Le a chave do painel do cargo ALVO, e nao
    -- a de quem esta concedendo.
    SELECT COALESCE((cp.permissoes ->> 'acesso_multiempresa_permitido')::BOOLEAN, false)
      INTO v_permitido
      FROM public.cargos_permissoes cp
     WHERE cp.empresa_id = v_empresa_dele AND cp.cargo = v_perfil;

    IF v_perfil IN ('administrador', 'super_admin') THEN
      v_permitido := true;  -- acesso total por construcao do resolvedor
    END IF;

    IF NOT COALESCE(v_permitido, false) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'cargo_nao_elegivel', 'perfil', v_perfil);
    END IF;

    INSERT INTO public.perfis_empresas_acesso (perfil_id, empresa_id, concedido_por)
    VALUES (p_usuario_id, p_empresa_id, auth.uid())
    ON CONFLICT (perfil_id, empresa_id) DO NOTHING;
  ELSE
    DELETE FROM public.perfis_empresas_acesso
     WHERE perfil_id = p_usuario_id AND empresa_id = p_empresa_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'liberado', p_liberado,
    'nome', v_nome, 'empresa', v_empresa_nome
  );
END;
$fn$;

/**
 * A funcao antiga, reimplementada sobre a tabela.
 *
 * Mantida porque outros caminhos podem chama-la, e porque revogar TUDO de uma
 * vez continua sendo uma operacao util. `p_liberado = true` concede as empresas
 * do mesmo produto -- que e exatamente o que ela significava antes de existir
 * mais de um produto.
 */
CREATE OR REPLACE FUNCTION public.fn_multiempresa_definir(
  p_usuario_id UUID,
  p_liberado   BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_nome  TEXT;
  v_res   JSONB;
  r       RECORD;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = p_usuario_id;
  IF v_nome IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'usuario_nao_encontrado');
  END IF;

  IF NOT p_liberado THEN
    DELETE FROM public.perfis_empresas_acesso WHERE perfil_id = p_usuario_id;
    RETURN jsonb_build_object('ok', true, 'liberado', false, 'nome', v_nome);
  END IF;

  FOR r IN
    SELECT outra.id
      FROM public.perfis p
      JOIN public.empresas minha ON minha.id = p.empresa_id
      JOIN public.empresas outra ON outra.produto = minha.produto AND outra.id <> minha.id
     WHERE p.id = p_usuario_id
  LOOP
    v_res := public.fn_multiempresa_definir_empresa(p_usuario_id, r.id, true);
    IF NOT (v_res ->> 'ok')::BOOLEAN THEN RETURN v_res; END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'liberado', true, 'nome', v_nome);
END;
$fn$;

/** A lista da aba Multiempresa, agora dizendo QUAIS empresas cada um alcanca. */
CREATE OR REPLACE FUNCTION public.fn_multiempresa_listar()
RETURNS TABLE(
  usuario_id uuid, nome text, email text, perfil text, foto_url text,
  empresa_nome text, e_super_admin boolean,
  concedido_por text, concedido_em timestamptz,
  empresas_liberadas jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT p.id, p.nome, p.email, p.perfil, p.foto_url,
         e.nome,
         p.perfil = 'super_admin',
         q.nome,
         p.acesso_multiempresa_em,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('id', ea.id, 'nome', ea.nome, 'slug', ea.slug)
                            ORDER BY ea.nome)
             FROM public.perfis_empresas_acesso a
             JOIN public.empresas ea ON ea.id = a.empresa_id
            WHERE a.perfil_id = p.id
         ), '[]'::jsonb)
    FROM public.perfis p
    LEFT JOIN public.empresas e ON e.id = p.empresa_id
    LEFT JOIN public.perfis   q ON q.id = p.acesso_multiempresa_por_id
   WHERE public.fn_user_is_super_admin()
     AND COALESCE(p.arquivado, false) = false
     AND (
       p.perfil = 'super_admin'
       OR EXISTS (SELECT 1 FROM public.perfis_empresas_acesso a WHERE a.perfil_id = p.id)
     )
   ORDER BY (p.perfil = 'super_admin') DESC, p.nome;
$fn$;

COMMIT;
