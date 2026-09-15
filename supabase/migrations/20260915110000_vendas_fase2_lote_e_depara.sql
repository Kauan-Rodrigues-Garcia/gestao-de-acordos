-- ============================================================================
-- Comercial, Fase 2: o lote e o de-para de franquia
-- ============================================================================
--
-- ⚠️  NAO APLICADA. Escrita em 15/09/2026. Depende da Fase 1
--     (20260915100000_vendas_fase1.sql), que tambem nao foi aplicada.
--
-- ## Um lote e um RETRATO, e retratos se substituem
--
-- O arquivo de prospeccao nao e um extrato que cresce: e uma foto do mes tirada
-- no instante da exportacao. Medido:
--
--   Prospeccao_202609.csv em 14/09 as 17:15 .... 2.838 linhas, ate o dia 14
--   o MESMO arquivo em 15/09 as 08:15 .......... 2.868 linhas, ate o dia 15
--   Prospeccao_202608.csv baixado em 31/08 ..... ZERO devolucao datada de set.
--
-- O de agosto congelou no download e nunca se atualiza sozinho. Para captar uma
-- reversao que aconteceu depois, reexporta-se agosto. Por isso a carga insere
-- um lote novo inteiro e a PROMOCAO troca o ponteiro numa transacao so: o lote
-- anterior do mesmo mes vira `substituido` e as linhas dele saem. Ninguem
-- nunca ve meio retrato.
--
-- O lote substituido SOBREVIVE como registro — hash, contagem, quem, quando.
-- E o que permite responder «esta carga mudou alguma coisa?» sem guardar o mes
-- inteiro varias vezes. Mesmo desenho de `mestre_lotes` (migration
-- 20260904100000), pelo mesmo motivo.
--
-- ## Duas origens, e elas nao se substituem entre si
--
-- `geral` e o relatorio da empresa toda, recortado por data de CONFIRMACAO — o
-- oficial. `setor` e o relatorio de um setor, recortado por data da VENDA, e e
-- o unico que traz venda em aberto (medido: o geral tem zero aberta nos dois
-- meses inteiros). Um lote geral nunca substitui um lote de setor: sao fatos
-- diferentes sobre o mesmo mes. A unicidade do vigente e por
-- (empresa, mes, origem).
--
-- ## Franquia e a chave, e ela e melhor que a do 59
--
-- Medido nos dois meses: 80 codigos de franquia distintos, ZERO codigo com dois
-- nomes e ZERO nome com dois codigos. No 59 o `cod_grupo_filtro` sobreviveu a
-- trocas de nome e exigiu tratar o nome como mero rotulo; aqui vale a mesma
-- regra, com menos risco. Codigo e chave, nome e rotulo.
--
-- Franquia sem vinculo NAO e erro — e franquia que ninguem cadastrou ainda. O
-- faturamento dela aparece identificado pelo codigo, e vincular e o que o torna
-- oficial para um setor.
--
-- ## O que esta migration NAO faz
--
-- Nao escreve NADA em `vendas`. A projecao do relatorio sobre a venda — com o
-- dedupe entre meses, a reversao e a regua — e a Fase 3. Aqui o relatorio entra,
-- as franquias aparecem, e a lideranca liga cada uma ao setor dela. O risco
-- sobre o dado da Fase 1 e zero por construcao.
--
-- Escrita de dados: nenhuma linha de venda ou de relatorio. Semeia as tres
-- permissoes novas nos cargos existentes.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. Catalogo de permissoes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo_antes_vendas_lote_20260915()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_vendas_20260915()
  UNION ALL
  SELECT * FROM (VALUES
    ('ver_vendas',                   ARRAY['comercial']::TEXT[],
       ARRAY['operador','lider','elite','gerencia','diretoria']::TEXT[], false),
    ('vendas_escopo_individual',     ARRAY['comercial']::TEXT[], ARRAY['operador']::TEXT[], false),
    ('vendas_escopo_equipe',         ARRAY['comercial']::TEXT[], ARRAY[]::TEXT[], false),
    ('vendas_escopo_setor',          ARRAY['comercial']::TEXT[], ARRAY['lider','elite']::TEXT[], false),
    ('vendas_escopo_todos_setores',  ARRAY['comercial']::TEXT[], ARRAY['gerencia','diretoria']::TEXT[], false),
    ('criar_vendas',                 ARRAY['comercial']::TEXT[],
       ARRAY['operador','lider','elite','gerencia']::TEXT[], false),
    ('editar_vendas',                ARRAY['comercial']::TEXT[],
       ARRAY['operador','lider','elite','gerencia']::TEXT[], false),
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

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_vendas_lote_20260915() IS
  'Retrato do catalogo antes das chaves de importacao do Comercial (15/09/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_vendas_lote_20260915()
  UNION ALL
  SELECT * FROM (VALUES
    -- Importar e vincular franquia sao poderes de lideranca, e nascem so nela.
    -- Uma importacao errada troca o retrato do mes inteiro; um vinculo errado
    -- move o faturamento de um setor para outro.
    ('importar_vendas',            ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia']::TEXT[], false),
    ('ver_importacoes_vendas',     ARRAY['comercial']::TEXT[],
       ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('vendas_vincular_franquia',   ARRAY['comercial']::TEXT[],
       ARRAY['gerencia']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao 20260915110000 adiciona as '
  'chaves de importacao e de-para do Comercial.';

-- ============================================================================
-- 2. Os lotes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vendas_lotes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Primeiro dia do mes de referencia. DATE e nao texto: `mes + interval`
  -- funciona, e a ordenacao e a do calendario.
  mes                  DATE NOT NULL,
  origem               TEXT NOT NULL CHECK (origem IN ('setor','geral')),
  estado               TEXT NOT NULL DEFAULT 'carregando'
                         CHECK (estado IN ('carregando','vigente','substituido','descartado')),

  arquivo_nome         TEXT,
  -- SHA-256 do conteudo. Reimportar arquivo identico e visivel sem guardar o
  -- arquivo, e e informacao util: diz que a exportacao nao mudou nada.
  arquivo_hash         TEXT,

  linhas_arquivo       INTEGER NOT NULL DEFAULT 0,
  linhas_aceitas       INTEGER NOT NULL DEFAULT 0,
  duplicados           INTEGER NOT NULL DEFAULT 0,
  descartadas          INTEGER NOT NULL DEFAULT 0,
  quantidade_na_regua  INTEGER NOT NULL DEFAULT 0,
  faturamento_na_regua NUMERIC(14,2) NOT NULL DEFAULT 0,

  importado_por        UUID,
  importado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promovido_em         TIMESTAMPTZ,
  observacao           TEXT,

  CONSTRAINT vendas_lotes_mes_e_dia_1 CHECK (EXTRACT(DAY FROM mes) = 1),
  CONSTRAINT vendas_lotes_promovido_tem_data
    CHECK (estado <> 'vigente' OR promovido_em IS NOT NULL)
);

-- Um vigente por (empresa, mes, origem). E o indice que garante que ninguem
-- ve meio retrato: promover o segundo sem aposentar o primeiro falha aqui.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_lotes_vigente
  ON public.vendas_lotes(empresa_id, mes, origem)
  WHERE estado = 'vigente';

CREATE INDEX IF NOT EXISTS idx_vendas_lotes_empresa_mes
  ON public.vendas_lotes(empresa_id, mes DESC, importado_em DESC);

COMMENT ON TABLE public.vendas_lotes IS
  'Cada carga do relatorio de prospeccao. Um lote e um RETRATO do mes: promover '
  'um novo aposenta o anterior da mesma (empresa, mes, origem) e apaga as '
  'linhas dele. O registro do lote velho sobrevive.';

COMMENT ON COLUMN public.vendas_lotes.origem IS
  '`geral` = relatorio da empresa, eixo confirmacao, oficial. `setor` = '
  'relatorio do setor, eixo data da venda, previa — o unico que traz venda em '
  'aberto. Um nunca substitui o outro.';

-- ============================================================================
-- 3. As linhas cruas do relatorio
-- ============================================================================
--
-- Nao guarda CPF, telefone, e-mail, escolaridade, idade nem etnia. O sistema
-- expurgou CPF de proposito (migration 20260728b) e passou a usar o codigo do
-- cliente; reintroduzi-lo por uma importacao nova desfaria a decisao pela porta
-- dos fundos.
--
-- Nao guarda a decomposicao de pagamento (`Pix`, `Cartao_Padrao`,
-- `Cartao_Recorrente`). Medido: ela nao fecha com `Total_Recebido` — 100 linhas
-- divergem, R$ 27.437,73 de excesso, e 66 delas estao marcadas «SEM
-- RECEBIMENTO» com valor na decomposicao. Boleto, que recebeu R$ 4.782,20, nao
-- tem coluna nenhuma. Tres numeros que nao somam sao um convite a soma-los.

CREATE TABLE IF NOT EXISTS public.vendas_relatorio (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id            UUID NOT NULL REFERENCES public.vendas_lotes(id) ON DELETE CASCADE,
  empresa_id         UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,

  codigo_venda       TEXT,
  nr_documento       TEXT NOT NULL,
  data_venda         DATE NOT NULL,
  data_confirmacao   DATE NOT NULL,

  codigo_franquia    TEXT NOT NULL,
  franquia           TEXT,
  uf                 CHAR(2),
  nome_vendedor      TEXT,
  login_vendedor     TEXT,

  situacao           TEXT NOT NULL
                       CHECK (situacao IN ('aberta','confirmada','cancelada','devolvida')),
  contrato_assinado  BOOLEAN NOT NULL DEFAULT FALSE,

  valor_total        NUMERIC(14,2) NOT NULL,
  qtde_parcela       INTEGER,
  valor_parcela      NUMERIC(14,2),
  valor_recebido     NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_entrada      NUMERIC(14,2),
  tipo_recebimento   TEXT,
  tipo_documento     TEXT,

  produto            TEXT,
  categoria          TEXT,
  tipo_venda         TEXT,
  tipo_produto       TEXT,

  data_cancelamento  DATE,
  data_devolucao     DATE,
  motivo             TEXT,
  setor_cancelamento TEXT,

  veio_de_lead       BOOLEAN NOT NULL DEFAULT FALSE,
  score_classe       TEXT,
  spc_serasa         TEXT,
  linha_num          INTEGER,

  -- A mesma regua da Fase 1, pelo mesmo motivo: somar `valor_na_meta` acerta
  -- sem conhecer a regra.
  conta_na_meta      BOOLEAN GENERATED ALWAYS AS (
                       situacao = 'confirmada' AND contrato_assinado
                     ) STORED,
  valor_na_meta      NUMERIC(14,2) GENERATED ALWAYS AS (
                       CASE WHEN situacao = 'confirmada' AND contrato_assinado
                            THEN valor_total ELSE 0 END
                     ) STORED,

  -- O dedupe DENTRO do arquivo ja foi feito pelo parser (a ultima linha do NR
  -- vence). Esta chave e a rede: se um dia o parser deixar passar, a carga
  -- falha em vez de gravar o NR duas vezes no mesmo retrato.
  CONSTRAINT vendas_relatorio_nr_unico_no_lote UNIQUE (lote_id, nr_documento)
);

CREATE INDEX IF NOT EXISTS idx_vendas_relatorio_lote
  ON public.vendas_relatorio(lote_id);
CREATE INDEX IF NOT EXISTS idx_vendas_relatorio_nr
  ON public.vendas_relatorio(empresa_id, nr_documento);
CREATE INDEX IF NOT EXISTS idx_vendas_relatorio_franquia
  ON public.vendas_relatorio(empresa_id, codigo_franquia);
CREATE INDEX IF NOT EXISTS idx_vendas_relatorio_login
  ON public.vendas_relatorio(empresa_id, login_vendedor);

COMMENT ON TABLE public.vendas_relatorio IS
  'As linhas do relatorio de prospeccao, como vieram, presas a um lote. NAO '
  'guarda CPF, contato nem a decomposicao de pagamento — ver o cabecalho da '
  'migration 20260915110000.';

-- ============================================================================
-- 4. O de-para de franquia
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vendas_franquias (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- A chave. Medido: 80 codigos nos dois meses, zero ambiguidade.
  codigo            TEXT NOT NULL,
  -- Ultimo nome visto. Rotulo de tela e historico, nunca chave.
  nome              TEXT NOT NULL DEFAULT '',
  setor_id          UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  -- `novo`      — apareceu e ninguem decidiu. O faturamento nao conta em setor.
  -- `vinculado` — tem setor. A constraint garante.
  -- `ignorado`  — decidido que nao entra (franquia de outra operacao).
  estado            TEXT NOT NULL DEFAULT 'novo'
                      CHECK (estado IN ('novo','vinculado','ignorado')),
  primeira_aparicao DATE NOT NULL,
  ultima_aparicao   DATE NOT NULL,
  vinculado_por_id  UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  vinculado_em      TIMESTAMPTZ,
  observacao        TEXT,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vendas_franquias_codigo_unico UNIQUE (empresa_id, codigo),
  CONSTRAINT vendas_franquias_vinculado_tem_setor
    CHECK (estado <> 'vinculado' OR setor_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_vendas_franquias_empresa_estado
  ON public.vendas_franquias(empresa_id, estado);

COMMENT ON TABLE public.vendas_franquias IS
  'De-para franquia -> setor. Codigo e chave, nome e rotulo. Franquia `novo` '
  'nao e erro: e franquia que ninguem cadastrou ainda, e o faturamento dela '
  'aparece identificada pelo codigo. Equivalente de mestre_grupos para o 59.';

-- ============================================================================
-- 5. RLS: leitura para quem tem a aba, escrita so por RPC
-- ============================================================================

ALTER TABLE public.vendas_lotes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_relatorio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_franquias ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.vendas_lotes     FROM anon;
REVOKE ALL ON TABLE public.vendas_relatorio FROM anon;
REVOKE ALL ON TABLE public.vendas_franquias FROM anon;

DROP POLICY IF EXISTS vendas_lotes_select ON public.vendas_lotes;
CREATE POLICY vendas_lotes_select ON public.vendas_lotes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_tem('ver_importacoes_vendas'))
    AND public.fn_can_access_empresa(empresa_id)
  );

-- A linha crua do relatorio e material de conferencia da lideranca, e nao se
-- recorta por setor: a conciliacao precisa enxergar o que caiu FORA do setor
-- de quem confere. Quem abre e a mesma chave que abre o historico de cargas.
DROP POLICY IF EXISTS vendas_relatorio_select ON public.vendas_relatorio;
CREATE POLICY vendas_relatorio_select ON public.vendas_relatorio
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_tem('ver_importacoes_vendas'))
    AND public.fn_can_access_empresa(empresa_id)
  );

-- O de-para e lido por quem ve a aba Vendas, e nao so por quem pode vincular:
-- a tela de vendas precisa dizer «esta franquia ainda nao tem setor».
DROP POLICY IF EXISTS vendas_franquias_select ON public.vendas_franquias;
CREATE POLICY vendas_franquias_select ON public.vendas_franquias
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_tem('ver_vendas'))
    AND public.fn_can_access_empresa(empresa_id)
  );

