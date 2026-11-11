-- ============================================================================
-- Campanha Fácil: trocar o desconto ao editar a campanha — 11/11/2026
-- ============================================================================
--
-- Pedido: ao editar a campanha desativada, o líder também muda o desconto. A
-- mudança vale SÓ para esta campanha e SÓ para as mensagens pendentes: o que
-- já foi enviado (ou copiado, ou «não deu») não muda, as outras campanhas não
-- mudam, e as configurações de desconto do setor (`campanha_facil_descontos`)
-- também não.
--
-- 1. `campanha_facil_contatos.base` — os números do cliente que a conta do
--    desconto usa (parcelas em atraso, valor, valor aberto, valor atualizado).
--    Quem grava é o navegador, na liberação, como as outras colunas (o GRANT
--    de INSERT da tabela já cobre a coluna nova). Contato antigo fica NULL: o
--    desconto dele não muda. Sem CPF, sem nome.
--
-- 2. `fn_campanha_facil_lote_editar` ganha `p_variaveis` (DEFAULT NULL): uma
--    lista `[{id, variaveis}]` com as variáveis de valor refeitas de CADA
--    pendente da campanha. A conta é do navegador (a mesma `deriveRecord` da
--    montagem); o banco confere que a lista é exatamente a dos pendentes desta
--    campanha, junta por cima das variáveis que o contato já tinha
--    (`variaveis || novas` — nome, CPF mascarado e o resto ficam) e refaz o
--    texto com a mensagem da campanha. Sem `p_variaveis` a função faz o mesmo
--    que fazia.
--
--    A assinatura muda (4 → 5 argumentos): a velha sai com DROP para não ficar
--    uma sobrecarga ambígua para o PostgREST. A chamada do app de antes (4
--    argumentos nomeados) continua casando com a nova pelo DEFAULT.
--
-- O resto da função é igual à da 20261009120000. ANTES DE APLICAR, conferir
-- que a função viva ainda é aquela (o histórico de migrations está defasado):
--   SELECT pg_get_functiondef('public.fn_campanha_facil_lote_editar(uuid,text,text,jsonb)'::regprocedure);
--
-- Nenhuma linha de dado muda nesta migration.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. A base do desconto ───────────────────────────────────────────────────

ALTER TABLE public.campanha_facil_contatos ADD COLUMN IF NOT EXISTS base JSONB;

COMMENT ON COLUMN public.campanha_facil_contatos.base IS
  'Números do cliente para refazer o desconto na edição da campanha: '
  '{parcelas, valor, valor_aberto, valor_atualizado}. NULL = campanha anterior a 11/11/2026 ou relatório sem valores.';

-- ── 2. Editar com o desconto novo ───────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_campanha_facil_lote_editar(UUID, TEXT, TEXT, JSONB);

