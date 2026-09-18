-- ============================================================================
-- Comercial: indicacoes — varios telefones por contato
-- ============================================================================
--
-- Pedido de 18/09/2026: «ele preenche a primeira vez completo — Colegio Sao
-- Jose, Maria Clara, 18 935056541 — porem os restantes podem ser armazenados
-- nesse mesmo contato». A gestora de uma escola nao aponta um contato so:
-- aponta cinco. Cada telefone e UMA indicacao (e um ponto no ranking); a
-- escola e a gestora dizem de onde elas vieram.
--
-- ## O que travava
--
-- A Fase 7 (20260915200000) fez da INSTITUICAO a chave unica:
-- `uq_indicacoes_instituicao (empresa_id, LOWER(BTRIM(instituicao)))`. Com
-- ela, o segundo telefone do Colegio Sao Jose voltava recusado como «ja foi
-- indicada». A propria Fase 7 deixou escrito que trocar a chave seria uma
-- decisao, e nao uma descoberta — esta e ela.
--
-- ## A chave nova: o telefone
--
-- O que nao pode contar duas vezes e o CONTATO apontado, e o contato e o
-- numero. A trava continua fazendo o ranking valer: dois operadores que anotam
-- o mesmo numero somam um ponto, nao dois — em qualquer escola.
--
--   - Com telefone: unico por empresa, comparado so pelos DIGITOS.
--     «(18) 93505-6541», «18 935056541» e «+55 18 93505-6541» sao o mesmo.
--   - Sem telefone: a escola volta a ser o contato. O indice parcial a faz
--     unica entre as linhas sem numero, e as RPCs recusam tambem quando a
--     escola ja tem QUALQUER linha — «Colegio Sao Jose» sem numero depois de
--     cinco numeros dele seria um sexto ponto sem contato novo. O indice nao
--     consegue dizer isso sozinho; a RPC diz, e o indice segura o resto.
--
-- ## Por que a normalizacao mora numa funcao
--
-- `fn_indicacao_telefone_chave` e a MESMA expressao no indice, no lote e na
-- correcao — tres copias de um regexp e como uma delas passa a discordar. O
-- cliente (`chaveDoTelefone` em src/lib/indicacoes.ts) repete a regra para
-- marcar a repetida antes de mandar; se esta funcao mudar, aquela muda junto
-- (e o indice precisa de REINDEX).
--
-- ## Antes de trocar, os dados de hoje precisam caber
--
-- Sob a regra velha nenhuma escola se repetia, entao o indice das linhas sem
-- telefone nasce sem colisao. O de telefone pode colidir: duas escolas
-- diferentes com o mesmo numero. Se houver, a migration PARA e lista quais —
-- escolher qual das duas linhas fica e decisao de gente, nao de script.
--
-- Escrita de dados: nenhuma. Troca a chave unica e reescreve duas funcoes.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. A chave do telefone
-- ============================================================================
--
-- So digitos; zero a esquerda (interurbano) sai; o 55 do pais sai quando
-- sobra — 12 ou 13 digitos. «(55) 99999-0000» tem 11: e o DDD de Santa Maria,
-- e fica. Sem digito nenhum («nao tem») e NULL: a chave passa a ser a escola.
--
-- IMMUTABLE porque entra em indice. `[^0-9]` em vez de `\D`: sem depender de
-- `standard_conforming_strings` para a barra chegar ao regexp.

