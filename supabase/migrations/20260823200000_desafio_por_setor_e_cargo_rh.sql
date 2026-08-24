-- ============================================================================
-- 20260823200000_desafio_por_setor_e_cargo_rh.sql
--
-- Quatro coisas, e as quatro sao a mesma frase dita de jeitos diferentes: quem
-- responde por um setor precisa poder trabalhar nele sem depender do
-- administrador.
--
--   1. **Desafio do proprio setor.** Lider e gerente criam, editam e preenchem
--      a campanha do setor deles. Hoje `desafios_configurar` e tudo-ou-nada e
--      nasce so para a administracao.
--
--   2. **O cargo RH.** O modulo RH Gestao existe desde 20260823090000, mas nao
--      havia um cargo para quem trabalha nele — so `gerencia` emprestada.
--
--   3. **A gerencia aprova.** `rh_aprovar` e `rh_devolver` nasciam em
--      `ninguem`. O fluxo pedido e: o lider preenche, o gerente aprova, e o
--      devolvido volta notificado para quem preencheu.
--
--   4. **Quem nao bateu a meta nao trava a equipe.** `fn_rh_concluir_equipe`
--      exige valor em TODO MUNDO. Operador que nao atingiu nao vai receber
--      premiacao — nao ha valor para digitar, e ele segurava a equipe inteira.
--
-- ## Ordem
--
-- Esta migration mexe em `fn_rh_concluir_equipe`, definida em
-- `20260823091000_rh_gestao_fluxo.sql`. Aplique a 091000 ANTES desta.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ════════════════════════════════════════════════════════════════════════════
-- 1. O DESAFIO GANHA DONO
-- ════════════════════════════════════════════════════════════════════════════
--
-- `setor_id` NULO = campanha da empresa (o Cafe no IBIS de hoje), configurada
-- pela administracao. Preenchido = campanha DAQUELE setor: o lider dele
-- configura, e os outros setores nem a enxergam.
--
-- Coluna, e nao uma leitura de `regra.participantes.setores`: e a RLS que
-- precisa da resposta, e uma policy que abre JSONB para decidir permissao e
-- uma policy que ninguem vai conseguir ler daqui a um ano.

ALTER TABLE public.desafios
  ADD COLUMN IF NOT EXISTS setor_id UUID REFERENCES public.setores(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.desafios.setor_id IS
  'Setor dono da campanha. NULO = campanha da empresa inteira. Ver 20260823200000.';

CREATE INDEX IF NOT EXISTS idx_desafios_setor
  ON public.desafios (empresa_id, setor_id, status);

-- ── SELECT: campanha de setor nao aparece para os outros setores ───────────
DROP POLICY IF EXISTS desafios_select ON public.desafios;
CREATE POLICY desafios_select ON public.desafios
  FOR SELECT TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      status <> 'rascunho'
      OR public.fn_user_tem('desafios_configurar')
      OR public.fn_user_tem('desafios_configurar_setor')
    )
    AND (
      -- Campanha da empresa: de todo mundo.
      setor_id IS NULL
      -- Campanha de setor: de quem e do setor...
      OR setor_id = public.fn_user_setor_id()
      -- ...e de quem enxerga alem do proprio setor. Nao e privilegio novo: e a
      -- mesma regua do Analitico, e sem ela a diretoria perderia de vista as
      -- campanhas que ela e quem precisa acompanhar.
      OR public.fn_user_tem('analitico_escopo_todos_setores')
      OR public.fn_user_tem('desafios_configurar')
    )
  );

-- ── INSERT e UPDATE: administracao em qualquer uma, lideranca na do setor ──
--
-- A conferencia de setor esta nas DUAS pontas do UPDATE (`USING` e
-- `WITH CHECK`) de proposito: sem o `WITH CHECK`, um lider poderia pegar a
-- campanha do proprio setor e reescrever `setor_id` para outro — passaria pelo
-- `USING`, que olha a linha ANTIGA.

