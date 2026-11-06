-- ============================================================================
-- 20261105140000_jornada_quatro_metas.sql
--
-- Abas Acesso e Retenção do Jornada: até QUATRO metas no mês (pedido de
-- 05/11/2026) — a 1ª e mais três faixas acima dela, como os desafios do
-- Receptivo. Vale para a meta do grupo e para a meta individual.
--
-- ## Como fica guardado
--
--   jornada_metas.meta / jornada_metas_pessoa.meta   a 1ª meta (como já era)
--   *.metas_extras INTEGER[]                         a 2ª, 3ª e 4ª, em ordem
--
-- A pessoa com meta própria tem as quatro dela; sem meta própria, as do grupo.
--
-- ## O que NÃO muda
--
-- Nenhuma função existente é reescrita. `fn_jornada_meta_salvar` e
-- `fn_jornada_meta_pessoas_salvar` continuam gravando a 1ª meta — o UPDATE
-- delas não toca `metas_extras`, que fica onde estava; tirar a 1ª meta (apagar
-- a linha) leva as faixas junto. As faixas entram por duas funções NOVAS:
--
--   fn_jornada_faixas(grupo)          ler — mesma regra de quem vê o painel
--   fn_jornada_faixas_salvar(...)     gravar — só a liderança
--
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1. As colunas ──────────────────────────────────────────────────────────

ALTER TABLE public.jornada_metas
  ADD COLUMN IF NOT EXISTS metas_extras INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE public.jornada_metas_pessoa
  ADD COLUMN IF NOT EXISTS metas_extras INTEGER[] NOT NULL DEFAULT '{}';

-- Até três faixas, cada uma no mesmo limite da 1ª. A ordem crescente é
-- cobrada na gravação (fn_jornada_faixas_salvar), e não aqui: uma CHECK que
-- comparasse com `meta` faria `fn_jornada_meta_salvar` falhar ao subir a 1ª.
CREATE OR REPLACE FUNCTION public.fn_jornada_faixas_no_limite(p_extras INTEGER[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT COALESCE(cardinality(p_extras), 0) <= 3
     AND NOT EXISTS (SELECT 1 FROM unnest(p_extras) v WHERE v IS NULL OR v < 1 OR v > 100000);
$function$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jornada_metas_extras_limite') THEN
    ALTER TABLE public.jornada_metas
      ADD CONSTRAINT jornada_metas_extras_limite CHECK (public.fn_jornada_faixas_no_limite(metas_extras));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jornada_metas_pessoa_extras_limite') THEN
    ALTER TABLE public.jornada_metas_pessoa
      ADD CONSTRAINT jornada_metas_pessoa_extras_limite CHECK (public.fn_jornada_faixas_no_limite(metas_extras));
  END IF;
END $$;

-- ── 2. Ler as faixas ───────────────────────────────────────────────────────
-- A liderança recebe as do grupo e as de todos; o membro, as do grupo e as
-- dele — a mesma regra do placar de `fn_jornada_painel`.

CREATE OR REPLACE FUNCTION public.fn_jornada_faixas(p_grupo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid  UUID := (SELECT auth.uid());
  v_gere BOOLEAN := public.fn_jornada_gere(p_grupo_id);
BEGIN
  IF NOT (v_gere OR public.fn_jornada_membro(p_grupo_id)) THEN
    RAISE EXCEPTION 'Sem permissao para ver este grupo.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'grupo', COALESCE((SELECT to_jsonb(m.metas_extras) FROM public.jornada_metas m
                        WHERE m.grupo_id = p_grupo_id), '[]'::JSONB),
    'pessoas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('perfil_id', mp.perfil_id, 'extras', to_jsonb(mp.metas_extras)))
        FROM public.jornada_metas_pessoa mp
       WHERE mp.grupo_id = p_grupo_id
         AND (v_gere OR mp.perfil_id = v_uid)
    ), '[]'::JSONB)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_faixas(UUID) IS
  '2a, 3a e 4a metas de um grupo do Jornada (do grupo e individuais). Membro ve '
  'as do grupo e as proprias; lideranca ve todas. 20261105140000.';

-- ── 3. Gravar as faixas ────────────────────────────────────────────────────
--
-- p_grupo   = as faixas do grupo; NULL = não mexe no grupo.
-- p_pessoas = [{"perfil_id": "...", "extras": [120, 140, 160]}, ...]
--
-- Só grava onde já existe a 1ª meta (a linha), e exige ordem crescente a
-- partir dela: 2ª > 1ª, 3ª > 2ª, 4ª > 3ª.

