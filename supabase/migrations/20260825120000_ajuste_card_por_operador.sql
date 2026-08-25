-- ============================================================================
-- 20260825120000_ajuste_card_por_operador.sql
--
-- Ajuste de recebimento: de LANCAMENTOS avulsos para UM CARD por operador.
--
-- ## O que mudou, e por que
--
-- O desenho de 20260823150000 gravava um lancamento por vez e proibia o lider
-- de editar: para mudar, ele abria uma solicitacao e o administrador decidia.
-- Na pratica isso produziu dois defeitos em menos de 48 horas.
--
-- O primeiro e de ROTINA. A lideranca nao lanca "o que entrou hoje" — ela sabe
-- quanto a pessoa tem ACUMULADO no mes e quer corrigir esse numero. Somar por
-- dia obriga a fazer a subtracao de cabeca antes de digitar, todo dia.
--
-- O segundo e mais grave, e e de VISIBILIDADE. A policy `ajustes_select`
-- deixava o lider ver so o que ele mesmo lancou. Em 24/08 a Brenda lancou o
-- recebimento do PLAYMIX para sete operadores do Play 5; em 25/08 o Amauri
-- lancou de novo para tres deles, porque a tela mostrava aquelas pessoas como
-- se nao tivessem nada. Milena Lima ficou com 11.948,13 + 11.948,00 = 23.896,13
-- no recebimento — e o numero subiu para o Play 5, para o Amauri Digital via
-- clone, e para os Quartis. R$ 13.178,63 a mais, em producao, sem ninguem
-- errar de digitacao.
--
-- A correcao dos dois e a mesma: UM card por operador por mes, visivel para
-- todo lider que enxerga aquela pessoa, com o valor TOTAL na linha. Duas
-- pessoas abrindo o mesmo card nao criam dois valores — elas editam o mesmo.
--
-- ## O que este arquivo faz, em ordem
--
--   1. consolida os lancamentos duplicados que ja existem (mantem o MAIOR);
--   2. cria a trava: UNIQUE (empresa, operador, mes) para os nao-cancelados;
--   3. cria `analitico_ajustes_eventos` e o gatilho que a alimenta sozinha;
--   4. reescreve a RLS para o card compartilhado;
--   5. apaga `analitico_ajustes_solicitacoes`.
--
-- ## O que NAO mudou
--
-- `analitico_recebimentos` continua intocado, o valor continua somado na
-- LEITURA, e os quatro pontos de injecao em `analitico.service.ts` continuam os
-- mesmos. `somasPorOperador` segue somando linhas por operador — a diferenca e
-- que agora e sempre uma linha. Nenhuma tela de leitura precisou mudar.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Consolidacao dos duplicados que ja existem ───────────────────────────
--
-- Regra escolhida pelo Cleber em 25/08: fica o MAIOR valor de cada operador.
-- Nao e arbitrario — os lancamentos da Brenda vieram do relatorio do PLAYMIX e
-- tem centavos (11.948,13); os do Amauri sao os valores redondos digitados de
-- memoria (11.948,00). O maior e, nos tres casos, o que veio do relatorio.
--
-- Empate resolve pelo mais antigo: sem criterio de desempate o `DISTINCT ON`
-- escolheria por ordem fisica da tabela, que muda a cada VACUUM.
--
-- O perdedor e CANCELADO, nao apagado. Ele fica com autor, data e o motivo do
-- cancelamento — e o card novo vai mostra-lo no historico. Alguem vai perguntar
-- em outubro por que o recebimento da Milena caiu 11.948 num dia.

WITH ranqueados AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY empresa_id, operador_id, mes_referencia
           ORDER BY valor DESC, criado_em ASC
         ) AS posicao
    FROM public.analitico_ajustes_manuais
   WHERE NOT cancelado
)
UPDATE public.analitico_ajustes_manuais a
   SET cancelado           = TRUE,
       cancelado_em        = NOW(),
       motivo_cancelamento = 'Consolidado no card unico do operador (migration '
                          || '20260825120000). Havia mais de um lancamento para '
                          || 'a mesma pessoa no mesmo mes; ficou o de maior valor.',
       atualizado_em       = NOW()
  FROM ranqueados r
 WHERE a.id = r.id
   AND r.posicao > 1;

