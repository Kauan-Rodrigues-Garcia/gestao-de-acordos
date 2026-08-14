-- ============================================================================
-- 20260731e — Comemoração de meta (fase 1)
-- ============================================================================
--
-- O líder monta uma comemoração para quem bateu a meta e dispara; ela explode
-- no topo-centro da tela de quem for do escopo, com texto, efeito visual, som e
-- duração. Estilo alerta de live.
--
-- Design completo em `docs/superpowers/specs/2026-07-31-comemoracao-de-meta-design.md`.
--
-- ── Por que TABELA e não broadcast ──────────────────────────────────────────
-- Broadcast seria mais simples e instantâneo, mas quebra em três pontos: o
-- navegador de quem dispara teria que estar aberto na hora agendada, quem entra
-- no meio não vê nada, e **broadcast não passa por RLS** — o filtro por setor
-- viraria maquiagem no cliente, com a comemoração viajando para todo mundo.
-- Como linha de tabela, o escopo é decidido pelo banco.
--
-- ── Fase 1 ──────────────────────────────────────────────────────────────────
-- Efeito visual e som vêm de um catálogo em CÓDIGO (`catalogo.ts`), por isso as
-- colunas `efeito`/`som` são TEXT com o id do catálogo. A fase 2 acrescenta
-- `comemoracao_midias` para o que o líder enviar, sem mexer nestas.
--
-- Idempotente.
-- ============================================================================

-- ── 1. Tabelas ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comemoracoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  criado_por    UUID REFERENCES public.perfis(id) ON DELETE SET NULL,

  titulo        TEXT NOT NULL CHECK (length(btrim(titulo)) > 0),
  mensagem      TEXT,

  -- Ids do catálogo em código (ver `src/pages/Comemoracoes/catalogo.ts`).
  efeito        TEXT NOT NULL DEFAULT 'confete',
  som           TEXT NOT NULL DEFAULT 'fanfarra',

  -- Posição de cada elemento, em % do card. Vazio = layout padrão (fase 1).
  layout        JSONB NOT NULL DEFAULT '{}'::JSONB,

  inicia_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Abaixo de 5 s ninguém lê o nome; acima de 60 s vira estorvo na tela.
  duracao_s     INT NOT NULL DEFAULT 20 CHECK (duracao_s BETWEEN 5 AND 60),

  -- Congelado por trigger a partir dos homenageados. Congelar (em vez de
  -- calcular na hora de exibir) evita que operador que muda de setor entre o
  -- agendamento e a hora troque a plateia no meio do caminho.
  setores_alvo  UUID[] NOT NULL DEFAULT '{}',

  cancelada_em  TIMESTAMPTZ,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.comemoracoes IS
  'Comemoração de meta: explode na tela de quem é do setor dos homenageados.';

CREATE TABLE IF NOT EXISTS public.comemoracao_homenageados (
  comemoracao_id UUID NOT NULL REFERENCES public.comemoracoes(id) ON DELETE CASCADE,
  operador_id    UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  PRIMARY KEY (comemoracao_id, operador_id)
);

CREATE TABLE IF NOT EXISTS public.comemoracao_parabens (
  comemoracao_id UUID NOT NULL REFERENCES public.comemoracoes(id) ON DELETE CASCADE,
  usuario_id     UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  frase          TEXT NOT NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Um parabéns por pessoa, garantido pelo banco. Sem isto o botão vira
  -- metralhadora e a tela enche de balões da mesma pessoa.
  PRIMARY KEY (comemoracao_id, usuario_id)
);

-- Busca da janela: "o que está rolando agora ou começa em breve".
CREATE INDEX IF NOT EXISTS idx_comemoracoes_janela
  ON public.comemoracoes (empresa_id, inicia_em)
  WHERE cancelada_em IS NULL;

-- ── 2. Setores alvo (com clones) ────────────────────────────────────────────
--
-- O operador pertence ao setor do perfil dele E aos setores das equipes em que
-- foi CLONADO. Clone é por equipe (`equipe_operadores_clones`), e a equipe é
-- que pertence a um setor — por isso o join.
--
-- A flag `conta_recebimento` do clone é IGNORADA aqui de propósito: ela decide
-- se o dinheiro soma para aquela equipe, não quem trabalha com quem. Clone
-- desligado para recebimento continua sendo gente que comemora junto.

CREATE OR REPLACE FUNCTION public.fn_setores_do_operador(p_operador UUID)
RETURNS SETOF UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.setor_id
    FROM public.perfis p
   WHERE p.id = p_operador AND p.setor_id IS NOT NULL
  UNION
  SELECT e.setor_id
    FROM public.equipe_operadores_clones c
    JOIN public.equipes e ON e.id = c.equipe_id
   WHERE c.operador_id = p_operador AND e.setor_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.fn_setores_do_operador(UUID) IS
  'Setores em que o operador aparece: o do perfil mais os das equipes em que '
  'foi clonado.';

-- Recalcula `setores_alvo` quando a lista de homenageados muda.
CREATE OR REPLACE FUNCTION public.fn_comemoracao_setores_alvo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comemoracao UUID := COALESCE(NEW.comemoracao_id, OLD.comemoracao_id);
BEGIN
  UPDATE public.comemoracoes c
     SET setores_alvo = COALESCE((
           SELECT ARRAY(
             SELECT DISTINCT s
               FROM public.comemoracao_homenageados h
               CROSS JOIN LATERAL public.fn_setores_do_operador(h.operador_id) AS s
              WHERE h.comemoracao_id = v_comemoracao
           )
         ), '{}')
   WHERE c.id = v_comemoracao;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comemoracao_setores_alvo ON public.comemoracao_homenageados;

