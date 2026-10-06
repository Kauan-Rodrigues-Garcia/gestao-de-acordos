-- ============================================================================
-- 20261006120000_ranking_quitacao.sql
--
-- Ranking de quitação (pedido de 06/10/2026): uma aba do Analítico, ao lado do
-- Colchão, com os 6 operadores que mais quitaram no mês — foto, nome,
-- quantidade de acordos quitados, valor e o prêmio da posição.
--
-- ## De onde vem o número
--
-- Do relatório mensal de parcelas pagas do ERP (ex.: SETEMBRO.xls, aba
-- «Informações»), importado na própria aba. O navegador lê o arquivo e manda
-- só os acordos QUITADOS NO MÊS do arquivo:
--
--   - «Situação Atual» = Quitação (Valor Restante zerado). «Situação» não
--     serve: é o tipo do acordo na criação;
--   - «Data da quitação» dentro do mês. «Situação Atual» é foto do dia da
--     extração, então o relatório de setembro traz acordos que quitaram em
--     outubro — esses ficam para o relatório de outubro;
--   - um acordo conta uma vez (Cód. Acordo), com o «Valor Acordo».
--
-- Cada importação é a foto do mês e SUBSTITUI a anterior do mesmo mês.
--
-- ## A ordem
--
-- Por VALOR quitado (soma do Valor Acordo), desempate pela quantidade — decisão
-- de 06/10/2026.
--
-- ## Quem vê
--
-- Duas travas, como nos Desafios: a chave `analitico_sub_ranking_quitacao`
-- decide por CARGO e `ranking_quitacao_setores` decide por SETOR (linha
-- ausente ou desligada = o setor não tem ranking). O setor do operador é o da
-- equipe, senão o do cadastro — a mesma regra de `fn_desafio_pessoas_interna`.
--
-- ## O que este arquivo faz
--
--   - acrescenta 3 chaves ao catálogo (e semeia em `cargos_permissoes` só a
--     chave ausente, via fn_permissoes_semear_empresa);
--   - cria 2 tabelas vazias, sem escrita direta de `authenticated`;
--   - cria 3 funções (ranking, importar, definir setor). Os setores
--     habilitados a tela lê direto da tabela (policy de leitura por empresa).
--
-- Nenhum dado existente é alterado. Habilitar o Play 3 é feito depois, pela
-- tela de Configurações (ou por um INSERT à parte, autorizado à parte).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 0. Catálogo de permissões
-- ============================================================================
--
-- O topo da cadeia é 20261004120000 (tirou painel_diretoria_definir_carteira).
-- Renomeia o catálogo em vigor e põe um novo que o lê e soma as chaves novas.
-- A função renomeada NÃO é objeto morto: o catálogo novo depende dela.

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_ranking_quitacao_20261006()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_ranking_quitacao_20261006;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_ranking_quitacao_20261006() IS
  'Retrato do catalogo antes das chaves do Ranking de quitacao (06/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_ranking_quitacao_20261006()
  UNION ALL
  SELECT * FROM (VALUES
    -- A aba: todo mundo, como os Desafios — um ranking existe para quem disputa.
    -- Quem decide ONDE ela aparece é o setor (ranking_quitacao_setores).
    ('analitico_sub_ranking_quitacao', NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[], false),
    -- Importar o relatório: a mesma liderança que importa o Analítico.
    ('ranking_quitacao_importar',      NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    -- Habilitar setores e mudar prêmios: só acesso total, até o painel liberar.
    ('ranking_quitacao_configurar',    NULL::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261006120000 soma analitico_sub_ranking_quitacao, '
  'ranking_quitacao_importar e ranking_quitacao_configurar.';

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ============================================================================
-- 1. Os setores com ranking (e os prêmios de cada um)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ranking_quitacao_setores (
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id       UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  -- Do 1º ao 6º lugar, em reais. O padrão é a premiação de outubro/2026.
  premios        NUMERIC(12,2)[] NOT NULL DEFAULT ARRAY[350, 250, 180, 100, 70, 50]::NUMERIC(12,2)[],
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, setor_id),
  CONSTRAINT ranking_quitacao_setores_seis_premios CHECK (cardinality(premios) = 6)
);

COMMENT ON TABLE public.ranking_quitacao_setores IS
  'Setores em que a aba Ranking de quitacao aparece, com os premios do 1o ao 6o. '
  'Linha ausente ou ativo = false: o setor nao tem ranking. Ver 20261006120000.';

ALTER TABLE public.ranking_quitacao_setores ENABLE ROW LEVEL SECURITY;

-- Todo mundo da empresa LÊ: a tela precisa saber se mostra a aba.
DROP POLICY IF EXISTS ranking_quitacao_setores_select ON public.ranking_quitacao_setores;
CREATE POLICY ranking_quitacao_setores_select ON public.ranking_quitacao_setores
  FOR SELECT TO authenticated
  USING (public.fn_can_access_empresa(empresa_id));

-- Escrever só pela função (fn_ranking_quitacao_definir_setor).
REVOKE INSERT, UPDATE, DELETE ON public.ranking_quitacao_setores FROM authenticated, anon;

-- ============================================================================
-- 2. Os acordos quitados de cada mês (a foto importada)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ranking_quitacao_acordos (
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Primeiro dia do mês.
  mes              DATE NOT NULL,
  cod_acordo       TEXT NOT NULL,
  -- O login como veio no relatório; `operador_id` é o perfil casado na importação.
  operador_usuario TEXT NOT NULL,
  operador_id      UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  valor_acordo     NUMERIC(14,2) NOT NULL,
  data_quitacao    DATE NOT NULL,
  importado_por    UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  importado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, mes, cod_acordo),
  CONSTRAINT ranking_quitacao_acordos_mes_inicio CHECK (mes = date_trunc('month', mes)::DATE),
  CONSTRAINT ranking_quitacao_acordos_no_mes CHECK (date_trunc('month', data_quitacao)::DATE = mes)
);

CREATE INDEX IF NOT EXISTS idx_ranking_quitacao_acordos_operador
  ON public.ranking_quitacao_acordos (empresa_id, mes, operador_id);

COMMENT ON TABLE public.ranking_quitacao_acordos IS
  'Acordos quitados no mes, do relatorio mensal de parcelas pagas do ERP. Cada '
  'importacao substitui o mes inteiro. Leitura so por fn_ranking_quitacao. Ver 20261006120000.';

-- Sem policy: ninguém lê nem escreve direto. Tudo passa pelas funções abaixo,
-- que conferem a chave e o setor.
ALTER TABLE public.ranking_quitacao_acordos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ranking_quitacao_acordos FROM authenticated, anon;

-- ============================================================================
-- 3. O ranking
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao(p_empresa_id UUID, p_setor_id UUID, p_mes DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mes     DATE := date_trunc('month', p_mes)::DATE;
  v_premios NUMERIC(12,2)[];
  v_out     JSONB;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('analitico_sub_ranking_quitacao')) THEN
    RAISE EXCEPTION 'Sem permissao para ver o Ranking de quitacao.' USING ERRCODE = '42501';
  END IF;

  SELECT s.premios INTO v_premios
    FROM public.ranking_quitacao_setores s
   WHERE s.empresa_id = p_empresa_id AND s.setor_id = p_setor_id AND s.ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('habilitado', false);
  END IF;

  WITH por_operador AS (
    SELECT a.operador_id,
           COUNT(*)::INTEGER   AS quitacoes,
           SUM(a.valor_acordo) AS valor
      FROM public.ranking_quitacao_acordos a
      JOIN public.perfis p        ON p.id = a.operador_id
      LEFT JOIN public.equipes e  ON e.id = p.equipe_id
     WHERE a.empresa_id = p_empresa_id
       AND a.mes = v_mes
       AND COALESCE(e.setor_id, p.setor_id) = p_setor_id
     GROUP BY a.operador_id
  ),
  ordenado AS (
    SELECT po.operador_id, po.quitacoes, po.valor, p.nome, p.foto_url,
           ROW_NUMBER() OVER (ORDER BY po.valor DESC, po.quitacoes DESC, p.nome) AS posicao
      FROM por_operador po
      JOIN public.perfis p ON p.id = po.operador_id
  )
  SELECT jsonb_build_object(
    'habilitado',    true,
    'premios',       to_jsonb(v_premios),
    'participantes', (SELECT COUNT(*) FROM ordenado),
    'importado_em',  (SELECT MAX(a.importado_em) FROM public.ranking_quitacao_acordos a
                       WHERE a.empresa_id = p_empresa_id AND a.mes = v_mes),
    'posicoes',      COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                                'posicao', o.posicao, 'operador_id', o.operador_id, 'nome', o.nome,
                                'foto_url', o.foto_url, 'quitacoes', o.quitacoes, 'valor', o.valor)
                              ORDER BY o.posicao)
                         FROM ordenado o WHERE o.posicao <= 6), '[]'::JSONB),
    -- Quem está olhando, se ficou fora do pódio: «você está em 9º».
    'eu',            (SELECT jsonb_build_object('posicao', o.posicao, 'quitacoes', o.quitacoes, 'valor', o.valor)
                        FROM ordenado o WHERE o.operador_id = (SELECT auth.uid()))
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public.fn_ranking_quitacao(UUID, UUID, DATE) IS
  'Os 6 que mais quitaram (por valor, desempate por quantidade) no setor e mes, '
  'com os premios do setor. habilitado = false quando o setor nao tem ranking. 20261006120000.';

