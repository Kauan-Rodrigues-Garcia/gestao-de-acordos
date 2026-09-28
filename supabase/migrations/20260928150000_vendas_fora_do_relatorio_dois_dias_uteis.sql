-- ============================================================================
-- Comercial: a venda fora do relatorio fica 2 DIAS UTEIS na aba propria, e nao
-- mais um mes, antes de ir para a lixeira
-- ============================================================================
--
-- ## O pedido (28/09/2026)
--
-- «Eu informei que apos nao ser validado no relatorio o NR ele seria retirado
-- em ate 1 a 2 dias uteis, agora esta aparecendo 1 mes para ele sair, ele tem
-- que ser retirado no periodo informado e nao ficar 1 mes para ser retirado.»
--
-- Escolha do usuario: continua saindo da lista principal em 1 dia, fica na aba
-- «Fora do relatorio» por ate 2 dias uteis para conferir, e depois vai para a
-- lixeira (onde o lider ainda restaura por 7 dias).
--
-- ## O que muda em relacao a 20260921170000
--
-- So a SEGUNDA regua: `fora_do_relatorio_em + 30 days` vira
-- `fn_pix_dias_uteis_apos(fora_do_relatorio_em, 2)` — a mesma funcao que o Pix
-- automatico ja usa para o prazo de 2 dias uteis dos desaprovados
-- (`fn_pix_expurga_desaprovados`). Uma regua so de «dia util» no banco.
-- Ela pula sabado e domingo; feriado conta como dia util, igual no Pix.
--
-- E os textos que prometiam «um mes»: os avisos de `fn_vendas_prazo_marcar` e
-- de `fn_vendas_prazo_arquivar`, o motivo gravado na lixeira e os comentarios.
--
-- ## O que NAO muda
--
--   - o relogio de 1 dia (`sem_relatorio_desde`) e o agendamento de 10 em 10
--     minutos;
--   - o caminho de volta: se o NR aparecer em qualquer retrato vigente, as duas
--     colunas zeram e a venda volta para a lista;
--   - `fn_venda_excluir`, permissoes, `fn_permissoes_catalogo()`.
--
-- Corpo das funcoes copiado de 20260921170000; as diferencas sao so as linhas
-- marcadas com «28/09».
--
-- ## Efeito na aplicacao
--
-- As vendas que HOJE estao na aba ha mais de 2 dias uteis vao para a lixeira
-- na primeira passada do agendamento depois de aplicar (ate 10 minutos). Para
-- saber quantas antes de aplicar:
--
--   SELECT count(*) AS vao_para_a_lixeira
--     FROM public.vendas
--    WHERE fora_do_relatorio_em IS NOT NULL
--      AND public.fn_pix_dias_uteis_apos(fora_do_relatorio_em, 2) <= NOW();
--
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- A regua de dia util precisa existir: sem ela o agendamento quebraria a cada
-- 10 minutos, e so no log do pg_cron.
DO $pre$
BEGIN
  IF to_regprocedure('public.fn_pix_dias_uteis_apos(timestamptz, integer)') IS NULL THEN
    RAISE EXCEPTION 'fn_pix_dias_uteis_apos(timestamptz, integer) nao existe neste banco';
  END IF;
END
$pre$;

COMMENT ON COLUMN public.vendas.fora_do_relatorio_em IS
  'Quando esta venda manual saiu da lista principal por nao ter aparecido no '
  'relatorio em 1 dia. Enquanto preenchida, a venda vive na aba «Fora do '
  'relatorio» e nao soma em placar, meta nem painel. Dois dias uteis depois vai '
  'para a lixeira. Volta a nulo se o NR aparecer. Ver 20260928150000.';

