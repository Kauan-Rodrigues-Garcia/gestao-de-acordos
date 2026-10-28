-- ============================================================================
-- Campanhas de WhatsApp: o operador edita TODAS as mensagens de uma vez
-- ============================================================================
--
-- Pedido do Cleber, 28/10/2026. Até aqui o operador só editava uma mensagem
-- por vez (`mensagem_editada` de um contato). Agora ele reescreve o MODELO da
-- parte dele — o texto com as variáveis ({{nome}}, {{quitacao}}…) — e o banco
-- refaz todas as pendentes dele com os valores de cada cliente, pela mesma
-- `fn_cf_renderizar` que o líder usa ao editar a campanha.
--
-- O que muda e o que não muda:
--   • Só as PENDENTES do próprio operador, e só em campanha ativa e no prazo
--     (a mesma régua da policy `cf_contatos_update`). Enviada e «não deu» não
--     mudam: já saíram, ou já foram resolvidas.
--   • O texto vai para `mensagem_editada`; `mensagem` (a do líder) fica. Voltar
--     ao modelo do líder = `mensagem_editada` NULL nas pendentes.
--   • Sobrescreve também a pendente que ele tinha editado uma a uma.
--   • O modelo dele fica guardado no envio (`modelo_operador`) junto com o
--     modelo do líder daquele momento (`modelo_operador_base`). Se o líder
--     editar a campanha depois (o que refaz as pendentes e zera as edições),
--     a base deixa de bater e a tela volta a mostrar o modelo do líder.
--   • O CPF continua mascarado: `trg_cf_contatos_zz_mascarar_cpf` vale para
--     `mensagem_editada`, e `variaveis.cpf` já é o mascarado.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.campanha_facil_envios
  ADD COLUMN IF NOT EXISTS modelo_operador      TEXT,
  ADD COLUMN IF NOT EXISTS modelo_operador_base TEXT;

COMMENT ON COLUMN public.campanha_facil_envios.modelo_operador IS
  'O modelo reescrito pelo operador para a parte dele (20261028160000). Vale só '
  'enquanto modelo_operador_base = o modelo do lote.';

-- ── O modelo que o operador edita ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_campanha_facil_meu_modelo(p_envio UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  e RECORD;
  v_exemplo JSONB;
  v_com     INTEGER;
  v_sem     INTEGER;
BEGIN
  SELECT en.id, en.modelo_operador, en.modelo_operador_base, l.modelo, l.sem_valores
    INTO e
    FROM public.campanha_facil_envios en
    JOIN public.campanha_facil_lotes l ON l.id = en.lote_id
   WHERE en.id = p_envio
     AND en.operador_id = (SELECT auth.uid())
     AND en.ativa AND en.expira_em > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'CF_INDISPONIVEL: campanha desativada ou fora do prazo.'; END IF;

  SELECT count(*) FILTER (WHERE c.variaveis IS NOT NULL),
         count(*) FILTER (WHERE c.variaveis IS NULL)
    INTO v_com, v_sem
    FROM public.campanha_facil_contatos c
   WHERE c.envio_id = p_envio AND c.status = 'pendente';

  -- Um cliente de verdade para a prévia: a primeira pendente da fila.
  SELECT c.variaveis INTO v_exemplo
    FROM public.campanha_facil_contatos c
   WHERE c.envio_id = p_envio AND c.variaveis IS NOT NULL
   ORDER BY (c.status = 'pendente') DESC, c.ordem
   LIMIT 1;

  RETURN jsonb_build_object(
    'modelo_lider', e.modelo,
    'modelo', CASE WHEN e.modelo_operador IS NOT NULL
                    AND e.modelo_operador_base IS NOT DISTINCT FROM e.modelo
                   THEN e.modelo_operador ELSE e.modelo END,
    'personalizado', e.modelo_operador IS NOT NULL
                     AND e.modelo_operador_base IS NOT DISTINCT FROM e.modelo,
    'sem_valores', e.sem_valores,
    'exemplo', v_exemplo,
    'pendentes', v_com,
    'pendentes_sem_variaveis', v_sem
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_campanha_facil_meu_modelo(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_meu_modelo(UUID) TO authenticated;

-- ── Reescrever todas as pendentes ───────────────────────────────────────────
-- `p_modelo` vazio ou NULL volta ao modelo do líder. Devolve quantas mudaram.
CREATE OR REPLACE FUNCTION public.fn_campanha_facil_reescrever_minhas(p_envio UUID, p_modelo TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  e       RECORD;
  v_texto TEXT := NULLIF(btrim(COALESCE(p_modelo, '')), '');
  v_n     INTEGER;
BEGIN
  SELECT en.id, l.modelo
    INTO e
    FROM public.campanha_facil_envios en
    JOIN public.campanha_facil_lotes l ON l.id = en.lote_id
   WHERE en.id = p_envio
     AND en.operador_id = (SELECT auth.uid())
     AND en.ativa AND en.expira_em > now()
     FOR UPDATE OF en;
  IF NOT FOUND THEN RAISE EXCEPTION 'CF_INDISPONIVEL: campanha desativada ou fora do prazo.'; END IF;

  IF v_texto IS NOT NULL AND length(v_texto) > 6000 THEN
    RAISE EXCEPTION 'CF_MODELO_LONGO: a mensagem passa de 6000 caracteres.';
  END IF;

  -- O modelo do líder de novo: some a edição de todas as pendentes.
  IF v_texto IS NULL OR v_texto = btrim(COALESCE(e.modelo, '')) THEN
    UPDATE public.campanha_facil_contatos c
       SET mensagem_editada = NULL
     WHERE c.envio_id = p_envio AND c.status = 'pendente' AND c.mensagem_editada IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE public.campanha_facil_envios
       SET modelo_operador = NULL, modelo_operador_base = NULL
     WHERE id = p_envio;
    RETURN v_n;
  END IF;

  -- `fn_cf_contatos_ao_alterar` zera a edição que ficar igual à original.
  UPDATE public.campanha_facil_contatos c
     SET mensagem_editada = public.fn_cf_renderizar(v_texto, c.variaveis)
   WHERE c.envio_id = p_envio AND c.status = 'pendente' AND c.variaveis IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.campanha_facil_envios
     SET modelo_operador = v_texto, modelo_operador_base = e.modelo
   WHERE id = p_envio;

  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_campanha_facil_reescrever_minhas(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_reescrever_minhas(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_campanha_facil_reescrever_minhas(UUID, TEXT) IS
  'O operador reescreve o modelo da parte dele: refaz mensagem_editada de todas as '
  'pendentes com fn_cf_renderizar. Vazio volta ao modelo do líder. 20261028160000.';

COMMIT;
