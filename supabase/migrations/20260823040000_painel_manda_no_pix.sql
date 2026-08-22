-- ============================================================================
-- O painel manda: Pix Automatico
-- ============================================================================
--
-- 10 policies em 5 tabelas trocam a lista de cargo pela pergunta ao painel.
--
-- ## Duas listas, duas perguntas
--
--   LER   `lider, elite, gerencia, diretoria, administrador, super_admin`
--         -> `fn_user_escopo('pix') >= 2`   (ve alem dos proprios registros)
--
--   AGIR  `lider, elite, gerencia, administrador, super_admin`  (sem diretoria)
--         -> `fn_user_escopo('pix') >= 2`   para mexer em registro alheio
--         -> `fn_user_escopo('pix') >= 0 AND fn_user_tem('pix_editar_configuracoes')`
--            para a configuracao do setor e as metas de Pix
--
-- O `>= 0` na segunda e o interruptor da aba: `fn_user_escopo` devolve -1
-- quando a aba esta desligada. Sem ele, `bookplay/ouvidoria` — que tem
-- `pix_editar_configuracoes` gravado como true e a ABA desligada — poderia
-- escrever a configuracao de um modulo que nao enxerga. Na tela isso nao
-- acontece porque a pagina inteira nao monta; no banco, precisa ser dito.
--
-- Conferido cargo a cargo: para agir, as duas formas dao exatamente a lista
-- antiga. Nem ganho nem perda.
--
-- ## Uma perda, e ela e intencional: `diretoria` na LEITURA
--
-- A `diretoria` some das tres policies de SELECT (registros, log e lixeira do
-- Pix) porque no painel ela tem escopo `individual` nesta aba.
--
-- Isso NAO e regressao: na tela ela ja via so os proprios registros. O Pix
-- monta a visao de lideranca a partir de `isPerfilAdminOuLider`, que nao inclui
-- `diretoria` — e o filtro de setor mora dentro desse bloco. O banco e que
-- estava mais frouxo que a interface, devolvendo linhas que nenhuma tela
-- mostrava.
--
-- Alinhar os dois e o objetivo. E se a intencao for outra, agora o lugar de
-- mudar e o painel: ligar `pix_escopo_setor` na diretoria devolve tudo.
--
-- ## Os `_super_admin_total` e os SELECT abertos de config/metas ficam
--
-- `pix_auto_cfg_select` e `pix_auto_metas_select` liberam leitura a quem
-- acessa a empresa, sem cargo nenhum — nao ha lista para trocar. E o percentual
-- de comissao precisa ser legivel por quem o Pix afeta.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── Prova: so a perda declarada passa ───────────────────────────────────────
DO $prova$
DECLARE
  v_erro TEXT;
  c_ler    CONSTANT TEXT[] := ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'];
  c_agir   CONSTANT TEXT[] := ARRAY['lider','elite','gerencia','administrador','super_admin'];
BEGIN
  WITH aval AS (
    SELECT e.slug, cp.cargo,
           (cp.cargo IN ('administrador','super_admin')
            OR (COALESCE((cp.permissoes->>'ver_pix_automatico')::BOOLEAN, FALSE)
                AND (COALESCE((cp.permissoes->>'pix_escopo_setor')::BOOLEAN, FALSE)
                     OR COALESCE((cp.permissoes->>'pix_escopo_todos_setores')::BOOLEAN, FALSE)))
           ) AS novo_alem,
           (cp.cargo IN ('administrador','super_admin')
            OR (COALESCE((cp.permissoes->>'ver_pix_automatico')::BOOLEAN, FALSE)
                AND COALESCE((cp.permissoes->>'pix_editar_configuracoes')::BOOLEAN, FALSE))
           ) AS novo_config
      FROM public.cargos_permissoes cp
      JOIN public.empresas e ON e.id = cp.empresa_id
      WHERE e.slug = 'bookplay'   -- Pix so existe na BookPlay
  )
  SELECT string_agg(slug || '/' || cargo || ': ' ||
           concat_ws(' e ',
             CASE WHEN cargo = ANY(c_ler)  AND NOT novo_alem   THEN 'leitura' END,
             CASE WHEN cargo = ANY(c_agir) AND NOT novo_alem   THEN 'acao sobre alheio' END,
             CASE WHEN cargo = ANY(c_agir) AND NOT novo_config THEN 'configuracao' END), ', ')
    INTO v_erro
  FROM aval
  WHERE (
        (cargo = ANY(c_ler) AND NOT novo_alem)
     OR (cargo = ANY(c_agir) AND NOT (novo_alem AND novo_config))
      )
    -- A unica perda aceita, e o motivo esta no cabecalho. Os parenteses acima
    -- nao sao decoracao: sem eles o `AND NOT` se prende so ao ultimo ramo do
    -- `OR`, e a excecao nao valia para a leitura — foi o que aconteceu na
    -- primeira tentativa, e a propria guarda acusou.
    AND cargo <> 'diretoria';

  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Perda de acesso nao declarada no Pix: %', v_erro;
  END IF;
