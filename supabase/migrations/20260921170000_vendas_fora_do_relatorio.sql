-- ============================================================================
-- Comercial: a venda que nao veio no relatorio sai da lista principal em 1 dia,
-- mas passa a viver 1 MES numa lista propria antes de ir para a lixeira
-- ============================================================================
--
-- ## O pedido (21/09/2026)
--
-- «Continua ainda a logica de sair da planilha o acordo que nao aparecer no
-- relatorio, mas fica ai numa lista separada os acordos que eles anotaram e
-- saiu por um tempinho a mais, pra eles conferirem ali uma lista e poderem
-- localizar esses NRs que nao apareceram no relatorio e talvez questionar o
-- porque que nao apareceram. Essa lista permanece durante um mes. As 24 horas
-- e pra sair da lista principal e ai cria uma lista propria pra isso.»
--
-- ## O que muda em relacao a 20260921150000
--
-- Antes: relogio de 1 dia → `lixeira_vendas` (7 dias para restaurar). O
-- operador nao tem `ver_lixeira_vendas`, entao quem lancou a venda perdia o NR
-- de vista no instante em que ele saia — que e exatamente o momento em que ele
-- precisa dele para questionar o ERP.
--
-- Agora sao DUAS reguas, e a venda so e apagada no fim das duas:
--
--   1 dia ..... `fora_do_relatorio_em = NOW()`. A venda CONTINUA em `vendas`, e
--               por isso continua sendo do dono: ele a le pela mesma policy
--               `vendas_select`, sem chave nova. Ela some da lista principal,
--               dos cards, do placar e de todo painel, porque a aba passa a
--               separa-la (`buscarForaDoRelatorio`), e vai para a aba «Fora do
--               relatorio».
--   30 dias ... ai sim `lixeira_vendas`, com os mesmos 7 dias de restauracao.
--
-- ## O caminho de volta continua existindo, e agora e mais largo
--
-- Se o NR aparecer em QUALQUER retrato vigente — geral ou previa do setor —,
-- `fn_vendas_prazo_marcar` zera as DUAS colunas e a venda volta inteira para a
-- lista principal. Antes isso so valia enquanto ela nao tivesse sido apagada;
-- agora vale o mes inteiro. E o ganho real da mudanca: o NR que demorou a
-- entrar no ERP volta sozinho, sem ninguem restaurar nada.
--
-- Venda que entra na meta ou que deixa de ser manual tambem volta, pelas mesmas
-- tres condicoes de sempre.
--
-- ## O que NAO muda
--
--   - `sem_relatorio_desde` continua sendo o relogio de 1 dia, com o mesmo
--     gatilho em `vendas_lotes` e o mesmo agendamento de 10 em 10 minutos;
--   - `fn_venda_excluir` continua como esta (20260921150000): venda na meta so
--     sai com `excluir_vendas_na_meta`, e quem lancou apaga a propria manual —
--     inclusive uma que ja esteja fora do relatorio, que e como o operador
--     descarta o NR que ele mesmo digitou errado;
--   - nenhuma chave de permissao nova, nenhum elo novo em
--     `fn_permissoes_catalogo()`.
--
-- ## Escrita de dados na aplicacao
--
-- Nenhuma alem do proprio fluxo: cria uma coluna, um indice parcial, uma funcao
-- nova e redefine tres. As vendas que hoje estao com o relogio ligado passam a
-- ser ARQUIVADAS em vez de apagadas na proxima passada do agendamento — a
-- mudanca so adia exclusao, nunca antecipa.
--
-- Conferencia depois de aplicar:
--
--   SELECT count(*) FILTER (WHERE sem_relatorio_desde IS NOT NULL) AS no_relogio,
--          count(*) FILTER (WHERE fora_do_relatorio_em IS NOT NULL) AS arquivadas
--     FROM public.vendas;
--
-- ============================================================================

-- ============================================================================
-- 1. A coluna
-- ============================================================================

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS fora_do_relatorio_em TIMESTAMPTZ;

COMMENT ON COLUMN public.vendas.fora_do_relatorio_em IS
  'Quando esta venda manual saiu da lista principal por nao ter aparecido no '
  'relatorio em 1 dia. Enquanto preenchida, a venda vive na aba «Fora do '
  'relatorio» e nao soma em placar, meta nem painel. Trinta dias depois vai '
  'para a lixeira. Volta a nulo se o NR aparecer. Ver 20260921170000.';

-- Parcial: quase toda venda tem nulo aqui, e so as arquivadas sao procuradas.
CREATE INDEX IF NOT EXISTS idx_vendas_fora_do_relatorio
  ON public.vendas(empresa_id, fora_do_relatorio_em)
  WHERE fora_do_relatorio_em IS NOT NULL;