CREATE OR REPLACE FUNCTION public.fn_indicacao_telefone_chave(p_telefone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $function$
  SELECT NULLIF(
           CASE WHEN s.d ~ '^55[0-9]{10,11}$' THEN substr(s.d, 3) ELSE s.d END,
           '')
    FROM (SELECT ltrim(regexp_replace(COALESCE(p_telefone, ''), '[^0-9]', '', 'g'), '0') AS d) AS s;
$function$;

COMMENT ON FUNCTION public.fn_indicacao_telefone_chave(TEXT) IS
  'Chave do telefone de uma indicacao: so digitos, sem zero a esquerda e sem o '
  '55 do pais. Mesma regra de chaveDoTelefone (src/lib/indicacoes.ts). Entra no '
  'indice uq_indicacoes_telefone — mudar exige REINDEX.';

-- ============================================================================
-- 2. Os dados de hoje cabem na regra nova?
-- ============================================================================

DO $$
DECLARE v_colisoes TEXT;
BEGIN
  SELECT string_agg(format('%s (%s linhas: %s)', x.chave, x.n, x.escolas), '; ')
    INTO v_colisoes
    FROM (
      SELECT public.fn_indicacao_telefone_chave(i.telefone) AS chave,
             COUNT(*) AS n,
             string_agg(i.instituicao, ', ' ORDER BY i.criado_em) AS escolas
        FROM public.indicacoes i
       WHERE public.fn_indicacao_telefone_chave(i.telefone) IS NOT NULL
       GROUP BY i.empresa_id, public.fn_indicacao_telefone_chave(i.telefone)
      HAVING COUNT(*) > 1
    ) AS x;

  IF v_colisoes IS NOT NULL THEN
    RAISE EXCEPTION 'Telefone repetido em indicacoes: %. Corrija ou exclua uma das linhas antes de aplicar.',
      v_colisoes;
  END IF;
END $$;

-- ============================================================================
-- 3. A troca da chave
-- ============================================================================

DROP INDEX IF EXISTS public.uq_indicacoes_instituicao;

CREATE UNIQUE INDEX IF NOT EXISTS uq_indicacoes_telefone
  ON public.indicacoes(empresa_id, public.fn_indicacao_telefone_chave(telefone))
  WHERE public.fn_indicacao_telefone_chave(telefone) IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_indicacoes_instituicao_sem_telefone
  ON public.indicacoes(empresa_id, LOWER(BTRIM(instituicao)))
  WHERE public.fn_indicacao_telefone_chave(telefone) IS NULL;

-- A pergunta «essa escola ja tem alguma linha?» — feita pelas RPCs a cada item
-- sem telefone — cobre as linhas COM telefone, que o indice parcial nao ve.
CREATE INDEX IF NOT EXISTS idx_indicacoes_instituicao
  ON public.indicacoes(empresa_id, LOWER(BTRIM(instituicao)));

COMMENT ON INDEX public.uq_indicacoes_telefone IS
  'O contato apontado e o numero: o mesmo telefone nao conta duas vezes na '
  'empresa, em escola nenhuma. Substituiu uq_indicacoes_instituicao em 20260918130000.';

-- ============================================================================
-- 4. Gravar em LOTE — a repetida agora e o telefone
-- ============================================================================
--
-- Mesmo desenho da Fase 7: nao aborta no repetido, e a repetida volta com QUEM
-- e QUANDO. Ganha `telefone` (o numero recusado) e `na_instituicao` (a escola
-- em que ele ja estava — pode ser outra).

CREATE OR REPLACE FUNCTION public.fn_indicacoes_salvar_lote(
  p_empresa_id  UUID,
  p_operador_id UUID,
  p_itens       JSONB
)
RETURNS TABLE(gravadas INTEGER, repetidas JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_setor     UUID;
  v_equipe    UUID;
  v_gravadas  INTEGER := 0;
  v_repetidas JSONB   := '[]'::JSONB;
  j           JSONB;
  v_nome      TEXT;
  v_telefone  TEXT;
  v_chave     TEXT;
  v_data      DATE;
  v_dona      RECORD;
BEGIN
  IF NOT public.fn_user_tem('criar_indicacoes') THEN
    RAISE EXCEPTION 'Seu cargo não pode cadastrar indicação.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  SELECT p.setor_id INTO v_setor
    FROM public.perfis p
   WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O operador não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;

  -- A equipe que CREDITA — a mesma regra de vendas.
  v_equipe := public.fn_vendas_equipe_que_credita(p_operador_id);

  -- Cadastrar PELO outro e ato de lideranca. Ver a Fase 7.
  IF p_operador_id <> (SELECT auth.uid())
     AND NOT public.fn_user_tem('editar_indicacoes') THEN
    RAISE EXCEPTION 'Você só pode cadastrar indicação em seu próprio nome.'
      USING ERRCODE = '42501';
  END IF;

  FOR j IN SELECT * FROM jsonb_array_elements(COALESCE(p_itens, '[]'::JSONB))
  LOOP
    v_nome := NULLIF(BTRIM(COALESCE(j->>'instituicao', '')), '');
    CONTINUE WHEN v_nome IS NULL;

    v_telefone := NULLIF(BTRIM(COALESCE(j->>'telefone', '')), '');
    v_chave    := public.fn_indicacao_telefone_chave(v_telefone);
    v_data     := COALESCE(NULLIF(BTRIM(COALESCE(j->>'data_indicacao','')), '')::DATE, CURRENT_DATE);

    -- Com numero, repete quem tem o MESMO numero, em qualquer escola. Sem
    -- numero, a indicacao e a escola — e repete qualquer linha dela. Linhas
    -- gravadas antes, neste mesmo lote, ja aparecem aqui.
    IF v_chave IS NOT NULL THEN
      SELECT i.instituicao, i.data_indicacao, p.nome AS quem
        INTO v_dona
        FROM public.indicacoes i
        LEFT JOIN public.perfis p ON p.id = i.operador_id
       WHERE i.empresa_id = p_empresa_id
         AND public.fn_indicacao_telefone_chave(i.telefone) = v_chave
       LIMIT 1;
    ELSE
      SELECT i.instituicao, i.data_indicacao, p.nome AS quem
        INTO v_dona
        FROM public.indicacoes i
        LEFT JOIN public.perfis p ON p.id = i.operador_id
       WHERE i.empresa_id = p_empresa_id
         AND LOWER(BTRIM(i.instituicao)) = LOWER(v_nome)
       ORDER BY i.data_indicacao, i.criado_em
       LIMIT 1;
    END IF;

    IF FOUND THEN
      v_repetidas := v_repetidas || jsonb_build_object(
        'instituicao',     v_nome,
        'telefone',        v_telefone,
        'na_instituicao',  v_dona.instituicao,
        'ja_indicada_por', COALESCE(v_dona.quem, 'alguém que saiu'),
        'em',              v_dona.data_indicacao
      );
      CONTINUE;
    END IF;

    INSERT INTO public.indicacoes (
      empresa_id, operador_id, setor_id, equipe_id,
      instituicao, gestora, telefone, data_indicacao, observacao, criado_por
    ) VALUES (
      p_empresa_id, p_operador_id, v_setor, v_equipe,
      v_nome,
      NULLIF(BTRIM(COALESCE(j->>'gestora','')), ''),
      v_telefone,
      v_data,
      NULLIF(BTRIM(COALESCE(j->>'observacao','')), ''),
      auth.uid()
    );

    v_gravadas := v_gravadas + 1;
  END LOOP;

  RETURN QUERY SELECT v_gravadas, v_repetidas;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_indicacoes_salvar_lote(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_indicacoes_salvar_lote(UUID, UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_indicacoes_salvar_lote(UUID, UUID, JSONB) IS
  'Grava varias indicacoes de uma vez, uma por telefone. Nao aborta no repetido: '
  'devolve o que entrou e, para cada repetida (mesmo numero; ou escola sem numero '
  'que ja tem linha), QUEM ja a indicou e QUANDO.';

-- ============================================================================
-- 5. Corrigir — a mesma regra de colisao
-- ============================================================================

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
  v_telefone  TEXT;
  v_chave     TEXT;
  v_operador  UUID;
  v_setor     UUID;
  v_equipe    UUID;
  v_outra     TEXT;
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

  v_telefone := NULLIF(BTRIM(COALESCE(p_telefone, '')), '');
  v_chave    := public.fn_indicacao_telefone_chave(v_telefone);

  -- A colisao e com OUTRA linha: a propria, so reescrita, nao conta.
  IF v_chave IS NOT NULL THEN
    SELECT i.instituicao, i.data_indicacao, p.nome
      INTO v_outra, v_quando, v_quem
      FROM public.indicacoes i
      LEFT JOIN public.perfis p ON p.id = i.operador_id
     WHERE i.empresa_id = v_linha.empresa_id
       AND public.fn_indicacao_telefone_chave(i.telefone) = v_chave
       AND i.id <> p_id
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'O telefone % já foi indicado por % em % («%»).',
        v_telefone, COALESCE(v_quem, 'alguém que saiu'), to_char(v_quando, 'DD/MM/YYYY'), v_outra
        USING ERRCODE = '23505';
    END IF;
  ELSE
    SELECT i.data_indicacao, p.nome
      INTO v_quando, v_quem
      FROM public.indicacoes i
      LEFT JOIN public.perfis p ON p.id = i.operador_id
     WHERE i.empresa_id = v_linha.empresa_id
       AND LOWER(BTRIM(i.instituicao)) = LOWER(v_nome)
       AND i.id <> p_id
     ORDER BY i.data_indicacao, i.criado_em
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Sem telefone, a indicação é a própria escola — e «%» já foi indicada por % em %.',
        v_nome, COALESCE(v_quem, 'alguém que saiu'), to_char(v_quando, 'DD/MM/YYYY')
        USING ERRCODE = '23505';
    END IF;
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
         telefone       = v_telefone,
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
  'o operador muda. Telefone que ja e de outra linha — ou escola sem telefone que '
  'ja tem outra linha — e recusado com quem e quando.';

-- ============================================================================
-- 6. Verificar
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_indicacoes_instituicao') THEN
    RAISE EXCEPTION 'uq_indicacoes_instituicao continua de pe — o segundo telefone da escola seria recusado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_indicacoes_telefone') THEN
    RAISE EXCEPTION 'uq_indicacoes_telefone nao foi criado — o ranking contaria numero duplicado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_indicacoes_instituicao_sem_telefone') THEN
    RAISE EXCEPTION 'uq_indicacoes_instituicao_sem_telefone nao foi criado.';
  END IF;

  -- A chave faz o que o cabecalho promete.
  IF public.fn_indicacao_telefone_chave('(18) 93505-6541')    IS DISTINCT FROM '18935056541'
  OR public.fn_indicacao_telefone_chave('18 935056541')       IS DISTINCT FROM '18935056541'
  OR public.fn_indicacao_telefone_chave('+55 18 93505-6541')  IS DISTINCT FROM '18935056541'
  OR public.fn_indicacao_telefone_chave('0 18 93505-6541')    IS DISTINCT FROM '18935056541'
  OR public.fn_indicacao_telefone_chave('+55 (18) 3505-6541') IS DISTINCT FROM '1835056541'
  OR public.fn_indicacao_telefone_chave('(55) 99999-0000')    IS DISTINCT FROM '55999990000'
  OR public.fn_indicacao_telefone_chave('não tem')            IS NOT NULL
  OR public.fn_indicacao_telefone_chave(NULL)                 IS NOT NULL THEN
    RAISE EXCEPTION 'fn_indicacao_telefone_chave nao normaliza como chaveDoTelefone.';
  END IF;

  IF to_regprocedure('public.fn_indicacoes_salvar_lote(uuid,uuid,jsonb)') IS NULL
  OR to_regprocedure('public.fn_indicacao_corrigir(uuid,uuid,text,text,text,date,text)') IS NULL THEN
    RAISE EXCEPTION 'As RPCs de indicacao sumiram.';
  END IF;
END $$;

COMMIT;