-- ── 2. A trava ──────────────────────────────────────────────────────────────
--
-- Esta linha e o conserto de verdade. Enquanto "nao existe duplicata" for
-- disciplina de quem usa a tela, ela volta na primeira semana movimentada; como
-- constraint, o segundo INSERT simplesmente falha e o servico manda a pessoa
-- abrir o card que ja existe.
--
-- Parcial (`WHERE NOT cancelado`) porque o historico precisa poder guardar
-- varios cancelados do mesmo operador no mesmo mes — inclusive os que a etapa 1
-- acabou de produzir.

CREATE UNIQUE INDEX IF NOT EXISTS ux_ajuste_card_por_operador_mes
  ON public.analitico_ajustes_manuais (empresa_id, operador_id, mes_referencia)
  WHERE NOT cancelado;

COMMENT ON INDEX public.ux_ajuste_card_por_operador_mes IS
  'Um card por operador por mes. Ver 20260825120000: a ausencia desta trava '
  'custou R$ 13.178,63 de recebimento inflado em agosto/2026.';

-- ── 3. O historico ──────────────────────────────────────────────────────────
--
-- "Ontem estava 5 mil, hoje coloco 6 mil, e o card mostra que hoje entrou mil."
-- Essa conta precisa de memoria: a linha guarda o valor ATUAL, e a diferenca so
-- existe se o valor anterior tiver sido registrado em algum lugar.
--
-- Tabela separada, e nao um JSONB na propria linha, porque o historico e
-- append-only e cresce: um array que a aplicacao reescreve a cada edicao perde
-- entradas quando duas pessoas salvam junto — que e exatamente o cenario do
-- card compartilhado.

CREATE TABLE IF NOT EXISTS public.analitico_ajustes_eventos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ajuste_id      UUID NOT NULL REFERENCES public.analitico_ajustes_manuais(id) ON DELETE CASCADE,
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,

  tipo           TEXT NOT NULL CHECK (tipo IN ('criado', 'atualizado', 'cancelado')),

  -- NULL na criacao: nao havia valor antes.
  valor_anterior NUMERIC(14,2),
  valor_novo     NUMERIC(14,2),
  -- Gravado, e nao calculado na leitura, porque e ele que a tela mostra em
  -- destaque ("+1.000,00 hoje") e porque `valor_novo - valor_anterior` com NULL
  -- daria NULL justamente na criacao, que e a primeira linha do historico.
  delta          NUMERIC(14,2),

  observacao     TEXT,

  autor_id       UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  autor_nome     TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.analitico_ajustes_eventos IS
  'Historico append-only de um card de ajuste. Escrito por gatilho, nunca pela '
  'aplicacao. Ver 20260825120000.';

-- A leitura e sempre "o historico DESTE card, do mais novo para o mais velho".
CREATE INDEX IF NOT EXISTS idx_ajustes_eventos_do_card
  ON public.analitico_ajustes_eventos (ajuste_id, criado_em DESC);

-- ── O gatilho ───────────────────────────────────────────────────────────────
--
-- No banco, e nao no `ajusteManual.service.ts`, por um motivo so: historico que
-- depende da aplicacao lembrar de escrever e historico com buracos. Qualquer
-- caminho que altere o valor — a tela, um script de correcao, um UPDATE manual
-- no SQL editor as duas da manha — deixa rastro.
--
-- O autor sai dos campos que a propria linha ja carrega (`criado_por`,
-- `editado_por`, `cancelado_por`) em vez de `auth.uid()`: assim um UPDATE
-- administrativo feito fora da sessao de alguem ainda grava um evento, com
-- autor nulo, em vez de falhar ou mentir.

