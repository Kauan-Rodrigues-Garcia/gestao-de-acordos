-- ═══════════════════════════════════════════════════════════════════════════
-- 20260730b — Solicitações de atendimento por WhatsApp (PaguePlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- Setores que atendem só por ligação precisam que alguém do digital mande uma
-- mensagem no WhatsApp do cliente. Hoje isso é pedido "no grito"; esta aba
-- transforma o pedido em registro com dono, status e histórico.
--
-- Quatro tabelas:
--   solicitacoes_whatsapp           — o pedido em si
--   solicitacoes_whatsapp_eventos   — histórico de status (escrito por trigger)
--   solicitacoes_whatsapp_mensagens — a conversa presa ao pedido
--   atendimento_responsaveis        — quem o líder marcou como responsável
--
-- ⚠️  A conversa é uma THREAD DO PEDIDO, não um chat livre: quem participa sai
--     do próprio pedido (solicitante + responsáveis + líder+). Não há lista de
--     contatos, descoberta de usuário nem bloqueio — nada disso é necessário
--     aqui, e é o que mantém o escopo (e a superfície de dado retido) pequeno.
--
-- Idempotente. Tabelas novas, nada destrutivo.

-- ─── 1. Responsáveis pelo atendimento ───────────────────────────────────────
-- Quem o líder escolhe para tocar os envios. Ganham visão geral e edição.

CREATE TABLE IF NOT EXISTS public.atendimento_responsaveis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id    UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  definido_por  UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_atend_resp_empresa
  ON public.atendimento_responsaveis (empresa_id);

-- ─── 2. Solicitações ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.solicitacoes_whatsapp (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  solicitante_id  UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  -- Setor/equipe congelados na abertura: o filtro do líder precisa continuar
  -- funcionando mesmo depois de o operador mudar de equipe.
  setor_id        UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  equipe_id       UUID REFERENCES public.equipes(id) ON DELETE SET NULL,

  -- Dados do cliente. `codigo_cliente` é o `instituicao` do acordo (o "Código"
  -- da PaguePlay). Nome/estado/whatsapp são copiados na abertura — cópia, não
  -- referência: o pedido tem que continuar legível se o acordo sumir.
  codigo_cliente  TEXT NOT NULL,
  nome_cliente    TEXT,
  estado_uf       TEXT,
  whatsapp        TEXT NOT NULL,

  categoria       TEXT NOT NULL
                    CHECK (categoria IN ('proposta','preventivo','quebra_acordo','outros')),
  mensagem        TEXT NOT NULL,

  -- falta_info = responsável devolveu pedindo dado que faltou.
  status          TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','em_andamento','feito','falta_info')),

  responsavel_id  UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  iniciado_em     TIMESTAMPTZ,
  finalizado_em   TIMESTAMPTZ,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Filtros da tela: empresa+status (listas), empresa+solicitante (visão do
-- operador), empresa+setor (recorte obrigatório de quem vê mais de um setor).
CREATE INDEX IF NOT EXISTS idx_sol_wpp_empresa_status
  ON public.solicitacoes_whatsapp (empresa_id, status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_sol_wpp_solicitante
  ON public.solicitacoes_whatsapp (empresa_id, solicitante_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_sol_wpp_setor
  ON public.solicitacoes_whatsapp (empresa_id, setor_id, criado_em DESC);

-- ─── 3. Histórico de status ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.solicitacoes_whatsapp_eventos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  solicitacao_id  UUID NOT NULL REFERENCES public.solicitacoes_whatsapp(id) ON DELETE CASCADE,
  status_anterior TEXT,
  status_novo     TEXT NOT NULL,
  autor_id        UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sol_wpp_eventos_solicitacao
  ON public.solicitacoes_whatsapp_eventos (solicitacao_id, criado_em);

-- ─── 4. Mensagens (thread do pedido) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.solicitacoes_whatsapp_mensagens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  solicitacao_id  UUID NOT NULL REFERENCES public.solicitacoes_whatsapp(id) ON DELETE CASCADE,
  autor_id        UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  conteudo        TEXT NOT NULL CHECK (length(trim(conteudo)) > 0),
  -- Confirmação de leitura. A thread é entre solicitante e responsável, então
  -- um único carimbo ("alguém que não é o autor leu") basta — sem tabela de
  -- recibos por destinatário.
  lida_em         TIMESTAMPTZ,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sol_wpp_msg_solicitacao
  ON public.solicitacoes_whatsapp_mensagens (solicitacao_id, criado_em);
-- Serve a contagem de não lidas do sino da aba.
CREATE INDEX IF NOT EXISTS idx_sol_wpp_msg_nao_lidas
  ON public.solicitacoes_whatsapp_mensagens (empresa_id, lida_em)
  WHERE lida_em IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Funções de apoio da RLS
-- ═══════════════════════════════════════════════════════════════════════════

-- Cargos com visão geral. Mesma lista usada nas policies abaixo e espelhada no
-- front (`PERFIS_VISAO_GERAL_WPP`) — mudar as duas juntas.
CREATE OR REPLACE FUNCTION public.fn_wpp_tem_visao_geral()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.fn_user_has_any_role(
    ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
  )
  OR EXISTS (
    SELECT 1 FROM public.atendimento_responsaveis r
    WHERE r.usuario_id = auth.uid()
  );
$$;

-- Só responsável (sem os cargos) — usado para permitir edição a quem não é líder.
CREATE OR REPLACE FUNCTION public.fn_wpp_eh_responsavel()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.atendimento_responsaveis r
    WHERE r.usuario_id = auth.uid()
  );
$$;

-- Acesso à thread/histórico de UM pedido. SECURITY DEFINER para conseguir ler a
-- solicitação-pai sem recursão de policy.
CREATE OR REPLACE FUNCTION public.fn_wpp_pode_ver_solicitacao(p_solicitacao_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.solicitacoes_whatsapp s
    WHERE s.id = p_solicitacao_id
      AND (s.solicitante_id = auth.uid() OR public.fn_wpp_tem_visao_geral())
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Triggers
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Limite de pendentes por operador ───────────────────────────────────────
-- Conta SÓ o status 'pendente' — os que ainda esperam alguém pegar. Se contasse
-- 'em_andamento' também, o operador ficaria bloqueado por causa da fila do
-- responsável, coisa que ele não controla.
--
-- Vive no banco de propósito: limite só no front é contornável pela API.
CREATE OR REPLACE FUNCTION public.fn_wpp_limite_pendentes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pendentes INT;
BEGIN
  SELECT COUNT(*) INTO v_pendentes
  FROM public.solicitacoes_whatsapp
  WHERE solicitante_id = NEW.solicitante_id
    AND status = 'pendente';

  IF v_pendentes >= 10 THEN
    RAISE EXCEPTION
      'LIMITE_PENDENTES: voce ja tem % solicitacoes pendentes (maximo 10). Aguarde o atendimento das atuais.',
      v_pendentes
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wpp_limite_pendentes ON public.solicitacoes_whatsapp;
CREATE TRIGGER trg_wpp_limite_pendentes
  BEFORE INSERT ON public.solicitacoes_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.fn_wpp_limite_pendentes();

-- ─── Carimbos de tempo por transição de status ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_wpp_carimbos()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_em := NOW();

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Primeira vez que entra em atendimento: guarda quando começou e com quem.
    IF NEW.status = 'em_andamento' AND NEW.iniciado_em IS NULL THEN
      NEW.iniciado_em := NOW();
      IF NEW.responsavel_id IS NULL THEN
        NEW.responsavel_id := auth.uid();
      END IF;
    END IF;

    IF NEW.status = 'feito' THEN
      NEW.finalizado_em := NOW();
    ELSE
      -- Reabriu (feito -> outro): o carimbo de fim deixa de valer.
      NEW.finalizado_em := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wpp_carimbos ON public.solicitacoes_whatsapp;
CREATE TRIGGER trg_wpp_carimbos
  BEFORE UPDATE ON public.solicitacoes_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.fn_wpp_carimbos();

-- ─── Histórico de status ────────────────────────────────────────────────────
-- SECURITY DEFINER: o histórico não pode depender de o usuário ter permissão de
-- INSERT na tabela de eventos. Assim ninguém muda status sem deixar rastro.
CREATE OR REPLACE FUNCTION public.fn_wpp_registrar_evento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.solicitacoes_whatsapp_eventos
      (empresa_id, solicitacao_id, status_anterior, status_novo, autor_id)
    VALUES (NEW.empresa_id, NEW.id, NULL, NEW.status, NEW.solicitante_id);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.solicitacoes_whatsapp_eventos
      (empresa_id, solicitacao_id, status_anterior, status_novo, autor_id)
    VALUES (NEW.empresa_id, NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wpp_registrar_evento ON public.solicitacoes_whatsapp;
CREATE TRIGGER trg_wpp_registrar_evento
  AFTER INSERT OR UPDATE ON public.solicitacoes_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.fn_wpp_registrar_evento();

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════
-- Chamadas de sessão embrulhadas em (SELECT ...) para virarem InitPlan e serem
-- avaliadas uma vez por query, não por linha — a lição das migrations 20260726a
-- e 20260729a. Aqui importa de verdade: a lista cresce todo dia.

ALTER TABLE public.atendimento_responsaveis        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_whatsapp           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_whatsapp_eventos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_whatsapp_mensagens ENABLE ROW LEVEL SECURITY;

-- ─── atendimento_responsaveis ───────────────────────────────────────────────
-- Leitura para a empresa: a tela precisa mostrar quem é responsável.
DROP POLICY IF EXISTS "atend_resp_select" ON public.atendimento_responsaveis;
CREATE POLICY "atend_resp_select" ON public.atendimento_responsaveis
  FOR SELECT USING (
    (SELECT public.fn_user_is_super_admin())
    OR empresa_id = (SELECT public.fn_user_empresa_id())
  );

-- Só líder+ define responsável. Responsável NÃO se autopromove.
DROP POLICY IF EXISTS "atend_resp_insert" ON public.atendimento_responsaveis;
CREATE POLICY "atend_resp_insert" ON public.atendimento_responsaveis
  FOR INSERT WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']))
  );

DROP POLICY IF EXISTS "atend_resp_delete" ON public.atendimento_responsaveis;
CREATE POLICY "atend_resp_delete" ON public.atendimento_responsaveis
  FOR DELETE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']))
  );

-- ─── solicitacoes_whatsapp ──────────────────────────────────────────────────
-- Operador vê só as próprias; líder+ e responsáveis veem todas da empresa.
DROP POLICY IF EXISTS "sol_wpp_select" ON public.solicitacoes_whatsapp;
CREATE POLICY "sol_wpp_select" ON public.solicitacoes_whatsapp
  FOR SELECT USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (
      solicitante_id = (SELECT auth.uid())
      OR (SELECT public.fn_wpp_tem_visao_geral())
    )
  );

-- Abrir pedido: qualquer usuário da empresa, sempre em nome PRÓPRIO.
-- (`solicitante_id = auth.uid()` impede abrir pedido no nome de outro.)
DROP POLICY IF EXISTS "sol_wpp_insert" ON public.solicitacoes_whatsapp;
CREATE POLICY "sol_wpp_insert" ON public.solicitacoes_whatsapp
  FOR INSERT WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND solicitante_id = (SELECT auth.uid())
  );

-- Edição: líder+/responsável em qualquer pedido. O solicitante só no próprio, e
-- só enquanto ninguém pegou ('pendente') ou quando devolveram pedindo dado
-- ('falta_info') — que é justamente quando ele precisa completar a informação.
DROP POLICY IF EXISTS "sol_wpp_update" ON public.solicitacoes_whatsapp;
CREATE POLICY "sol_wpp_update" ON public.solicitacoes_whatsapp
  FOR UPDATE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (
      (SELECT public.fn_wpp_tem_visao_geral())
      OR (solicitante_id = (SELECT auth.uid()) AND status IN ('pendente','falta_info'))
    )
  ) WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (
      (SELECT public.fn_wpp_tem_visao_geral())
      OR solicitante_id = (SELECT auth.uid())
    )
  );

