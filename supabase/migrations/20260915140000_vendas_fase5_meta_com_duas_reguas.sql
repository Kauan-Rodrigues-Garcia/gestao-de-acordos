-- ============================================================================
-- Comercial, Fase 5: a meta tem duas reguas, e so uma vale
-- ============================================================================
--
-- ## O pedido
--
-- «Tem setores que a meta sao definidas por vendas — exemplo, fez 10 vendas
-- bateu a meta — e tem setores que sao divididos por valores, exemplo fazer
-- R$ 100.000,00 bateu a meta. Na configuracao de meta deixar isso bem colocado,
-- tambem podendo ser separado por equipe.»
--
-- Entao a regua e CONFIGURACAO, e por recorte: o mesmo mes pode ser medido por
-- quantidade num setor e por valor noutro.
--
-- ## A tabela `metas` ja guardava as duas, sem saber qual valia
--
-- `meta_valor` e `meta_acordos` existem lado a lado desde sempre — na cobranca
-- as duas sao lidas juntas e nenhuma «decide». No Comercial uma decide, e a
-- outra vira segunda leitura: um setor que bate o dinheiro com metade das
-- vendas esta vendendo caro; um que bate a quantidade e nao o valor, barato.
--
-- Dai so faltar UMA coluna: `regua`. Criar tabela nova duplicaria mes, ano,
-- tipo e referencia para guardar um enum.
--
-- ⚠️ `meta_acordos` no Comercial quer dizer QUANTIDADE DE VENDAS. O nome e
-- historia da cobranca, e renomea-lo quebraria as duas telas que o usam la.
-- O COMMENT abaixo e o que impede alguem de ler «acordos» e concluir que a
-- coluna nao serve.
--
-- ## As contas do rodape ja existiam, e batem ao centavo
--
-- Conferido contra `Planilha Mensal (1).xlsx`, aba Agosto — 21 dias uteis, 16
-- trabalhados, meta de R$ 962.136,00 e de 161 vendas:
--
--   META DO DIA ........... 962.136 / 21 = 45.816,00            = planilha
--   EXPECT. FATURAMENTO ... 45.816 * 16 = 733.056               = planilha
--   PROJECAO .............. 683.531,24 / 733.056 = 93,24%       = planilha
--   Falta p/Meta .......... 962.136 - 683.531,24 = 278.604,76   = planilha
--   Por Dia ............... 278.604,76 / 5 = 55.720,95          = planilha
--   META DO DIA (qtd) ..... 161 / 21 = 7,67                     = planilha
--   EXPECTATIVA DE VENDA .. 7,67 * 16 = 122,67                  = planilha
--
-- As contas moram em `src/lib/vendasMeta.ts`, com estes numeros nos testes. O
-- banco guarda a meta; quem projeta e a tela.
--
-- ## Uma RPC propria, e nao `fn_metas_upsert`
--
-- Aquela serve a tela de Metas da cobranca, com quartis, dias uteis, metas
-- extras, validacao por setor e treinamento de equipe — 1.573 linhas de
-- vocabulario que nao e de Vendas. Estender a funcao dela para caber a regua
-- amarraria as duas telas uma na outra.
--
-- Escrita de dados: nenhuma linha de meta. Cria uma coluna, duas funcoes e
-- uma permissao.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. Catalogo
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo_antes_meta_vendas_20260915()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_projecao_20260915()
  UNION ALL
  SELECT * FROM (VALUES
    ('projetar_vendas', ARRAY['comercial']::TEXT[], ARRAY['gerencia']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_meta_vendas_20260915() IS
  'Retrato do catalogo antes das chaves de meta do Comercial (15/09/2026).';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_meta_vendas_20260915()
  UNION ALL
  SELECT * FROM (VALUES
    -- Ver a meta e de todo mundo: o operador precisa saber o que se espera
    -- dele. Editar e da lideranca — a meta decide comissao e quartil.
    ('ver_metas_vendas',    ARRAY['comercial']::TEXT[],
       ARRAY['operador','lider','elite','gerencia','diretoria']::TEXT[], false),
    ('editar_metas_vendas', ARRAY['comercial']::TEXT[],
       ARRAY['gerencia']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. A extensao 20260915140000 adiciona as chaves de meta do '
  'Comercial.';

-- ============================================================================
-- 2. A regua
-- ============================================================================

ALTER TABLE public.metas
  ADD COLUMN IF NOT EXISTS regua TEXT
    CHECK (regua IS NULL OR regua IN ('quantidade', 'valor'));

COMMENT ON COLUMN public.metas.regua IS
  'Qual das duas metas DECIDE se bateu, no Comercial: `quantidade` (meta_acordos) '
  'ou `valor` (meta_valor). NULL = nao configurada, e entao NADA bate — aceitar '
  '«uma das duas» faria um setor medido por valor, que fez muitas vendas '
  'pequenas, aparecer como tendo batido. Na cobranca a coluna fica nula: la as '
  'duas metas sao lidas juntas e nenhuma decide.';

COMMENT ON COLUMN public.metas.meta_acordos IS
  'Meta em QUANTIDADE. Na cobranca, de acordos; no Comercial, de vendas — o '
  'nome e historia, e renomear quebraria as telas da cobranca. Ver `regua`.';

-- ============================================================================
-- 3. Gravar a meta do Comercial
-- ============================================================================
--
-- Uma linha por (empresa, tipo, referencia, mes, ano) — a chave que `metas` ja
-- tem. Zerar as duas metas E a regua apaga a linha: meta vazia nao informa
-- nada e so faria a tabela crescer.

CREATE OR REPLACE FUNCTION public.fn_vendas_meta_salvar(
  p_empresa_id    UUID,
  p_tipo          TEXT,
  p_referencia_id UUID,
  p_ano           INTEGER,
  p_mes           INTEGER,
  p_regua         TEXT,
  p_quantidade    INTEGER,
  p_valor         NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_id    UUID;
  v_regua TEXT := NULLIF(BTRIM(COALESCE(p_regua, '')), '');
  v_qtd   INTEGER := GREATEST(COALESCE(p_quantidade, 0), 0);
  v_val   NUMERIC := GREATEST(COALESCE(p_valor, 0), 0);
BEGIN
  IF NOT public.fn_user_tem('editar_metas_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode editar a meta de vendas.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  IF p_tipo NOT IN ('setor', 'equipe', 'operador') THEN
    RAISE EXCEPTION 'O recorte da meta é «setor», «equipe» ou «operador».' USING ERRCODE = '22023';
  END IF;

  IF p_referencia_id IS NULL OR p_ano IS NULL OR p_mes IS NULL THEN
    RAISE EXCEPTION 'Meta incompleta: recorte, ano e mês são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  IF p_mes NOT BETWEEN 1 AND 12 OR p_ano < 2024 THEN
    RAISE EXCEPTION 'Competência inválida.' USING ERRCODE = '22023';
  END IF;

  IF v_regua IS NOT NULL AND v_regua NOT IN ('quantidade', 'valor') THEN
    RAISE EXCEPTION 'A régua é «quantidade» ou «valor».' USING ERRCODE = '22023';
  END IF;

  -- Escolher uma regua sem preencher a meta dela deixaria o setor com uma meta
  -- de zero que «bate» sozinha no primeiro dia.
  IF v_regua = 'quantidade' AND v_qtd <= 0 THEN
    RAISE EXCEPTION 'A régua é quantidade — informe quantas vendas são a meta.'
      USING ERRCODE = '22023';
  END IF;
  IF v_regua = 'valor' AND v_val <= 0 THEN
    RAISE EXCEPTION 'A régua é valor — informe o faturamento que é a meta.'
      USING ERRCODE = '22023';
  END IF;

  IF v_regua IS NULL AND v_qtd = 0 AND v_val = 0 THEN
    DELETE FROM public.metas
     WHERE empresa_id = p_empresa_id AND tipo = p_tipo
       AND referencia_id = p_referencia_id AND ano = p_ano AND mes = p_mes;
    RETURN NULL;
  END IF;

  INSERT INTO public.metas (
    empresa_id, tipo, referencia_id, ano, mes,
    meta_acordos, meta_valor, regua, criado_por, updated_at
  ) VALUES (
    p_empresa_id, p_tipo, p_referencia_id, p_ano, p_mes,
    v_qtd, v_val, v_regua, auth.uid(), NOW()
  )
  ON CONFLICT (empresa_id, tipo, referencia_id, mes, ano) DO UPDATE SET
    meta_acordos = EXCLUDED.meta_acordos,
    meta_valor   = EXCLUDED.meta_valor,
    regua        = EXCLUDED.regua,
    updated_at   = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_meta_salvar(
  UUID, TEXT, UUID, INTEGER, INTEGER, TEXT, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_meta_salvar(
  UUID, TEXT, UUID, INTEGER, INTEGER, TEXT, INTEGER, NUMERIC) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_meta_salvar(
  UUID, TEXT, UUID, INTEGER, INTEGER, TEXT, INTEGER, NUMERIC) IS
  'Grava a meta de um recorte do Comercial, com a regua que decide. Regua sem a '
  'meta dela e recusada; tudo zerado apaga a linha.';

-- ============================================================================
-- 4. Ler as metas do mes, com o recorte ao lado
-- ============================================================================
--
-- Devolve TODO setor e TODA equipe da empresa, com ou sem meta. Uma consulta
-- que so trouxesse quem tem meta faria a tela esconder exatamente quem falta
-- configurar.

CREATE OR REPLACE FUNCTION public.fn_vendas_metas_do_mes(
  p_empresa_id UUID, p_ano INTEGER, p_mes INTEGER
)
RETURNS TABLE(
  tipo          TEXT,
  referencia_id UUID,
  nome          TEXT,
  setor_id      UUID,
  setor_nome    TEXT,
  regua         TEXT,
  quantidade    INTEGER,
  valor         NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT 'setor'::TEXT, s.id, s.nome, s.id, s.nome,
         m.regua, COALESCE(m.meta_acordos, 0), COALESCE(m.meta_valor, 0)
    FROM public.setores s
    LEFT JOIN public.metas m
      ON m.empresa_id = p_empresa_id AND m.tipo = 'setor'
     AND m.referencia_id = s.id AND m.ano = p_ano AND m.mes = p_mes
   WHERE s.empresa_id = p_empresa_id AND s.ativo
     AND public.fn_can_access_empresa(p_empresa_id)
     AND public.fn_user_tem('ver_metas_vendas')

  UNION ALL

  SELECT 'equipe'::TEXT, e.id, e.nome, e.setor_id, s.nome,
         m.regua, COALESCE(m.meta_acordos, 0), COALESCE(m.meta_valor, 0)
    FROM public.equipes e
    LEFT JOIN public.setores s ON s.id = e.setor_id
    LEFT JOIN public.metas m
      ON m.empresa_id = p_empresa_id AND m.tipo = 'equipe'
     AND m.referencia_id = e.id AND m.ano = p_ano AND m.mes = p_mes
   WHERE e.empresa_id = p_empresa_id
     AND public.fn_can_access_empresa(p_empresa_id)
     AND public.fn_user_tem('ver_metas_vendas')

   ORDER BY 1 DESC, 5, 3;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_metas_do_mes(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_metas_do_mes(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_metas_do_mes(UUID, INTEGER, INTEGER) IS
  'Todo setor e toda equipe da empresa, COM OU SEM meta no mes. Trazer so quem '
  'tem meta esconderia exatamente quem falta configurar.';

-- ============================================================================
-- 5. Semear e verificar
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
     AND cp.cargo <> 'rh'
     AND NOT (cp.permissoes ? cat.chave);

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves ausentes após semear: %', v_faltando;
  END IF;

  -- A regua so aceita os dois valores. Sem o CHECK, um 'faturamento' digitado
  -- em qualquer lugar viraria meta que nunca bate, em silencio.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'metas' AND column_name = 'regua'
  ) THEN
    RAISE EXCEPTION 'A coluna metas.regua nao foi criada.';
  END IF;
END $$;

COMMIT;
