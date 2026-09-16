-- =============================================================================
-- Remover setor — só quando ele está zerado (16/09/2026)
-- =============================================================================
--
-- Pedido: «um botão para remover setor, em qualquer aba de setor. Não é
-- permitido excluir setores com equipes criadas, usuários naquele setor, só
-- os zerados.»
--
-- ## Por que não é um DELETE com policy
--
-- 44 colunas de 38 tabelas apontam para `setores`, e quase nenhuma recusa a
-- exclusão:
--
--   SET NULL .. acordos, analitico_recebimentos, diario_recebimentos, vendas,
--               tickets, perfis, perfis_transferencias, mestre_*, pix_*, ...
--   CASCADE ... equipes, contribuicao_receptivo, metas_validacoes,
--               relatorio_validacoes_dia, desafios, tv_*, ...
--
-- Um DELETE liberado por policy apagaria as equipes em cascata e soltaria do
-- setor, sem erro nenhum, todo acordo e todo recebimento que já passou por
-- ele. Os retratos dos meses fechados passariam a somar esse dinheiro em
-- «sem setor». Por isso a exclusão é uma RPC, e ela conta antes de apagar.
--
-- ## O que é «zerado»
--
-- A regra do pedido — nenhuma equipe, nenhum usuário — e mais uma, que o pedido
-- não disse e que a tabela acima obriga: **nenhum histórico**. Usuário conta
-- mesmo desligado e arquivado: o vínculo dele é o que diz de onde veio o
-- dinheiro dos meses em que trabalhou.
--
-- O histórico é descoberto em `pg_constraint`, e não numa lista escrita à mão:
-- tabela nova que aponte para `setores` amanhã já nasce protegida. O que NÃO
-- impede é a lista curta de CONFIGURAÇÃO do próprio setor — ela não tem sentido
-- sem ele e vai junto, pelo CASCADE que já existe:
--
--   analitico_ranking_config, analitico_exclusoes_setor, comissao_config,
--   desafios_setores, pix_automatico_config, rh_config_setores
--
-- `metas` (tipo = 'setor') não tem FK — `referencia_id` serve a setor, equipe e
-- operador. As metas do setor são apagadas junto, explicitamente, para não
-- ficarem órfãs.
--
-- ## Quem pode
--
-- As chaves que já governam a aba: `ver_setores` + `setores_criar_editar`,
-- dentro da empresa. Sem chave nova — acrescentar uma exigiria encostar na
-- cadeia de `fn_permissoes_catalogo()`, que já se partiu uma vez aqui.
--
-- Medido em 16/09/2026, antes de aplicar: 18 setores nas três empresas, e um só
-- zerado (`teste`, no Comercial), sem nenhuma linha em nenhuma das 44 colunas.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_setor_impedimentos_exclusao(p_setor_id UUID)
RETURNS TABLE (motivo TEXT, quantidade BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- Configuração do próprio setor: vai junto com ele, não impede.
  c_config CONSTANT TEXT[] := ARRAY[
    'public.analitico_ranking_config',
    'public.analitico_exclusoes_setor',
    'public.comissao_config',
    'public.desafios_setores',
    'public.pix_automatico_config',
    'public.rh_config_setores'
  ];
  v_empresa UUID;
  v_fk      RECORD;
  v_qtd     BIGINT;
  v_rotulo  TEXT;
BEGIN
  SELECT s.empresa_id INTO v_empresa FROM public.setores s WHERE s.id = p_setor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Setor não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.fn_can_access_empresa(v_empresa) AND public.fn_user_tem('ver_setores')) THEN
    RAISE EXCEPTION 'Seu cargo não enxerga os setores desta empresa.' USING ERRCODE = '42501';
  END IF;

  -- As duas regras do pedido, com nome próprio: são as que a tela explica.
  SELECT count(*) INTO v_qtd FROM public.equipes q WHERE q.setor_id = p_setor_id;
  IF v_qtd > 0 THEN
    motivo := CASE WHEN v_qtd = 1 THEN 'equipe criada' ELSE 'equipes criadas' END;
    quantidade := v_qtd;
    RETURN NEXT;
  END IF;

  SELECT count(*) INTO v_qtd FROM public.perfis p
   WHERE p.setor_id = p_setor_id AND COALESCE(p.arquivado, false) = false;
  IF v_qtd > 0 THEN
    motivo := CASE WHEN v_qtd = 1 THEN 'usuário no setor' ELSE 'usuários no setor' END;
    quantidade := v_qtd;
    RETURN NEXT;
  END IF;

  -- Desligados arquivados não aparecem na contagem da aba, e por isso ganham
  -- motivo separado: sem ele a tela diria «0 pessoas» e recusaria sem explicar.
  SELECT count(*) INTO v_qtd FROM public.perfis p
   WHERE p.setor_id = p_setor_id AND COALESCE(p.arquivado, false) = true;
  IF v_qtd > 0 THEN
    motivo := CASE WHEN v_qtd = 1 THEN 'desligado arquivado com vínculo' ELSE 'desligados arquivados com vínculo' END;
    quantidade := v_qtd;
    RETURN NEXT;
  END IF;

  -- Todo o resto que aponta para `setores`, descoberto no catálogo. Uma tabela
  -- com duas colunas (origem e destino, por exemplo) é uma pergunta só.
  FOR v_fk IN
    SELECT c.conrelid::regclass::text AS tabela,
           array_agg(DISTINCT a.attname::text) AS colunas
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.setores'::regclass
       AND c.conrelid NOT IN ('public.equipes'::regclass, 'public.perfis'::regclass)
       AND c.conrelid::regclass::text <> ALL (c_config)
     GROUP BY c.conrelid
     ORDER BY 1
  LOOP
    -- LIMIT 1000: para impedir basta existir, e o número é só para a mensagem.
    EXECUTE format(
      'SELECT count(*) FROM (SELECT 1 FROM %s WHERE %s LIMIT 1000) x',
      v_fk.tabela,
      (SELECT string_agg(format('%I = $1', col), ' OR ') FROM unnest(v_fk.colunas) AS col)
    ) INTO v_qtd USING p_setor_id;

    IF v_qtd > 0 THEN
      v_rotulo := CASE replace(v_fk.tabela, 'public.', '')
        WHEN 'acordos'                     THEN 'acordos'
        WHEN 'analitico_recebimentos'      THEN 'recebimentos do relatório analítico'
        WHEN 'analitico_ajustes_manuais'   THEN 'ajustes manuais de recebimento'
        WHEN 'analitico_colchao_fora_meta' THEN 'linhas do colchão do analítico'
        WHEN 'diario_recebimentos'         THEN 'recebimentos do relatório diário'
        WHEN 'mestre_recebimentos'         THEN 'recebimentos do relatório 59'
        WHEN 'mestre_grupos'               THEN 'carteiras do relatório 59'
        WHEN 'mestre_equipes'              THEN 'equipes do relatório 59'
        WHEN 'vendas'                      THEN 'vendas'
        WHEN 'vendas_franquias'            THEN 'franquias vinculadas'
        WHEN 'indicacoes'                  THEN 'indicações'
        WHEN 'tickets'                     THEN 'tickets'
        WHEN 'perfis_transferencias'       THEN 'transferências de pessoas'
        WHEN 'contribuicao_receptivo'      THEN 'lançamentos de contribuição do Receptivo'
        WHEN 'metas_validacoes'            THEN 'validações de meta'
        WHEN 'relatorio_validacoes_dia'    THEN 'validações diárias do relatório'
        WHEN 'desafios'                    THEN 'desafios do setor'
        WHEN 'comemoracoes'                THEN 'comemorações'
        WHEN 'solicitacoes_whatsapp'       THEN 'solicitações de atendimento'
        WHEN 'autorizacoes_pedidos'        THEN 'pedidos de autorização'
        WHEN 'pet_recompensas'             THEN 'recompensas do pet'
        WHEN 'tv_telas'                    THEN 'telas do Modo TV'
        WHEN 'tv_cenas'                    THEN 'cenas do Modo TV'
        WHEN 'tv_alertas'                  THEN 'alertas do Modo TV'
        WHEN 'tv_sorteios'                 THEN 'sorteios do Modo TV'
        WHEN 'numeros_celulares'           THEN 'celulares do Controle de Números'
        WHEN 'numeros_whatsapp'            THEN 'números do Controle de Números'
        WHEN 'numeros_config'              THEN 'configuração do Controle de Números'
        WHEN 'pix_automatico_acordos'      THEN 'acordos de Pix automático'
        WHEN 'pix_automatico_metas'        THEN 'metas de Pix automático'
        WHEN 'pix_automatico_saldos'       THEN 'saldos de Pix automático'
        WHEN 'pix_automatico_nr_pedidos'   THEN 'pedidos de NR do Pix automático'
        WHEN 'pix_automatico_nr_pedido_aprovacoes' THEN 'aprovações de NR do Pix automático'
        ELSE replace(v_fk.tabela, 'public.', '')
      END;
      motivo := v_rotulo;
      quantidade := v_qtd;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_setor_impedimentos_exclusao(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_setor_impedimentos_exclusao(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_setor_impedimentos_exclusao(UUID) IS
  'O que impede remover o setor: equipes, usuários (inclusive arquivados) e '
  'qualquer histórico que aponte para ele, exceto a configuração do próprio '
  'setor. Vazio = zerado. Ver 20260916100000.';


CREATE OR REPLACE FUNCTION public.fn_setor_excluir(p_setor_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa  UUID;
  v_motivos  TEXT;
BEGIN
  -- FOR UPDATE antes de contar: quem cria equipe ou move alguém para este
  -- setor precisa de KEY SHARE nesta linha para checar a FK, e espera aqui.
  -- Quando passar, o setor já não existe e a FK recusa — não há janela entre
  -- «contei zero» e «apaguei».
  SELECT s.empresa_id INTO v_empresa
    FROM public.setores s WHERE s.id = p_setor_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Setor não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.fn_can_access_empresa(v_empresa)
    AND public.fn_user_tem('ver_setores')
    AND public.fn_user_tem('setores_criar_editar')
  ) THEN
    RAISE EXCEPTION 'Seu cargo não pode remover setores.' USING ERRCODE = '42501';
  END IF;

  SELECT string_agg(i.quantidade || ' ' || i.motivo, ', ')
    INTO v_motivos
    FROM public.fn_setor_impedimentos_exclusao(p_setor_id) i;

  IF v_motivos IS NOT NULL THEN
    RAISE EXCEPTION 'Só setores zerados podem ser removidos. Este tem: %.', v_motivos
      USING ERRCODE = '23503';
  END IF;

  -- `metas.referencia_id` não tem FK (serve a setor, equipe e operador).
  DELETE FROM public.metas m
   WHERE m.tipo = 'setor' AND m.referencia_id = p_setor_id AND m.empresa_id = v_empresa;

  -- A configuração do setor sai pelo CASCADE das próprias FKs.
  DELETE FROM public.setores s WHERE s.id = p_setor_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_setor_excluir(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_setor_excluir(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_setor_excluir(UUID) IS
  'Remove o setor se e somente se fn_setor_impedimentos_exclusao vier vazia. '
  'Exige ver_setores + setores_criar_editar na empresa. Ver 20260916100000.';
