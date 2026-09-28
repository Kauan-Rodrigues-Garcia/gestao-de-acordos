-- ============================================================================
-- O que a importação do 59 mexeu no que já estava lá
-- ============================================================================
--
-- ## O pedido (28/09/2026)
--
-- «Entre uma importação e outra pode sumir um NR, mudar um acordo, mudar o
-- valor, sair de uma pessoa, passar de uma pessoa para outra. Toda vez que o
-- 59 for importado, quero que seja avisado na aba de analítico.»
--
-- Para o OPERADOR: o que saiu da carteira dele, desde quando estava com ele, e
-- para quem foi — «caso ela queira verificar com a liderança por que foi
-- removido esse valor».
--
-- Para LÍDER / GERENTE / DIRETORIA: o movimento inteiro do escopo — de qual
-- operador saiu, para qual foi, e o valor de antes contra o de agora.
--
-- ## Não há tabela nova
--
-- `analitico_removidos` (20260914021223) já guarda a linha inteira em
-- `conteudo` jsonb toda vez que a sincronização apaga OU altera um registro:
--
--   fn_mestre_sincronizar_analitico_aplicar, passo 1 ... o que foi apagado
--   fn_mestre_sincronizar_analitico_aplicar, passo 2 ... a versão ANTIGA, antes
--                                                        do update
--   fn_mestre_aplicar_no_analitico_interno ........... a troca de fonte do setor
--
-- O «depois» é o próprio `analitico_recebimentos` de agora. Esta função cruza
-- os dois. Só leitura: não escreve nada, em lugar nenhum.
--
-- ## Por que uma função, e não a tabela direto
--
-- A RLS de `analitico_removidos` é `fn_can_access_empresa`: qualquer usuário da
-- empresa lê a tabela inteira. Para o operador, isso seria a carteira de todo
-- mundo. O escopo tem de ser aplicado aqui dentro, com a mesma régua de
-- `fn_analitico_resumo_por_operador` (escopo 3+ = tudo, 2 = setor, abaixo =
-- equipes de alcance + a própria linha), inclusive a correção de 28/09/2026
-- que faz o líder ter equipe (`fn_equipes_de_alcance`).
--
-- ## O «depois» é por NR + data, agregado
--
-- O mesmo NR na mesma data pode ter mais de uma linha (formas diferentes). O
-- depois soma o valor das linhas de hoje e toma como dono o da linha de maior
-- valor — desempate por `operador_id` para a resposta não variar entre
-- chamadas. Quando não sobra nenhuma linha, o NR sumiu: `valor_depois` nulo.
--
-- ## O que a função NÃO filtra
--
-- Ela devolve todo par antes/depois. Dizer o que é «removido», «transferido»
-- ou «valor alterado» — e o que não é notícia nenhuma (só mudou nome_cliente
-- ou a procedência de 58 para 59) — é de `services/analitico/mudancasImportacao.ts`,
-- onde a regra tem teste.
--
-- Cria uma função nova. Reexecutável. Nenhuma linha existente é tocada.
-- ============================================================================

begin;

