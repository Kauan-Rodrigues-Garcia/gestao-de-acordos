-- ═══════════════════════════════════════════════════════════════════════════
-- SUPER ADMIN — acesso total às duas operações, por construção
-- ═══════════════════════════════════════════════════════════════════════════
-- Pedido de 12/08/2026: "todo login de super_admin que seja criado tem que ter
-- todas as permissões, ver as duas empresas e logar nos 2 links".
--
-- ── O que a auditoria do código mostrou ─────────────────────────────────────
-- NÃO existe, em nenhum lugar do repositório, uma lista dos dois super_admins
-- atuais: nenhum e-mail, nenhum UUID, nenhuma condição por usuário. O que
-- limitava a dois era simplesmente O DADO — só dois perfis têm
-- `perfil = 'super_admin'`. O cargo, em si, já é tratado como cruza-empresa:
--
--   • `fn_can_access_empresa()` devolve true para qualquer super_admin;
--   • `useAuth.fetchPerfil` não aplica a trava de tenant a super_admin, então
--     ele entra pelos dois links;
--   • `useEmpresa` resolve a empresa pelo SLUG DO SITE, não pela empresa do
--     perfil — um super_admin logado no link da BookPlay opera como BookPlay;
--   • `useCargoPermissoes.temPermissao` devolve true para super_admin sem nem
--     consultar o banco.
--
-- ── Então o que esta migration resolve ──────────────────────────────────────
-- Torna o acesso ESTRUTURAL em vez de incidental. Duas lacunas reais:
--
-- 1. O acesso depende de cada política se lembrar do super_admin. Há 231
--    políticas RLS no banco e a maioria filtra por empresa. As que chamam
--    `fn_can_access_empresa()` incluem o super_admin; as que escrevem
--    `empresa_id = fn_user_empresa_id()` na mão, NÃO — e nesse caso a tabela
--    simplesmente volta vazia na outra empresa, sem erro, sem aviso. É a pior
--    forma de falhar: parece que não há dados.
--
--    Conferido no banco em 12/08/2026: duas políticas estavam nessa situação —
--    `acordos_delete_own` (DELETE) e `perfis_lider_update` (UPDATE).
--
--    A correção não é reescrever 163 políticas (arriscado e sem fim, porque a
--    próxima política nova pode esquecer de novo). Políticas permissivas do
--    Postgres são combinadas com OR: basta UMA por tabela dizendo "super_admin
--    pode", e nenhuma das outras consegue mais bloquear.
--
-- 2. `cargos_permissoes` não tem linha para `super_admin` em empresa nenhuma.
--    Hoje funciona porque a tela abre exceção no código. Mas a resposta do
--    banco à pergunta "o que este cargo pode?" é um conjunto vazio, e qualquer
--    consulta, relatório ou código futuro que leia a tabela em vez da tela vai
--    concluir que o super_admin não pode nada.
--
-- ── O que isto significa, em voz alta ───────────────────────────────────────
-- Depois desta migration, criar um usuário com cargo super_admin dá a essa
-- pessoa leitura e escrita em TODOS os dados das DUAS empresas, sem exceção de
-- tabela. É exatamente o que foi pedido, e está registrado aqui para que
-- ninguém descubra por acidente depois.
--
-- Duas consequências que ficam de pé, para constar:
--   • Um super_admin marcado como desligado ou inativo continua com acesso
--     total — o código nunca bloqueia super_admin (ver `rejectDesligado` em
--     useAuth). Desligar essa pessoa exige TROCAR O CARGO dela, não só marcar
--     como desligada.
--   • Toda ação de super_admin fica na trilha de auditoria (migration
--     20260812a), com nome, empresa, IP e diff — inclusive as cruzadas de
--     empresa. É a contrapartida do poder amplo.
--
-- Idempotente.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. UMA POLÍTICA DE SUPER ADMIN POR TABELA
-- ═══════════════════════════════════════════════════════════════════════════
-- Percorre todas as tabelas de `public` com RLS ligada e cria/recria a política
-- `<tabela>_super_admin_total`. Como as políticas permissivas se somam por OR, a
-- partir daqui o super_admin passa em qualquer tabela — independentemente do que
-- as outras políticas digam, e independentemente de alguém lembrar do caso dele
-- ao escrever a próxima.
--
-- `TO authenticated` de propósito: `anon` não tem sessão, então nunca seria
-- super_admin, e deixar a política aberta a todos os papéis só ampliaria a
-- superfície sem ganho.
--
-- ── A exceção: logs_sistema ────────────────────────────────────────────────
-- A trilha de auditoria é append-only desde 20260812a — sem política de UPDATE
-- nem de DELETE, de propósito, para que nenhum evento possa ser editado ou
-- apagado individualmente. Uma política `FOR ALL` aqui contradiria isso na hora.
--
-- O super_admin já LÊ a trilha inteira das duas empresas pela política
-- `logs_sis_admin`, e já apaga por idade pela `fn_logs_expurgar`. Então ele não
-- perde nada — só continua sem poder reescrever a própria pegada, que é o
-- objetivo de existir uma trilha.
DO $$
DECLARE
  r         RECORD;
  v_nome    TEXT;
  v_criadas INT := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tabela
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname     = 'public'
       AND c.relkind     = 'r'      -- só tabelas comuns; views não têm RLS
       AND c.relrowsecurity          -- só onde RLS está ligada
       AND c.relname <> 'logs_sistema'
     ORDER BY c.relname
  LOOP
    v_nome := r.tabela || '_super_admin_total';

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_nome, r.tabela);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.fn_user_is_super_admin()) '
      'WITH CHECK (public.fn_user_is_super_admin())',
      v_nome, r.tabela
    );
    v_criadas := v_criadas + 1;
  END LOOP;

  RAISE NOTICE 'Super admin: política de acesso total criada em % tabela(s).', v_criadas;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. PRIVILÉGIOS DE TABELA
