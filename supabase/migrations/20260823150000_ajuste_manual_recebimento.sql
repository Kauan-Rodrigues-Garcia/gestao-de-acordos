-- ============================================================================
-- 20260823150000_ajuste_manual_recebimento.sql
--
-- Ajuste manual de recebimento — CORRECAO TEMPORARIA do relatorio do ERP.
--
-- ## Por que isto existe, e por que e temporario
--
-- O relatorio analitico que vem do sistema esta com erro. Enquanto a origem nao
-- e corrigida, a lideranca precisa de um jeito de somar ou tirar valor do
-- recebimento de um operador, com motivo registrado.
--
-- Isto contraria a regra do projeto de que NADA altera o valor do analitico. A
-- regra continua valendo para o relatorio: nenhuma linha de
-- `analitico_recebimentos` e tocada aqui. O ajuste vive numa tabela SEPARADA e
-- e somado na LEITURA — o que significa que desligar a correcao no dia em que o
-- ERP for consertado e parar de somar, sem desfazer nada e sem perder a trilha.
--
-- ## O que o ajuste NAO e
--
-- Nao e Pix e nao e cartao. Ele entra como "recebimento por fora": aparece no
-- total do operador, sobe para a equipe e para o setor, e e rotulado como
-- `Ajuste manual` na quebra por forma de pagamento. Rotular como Pix inflaria
-- um numero que a conciliacao bancaria confere.
--
-- ## Quem faz o que
--
-- • **Lideranca** lanca (`ajuste_recebimento_lancar`) e ve o proprio historico.
--   Nao edita e nao cancela: para mudar, abre uma SOLICITACAO.
-- • **Administracao** (`ajuste_recebimento_administrar`) ve tudo, edita,
--   cancela e responde as solicitacoes.
--
-- As duas sao chaves do painel de permissoes, nao listas de cargo escritas aqui
-- — e a regra permanente do projeto. `_lancar` nasce ligada para a lideranca
-- inteira, que e o pedido ("o lider nao precisa de permissao nenhuma"): na
-- pratica ninguem precisa ligar nada, e mesmo assim o painel continua podendo
-- desligar quando a correcao temporaria acabar.
--
-- ## Cancelado nao e apagado
--
-- Cancelar marca a linha e para de somar. A linha fica, com quem lancou, quem
-- cancelou e por que. Um ajuste manual de valor e exatamente o tipo de registro
-- que alguem vai querer auditar depois.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── Tabela principal ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analitico_ajustes_manuais (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  operador_id         UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,

  -- Carimbado no lancamento a partir do cadastro do operador. Guardado na linha
  -- e nao resolvido na leitura: mover a pessoa de setor no mes seguinte nao
  -- pode reescrever de qual setor aquele valor foi.
  setor_id            UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  equipe_id           UUID REFERENCES public.equipes(id) ON DELETE SET NULL,

  -- Primeiro dia do mes de competencia ('2026-08-01').
  mes_referencia      DATE NOT NULL,

  -- POSITIVO soma, NEGATIVO tira. Um so campo em vez de valor + sinal: dois
  -- campos permitem gravar "-500 negativo" e a leitura vira adivinhacao.
  valor               NUMERIC(14,2) NOT NULL,

  motivo              TEXT NOT NULL,

  criado_por          UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_por_nome     TEXT,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  cancelado           BOOLEAN NOT NULL DEFAULT FALSE,
  cancelado_por       UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  cancelado_por_nome  TEXT,
  cancelado_em        TIMESTAMPTZ,
  motivo_cancelamento TEXT,

  editado_por         UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  editado_por_nome    TEXT,
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Zero nao ajusta nada e so polui a trilha; o motivo em branco derrota o
  -- proposito inteiro de exigir motivo.
  CONSTRAINT ajuste_valor_nao_zero CHECK (valor <> 0),
  CONSTRAINT ajuste_motivo_preenchido CHECK (length(btrim(motivo)) >= 3),
  -- Competencia e sempre o primeiro dia do mes: sem isto, '2026-08-05' e
  -- '2026-08-01' viram dois meses diferentes na agregacao.
  CONSTRAINT ajuste_mes_no_dia_1 CHECK (date_trunc('month', mes_referencia) = mes_referencia)
);

COMMENT ON TABLE public.analitico_ajustes_manuais IS
  'Correcao TEMPORARIA de recebimento por operador. Somada na leitura; nao '
  'altera analitico_recebimentos. Ver migration 20260823150000.';

-- O recorte de toda leitura: empresa + mes, sem os cancelados.
CREATE INDEX IF NOT EXISTS idx_ajustes_empresa_mes
  ON public.analitico_ajustes_manuais (empresa_id, mes_referencia)
  WHERE NOT cancelado;

CREATE INDEX IF NOT EXISTS idx_ajustes_operador
  ON public.analitico_ajustes_manuais (operador_id, mes_referencia);

CREATE INDEX IF NOT EXISTS idx_ajustes_criado_por
  ON public.analitico_ajustes_manuais (criado_por, criado_em DESC);

-- ── Solicitacoes de alteracao ───────────────────────────────────────────────
--
-- O lider nao edita nem cancela o proprio lancamento. Ele PEDE, o administrador
-- decide. A alternativa — deixar editar livremente — apagaria a diferenca entre
-- "o valor estava errado" e "o valor mudou de ideia", que e justamente o que
-- uma correcao manual precisa registrar.

