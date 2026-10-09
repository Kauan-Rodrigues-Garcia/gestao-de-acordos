-- ============================================================================
-- Editar campanha desativada: DELETE com WHERE — correção de 09/10/2026
-- ============================================================================
--
-- Em produção, «Salvar» na edição de uma campanha desativada devolvia:
--   «DELETE requires a WHERE clause» (21000)
-- O Supabase liga o `safeupdate` nas chamadas que chegam pela API (PostgREST):
-- DELETE/UPDATE sem WHERE é recusado, mesmo dentro de função e mesmo numa
-- tabela temporária. `fn_campanha_facil_lote_editar` limpava a lista de
-- atribuição com `DELETE FROM pg_temp.cf_atrib;` e por isso nunca salvava.
-- Mesmo erro de 20260930200115 (rodada das metas).
--
-- A correção é só o `WHERE TRUE` — o resto da função é idêntico a
-- 20261007190000 (conferido com `pg_get_functiondef` em 09/10). Nenhuma linha
-- de dado muda. Os GRANTs ficam: CREATE OR REPLACE mantém os privilégios.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_campanha_facil_lote_editar(
  p_lote UUID, p_titulo TEXT, p_modelo TEXT, p_atribuicao JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  l          public.campanha_facil_lotes%ROWTYPE;
  v_titulo   TEXT;
  v_pend     INTEGER;
  v_atrib    INTEGER;
  v_distinto INTEGER;
  v_casam    INTEGER;
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

COMMIT;