DROP POLICY IF EXISTS desafios_insert ON public.desafios;
CREATE POLICY desafios_insert ON public.desafios
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND criado_por = auth.uid()
    AND (
      public.fn_user_tem('desafios_configurar')
      OR (
        public.fn_user_tem('desafios_configurar_setor')
        AND setor_id IS NOT NULL
        AND setor_id = public.fn_user_setor_id()
      )
    )
  );

DROP POLICY IF EXISTS desafios_update ON public.desafios;
CREATE POLICY desafios_update ON public.desafios
  FOR UPDATE TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      public.fn_user_tem('desafios_configurar')
      OR (
        public.fn_user_tem('desafios_configurar_setor')
        AND setor_id IS NOT NULL
        AND setor_id = public.fn_user_setor_id()
      )
    )
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      public.fn_user_tem('desafios_configurar')
      OR (
        public.fn_user_tem('desafios_configurar_setor')
        AND setor_id IS NOT NULL
        AND setor_id = public.fn_user_setor_id()
      )
    )
  );

-- ── `fn_desafio_dados` aceita quem configura so o proprio setor ────────────
-- O corpo e o de 20260823190000; muda a linha do rascunho, que agora reconhece
-- a chave nova. Sem isto o lider criaria um rascunho e nao conseguiria ver o
-- proprio ranking de teste.
CREATE OR REPLACE FUNCTION public.fn_desafio_dados(p_desafio_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $dados$
DECLARE
  v_desafio  public.desafios%ROWTYPE;
  v_linhas   JSONB;
BEGIN
  SELECT * INTO v_desafio FROM public.desafios WHERE id = p_desafio_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT public.fn_can_access_empresa(v_desafio.empresa_id) THEN
    RETURN NULL;
  END IF;

  IF v_desafio.status = 'rascunho'
     AND NOT public.fn_user_tem('desafios_configurar')
     AND NOT public.fn_user_tem('desafios_configurar_setor') THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(t), '[]'::JSONB)
    INTO v_linhas
    FROM (
      SELECT
        ar.operador_id,
        COALESCE(ar.setor_id, imp.setor_id) AS setor_id,
        SUM(ar.valor_recebido)::NUMERIC     AS total,
        SUM(ar.total_ho)::NUMERIC           AS total_ho,
        COUNT(*)::BIGINT                    AS qtd
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis imp ON imp.id = ar.importado_por_id
      WHERE ar.empresa_id     = v_desafio.empresa_id
        AND ar.operador_id   IS NOT NULL
        AND ar.data_pagamento BETWEEN v_desafio.data_inicio AND v_desafio.data_fim
      GROUP BY ar.operador_id, COALESCE(ar.setor_id, imp.setor_id)
    ) t;

  RETURN jsonb_build_object(
    'participantes', public.fn_desafio_pessoas_interna(v_desafio.empresa_id),
    'linhas',        v_linhas
  );
END;
$dados$;

-- Quem monta a campanha do setor tambem precisa do quadro de pessoal.
CREATE OR REPLACE FUNCTION public.fn_desafio_pessoas(p_empresa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $lista$
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN '[]'::JSONB;
  END IF;
  IF NOT public.fn_user_tem('desafios_configurar')
     AND NOT public.fn_user_tem('desafios_configurar_setor') THEN
    RETURN '[]'::JSONB;
  END IF;
  RETURN public.fn_desafio_pessoas_interna(p_empresa_id);
END;
$lista$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. O CARGO RH
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ele entra no CHECK de `perfis.perfil` e ganha linha propria em
-- `cargos_permissoes`. Nao entra no atalho `todos` do catalogo: RH nao e
-- operador, e herdar as chaves de operacao daria a ele Acordos, Pix e Analitico
-- sem ninguem ter decidido isso. As chaves dele sao nominais, logo abaixo.

DO $cargo$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.perfis'::REGCLASS AND conname = 'perfis_perfil_check'
  ) THEN
    ALTER TABLE public.perfis DROP CONSTRAINT perfis_perfil_check;
  END IF;

  ALTER TABLE public.perfis ADD CONSTRAINT perfis_perfil_check
    CHECK (perfil = ANY (ARRAY[
      'operador', 'lider', 'administrador', 'super_admin',
      'elite', 'gerencia', 'diretoria', 'ouvidoria', 'rh'
    ]));
