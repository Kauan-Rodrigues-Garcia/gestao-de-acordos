-- Permissões organizadas por módulo e Ranking independente no Analítico.
--
-- IMPORTANTE: este arquivo foi preparado para aplicação manual. Ele não é
-- executado pelo frontend e não foi aplicado automaticamente pelo Codex.

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- Preserva o catálogo anterior e acrescenta as chaves desta evolução sem
-- duplicar a lista inteira (e sem correr o risco de apagar uma chave recente).
ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_modulos_20260827;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_modulos_20260827()
  UNION ALL
  SELECT * FROM (VALUES
    ('ver_dashboard',                       NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh']::TEXT[], false),
    ('usuarios_sub_usuarios',                NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('ver_setores',                          NULL::TEXT[], ARRAY['gerencia','diretoria']::TEXT[], false),
    ('ver_comemoracoes',                     NULL::TEXT[], ARRAY['diretoria']::TEXT[], false),
    ('setores_criar_editar',                 NULL::TEXT[], ARRAY['gerencia','diretoria']::TEXT[], false),
    ('setores_ativar_desativar',             NULL::TEXT[], ARRAY['gerencia','diretoria']::TEXT[], false),
    ('setores_reordenar',                    NULL::TEXT[], ARRAY['gerencia','diretoria']::TEXT[], false),
    ('config_sub_geral',                     NULL::TEXT[], ARRAY[]::TEXT[], false),
    ('config_sub_permissoes',                NULL::TEXT[], ARRAY[]::TEXT[], false),
    ('config_sub_direto_extra',              NULL::TEXT[], ARRAY[]::TEXT[], false),
    ('config_sub_tags',                      NULL::TEXT[], ARRAY[]::TEXT[], false),
    ('config_sub_documentacoes',             NULL::TEXT[], ARRAY[]::TEXT[], false),
    ('config_sub_multiempresa',              NULL::TEXT[], ARRAY[]::TEXT[], false),
    ('solicitacoes_ver_todas', ARRAY['pagueplay']::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('solicitacoes_definir_responsavel', ARRAY['pagueplay']::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catálogo completo de permissões. A extensão 20260827 adiciona módulos e '
  'subabas sem reescrever nem perder o catálogo anterior.';

-- Compatibilidade: a aplicação da migration não retira o que cada cargo já
-- enxergava. As novas chaves nascem a partir do comportamento anterior.
UPDATE public.cargos_permissoes cp
SET permissoes = jsonb_build_object(
  'ver_dashboard', true,
  'usuarios_sub_usuarios', COALESCE((cp.permissoes->>'ver_usuarios')::BOOLEAN, false),
  'ver_setores', cp.cargo IN ('gerencia','diretoria','administrador','super_admin'),
  'ver_comemoracoes', COALESCE((cp.permissoes->>'comemoracoes_gerenciar')::BOOLEAN, false),
  'setores_criar_editar', cp.cargo IN ('gerencia','diretoria','administrador','super_admin'),
  'setores_ativar_desativar', cp.cargo IN ('gerencia','diretoria','administrador','super_admin'),
  'setores_reordenar', cp.cargo IN ('gerencia','diretoria','administrador','super_admin'),
  'config_sub_geral', COALESCE((cp.permissoes->>'ver_configuracoes')::BOOLEAN, false),
  'config_sub_permissoes', COALESCE((cp.permissoes->>'administrar_sistema')::BOOLEAN, false),
  'config_sub_direto_extra', COALESCE((cp.permissoes->>'ver_configuracoes')::BOOLEAN, false),
  'config_sub_tags', COALESCE((cp.permissoes->>'ver_configuracoes')::BOOLEAN, false),
  'config_sub_documentacoes', COALESCE((cp.permissoes->>'ver_configuracoes')::BOOLEAN, false),
  'config_sub_multiempresa', cp.cargo = 'super_admin',
  'solicitacoes_ver_todas', cp.cargo IN ('lider','elite','gerencia','diretoria','administrador','super_admin'),
  'solicitacoes_definir_responsavel', cp.cargo IN ('lider','elite','gerencia','diretoria','administrador','super_admin')
) || cp.permissoes;

-- O Dashboard agora tem chave de abertura como as demais abas.
CREATE OR REPLACE FUNCTION public.fn_abas_escopo()
RETURNS TABLE(aba TEXT, chave_aba TEXT)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  VALUES
    ('dashboard',        'ver_dashboard'),
    ('acordos',          'ver_acordos'),
    ('lixeira',          'ver_lixeira'),
    ('pix',              'ver_pix_automatico'),
    ('painel_lider',     'ver_painel_lider'),
    ('painel_diretoria', 'ver_painel_diretoria'),
    ('analitico',        'ver_analitico'),
    ('usuarios',         'ver_usuarios'),
    ('rh',               'ver_rh_gestao');
$function$;

-- Setores: a aba e cada ação passam a obedecer chaves próprias.
DROP POLICY IF EXISTS setores_admin ON public.setores;
DROP POLICY IF EXISTS setores_insert_permissao ON public.setores;
CREATE POLICY setores_insert_permissao ON public.setores
FOR INSERT WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('ver_setores'))
  AND (SELECT public.fn_user_tem('setores_criar_editar'))
);

DROP POLICY IF EXISTS setores_update_permissao ON public.setores;
CREATE POLICY setores_update_permissao ON public.setores
FOR UPDATE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('ver_setores'))
  AND (
    (SELECT public.fn_user_tem('setores_criar_editar'))
    OR (SELECT public.fn_user_tem('setores_ativar_desativar'))
  )
) WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('ver_setores'))
);