-- ============================================================================
-- 1. Marcar e desmarcar — so o texto do aviso muda
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_prazo_marcar(p_empresa_id UUID DEFAULT NULL)
RETURNS TABLE(marcadas INTEGER, desmarcadas INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_marcadas    INTEGER := 0;
  v_desmarcadas INTEGER := 0;
BEGIN
  -- Desmarca primeiro: o NR apareceu, a venda entrou na meta, ou a projecao a
  -- levou para 'geral'. Zera o relogio E o arquivamento — a venda volta para a
  -- lista principal inteira, venha ela do relogio ou da aba «Fora do relatorio».
  UPDATE public.vendas v
     SET sem_relatorio_desde  = NULL,
         fora_do_relatorio_em = NULL
   WHERE (v.sem_relatorio_desde IS NOT NULL OR v.fora_do_relatorio_em IS NOT NULL)
     AND (p_empresa_id IS NULL OR v.empresa_id = p_empresa_id)
     AND (v.origem <> 'manual'
          OR v.conta_na_meta
          OR public.fn_vendas_nr_no_relatorio(v.empresa_id, v.nr_documento));
  GET DIAGNOSTICS v_desmarcadas = ROW_COUNT;

  -- Marca: manual, fora da meta, ainda nao arquivada, com um GERAL promovido
  -- depois do lancamento cujo mes alcanca a venda, e o NR em retrato vigente
  -- nenhum.
  WITH recem_marcadas AS (
    UPDATE public.vendas v
       SET sem_relatorio_desde = NOW()
     WHERE v.sem_relatorio_desde IS NULL
       AND v.fora_do_relatorio_em IS NULL
       AND v.origem = 'manual'
       AND NOT v.conta_na_meta
       AND (p_empresa_id IS NULL OR v.empresa_id = p_empresa_id)
       AND EXISTS (
         SELECT 1 FROM public.vendas_lotes l
          WHERE l.empresa_id   = v.empresa_id
            AND l.origem       = 'geral'
            AND l.estado       IN ('vigente', 'substituido')
            AND l.promovido_em > v.criado_em
            AND l.mes          >= date_trunc('month', v.data_venda)::DATE
       )
       AND NOT public.fn_vendas_nr_no_relatorio(v.empresa_id, v.nr_documento)
    RETURNING v.empresa_id, v.operador_id, v.criado_por, v.nr_documento, v.sem_relatorio_desde
  ),
  avisos AS (
    INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
    SELECT DISTINCT d.usuario_id, m.empresa_id,
           'Venda ' || m.nr_documento || ' não veio no relatório',
           -- 28/09: «fica um mês» virou «fica até 2 dias úteis».
           format(
             'O NR %s não apareceu no relatório importado. Em %s ele sai da lista '
             'principal e fica até 2 dias úteis na aba «Fora do relatório», para você '
             'conferir ou questionar. Confira o NR na aba Vendas.',
             m.nr_documento,
             to_char((m.sem_relatorio_desde + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo',
                     'DD/MM "às" HH24:MI')),
           FALSE, '/vendas'
      FROM recem_marcadas m
      CROSS JOIN unnest(ARRAY[m.operador_id, m.criado_por]) AS d(usuario_id)
     WHERE d.usuario_id IS NOT NULL
  )
  SELECT count(*)::INTEGER INTO v_marcadas FROM recem_marcadas;

  RETURN QUERY SELECT v_marcadas, v_desmarcadas;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_prazo_marcar(UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. Arquivar — so o texto do aviso muda (a data de saida)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_prazo_arquivar()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total INTEGER := 0;
BEGIN
  -- As mesmas tres condicoes da marcacao, conferidas de novo na hora: entre a
  -- marca e o prazo o NR pode ter aparecido, ou o lider pode ter confirmado.
  WITH recem_arquivadas AS (
    UPDATE public.vendas v
       SET fora_do_relatorio_em = NOW()
     WHERE v.sem_relatorio_desde IS NOT NULL
       AND v.sem_relatorio_desde <= NOW() - INTERVAL '1 day'
       AND v.fora_do_relatorio_em IS NULL
       AND v.origem = 'manual'
       AND NOT v.conta_na_meta
       AND NOT public.fn_vendas_nr_no_relatorio(v.empresa_id, v.nr_documento)
    RETURNING v.id, v.empresa_id, v.operador_id, v.criado_por, v.nr_documento,
              v.situacao, v.contrato_assinado, v.valor_na_meta, v.origem,
              v.fora_do_relatorio_em
  ),
  eventos AS (
    INSERT INTO public.vendas_eventos (
      venda_id, empresa_id, tipo, situacao_antes, assinado_antes,
      valor_antes, origem, motivo, autor_id
    )
    SELECT a.id, a.empresa_id, 'fora_do_relatorio', a.situacao, a.contrato_assinado,
           a.valor_na_meta, a.origem,
           'Não apareceu no relatório geral nem na prévia do setor em 1 dia.', NULL
      FROM recem_arquivadas a
  ),
  avisos AS (
    INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
    SELECT DISTINCT d.usuario_id, a.empresa_id,
           'Venda ' || a.nr_documento || ' saiu da lista',
           -- 28/09: a data de saída é a de 2 dias úteis, e não mais + 30 dias.
           format(
             'O NR %s não apareceu no relatório em 1 dia e saiu da lista principal. '
             'Ele fica até %s na aba «Fora do relatório», em Vendas — confira lá se o '
             'NR está certo, ou questione por que ele não veio no relatório.',
             a.nr_documento,
             to_char(public.fn_pix_dias_uteis_apos(a.fora_do_relatorio_em, 2)
                       AT TIME ZONE 'America/Sao_Paulo',
                     'DD/MM "às" HH24:MI')),
           FALSE, '/vendas?aba=fora_relatorio'
      FROM recem_arquivadas a
      CROSS JOIN unnest(ARRAY[a.operador_id, a.criado_por]) AS d(usuario_id)
     WHERE d.usuario_id IS NOT NULL
  )
  SELECT count(*)::INTEGER INTO v_total FROM recem_arquivadas;

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_prazo_arquivar() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_vendas_prazo_arquivar() IS
  'Tira da lista principal a venda manual cujo relogio de 1 dia venceu sem o NR '
  'aparecer. Ela NAO e apagada: fica 2 dias uteis na aba «Fora do relatorio». '
  'So o agendamento chama.';

-- ============================================================================
-- 3. Excluir: depois de 2 dias uteis fora da lista (era um mes)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_prazo_excluir()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v        public.vendas%ROWTYPE;
  v_nome   TEXT;
  v_total  INTEGER := 0;
  c_motivo CONSTANT TEXT :=
    'Ficou 2 dias úteis fora do relatório: o NR não apareceu no geral nem na prévia do setor.';
BEGIN
  FOR v IN
    SELECT *
      FROM public.vendas
     WHERE fora_do_relatorio_em IS NOT NULL
       -- 28/09: era `fora_do_relatorio_em <= NOW() - INTERVAL '30 days'`.
       AND public.fn_pix_dias_uteis_apos(fora_do_relatorio_em, 2) <= NOW()
       AND origem = 'manual'
       AND NOT conta_na_meta
       AND NOT public.fn_vendas_nr_no_relatorio(empresa_id, nr_documento)
     FOR UPDATE SKIP LOCKED
  LOOP
    SELECT nome INTO v_nome FROM public.perfis WHERE id = v.operador_id;

    INSERT INTO public.lixeira_vendas (
      venda_id, empresa_id, operador_id, operador_nome, nr_documento, cliente,
      valor_total, data_venda, situacao, contrato_assinado, dados_completos,
      motivo, excluido_por_id, excluido_por_nome
    ) VALUES (
      v.id, v.empresa_id, v.operador_id, v_nome,
      v.nr_documento, v.cliente, v.valor_total, v.data_venda,
      v.situacao, v.contrato_assinado, to_jsonb(v),
      c_motivo, NULL, 'Sistema — prazo do relatório'
    );

    INSERT INTO public.vendas_eventos (
      venda_id, empresa_id, tipo, situacao_antes, assinado_antes,
      valor_antes, origem, motivo, autor_id
    ) VALUES (
      v.id, v.empresa_id, 'excluida', v.situacao, v.contrato_assinado,
      v.valor_na_meta, v.origem, c_motivo, NULL
    );

    DELETE FROM public.vendas WHERE id = v.id;

    INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
    SELECT DISTINCT d.usuario_id, v.empresa_id,
           'Venda ' || v.nr_documento || ' excluída',
           format(
             'O NR %s ficou 2 dias úteis fora do relatório e a venda foi para a lixeira. '
             'Se o NR estiver certo, peça ao líder para restaurá-la — são 7 dias.',
             v.nr_documento),
           FALSE, '/vendas'
      FROM unnest(ARRAY[v.operador_id, v.criado_por]) AS d(usuario_id)
     WHERE d.usuario_id IS NOT NULL;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_prazo_excluir() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_vendas_prazo_excluir() IS
  'Leva para a lixeira a venda manual que ja passou 2 dias uteis fora do '
  'relatorio (fn_pix_dias_uteis_apos). So o agendamento chama.';

COMMENT ON FUNCTION public.fn_vendas_prazo_rodar() IS
  'O que o pg_cron do Comercial roda: marca e desmarca o relogio de 1 dia, '
  'arquiva o que venceu e exclui o que ja passou 2 dias uteis fora do relatorio.';

COMMIT;
