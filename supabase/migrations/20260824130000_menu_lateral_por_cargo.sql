-- ============================================================================
-- Ordem do menu lateral POR CARGO
-- ============================================================================
--
-- ## O que muda
--
-- `menu_lateral_ordem` guardava uma ordem por EMPRESA. O pedido e outro: cada
-- cargo trabalha em uma tela diferente, e a aba que o operador abre vinte vezes
-- por dia nao e a que a diretoria abre uma vez por semana. Uma ordem so obriga
-- os dois a conviverem com o compromisso do outro.
--
-- A tabela ganha `cargo`, e a chave primaria passa a ser (empresa_id, cargo).
--
-- ## A linha de cargo vazio e a ordem GERAL
--
-- `cargo = ''` e o padrao da empresa: vale para todo cargo que nao tem linha
-- propria. E o que faz a migracao ser sem perda — a ordem que ja existia vira a
-- geral, e ninguem acorda com o menu remontado.
--
-- Tambem e o que faz a tabela envelhecer bem: cargo novo no sistema nao precisa
-- de linha, ele herda a geral ate alguem decidir o contrario. Um `NULL` faria o
-- mesmo trabalho e estragaria a chave primaria (em Postgres, `NULL` nunca e
-- igual a `NULL`, e duas linhas «gerais» poderiam existir ao mesmo tempo).
--
-- ## O que a tabela continua NAO guardando
--
-- Rotulo, icone, permissao e quais abas existem. Isso e do codigo, que e a
-- fonte da verdade sobre o que o menu PODE ter. Aqui fica so a sequencia, e ela
-- e so apresentacao: reordenar nunca traz de volta uma aba que a permissao
-- escondeu. Inverter os dois passos transformaria uma preferencia visual em
-- concessao de acesso.
--
-- ## Quem pode o que
--
--   * ler ...... qualquer pessoa autenticada da empresa. Precisa: o menu e
--                montado no primeiro render, para todo mundo — e agora cada um
--                precisa enxergar tambem a linha do proprio cargo.
--   * escrever . somente super_admin, como antes.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.menu_lateral_ordem
  ADD COLUMN IF NOT EXISTS cargo TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.menu_lateral_ordem.cargo IS
  'Cargo dono desta ordem. String vazia = ordem GERAL da empresa, usada por '
  'todo cargo que nao tem linha propria.';

-- A chave primaria vira composta. `DO` porque o nome do constraint depende de
-- como a tabela foi criada, e um `DROP CONSTRAINT` cru falharia numa base onde
-- ele ja tenha outro nome.
DO $pk$
DECLARE
  v_nome TEXT;
BEGIN
  SELECT c.conname INTO v_nome
    FROM pg_constraint c
   WHERE c.conrelid = 'public.menu_lateral_ordem'::REGCLASS
     AND c.contype = 'p';

  -- Ja composta (migration reaplicada): nada a fazer.
  IF v_nome IS NOT NULL AND (
       SELECT COUNT(*) FROM pg_constraint c2
        WHERE c2.conname = v_nome AND c2.conrelid = 'public.menu_lateral_ordem'::REGCLASS
          AND array_length(c2.conkey, 1) = 2
     ) = 1 THEN
    RETURN;
  END IF;

  IF v_nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.menu_lateral_ordem DROP CONSTRAINT %I', v_nome);
  END IF;

  ALTER TABLE public.menu_lateral_ordem
    ADD CONSTRAINT menu_lateral_ordem_pkey PRIMARY KEY (empresa_id, cargo);
END
$pk$;

COMMENT ON TABLE public.menu_lateral_ordem IS
  'Ordem das abas do menu lateral, por empresa e por cargo. Guarda rotas, nao '
  'indices: aba nova cai no fim e aba removida vira entrada orfa ignorada pelo '
  'frontend. Linha com cargo = '''' e a ordem geral da empresa.';

-- As policies ja recortam por `empresa_id` e nao mencionam a chave primaria,
-- entao continuam valendo. Recriadas aqui so para a migration ser legivel
-- sozinha — quem for auditar o acesso encontra as tres no mesmo lugar.
DROP POLICY IF EXISTS menu_lateral_ordem_select ON public.menu_lateral_ordem;
CREATE POLICY menu_lateral_ordem_select ON public.menu_lateral_ordem FOR SELECT TO authenticated
USING (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS menu_lateral_ordem_insert ON public.menu_lateral_ordem;
CREATE POLICY menu_lateral_ordem_insert ON public.menu_lateral_ordem FOR INSERT TO authenticated
WITH CHECK (public.fn_user_is_super_admin() AND public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS menu_lateral_ordem_update ON public.menu_lateral_ordem;
CREATE POLICY menu_lateral_ordem_update ON public.menu_lateral_ordem FOR UPDATE TO authenticated
USING (public.fn_user_is_super_admin() AND public.fn_can_access_empresa(empresa_id))
WITH CHECK (public.fn_user_is_super_admin() AND public.fn_can_access_empresa(empresa_id));

-- Continua sem DELETE: «voltar ao padrao» e gravar um array vazio, e uma
-- politica a menos e uma porta a menos.

GRANT SELECT ON TABLE public.menu_lateral_ordem TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.menu_lateral_ordem TO authenticated;
REVOKE ALL ON TABLE public.menu_lateral_ordem FROM anon;

COMMIT;