-- O arquivamento e um evento da vida da venda, e a linha do tempo dela nao pode
-- ter um buraco justamente onde ela sai da lista. `vendas_eventos_tipo_check`
-- so conhecia os seis atos de gente; ganha o setimo, que e do sistema.
ALTER TABLE public.vendas_eventos DROP CONSTRAINT IF EXISTS vendas_eventos_tipo_check;
ALTER TABLE public.vendas_eventos ADD CONSTRAINT vendas_eventos_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'criada', 'editada', 'confirmada', 'assinada', 'revertida', 'excluida',
    'restaurada', 'fora_do_relatorio'
  ]));

-- ============================================================================
-- 2. Marcar e desmarcar — agora o «desmarca» tambem traz a venda de volta
-- ============================================================================
--
-- Copiada de 20260921150000 §3. Mudou o UPDATE de cima: ele passa a alcancar a
-- venda ja ARQUIVADA (`fora_do_relatorio_em IS NOT NULL`) e zera as duas
-- colunas de uma vez. O bloco de marcacao e byte a byte o de antes, com uma
-- unica condicao a mais — nao remarcar o relogio de quem ja esta arquivado,
-- senao o aviso de «sai em 1 dia» se repetiria todo mes.

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
           format(
             'O NR %s não apareceu no relatório importado. Em %s ele sai da lista '
             'principal e fica um mês na aba «Fora do relatório», para você conferir '
             'ou questionar. Confira o NR na aba Vendas.',
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

COMMENT ON FUNCTION public.fn_vendas_prazo_marcar(UUID) IS
  'Liga e desliga o relogio de 1 dia das vendas manuais que o relatorio nao '
  'trouxe, e traz de volta (relogio e arquivamento) a que o NR salvou. '
  'NULL = todas as empresas. So o gatilho de vendas_lotes e o agendamento chamam.';

-- ============================================================================
-- 3. Arquivar: 1 dia vencido, sai da lista principal (e NAO e apagada)
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
           format(
             'O NR %s não apareceu no relatório em 1 dia e saiu da lista principal. '
             'Ele fica até %s na aba «Fora do relatório», em Vendas — confira lá se o '
             'NR está certo, ou questione por que ele não veio no relatório.',
             a.nr_documento,
             to_char((a.fora_do_relatorio_em + INTERVAL '30 days') AT TIME ZONE 'America/Sao_Paulo',
                     'DD/MM')),
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
  'aparecer. Ela NAO e apagada: fica 30 dias na aba «Fora do relatorio». So o '
  'agendamento chama.';

-- ============================================================================
-- 4. Excluir: so depois de um mes fora da lista
-- ============================================================================
--
-- Copiada de 20260921150000 §4. Mudou a condicao do FOR (le
-- `fora_do_relatorio_em`, e nao mais `sem_relatorio_desde`) e o texto do motivo
-- e do aviso. O corpo do laco — lixeira, evento, DELETE, notificacao — e o
-- mesmo.

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
    'Ficou um mês fora do relatório: o NR não apareceu no geral nem na prévia do setor.';
BEGIN
  FOR v IN
    SELECT *
      FROM public.vendas
     WHERE fora_do_relatorio_em IS NOT NULL
       AND fora_do_relatorio_em <= NOW() - INTERVAL '30 days'
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
             'O NR %s ficou um mês fora do relatório e a venda foi para a lixeira. '
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
  'Leva para a lixeira a venda manual que ja passou 30 dias fora do relatorio. '
  'So o agendamento chama.';

-- ============================================================================
-- 5. O que o agendamento roda: marca, arquiva, depois exclui
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_prazo_rodar()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_marca    RECORD;
  v_arquiva  INTEGER;
  v_exclui   INTEGER;
BEGIN
  SELECT * INTO v_marca FROM public.fn_vendas_prazo_marcar(NULL);
  v_arquiva := public.fn_vendas_prazo_arquivar();
  v_exclui  := public.fn_vendas_prazo_excluir();
  RETURN jsonb_build_object(
    'marcadas',    v_marca.marcadas,
    'desmarcadas', v_marca.desmarcadas,
    'arquivadas',  v_arquiva,
    'excluidas',   v_exclui);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_prazo_rodar() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_vendas_prazo_rodar() IS
  'O que o pg_cron do Comercial roda: marca e desmarca o relogio de 1 dia, '
  'arquiva o que venceu e exclui o que ja passou 30 dias fora do relatorio.';
