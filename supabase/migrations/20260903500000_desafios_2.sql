-- ============================================================================
-- Desafios 2.0 — a campanha deixa de ser de uma empresa só
-- ============================================================================
--
-- ## O que muda, em uma frase
--
-- Um desafio passa a alcançar SETORES, e os setores é que dizem de quais
-- empresas ele é. «Play 4, Play 5, Play mix Marília, Digital Marília, Cofen»
-- é uma campanha só, com líderes das duas operações no mesmo ranking.
--
-- ## Por que `empresas UUID[]` e não uma tabela de ligação
--
-- Porque o array é lido em TODA policy de `desafios`, e uma tabela de ligação
-- transformaria cada verificação de linha num EXISTS com JOIN — exatamente o
-- padrão que `security-rls-performance` manda evitar. O array cabe na linha,
-- o `&&` (sobreposição) é um operador de índice GIN, e a lista nunca passa de
-- meia dúzia de itens porque o sistema tem duas empresas.
--
-- `empresa_id` continua existindo e continua sendo o DONO da campanha — quem
-- a criou, e a empresa cujo log a registra. O array é o ALCANCE. Uma campanha
-- antiga tem array vazio e é lida como «alcança só o dono», que é o que ela
-- sempre foi.
--
-- ## O escopo de leitura vira permissão, e não regra escrita aqui
--
-- Quatro chaves novas, na mesma forma dos escopos que o Dashboard e o
-- Analítico já usam:
--
--   • `desafios_escopo_individual`     — só as campanhas em que eu disputo;
--   • `desafios_escopo_equipe`         — as que alcançam a minha equipe;
--   • `desafios_escopo_setor`          — as que alcançam o meu setor;
--   • `desafios_escopo_todos_setores`  — todas.
--
-- Elas são um OU: quem tem `setor` vê o setor E o que já veria por equipe e
-- por participação. Nenhum cargo está escrito na policy — quem responde é
-- `fn_user_tem`, e o painel de Cargos manda.
--
-- ## O que esta migration NÃO faz
--
-- Não apaga campanha nenhuma, não mexe em `analitico_recebimentos` e não muda
-- o cálculo do ranking (que vive em TypeScript puro). Todo o DDL é aditivo:
-- colunas com DEFAULT, funções por substituição, policies redesenhadas em
-- cima das mesmas tabelas.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '180s';

-- ════════════════════════════════════════════════════════════════════════════
-- 1. AS COLUNAS NOVAS
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.desafios
  -- O ALCANCE. Vazio = só `empresa_id`, que é como toda campanha existente
  -- nasceu e continua sendo lida.
  ADD COLUMN IF NOT EXISTS empresas UUID[] NOT NULL DEFAULT '{}'::UUID[],

  -- A imagem de destaque. Ela é o que aparece no menu lateral, acima do
  -- Desempenho do Dia — o convite para abrir o painel da campanha.
  ADD COLUMN IF NOT EXISTS midia_url     TEXT,
  ADD COLUMN IF NOT EXISTS midia_caminho TEXT,

  -- Quem enxerga esta campanha, por cima do escopo do cargo. `alcance` é o
  -- padrão: vale a régua de permissões. `todos` é a campanha que a empresa
  -- inteira acompanha mesmo sem disputar — o mural.
  ADD COLUMN IF NOT EXISTS visibilidade TEXT NOT NULL DEFAULT 'alcance'
    CONSTRAINT desafio_visibilidade_valida CHECK (visibilidade IN ('alcance', 'todos'));

COMMENT ON COLUMN public.desafios.empresas IS
  'Empresas alcancadas pela campanha. VAZIO = so empresa_id. O dono continua '
  'sendo empresa_id; este array e o alcance. Ver 20260903500000.';
COMMENT ON COLUMN public.desafios.midia_url IS
  'Foto ou GIF de destaque, no balde `desafios`. E o que o menu lateral exibe.';
COMMENT ON COLUMN public.desafios.visibilidade IS
  'alcance = vale a regua de permissoes (o padrao); todos = mural, a empresa '
  'inteira acompanha mesmo sem disputar.';

-- `&&` (sobreposição de arrays) é o operador de toda leitura multiempresa, e
-- sem GIN ele é varredura sequencial na tabela inteira.
CREATE INDEX IF NOT EXISTS idx_desafios_empresas
  ON public.desafios USING GIN (empresas);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. AS PORTAS
