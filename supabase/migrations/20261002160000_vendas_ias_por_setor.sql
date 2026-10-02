-- ============================================================================
-- Comercial: cada setor ve e vincula as PROPRIAS IAs
-- ============================================================================
--
-- Pedido de 02/10/2026: «o setor Performance está a ver a IA das vendas
-- BookPlay, porém não é para ser assim: cada setor vê o próprio, só caso
-- alterado nas permissões». Depende de 20261002150000 (chaves e aba `ias` no
-- registro de escopo) e de 20261001150000 (as tabelas de IA).
--
-- ## O que muda
--
--   1. `fn_vendas_ias_alcanca_setor` — a regra, num lugar so: com
--      `ias_escopo_todos_setores`, qualquer setor; com `ias_escopo_setor`, os
--      setores da pessoa (`fn_setores_do_operador`, que conta os clones).
--      IA sem setor so aparece para quem ve todos.
--
--   2. `fn_vendas_ias_da_aba` — a lista da aba IAs, ja recortada. Funcao NOVA:
--      `fn_vendas_ia_cadastro` continua devolvendo a empresa inteira, porque e
--      dela que sai o CREDITO de toda venda (`indiceDeIas`). Recorta-la pelo
--      setor de quem olha faria uma venda visivel perder o dono.
--
--   3. Vincular, trocar, desvincular e definir tipo pedem `vincular_ias_vendas`
--      (e nao mais `usuarios_editar_cargo`) e conferem o alcance: a IA tem de
--      estar num setor que a pessoa alcanca, e o operador tambem.
--
-- Os corpos de `fn_vendas_ia_vincular` e `fn_vendas_ia_definir_tipo` partem de
-- 20261001150000; so a checagem de entrada mudou.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';

