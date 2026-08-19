-- ============================================================================
-- Tickets: a guarda de edicao nao pode barrar o proprio sistema
-- ============================================================================
--
-- Sintoma: lider manda mensagem no chat e recebe 403 em `tickets_mensagens`,
-- com a frase "quem abriu so pode cancelar um ticket ainda em aberto".
--
-- Causa: `fn_ticket_apos_mensagem` termina com um
-- `UPDATE tickets SET atualizado_em = NOW()` — o toque que move o ticket para
-- o topo da fila. Esse UPDATE dispara `trg_ticket_guarda_edicao`, que pergunta
-- `fn_ticket_pode_atender()`; para um lider a resposta e nao, e a guarda entao
-- exige que a unica mudanca seja o cancelamento. Nao era: era o carimbo de
-- hora. A excecao subia pelo gatilho e derrubava o INSERT da mensagem inteiro.
--
-- Correcao: a guarda passa a deixar passar o UPDATE que nao muda nada alem de
-- `atualizado_em`. Um toque de carimbo nao e edicao — nao vale a pena inventar
-- uma bandeira de sessao para o gatilho se anunciar, porque a comparacao das
-- duas linhas responde a mesma pergunta sem estado escondido.
--
-- O recorte de verdade continua igual: quem abriu segue so podendo cancelar, e
-- so enquanto o ticket estiver aberto.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ticket_guarda_edicao()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF public.fn_ticket_pode_atender() THEN
    RETURN NEW;
  END IF;

  -- Toque de carimbo (o `UPDATE ... SET atualizado_em` de
  -- `fn_ticket_apos_mensagem`): nada mais mudou, entao nao ha o que guardar.
  IF (to_jsonb(NEW) - 'atualizado_em') = (to_jsonb(OLD) - 'atualizado_em') THEN
    RETURN NEW;
  END IF;

  IF OLD.aberto_por <> auth.uid() THEN
    RAISE EXCEPTION 'TICKET_SEM_PERMISSAO: apenas quem atende pode alterar este ticket'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status <> 'cancelado' OR OLD.status IN ('concluido','recusado','cancelado') THEN
    RAISE EXCEPTION 'TICKET_SEM_PERMISSAO: quem abriu so pode cancelar um ticket ainda em aberto'
      USING ERRCODE = '42501';
  END IF;

  -- Cancelar e mudar UMA coisa. Tudo o mais volta ao que era.
  NEW.numero          := OLD.numero;
  NEW.empresa_id      := OLD.empresa_id;
  NEW.setor_id        := OLD.setor_id;
  NEW.aberto_por      := OLD.aberto_por;
  NEW.aberto_por_nome := OLD.aberto_por_nome;
  NEW.categoria       := OLD.categoria;
  NEW.assunto         := OLD.assunto;
  NEW.descricao       := OLD.descricao;
  NEW.prioridade      := OLD.prioridade;
  NEW.responsavel_id  := OLD.responsavel_id;
  NEW.responsavel_nome:= OLD.responsavel_nome;
  NEW.campos          := OLD.campos;
  NEW.criado_em       := OLD.criado_em;
  RETURN NEW;
END;
$$;