-- ════════════════════════════════════════════════════════════════════════════

/**
 * O alcance efetivo da campanha.
 *
 * Array vazio significa «só o dono», e resolver isso num lugar só evita que
 * cada policy e cada função repitam o mesmo COALESCE — e que uma delas
 * esqueça.
 */
CREATE OR REPLACE FUNCTION public.fn_desafio_empresas(
  p_empresa_id UUID, p_empresas UUID[]
)
RETURNS UUID[]
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $fn$
  SELECT CASE
    WHEN p_empresas IS NULL OR cardinality(p_empresas) = 0
      THEN ARRAY[p_empresa_id]
    ELSE p_empresas
  END;
$fn$;

/**
 * A pessoa logada alcança ALGUMA das empresas da campanha?
 *
 * É `fn_can_access_empresa` aplicada a uma lista, sem o `unnest` por linha que
 * um OR escrito na policy custaria. A regra de acesso não muda: cargo mestre,
 * empresa própria, ou concessão nominal em `perfis_empresas_acesso`.
 */
CREATE OR REPLACE FUNCTION public.fn_desafio_alcanca_empresa(p_empresas UUID[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    public.fn_user_is_super_admin()
    OR public.fn_user_empresa_id() = ANY (COALESCE(p_empresas, '{}'::UUID[]))
    OR (
      public.fn_user_tem('acesso_multiempresa_permitido')
      AND EXISTS (
        SELECT 1 FROM public.perfis_empresas_acesso a
         WHERE a.perfil_id = auth.uid()
           AND a.empresa_id = ANY (COALESCE(p_empresas, '{}'::UUID[]))
      )
    );
$fn$;

COMMENT ON FUNCTION public.fn_desafio_alcanca_empresa(UUID[]) IS
  'fn_can_access_empresa aplicada a uma LISTA de empresas, para a campanha '
  'que cruza operacoes. Ver 20260903500000.';

/**
 * A equipe da pessoa logada, com o mesmo fallback do quadro de participantes.
 *
 * Quem foi vinculado pela tela de Equipes tem `perfis.equipe_id` nulo e mora
 * em `equipe_lideres`. Sem o fallback, o líder não veria por escopo de equipe
 * a campanha da equipe que ele lidera — que é justamente a dele.
 */
CREATE OR REPLACE FUNCTION public.fn_user_equipes()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(array_agg(DISTINCT eq), ARRAY[]::UUID[])
    FROM (
      SELECT p.equipe_id AS eq FROM public.perfis p WHERE p.id = auth.uid()
      UNION
      SELECT el.equipe_id  FROM public.equipe_lideres el WHERE el.lider_id = auth.uid()
      UNION
      SELECT c.equipe_id   FROM public.equipe_operadores_clones c
       WHERE c.operador_id = auth.uid()
    ) t
   WHERE eq IS NOT NULL;
$fn$;

/**
 * Esta campanha está no alcance de LEITURA de quem está logado?
 *
 * A ordem é do mais barato para o mais caro, e cada degrau já responde sozinho:
 *
 *   1. mural (`visibilidade = 'todos'`) — a empresa inteira acompanha;
 *   2. `desafios_escopo_todos_setores` — a cúpula vê tudo;
 *   3. quem configura vê o que configura (senão não editaria o próprio
 *      rascunho);
 *   4. escopo de setor — a campanha toca o setor da pessoa;
 *   5. escopo de equipe — a campanha toca alguma equipe dela;
 *   6. escopo individual — ela está nominalmente na lista de participantes.
 *
 * Os degraus 4 a 6 leem `regra->'participantes'`. Uma campanha SEM recorte
 * naquela dimensão vale para a operação inteira (é a regra que
 * `participaDaCampanha` já aplica no cliente) e portanto passa no degrau de
 * setor de qualquer um que a alcance por empresa — o contrário esconderia a
 * campanha geral de todo mundo que não fosse cúpula.
 */
CREATE OR REPLACE FUNCTION public.fn_desafio_no_meu_alcance(
  p_setor_id     UUID,
  p_regra        JSONB,
  p_visibilidade TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_setores    UUID[];
  v_equipes    UUID[];
  v_operadores UUID[];
  v_meu_setor  UUID;
BEGIN
  IF COALESCE(p_visibilidade, 'alcance') = 'todos' THEN RETURN TRUE; END IF;
  IF public.fn_user_is_super_admin()                 THEN RETURN TRUE; END IF;
  IF public.fn_user_tem('desafios_escopo_todos_setores') THEN RETURN TRUE; END IF;
  IF public.fn_user_tem('desafios_configurar')       THEN RETURN TRUE; END IF;

  -- JSONB malformado ou ausente não pode derrubar a leitura da aba: uma
  -- campanha gravada antes destes campos existirem tem recorte vazio, que é
  -- «sem recorte» — e sem recorte ela alcança quem a enxerga por empresa.
  BEGIN
    SELECT
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_regra->'participantes'->'setores')::UUID),    ARRAY[]::UUID[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_regra->'participantes'->'equipes')::UUID),    ARRAY[]::UUID[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_regra->'participantes'->'operadores')::UUID), ARRAY[]::UUID[])
      INTO v_setores, v_equipes, v_operadores;
  EXCEPTION WHEN OTHERS THEN
    v_setores := ARRAY[]::UUID[]; v_equipes := ARRAY[]::UUID[]; v_operadores := ARRAY[]::UUID[];
  END;

  IF public.fn_user_tem('desafios_escopo_setor') THEN
    v_meu_setor := public.fn_user_setor_id();
    -- Campanha presa a um setor (`desafios.setor_id`) é do setor dela.
    IF p_setor_id IS NOT NULL AND p_setor_id = v_meu_setor THEN RETURN TRUE; END IF;
    IF cardinality(v_setores) = 0 THEN RETURN TRUE; END IF;
    IF v_meu_setor = ANY (v_setores) THEN RETURN TRUE; END IF;
  END IF;

  IF public.fn_user_tem('desafios_escopo_equipe') THEN
    IF cardinality(v_equipes) = 0 AND cardinality(v_setores) = 0 THEN RETURN TRUE; END IF;
    IF public.fn_user_equipes() && v_equipes THEN RETURN TRUE; END IF;
  END IF;

  IF public.fn_user_tem('desafios_escopo_individual') THEN
    IF auth.uid() = ANY (v_operadores) THEN RETURN TRUE; END IF;
    -- Sem lista nominal, «estar incluso» é estar num setor ou equipe da
    -- campanha: é assim que o ranking a monta, e a leitura tem que casar.
    IF cardinality(v_operadores) = 0 THEN
      IF cardinality(v_setores) > 0 AND public.fn_user_setor_id() = ANY (v_setores) THEN
        RETURN TRUE;
      END IF;
      IF cardinality(v_equipes) > 0 AND public.fn_user_equipes() && v_equipes THEN
        RETURN TRUE;
      END IF;
    END IF;
  END IF;

  RETURN FALSE;
