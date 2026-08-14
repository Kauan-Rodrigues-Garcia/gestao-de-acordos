-- ============================================================================
-- 20260731d — Cada um tem o próprio "não lido"
-- ============================================================================
--
-- O BUG: a bolinha vermelha sumia da tela de TODO MUNDO quando QUALQUER pessoa
-- abria a conversa.
--
-- Causa: `solicitacoes_whatsapp_mensagens.lida_em` é uma coluna por MENSAGEM,
-- não um recibo por destinatário. Foi decidido assim na 20260730b, quando a
-- thread era só entre solicitante e responsável e um carimbo de "alguém leu"
-- bastava. O que quebrou isso foi líder+ ganhar acesso de leitura à conversa:
-- hoje o líder abre o chat, o carimbo é gravado, e o responsável — que não leu
-- nada — perde o aviso.
--
-- A CORREÇÃO: um cursor de leitura por pessoa e por conversa. Uma linha diz
-- "este usuário leu esta conversa até tal instante"; mensagem posterior a isso
-- está por ler. Uma linha por pessoa/conversa, não por pessoa/mensagem — numa
-- thread de 50 mensagens a diferença é 1 linha contra 50.
--
-- `lida_em` fica na tabela como está: é histórico, e apagar dado não conserta
-- nada. O código deixa de escrevê-la e o ✓✓ passa a sair daqui, onde ele pode
-- afinal dizer a verdade ("o outro lado leu") em vez de "alguém leu".
--
-- Idempotente.
-- ============================================================================

-- ── 1. Tabela ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.solicitacoes_whatsapp_leitura (
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  solicitacao_id UUID NOT NULL REFERENCES public.solicitacoes_whatsapp(id) ON DELETE CASCADE,
  usuario_id     UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  -- Instante até o qual esta pessoa já viu a conversa.
  lido_ate       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (solicitacao_id, usuario_id)
);

COMMENT ON TABLE public.solicitacoes_whatsapp_leitura IS
  'Até onde cada pessoa leu cada conversa. Substitui o carimbo único '
  'lida_em para efeito de "não lidas": aquele era por mensagem e sumia '
  'para todos quando qualquer um abria a thread.';

-- Serve as duas perguntas do app: "o que EU não li" (badge) e "quem leu esta
-- conversa" (o ✓✓ das minhas mensagens).
CREATE INDEX IF NOT EXISTS idx_sol_wpp_leitura_usuario
  ON public.solicitacoes_whatsapp_leitura (empresa_id, usuario_id);

-- ── 2. RLS: cada um só mexe no próprio cursor ───────────────────────────────

ALTER TABLE public.solicitacoes_whatsapp_leitura ENABLE ROW LEVEL SECURITY;

-- Ler as leituras dos OUTROS é necessário para o ✓✓, então o SELECT segue a
-- visibilidade da conversa — quem enxerga o pedido enxerga quem já o leu.
DROP POLICY IF EXISTS "sol_wpp_leitura_select" ON public.solicitacoes_whatsapp_leitura;
CREATE POLICY "sol_wpp_leitura_select" ON public.solicitacoes_whatsapp_leitura
  FOR SELECT USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND public.fn_wpp_pode_ver_solicitacao(solicitacao_id)
  );

-- Escrever, só no próprio. Sem isto alguém poderia marcar a conversa como lida
-- para outra pessoa — exatamente o defeito que esta migration existe para tirar.
DROP POLICY IF EXISTS "sol_wpp_leitura_insert" ON public.solicitacoes_whatsapp_leitura;
CREATE POLICY "sol_wpp_leitura_insert" ON public.solicitacoes_whatsapp_leitura
  FOR INSERT WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND usuario_id = (SELECT auth.uid())
    AND public.fn_wpp_pode_ver_solicitacao(solicitacao_id)
  );

DROP POLICY IF EXISTS "sol_wpp_leitura_update" ON public.solicitacoes_whatsapp_leitura;
CREATE POLICY "sol_wpp_leitura_update" ON public.solicitacoes_whatsapp_leitura
  FOR UPDATE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND usuario_id = (SELECT auth.uid())
  ) WITH CHECK (
    usuario_id = (SELECT auth.uid())
  );

-- Sem policy de DELETE: o cursor não se apaga, só anda para frente.

-- ── 3. Backfill: ninguém acorda com badge do que já leu ─────────────────────
--
-- Sem isto, na primeira carga toda conversa antiga voltaria a aparecer como não
-- lida. Os dois envolvidos herdam o que o `lida_em` já dizia; líder+ recebe o
-- instante de agora, porque o badge das conversas alheias nunca foi dele para
-- começar.

-- 3a. Solicitante e responsável: até onde o carimbo antigo garante que leram.
INSERT INTO public.solicitacoes_whatsapp_leitura (empresa_id, solicitacao_id, usuario_id, lido_ate)
SELECT m.empresa_id, m.solicitacao_id, env.usuario_id, MAX(m.lida_em)
  FROM public.solicitacoes_whatsapp_mensagens m
  JOIN public.solicitacoes_whatsapp s ON s.id = m.solicitacao_id
  CROSS JOIN LATERAL (
    SELECT s.solicitante_id AS usuario_id
    UNION
    SELECT s.responsavel_id
  ) AS env
 WHERE m.lida_em IS NOT NULL
   AND env.usuario_id IS NOT NULL
   AND env.usuario_id <> m.autor_id
 GROUP BY m.empresa_id, m.solicitacao_id, env.usuario_id
ON CONFLICT (solicitacao_id, usuario_id) DO NOTHING;

-- 3b. Quem tem visão geral: parte do zero, sem herdar pendência alheia.
INSERT INTO public.solicitacoes_whatsapp_leitura (empresa_id, solicitacao_id, usuario_id, lido_ate)
SELECT s.empresa_id, s.id, p.id, NOW()
  FROM public.solicitacoes_whatsapp s
  JOIN public.perfis p
    ON p.empresa_id = s.empresa_id
   AND p.perfil IN ('lider','elite','gerencia','diretoria','administrador','super_admin')
ON CONFLICT (solicitacao_id, usuario_id) DO NOTHING;

-- ── 4. Realtime ─────────────────────────────────────────────────────────────
-- O ✓✓ precisa acender na tela de quem escreveu assim que o outro lê.

ALTER TABLE public.solicitacoes_whatsapp_leitura REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'solicitacoes_whatsapp_leitura'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitacoes_whatsapp_leitura;
  END IF;
END $$;