set local lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_analitico_mudancas_do_mes(
  p_empresa_id uuid,
  p_mes        text,
  p_limite     integer DEFAULT 200
)
RETURNS TABLE(
  codigo               text,
  nome_cliente         text,
  data_pagamento       date,
  lote_id              uuid,
  ocorrido_em          timestamptz,
  operador_antes_id    uuid,
  operador_antes_nome  text,
  valor_antes          numeric,
  com_ele_desde        timestamptz,
  operador_depois_id   uuid,
  operador_depois_nome text,
  valor_depois         numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mes      DATE;
  v_escopo   INTEGER;
  v_equipes  UUID[] := '{}';
  v_setores  UUID[] := '{}';
  v_ops      UUID[] := '{}';
  v_limite   INTEGER := LEAST(GREATEST(COALESCE(p_limite, 200), 1), 500);
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('ver_analitico') THEN
    RETURN;
  END IF;

  v_mes    := (p_mes || '-01')::DATE;
  v_escopo := public.fn_user_escopo('analitico');

  -- Liderança inclusive: o cadastro sozinho deixava o líder sem equipe
  -- (20260928210000).
  v_equipes := ARRAY(SELECT public.fn_equipes_de_alcance(auth.uid()));
  v_setores := ARRAY(SELECT public.fn_setores_do_operador(auth.uid()));

  IF v_escopo = 2 AND cardinality(v_setores) > 0 THEN
    v_ops := ARRAY(
      SELECT pf.id FROM public.perfis pf WHERE pf.setor_id = ANY(v_setores)
      UNION
      SELECT c.operador_id
        FROM public.equipe_operadores_clones c
        JOIN public.equipes e ON e.id = c.equipe_id
       WHERE e.setor_id = ANY(v_setores)
    );
  ELSIF v_escopo < 2 AND cardinality(v_equipes) > 0 THEN
    v_ops := ARRAY(
      SELECT pf.id FROM public.perfis pf WHERE pf.equipe_id = ANY(v_equipes)
      UNION
      SELECT c.operador_id
        FROM public.equipe_operadores_clones c
       WHERE c.equipe_id = ANY(v_equipes)
      UNION
      SELECT auth.uid()
    );
  ELSIF v_escopo < 2 THEN
    v_ops := ARRAY[auth.uid()];
  END IF;

  RETURN QUERY
  WITH antes AS (
    SELECT r.codigo,
           r.data_pagamento,
           r.lote_id,
           r.removido_em,
           r.conteudo->>'nome_cliente'                       AS nome_cliente,
           NULLIF(r.conteudo->>'operador_id', '')::UUID      AS operador_id,
           COALESCE((r.conteudo->>'valor_recebido')::NUMERIC, 0) AS valor,
           NULLIF(r.conteudo->>'importado_em', '')::TIMESTAMPTZ  AS desde
      FROM public.analitico_removidos r
     WHERE r.empresa_id     = p_empresa_id
       AND r.mes_referencia = v_mes
       -- Linha devolvida pelo rollback não é mudança: voltou a ser o que era.
       AND r.restaurado_em IS NULL
       AND r.codigo IS NOT NULL
       AND r.data_pagamento IS NOT NULL
  ),
  -- O retrato de agora, por NR + data. O dono é o da linha de maior valor.
  depois AS (
    SELECT ar.codigo,
           ar.data_pagamento,
           SUM(ar.valor_recebido) AS valor,
           (ARRAY_AGG(ar.operador_id ORDER BY ar.valor_recebido DESC, ar.operador_id))[1] AS operador_id
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id     = p_empresa_id
       AND ar.mes_referencia = v_mes
     GROUP BY ar.codigo, ar.data_pagamento
  ),
  par AS (
    SELECT a.codigo, a.nome_cliente, a.data_pagamento, a.lote_id,
           a.removido_em, a.operador_id AS op_antes, a.valor AS val_antes,
           a.desde, d.operador_id AS op_depois, d.valor AS val_depois,
           -- Um NR pode ter sido mexido várias vezes no mês; a tela mostra a
           -- mais recente de cada, não a história inteira de cada um.
           ROW_NUMBER() OVER (
             PARTITION BY a.codigo, a.data_pagamento
             ORDER BY a.removido_em DESC) AS ordem
      FROM antes a
      LEFT JOIN depois d
        ON d.codigo = a.codigo AND d.data_pagamento = a.data_pagamento
  )
  SELECT p.codigo,
         p.nome_cliente,
         p.data_pagamento,
         p.lote_id,
         p.removido_em,
         p.op_antes,
         pa.nome,
         ROUND(p.val_antes, 2),
         p.desde,
         p.op_depois,
         pd.nome,
         ROUND(p.val_depois, 2)
    FROM par p
    LEFT JOIN public.perfis pa ON pa.id = p.op_antes
    LEFT JOIN public.perfis pd ON pd.id = p.op_depois
   WHERE p.ordem = 1
     -- Nada mudou de dinheiro nem de dono: a sincronização grava o retrato
     -- antigo por qualquer campo (nome, forma, procedência 58 → 59), e isso
     -- não é notícia. Cortado aqui para não trafegar milhares de linhas mudas.
     AND (p.val_depois IS NULL
          OR p.op_depois IS DISTINCT FROM p.op_antes
          OR ROUND(p.val_depois, 2) <> ROUND(p.val_antes, 2))
     AND (
       v_escopo >= 3
       OR p.op_antes  = ANY(v_ops)
       OR p.op_depois = ANY(v_ops)
     )
   ORDER BY p.removido_em DESC, p.codigo
   LIMIT v_limite;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_analitico_mudancas_do_mes(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_mudancas_do_mes(uuid, text, integer) TO authenticated;

COMMENT ON FUNCTION public.fn_analitico_mudancas_do_mes(uuid, text, integer) IS
  'O que a importação do 59 removeu, transferiu ou reavaliou no mês, já no '
  'escopo de quem pergunta. Cruza analitico_removidos (o antes, em conteudo '
  'jsonb) com analitico_recebimentos (o depois). Só leitura. A classificação e '
  'o texto ficam em services/analitico/mudancasImportacao.ts. '
  'Migration 20260929000000.';

commit;
