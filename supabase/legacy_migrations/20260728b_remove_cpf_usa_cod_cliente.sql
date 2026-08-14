-- ═══════════════════════════════════════════════════════════════════════════
-- 20260728b — Fim do CPF: recebimento diário passa a usar o Cód.Cliente
-- ═══════════════════════════════════════════════════════════════════════════
-- Pedido da diretoria (2026-07-28): nenhum CPF de cliente permanece no banco.
--
-- O relatório diário do ERP passou a trazer a coluna "Cód.Cliente" (o T.I.
-- incluiu a pedido). Esse código é o MESMO usado na tabulação dos operadores,
-- então além de resolver a questão de privacidade ele abre caminho para cruzar
-- o recebimento diário com os acordos — o que hoje não era possível.
--
-- ⚠️  DESTRUTIVO E IRREVERSÍVEL: as duas colunas de CPF são removidas e os
--     dados nelas se perdem. Não há backup automático. As linhas antigas de
--     `diario_recebimentos` ficam com `cliente_codigo` NULL — a intenção é que
--     sejam apagadas pelo botão "Excluir tudo" da aba antes ou depois desta
--     migration, e repovoadas pelo próximo relatório.

-- ─── 1. Recebimento diário ───────────────────────────────────────────────────

ALTER TABLE public.diario_recebimentos
  ADD COLUMN IF NOT EXISTS cliente_codigo TEXT;

COMMENT ON COLUMN public.diario_recebimentos.cliente_codigo IS
  'Coluna "Cód.Cliente" do relatório do ERP, apenas dígitos (o ERP exporta com '
  'separador de milhar). Mesmo código usado na tabulação dos acordos.';

-- Índice pensado no cruzamento futuro com os acordos tabulados.
CREATE INDEX IF NOT EXISTS idx_diario_cliente_codigo
  ON public.diario_recebimentos(empresa_id, cliente_codigo);

ALTER TABLE public.diario_recebimentos DROP COLUMN IF EXISTS cpf;

-- ─── 2. Cadastro de profissionais (mailing) ──────────────────────────────────
-- Aqui o CPF vinha do relatório de mailing, associado ao código. O código
-- permanece; o CPF sai.

ALTER TABLE public.profissionais DROP COLUMN IF EXISTS cpf;

-- ─── 3. Conferência ──────────────────────────────────────────────────────────
-- Falha alto se sobrar qualquer coluna chamada cpf em public. Serve de rede
-- para o caso de alguma tabela ter sido criada fora destas migrations.
DO $$
DECLARE v_restantes TEXT;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ')
    INTO v_restantes
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND lower(column_name) LIKE '%cpf%';

  IF v_restantes IS NOT NULL THEN
    RAISE EXCEPTION 'Ainda existem colunas de CPF em public: %', v_restantes;
  END IF;
END $$;
