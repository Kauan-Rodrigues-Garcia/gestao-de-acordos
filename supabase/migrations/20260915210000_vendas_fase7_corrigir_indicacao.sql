-- ============================================================================
-- Comercial, Fase 7 (continuacao): corrigir uma indicacao
-- ============================================================================
--
-- A Fase 7 (20260915200000) criou a chave `editar_indicacoes` com a descricao
-- «corrigir uma indicacao e cadastrar em nome de outra pessoa» — e so a
-- segunda metade existia. Nao havia funcao de corrigir, entao quem digitava
-- «Colegio Sao Jose» com o telefone trocado so tinha dois caminhos: conviver
-- com o erro, ou pedir a gerencia que excluisse e cadastrar de novo. O segundo
-- tira o ponto do ranking no meio do caminho e, se outra pessoa cadastrar a
-- mesma escola nesse intervalo, o ponto muda de dono.
--
-- ## O que se corrige
--
-- Instituicao, gestora, telefone, data, observacao e QUEM indicou. O ultimo
-- existe porque o lider cadastra pelo operador que voltou da visita, e escolher
-- a pessoa errada na lista e o erro mais provavel de todos.
--
-- ## A instituicao continua sendo a chave
--
-- Renomear para um nome que ja existe noutra linha e recusado com QUEM e
-- QUANDO, na mesma frase do lote. O indice unico recusaria de qualquer jeito;
-- a checagem antes existe para a mensagem dizer o que fazer, e nao
-- «duplicate key value violates unique constraint».
--
-- ## Setor e equipe continuam congelados
--
-- So sao recalculados quando QUEM indicou muda. Corrigir o telefone de uma
-- indicacao de marco nao pode puxa-la para a equipe em que a pessoa esta hoje
-- — e o mesmo congelamento de `vendas`.
--
-- ## Alcance
--
-- Mesma trava de `fn_indicacao_excluir`: chave + empresa. A policy de leitura
-- continua sendo quem decide o que aparece na tela; repetir aqui a regra de
-- escopo seria a segunda copia dela.
--
-- Escrita de dados: nenhuma. So a funcao.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.fn_indicacao_corrigir(
  p_id             UUID,
  p_operador_id    UUID,
  p_instituicao    TEXT,
  p_gestora        TEXT,
  p_telefone       TEXT,
  p_data_indicacao DATE,
  p_observacao     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linha     public.indicacoes%ROWTYPE;
  v_nome      TEXT;
  v_operador  UUID;
  v_setor     UUID;
  v_equipe    UUID;
  v_quem      TEXT;
  v_quando    DATE;
BEGIN
  IF NOT public.fn_user_tem('editar_indicacoes') THEN
    RAISE EXCEPTION 'Seu cargo não pode corrigir indicação.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_linha FROM public.indicacoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indicação não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_can_access_empresa(v_linha.empresa_id) THEN
    RAISE EXCEPTION 'Esta indicação é de outra empresa.' USING ERRCODE = '42501';
  END IF;

  v_nome := NULLIF(BTRIM(COALESCE(p_instituicao, '')), '');
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'A instituição não pode ficar vazia.' USING ERRCODE = '22023';
  END IF;

  IF p_data_indicacao IS NULL THEN
    RAISE EXCEPTION 'A data da indicação é obrigatória.' USING ERRCODE = '22023';
  END IF;

  -- A colisao e com OUTRA linha. A propria, com o nome so reescrito em
  -- maiusculas, nao conta.
  SELECT i.data_indicacao, p.nome
    INTO v_quando, v_quem
    FROM public.indicacoes i
    LEFT JOIN public.perfis p ON p.id = i.operador_id
   WHERE i.empresa_id = v_linha.empresa_id
     AND LOWER(BTRIM(i.instituicao)) = LOWER(v_nome)
     AND i.id <> p_id;

  IF FOUND THEN
    RAISE EXCEPTION '«%» já foi indicada por % em %.',
      v_nome, COALESCE(v_quem, 'alguém que saiu'), to_char(v_quando, 'DD/MM/YYYY')
      USING ERRCODE = '23505';
  END IF;

  v_operador := COALESCE(p_operador_id, v_linha.operador_id);

  IF v_operador <> v_linha.operador_id THEN
    SELECT p.setor_id INTO v_setor
      FROM public.perfis p
     WHERE p.id = v_operador AND p.empresa_id = v_linha.empresa_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'O operador não pertence a esta empresa.' USING ERRCODE = '22023';
    END IF;

    -- A equipe que CREDITA, como no lote. Ver fn_vendas_equipe_que_credita.
    v_equipe := public.fn_vendas_equipe_que_credita(v_operador);
  ELSE
    v_setor  := v_linha.setor_id;
    v_equipe := v_linha.equipe_id;
  END IF;

  UPDATE public.indicacoes
     SET operador_id    = v_operador,
         setor_id       = v_setor,
         equipe_id      = v_equipe,
         instituicao    = v_nome,
         gestora        = NULLIF(BTRIM(COALESCE(p_gestora, '')), ''),
         telefone       = NULLIF(BTRIM(COALESCE(p_telefone, '')), ''),
         data_indicacao = p_data_indicacao,
         observacao     = NULLIF(BTRIM(COALESCE(p_observacao, '')), ''),
         atualizado_em  = NOW()
   WHERE id = p_id;

  RETURN p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_indicacao_corrigir(UUID, UUID, TEXT, TEXT, TEXT, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_indicacao_corrigir(UUID, UUID, TEXT, TEXT, TEXT, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_indicacao_corrigir(UUID, UUID, TEXT, TEXT, TEXT, DATE, TEXT) IS
  'Corrige uma indicacao, inclusive quem indicou. Setor e equipe so mudam quando '
  'o operador muda. Nome que colide com outra linha e recusado com quem e quando.';

DO $$
BEGIN
  IF to_regprocedure('public.fn_indicacao_corrigir(uuid,uuid,text,text,text,date,text)') IS NULL THEN
    RAISE EXCEPTION 'fn_indicacao_corrigir nao foi criada.';
  END IF;
  IF to_regclass('public.indicacoes') IS NULL THEN
    RAISE EXCEPTION 'A tabela indicacoes nao existe — aplique 20260915200000 antes.';
  END IF;
END $$;

COMMIT;