END;
$fn$;

COMMENT ON FUNCTION public.fn_desafio_no_meu_alcance(UUID, JSONB, TEXT) IS
  'A campanha esta no alcance de leitura de quem esta logado? Le as quatro '
  'chaves desafios_escopo_*, que o painel de Cargos governa.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. RLS REDESENHADA
-- ════════════════════════════════════════════════════════════════════════════
--
-- A porta de empresa passa a olhar a LISTA; o resto do desenho é o de sempre.

DROP POLICY IF EXISTS desafios_select ON public.desafios;
CREATE POLICY desafios_select ON public.desafios
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_desafio_alcanca_empresa(
              public.fn_desafio_empresas(empresa_id, empresas)))
    AND (
      status <> 'rascunho'
      OR (SELECT public.fn_user_tem('desafios_configurar'))
      OR (SELECT public.fn_user_tem('desafios_configurar_setor'))
    )
    AND (SELECT public.fn_desafio_no_meu_alcance(setor_id, regra, visibilidade))
  );

-- Criar campanha que cruza empresas é outra decisão: quem a monta define meta
-- e prêmio para gente de uma operação que não é a dele. A chave é nominal.
DROP POLICY IF EXISTS desafios_insert ON public.desafios;
CREATE POLICY desafios_insert ON public.desafios
  FOR INSERT TO authenticated
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
    AND criado_por = auth.uid()
    AND (
      -- Sem a chave, o alcance é a própria empresa e mais nada.
      cardinality(COALESCE(empresas, '{}'::UUID[])) = 0
      OR empresas <@ ARRAY[empresa_id]
      OR public.fn_user_tem('desafios_multiempresa')
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
    AND (
      cardinality(COALESCE(empresas, '{}'::UUID[])) = 0
      OR empresas <@ ARRAY[empresa_id]
      OR public.fn_user_tem('desafios_multiempresa')
    )
  );

