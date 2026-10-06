-- ============================================================================
-- 20261006190000_calendario_publicar.sql
--
-- Calendário do setor: rascunho e publicação (pedido de 06/10/2026).
--
-- «Primeiro sempre é lançado para o líder preencher, e quando ele já preenche
-- tudo ele tem a opção de lançar para a operação.»
--
-- ## A regra
--
-- Todo mês nasce RASCUNHO. Quem monta o calendário (fn_calendario_edita) vê e
-- mexe em tudo; quem só consulta recebe o mês vazio até a liderança publicar.
-- Publicado, o que a liderança mudar depois aparece na hora para a operação —
-- e ela pode recolher o mês de volta para rascunho.
--
-- ## O que este arquivo faz
--
--   - acrescenta 2 colunas a `calendario_meses` (publicado_em, publicado_por);
--   - reescreve `fn_calendario_mes`, que passa a devolver `publicado` e a
--     esconder o rascunho de quem não edita;
--   - cria `fn_calendario_publicar` (publicar e recolher).
--
-- Nenhuma linha existente é alterada: os meses já montados continuam como
-- rascunho (publicado_em nulo) até a liderança publicar.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

-- ── 1. As colunas ───────────────────────────────────────────────────────────

ALTER TABLE public.calendario_meses
  ADD COLUMN IF NOT EXISTS publicado_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publicado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.calendario_meses.publicado_em IS
  'Quando a lideranca lancou o mes para a operacao. Nulo = rascunho, que so quem '
  'edita enxerga. Ver 20261006190000.';

-- ── 2. Ler o mês: o rascunho só para quem edita ─────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_calendario_mes(p_empresa_id UUID, p_setor_id UUID, p_mes DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mes       DATE := date_trunc('month', p_mes)::DATE;
  v_edita     BOOLEAN;
  v_publicado TIMESTAMPTZ;
BEGIN
  IF NOT public.fn_calendario_alcanca(p_empresa_id, p_setor_id) THEN
    RAISE EXCEPTION 'Sem permissao para ver o Calendario deste setor.' USING ERRCODE = '42501';
  END IF;

  v_edita := public.fn_calendario_edita(p_empresa_id, p_setor_id);

  SELECT m.publicado_em INTO v_publicado
    FROM public.calendario_meses m
   WHERE m.empresa_id = p_empresa_id AND m.setor_id = p_setor_id AND m.mes = v_mes;

  -- Rascunho, e quem pergunta não monta o calendário: o mês chega vazio.
  IF v_publicado IS NULL AND NOT v_edita THEN
    RETURN jsonb_build_object('publicado', false, 'publicado_em', NULL, 'capa', NULL, 'eventos', '[]'::JSONB);
  END IF;

  RETURN jsonb_build_object(
    'publicado',    v_publicado IS NOT NULL,
    'publicado_em', v_publicado,
    'capa', (
      SELECT jsonb_build_object(
               'tema', m.tema, 'titulo', m.titulo, 'frase', m.frase,
               'expediente_semana', m.expediente_semana, 'expediente_sabado', m.expediente_sabado,
               'atualizado_em', m.atualizado_em)
        FROM public.calendario_meses m
       WHERE m.empresa_id = p_empresa_id AND m.setor_id = p_setor_id AND m.mes = v_mes
    ),
    'eventos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', e.id, 'dia', e.dia, 'tipo', e.tipo, 'titulo', e.titulo,
               'detalhe', e.detalhe, 'destaque', e.destaque,
               'pessoa_id', e.pessoa_id, 'pessoa_nome', p.nome, 'pessoa_foto', p.foto_url)
             ORDER BY e.dia, e.criado_em)
        FROM public.calendario_eventos e
        LEFT JOIN public.perfis p ON p.id = e.pessoa_id
       WHERE e.empresa_id = p_empresa_id
         AND e.setor_id = p_setor_id
         AND e.dia >= v_mes
         AND e.dia < (v_mes + INTERVAL '1 month')::DATE
    ), '[]'::JSONB)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_calendario_mes(UUID, UUID, DATE) IS
  'A capa e os eventos do Calendario do setor no mes. Rascunho (nao publicado) '
  'chega vazio para quem nao edita. 20261006170000 + 20261006190000.';

-- ── 3. Publicar e recolher ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_calendario_publicar(
  p_empresa_id UUID, p_setor_id UUID, p_mes DATE, p_publicar BOOLEAN
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mes DATE := date_trunc('month', p_mes)::DATE;
  v_em  TIMESTAMPTZ := CASE WHEN COALESCE(p_publicar, FALSE) THEN NOW() END;
BEGIN
  IF NOT public.fn_calendario_edita(p_empresa_id, p_setor_id) THEN
    RAISE EXCEPTION 'Sem permissao para montar o Calendario deste setor.' USING ERRCODE = '42501';
  END IF;

  -- Mês sem capa ainda ganha a linha, com o tema padrão.
  INSERT INTO public.calendario_meses AS m
         (empresa_id, setor_id, mes, publicado_em, publicado_por, atualizado_por, atualizado_em)
  VALUES (p_empresa_id, p_setor_id, v_mes, v_em,
          CASE WHEN v_em IS NOT NULL THEN (SELECT auth.uid()) END,
          (SELECT auth.uid()), NOW())
  ON CONFLICT (empresa_id, setor_id, mes) DO UPDATE
     SET publicado_em  = EXCLUDED.publicado_em,
         publicado_por = EXCLUDED.publicado_por;

  RETURN v_em;
END;
$function$;

COMMENT ON FUNCTION public.fn_calendario_publicar(UUID, UUID, DATE, BOOLEAN) IS
  'Lanca o mes do Calendario para a operacao (p_publicar = true) ou o recolhe para '
  'rascunho. Devolve publicado_em. 20261006190000.';

REVOKE ALL ON FUNCTION public.fn_calendario_publicar(UUID, UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_calendario_publicar(UUID, UUID, DATE, BOOLEAN) TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'calendario_meses' AND column_name = 'publicado_em'
  ) THEN
    RAISE EXCEPTION 'calendario_meses.publicado_em nao foi criada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_calendario_mes'
       AND pg_get_functiondef(p.oid) ILIKE '%publicado%'
  ) THEN
    RAISE EXCEPTION 'fn_calendario_mes nao esconde o rascunho.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_calendario_publicar(uuid,uuid,date,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_calendario_publicar ficou aberta para anon.';
  END IF;
END
$prova$;

COMMIT;