-- ── 1. A regra do alcance ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vendas_ias_alcanca_setor(p_setor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN public.fn_user_is_super_admin() THEN TRUE
    WHEN public.fn_user_escopo('ias') >= 3 THEN TRUE
    WHEN public.fn_user_escopo('ias') = 2 THEN
      p_setor_id IS NOT NULL
      AND p_setor_id IN (SELECT s FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s)
    ELSE FALSE
  END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_ias_alcanca_setor(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_ias_alcanca_setor(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_ias_alcanca_setor(UUID) IS
  'A aba IAs alcanca este setor? todos_setores = qualquer um; setor = os '
  'setores da pessoa. IA sem setor so com todos_setores. (20261002160000)';

-- O operador pode estar em mais de um setor (clone): basta um alcancado.
CREATE OR REPLACE FUNCTION public.fn_vendas_ias_alcanca_pessoa(p_perfil_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_user_is_super_admin()
      OR public.fn_user_escopo('ias') >= 3
      OR EXISTS (
           SELECT 1
             FROM public.fn_setores_do_operador(p_perfil_id) AS s
            WHERE public.fn_vendas_ias_alcanca_setor(s)
         )
      OR public.fn_vendas_ias_alcanca_setor((SELECT p.setor_id FROM public.perfis p WHERE p.id = p_perfil_id));
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_ias_alcanca_pessoa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_ias_alcanca_pessoa(UUID) TO authenticated;

-- ── 2. A lista da aba ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vendas_ias_da_aba(p_empresa_id UUID)
RETURNS TABLE(
  ia_id         UUID,
  ia_nome       TEXT,
  ia_usuario    TEXT,
  ia_situacao   TEXT,
  setor_id      UUID,
  setor_nome    TEXT,
  tipo_id       UUID,
  tipo_nome     TEXT,
  vinculo_id    UUID,
  operador_id   UUID,
  operador_nome TEXT,
  desde         DATE,
  ate           DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id, p.nome, p.usuario, p.situacao, p.setor_id, s.nome,
         t.id, t.nome,
         vi.id, vi.operador_id, o.nome, vi.desde, vi.ate
    FROM public.perfis p
    LEFT JOIN public.setores s             ON s.id = p.setor_id
    LEFT JOIN public.vendas_ia_tipos t     ON t.id = p.ia_tipo_id
    LEFT JOIN public.vendas_ia_vinculos vi ON vi.ia_id = p.id
    LEFT JOIN public.perfis o              ON o.id = vi.operador_id
   WHERE p.empresa_id = p_empresa_id
     AND public.fn_can_access_empresa(p_empresa_id)
     AND (public.fn_user_is_super_admin() OR public.fn_user_tem('ver_ias_vendas'))
     AND COALESCE(p.robo, FALSE)
     AND NOT COALESCE(p.arquivado, FALSE)
     AND public.fn_vendas_ias_alcanca_setor(p.setor_id)
   ORDER BY s.nome NULLS LAST, p.nome, vi.desde;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_ias_da_aba(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_ias_da_aba(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_ias_da_aba(UUID) IS
  'A lista da aba IAs, recortada pelo escopo ias_escopo_*. fn_vendas_ia_cadastro '
  'segue inteira: e dela que sai o credito das vendas.';

-- ── 3. Vincular, trocar e desvincular ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vendas_ia_vincular(
  p_ia_id       UUID,
  p_operador_id UUID,   -- NULL = desvincular a partir de p_desde
  p_desde       DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ia      public.perfis%ROWTYPE;
  v_op      public.perfis%ROWTYPE;
  v_antes   JSONB;
  v_depois  JSONB;
  v_anterior public.vendas_ia_vinculos%ROWTYPE;
BEGIN
  IF NOT (SELECT public.fn_user_tem('vincular_ias_vendas')) THEN
    RAISE EXCEPTION 'Vincular IA exige a permissão «IAs: vincular» (Permissões › Usuários).'
      USING ERRCODE = '42501';
  END IF;

  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'Informe a partir de quando o vínculo vale.' USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE na IA: dois cliques ao mesmo tempo esperam um pelo outro, e o
  -- segundo enxerga o que o primeiro gravou. E o que garante «sem
  -- sobreposicao» sem btree_gist.
  SELECT * INTO v_ia FROM public.perfis WHERE id = p_ia_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IA não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_can_access_empresa(v_ia.empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(v_ia.robo, FALSE) THEN
    RAISE EXCEPTION '% não está marcado como IA.', v_ia.nome USING ERRCODE = '22023';
  END IF;
  IF NOT public.fn_vendas_ias_alcanca_setor(v_ia.setor_id) THEN
    RAISE EXCEPTION '% é de um setor fora do seu alcance.', v_ia.nome USING ERRCODE = '42501';
  END IF;

  IF p_operador_id IS NOT NULL THEN
    SELECT * INTO v_op FROM public.perfis WHERE id = p_operador_id;
    IF NOT FOUND OR v_op.empresa_id <> v_ia.empresa_id THEN
      RAISE EXCEPTION 'Operador não encontrado nesta empresa.' USING ERRCODE = 'P0002';
    END IF;
    IF COALESCE(v_op.robo, FALSE) THEN
      RAISE EXCEPTION 'IA não pode ser vinculada a outra IA.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_op.arquivado, FALSE) THEN
      RAISE EXCEPTION '% está arquivado.', v_op.nome USING ERRCODE = '22023';
    END IF;
    IF NOT public.fn_vendas_ias_alcanca_pessoa(p_operador_id) THEN
      RAISE EXCEPTION '% é de um setor fora do seu alcance.', v_op.nome USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(vi) ORDER BY vi.desde), '[]'::jsonb) INTO v_antes
    FROM public.vendas_ia_vinculos vi WHERE vi.ia_id = p_ia_id;

  -- O novo periodo substitui tudo de p_desde em diante.
  DELETE FROM public.vendas_ia_vinculos
   WHERE ia_id = p_ia_id AND desde >= p_desde;

  UPDATE public.vendas_ia_vinculos
     SET ate = p_desde
   WHERE ia_id = p_ia_id
     AND desde < p_desde
     AND (ate IS NULL OR ate > p_desde);

  IF p_operador_id IS NOT NULL THEN
    -- Mesmo operador logo antes, colado: estende em vez de picotar.
    SELECT * INTO v_anterior FROM public.vendas_ia_vinculos
     WHERE ia_id = p_ia_id AND ate = p_desde AND operador_id = p_operador_id;

    IF FOUND THEN
      UPDATE public.vendas_ia_vinculos SET ate = NULL WHERE id = v_anterior.id;
    ELSE
      INSERT INTO public.vendas_ia_vinculos
        (empresa_id, ia_id, operador_id, desde, ate, criado_por)
      VALUES
        (v_ia.empresa_id, p_ia_id, p_operador_id, p_desde, NULL, (SELECT auth.uid()));
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(vi) ORDER BY vi.desde), '[]'::jsonb) INTO v_depois
    FROM public.vendas_ia_vinculos vi WHERE vi.ia_id = p_ia_id;

  INSERT INTO public.vendas_ia_vinculos_historico
    (empresa_id, ia_id, operador_id, desde, antes, depois, autor_id)
  VALUES
    (v_ia.empresa_id, p_ia_id, p_operador_id, p_desde, v_antes, v_depois, (SELECT auth.uid()));
END;
$function$;

-- ── 4. Tipo da IA ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vendas_ia_definir_tipo(p_ia_id UUID, p_tipo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_ia public.perfis%ROWTYPE;
BEGIN
  IF NOT (SELECT public.fn_user_tem('vincular_ias_vendas')) THEN
    RAISE EXCEPTION 'Definir o tipo da IA exige a permissão «IAs: vincular» (Permissões › Usuários).'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ia FROM public.perfis WHERE id = p_ia_id;
  IF NOT FOUND OR NOT public.fn_can_access_empresa(v_ia.empresa_id) THEN
    RAISE EXCEPTION 'IA não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT COALESCE(v_ia.robo, FALSE) THEN
    RAISE EXCEPTION '% não está marcado como IA.', v_ia.nome USING ERRCODE = '22023';
  END IF;
  IF NOT public.fn_vendas_ias_alcanca_setor(v_ia.setor_id) THEN
    RAISE EXCEPTION '% é de um setor fora do seu alcance.', v_ia.nome USING ERRCODE = '42501';
  END IF;
  IF p_tipo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vendas_ia_tipos t
     WHERE t.id = p_tipo_id AND t.empresa_id = v_ia.empresa_id
  ) THEN
    RAISE EXCEPTION 'Tipo de IA não encontrado nesta empresa.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.perfis SET ia_tipo_id = p_tipo_id WHERE id = p_ia_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_vendas_ia_tipo_criar(p_empresa_id UUID, p_nome TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_nome TEXT := BTRIM(COALESCE(p_nome, ''));
  v_id   UUID;
BEGIN
  IF NOT (SELECT public.fn_user_tem('vincular_ias_vendas')) THEN
    RAISE EXCEPTION 'Criar tipo de IA exige a permissão «IAs: vincular» (Permissões › Usuários).'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;
  IF v_nome = '' OR LENGTH(v_nome) > 40 THEN
    RAISE EXCEPTION 'O nome do tipo precisa ter de 1 a 40 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.vendas_ia_tipos t
     WHERE t.empresa_id = p_empresa_id AND LOWER(BTRIM(t.nome)) = LOWER(v_nome)
  ) THEN
    RAISE EXCEPTION 'Já existe um tipo de IA chamado %.', v_nome USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.vendas_ia_tipos (empresa_id, nome, ordem, criado_por)
  VALUES (
    p_empresa_id, v_nome,
    COALESCE((SELECT MAX(ordem) FROM public.vendas_ia_tipos WHERE empresa_id = p_empresa_id), 0) + 1,
    (SELECT auth.uid())
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- ── 5. Historico: quem vincula le ───────────────────────────────────────────

DROP POLICY IF EXISTS vendas_ia_vinculos_historico_select ON public.vendas_ia_vinculos_historico;
CREATE POLICY vendas_ia_vinculos_historico_select ON public.vendas_ia_vinculos_historico
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_tem('vincular_ias_vendas'))
    AND (
      empresa_id = ANY ((SELECT public.fn_empresas_acessiveis())::uuid[])
      OR (SELECT public.fn_user_is_super_admin())
    )
  );

-- ── 6. Verificacao ──────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF to_regprocedure('public.fn_vendas_ias_da_aba(uuid)') IS NULL
     OR to_regprocedure('public.fn_vendas_ias_alcanca_setor(uuid)') IS NULL
     OR to_regprocedure('public.fn_vendas_ias_alcanca_pessoa(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Funcoes de alcance das IAs nao foram criadas.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('fn_vendas_ia_vincular', 'fn_vendas_ia_definir_tipo', 'fn_vendas_ia_tipo_criar')
       AND pg_get_functiondef(p.oid) ILIKE '%usuarios_editar_cargo%'
  ) THEN
    RAISE EXCEPTION 'Uma RPC das IAs ainda pede usuarios_editar_cargo.';
  END IF;
END;
$verificacao$;

COMMIT;
