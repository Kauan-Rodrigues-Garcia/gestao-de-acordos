-- ============================================================================
-- Comercial, Fase 4: a previa do setor e a conciliacao das tres camadas
-- ============================================================================
--
-- ⚠️  NAO APLICADA. Escrita em 15/09/2026. Depende das Fases 1, 2 e 3
--     (20260915100000, 110000 e 120000), que tambem nao foram aplicadas.
--
-- ## O relatorio do setor nao cabia na tabela como ela estava
--
-- `vendas_relatorio` nasceu na Fase 2 desenhada para o geral, e o geral tem
-- duas coisas que o do setor NAO tem:
--
--   `data_confirmacao` .. medido: 45 das 205 linhas do relatorio do setor nao
--                         tem. Sao as 23 abertas e parte das canceladas. E
--                         justamente o que so ele enxerga.
--   `codigo_franquia` ... o arquivo do setor traz so o NOME da franquia.
--
-- As duas colunas passam a aceitar nulo, com um CHECK garantindo que ao menos
-- uma forma de identificar a franquia esteja presente. Nao ha perda para o
-- geral: ele continua trazendo as duas, e a Fase 3 continua exigindo
-- `data_confirmacao` para projetar.
--
-- ## Franquia nova continua sendo descoberta do GERAL
--
-- `fn_vendas_lote_promover` deixa de cadastrar franquia quando o lote e de
-- setor. O motivo e o vinculo: o geral traz codigo, que e chave estavel — 80
-- codigos nos dois meses, zero ambiguidade. O do setor traz nome, que e rotulo.
--
-- Cadastrar pelo nome criaria uma segunda franquia no dia em que o ERP a
-- renomeasse, e o faturamento se partiria entre duas linhas do de-para sem
-- ninguem ver. O lote de setor CASA com o que ja existe, por nome, e reporta o
-- que nao casou.
--
-- ## A conciliacao e a razao de a previa existir
--
-- Tres camadas dizem coisas sobre o mesmo NR:
--
--   manual .. o operador lancou na aba Vendas
--   setor ... o relatorio do setor (eixo data da venda, traz aberta)
--   geral ... o relatorio geral (eixo confirmacao, oficial)
--
-- `fn_vendas_conciliacao` poe as tres lado a lado e classifica cada NR. O que
-- esta na previa e ainda nao no geral e PENDENCIA — continua contando, marcado,
-- ate o geral confirmar ou ate alguem tirar a mao. E a mesma regra que o 58
-- tem em relacao ao 59.
--
-- Escrita de dados: nenhuma linha. Altera duas colunas para aceitar nulo,
-- redefine uma funcao e cria duas.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. A tabela aceita o que o relatorio do setor tem
-- ============================================================================

ALTER TABLE public.vendas_relatorio
  ALTER COLUMN data_confirmacao DROP NOT NULL;

ALTER TABLE public.vendas_relatorio
  ALTER COLUMN codigo_franquia DROP NOT NULL;

-- Sem codigo E sem nome a linha nao tem como ser ligada a setor nenhum, e o
-- faturamento dela nunca apareceria em lugar algum.
ALTER TABLE public.vendas_relatorio
  DROP CONSTRAINT IF EXISTS vendas_relatorio_tem_franquia;
ALTER TABLE public.vendas_relatorio
  ADD CONSTRAINT vendas_relatorio_tem_franquia
  CHECK (codigo_franquia IS NOT NULL OR BTRIM(COALESCE(franquia, '')) <> '');

COMMENT ON COLUMN public.vendas_relatorio.data_confirmacao IS
  'NULL na venda ainda aberta, que so o relatorio do SETOR traz — 45 de 205 '
  'linhas medidas. O geral nunca traz nulo aqui: e o recorte dele.';

COMMENT ON COLUMN public.vendas_relatorio.codigo_franquia IS
  'NULL no relatorio do setor, que traz so o nome. O de-para casa por codigo '
  'quando ha, e por nome quando nao ha — ver fn_vendas_franquia_resolver.';