-- Excluir: líder+ sempre; solicitante só enquanto o pedido está 'pendente'.
DROP POLICY IF EXISTS "sol_wpp_delete" ON public.solicitacoes_whatsapp;
CREATE POLICY "sol_wpp_delete" ON public.solicitacoes_whatsapp
  FOR DELETE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (
      (SELECT public.fn_user_has_any_role(
         ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']))
      OR (solicitante_id = (SELECT auth.uid()) AND status = 'pendente')
    )
  );

-- ─── Eventos: leitura para quem vê o pedido; escrita só pelo trigger ────────
DROP POLICY IF EXISTS "sol_wpp_eventos_select" ON public.solicitacoes_whatsapp_eventos;
CREATE POLICY "sol_wpp_eventos_select" ON public.solicitacoes_whatsapp_eventos
  FOR SELECT USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND public.fn_wpp_pode_ver_solicitacao(solicitacao_id)
  );
-- Sem policy de INSERT/UPDATE/DELETE de propósito: o histórico é escrito
-- exclusivamente pelo trigger SECURITY DEFINER e ninguém o reescreve.

-- ─── Mensagens da thread ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sol_wpp_msg_select" ON public.solicitacoes_whatsapp_mensagens;
CREATE POLICY "sol_wpp_msg_select" ON public.solicitacoes_whatsapp_mensagens
  FOR SELECT USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND public.fn_wpp_pode_ver_solicitacao(solicitacao_id)
  );