-- ============================================================================
-- 4. Importar (substitui o mês)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao_importar(p_empresa_id UUID, p_mes DATE, p_linhas JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mes DATE := date_trunc('month', p_mes)::DATE;
  v_n   INTEGER;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('ranking_quitacao_importar')) THEN
    RAISE EXCEPTION 'Sem permissao para importar o Ranking de quitacao.' USING ERRCODE = '42501';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'As linhas do relatorio vieram em formato invalido.';
  END IF;

  DELETE FROM public.ranking_quitacao_acordos
   WHERE empresa_id = p_empresa_id AND mes = v_mes;

  INSERT INTO public.ranking_quitacao_acordos
         (empresa_id, mes, cod_acordo, operador_usuario, operador_id, valor_acordo, data_quitacao, importado_por)
  SELECT p_empresa_id, v_mes, l.cod_acordo, l.operador_usuario, p.id, l.valor_acordo, l.data_quitacao, (SELECT auth.uid())
    FROM jsonb_to_recordset(p_linhas)
         AS l(cod_acordo TEXT, operador_usuario TEXT, operador_id UUID, valor_acordo NUMERIC, data_quitacao DATE)
    -- O perfil casado no navegador só vale se for desta empresa.
    LEFT JOIN public.perfis p ON p.id = l.operador_id AND p.empresa_id = p_empresa_id
   WHERE NULLIF(trim(l.cod_acordo), '') IS NOT NULL
     AND NULLIF(trim(l.operador_usuario), '') IS NOT NULL
     AND l.valor_acordo IS NOT NULL
     AND date_trunc('month', l.data_quitacao)::DATE = v_mes
  ON CONFLICT (empresa_id, mes, cod_acordo) DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.fn_ranking_quitacao_importar(UUID, DATE, JSONB) IS
  'Grava os acordos quitados do mes, substituindo a importacao anterior do mesmo mes. 20261006120000.';