-- O casamento por nome precisa de indice: sem ele, cada linha do lote de setor
-- varre `vendas_franquias` inteira.
CREATE INDEX IF NOT EXISTS idx_vendas_franquias_nome
  ON public.vendas_franquias(empresa_id, LOWER(BTRIM(nome)));

-- ============================================================================
-- 2. Resolver a franquia: codigo primeiro, nome depois
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_franquia_resolver(
  p_empresa_id UUID, p_codigo TEXT, p_nome TEXT
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    -- O codigo e chave: quando existe, ele manda.
    (SELECT f.id FROM public.vendas_franquias f
      WHERE f.empresa_id = p_empresa_id
        AND f.codigo = BTRIM(p_codigo)
        AND BTRIM(COALESCE(p_codigo, '')) <> ''),
    -- O nome e o que o relatorio do setor tem. Um so, ou nenhum: dois cadastros
    -- com o mesmo nome e problema de cadastro, e escolher por sorte poria o
    -- faturamento no setor errado.
    (SELECT CASE WHEN COUNT(*) = 1 THEN MIN(f.id) ELSE NULL END
       FROM public.vendas_franquias f
      WHERE f.empresa_id = p_empresa_id
        AND LOWER(BTRIM(f.nome)) = LOWER(BTRIM(p_nome))
        AND BTRIM(COALESCE(p_nome, '')) <> '')
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_franquia_resolver(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_franquia_resolver(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_franquia_resolver(UUID, TEXT, TEXT) IS
  'A franquia do de-para, pelo codigo quando ha e pelo nome quando nao ha. '
  'Nome ambiguo devolve NULL — nunca escolhe por sorte.';

-- ============================================================================
-- 3. Promover: o lote de setor CASA, nao cadastra
-- ============================================================================
--
-- Corpo de 20260915110000, com uma diferenca: a descoberta de franquia roda so
-- para `origem = 'geral'`. Ver o cabecalho.

CREATE OR REPLACE FUNCTION public.fn_vendas_lote_promover(p_lote_id UUID)
RETURNS TABLE(franquias_novas INTEGER, linhas_do_lote INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lote     public.vendas_lotes%ROWTYPE;
  v_linhas   INTEGER;
  v_novas    INTEGER := 0;
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

  -- Só o geral cadastra franquia. O do setor traz nome, que é rótulo, e
  -- cadastrar por rótulo parte o faturamento em duas linhas do de-para no dia
  -- em que o ERP renomear a franquia.
  IF v_lote.origem = 'geral' THEN
    WITH vistas AS (
      SELECT codigo_franquia AS codigo,
             MAX(franquia)   AS nome,
             MIN(COALESCE(data_confirmacao, data_venda)) AS primeira,
             MAX(COALESCE(data_confirmacao, data_venda)) AS ultima
        FROM public.vendas_relatorio
       WHERE lote_id = p_lote_id AND codigo_franquia IS NOT NULL
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
  ELSE
    -- No lote de setor, `franquias_novas` devolve quantas NÃO casaram. É a
    -- pendência que a tela precisa mostrar: franquia que o geral não conhece.
    SELECT COUNT(DISTINCT r.franquia) INTO v_novas
      FROM public.vendas_relatorio r
     WHERE r.lote_id = p_lote_id
       AND public.fn_vendas_franquia_resolver(r.empresa_id, r.codigo_franquia, r.franquia) IS NULL;
  END IF;

  RETURN QUERY SELECT v_novas, v_linhas;
END;
$function$;

COMMENT ON FUNCTION public.fn_vendas_lote_promover(UUID) IS
  'Troca o retrato do mes. So o lote GERAL cadastra franquia — o do setor casa '
  'por nome e devolve, em franquias_novas, quantas nao casaram.';

-- ============================================================================
-- 4. A conciliacao das tres camadas
-- ============================================================================
--
-- Um NR por linha, com o que cada camada diz. A classificacao responde a
-- pergunta que a lideranca faz de verdade: «no que eu preciso mexer?».
--
--   so_manual  — o operador lancou e nenhum relatorio viu. Ou e venda de hoje
--                que ainda nao entrou, ou e lancamento que nao existe.
--   pendente   — a previa tem, o geral ainda nao. CONTINUA CONTANDO, marcado.
--   so_geral   — o geral tem e a previa nao. Normal: venda cujo mes de VENDA
--                e outro, e o recorte da previa nao a alcanca.
--   divergente — as duas tem, e discordam em situacao, assinatura ou valor.
--   conforme   — as duas concordam.

CREATE OR REPLACE FUNCTION public.fn_vendas_conciliacao(
  p_empresa_id UUID, p_mes DATE
)
RETURNS TABLE(
  nr_documento      TEXT,
  classificacao     TEXT,
  operador_nome     TEXT,
  -- O que a venda registrada diz hoje.
  venda_existe      BOOLEAN,
  venda_origem      TEXT,
  venda_situacao    TEXT,
  venda_assinado    BOOLEAN,
  venda_valor       NUMERIC,
  venda_conta       BOOLEAN,
  -- O que a previa do setor diz.
  previa_existe     BOOLEAN,
  previa_situacao   TEXT,
  previa_assinado   BOOLEAN,
  previa_valor      NUMERIC,
  -- O que o geral diz.
  geral_existe      BOOLEAN,
  geral_situacao    TEXT,
  geral_assinado    BOOLEAN,
  geral_valor       NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH mes AS (SELECT date_trunc('month', p_mes)::DATE AS m),
  lote_previa AS (
    SELECT l.id FROM public.vendas_lotes l, mes
     WHERE l.empresa_id = p_empresa_id AND l.mes = mes.m
       AND l.origem = 'setor' AND l.estado = 'vigente'
  ),
  lote_geral AS (
    SELECT l.id FROM public.vendas_lotes l, mes
     WHERE l.empresa_id = p_empresa_id AND l.mes = mes.m
       AND l.origem = 'geral' AND l.estado = 'vigente'
  ),
  previa AS (
    SELECT r.nr_documento, r.situacao, r.contrato_assinado, r.valor_total, r.login_vendedor
      FROM public.vendas_relatorio r
     WHERE r.lote_id = (SELECT id FROM lote_previa)
  ),
  geral AS (
    SELECT r.nr_documento, r.situacao, r.contrato_assinado, r.valor_total, r.login_vendedor
      FROM public.vendas_relatorio r
     WHERE r.lote_id = (SELECT id FROM lote_geral)
  ),
  -- A venda registrada entra pelos DOIS eixos: pela confirmacao (o mes oficial)
  -- e pela venda (o recorte da previa). Sem os dois, a venda lancada a mao e
  -- ainda nao confirmada ficaria de fora justamente da linha que a procura.
  venda AS (
    SELECT v.nr_documento, v.origem, v.situacao, v.contrato_assinado,
           v.valor_total, v.conta_na_meta, p.nome AS operador_nome
      FROM public.vendas v, mes
      LEFT JOIN public.perfis p ON p.id = v.operador_id
     WHERE v.empresa_id = p_empresa_id
       AND (date_trunc('month', v.data_confirmacao) = mes.m
            OR date_trunc('month', v.data_venda) = mes.m)
  ),
  todos AS (
    SELECT nr_documento FROM venda
    UNION SELECT nr_documento FROM previa
    UNION SELECT nr_documento FROM geral
  )
  SELECT
    t.nr_documento,
    CASE
      WHEN g.nr_documento IS NOT NULL AND pr.nr_documento IS NOT NULL
           AND (g.situacao IS DISTINCT FROM pr.situacao
             OR g.contrato_assinado IS DISTINCT FROM pr.contrato_assinado
             OR g.valor_total IS DISTINCT FROM pr.valor_total) THEN 'divergente'
      WHEN g.nr_documento IS NOT NULL AND pr.nr_documento IS NOT NULL THEN 'conforme'
      WHEN pr.nr_documento IS NOT NULL AND g.nr_documento IS NULL     THEN 'pendente'
      WHEN g.nr_documento IS NOT NULL AND pr.nr_documento IS NULL     THEN 'so_geral'
      ELSE 'so_manual'
    END,
    v.operador_nome,
    v.nr_documento IS NOT NULL, v.origem, v.situacao, v.contrato_assinado,
    v.valor_total, COALESCE(v.conta_na_meta, FALSE),
    pr.nr_documento IS NOT NULL, pr.situacao, pr.contrato_assinado, pr.valor_total,
    g.nr_documento IS NOT NULL, g.situacao, g.contrato_assinado, g.valor_total
  FROM todos t
  LEFT JOIN venda  v  ON v.nr_documento  = t.nr_documento
  LEFT JOIN previa pr ON pr.nr_documento = t.nr_documento
  LEFT JOIN geral  g  ON g.nr_documento  = t.nr_documento
  WHERE public.fn_can_access_empresa(p_empresa_id)
  ORDER BY
    CASE
      WHEN g.nr_documento IS NOT NULL AND pr.nr_documento IS NOT NULL
           AND (g.situacao IS DISTINCT FROM pr.situacao
             OR g.contrato_assinado IS DISTINCT FROM pr.contrato_assinado
             OR g.valor_total IS DISTINCT FROM pr.valor_total) THEN 1
      WHEN pr.nr_documento IS NOT NULL AND g.nr_documento IS NULL THEN 2
      WHEN v.nr_documento IS NOT NULL AND pr.nr_documento IS NULL
           AND g.nr_documento IS NULL THEN 3
      ELSE 9
    END,
    t.nr_documento;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_conciliacao(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_conciliacao(UUID, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_conciliacao(UUID, DATE) IS
  'Um NR por linha com o que dizem as tres camadas — venda registrada, previa '
  'do setor e geral — e a classificacao. Ordena pelo que da trabalho primeiro: '
  'divergente, pendente, so_manual.';

-- ============================================================================
-- 5. O resumo da conciliacao
-- ============================================================================
--
-- A tela abre com os numeros e so depois lista. Uma lista de 2.800 linhas nao
-- responde «no que eu preciso mexer?» — a contagem responde.

CREATE OR REPLACE FUNCTION public.fn_vendas_conciliacao_resumo(
  p_empresa_id UUID, p_mes DATE
)
RETURNS TABLE(
  classificacao TEXT,
  linhas        INTEGER,
  valor         NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT c.classificacao,
         COUNT(*)::INTEGER,
         COALESCE(SUM(COALESCE(c.geral_valor, c.previa_valor, c.venda_valor)), 0)
    FROM public.fn_vendas_conciliacao(p_empresa_id, p_mes) c
   GROUP BY c.classificacao
   ORDER BY CASE c.classificacao
              WHEN 'divergente' THEN 1
              WHEN 'pendente'   THEN 2
              WHEN 'so_manual'  THEN 3
              WHEN 'so_geral'   THEN 4
              ELSE 5
            END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_conciliacao_resumo(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_conciliacao_resumo(UUID, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_conciliacao_resumo(UUID, DATE) IS
  'Quantas linhas e quanto dinheiro em cada classificacao da conciliacao.';

-- ============================================================================
-- 6. Verificacao
-- ============================================================================

DO $$
BEGIN
  -- As duas colunas precisam aceitar nulo, senao o lote de setor nao entra.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'vendas_relatorio'
       AND column_name IN ('data_confirmacao', 'codigo_franquia')
       AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'data_confirmacao e codigo_franquia precisam aceitar nulo para o relatorio do setor.';
  END IF;

  -- E `vendas` continua exigindo data de confirmacao em venda confirmada: a
  -- previa nunca vira venda, e afrouxar aqui abriria essa porta.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.vendas'::regclass
       AND conname = 'vendas_confirmada_tem_data'
  ) THEN
    RAISE EXCEPTION 'vendas_confirmada_tem_data sumiu — venda confirmada sem mes voltaria a ser possivel.';
  END IF;
END $$;

COMMIT;