CREATE OR REPLACE FUNCTION public.fn_setores_validar_alteracao_permitida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF public.fn_user_is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Não é permitido mudar a identidade ou a empresa do setor.';
  END IF;

  IF (NEW.nome, NEW.descricao, NEW.alternativo, NEW.foto_url, NEW.foto_receptivo_url)
       IS DISTINCT FROM (OLD.nome, OLD.descricao, OLD.alternativo, OLD.foto_url, OLD.foto_receptivo_url)
     AND NOT public.fn_user_tem('setores_criar_editar') THEN
    RAISE EXCEPTION 'Permissão setores_criar_editar necessária.';
  END IF;

  IF NEW.ativo IS DISTINCT FROM OLD.ativo
     AND NOT public.fn_user_tem('setores_ativar_desativar') THEN
    RAISE EXCEPTION 'Permissão setores_ativar_desativar necessária.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_setores_validar_alteracao_permitida ON public.setores;
CREATE TRIGGER trg_setores_validar_alteracao_permitida
BEFORE UPDATE ON public.setores
FOR EACH ROW EXECUTE FUNCTION public.fn_setores_validar_alteracao_permitida();

-- Solicitações de WhatsApp: substitui as últimas decisões por cargo pelas duas
-- opções que agora aparecem no card Solicitar Atendimento.
CREATE OR REPLACE FUNCTION public.fn_wpp_tem_visao_geral()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_user_tem('solicitacoes_ver_todas')
  OR EXISTS (
    SELECT 1
    FROM public.atendimento_responsaveis r
    WHERE r.usuario_id = auth.uid()
  );
$function$;

DROP POLICY IF EXISTS atend_resp_insert ON public.atendimento_responsaveis;
CREATE POLICY atend_resp_insert ON public.atendimento_responsaveis
FOR INSERT WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('solicitacoes_definir_responsavel'))
);

DROP POLICY IF EXISTS atend_resp_delete ON public.atendimento_responsaveis;
CREATE POLICY atend_resp_delete ON public.atendimento_responsaveis
FOR DELETE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('solicitacoes_definir_responsavel'))
);

DROP POLICY IF EXISTS sol_wpp_insert ON public.solicitacoes_whatsapp;
CREATE POLICY sol_wpp_insert ON public.solicitacoes_whatsapp
FOR INSERT WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND solicitante_id = (SELECT auth.uid())
  AND (SELECT public.fn_user_tem('ver_solicitacoes_whatsapp'))
  AND (SELECT public.fn_user_tem('criar_solicitacao_whatsapp'))
);

DROP POLICY IF EXISTS sol_wpp_delete ON public.solicitacoes_whatsapp;
CREATE POLICY sol_wpp_delete ON public.solicitacoes_whatsapp
FOR DELETE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    solicitante_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_tem('solicitacoes_ver_todas'))
  )
);

-- Ranking: é uma visão coletiva especial. Mesmo com alcance individual, um
-- operador autorizado vê o ranking da própria equipe; setor/todos-setores
-- continuam respeitando o alcance configurado no card Analítico.
CREATE OR REPLACE FUNCTION public.fn_analitico_resumo_por_operador(
  p_empresa_id UUID,
  p_mes TEXT
)
RETURNS TABLE(
  operador_id UUID,
  operador_usuario TEXT,
  operador_nome TEXT,
  total_recebido NUMERIC,
  total_ho NUMERIC,
  total_pagamentos BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_escopo INTEGER;
  v_equipe_id UUID;
  v_setor_id UUID;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('ver_analitico')
     OR NOT public.fn_user_tem('analitico_sub_analitico')
     OR NOT public.fn_user_tem('analitico_sub_ranking') THEN
    RETURN;
  END IF;

  v_escopo := public.fn_user_escopo('analitico');
  SELECT p.equipe_id, p.setor_id
    INTO v_equipe_id, v_setor_id
  FROM public.perfis p
  WHERE p.id = auth.uid();

  RETURN QUERY
  SELECT
    ar.operador_id,
    MIN(ar.operador_usuario) AS operador_usuario,
    p.nome AS operador_nome,
    SUM(ar.valor_recebido)::NUMERIC AS total_recebido,
    SUM(ar.total_ho)::NUMERIC AS total_ho,
    COUNT(*)::BIGINT AS total_pagamentos
  FROM public.analitico_recebimentos ar
  LEFT JOIN public.perfis p ON p.id = ar.operador_id
  WHERE ar.empresa_id = p_empresa_id
    AND ar.operador_id IS NOT NULL
    AND COALESCE(p.perfil, '') <> 'super_admin'
    AND ar.data_pagamento >= (p_mes || '-01')::DATE
    AND ar.data_pagamento < ((p_mes || '-01')::DATE + INTERVAL '1 month')
    AND (
      v_escopo >= 3
      OR (v_escopo = 2 AND p.setor_id = v_setor_id)
      OR (v_escopo < 2 AND v_equipe_id IS NOT NULL AND p.equipe_id = v_equipe_id)
      OR (v_escopo < 2 AND v_equipe_id IS NULL AND ar.operador_id = auth.uid())
    )
  GROUP BY ar.operador_id, p.nome
  ORDER BY total_recebido DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_analitico_resumo_por_operador(UUID, TEXT) IS
  'Ranking mensal controlado por analitico_sub_ranking. Alcance individual vê '
  'a própria equipe; setor e todos_setores seguem fn_user_escopo(analitico).';

COMMIT;
