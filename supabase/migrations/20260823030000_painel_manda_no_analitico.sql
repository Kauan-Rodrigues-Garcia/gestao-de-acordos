-- ============================================================================
-- O painel manda: Analitico, Recebimento Diario, Colchao e Exclusoes
-- ============================================================================
--
-- 13 policies em 4 tabelas trocam a lista de cargo pela pergunta ao painel.
-- Todas usavam EXATAMENTE a mesma lista — `lider, elite, gerencia, diretoria,
-- administrador, super_admin` — ou seja: "todo mundo menos operador e
-- ouvidoria", escrito por extenso treze vezes.
--
-- ## O que cada uma passa a perguntar
--
--   ler ....... `fn_user_escopo('analitico') >= 2`  (ve alem dos proprios)
--   escrever .. `fn_user_tem('importar_analitico')` ou `importar_diario`
--
-- As chaves de escrita nao foram escolhidas por afinidade de nome: os valores
-- delas hoje batem com a lista de cargo cargo a cargo, com uma excecao que esta
-- declarada abaixo.
--
-- ## A tela prometia e o banco negava
--
-- `pagueplay/ouvidoria` tem, no painel, `ver_analitico` ligado e escopo de
-- setor — porque a interface a trata como lideranca (`isPerfilAdminOuLider`
-- inclui `ouvidoria`). Mas a lista de cargo das policies NAO a incluia. Ou
-- seja: a aba abria, a tela montava a visao de lideranca, e o banco devolvia
-- so as linhas dela. Provavelmente uma tela vazia, sem explicacao.
--
-- Com o painel mandando, isso se resolve sozinho — e e o efeito pedido: o que
-- esta ligado na tela funciona.
--
-- ## Ganhos sao permitidos; PERDAS abortam
--
-- O bloco de prova compara, cargo a cargo nas duas empresas, a lista antiga com
-- a resposta do painel. Cargo que GANHA acesso e registrado num NOTICE — e o
-- que se espera quando o painel passa a mandar. Cargo que PERDE derruba a
-- migration: os valores do painel foram derivados por mim do codigo antigo, e
-- uma perda ali seria erro de derivacao, nao decisao de ninguem.
--
-- ## O que NAO muda: a distincao entre setor e empresa
--
-- `>= 2` libera a empresa inteira nestas tabelas, e nao o setor, mesmo quando o
-- painel diz `setor`. Isso e deliberado e temporario.
--
-- `buscarTotalPorSetor` le o mes inteiro e agrupa POR SETOR para montar o
-- comparativo do Painel Lider e do Analitico. Um lider precisa dessas linhas
-- para ver o proprio setor ao lado dos outros. Apertar o RLS para o setor dele
-- agora esvaziaria esse comparativo em silencio — trocaria um problema
-- ("libero e nao acontece") por outro ("sumiu numero que eu via ontem").
--
-- O recorte por setor continua sendo feito na consulta da tela. Quando as
-- funcoes de agregacao pedirem os totais por RPC em vez de lerem a tabela
-- crua, o `>= 2` vira setor de verdade aqui.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── Prova ANTES de trocar: ninguem pode perder acesso ───────────────────────
DO $prova$
DECLARE
  v_perdas TEXT;
  v_ganhos TEXT;
  c_lista CONSTANT TEXT[] :=
    ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'];
BEGIN
  WITH avaliacao AS (
    SELECT e.slug, cp.cargo,
           (cp.cargo = ANY(c_lista)) AS antigo,
           -- Espelha fn_user_escopo('analitico') >= 2 sem usuario logado.
           (cp.cargo IN ('administrador','super_admin')
            OR (COALESCE((cp.permissoes->>'ver_analitico')::BOOLEAN, FALSE)
                AND (COALESCE((cp.permissoes->>'analitico_escopo_setor')::BOOLEAN, FALSE)
                     OR COALESCE((cp.permissoes->>'analitico_escopo_todos_setores')::BOOLEAN, FALSE)))
           ) AS novo_ler,
           (cp.cargo IN ('administrador','super_admin')
            OR COALESCE((cp.permissoes->>'importar_analitico')::BOOLEAN, FALSE)
           ) AS novo_escrever_a,
           (cp.cargo IN ('administrador','super_admin')
            OR COALESCE((cp.permissoes->>'importar_diario')::BOOLEAN, FALSE)
           ) AS novo_escrever_d
      FROM public.cargos_permissoes cp
      JOIN public.empresas e ON e.id = cp.empresa_id
  )
  SELECT
    string_agg(slug || '/' || cargo || ' (' ||
      concat_ws(', ',
        CASE WHEN antigo AND NOT novo_ler       THEN 'leitura' END,
        CASE WHEN antigo AND NOT novo_escrever_a THEN 'escrita analitico' END,
        CASE WHEN antigo AND NOT novo_escrever_d THEN 'escrita diario' END
      ) || ')', ', ')
      FILTER (WHERE antigo AND NOT (novo_ler AND novo_escrever_a AND novo_escrever_d)),
    string_agg(slug || '/' || cargo || ' (' ||
      concat_ws(', ',
        CASE WHEN novo_ler AND NOT antigo       THEN 'leitura' END,
        CASE WHEN novo_escrever_a AND NOT antigo THEN 'escrita analitico' END,
        CASE WHEN novo_escrever_d AND NOT antigo THEN 'escrita diario' END
      ) || ')', ', ')
      FILTER (WHERE NOT antigo AND (novo_ler OR novo_escrever_a OR novo_escrever_d))
    INTO v_perdas, v_ganhos
  FROM avaliacao;

  IF v_perdas IS NOT NULL THEN
    RAISE EXCEPTION
      'Esta migration TIRARIA acesso de %. O painel foi derivado do codigo '
      'antigo; perda ali e erro de derivacao, nao decisao.', v_perdas;
  END IF;

  IF v_ganhos IS NOT NULL THEN
    RAISE NOTICE E'O painel passa a valer, e estes cargos ganham:\n  %', v_ganhos;
  END IF;