-- Apagar deixa de ser exclusividade de quem administra o sistema e ganha chave
-- própria — o pedido é «opção de remover um desafio». Continua sendo uma
-- decisão à parte de encerrar: encerrar guarda o resultado, apagar some com ele.
DROP POLICY IF EXISTS desafios_delete ON public.desafios;
CREATE POLICY desafios_delete ON public.desafios
  FOR DELETE TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      public.fn_user_tem('administrar_sistema')
      OR public.fn_user_tem('desafios_excluir')
      OR (
        public.fn_user_tem('desafios_configurar_setor')
        AND setor_id IS NOT NULL
        AND setor_id = public.fn_user_setor_id()
      )
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 4. O QUADRO DE PESSOAL, AGORA DE VÁRIAS EMPRESAS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Duas colunas novas no retorno: `perfil` e `empresa_id`.
--
-- `perfil` porque o pedido tem uma campanha SÓ DE LÍDERES, e sem o cargo o
-- recorte teria que ser feito nominalmente, pessoa a pessoa, toda vez.
-- `empresa_id` porque a mesma tela agora mostra gente das duas operações lado
-- a lado, e um card sem a origem vira adivinhação.

CREATE OR REPLACE FUNCTION public.fn_desafio_pessoas_interna(p_empresa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $pessoas$
BEGIN
  RETURN public.fn_desafio_pessoas_multi(ARRAY[p_empresa_id]);
END;
$pessoas$;

/**
 * O quadro de pessoal de UMA OU MAIS empresas.
 *
 * É a função de 20260823190000 com o `WHERE p.empresa_id = ...` virando
 * `= ANY (...)`. As três resoluções que ela fazia continuam iguais: o líder
 * sem `equipe_id` que mora em `equipe_lideres`, os clones que contam
 * recebimento, e o setor vindo da equipe com o do cadastro como plano B.
 *
 * NÃO checa permissão — as wrappers checam. Segue trancada para `authenticated`.
 */
CREATE OR REPLACE FUNCTION public.fn_desafio_pessoas_multi(p_empresas UUID[])
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $pessoas$
DECLARE
  v_out JSONB;
BEGIN
  WITH lider_unico AS (
    SELECT el.lider_id, MIN(el.equipe_id::TEXT)::UUID AS equipe_id
      FROM public.equipe_lideres el
     WHERE el.empresa_id = ANY (p_empresas)
     GROUP BY el.lider_id
    HAVING COUNT(*) = 1
  ),
  clones AS (
    SELECT c.operador_id, c.equipe_id, e.setor_id
      FROM public.equipe_operadores_clones c
      JOIN public.equipes e ON e.id = c.equipe_id
     WHERE c.empresa_id = ANY (p_empresas)
       AND c.conta_recebimento IS TRUE
  ),
  com_equipe AS (
    SELECT
      p.id,
      p.nome,
      p.usuario,
      p.foto_url,
      p.empresa_id,
      COALESCE(p.perfil, 'operador')      AS perfil,
      COALESCE(p.situacao, 'ativo')       AS situacao,
      COALESCE(p.equipe_id, lu.equipe_id) AS equipe_id,
      e.nome                              AS equipe_nome,
      COALESCE(e.setor_id, p.setor_id)    AS setor_id
    FROM public.perfis p
    LEFT JOIN lider_unico lu   ON lu.lider_id = p.id
    LEFT JOIN public.equipes e ON e.id = COALESCE(p.equipe_id, lu.equipe_id)
    WHERE p.empresa_id = ANY (p_empresas)
      AND p.arquivado IS NOT TRUE
      AND NOT (p.ativo IS FALSE AND COALESCE(p.situacao, 'ativo') <> 'desligado')
      AND COALESCE(p.perfil, '') <> 'super_admin'
  ),
  vinculos AS (
    SELECT ce.id AS pessoa_id, ce.setor_id, ce.equipe_id FROM com_equipe ce
    UNION
    SELECT cl.operador_id,     cl.setor_id, cl.equipe_id FROM clones cl
  ),
  agregados AS (
    SELECT
      v.pessoa_id,
      COALESCE(array_agg(DISTINCT v.setor_id)  FILTER (WHERE v.setor_id  IS NOT NULL),
               ARRAY[]::UUID[]) AS setores,
      COALESCE(array_agg(DISTINCT v.equipe_id) FILTER (WHERE v.equipe_id IS NOT NULL),
               ARRAY[]::UUID[]) AS equipes
    FROM vinculos v
    GROUP BY v.pessoa_id
  )
  SELECT COALESCE(jsonb_agg(t ORDER BY t.nome), '[]'::JSONB)
    INTO v_out
    FROM (
      SELECT
        ce.id,
        ce.nome,
        ce.usuario,
        ce.foto_url,
        ce.empresa_id,
        ce.perfil,
        ce.equipe_id,
        COALESCE(ce.equipe_nome, 'Sem equipe') AS equipe_nome,
        ce.setor_id,
        ce.situacao,
        COALESCE(ag.setores, ARRAY[]::UUID[]) AS setores,
        COALESCE(ag.equipes, ARRAY[]::UUID[]) AS equipes
      FROM com_equipe ce
      LEFT JOIN agregados ag ON ag.pessoa_id = ce.id
    ) t;

  RETURN v_out;
END;
$pessoas$;

REVOKE ALL ON FUNCTION public.fn_desafio_pessoas_multi(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_desafio_pessoas_multi(UUID[]) FROM authenticated;

COMMENT ON FUNCTION public.fn_desafio_pessoas_multi(UUID[]) IS
  'Participantes possiveis de um desafio em UMA OU MAIS empresas, com perfil e '
  'empresa_id no retorno. NAO checa permissao: use as wrappers.';

/**
 * A lista para MONTAR a campanha, agora aceitando várias empresas.
 *
 * A wrapper antiga (`fn_desafio_pessoas(UUID)`) continua de pé para quem ainda
 * a chama; esta é a que a tela nova usa. A porta é por empresa, uma a uma:
 * quem não alcança a segunda operação recebe o quadro só da primeira, em vez
 * de uma recusa que esvaziaria a tela inteira.
 */
CREATE OR REPLACE FUNCTION public.fn_desafio_pessoas_empresas(p_empresas UUID[])
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $lista$
DECLARE
  v_liberadas UUID[];
BEGIN
  IF NOT public.fn_user_tem('desafios_configurar')
     AND NOT public.fn_user_tem('desafios_configurar_setor') THEN
    RETURN '[]'::JSONB;
  END IF;

  SELECT COALESCE(array_agg(e), ARRAY[]::UUID[])
    INTO v_liberadas
    FROM unnest(COALESCE(p_empresas, '{}'::UUID[])) AS e
   WHERE public.fn_can_access_empresa(e);

  IF cardinality(v_liberadas) = 0 THEN RETURN '[]'::JSONB; END IF;
  RETURN public.fn_desafio_pessoas_multi(v_liberadas);
END;
$lista$;

REVOKE ALL ON FUNCTION public.fn_desafio_pessoas_empresas(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_desafio_pessoas_empresas(UUID[]) TO authenticated;

/**
 * Os setores que a pessoa pode colocar numa campanha, de todas as empresas
 * que ela alcança.
 *
 * Existe porque a tela de configuração agora oferece «Play 4» e «Cofen» na
 * mesma lista, e ela não tem como montar isso sozinha: a política de `setores`
 * recorta por empresa, e quem tem `acesso_multiempresa_permitido` teria que
 * fazer uma consulta por empresa e costurar o resultado no cliente.
 */
CREATE OR REPLACE FUNCTION public.fn_desafio_setores_disponiveis()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.empresa_nome, t.ordem NULLS LAST, t.nome), '[]'::JSONB)
    FROM (
      SELECT
        s.id,
        s.nome,
        s.empresa_id,
        em.nome  AS empresa_nome,
        em.slug  AS empresa_slug,
        s.ordem,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('id', eq.id, 'nome', eq.nome) ORDER BY eq.nome)
             FROM public.equipes eq WHERE eq.setor_id = s.id),
          '[]'::JSONB
        ) AS equipes
      FROM public.setores s
      JOIN public.empresas em ON em.id = s.empresa_id
     WHERE public.fn_can_access_empresa(s.empresa_id)
       AND (public.fn_user_tem('desafios_configurar')
            OR public.fn_user_tem('desafios_configurar_setor'))
    ) t;
