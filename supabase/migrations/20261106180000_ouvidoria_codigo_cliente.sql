-- ============================================================================
-- Ouvidoria Cofen: o CPF sai, entra o Código do cliente (06/11/2026)
-- ============================================================================
--
-- Pedido do Cleber, testando a aba (06/11/2026): «tira o card que salva o CPF
-- e coloca um card que salva o código — o mesmo código que eles salvam em
-- acordo». Na regra Cofen esse é o «Código» do acordo (`acordos.instituicao`):
-- só números, e nunca um CPF.
--
--   1. `ouvidoria_manifestacoes.codigo_cliente` (só dígitos), com índice para
--      achar as manifestações de um cliente.
--   2. A coluna `cpf` SAI. Ela só guardava o CPF mascarado (`xxx.xxx.789-00`)
--      desde 20261106150000; o que houver nela é perdido (o aviso abaixo conta
--      quantas linhas tinham). É a única coisa destrutiva aqui.
--   3. `fn_ouvidoria_cofen_salvar` passa a gravar `codigo_cliente`. Um código
--      que é CPF válido é recusado, como no acordo.
--
-- As outras funções devolvem a linha inteira (`SETOF ouvidoria_manifestacoes`)
-- e acompanham a coluna nova sem mudar. Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 1. A coluna nova ────────────────────────────────────────────────────────

ALTER TABLE public.ouvidoria_manifestacoes
  ADD COLUMN IF NOT EXISTS codigo_cliente TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'ouvidoria_manifestacoes_codigo_cliente'
                    AND conrelid = 'public.ouvidoria_manifestacoes'::regclass) THEN
    ALTER TABLE public.ouvidoria_manifestacoes
      ADD CONSTRAINT ouvidoria_manifestacoes_codigo_cliente
      CHECK (codigo_cliente IS NULL OR codigo_cliente ~ '^[0-9]{1,20}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ouvidoria_manifestacoes_codigo_cliente
  ON public.ouvidoria_manifestacoes (setor_id, codigo_cliente)
  WHERE codigo_cliente IS NOT NULL;

COMMENT ON COLUMN public.ouvidoria_manifestacoes.codigo_cliente IS
  'Código do cliente, o mesmo «Código» do acordo na regra Cofen (só números). 20261106180000.';

-- ── 2. O CPF sai ────────────────────────────────────────────────────────────

DO $$
DECLARE v_n INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'ouvidoria_manifestacoes'
                AND column_name = 'cpf') THEN
    EXECUTE 'SELECT COUNT(*) FROM public.ouvidoria_manifestacoes WHERE cpf IS NOT NULL' INTO v_n;
    RAISE NOTICE 'Ouvidoria: % manifestação(ões) tinham CPF mascarado; a coluna sai agora.', v_n;
    ALTER TABLE public.ouvidoria_manifestacoes DROP COLUMN cpf;
  END IF;
END $$;

-- ── 3. O código não pode ser um CPF ─────────────────────────────────────────