CREATE TRIGGER trg_comemoracao_setores_alvo
  AFTER INSERT OR DELETE ON public.comemoracao_homenageados
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_comemoracao_setores_alvo();

-- ── 3. Quem cria ────────────────────────────────────────────────────────────
-- Espelha `PERFIS_VISAO_GERAL_WPP` no front. Um teste lê esta migration e
-- compara com a constante — divergir quebra a suíte, que é o que evita repetir
-- as permissões mortas do Admin → Cargos.

CREATE OR REPLACE FUNCTION public.fn_comemoracao_pode_criar()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_user_has_any_role(
    ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
  );
$$;

-- ── 4. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.comemoracoes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comemoracao_homenageados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comemoracao_parabens     ENABLE ROW LEVEL SECURITY;

-- Ver: quem é do setor alvo, quem criou, e líder+ (que acompanha a agenda dos
-- outros na aba). O popup só EXPLODE para o setor alvo — quem decide isso é a
-- tela, e pode, porque líder+ tem direito de leitura de qualquer forma.
DROP POLICY IF EXISTS "comemoracoes_select" ON public.comemoracoes;
CREATE POLICY "comemoracoes_select" ON public.comemoracoes
  FOR SELECT USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (
      criado_por = (SELECT auth.uid())
      OR (SELECT public.fn_comemoracao_pode_criar())
      OR (SELECT p.setor_id FROM public.perfis p WHERE p.id = (SELECT auth.uid())) = ANY (setores_alvo)
    )
  );

DROP POLICY IF EXISTS "comemoracoes_insert" ON public.comemoracoes;
CREATE POLICY "comemoracoes_insert" ON public.comemoracoes
  FOR INSERT WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND criado_por = (SELECT auth.uid())
    AND (SELECT public.fn_comemoracao_pode_criar())
  );

-- Editar/cancelar: só quem criou, ou administração.
DROP POLICY IF EXISTS "comemoracoes_update" ON public.comemoracoes;
CREATE POLICY "comemoracoes_update" ON public.comemoracoes
  FOR UPDATE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (
      criado_por = (SELECT auth.uid())
      OR (SELECT public.fn_user_has_any_role(ARRAY['diretoria','administrador','super_admin']))
    )
  );

DROP POLICY IF EXISTS "comemoracoes_delete" ON public.comemoracoes;
CREATE POLICY "comemoracoes_delete" ON public.comemoracoes
  FOR DELETE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (
      criado_por = (SELECT auth.uid())
      OR (SELECT public.fn_user_has_any_role(ARRAY['diretoria','administrador','super_admin']))
    )
  );

-- Homenageados: leitura acompanha a comemoração; escrita, quem pode criar.
DROP POLICY IF EXISTS "comemoracao_homenageados_select" ON public.comemoracao_homenageados;
CREATE POLICY "comemoracao_homenageados_select" ON public.comemoracao_homenageados
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.comemoracoes c WHERE c.id = comemoracao_id)
  );

DROP POLICY IF EXISTS "comemoracao_homenageados_insert" ON public.comemoracao_homenageados;
CREATE POLICY "comemoracao_homenageados_insert" ON public.comemoracao_homenageados
  FOR INSERT WITH CHECK (
    (SELECT public.fn_comemoracao_pode_criar())
    AND EXISTS (
      SELECT 1 FROM public.comemoracoes c
       WHERE c.id = comemoracao_id AND c.criado_por = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "comemoracao_homenageados_delete" ON public.comemoracao_homenageados;
CREATE POLICY "comemoracao_homenageados_delete" ON public.comemoracao_homenageados
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.comemoracoes c
       WHERE c.id = comemoracao_id AND c.criado_por = (SELECT auth.uid())
    )
  );

-- Parabéns: vê quem vê a comemoração; escreve só no próprio nome.
DROP POLICY IF EXISTS "comemoracao_parabens_select" ON public.comemoracao_parabens;
CREATE POLICY "comemoracao_parabens_select" ON public.comemoracao_parabens
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.comemoracoes c WHERE c.id = comemoracao_id)
  );

DROP POLICY IF EXISTS "comemoracao_parabens_insert" ON public.comemoracao_parabens;
CREATE POLICY "comemoracao_parabens_insert" ON public.comemoracao_parabens
  FOR INSERT WITH CHECK (
    usuario_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.comemoracoes c WHERE c.id = comemoracao_id)
  );

-- Sem UPDATE nem DELETE em parabéns: parabéns dado não se retira.

-- ── 5. Realtime ─────────────────────────────────────────────────────────────
-- REPLICA IDENTITY FULL para o filtro por `empresa_id` valer em qualquer
-- evento — sem ela o payload de DELETE traz só a PK e o filtro nunca casa.

ALTER TABLE public.comemoracoes         REPLICA IDENTITY FULL;
ALTER TABLE public.comemoracao_parabens REPLICA IDENTITY FULL;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['comemoracoes', 'comemoracao_parabens'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
