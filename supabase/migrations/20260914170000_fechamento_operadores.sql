-- ============================================================================
-- Fechamento: a aba que substitui a planilha de fechamento da gerencia
-- ============================================================================
--
-- ## O que isto guarda — e o que NAO guarda
--
-- A planilha de fechamento tinha nove colunas por operador. Sete delas ja
-- existem no Gestao e continuam morando onde moram:
--
--   operador ............ perfis
--   fechamento .......... fn_analitico_resumo_por_operador (o mesmo do Analitico)
--   meta / meta atingida  metas.meta_valor + metas.metas_extras
--   alcance / quartil ... calcularProjecao + metas_config_mes.quartis (na tela)
--   media por D.U. ...... fechamento / D.U. trabalhado (na tela)
--
-- Duas nao existem em lugar nenhum, e sao elas que esta tabela guarda:
--
--   du_trabalhado ....... dias uteis que a pessoa trabalhou no mes
--   situacao ............ a situacao da pessoa NAQUELE fechamento
--
-- Guardar tambem o recebimento ou a meta criaria um segundo numero para a mesma
-- pergunta — e o fechamento deixaria de acompanhar o Analitico quando alguem
-- reimportasse o mes.
--
-- ## A situacao daqui NAO e `perfis.situacao`
--
-- Os nomes se parecem (FERIAS, DESLIGADO), e a semelhanca e armadilha. A de
-- `perfis` bloqueia login, tira do ranking e do quartil. A daqui e uma anotacao
-- da gerencia sobre um mes, sem efeito em nenhuma outra tela. Nenhuma funcao,
-- trigger ou policy liga as duas, e nenhuma deve ligar.
--
-- ## Competencia propria
--
-- Uma linha por operador por mes (`UNIQUE (empresa_id, operador_id, ano, mes)`).
-- Agosto e setembro nunca se sobrescrevem.
--
-- ## Permissoes: nascem desligadas para todo cargo
--
-- `ver_fechamento`, `fechamento_escopo_setor`, `fechamento_escopo_todos_setores`
-- e `fechamento_editar`. Padrao vazio: nenhum cargo configuravel nasce com elas.
-- Administrador e super_admin enxergam por acesso total (nao sao explicitas),
-- que e o pedido de 14/09/2026: so a administracao por enquanto, e a gerencia
-- ganha depois, pelo painel de Permissoes — sem migration.
--
-- ## Escrita so por RPC
--
-- Nenhuma policy de escrita. `fn_fechamento_salvar` confere a chave de editar,
-- a empresa e o alcance sobre o operador. A leitura confere a aba e o alcance
-- (`fn_fechamento_alcanca`): D.U. e situacao sao dados de pessoa (ATESTADO,
-- LICENCA, GRAVIDEZ), e nao ficam abertos para a empresa inteira como `metas`.
--
-- Escrita de dados: nenhuma. Nenhum usuario ganha chave aqui.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. Catalogo de permissoes
-- ============================================================================
--
-- `fn_permissoes_catalogo` e uma cadeia de funcoes `_antes_`. Acrescentar chave
-- e congelar a de hoje (corpo de 20260914124137) e redefinir a de cima.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo_antes_fechamento_20260914()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_robo_59_20260914()
  UNION ALL
  SELECT * FROM (VALUES
    ('mestre_importar_automatico', ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], true)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_fechamento_20260914() IS
  'Retrato do catalogo antes das chaves da aba Fechamento (14/09/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_fechamento_20260914()
  UNION ALL
  SELECT * FROM (VALUES
    -- A aba Fechamento. So BookPlay: as situacoes da planilha sao da operacao
    -- dela. Padrao vazio em todas — ninguem nasce com a aba; administrador e
    -- super_admin a recebem por acesso total.
    ('ver_fechamento',                  ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('fechamento_escopo_setor',         ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('fechamento_escopo_todos_setores', ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('fechamento_editar',               ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

-- ============================================================================
-- 2. A aba `fechamento` no registro de escopo
-- ============================================================================
--
-- Sem esta linha `fn_user_escopo('fechamento')` devolve -1 para todo mundo, e a
-- RLS abaixo nao entregaria linha nenhuma. As entradas anteriores sao repetidas
-- na integra: `fn_abas_escopo` e redefinida por inteiro (corpo de 20260910165333).
--
-- Dois niveis, `setor` e `todos_setores`, como o Painel Lider: a gerencia olha
-- o proprio setor, e a cupula escolhe entre os setores. O bloco de prova de
-- 20260823020000 emite NOTICE para os dois niveis que a aba nao usa — esperado.

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
    ('fechamento',       'ver_fechamento');
$function$;

COMMENT ON FUNCTION public.fn_abas_escopo() IS
  'Registro de abas com escopo. `fechamento` entrou em 20260914 com dois niveis '
  '(setor e todos_setores).';

-- ============================================================================
-- 3. A tabela
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fechamento_operadores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  operador_id    UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  ano            INTEGER NOT NULL CHECK (ano >= 2024),
  mes            INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  du_trabalhado  SMALLINT CHECK (du_trabalhado BETWEEN 0 AND 31),
  -- As 13 opcoes da planilha, em codigo estavel. O rotulo mora na tela.
  situacao       TEXT CHECK (situacao IN (
                   'assiduo', 'desligado', 'licenca', 'atestado', 'ferias',
                   'exp_45_dias', 'exp_90_dias', 'banco_de_horas', 'remanejado',
                   'capacitaplay', 'gravidez_atuando', 'falta', 'outros'
                 )),
  atualizado_por UUID,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fechamento_operadores_competencia_unica
    UNIQUE (empresa_id, operador_id, ano, mes)
);

-- A leitura da tela e sempre «a empresa neste mes».
CREATE INDEX IF NOT EXISTS idx_fechamento_operadores_empresa_mes
  ON public.fechamento_operadores(empresa_id, ano, mes);

-- FK sem indice deixa o ON DELETE CASCADE de `perfis` varrendo a tabela.
CREATE INDEX IF NOT EXISTS idx_fechamento_operadores_operador
  ON public.fechamento_operadores(operador_id);

COMMENT ON TABLE public.fechamento_operadores IS
  'Dados MANUAIS do fechamento mensal por operador: D.U. trabalhado e situacao '
  'no fechamento. Independente de perfis.situacao. Recebimento, meta e quartil '
  'nao moram aqui — vem do Analitico e das Metas. Escrita so por fn_fechamento_salvar.';

COMMENT ON COLUMN public.fechamento_operadores.situacao IS
  'Situacao do operador NESTE fechamento. Nao e perfis.situacao e nao muda '
  'login, ranking, quartil nem cadastro.';

-- ============================================================================
-- 4. Alcance: quem enxerga o fechamento de qual operador
-- ============================================================================
--
-- Nivel 3 (todos os setores): a empresa inteira.
-- Nivel 2 (setor): operador de um dos setores de quem pergunta — pelo cadastro
-- de hoje (`fn_setores_do_operador`, que ja inclui clone) OU pelo retrato do
-- mes (`composicao_mes`). O retrato entra porque a tela de um mes fechado lista
-- quem estava no setor NAQUELE mes: sem ele, a pessoa transferida depois da
-- virada apareceria na lista da gerencia e a D.U. dela seria recusada.

CREATE OR REPLACE FUNCTION public.fn_fechamento_alcanca(
  p_empresa_id UUID, p_operador_id UUID, p_ano INTEGER, p_mes INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH escopo AS (
    SELECT public.fn_user_escopo('fechamento') AS nivel
  ),
  meus AS (
    SELECT s AS setor_id FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s
  )
  SELECT public.fn_can_access_empresa(p_empresa_id)
    AND CASE
      WHEN (SELECT nivel FROM escopo) >= 3 THEN TRUE
      WHEN (SELECT nivel FROM escopo) = 2 THEN (
        EXISTS (
          SELECT 1 FROM public.fn_setores_do_operador(p_operador_id) AS o
           WHERE o IN (SELECT setor_id FROM meus)
        )
        OR EXISTS (
          SELECT 1 FROM public.composicao_mes c
           WHERE c.empresa_id  = p_empresa_id
             AND c.operador_id = p_operador_id
             AND c.mes = to_char(make_date(p_ano, p_mes, 1), 'YYYY-MM')
             AND c.setor_id IN (SELECT setor_id FROM meus)
        )
      )
      ELSE FALSE
    END;
$function$;

REVOKE ALL ON FUNCTION public.fn_fechamento_alcanca(UUID, UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fechamento_alcanca(UUID, UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.fn_fechamento_alcanca(UUID, UUID, INTEGER, INTEGER) IS
  'O usuario logado alcanca o fechamento deste operador neste mes? Nivel 3 = '
  'empresa; nivel 2 = setores do usuario, pelo cadastro atual ou pelo retrato do mes.';

-- ============================================================================
-- 5. RLS: so leitura
-- ============================================================================

ALTER TABLE public.fechamento_operadores ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.fechamento_operadores FROM anon;

DROP POLICY IF EXISTS fechamento_operadores_select ON public.fechamento_operadores;
CREATE POLICY fechamento_operadores_select ON public.fechamento_operadores
  FOR SELECT TO authenticated
  USING (public.fn_fechamento_alcanca(empresa_id, operador_id, ano, mes));

-- ============================================================================
-- 6. Gravar D.U. e situacao
-- ============================================================================
--
-- A unidade de gravacao e a LINHA: os dois campos chegam juntos, do jeito que a
-- tela esta mostrando. Nulo apaga o campo. Os dois nulos apagam a linha — uma
-- linha vazia nao informa nada e so faria a tabela crescer.

CREATE OR REPLACE FUNCTION public.fn_fechamento_salvar(
  p_empresa_id    UUID,
  p_operador_id   UUID,
  p_ano           INTEGER,
  p_mes           INTEGER,
  p_du_trabalhado INTEGER,
  p_situacao      TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id       UUID;
  v_situacao TEXT := NULLIF(BTRIM(p_situacao), '');
BEGIN
  IF NOT public.fn_user_tem('fechamento_editar') THEN
    RAISE EXCEPTION 'Seu cargo não pode preencher o fechamento.' USING ERRCODE = '42501';
  END IF;

  IF p_empresa_id IS NULL OR p_operador_id IS NULL OR p_ano IS NULL OR p_mes IS NULL THEN
    RAISE EXCEPTION 'Fechamento incompleto: empresa, operador, ano e mês são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF p_mes NOT BETWEEN 1 AND 12 OR p_ano < 2024 THEN
    RAISE EXCEPTION 'Competência inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_du_trabalhado IS NOT NULL AND p_du_trabalhado NOT BETWEEN 0 AND 31 THEN
    RAISE EXCEPTION 'D.U. trabalhado precisa estar entre 0 e 31.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.perfis p
     WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'O operador não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.fn_fechamento_alcanca(p_empresa_id, p_operador_id, p_ano, p_mes) THEN
    RAISE EXCEPTION 'Este operador está fora do seu alcance no Fechamento.' USING ERRCODE = '42501';
  END IF;

  IF p_du_trabalhado IS NULL AND v_situacao IS NULL THEN
    DELETE FROM public.fechamento_operadores
     WHERE empresa_id = p_empresa_id AND operador_id = p_operador_id
       AND ano = p_ano AND mes = p_mes;
    RETURN NULL;
  END IF;

  -- Situacao fora da lista cai no CHECK da tabela, com a mensagem do Postgres.
  INSERT INTO public.fechamento_operadores (
    empresa_id, operador_id, ano, mes, du_trabalhado, situacao,
    atualizado_por, atualizado_em
  ) VALUES (
    p_empresa_id, p_operador_id, p_ano, p_mes, p_du_trabalhado::SMALLINT, v_situacao,
    auth.uid(), NOW()
  )
  ON CONFLICT ON CONSTRAINT fechamento_operadores_competencia_unica DO UPDATE SET
    du_trabalhado  = EXCLUDED.du_trabalhado,
    situacao       = EXCLUDED.situacao,
    atualizado_por = EXCLUDED.atualizado_por,
    atualizado_em  = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_fechamento_salvar(UUID, UUID, INTEGER, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fechamento_salvar(UUID, UUID, INTEGER, INTEGER, INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_fechamento_salvar(UUID, UUID, INTEGER, INTEGER, INTEGER, TEXT) IS
  'Grava D.U. trabalhado e situacao do fechamento de um operador num mes. Exige '
  'fechamento_editar e alcance (fn_fechamento_alcanca). Os dois nulos apagam a linha.';

COMMIT;