END
$cargo$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. O CATALOGO
-- ════════════════════════════════════════════════════════════════════════════
--
-- Substituido por completo, como manda o contrato com
-- `src/lib/permissoes-catalogo.ts`. As mudancas desta rodada:
--
--   • `desafios_configurar_setor` (nova) — lideranca;
--   • `rh_aprovar` e `rh_devolver` saem de `ninguem` para `gerencia`;
--   • o cargo `rh` aparece nominalmente nas chaves do modulo RH.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
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
    -- Acordos
    ('acordos_escopo_individual',    ARRAY['bookplay'], todos,     false),
    ('acordos_escopo_equipe',        ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('acordos_escopo_setor',         ARRAY['bookplay'], lideranca, false),
    ('acordos_escopo_todos_setores', ARRAY['bookplay'], cupula,    false),
    ('criar_acordos',               NULL::TEXT[],       todos,     false),
    ('editar_acordos',              NULL::TEXT[],       todos,     false),
    ('excluir_acordos',             NULL::TEXT[],       todos,     false),
    ('excluir_em_lote',             NULL::TEXT[],       lideranca, false),
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
    -- Metas
    ('ver_metas',                   NULL::TEXT[],       lideranca, false),
    ('usuarios_administrar',         NULL::TEXT[], ninguem, false),
    ('usuarios_editar_do_setor',     NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('usuarios_transferir',          NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria'], false),
    ('equipes_criar_editar',         NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('equipes_excluir',              NULL::TEXT[], ninguem, false),
    ('equipes_gerenciar_composicao', NULL::TEXT[], ARRAY['lider','gerencia'], false),
    ('metas_editar',                 NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('metas_excluir',                NULL::TEXT[], ninguem, false),
    ('metas_editar_dias_uteis',      NULL::TEXT[], ARRAY['lider'], false),
    ('metas_excluir_dias_uteis',     NULL::TEXT[], ninguem, false),
    -- Filtros e visao (globais — em desmonte pela reestruturacao por aba)
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
    ('criar_solicitacao_whatsapp',  NULL::TEXT[],       todos,     false),
    ('aprovar_pix_automatico',      ARRAY['bookplay'],  lideranca, false),
    ('ignorar_fechamento_mes',      NULL::TEXT[],       ninguem,   true),
    -- Lixeira
    ('lixeira_escopo_individual',   NULL::TEXT[],       todos,     false),
    ('lixeira_escopo_equipe',       NULL::TEXT[],       lideranca, false),
    ('lixeira_escopo_setor',        NULL::TEXT[],       lideranca, false),
    ('lixeira_escopo_todos_setores', NULL::TEXT[],      cupula,    false),
    ('lixeira_restaurar',           NULL::TEXT[],       todos,     false),
    ('lixeira_limpar',              NULL::TEXT[],       todos,     false),
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
    -- RH Gestao. O cargo `rh` entra nominalmente: ele NAO herda o atalho
    -- `todos`, que e da operacao.
    ('ver_rh_gestao',              NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','rh'], false),
    ('rh_escopo_equipe',           NULL::TEXT[], ARRAY['lider','elite'], false),
    ('rh_escopo_setor',            NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_escopo_todos_setores',    NULL::TEXT[], ARRAY['diretoria','rh'], false),
    ('rh_preencher',               NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('rh_validar',                 NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_enviar',                  NULL::TEXT[], ARRAY['gerencia'], false),
    -- A gerencia aprova e devolve: e o fluxo pedido (o lider preenche, o
    -- gerente aprova). O cargo `rh` acompanha, porque a decisao final da folha
    -- e dele quando existir alguem no cargo.
    ('rh_aprovar',                 NULL::TEXT[], ARRAY['gerencia','rh'], false),
    ('rh_devolver',                NULL::TEXT[], ARRAY['gerencia','rh'], false),
    ('rh_dispensar',               NULL::TEXT[], ARRAY['lider','elite','gerencia','rh'], false),
    ('rh_gerenciar_fechamento',    NULL::TEXT[], ARRAY['rh'], false),
    ('rh_reabrir_fechamento',      NULL::TEXT[], ninguem,   true),
    ('rh_configurar',              NULL::TEXT[], ARRAY['rh'], false),
    ('rh_editar_cracha',           NULL::TEXT[], ARRAY['rh'], false),
    -- Ajuste manual de recebimento
    ('painel_lider_sub_ajuste_recebimento', NULL::TEXT[], lideranca, false),
    ('ajuste_recebimento_lancar',           NULL::TEXT[], lideranca, false),
    ('ajuste_recebimento_administrar',      NULL::TEXT[], ninguem,   false),
    -- Desafios
    ('desafios_configurar',        NULL::TEXT[], ninguem,   false),
    -- Configurar a campanha DO PROPRIO SETOR. Nasce para a lideranca: e o
    -- pedido, e o alcance dela ja e o setor em todo o resto do sistema.
    ('desafios_configurar_setor',  NULL::TEXT[], lideranca, false)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo oficial de permissoes. Espelha src/lib/permissoes-catalogo.ts; os '
  'testes de contrato quebram a CI se divergirem.';

-- ── Semear as chaves novas nos cargos que ja existem ───────────────────────
DO $semear$
DECLARE
  v_chave RECORD;
BEGIN
  FOR v_chave IN SELECT chave, padrao, explicita FROM public.fn_permissoes_catalogo()
                  WHERE chave IN ('desafios_configurar_setor', 'rh_dispensar')
  LOOP
    UPDATE public.cargos_permissoes cp
       SET permissoes = cp.permissoes || jsonb_build_object(
             v_chave.chave,
             CASE
               WHEN cp.cargo IN ('administrador', 'super_admin')
                 THEN NOT v_chave.explicita
               ELSE cp.cargo = ANY(v_chave.padrao)
             END),
           atualizado_em = NOW()
     WHERE NOT (cp.permissoes ? v_chave.chave);
  END LOOP;
END
$semear$;

-- ── A gerencia passa a aprovar e devolver ──────────────────────────────────
--
-- UPDATE direcionado, e nao o bloco de semeadura acima: as duas chaves JA
-- existem nas linhas de cargo, com `false`. Semear so preenche o que falta.
--
-- So mexe em quem esta em `false` — se alguem ja tinha ligado a chave para
-- outro cargo, a escolha fica.
UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes
         || jsonb_build_object('rh_aprovar', TRUE, 'rh_devolver', TRUE),
       atualizado_em = NOW()
 WHERE cp.cargo = 'gerencia'
   AND COALESCE((cp.permissoes->>'rh_aprovar')::BOOLEAN, FALSE) IS NOT TRUE;

-- ── A linha de cargo do RH, em cada empresa ────────────────────────────────
--
-- `fn_permissoes_catalogo` semeia empresa NOVA. As que ja existem precisam da
-- linha criada aqui, com o padrao do catalogo — senao o primeiro usuario com
-- cargo `rh` entraria sem permissao nenhuma e a tela pareceria quebrada.
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes)
SELECT
  e.id,
  'rh',
  COALESCE(
    (SELECT jsonb_object_agg(c.chave, 'rh' = ANY(c.padrao))
       FROM public.fn_permissoes_catalogo() c
      WHERE c.tenants IS NULL OR e.slug = ANY(c.tenants)),
    '{}'::JSONB)
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM public.cargos_permissoes cp
   WHERE cp.empresa_id = e.id AND cp.cargo = 'rh'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. QUEM NAO BATEU A META NAO TRAVA A EQUIPE
-- ════════════════════════════════════════════════════════════════════════════
--
-- ## Por que uma coluna, e nao `valor = 0`
--
-- Zero e um valor: significa "conferi e o resultado foi zero". "Nao se aplica"
-- e outra coisa — a pessoa nao atingiu, nao ha premiacao a pagar, e nao ha nada
-- para conferir. Guardar as duas no mesmo campo faria a folha nao conseguir
-- distinguir "pagamos zero" de "nao entrou na folha", que e exatamente a
-- pergunta que alguem faz na auditoria.
--
-- A coluna tambem carrega o MOTIVO: "nao atingiu a meta" e o caso comum, mas
-- afastamento e admissao no meio do mes tambem caem aqui.

ALTER TABLE public.rh_lancamentos
  ADD COLUMN IF NOT EXISTS dispensado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.rh_lancamentos
  ADD COLUMN IF NOT EXISTS motivo_dispensa TEXT;
ALTER TABLE public.rh_lancamentos
  ADD COLUMN IF NOT EXISTS dispensado_por UUID;
ALTER TABLE public.rh_lancamentos
  ADD COLUMN IF NOT EXISTS dispensado_por_nome TEXT;

COMMENT ON COLUMN public.rh_lancamentos.dispensado IS
  'Nao entra na folha desta competencia (nao atingiu, afastamento, admissao no '
  'meio do mes). Diferente de valor=0, que e "conferido e deu zero". Ver '
  '20260823200000.';

/**
 * Marca ou desmarca o operador como fora da folha desta competencia.
 *
 * Zera o valor ao dispensar: deixar um valor digitado numa linha que nao vai
 * ser paga e a forma mais direta de alguem pagar por engano depois.
 */
CREATE OR REPLACE FUNCTION public.fn_rh_dispensar_operador(
  p_lancamento_id UUID, p_dispensado BOOLEAN, p_motivo TEXT DEFAULT NULL
)
RETURNS public.rh_lancamentos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_l    public.rh_lancamentos;
  v_nome TEXT;
BEGIN
  SELECT * INTO v_l FROM public.rh_lancamentos WHERE id = p_lancamento_id FOR UPDATE;
  IF v_l.id IS NULL THEN
    RAISE EXCEPTION 'RH_LANCAMENTO_INEXISTENTE: registro nao encontrado.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_rh_exigir_aberto(v_l.fechamento_id);

  IF NOT public.fn_rh_pode('rh_dispensar') AND NOT public.fn_rh_pode('rh_preencher') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode dispensar operador.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_rh_lancamento_visivel(
       v_l.empresa_id, v_l.setor_id_snapshot, v_l.equipe_id_snapshot) THEN
    RAISE EXCEPTION 'RH_FORA_DO_ESCOPO: este operador nao esta sob sua lideranca.'
      USING ERRCODE = '42501';
  END IF;

  -- O que ja passou da mao de quem preenche nao volta por aqui: para mexer numa
  -- linha validada ou no RH existe a devolucao, que registra motivo e autor.
  IF v_l.status NOT IN ('pendente', 'preenchido', 'concluido_lider', 'devolvido_rh') THEN
    RAISE EXCEPTION
      'RH_ESTADO_INVALIDO: % ja esta como "%" — use a devolucao para reabrir.',
      v_l.nome_snapshot, v_l.status USING ERRCODE = 'check_violation';
  END IF;

  IF p_dispensado AND COALESCE(TRIM(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'RH_MOTIVO_OBRIGATORIO: informe por que este operador fica fora.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.rh_lancamentos
     SET dispensado          = p_dispensado,
         motivo_dispensa     = CASE WHEN p_dispensado THEN TRIM(p_motivo) ELSE NULL END,
         dispensado_por      = CASE WHEN p_dispensado THEN auth.uid() ELSE NULL END,
         dispensado_por_nome = CASE WHEN p_dispensado THEN v_nome ELSE NULL END,
         -- Dispensado nao tem valor a pagar. Desfazer devolve a linha para
         -- `pendente`, e alguem digita o valor.
         valor  = CASE WHEN p_dispensado THEN NULL ELSE valor END,
         status = CASE
                    WHEN p_dispensado AND status = 'devolvido_rh' THEN 'preenchido'
                    WHEN NOT p_dispensado THEN 'pendente'
                    ELSE status
                  END,
         atualizado_em = NOW()
   WHERE id = p_lancamento_id
  RETURNING * INTO v_l;

  PERFORM public.fn_rh_evento(
    v_l.fechamento_id, v_l.id, 'operador',
    CASE WHEN p_dispensado THEN 'operador_dispensado' ELSE 'operador_reincluido' END,
    CASE WHEN p_dispensado
         THEN 'Marcou ' || v_l.nome_snapshot || ' como fora da folha'
         ELSE 'Devolveu ' || v_l.nome_snapshot || ' para a folha' END,
    p_motivo, NULL, NULL, v_l.setor_id_snapshot, v_l.equipe_id_snapshot);

  RETURN v_l;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_dispensar_operador(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_dispensar_operador(UUID, BOOLEAN, TEXT) TO authenticated;

/**
 * `fn_rh_concluir_equipe`, agora ignorando quem esta fora da folha.
 *
 * O corpo e o de 20260823091000; muda a conferencia de pendencia, que passa a
 * desconsiderar `dispensado`. Antes, um operador que nao bateu a meta — e
 * portanto nao tem premiacao a receber — segurava a equipe inteira, e o lider
 * digitava zero so para destravar. Zero digitado e um pagamento de zero na
 * folha; nao e a mesma coisa.
 */
CREATE OR REPLACE FUNCTION public.fn_rh_concluir_equipe(
  p_fechamento_id UUID, p_equipe_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_pendentes TEXT;
  v_qtd       INTEGER;
  v_nome      TEXT;
  v_equipe    TEXT;
  v_setor     UUID;
BEGIN
  PERFORM public.fn_rh_exigir_aberto(p_fechamento_id);

  IF NOT public.fn_rh_pode('rh_preencher') THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode concluir equipe.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.rh_lancamentos
   WHERE fechamento_id = p_fechamento_id AND equipe_id_snapshot = p_equipe_id
     FOR UPDATE;

  SELECT string_agg(l.nome_snapshot, ', ' ORDER BY l.nome_snapshot)
    INTO v_pendentes
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id
     AND l.equipe_id_snapshot = p_equipe_id
     AND l.valor IS NULL
     -- Quem esta fora da folha nao tem valor a informar.
     AND l.dispensado IS NOT TRUE;

  IF v_pendentes IS NOT NULL THEN
    RAISE EXCEPTION
      'RH_PENDENTES: ainda falta preencher: %', v_pendentes
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT string_agg(l.nome_snapshot, ', ' ORDER BY l.nome_snapshot)
    INTO v_pendentes
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id
     AND l.equipe_id_snapshot = p_equipe_id
     AND l.status = 'devolvido_rh';

  IF v_pendentes IS NOT NULL THEN
    RAISE EXCEPTION
      'RH_PENDENTES: ainda ha devolucao do RH sem correcao: %', v_pendentes
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT MIN(l.setor_id_snapshot), MIN(l.equipe_nome_snapshot)
    INTO v_setor, v_equipe
    FROM public.rh_lancamentos l
   WHERE l.fechamento_id = p_fechamento_id AND l.equipe_id_snapshot = p_equipe_id;

  IF v_setor IS NULL THEN
    RAISE EXCEPTION 'RH_EQUIPE_VAZIA: esta equipe nao tem operadores nesta competencia.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.fn_rh_lancamento_visivel(
       public.fn_user_empresa_id(), v_setor, p_equipe_id) THEN
    RAISE EXCEPTION 'RH_FORA_DO_ESCOPO: esta equipe nao esta sob sua lideranca.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.rh_lancamentos
     SET status = 'concluido_lider', atualizado_em = NOW()
   WHERE fechamento_id = p_fechamento_id
     AND equipe_id_snapshot = p_equipe_id
     AND status IN ('pendente', 'preenchido');

  SELECT COUNT(*) INTO v_qtd FROM public.rh_lancamentos
   WHERE fechamento_id = p_fechamento_id AND equipe_id_snapshot = p_equipe_id;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  PERFORM public.fn_rh_evento(
    p_fechamento_id, NULL, 'equipe', 'equipe_concluida',
    'Concluiu a equipe ' || COALESCE(v_equipe, '—') || ' com ' || v_qtd || ' operador(es)',
    NULL, NULL, NULL, v_setor, p_equipe_id);

  RETURN v_qtd;
END;
$function$;

COMMIT;
