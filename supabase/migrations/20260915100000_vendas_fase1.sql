-- ============================================================================
-- Comercial, Fase 1: a venda, o dia e o ciclo
-- ============================================================================
--
-- ✅ APLICADA em 15/09/2026. Escrita junto com o plano
--     (docs/PLANO-COMERCIAL-VENDAS.md).
--
-- ## A regra que esta tabela existe para segurar
--
-- Uma venda so conta para operador, equipe e setor quando esta **confirmada E
-- assinada**. As duas, sempre. Medido no relatorio de prospeccao de
-- setembro/2026, empresa toda:
--
--   2.497 confirmadas e assinadas ...... R$ 11.890.148,62   <- a regua
--     109 confirmadas SEM assinatura ... R$    536.355,71
--     187 DEVOLVIDAS ainda assinadas ... R$    877.917,32
--       1 CANCELADA ainda assinada ..... R$      6.972,00
--
-- Olhar so a situacao deixa entrar 109 vendas que ninguem assinou. Olhar so a
-- assinatura deixa entrar 188 que voltaram — a assinatura NAO se desfaz na
-- devolucao.
--
-- Por isso a regua nao mora numa consulta: mora em duas colunas GERADAS,
-- `conta_na_meta` e `valor_na_meta`. Uma tela nova que some `valor_total` sem
-- filtrar erra; somando `valor_na_meta` acerta sem saber da regra. Foi a licao
-- das quatro listas de cargo que este projeto ja documentou em PERFIS_*: a
-- mesma pergunta respondida em varios lugares diverge com o tempo.
--
-- ## Uma linha por NR, e o historico ao lado
--
-- `UNIQUE (empresa_id, nr_documento)`. O relatorio traz o mesmo NR duas vezes
-- quando houve devolucao seguida de reconfirmacao com troca de produto — 19
-- casos em agosto (R$ 70.156,60 de faturamento inflado se somado), 4 em
-- setembro (R$ 18.584,00). E entre meses e pior: 99 NRs aparecem nos dois
-- arquivos, 16 deles confirmados nos dois. Somar agosto e setembro sem dedupe
-- conta **R$ 432.714,40 de faturamento duas vezes**, tudo para o mesmo
-- vendedor (o vendedor e o mesmo em 99 de 99 casos).
--
-- A tabela guarda o estado ATUAL do NR; `vendas_eventos` guarda como ele
-- chegou ali. E assim que a regra 5 do plano se cumpre: «venda confirmada que
-- vira devolvida sai do recebimento, porem fica a informacao para acompanhar».
--
-- ## Os dois eixos de data
--
-- `data_confirmacao` e o eixo OFICIAL: define mes, meta e valor.
-- `data_venda` e o eixo do trabalho do dia, e o unico jeito de enxergar o que
-- ainda esta em aberto — o relatorio geral nunca traz venda aberta (medido nos
-- dois meses: agosto 6.131/564/260, setembro 2.606/188/44, zero aberta nos
-- dois), porque para ter data de confirmacao a venda precisou ser confirmada.
--
-- ## Escrita so por RPC
--
-- Nenhuma policy de INSERT, UPDATE ou DELETE. Quatro funcoes, cada uma com a
-- sua chave: salvar, confirmar, excluir, restaurar. Confirmar e separado de
-- salvar de proposito — e o ato do lider, e o operador nao o tem.
--
-- ## O que esta migration NAO faz
--
-- Nao importa relatorio (Fase 2 e 3), nao liga franquia a setor (Fase 2), nao
-- mexe em meta (Fase 5) e nao cria area de IA (Fase 6). `origem` ja nasce com
-- os tres valores porque a coluna e do registro, nao do importador — mas so
-- 'manual' e gravado por enquanto.
--
-- Escrita de dados: nenhuma linha de venda. Semeia permissoes novas nos cargos
-- existentes, como toda migration de catalogo.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. Catalogo de permissoes
-- ============================================================================
--
-- `fn_permissoes_catalogo` e uma cadeia de funcoes `_antes_`. Acrescentar
-- chave e congelar a de hoje (corpo de 20260914170000) e redefinir a de cima.