CREATE OR REPLACE FUNCTION public.fn_ajuste_registrar_evento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.analitico_ajustes_eventos
      (ajuste_id, empresa_id, tipo, valor_anterior, valor_novo, delta,
       observacao, autor_id, autor_nome)
    VALUES
      (NEW.id, NEW.empresa_id, 'criado', NULL, NEW.valor, NEW.valor,
       NEW.motivo, NEW.criado_por, NEW.criado_por_nome);
    RETURN NEW;
  END IF;

  -- Cancelamento vem antes da mudanca de valor: cancelar E o evento, mesmo que
  -- o valor tenha sido mexido no mesmo UPDATE.
  IF NEW.cancelado AND NOT OLD.cancelado THEN
    INSERT INTO public.analitico_ajustes_eventos
      (ajuste_id, empresa_id, tipo, valor_anterior, valor_novo, delta,
       observacao, autor_id, autor_nome)
    VALUES
      (NEW.id, NEW.empresa_id, 'cancelado', OLD.valor, 0, -OLD.valor,
       NEW.motivo_cancelamento, NEW.cancelado_por, NEW.cancelado_por_nome);
    RETURN NEW;
  END IF;

  IF NEW.valor IS DISTINCT FROM OLD.valor THEN
    INSERT INTO public.analitico_ajustes_eventos
      (ajuste_id, empresa_id, tipo, valor_anterior, valor_novo, delta,
       observacao, autor_id, autor_nome)
    VALUES
      (NEW.id, NEW.empresa_id, 'atualizado', OLD.valor, NEW.valor,
       NEW.valor - OLD.valor,
       NULLIF(BTRIM(COALESCE(NEW.motivo, '')), OLD.motivo),
       NEW.editado_por, NEW.editado_por_nome);
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_ajuste_evento ON public.analitico_ajustes_manuais;
CREATE TRIGGER trg_ajuste_evento
  AFTER INSERT OR UPDATE ON public.analitico_ajustes_manuais
  FOR EACH ROW EXECUTE FUNCTION public.fn_ajuste_registrar_evento();

-- ── Semeadura do historico do que ja existe ─────────────────────────────────
--
-- Os 13 lancamentos de agosto sao anteriores ao gatilho. Sem esta semeadura o
-- card abriria com "nenhum historico" para linhas que claramente tem uma
-- criacao — e a primeira coisa que o lider faria era desconfiar da tela.
--
-- O cancelamento que a etapa 1 produziu tambem entra, com o motivo que ela
-- escreveu: e a explicacao de para onde foram os 13 mil.

INSERT INTO public.analitico_ajustes_eventos
  (ajuste_id, empresa_id, tipo, valor_anterior, valor_novo, delta,
   observacao, autor_id, autor_nome, criado_em)
SELECT a.id, a.empresa_id, 'criado', NULL, a.valor, a.valor,
       a.motivo, a.criado_por, a.criado_por_nome, a.criado_em
  FROM public.analitico_ajustes_manuais a
 WHERE NOT EXISTS (
   SELECT 1 FROM public.analitico_ajustes_eventos e
    WHERE e.ajuste_id = a.id AND e.tipo = 'criado'
 );

INSERT INTO public.analitico_ajustes_eventos
  (ajuste_id, empresa_id, tipo, valor_anterior, valor_novo, delta,
   observacao, autor_id, autor_nome, criado_em)
SELECT a.id, a.empresa_id, 'cancelado', a.valor, 0, -a.valor,
       a.motivo_cancelamento, a.cancelado_por, a.cancelado_por_nome,
       COALESCE(a.cancelado_em, a.atualizado_em)
  FROM public.analitico_ajustes_manuais a
 WHERE a.cancelado
   AND NOT EXISTS (
     SELECT 1 FROM public.analitico_ajustes_eventos e
      WHERE e.ajuste_id = a.id AND e.tipo = 'cancelado'
   );

-- ── 4. RLS: o card compartilhado ────────────────────────────────────────────
--
-- A regra nova, em uma frase: **quem enxerga a pessoa, enxerga e edita o card
-- dela**. "Enxergar a pessoa" e `fn_setores_do_operador`, que ja existe desde
-- 20260731e e ja resolve clone — o setor proprio MAIS os setores das equipes
-- onde ela e clone. E por isso que o Amauri passa a ver o card da Milena: ela e
-- do Play 5 e clone no Amauri Digital.
--
-- Nenhuma lista de cargo escrita aqui. Quem manda continua sendo o painel de
-- permissoes, via `fn_user_tem`.