CREATE TABLE IF NOT EXISTS public.analitico_ajustes_solicitacoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ajuste_id        UUID NOT NULL REFERENCES public.analitico_ajustes_manuais(id) ON DELETE CASCADE,
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,

  tipo             TEXT NOT NULL CHECK (tipo IN ('editar', 'cancelar')),
  -- Preenchidos so quando `tipo = 'editar'`.
  valor_proposto   NUMERIC(14,2),
  motivo_proposto  TEXT,

  justificativa    TEXT NOT NULL,

  status           TEXT NOT NULL DEFAULT 'aberta'
                     CHECK (status IN ('aberta', 'aprovada', 'recusada')),

  solicitado_por      UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  solicitado_por_nome TEXT,
  solicitado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  resolvido_por       UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  resolvido_por_nome  TEXT,
  resolvido_em        TIMESTAMPTZ,
  resposta            TEXT,

  CONSTRAINT solicitacao_justificativa_preenchida
    CHECK (length(btrim(justificativa)) >= 3),
  -- Pedido de edicao sem valor novo nao e pedido de edicao.
  CONSTRAINT solicitacao_editar_tem_valor
    CHECK (tipo <> 'editar' OR valor_proposto IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ajustes_solicitacoes_abertas
  ON public.analitico_ajustes_solicitacoes (empresa_id, status, solicitado_em DESC);

CREATE INDEX IF NOT EXISTS idx_ajustes_solicitacoes_ajuste
  ON public.analitico_ajustes_solicitacoes (ajuste_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- O padrao da casa: porta de empresa E (linha propria OU pergunta ao painel).
-- Nenhuma lista de cargo escrita aqui — quem manda e o painel de permissoes.

ALTER TABLE public.analitico_ajustes_manuais      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analitico_ajustes_solicitacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ajustes_select ON public.analitico_ajustes_manuais;
CREATE POLICY ajustes_select ON public.analitico_ajustes_manuais
  FOR SELECT TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      -- Quem administra ve tudo da empresa.
      public.fn_user_tem('ajuste_recebimento_administrar')
      -- Quem lanca ve o que lancou...
      OR criado_por = auth.uid()
      -- ...e o operador ve o que caiu no proprio recebimento. E o piso de
      -- qualquer um sobre os proprios dados, a excecao que a regra do painel
      -- sempre aceitou.
      OR operador_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ajustes_insert ON public.analitico_ajustes_manuais;
CREATE POLICY ajustes_insert ON public.analitico_ajustes_manuais
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      public.fn_user_tem('ajuste_recebimento_lancar')
      OR public.fn_user_tem('ajuste_recebimento_administrar')
    )
    -- Nao da para lancar em nome de outra pessoa: o autor e sempre quem esta
    -- logado. Sem isto, a trilha de auditoria nao vale nada.
    AND criado_por = auth.uid()
  );

-- Editar e cancelar sao a MESMA operacao para o banco (UPDATE), e as duas sao
-- so de quem administra. O lider passa por solicitacao.
DROP POLICY IF EXISTS ajustes_update ON public.analitico_ajustes_manuais;
CREATE POLICY ajustes_update ON public.analitico_ajustes_manuais
  FOR UPDATE TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_tem('ajuste_recebimento_administrar')
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_tem('ajuste_recebimento_administrar')
  );

-- DELETE nao tem policy: ninguem apaga. Cancelar marca a linha, e a trilha fica.

DROP POLICY IF EXISTS ajustes_sol_select ON public.analitico_ajustes_solicitacoes;
CREATE POLICY ajustes_sol_select ON public.analitico_ajustes_solicitacoes
  FOR SELECT TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      public.fn_user_tem('ajuste_recebimento_administrar')
      OR solicitado_por = auth.uid()
    )
  );

DROP POLICY IF EXISTS ajustes_sol_insert ON public.analitico_ajustes_solicitacoes;
CREATE POLICY ajustes_sol_insert ON public.analitico_ajustes_solicitacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND solicitado_por = auth.uid()
    AND (
      public.fn_user_tem('ajuste_recebimento_lancar')
      OR public.fn_user_tem('ajuste_recebimento_administrar')
    )
  );

DROP POLICY IF EXISTS ajustes_sol_update ON public.analitico_ajustes_solicitacoes;
CREATE POLICY ajustes_sol_update ON public.analitico_ajustes_solicitacoes
  FOR UPDATE TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_tem('ajuste_recebimento_administrar')
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_tem('ajuste_recebimento_administrar')
  );

-- ── Realtime ────────────────────────────────────────────────────────────────
-- A aba se atualiza sozinha quando outro lider lanca. `REPLICA IDENTITY FULL`
-- pelo mesmo motivo de `acordos`: sem ela o DELETE/UPDATE nao carrega
-- `empresa_id` e o filtro do canal nao casa.
ALTER TABLE public.analitico_ajustes_manuais      REPLICA IDENTITY FULL;
ALTER TABLE public.analitico_ajustes_solicitacoes REPLICA IDENTITY FULL;

DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.analitico_ajustes_manuais;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.analitico_ajustes_solicitacoes;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$realtime$;

COMMIT;