-- ═══════════════════════════════════════════════════════════════════════════
-- Política RLS não cria privilégio: ela só filtra linhas dentro do que o papel
-- JÁ pode fazer. Se o `authenticated` não tiver DELETE numa tabela, a política
-- de super_admin não devolve esse direito.
--
-- Isto importa por causa da migration de ontem, que fez
-- `REVOKE UPDATE, DELETE ON logs_sistema FROM authenticated` — e é justamente o
-- caso que queremos manter revogado. Nas outras tabelas, o `authenticated`
-- recebe os privilégios pelo padrão da Supabase; nada a fazer aqui.
--
-- Deixado como verificação explícita para quem for ler depois.
DO $$
DECLARE
  v_tem_update BOOLEAN;
BEGIN
  SELECT has_table_privilege('authenticated', 'public.logs_sistema', 'UPDATE')
    INTO v_tem_update;

  IF v_tem_update THEN
    RAISE NOTICE 'Atenção: authenticated voltou a ter UPDATE em logs_sistema — a trilha deveria ser append-only (ver 20260812a).';
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- Banco local sem o papel `authenticated` da Supabase: nada a conferir.
  NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. cargos_permissoes: a permissão do super_admin também no banco
-- ═══════════════════════════════════════════════════════════════════════════
-- Uma linha por empresa, com TODAS as chaves em `true`.
--
-- As chaves saem de duas fontes somadas: as que já existem em qualquer linha da
-- tabela (pega o que o produto usa hoje, inclusive chaves criadas depois desta
-- migration ter sido escrita) e a lista canônica da tela de Cargos (garante o
-- conjunto completo mesmo numa empresa recém-criada, que ainda não tem linha
-- nenhuma). Assim a migration não fica desatualizada sozinha.
CREATE OR REPLACE FUNCTION public.fn_super_admin_permissoes_completas()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH canonicas(k) AS (
    -- Espelha `PERMISSOES` de src/pages/AdminCargos.tsx.
    SELECT unnest(ARRAY[
      'ver_acordos_proprios', 'ver_acordos_gerais', 'criar_acordos',
      'editar_acordos', 'excluir_acordos', 'excluir_em_lote',
      'importar_excel', 'importar_analitico', 'importar_diario',
      'ver_painel_lider', 'ver_analiticos_setor', 'ver_analiticos_global',
      'ver_todos_setores', 'filtrar_por_setor', 'filtrar_por_equipe',
      'filtrar_por_usuario', 'ver_usuarios', 'editar_usuarios',
      'ver_equipes', 'editar_equipes', 'ver_metas', 'gerenciar_metas',
      'ver_operadores', 'ver_lixeira', 'ver_logs', 'ver_configuracoes'
    ])
  ),
  existentes(k) AS (
    SELECT DISTINCT j.k
      FROM public.cargos_permissoes cp,
           jsonb_object_keys(cp.permissoes) AS j(k)
  ),
  todas(k) AS (
    SELECT k FROM canonicas
    UNION
    SELECT k FROM existentes
  )
  SELECT COALESCE(jsonb_object_agg(k, true), '{}'::jsonb) FROM todas;
