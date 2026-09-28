-- ============================================================================
-- Uma parcela por número, dentro do grupo — a trava que faltava
-- ============================================================================
--
-- ## Por que
--
-- Criar a próxima parcela (o botão de calendário, e o modal que abre ao marcar
-- pago) é um "confere e insere" feito no navegador, em três telas:
--
--   pages/Dashboard/index.tsx ................. handleReagendarDashboard
--   pages/Acordos/index.tsx ................... handleReagendarAcordos
--   components/AcordoDetalheInline/index.tsx .. handleReagendar
--
-- Os três fazem o mesmo: perguntam se já existe parcela com `numero_parcela =
-- atual + 1` naquele `acordo_grupo_id` e, se não, inserem. Entre a pergunta e
-- a resposta não há nada segurando a porta — dois cliques que atravessem juntos
-- (duas abas, dois operadores na mesma carteira, uma reconexão do Realtime que
-- reenvie a ação) passam os dois pelo `select` e inserem a parcela duas vezes.
--
-- Em 28/09/2026 o `acordos` tinha índice por (acordo_grupo_id, numero_parcela),
-- mas NÃO único: `idx_acordos_grupo_parcela`. A checagem do cliente era tudo.
--
-- ## O que este arquivo faz
--
-- Recusa a segunda linha no banco. A partir daqui o "confere" do cliente é
-- conveniência (dá a mensagem boa, «Parcela 3/5 já foi reagendada»), e a
-- garantia é do Postgres.
--
-- ## Antes de aplicar
--
-- Se já existir duplicidade, a criação do índice FALHA e a migration inteira
-- volta atrás — nada fica pela metade. O bloco abaixo lista o que está
-- duplicado ANTES de tentar, para o erro não ser uma surpresa. Conferir com:
--
--   select acordo_grupo_id, numero_parcela, count(*), array_agg(id)
--     from public.acordos
--    where acordo_grupo_id is not null
--    group by 1, 2 having count(*) > 1;
--
-- Cada grupo repetido precisa de decisão humana (qual linha vale, o que fazer
-- com a tabulação e a comissão da outra) — por isso nada é apagado aqui.
--
-- ## O que havia em produção quando isto entrou (29/09/2026)
--
-- Dois pares, e a corrida era real — não hipótese:
--
-- 1. Grupo 2d6c1cf6…, parcela 2 (LILIA M. DOS SANTOS, BookPlay). Duas linhas
--    IDÊNTICAS — R$ 6.000,00, vence 08/10, pendente — criadas em 08/09 às
--    11:41:28 com ONZE MILISSEGUNDOS de diferença. É o duplo clique passando
--    pelos dois lados do "confere e insere". Nenhuma paga, nenhuma tabulada, e
--    só `fcfb7d93…` tinha NR registrado.
--    → `dc15355d…`, a órfã, foi APAGADA. Nada apontava para ela.
--    (De quebra: o acordo é `pix_automatico` com 28 parcelas, o que já viola a
--    regra de recorrente. Com o `podeReagendar` de 28/09 o botão não aparece
--    mais nele.)
--
-- 2. Grupo 7b692bdd…, parcela 3 (MARIA SIMONE L. DE OLIVEIRA). Duas linhas
--    DIFERENTES e as DUAS `pago`: R$ 124,96 (5x, venc 07/07, pago em 07/07) e
--    R$ 205,49 (3x, venc 31/08). Discordavam até do tamanho do acordo.
--    → NÃO foi apagada nenhuma: apagar qualquer uma tiraria recebimento e
--      comissão de julho/agosto de uma pessoa real. `987fa825…` recebeu um
--      `acordo_grupo_id` NOVO (fa0e4576…) e virou grupo próprio. O grupo já
--      nascia na parcela 3, sem 1 nem 2 — a forma "nasceu no meio do plano"
--      que o detalhe do acordo já sabe mostrar. Os dois recebimentos seguem
--      de pé; se um dia se decidir que só um vale, é um DELETE de uma linha.
--
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

-- Diz o que impede, antes de o índice levantar o erro cru do Postgres.
do $$
DECLARE
  v_grupos  INT;
  v_linhas  INT;
  v_exemplo TEXT;
BEGIN
  SELECT count(*), COALESCE(sum(qtd), 0)
    INTO v_grupos, v_linhas
    FROM (SELECT count(*) AS qtd
            FROM public.acordos
           WHERE acordo_grupo_id IS NOT NULL
           GROUP BY acordo_grupo_id, numero_parcela
          HAVING count(*) > 1) d;

  IF v_grupos > 0 THEN
    SELECT string_agg(format('grupo %s parcela %s (%s linhas)', acordo_grupo_id, numero_parcela, qtd), '; ')
      INTO v_exemplo
      FROM (SELECT acordo_grupo_id, numero_parcela, count(*) AS qtd
              FROM public.acordos
             WHERE acordo_grupo_id IS NOT NULL
             GROUP BY acordo_grupo_id, numero_parcela
            HAVING count(*) > 1
             ORDER BY count(*) DESC
             LIMIT 5) d;

    RAISE EXCEPTION
      'Há % par(es) (grupo, parcela) duplicados, % linhas ao todo. Resolva antes: %',
      v_grupos, v_linhas, v_exemplo
      USING HINT = 'Ver a consulta no cabeçalho desta migration. Nada foi alterado.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_acordos_grupo_parcela
  ON public.acordos (acordo_grupo_id, numero_parcela)
  WHERE acordo_grupo_id IS NOT NULL;

COMMENT ON INDEX public.uq_acordos_grupo_parcela IS
  'Uma parcela por número dentro do grupo. Fecha a corrida entre o "confere e '
  'insere" das três telas que criam a próxima parcela (reagendamento). '
  'Migration 20260928230000.';

commit;
