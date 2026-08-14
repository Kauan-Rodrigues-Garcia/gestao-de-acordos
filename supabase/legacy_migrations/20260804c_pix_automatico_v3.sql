-- ═══════════════════════════════════════════════════════════════════════════
-- PIX AUTOMÁTICO v3 (BookPlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Pagamento da comissão: líder+ marca o registro como PAGO. É um estado
--    separado da aprovação — aprovado diz que a comissão é devida, pago diz
--    que ela saiu. O operador enxerga os dois, e para de perguntar.
-- 2. Operador edita o PRÓPRIO registro enquanto ele está PENDENTE (NR e
--    valor). Depois de avaliado, não. Hoje ele só podia excluir e registrar de
--    novo — e não podia nem isso, porque o NR fica travado no registro
--    histórico assim que entra.
-- 3. Meta de Pix automático por setor/mês, para o líder acompanhar quanto
--    falta e a projeção. NÃO se mistura com a meta de recebimento: o valor do
--    Pix já entra no recebimento pelo analítico, e somar de novo contaria duas
--    vezes. Esta meta existe só para acompanhar o Pix em si.
--
-- Idempotente.

-- ─── 1. Pagamento da comissão ────────────────────────────────────────────────
ALTER TABLE public.pix_automatico_acordos
  ADD COLUMN IF NOT EXISTS pago          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pago_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pago_por      UUID,
  ADD COLUMN IF NOT EXISTS pago_por_nome TEXT;

COMMENT ON COLUMN public.pix_automatico_acordos.pago IS
  'Comissão desta linha já foi paga ao operador. Independe de status: só faz sentido em linha aprovada, e é o líder+ quem marca.';

-- Listagem do setor no mês (aba Pix do líder, ranking e meta).
CREATE INDEX IF NOT EXISTS idx_pix_auto_setor_criado
  ON public.pix_automatico_acordos (empresa_id, setor_id, criado_em DESC);

-- Filtro "o que ainda não paguei" sobre o que já foi aprovado.
CREATE INDEX IF NOT EXISTS idx_pix_auto_aprovado_nao_pago
  ON public.pix_automatico_acordos (empresa_id, setor_id)
  WHERE status = 'aprovado' AND pago = FALSE;

-- ─── 2. Operador edita o próprio registro PENDENTE ───────────────────────────
-- A policy de UPDATE existente (`pix_auto_update`, 20260718a) é só de líder+.
-- Policies são OR: esta soma o caso do dono, sem afrouxar aquela.
--
-- O WITH CHECK exige `status = 'pendente'` DEPOIS da alteração — é o que impede
-- o operador de aprovar o próprio acordo pelo mesmo caminho. E `operador_id =
-- auth.uid()` nos dois lados impede que ele passe o registro para outra pessoa.
DROP POLICY IF EXISTS "pix_auto_update_dono_pendente" ON public.pix_automatico_acordos;
CREATE POLICY "pix_auto_update_dono_pendente" ON public.pix_automatico_acordos
  FOR UPDATE USING (
    (SELECT public.fn_can_access_empresa(empresa_id))
    AND operador_id = (SELECT auth.uid())
    AND status = 'pendente'
  )
  WITH CHECK (
    (SELECT public.fn_can_access_empresa(empresa_id))
    AND operador_id = (SELECT auth.uid())
    AND status = 'pendente'
  );

-- RLS decide QUAIS LINHAS, nunca QUAIS COLUNAS. Sem isto, o operador que pode
-- editar a linha pendente também poderia mexer em setor_id, pct_comissao ou
-- pago — tudo o que decide o dinheiro. O gatilho devolve as colunas ao valor
-- anterior quando quem edita não é líder+: só NR e valor passam.
CREATE OR REPLACE FUNCTION public.fn_pix_congela_campos_do_operador()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.fn_user_has_any_role(
       ARRAY['lider','elite','gerencia','administrador','super_admin']) THEN
    RETURN NEW;
  END IF;

  NEW.empresa_id        := OLD.empresa_id;
  NEW.operador_id       := OLD.operador_id;
  NEW.operador_nome     := OLD.operador_nome;
  NEW.setor_id          := OLD.setor_id;
  NEW.status            := OLD.status;
  NEW.pct_comissao      := OLD.pct_comissao;
  NEW.avaliado_por      := OLD.avaliado_por;
  NEW.avaliado_por_nome := OLD.avaliado_por_nome;
  NEW.avaliado_em       := OLD.avaliado_em;
  NEW.pago              := OLD.pago;
  NEW.pago_em           := OLD.pago_em;
  NEW.pago_por          := OLD.pago_por;
  NEW.pago_por_nome     := OLD.pago_por_nome;
  NEW.criado_em         := OLD.criado_em;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pix_auto_congela_operador ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_auto_congela_operador
  BEFORE UPDATE ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_congela_campos_do_operador();

-- ─── 3. Editar o NR mantém o registro histórico coerente ─────────────────────
-- O NR é único por empresa e vive em `pix_automatico_nr_registro` (20260721i),
-- alimentado por triggers. Editar `nr_cliente` sem mexer nele deixaria o NR
-- ANTIGO travado para sempre e o NOVO livre para outra pessoa registrar — os
-- dois defeitos que o registro histórico existe para evitar.

-- Antes: o NR novo já pertence a outro acordo vivo? Então não.
CREATE OR REPLACE FUNCTION public.fn_pix_nr_bloqueia_troca()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status TEXT;
BEGIN
  IF public.fn_pix_nr_normalizar(NEW.nr_cliente)
     = public.fn_pix_nr_normalizar(OLD.nr_cliente) THEN
    RETURN NEW;
  END IF;

  SELECT r.status INTO v_status
    FROM public.pix_automatico_nr_registro r
   WHERE r.empresa_id     = NEW.empresa_id
     AND r.nr_normalizado = public.fn_pix_nr_normalizar(NEW.nr_cliente)
     AND (r.acordo_id IS DISTINCT FROM NEW.id);

  IF v_status IN ('pendente', 'validado') THEN
    RAISE EXCEPTION 'NR % já registrado no Pix automático (status: %)', NEW.nr_cliente, v_status
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pix_nr_bloqueia_troca ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_nr_bloqueia_troca
  BEFORE UPDATE OF nr_cliente ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_nr_bloqueia_troca();

-- Depois: libera o NR antigo (era pendente deste acordo — engano de digitação,
-- não histórico) e registra o novo.
CREATE OR REPLACE FUNCTION public.fn_pix_nr_apos_troca()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.fn_pix_nr_normalizar(NEW.nr_cliente)
     = public.fn_pix_nr_normalizar(OLD.nr_cliente) THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.pix_automatico_nr_registro r
   WHERE r.empresa_id     = OLD.empresa_id
     AND r.nr_normalizado = public.fn_pix_nr_normalizar(OLD.nr_cliente)
     AND r.acordo_id      = OLD.id
     AND r.status         = 'pendente';

  INSERT INTO public.pix_automatico_nr_registro
    (empresa_id, nr_normalizado, nr_cliente, acordo_id, operador_id, operador_nome, status)
  VALUES
    (NEW.empresa_id, public.fn_pix_nr_normalizar(NEW.nr_cliente), NEW.nr_cliente,
     NEW.id, NEW.operador_id, NEW.operador_nome, 'pendente')
  ON CONFLICT (empresa_id, nr_normalizado) DO UPDATE SET
    nr_cliente        = EXCLUDED.nr_cliente,
    acordo_id         = EXCLUDED.acordo_id,
    operador_id       = EXCLUDED.operador_id,
    operador_nome     = EXCLUDED.operador_nome,
    status            = 'pendente',
    avaliado_por      = NULL,
    avaliado_por_nome = NULL,
    avaliado_em       = NULL,
    atualizado_em     = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pix_nr_apos_troca ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_nr_apos_troca
  AFTER UPDATE OF nr_cliente ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_nr_apos_troca();

-- ─── 4. Meta de Pix automático por setor/mês ─────────────────────────────────
-- Tabela própria, não uma linha em `metas`: aquela é a meta de RECEBIMENTO, e
-- é consultada por dashboard, analítico, quartis e projeção. Um `tipo` novo lá
-- entraria por engano em toda soma que hoje faz `.in('tipo', [...])` — e o
-- enunciado desta meta é justamente NÃO se misturar com o recebimento.
CREATE TABLE IF NOT EXISTS public.pix_automatico_metas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id            UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  mes                 SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano                 SMALLINT NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  -- Meta do VALOR dos acordos Pix do setor no mês (não da comissão).
  meta_valor          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (meta_valor >= 0),
  -- Meta de QUANTIDADE de acordos Pix no mês. 0 = sem meta de quantidade.
  meta_acordos        INTEGER NOT NULL DEFAULT 0 CHECK (meta_acordos >= 0),
  atualizado_por      UUID,
  atualizado_por_nome TEXT,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, setor_id, mes, ano)
);