CREATE OR REPLACE FUNCTION public.fn_jornada_faixas_salvar(
  p_grupo_id UUID, p_grupo INTEGER[], p_pessoas JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_item   JSONB;
  v_pid    UUID;
  v_extras INTEGER[];
  v_base   INTEGER;
  v_ant    INTEGER;
  v_val    INTEGER;
BEGIN
  IF NOT public.fn_jornada_gere(p_grupo_id) THEN
    RAISE EXCEPTION 'So a lideranca configura a meta.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_pessoas, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Lista de metas invalida.' USING ERRCODE = '22023';
  END IF;

  -- O grupo.
  IF p_grupo IS NOT NULL THEN
    SELECT m.meta INTO v_base FROM public.jornada_metas m WHERE m.grupo_id = p_grupo_id;
    IF v_base IS NULL AND cardinality(p_grupo) > 0 THEN
      RAISE EXCEPTION 'Defina a 1a meta do grupo antes das outras.' USING ERRCODE = '22023';
    END IF;
    IF NOT public.fn_jornada_faixas_no_limite(p_grupo) THEN
      RAISE EXCEPTION 'Metas invalidas: ate 4 metas, de 1 a 100000.' USING ERRCODE = '22023';
    END IF;
    v_ant := v_base;
    FOREACH v_val IN ARRAY p_grupo LOOP
      IF v_val <= v_ant THEN
        RAISE EXCEPTION 'Cada meta tem de ser maior que a anterior.' USING ERRCODE = '22023';
      END IF;
      v_ant := v_val;
    END LOOP;
    UPDATE public.jornada_metas
       SET metas_extras = p_grupo, atualizado_por = (SELECT auth.uid()), atualizado_em = NOW()
     WHERE grupo_id = p_grupo_id;
  END IF;

  -- As pessoas.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_pessoas, '[]'::JSONB)) LOOP
    v_pid := NULLIF(v_item->>'perfil_id', '')::UUID;
    IF v_pid IS NULL THEN
      RAISE EXCEPTION 'Pessoa invalida.' USING ERRCODE = '22023';
    END IF;
    v_extras := COALESCE(
      ARRAY(SELECT (x)::INTEGER FROM jsonb_array_elements_text(COALESCE(v_item->'extras', '[]'::JSONB)) x),
      '{}'::INTEGER[]);

    SELECT mp.meta INTO v_base FROM public.jornada_metas_pessoa mp
     WHERE mp.grupo_id = p_grupo_id AND mp.perfil_id = v_pid;
    IF v_base IS NULL THEN
      IF cardinality(v_extras) > 0 THEN
        RAISE EXCEPTION 'Defina a 1a meta individual antes das outras.' USING ERRCODE = '22023';
      END IF;
      CONTINUE;
    END IF;
    IF NOT public.fn_jornada_faixas_no_limite(v_extras) THEN
      RAISE EXCEPTION 'Metas invalidas: ate 4 metas, de 1 a 100000.' USING ERRCODE = '22023';
    END IF;
    v_ant := v_base;
    FOREACH v_val IN ARRAY v_extras LOOP
      IF v_val <= v_ant THEN
        RAISE EXCEPTION 'Cada meta tem de ser maior que a anterior.' USING ERRCODE = '22023';
      END IF;
      v_ant := v_val;
    END LOOP;

    UPDATE public.jornada_metas_pessoa
       SET metas_extras = v_extras, atualizado_por = (SELECT auth.uid()), atualizado_em = NOW()
     WHERE grupo_id = p_grupo_id AND perfil_id = v_pid;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_faixas_salvar(UUID, INTEGER[], JSONB) IS
  'Grava a 2a, 3a e 4a metas (do grupo e individuais) de um grupo do Jornada. '
  'So a lideranca; exige a 1a meta e ordem crescente. 20261105140000.';

-- ── 4. Grants ──────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_jornada_faixas_no_limite(INTEGER[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_faixas(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_faixas_salvar(UUID, INTEGER[], JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_jornada_faixas_no_limite(INTEGER[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_faixas(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_faixas_salvar(UUID, INTEGER[], JSONB) TO authenticated;

COMMIT;