END
$prova$;

-- ── pix_automatico_acordos ──────────────────────────────────────────────────
DROP POLICY IF EXISTS pix_auto_select ON public.pix_automatico_acordos;
CREATE POLICY pix_auto_select ON public.pix_automatico_acordos
FOR SELECT USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    operador_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_escopo('pix')) >= 2
  )
);

DROP POLICY IF EXISTS pix_auto_insert ON public.pix_automatico_acordos;
CREATE POLICY pix_auto_insert ON public.pix_automatico_acordos
FOR INSERT WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND status = 'pendente'
  AND (
    (SELECT public.fn_user_escopo('pix')) >= 2
    -- O operador registra o proprio Pix, se o interruptor do setor dele deixa.
    OR (operador_id = (SELECT auth.uid())
        AND COALESCE((SELECT c.permite_registro_operador
                        FROM public.pix_automatico_config c
                       WHERE c.empresa_id = pix_automatico_acordos.empresa_id
                         AND c.setor_id   = pix_automatico_acordos.setor_id), TRUE))
  )
);

DROP POLICY IF EXISTS pix_auto_update ON public.pix_automatico_acordos;
CREATE POLICY pix_auto_update ON public.pix_automatico_acordos
FOR UPDATE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_escopo('pix')) >= 2
);

DROP POLICY IF EXISTS pix_auto_delete ON public.pix_automatico_acordos;
CREATE POLICY pix_auto_delete ON public.pix_automatico_acordos
FOR DELETE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    (operador_id = (SELECT auth.uid()) AND status = 'desaprovado')
    OR (SELECT public.fn_user_escopo('pix')) >= 2
  )
);

-- ── pix_automatico_log ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS pix_log_select ON public.pix_automatico_log;
CREATE POLICY pix_log_select ON public.pix_automatico_log
FOR SELECT USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    operador_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_escopo('pix')) >= 2
  )
);

-- ── lixeira_pix_automatico ──────────────────────────────────────────────────
DROP POLICY IF EXISTS lixeira_pix_select ON public.lixeira_pix_automatico;
CREATE POLICY lixeira_pix_select ON public.lixeira_pix_automatico
FOR SELECT USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    operador_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_escopo('pix')) >= 2
  )
);

DROP POLICY IF EXISTS lixeira_pix_insert ON public.lixeira_pix_automatico;
CREATE POLICY lixeira_pix_insert ON public.lixeira_pix_automatico
FOR INSERT WITH CHECK (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    operador_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_escopo('pix')) >= 2
  )
);

DROP POLICY IF EXISTS lixeira_pix_delete ON public.lixeira_pix_automatico;
CREATE POLICY lixeira_pix_delete ON public.lixeira_pix_automatico
FOR DELETE USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_escopo('pix')) >= 2
);

-- ── pix_automatico_config e pix_automatico_metas ────────────────────────────
-- Aqui a pergunta e de ACAO, nao de alcance: quem edita o percentual de
-- comissao e os criterios de meta. `>= 0` e o interruptor da aba.
DROP POLICY IF EXISTS pix_auto_cfg_write ON public.pix_automatico_config;
CREATE POLICY pix_auto_cfg_write ON public.pix_automatico_config
FOR ALL USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_escopo('pix')) >= 0
  AND (SELECT public.fn_user_tem('pix_editar_configuracoes'))
);

DROP POLICY IF EXISTS pix_auto_metas_write ON public.pix_automatico_metas;
CREATE POLICY pix_auto_metas_write ON public.pix_automatico_metas
FOR ALL USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_escopo('pix')) >= 0
  AND (SELECT public.fn_user_tem('pix_editar_configuracoes'))
);

COMMIT;
