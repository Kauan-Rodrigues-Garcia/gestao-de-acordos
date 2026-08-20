-- Permissões 4.0 — Cargo -> Aba -> subpermissões -> escopo de dados.
--
-- EXPAND: as chaves antigas continuam no JSON para rollback, mas nenhum leitor
-- novo depende delas. As chaves por aba nascem do estado EFETIVO anterior;
-- portanto esta migration não concede nem revoga acesso por reseed.

BEGIN;

-- Snapshot exato e privado, antes de qualquer transformação.
CREATE TABLE IF NOT EXISTS public.permissoes_backup_20260820_abas_cargos AS
SELECT now() AS copiado_em, c.* FROM public.cargos_permissoes c WITH NO DATA;
INSERT INTO public.permissoes_backup_20260820_abas_cargos
SELECT now(), c.* FROM public.cargos_permissoes c
WHERE NOT EXISTS (SELECT 1 FROM public.permissoes_backup_20260820_abas_cargos);
ALTER TABLE public.permissoes_backup_20260820_abas_cargos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permissoes_backup_20260820_abas_cargos FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.permissoes_backup_20260820_abas_pessoas AS
SELECT now() AS copiado_em, p.* FROM public.perfis_permissoes p WITH NO DATA;
INSERT INTO public.permissoes_backup_20260820_abas_pessoas
SELECT now(), p.* FROM public.perfis_permissoes p
WHERE NOT EXISTS (SELECT 1 FROM public.permissoes_backup_20260820_abas_pessoas);
ALTER TABLE public.permissoes_backup_20260820_abas_pessoas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permissoes_backup_20260820_abas_pessoas FROM PUBLIC, anon, authenticated;

-- Calcula somente as chaves novas a partir do mapa anterior já mesclado.
CREATE OR REPLACE FUNCTION public.fn_permissoes_abas_novas(m JSONB)
RETURNS JSONB
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'dashboard_escopo_individual', COALESCE((m->>'ver_dashboard')::boolean,false),
    'dashboard_escopo_equipe', COALESCE((m->>'ver_dashboard')::boolean,false) AND COALESCE((m->>'ver_acordos_gerais')::boolean,false) AND COALESCE((m->>'filtrar_por_equipe')::boolean,false),
    'dashboard_escopo_setor', COALESCE((m->>'ver_dashboard')::boolean,false) AND COALESCE((m->>'ver_acordos_gerais')::boolean,false),
    'dashboard_escopo_todos_setores', COALESCE((m->>'ver_dashboard')::boolean,false) AND COALESCE((m->>'ver_acordos_gerais')::boolean,false) AND COALESCE((m->>'ver_todos_setores')::boolean,false),
    'dashboard_editar_acordos', COALESCE((m->>'ver_dashboard')::boolean,false) AND COALESCE((m->>'editar_acordos')::boolean,false),
    'dashboard_alterar_status_acordos', COALESCE((m->>'ver_dashboard')::boolean,false) AND COALESCE((m->>'editar_acordos')::boolean,false),
    'dashboard_excluir_acordos', COALESCE((m->>'ver_dashboard')::boolean,false) AND COALESCE((m->>'excluir_acordos')::boolean,false),
    'dashboard_excluir_em_lote', COALESCE((m->>'ver_dashboard')::boolean,false) AND COALESCE((m->>'excluir_em_lote')::boolean,false),
    'dashboard_ignorar_fechamento_mes', COALESCE((m->>'ver_dashboard')::boolean,false) AND COALESCE((m->>'ignorar_fechamento_mes')::boolean,false),
    'acordos_escopo_individual', COALESCE((m->>'ver_acordos')::boolean,false),
    'acordos_escopo_equipe', COALESCE((m->>'ver_acordos')::boolean,false) AND COALESCE((m->>'ver_acordos_gerais')::boolean,false) AND COALESCE((m->>'filtrar_por_equipe')::boolean,false),
    'acordos_escopo_setor', COALESCE((m->>'ver_acordos')::boolean,false) AND COALESCE((m->>'ver_acordos_gerais')::boolean,false),
    'acordos_escopo_todos_setores', COALESCE((m->>'ver_acordos')::boolean,false) AND COALESCE((m->>'ver_acordos_gerais')::boolean,false) AND COALESCE((m->>'ver_todos_setores')::boolean,false),
    'alterar_status_acordos', COALESCE((m->>'ver_acordos')::boolean,false) AND COALESCE((m->>'editar_acordos')::boolean,false),
    'lixeira_escopo_individual', COALESCE((m->>'ver_lixeira')::boolean,false),
    'lixeira_escopo_equipe', COALESCE((m->>'ver_lixeira')::boolean,false) AND COALESCE((m->>'ver_acordos_gerais')::boolean,false) AND COALESCE((m->>'filtrar_por_equipe')::boolean,false),
    'lixeira_escopo_setor', COALESCE((m->>'ver_lixeira')::boolean,false) AND COALESCE((m->>'ver_acordos_gerais')::boolean,false),
    'lixeira_escopo_todos_setores', COALESCE((m->>'ver_lixeira')::boolean,false) AND COALESCE((m->>'ver_acordos_gerais')::boolean,false) AND COALESCE((m->>'ver_todos_setores')::boolean,false),
    'pix_escopo_individual', COALESCE((m->>'ver_pix_automatico')::boolean,false),
    'pix_escopo_equipe', COALESCE((m->>'ver_pix_automatico')::boolean,false) AND COALESCE((m->>'ver_acordos_gerais')::boolean,false) AND COALESCE((m->>'filtrar_por_equipe')::boolean,false),
    'pix_escopo_setor', COALESCE((m->>'ver_pix_automatico')::boolean,false) AND COALESCE((m->>'ver_acordos_gerais')::boolean,false),
    'pix_escopo_empresa', COALESCE((m->>'ver_pix_automatico')::boolean,false) AND COALESCE((m->>'ver_todos_setores')::boolean,false),
    'editar_configuracoes_pix_automatico', COALESCE((m->>'ver_pix_automatico')::boolean,false) AND COALESCE((m->>'aprovar_pix_automatico')::boolean,false),
    'tickets_escopo_individual', COALESCE((m->>'ver_tickets')::boolean,false),
    'tickets_escopo_equipe', COALESCE((m->>'ver_tickets')::boolean,false) AND (COALESCE((m->>'atender_tickets')::boolean,false) OR COALESCE((m->>'gerenciar_tickets')::boolean,false)),
    'tickets_escopo_setor', COALESCE((m->>'ver_tickets')::boolean,false) AND (COALESCE((m->>'atender_tickets')::boolean,false) OR COALESCE((m->>'gerenciar_tickets')::boolean,false))
  ) || jsonb_build_object(
    'painel_lider_setor_proprio', COALESCE((m->>'ver_painel_lider')::boolean,false),
    'painel_lider_todos_setores', COALESCE((m->>'ver_painel_lider')::boolean,false) AND COALESCE((m->>'ver_todos_setores')::boolean,false),
    'ver_painel_lider_acompanhamento', COALESCE((m->>'ver_painel_lider')::boolean,false),
    'ver_painel_lider_desempenho_equipes', COALESCE((m->>'ver_painel_lider')::boolean,false),
    'ver_painel_lider_quartis', COALESCE((m->>'ver_painel_lider')::boolean,false),
    'ver_painel_lider_grafico_recebimento', COALESCE((m->>'ver_painel_lider')::boolean,false),
    'ver_usuarios_lista', COALESCE((m->>'ver_usuarios')::boolean,false),
    'usuarios_todos_setores', COALESCE((m->>'ver_usuarios')::boolean,false) AND COALESCE((m->>'ver_todos_setores')::boolean,false),
    'setores_todos_setores', COALESCE((m->>'ver_setores')::boolean,false) AND COALESCE((m->>'ver_todos_setores')::boolean,false),
    'criar_setores', COALESCE((m->>'editar_setores')::boolean,false),
    'transferir_usuarios_setor', COALESCE((m->>'transferir_usuarios')::boolean,false),
    'equipes_todos_setores', COALESCE((m->>'ver_equipes')::boolean,false) AND COALESCE((m->>'ver_todos_setores')::boolean,false),
    'metas_todos_setores', COALESCE((m->>'ver_metas')::boolean,false) AND COALESCE((m->>'ver_todos_setores')::boolean,false),
    'editar_dias_uteis', COALESCE((m->>'gerenciar_metas')::boolean,false),
    'editar_quartis', COALESCE((m->>'gerenciar_metas')::boolean,false),
    'analitico_visao_propria', COALESCE((m->>'ver_analitico')::boolean,false),
    'analitico_visao_geral', COALESCE((m->>'ver_analitico')::boolean,false) AND (COALESCE((m->>'ver_operadores')::boolean,false) OR COALESCE((m->>'ver_acordos_gerais')::boolean,false)),
    'analitico_visao_todos_setores', COALESCE((m->>'ver_analitico')::boolean,false) AND COALESCE((m->>'ver_analiticos_global')::boolean,false),
    'ver_analitico_principal', COALESCE((m->>'ver_analitico')::boolean,false),
    'ver_analitico_recebimento_diario', COALESCE((m->>'ver_analitico')::boolean,false),
    'ver_analitico_colchao', COALESCE((m->>'ver_analitico')::boolean,false),
    'ver_analitico_por_operador', COALESCE((m->>'ver_analitico')::boolean,false),
    'ver_analitico_formas_pagamento', COALESCE((m->>'ver_analitico')::boolean,false) AND (COALESCE((m->>'ver_operadores')::boolean,false) OR COALESCE((m->>'ver_acordos_gerais')::boolean,false)),
    'ver_analitico_ranking', COALESCE((m->>'ver_analitico')::boolean,false),
    'ver_analitico_destaques_dia', COALESCE((m->>'ver_analitico')::boolean,false) AND (COALESCE((m->>'ver_operadores')::boolean,false) OR COALESCE((m->>'ver_acordos_gerais')::boolean,false)),
    'ver_analitico_sem_operador', COALESCE((m->>'ver_analitico')::boolean,false) AND (COALESCE((m->>'ver_operadores')::boolean,false) OR COALESCE((m->>'ver_acordos_gerais')::boolean,false)),
    'ver_novo_acordo', COALESCE((m->>'ver_acordos')::boolean,false) AND COALESCE((m->>'criar_acordos')::boolean,false)
  );