$fn$;

REVOKE ALL ON FUNCTION public.fn_desafio_setores_disponiveis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_desafio_setores_disponiveis() TO authenticated;

COMMENT ON FUNCTION public.fn_desafio_setores_disponiveis() IS
  'Setores (com as equipes de cada um) de TODAS as empresas que quem configura '
  'alcanca. E a lista do seletor da tela de configuracao.';

-- ════════════════════════════════════════════════════════════════════════════
-- 5. O QUADRO DO DESAFIO, SOMANDO AS DUAS OPERAÇÕES
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_desafio_dados(p_desafio_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $dados$
DECLARE
  v_desafio  public.desafios%ROWTYPE;
  v_empresas UUID[];
  v_linhas   JSONB;
BEGIN
  SELECT * INTO v_desafio FROM public.desafios WHERE id = p_desafio_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_empresas := public.fn_desafio_empresas(v_desafio.empresa_id, v_desafio.empresas);

  IF NOT public.fn_desafio_alcanca_empresa(v_empresas) THEN
    RETURN NULL;
  END IF;

  IF v_desafio.status = 'rascunho'
     AND NOT public.fn_user_tem('desafios_configurar')
     AND NOT public.fn_user_tem('desafios_configurar_setor') THEN
    RETURN NULL;
  END IF;

  IF NOT public.fn_desafio_no_meu_alcance(
           v_desafio.setor_id, v_desafio.regra, v_desafio.visibilidade) THEN
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
      WHERE ar.empresa_id     = ANY (v_empresas)
        AND ar.operador_id   IS NOT NULL
        AND ar.data_pagamento BETWEEN v_desafio.data_inicio AND v_desafio.data_fim
      GROUP BY ar.operador_id, COALESCE(ar.setor_id, imp.setor_id)
    ) t;

  RETURN jsonb_build_object(
    'participantes', public.fn_desafio_pessoas_multi(v_empresas),
    'linhas',        v_linhas,
    'empresas',      to_jsonb(v_empresas)
  );