CREATE INDEX IF NOT EXISTS idx_pix_auto_metas_periodo
  ON public.pix_automatico_metas (empresa_id, ano, mes);

DROP TRIGGER IF EXISTS trg_pix_auto_metas_updated ON public.pix_automatico_metas;
CREATE TRIGGER trg_pix_auto_metas_updated
  BEFORE UPDATE ON public.pix_automatico_metas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_cargos();

ALTER TABLE public.pix_automatico_metas ENABLE ROW LEVEL SECURITY;

-- Leitura por todos da empresa: o operador vê quanto falta para o setor dele.
DROP POLICY IF EXISTS "pix_auto_metas_select" ON public.pix_automatico_metas;
CREATE POLICY "pix_auto_metas_select" ON public.pix_automatico_metas
  FOR SELECT USING ((SELECT public.fn_can_access_empresa(empresa_id)));

-- Escrita por líder+ — mesma régua da configuração de % do setor.
DROP POLICY IF EXISTS "pix_auto_metas_write" ON public.pix_automatico_metas;
CREATE POLICY "pix_auto_metas_write" ON public.pix_automatico_metas
  FOR ALL USING (
    (SELECT public.fn_can_access_empresa(empresa_id))
    AND (SELECT public.fn_user_has_any_role(
      ARRAY['lider','elite','gerencia','administrador','super_admin']))
  )
  WITH CHECK (
    (SELECT public.fn_can_access_empresa(empresa_id))
    AND (SELECT public.fn_user_has_any_role(
      ARRAY['lider','elite','gerencia','administrador','super_admin']))
  );

COMMENT ON TABLE public.pix_automatico_metas IS
  'Meta de Pix automático por setor/mês (valor e quantidade). Separada de `metas`: o recebimento do Pix já entra no analítico e não pode ser contado duas vezes.';