$function$;

-- Exceções individuais são migradas pelo mapa EFETIVO. Só armazenamos a
-- diferença para o cargo, mantendo a semântica "ausente = herda".
WITH efetivas AS (
  SELECT pp.id,
         public.fn_permissoes_abas_novas(COALESCE(cp.permissoes,'{}') || COALESCE(pp.permissoes,'{}')) AS pessoa_nova,
         public.fn_permissoes_abas_novas(COALESCE(cp.permissoes,'{}')) AS cargo_novo
    FROM public.perfis_permissoes pp
    JOIN public.perfis p ON p.id=pp.usuario_id AND p.empresa_id=pp.empresa_id
    LEFT JOIN public.cargos_permissoes cp ON cp.empresa_id=pp.empresa_id AND cp.cargo=p.perfil
), deltas AS (
  SELECT e.id, COALESCE(jsonb_object_agg(k.key,k.value) FILTER (
    WHERE k.value IS DISTINCT FROM e.cargo_novo->k.key
  ),'{}'::jsonb) AS delta
  FROM efetivas e CROSS JOIN LATERAL jsonb_each(e.pessoa_nova) k
  GROUP BY e.id
)
UPDATE public.perfis_permissoes pp
   SET permissoes=COALESCE(pp.permissoes,'{}') || d.delta,
       atualizado_em=now()
  FROM deltas d WHERE d.id=pp.id;

UPDATE public.cargos_permissoes
   SET permissoes=COALESCE(permissoes,'{}') || public.fn_permissoes_abas_novas(COALESCE(permissoes,'{}')),
       atualizado_em=now();

