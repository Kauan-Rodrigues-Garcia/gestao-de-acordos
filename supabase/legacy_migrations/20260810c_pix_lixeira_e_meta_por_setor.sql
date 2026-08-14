-- ═══════════════════════════════════════════════════════════════════════════
-- PIX AUTOMÁTICO — lixeira, meta da dobra por setor e índice de paginação
-- ═══════════════════════════════════════════════════════════════════════════
-- Três mudanças que andam juntas porque tocam as mesmas tabelas:
--
--   1. `meta_acordos_dobra` por setor — a regra dos 18 acordos era constante de
--      módulo no frontend (PIX_META_ACORDOS_DOBRA). Passa a viver ao lado do
--      `pct`, na config que o líder já edita.
--
--   2. Lixeira. O botão de excluir apagava a linha de vez: sem log, sem
--      auditoria, sem volta. Um registro foi perdido assim em 2026-08-10, e o
--      valor não pôde ser recuperado porque só existia nesta tabela.
--
--   3. Índice para a tabela paginar por `criado_em` sem varrer tudo.
--
-- Idempotente.

-- ─── 1. Meta da dobra, por setor ────────────────────────────────────────────
--
-- 18 continua sendo o padrão — é o combinado atual da operação. A coluna só
-- tira a regra do código e põe onde o líder alcança.
ALTER TABLE public.pix_automatico_config
  ADD COLUMN IF NOT EXISTS meta_acordos_dobra SMALLINT NOT NULL DEFAULT 18;

DO $$
BEGIN
  ALTER TABLE public.pix_automatico_config
    ADD CONSTRAINT pix_cfg_meta_dobra_positiva CHECK (meta_acordos_dobra > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.pix_automatico_config.meta_acordos_dobra IS
  'Quantos acordos Pix o operador precisa fazer no mês para o requisito 1 da comissão dobrada. Padrão 18. Ver 20260810c.';

-- ─── 2. Lixeira ─────────────────────────────────────────────────────────────
--
-- Espelha `lixeira_acordos`: snapshot completo em JSONB para o restore não
-- depender do formato da tabela de origem, e colunas soltas para a tela listar
-- e filtrar sem abrir o JSON.
CREATE TABLE IF NOT EXISTS public.lixeira_pix_automatico (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- id que a linha tinha em pix_automatico_acordos. Sem FK de propósito: a
  -- linha original já não existe, e o restore recria com este mesmo id.
  acordo_id         UUID NOT NULL,
  nr_cliente        TEXT NOT NULL,
  valor             NUMERIC(12,2) NOT NULL,
  status            TEXT NOT NULL,
  operador_id       UUID,
  operador_nome     TEXT,
  setor_id          UUID,
  -- Snapshot inteiro: é o que o restore reinsere.
  dados_completos   JSONB NOT NULL,
  excluido_por      UUID,
  excluido_por_nome TEXT,
  excluido_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Retenção de 3 dias, a mesma da lixeira de acordos — uma regra só para o
  -- time decorar.
  expira_em         TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 days')
);

CREATE INDEX IF NOT EXISTS idx_lixeira_pix_empresa
  ON public.lixeira_pix_automatico (empresa_id, excluido_em DESC);
CREATE INDEX IF NOT EXISTS idx_lixeira_pix_operador
  ON public.lixeira_pix_automatico (empresa_id, operador_id);
CREATE INDEX IF NOT EXISTS idx_lixeira_pix_expira
  ON public.lixeira_pix_automatico (expira_em);

ALTER TABLE public.lixeira_pix_automatico ENABLE ROW LEVEL SECURITY;

-- Ver: o dono vê o que era dele; líder+ vê tudo da empresa. Mesma régua da
-- policy de SELECT em pix_automatico_acordos.
DROP POLICY IF EXISTS "lixeira_pix_select" ON public.lixeira_pix_automatico;
CREATE POLICY "lixeira_pix_select" ON public.lixeira_pix_automatico
  FOR SELECT USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'])
    )
  );

-- Mandar para a lixeira: quem já podia excluir. A policy de DELETE da tabela
-- de origem continua sendo o portão de verdade — esta só não pode ser mais
-- restritiva que aquela, ou o excluir quebraria no meio.
DROP POLICY IF EXISTS "lixeira_pix_insert" ON public.lixeira_pix_automatico;
CREATE POLICY "lixeira_pix_insert" ON public.lixeira_pix_automatico
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin'])
    )
  );

-- Apagar de vez (esvaziar / expurgo manual): só líder+.
DROP POLICY IF EXISTS "lixeira_pix_delete" ON public.lixeira_pix_automatico;
CREATE POLICY "lixeira_pix_delete" ON public.lixeira_pix_automatico
  FOR DELETE USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin'])
  );

-- ─── 3. Registro órfão de NR não trava mais ninguém ─────────────────────────
--
-- Sem isto a lixeira não funciona. Ao excluir um acordo APROVADO, o registro de
-- NR sobrevive como histórico (`validado`) e o FK deixa `acordo_id` NULL. Na
-- hora de restaurar, o BEFORE INSERT via `validado` e recusava — a linha
-- entraria na lixeira e não sairia nunca.
--
-- A regra nova é a mesma que `fn_nr_dono_conflitante` já usa do lado dos
-- acordos: registro cujo dono não existe mais não bloqueia. O histórico
-- continua lá para consulta; ele só deixa de ser um portão.
CREATE OR REPLACE FUNCTION public.fn_pix_nr_bloqueia_duplicado()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status TEXT;
BEGIN
  SELECT r.status INTO v_status
    FROM public.pix_automatico_nr_registro r
   WHERE r.empresa_id = NEW.empresa_id
     AND r.nr_normalizado = public.fn_pix_nr_normalizar(NEW.nr_cliente)
     -- órfão (acordo excluído) não trava: o FK zera acordo_id no delete
     AND r.acordo_id IS NOT NULL;
  IF v_status IN ('pendente', 'validado') THEN
    RAISE EXCEPTION 'NR % já registrado no Pix automático (status: %)', NEW.nr_cliente, v_status
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_pix_nr_bloqueia_duplicado() IS
  'v2 — registro de NR órfão (acordo já excluído) deixa de bloquear novo registro. Sem isso, restaurar da lixeira era impossível. Ver 20260810c.';

