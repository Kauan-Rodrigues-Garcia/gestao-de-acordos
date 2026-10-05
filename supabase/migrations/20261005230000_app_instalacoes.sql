-- ============================================================================
-- App no celular: quem instalou e quem tem celular registrado
-- ============================================================================
--
-- Pedido do Cleber (05/10/2026): saber quem chegou a instalar o app do celular
-- e se a pessoa tem um celular registrado. Sem medir uso do app.
--
--   app_instalacoes            uma linha por pessoa: quando o gestão abriu pela
--                              primeira vez COMO APP INSTALADO (display-mode
--                              standalone), a última vez e o tipo de aparelho.
--                              Só a função grava (RLS sem policy de escrita).
--   fn_app_registrar_abertura  o app chama ao abrir instalado, uma vez por dia.
--   fn_app_celular_painel      a lista do Monitoramento de uso, aba «App no
--                              celular»: instalou e/ou tem celular registrado
--                              (`push_inscricoes`, avisos ativados).
--
-- Quem vê o painel: a mesma régua de `uso_telas` — super_admin todas as
-- empresas; quem tem `ver_monitoramento_uso`, a própria empresa.
--
-- Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.app_instalacoes (
  perfil_id           uuid        PRIMARY KEY REFERENCES public.perfis (id) ON DELETE CASCADE,
  empresa_id          uuid        NOT NULL,
  instalado_em        timestamptz NOT NULL DEFAULT now(),
  ultima_abertura_em  timestamptz NOT NULL DEFAULT now(),
  aparelho            text        CHECK (aparelho IN ('iphone', 'android', 'outro'))
);

COMMENT ON TABLE public.app_instalacoes IS
  'Quem abriu o gestão como app instalado no celular: a primeira vez, a última e o aparelho. '
  'Grava só fn_app_registrar_abertura. Ver 20261005230000.';

ALTER TABLE public.app_instalacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_instalacoes_select ON public.app_instalacoes;
CREATE POLICY app_instalacoes_select ON public.app_instalacoes
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.fn_user_is_super_admin())
    OR (empresa_id = (SELECT public.fn_user_empresa_id())
        AND (SELECT public.fn_user_tem('ver_monitoramento_uso')))
  );

REVOKE ALL ON public.app_instalacoes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.app_instalacoes FROM authenticated;
GRANT SELECT ON public.app_instalacoes TO authenticated;
GRANT ALL ON public.app_instalacoes TO service_role;

-- ── O registro ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_app_registrar_abertura(p_aparelho text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_empresa  uuid;
  v_aparelho text := CASE WHEN p_aparelho IN ('iphone', 'android') THEN p_aparelho ELSE 'outro' END;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  SELECT p.empresa_id INTO v_empresa FROM public.perfis p WHERE p.id = v_uid;
  IF v_empresa IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.app_instalacoes AS a (perfil_id, empresa_id, instalado_em, ultima_abertura_em, aparelho)
  VALUES (v_uid, v_empresa, now(), now(), v_aparelho)
  ON CONFLICT (perfil_id) DO UPDATE
     SET ultima_abertura_em = now(),
         empresa_id         = excluded.empresa_id,
         aparelho           = excluded.aparelho;
END;
$function$;

COMMENT ON FUNCTION public.fn_app_registrar_abertura(text) IS
  'O app aberto como instalado registra quem é (auth.uid) e o aparelho. Ver 20261005230000.';

REVOKE ALL ON FUNCTION public.fn_app_registrar_abertura(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_app_registrar_abertura(text) TO authenticated;

-- ── O painel ────────────────────────────────────────────────────────────────
-- Parte de quem instalou OU tem celular registrado: as 10 pessoas que ativaram
-- os avisos antes deste registro existir aparecem com «instalou» em branco.
CREATE OR REPLACE FUNCTION public.fn_app_celular_painel(p_empresa_id uuid DEFAULT NULL)
RETURNS TABLE (
  perfil_id          uuid,
  nome               text,
  cargo              text,
  situacao           text,
  empresa_id         uuid,
  empresa_nome       text,
  setor_nome         text,
  instalado_em       timestamptz,
  ultima_abertura_em timestamptz,
  aparelho           text,
  celulares          integer,
  celular_desde      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_super boolean := public.fn_user_is_super_admin();
BEGIN
  IF NOT v_super AND NOT (
       public.fn_user_tem('ver_monitoramento_uso')
       AND (p_empresa_id IS NULL OR p_empresa_id = public.fn_user_empresa_id())) THEN
    RAISE EXCEPTION 'sem permissão para o Monitoramento de uso' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH pessoas AS (
    SELECT a.perfil_id AS pid FROM public.app_instalacoes a
    UNION
    SELECT i.perfil_id FROM public.push_inscricoes i
  ),
  inscr AS (
    SELECT i.perfil_id AS pid, count(*)::integer AS n, min(i.criada_em) AS desde
      FROM public.push_inscricoes i GROUP BY i.perfil_id
  )
  SELECT p.id, p.nome, p.perfil, coalesce(p.situacao, 'ativo'),
         p.empresa_id, e.nome, s.nome,
         a.instalado_em, a.ultima_abertura_em, a.aparelho,
         coalesce(ins.n, 0), ins.desde
    FROM pessoas x
    JOIN public.perfis p        ON p.id = x.pid
    LEFT JOIN public.empresas e ON e.id = p.empresa_id
    LEFT JOIN public.setores s  ON s.id = p.setor_id
    LEFT JOIN public.app_instalacoes a ON a.perfil_id = p.id
    LEFT JOIN inscr ins         ON ins.pid = p.id
   WHERE (p_empresa_id IS NOT NULL AND p.empresa_id = p_empresa_id)
      OR (p_empresa_id IS NULL AND (v_super OR p.empresa_id = public.fn_user_empresa_id()))
   ORDER BY coalesce(a.instalado_em, ins.desde) DESC NULLS LAST, p.nome;
END;
$function$;

COMMENT ON FUNCTION public.fn_app_celular_painel(uuid) IS
  'Monitoramento de uso › App no celular: quem instalou e quem tem celular registrado. '
  'Mesma régua de uso_telas. Ver 20261005230000.';

REVOKE ALL ON FUNCTION public.fn_app_celular_painel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_app_celular_painel(uuid) TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.app_instalacoes') IS NULL THEN
    RAISE EXCEPTION 'app_instalacoes não criada';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.app_instalacoes'::regclass) THEN
    RAISE EXCEPTION 'app_instalacoes ficou sem RLS';
  END IF;
  IF has_table_privilege('authenticated', 'public.app_instalacoes', 'INSERT') THEN
    RAISE EXCEPTION 'app_instalacoes ficou gravável direto pelo app';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_app_registrar_abertura(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_app_celular_painel(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'funções do app sem EXECUTE para authenticated';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261005230000', 'app_instalacoes')
ON CONFLICT DO NOTHING;

COMMIT;