-- ⚠️ A cadeia parte de `_antes_tickets_excluir_20260914`, e nao de
-- `_antes_fechamento_20260914`.
--
-- Esta migration foi escrita quando o topo da cadeia era o Fechamento
-- (20260914170000). Enquanto isso, 20260914200000 entrou na main com a chave
-- `tickets_excluir` e virou o novo topo. Continuar partindo do Fechamento
-- faria esta funcao redefinir `fn_permissoes_catalogo()` SEM `tickets_excluir`,
-- e a chave sumiria do catalogo em silencio — a tela de Permissoes deixaria de
-- mostra-la e o `fn_user_tem` dela passaria a responder falso para todo mundo.
--
-- E exatamente o defeito que a cadeia de `_antes_` existe para tornar visivel:
-- quem acrescenta chave precisa congelar o topo de VERDADE, nao o topo de
-- quando comecou a escrever.
CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo_antes_vendas_20260915()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_tickets_excluir_20260914()
  UNION ALL
  SELECT * FROM (VALUES
    ('tickets_excluir', NULL::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_vendas_20260915() IS
  'Retrato do catalogo antes das chaves da aba Vendas (Comercial, 15/09/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_vendas_20260915()
  UNION ALL
  SELECT * FROM (VALUES
    -- A aba e os quatro niveis de alcance. `tenants = {comercial}` porque
    -- venda nao existe na cobranca: mostrar o interruptor na BookPlay seria
    -- oferecer um controle que nao controla nada.
    --
    -- Os padroes NAO sao vazios, e a diferenca em relacao a aba Fechamento e
    -- deliberada: la a gerencia ganharia a aba depois, pelo painel; aqui o
    -- operador precisa lancar a venda dele no primeiro dia, senao a aba nasce
    -- inutil. O que nasce fechado e o que decide dinheiro alheio.
    ('ver_vendas',                   ARRAY['comercial']::TEXT[],
       ARRAY['operador','lider','elite','gerencia','diretoria']::TEXT[], false),
    ('vendas_escopo_individual',     ARRAY['comercial']::TEXT[],
       ARRAY['operador']::TEXT[], false),
    ('vendas_escopo_equipe',         ARRAY['comercial']::TEXT[],
       ARRAY[]::TEXT[], false),
    ('vendas_escopo_setor',          ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite']::TEXT[], false),
    ('vendas_escopo_todos_setores',  ARRAY['comercial']::TEXT[],
       ARRAY['gerencia','diretoria']::TEXT[], false),

    ('criar_vendas',                 ARRAY['comercial']::TEXT[],
       ARRAY['operador','lider','elite','gerencia']::TEXT[], false),
    ('editar_vendas',                ARRAY['comercial']::TEXT[],
       ARRAY['operador','lider','elite','gerencia']::TEXT[], false),

    -- Confirmar e o ato do LIDER. O operador lanca e acompanha; quem valida e
    -- quem responde pelo placar. E a unica chave de escrita que o operador nao
    -- recebe, e e por isso que ela e separada de `editar_vendas`.
    ('confirmar_vendas',             ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia']::TEXT[], false),

    ('excluir_vendas',               ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia']::TEXT[], false),
    ('ver_lixeira_vendas',           ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('restaurar_vendas',             ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao 20260915 adiciona as chaves da '
  'aba Vendas, so no tenant comercial.';

-- ============================================================================
-- 2. A aba `vendas` no registro de escopo
-- ============================================================================
--
-- Sem esta linha `fn_user_escopo('vendas')` devolve -1 para todo mundo e a RLS
-- abaixo nao entregaria linha nenhuma. As entradas anteriores sao repetidas na
-- integra: `fn_abas_escopo` e redefinida por inteiro (corpo de 20260914170000).
--
-- Quatro niveis, e nao dois como o Fechamento: aqui existe operador de
-- verdade, que precisa ver a propria carteira e so ela.

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
    ('vendas',           'ver_vendas');
$function$;

COMMENT ON FUNCTION public.fn_abas_escopo() IS
  'Registro de abas com escopo. `vendas` entrou em 20260915 com os quatro '
  'niveis (individual, equipe, setor, todos_setores).';

-- ============================================================================
-- 3. A tabela
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vendas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,

  -- ON DELETE RESTRICT, e nao CASCADE: apagar um perfil nao pode levar junto o
  -- faturamento do mes. Quem sai da operacao e desligado, nao removido.
  operador_id       UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE RESTRICT,
  setor_id          UUID REFERENCES public.setores(id)  ON DELETE SET NULL,
  equipe_id         UUID REFERENCES public.equipes(id)  ON DELETE SET NULL,

  -- O NR do documento, como o ERP o chama. E a chave da venda no mundo real.
  nr_documento      TEXT NOT NULL CHECK (BTRIM(nr_documento) <> ''),
  cliente           TEXT,
  uf                CHAR(2),

  valor_total       NUMERIC(14,2) NOT NULL CHECK (valor_total >= 0),
  -- Entrada e oportunista (regra 3 do plano): entra se o relatorio trouxer, ou
  -- se o operador digitar. NULL significa «nao se sabe», e nao «foi zero».
  valor_entrada     NUMERIC(14,2) CHECK (valor_entrada IS NULL OR valor_entrada >= 0),
  valor_recebido    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor_recebido >= 0),
  forma_pagamento   TEXT,

  data_venda        DATE NOT NULL,
  data_confirmacao  DATE,

  situacao          TEXT NOT NULL DEFAULT 'aberta'
                      CHECK (situacao IN ('aberta','confirmada','cancelada','devolvida')),
  contrato_assinado BOOLEAN NOT NULL DEFAULT FALSE,
  motivo            TEXT,

  origem            TEXT NOT NULL DEFAULT 'manual'
                      CHECK (origem IN ('manual','setor','geral')),

  confirmado_por    UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  confirmado_em     TIMESTAMPTZ,

  criado_por        UUID,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ── A regua, no banco ────────────────────────────────────────────────────
  -- Geradas para que nenhuma consulta futura precise lembrar da regra. Somar
  -- `valor_na_meta` acerta; somar `valor_total` conta devolvida.
  conta_na_meta     BOOLEAN GENERATED ALWAYS AS (
                      situacao = 'confirmada' AND contrato_assinado
                    ) STORED,
  valor_na_meta     NUMERIC(14,2) GENERATED ALWAYS AS (
                      CASE WHEN situacao = 'confirmada' AND contrato_assinado
                           THEN valor_total ELSE 0 END
                    ) STORED,

  -- Uma linha por NR. O historico de como ele chegou aqui mora em
  -- `vendas_eventos` — ver o cabecalho.
  CONSTRAINT vendas_nr_unico UNIQUE (empresa_id, nr_documento),

  -- Confirmada sem data de confirmacao nao teria mes, e o mes e o eixo
  -- oficial. O banco recusa em vez de deixar a venda fora de todo relatorio.
  CONSTRAINT vendas_confirmada_tem_data
    CHECK (situacao <> 'confirmada' OR data_confirmacao IS NOT NULL),

  -- Aberta e o estado de quem ainda nao passou pelo lider: nao pode estar
  -- assinada nem carregar carimbo de confirmacao.
  CONSTRAINT vendas_aberta_nao_confirmada
    CHECK (situacao <> 'aberta' OR (contrato_assinado = FALSE AND confirmado_em IS NULL)),

  CONSTRAINT vendas_uf_valida
    CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$')
);

-- A leitura da tela e sempre «esta empresa, neste recorte de dia».
CREATE INDEX IF NOT EXISTS idx_vendas_empresa_data_venda
  ON public.vendas(empresa_id, data_venda DESC);
CREATE INDEX IF NOT EXISTS idx_vendas_empresa_data_confirmacao
  ON public.vendas(empresa_id, data_confirmacao DESC)
  WHERE data_confirmacao IS NOT NULL;

-- O placar do operador e do setor: parcial, porque so o que conta e somado.
CREATE INDEX IF NOT EXISTS idx_vendas_operador_na_meta
  ON public.vendas(empresa_id, operador_id, data_confirmacao)
  WHERE conta_na_meta;
CREATE INDEX IF NOT EXISTS idx_vendas_setor_na_meta
  ON public.vendas(empresa_id, setor_id, data_confirmacao)
  WHERE conta_na_meta;

-- A fila do lider: o que espera confirmacao ou assinatura.
CREATE INDEX IF NOT EXISTS idx_vendas_pendentes
  ON public.vendas(empresa_id, situacao, contrato_assinado)
  WHERE situacao = 'aberta' OR (situacao = 'confirmada' AND NOT contrato_assinado);

-- FK sem indice deixa o ON DELETE SET NULL varrendo a tabela.
CREATE INDEX IF NOT EXISTS idx_vendas_equipe ON public.vendas(equipe_id);

COMMENT ON TABLE public.vendas IS
  'Uma linha por NR de venda, por empresa. `conta_na_meta` e `valor_na_meta` '
  'sao GERADAS e implementam a regua «confirmada E assinada» — some sempre '
  'valor_na_meta, nunca valor_total. Escrita so pelas fn_venda_*.';

COMMENT ON COLUMN public.vendas.data_confirmacao IS
  'O eixo OFICIAL: define mes, meta e valor. Nao confundir com data_venda, que '
  'e o eixo do trabalho do dia e o unico que enxerga venda em aberto.';

COMMENT ON COLUMN public.vendas.origem IS
  'Qual das tres camadas escreveu esta linha: manual (operador), setor '
  '(relatorio do setor, previa) ou geral (relatorio geral, oficial). A de cima '
  'corrige a de baixo; a de baixo nunca desfaz a de cima.';

COMMENT ON COLUMN public.vendas.valor_na_meta IS
  'valor_total quando a venda esta na regua, 0 fora dela. Existe para que uma '
  'tela nova nao precise conhecer a regra para somar certo.';

-- ============================================================================
-- 4. O historico: como o NR chegou ao estado de hoje
-- ============================================================================
--
-- Cumpre a regra 5 do plano. Sem isto, a venda confirmada que vira devolvida
-- simplesmente muda de valor e ninguem consegue explicar a diferenca do mes.

CREATE TABLE IF NOT EXISTS public.vendas_eventos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id       UUID NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL CHECK (tipo IN (
                   'criada', 'editada', 'confirmada', 'assinada',
                   'revertida', 'excluida', 'restaurada'
                 )),
  situacao_antes TEXT,
  situacao_depois TEXT,
  assinado_antes  BOOLEAN,
  assinado_depois BOOLEAN,
  valor_antes    NUMERIC(14,2),
  valor_depois   NUMERIC(14,2),
  origem         TEXT,
  motivo         TEXT,
  autor_id       UUID,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendas_eventos_venda
  ON public.vendas_eventos(venda_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_vendas_eventos_empresa_tipo
  ON public.vendas_eventos(empresa_id, tipo, criado_em DESC);

COMMENT ON TABLE public.vendas_eventos IS
  'Historico de estado de cada NR. `revertida` e o evento da regra 5: venda '
  'confirmada que passou a devolvida ou cancelada sai do recebimento e deixa '
  'este rastro.';

-- ============================================================================
-- 5. A lixeira
-- ============================================================================
--
-- Mesmo desenho de `lixeira_acordos`: retrato completo em jsonb, para a
-- restauracao nao depender de a tabela de origem ter as mesmas colunas de
-- quando a linha saiu. Sete dias, e nao tres como a de acordos: a conferencia
-- do comercial acontece contra um relatorio que so fecha no fim do mes.

CREATE TABLE IF NOT EXISTS public.lixeira_vendas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id          UUID NOT NULL,
  empresa_id        UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  operador_id       UUID,
  operador_nome     TEXT,
  nr_documento      TEXT,
  cliente           TEXT,
  valor_total       NUMERIC(14,2),
  data_venda        DATE,
  situacao          TEXT,
  contrato_assinado BOOLEAN,
  dados_completos   JSONB NOT NULL,
  motivo            TEXT,
  excluido_por_id   UUID,
  excluido_por_nome TEXT,
  excluido_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em         TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_lixeira_vendas_empresa
  ON public.lixeira_vendas(empresa_id, excluido_em DESC);

COMMENT ON TABLE public.lixeira_vendas IS
  'Vendas excluidas, com retrato completo em dados_completos. Sete dias — o '
  'comercial confere contra um relatorio que so fecha no fim do mes.';

-- ============================================================================
-- 6. Alcance: quem enxerga a venda de quem
-- ============================================================================
--
-- A propria venda sempre se ve, desde que a aba esteja ligada — e o «o
-- operador ja teria esse controle» do pedido. Dali para cima:
--
--   nivel 3 .. a empresa inteira
--   nivel 2 .. os setores da pessoa (cadastro de hoje, clone incluido)
--   nivel 1 .. as equipes em que ela esta ou lidera
--
-- Escrito como conjunto, e nao como funcao por linha: o nivel e os conjuntos
-- sao resolvidos uma vez (InitPlan) e a linha so compara colunas. Uma funcao
-- chamada por linha aqui custaria o mesmo que a busca em `perfis` custava
-- antes de 20260913 — 140ms contra 0,011ms.

ALTER TABLE public.vendas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_eventos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lixeira_vendas  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.vendas         FROM anon;
REVOKE ALL ON TABLE public.vendas_eventos FROM anon;
REVOKE ALL ON TABLE public.lixeira_vendas FROM anon;

DROP POLICY IF EXISTS vendas_select ON public.vendas;
CREATE POLICY vendas_select ON public.vendas
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_tem('ver_vendas'))
    AND public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = (SELECT auth.uid())
      OR (SELECT public.fn_user_escopo('vendas')) >= 3
      OR (
        (SELECT public.fn_user_escopo('vendas')) = 2
        AND setor_id IN (
          SELECT s FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s
        )
      )
      OR (
        (SELECT public.fn_user_escopo('vendas')) = 1
        AND equipe_id IN (
          SELECT e.equipe_id FROM public.fn_equipes_com_lideranca((SELECT auth.uid())) AS e
        )
      )
    )
  );

COMMENT ON POLICY vendas_select ON public.vendas IS
  'A propria venda sempre, desde que a aba esteja ligada. Acima disso, o nivel '
  'de fn_user_escopo(''vendas''): 3 = empresa, 2 = setores da pessoa, 1 = equipes.';

-- O evento acompanha a venda: quem ve a linha ve a historia dela.
DROP POLICY IF EXISTS vendas_eventos_select ON public.vendas_eventos;
CREATE POLICY vendas_eventos_select ON public.vendas_eventos
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = venda_id)
  );

COMMENT ON POLICY vendas_eventos_select ON public.vendas_eventos IS
  'O EXISTS atravessa a policy de `vendas`: so ve o evento quem ve a venda. '
  'Nao repetir a regra de alcance aqui — duas copias divergem.';

DROP POLICY IF EXISTS lixeira_vendas_select ON public.lixeira_vendas;
CREATE POLICY lixeira_vendas_select ON public.lixeira_vendas
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_tem('ver_lixeira_vendas'))
    AND public.fn_can_access_empresa(empresa_id)
  );