-- ============================================================================
-- 5. Habilitar setor e mudar prêmios
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ranking_quitacao_definir_setor(
  p_empresa_id UUID, p_setor_id UUID, p_ativo BOOLEAN, p_premios NUMERIC[] DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('ranking_quitacao_configurar')) THEN
    RAISE EXCEPTION 'Sem permissao para configurar o Ranking de quitacao.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.setores s WHERE s.id = p_setor_id AND s.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'Setor nao encontrado nesta empresa.';
  END IF;
  IF p_premios IS NOT NULL AND (
       cardinality(p_premios) <> 6
       OR EXISTS (SELECT 1 FROM unnest(p_premios) v WHERE v IS NULL OR v < 0)
     ) THEN
    RAISE EXCEPTION 'Os premios sao seis valores, do 1o ao 6o lugar, sem negativos.';
  END IF;

  INSERT INTO public.ranking_quitacao_setores AS s (empresa_id, setor_id, ativo, premios, atualizado_por, atualizado_em)
  VALUES (p_empresa_id, p_setor_id, COALESCE(p_ativo, TRUE),
          COALESCE(p_premios, ARRAY[350, 250, 180, 100, 70, 50]::NUMERIC[]),
          (SELECT auth.uid()), NOW())
  ON CONFLICT (empresa_id, setor_id) DO UPDATE
     SET ativo          = COALESCE(p_ativo, s.ativo),
         premios        = COALESCE(p_premios, s.premios),
         atualizado_por = EXCLUDED.atualizado_por,
         atualizado_em  = NOW();
END;
$function$;

COMMENT ON FUNCTION public.fn_ranking_quitacao_definir_setor(UUID, UUID, BOOLEAN, NUMERIC[]) IS
  'Liga/desliga o Ranking de quitacao num setor e grava os premios (NULL mantem). 20261006120000.';

-- ── Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_ranking_quitacao(UUID, UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ranking_quitacao_importar(UUID, DATE, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ranking_quitacao_definir_setor(UUID, UUID, BOOLEAN, NUMERIC[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ranking_quitacao(UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ranking_quitacao_importar(UUID, DATE, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ranking_quitacao_definir_setor(UUID, UUID, BOOLEAN, NUMERIC[]) TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
DECLARE n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_painel_diretoria') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: chaves antigas sumiram.';
  END IF;
  SELECT COUNT(*) INTO n FROM public.fn_permissoes_catalogo() c
   WHERE c.chave IN ('analitico_sub_ranking_quitacao', 'ranking_quitacao_importar', 'ranking_quitacao_configurar');
  IF n <> 3 THEN
    RAISE EXCEPTION 'As chaves do Ranking de quitacao nao entraram no catalogo (% de 3).', n;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ranking_quitacao_acordos'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ranking_quitacao_setores'::regclass) THEN
    RAISE EXCEPTION 'Uma tabela do Ranking de quitacao ficou sem RLS.';
  END IF;
  IF has_table_privilege('authenticated', 'public.ranking_quitacao_acordos', 'SELECT')
     OR has_table_privilege('authenticated', 'public.ranking_quitacao_setores', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated ainda acessa direto as tabelas do Ranking de quitacao.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_ranking_quitacao_importar(uuid,date,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_ranking_quitacao_importar ficou aberta para anon.';
  END IF;
END
$prova$;

COMMIT;