-- Mantemos as funções legadas como fonte dos itens que não mudaram. O catálogo
-- público novo exclui categorias globais e acrescenta apenas chaves por aba.
ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_v3_legacy;
CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT c.chave,c.tenants,c.padrao,c.explicita
    FROM public.fn_permissoes_catalogo_v3_legacy() c
   WHERE c.chave <> ALL(ARRAY[
     'ver_acordos_gerais','ver_todos_setores','filtrar_por_setor','filtrar_por_equipe',
     'filtrar_por_usuario','ver_analiticos_global','gerenciar_campanha_facil',
     'gerenciar_comemoracoes','transferir_usuarios','criar_acordos','ver_novo_acordo',
     'editar_acordos','excluir_acordos','excluir_em_lote','ignorar_fechamento_mes'
   ]::TEXT[])
  UNION ALL
  SELECT * FROM (VALUES
    ('criar_acordos',ARRAY['pagueplay'],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('dashboard_editar_acordos',ARRAY['pagueplay'],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('dashboard_alterar_status_acordos',ARRAY['pagueplay'],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('dashboard_excluir_acordos',ARRAY['pagueplay'],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('dashboard_excluir_em_lote',ARRAY['pagueplay'],ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('dashboard_ignorar_fechamento_mes',ARRAY['pagueplay'],ARRAY[]::TEXT[],false),
    ('dashboard_escopo_individual',NULL::TEXT[],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('dashboard_escopo_equipe',NULL::TEXT[],ARRAY['lider','elite','gerencia','administrador','super_admin'],false),
    ('dashboard_escopo_setor',NULL::TEXT[],ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('dashboard_escopo_todos_setores',NULL::TEXT[],ARRAY['gerencia','diretoria','administrador','super_admin'],false),
    ('acordos_escopo_individual',ARRAY['bookplay'],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('acordos_escopo_equipe',ARRAY['bookplay'],ARRAY['lider','elite','gerencia','administrador','super_admin'],false),
    ('acordos_escopo_setor',ARRAY['bookplay'],ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('acordos_escopo_todos_setores',ARRAY['bookplay'],ARRAY['gerencia','diretoria','administrador','super_admin'],false),
    ('lixeira_escopo_individual',NULL::TEXT[],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('lixeira_escopo_equipe',NULL::TEXT[],ARRAY['lider','elite','gerencia','administrador','super_admin'],false),
    ('lixeira_escopo_setor',NULL::TEXT[],ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('lixeira_escopo_todos_setores',NULL::TEXT[],ARRAY['gerencia','diretoria','administrador','super_admin'],false),
    ('pix_escopo_individual',ARRAY['bookplay'],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('pix_escopo_equipe',ARRAY['bookplay'],ARRAY['lider','elite','gerencia','administrador','super_admin'],false),
    ('pix_escopo_setor',ARRAY['bookplay'],ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('pix_escopo_empresa',ARRAY['bookplay'],ARRAY['gerencia','diretoria','administrador','super_admin'],false),
    ('editar_configuracoes_pix_automatico',ARRAY['bookplay'],ARRAY['lider','elite','gerencia','administrador','super_admin'],false),
    ('tickets_escopo_individual',NULL::TEXT[],ARRAY['administrador','super_admin'],false),
    ('tickets_escopo_equipe',NULL::TEXT[],ARRAY['administrador','super_admin'],false),
    ('tickets_escopo_setor',NULL::TEXT[],ARRAY['administrador','super_admin'],false),
    ('painel_lider_setor_proprio',NULL::TEXT[],ARRAY['lider','elite','gerencia','administrador','super_admin'],false),
    ('painel_lider_todos_setores',NULL::TEXT[],ARRAY['gerencia','diretoria','administrador','super_admin'],false),
    ('ver_painel_lider_acompanhamento',NULL::TEXT[],ARRAY['lider','elite','gerencia','administrador','super_admin'],false),
    ('ver_painel_lider_desempenho_equipes',NULL::TEXT[],ARRAY['lider','elite','gerencia','administrador','super_admin'],false),
    ('ver_painel_lider_quartis',NULL::TEXT[],ARRAY['lider','elite','gerencia','administrador','super_admin'],false),
    ('ver_painel_lider_grafico_recebimento',NULL::TEXT[],ARRAY['lider','elite','gerencia','administrador','super_admin'],false),
    ('ver_usuarios_lista',NULL::TEXT[],ARRAY['lider','elite','gerencia','administrador','super_admin'],false),
    ('usuarios_todos_setores',NULL::TEXT[],ARRAY['gerencia','diretoria','administrador','super_admin'],false),
    ('setores_todos_setores',NULL::TEXT[],ARRAY['gerencia','diretoria','administrador','super_admin'],false),
    ('criar_setores',NULL::TEXT[],ARRAY['administrador','super_admin'],false),
    ('transferir_usuarios_setor',NULL::TEXT[],ARRAY['administrador','super_admin'],false),
    ('equipes_todos_setores',NULL::TEXT[],ARRAY['gerencia','diretoria','administrador','super_admin'],false),
    ('metas_todos_setores',NULL::TEXT[],ARRAY['gerencia','diretoria','administrador','super_admin'],false),
    ('editar_dias_uteis',NULL::TEXT[],ARRAY['gerencia','administrador','super_admin'],false),
    ('editar_quartis',NULL::TEXT[],ARRAY['gerencia','administrador','super_admin'],false),
    ('analitico_visao_propria',NULL::TEXT[],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('analitico_visao_geral',NULL::TEXT[],ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('analitico_visao_todos_setores',NULL::TEXT[],ARRAY['gerencia','diretoria','administrador','super_admin'],false),
    ('ver_analitico_principal',NULL::TEXT[],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('ver_analitico_recebimento_diario',NULL::TEXT[],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('ver_analitico_colchao',NULL::TEXT[],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('ver_analitico_por_operador',NULL::TEXT[],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('ver_analitico_formas_pagamento',NULL::TEXT[],ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('ver_analitico_ranking',NULL::TEXT[],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('ver_analitico_destaques_dia',NULL::TEXT[],ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('ver_analitico_sem_operador',NULL::TEXT[],ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('editar_acordos',ARRAY['bookplay'],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('alterar_status_acordos',ARRAY['bookplay'],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('excluir_acordos',ARRAY['bookplay'],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('excluir_em_lote',ARRAY['bookplay'],ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'],false),
    ('ignorar_fechamento_mes',ARRAY['bookplay'],ARRAY[]::TEXT[],false),
    ('ver_novo_acordo',ARRAY['bookplay'],ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'],false)
  ) n(chave,tenants,padrao,explicita);
$function$;

ALTER FUNCTION public.fn_permissoes_dependencias() RENAME TO fn_permissoes_dependencias_v3_legacy;
CREATE FUNCTION public.fn_permissoes_dependencias()
RETURNS TABLE(filha TEXT,pai TEXT)
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT d.filha,d.pai FROM public.fn_permissoes_dependencias_v3_legacy() d
   WHERE d.filha <> ALL(ARRAY['ver_pix_automatico','ver_analiticos_global','gerenciar_campanha_facil','gerenciar_comemoracoes']::TEXT[])
     AND d.filha NOT IN ('criar_usuarios','editar_usuarios','excluir_usuarios','redefinir_senha_usuarios','gerenciar_situacao_usuarios','transferir_usuarios','impersonar_usuarios')
  UNION ALL SELECT * FROM (VALUES
    ('dashboard_escopo_individual','ver_dashboard'),('dashboard_escopo_equipe','ver_dashboard'),('dashboard_escopo_setor','ver_dashboard'),('dashboard_escopo_todos_setores','ver_dashboard'),
    ('dashboard_editar_acordos','ver_dashboard'),('dashboard_alterar_status_acordos','ver_dashboard'),('dashboard_excluir_acordos','ver_dashboard'),('dashboard_excluir_em_lote','ver_dashboard'),('dashboard_ignorar_fechamento_mes','ver_dashboard'),
    ('acordos_escopo_individual','ver_acordos'),('acordos_escopo_equipe','ver_acordos'),('acordos_escopo_setor','ver_acordos'),('acordos_escopo_todos_setores','ver_acordos'),
    ('editar_acordos','ver_acordos'),('alterar_status_acordos','ver_acordos'),('excluir_acordos','ver_acordos'),('excluir_em_lote','ver_acordos'),('ignorar_fechamento_mes','ver_acordos'),
    ('ver_novo_acordo','ver_acordos'),
    ('lixeira_escopo_individual','ver_lixeira'),('lixeira_escopo_equipe','ver_lixeira'),('lixeira_escopo_setor','ver_lixeira'),('lixeira_escopo_todos_setores','ver_lixeira'),
    ('pix_escopo_individual','ver_pix_automatico'),('pix_escopo_equipe','ver_pix_automatico'),('pix_escopo_setor','ver_pix_automatico'),('pix_escopo_empresa','ver_pix_automatico'),('editar_configuracoes_pix_automatico','ver_pix_automatico'),
    ('tickets_escopo_individual','ver_tickets'),('tickets_escopo_equipe','ver_tickets'),('tickets_escopo_setor','ver_tickets'),
    ('painel_lider_setor_proprio','ver_painel_lider'),('painel_lider_todos_setores','ver_painel_lider'),('ver_painel_lider_acompanhamento','ver_painel_lider'),('ver_painel_lider_desempenho_equipes','ver_painel_lider'),('ver_painel_lider_quartis','ver_painel_lider'),('ver_painel_lider_grafico_recebimento','ver_painel_lider'),('ver_operadores','ver_painel_lider'),
    ('ver_usuarios_lista','ver_usuarios'),('usuarios_todos_setores','ver_usuarios_lista'),
    ('criar_usuarios','ver_usuarios_lista'),('editar_usuarios','ver_usuarios_lista'),('excluir_usuarios','ver_usuarios_lista'),('redefinir_senha_usuarios','ver_usuarios_lista'),('gerenciar_situacao_usuarios','ver_usuarios_lista'),('impersonar_usuarios','ver_usuarios_lista'),
    ('setores_todos_setores','ver_setores'),('criar_setores','ver_setores'),('transferir_usuarios_setor','ver_setores'),('transferir_usuarios_setor','setores_todos_setores'),('equipes_todos_setores','ver_equipes'),('metas_todos_setores','ver_metas'),('editar_dias_uteis','ver_metas'),('editar_quartis','ver_metas'),
    ('analitico_visao_propria','ver_analitico'),('analitico_visao_geral','ver_analitico'),('analitico_visao_todos_setores','analitico_visao_geral'),('ver_analitico_principal','ver_analitico'),('ver_analitico_recebimento_diario','ver_analitico'),('ver_analitico_colchao','ver_analitico'),
    ('ver_analitico_por_operador','ver_analitico_principal'),('ver_analitico_formas_pagamento','ver_analitico_principal'),('ver_analitico_ranking','ver_analitico_principal'),('ver_analitico_destaques_dia','ver_analitico_principal'),('ver_analitico_sem_operador','ver_analitico_principal')
  ) n(filha,pai);
$function$;

-- Redefinida para que o planner ligue fn_tem_permissao às dependências novas.
CREATE OR REPLACE FUNCTION public.fn_tem_permissao(p_chave TEXT,p_empresa_id UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_uid UUID := auth.uid(); v_empresa UUID; v_empresa_usuario UUID;
        v_cargo TEXT; v_multi BOOLEAN; v_mapa JSONB; v_mapa_origem JSONB; v_ok BOOLEAN; v_chave TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT empresa_id,perfil,COALESCE(acesso_multiempresa,false)
    INTO v_empresa_usuario,v_cargo,v_multi FROM public.perfis WHERE id=v_uid;
  v_empresa := COALESCE(p_empresa_id,v_empresa_usuario);
  IF v_empresa IS NULL THEN RETURN false; END IF;
  SELECT CASE
    WHEN p_chave='transferir_usuarios' THEN 'transferir_usuarios_setor'
    WHEN e.slug='pagueplay' THEN CASE p_chave
      WHEN 'editar_acordos' THEN 'dashboard_editar_acordos'
      WHEN 'alterar_status_acordos' THEN 'dashboard_alterar_status_acordos'
      WHEN 'excluir_acordos' THEN 'dashboard_excluir_acordos'
      WHEN 'excluir_em_lote' THEN 'dashboard_excluir_em_lote'
      WHEN 'ignorar_fechamento_mes' THEN 'dashboard_ignorar_fechamento_mes'
      ELSE p_chave END
    ELSE p_chave END
    INTO v_chave FROM public.empresas e WHERE e.id=v_empresa;
  IF v_empresa<>v_empresa_usuario AND NOT v_multi THEN
    SELECT COALESCE(cp.permissoes,'{}')||COALESCE(pp.permissoes,'{}') INTO v_mapa_origem
      FROM (SELECT 1) s
      LEFT JOIN public.cargos_permissoes cp ON cp.empresa_id=v_empresa_usuario AND cp.cargo=v_cargo
      LEFT JOIN public.perfis_permissoes pp ON pp.empresa_id=v_empresa_usuario AND pp.usuario_id=v_uid;
    IF NOT COALESCE((v_mapa_origem->>'ver_multiempresa')::boolean,false) THEN RETURN false; END IF;
  END IF;
  SELECT COALESCE(cp.permissoes,'{}')||COALESCE(pp.permissoes,'{}') INTO v_mapa
    FROM (SELECT 1) s
    LEFT JOIN public.cargos_permissoes cp ON cp.empresa_id=v_empresa AND cp.cargo=v_cargo
    LEFT JOIN public.perfis_permissoes pp ON pp.empresa_id=v_empresa AND pp.usuario_id=v_uid;
  WITH RECURSIVE exigidas(chave) AS (
    SELECT v_chave UNION SELECT d.pai FROM public.fn_permissoes_dependencias() d JOIN exigidas e ON e.chave=d.filha
  ) SELECT COALESCE(bool_and(COALESCE((v_mapa->>chave)::boolean,false)),false) INTO v_ok FROM exigidas;
  RETURN v_ok;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_tem_permissao(TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tem_permissao(TEXT,UUID) TO authenticated,service_role;

-- Empresas futuras recebem o catálogo novo. Empresas existentes nunca são
-- atualizadas por esta função (ON CONFLICT DO NOTHING).
CREATE OR REPLACE FUNCTION public.fn_permissoes_semear_empresa(p_empresa_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_slug TEXT; v_cargo TEXT; v_mapa JSONB; v_total INTEGER:=0; v_rows INTEGER:=0;
BEGIN
  SELECT slug INTO v_slug FROM public.empresas WHERE id=p_empresa_id;
  FOREACH v_cargo IN ARRAY ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','administrador','super_admin'] LOOP
    SELECT COALESCE(jsonb_object_agg(c.chave,v_cargo=ANY(c.padrao)),'{}') INTO v_mapa
      FROM public.fn_permissoes_catalogo() c WHERE c.tenants IS NULL OR v_slug=ANY(c.tenants);
    INSERT INTO public.cargos_permissoes(empresa_id,cargo,permissoes)
    VALUES(p_empresa_id,v_cargo,v_mapa) ON CONFLICT(empresa_id,cargo) DO NOTHING;
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    v_total := v_total + v_rows;
  END LOOP;
  RETURN v_total;
END;
$function$;

-- Único resolvedor server-side de escopos. As chaves são deliberadamente
-- distintas: nenhuma aba consulta a permissão de outra.
CREATE OR REPLACE FUNCTION public.fn_tem_escopo_aba(p_aba TEXT,p_nivel TEXT,p_empresa_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT public.fn_tem_permissao(CASE p_aba
    WHEN 'dashboard' THEN CASE p_nivel WHEN 'individual' THEN 'dashboard_escopo_individual' WHEN 'equipe' THEN 'dashboard_escopo_equipe' WHEN 'setor' THEN 'dashboard_escopo_setor' WHEN 'todos_setores' THEN 'dashboard_escopo_todos_setores' END
    WHEN 'acordos' THEN CASE p_nivel WHEN 'individual' THEN 'acordos_escopo_individual' WHEN 'equipe' THEN 'acordos_escopo_equipe' WHEN 'setor' THEN 'acordos_escopo_setor' WHEN 'todos_setores' THEN 'acordos_escopo_todos_setores' END
    WHEN 'lixeira' THEN CASE p_nivel WHEN 'individual' THEN 'lixeira_escopo_individual' WHEN 'equipe' THEN 'lixeira_escopo_equipe' WHEN 'setor' THEN 'lixeira_escopo_setor' WHEN 'todos_setores' THEN 'lixeira_escopo_todos_setores' END
    WHEN 'pix_automatico' THEN CASE p_nivel WHEN 'individual' THEN 'pix_escopo_individual' WHEN 'equipe' THEN 'pix_escopo_equipe' WHEN 'setor' THEN 'pix_escopo_setor' WHEN 'todos_setores' THEN 'pix_escopo_empresa' END
    WHEN 'tickets' THEN CASE p_nivel WHEN 'individual' THEN 'tickets_escopo_individual' WHEN 'equipe' THEN 'tickets_escopo_equipe' WHEN 'setor' THEN 'tickets_escopo_setor' END
    WHEN 'analitico' THEN CASE p_nivel WHEN 'individual' THEN 'analitico_visao_propria' WHEN 'setor' THEN 'analitico_visao_geral' WHEN 'todos_setores' THEN 'analitico_visao_todos_setores' END
    WHEN 'painel_lider' THEN CASE p_nivel WHEN 'setor' THEN 'painel_lider_setor_proprio' WHEN 'todos_setores' THEN 'painel_lider_todos_setores' END
  END,p_empresa_id);
$function$;
REVOKE ALL ON FUNCTION public.fn_tem_escopo_aba(TEXT,TEXT,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_tem_escopo_aba(TEXT,TEXT,UUID) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fn_usuario_no_escopo_aba(
  p_aba TEXT,p_empresa_id UUID,p_operador_id UUID,p_setor_id UUID
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT public.fn_can_access_empresa(p_empresa_id) AND (
    (p_operador_id=(SELECT auth.uid()) AND public.fn_tem_escopo_aba(p_aba,'individual',p_empresa_id))
    OR public.fn_tem_escopo_aba(p_aba,'todos_setores',p_empresa_id)
    OR (public.fn_tem_escopo_aba(p_aba,'setor',p_empresa_id) AND COALESCE(p_setor_id,public.fn_operador_setor_id(p_operador_id))=(SELECT public.fn_user_setor_id()))
    OR (public.fn_tem_escopo_aba(p_aba,'equipe',p_empresa_id) AND EXISTS (
      SELECT 1 FROM public.fn_equipes_do_operador(p_operador_id) alvo
      JOIN public.fn_equipes_do_operador((SELECT auth.uid())) atual ON atual.equipe_id=alvo.equipe_id
    ))
  );
$function$;
REVOKE ALL ON FUNCTION public.fn_usuario_no_escopo_aba(TEXT,UUID,UUID,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_usuario_no_escopo_aba(TEXT,UUID,UUID,UUID) TO authenticated,service_role;

-- Acordos: PaguePlay pertence ao Dashboard; BookPlay pertence a Acordos BP.
DROP POLICY IF EXISTS permissoes3_acordos_select_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_select_gate ON public.acordos;
DROP POLICY IF EXISTS permissoes4_acordos_select_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes4_acordos_select_gate ON public.acordos;
CREATE POLICY permissoes4_acordos_select_allow ON public.acordos AS PERMISSIVE FOR SELECT TO authenticated USING (
  (CASE (SELECT e.slug FROM public.empresas e WHERE e.id=empresa_id)
    WHEN 'bookplay' THEN public.fn_tem_permissao('ver_acordos',empresa_id) AND public.fn_usuario_no_escopo_aba('acordos',empresa_id,operador_id,setor_id)
    ELSE public.fn_tem_permissao('ver_dashboard',empresa_id) AND public.fn_usuario_no_escopo_aba('dashboard',empresa_id,operador_id,setor_id)
  END)
  OR (public.fn_tem_permissao('ver_analitico',empresa_id) AND public.fn_usuario_no_escopo_aba('analitico',empresa_id,operador_id,setor_id))
  OR (public.fn_tem_permissao('ver_painel_lider',empresa_id) AND public.fn_usuario_no_escopo_aba('painel_lider',empresa_id,operador_id,setor_id))
);
CREATE POLICY permissoes4_acordos_select_gate ON public.acordos AS RESTRICTIVE FOR SELECT TO authenticated USING (
  (CASE (SELECT e.slug FROM public.empresas e WHERE e.id=empresa_id)
    WHEN 'bookplay' THEN public.fn_tem_permissao('ver_acordos',empresa_id) AND public.fn_usuario_no_escopo_aba('acordos',empresa_id,operador_id,setor_id)
    ELSE public.fn_tem_permissao('ver_dashboard',empresa_id) AND public.fn_usuario_no_escopo_aba('dashboard',empresa_id,operador_id,setor_id)
  END)
  OR (public.fn_tem_permissao('ver_analitico',empresa_id) AND public.fn_usuario_no_escopo_aba('analitico',empresa_id,operador_id,setor_id))
  OR (public.fn_tem_permissao('ver_painel_lider',empresa_id) AND public.fn_usuario_no_escopo_aba('painel_lider',empresa_id,operador_id,setor_id))
);
DROP POLICY IF EXISTS permissoes3_acordos_insert_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_insert_gate ON public.acordos;
CREATE POLICY permissoes4_acordos_insert_allow ON public.acordos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (
  public.fn_tem_permissao(CASE (SELECT e.slug FROM public.empresas e WHERE e.id=empresa_id)
    WHEN 'bookplay' THEN 'ver_novo_acordo' ELSE 'criar_acordos' END,empresa_id)
  OR public.fn_tem_permissao('importar_excel',empresa_id)
  OR public.fn_tem_permissao('restaurar_lixeira',empresa_id)
);
CREATE POLICY permissoes4_acordos_insert_gate ON public.acordos AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  public.fn_tem_permissao(CASE (SELECT e.slug FROM public.empresas e WHERE e.id=empresa_id)
    WHEN 'bookplay' THEN 'ver_novo_acordo' ELSE 'criar_acordos' END,empresa_id)
  OR public.fn_tem_permissao('importar_excel',empresa_id)
  OR public.fn_tem_permissao('restaurar_lixeira',empresa_id)
);

-- Edição comum e alteração de status são ações distintas. A policy autoriza a
-- operação; o trigger abaixo verifica quais colunas realmente mudaram.
DROP POLICY IF EXISTS permissoes3_acordos_update_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_update_gate ON public.acordos;
DROP POLICY IF EXISTS permissoes4_acordos_update_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes4_acordos_update_gate ON public.acordos;
CREATE POLICY permissoes4_acordos_update_allow ON public.acordos AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    public.fn_usuario_no_escopo_aba(CASE (SELECT e.slug FROM public.empresas e WHERE e.id=empresa_id) WHEN 'bookplay' THEN 'acordos' ELSE 'dashboard' END,empresa_id,operador_id,setor_id)
    AND (public.fn_tem_permissao('editar_acordos',empresa_id) OR public.fn_tem_permissao('alterar_status_acordos',empresa_id))
  )
  WITH CHECK (
    public.fn_usuario_no_escopo_aba(CASE (SELECT e.slug FROM public.empresas e WHERE e.id=empresa_id) WHEN 'bookplay' THEN 'acordos' ELSE 'dashboard' END,empresa_id,operador_id,setor_id)
    AND (public.fn_tem_permissao('editar_acordos',empresa_id) OR public.fn_tem_permissao('alterar_status_acordos',empresa_id))
  );
CREATE POLICY permissoes4_acordos_update_gate ON public.acordos AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    public.fn_usuario_no_escopo_aba(CASE (SELECT e.slug FROM public.empresas e WHERE e.id=empresa_id) WHEN 'bookplay' THEN 'acordos' ELSE 'dashboard' END,empresa_id,operador_id,setor_id)
    AND (public.fn_tem_permissao('editar_acordos',empresa_id) OR public.fn_tem_permissao('alterar_status_acordos',empresa_id))
  )
  WITH CHECK (
    public.fn_usuario_no_escopo_aba(CASE (SELECT e.slug FROM public.empresas e WHERE e.id=empresa_id) WHEN 'bookplay' THEN 'acordos' ELSE 'dashboard' END,empresa_id,operador_id,setor_id)
    AND (public.fn_tem_permissao('editar_acordos',empresa_id) OR public.fn_tem_permissao('alterar_status_acordos',empresa_id))
  );

CREATE OR REPLACE FUNCTION public.fn_acordo_validar_tipo_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE v_mudou_status BOOLEAN; v_mudou_outros BOOLEAN;
BEGIN
  IF auth.role()='service_role' THEN RETURN NEW; END IF;
  v_mudou_status := NEW.status IS DISTINCT FROM OLD.status
    OR NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento;
  IF v_mudou_status THEN
    IF NOT public.fn_tem_permissao('alterar_status_acordos',OLD.empresa_id) THEN
      RAISE EXCEPTION 'Sem permissão para alterar o status do acordo' USING ERRCODE='42501';
    END IF;
    v_mudou_outros := (to_jsonb(NEW)-ARRAY['status','data_pagamento','vencimento','atualizado_em'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','data_pagamento','vencimento','atualizado_em']);
  ELSE
    v_mudou_outros := (to_jsonb(NEW)-ARRAY['status','data_pagamento','atualizado_em'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','data_pagamento','atualizado_em']);
  END IF;
  IF v_mudou_outros AND NOT public.fn_tem_permissao('editar_acordos',OLD.empresa_id) THEN
    RAISE EXCEPTION 'Sem permissão para editar o acordo' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_permissoes4_acordo_validar_update ON public.acordos;
CREATE TRIGGER trg_permissoes4_acordo_validar_update
BEFORE UPDATE ON public.acordos FOR EACH ROW EXECUTE FUNCTION public.fn_acordo_validar_tipo_update();

DROP POLICY IF EXISTS permissoes3_acordos_delete_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes3_acordos_delete_gate ON public.acordos;
DROP POLICY IF EXISTS permissoes4_acordos_delete_allow ON public.acordos;
DROP POLICY IF EXISTS permissoes4_acordos_delete_gate ON public.acordos;
CREATE POLICY permissoes4_acordos_delete_allow ON public.acordos AS PERMISSIVE FOR DELETE TO authenticated USING (
  public.fn_tem_permissao('excluir_acordos',empresa_id)
  AND public.fn_usuario_no_escopo_aba(CASE (SELECT e.slug FROM public.empresas e WHERE e.id=empresa_id) WHEN 'bookplay' THEN 'acordos' ELSE 'dashboard' END,empresa_id,operador_id,setor_id)
);
CREATE POLICY permissoes4_acordos_delete_gate ON public.acordos AS RESTRICTIVE FOR DELETE TO authenticated USING (
  public.fn_tem_permissao('excluir_acordos',empresa_id)
  AND public.fn_usuario_no_escopo_aba(CASE (SELECT e.slug FROM public.empresas e WHERE e.id=empresa_id) WHEN 'bookplay' THEN 'acordos' ELSE 'dashboard' END,empresa_id,operador_id,setor_id)
);

-- Lixeira: escopo e ações pertencem exclusivamente à aba Lixeira.
DROP POLICY IF EXISTS permissoes3_lixeira_select_allow ON public.lixeira_acordos;
DROP POLICY IF EXISTS permissoes3_lixeira_select_gate ON public.lixeira_acordos;
CREATE POLICY permissoes4_lixeira_select_allow ON public.lixeira_acordos AS PERMISSIVE FOR SELECT TO authenticated USING (
  public.fn_tem_permissao('ver_lixeira',empresa_id)
  AND public.fn_usuario_no_escopo_aba('lixeira',empresa_id,operador_id,COALESCE(NULLIF(dados_completos->>'setor_id','')::UUID,public.fn_operador_setor_id(operador_id)))
);
CREATE POLICY permissoes4_lixeira_select_gate ON public.lixeira_acordos AS RESTRICTIVE FOR SELECT TO authenticated USING (
  public.fn_tem_permissao('ver_lixeira',empresa_id)
  AND public.fn_usuario_no_escopo_aba('lixeira',empresa_id,operador_id,COALESCE(NULLIF(dados_completos->>'setor_id','')::UUID,public.fn_operador_setor_id(operador_id)))
);

-- Perfis é uma tabela compartilhada por filtros e telas administrativas. Cada
-- consumidor declara seu próprio caminho, sem a antiga chave global.
DROP POLICY IF EXISTS permissoes3_perfis_select_allow ON public.perfis;
DROP POLICY IF EXISTS permissoes3_perfis_select_gate ON public.perfis;
CREATE POLICY permissoes4_perfis_select_allow ON public.perfis AS PERMISSIVE FOR SELECT TO authenticated USING (
  id=(SELECT auth.uid())
  OR (public.fn_tem_permissao('ver_usuarios_lista',empresa_id) AND (public.fn_tem_permissao('usuarios_todos_setores',empresa_id) OR setor_id=(SELECT public.fn_user_setor_id())))
  OR (public.fn_tem_permissao('transferir_usuarios_setor',empresa_id) AND (public.fn_tem_permissao('setores_todos_setores',empresa_id) OR setor_id=(SELECT public.fn_user_setor_id())))
  OR (public.fn_tem_permissao('ver_equipes',empresa_id) AND (public.fn_tem_permissao('equipes_todos_setores',empresa_id) OR setor_id=(SELECT public.fn_user_setor_id())))
  OR (public.fn_tem_permissao('ver_metas',empresa_id) AND (public.fn_tem_permissao('metas_todos_setores',empresa_id) OR setor_id=(SELECT public.fn_user_setor_id())))
  OR (public.fn_tem_permissao('ver_painel_lider',empresa_id) AND public.fn_usuario_no_escopo_aba('painel_lider',empresa_id,id,setor_id))
  OR public.fn_usuario_no_escopo_aba('analitico',empresa_id,id,setor_id)
  OR public.fn_usuario_no_escopo_aba('dashboard',empresa_id,id,setor_id)
  OR public.fn_usuario_no_escopo_aba('acordos',empresa_id,id,setor_id)
  OR public.fn_usuario_no_escopo_aba('pix_automatico',empresa_id,id,setor_id)
  OR public.fn_usuario_no_escopo_aba('tickets',empresa_id,id,setor_id)
  OR public.fn_tem_permissao('ver_ouvidoria',empresa_id)
  OR public.fn_tem_permissao('ver_solicitacoes_whatsapp',empresa_id)
);
CREATE POLICY permissoes4_perfis_select_gate ON public.perfis AS RESTRICTIVE FOR SELECT TO authenticated USING (
  id=(SELECT auth.uid())
  OR (public.fn_tem_permissao('ver_usuarios_lista',empresa_id) AND (public.fn_tem_permissao('usuarios_todos_setores',empresa_id) OR setor_id=(SELECT public.fn_user_setor_id())))
  OR (public.fn_tem_permissao('transferir_usuarios_setor',empresa_id) AND (public.fn_tem_permissao('setores_todos_setores',empresa_id) OR setor_id=(SELECT public.fn_user_setor_id())))
  OR (public.fn_tem_permissao('ver_equipes',empresa_id) AND (public.fn_tem_permissao('equipes_todos_setores',empresa_id) OR setor_id=(SELECT public.fn_user_setor_id())))
  OR (public.fn_tem_permissao('ver_metas',empresa_id) AND (public.fn_tem_permissao('metas_todos_setores',empresa_id) OR setor_id=(SELECT public.fn_user_setor_id())))
  OR (public.fn_tem_permissao('ver_painel_lider',empresa_id) AND public.fn_usuario_no_escopo_aba('painel_lider',empresa_id,id,setor_id))
  OR public.fn_usuario_no_escopo_aba('analitico',empresa_id,id,setor_id)
  OR public.fn_usuario_no_escopo_aba('dashboard',empresa_id,id,setor_id)
  OR public.fn_usuario_no_escopo_aba('acordos',empresa_id,id,setor_id)
  OR public.fn_usuario_no_escopo_aba('pix_automatico',empresa_id,id,setor_id)
  OR public.fn_usuario_no_escopo_aba('tickets',empresa_id,id,setor_id)
  OR public.fn_tem_permissao('ver_ouvidoria',empresa_id)
  OR public.fn_tem_permissao('ver_solicitacoes_whatsapp',empresa_id)
);
DROP POLICY IF EXISTS permissoes3_perfis_update_gate ON public.perfis;
CREATE POLICY permissoes4_perfis_update_gate ON public.perfis AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (id=(SELECT auth.uid()) OR (public.fn_tem_permissao('editar_usuarios',empresa_id) AND (public.fn_tem_permissao('usuarios_todos_setores',empresa_id) OR setor_id=(SELECT public.fn_user_setor_id()))) OR (public.fn_tem_permissao('transferir_usuarios_setor',empresa_id) AND public.fn_tem_permissao('setores_todos_setores',empresa_id)))
  WITH CHECK (id=(SELECT auth.uid()) OR (public.fn_tem_permissao('editar_usuarios',empresa_id) AND (public.fn_tem_permissao('usuarios_todos_setores',empresa_id) OR setor_id=(SELECT public.fn_user_setor_id()))) OR (public.fn_tem_permissao('transferir_usuarios_setor',empresa_id) AND public.fn_tem_permissao('setores_todos_setores',empresa_id)));

-- Escritas das subabas de Usuários respeitam a ação específica.
DROP POLICY IF EXISTS permissoes4_setores_insert_gate ON public.setores;
DROP POLICY IF EXISTS permissoes3_setores_insert_gate ON public.setores;
CREATE POLICY permissoes4_setores_insert_gate ON public.setores AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.fn_tem_permissao('criar_setores',empresa_id));
DROP POLICY IF EXISTS permissoes4_setores_update_gate ON public.setores;
CREATE POLICY permissoes4_setores_update_gate ON public.setores AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.fn_tem_permissao('editar_setores',empresa_id) AND (public.fn_tem_permissao('setores_todos_setores',empresa_id) OR id=(SELECT public.fn_user_setor_id())))
  WITH CHECK (public.fn_tem_permissao('editar_setores',empresa_id) AND (public.fn_tem_permissao('setores_todos_setores',empresa_id) OR id=(SELECT public.fn_user_setor_id())));
DROP POLICY IF EXISTS permissoes4_setores_delete_gate ON public.setores;
CREATE POLICY permissoes4_setores_delete_gate ON public.setores AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.fn_tem_permissao('editar_setores',empresa_id) AND (public.fn_tem_permissao('setores_todos_setores',empresa_id) OR id=(SELECT public.fn_user_setor_id())));
DROP POLICY IF EXISTS permissoes4_equipes_write_gate ON public.equipes;
CREATE POLICY permissoes4_equipes_write_gate ON public.equipes AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.fn_tem_permissao('editar_equipes',empresa_id) AND (public.fn_tem_permissao('equipes_todos_setores',empresa_id) OR setor_id=(SELECT public.fn_user_setor_id())))
  WITH CHECK (public.fn_tem_permissao('editar_equipes',empresa_id) AND (public.fn_tem_permissao('equipes_todos_setores',empresa_id) OR setor_id=(SELECT public.fn_user_setor_id())));

-- Dias úteis e quartis são editáveis de forma independente das metas.
DROP POLICY IF EXISTS permissoes3_metas_config_mes_insert_allow ON public.metas_config_mes;
DROP POLICY IF EXISTS permissoes3_metas_config_mes_insert_gate ON public.metas_config_mes;
DROP POLICY IF EXISTS permissoes3_metas_config_mes_update_allow ON public.metas_config_mes;
DROP POLICY IF EXISTS permissoes3_metas_config_mes_update_gate ON public.metas_config_mes;
DROP POLICY IF EXISTS permissoes3_metas_config_mes_delete_allow ON public.metas_config_mes;
DROP POLICY IF EXISTS permissoes3_metas_config_mes_delete_gate ON public.metas_config_mes;
CREATE POLICY permissoes4_metas_config_insert_allow ON public.metas_config_mes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (public.fn_tem_permissao('editar_dias_uteis',empresa_id) OR public.fn_tem_permissao('editar_quartis',empresa_id));
CREATE POLICY permissoes4_metas_config_insert_gate ON public.metas_config_mes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.fn_tem_permissao('editar_dias_uteis',empresa_id) OR public.fn_tem_permissao('editar_quartis',empresa_id));
CREATE POLICY permissoes4_metas_config_update_allow ON public.metas_config_mes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (public.fn_tem_permissao('editar_dias_uteis',empresa_id) OR public.fn_tem_permissao('editar_quartis',empresa_id))
  WITH CHECK (public.fn_tem_permissao('editar_dias_uteis',empresa_id) OR public.fn_tem_permissao('editar_quartis',empresa_id));
CREATE POLICY permissoes4_metas_config_update_gate ON public.metas_config_mes AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.fn_tem_permissao('editar_dias_uteis',empresa_id) OR public.fn_tem_permissao('editar_quartis',empresa_id))
  WITH CHECK (public.fn_tem_permissao('editar_dias_uteis',empresa_id) OR public.fn_tem_permissao('editar_quartis',empresa_id));

-- Módulos liga/desliga: a mesma chave controla abrir e operar.
DO $modulos$
DECLARE v_tabela TEXT; v_cmd TEXT; v_expr TEXT;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['campanha_facil_mensagens','campanha_facil_descontos','campanha_facil_mensagens_ocultas','comemoracoes'] LOOP
    IF to_regclass('public.'||v_tabela) IS NULL THEN CONTINUE; END IF;
    v_expr := CASE WHEN v_tabela='comemoracoes'
      THEN 'public.fn_tem_permissao(''ver_comemoracoes'',empresa_id)'
      ELSE 'public.fn_tem_permissao(''ver_campanha_facil'',empresa_id)' END;
    FOREACH v_cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS permissoes3_%s_%s_allow ON public.%I',v_tabela,lower(v_cmd),v_tabela);
      EXECUTE format('DROP POLICY IF EXISTS permissoes3_%s_%s_gate ON public.%I',v_tabela,lower(v_cmd),v_tabela);
      IF v_cmd='INSERT' THEN
        EXECUTE format('CREATE POLICY permissoes4_%s_insert_allow ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (%s)',v_tabela,v_tabela,v_expr);
        EXECUTE format('CREATE POLICY permissoes4_%s_insert_gate ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)',v_tabela,v_tabela,v_expr);
      ELSIF v_cmd='UPDATE' THEN
        EXECUTE format('CREATE POLICY permissoes4_%s_update_allow ON public.%I AS PERMISSIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',v_tabela,v_tabela,v_expr,v_expr);
        EXECUTE format('CREATE POLICY permissoes4_%s_update_gate ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',v_tabela,v_tabela,v_expr,v_expr);
      ELSE
        EXECUTE format('CREATE POLICY permissoes4_%s_delete_allow ON public.%I AS PERMISSIVE FOR DELETE TO authenticated USING (%s)',v_tabela,v_tabela,v_expr);
        EXECUTE format('CREATE POLICY permissoes4_%s_delete_gate ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)',v_tabela,v_tabela,v_expr);
      END IF;
    END LOOP;
  END LOOP;
END;
$modulos$;

-- Tickets: a visibilidade não deriva mais da capacidade de atender a fila.
CREATE OR REPLACE FUNCTION public.fn_ticket_visivel(p_empresa_id UUID,p_setor_id UUID,p_aberto_por UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT public.fn_tem_permissao('ver_tickets',p_empresa_id)
    AND public.fn_usuario_no_escopo_aba('tickets',p_empresa_id,p_aberto_por,p_setor_id);
$function$;

-- As agregações analíticas são compartilhadas por várias telas. O contexto é
-- obrigatório no contrato novo para que o SECURITY DEFINER aplique o escopo da
-- aba chamadora, em vez de inferir alcance por cargo ou por uma chave global.
CREATE OR REPLACE FUNCTION public.fn_contexto_dados_analiticos_permitido(
  p_contexto TEXT,p_empresa_id UUID,p_operador_id UUID,p_setor_id UUID
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT public.fn_can_access_empresa(p_empresa_id) AND CASE p_contexto
    WHEN 'dashboard' THEN public.fn_tem_permissao('ver_dashboard',p_empresa_id)
      AND public.fn_usuario_no_escopo_aba('dashboard',p_empresa_id,p_operador_id,p_setor_id)
    WHEN 'diretoria' THEN public.fn_tem_permissao('ver_painel_diretoria',p_empresa_id)
    WHEN 'painel_lider' THEN public.fn_tem_permissao('ver_painel_lider',p_empresa_id)
      AND public.fn_usuario_no_escopo_aba('painel_lider',p_empresa_id,p_operador_id,p_setor_id)
    WHEN 'pix_automatico' THEN public.fn_tem_permissao('ver_pix_automatico',p_empresa_id)
      AND public.fn_usuario_no_escopo_aba('pix_automatico',p_empresa_id,p_operador_id,p_setor_id)
    WHEN 'analitico' THEN public.fn_tem_permissao('ver_analitico',p_empresa_id)
      AND public.fn_usuario_no_escopo_aba('analitico',p_empresa_id,p_operador_id,p_setor_id)
    ELSE false
  END;
$function$;
REVOKE ALL ON FUNCTION public.fn_contexto_dados_analiticos_permitido(TEXT,UUID,UUID,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_contexto_dados_analiticos_permitido(TEXT,UUID,UUID,UUID) TO authenticated,service_role;

DROP FUNCTION IF EXISTS public.fn_analitico_dashboard_mes_json(UUID,TEXT);
CREATE FUNCTION public.fn_analitico_dashboard_mes_json(
  p_empresa_id UUID,p_mes TEXT,p_contexto TEXT DEFAULT 'analitico'
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio DATE := (p_mes||'-01')::DATE;
  v_fim DATE := (date_trunc('month',(p_mes||'-01')::DATE)+interval '1 month'-interval '1 day')::DATE;
  v_out JSONB;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN '[]'::JSONB; END IF;
  SELECT COALESCE(jsonb_agg(t),'[]'::JSONB) INTO v_out FROM (
    SELECT ar.data_pagamento AS dia,ar.operador_id,
           COALESCE(ar.setor_id,op.setor_id,imp.setor_id) AS setor_id,
           ar.forma_pagamento,ar.forma_detalhe,ar.status_tabulacao,
           sum(ar.valor_recebido)::NUMERIC AS total,
           sum(ar.total_ho)::NUMERIC AS total_ho,count(*)::BIGINT AS qtd
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis op ON op.id=ar.operador_id
      LEFT JOIN public.perfis imp ON imp.id=ar.importado_por_id
     WHERE ar.empresa_id=p_empresa_id
       AND ar.data_pagamento BETWEEN v_inicio AND v_fim
       AND public.fn_contexto_dados_analiticos_permitido(
         p_contexto,p_empresa_id,ar.operador_id,COALESCE(ar.setor_id,op.setor_id,imp.setor_id)
       )
     GROUP BY ar.data_pagamento,ar.operador_id,
              COALESCE(ar.setor_id,op.setor_id,imp.setor_id),ar.forma_pagamento,
              ar.forma_detalhe,ar.status_tabulacao
     ORDER BY ar.data_pagamento,ar.operador_id NULLS LAST,
              ar.forma_pagamento NULLS LAST,ar.forma_detalhe NULLS LAST,
              ar.status_tabulacao NULLS LAST
  ) t;
  RETURN v_out;
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_analitico_dashboard_mes(UUID,TEXT);
CREATE FUNCTION public.fn_analitico_dashboard_mes(
  p_empresa_id UUID,p_mes TEXT,p_contexto TEXT DEFAULT 'analitico'
)
RETURNS TABLE(
  dia DATE,operador_id UUID,forma_pagamento TEXT,forma_detalhe TEXT,
  status_tabulacao TEXT,total NUMERIC,total_ho NUMERIC,qtd BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio DATE := (p_mes||'-01')::DATE;
  v_fim DATE := (date_trunc('month',(p_mes||'-01')::DATE)+interval '1 month'-interval '1 day')::DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT ar.data_pagamento,ar.operador_id,ar.forma_pagamento,ar.forma_detalhe,
         ar.status_tabulacao,sum(ar.valor_recebido)::NUMERIC,
         sum(ar.total_ho)::NUMERIC,count(*)::BIGINT
    FROM public.analitico_recebimentos ar
    LEFT JOIN public.perfis op ON op.id=ar.operador_id
    LEFT JOIN public.perfis imp ON imp.id=ar.importado_por_id
   WHERE ar.empresa_id=p_empresa_id
     AND ar.data_pagamento BETWEEN v_inicio AND v_fim
     AND public.fn_contexto_dados_analiticos_permitido(
       p_contexto,p_empresa_id,ar.operador_id,COALESCE(ar.setor_id,op.setor_id,imp.setor_id)
     )
   GROUP BY ar.data_pagamento,ar.operador_id,ar.forma_pagamento,
            ar.forma_detalhe,ar.status_tabulacao
   ORDER BY ar.data_pagamento,ar.operador_id NULLS LAST,
            ar.forma_pagamento NULLS LAST,ar.forma_detalhe NULLS LAST,
            ar.status_tabulacao NULLS LAST;
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_analitico_resumo_por_operador(UUID,TEXT);
CREATE FUNCTION public.fn_analitico_resumo_por_operador(
  p_empresa_id UUID,p_mes TEXT,p_contexto TEXT DEFAULT 'analitico'
)
RETURNS TABLE(
  operador_id UUID,operador_usuario TEXT,operador_nome TEXT,total_recebido NUMERIC,
  total_ho NUMERIC,total_pagamentos BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT ar.operador_id,MIN(ar.operador_usuario),op.nome,
         sum(ar.valor_recebido)::NUMERIC,sum(ar.total_ho)::NUMERIC,count(*)::BIGINT
    FROM public.analitico_recebimentos ar
    LEFT JOIN public.perfis op ON op.id=ar.operador_id
    LEFT JOIN public.perfis imp ON imp.id=ar.importado_por_id
   WHERE ar.empresa_id=p_empresa_id
     AND ar.operador_id IS NOT NULL
     AND COALESCE(op.perfil,'')<>'super_admin'
     AND ar.data_pagamento>=(p_mes||'-01')::DATE
     AND ar.data_pagamento<((p_mes||'-01')::DATE+interval '1 month')::DATE
     AND public.fn_contexto_dados_analiticos_permitido(
       p_contexto,p_empresa_id,ar.operador_id,COALESCE(ar.setor_id,op.setor_id,imp.setor_id)
     )
   GROUP BY ar.operador_id,op.nome
   ORDER BY sum(ar.valor_recebido) DESC;
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_diario_resumo_mensal(UUID,TEXT);
CREATE FUNCTION public.fn_diario_resumo_mensal(
  p_empresa_id UUID,p_mes TEXT,p_contexto TEXT DEFAULT 'analitico'
)
RETURNS TABLE(
  operador_id UUID,operador_usuario TEXT,operador_nome TEXT,setor_geral UUID,
  dia_referencia DATE,fora_vinculo BOOLEAN,total_recebido NUMERIC,total_pagamentos BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT dr.operador_id,COALESCE(op.usuario,dr.operador_usuario),op.nome,
         COALESCE(eq.setor_id,op.setor_id,imp.setor_id) AS setor_geral,
         dr.dia_referencia,
         (dr.prox_contato IS NOT NULL AND dr.prox_contato<=dr.dia_referencia),
         sum(dr.valor_recebido)::NUMERIC,count(*)::BIGINT
    FROM public.diario_recebimentos dr
    LEFT JOIN public.perfis op ON op.id=dr.operador_id
    LEFT JOIN public.equipes eq ON eq.id=op.equipe_id
    LEFT JOIN public.perfis imp ON imp.id=dr.importado_por_id
   WHERE dr.empresa_id=p_empresa_id
     AND dr.dia_referencia>=(p_mes||'-01')::DATE
     AND dr.dia_referencia<((p_mes||'-01')::DATE+interval '1 month')::DATE
     AND public.fn_contexto_dados_analiticos_permitido(
       p_contexto,p_empresa_id,dr.operador_id,COALESCE(eq.setor_id,op.setor_id,imp.setor_id)
     )
   GROUP BY dr.operador_id,COALESCE(op.usuario,dr.operador_usuario),op.nome,
            COALESCE(eq.setor_id,op.setor_id,imp.setor_id),dr.dia_referencia,
            (dr.prox_contato IS NOT NULL AND dr.prox_contato<=dr.dia_referencia);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_analitico_destaques_dia(
  p_empresa_id UUID,p_mes TEXT,p_equipe_id UUID DEFAULT NULL,p_setor_id UUID DEFAULT NULL
)
RETURNS TABLE(
  dia DATE,operador_id UUID,operador_usuario TEXT,operador_nome TEXT,
  total_recebido NUMERIC,total_pagamentos BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_tem_permissao('ver_analitico_destaques_dia',p_empresa_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT DISTINCT ON (daily.dia) daily.dia,daily.operador_id,
         daily.operador_usuario,op.nome,daily.total_recebido,daily.total_pagamentos
    FROM (
      SELECT ar.data_pagamento AS dia,ar.operador_id,ar.operador_usuario,
             sum(ar.valor_recebido)::NUMERIC AS total_recebido,count(*)::BIGINT AS total_pagamentos
        FROM public.analitico_recebimentos ar
        JOIN public.perfis pf ON pf.id=ar.operador_id
        LEFT JOIN public.equipes eq ON eq.id=pf.equipe_id
       WHERE ar.empresa_id=p_empresa_id AND ar.operador_id IS NOT NULL
         AND ar.data_pagamento>=(p_mes||'-01')::DATE
         AND ar.data_pagamento<((p_mes||'-01')::DATE+interval '1 month')::DATE
         AND public.fn_contexto_dados_analiticos_permitido(
           'analitico',p_empresa_id,ar.operador_id,COALESCE(ar.setor_id,eq.setor_id,pf.setor_id)
         )
         AND (p_equipe_id IS NULL OR pf.equipe_id=p_equipe_id OR EXISTS (
           SELECT 1 FROM public.equipe_operadores_clones c
            WHERE c.operador_id=ar.operador_id AND c.equipe_id=p_equipe_id
         ))
         AND (p_setor_id IS NULL OR eq.setor_id=p_setor_id OR EXISTS (
           SELECT 1 FROM public.equipe_operadores_clones c
           JOIN public.equipes ec ON ec.id=c.equipe_id
             WHERE c.operador_id=ar.operador_id AND ec.setor_id=p_setor_id
         ))
       GROUP BY ar.data_pagamento,ar.operador_id,ar.operador_usuario
    ) daily
    LEFT JOIN public.perfis op ON op.id=daily.operador_id
   ORDER BY daily.dia,daily.total_recebido DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_analitico_dashboard_mes_json(UUID,TEXT,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fn_analitico_dashboard_mes(UUID,TEXT,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fn_analitico_resumo_por_operador(UUID,TEXT,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fn_diario_resumo_mensal(UUID,TEXT,TEXT) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fn_analitico_destaques_dia(UUID,TEXT,UUID,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_dashboard_mes_json(UUID,TEXT,TEXT) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_analitico_dashboard_mes(UUID,TEXT,TEXT) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_analitico_resumo_por_operador(UUID,TEXT,TEXT) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_diario_resumo_mensal(UUID,TEXT,TEXT) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_analitico_destaques_dia(UUID,TEXT,UUID,UUID) TO authenticated,service_role;

-- Pix Automático: SELECT e configurações permanecem visualmente internos a
-- Acordos, mas usam apenas chaves Pix e continuam funcionando com Acordos off.
DROP POLICY IF EXISTS permissoes4_pix_select_gate ON public.pix_automatico_acordos;
CREATE POLICY permissoes4_pix_select_gate ON public.pix_automatico_acordos AS RESTRICTIVE FOR SELECT TO authenticated USING (
  public.fn_tem_permissao('ver_pix_automatico',empresa_id)
  AND public.fn_usuario_no_escopo_aba('pix_automatico',empresa_id,operador_id,public.fn_operador_setor_id(operador_id))
);
DROP POLICY IF EXISTS permissoes4_pix_lixeira_select_gate ON public.lixeira_pix_automatico;
CREATE POLICY permissoes4_pix_lixeira_select_gate ON public.lixeira_pix_automatico AS RESTRICTIVE FOR SELECT TO authenticated USING (
  public.fn_tem_permissao('ver_pix_automatico',empresa_id)
  AND public.fn_usuario_no_escopo_aba('pix_automatico',empresa_id,operador_id,public.fn_operador_setor_id(operador_id))
);
DROP POLICY IF EXISTS permissoes4_pix_log_select_gate ON public.pix_automatico_log;
CREATE POLICY permissoes4_pix_log_select_gate ON public.pix_automatico_log AS RESTRICTIVE FOR SELECT TO authenticated USING (
  public.fn_tem_permissao('ver_pix_automatico',empresa_id)
  AND public.fn_usuario_no_escopo_aba('pix_automatico',empresa_id,operador_id,public.fn_operador_setor_id(operador_id))
);
DROP POLICY IF EXISTS permissoes4_pix_config_write_gate ON public.pix_automatico_config;
CREATE POLICY permissoes4_pix_config_write_gate ON public.pix_automatico_config AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.fn_tem_permissao('editar_configuracoes_pix_automatico',empresa_id))
  WITH CHECK (public.fn_tem_permissao('editar_configuracoes_pix_automatico',empresa_id));
DROP POLICY IF EXISTS permissoes4_pix_metas_write_gate ON public.pix_automatico_metas;
CREATE POLICY permissoes4_pix_metas_write_gate ON public.pix_automatico_metas AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.fn_tem_permissao('editar_configuracoes_pix_automatico',empresa_id))
  WITH CHECK (public.fn_tem_permissao('editar_configuracoes_pix_automatico',empresa_id));

-- Comemorações e Campanha Fácil têm uma única chave liga/desliga.
CREATE OR REPLACE FUNCTION public.fn_comemoracao_pode_criar()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT public.fn_tem_permissao('ver_comemoracoes',public.fn_user_empresa_id()); $function$;

-- Provas de implantação: nenhuma função pública de escopo pode voltar a usar
-- as categorias globais removidas.
DO $verify$
DECLARE v_src TEXT;
BEGIN
  SELECT pg_get_functiondef('public.fn_usuario_no_escopo_aba(text,uuid,uuid,uuid)'::regprocedure) INTO v_src;
  IF v_src ~ 'ver_acordos_gerais|ver_todos_setores|filtrar_por_' THEN
    RAISE EXCEPTION 'Resolvedor por aba ainda depende de escopo global: %',v_src;
  END IF;
  SELECT string_agg(pg_get_functiondef(p.oid),E'\n') INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN (
     'fn_analitico_dashboard_mes','fn_analitico_dashboard_mes_json',
     'fn_analitico_resumo_por_operador','fn_diario_resumo_mensal'
   );
  IF v_src ~ 'ver_analiticos_global|ver_acordos_gerais|fn_user_has_any_role' THEN
    RAISE EXCEPTION 'RPC analítica ainda deriva alcance de permissão global ou cargo: %',v_src;
  END IF;
  IF v_src !~ 'p_contexto' OR v_src !~ 'fn_contexto_dados_analiticos_permitido' THEN
    RAISE EXCEPTION 'RPC analítica não está vinculada ao contexto da aba: %',v_src;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='acordos' AND policyname='permissoes4_acordos_select_gate' AND permissive='RESTRICTIVE') THEN
    RAISE EXCEPTION 'Policy restritiva de Acordos não foi criada';
  END IF;
END;
$verify$;

COMMIT;