-- ============================================================================
-- 7. O alcance de ESCRITA, em uma funcao
-- ============================================================================
--
-- A leitura e policy; a escrita passa pelas RPCs, e as quatro fazem a mesma
-- pergunta. Uma funcao so, para nao divergirem.

CREATE OR REPLACE FUNCTION public.fn_vendas_alcanca(
  p_empresa_id UUID, p_operador_id UUID, p_setor_id UUID, p_equipe_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_can_access_empresa(p_empresa_id)
    AND (
      p_operador_id = (SELECT auth.uid())
      OR public.fn_user_escopo('vendas') >= 3
      OR (
        public.fn_user_escopo('vendas') = 2
        AND p_setor_id IN (
          SELECT s FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s
        )
      )
      OR (
        public.fn_user_escopo('vendas') = 1
        AND p_equipe_id IN (
          SELECT e.equipe_id FROM public.fn_equipes_com_lideranca((SELECT auth.uid())) AS e
        )
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_alcanca(UUID, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_alcanca(UUID, UUID, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_alcanca(UUID, UUID, UUID, UUID) IS
  'O usuario logado alcanca esta venda? Espelha a policy vendas_select — os '
  'dois lados mudam juntos.';

-- ============================================================================
-- 8. Lancar e editar
-- ============================================================================
--
-- Uma funcao para as duas coisas: `p_id` nulo cria, preenchido edita. Editar
-- NAO muda situacao nem assinatura — isso e `fn_venda_confirmar`, e a
-- separacao existe para que `editar_vendas` no operador nao vire o poder de
-- validar a propria venda.

CREATE OR REPLACE FUNCTION public.fn_venda_salvar(
  p_id              UUID,
  p_empresa_id      UUID,
  p_operador_id     UUID,
  p_nr_documento    TEXT,
  p_cliente         TEXT,
  p_uf              TEXT,
  p_valor_total     NUMERIC,
  p_valor_entrada   NUMERIC,
  p_forma_pagamento TEXT,
  p_data_venda      DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id       UUID;
  v_nr       TEXT := BTRIM(COALESCE(p_nr_documento, ''));
  v_uf       CHAR(2) := NULLIF(UPPER(BTRIM(COALESCE(p_uf, ''))), '');
  v_setor    UUID;
  v_equipe   UUID;
  v_antes    public.vendas%ROWTYPE;
  v_novo     BOOLEAN := p_id IS NULL;
BEGIN
  IF v_novo AND NOT public.fn_user_tem('criar_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode lançar vendas.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_novo AND NOT public.fn_user_tem('editar_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode editar vendas.' USING ERRCODE = '42501';
  END IF;

  IF p_empresa_id IS NULL OR p_operador_id IS NULL OR p_data_venda IS NULL THEN
    RAISE EXCEPTION 'Venda incompleta: empresa, operador e data da venda são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF v_nr = '' THEN
    RAISE EXCEPTION 'O NR do documento é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF p_valor_total IS NULL OR p_valor_total < 0 THEN
    RAISE EXCEPTION 'O valor total da venda precisa ser um número igual ou maior que zero.'
      USING ERRCODE = '22023';
  END IF;

  -- A entrada e parte do valor, nunca maior que ele. Deixar passar faria a
  -- tela mostrar «pagou mais do que comprou» sem que ninguem soubesse de onde.
  IF p_valor_entrada IS NOT NULL AND p_valor_entrada > p_valor_total THEN
    RAISE EXCEPTION 'A entrada não pode ser maior que o valor total da venda.'
      USING ERRCODE = '22023';
  END IF;

  -- O setor e a equipe saem do cadastro do operador, e nao do formulario: sao
  -- a mesma pergunta que o Painel Lider ja responde, e digita-las de novo
  -- criaria uma segunda verdade.
  SELECT p.setor_id, p.equipe_id INTO v_setor, v_equipe
    FROM public.perfis p
   WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O operador não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.fn_vendas_alcanca(p_empresa_id, p_operador_id, v_setor, v_equipe) THEN
    RAISE EXCEPTION 'Esta venda está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;

  IF v_novo THEN
    INSERT INTO public.vendas (
      empresa_id, operador_id, setor_id, equipe_id, nr_documento, cliente, uf,
      valor_total, valor_entrada, forma_pagamento, data_venda,
      situacao, origem, criado_por
    ) VALUES (
      p_empresa_id, p_operador_id, v_setor, v_equipe, v_nr, NULLIF(BTRIM(p_cliente), ''), v_uf,
      p_valor_total, p_valor_entrada, NULLIF(BTRIM(p_forma_pagamento), ''), p_data_venda,
      'aberta', 'manual', auth.uid()
    )
    RETURNING id INTO v_id;

    INSERT INTO public.vendas_eventos (
      venda_id, empresa_id, tipo, situacao_depois, assinado_depois,
      valor_depois, origem, autor_id
    ) VALUES (
      v_id, p_empresa_id, 'criada', 'aberta', FALSE, p_valor_total, 'manual', auth.uid()
    );

    RETURN v_id;
  END IF;

  SELECT * INTO v_antes FROM public.vendas WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_vendas_alcanca(
       v_antes.empresa_id, v_antes.operador_id, v_antes.setor_id, v_antes.equipe_id
     ) THEN
    RAISE EXCEPTION 'Esta venda está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;

  -- A linha que veio do relatorio geral nao se edita a mao: ela e o retrato
  -- oficial, e a proxima importacao desfaria a edicao em silencio. Corrigir
  -- oficial e trabalho da conciliacao (Fase 4), com registro.
  IF v_antes.origem = 'geral' THEN
    RAISE EXCEPTION 'Esta venda veio do relatório geral e não pode ser editada à mão.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.vendas SET
    operador_id     = p_operador_id,
    setor_id        = v_setor,
    equipe_id       = v_equipe,
    nr_documento    = v_nr,
    cliente         = NULLIF(BTRIM(p_cliente), ''),
    uf              = v_uf,
    valor_total     = p_valor_total,
    valor_entrada   = p_valor_entrada,
    forma_pagamento = NULLIF(BTRIM(p_forma_pagamento), ''),
    data_venda      = p_data_venda,
    atualizado_em   = NOW()
  WHERE id = p_id;

  INSERT INTO public.vendas_eventos (
    venda_id, empresa_id, tipo, situacao_antes, situacao_depois,
    valor_antes, valor_depois, origem, autor_id
  ) VALUES (
    p_id, v_antes.empresa_id, 'editada', v_antes.situacao, v_antes.situacao,
    v_antes.valor_total, p_valor_total, v_antes.origem, auth.uid()
  );

  RETURN p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_venda_salvar(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_venda_salvar(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_venda_salvar(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, DATE) IS
  'Lanca (p_id nulo) ou edita uma venda. NAO muda situacao nem assinatura — '
  'isso e fn_venda_confirmar. Setor e equipe saem do cadastro do operador.';

-- ============================================================================
-- 9. Confirmar — o ato do lider
-- ============================================================================
--
-- E aqui que a regua acontece, e e por isso que a funcao recebe as DUAS
-- informacoes juntas: situacao e assinatura. Separa-las deixaria a tela fazer
-- duas chamadas e a venda existir, entre uma e outra, num estado que ninguem
-- pediu.
--
-- Confirmada que passa a devolvida ou cancelada gera evento `revertida` — a
-- regra 5. O valor sai do recebimento sozinho, porque `valor_na_meta` e
-- gerada: nao ha nada para lembrar de zerar.

CREATE OR REPLACE FUNCTION public.fn_venda_confirmar(
  p_id               UUID,
  p_situacao         TEXT,
  p_assinado         BOOLEAN,
  p_data_confirmacao DATE,
  p_valor_recebido   NUMERIC,
  p_motivo           TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_antes    public.vendas%ROWTYPE;
  v_data     DATE := p_data_confirmacao;
  v_tipo     TEXT;
  v_revertida BOOLEAN;
BEGIN
  IF NOT public.fn_user_tem('confirmar_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode confirmar vendas.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_antes FROM public.vendas WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_vendas_alcanca(
       v_antes.empresa_id, v_antes.operador_id, v_antes.setor_id, v_antes.equipe_id
     ) THEN
    RAISE EXCEPTION 'Esta venda está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;

  IF p_situacao NOT IN ('aberta','confirmada','cancelada','devolvida') THEN
    RAISE EXCEPTION 'Situação inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_valor_recebido IS NOT NULL AND p_valor_recebido < 0 THEN
    RAISE EXCEPTION 'O valor recebido não pode ser negativo.' USING ERRCODE = '22023';
  END IF;

  -- Confirmar sem dizer quando e confirmar hoje. O CHECK da tabela recusaria
  -- o nulo; recusar aqui com uma data obvia seria atrito sem ganho.
  IF p_situacao = 'confirmada' AND v_data IS NULL THEN
    v_data := COALESCE(v_antes.data_confirmacao, CURRENT_DATE);
  END IF;

  -- Voltar para aberta e desfazer o carimbo inteiro — o CHECK
  -- `vendas_aberta_nao_confirmada` exige, e a intencao e a mesma.
  v_revertida := v_antes.conta_na_meta
                 AND p_situacao IN ('cancelada', 'devolvida');

  UPDATE public.vendas SET
    situacao          = p_situacao,
    contrato_assinado = CASE WHEN p_situacao = 'aberta' THEN FALSE
                             ELSE COALESCE(p_assinado, contrato_assinado) END,
    data_confirmacao  = CASE WHEN p_situacao = 'aberta' THEN NULL ELSE v_data END,
    valor_recebido    = COALESCE(p_valor_recebido, valor_recebido),
    motivo            = NULLIF(BTRIM(p_motivo), ''),
    confirmado_por    = CASE WHEN p_situacao = 'aberta' THEN NULL ELSE auth.uid() END,
    confirmado_em     = CASE WHEN p_situacao = 'aberta' THEN NULL ELSE NOW() END,
    atualizado_em     = NOW()
  WHERE id = p_id;

  v_tipo := CASE
    WHEN v_revertida                                        THEN 'revertida'
    WHEN p_situacao = 'confirmada' AND COALESCE(p_assinado, v_antes.contrato_assinado)
                                    AND NOT v_antes.contrato_assinado THEN 'assinada'
    WHEN p_situacao = 'confirmada'                          THEN 'confirmada'
    ELSE 'editada'
  END;

  INSERT INTO public.vendas_eventos (
    venda_id, empresa_id, tipo, situacao_antes, situacao_depois,
    assinado_antes, assinado_depois, valor_antes, valor_depois,
    origem, motivo, autor_id
  ) VALUES (
    p_id, v_antes.empresa_id, v_tipo, v_antes.situacao, p_situacao,
    v_antes.contrato_assinado, COALESCE(p_assinado, v_antes.contrato_assinado),
    v_antes.valor_na_meta,
    (SELECT valor_na_meta FROM public.vendas WHERE id = p_id),
    v_antes.origem, NULLIF(BTRIM(p_motivo), ''), auth.uid()
  );

  RETURN p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_venda_confirmar(UUID, TEXT, BOOLEAN, DATE, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_venda_confirmar(UUID, TEXT, BOOLEAN, DATE, NUMERIC, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_venda_confirmar(UUID, TEXT, BOOLEAN, DATE, NUMERIC, TEXT) IS
  'O ato do lider: situacao e assinatura juntas, porque e o par que decide se a '
  'venda conta. Confirmada que vira devolvida ou cancelada gera evento '
  '`revertida` (regra 5 do plano).';

-- ============================================================================
-- 10. Excluir e restaurar
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_venda_excluir(p_id UUID, p_motivo TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_antes public.vendas%ROWTYPE;
  v_nome  TEXT;
  v_autor TEXT;
  v_lix   UUID;
BEGIN
  IF NOT public.fn_user_tem('excluir_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode excluir vendas.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_antes FROM public.vendas WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_vendas_alcanca(
       v_antes.empresa_id, v_antes.operador_id, v_antes.setor_id, v_antes.equipe_id
     ) THEN
    RAISE EXCEPTION 'Esta venda está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;

  SELECT nome INTO v_nome  FROM public.perfis WHERE id = v_antes.operador_id;
  SELECT nome INTO v_autor FROM public.perfis WHERE id = auth.uid();

  INSERT INTO public.lixeira_vendas (
    venda_id, empresa_id, operador_id, operador_nome, nr_documento, cliente,
    valor_total, data_venda, situacao, contrato_assinado, dados_completos,
    motivo, excluido_por_id, excluido_por_nome
  ) VALUES (
    v_antes.id, v_antes.empresa_id, v_antes.operador_id, v_nome,
    v_antes.nr_documento, v_antes.cliente, v_antes.valor_total, v_antes.data_venda,
    v_antes.situacao, v_antes.contrato_assinado, to_jsonb(v_antes),
    NULLIF(BTRIM(p_motivo), ''), auth.uid(), v_autor
  )
  RETURNING id INTO v_lix;

  -- O evento e gravado ANTES do DELETE: `vendas_eventos.venda_id` cascateia, e
  -- o rastro da exclusao morreria junto com a linha. Quem quer o historico de
  -- uma venda excluida procura na lixeira, onde `dados_completos` o guarda.
  INSERT INTO public.vendas_eventos (
    venda_id, empresa_id, tipo, situacao_antes, assinado_antes,
    valor_antes, origem, motivo, autor_id
  ) VALUES (
    p_id, v_antes.empresa_id, 'excluida', v_antes.situacao, v_antes.contrato_assinado,
    v_antes.valor_na_meta, v_antes.origem, NULLIF(BTRIM(p_motivo), ''), auth.uid()
  );

  DELETE FROM public.vendas WHERE id = p_id;
  RETURN v_lix;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_venda_excluir(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_venda_excluir(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_venda_excluir(UUID, TEXT) IS
  'Move a venda para lixeira_vendas com retrato completo e apaga a linha. '
  'Sete dias para restaurar.';

CREATE OR REPLACE FUNCTION public.fn_venda_restaurar(p_lixeira_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lix  public.lixeira_vendas%ROWTYPE;
  v_id   UUID;
BEGIN
  IF NOT public.fn_user_tem('restaurar_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode restaurar vendas.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lix FROM public.lixeira_vendas WHERE id = p_lixeira_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item da lixeira não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_can_access_empresa(v_lix.empresa_id) THEN
    RAISE EXCEPTION 'Esta venda é de outra empresa.' USING ERRCODE = '42501';
  END IF;

  -- O NR pode ter voltado pelo relatorio enquanto a venda estava na lixeira. A
  -- unica coisa pior do que recusar aqui seria criar o segundo NR e deixar o
  -- faturamento dobrado — que e exatamente o defeito de R$ 432.714,40 que a
  -- chave unica existe para impedir.
  IF EXISTS (
    SELECT 1 FROM public.vendas v
     WHERE v.empresa_id = v_lix.empresa_id AND v.nr_documento = v_lix.nr_documento
  ) THEN
    RAISE EXCEPTION 'Já existe uma venda com este NR — ela voltou pelo relatório.'
      USING ERRCODE = '23505';
  END IF;

  -- As colunas geradas nao entram no INSERT: o Postgres as recalcula, e mandar
  -- o valor guardado seria gravar uma regua velha.
  INSERT INTO public.vendas (
    id, empresa_id, operador_id, setor_id, equipe_id, nr_documento, cliente, uf,
    valor_total, valor_entrada, valor_recebido, forma_pagamento,
    data_venda, data_confirmacao, situacao, contrato_assinado, motivo, origem,
    confirmado_por, confirmado_em, criado_por, criado_em, atualizado_em
  )
  SELECT
    (d->>'id')::UUID, (d->>'empresa_id')::UUID, (d->>'operador_id')::UUID,
    (d->>'setor_id')::UUID, (d->>'equipe_id')::UUID,
    d->>'nr_documento', d->>'cliente', (d->>'uf')::CHAR(2),
    (d->>'valor_total')::NUMERIC, (d->>'valor_entrada')::NUMERIC,
    COALESCE((d->>'valor_recebido')::NUMERIC, 0), d->>'forma_pagamento',
    (d->>'data_venda')::DATE, (d->>'data_confirmacao')::DATE,
    d->>'situacao', COALESCE((d->>'contrato_assinado')::BOOLEAN, FALSE),
    d->>'motivo', COALESCE(d->>'origem', 'manual'),
    (d->>'confirmado_por')::UUID, (d->>'confirmado_em')::TIMESTAMPTZ,
    (d->>'criado_por')::UUID,
    COALESCE((d->>'criado_em')::TIMESTAMPTZ, NOW()), NOW()
  FROM (SELECT v_lix.dados_completos AS d) AS r
  RETURNING id INTO v_id;

  INSERT INTO public.vendas_eventos (
    venda_id, empresa_id, tipo, situacao_depois, origem, autor_id
  ) VALUES (
    v_id, v_lix.empresa_id, 'restaurada', v_lix.situacao, 'manual', auth.uid()
  );

  DELETE FROM public.lixeira_vendas WHERE id = p_lixeira_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_venda_restaurar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_venda_restaurar(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_venda_restaurar(UUID) IS
  'Devolve a venda da lixeira. Recusa se o NR ja voltou pelo relatorio — a '
  'chave unica por empresa e o que impede o faturamento dobrado.';

-- ============================================================================
-- 11. Semear as chaves novas nos cargos que ja existem
-- ============================================================================

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ── Verificacao: a migration falha em vez de deixar o banco meio arrumado ───

DO $$
DECLARE
  v_faltando TEXT;
  v_nivel    INTEGER;
BEGIN
  -- (a) Todo cargo de toda empresa tem o catalogo inteiro da sua operacao.
  SELECT string_agg(DISTINCT format('%s/%s/%s', emp.slug, cp.cargo, cat.chave), ', ')
    INTO v_faltando
    FROM public.empresas emp
    JOIN public.cargos_permissoes cp ON cp.empresa_id = emp.id
    CROSS JOIN public.fn_permissoes_catalogo() cat
   WHERE (cat.tenants IS NULL OR emp.slug = ANY(cat.tenants))
     -- O cargo `rh` fica de fora, e nao por descuido: o ARRAY de
     -- fn_permissoes_semear_empresa tem NOVE cargos e nao o inclui, entao a
     -- linha dele nunca recebe chave nova. Conferi-la aqui faria esta migration
     -- falhar por um buraco que ela nao abriu — e que e anterior a ela.
     AND cp.cargo <> 'rh'
     AND NOT (cp.permissoes ? cat.chave);

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves ausentes após semear: %', v_faltando;
  END IF;

  -- (b) A aba `vendas` esta registrada com o prefixo certo. Errar o prefixo
  --     faria `fn_user_escopo('vendas')` devolver -1 para sempre, em silencio,
  --     e ninguem descobriria ate um lider abrir a aba vazia.
  SELECT COUNT(*) INTO v_nivel
    FROM public.fn_permissoes_catalogo() c
   WHERE c.chave IN ('vendas_escopo_individual','vendas_escopo_equipe',
                     'vendas_escopo_setor','vendas_escopo_todos_setores');

  IF v_nivel <> 4 THEN
    RAISE EXCEPTION 'A aba vendas precisa dos quatro niveis de escopo no catalogo; achei %.', v_nivel;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fn_abas_escopo() a WHERE a.aba = 'vendas') THEN
    RAISE EXCEPTION 'A aba vendas nao entrou em fn_abas_escopo.';
  END IF;
END $$;

COMMIT;
