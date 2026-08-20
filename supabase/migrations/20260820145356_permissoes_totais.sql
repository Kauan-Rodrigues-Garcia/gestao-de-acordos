-- Permissões 3.0: a matriz passa a ser a fonte de verdade de navegação,
-- ações e dados. Não existe bypass por cargo.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  WITH atalhos AS (
    SELECT
      ARRAY['lider','elite','gerencia','diretoria']::TEXT[] AS lideranca,
      ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[] AS todos,
      ARRAY['gerencia','diretoria']::TEXT[] AS cupula,
      ARRAY[]::TEXT[] AS ninguem
  )
  SELECT t.* FROM atalhos, LATERAL (VALUES
    ('ver_dashboard', NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('ver_acordos', ARRAY['bookplay'], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('ver_analitico', NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('ver_painel_lider', NULL::TEXT[], ARRAY['lider','elite','gerencia','administrador','super_admin'], false),
    ('ver_painel_diretoria', NULL::TEXT[], ARRAY['diretoria','administrador','super_admin'], false),
    ('ver_usuarios', NULL::TEXT[], ARRAY['lider','elite','gerencia','administrador','super_admin'], false),
    ('ver_configuracoes', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('ver_ouvidoria', ARRAY['pagueplay'], ARRAY['ouvidoria','administrador','super_admin'], false),
    ('ver_campanha_facil', ARRAY['bookplay'], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('ver_solicitacoes_whatsapp', ARRAY['pagueplay'], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('ver_tickets', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('ver_lixeira', NULL::TEXT[], ARRAY['operador','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('ver_creators_lab', NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('ver_acordos_gerais', NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('ver_todos_setores', NULL::TEXT[], ARRAY['gerencia','diretoria','administrador','super_admin'], false),
    ('filtrar_por_setor', NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('filtrar_por_equipe', NULL::TEXT[], ARRAY['lider','elite','gerencia','administrador','super_admin'], false),
    ('filtrar_por_usuario', NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('filtrar_por_tag', ARRAY['bookplay'], ARRAY['super_admin'], false),
    ('criar_acordos', NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('editar_acordos', NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('excluir_acordos', NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('excluir_em_lote', NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('importar_excel', NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('ver_pix_automatico', ARRAY['bookplay'], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('aprovar_pix_automatico', ARRAY['bookplay'], ARRAY['lider','elite','gerencia','administrador','super_admin'], false),
    ('restaurar_lixeira', NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('esvaziar_lixeira', NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('ver_analiticos_global', NULL::TEXT[], ARRAY['gerencia','diretoria','administrador','super_admin'], false),
    ('importar_analitico', NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('importar_diario', NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('validar_relatorios', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('criar_usuarios', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('editar_usuarios', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('excluir_usuarios', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('redefinir_senha_usuarios', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('gerenciar_situacao_usuarios', NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('transferir_usuarios', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('impersonar_usuarios', NULL::TEXT[], ARRAY['super_admin'], false),
    ('ver_setores', NULL::TEXT[], ARRAY['gerencia','administrador','super_admin'], false),
    ('editar_setores', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('ver_equipes', NULL::TEXT[], ARRAY['lider','elite','gerencia','administrador','super_admin'], false),
    ('editar_equipes', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('ver_operadores', NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('ver_metas', NULL::TEXT[], ARRAY['lider','elite','gerencia','administrador','super_admin'], false),
    ('gerenciar_metas', NULL::TEXT[], ARRAY['gerencia','administrador','super_admin'], false),
    ('ver_comemoracoes', NULL::TEXT[], ARRAY['lider','elite','gerencia','administrador','super_admin'], false),
    ('gerenciar_comemoracoes', NULL::TEXT[], ARRAY['lider','elite','gerencia','administrador','super_admin'], false),
    ('ver_configuracoes_geral', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('editar_modelos_mensagem', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('ver_permissoes', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('gerenciar_permissoes', NULL::TEXT[], ARRAY['super_admin'], false),
    ('ver_direto_extra', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('gerenciar_direto_extra', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('ver_tags', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('gerenciar_tags', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('ver_logs', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('ver_monitoramento_uso', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('expurgar_logs', NULL::TEXT[], ARRAY['super_admin'], false),
    ('ver_documentacoes', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('gerenciar_documentacoes', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('ver_multiempresa', NULL::TEXT[], ARRAY['super_admin'], false),
    ('gerenciar_multiempresa', NULL::TEXT[], ARRAY['super_admin'], false),
    ('editar_menu_lateral', NULL::TEXT[], ARRAY['super_admin'], false),
    ('editar_ouvidoria', ARRAY['pagueplay'], ARRAY['ouvidoria','administrador','super_admin'], false),
    ('gerenciar_acessos_ouvidoria', ARRAY['pagueplay'], ARRAY['ouvidoria','administrador','super_admin'], false),
    ('gerenciar_campanha_facil', ARRAY['bookplay'], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('criar_solicitacao_whatsapp', ARRAY['pagueplay'], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('ver_solicitacoes_whatsapp_geral', ARRAY['pagueplay'], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('atender_solicitacoes_whatsapp', ARRAY['pagueplay'], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('gerenciar_responsaveis_whatsapp', ARRAY['pagueplay'], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('abrir_tickets', NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'], false),
    ('atender_tickets', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('gerenciar_tickets', NULL::TEXT[], ARRAY['administrador','super_admin'], false),
    ('ignorar_fechamento_mes', NULL::TEXT[], ninguem, false)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

CREATE OR REPLACE FUNCTION public.fn_permissoes_dependencias()
RETURNS TABLE(filha TEXT, pai TEXT)
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT * FROM (VALUES
    ('filtrar_por_tag','ver_acordos'),
    ('ver_pix_automatico','ver_acordos'), ('aprovar_pix_automatico','ver_pix_automatico'),
    ('restaurar_lixeira','ver_lixeira'), ('esvaziar_lixeira','ver_lixeira'),
    ('ver_analiticos_global','ver_analitico'), ('importar_analitico','ver_analitico'),
    ('importar_diario','ver_analitico'), ('validar_relatorios','ver_analitico'),
    ('criar_usuarios','ver_usuarios'), ('editar_usuarios','ver_usuarios'),
    ('excluir_usuarios','ver_usuarios'), ('redefinir_senha_usuarios','ver_usuarios'),
    ('gerenciar_situacao_usuarios','ver_usuarios'), ('transferir_usuarios','ver_usuarios'),
    ('impersonar_usuarios','ver_usuarios'), ('ver_setores','ver_usuarios'),
    ('editar_setores','ver_setores'), ('ver_equipes','ver_usuarios'),
    ('editar_equipes','ver_equipes'), ('ver_metas','ver_usuarios'),
    ('gerenciar_metas','ver_metas'), ('ver_comemoracoes','ver_usuarios'),
    ('gerenciar_comemoracoes','ver_comemoracoes'),
    ('ver_configuracoes_geral','ver_configuracoes'), ('editar_modelos_mensagem','ver_configuracoes_geral'),
    ('ver_permissoes','ver_configuracoes'), ('gerenciar_permissoes','ver_permissoes'),
    ('ver_direto_extra','ver_configuracoes'), ('gerenciar_direto_extra','ver_direto_extra'),
    ('ver_tags','ver_configuracoes'), ('gerenciar_tags','ver_tags'),
    ('ver_logs','ver_configuracoes'), ('ver_monitoramento_uso','ver_logs'), ('expurgar_logs','ver_logs'),
    ('ver_documentacoes','ver_configuracoes'), ('gerenciar_documentacoes','ver_documentacoes'),
    ('ver_multiempresa','ver_configuracoes'), ('gerenciar_multiempresa','ver_multiempresa'),
    ('editar_ouvidoria','ver_ouvidoria'), ('gerenciar_acessos_ouvidoria','ver_ouvidoria'),
    ('gerenciar_campanha_facil','ver_campanha_facil'),
    ('criar_solicitacao_whatsapp','ver_solicitacoes_whatsapp'),
    ('ver_solicitacoes_whatsapp_geral','ver_solicitacoes_whatsapp'),
    ('atender_solicitacoes_whatsapp','ver_solicitacoes_whatsapp'),
    ('gerenciar_responsaveis_whatsapp','ver_solicitacoes_whatsapp'),
    ('abrir_tickets','ver_tickets'), ('atender_tickets','ver_tickets'), ('gerenciar_tickets','ver_tickets')
  ) AS d(filha, pai);
$function$;

-- Recria o mapa de todos os cargos a partir do comportamento oficial atual.
CREATE OR REPLACE FUNCTION public.fn_permissoes_semear_empresa(p_empresa_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_slug TEXT; v_cargo TEXT; v_mapa JSONB; v_total INTEGER := 0;
BEGIN
  SELECT slug INTO v_slug FROM public.empresas WHERE id = p_empresa_id;
  FOREACH v_cargo IN ARRAY ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'] LOOP
    SELECT COALESCE(jsonb_object_agg(c.chave, v_cargo = ANY(c.padrao)), '{}'::jsonb)
      INTO v_mapa FROM public.fn_permissoes_catalogo() c
     WHERE c.tenants IS NULL OR v_slug = ANY(c.tenants);
    INSERT INTO public.cargos_permissoes(empresa_id,cargo,permissoes)
    VALUES(p_empresa_id,v_cargo,v_mapa)
    ON CONFLICT(empresa_id,cargo) DO UPDATE
      SET permissoes=EXCLUDED.permissoes, atualizado_em=now();
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$function$;

-- Snapshot reversível do estado anterior. A tabela não recebe política nem
-- grants para o app: fica disponível apenas à administração do banco caso seja
-- necessário restaurar exatamente os mapas anteriores.
CREATE TABLE IF NOT EXISTS public.permissoes_backup_20260820 (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  origem TEXT NOT NULL CHECK (origem IN ('cargo','pessoa')),
  empresa_id UUID NOT NULL,
  referencia TEXT NOT NULL,
  dados JSONB NOT NULL,
  backup_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(origem,empresa_id,referencia)
);
ALTER TABLE public.permissoes_backup_20260820 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.permissoes_backup_20260820 FROM anon, authenticated;

INSERT INTO public.permissoes_backup_20260820(origem,empresa_id,referencia,dados)
SELECT 'cargo',empresa_id,cargo,to_jsonb(cp) FROM public.cargos_permissoes cp
ON CONFLICT(origem,empresa_id,referencia) DO NOTHING;
INSERT INTO public.permissoes_backup_20260820(origem,empresa_id,referencia,dados)
SELECT 'pessoa',empresa_id,usuario_id::TEXT,to_jsonb(pp) FROM public.perfis_permissoes pp
ON CONFLICT(origem,empresa_id,referencia) DO NOTHING;

DO $block$ DECLARE e RECORD; BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $block$;

CREATE OR REPLACE FUNCTION public.fn_tem_permissao(p_chave TEXT, p_empresa_id UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid(); v_empresa UUID; v_empresa_usuario UUID;
        v_cargo TEXT; v_multi BOOLEAN; v_mapa JSONB; v_mapa_origem JSONB; v_ok BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT empresa_id, perfil, COALESCE(acesso_multiempresa,false)
    INTO v_empresa_usuario, v_cargo, v_multi FROM public.perfis WHERE id=v_uid;
  v_empresa := COALESCE(p_empresa_id, v_empresa_usuario);
  IF v_empresa IS NULL THEN RETURN false; END IF;
  IF v_empresa <> v_empresa_usuario AND NOT v_multi THEN
    SELECT COALESCE(cp.permissoes,'{}'::jsonb) || COALESCE(pp.permissoes,'{}'::jsonb)
      INTO v_mapa_origem FROM (SELECT 1) s
      LEFT JOIN public.cargos_permissoes cp ON cp.empresa_id=v_empresa_usuario AND cp.cargo=v_cargo
      LEFT JOIN public.perfis_permissoes pp ON pp.empresa_id=v_empresa_usuario AND pp.usuario_id=v_uid;
    IF NOT COALESCE((v_mapa_origem->>'ver_multiempresa')::boolean,false) THEN RETURN false; END IF;
  END IF;

  SELECT COALESCE(cp.permissoes,'{}'::jsonb) || COALESCE(pp.permissoes,'{}'::jsonb)
    INTO v_mapa
    FROM (SELECT 1) s
    LEFT JOIN public.cargos_permissoes cp ON cp.empresa_id=v_empresa AND cp.cargo=v_cargo
    LEFT JOIN public.perfis_permissoes pp ON pp.empresa_id=v_empresa AND pp.usuario_id=v_uid;
  v_mapa := COALESCE(v_mapa,'{}'::jsonb);

  WITH RECURSIVE exigidas(chave) AS (
    SELECT p_chave
    UNION
    SELECT d.pai FROM public.fn_permissoes_dependencias() d JOIN exigidas e ON e.chave=d.filha
  )
  SELECT COALESCE(bool_and(COALESCE((v_mapa->>chave)::boolean,false)),false)
    INTO v_ok FROM exigidas;
  RETURN v_ok;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tem_permissao(TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tem_permissao(TEXT,UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_user_acesso_multiempresa()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public.fn_tem_permissao('ver_multiempresa',NULL); $function$;

CREATE OR REPLACE FUNCTION public.fn_can_access_empresa(p_empresa_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis p WHERE p.id=auth.uid()
      AND (p.empresa_id=p_empresa_id OR public.fn_tem_permissao('ver_multiempresa',p.empresa_id))
  );
$function$;

-- A própria matriz também obedece à matriz: leitura do cargo é necessária a
-- todos; edição e leitura das exceções da empresa exigem gerenciar_permissoes.
DROP POLICY IF EXISTS permissoes3_cargos_write_allow ON public.cargos_permissoes;
DROP POLICY IF EXISTS permissoes3_cargos_write_gate ON public.cargos_permissoes;

DROP POLICY IF EXISTS permissoes3_pessoa_select_allow ON public.perfis_permissoes;
DROP POLICY IF EXISTS permissoes3_pessoa_select_gate ON public.perfis_permissoes;
DROP POLICY IF EXISTS permissoes3_pessoa_write_allow ON public.perfis_permissoes;
DROP POLICY IF EXISTS permissoes3_pessoa_write_gate ON public.perfis_permissoes;
CREATE POLICY permissoes3_pessoa_select_allow ON public.perfis_permissoes AS PERMISSIVE FOR SELECT TO authenticated
  USING (usuario_id=auth.uid() OR public.fn_tem_permissao('ver_permissoes',empresa_id));
CREATE POLICY permissoes3_pessoa_select_gate ON public.perfis_permissoes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (usuario_id=auth.uid() OR public.fn_tem_permissao('ver_permissoes',empresa_id));

DO $block$
DECLARE v_tabela TEXT; v_cmd TEXT; v_expr TEXT := 'public.fn_tem_permissao(''gerenciar_permissoes'',empresa_id)';
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['cargos_permissoes','perfis_permissoes'] LOOP
    FOREACH v_cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS permissoes3_%s_%s_allow ON public.%I',v_tabela,lower(v_cmd),v_tabela);
      EXECUTE format('DROP POLICY IF EXISTS permissoes3_%s_%s_gate ON public.%I',v_tabela,lower(v_cmd),v_tabela);
      IF v_cmd='INSERT' THEN
        EXECUTE format('CREATE POLICY permissoes3_%s_insert_allow ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (%s)',v_tabela,v_tabela,v_expr);
        EXECUTE format('CREATE POLICY permissoes3_%s_insert_gate ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)',v_tabela,v_tabela,v_expr);
      ELSIF v_cmd='UPDATE' THEN
        EXECUTE format('CREATE POLICY permissoes3_%s_update_allow ON public.%I AS PERMISSIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',v_tabela,v_tabela,v_expr,v_expr);
        EXECUTE format('CREATE POLICY permissoes3_%s_update_gate ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',v_tabela,v_tabela,v_expr,v_expr);
      ELSE
        EXECUTE format('CREATE POLICY permissoes3_%s_delete_allow ON public.%I AS PERMISSIVE FOR DELETE TO authenticated USING (%s)',v_tabela,v_tabela,v_expr);
        EXECUTE format('CREATE POLICY permissoes3_%s_delete_gate ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)',v_tabela,v_tabela,v_expr);
      END IF;
    END LOOP;
  END LOOP;
END $block$;

-- Acordos: uma policy permissiva remove a barreira de cargos antiga; a policy
-- restritiva garante que desligar a chave revogue inclusive acessos legados.
DROP POLICY IF EXISTS permissoes3_acordos_select_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_select_gate ON public.acordos;
CREATE POLICY permissoes3_acordos_select_allow ON public.acordos AS PERMISSIVE FOR SELECT TO authenticated USING (
  (public.fn_tem_permissao('ver_dashboard',empresa_id) OR public.fn_tem_permissao('ver_acordos',empresa_id))
  AND (operador_id=auth.uid() OR public.fn_tem_permissao('ver_acordos_gerais',empresa_id))
);
CREATE POLICY permissoes3_acordos_select_gate ON public.acordos AS RESTRICTIVE FOR SELECT TO authenticated USING (
  (public.fn_tem_permissao('ver_dashboard',empresa_id) OR public.fn_tem_permissao('ver_acordos',empresa_id))
  AND (operador_id=auth.uid() OR public.fn_tem_permissao('ver_acordos_gerais',empresa_id))
);

DO $block$
DECLARE r RECORD; v_using TEXT; v_check TEXT;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('INSERT','criar_acordos'),('UPDATE','editar_acordos'),('DELETE','excluir_acordos')
  ) x(cmd,chave) LOOP
    EXECUTE format('DROP POLICY IF EXISTS permissoes3_acordos_%s_allow ON public.acordos',lower(r.cmd));
    EXECUTE format('DROP POLICY IF EXISTS permissoes3_acordos_%s_gate ON public.acordos',lower(r.cmd));
    v_using := format('(operador_id=auth.uid() OR public.fn_tem_permissao(''ver_acordos_gerais'',empresa_id)) AND (%s)',
      CASE WHEN r.chave='criar_acordos'
        THEN 'public.fn_tem_permissao(''criar_acordos'',empresa_id) OR public.fn_tem_permissao(''restaurar_lixeira'',empresa_id)'
        ELSE format('public.fn_tem_permissao(%L,empresa_id)',r.chave) END);
    IF r.cmd='INSERT' THEN
      EXECUTE format('CREATE POLICY permissoes3_acordos_insert_allow ON public.acordos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (%s)',v_using);
      EXECUTE format('CREATE POLICY permissoes3_acordos_insert_gate ON public.acordos AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)',v_using);
    ELSIF r.cmd='UPDATE' THEN
      EXECUTE format('CREATE POLICY permissoes3_acordos_update_allow ON public.acordos AS PERMISSIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',v_using,v_using);
      EXECUTE format('CREATE POLICY permissoes3_acordos_update_gate ON public.acordos AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',v_using,v_using);
    ELSE
      EXECUTE format('CREATE POLICY permissoes3_acordos_delete_allow ON public.acordos AS PERMISSIVE FOR DELETE TO authenticated USING (%s)',v_using);
      EXECUTE format('CREATE POLICY permissoes3_acordos_delete_gate ON public.acordos AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)',v_using);
    END IF;
  END LOOP;
END $block$;

-- Perfis: a própria pessoa continua conseguindo ler/atualizar o seu perfil;
-- qualquer ação sobre terceiros passa pela chave correspondente.
DROP POLICY IF EXISTS permissoes3_perfis_select_allow ON public.perfis;
DROP POLICY IF EXISTS permissoes3_perfis_select_gate ON public.perfis;
CREATE POLICY permissoes3_perfis_select_allow ON public.perfis AS PERMISSIVE FOR SELECT TO authenticated USING (
  id=auth.uid() OR public.fn_tem_permissao('ver_usuarios',empresa_id)
  OR public.fn_tem_permissao('ver_operadores',empresa_id)
  OR public.fn_tem_permissao('ver_acordos_gerais',empresa_id)
  OR public.fn_tem_permissao('ver_ouvidoria',empresa_id)
  OR public.fn_tem_permissao('ver_solicitacoes_whatsapp',empresa_id)
  OR public.fn_tem_permissao('ver_tickets',empresa_id)
);
CREATE POLICY permissoes3_perfis_select_gate ON public.perfis AS RESTRICTIVE FOR SELECT TO authenticated USING (
  id=auth.uid() OR public.fn_tem_permissao('ver_usuarios',empresa_id)
  OR public.fn_tem_permissao('ver_operadores',empresa_id)
  OR public.fn_tem_permissao('ver_acordos_gerais',empresa_id)
  OR public.fn_tem_permissao('ver_ouvidoria',empresa_id)
  OR public.fn_tem_permissao('ver_solicitacoes_whatsapp',empresa_id)
  OR public.fn_tem_permissao('ver_tickets',empresa_id)
);
DROP POLICY IF EXISTS permissoes3_perfis_update_allow ON public.perfis;
DROP POLICY IF EXISTS permissoes3_perfis_update_gate ON public.perfis;
CREATE POLICY permissoes3_perfis_update_allow ON public.perfis AS PERMISSIVE FOR UPDATE TO authenticated
  USING (id=auth.uid() OR public.fn_tem_permissao('editar_usuarios',empresa_id))
  WITH CHECK (id=auth.uid() OR public.fn_tem_permissao('editar_usuarios',empresa_id));
CREATE POLICY permissoes3_perfis_update_gate ON public.perfis AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (id=auth.uid() OR public.fn_tem_permissao('editar_usuarios',empresa_id))
  WITH CHECK (id=auth.uid() OR public.fn_tem_permissao('editar_usuarios',empresa_id));

-- Escritas administrativas configuráveis. As policies são criadas apenas nas
-- tabelas existentes e com empresa_id, mantendo a migration compatível.
DO $block$
DECLARE r RECORD; v_cmd TEXT; v_expr TEXT;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('setores','editar_setores'), ('equipes','editar_equipes'),
    ('metas','gerenciar_metas'), ('metas_config_mes','gerenciar_metas'), ('metas_validacoes','gerenciar_metas'),
    ('modelos_mensagem','editar_modelos_mensagem'), ('direto_extra_config','gerenciar_direto_extra'),
    ('tags','gerenciar_tags'), ('documentos_lgpd','gerenciar_documentacoes'),
    ('campanha_facil_mensagens','gerenciar_campanha_facil'), ('campanha_facil_descontos','gerenciar_campanha_facil'),
    ('campanha_facil_mensagens_ocultas','gerenciar_campanha_facil'), ('comemoracoes','gerenciar_comemoracoes'),
    ('atendimento_responsaveis','gerenciar_responsaveis_whatsapp'), ('tickets_atendentes','gerenciar_tickets')
  ) x(tabela,chave)
  WHERE to_regclass('public.'||x.tabela) IS NOT NULL
    AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=x.tabela AND c.column_name='empresa_id')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.tabela);
    v_expr := format('public.fn_tem_permissao(%L,empresa_id)',r.chave);
    FOREACH v_cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS permissoes3_%s_%s_allow ON public.%I',r.tabela,lower(v_cmd),r.tabela);
      EXECUTE format('DROP POLICY IF EXISTS permissoes3_%s_%s_gate ON public.%I',r.tabela,lower(v_cmd),r.tabela);
      IF v_cmd='INSERT' THEN
        EXECUTE format('CREATE POLICY permissoes3_%s_insert_allow ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (%s)',r.tabela,r.tabela,v_expr);
        EXECUTE format('CREATE POLICY permissoes3_%s_insert_gate ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)',r.tabela,r.tabela,v_expr);
      ELSIF v_cmd='UPDATE' THEN
        EXECUTE format('CREATE POLICY permissoes3_%s_update_allow ON public.%I AS PERMISSIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',r.tabela,r.tabela,v_expr,v_expr);
        EXECUTE format('CREATE POLICY permissoes3_%s_update_gate ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',r.tabela,r.tabela,v_expr,v_expr);
      ELSE
        EXECUTE format('CREATE POLICY permissoes3_%s_delete_allow ON public.%I AS PERMISSIVE FOR DELETE TO authenticated USING (%s)',r.tabela,r.tabela,v_expr);
        EXECUTE format('CREATE POLICY permissoes3_%s_delete_gate ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)',r.tabela,r.tabela,v_expr);
      END IF;
    END LOOP;
  END LOOP;
END $block$;

-- Logs, lixeira e módulos: leitura e ação respondem às mesmas chaves da tela.
DROP POLICY IF EXISTS permissoes3_logs_select_allow ON public.logs_sistema;
DROP POLICY IF EXISTS permissoes3_logs_select_gate ON public.logs_sistema;
CREATE POLICY permissoes3_logs_select_allow ON public.logs_sistema AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.fn_tem_permissao('ver_logs',empresa_id));
CREATE POLICY permissoes3_logs_select_gate ON public.logs_sistema AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.fn_tem_permissao('ver_logs',empresa_id));

DROP POLICY IF EXISTS permissoes3_lixeira_select_allow ON public.lixeira_acordos;
DROP POLICY IF EXISTS permissoes3_lixeira_select_gate ON public.lixeira_acordos;
CREATE POLICY permissoes3_lixeira_select_allow ON public.lixeira_acordos AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.fn_tem_permissao('ver_lixeira',empresa_id) AND (operador_id=auth.uid() OR public.fn_tem_permissao('ver_acordos_gerais',empresa_id)));
CREATE POLICY permissoes3_lixeira_select_gate ON public.lixeira_acordos AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.fn_tem_permissao('ver_lixeira',empresa_id) AND (operador_id=auth.uid() OR public.fn_tem_permissao('ver_acordos_gerais',empresa_id)));

DROP POLICY IF EXISTS permissoes3_lixeira_insert_allow ON public.lixeira_acordos;
DROP POLICY IF EXISTS permissoes3_lixeira_insert_gate ON public.lixeira_acordos;
DROP POLICY IF EXISTS permissoes3_lixeira_delete_allow ON public.lixeira_acordos;
DROP POLICY IF EXISTS permissoes3_lixeira_delete_gate ON public.lixeira_acordos;
CREATE POLICY permissoes3_lixeira_insert_allow ON public.lixeira_acordos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (public.fn_tem_permissao('excluir_acordos',empresa_id));
CREATE POLICY permissoes3_lixeira_insert_gate ON public.lixeira_acordos AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.fn_tem_permissao('excluir_acordos',empresa_id));
CREATE POLICY permissoes3_lixeira_delete_allow ON public.lixeira_acordos AS PERMISSIVE FOR DELETE TO authenticated USING (
  public.fn_tem_permissao('restaurar_lixeira',empresa_id) OR public.fn_tem_permissao('esvaziar_lixeira',empresa_id)
);
CREATE POLICY permissoes3_lixeira_delete_gate ON public.lixeira_acordos AS RESTRICTIVE FOR DELETE TO authenticated USING (
  public.fn_tem_permissao('restaurar_lixeira',empresa_id) OR public.fn_tem_permissao('esvaziar_lixeira',empresa_id)
);

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_nivel(p_empresa_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.fn_tem_permissao('editar_ouvidoria',p_empresa_id) THEN 'editar'
              WHEN public.fn_tem_permissao('ver_ouvidoria',p_empresa_id) THEN 'ver'
              ELSE NULL END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_wpp_tem_visao_geral()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public.fn_tem_permissao('ver_solicitacoes_whatsapp_geral',public.fn_user_empresa_id()); $function$;

CREATE OR REPLACE FUNCTION public.fn_ticket_pode_abrir()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public.fn_tem_permissao('abrir_tickets',public.fn_user_empresa_id()); $function$;

CREATE OR REPLACE FUNCTION public.fn_ticket_pode_atender()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public.fn_tem_permissao('atender_tickets',public.fn_user_empresa_id()); $function$;

CREATE OR REPLACE FUNCTION public.fn_ticket_visivel(p_empresa_id UUID,p_setor_id UUID,p_aberto_por UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.fn_tem_permissao('ver_tickets',p_empresa_id)
    AND public.fn_can_access_empresa(p_empresa_id)
    AND (p_aberto_por=auth.uid()
      OR public.fn_tem_permissao('atender_tickets',p_empresa_id)
      OR public.fn_tem_permissao('gerenciar_tickets',p_empresa_id));
$function$;

CREATE OR REPLACE FUNCTION public.fn_comemoracao_pode_criar()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public.fn_tem_permissao('gerenciar_comemoracoes',public.fn_user_empresa_id()); $function$;

-- Escritas dos três módulos com regras próprias (dono, atendente e gestor).
DROP POLICY IF EXISTS permissoes3_ouvidoria_insert_allow ON public.ouvidoria_atendimentos;
DROP POLICY IF EXISTS permissoes3_ouvidoria_insert_gate ON public.ouvidoria_atendimentos;
DROP POLICY IF EXISTS permissoes3_ouvidoria_update_allow ON public.ouvidoria_atendimentos;
DROP POLICY IF EXISTS permissoes3_ouvidoria_update_gate ON public.ouvidoria_atendimentos;
DROP POLICY IF EXISTS permissoes3_ouvidoria_delete_allow ON public.ouvidoria_atendimentos;
DROP POLICY IF EXISTS permissoes3_ouvidoria_delete_gate ON public.ouvidoria_atendimentos;
CREATE POLICY permissoes3_ouvidoria_insert_allow ON public.ouvidoria_atendimentos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (public.fn_tem_permissao('editar_ouvidoria',empresa_id));
CREATE POLICY permissoes3_ouvidoria_insert_gate ON public.ouvidoria_atendimentos AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.fn_tem_permissao('editar_ouvidoria',empresa_id));
CREATE POLICY permissoes3_ouvidoria_update_allow ON public.ouvidoria_atendimentos AS PERMISSIVE FOR UPDATE TO authenticated USING (public.fn_tem_permissao('editar_ouvidoria',empresa_id)) WITH CHECK (public.fn_tem_permissao('editar_ouvidoria',empresa_id));
CREATE POLICY permissoes3_ouvidoria_update_gate ON public.ouvidoria_atendimentos AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.fn_tem_permissao('editar_ouvidoria',empresa_id)) WITH CHECK (public.fn_tem_permissao('editar_ouvidoria',empresa_id));
CREATE POLICY permissoes3_ouvidoria_delete_allow ON public.ouvidoria_atendimentos AS PERMISSIVE FOR DELETE TO authenticated USING (public.fn_tem_permissao('editar_ouvidoria',empresa_id));
CREATE POLICY permissoes3_ouvidoria_delete_gate ON public.ouvidoria_atendimentos AS RESTRICTIVE FOR DELETE TO authenticated USING (public.fn_tem_permissao('editar_ouvidoria',empresa_id));

DROP POLICY IF EXISTS permissoes3_wpp_insert_allow ON public.solicitacoes_whatsapp;
DROP POLICY IF EXISTS permissoes3_wpp_insert_gate ON public.solicitacoes_whatsapp;
DROP POLICY IF EXISTS permissoes3_wpp_update_allow ON public.solicitacoes_whatsapp;
DROP POLICY IF EXISTS permissoes3_wpp_update_gate ON public.solicitacoes_whatsapp;
DROP POLICY IF EXISTS permissoes3_wpp_delete_allow ON public.solicitacoes_whatsapp;
DROP POLICY IF EXISTS permissoes3_wpp_delete_gate ON public.solicitacoes_whatsapp;
CREATE POLICY permissoes3_wpp_insert_allow ON public.solicitacoes_whatsapp AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (solicitante_id=auth.uid() AND public.fn_tem_permissao('criar_solicitacao_whatsapp',empresa_id));
CREATE POLICY permissoes3_wpp_insert_gate ON public.solicitacoes_whatsapp AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (solicitante_id=auth.uid() AND public.fn_tem_permissao('criar_solicitacao_whatsapp',empresa_id));
CREATE POLICY permissoes3_wpp_update_allow ON public.solicitacoes_whatsapp AS PERMISSIVE FOR UPDATE TO authenticated
  USING (public.fn_tem_permissao('atender_solicitacoes_whatsapp',empresa_id) OR (solicitante_id=auth.uid() AND public.fn_tem_permissao('criar_solicitacao_whatsapp',empresa_id)))
  WITH CHECK (public.fn_tem_permissao('atender_solicitacoes_whatsapp',empresa_id) OR (solicitante_id=auth.uid() AND public.fn_tem_permissao('criar_solicitacao_whatsapp',empresa_id)));
CREATE POLICY permissoes3_wpp_update_gate ON public.solicitacoes_whatsapp AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.fn_tem_permissao('atender_solicitacoes_whatsapp',empresa_id) OR (solicitante_id=auth.uid() AND public.fn_tem_permissao('criar_solicitacao_whatsapp',empresa_id)))
  WITH CHECK (public.fn_tem_permissao('atender_solicitacoes_whatsapp',empresa_id) OR (solicitante_id=auth.uid() AND public.fn_tem_permissao('criar_solicitacao_whatsapp',empresa_id)));
CREATE POLICY permissoes3_wpp_delete_allow ON public.solicitacoes_whatsapp AS PERMISSIVE FOR DELETE TO authenticated
  USING (public.fn_tem_permissao('atender_solicitacoes_whatsapp',empresa_id) OR (solicitante_id=auth.uid() AND public.fn_tem_permissao('criar_solicitacao_whatsapp',empresa_id)));
CREATE POLICY permissoes3_wpp_delete_gate ON public.solicitacoes_whatsapp AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.fn_tem_permissao('atender_solicitacoes_whatsapp',empresa_id) OR (solicitante_id=auth.uid() AND public.fn_tem_permissao('criar_solicitacao_whatsapp',empresa_id)));

DROP POLICY IF EXISTS permissoes3_tickets_insert_allow ON public.tickets;
DROP POLICY IF EXISTS permissoes3_tickets_insert_gate ON public.tickets;
DROP POLICY IF EXISTS permissoes3_tickets_update_allow ON public.tickets;
DROP POLICY IF EXISTS permissoes3_tickets_update_gate ON public.tickets;
DROP POLICY IF EXISTS permissoes3_tickets_delete_allow ON public.tickets;
DROP POLICY IF EXISTS permissoes3_tickets_delete_gate ON public.tickets;
CREATE POLICY permissoes3_tickets_insert_allow ON public.tickets AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (aberto_por=auth.uid() AND public.fn_tem_permissao('abrir_tickets',empresa_id));
CREATE POLICY permissoes3_tickets_insert_gate ON public.tickets AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (aberto_por=auth.uid() AND public.fn_tem_permissao('abrir_tickets',empresa_id));
CREATE POLICY permissoes3_tickets_update_allow ON public.tickets AS PERMISSIVE FOR UPDATE TO authenticated USING (public.fn_tem_permissao('atender_tickets',empresa_id) OR (aberto_por=auth.uid() AND public.fn_tem_permissao('abrir_tickets',empresa_id))) WITH CHECK (public.fn_tem_permissao('atender_tickets',empresa_id) OR (aberto_por=auth.uid() AND public.fn_tem_permissao('abrir_tickets',empresa_id)));
CREATE POLICY permissoes3_tickets_update_gate ON public.tickets AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.fn_tem_permissao('atender_tickets',empresa_id) OR (aberto_por=auth.uid() AND public.fn_tem_permissao('abrir_tickets',empresa_id))) WITH CHECK (public.fn_tem_permissao('atender_tickets',empresa_id) OR (aberto_por=auth.uid() AND public.fn_tem_permissao('abrir_tickets',empresa_id)));
CREATE POLICY permissoes3_tickets_delete_allow ON public.tickets AS PERMISSIVE FOR DELETE TO authenticated USING (public.fn_tem_permissao('gerenciar_tickets',empresa_id));
CREATE POLICY permissoes3_tickets_delete_gate ON public.tickets AS RESTRICTIVE FOR DELETE TO authenticated USING (public.fn_tem_permissao('gerenciar_tickets',empresa_id));

CREATE OR REPLACE FUNCTION public.fn_analitico_dashboard_mes(p_empresa_id UUID,p_mes TEXT)
RETURNS TABLE(dia DATE,operador_id UUID,forma_pagamento TEXT,forma_detalhe TEXT,status_tabulacao TEXT,total NUMERIC,total_ho NUMERIC,qtd BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_inicio DATE := (p_mes||'-01')::DATE; v_fim DATE := (date_trunc('month',(p_mes||'-01')::DATE)+interval '1 month'-interval '1 day')::DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT (public.fn_tem_permissao('ver_dashboard',p_empresa_id) OR public.fn_tem_permissao('ver_analitico',p_empresa_id)) THEN RETURN; END IF;
  RETURN QUERY
  SELECT ar.data_pagamento,ar.operador_id,ar.forma_pagamento,ar.forma_detalhe,ar.status_tabulacao,
         sum(ar.valor_recebido)::NUMERIC,sum(ar.total_ho)::NUMERIC,count(*)::BIGINT
    FROM public.analitico_recebimentos ar
   WHERE ar.empresa_id=p_empresa_id AND ar.data_pagamento BETWEEN v_inicio AND v_fim
     AND (
       public.fn_tem_permissao('ver_analiticos_global',p_empresa_id)
       OR ar.operador_id=auth.uid()
       OR (public.fn_tem_permissao('ver_acordos_gerais',p_empresa_id) AND EXISTS (
         SELECT 1 FROM public.perfis alvo JOIN public.perfis eu ON eu.id=auth.uid()
          WHERE alvo.id=ar.operador_id AND alvo.setor_id IS NOT DISTINCT FROM eu.setor_id
       ))
     )
   GROUP BY ar.data_pagamento,ar.operador_id,ar.forma_pagamento,ar.forma_detalhe,ar.status_tabulacao
   ORDER BY ar.data_pagamento,ar.operador_id NULLS LAST,ar.forma_pagamento NULLS LAST,ar.forma_detalhe NULLS LAST,ar.status_tabulacao NULLS LAST;
END;
$function$;

-- Cobertura explícita dos módulos cujo RLS antigo ainda usava cargo.
DO $block$
DECLARE r RECORD; v_expr TEXT;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('ouvidoria_atendimentos','ver_ouvidoria','editar_ouvidoria'),
    ('solicitacoes_whatsapp','ver_solicitacoes_whatsapp','atender_solicitacoes_whatsapp'),
    ('tickets','ver_tickets','gerenciar_tickets'),
    ('campanha_facil_mensagens','ver_campanha_facil','gerenciar_campanha_facil'),
    ('campanha_facil_descontos','ver_campanha_facil','gerenciar_campanha_facil'),
    ('campanha_facil_mensagens_ocultas','ver_campanha_facil','gerenciar_campanha_facil'),
    ('documentos_lgpd','ver_documentacoes','gerenciar_documentacoes')
  ) x(tabela,chave_ver,chave_editar)
  WHERE to_regclass('public.'||x.tabela) IS NOT NULL
    AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=x.tabela AND c.column_name='empresa_id')
  LOOP
    v_expr := format('public.fn_tem_permissao(%L,empresa_id)',r.chave_ver);
    EXECUTE format('DROP POLICY IF EXISTS permissoes3_%s_select_allow ON public.%I',r.tabela,r.tabela);
    EXECUTE format('DROP POLICY IF EXISTS permissoes3_%s_select_gate ON public.%I',r.tabela,r.tabela);
    EXECUTE format('CREATE POLICY permissoes3_%s_select_allow ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (%s)',r.tabela,r.tabela,v_expr);
    EXECUTE format('CREATE POLICY permissoes3_%s_select_gate ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (%s)',r.tabela,r.tabela,v_expr);
  END LOOP;
END $block$;

-- RPCs e triggers antigos tinham a mesma autorização repetida por cargo. Para
-- preservar o corpo transacional já testado de cada rotina, troca-se somente
-- o predicado de cargo pela chave correspondente da matriz.
DO $block$
DECLARE r RECORD; v_def TEXT; v_nova TEXT; v_pred TEXT;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('fn_admin_apagar_acordos_do_usuario(uuid,uuid)','excluir_usuarios'),
    ('fn_admin_delete_user(uuid,boolean)','excluir_usuarios'),
    ('fn_admin_resumo_exclusao_usuario(uuid)','excluir_usuarios'),
    ('fn_logs_expurgar(integer,uuid)','expurgar_logs'),
    ('fn_metas_reabrir_setor(uuid,uuid,integer,integer,text)','gerenciar_metas'),
    ('fn_metas_validar_setor(uuid,uuid,integer,integer)','gerenciar_metas'),
    ('fn_relatorio_reabrir_setor(uuid,uuid,integer,integer,text,text)','validar_relatorios'),
    ('fn_relatorio_validar_setor(uuid,uuid,integer,integer,text)','validar_relatorios'),
    ('fn_multiempresa_definir(uuid,boolean)','gerenciar_multiempresa'),
    ('fn_multiempresa_elegiveis()','ver_multiempresa'),
    ('fn_multiempresa_listar()','ver_multiempresa'),
    ('fn_perfis_guardar_multiempresa()','gerenciar_multiempresa'),
    ('fn_transferencia_desfazer(uuid)','transferir_usuarios'),
    ('fn_transferencia_mover_empresa(uuid,uuid,uuid)','transferir_usuarios'),
    ('fn_transferir_acordo_nr(uuid,uuid,text)','transferir_usuarios'),
    ('fn_impedir_escalada_de_cargo()','editar_usuarios'),
    ('fn_pode_editar_foto_setor(uuid)','editar_usuarios'),
    ('fn_pode_gerir_acordo(uuid,uuid)','editar_acordos'),
    ('fn_profissional_registrar_uf(uuid,text,text,text)','editar_acordos'),
    ('fn_comemoracao_finalizar(uuid)','gerenciar_comemoracoes'),
    ('fn_comemoracao_midia_fixar(uuid,boolean)','gerenciar_comemoracoes'),
    ('fn_pix_expurga_desaprovados(uuid)','aprovar_pix_automatico'),
    ('fn_pix_restaurar_lixeira(uuid)','restaurar_lixeira'),
    ('fn_pix_congela_campos_do_operador()','aprovar_pix_automatico'),
    ('fn_analitico_dashboard_mes_json(uuid,text)','ver_acordos_gerais'),
    ('fn_analitico_destaques_dia(uuid,text,uuid,uuid)','ver_acordos_gerais'),
    ('fn_analitico_resumo_por_operador(uuid,text)','ver_acordos_gerais'),
    ('fn_diario_resumo_mensal(uuid,text)','ver_acordos_gerais'),
    ('fn_diario_resumo_mes(uuid,text)','ver_acordos_gerais'),
    ('fn_composicao_mes_snapshot(uuid,text)','ver_painel_diretoria')
  ) x(assinatura,chave)
  WHERE to_regprocedure('public.'||x.assinatura) IS NOT NULL
  LOOP
    SELECT pg_get_functiondef(to_regprocedure('public.'||r.assinatura)) INTO v_def;
    v_pred := format('public.fn_tem_permissao(%L,NULL)',r.chave);
    v_nova := regexp_replace(v_def,'(public\.)?fn_user_is_super_admin\(\)',v_pred,'gi');
    v_nova := regexp_replace(v_nova,'(public\.)?fn_user_has_any_role\(\s*ARRAY\[[^)]*\]\s*(::[a-z_]+\[\])?\s*\)',v_pred,'gi');
    IF v_nova <> v_def THEN EXECUTE v_nova; END IF;
  END LOOP;
END $block$;

-- Falha cedo caso TS/SQL ou semeadura deixem algum cargo incompleto.
DO $block$ DECLARE v_faltando TEXT; BEGIN
  SELECT string_agg(format('%s/%s/%s',e.slug,cp.cargo,c.chave),', ')
    INTO v_faltando FROM public.empresas e JOIN public.cargos_permissoes cp ON cp.empresa_id=e.id
    CROSS JOIN public.fn_permissoes_catalogo() c
   WHERE (c.tenants IS NULL OR e.slug=ANY(c.tenants)) AND NOT (cp.permissoes ? c.chave);
  IF v_faltando IS NOT NULL THEN RAISE EXCEPTION 'Permissões ausentes: %',v_faltando; END IF;
END $block$;