END;
$dados$;

COMMENT ON FUNCTION public.fn_desafio_dados(UUID) IS
  'Participantes e recebimento agregado de UMA campanha, somando todas as '
  'empresas que ela alcanca. Ver 20260903500000.';

-- ════════════════════════════════════════════════════════════════════════════
-- 6. A CAMPANHA EM CARTAZ, PARA O MENU LATERAL
-- ════════════════════════════════════════════════════════════════════════════
--
-- O menu lateral precisa saber, em uma consulta e sem abrir o Analítico, se há
-- campanha ativa com mídia. `listarDesafios` não serve: ela é por empresa, e o
-- widget tem que enxergar a campanha da outra operação em que a pessoa entrou.

CREATE OR REPLACE FUNCTION public.fn_desafio_em_cartaz()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.data_fim ASC), '[]'::JSONB)
    FROM (
      SELECT d.id, d.nome, d.descricao, d.premio, d.data_inicio, d.data_fim,
             d.midia_url, d.visual, d.tipo, d.empresa_id, d.empresas
        FROM public.desafios d
       WHERE d.status = 'ativo'
         AND CURRENT_DATE BETWEEN d.data_inicio AND d.data_fim
       LIMIT 12
    ) t;
$fn$;

COMMENT ON FUNCTION public.fn_desafio_em_cartaz() IS
  'Campanhas ativas HOJE que quem esta logado enxerga. SECURITY INVOKER de '
  'proposito: a RLS de desafios ja e a regua, e repeti-la aqui a duplicaria.';

REVOKE ALL ON FUNCTION public.fn_desafio_em_cartaz() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_desafio_em_cartaz() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. O BALDE DA MÍDIA
-- ════════════════════════════════════════════════════════════════════════════
--
-- Público na leitura, como `comemoracoes`: a imagem aparece no menu lateral de
-- todo mundo, e uma URL assinada por sessão significaria reassinar a cada
-- render. Escrever exige a chave de configurar.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'desafios', 'desafios', TRUE, 10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = TRUE,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS desafios_midia_ler ON storage.objects;
CREATE POLICY desafios_midia_ler ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'desafios');

DROP POLICY IF EXISTS desafios_midia_escrever ON storage.objects;
CREATE POLICY desafios_midia_escrever ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'desafios'
    AND (
      public.fn_user_tem('desafios_configurar')
      OR public.fn_user_tem('desafios_configurar_setor')
    )
  );