-- Escreve quem enxerga o pedido, sempre como autor de si mesmo.
DROP POLICY IF EXISTS "sol_wpp_msg_insert" ON public.solicitacoes_whatsapp_mensagens;
CREATE POLICY "sol_wpp_msg_insert" ON public.solicitacoes_whatsapp_mensagens
  FOR INSERT WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND autor_id = (SELECT auth.uid())
    AND public.fn_wpp_pode_ver_solicitacao(solicitacao_id)
  );

-- UPDATE existe só para carimbar `lida_em`, e apenas em mensagem de OUTRA
-- pessoa: ninguém marca a própria mensagem como lida (inflaria o recibo).
DROP POLICY IF EXISTS "sol_wpp_msg_update" ON public.solicitacoes_whatsapp_mensagens;
CREATE POLICY "sol_wpp_msg_update" ON public.solicitacoes_whatsapp_mensagens
  FOR UPDATE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND autor_id <> (SELECT auth.uid())
    AND public.fn_wpp_pode_ver_solicitacao(solicitacao_id)
  ) WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND autor_id <> (SELECT auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Realtime
-- ═══════════════════════════════════════════════════════════════════════════
-- Status e mensagens atualizam ao vivo. REPLICA IDENTITY FULL para o filtro por
-- empresa_id valer em qualquer evento — sem ela o payload de DELETE traz apenas
-- a PK e o filtro nunca casa.
ALTER TABLE public.solicitacoes_whatsapp           REPLICA IDENTITY FULL;
ALTER TABLE public.solicitacoes_whatsapp_mensagens REPLICA IDENTITY FULL;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['solicitacoes_whatsapp', 'solicitacoes_whatsapp_mensagens'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Busca do cliente pelo código (auto-preenchimento do formulário)
-- ═══════════════════════════════════════════════════════════════════════════
-- A RLS de `acordos` mostra ao operador apenas os acordos DELE. Sem esta RPC, o
-- operador digitaria um código real de outro operador e o formulário voltaria
-- vazio, parecendo defeito. A função roda SECURITY DEFINER e devolve SÓ os
-- quatro campos que o pedido precisa — não é uma janela para a carteira alheia.
--
-- Devolve o acordo mais recente do código; `qtd_acordos` avisa a tela quando há
-- mais de um (o WhatsApp pode divergir entre eles, daí o aviso de conferência).
CREATE OR REPLACE FUNCTION public.fn_wpp_buscar_cliente(p_codigo TEXT)
RETURNS TABLE (
  nome_cliente TEXT,
  estado_uf    TEXT,
  whatsapp     TEXT,
  qtd_acordos  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.fn_user_empresa_id();
BEGIN
  IF v_empresa IS NULL OR p_codigo IS NULL OR btrim(p_codigo) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH encontrados AS (
    SELECT a.nome_cliente, a.estado_uf, a.whatsapp, a.criado_em
    FROM public.acordos a
    WHERE a.empresa_id = v_empresa
      AND btrim(a.instituicao) = btrim(p_codigo)
  )
  SELECT e.nome_cliente, e.estado_uf, e.whatsapp, (SELECT COUNT(*) FROM encontrados)
  FROM encontrados e
  ORDER BY e.criado_em DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_wpp_buscar_cliente(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_wpp_buscar_cliente(TEXT) TO authenticated;

COMMENT ON TABLE public.solicitacoes_whatsapp IS
  'Pedidos de envio de mensagem no WhatsApp (PaguePlay): setor de ligação pede, '
  'digital executa. Status, responsável e carimbos de tempo; histórico em '
  'solicitacoes_whatsapp_eventos e conversa em solicitacoes_whatsapp_mensagens.';
