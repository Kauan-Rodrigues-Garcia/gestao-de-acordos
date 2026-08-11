-- ═══════════════════════════════════════════════════════════════════════════
-- SOLICITAÇÕES DE WHATSAPP — "não concluído" vira estado, e avisa quem precisa
-- ═══════════════════════════════════════════════════════════════════════════
-- A tag de 5 dias entrou em 20260811 desenhada só na TELA, derivada do relógio.
-- Isso resolve o "aparecer", mas não o "avisar": ninguém é notificado de que um
-- atendimento passou do prazo, e é justamente quem parou de olhar a aba que
-- precisaria saber.
--
-- Para avisar UMA vez é preciso lembrar que já se avisou — daí a coluna.
--
--   nao_concluido_em NULL      → ainda dentro do prazo (ou nunca conferido)
--   nao_concluido_em preenchido → passou dos 5 dias; dono e responsável já
--                                 foram avisados naquele instante
--
-- Alcança `pendente` E `em_andamento`: os dois são atendimento não concluído.
-- Assumir o chamado e deixá-lo parado cinco dias é o caso que o time queria
-- enxergar, e era o que a primeira versão deixava passar.
--
-- `falta_info` fica de fora: ele está parado esperando o SOLICITANTE responder,
-- e cobrar o responsável por isso seria cobrar a pessoa errada.
--
-- Sem job agendado: quem dispara é a própria tela ao abrir (verificação
-- preguiçosa), mesmo desenho de `fn_pix_expurga_desaprovados` e da purga da
-- lixeira. A conta é barata e indexada.
--
-- Idempotente.

-- ─── 1. A marca ─────────────────────────────────────────────────────────────
ALTER TABLE public.solicitacoes_whatsapp
  ADD COLUMN IF NOT EXISTS nao_concluido_em TIMESTAMPTZ;

COMMENT ON COLUMN public.solicitacoes_whatsapp.nao_concluido_em IS
  'Quando o pedido passou dos 5 dias sem ser concluído e o aviso foi disparado. '
  'NULL = dentro do prazo. Serve para não notificar duas vezes. Ver 20260811b.';

-- Índice do recorte que a verificação percorre: os que ainda não foram
-- marcados. Parcial, porque marcado nunca mais é lido por ela.
CREATE INDEX IF NOT EXISTS idx_sol_wpp_nao_concluido_pendente
  ON public.solicitacoes_whatsapp (empresa_id, criado_em)
  WHERE nao_concluido_em IS NULL AND status IN ('pendente', 'em_andamento');

-- ─── 2. A verificação ───────────────────────────────────────────────────────
--
-- SECURITY DEFINER por dois motivos: a notificação nasce para OUTRA pessoa (a
-- policy `notificacoes_own` só deixa cada um escrever no que é seu), e o UPDATE
-- alcança pedido de terceiro, que a policy de UPDATE não permitiria a um
-- operador comum. A autorização é conferida à mão, na primeira linha.
--
-- ⚠️ O prazo de 5 dias tem uma segunda cópia no TypeScript
-- (`PRAZO_NAO_CONCLUIDO`, em `formatacao.ts`), que é quem DESENHA a tag. Os
-- dois têm de dizer o mesmo número: aqui é quem avisa, lá é quem mostra. Mudar
-- um sem o outro faz a tela prometer um prazo e o aviso cumprir outro.
CREATE OR REPLACE FUNCTION public.fn_wpp_marcar_nao_concluidos(p_empresa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_qtd INTEGER := 0;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;

  WITH marcados AS (
    UPDATE public.solicitacoes_whatsapp s
       SET nao_concluido_em = NOW()
     WHERE s.empresa_id = p_empresa_id
       AND s.status IN ('pendente', 'em_andamento')
       AND s.nao_concluido_em IS NULL
       AND s.criado_em <= NOW() - INTERVAL '5 days'
    RETURNING s.id, s.empresa_id, s.codigo_cliente, s.nome_cliente,
              s.status, s.solicitante_id, s.responsavel_id
  ),
  -- Uma notificação por PESSOA envolvida. O UNION cobre o caso de o solicitante
  -- ser também o responsável (abriu e assumiu o próprio pedido) sem avisar duas
  -- vezes.
  avisos AS (
    INSERT INTO public.notificacoes
      (usuario_id, empresa_id, titulo, mensagem, lida, rota)
    SELECT DISTINCT
           d.destinatario,
           m.empresa_id,
           'Atendimento não concluído — '
             || COALESCE(NULLIF(TRIM(m.nome_cliente), ''), m.codigo_cliente),
           'O pedido de '
             || COALESCE(NULLIF(TRIM(m.nome_cliente), ''), m.codigo_cliente)
             || ' (' || m.codigo_cliente || ') está há mais de 5 dias '
             || CASE m.status
                  WHEN 'em_andamento' THEN 'em andamento'
                  ELSE 'pendente'
                END
             || ' e foi marcado como não concluído.',
           false,
           '/solicitacoes-whatsapp'
      FROM marcados m
      CROSS JOIN LATERAL (
        SELECT m.solicitante_id AS destinatario
        UNION
        SELECT m.responsavel_id
      ) AS d
     WHERE d.destinatario IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_qtd FROM marcados;

  RETURN v_qtd;
END;
$$;

COMMENT ON FUNCTION public.fn_wpp_marcar_nao_concluidos(UUID) IS
  'Marca como não concluídos os pedidos pendentes/em andamento há mais de 5 '
  'dias e avisa solicitante e responsável, uma vez só. Chamada pela tela ao '
  'abrir — não há job agendado neste projeto. Ver 20260811b.';

GRANT EXECUTE ON FUNCTION public.fn_wpp_marcar_nao_concluidos(UUID) TO authenticated;

-- ─── 3. Concluir limpa a marca ──────────────────────────────────────────────
--
-- Sem isto, um pedido que atrasou e DEPOIS foi concluído continuaria carregando
-- a marca no banco. A tag na tela já esconde em 'feito', mas o dado ficaria
-- dizendo o que não é — e a próxima consulta a esta coluna (relatório, filtro)
-- leria errado.
--
-- Reabrir NÃO devolve a marca: o pedido volta a contar prazo do zero pela
-- verificação, que é o comportamento certo — reabrir é um atendimento novo
-- sobre o mesmo pedido.
CREATE OR REPLACE FUNCTION public.fn_wpp_limpa_nao_concluido()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'feito' AND NEW.nao_concluido_em IS NOT NULL THEN
    NEW.nao_concluido_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wpp_limpa_nao_concluido ON public.solicitacoes_whatsapp;
CREATE TRIGGER trg_wpp_limpa_nao_concluido
  BEFORE UPDATE OF status ON public.solicitacoes_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.fn_wpp_limpa_nao_concluido();
