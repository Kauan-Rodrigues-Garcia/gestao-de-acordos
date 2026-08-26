-- ============================================================================
-- Chat: alcance por cargo e lista de contatos previsivel
--
-- A migration NAO altera conversas existentes. As novas chaves recortam apenas
-- quem aparece para INICIAR conversa ou disparo. Responder uma conversa que ja
-- existe continua seguindo a regra anterior.
--
-- As nove chaves nascem ligadas nas linhas existentes para que aplicar esta
-- migration, sozinho, nao retire contato de ninguem. O administrador passa a
-- poder desligar os cargos desejados pelo painel.
-- ============================================================================

-- ── Catalogo completo, incluindo os nove cargos-alvo ────────────────────────

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  WITH atalhos AS (
    SELECT
      ARRAY['lider','elite','gerencia','diretoria']::TEXT[] AS lideranca,
      ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[] AS todos,
      ARRAY['gerencia','diretoria']::TEXT[] AS cupula,
      ARRAY[]::TEXT[] AS ninguem
  )
  SELECT t.* FROM atalhos, LATERAL (VALUES
    -- Abas e telas
    ('ver_acordos',                 ARRAY['bookplay'],  todos,     false),
    ('ver_analitico',               NULL::TEXT[],       todos,     false),
    ('ver_painel_lider',            NULL::TEXT[],       lideranca, false),
    ('ver_painel_diretoria',        NULL::TEXT[],       ARRAY['diretoria'], false),
    ('ver_ouvidoria',               ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('ver_campanha_facil',          ARRAY['bookplay'],  lideranca, false),
    ('ver_solicitacoes_whatsapp',   NULL::TEXT[],       todos,     false),
    ('ver_pix_automatico',          ARRAY['bookplay'],  todos,     false),
    ('ver_tickets',                 NULL::TEXT[],       ARRAY['lider','elite','gerencia','diretoria','ouvidoria'], false),
    ('ver_lixeira',                 NULL::TEXT[],       todos,     false),
    ('ver_logs',                    NULL::TEXT[],       ninguem,   false),
    ('ver_configuracoes',           NULL::TEXT[],       ninguem,   false),
    ('ver_monitoramento_uso',       NULL::TEXT[],       ninguem,   false),
    ('ver_banco_dados',             NULL::TEXT[],       ninguem,   false),
    -- Acordos
    ('acordos_escopo_individual',    ARRAY['bookplay'], todos,     false),
    ('acordos_escopo_equipe',        ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('acordos_escopo_setor',         ARRAY['bookplay'], lideranca, false),
    ('acordos_escopo_todos_setores', ARRAY['bookplay'], cupula,    false),
    ('criar_acordos',               NULL::TEXT[],       todos,     false),
    ('editar_acordos',              NULL::TEXT[],       todos,     false),
    ('excluir_acordos',             NULL::TEXT[],       todos,     false),
    ('excluir_em_lote',             NULL::TEXT[],       lideranca, false),
    ('acordos_autorizar_tabulacao', NULL::TEXT[],       lideranca, false),
    ('acordos_capturar_erp',        ARRAY['pagueplay'], ninguem,   false),
    ('acordos_campos_admin',        ARRAY['bookplay'],  ninguem,   false),
    -- Importacoes
    ('importar_excel',              NULL::TEXT[],       todos,     false),
    ('importar_analitico',          NULL::TEXT[],       lideranca, false),
    ('importar_diario',             NULL::TEXT[],       lideranca, false),
    -- Gestao de pessoas
    ('ver_usuarios',                NULL::TEXT[],       lideranca, false),
    ('ver_equipes',                 NULL::TEXT[],       lideranca, false),
    ('ver_operadores',              NULL::TEXT[],       lideranca, false),
    ('usuarios_escopo_setor',         NULL::TEXT[], todos, false),
    ('usuarios_escopo_todos_setores', NULL::TEXT[], ARRAY['gerencia','diretoria','ouvidoria'], false),
    ('ver_metas',                   NULL::TEXT[],       lideranca, false),
    ('usuarios_administrar',         NULL::TEXT[], ninguem, false),
    ('usuarios_editar_do_setor',     NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('usuarios_transferir',          NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria'], false),
    ('usuarios_ver_administradores',    NULL::TEXT[], ninguem, false),
    ('usuarios_desfazer_transferencia', NULL::TEXT[], ninguem, false),
    ('equipes_criar_editar',         NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('equipes_excluir',              NULL::TEXT[], ninguem, false),
    ('equipes_gerenciar_composicao', NULL::TEXT[], ARRAY['lider','gerencia'], false),
    ('metas_editar',                 NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('metas_excluir',                NULL::TEXT[], ninguem, false),
    ('metas_editar_dias_uteis',      NULL::TEXT[], ARRAY['lider'], false),
    ('metas_excluir_dias_uteis',     NULL::TEXT[], ninguem, false),
    ('acesso_multiempresa_permitido', NULL::TEXT[], cupula, false),
    ('filtrar_por_usuario',         NULL::TEXT[],       lideranca, false),
    -- Pix Automatico
    ('pix_escopo_individual',        ARRAY['bookplay'], todos,     false),
    ('pix_escopo_equipe',            ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_escopo_setor',             ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_escopo_todos_setores',     ARRAY['bookplay'], ARRAY['gerencia'], false),
    ('pix_editar_configuracoes',     ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_ajustar_saldo',            ARRAY['bookplay'], ARRAY['lider','elite','gerencia'], false),
    -- Painel Diretoria
    ('painel_diretoria_escopo_setor',         NULL::TEXT[], ARRAY['gerencia'],  false),
    ('painel_diretoria_escopo_todos_setores', NULL::TEXT[], ARRAY['diretoria'], false),
    -- Acoes especificas
    ('administrar_sistema',    NULL::TEXT[], ninguem, false),
    ('comemoracoes_gerenciar', NULL::TEXT[], ARRAY['diretoria'], false),
    ('editar_ouvidoria',            ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('gerenciar_acessos_ouvidoria', ARRAY['pagueplay'], ninguem,   false),
    ('ouvidoria_responsavel',       ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('criar_solicitacao_whatsapp',  NULL::TEXT[],       todos,     false),
    ('aprovar_pix_automatico',      ARRAY['bookplay'],  lideranca, false),
    ('ignorar_fechamento_mes',      NULL::TEXT[],       ninguem,   true),
    ('tickets_administrar',         NULL::TEXT[],       ninguem,   false),
    ('tickets_abrir',               NULL::TEXT[],       ARRAY['lider','elite','gerencia','diretoria','ouvidoria'], false),
    -- Lixeira
    ('lixeira_escopo_individual',    NULL::TEXT[], todos,     false),
    ('lixeira_escopo_equipe',        NULL::TEXT[], lideranca, false),
    ('lixeira_escopo_setor',         NULL::TEXT[], lideranca, false),
    ('lixeira_escopo_todos_setores', NULL::TEXT[], cupula,    false),
    ('lixeira_restaurar',            NULL::TEXT[], todos,     false),
    ('lixeira_limpar',               NULL::TEXT[], todos,     false),
    -- Painel Lider
    ('painel_lider_escopo_setor',            NULL::TEXT[], lideranca, false),
    ('painel_lider_escopo_todos_setores',    NULL::TEXT[], ARRAY['diretoria'], false),
    ('painel_lider_sub_acompanhamento',      NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_desempenho_equipes',  NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_quartis',             NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_grafico_recebimento', NULL::TEXT[], lideranca, false),
    -- Dashboard
    ('dashboard_escopo_individual',    NULL::TEXT[], todos,     false),
    ('dashboard_escopo_equipe',        NULL::TEXT[], lideranca, false),
    ('dashboard_escopo_setor',         NULL::TEXT[], lideranca, false),
    ('dashboard_escopo_todos_setores', NULL::TEXT[], cupula,    false),
    -- Analitico
    ('analitico_escopo_individual',      NULL::TEXT[], ARRAY['operador','elite'], false),
    ('analitico_escopo_setor',           NULL::TEXT[], ARRAY['lider','elite','gerencia','ouvidoria','diretoria'], false),
    ('analitico_escopo_todos_setores',   NULL::TEXT[], cupula,    false),
    ('analitico_sub_analitico',          NULL::TEXT[], todos,     false),
    ('analitico_sub_recebimento_diario', NULL::TEXT[], todos,     false),
    ('analitico_sub_colchao',            NULL::TEXT[], todos,     false),
    ('analitico_sub_desafios',           NULL::TEXT[], todos,     false),
    ('analitico_sub_por_operador',       NULL::TEXT[], todos,     false),
    ('analitico_sub_formas_pagamento',   NULL::TEXT[], todos,     false),
    ('analitico_sub_ranking',            NULL::TEXT[], todos,     false),
    ('analitico_sub_destaques_dia',      NULL::TEXT[], todos,     false),
    ('analitico_sub_sem_operador',       NULL::TEXT[], todos,     false),
    ('analitico_validar_relatorio',      NULL::TEXT[], ninguem,   false),
    -- RH Gestao
    ('ver_rh_gestao',             NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','rh'], false),
    ('rh_escopo_equipe',          NULL::TEXT[], ARRAY['lider','elite'], false),
    ('rh_escopo_setor',           NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_escopo_todos_setores',   NULL::TEXT[], ARRAY['diretoria','rh'], false),
    ('rh_preencher',              NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('rh_validar',                NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_enviar',                 NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_aprovar',                NULL::TEXT[], ARRAY['gerencia','rh'], false),
    ('rh_devolver',               NULL::TEXT[], ARRAY['gerencia','rh'], false),
    ('rh_dispensar',              NULL::TEXT[], ARRAY['lider','elite','gerencia','rh'], false),
    ('rh_gerenciar_fechamento',   NULL::TEXT[], ARRAY['rh'], false),
    ('rh_reabrir_fechamento',     NULL::TEXT[], ninguem,   true),
    ('rh_configurar',             NULL::TEXT[], ARRAY['rh'], false),
    ('rh_editar_cracha',          NULL::TEXT[], ARRAY['rh'], false),
    -- Ajuste manual e desafios
    ('painel_lider_sub_ajuste_recebimento', NULL::TEXT[], lideranca, false),
    ('ajuste_recebimento_lancar',           NULL::TEXT[], lideranca, false),
    ('ajuste_recebimento_administrar',      NULL::TEXT[], ninguem,   false),
    ('desafios_configurar',                 NULL::TEXT[], ninguem,   false),
    ('desafios_configurar_setor',           NULL::TEXT[], lideranca, false),
    -- Chat interno
    ('ver_chat',                  NULL::TEXT[], ninguem, false),
    ('chat_escopo_equipe',        NULL::TEXT[], ninguem, false),
    ('chat_escopo_setor',         NULL::TEXT[], ninguem, false),
    ('chat_escopo_todos_setores', NULL::TEXT[], ninguem, false),
    -- Por padrao todos os cargos editaveis continuam falando com todos.
    -- O recorte so muda quando o administrador desliga um destes botoes.
    ('chat_cargo_operador',      NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh'], false),
    ('chat_cargo_lider',         NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh'], false),
    ('chat_cargo_elite',         NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh'], false),
    ('chat_cargo_gerencia',      NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh'], false),
    ('chat_cargo_diretoria',     NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh'], false),
    ('chat_cargo_ouvidoria',     NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh'], false),
    ('chat_cargo_rh',            NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh'], false),
    ('chat_cargo_administrador', NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh'], false),
    ('chat_cargo_super_admin',   NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh'], false)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

-- ── Compatibilidade: aplicar nao corta contatos existentes ──────────────────

WITH chaves(chave) AS (
  SELECT unnest(ARRAY[
    'chat_cargo_operador', 'chat_cargo_lider', 'chat_cargo_elite',
    'chat_cargo_gerencia', 'chat_cargo_diretoria', 'chat_cargo_ouvidoria',
    'chat_cargo_rh', 'chat_cargo_administrador', 'chat_cargo_super_admin'
  ]::TEXT[])
)
UPDATE public.cargos_permissoes AS cp
   SET permissoes = cp.permissoes || COALESCE((
     SELECT jsonb_object_agg(c.chave, TRUE)
       FROM chaves c
      WHERE NOT cp.permissoes ? c.chave
   ), '{}'::JSONB)
 WHERE EXISTS (SELECT 1 FROM chaves c WHERE NOT cp.permissoes ? c.chave);

-- ── Alcance: empresa + setor/equipe + cargo de destino ──────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_alcanca(p_alvo UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p_alvo <> (SELECT auth.uid())
     AND public.fn_chat_pode_usar()
     AND public.fn_chat_pode_usar(p_alvo)
     AND EXISTS (
       SELECT 1
         FROM public.perfis b
        WHERE b.id = p_alvo
          AND public.fn_can_access_empresa(b.empresa_id)
          AND (
            public.fn_user_is_super_admin()
            OR public.fn_user_tem('chat_cargo_' || b.perfil)
          )
     )
     AND (
       public.fn_user_is_super_admin()
       OR public.fn_user_tem('chat_escopo_todos_setores')
       OR (public.fn_user_tem('chat_escopo_setor') AND EXISTS (
             SELECT 1 FROM public.fn_setores_do_operador((SELECT auth.uid())) meu
             WHERE meu IN (SELECT public.fn_setores_do_operador(p_alvo))))
       OR (public.fn_user_tem('chat_escopo_equipe') AND EXISTS (
             SELECT 1 FROM public.fn_equipes_do_operador((SELECT auth.uid())) minha
             WHERE minha.equipe_id IN (
               SELECT e.equipe_id FROM public.fn_equipes_do_operador(p_alvo) e
             )))
     );
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_alcanca(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_alcanca(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_alcanca(UUID) IS
  'Consigo INICIAR conversa com esta pessoa? Exige empresa acessivel, alcance '
  'de equipe/setor e permissao para o cargo do destino. Conversa existente '
  'continua respondivel para nao quebrar historico.';

-- ── Disparo sempre respeita o alcance atual ─────────────────────────────────
--
-- A RPC anterior deixava uma conversa existente furar fn_chat_alcanca. Isso
-- continua correto para uma RESPOSTA individual, mas nao para um disparo em
-- massa: seria possivel esconder Operador da lista e ainda inclui-lo enviando
-- o UUID manualmente. Aqui o servidor confere cada destino, sempre.

CREATE OR REPLACE FUNCTION public.fn_chat_disparar(
  p_destinos UUID[],
  p_texto    TEXT,
  p_anexos   JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu       UUID := (SELECT auth.uid());
  v_empresa  UUID;
  v_disparo  UUID;
  v_alvo     UUID;
  v_conversa UUID;
  v_menor    UUID;
  v_maior    UUID;
  v_aparecia BOOLEAN;
  v_msg      UUID;
  v_enviados INTEGER := 0;
  v_pulados  UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'sem_sessao'; END IF;
  IF NOT public.fn_chat_pode_usar() THEN RAISE EXCEPTION 'sem_chat'; END IF;

  IF COALESCE(TRIM(p_texto), '') = ''
     AND jsonb_array_length(COALESCE(p_anexos, '[]'::JSONB)) = 0 THEN
    RAISE EXCEPTION 'mensagem_vazia';
  END IF;

  SELECT p.empresa_id INTO v_empresa
    FROM public.perfis p
   WHERE p.id = v_eu;

  INSERT INTO public.chat_disparos (empresa_id, autor_id, texto, anexos)
  VALUES (v_empresa, v_eu, NULLIF(TRIM(p_texto), ''),
          COALESCE(p_anexos, '[]'::JSONB))
  RETURNING id INTO v_disparo;

  FOREACH v_alvo IN ARRAY COALESCE(p_destinos, ARRAY[]::UUID[]) LOOP
    CONTINUE WHEN v_alvo IS NULL OR v_alvo = v_eu;

    -- Inclui conversa existente: disparo e uma NOVA iniciativa em massa e
    -- precisa obedecer ao painel atual. Resposta 1:1 continua fora desta RPC.
    IF NOT public.fn_chat_alcanca(v_alvo) THEN
      v_pulados := v_pulados || v_alvo;
      CONTINUE;
    END IF;

    v_menor := LEAST(v_eu, v_alvo);
    v_maior := GREATEST(v_eu, v_alvo);

    SELECT c.id INTO v_conversa
      FROM public.chat_conversas c
     WHERE c.empresa_id = v_empresa
       AND c.par_menor = v_menor
       AND c.par_maior = v_maior;

    IF v_conversa IS NULL THEN
      INSERT INTO public.chat_conversas (empresa_id, par_menor, par_maior)
      VALUES (v_empresa, v_menor, v_maior)
      ON CONFLICT (empresa_id, par_menor, par_maior) DO NOTHING
      RETURNING id INTO v_conversa;

      IF v_conversa IS NULL THEN
        SELECT c.id INTO v_conversa
          FROM public.chat_conversas c
         WHERE c.empresa_id = v_empresa
           AND c.par_menor = v_menor
           AND c.par_maior = v_maior;
      END IF;

      INSERT INTO public.chat_participantes (conversa_id, perfil_id)
      VALUES (v_conversa, v_menor), (v_conversa, v_maior)
      ON CONFLICT DO NOTHING;
    END IF;

    SELECT (
      pa.apagada_em IS NULL
      AND pa.oculta_em IS NULL
      AND (
        SELECT c.ultima_mensagem_em
          FROM public.chat_conversas c
         WHERE c.id = v_conversa
      ) IS NOT NULL
    )
      INTO v_aparecia
      FROM public.chat_participantes pa
     WHERE pa.conversa_id = v_conversa
       AND pa.perfil_id = v_eu;

    INSERT INTO public.chat_mensagens (
      conversa_id, empresa_id, autor_id, texto, anexos, disparo_id
    )
    VALUES (
      v_conversa, v_empresa, v_eu, NULLIF(TRIM(p_texto), ''),
      COALESCE(p_anexos, '[]'::JSONB), v_disparo
    )
    RETURNING id INTO v_msg;

    IF NOT COALESCE(v_aparecia, FALSE) THEN
      UPDATE public.chat_participantes
         SET oculta_em = NOW()
       WHERE conversa_id = v_conversa
         AND perfil_id = v_eu;
    END IF;

    INSERT INTO public.chat_disparo_destinos (
      disparo_id, perfil_id, conversa_id, mensagem_id
    )
    VALUES (v_disparo, v_alvo, v_conversa, v_msg)
    ON CONFLICT DO NOTHING;

    v_enviados := v_enviados + 1;
  END LOOP;

  UPDATE public.chat_disparos
     SET total_destinos = v_enviados
   WHERE id = v_disparo;

  RETURN jsonb_build_object(
    'disparo_id', v_disparo,
    'enviados', v_enviados,
    'pulados', to_jsonb(v_pulados)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_disparar(UUID[], TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_disparar(UUID[], TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_disparar(UUID[], TEXT, JSONB) IS
  'Disparo em massa com texto e/ou anexos. Cada destino precisa estar no '
  'alcance atual de empresa, setor/equipe e cargo; recusados voltam em pulados.';

-- ── Contatos: mesma autorizacao, lideres primeiro dentro de cada grupo ───────

CREATE OR REPLACE FUNCTION public.fn_chat_contatos()
RETURNS TABLE (
  perfil_id     UUID,
  nome          TEXT,
  usuario       TEXT,
  foto_url      TEXT,
  cargo         TEXT,
  setor_id      UUID,
  setor_nome    TEXT,
  equipe_id     UUID,
  equipe_nome   TEXT,
  empresa_slug  TEXT,
  multiempresa  BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT contatos.*
    FROM (
      SELECT DISTINCT
             p.id AS perfil_id, p.nome, p.usuario, p.foto_url,
             p.perfil::TEXT AS cargo,
             s.id AS setor_id, s.nome AS setor_nome,
             e.id AS equipe_id, e.nome AS equipe_nome,
             emp.slug AS empresa_slug,
             (p.perfil = 'super_admin' OR COALESCE(p.acesso_multiempresa, FALSE))
               AS multiempresa
        FROM public.perfis p
        LEFT JOIN public.equipes e ON e.id IN (
          SELECT q.equipe_id FROM public.fn_equipes_do_operador(p.id) q
        )
        LEFT JOIN public.setores s ON s.id = COALESCE(e.setor_id, p.setor_id)
        LEFT JOIN public.empresas emp ON emp.id = p.empresa_id
       WHERE COALESCE(p.ativo, TRUE)
         AND NOT COALESCE(p.arquivado, FALSE)
         AND p.id <> (SELECT auth.uid())
         AND public.fn_chat_alcanca(p.id)
    ) AS contatos
   ORDER BY contatos.multiempresa, contatos.setor_nome, contatos.equipe_nome,
            (contatos.cargo = 'lider') DESC, contatos.nome;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_contatos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_contatos() TO authenticated;

COMMENT ON FUNCTION public.fn_chat_contatos() IS
  'Pessoas com quem posso iniciar conversa, filtradas tambem pelo cargo-alvo. '
  'Dentro de setor/equipe, lideres aparecem primeiro.';
