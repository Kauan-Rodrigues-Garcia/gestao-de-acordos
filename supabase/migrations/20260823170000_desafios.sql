-- ============================================================================
-- 20260823170000_desafios.sql
--
-- Desafios — o motor de gincanas internas do Gestao de Acordos.
--
-- ## O que isto e, e o que NAO e
--
-- Nao e uma tela para a campanha "Cafe no IBIS". E uma tabela de CONFIGURACAO
-- de campanha, mais uma funcao de LEITURA que projeta os recebimentos que ja
-- existem sobre o periodo configurado. O Cafe no IBIS entra aqui como a
-- primeira LINHA da tabela, semeada no fim deste arquivo — trocar as datas, a
-- meta ou o criterio dele e um UPDATE, nao um deploy.
--
-- ## Nao existe `desafio_recebimentos`, e isso e proposital
--
-- Copiar cada recebimento para dentro do desafio criaria uma segunda fonte de
-- verdade: no dia em que uma linha fosse corrigida no Analitico, o ranking da
-- gincana continuaria mostrando o valor velho, e ninguem saberia qual dos dois
-- esta certo. O desafio le `analitico_recebimentos` ao vivo. Corrigiu la,
-- mudou aqui.
--
-- ## A funcao de leitura, e por que ela precisa existir
--
-- `fn_analitico_dashboard_mes_json` responde por MES e, para operador, devolve
-- so as linhas dele. As duas coisas impedem o desafio:
--
--   • uma campanha pode atravessar o virar do mes (27/08 a 05/09), e somar
--     "agosto + setembro inteiros" daria outro numero;
--   • um ranking de gincana em que o participante so enxerga a propria barra
--     nao e um ranking.
--
-- `fn_desafio_dados` resolve as duas: recorta pelo periodo EXATO do desafio e
-- devolve o quadro completo dos participantes. E uma camada de LEITURA sobre a
-- mesma tabela, com o mesmo criterio de linha valida e o mesmo carimbo de setor
-- que o dashboard usa — nao uma segunda contabilidade.
--
-- ## O ranking e publico dentro da empresa, de proposito
--
-- Aqui ha uma diferenca deliberada em relacao ao dashboard, e ela merece ficar
-- escrita: quem enxerga o desafio enxerga o ranking inteiro dele, operador
-- incluido. Uma gincana com premio e um placar afixado na parede; esconder de
-- quem disputa quem esta na frente esvazia a funcionalidade. O que a funcao
-- expoe e estreito — nome, foto, equipe e o valor recebido NO PERIODO da
-- campanha — e nada disso alcanca outra empresa: `fn_can_access_empresa` e a
-- primeira porta do corpo.
--
-- Quem nao quiser esse placar desliga a aba pelo painel de permissoes
-- (`analitico_sub_desafios`, migration 20260823171000). Nenhuma regra de
-- escopo existente foi tocada.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── Tabela ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desafios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,

  nome          TEXT NOT NULL,
  descricao     TEXT,
  premio        TEXT,

  -- O periodo e do DESAFIO, nao do mes. Duas datas soltas, sem nenhum vinculo
  -- com `mes_referencia`: uma campanha de 27/08 a 05/09 e tao valida quanto
  -- uma de 21/08 a 28/08, e as duas somam os dias que estao dentro delas.
  data_inicio   DATE NOT NULL,
  data_fim      DATE NOT NULL,

  -- Modelo da disputa. Governa o padrao do criterio e se ha meta; o valor
  -- efetivo de cada campo continua vindo de `regra`.
  tipo          TEXT NOT NULL DEFAULT 'bater_meta'
                  CHECK (tipo IN ('bater_meta', 'corrida', 'top_ranking',
                                  'batalha_equipes', 'meta_coletiva', 'sprint')),

  -- A configuracao da gincana: metrica, modo, criterio, metas e recorte de
  -- participantes. JSONB e nao vinte colunas porque cada modelo usa um
  -- subconjunto diferente, e uma coluna que so um tipo preenche e uma coluna
  -- que os outros cinco precisam explicar por que esta nula.
  regra         JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Tema, icone e as duas chaves de animacao. Governa a CAMPANHA, nao o
  -- desenho da aplicacao: nao ha aqui padding, fonte nem largura de card.
  visual        JSONB NOT NULL DEFAULT '{}'::JSONB,

  status        TEXT NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho', 'ativo', 'encerrado')),

  criado_por      UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_por_nome TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT desafio_nome_preenchido CHECK (length(btrim(nome)) >= 2),
  -- Periodo invertido nao e periodo: a soma daria zero e a tela mostraria uma
  -- campanha ativa com todo mundo zerado, que se le como defeito de dado.
  CONSTRAINT desafio_periodo_coerente CHECK (data_fim >= data_inicio)
);