-- Mesma conta de `ehCpf` (src/lib/cpf.ts): 11 dígitos, não todos iguais, e os
-- dois verificadores conferem.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_eh_cpf(p_valor TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  d    TEXT := regexp_replace(COALESCE(p_valor, ''), '\D', '', 'g');
  soma INTEGER;
  dv   INTEGER;
  i    INTEGER;
BEGIN
  IF length(d) <> 11 OR d ~ '^(\d)\1{10}$' THEN RETURN FALSE; END IF;
  soma := 0;
  FOR i IN 1..9 LOOP soma := soma + substr(d, i, 1)::INTEGER * (11 - i); END LOOP;
  dv := (soma * 10) % 11; IF dv >= 10 THEN dv := 0; END IF;
  IF dv <> substr(d, 10, 1)::INTEGER THEN RETURN FALSE; END IF;
  soma := 0;
  FOR i IN 1..10 LOOP soma := soma + substr(d, i, 1)::INTEGER * (12 - i); END LOOP;
  dv := (soma * 10) % 11; IF dv >= 10 THEN dv := 0; END IF;
  RETURN dv = substr(d, 11, 1)::INTEGER;
END;
$function$;

-- ── 4. Gravar com o código ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_salvar(p_setor_id UUID, p_id UUID, p_dados JSONB)
RETURNS public.ouvidoria_manifestacoes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid        UUID := (SELECT auth.uid());
  v_eu_nome    TEXT;
  v_empresa    UUID;
  v_antes      public.ouvidoria_manifestacoes;
  v_depois     public.ouvidoria_manifestacoes;
  v_num        BIGINT;
  v_data       DATE;
  v_canal      TEXT := NULLIF(btrim(p_dados ->> 'canal'), '');
  v_nome       TEXT := NULLIF(btrim(p_dados ->> 'nome_profissional'), '');
  v_codigo_cli TEXT := NULLIF(regexp_replace(COALESCE(p_dados ->> 'codigo_cliente', ''), '\s', '', 'g'), '');
  v_uf         TEXT := NULLIF(upper(btrim(p_dados ->> 'conselho_uf')), '');
  v_assunto    TEXT := NULLIF(btrim(p_dados ->> 'assunto'), '');
  v_descricao  TEXT := NULLIF(btrim(p_dados ->> 'descricao'), '');
  v_anuidades  INTEGER[];
  v_situacao   TEXT := NULLIF(btrim(p_dados ->> 'situacao_financeira'), '');
  v_providenc  TEXT := NULLIF(btrim(p_dados ->> 'providencia'), '');
  v_resp_id    UUID := NULLIF(p_dados ->> 'responsavel_id', '')::UUID;
  v_resp_nome  TEXT;
  v_resposta   DATE := NULLIF(p_dados ->> 'data_resposta', '')::DATE;
  v_acompanhar BOOLEAN := COALESCE((p_dados ->> 'acompanhar')::BOOLEAN, FALSE);
  v_status     TEXT := NULLIF(btrim(p_dados ->> 'status'), '');
  v_obs        TEXT := NULLIF(btrim(p_dados ->> 'observacoes'), '');
  v_mudou      TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso à Ouvidoria deste setor.' USING ERRCODE = '42501';
  END IF;

  SELECT s.empresa_id INTO v_empresa FROM public.setores s WHERE s.id = p_setor_id;
  SELECT p.nome INTO v_eu_nome FROM public.perfis p WHERE p.id = v_uid;

  -- Obrigatórios.
  v_data := COALESCE(NULLIF(p_dados ->> 'data_manifestacao', '')::DATE,
                     (now() AT TIME ZONE 'America/Sao_Paulo')::DATE);
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Informe o nome do profissional.' USING ERRCODE = '22023'; END IF;
  IF v_canal IS NULL THEN RAISE EXCEPTION 'Escolha o canal de atendimento.' USING ERRCODE = '22023'; END IF;
  IF v_assunto IS NULL THEN RAISE EXCEPTION 'Escolha o assunto.' USING ERRCODE = '22023'; END IF;
  IF v_descricao IS NULL THEN RAISE EXCEPTION 'Descreva a reclamação.' USING ERRCODE = '22023'; END IF;
  IF v_data > (now() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'A data da manifestação não pode ser no futuro.' USING ERRCODE = '22023';
  END IF;
  IF v_resposta IS NOT NULL AND v_resposta < v_data THEN
    RAISE EXCEPTION 'A data da resposta não pode ser antes da manifestação.' USING ERRCODE = '22023';
  END IF;

  -- Código do cliente: só números, como no acordo, e nunca um CPF.
  IF v_codigo_cli IS NOT NULL THEN
    IF v_codigo_cli !~ '^[0-9]{1,20}$' THEN
      RAISE EXCEPTION 'O código do cliente é só números.' USING ERRCODE = '22023';
    END IF;
    IF public.fn_ouvidoria_eh_cpf(v_codigo_cli) THEN
      RAISE EXCEPTION 'Esse número é um CPF. Use o código do cliente no ERP — CPF não pode ser gravado no sistema.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Anuidades: anos de quatro dígitos, sem repetir, em ordem.
  SELECT COALESCE(array_agg(DISTINCT a ORDER BY a), ARRAY[]::INTEGER[]) INTO v_anuidades
    FROM (
      SELECT x::INTEGER AS a
        FROM jsonb_array_elements_text(COALESCE(p_dados -> 'anuidades', '[]'::jsonb)) x
       WHERE x ~ '^[0-9]{4}$'
    ) t
   WHERE a BETWEEN 1990 AND 2100;

  -- Responsável: alguém da mesma empresa (o nome fica gravado junto).
  IF v_resp_id IS NOT NULL THEN
    SELECT p.nome INTO v_resp_nome FROM public.perfis p
     WHERE p.id = v_resp_id AND p.empresa_id = v_empresa;
    IF v_resp_nome IS NULL THEN
      RAISE EXCEPTION 'O responsável escolhido não é desta empresa.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Sem status escolhido: a acompanhada nasce aberta; a de histórico, concluída.
  v_status := COALESCE(v_status, CASE WHEN v_acompanhar THEN 'aberto' ELSE 'concluido' END);

  IF p_id IS NULL THEN
    v_num := nextval('public.ouvidoria_manifestacoes_numero_seq');
    INSERT INTO public.ouvidoria_manifestacoes (
      empresa_id, setor_id, numero, codigo, data_manifestacao, canal, nome_profissional, codigo_cliente,
      conselho_uf, assunto, descricao, anuidades, situacao_financeira, providencia,
      responsavel_id, responsavel_nome, data_resposta, status, acompanhar, observacoes,
      criado_por, criado_por_nome, atualizado_por, atualizado_por_nome
    ) VALUES (
      v_empresa, p_setor_id, v_num, 'OUV-' || lpad(v_num::TEXT, 5, '0'), v_data, v_canal, v_nome, v_codigo_cli,
      v_uf, v_assunto, v_descricao, v_anuidades, v_situacao, v_providenc,
      v_resp_id, v_resp_nome, v_resposta, v_status, v_acompanhar, v_obs,
      v_uid, v_eu_nome, v_uid, v_eu_nome
    ) RETURNING * INTO v_depois;

    INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, status_para, autor_id, autor_nome)
    VALUES (v_depois.id, v_empresa, 'criada',
            CASE WHEN v_acompanhar THEN 'Registrada com acompanhamento' ELSE 'Registrada para histórico' END,
            v_status, v_uid, v_eu_nome);
    IF v_resposta IS NOT NULL THEN
      INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, autor_id, autor_nome)
      VALUES (v_depois.id, v_empresa, 'retorno',
              'Retorno ao profissional em ' || to_char(v_resposta, 'DD/MM/YYYY'), v_uid, v_eu_nome);
    END IF;
    RETURN v_depois;
  END IF;

  SELECT * INTO v_antes FROM public.ouvidoria_manifestacoes m
   WHERE m.id = p_id AND m.setor_id = p_setor_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manifestação não encontrada neste setor.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.ouvidoria_manifestacoes m SET
    data_manifestacao   = v_data,
    canal               = v_canal,
    nome_profissional   = v_nome,
    codigo_cliente      = v_codigo_cli,
    conselho_uf         = v_uf,
    assunto             = v_assunto,
    descricao           = v_descricao,
    anuidades           = v_anuidades,
    situacao_financeira = v_situacao,
    providencia         = v_providenc,
    responsavel_id      = v_resp_id,
    responsavel_nome    = v_resp_nome,
    data_resposta       = v_resposta,
    status              = v_status,
    acompanhar          = v_acompanhar,
    observacoes         = v_obs,
    atualizado_por      = v_uid,
    atualizado_por_nome = v_eu_nome,
    atualizado_em       = now()
   WHERE m.id = p_id
   RETURNING * INTO v_depois;

  -- A linha do tempo: uma entrada para cada coisa que importa acompanhar.
  IF v_depois.status IS DISTINCT FROM v_antes.status THEN
    INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, status_de, status_para, autor_id, autor_nome)
    VALUES (p_id, v_empresa, 'status', v_antes.status, v_depois.status, v_uid, v_eu_nome);
  END IF;
  IF v_depois.data_resposta IS DISTINCT FROM v_antes.data_resposta THEN
    INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, autor_id, autor_nome)
    VALUES (p_id, v_empresa, 'retorno',
            CASE WHEN v_depois.data_resposta IS NULL THEN 'Retorno ao profissional desmarcado'
                 ELSE 'Retorno ao profissional em ' || to_char(v_depois.data_resposta, 'DD/MM/YYYY') END,
            v_uid, v_eu_nome);
  END IF;
  IF v_depois.responsavel_id IS DISTINCT FROM v_antes.responsavel_id THEN
    INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, autor_id, autor_nome)
    VALUES (p_id, v_empresa, 'responsavel',
            COALESCE('Responsável: ' || v_depois.responsavel_nome, 'Responsável removido'), v_uid, v_eu_nome);
  END IF;
  IF v_depois.acompanhar IS DISTINCT FROM v_antes.acompanhar THEN
    INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, autor_id, autor_nome)
    VALUES (p_id, v_empresa, 'acompanhamento',
            CASE WHEN v_depois.acompanhar THEN 'Passou a ter acompanhamento' ELSE 'Passou a ser só histórico' END,
            v_uid, v_eu_nome);
  END IF;

  IF v_depois.data_manifestacao   IS DISTINCT FROM v_antes.data_manifestacao   THEN v_mudou := array_append(v_mudou, 'data'); END IF;
  IF v_depois.canal               IS DISTINCT FROM v_antes.canal               THEN v_mudou := array_append(v_mudou, 'canal'); END IF;
  IF v_depois.nome_profissional   IS DISTINCT FROM v_antes.nome_profissional   THEN v_mudou := array_append(v_mudou, 'nome'); END IF;
  IF v_depois.codigo_cliente      IS DISTINCT FROM v_antes.codigo_cliente      THEN v_mudou := array_append(v_mudou, 'código do cliente'); END IF;
  IF v_depois.conselho_uf         IS DISTINCT FROM v_antes.conselho_uf         THEN v_mudou := array_append(v_mudou, 'conselho'); END IF;
  IF v_depois.assunto             IS DISTINCT FROM v_antes.assunto             THEN v_mudou := array_append(v_mudou, 'assunto'); END IF;
  IF v_depois.descricao           IS DISTINCT FROM v_antes.descricao           THEN v_mudou := array_append(v_mudou, 'descrição'); END IF;
  IF v_depois.anuidades           IS DISTINCT FROM v_antes.anuidades           THEN v_mudou := array_append(v_mudou, 'anuidade'); END IF;
  IF v_depois.situacao_financeira IS DISTINCT FROM v_antes.situacao_financeira THEN v_mudou := array_append(v_mudou, 'situação financeira'); END IF;
  IF v_depois.providencia         IS DISTINCT FROM v_antes.providencia         THEN v_mudou := array_append(v_mudou, 'providência'); END IF;
  IF v_depois.observacoes         IS DISTINCT FROM v_antes.observacoes         THEN v_mudou := array_append(v_mudou, 'observações'); END IF;
  IF cardinality(v_mudou) > 0 THEN
    INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, autor_id, autor_nome)
    VALUES (p_id, v_empresa, 'edicao', 'Alterou ' || array_to_string(v_mudou, ', '), v_uid, v_eu_nome);
  END IF;

  RETURN v_depois;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ouvidoria_eh_cpf(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_eh_cpf(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_salvar(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_salvar(UUID, UUID, JSONB) TO authenticated;

-- ── 5. Prova ───────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'ouvidoria_manifestacoes' AND column_name = 'cpf') THEN
    RAISE EXCEPTION 'A coluna cpf ainda está em ouvidoria_manifestacoes.';
  END IF;
  IF NOT public.fn_ouvidoria_eh_cpf('529.982.247-25') OR public.fn_ouvidoria_eh_cpf('52998224726')
     OR public.fn_ouvidoria_eh_cpf('11111111111') OR public.fn_ouvidoria_eh_cpf('1234567') THEN
    RAISE EXCEPTION 'fn_ouvidoria_eh_cpf não confere com ehCpf do app.';
  END IF;
END
$prova$;

COMMIT;
