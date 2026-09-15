-- ============================================================================
-- O lancamento manual tambem credita a equipe que o lider LIDERA
-- ============================================================================
--
-- ✅ APLICADA em 15/09/2026. Depende da Fase 6 (20260915160000).
--
-- ## O conserto pela metade
--
-- A Fase 6 corrigiu `fn_vendas_projetar` — o caminho do RELATORIO — e parou
-- ali. `fn_venda_salvar`, que e o caminho da venda lancada A MAO na aba Vendas,
-- continuou lendo `perfis.equipe_id` direto:
--
--     SELECT p.setor_id, p.equipe_id INTO v_setor, v_equipe
--
-- Os 11 lideres do Comercial tem esse campo NULO por desenho — a regra da casa
-- e que lider credita pela `equipe_lideres`, e `perfis.equipe_id` e residuo do
-- modelo antigo. Entao toda venda que qualquer um deles lancasse pela tela
-- nasceria com `equipe_id` nulo: dentro do setor, fora de equipe nenhuma.
--
-- Meio defeito corrigido e pior do que defeito conhecido: o numero do
-- relatorio ficaria certo e o do lancamento manual errado, no mesmo mes, na
-- mesma equipe — e quem comparasse os dois nao teria como saber qual acreditar.
--
-- ## E nao era so credito: era permissao
--
-- `v_equipe` tambem alimenta `fn_vendas_alcanca`, que decide se a pessoa PODE
-- lancar aquela venda. Com a equipe nula, quem tem escopo de equipe
-- (`vendas_escopo_equipe`) nao casaria com equipe alguma e seria recusado ao
-- lancar a propria venda, com «Esta venda está fora do seu alcance» — mensagem
-- que manda procurar permissao onde o problema era cadastro.
--
-- Uma regra (`fn_vendas_equipe_que_credita`), dois caminhos, o mesmo resultado.
--
-- Escrita de dados: nenhuma. `vendas` esta vazia.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_venda_salvar(
  p_id              UUID,
  p_empresa_id      UUID,
  p_operador_id     UUID,
  p_nr_documento    TEXT,
  p_cliente         TEXT,
  p_uf              TEXT,
  p_valor_total     NUMERIC,
  p_valor_entrada   NUMERIC,
  p_forma_pagamento TEXT,
  p_data_venda      DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_novo   BOOLEAN := p_id IS NULL;
  v_setor  UUID;
  v_equipe UUID;
  v_id     UUID;
  v_nr     TEXT;
  v_uf     TEXT;
  v_antes  public.vendas%ROWTYPE;
BEGIN
  IF NOT public.fn_user_tem(CASE WHEN v_novo THEN 'criar_vendas' ELSE 'editar_vendas' END) THEN
    RAISE EXCEPTION 'Seu cargo não pode %s venda.', CASE WHEN v_novo THEN 'lançar' ELSE 'editar' END
      USING ERRCODE = '42501';
  END IF;

  v_nr := NULLIF(BTRIM(p_nr_documento), '');
  IF v_nr IS NULL THEN
    RAISE EXCEPTION 'O NR do documento é obrigatório — é ele que liga a venda ao relatório.'
      USING ERRCODE = '22023';
  END IF;

  v_uf := NULLIF(UPPER(BTRIM(COALESCE(p_uf, ''))), '');

  IF p_valor_total IS NULL OR p_valor_total <= 0 THEN
    RAISE EXCEPTION 'O valor da venda precisa ser maior que zero.' USING ERRCODE = '22023';
  END IF;

  -- Entrada maior que o total faria a tela mostrar «pagou mais do que comprou»
  -- sem que ninguem soubesse de onde.
  IF p_valor_entrada IS NOT NULL AND p_valor_entrada > p_valor_total THEN
    RAISE EXCEPTION 'A entrada não pode ser maior que o valor total da venda.'
      USING ERRCODE = '22023';
  END IF;

  -- O setor sai do cadastro do operador, e nao do formulario: e a mesma
  -- pergunta que o Painel Lider ja responde, e digita-la de novo criaria uma
  -- segunda verdade.
  SELECT p.setor_id INTO v_setor
    FROM public.perfis p
   WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O operador não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;

  -- A equipe que CREDITA, e nao o campo do cadastro. Ver o cabecalho.
  v_equipe := public.fn_vendas_equipe_que_credita(p_operador_id);

  IF NOT public.fn_vendas_alcanca(p_empresa_id, p_operador_id, v_setor, v_equipe) THEN
    RAISE EXCEPTION 'Esta venda está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;

  IF v_novo THEN
    INSERT INTO public.vendas (
      empresa_id, operador_id, setor_id, equipe_id, nr_documento, cliente, uf,
      valor_total, valor_entrada, forma_pagamento, data_venda,
      situacao, origem, criado_por
    ) VALUES (
      p_empresa_id, p_operador_id, v_setor, v_equipe, v_nr, NULLIF(BTRIM(p_cliente), ''), v_uf,
      p_valor_total, p_valor_entrada, NULLIF(BTRIM(p_forma_pagamento), ''), p_data_venda,
      'aberta', 'manual', auth.uid()
    )
    RETURNING id INTO v_id;

    INSERT INTO public.vendas_eventos (
      venda_id, empresa_id, tipo, situacao_depois, assinado_depois,
      valor_antes, valor_depois, origem, autor_id
    ) VALUES (
      v_id, p_empresa_id, 'criada', 'aberta', FALSE, 0, 0, 'manual', auth.uid()
    );

    RETURN v_id;
  END IF;

  SELECT * INTO v_antes FROM public.vendas WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_vendas_alcanca(
       v_antes.empresa_id, v_antes.operador_id, v_antes.setor_id, v_antes.equipe_id
     ) THEN
    RAISE EXCEPTION 'Esta venda está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;

  -- Editar NAO muda situacao nem assinatura: isso e fn_venda_confirmar, e a
  -- separacao existe para que `editar_vendas` no operador nao vire o poder de
  -- validar a propria venda.
  UPDATE public.vendas SET
    operador_id     = p_operador_id,
    setor_id        = v_setor,
    equipe_id       = v_equipe,
    nr_documento    = v_nr,
    cliente         = NULLIF(BTRIM(p_cliente), ''),
    uf              = v_uf,
    valor_total     = p_valor_total,
    valor_entrada   = p_valor_entrada,
    forma_pagamento = NULLIF(BTRIM(p_forma_pagamento), ''),
    data_venda      = p_data_venda,
    atualizado_em   = NOW()
  WHERE id = p_id;

  INSERT INTO public.vendas_eventos (
    venda_id, empresa_id, tipo, situacao_antes, situacao_depois,
    assinado_antes, assinado_depois, valor_antes, valor_depois,
    origem, autor_id
  ) VALUES (
    p_id, v_antes.empresa_id, 'editada', v_antes.situacao, v_antes.situacao,
    v_antes.contrato_assinado, v_antes.contrato_assinado,
    v_antes.valor_total, p_valor_total, 'manual', auth.uid()
  );

  RETURN p_id;
END;
$function$;

DO $$
DECLARE def TEXT;
BEGIN
  def := pg_get_functiondef('public.fn_venda_salvar'::regproc);

  IF def NOT ILIKE '%fn_vendas_equipe_que_credita(p_operador_id)%' THEN
    RAISE EXCEPTION 'fn_venda_salvar nao passou a usar a equipe que credita.';
  END IF;

  IF def ILIKE '%p.setor_id, p.equipe_id INTO%' THEN
    RAISE EXCEPTION 'fn_venda_salvar ainda le perfis.equipe_id direto.';
  END IF;

  -- `CREATE OR REPLACE` preserva os GRANTs, mas conferir custa nada e a funcao
  -- ESCREVE em `vendas`.
  IF has_function_privilege('public',
       'public.fn_venda_salvar(uuid,uuid,uuid,text,text,text,numeric,numeric,text,date)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'fn_venda_salvar ficou aberta para PUBLIC.';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.fn_venda_salvar(uuid,uuid,uuid,text,text,text,numeric,numeric,text,date)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu o EXECUTE de fn_venda_salvar.';
  END IF;
END $$;

COMMIT;