COMMENT ON TABLE public.desafios IS
  'Configuracao de gincanas internas. O resultado NAO e gravado aqui: sai de '
  'fn_desafio_dados, que le analitico_recebimentos no periodo. Ver 20260823170000.';

-- O recorte de toda leitura da aba: empresa + status, mais recente primeiro.
CREATE INDEX IF NOT EXISTS idx_desafios_empresa_status
  ON public.desafios (empresa_id, status, data_inicio DESC);

-- ── atualizado_em ───────────────────────────────────────────────────────────
-- Mantido por trigger e nao pelo cliente: quem edita pela tela nao tem como
-- esquecer, e quem edita por SQL tambem nao.

CREATE OR REPLACE FUNCTION public.fn_desafios_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $touch$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$touch$;

DROP TRIGGER IF EXISTS trg_desafios_touch ON public.desafios;
CREATE TRIGGER trg_desafios_touch
  BEFORE UPDATE ON public.desafios
  FOR EACH ROW EXECUTE FUNCTION public.fn_desafios_touch();

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- O padrao da casa: porta de empresa E pergunta ao painel. Nenhuma lista de
-- cargo escrita aqui.

ALTER TABLE public.desafios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS desafios_select ON public.desafios;
CREATE POLICY desafios_select ON public.desafios
  FOR SELECT TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      -- Ativo e encerrado sao a campanha e o historico: quem tem a aba ve.
      status <> 'rascunho'
      -- Rascunho e trabalho em andamento de quem configura. Publica-lo cedo
      -- anunciaria premio e meta que ainda estao sendo decididos.
      OR public.fn_user_tem('desafios_configurar')
    )
  );

DROP POLICY IF EXISTS desafios_insert ON public.desafios;
CREATE POLICY desafios_insert ON public.desafios
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_tem('desafios_configurar')
    -- O autor e sempre quem esta logado: sem isto a trilha nao vale nada.
    AND criado_por = auth.uid()
  );

DROP POLICY IF EXISTS desafios_update ON public.desafios;
CREATE POLICY desafios_update ON public.desafios
  FOR UPDATE TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_tem('desafios_configurar')
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_tem('desafios_configurar')
  );

-- Encerrar e um UPDATE de status, e campanha encerrada vira historico. Apagar
-- e outra coisa: some com o resultado de uma disputa que ja aconteceu, e por
-- isso fica com quem administra o sistema.
DROP POLICY IF EXISTS desafios_delete ON public.desafios;
CREATE POLICY desafios_delete ON public.desafios
  FOR DELETE TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_tem('administrar_sistema')
  );

-- ── Realtime ────────────────────────────────────────────────────────────────
-- Ativar ou encerrar uma campanha aparece na tela de quem esta com a aba
-- aberta. `REPLICA IDENTITY FULL` pelo mesmo motivo de `acordos`: sem ela o
-- DELETE/UPDATE nao carrega `empresa_id` e o filtro do canal nao casa.
ALTER TABLE public.desafios REPLICA IDENTITY FULL;

DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.desafios;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$realtime$;

