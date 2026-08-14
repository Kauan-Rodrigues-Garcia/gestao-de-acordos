-- ============================================================
-- Migration: Fase 1 (validação em duas etapas) — trava de meta por setor
-- (2026-07-21)
--
-- Contexto: até aqui qualquer cargo autorizado (admin/líder/super_admin/elite/
-- gerência) podia reescrever a meta de qualquer setor/equipe/operador a
-- qualquer momento, mesmo em meses passados. Isso passa a ter um portão:
-- só administrador/super_admin pode "validar" a meta de um setor num mês; a
-- partir daí, ninguém edita mais (nem quem tem permissão normal de meta) até
-- alguém do mesmo grupo reabrir explicitamente (com motivo registrado).
--
-- A trava é sempre ancorada no SETOR (nunca em equipe/operador individual):
-- validar o setor trava também as linhas de equipe/operador que pertencem
-- a ele, via resolução (equipes.setor_id / perfis.setor_id) — não há linha
-- duplicada por trava.
-- ============================================================

-- ── Tabela: estado de validação por setor/mês ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.metas_validacoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id          UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  mes               INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano               INTEGER NOT NULL CHECK (ano >= 2024),
  status            TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','validado')),
  validado_por      UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  validado_em       TIMESTAMPTZ,
  reaberto_por      UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  reaberto_em       TIMESTAMPTZ,
  motivo_reabertura TEXT,
  UNIQUE (empresa_id, setor_id, mes, ano)
);

ALTER TABLE public.metas_validacoes ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer um da empresa (a UI de metas precisa saber se está travado).
-- Escrita: só via RPC SECURITY DEFINER abaixo — sem policy de INSERT/UPDATE.
DROP POLICY IF EXISTS "metas_validacoes_select" ON public.metas_validacoes;
CREATE POLICY "metas_validacoes_select" ON public.metas_validacoes
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

-- ── Helper: resolve o setor dono de uma linha de meta e checa a trava ────────

CREATE OR REPLACE FUNCTION public.fn_meta_esta_bloqueada(
  p_tipo TEXT, p_referencia_id UUID, p_empresa_id UUID, p_mes INTEGER, p_ano INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_id UUID;
BEGIN
  IF p_tipo = 'setor' THEN
    v_setor_id := p_referencia_id;
  ELSIF p_tipo = 'equipe' THEN
    SELECT setor_id INTO v_setor_id FROM public.equipes WHERE id = p_referencia_id;
  ELSIF p_tipo = 'operador' THEN
    SELECT setor_id INTO v_setor_id FROM public.perfis WHERE id = p_referencia_id;
  END IF;

  -- Setor não resolvível (equipe/operador órfão): nada para travar.
  IF v_setor_id IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.metas_validacoes
    WHERE empresa_id = p_empresa_id AND setor_id = v_setor_id
      AND mes = p_mes AND ano = p_ano AND status = 'validado'
  );
END;
$$;

-- ── RPC: validar (só admin/super_admin; exige metas já lançadas) ─────────────

CREATE OR REPLACE FUNCTION public.fn_metas_validar_setor(
  p_empresa_id UUID, p_setor_id UUID, p_mes INTEGER, p_ano INTEGER
) RETURNS TABLE(ok BOOLEAN, erro TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN QUERY SELECT false, 'sem_permissao'::TEXT; RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.metas m
    WHERE m.empresa_id = p_empresa_id AND m.mes = p_mes AND m.ano = p_ano
      AND (
        (m.tipo = 'setor'    AND m.referencia_id = p_setor_id)
        OR (m.tipo = 'equipe'   AND m.referencia_id IN (SELECT id FROM public.equipes WHERE setor_id = p_setor_id))
        OR (m.tipo = 'operador' AND m.referencia_id IN (SELECT id FROM public.perfis  WHERE setor_id = p_setor_id))
      )
  ) THEN
    RETURN QUERY SELECT false, 'sem_metas_para_validar'::TEXT; RETURN;
  END IF;

  INSERT INTO public.metas_validacoes (empresa_id, setor_id, mes, ano, status, validado_por, validado_em)
  VALUES (p_empresa_id, p_setor_id, p_mes, p_ano, 'validado', v_uid, NOW())
  ON CONFLICT (empresa_id, setor_id, mes, ano) DO UPDATE
    SET status = 'validado', validado_por = v_uid, validado_em = NOW();

  INSERT INTO public.logs_sistema (usuario_id, empresa_id, acao, tabela, registro_id, detalhes)
  VALUES (v_uid, p_empresa_id, 'META_VALIDADA', 'metas_validacoes', p_setor_id::TEXT,
          jsonb_build_object('setor_id', p_setor_id, 'mes', p_mes, 'ano', p_ano));

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- ── RPC: reabrir (só admin/super_admin; motivo obrigatório) ──────────────────

