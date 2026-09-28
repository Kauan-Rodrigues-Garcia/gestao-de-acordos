-- ============================================================================
-- Card de mudanças do Analítico: só transferência e remoção, e só após 24 h
-- ============================================================================
--
-- ## O pedido (29/09/2026)
--
-- 1. «Valor alterado» sai. Algumas leituras de valor estavam erradas, e a
--    decisão foi retirar, não corrigir. Ficam só as duas notícias que
--    interessam: o NR saiu da pessoa (removido) ou foi para outra
--    (transferido).
--
-- 2. Transferido e removido só contam para linhas que estavam há MAIS DE 24
--    HORAS com a pessoa. «Se eu subo o 58, que está mais atualizado, e o 59
--    sobe depois e remove alguns valores, não é para aparecer — vai floodar.»
--    O que aparece e some no mesmo dia é o 58 e o 59 se acertando.
--
-- ## Como se mede «24 horas com a pessoa»
--
-- `analitico_removidos` guarda a linha inteira no momento em que ela saiu ou
-- mudou (`removido_em`), e dentro dela a hora em que aquela versão chegou
-- (`conteudo->>'importado_em'`). A diferença é o tempo de presença. Nenhuma
-- coluna nova, nenhuma tabela nova.
--
-- O corte do 58 (20260929000000) continua: o 58 é prévia, e o 59 descartar
-- uma prévia depois de dois dias passaria na régua das 24 h sem ser notícia.
--
-- Só troca a função. Só leitura. Reexecutável.
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
           r.conteudo->>'forma_pagamento'                    AS forma,
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
       -- O 58 é PRÉVIA, por contrato. Promovê-lo ao 59 (ou descartá-lo quando
       -- o 59 nunca confirma) é o pipeline funcionando, não alguém mexendo no
       -- recebimento de ninguém. Medido em 29/09/2026, no mês corrente:
       --
       --                      saindo do 58     já definitivo
       --   removido .............. 689 .............. 12
       --   transferido ........... 739 .............. 91
       --   valor alterado ....... 2804 ............. 105
       --
       -- Sem este corte o card entregava 4.232 avisos por mês, 96% deles
       -- rotina, e ninguém lia os 5% que importam.
       AND COALESCE(r.conteudo->>'procedencia', '') <> 'relatorio_58'
       -- 24 horas de presença (29/09/2026). A linha tem de ter ficado ao
       -- menos um dia com a pessoa antes de sair ou mudar de dono. O que
       -- aparece e some no mesmo dia é o 58 e o 59 se acertando, não notícia.
       --
       -- Filtrado AQUI, antes do ROW_NUMBER, de propósito: se o 59 mexeu no
       -- valor da linha duas horas antes de transferi-la, o retrato dessas
       -- duas horas não prova o dia, mas o retrato anterior prova — e é ele
       -- que tem de sobrar para o ranking escolher.
       AND NULLIF(r.conteudo->>'importado_em', '')::TIMESTAMPTZ
           <= r.removido_em - INTERVAL '24 hours'
  ),
  -- O retrato de agora, na MESMA chave do snapshot: NR + data + forma. A chave
  -- de `analitico_recebimentos` inclui a forma, e agrupar só por NR + data
  -- somava as formas de um mesmo pagamento contra o valor de uma linha só —
  -- toda conta de valor saía errada.
  depois AS (
    SELECT ar.codigo,
           ar.data_pagamento,
           ar.forma_pagamento AS forma,
           SUM(ar.valor_recebido) AS valor,
           (ARRAY_AGG(ar.operador_id ORDER BY ar.valor_recebido DESC, ar.operador_id))[1] AS operador_id
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id     = p_empresa_id
       AND ar.mes_referencia = v_mes
     GROUP BY ar.codigo, ar.data_pagamento, ar.forma_pagamento
  ),
  par AS (
    SELECT a.codigo, a.nome_cliente, a.data_pagamento, a.lote_id,
           a.removido_em, a.operador_id AS op_antes, a.valor AS val_antes,
           a.desde, d.operador_id AS op_depois, d.valor AS val_depois,
           -- Um NR pode ter sido mexido várias vezes no mês; a tela mostra a
           -- mais recente de cada, não a história inteira de cada um.
           ROW_NUMBER() OVER (
             PARTITION BY a.codigo, a.data_pagamento, a.forma
             ORDER BY a.removido_em DESC) AS ordem
      FROM antes a
      LEFT JOIN depois d
        ON d.codigo = a.codigo
       AND d.data_pagamento = a.data_pagamento
       AND d.forma IS NOT DISTINCT FROM a.forma
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
     -- Só as duas notícias: o NR sumiu, ou mudou de dono. «Valor alterado»
     -- saiu em 29/09/2026 — a leitura de valor entre retratos dava números
     -- errados, e a pedido foi retirada em vez de corrigida.
     AND (p.val_depois IS NULL
          OR p.op_depois IS DISTINCT FROM p.op_antes)
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
  'Remoções e transferências que a importação do 59 fez no mês, já no escopo '
  'de quem pergunta. Só linhas que estavam há mais de 24 h com a pessoa. Sem '
  'valor alterado. O 58 fica de fora (é prévia). Só leitura. '
  'Migrations 20260929000000 e 20260929020000.';

commit;