-- ── A leitura ───────────────────────────────────────────────────────────────
--
-- Devolve, num unico JSONB e numa unica ida ao banco:
--
--   participantes[] — quem disputa, com foto, equipe, setor e situacao, mais
--                     os conjuntos `setores` e `equipes` em que o recebimento
--                     da pessoa conta (membro + clone que conta). E a MESMA
--                     regra de `setoresDoOperador` em
--                     `src/services/analitico/analitico.service.ts`;
--   linhas[]        — recebimento agregado por (operador, setor carimbado) no
--                     periodo. O cliente aplica o escopo por cima com
--                     `linhaNoEscopo`, exatamente como o dashboard faz.
--
-- Por que NAO usa `fn_setores_do_operador`: aquela funcao responde "quem
-- supervisiona esta pessoa" e ignora `conta_recebimento` do clone. Aqui a
-- pergunta e sobre DINHEIRO, e o clone com a caixinha desligada nao soma —
-- usa-la faria o total do setor no desafio divergir do total no Analitico.
--
-- Orfas (linha sem operador) ficam de fora: o desafio e disputado por pessoas,
-- e uma linha sem dono nao entra em ranking nenhum. Ela continua no Analitico,
-- que e onde ela precisa ser resolvida.
CREATE OR REPLACE FUNCTION public.fn_desafio_dados(p_desafio_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $dados$
DECLARE
  v_desafio  public.desafios%ROWTYPE;
  v_partic   JSONB;
  v_linhas   JSONB;
BEGIN
  SELECT * INTO v_desafio FROM public.desafios WHERE id = p_desafio_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT public.fn_can_access_empresa(v_desafio.empresa_id) THEN
    RETURN NULL;
  END IF;

  -- Rascunho segue a mesma regra da policy de SELECT: so quem configura ve.
  IF v_desafio.status = 'rascunho'
     AND NOT public.fn_user_tem('desafios_configurar') THEN
    RETURN NULL;
  END IF;

  -- ── Participantes ────────────────────────────────────────────────────────
  WITH lider_unico AS (
    -- Quem foi vinculado pela tela de Equipes continua com `perfis.equipe_id`
    -- nulo. Sem este fallback o recebimento de quem lidera nao entra em card
    -- de equipe nenhum — e a soma das equipes deixa de fechar com o setor.
    -- So vale quando a pessoa lidera UMA equipe: com duas, escolher uma seria
    -- inventar.
    SELECT el.lider_id, MIN(el.equipe_id::TEXT)::UUID AS equipe_id
      FROM public.equipe_lideres el
     WHERE el.empresa_id = v_desafio.empresa_id
     GROUP BY el.lider_id
    HAVING COUNT(*) = 1
  ),
  clones AS (
    SELECT c.operador_id, c.equipe_id, e.setor_id
      FROM public.equipe_operadores_clones c
      JOIN public.equipes e ON e.id = c.equipe_id
     WHERE c.empresa_id = v_desafio.empresa_id
       AND c.conta_recebimento IS TRUE
  ),
  com_equipe AS (
    SELECT
      p.id,
      p.nome,
      p.usuario,
      p.foto_url,
      COALESCE(p.situacao, 'ativo')       AS situacao,
      COALESCE(p.equipe_id, lu.equipe_id) AS equipe_id,
      e.nome                              AS equipe_nome,
      -- Setor da equipe; quem nao tem equipe usa o setor do proprio perfil.
      COALESCE(e.setor_id, p.setor_id)    AS setor_id
    FROM public.perfis p
    LEFT JOIN lider_unico lu   ON lu.lider_id = p.id
    LEFT JOIN public.equipes e ON e.id = COALESCE(p.equipe_id, lu.equipe_id)
    WHERE p.empresa_id = v_desafio.empresa_id
      -- Desligado de mes anterior ja saiu de todas as listas.
      AND p.arquivado IS NOT TRUE
      -- Desativado a mao sem ser desligamento e o antigo "desativar usuario",
      -- que nunca representou alguem em operacao.
      AND NOT (p.ativo IS FALSE AND COALESCE(p.situacao, 'ativo') <> 'desligado')
      -- super_admin e conta de administracao, nao operador. Mesma exclusao de
      -- `fn_analitico_resumo_por_operador`.
      AND COALESCE(p.perfil, '') <> 'super_admin'
  ),
  -- Os vinculos de cada pessoa, numa lista so: o do cadastro mais os dos
  -- clones que contam. Montado como UNION e agregado depois, e nao como
  -- subconsulta correlacionada — uma subconsulta no FROM nao enxerga a coluna
  -- da consulta de fora sem LATERAL, e o resultado seria erro de compilacao da
  -- funcao, nao um numero errado.
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
    INTO v_partic
    FROM (
      SELECT
        ce.id,
        ce.nome,
        ce.usuario,
        ce.foto_url,
        ce.equipe_id,
        COALESCE(ce.equipe_nome, 'Sem equipe') AS equipe_nome,
        ce.setor_id,
        ce.situacao,
        COALESCE(ag.setores, ARRAY[]::UUID[]) AS setores,
        COALESCE(ag.equipes, ARRAY[]::UUID[]) AS equipes
      FROM com_equipe ce
      -- Clone de quem nao esta em `com_equipe` (um super_admin clonado, por
      -- exemplo) entra em `vinculos` e some aqui: o JOIN e pela pessoa que
      -- disputa, nao pelo vinculo.
      LEFT JOIN agregados ag ON ag.pessoa_id = ce.id
    ) t;

  -- ── Linhas do periodo ────────────────────────────────────────────────────
  SELECT COALESCE(jsonb_agg(t), '[]'::JSONB)
    INTO v_linhas
    FROM (
      SELECT
        ar.operador_id,
        -- Mesmo carimbo do dashboard: o setor da importacao, com fallback no
        -- setor de quem importou.
        COALESCE(ar.setor_id, imp.setor_id) AS setor_id,
        SUM(ar.valor_recebido)::NUMERIC     AS total,
        SUM(ar.total_ho)::NUMERIC           AS total_ho,
        COUNT(*)::BIGINT                    AS qtd
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis imp ON imp.id = ar.importado_por_id
      WHERE ar.empresa_id     = v_desafio.empresa_id
        AND ar.operador_id   IS NOT NULL
        AND ar.data_pagamento BETWEEN v_desafio.data_inicio AND v_desafio.data_fim
      GROUP BY ar.operador_id, COALESCE(ar.setor_id, imp.setor_id)
    ) t;

  RETURN jsonb_build_object(
    'participantes', v_partic,
    'linhas',        v_linhas
  );
END;
$dados$;

COMMENT ON FUNCTION public.fn_desafio_dados(UUID) IS
  'Quadro de um desafio: participantes (com setores/equipes em que o '
  'recebimento conta) e recebimento agregado por operador+setor no periodo. '
  'Le analitico_recebimentos ao vivo; nao guarda copia. Ver 20260823170000.';

REVOKE ALL     ON FUNCTION public.fn_desafio_dados(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_desafio_dados(UUID) TO authenticated;

-- ── A primeira campanha ─────────────────────────────────────────────────────
--
-- Cafe no IBIS entra como DADO, nao como codigo. Trocar as datas, a meta ou o
-- criterio e um UPDATE nesta linha (ou um clique na tela de configuracao), e
-- criar a proxima gincana e um INSERT — nenhum dos dois exige deploy.
--
-- So para a BookPlay: a campanha e de la. A PaguePlay tambem tem a aba
-- Analitico, e semear um desafio ativo numa operacao que nao pediu seria
-- anunciar um premio que nao existe.
INSERT INTO public.desafios (
  empresa_id, nome, descricao, premio,
  data_inicio, data_fim, tipo, regra, visual, status
)
SELECT
  e.id,
  'Café no IBIS',
  'Quem chegar mais perto da meta leva o café no IBIS.',
  'Café no IBIS',
  DATE '2026-08-21',
  DATE '2026-08-28',
  'bater_meta',
  jsonb_build_object(
    'versao',          1,
    'metrica',         'valor_recebido',
    'modo',            jsonb_build_array('individual', 'equipe'),
    'criterioRanking', 'menor_falta',
    'metaIndividual',  20000,
    'metaEquipe',      80000,
    'metaColetiva',    NULL,
    'participantes',   jsonb_build_object(
                         'setores',    jsonb_build_array(),
                         'equipes',    jsonb_build_array(),
                         'operadores', jsonb_build_array()
                       )
  ),
  jsonb_build_object(
    'tema',                'cafe',
    'icone',               'coffee',
    'mostrarFotos',        TRUE,
    'animarUltrapassagem', TRUE,
    'comemorarMeta',       TRUE
  ),
  'ativo'
FROM public.empresas e
WHERE e.slug = 'bookplay'
  AND NOT EXISTS (
    SELECT 1 FROM public.desafios d
     WHERE d.empresa_id  = e.id
       AND d.nome        = 'Café no IBIS'
       AND d.data_inicio = DATE '2026-08-21'
  );

COMMIT;