-- ─── 4. Restaurar ───────────────────────────────────────────────────────────
--
-- RPC, e não INSERT do cliente, por três motivos que juntos não cabem numa
-- policy: a linha volta com o `status` original (a policy de INSERT da tabela
-- exige `status = 'pendente'`), o registro de NR precisa voltar ao estado que
-- combina com esse status, e as três operações têm de ser uma transação só —
-- restaurar pela metade deixaria a linha viva e a cópia na lixeira.
CREATE OR REPLACE FUNCTION public.fn_pix_restaurar_lixeira(p_item_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item  public.lixeira_pix_automatico%ROWTYPE;
  v_dados JSONB;
  v_novo  UUID;
BEGIN
  SELECT * INTO v_item FROM public.lixeira_pix_automatico WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIXEIRA_ITEM_NAO_ENCONTRADO';
  END IF;

  -- SECURITY DEFINER ignora RLS: a autorização é conferida aqui, à mão.
  IF NOT public.fn_can_access_empresa(v_item.empresa_id)
     OR NOT public.fn_user_has_any_role(
          ARRAY['lider','elite','gerencia','administrador','super_admin']) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_RESTAURAR';
  END IF;

  v_dados := v_item.dados_completos;

  INSERT INTO public.pix_automatico_acordos (
    id, empresa_id, operador_id, operador_nome, setor_id,
    nr_cliente, valor, status, pct_comissao,
    avaliado_por, avaliado_por_nome, avaliado_em, criado_em
  ) VALUES (
    v_item.acordo_id,
    v_item.empresa_id,
    (v_dados->>'operador_id')::UUID,
    v_dados->>'operador_nome',
    NULLIF(v_dados->>'setor_id', '')::UUID,
    v_dados->>'nr_cliente',
    (v_dados->>'valor')::NUMERIC,
    v_dados->>'status',
    NULLIF(v_dados->>'pct_comissao', '')::NUMERIC,
    NULLIF(v_dados->>'avaliado_por', '')::UUID,
    v_dados->>'avaliado_por_nome',
    NULLIF(v_dados->>'avaliado_em', '')::TIMESTAMPTZ,
    COALESCE(NULLIF(v_dados->>'criado_em', '')::TIMESTAMPTZ, NOW())
  )
  RETURNING id INTO v_novo;

  -- O AFTER INSERT acabou de gravar o registro de NR como 'pendente' — é o que
  -- ele faz para linha nova. Aqui a linha não é nova: ela volta com o status
  -- que tinha, e o registro precisa dizer o mesmo. Mesmo mapeamento de
  -- `fn_pix_nr_apos_update`.
  UPDATE public.pix_automatico_nr_registro r SET
    status            = CASE v_dados->>'status'
                          WHEN 'aprovado'    THEN 'validado'
                          WHEN 'desaprovado' THEN 'recusado'
                          ELSE 'pendente'
                        END,
    avaliado_por      = NULLIF(v_dados->>'avaliado_por', '')::UUID,
    avaliado_por_nome = v_dados->>'avaliado_por_nome',
    avaliado_em       = NULLIF(v_dados->>'avaliado_em', '')::TIMESTAMPTZ,
    atualizado_em     = NOW()
  WHERE r.empresa_id     = v_item.empresa_id
    AND r.nr_normalizado = public.fn_pix_nr_normalizar(v_item.nr_cliente)
    AND r.acordo_id      = v_novo;

  DELETE FROM public.lixeira_pix_automatico WHERE id = p_item_id;

  RETURN v_novo;
END;
$$;

COMMENT ON FUNCTION public.fn_pix_restaurar_lixeira(UUID) IS
  'Restaura registro do Pix automático da lixeira: reinsere com o status original, realinha o registro de NR e remove da lixeira, em uma transação. Só líder+. Ver 20260810c.';

GRANT EXECUTE ON FUNCTION public.fn_pix_restaurar_lixeira(UUID) TO authenticated;

-- ─── 5. Purga do que expirou ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pix_lixeira_purgar(p_empresa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_qtd INTEGER;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;

  WITH removidos AS (
    DELETE FROM public.lixeira_pix_automatico
     WHERE empresa_id = p_empresa_id AND expira_em <= NOW()
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_qtd FROM removidos;

  RETURN v_qtd;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_pix_lixeira_purgar(UUID) TO authenticated;

-- ─── 6. Índice da paginação ─────────────────────────────────────────────────
--
-- A tabela passa a paginar no servidor (100 por página, `.range()`), ordenada
-- por `criado_em DESC`. Os índices existentes cobrem empresa, operador e
-- status, mas nenhum ordena — sem este, cada página vira sort do conjunto
-- inteiro.
CREATE INDEX IF NOT EXISTS idx_pix_auto_empresa_criado
  ON public.pix_automatico_acordos (empresa_id, criado_em DESC);

-- Agregados (dobra, ranking, meta) leem só o mês corrente. Este índice é o que
-- faz esse recorte não varrer o histórico inteiro.
CREATE INDEX IF NOT EXISTS idx_pix_auto_setor_criado
  ON public.pix_automatico_acordos (empresa_id, setor_id, criado_em DESC);
