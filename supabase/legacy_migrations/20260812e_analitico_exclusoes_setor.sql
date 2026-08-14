-- ═══════════════════════════════════════════════════════════════════════════
-- 20260812e — Composição do acumulado: quais origens contam no total do setor
-- ═══════════════════════════════════════════════════════════════════════════
-- ## O problema
--
-- A regra do acumulado é "o total do setor é exatamente o total do relatório
-- que ele importou". Ela vale enquanto o relatório do setor traz só o pessoal
-- do setor — e o ERP nem sempre coopera. Em agosto/2026 o relatório do Play 5
-- veio com 2 linhas de operadores de outros setores (Play Mix Marília e
-- Play 4), R$ 1.933,21 que o card do Play 5 passou a mostrar como se fossem
-- dele.
--
-- Duas saídas ruins foram consideradas e descartadas:
--
--   • mudar a regra de soma no código para o Play 5 — hardcode de um caso
--     temporário, que só sai com deploy no dia em que o ERP se ajeitar;
--   • uma chave no cadastro do setor — melhor, mas o motivo fica escondido num
--     formulário longe do número que ele muda.
--
-- ## O que esta tabela guarda
--
-- Uma linha por origem EXCLUÍDA do total de um setor num mês. A tela mostra,
-- embaixo do acumulado, a lista das origens que apareceram no relatório com o
-- valor de cada uma, todas marcadas por padrão; desmarcar grava uma linha aqui.
--
-- Consequências que a tela precisa deixar visíveis (e deixa):
--
--   1. Ausência de linha = tudo conta. Aplicar a migration não muda número
--      nenhum, e nenhum backfill é necessário.
--   2. Dinheiro excluído NÃO migra para o setor de origem: o card daquele setor
--      soma o carimbo do relatório DELE, e mexer nisso quebraria a mesma regra
--      do outro lado. O valor continua no total da EMPRESA e some apenas dos
--      totais por setor — por isso a tela mostra quanto foi tirado.
--   3. A escolha é por MÊS. Reimportar o relatório não a apaga (ela não vive
--      nas linhas do analítico), e o mês seguinte começa limpo — que é o
--      comportamento certo para um problema temporário: ele expira sozinho.
--
-- `setor_origem_id NULL` = linhas sem operador (órfãs). Elas não têm setor de
-- origem: pertencem a quem importou. Ficam na lista para poderem ser tiradas
-- também, e o NULL é a chave delas.
--
-- Idempotente. Tabela minúscula (no máximo uma linha por origem/setor/mês).

CREATE TABLE IF NOT EXISTS public.analitico_exclusoes_setor (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Setor DONO do card — aquele cujo acumulado está sendo composto.
  setor_id         UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  -- 'yyyy-MM' — mesmo formato de `contribuicao_receptivo` e da navegação da aba.
  mes              TEXT NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  -- Setor de ORIGEM do operador cujas linhas saem do total. NULL = sem operador.
  setor_origem_id  UUID REFERENCES public.setores(id) ON DELETE CASCADE,
  excluido_por     UUID REFERENCES public.perfis(id)  ON DELETE SET NULL,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- UNIQUE com COALESCE: em índice único, NULL nunca é igual a NULL, então sem o
-- sentinel a linha das órfãs poderia ser gravada N vezes e a tela mostraria o
-- mesmo item repetido. O UUID nulo não existe em `setores` — não colide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_analitico_exclusoes_unq
  ON public.analitico_exclusoes_setor (
    empresa_id, setor_id, mes,
    COALESCE(setor_origem_id, '00000000-0000-0000-0000-000000000000'::UUID)
  );

-- Serve a leitura da tela: WHERE empresa_id = $ AND mes = $ (todos os setores
-- de uma vez, porque diretoria/admin renderiza vários em sequência).
CREATE INDEX IF NOT EXISTS idx_analitico_exclusoes_empresa_mes
  ON public.analitico_exclusoes_setor (empresa_id, mes);

ALTER TABLE public.analitico_exclusoes_setor ENABLE ROW LEVEL SECURITY;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Chamadas de sessão embrulhadas em (SELECT ...) para virarem InitPlan — mesmo
-- padrão de 20260726a/20260729a/20260730a.

-- Leitura: qualquer usuário da empresa. Sem isso o operador veria um acumulado
-- diferente do que o líder vê, que é o defeito que esta tabela existe para não
-- criar.
DROP POLICY IF EXISTS "analitico_exclusoes_select" ON public.analitico_exclusoes_setor;
CREATE POLICY "analitico_exclusoes_select" ON public.analitico_exclusoes_setor
  FOR SELECT USING (
    (SELECT public.fn_user_is_super_admin())
    OR empresa_id = (SELECT public.fn_user_empresa_id())
  );

-- Escrita: líder e acima — mesmo público que importa o relatório e responde
-- pelo número do setor.
DROP POLICY IF EXISTS "analitico_exclusoes_insert" ON public.analitico_exclusoes_setor;
CREATE POLICY "analitico_exclusoes_insert" ON public.analitico_exclusoes_setor
  FOR INSERT WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']))
  );

DROP POLICY IF EXISTS "analitico_exclusoes_delete" ON public.analitico_exclusoes_setor;
CREATE POLICY "analitico_exclusoes_delete" ON public.analitico_exclusoes_setor
  FOR DELETE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']))
  );

-- Sem política de UPDATE de propósito: a linha não tem o que atualizar. Marcar
-- de volta é apagá-la, e a trilha então mostra "incluiu" e "excluiu" em vez de
-- uma edição sem antes e depois.

-- ─── Auditoria (Logs 2.0, 20260812a) ────────────────────────────────────────
-- Tirar dinheiro do acumulado de um setor muda o número que a diretoria lê.
-- Tem que ter dono e hora. `severidade = aviso`: não é incidente, mas é o tipo
-- de mudança que alguém vai querer explicar depois.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_log_auditoria'
  ) THEN
    DROP TRIGGER IF EXISTS trg_log_analitico_exclusoes_setor ON public.analitico_exclusoes_setor;
    CREATE TRIGGER trg_log_analitico_exclusoes_setor
      AFTER INSERT OR DELETE ON public.analitico_exclusoes_setor
      FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
        'importacao',            -- categoria
        'analitico_exclusao',    -- slug da ação
        'a origem no acumulado', -- substantivo da frase
        'mes',                   -- colunas do rótulo
        '',                      -- ignorar
        'empresa_id',            -- coluna do tenant
        'aviso'                  -- severidade
      );
  ELSE
    RAISE NOTICE 'fn_log_auditoria ausente (20260812a não aplicada) — exclusões ficam sem trilha.';
  END IF;
END $$;

-- ─── Conferência ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_politicas INT;
BEGIN
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'analitico_exclusoes_setor';

  IF v_politicas < 3 THEN
    RAISE EXCEPTION
      'analitico_exclusoes_setor com % política(s) — esperado ao menos 3 '
      '(select/insert/delete).', v_politicas;
  END IF;

  RAISE NOTICE 'analitico_exclusoes_setor pronta: % políticas, tabela vazia (nada muda até alguém desmarcar).', v_politicas;
END $$;
