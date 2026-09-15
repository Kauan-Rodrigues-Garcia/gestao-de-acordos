-- ============================================================================
-- Comercial, Fase 7: indicacoes
-- ============================================================================
--
-- «Indicações tem que ser um local para adicionar manualmente essas
-- informações.» — a decisao de 15/09/2026, respondendo a lacuna E do plano.
--
-- ## Por que nao sai de relatorio nenhum
--
-- Indicacao e o que acontece ANTES da venda: alguem de uma instituicao aponta
-- um contato. O prospeccao so ve o que ja virou documento, entao nao ha de onde
-- importar — e essa e a unica aba do Comercial cuja fonte e sempre gente
-- digitando.
--
-- Por isso o cadastro e em LOTE: quem volta de uma escola volta com oito nomes,
-- nao com um. Uma tela que aceitasse um por vez transformaria a tarefa em oito
-- idas ao formulario, e o que nao e barato de registrar nao e registrado.
--
-- ## A instituicao e unica por empresa, e isso e o que faz o ranking valer
--
-- «Ranking de quem mais indicou» so significa alguma coisa se a mesma
-- instituicao nao puder ser contada duas vezes. Sem a trava, dois operadores
-- que visitam a mesma escola somam dois pontos por um contato — e o ranking
-- premia quem cadastrou mais rapido, nao quem prospectou melhor.
--
-- A chave e o nome NORMALIZADO (minusculas, sem espaco sobrando): «Colégio São
-- José» e «colegio são josé  » sao a mesma escola, e um indice sobre o texto
-- cru nao veria isso.
--
-- Quando a segunda tentativa chega, a resposta diz QUEM indicou e QUANDO. Uma
-- recusa que nao informa isso faz a pessoa achar que o sistema perdeu o dado.
--
-- ⚠️ Esta e uma decisao de produto com trava tecnica. Se a regra for outra — a
-- mesma instituicao podendo ser reindicada a cada campanha, por exemplo —, o
-- conserto e trocar o indice unico por (empresa, instituicao, mes). Esta
-- escrito aqui para que a troca seja uma decisao, e nao uma descoberta.
--
-- ## Escopo proprio, e nao o de Vendas
--
-- `indicacoes` entra em `fn_abas_escopo()` com os quatro niveis. Reusar o
-- escopo de Vendas seria mais curto e erraria: alcance em Vendas responde «de
-- quem eu vejo a venda», e um operador que ve so a propria carteira pode
-- perfeitamente precisar ver o ranking de indicacoes do setor — sao perguntas
-- diferentes, como a Monitoria e o Chat ja provaram nesta casa.
--
-- Escrita de dados: nenhuma linha de indicacao. Semeia as oito permissoes
-- novas nos cargos existentes, `rh` de fora como decidido em 15/09.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. Catalogo de permissoes
-- ============================================================================
--
-- A cadeia parte do topo de VERDADE, que hoje e a Fase 5. O congelamento
-- abaixo repete, palavra por palavra, o corpo atual de `fn_permissoes_catalogo`
-- — e e isso que o torna um retrato: se ele apontasse para a funcao viva, a
-- proxima extensao se referenciaria em circulo.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo_antes_indicacoes_20260915()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_meta_vendas_20260915()
  UNION ALL
  SELECT * FROM (VALUES
    ('ver_metas_vendas',    ARRAY['comercial']::TEXT[],
       ARRAY['operador','lider','elite','gerencia','diretoria']::TEXT[], false),
    ('editar_metas_vendas', ARRAY['comercial']::TEXT[],
       ARRAY['gerencia']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
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
    -- Operador cria: a indicacao e dele, e passar pelo lider so adiaria o
    -- registro do que ele acabou de ouvir na escola.
    ('criar_indicacoes',   ARRAY['comercial']::TEXT[],
       ARRAY['operador','lider','elite','gerencia']::TEXT[], false),
    -- Editar e excluir NAO: corrigir o nome da instituicao muda a chave unica,
    -- e apagar tira ponto do ranking de alguem. Sao atos de lideranca.
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

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. A extensao 20260915200000 adiciona as chaves de '
  'indicacoes do Comercial.';

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
    ('indicacoes',       'ver_indicacoes');
$function$;

COMMENT ON FUNCTION public.fn_abas_escopo() IS
  'Registro de abas com escopo. `indicacoes` entrou em 20260915200000 com os '
  'quatro niveis — escopo PROPRIO, e nao o de Vendas: «de quem eu vejo a '
  'venda» e «de quem eu vejo a indicacao» sao perguntas diferentes.';

-- ============================================================================
-- 3. A tabela
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.indicacoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Quem INDICOU. E o dono do ponto no ranking.
  operador_id    UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  -- Congelados na gravacao, como em `vendas`: quem muda de equipe depois nao
  -- leva o historico junto.
  setor_id       UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  equipe_id      UUID REFERENCES public.equipes(id) ON DELETE SET NULL,

  instituicao    TEXT NOT NULL CHECK (BTRIM(instituicao) <> ''),
  gestora        TEXT,
  telefone       TEXT,
  data_indicacao DATE NOT NULL,
  observacao     TEXT,

  criado_por     UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.indicacoes IS
  'Indicacao de instituicao, cadastrada a mao. Unica aba do Comercial sem '
  'relatorio de origem: o prospeccao so ve o que ja virou documento.';

COMMENT ON COLUMN public.indicacoes.operador_id IS
  'Quem indicou — o dono do ponto no ranking. Diferente de `criado_por`, que e '
  'quem digitou: o lider pode cadastrar pelo operador que voltou da visita.';

-- A chave que faz o ranking valer. Ver o cabecalho.
CREATE UNIQUE INDEX IF NOT EXISTS uq_indicacoes_instituicao
  ON public.indicacoes(empresa_id, LOWER(BTRIM(instituicao)));

CREATE INDEX IF NOT EXISTS idx_indicacoes_operador
  ON public.indicacoes(empresa_id, operador_id, data_indicacao DESC);
CREATE INDEX IF NOT EXISTS idx_indicacoes_setor
  ON public.indicacoes(empresa_id, setor_id, data_indicacao DESC);
CREATE INDEX IF NOT EXISTS idx_indicacoes_equipe
  ON public.indicacoes(empresa_id, equipe_id, data_indicacao DESC);
CREATE INDEX IF NOT EXISTS idx_indicacoes_criado_por
  ON public.indicacoes(criado_por);

-- ============================================================================
-- 4. RLS
-- ============================================================================
--
-- Leitura pela policy, escrita so por RPC. Mesmo desenho de `vendas`.
--
-- A funcao de escopo entra em `(SELECT ...)` e o alcance de equipe/setor vem de
-- subconsulta, nao de chamada por linha: ver a memoria «Como escrever policy
-- aqui» — busca em `perfis` custava 140ms com RLS mal escrita contra 0,011ms.

ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.indicacoes FROM anon;

DROP POLICY IF EXISTS indicacoes_select ON public.indicacoes;
CREATE POLICY indicacoes_select ON public.indicacoes
FOR SELECT TO authenticated
USING (
  public.fn_can_access_empresa(empresa_id)
  AND (
    operador_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_escopo('indicacoes')) >= 3
    OR (
      (SELECT public.fn_user_escopo('indicacoes')) = 2
      AND setor_id IN (
        SELECT s FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s
      )
    )
    OR (
      (SELECT public.fn_user_escopo('indicacoes')) = 1
      AND equipe_id IN (
        SELECT e.equipe_id FROM public.fn_equipes_com_lideranca((SELECT auth.uid())) AS e
      )
    )
  )
);

-- ============================================================================
-- 5. Gravar em LOTE
-- ============================================================================
--
-- Recebe um array e devolve o que entrou e o que ja existia. NAO aborta no
-- primeiro repetido: quem volta com oito nomes e tem o terceiro repetido quer
-- os outros sete gravados, e a lista de quais bateram.
--
-- `ON CONFLICT DO NOTHING` faria o mesmo silenciosamente. Aqui a repetida
-- volta com QUEM indicou e QUANDO, porque e essa a informacao util: «a Ana
-- cadastrou essa escola em 03/09» responde a pergunta; «duplicada» nao.

CREATE OR REPLACE FUNCTION public.fn_indicacoes_salvar_lote(
  p_empresa_id  UUID,
  p_operador_id UUID,
  p_itens       JSONB
)
RETURNS TABLE(gravadas INTEGER, repetidas JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_setor     UUID;
  v_equipe    UUID;
  v_gravadas  INTEGER := 0;
  v_repetidas JSONB   := '[]'::JSONB;
  j           JSONB;
  v_nome      TEXT;
  v_data      DATE;
  v_dona      RECORD;
BEGIN
  IF NOT public.fn_user_tem('criar_indicacoes') THEN
    RAISE EXCEPTION 'Seu cargo não pode cadastrar indicação.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  SELECT p.setor_id INTO v_setor
    FROM public.perfis p
   WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O operador não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;

  -- A equipe que CREDITA — a mesma regra de vendas. Sem isto, indicacao de
  -- lider ficaria fora de equipe nenhuma no ranking por equipe.
  v_equipe := public.fn_vendas_equipe_que_credita(p_operador_id);

  -- Cadastrar PELO outro e ato de lideranca: sem `editar_indicacoes` so se
  -- cadastra em nome proprio. Caso contrario um operador poderia encher o
  -- ranking de um colega, ou esvaziar o proprio para nao aparecer.
  IF p_operador_id <> (SELECT auth.uid())
     AND NOT public.fn_user_tem('editar_indicacoes') THEN
    RAISE EXCEPTION 'Você só pode cadastrar indicação em seu próprio nome.'
      USING ERRCODE = '42501';
  END IF;

  FOR j IN SELECT * FROM jsonb_array_elements(COALESCE(p_itens, '[]'::JSONB))
  LOOP
    v_nome := NULLIF(BTRIM(COALESCE(j->>'instituicao', '')), '');
    CONTINUE WHEN v_nome IS NULL;

    v_data := COALESCE(NULLIF(BTRIM(COALESCE(j->>'data_indicacao','')), '')::DATE, CURRENT_DATE);

    SELECT i.instituicao, i.data_indicacao, p.nome AS quem
      INTO v_dona
      FROM public.indicacoes i
      LEFT JOIN public.perfis p ON p.id = i.operador_id
     WHERE i.empresa_id = p_empresa_id
       AND LOWER(BTRIM(i.instituicao)) = LOWER(v_nome);

    IF FOUND THEN
      v_repetidas := v_repetidas || jsonb_build_object(
        'instituicao', v_nome,
        'ja_indicada_por', COALESCE(v_dona.quem, 'alguém que saiu'),
        'em', v_dona.data_indicacao
      );
      CONTINUE;
    END IF;

    INSERT INTO public.indicacoes (
      empresa_id, operador_id, setor_id, equipe_id,
      instituicao, gestora, telefone, data_indicacao, observacao, criado_por
    ) VALUES (
      p_empresa_id, p_operador_id, v_setor, v_equipe,
      v_nome,
      NULLIF(BTRIM(COALESCE(j->>'gestora','')), ''),
      NULLIF(BTRIM(COALESCE(j->>'telefone','')), ''),
      v_data,
      NULLIF(BTRIM(COALESCE(j->>'observacao','')), ''),
      auth.uid()
    );

    v_gravadas := v_gravadas + 1;
  END LOOP;

  RETURN QUERY SELECT v_gravadas, v_repetidas;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_indicacoes_salvar_lote(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_indicacoes_salvar_lote(UUID, UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_indicacoes_salvar_lote(UUID, UUID, JSONB) IS
  'Grava varias indicacoes de uma vez. Nao aborta no repetido: devolve o que '
  'entrou e, para cada repetida, QUEM ja a indicou e QUANDO.';

-- ============================================================================
-- 6. Excluir
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_indicacao_excluir(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_linha public.indicacoes%ROWTYPE;
BEGIN
  IF NOT public.fn_user_tem('excluir_indicacoes') THEN
    RAISE EXCEPTION 'Seu cargo não pode excluir indicação.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_linha FROM public.indicacoes WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indicação não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_can_access_empresa(v_linha.empresa_id) THEN
    RAISE EXCEPTION 'Esta indicação é de outra empresa.' USING ERRCODE = '42501';
  END IF;

  -- Some de vez: nao ha lixeira aqui. A indicacao e um registro de uma frase
  -- dita numa visita — recriar custa a mesma digitacao, e uma lixeira a mais
  -- seria mais tabela para manter do que valor devolvido.
  DELETE FROM public.indicacoes WHERE id = p_id;
  RETURN p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_indicacao_excluir(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_indicacao_excluir(UUID) TO authenticated;

-- ============================================================================
-- 7. O ranking
-- ============================================================================
--
-- Quem mais indicou no periodo. Le a TABELA, e a RLS recorta — entao o
-- operador ve so o proprio numero e o lider ve o setor, sem a funcao precisar
-- saber disso. E `SECURITY INVOKER` de proposito, ao contrario das RPCs de
-- escrita: aqui o recorte de quem olha e a resposta certa.

CREATE OR REPLACE FUNCTION public.fn_indicacoes_ranking(
  p_empresa_id UUID, p_de DATE, p_ate DATE
)
RETURNS TABLE(
  operador_id   UUID,
  operador_nome TEXT,
  equipe_id     UUID,
  equipe_nome   TEXT,
  quantidade    INTEGER,
  primeira      DATE,
  ultima        DATE
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT i.operador_id,
         COALESCE(p.nome, '—'),
         i.equipe_id,
         COALESCE(e.nome, 'Sem equipe'),
         COUNT(*)::INTEGER,
         MIN(i.data_indicacao),
         MAX(i.data_indicacao)
    FROM public.indicacoes i
    LEFT JOIN public.perfis  p ON p.id = i.operador_id
    LEFT JOIN public.equipes e ON e.id = i.equipe_id
   WHERE i.empresa_id     = p_empresa_id
     AND i.data_indicacao >= p_de
     AND i.data_indicacao <= p_ate
   GROUP BY i.operador_id, p.nome, i.equipe_id, e.nome
   ORDER BY COUNT(*) DESC, COALESCE(p.nome, '—');
$function$;

REVOKE ALL ON FUNCTION public.fn_indicacoes_ranking(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_indicacoes_ranking(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_indicacoes_ranking(UUID, DATE, DATE) IS
  'Quem mais indicou no periodo. SECURITY INVOKER: o recorte da RLS de quem '
  'olha e a resposta certa — operador ve o proprio numero, lider ve o setor.';

-- Uma linha por dia, para o grafico. Mesma decisao de INVOKER.
CREATE OR REPLACE FUNCTION public.fn_indicacoes_por_dia(
  p_empresa_id UUID, p_de DATE, p_ate DATE
)
RETURNS TABLE(dia DATE, quantidade INTEGER)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT i.data_indicacao, COUNT(*)::INTEGER
    FROM public.indicacoes i
   WHERE i.empresa_id     = p_empresa_id
     AND i.data_indicacao >= p_de
     AND i.data_indicacao <= p_ate
   GROUP BY i.data_indicacao
   ORDER BY i.data_indicacao;
$function$;

REVOKE ALL ON FUNCTION public.fn_indicacoes_por_dia(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_indicacoes_por_dia(UUID, DATE, DATE) TO authenticated;

-- ============================================================================
-- 8. Semear e verificar
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
  -- `rh` fora: `fn_permissoes_semear_empresa` nao itera esse cargo, e a decisao
  -- de 15/09 foi deixa-lo como esta.
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

  -- A cadeia nao pode ter perdido nada pelo caminho. `tickets_excluir` e a
  -- testemunha: foi a chave que sumiu em silencio na primeira vez que duas
  -- migrations disputaram o topo do catalogo.
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'tickets_excluir') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: tickets_excluir sumiu.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'editar_metas_vendas') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: editar_metas_vendas sumiu.';
  END IF;

  SELECT COUNT(*) INTO n FROM public.fn_permissoes_catalogo()
   WHERE chave LIKE 'indicacoes_escopo_%' OR chave LIKE '%_indicacoes';
  IF n <> 8 THEN
    RAISE EXCEPTION 'Esperava 8 chaves de indicacoes no catalogo, achei %', n;
  END IF;

  IF to_regclass('public.indicacoes') IS NULL THEN
    RAISE EXCEPTION 'A tabela indicacoes nao foi criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND indexname='uq_indicacoes_instituicao'
  ) THEN
    RAISE EXCEPTION 'A chave unica da instituicao nao foi criada — o ranking contaria duplicado.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fn_abas_escopo() WHERE aba = 'indicacoes') THEN
    RAISE EXCEPTION 'A aba indicacoes nao entrou no registro de escopo.';
  END IF;

  -- E as abas que ja existiam continuam la.
  SELECT COUNT(*) INTO n FROM public.fn_abas_escopo();
  IF n <> 13 THEN
    RAISE EXCEPTION 'fn_abas_escopo ficou com % abas; esperava 13.', n;
  END IF;
END $$;

COMMIT;
