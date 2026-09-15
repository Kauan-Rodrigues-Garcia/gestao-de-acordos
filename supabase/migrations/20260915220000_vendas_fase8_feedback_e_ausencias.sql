-- ============================================================================
-- Comercial, Fase 8: feedback e ausencias
-- ============================================================================
--
-- «Um registro por operador. Clicou no operador, vê só os feedbacks dele.
-- Filtro por equipe e setor. Foto para o líder localizar rápido.» — lacuna F
-- do plano. E, do mesmo plano: «atestado, INSS, férias e banco de horas já são
-- acompanhados — mal, dentro da célula da contagem».
--
-- ## O que a planilha fazia, e por que vira duas tabelas
--
-- `Planilha De Feedback.xlsx`, analisada em 15/09/2026:
--
--   * oito abas mensais com a CONTAGEM de vendas por dia, e na mesma celula o
--     motivo de a pessoa nao estar: INSS 259x, FERIAS/FÉRIAS 193x, ATESTADO
--     117x, FALTA 32x, ABONO 25x, BANCO/BANCO DE HORAS 22x, CASAMENTO 3x,
--     DECLARAÇÃO 3x, SUSPENSAÇÃO 1x, ATESTADO/MEIO e MEIO PERÍODO 1x cada;
--   * uma aba por operador, com blocos «FeedBack: <autor> | Dia: <data>» e o
--     texto embaixo, ate cinco por mes.
--
-- A celula da contagem responde duas perguntas — «quanto vendeu» e «por que
-- nao estava» — e por isso nenhuma das duas e somavel. A contagem ja vem de
-- `vendas`; o motivo vira `ausencias`. O historico narrativo vira `feedbacks`.
--
-- Fica de fora da ausencia, de proposito:
--
--   * FERIADO (85x) — e do calendario, nao da pessoa. Dias uteis ja o tratam.
--   * SAIU, TRANSFERIDO, DESPENSADO, FOI REMANEJADA — sao movimentacao de
--     cadastro (`perfis.situacao`, troca de equipe), nao falta ao trabalho.
--
-- ## Ferias: a ausencia manda, `perfis` espelha
--
-- Decidido em 15/09/2026. `perfis.ferias_desde/ferias_ate` (20260901100000) e
-- um ESTADO — «esta de ferias e volta quando?» — e a propria migration dizia
-- que o historico, quando preciso, nasceria de uma tabela propria. E esta.
--
-- Duas verdades sobre a mesma coisa e o que nao pode acontecer, entao:
--
--   * lancar, corrigir ou excluir ferias em `ausencias` atualiza `perfis` na
--     hora, quando o periodo cobre HOJE (fn_ausencias_espelhar_ferias);
--   * ferias futuras comecam sozinhas, todo dia as 00:20 de Sao Paulo
--     (fn_ausencias_iniciar_ferias_diario), cinco minutos depois de
--     `ferias-encerrar-vencidas` terminar as que acabaram;
--   * o retorno continua sendo o de 20260901100000, que nao muda.
--
-- ⚠️ O caminho inverso NAO existe: marcar ferias pela tela de Usuarios mexe so
-- em `perfis` e nao cria ausencia. E o espelho nunca desfaz ferias que nao foi
-- ele que pos — so reverte `perfis` quando as datas de la sao exatamente as da
-- ausencia que saiu.
--
-- ## Feedback e da lideranca
--
-- Decidido em 15/09/2026: o operador NAO le os proprios feedbacks por padrao.
-- Os textos sao nota de acompanhamento («totalmente sem foco, com pressa de
-- finalizar a ligação...»), escritos para quem acompanha. `ver_feedbacks` e
-- chave separada da aba justamente para isso poder mudar em Permissoes sem
-- migration — e para quem registra ausencia (RH, ADM) nao precisar ler coaching.
--
-- ## O alcance e pela equipe de HOJE, nao pela da epoca
--
-- `vendas` e `indicacoes` congelam setor e equipe na gravacao, porque dinheiro
-- e ponto de ranking pertencem ao momento. Acompanhamento e o contrario: o
-- lider que recebe um operador transferido precisa ler o historico dele desde
-- o primeiro dia. Por isso as duas tabelas nao guardam setor nem equipe, e a
-- policy pergunta onde a pessoa esta AGORA — cadastro, clone e lideranca, as
-- tres portas de `fn_setores_do_operador`.
--
-- Escrita de dados: os 10 tipos de ausencia em `ausencias_tipos`, e as dez
-- permissoes novas semeadas nos cargos existentes (`rh` de fora, como na
-- Fase 7). Nenhuma linha de feedback ou ausencia.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. Catalogo de permissoes
-- ============================================================================
--
-- O topo de verdade e a Fase 7. O congelamento abaixo repete, chave por
-- chave, o corpo atual de `fn_permissoes_catalogo` (20260915200000) — e e
-- isso que o torna retrato. A continuacao da Fase 7 (20260915210000) nao tocou
-- o catalogo.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo_antes_acompanhamento_20260915()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_indicacoes_20260915()
  UNION ALL
  SELECT * FROM (VALUES
    ('ver_indicacoes',     ARRAY['comercial']::TEXT[],
       ARRAY['operador','lider','elite','gerencia','diretoria']::TEXT[], false),
    ('criar_indicacoes',   ARRAY['comercial']::TEXT[],
       ARRAY['operador','lider','elite','gerencia']::TEXT[], false),
    ('editar_indicacoes',  ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia']::TEXT[], false),
    ('excluir_indicacoes', ARRAY['comercial']::TEXT[],
       ARRAY['gerencia']::TEXT[], false),

    ('indicacoes_escopo_individual',    ARRAY['comercial']::TEXT[],
       ARRAY['operador']::TEXT[], false),
    ('indicacoes_escopo_equipe',        ARRAY['comercial']::TEXT[],
       ARRAY[]::TEXT[], false),
    ('indicacoes_escopo_setor',         ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite']::TEXT[], false),
    ('indicacoes_escopo_todos_setores', ARRAY['comercial']::TEXT[],
       ARRAY['gerencia','diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_acompanhamento_20260915()
  UNION ALL
  SELECT * FROM (VALUES
    -- A aba. Operador fora: ver decisao no cabecalho.
    ('ver_acompanhamento', ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),

    ('acompanhamento_escopo_individual',    ARRAY['comercial']::TEXT[],
       ARRAY[]::TEXT[], false),
    ('acompanhamento_escopo_equipe',        ARRAY['comercial']::TEXT[],
       ARRAY[]::TEXT[], false),
    ('acompanhamento_escopo_setor',         ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite']::TEXT[], false),
    ('acompanhamento_escopo_todos_setores', ARRAY['comercial']::TEXT[],
       ARRAY['gerencia','diretoria']::TEXT[], false),

    -- Ler o TEXTO dos feedbacks. Separada da aba: quem lanca atestado nao
    -- precisa ler coaching, e o operador pode um dia ganhar a aba sem ela.
    ('ver_feedbacks',       ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('registrar_feedbacks', ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia']::TEXT[], false),
    -- Apagar feedback e apagar historico de acompanhamento. Corrigir o texto
    -- e do autor; sumir com ele e decisao de gerencia.
    ('excluir_feedbacks',   ARRAY['comercial']::TEXT[],
       ARRAY['gerencia']::TEXT[], false),

    ('registrar_ausencias', ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia']::TEXT[], false),
    -- Ausencia lancada errada (data trocada, pessoa errada) e o erro comum, e
    -- nao tira ponto de ninguem: o lider corrige.
    ('excluir_ausencias',   ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. A extensao 20260915220000 adiciona as chaves de '
  'acompanhamento (feedback e ausencias) do Comercial.';

-- ============================================================================
-- 2. O registro de abas com escopo
-- ============================================================================

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
    ('rh',               'ver_rh_gestao'),
    ('chips',            'ver_meus_chips'),
    ('fechamento',       'ver_fechamento'),
    ('vendas',           'ver_vendas'),
    ('indicacoes',       'ver_indicacoes'),
    ('acompanhamento',   'ver_acompanhamento');
$function$;

COMMENT ON FUNCTION public.fn_abas_escopo() IS
  'Registro de abas com escopo. `acompanhamento` entrou em 20260915220000 com os '
  'quatro niveis — feedback e ausencias do Comercial.';

-- ============================================================================
-- 3. Quem eu alcanco
-- ============================================================================
--
-- UMA funcao responde, e as duas policies e as quatro RPCs de escrita a
-- chamam. Duas copias da regra de alcance e como a tela passa a oferecer um
-- botao que o banco recusa.
--
-- Devolve um CONJUNTO, e nao «alcanco esta pessoa?», por desempenho: na policy
-- `operador_id IN (SELECT fn())` e subconsulta sem correlacao — roda uma vez
-- por consulta e vira hash, em vez de uma chamada por linha.
--
-- Nas RPCs a pergunta e `NOT EXISTS`, nunca `NOT IN`: com um NULL no conjunto,
-- `x NOT IN (...)` da NULL, o IF le como falso e a recusa nao acontece.
--
-- Pela equipe de HOJE. Ver o cabecalho.

CREATE OR REPLACE FUNCTION public.fn_acompanhamento_alcancados()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH nivel AS (
    SELECT public.fn_user_escopo('acompanhamento') AS n
  ),
  eu AS (
    SELECT auth.uid() AS id
  ),
  meus_setores AS (
    SELECT s AS setor_id
      FROM public.fn_setores_do_operador((SELECT id FROM eu)) AS s
     WHERE (SELECT n FROM nivel) = 2
  ),
  minhas_equipes AS (
    SELECT e.equipe_id
      FROM public.fn_equipes_com_lideranca((SELECT id FROM eu)) AS e
     WHERE (SELECT n FROM nivel) = 1
  )
  -- Qualquer nivel alcanca a propria pessoa. Sem a aba (-1), ninguem.
  SELECT (SELECT id FROM eu)
   WHERE (SELECT n FROM nivel) >= 0
     AND (SELECT id FROM eu) IS NOT NULL
  UNION
  -- Todos os setores: a empresa inteira, e as outras a que a pessoa tem acesso.
  SELECT p.id
    FROM public.perfis p
   WHERE (SELECT n FROM nivel) >= 3
     AND public.fn_can_access_empresa(p.empresa_id)
  UNION
  -- Setor: as tres portas de fn_setores_do_operador — cadastro, clone e lideranca.
  SELECT p.id
    FROM public.perfis p
   WHERE p.setor_id IN (SELECT setor_id FROM meus_setores)
  UNION
  SELECT c.operador_id
    FROM public.equipe_operadores_clones c
    JOIN public.equipes e ON e.id = c.equipe_id
   WHERE e.setor_id IN (SELECT setor_id FROM meus_setores)
  UNION
  SELECT l.lider_id
    FROM public.equipe_lideres l
    JOIN public.equipes e ON e.id = l.equipe_id
   WHERE e.setor_id IN (SELECT setor_id FROM meus_setores)
  UNION
  -- Equipe: as mesmas tres portas, uma equipe abaixo.
  SELECT p.id
    FROM public.perfis p
   WHERE p.equipe_id IN (SELECT equipe_id FROM minhas_equipes)
  UNION
  SELECT c.operador_id
    FROM public.equipe_operadores_clones c
   WHERE c.equipe_id IN (SELECT equipe_id FROM minhas_equipes)
  UNION
  SELECT l.lider_id
    FROM public.equipe_lideres l
   WHERE l.equipe_id IN (SELECT equipe_id FROM minhas_equipes);
$function$;

REVOKE ALL ON FUNCTION public.fn_acompanhamento_alcancados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_acompanhamento_alcancados() TO authenticated;

COMMENT ON FUNCTION public.fn_acompanhamento_alcancados() IS
  'As pessoas cujo feedback e ausencia o usuario logado alcanca, pela equipe e '
  'setor de HOJE. Unica copia da regra: policies e RPCs chamam esta.';

-- ============================================================================
-- 4. Os tipos de ausencia
-- ============================================================================
--
-- Tabela, e nao CHECK, por causa de `abate_meta`: a proxima fase liga ausencia
-- a meta proporcional, e a regra de QUAIS tipos descontam precisa estar
-- escrita antes — num lugar que a consulta da meta junte, e nao num `CASE`
-- repetido em cada funcao que calcular esperado.
--
-- ⚠️ `abate_meta` e LEITURA MINHA a confirmar com a operacao. O raciocinio:
-- desconta o que a pessoa nao escolheu ou que a empresa concedeu (ferias,
-- atestado, INSS, licenca, abono, banco de horas, declaracao); nao desconta
-- falta, suspensao e «outros», porque descontar falta seria premiar a falta.
--
-- `ON CONFLICT DO NOTHING`: reaplicar nao desfaz um ajuste feito depois.

CREATE TABLE IF NOT EXISTS public.ausencias_tipos (
  tipo       TEXT PRIMARY KEY CHECK (tipo ~ '^[a-z_]+$'),
  rotulo     TEXT NOT NULL CHECK (BTRIM(rotulo) <> ''),
  abate_meta BOOLEAN NOT NULL,
  ordem      SMALLINT NOT NULL
);

COMMENT ON TABLE public.ausencias_tipos IS
  'Os tipos de ausencia e se cada um desconta da meta proporcional. Referencia '
  'global, sem empresa: atestado e atestado em qualquer operacao.';

INSERT INTO public.ausencias_tipos (tipo, rotulo, abate_meta, ordem) VALUES
  ('ferias',         'Férias',         true,   1),
  ('atestado',       'Atestado',       true,   2),
  ('inss',           'INSS',           true,   3),
  ('banco_de_horas', 'Banco de horas', true,   4),
  ('abono',          'Abono',          true,   5),
  ('declaracao',     'Declaração',     true,   6),
  ('licenca',        'Licença',        true,   7),
  ('falta',          'Falta',          false,  8),
  ('suspensao',      'Suspensão',      false,  9),
  ('outros',         'Outros',         false, 10)
ON CONFLICT (tipo) DO NOTHING;

ALTER TABLE public.ausencias_tipos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ausencias_tipos FROM anon;

DROP POLICY IF EXISTS ausencias_tipos_select ON public.ausencias_tipos;
CREATE POLICY ausencias_tipos_select ON public.ausencias_tipos
FOR SELECT TO authenticated
USING (true);

-- ============================================================================
-- 5. As tabelas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feedbacks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Sobre QUEM e o feedback.
  operador_id   UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  autor_id      UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  -- O nome do autor, congelado. O join nao basta: o lider de setor le o
  -- feedback que a gerencia escreveu, e a RLS de `perfis` pode nao lhe mostrar
  -- a gerente — «FeedBack: Karina» e metade da informacao da planilha.
  autor_nome    TEXT NOT NULL,
  data_feedback DATE NOT NULL,
  texto         TEXT NOT NULL CHECK (BTRIM(texto) <> '' AND char_length(texto) <= 5000),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.feedbacks IS
  'Feedback de acompanhamento sobre uma pessoa: autor, data e texto. Leitura '
  'exige ver_feedbacks e alcance pela equipe de hoje. Escrita so por RPC.';

CREATE INDEX IF NOT EXISTS idx_feedbacks_operador
  ON public.feedbacks(operador_id, data_feedback DESC);
CREATE INDEX IF NOT EXISTS idx_feedbacks_empresa
  ON public.feedbacks(empresa_id, data_feedback DESC);
CREATE INDEX IF NOT EXISTS idx_feedbacks_autor
  ON public.feedbacks(autor_id);

CREATE TABLE IF NOT EXISTS public.ausencias (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  operador_id    UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  tipo           TEXT NOT NULL REFERENCES public.ausencias_tipos(tipo),
  -- Os dois dias INCLUSIVE. Um dia so: inicio = fim.
  inicio         DATE NOT NULL,
  fim            DATE NOT NULL,
  -- «ATESTADO/MEIO», «MEIO PERÍODO»: meio dia, e so em ausencia de um dia.
  meio_periodo   BOOLEAN NOT NULL DEFAULT false,
  observacao     TEXT,
  criado_por     UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ausencias_periodo_valido     CHECK (fim >= inicio),
  CONSTRAINT ausencias_meio_periodo_um_dia CHECK (NOT meio_periodo OR inicio = fim)
);

COMMENT ON TABLE public.ausencias IS
  'Periodos em que a pessoa nao trabalhou, com o motivo. Ferias daqui espelham '
  'em perfis.ferias_*. Sobreposicao para a mesma pessoa e recusada pela RPC.';

CREATE INDEX IF NOT EXISTS idx_ausencias_operador
  ON public.ausencias(operador_id, inicio DESC);
CREATE INDEX IF NOT EXISTS idx_ausencias_empresa_periodo
  ON public.ausencias(empresa_id, inicio, fim);
-- A varredura diaria de ferias le so as ferias.
CREATE INDEX IF NOT EXISTS idx_ausencias_ferias
  ON public.ausencias(inicio, fim) WHERE tipo = 'ferias';
CREATE INDEX IF NOT EXISTS idx_ausencias_criado_por
  ON public.ausencias(criado_por);
CREATE INDEX IF NOT EXISTS idx_ausencias_atualizado_por
  ON public.ausencias(atualizado_por);
-- `tipo` fica sem indice: `ausencias_tipos` tem dez linhas e nao se apaga tipo.

-- ============================================================================
-- 6. RLS
-- ============================================================================
--
-- Leitura pela policy, escrita so por RPC. Nenhuma policy de INSERT, UPDATE
-- ou DELETE — o mesmo desenho de `vendas` e `indicacoes`.

ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.feedbacks FROM anon;

DROP POLICY IF EXISTS feedbacks_select ON public.feedbacks;
CREATE POLICY feedbacks_select ON public.feedbacks
FOR SELECT TO authenticated
USING (
  (SELECT public.fn_user_tem('ver_feedbacks'))
  AND public.fn_can_access_empresa(empresa_id)
  AND operador_id IN (SELECT public.fn_acompanhamento_alcancados())
);

ALTER TABLE public.ausencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ausencias FROM anon;

DROP POLICY IF EXISTS ausencias_select ON public.ausencias;
CREATE POLICY ausencias_select ON public.ausencias
FOR SELECT TO authenticated
USING (
  public.fn_can_access_empresa(empresa_id)
  AND operador_id IN (SELECT public.fn_acompanhamento_alcancados())
);

-- ============================================================================
-- 7. O espelho das ferias em `perfis`
-- ============================================================================
--
-- Chamada pelas RPCs de ausencia DEPOIS de gravar, com o que a linha era
-- ANTES (nulos quando e criacao).
--
--   1. Ha ferias em `ausencias` cobrindo hoje? `perfis` passa a dizer isso.
--   2. Nao ha, e a linha que mudou ERA ferias cobrindo hoje? Desfaz — mas so
--      se `perfis` ainda tem exatamente as datas dela. Se tem outras, foi a
--      tela de Usuarios que pos, e o espelho nao mexe no que nao pos.
--
-- No passo 2 o rastro (`ferias_ate`, que a tela de Metas le para avisar «esta
-- pessoa esteve fora») fica quando as ferias foram ENCURTADAS — elas
-- aconteceram — e sai quando foram apagadas ou trocadas de tipo, porque ai
-- nunca aconteceram.
--
-- `desligado` nunca e tocado.

CREATE OR REPLACE FUNCTION public.fn_ausencias_espelhar_ferias(
  p_operador_id  UUID,
  p_antes_tipo   TEXT,
  p_antes_inicio DATE,
  p_antes_fim    DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje      DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_inicio    DATE;
  v_fim       DATE;
  v_r_inicio  DATE;
  v_r_fim     DATE;
BEGIN
  SELECT a.inicio, a.fim
    INTO v_inicio, v_fim
    FROM public.ausencias a
   WHERE a.operador_id = p_operador_id
     AND a.tipo   = 'ferias'
     AND a.inicio <= v_hoje
     AND a.fim    >= v_hoje
   ORDER BY a.inicio
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.perfis p
       SET situacao      = 'ferias',
           ferias_desde  = v_inicio,
           ferias_ate    = v_fim,
           atualizado_em = NOW()
     WHERE p.id = p_operador_id
       AND p.situacao <> 'desligado'
       AND (p.situacao <> 'ferias'
            OR p.ferias_desde IS DISTINCT FROM v_inicio
            OR p.ferias_ate   IS DISTINCT FROM v_fim);
    RETURN;
  END IF;

  IF p_antes_tipo IS DISTINCT FROM 'ferias'
     OR p_antes_inicio IS NULL
     OR p_antes_inicio > v_hoje
     OR p_antes_fim    < v_hoje THEN
    RETURN;
  END IF;

  -- As mesmas ferias, encurtadas para antes de hoje: o rastro fica com a data nova.
  SELECT a.inicio, a.fim
    INTO v_r_inicio, v_r_fim
    FROM public.ausencias a
   WHERE a.operador_id = p_operador_id
     AND a.tipo   = 'ferias'
     AND a.inicio = p_antes_inicio
     AND a.fim    < v_hoje
   LIMIT 1;

  UPDATE public.perfis p
     SET situacao      = 'ativo',
         ferias_desde  = v_r_inicio,
         ferias_ate    = v_r_fim,
         atualizado_em = NOW()
   WHERE p.id = p_operador_id
     AND p.situacao = 'ferias'
     AND p.ferias_desde IS NOT DISTINCT FROM p_antes_inicio
     AND p.ferias_ate   IS NOT DISTINCT FROM p_antes_fim;
END;
$function$;

-- Interna: so as RPCs abaixo (DEFINER, mesmo dono) a chamam. Exposta, deixaria
-- qualquer um trocar a situacao de qualquer perfil.
REVOKE ALL ON FUNCTION public.fn_ausencias_espelhar_ferias(UUID, TEXT, DATE, DATE)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 8. Ferias que comecam sozinhas
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ausencias_iniciar_ferias_diario()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_n    INTEGER;
BEGIN
  UPDATE public.perfis p
     SET situacao      = 'ferias',
         ferias_desde  = a.inicio,
         ferias_ate    = a.fim,
         atualizado_em = NOW()
    FROM (
      SELECT DISTINCT ON (x.operador_id) x.operador_id, x.inicio, x.fim
        FROM public.ausencias x
       WHERE x.tipo   = 'ferias'
         AND x.inicio <= v_hoje
         AND x.fim    >= v_hoje
       ORDER BY x.operador_id, x.inicio
    ) a
   WHERE p.id = a.operador_id
     -- So quem esta ATIVO. Desligado nao volta por ferias, e quem ja esta de
     -- ferias por outra via fica como esta.
     AND p.situacao = 'ativo';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ausencias_iniciar_ferias_diario() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ausencias_iniciar_ferias_diario() TO service_role;

COMMENT ON FUNCTION public.fn_ausencias_iniciar_ferias_diario() IS
  'Versao do pg_cron: poe em ferias quem tem ferias em ausencias comecando hoje '
  'ou antes. O retorno continua sendo fn_encerrar_ferias_diario.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ausencias-iniciar-ferias')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ausencias-iniciar-ferias');
    -- 00:20 de Sao Paulo = 03:20 UTC: cinco minutos DEPOIS de
    -- `ferias-encerrar-vencidas` (03:15). Na troca de um periodo pelo seguinte,
    -- o encerramento devolve a `ativo` e este poe de volta com as datas novas.
    PERFORM cron.schedule('ausencias-iniciar-ferias', '20 3 * * *',
      'SELECT public.fn_ausencias_iniciar_ferias_diario();');
  END IF;
END;
$$;

-- ============================================================================
-- 9. Feedback: gravar e excluir
-- ============================================================================
--
-- `p_id` nulo cria, preenchido corrige. Corrigir e do AUTOR, e so o texto e a
-- data: trocar a pessoa de um feedback e escrever outro feedback.

CREATE OR REPLACE FUNCTION public.fn_feedback_salvar(
  p_id            UUID,
  p_empresa_id    UUID,
  p_operador_id   UUID,
  p_data_feedback DATE,
  p_texto         TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje   DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_texto  TEXT;
  v_autor  TEXT;
  v_linha  public.feedbacks%ROWTYPE;
  v_id     UUID;
BEGIN
  IF NOT public.fn_user_tem('registrar_feedbacks') THEN
    RAISE EXCEPTION 'Seu cargo não pode registrar feedback.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.perfis p WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'A pessoa não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fn_acompanhamento_alcancados() AS a(id) WHERE a.id = p_operador_id
  ) THEN
    RAISE EXCEPTION 'Esta pessoa está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;

  -- Feedback e sobre OUTRA pessoa. Escrever o proprio seria anotacao pessoal
  -- lida pela lideranca como se fosse acompanhamento.
  IF p_operador_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Feedback é sobre outra pessoa, não sobre você.' USING ERRCODE = '22023';
  END IF;

  v_texto := NULLIF(BTRIM(COALESCE(p_texto, '')), '');
  IF v_texto IS NULL THEN
    RAISE EXCEPTION 'O feedback está vazio.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_texto) > 5000 THEN
    RAISE EXCEPTION 'O feedback passou de 5.000 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_data_feedback IS NULL THEN
    RAISE EXCEPTION 'A data do feedback é obrigatória.' USING ERRCODE = '22023';
  END IF;
  IF p_data_feedback > v_hoje THEN
    RAISE EXCEPTION 'Feedback não tem data futura — é o registro de uma conversa que já aconteceu.'
      USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    SELECT COALESCE(NULLIF(BTRIM(p.nome), ''), 'Alguém')
      INTO v_autor
      FROM public.perfis p
     WHERE p.id = (SELECT auth.uid());

    INSERT INTO public.feedbacks (
      empresa_id, operador_id, autor_id, autor_nome, data_feedback, texto
    ) VALUES (
      p_empresa_id, p_operador_id, auth.uid(), COALESCE(v_autor, 'Alguém'), p_data_feedback, v_texto
    )
    RETURNING id INTO v_id;

    RETURN v_id;
  END IF;

  SELECT * INTO v_linha FROM public.feedbacks WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feedback não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_linha.empresa_id <> p_empresa_id OR v_linha.operador_id <> p_operador_id THEN
    RAISE EXCEPTION 'Não dá para mudar a pessoa de um feedback — registre um novo.'
      USING ERRCODE = '22023';
  END IF;

  IF v_linha.autor_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Só quem escreveu o feedback pode corrigi-lo.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.feedbacks
     SET data_feedback = p_data_feedback,
         texto         = v_texto,
         atualizado_em = NOW()
   WHERE id = p_id;

  RETURN p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_feedback_salvar(UUID, UUID, UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_feedback_salvar(UUID, UUID, UUID, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_feedback_salvar(UUID, UUID, UUID, DATE, TEXT) IS
  'Registra (p_id nulo) ou corrige feedback. Corrigir e so do autor, e so texto '
  'e data. Exige registrar_feedbacks e alcance sobre a pessoa.';

CREATE OR REPLACE FUNCTION public.fn_feedback_excluir(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_linha public.feedbacks%ROWTYPE;
BEGIN
  IF NOT public.fn_user_tem('excluir_feedbacks') THEN
    RAISE EXCEPTION 'Seu cargo não pode excluir feedback.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_linha FROM public.feedbacks WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feedback não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_can_access_empresa(v_linha.empresa_id) THEN
    RAISE EXCEPTION 'Este feedback é de outra empresa.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fn_acompanhamento_alcancados() AS a(id) WHERE a.id = v_linha.operador_id
  ) THEN
    RAISE EXCEPTION 'Esta pessoa está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.feedbacks WHERE id = p_id;
  RETURN p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_feedback_excluir(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_feedback_excluir(UUID) TO authenticated;

-- ============================================================================
-- 10. Ausencia: gravar e excluir
-- ============================================================================
--
-- Sobreposicao para a mesma pessoa e recusada. Dois periodos cobrindo o mesmo
-- dia contariam esse dia duas vezes quando a ausencia descontar a meta — e
-- «INSS de 01 a 30» mais «atestado no dia 12» nao e informacao nova, e erro
-- de lancamento.
--
-- A trava contra corrida e o `FOR UPDATE` na linha de `perfis`: duas gravacoes
-- para a mesma pessoa esperam uma pela outra, e a segunda ja ve a primeira
-- ao conferir sobreposicao. `EXCLUDE USING gist` faria o mesmo, mas exige
-- `btree_gist`, que este banco nao tem instalado por migration nenhuma.

CREATE OR REPLACE FUNCTION public.fn_ausencia_salvar(
  p_id           UUID,
  p_empresa_id   UUID,
  p_operador_id  UUID,
  p_tipo         TEXT,
  p_inicio       DATE,
  p_fim          DATE,
  p_meio_periodo BOOLEAN,
  p_observacao   TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_obs          TEXT := NULLIF(BTRIM(COALESCE(p_observacao, '')), '');
  v_meio         BOOLEAN := COALESCE(p_meio_periodo, false);
  v_antes        public.ausencias%ROWTYPE;
  v_choque_tipo  TEXT;
  v_choque_ini   DATE;
  v_choque_fim   DATE;
  v_id           UUID;
BEGIN
  IF NOT public.fn_user_tem('registrar_ausencias') THEN
    RAISE EXCEPTION 'Seu cargo não pode registrar ausência.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  -- Trava a pessoa: ver o cabecalho da secao.
  PERFORM 1 FROM public.perfis p
   WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A pessoa não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fn_acompanhamento_alcancados() AS a(id) WHERE a.id = p_operador_id
  ) THEN
    RAISE EXCEPTION 'Esta pessoa está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ausencias_tipos t WHERE t.tipo = p_tipo) THEN
    RAISE EXCEPTION 'Tipo de ausência desconhecido: %.', COALESCE(p_tipo, '(vazio)')
      USING ERRCODE = '22023';
  END IF;

  IF p_inicio IS NULL OR p_fim IS NULL THEN
    RAISE EXCEPTION 'Informe o primeiro e o último dia da ausência.' USING ERRCODE = '22023';
  END IF;
  IF p_fim < p_inicio THEN
    RAISE EXCEPTION 'O último dia (%) é anterior ao primeiro (%).',
      to_char(p_fim, 'DD/MM/YYYY'), to_char(p_inicio, 'DD/MM/YYYY') USING ERRCODE = '22023';
  END IF;
  IF v_meio AND p_inicio <> p_fim THEN
    RAISE EXCEPTION 'Meio período vale para um dia só.' USING ERRCODE = '22023';
  END IF;
  -- «Outros» sem dizer o que e nao informa nada a quem le depois.
  IF p_tipo = 'outros' AND v_obs IS NULL THEN
    RAISE EXCEPTION 'Em «Outros», diga o motivo na observação.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_antes FROM public.ausencias WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ausência não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    IF v_antes.empresa_id <> p_empresa_id OR v_antes.operador_id <> p_operador_id THEN
      RAISE EXCEPTION 'Não dá para mudar a pessoa de uma ausência — exclua e lance de novo.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT t.rotulo, a.inicio, a.fim
    INTO v_choque_tipo, v_choque_ini, v_choque_fim
    FROM public.ausencias a
    JOIN public.ausencias_tipos t ON t.tipo = a.tipo
   WHERE a.operador_id = p_operador_id
     AND a.id IS DISTINCT FROM p_id
     AND a.inicio <= p_fim
     AND a.fim    >= p_inicio
   ORDER BY a.inicio
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Já existe % de % a % para esta pessoa. Corrija aquela em vez de lançar outra por cima.',
      v_choque_tipo, to_char(v_choque_ini, 'DD/MM/YYYY'), to_char(v_choque_fim, 'DD/MM/YYYY')
      USING ERRCODE = '23P01';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ausencias (
      empresa_id, operador_id, tipo, inicio, fim, meio_periodo, observacao,
      criado_por, atualizado_por
    ) VALUES (
      p_empresa_id, p_operador_id, p_tipo, p_inicio, p_fim, v_meio, v_obs,
      auth.uid(), auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ausencias
       SET tipo           = p_tipo,
           inicio         = p_inicio,
           fim            = p_fim,
           meio_periodo   = v_meio,
           observacao     = v_obs,
           atualizado_por = auth.uid(),
           atualizado_em  = NOW()
     WHERE id = p_id;
    v_id := p_id;
  END IF;

  PERFORM public.fn_ausencias_espelhar_ferias(
    p_operador_id, v_antes.tipo, v_antes.inicio, v_antes.fim
  );

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ausencia_salvar(UUID, UUID, UUID, TEXT, DATE, DATE, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ausencia_salvar(UUID, UUID, UUID, TEXT, DATE, DATE, BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_ausencia_salvar(UUID, UUID, UUID, TEXT, DATE, DATE, BOOLEAN, TEXT) IS
  'Lanca (p_id nulo) ou corrige ausencia. Recusa sobreposicao para a mesma pessoa '
  'e espelha ferias em perfis. Exige registrar_ausencias e alcance.';

CREATE OR REPLACE FUNCTION public.fn_ausencia_excluir(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_linha public.ausencias%ROWTYPE;
BEGIN
  IF NOT public.fn_user_tem('excluir_ausencias') THEN
    RAISE EXCEPTION 'Seu cargo não pode excluir ausência.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_linha FROM public.ausencias WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ausência não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_can_access_empresa(v_linha.empresa_id) THEN
    RAISE EXCEPTION 'Esta ausência é de outra empresa.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fn_acompanhamento_alcancados() AS a(id) WHERE a.id = v_linha.operador_id
  ) THEN
    RAISE EXCEPTION 'Esta pessoa está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.perfis p WHERE p.id = v_linha.operador_id FOR UPDATE;

  DELETE FROM public.ausencias WHERE id = p_id;

  PERFORM public.fn_ausencias_espelhar_ferias(
    v_linha.operador_id, v_linha.tipo, v_linha.inicio, v_linha.fim
  );

  RETURN p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ausencia_excluir(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ausencia_excluir(UUID) TO authenticated;

-- ============================================================================
-- 11. A lista de pessoas da tela
-- ============================================================================
--
-- Uma linha por pessoa alcancada, com o que o lider precisa para achar quem
-- procura sem abrir ninguem: foto, equipe, se esta ausente hoje e quando foi o
-- ultimo feedback.
--
-- DEFINER porque junta tres tabelas e le a equipe pela lideranca, e a regra
-- de alcance NAO e repetida: vem de fn_acompanhamento_alcancados. A contagem
-- de feedback sai nula para quem nao tem `ver_feedbacks` — DEFINER passa por
-- cima da RLS, entao a trava tem que estar escrita aqui.
--
-- Robos ficam de fora (Fase 6): nao recebem feedback nem tiram ferias.
-- Arquivados tambem. Desligados vem, marcados — o historico deles ainda e lido.

CREATE OR REPLACE FUNCTION public.fn_acompanhamento_pessoas(p_empresa_id UUID)
RETURNS TABLE(
  id               UUID,
  nome             TEXT,
  foto_url         TEXT,
  cargo            TEXT,
  situacao         TEXT,
  ferias_ate       DATE,
  setor_id         UUID,
  setor_nome       TEXT,
  equipe_id        UUID,
  equipe_nome      TEXT,
  feedbacks        INTEGER,
  ultimo_feedback  DATE,
  ausente_hoje     TEXT,
  ausente_ate      DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH hoje AS (
    SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE AS d
  ),
  pessoas AS (
    SELECT p.*, public.fn_vendas_equipe_que_credita(p.id) AS equipe_credita
      FROM public.perfis p
     WHERE p.empresa_id = p_empresa_id
       AND public.fn_can_access_empresa(p_empresa_id)
       AND p.id IN (SELECT public.fn_acompanhamento_alcancados())
       AND NOT COALESCE(p.robo, false)
       AND NOT COALESCE(p.arquivado, false)
       AND p.perfil NOT IN ('administrador', 'super_admin')
  )
  SELECT p.id,
         p.nome,
         p.foto_url,
         p.perfil,
         p.situacao,
         p.ferias_ate,
         COALESCE(p.setor_id, e.setor_id),
         s.nome,
         p.equipe_credita,
         e.nome,
         CASE WHEN public.fn_user_tem('ver_feedbacks') THEN f.quantidade END,
         CASE WHEN public.fn_user_tem('ver_feedbacks') THEN f.ultimo END,
         a.tipo,
         a.fim
    FROM pessoas p
    LEFT JOIN public.equipes e ON e.id = p.equipe_credita
    LEFT JOIN public.setores s ON s.id = COALESCE(p.setor_id, e.setor_id)
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INTEGER AS quantidade, MAX(fb.data_feedback) AS ultimo
        FROM public.feedbacks fb
       WHERE fb.operador_id = p.id
    ) f ON TRUE
    LEFT JOIN LATERAL (
      SELECT au.tipo, au.fim
        FROM public.ausencias au
       WHERE au.operador_id = p.id
         AND au.inicio <= (SELECT d FROM hoje)
         AND au.fim    >= (SELECT d FROM hoje)
       ORDER BY au.inicio
       LIMIT 1
    ) a ON TRUE
   ORDER BY p.nome;
$function$;

REVOKE ALL ON FUNCTION public.fn_acompanhamento_pessoas(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_acompanhamento_pessoas(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_acompanhamento_pessoas(UUID) IS
  'As pessoas alcancadas, com foto, equipe que credita, ausencia de hoje e '
  'resumo de feedback (nulo sem ver_feedbacks). Sem robos e arquivados.';

-- ============================================================================
-- 12. Semear e verificar
-- ============================================================================

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

DO $$
DECLARE
  v_faltando TEXT;
  n INTEGER;
BEGIN
  SELECT string_agg(DISTINCT format('%s/%s/%s', emp.slug, cp.cargo, cat.chave), ', ')
    INTO v_faltando
    FROM public.empresas emp
    JOIN public.cargos_permissoes cp ON cp.empresa_id = emp.id
    CROSS JOIN public.fn_permissoes_catalogo() cat
   WHERE (cat.tenants IS NULL OR emp.slug = ANY(cat.tenants))
     AND cp.cargo <> 'rh'
     AND NOT (cp.permissoes ? cat.chave);

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves ausentes após semear: %', v_faltando;
  END IF;

  -- As testemunhas da cadeia: uma de cada elo que ja se partiu ou que veio antes.
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'tickets_excluir') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: tickets_excluir sumiu.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'editar_metas_vendas') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: editar_metas_vendas sumiu.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'excluir_indicacoes') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: excluir_indicacoes sumiu.';
  END IF;

  SELECT COUNT(*) INTO n FROM public.fn_permissoes_catalogo()
   WHERE chave IN (
     'ver_acompanhamento',
     'acompanhamento_escopo_individual', 'acompanhamento_escopo_equipe',
     'acompanhamento_escopo_setor', 'acompanhamento_escopo_todos_setores',
     'ver_feedbacks', 'registrar_feedbacks', 'excluir_feedbacks',
     'registrar_ausencias', 'excluir_ausencias'
   );
  -- Exatamente 10: menos e chave perdida, mais e chave repetida pela cadeia.
  IF n <> 10 THEN
    RAISE EXCEPTION 'Esperava 10 chaves de acompanhamento no catalogo, achei %', n;
  END IF;

  -- `CREATE TABLE IF NOT EXISTS` passa calado por uma tabela de mesmo nome e
  -- outro desenho. As colunas que as RPCs usam precisam estar la.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'feedbacks' AND column_name = 'autor_nome'
  ) THEN
    RAISE EXCEPTION 'public.feedbacks existe sem autor_nome — ha uma tabela antiga com este nome.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ausencias' AND column_name = 'meio_periodo'
  ) THEN
    RAISE EXCEPTION 'public.ausencias existe sem meio_periodo — ha uma tabela antiga com este nome.';
  END IF;

  SELECT COUNT(*) INTO n FROM public.ausencias_tipos;
  IF n < 10 THEN
    RAISE EXCEPTION 'ausencias_tipos ficou com % tipos; esperava 10.', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fn_abas_escopo() WHERE aba = 'acompanhamento') THEN
    RAISE EXCEPTION 'A aba acompanhamento nao entrou no registro de escopo.';
  END IF;

  SELECT COUNT(*) INTO n FROM public.fn_abas_escopo();
  IF n <> 14 THEN
    RAISE EXCEPTION 'fn_abas_escopo ficou com % abas; esperava 14.', n;
  END IF;

  -- As colunas de perfis que o espelho e a lista usam.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'perfis' AND column_name = 'ferias_ate'
  ) THEN
    RAISE EXCEPTION 'perfis.ferias_ate nao existe — aplique 20260901100000 antes.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'perfis' AND column_name = 'robo'
  ) THEN
    RAISE EXCEPTION 'perfis.robo nao existe — aplique 20260915160000 antes.';
  END IF;
END $$;

COMMIT;