DROP POLICY IF EXISTS desafios_midia_apagar ON storage.objects;
CREATE POLICY desafios_midia_apagar ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'desafios'
    AND (
      public.fn_user_tem('desafios_configurar')
      OR public.fn_user_tem('desafios_configurar_setor')
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 8. O CATÁLOGO DE PERMISSÕES
-- ════════════════════════════════════════════════════════════════════════════
--
-- Seis chaves novas, somadas por acumulação ao catálogo anterior — o mesmo
-- arranjo de 20260903420000. `permissoes-catalogo.sql.test.ts` compara esta
-- lista com a de TypeScript chave a chave.

ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_desafios2_20260903;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_desafios2_20260903()
  UNION ALL
  SELECT * FROM (VALUES
    -- A operação vê as campanhas em que ela disputa. É o piso, e é de todos.
    ('desafios_escopo_individual',    NULL::TEXT[],
     ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[], false),
    -- Da liderança para cima: a equipe e o setor.
    ('desafios_escopo_equipe',        NULL::TEXT[],
     ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('desafios_escopo_setor',         NULL::TEXT[],
     ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    -- Todos os setores das duas operações. Diretoria para cima, como pedido.
    ('desafios_escopo_todos_setores', NULL::TEXT[],
     ARRAY['diretoria']::TEXT[], false),
    -- Apagar e cruzar empresas nascem em NINGUÉM: administrador e super_admin
    -- já recebem `true` por regra do resolvedor, e qualquer outra pessoa
    -- precisa ser habilitada nominalmente.
    ('desafios_excluir',              NULL::TEXT[], ARRAY[]::TEXT[], false),
    ('desafios_multiempresa',         NULL::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

REVOKE ALL ON FUNCTION public.fn_permissoes_catalogo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_permissoes_catalogo() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao de 20260903500000 acrescenta as '
  'quatro chaves de escopo dos Desafios, desafios_excluir e desafios_multiempresa.';

/*
 * Semeadura das empresas que já existem.
 *
 * `fn_user_tem` trata chave ausente como negada — e a de escopo, negada, faz
 * a aba de Desafios abrir VAZIA para todo mundo. Sem este passo a
 * funcionalidade regride para quem já a usava.
 *
 * Escrito nos dois sentidos pelo mesmo motivo de sempre: cartão em branco no
 * painel não distingue «é não» de «ninguém decidiu ainda».
 */
UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('desafios_escopo_individual', TRUE)
 WHERE cargo IN ('operador','ouvidoria','lider','elite','gerencia','diretoria')
   AND NOT (permissoes ? 'desafios_escopo_individual');
UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('desafios_escopo_individual', FALSE)
 WHERE cargo NOT IN ('operador','ouvidoria','lider','elite','gerencia','diretoria')
   AND NOT (permissoes ? 'desafios_escopo_individual');

UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('desafios_escopo_equipe', TRUE)
 WHERE cargo IN ('lider','elite','gerencia','diretoria')
   AND NOT (permissoes ? 'desafios_escopo_equipe');
UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('desafios_escopo_equipe', FALSE)
 WHERE cargo NOT IN ('lider','elite','gerencia','diretoria')
   AND NOT (permissoes ? 'desafios_escopo_equipe');

UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('desafios_escopo_setor', TRUE)
 WHERE cargo IN ('lider','elite','gerencia','diretoria')
   AND NOT (permissoes ? 'desafios_escopo_setor');
UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('desafios_escopo_setor', FALSE)
 WHERE cargo NOT IN ('lider','elite','gerencia','diretoria')
   AND NOT (permissoes ? 'desafios_escopo_setor');

UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('desafios_escopo_todos_setores', TRUE)
 WHERE cargo = 'diretoria'
   AND NOT (permissoes ? 'desafios_escopo_todos_setores');
UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('desafios_escopo_todos_setores', FALSE)
 WHERE cargo <> 'diretoria'
   AND NOT (permissoes ? 'desafios_escopo_todos_setores');

UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('desafios_excluir', FALSE)
 WHERE NOT (permissoes ? 'desafios_excluir');

UPDATE public.cargos_permissoes
   SET permissoes = permissoes || jsonb_build_object('desafios_multiempresa', FALSE)
 WHERE NOT (permissoes ? 'desafios_multiempresa');

COMMIT;
