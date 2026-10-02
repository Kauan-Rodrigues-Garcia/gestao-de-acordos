-- ============================================================================
-- Receptivo (BookPlay) — meta de outubro/2026 só do Pedro
-- ============================================================================
--
-- Sobra de receptivo_metas_2026_10.sql: «Pedro» (equipe MATHEUS) ficou de fora
-- porque não havia usuário `pedro` nem `pedro_…` no Receptivo.
--
-- Meta: 30.000 → 40.000 / 50.000 / 60.000 (cria ou substitui a linha de
-- outubro; meta em quantidade, meta indireta e régua ficam como estão).
--
-- Acha o Pedro, sem diferenciar maiúscula, nesta ordem:
--   1. usuário exatamente `pedro`;
--   2. no Receptivo, usuário OU nome contendo «pedro».
-- Precisa achar UM só. Com zero ou mais de um, não grava nada e a mensagem
-- lista os candidatos (usuário — nome) para escolher.
-- ============================================================================

BEGIN;

DO $pedro$
DECLARE
  c_empresa CONSTANT UUID    := '9bed94cd-605d-4d43-9afb-352c72b05c50';
  c_setor   CONSTANT UUID    := '6dd54018-e78f-4f3b-bca3-4221fe97f38b';
  c_ano     CONSTANT INTEGER := 2026;
  c_mes     CONSTANT INTEGER := 10;
  c_meta    CONSTANT NUMERIC := 30000;
  c_extras  CONSTANT JSONB   := '[40000, 50000, 60000]';
  v_ids     UUID[];
  v_lista   TEXT;
BEGIN
  IF public.fn_metas_esta_validada(c_empresa, c_setor, c_mes, c_ano) THEN
    RAISE EXCEPTION 'A meta do Receptivo está validada em outubro/2026: reabra antes de gravar.';
  END IF;

  SELECT array_agg(p.id) INTO v_ids
    FROM public.perfis p
   WHERE p.empresa_id = c_empresa AND p.setor_id = c_setor
     AND lower(btrim(p.usuario)) = 'pedro';

  IF v_ids IS NULL THEN
    SELECT array_agg(p.id) INTO v_ids
      FROM public.perfis p
     WHERE p.empresa_id = c_empresa AND p.setor_id = c_setor
       AND (p.usuario ILIKE '%pedro%' OR p.nome ILIKE '%pedro%');
  END IF;

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Nada gravado: nenhum usuário ou nome com «pedro» no Receptivo.';
  ELSIF cardinality(v_ids) > 1 THEN
    SELECT string_agg(coalesce(p.usuario, '(sem usuário)') || ' — ' || p.nome, '; ' ORDER BY p.nome)
      INTO v_lista
      FROM public.perfis p WHERE p.id = ANY (v_ids);
    RAISE EXCEPTION 'Nada gravado: % candidatos com «pedro»: %', cardinality(v_ids), v_lista;
  END IF;

  INSERT INTO public.metas
    (tipo, referencia_id, empresa_id, meta_valor, metas_extras, meta_proporcional, mes, ano)
  VALUES
    ('operador', v_ids[1], c_empresa, c_meta, c_extras, false, c_mes, c_ano)
  ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE
     SET meta_valor        = EXCLUDED.meta_valor,
         metas_extras      = EXCLUDED.metas_extras,
         meta_proporcional = EXCLUDED.meta_proporcional,
         updated_at        = NOW();

  IF NOT EXISTS (
    SELECT 1 FROM public.metas m
     WHERE m.tipo = 'operador' AND m.referencia_id = v_ids[1] AND m.empresa_id = c_empresa
       AND m.mes = c_mes AND m.ano = c_ano
       AND m.meta_valor = c_meta AND m.metas_extras = c_extras
  ) THEN
    RAISE EXCEPTION 'Meta do Pedro não conferiu depois de gravar.';
  END IF;
END
$pedro$;

COMMIT;

-- Conferência na tela do SQL Editor: quem foi gravado.
SELECT p.usuario, p.nome, e.nome AS equipe, m.meta_valor, m.metas_extras
  FROM public.metas m
  JOIN public.perfis p ON p.id = m.referencia_id
  LEFT JOIN public.equipes e ON e.id = p.equipe_id
 WHERE m.tipo = 'operador'
   AND m.empresa_id = '9bed94cd-605d-4d43-9afb-352c72b05c50'
   AND p.setor_id   = '6dd54018-e78f-4f3b-bca3-4221fe97f38b'
   AND m.ano = 2026 AND m.mes = 10
   AND (p.usuario ILIKE '%pedro%' OR p.nome ILIKE '%pedro%');