-- ============================================================================
-- 6. Abrir um lote
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_lote_abrir(
  p_empresa_id   UUID,
  p_mes          DATE,
  p_origem       TEXT,
  p_arquivo_nome TEXT,
  p_arquivo_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id  UUID;
  v_mes DATE := date_trunc('month', p_mes)::DATE;
BEGIN
  IF NOT public.fn_user_tem('importar_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode importar o relatório de vendas.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  IF p_origem NOT IN ('setor','geral') THEN
    RAISE EXCEPTION 'Origem inválida: use «setor» ou «geral».' USING ERRCODE = '22023';
  END IF;

  IF p_mes IS NULL THEN
    RAISE EXCEPTION 'O mês de referência é obrigatório.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.vendas_lotes (
    empresa_id, mes, origem, estado, arquivo_nome, arquivo_hash, importado_por
  ) VALUES (
    p_empresa_id, v_mes, p_origem, 'carregando',
    NULLIF(BTRIM(p_arquivo_nome), ''), NULLIF(BTRIM(p_arquivo_hash), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_lote_abrir(UUID, DATE, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_lote_abrir(UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_lote_abrir(UUID, DATE, TEXT, TEXT, TEXT) IS
  'Abre um lote em `carregando`. Nada muda de lugar ate fn_vendas_lote_promover.';

-- ============================================================================
-- 7. Mandar as linhas — em blocos
-- ============================================================================
--
-- `jsonb` e nao um INSERT por linha: o arquivo de agosto tem 6.934 linhas
-- aceitas, e uma ida ao servidor por linha seria sete mil idas. A tela manda em
-- blocos e o Postgres expande de uma vez.

CREATE OR REPLACE FUNCTION public.fn_vendas_lote_linhas(
  p_lote_id UUID,
  p_linhas  JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lote    public.vendas_lotes%ROWTYPE;
  v_gravadas INTEGER;
BEGIN
  IF NOT public.fn_user_tem('importar_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode importar o relatório de vendas.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lote FROM public.vendas_lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_lote.estado <> 'carregando' THEN
    RAISE EXCEPTION 'Este lote já foi fechado (%). Abra um lote novo.', v_lote.estado
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.fn_can_access_empresa(v_lote.empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.vendas_relatorio (
    lote_id, empresa_id, codigo_venda, nr_documento, data_venda, data_confirmacao,
    codigo_franquia, franquia, uf, nome_vendedor, login_vendedor,
    situacao, contrato_assinado, valor_total, qtde_parcela, valor_parcela,
    valor_recebido, valor_entrada, tipo_recebimento, tipo_documento,
    produto, categoria, tipo_venda, tipo_produto,
    data_cancelamento, data_devolucao, motivo, setor_cancelamento,
    veio_de_lead, score_classe, spc_serasa, linha_num
  )
  SELECT
    p_lote_id, v_lote.empresa_id,
    j->>'codigo_venda', j->>'nr_documento',
    (j->>'data_venda')::DATE, (j->>'data_confirmacao')::DATE,
    j->>'codigo_franquia', j->>'franquia',
    NULLIF(UPPER(BTRIM(COALESCE(j->>'uf',''))), '')::CHAR(2),
    j->>'nome_vendedor', j->>'login_vendedor',
    j->>'situacao', COALESCE((j->>'contrato_assinado')::BOOLEAN, FALSE),
    (j->>'valor_total')::NUMERIC, (j->>'qtde_parcela')::INTEGER,
    (j->>'valor_parcela')::NUMERIC,
    COALESCE((j->>'valor_recebido')::NUMERIC, 0), (j->>'valor_entrada')::NUMERIC,
    j->>'tipo_recebimento', j->>'tipo_documento',
    j->>'produto', j->>'categoria', j->>'tipo_venda', j->>'tipo_produto',
    (j->>'data_cancelamento')::DATE, (j->>'data_devolucao')::DATE,
    j->>'motivo', j->>'setor_cancelamento',
    COALESCE((j->>'veio_de_lead')::BOOLEAN, FALSE),
    j->>'score_classe', j->>'spc_serasa', (j->>'linha_num')::INTEGER
  FROM jsonb_array_elements(p_linhas) AS j;

  GET DIAGNOSTICS v_gravadas = ROW_COUNT;
  RETURN v_gravadas;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_lote_linhas(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_lote_linhas(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_lote_linhas(UUID, JSONB) IS
  'Grava um bloco de linhas num lote em `carregando`. NR repetido no mesmo lote '
  'viola vendas_relatorio_nr_unico_no_lote e a carga falha — de proposito.';

-- ============================================================================
-- 8. Promover: o retrato novo troca de lugar com o velho
-- ============================================================================
--
-- Numa transacao so, e sem `vendas` entrar na conversa. O que acontece:
--
--   1. o lote vira `vigente` e recebe as contagens;
--   2. o vigente anterior da mesma (empresa, mes, origem) vira `substituido` e
--      as linhas dele SAEM — o registro do lote fica;
--   3. as franquias do lote aparecem no de-para, sem mexer em quem ja foi
--      vinculada.

CREATE OR REPLACE FUNCTION public.fn_vendas_lote_promover(p_lote_id UUID)
RETURNS TABLE(franquias_novas INTEGER, linhas_do_lote INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lote    public.vendas_lotes%ROWTYPE;
  v_linhas  INTEGER;
  v_novas   INTEGER := 0;
  v_anterior UUID;
BEGIN
  IF NOT public.fn_user_tem('importar_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode importar o relatório de vendas.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lote FROM public.vendas_lotes WHERE id = p_lote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_lote.estado <> 'carregando' THEN
    RAISE EXCEPTION 'Só um lote em carregamento pode ser promovido (este está %).', v_lote.estado
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.fn_can_access_empresa(v_lote.empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_linhas FROM public.vendas_relatorio WHERE lote_id = p_lote_id;
  IF v_linhas = 0 THEN
    RAISE EXCEPTION 'Este lote não tem linha nenhuma — promover trocaria o retrato do mês por um vazio.'
      USING ERRCODE = '22023';
  END IF;

  -- 2 antes de 1: o indice unico do vigente recusaria dois ao mesmo tempo.
  SELECT id INTO v_anterior
    FROM public.vendas_lotes
   WHERE empresa_id = v_lote.empresa_id AND mes = v_lote.mes
     AND origem = v_lote.origem AND estado = 'vigente'
   FOR UPDATE;

  IF v_anterior IS NOT NULL THEN
    UPDATE public.vendas_lotes SET estado = 'substituido' WHERE id = v_anterior;
    DELETE FROM public.vendas_relatorio WHERE lote_id = v_anterior;
  END IF;

  UPDATE public.vendas_lotes SET
    estado               = 'vigente',
    promovido_em         = NOW(),
    linhas_aceitas       = v_linhas,
    quantidade_na_regua  = (SELECT COUNT(*) FROM public.vendas_relatorio
                             WHERE lote_id = p_lote_id AND conta_na_meta),
    faturamento_na_regua = (SELECT COALESCE(SUM(valor_na_meta), 0) FROM public.vendas_relatorio
                             WHERE lote_id = p_lote_id)
  WHERE id = p_lote_id;

  -- As franquias do lote entram no de-para. `DO UPDATE` so mexe em rotulo e
  -- datas: estado, setor e quem vinculou sao decisao de gente e nao se
  -- desfazem por uma importacao nova.
  WITH vistas AS (
    SELECT codigo_franquia AS codigo,
           MAX(franquia)   AS nome,
           MIN(data_confirmacao) AS primeira,
           MAX(data_confirmacao) AS ultima
      FROM public.vendas_relatorio
     WHERE lote_id = p_lote_id
     GROUP BY codigo_franquia
  ),
  gravadas AS (
    INSERT INTO public.vendas_franquias (
      empresa_id, codigo, nome, estado, primeira_aparicao, ultima_aparicao
    )
    SELECT v_lote.empresa_id, v.codigo, COALESCE(v.nome, ''), 'novo', v.primeira, v.ultima
      FROM vistas v
    ON CONFLICT ON CONSTRAINT vendas_franquias_codigo_unico DO UPDATE SET
      nome              = COALESCE(NULLIF(EXCLUDED.nome, ''), public.vendas_franquias.nome),
      primeira_aparicao = LEAST(public.vendas_franquias.primeira_aparicao, EXCLUDED.primeira_aparicao),
      ultima_aparicao   = GREATEST(public.vendas_franquias.ultima_aparicao, EXCLUDED.ultima_aparicao),
      atualizado_em     = NOW()
    RETURNING (xmax = 0) AS inserida
  )
  SELECT COUNT(*) FILTER (WHERE inserida) INTO v_novas FROM gravadas;

  RETURN QUERY SELECT v_novas, v_linhas;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_lote_promover(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_lote_promover(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_lote_promover(UUID) IS
  'Troca o retrato do mes: o lote vira vigente, o anterior da mesma '
  '(empresa, mes, origem) vira substituido e perde as linhas, e as franquias '
  'aparecem no de-para. NAO escreve em `vendas` — isso e a Fase 3.';

-- ============================================================================
-- 9. Descartar um lote pela metade
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_lote_descartar(p_lote_id UUID, p_motivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_lote public.vendas_lotes%ROWTYPE;
BEGIN
  IF NOT public.fn_user_tem('importar_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode importar o relatório de vendas.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lote FROM public.vendas_lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  -- O vigente nao se descarta: deixaria o mes sem retrato. Para trocar,
  -- importa-se outro — a promocao aposenta o anterior sozinha.
  IF v_lote.estado = 'vigente' THEN
    RAISE EXCEPTION 'O lote vigente não pode ser descartado. Importe outro para substituí-lo.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.fn_can_access_empresa(v_lote.empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.vendas_relatorio WHERE lote_id = p_lote_id;
  UPDATE public.vendas_lotes
     SET estado = 'descartado', observacao = NULLIF(BTRIM(p_motivo), '')
   WHERE id = p_lote_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_lote_descartar(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_lote_descartar(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_lote_descartar(UUID, TEXT) IS
  'Larga um lote que nao foi promovido. O vigente e recusado — o mes ficaria '
  'sem retrato.';

-- ============================================================================
-- 10. Vincular franquia a setor
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_franquia_vincular(
  p_id         UUID,
  p_setor_id   UUID,
  p_estado     TEXT,
  p_observacao TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_fr public.vendas_franquias%ROWTYPE;
BEGIN
  IF NOT public.fn_user_tem('vendas_vincular_franquia') THEN
    RAISE EXCEPTION 'Seu cargo não pode vincular franquia a setor.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_fr FROM public.vendas_franquias WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Franquia não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_can_access_empresa(v_fr.empresa_id) THEN
    RAISE EXCEPTION 'Esta franquia é de outra empresa.' USING ERRCODE = '42501';
  END IF;

  IF p_estado NOT IN ('novo','vinculado','ignorado') THEN
    RAISE EXCEPTION 'Estado inválido: use «novo», «vinculado» ou «ignorado».'
      USING ERRCODE = '22023';
  END IF;

  IF p_estado = 'vinculado' AND p_setor_id IS NULL THEN
    RAISE EXCEPTION 'Para vincular é preciso escolher o setor.' USING ERRCODE = '22023';
  END IF;

  IF p_setor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.setores s
     WHERE s.id = p_setor_id AND s.empresa_id = v_fr.empresa_id
  ) THEN
    RAISE EXCEPTION 'O setor escolhido não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.vendas_franquias SET
    -- Sair de `vinculado` solta o setor: deixá-lo preso descreveria um vínculo
    -- que não existe mais, e a próxima tela que ler `setor_id` acreditaria.
    setor_id         = CASE WHEN p_estado = 'vinculado' THEN p_setor_id ELSE NULL END,
    estado           = p_estado,
    observacao       = NULLIF(BTRIM(p_observacao), ''),
    vinculado_por_id = CASE WHEN p_estado = 'vinculado' THEN auth.uid() ELSE NULL END,
    vinculado_em     = CASE WHEN p_estado = 'vinculado' THEN NOW() ELSE NULL END,
    atualizado_em    = NOW()
  WHERE id = p_id;

  RETURN p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_franquia_vincular(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_franquia_vincular(UUID, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_franquia_vincular(UUID, UUID, TEXT, TEXT) IS
  'Liga uma franquia a um setor, ou a marca como ignorada. Sair de `vinculado` '
  'solta o setor — vinculo que nao existe mais nao fica gravado.';

-- ============================================================================
-- 11. Semear e verificar
-- ============================================================================

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

DO $$
DECLARE v_faltando TEXT;
BEGIN
  SELECT string_agg(DISTINCT format('%s/%s/%s', emp.slug, cp.cargo, cat.chave), ', ')
    INTO v_faltando
    FROM public.empresas emp
    JOIN public.cargos_permissoes cp ON cp.empresa_id = emp.id
    CROSS JOIN public.fn_permissoes_catalogo() cat
   WHERE (cat.tenants IS NULL OR emp.slug = ANY(cat.tenants))
     AND NOT (cp.permissoes ? cat.chave);

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves ausentes após semear: %', v_faltando;
  END IF;

  -- A promessa desta migration: nada foi escrito em `vendas`.
  IF to_regclass('public.vendas') IS NULL THEN
    RAISE EXCEPTION 'A Fase 1 (20260915100000) precisa estar aplicada antes desta.';
  END IF;
END $$;

COMMIT;
