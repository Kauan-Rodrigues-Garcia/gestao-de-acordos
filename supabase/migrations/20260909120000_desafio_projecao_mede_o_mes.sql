-- ═══════════════════════════════════════════════════════════════════════════
-- A projeção do desafio mede o MÊS, como Desempenho Equipes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que estava errado
--
-- Na corrida de projeção o ranking compara duas coisas medidas em janelas
-- diferentes:
--
--   • o RECEBIDO vem de `fn_desafio_dados`, que soma
--     `data_pagamento BETWEEN data_inicio AND data_fim` — a janela da CAMPANHA;
--
--   • o ESPERADO vem de `alvoDaEquipe` → `calcularProjecao`, que é
--     `meta mensal ÷ dias úteis do MÊS × dias úteis decorridos DO MÊS` —
--     contados a partir do dia 1.
--
-- Campanha que não começa no dia 1º compara caixa parcial contra meta cheia
-- até hoje. O erro não é aleatório: ele é sempre para baixo, e cresce quanto
-- mais tarde a campanha começa. Uma campanha aberta no dia 8 de um mês de 22
-- dias úteis perde os cinco primeiros — a projeção de todo mundo cai cerca de
-- 23% sem que ninguém tenha produzido menos, e o quadro fica vermelho por
-- defeito de régua.
--
-- E, pior que o número errado: ele NÃO BATE com Desempenho Equipes, que é a
-- tela de onde a meta saiu. As duas medem a mesma equipe, no mesmo mês, contra
-- a mesma meta, e respondem diferente.
--
-- ## A correção
--
-- Quando a meta vem da equipe (`meta_equipe` e `projecao_equipe`), a meta é
-- MENSAL. O recebido tem de ser mensal também. Esta função passa a devolver
-- `recebido_mes`: a soma por operador do mês inteiro da meta — o mesmo mês que
-- já define `metas`, `metas_config_mes` e os dias úteis daqui.
--
-- O cliente usa esse mapa no lugar do recorte da campanha SÓ nesses dois
-- modos, que são os únicos em que o alvo é mensal. Campanha de operação
-- (`fonteMeta = 'individual'`) não chama esta função e não muda de número.
--
-- Mês inteiro, e não «até data_fim»: é o que Desempenho Equipes mostra, e é o
-- pedido — as duas telas têm de dizer a mesma coisa. Num mês já fechado os
-- dias decorridos igualam os dias úteis do mês, então a leitura fecha sozinha.
--
-- ## Por que aqui, e não em `fn_desafio_dados`
--
-- Porque é aqui que a projeção já mora. `fn_desafio_dados` serve TODA campanha
-- e não deve pagar por uma segunda agregação que a esmagadora maioria delas
-- ignora; esta função só é chamada quando `usaMetaDaEquipe(regra)` é
-- verdadeiro. Os portões são os mesmos três de `fn_desafio_dados`, já escritos
-- abaixo: quem não vê o quadro não vê o contexto.
--
-- A fonte é a MESMA de sempre — `analitico_recebimentos`, mesmo
-- `data_pagamento`, mesmo `operador_id`. O desafio continua sem somar nada por
-- conta própria.