CREATE FUNCTION public.fn_campanha_facil_lote_editar(
  p_lote UUID, p_titulo TEXT, p_modelo TEXT, p_atribuicao JSONB, p_variaveis JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  l           public.campanha_facil_lotes%ROWTYPE;
  v_titulo    TEXT;
  v_modelo    TEXT;
  v_pend      INTEGER;
  v_atrib     INTEGER;
  v_distinto  INTEGER;
  v_casam     INTEGER;
  v_vars      INTEGER;
  v_vars_dist INTEGER;
  v_vars_cas  INTEGER;
BEGIN
  SELECT * INTO l FROM public.campanha_facil_lotes
   WHERE id = p_lote AND criado_por = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF l.encerrada_em IS NOT NULL THEN
    RAISE EXCEPTION 'Esta campanha já encerrou.';
  END IF;
  IF l.ativa THEN
    RAISE EXCEPTION 'Desative a campanha antes de editar.';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.cf_atrib (op UUID, id UUID) ON COMMIT DROP;
  DELETE FROM pg_temp.cf_atrib WHERE TRUE;  -- safeupdate: sem WHERE a API recusa
  INSERT INTO pg_temp.cf_atrib (op, id)
  SELECT (a ->> 'operador_id')::UUID, x::UUID
    FROM jsonb_array_elements(COALESCE(p_atribuicao, '[]'::JSONB)) a
   CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(a -> 'contatos', '[]'::JSONB)) x;

  SELECT count(*) INTO v_pend
    FROM public.campanha_facil_contatos c
    JOIN public.campanha_facil_envios e ON e.id = c.envio_id
   WHERE e.lote_id = l.id AND c.status = 'pendente';
  SELECT count(*), count(DISTINCT id) INTO v_atrib, v_distinto FROM pg_temp.cf_atrib;
  SELECT count(*) INTO v_casam
    FROM pg_temp.cf_atrib a
    JOIN public.campanha_facil_contatos c ON c.id = a.id AND c.status = 'pendente'
    JOIN public.campanha_facil_envios e ON e.id = c.envio_id AND e.lote_id = l.id;
  IF v_atrib <> v_distinto OR v_atrib <> v_pend OR v_casam <> v_pend THEN
    RAISE EXCEPTION 'As mensagens da campanha mudaram. Atualize e tente de novo.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (SELECT DISTINCT op FROM pg_temp.cf_atrib) a
      LEFT JOIN public.perfis pf ON pf.id = a.op AND pf.empresa_id = l.empresa_id
     WHERE pf.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Há operador de fora da empresa na lista.';
  END IF;

  -- O desconto novo: uma linha para CADA pendente desta campanha, nem mais
  -- nem menos — senão parte da campanha sairia com um % e parte com outro.
  IF p_variaveis IS NOT NULL THEN
    IF jsonb_typeof(p_variaveis) <> 'array' THEN
      RAISE EXCEPTION 'Desconto em formato inválido.';
    END IF;
    v_modelo := COALESCE(NULLIF(p_modelo, ''), l.modelo);
    IF v_modelo IS NULL THEN
      RAISE EXCEPTION 'Esta campanha não guarda a mensagem: o desconto dela não pode ser trocado.';
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS pg_temp.cf_vars (id UUID, vars JSONB) ON COMMIT DROP;
    DELETE FROM pg_temp.cf_vars WHERE TRUE;  -- safeupdate
    INSERT INTO pg_temp.cf_vars (id, vars)
    SELECT NULLIF(v ->> 'id', '')::UUID, v -> 'variaveis'
      FROM jsonb_array_elements(p_variaveis) v;

    IF EXISTS (
      SELECT 1 FROM pg_temp.cf_vars
       WHERE id IS NULL OR vars IS NULL OR jsonb_typeof(vars) <> 'object'
    ) THEN
      RAISE EXCEPTION 'Desconto em formato inválido.';
    END IF;

    SELECT count(*), count(DISTINCT id) INTO v_vars, v_vars_dist FROM pg_temp.cf_vars;
    SELECT count(*) INTO v_vars_cas
      FROM pg_temp.cf_vars x
      JOIN public.campanha_facil_contatos c ON c.id = x.id AND c.status = 'pendente'
      JOIN public.campanha_facil_envios e ON e.id = c.envio_id AND e.lote_id = l.id;
    IF v_vars <> v_vars_dist OR v_vars <> v_pend OR v_vars_cas <> v_pend THEN
      RAISE EXCEPTION 'As mensagens da campanha mudaram. Atualize e tente de novo.';
    END IF;
  END IF;

  v_titulo := left(COALESCE(NULLIF(btrim(p_titulo), ''), l.titulo), 200);
  UPDATE public.campanha_facil_lotes
     SET titulo = v_titulo,
         modelo = COALESCE(NULLIF(p_modelo, ''), modelo),
         editada_em = now()
   WHERE id = l.id;
  UPDATE public.campanha_facil_envios SET titulo = v_titulo WHERE lote_id = l.id;

  -- Quem passa a receber e ainda não tinha envio nesta campanha.
  INSERT INTO public.campanha_facil_envios
    (empresa_id, lote_id, setor_id, operador_id, operador_nome, titulo, arquivo_nome,
     qtd, linhas, repasse, criado_por, criado_por_nome, expira_em, ativa)
  SELECT l.empresa_id, l.id, l.setor_id, pf.id, COALESCE(pf.nome, ''), v_titulo, l.arquivo_nome,
         0, NULL, FALSE, l.criado_por, l.criado_por_nome, l.expira_em, FALSE
    FROM (SELECT DISTINCT op FROM pg_temp.cf_atrib) a
    JOIN public.perfis pf ON pf.id = a.op
   WHERE NOT EXISTS (
     SELECT 1 FROM public.campanha_facil_envios e WHERE e.lote_id = l.id AND e.operador_id = a.op
   );

  -- Cada pendente vai para o envio (o mais antigo) do operador escolhido.
  UPDATE public.campanha_facil_contatos c
     SET envio_id = d.envio, operador_id = a.op
    FROM pg_temp.cf_atrib a
    JOIN LATERAL (
      SELECT e.id AS envio FROM public.campanha_facil_envios e
       WHERE e.lote_id = l.id AND e.operador_id = a.op
       ORDER BY e.repasse, e.criado_em
       LIMIT 1
    ) d ON TRUE
   WHERE c.id = a.id AND c.envio_id IS DISTINCT FROM d.envio;

  -- Desconto novo: as variáveis de valor por cima das antigas, e o texto
  -- refeito com a mensagem da campanha. A edição à mão (do líder na montagem
  -- ou do operador) sai, como na troca de mensagem: ela tinha o valor velho.
  IF p_variaveis IS NOT NULL THEN
    UPDATE public.campanha_facil_contatos c
       SET variaveis = COALESCE(c.variaveis, '{}'::JSONB) || x.vars,
           mensagem = public.fn_cf_renderizar(v_modelo, COALESCE(c.variaveis, '{}'::JSONB) || x.vars),
           mensagem_editada = NULL
      FROM pg_temp.cf_vars x
     WHERE c.id = x.id AND c.status = 'pendente';
  END IF;

  IF NULLIF(p_modelo, '') IS NOT NULL AND p_modelo IS DISTINCT FROM l.modelo THEN
    UPDATE public.campanha_facil_contatos c
       SET mensagem = public.fn_cf_renderizar(p_modelo, c.variaveis), mensagem_editada = NULL
      FROM public.campanha_facil_envios e
     WHERE e.id = c.envio_id AND e.lote_id = l.id
       AND c.status = 'pendente' AND c.variaveis IS NOT NULL;
  END IF;

  DELETE FROM public.campanha_facil_envios e
   WHERE e.lote_id = l.id
     AND NOT EXISTS (SELECT 1 FROM public.campanha_facil_contatos c WHERE c.envio_id = e.id);
  UPDATE public.campanha_facil_envios e
     SET qtd = (SELECT count(*) FROM public.campanha_facil_contatos c WHERE c.envio_id = e.id)
   WHERE e.lote_id = l.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_campanha_facil_lote_editar(UUID, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_lote_editar(UUID, TEXT, TEXT, JSONB, JSONB) TO authenticated;

-- ── 3. Conferência ──────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.fn_campanha_facil_lote_editar(uuid,text,text,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'O app perdeu o acesso a editar a campanha.';
  END IF;
  IF to_regprocedure('public.fn_campanha_facil_lote_editar(uuid,text,text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'A versão de 4 argumentos continua no banco (sobrecarga ambígua).';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.campanha_facil_contatos', 'base', 'INSERT')
     OR NOT has_column_privilege('authenticated', 'public.campanha_facil_contatos', 'base', 'SELECT') THEN
    RAISE EXCEPTION 'O app não consegue gravar ou ler a base do desconto.';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