$$;

COMMENT ON FUNCTION public.fn_super_admin_permissoes_completas() IS
  'Todas as chaves de permissão conhecidas, com valor true. União da lista '
  'canônica da tela de Cargos com as chaves já presentes na tabela, para não '
  'ficar desatualizada quando uma permissão nova aparecer. Ver 20260812b.';

INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  e.id,
  'super_admin',
  public.fn_super_admin_permissoes_completas(),
  'Acesso total ao sistema, nas duas operações. Cargo de administração da '
  'plataforma — não é operador. Ver migration 20260812b.'
FROM public.empresas e
ON CONFLICT (empresa_id, cargo) DO UPDATE
  SET permissoes = public.fn_super_admin_permissoes_completas(),
      descricao  = EXCLUDED.descricao;

-- `administrador` está no mesmo caso: a tela abre exceção no código e a tabela
-- nunca teve linha para ele. Fica de fora de propósito — o pedido é sobre
-- super_admin, e administrador é limitado À PRÓPRIA EMPRESA. Mexer nele aqui
-- passaria a impressão de que o escopo dos dois é o mesmo, e não é.

-- ─── Empresa nova já nasce com a linha ──────────────────────────────────────
-- Sem isto, cadastrar uma terceira operação amanhã recriaria a lacuna: a
-- empresa nova viria sem linha de super_admin e a tabela voltaria a dizer que
-- ele não pode nada ali.
CREATE OR REPLACE FUNCTION public.fn_empresa_seed_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
  VALUES (
    NEW.id,
    'super_admin',
    public.fn_super_admin_permissoes_completas(),
    'Acesso total ao sistema, nas duas operações. Cargo de administração da '
    'plataforma — não é operador. Ver migration 20260812b.'
  )
  ON CONFLICT (empresa_id, cargo) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Criar empresa não pode falhar por causa do seed de permissão.
  RAISE WARNING 'fn_empresa_seed_super_admin falhou para % : %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_empresa_seed_super_admin ON public.empresas;
CREATE TRIGGER trg_empresa_seed_super_admin
  AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.fn_empresa_seed_super_admin();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════
-- Imprime o que ficou valendo: quantos super_admins existem, de qual empresa
-- cada um é, e quantas tabelas ganharam a política. Serve para confirmar na
-- hora de aplicar, sem precisar montar consulta.
DO $$
DECLARE
  r          RECORD;
  v_tabelas  INT;
  v_empresas INT;
BEGIN
  -- `right(...)` em vez de LIKE: o sufixo tem underscores, e em LIKE underscore
  -- é curinga — precisaria de escape, que é fácil de errar em silêncio.
  SELECT count(*) INTO v_tabelas
    FROM pg_policies
   WHERE schemaname = 'public'
     AND right(policyname, length('_super_admin_total')) = '_super_admin_total';

  SELECT count(*) INTO v_empresas FROM public.empresas;

  RAISE NOTICE '─── Super admin: acesso total aplicado ───';
  RAISE NOTICE 'Tabelas com política de super_admin: %', v_tabelas;
  RAISE NOTICE 'Empresas com linha de permissão super_admin: % de %',
    (SELECT count(*) FROM public.cargos_permissoes WHERE cargo = 'super_admin'), v_empresas;

  FOR r IN
    SELECT p.nome, p.usuario, p.ativo, p.situacao, e.nome AS empresa, e.slug
      FROM public.perfis p
      LEFT JOIN public.empresas e ON e.id = p.empresa_id
     WHERE p.perfil = 'super_admin'
     ORDER BY p.criado_em
  LOOP
    RAISE NOTICE 'super_admin: % (%) — empresa de origem: % [%] — ativo=% situacao=%',
      r.nome, r.usuario, COALESCE(r.empresa, 'sem empresa'), COALESCE(r.slug, '—'),
      r.ativo, COALESCE(r.situacao, '—');
  END LOOP;

  RAISE NOTICE 'Todos os super_admins acima passam a ver e escrever nas % empresa(s), pelos dois links.', v_empresas;
END $$;