END
$prova$;

-- ── analitico_recebimentos ──────────────────────────────────────────────────
DROP POLICY IF EXISTS analitico_select ON public.analitico_recebimentos;
CREATE POLICY analitico_select ON public.analitico_recebimentos
FOR SELECT USING (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (
    (operador_id = (SELECT auth.uid()) AND operador_id IS NOT NULL)
    OR (SELECT public.fn_user_escopo('analitico')) >= 2
  )
);

DROP POLICY IF EXISTS analitico_insert ON public.analitico_recebimentos;
CREATE POLICY analitico_insert ON public.analitico_recebimentos
FOR INSERT WITH CHECK (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (SELECT public.fn_user_tem('importar_analitico'))
);

DROP POLICY IF EXISTS analitico_update ON public.analitico_recebimentos;
CREATE POLICY analitico_update ON public.analitico_recebimentos
FOR UPDATE USING (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (
    operador_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_tem('importar_analitico'))
  )
);

DROP POLICY IF EXISTS analitico_delete ON public.analitico_recebimentos;
CREATE POLICY analitico_delete ON public.analitico_recebimentos
FOR DELETE USING (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (SELECT public.fn_user_tem('importar_analitico'))
);

-- ── diario_recebimentos ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS diario_select ON public.diario_recebimentos;
CREATE POLICY diario_select ON public.diario_recebimentos
FOR SELECT USING (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (
    (operador_id = (SELECT auth.uid()) AND operador_id IS NOT NULL)
    OR (SELECT public.fn_user_escopo('analitico')) >= 2
  )
);

DROP POLICY IF EXISTS diario_insert ON public.diario_recebimentos;
CREATE POLICY diario_insert ON public.diario_recebimentos
FOR INSERT WITH CHECK (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (SELECT public.fn_user_tem('importar_diario'))
);

DROP POLICY IF EXISTS diario_update ON public.diario_recebimentos;
CREATE POLICY diario_update ON public.diario_recebimentos
FOR UPDATE USING (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (
    operador_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_tem('importar_diario'))
  )
);

DROP POLICY IF EXISTS diario_delete ON public.diario_recebimentos;
CREATE POLICY diario_delete ON public.diario_recebimentos
FOR DELETE USING (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (SELECT public.fn_user_tem('importar_diario'))
);

-- ── analitico_colchao_fora_meta ─────────────────────────────────────────────
DROP POLICY IF EXISTS analitico_colchao_select ON public.analitico_colchao_fora_meta;
CREATE POLICY analitico_colchao_select ON public.analitico_colchao_fora_meta
FOR SELECT USING (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (
    (operador_id = (SELECT auth.uid()) AND operador_id IS NOT NULL)
    OR (SELECT public.fn_user_escopo('analitico')) >= 2
  )
);

DROP POLICY IF EXISTS analitico_colchao_insert ON public.analitico_colchao_fora_meta;
CREATE POLICY analitico_colchao_insert ON public.analitico_colchao_fora_meta
FOR INSERT WITH CHECK (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (SELECT public.fn_user_tem('importar_analitico'))
);

DROP POLICY IF EXISTS analitico_colchao_update ON public.analitico_colchao_fora_meta;
CREATE POLICY analitico_colchao_update ON public.analitico_colchao_fora_meta
FOR UPDATE USING (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (SELECT public.fn_user_tem('importar_analitico'))
);

-- ── analitico_exclusoes_setor ───────────────────────────────────────────────
-- Quem edita a composicao do acumulado e, na tela, `temPermissaoImportar ||
-- podeVerTodosSetores` (ver AnaliticoLider). A policy passa a dizer o mesmo.
DROP POLICY IF EXISTS analitico_exclusoes_insert ON public.analitico_exclusoes_setor;
CREATE POLICY analitico_exclusoes_insert ON public.analitico_exclusoes_setor
FOR INSERT WITH CHECK (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (
    (SELECT public.fn_user_tem('importar_analitico'))
    OR (SELECT public.fn_user_escopo('analitico')) >= 3
  )
);

DROP POLICY IF EXISTS analitico_exclusoes_delete ON public.analitico_exclusoes_setor;
CREATE POLICY analitico_exclusoes_delete ON public.analitico_exclusoes_setor
FOR DELETE USING (
  ((SELECT public.fn_user_is_super_admin())
   OR (SELECT public.fn_user_acesso_multiempresa())
   OR empresa_id = (SELECT public.fn_user_empresa_id()))
  AND (
    (SELECT public.fn_user_tem('importar_analitico'))
    OR (SELECT public.fn_user_escopo('analitico')) >= 3
  )
);

COMMIT;