CREATE OR REPLACE FUNCTION public.fn_desafio_contexto_equipe(p_desafio_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_desafio    public.desafios%ROWTYPE;
  v_empresas   UUID[];
  v_ano        INT;
  v_mes        INT;
  v_ini        DATE;
  v_fim        DATE;
  v_metas      JSONB;
  v_equipe_emp JSONB;
  v_config     JSONB;
  v_receb_mes  JSONB;
BEGIN
  SELECT * INTO v_desafio FROM public.desafios WHERE id = p_desafio_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_empresas := public.fn_desafio_empresas(v_desafio.empresa_id, v_desafio.empresas);

  -- ── Os mesmos três portões de fn_desafio_dados ────────────────────────────
  IF NOT public.fn_desafio_alcanca_empresa(v_empresas) THEN
    RETURN NULL;
  END IF;

  IF v_desafio.status = 'rascunho'
     AND NOT public.fn_user_tem('desafios_configurar')
     AND NOT public.fn_user_tem('desafios_configurar_setor') THEN
    RETURN NULL;
  END IF;

  IF NOT public.fn_desafio_no_meu_alcance(
           v_desafio.setor_id, v_desafio.regra, v_desafio.visibilidade) THEN
    RETURN NULL;
  END IF;

  v_ano := EXTRACT(YEAR  FROM v_desafio.data_fim)::INT;
  v_mes := EXTRACT(MONTH FROM v_desafio.data_fim)::INT;
  v_ini := make_date(v_ano, v_mes, 1);
  v_fim := (v_ini + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Meta mensal por equipe. `meta_valor > 0` porque equipe com meta zero é
  -- equipe sem meta — é assim que o cliente já lia.
  SELECT COALESCE(jsonb_object_agg(m.referencia_id, m.meta_valor), '{}'::JSONB)
    INTO v_metas
    FROM public.metas m
   WHERE m.empresa_id = ANY (v_empresas)
     AND m.tipo       = 'equipe'
     AND m.mes        = v_mes
     AND m.ano        = v_ano
     AND m.meta_valor > 0;

  -- De qual empresa é cada equipe — é o que liga a equipe à régua de dias
  -- úteis dela. Só as equipes que têm meta interessam.
  SELECT COALESCE(jsonb_object_agg(e.id, e.empresa_id), '{}'::JSONB)
    INTO v_equipe_emp
    FROM public.equipes e
   WHERE e.empresa_id = ANY (v_empresas)
     AND v_metas ? e.id::TEXT;

  -- Feriados e `contar_dia_atual` de cada empresa do desafio. Empresa sem
  -- linha de config não aparece; o cliente trata a ausência como «sem feriado
  -- e sem contar o dia atual», que é o padrão de `getMetasConfig`.
  SELECT COALESCE(jsonb_object_agg(c.empresa_id, jsonb_build_object(
           'feriados',         COALESCE(c.feriados, '[]'::JSONB),
           'contar_dia_atual', COALESCE(c.contar_dia_atual, FALSE)
         )), '{}'::JSONB)
    INTO v_config
    FROM public.metas_config_mes c
   WHERE c.empresa_id = ANY (v_empresas)
     AND c.mes = v_mes
     AND c.ano = v_ano;

  -- O recebido do MÊS por operador — o par do `esperado` daqui. Ver o
  -- cabeçalho: é o que faz o desafio e Desempenho Equipes darem o mesmo
  -- número.
  --
  -- Por OPERADOR, e não por equipe, porque quem decide a que equipe cada
  -- pessoa pertence é o elenco montado no cliente (`equipes`, que já inclui os
  -- clones com `conta_recebimento` ligado). Agregar por equipe aqui seria a
  -- segunda definição de «quem está nesta equipe», e as duas divergiriam no
  -- primeiro clone novo.
  SELECT COALESCE(jsonb_object_agg(t.operador_id, jsonb_build_object(
           'total', t.total, 'qtd', t.qtd
         )), '{}'::JSONB)
    INTO v_receb_mes
    FROM (
      SELECT ar.operador_id,
             SUM(ar.valor_recebido)::NUMERIC AS total,
             COUNT(*)::BIGINT                AS qtd
        FROM public.analitico_recebimentos ar
       WHERE ar.empresa_id      = ANY (v_empresas)
         AND ar.operador_id    IS NOT NULL
         AND ar.data_pagamento >= v_ini
         AND ar.data_pagamento <= v_fim
       GROUP BY ar.operador_id
    ) t;

  RETURN jsonb_build_object(
    'mes',            v_mes,
    'ano',            v_ano,
    'empresas',       to_jsonb(v_empresas),
    'metas',          v_metas,
    'equipe_empresa', v_equipe_emp,
    'config',         v_config,
    'recebido_mes',   v_receb_mes
  );
END;
$function$;

-- `anon` não tem o que fazer aqui: desafio é tela de gente logada, e a função
-- é SECURITY DEFINER — deixá-la aberta ao anônimo seria abrir a meta de todas
-- as empresas para quem tem só a chave pública.
REVOKE ALL ON FUNCTION public.fn_desafio_contexto_equipe(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_contexto_equipe(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_desafio_contexto_equipe(UUID) IS
  'Metas de equipe, config de dias uteis e RECEBIDO DO MES das empresas DO '
  'desafio, para a projecao do ranking. O recebido do mes existe porque a meta '
  'que sai daqui e mensal: medi-la contra o recorte da campanha compararia '
  'janelas diferentes, e o numero nao bateria com Desempenho Equipes. Repete '
  'os tres portoes de fn_desafio_dados: quem nao ve o quadro nao ve o contexto.';

-- ── Guarda ──────────────────────────────────────────────────────────────────
DO $guarda$
BEGIN
  IF to_regprocedure('public.fn_desafio_contexto_equipe(uuid)') IS NULL THEN
    RAISE EXCEPTION 'fn_desafio_contexto_equipe nao foi criada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public'
       AND routine_name   = 'fn_desafio_contexto_equipe'
       AND grantee        = 'anon'
  ) THEN
    RAISE EXCEPTION 'fn_desafio_contexto_equipe continua alcancavel pelo anon';
  END IF;
END
$guarda$;