-- Predicado unico, para as tres policies nao divergirem com o tempo — que e
-- exatamente como as quatro listas de "quem pode autorizar tabulacao"
-- divergiram em agosto/2026.
CREATE OR REPLACE FUNCTION public.fn_ajuste_no_meu_alcance(p_operador UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT
    -- Quem administra ve a empresa inteira.
    public.fn_user_tem('ajuste_recebimento_administrar')
    -- O piso de sempre: a pessoa ve o que caiu no proprio recebimento.
    OR p_operador = auth.uid()
    -- E a lideranca ve quem ela supervisiona, clone incluido.
    OR (
      public.fn_user_tem('ajuste_recebimento_lancar')
      AND public.fn_user_setor_id() IS NOT NULL
      AND public.fn_user_setor_id() IN (
        SELECT s FROM public.fn_setores_do_operador(p_operador) s
      )
    );
$fn$;

COMMENT ON FUNCTION public.fn_ajuste_no_meu_alcance(UUID) IS
  'Quem enxerga a pessoa, enxerga o card dela. Usada pelas policies de '
  'analitico_ajustes_manuais e _eventos. Ver 20260825120000.';

DROP POLICY IF EXISTS ajustes_select ON public.analitico_ajustes_manuais;
CREATE POLICY ajustes_select ON public.analitico_ajustes_manuais
  FOR SELECT TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_ajuste_no_meu_alcance(operador_id)
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
    AND public.fn_ajuste_no_meu_alcance(operador_id)
    -- O autor e sempre quem esta logado. Sem isto a trilha nao vale nada.
    AND criado_por = auth.uid()
  );

-- A mudanca central desta migration: editar e cancelar deixam de exigir
-- `_administrar`. O lider edita o card de quem ele supervisiona, direto, e o
-- gatilho registra. Era a autonomia pedida — e a alternativa (pedir ao admin)
-- ja se mostrou pior: o pedido some numa fila e o numero fica errado na tela
-- enquanto isso.
DROP POLICY IF EXISTS ajustes_update ON public.analitico_ajustes_manuais;
CREATE POLICY ajustes_update ON public.analitico_ajustes_manuais
  FOR UPDATE TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      public.fn_user_tem('ajuste_recebimento_lancar')
      OR public.fn_user_tem('ajuste_recebimento_administrar')
    )
    AND public.fn_ajuste_no_meu_alcance(operador_id)
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_ajuste_no_meu_alcance(operador_id)
  );

-- DELETE continua sem policy: "apagar" na tela e cancelar aqui. O card some da
-- lista, o valor para de somar, e a linha fica para quem for auditar.

ALTER TABLE public.analitico_ajustes_eventos ENABLE ROW LEVEL SECURITY;

-- O historico segue a visibilidade do card, sempre. Escrita e so do gatilho
-- (SECURITY DEFINER): nenhuma policy de INSERT/UPDATE/DELETE, de proposito —
-- historico que a aplicacao consegue reescrever nao e historico.
DROP POLICY IF EXISTS ajustes_eventos_select ON public.analitico_ajustes_eventos;
CREATE POLICY ajustes_eventos_select ON public.analitico_ajustes_eventos
  FOR SELECT TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND EXISTS (
      SELECT 1 FROM public.analitico_ajustes_manuais a
       WHERE a.id = ajuste_id
         AND public.fn_ajuste_no_meu_alcance(a.operador_id)
    )
  );

-- ── Realtime ────────────────────────────────────────────────────────────────
-- O card e compartilhado: se a Brenda edita, a tela do Amauri precisa mudar
-- sozinha. Sem isso, o card compartilhado so resolve a duplicata depois de um F5.
ALTER TABLE public.analitico_ajustes_eventos REPLICA IDENTITY FULL;

DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.analitico_ajustes_eventos;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$realtime$;

-- ── 5. Fim das solicitacoes ─────────────────────────────────────────────────
--
-- A tabela existia para o lider PEDIR o que agora ele faz. Com a edicao direta,
-- ela nao tem mais funcao: manter as duas portas produziria codigo morto com
-- tela — o pedido morre de desuso e alguem o encontra em 2027 sem saber se
-- ainda vale.
--
-- Decisao do Cleber em 25/08, ciente de que os 6 pedidos registrados vao junto.

DROP TABLE IF EXISTS public.analitico_ajustes_solicitacoes;

COMMIT;