CREATE OR REPLACE FUNCTION public.fn_metas_reabrir_setor(
  p_empresa_id UUID, p_setor_id UUID, p_mes INTEGER, p_ano INTEGER, p_motivo TEXT
) RETURNS TABLE(ok BOOLEAN, erro TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN QUERY SELECT false, 'sem_permissao'::TEXT; RETURN;
  END IF;
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RETURN QUERY SELECT false, 'motivo_obrigatorio'::TEXT; RETURN;
  END IF;

  UPDATE public.metas_validacoes
    SET status = 'aberto', reaberto_por = v_uid, reaberto_em = NOW(), motivo_reabertura = p_motivo
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id AND mes = p_mes AND ano = p_ano;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'nao_validado'::TEXT; RETURN;
  END IF;

  INSERT INTO public.logs_sistema (usuario_id, empresa_id, acao, tabela, registro_id, detalhes)
  VALUES (v_uid, p_empresa_id, 'META_REABERTA', 'metas_validacoes', p_setor_id::TEXT,
          jsonb_build_object('setor_id', p_setor_id, 'mes', p_mes, 'ano', p_ano, 'motivo', p_motivo));

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- ── RPC de leitura: setor/mês está validado? (pra Fase 3 consultar) ──────────

CREATE OR REPLACE FUNCTION public.fn_metas_esta_validada(
  p_empresa_id UUID, p_setor_id UUID, p_mes INTEGER, p_ano INTEGER
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.metas_validacoes
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id
      AND mes = p_mes AND ano = p_ano AND status = 'validado'
  );
$$;

-- ── RPC: upsert de metas respeitando a trava (substitui o upsert direto) ────
-- Item bloqueado é pulado (não gera erro pro lote inteiro) e devolvido em
-- `bloqueados`, pra a UI avisar quais não foram salvos.

CREATE OR REPLACE FUNCTION public.fn_metas_upsert(p_payloads JSONB)
RETURNS TABLE(salvos INTEGER, bloqueados JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil     TEXT;
  v_empresa    UUID;
  v_item       JSONB;
  v_tipo       TEXT;
  v_ref        UUID;
  v_emp_item   UUID;
  v_mes        INTEGER;
  v_ano        INTEGER;
  v_salvos     INTEGER := 0;
  v_bloqueados JSONB := '[]'::JSONB;
BEGIN
  SELECT perfil::text, empresa_id INTO v_perfil, v_empresa FROM public.perfis WHERE id = auth.uid();

  IF v_perfil IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;
  IF v_perfil NOT IN ('administrador','lider','super_admin','elite','gerencia') THEN
    RAISE EXCEPTION 'Permissão negada: cargo % não pode salvar metas', v_perfil;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payloads) LOOP
    v_tipo     := v_item->>'tipo';
    v_ref      := (v_item->>'referencia_id')::UUID;
    v_emp_item := (v_item->>'empresa_id')::UUID;
    v_mes      := (v_item->>'mes')::INTEGER;
    v_ano      := (v_item->>'ano')::INTEGER;

    IF v_emp_item != v_empresa AND v_perfil != 'super_admin' THEN
      RAISE EXCEPTION 'Permissão negada: empresa_id inválido';
    END IF;

    IF public.fn_meta_esta_bloqueada(v_tipo, v_ref, v_emp_item, v_mes, v_ano) THEN
      v_bloqueados := v_bloqueados || jsonb_build_object('referencia_id', v_ref, 'tipo', v_tipo);
      CONTINUE;
    END IF;

    INSERT INTO public.metas
      (tipo, referencia_id, empresa_id, meta_valor, meta_acordos, meta_proporcional, metas_extras, mes, ano)
    VALUES (
      v_tipo, v_ref, v_emp_item,
      (v_item->>'meta_valor')::NUMERIC,
      COALESCE((v_item->>'meta_acordos')::INTEGER, 0),
      COALESCE((v_item->>'meta_proporcional')::BOOLEAN, false),
      COALESCE(v_item->'metas_extras', '[]'::jsonb),
      v_mes, v_ano
    )
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE SET
      meta_valor        = EXCLUDED.meta_valor,
      meta_acordos      = EXCLUDED.meta_acordos,
      meta_proporcional = EXCLUDED.meta_proporcional,
      metas_extras      = CASE WHEN v_item ? 'metas_extras' THEN EXCLUDED.metas_extras ELSE public.metas.metas_extras END,
      updated_at        = now();

    v_salvos := v_salvos + 1;
  END LOOP;

  RETURN QUERY SELECT v_salvos, v_bloqueados;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_metas_upsert(JSONB) TO authenticated;

-- ── RLS de `metas`: bloqueia INSERT/UPDATE/DELETE quando o setor está validado
-- (rede de segurança — a checagem "de verdade" já acontece em fn_metas_upsert,
-- mas isso cobre qualquer escrita direta na tabela, inclusive código antigo).

DROP POLICY IF EXISTS "metas_insert" ON public.metas;
CREATE POLICY "metas_insert" ON public.metas FOR INSERT WITH CHECK (
  public.fn_can_access_empresa(empresa_id)
  AND public.fn_user_has_any_role(ARRAY['administrador','lider','super_admin','elite','gerencia'])
  AND NOT public.fn_meta_esta_bloqueada(tipo, referencia_id, empresa_id, mes, ano)
);

DROP POLICY IF EXISTS "metas_update" ON public.metas;
CREATE POLICY "metas_update" ON public.metas FOR UPDATE
USING (
  public.fn_can_access_empresa(empresa_id)
  AND public.fn_user_has_any_role(ARRAY['administrador','lider','super_admin','elite','gerencia'])
  AND NOT public.fn_meta_esta_bloqueada(tipo, referencia_id, empresa_id, mes, ano)
)
WITH CHECK (
  public.fn_can_access_empresa(empresa_id)
  AND public.fn_user_has_any_role(ARRAY['administrador','lider','super_admin','elite','gerencia'])
  AND NOT public.fn_meta_esta_bloqueada(tipo, referencia_id, empresa_id, mes, ano)
);

DROP POLICY IF EXISTS "metas_delete" ON public.metas;
CREATE POLICY "metas_delete" ON public.metas FOR DELETE USING (
  public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
  AND NOT public.fn_meta_esta_bloqueada(tipo, referencia_id, empresa_id, mes, ano)
);
