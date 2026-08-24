-- ============================================================================
-- 20260823190000_desafios_setores_e_cadastro.sql
--
-- Duas coisas que faltavam para a aba Desafios sair do papel:
--
--   1. **A lista de pessoas para CADASTRAR os desafios.** Quem configura
--      precisa ver os operadores antes de existir campanha nenhuma — e a
--      politica de `perfis` so entrega o cadastro dos colegas para quem tem a
--      aba Usuarios (`fn_user_escopo('usuarios') >= 2`). Um lider com
--      `desafios_configurar` e sem `ver_usuarios` abriria a tela vazia.
--
--   2. **O interruptor por setor.** A chave `analitico_sub_desafios` liga a aba
--      por CARGO. Faltava dizer que o setor X participa e o setor Y nao, sem
--      mexer em cargo nenhum — um operador do Play 1 e um do Digital tem o
--      mesmo cargo.
--
-- ## A refatoracao de `fn_desafio_dados`
--
-- A montagem dos participantes sai de dentro dela e vira
-- `fn_desafio_pessoas_interna`, chamada pelas duas funcoes publicas. Uma copia
-- da CTE em cada uma seria a garantia de que um dia elas discordariam sobre
-- quem e da equipe de quem.
--
-- A interna NAO checa permissao — quem checa e a wrapper, cada uma com a sua
-- regra. Por isso ela e revogada de `authenticated`: chamavel so de dentro do
-- banco.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── A montagem dos participantes, num lugar so ──────────────────────────────
--
-- Mesma regra de `setoresDoOperador` (src/services/analitico/analitico.service.ts):
-- setor e equipe do cadastro, mais os das equipes em que a pessoa e clone COM
-- `conta_recebimento` ligado. Clone com a caixinha desligada nao soma dinheiro,
-- entao nao entra.
CREATE OR REPLACE FUNCTION public.fn_desafio_pessoas_interna(p_empresa_id UUID)
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
    -- Quem foi vinculado pela tela de Equipes continua com `perfis.equipe_id`
    -- nulo. Sem este fallback o recebimento de quem lidera nao entra em card
    -- de equipe nenhum. So vale para quem lidera UMA equipe: com duas,
    -- escolher uma seria inventar.
    SELECT el.lider_id, MIN(el.equipe_id::TEXT)::UUID AS equipe_id
      FROM public.equipe_lideres el
     WHERE el.empresa_id = p_empresa_id
     GROUP BY el.lider_id
    HAVING COUNT(*) = 1
  ),
  clones AS (
    SELECT c.operador_id, c.equipe_id, e.setor_id
      FROM public.equipe_operadores_clones c
      JOIN public.equipes e ON e.id = c.equipe_id
     WHERE c.empresa_id = p_empresa_id
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
      COALESCE(e.setor_id, p.setor_id)    AS setor_id
    FROM public.perfis p
    LEFT JOIN lider_unico lu   ON lu.lider_id = p.id
    LEFT JOIN public.equipes e ON e.id = COALESCE(p.equipe_id, lu.equipe_id)
    WHERE p.empresa_id = p_empresa_id
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

COMMENT ON FUNCTION public.fn_desafio_pessoas_interna(UUID) IS
  'Participantes possiveis de um desafio, com setor/equipe resolvidos pela '
  'regra de setoresDoOperador. NAO checa permissao: use as wrappers. Ver '
  '20260823190000.';

-- Chamavel so de dentro do banco: quem checa permissao sao as wrappers.
REVOKE ALL ON FUNCTION public.fn_desafio_pessoas_interna(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_desafio_pessoas_interna(UUID) FROM authenticated;

-- ── A lista para a tela de cadastro ─────────────────────────────────────────
--
-- So para quem configura. Nao e "ver o placar": e ver o quadro de pessoal para
-- distribuir valor, e isso e trabalho de quem monta a campanha.
CREATE OR REPLACE FUNCTION public.fn_desafio_pessoas(p_empresa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $lista$
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN '[]'::JSONB;
  END IF;
  IF NOT public.fn_user_tem('desafios_configurar') THEN
    RETURN '[]'::JSONB;
  END IF;
  RETURN public.fn_desafio_pessoas_interna(p_empresa_id);
END;
$lista$;

COMMENT ON FUNCTION public.fn_desafio_pessoas(UUID) IS
  'Quadro de pessoal para montar a campanha. Exige desafios_configurar. '
  'Ver 20260823190000.';

REVOKE ALL     ON FUNCTION public.fn_desafio_pessoas(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_desafio_pessoas(UUID) TO authenticated;

-- ── `fn_desafio_dados` passa a usar a interna ───────────────────────────────
--
-- O corpo e o mesmo de 20260823170000, menos a CTE de participantes, que agora
-- mora num lugar so. Nenhuma regra mudou: mesmo criterio de linha valida, mesmo
-- carimbo de setor, mesmo recorte de periodo.
CREATE OR REPLACE FUNCTION public.fn_desafio_dados(p_desafio_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $dados$
DECLARE
  v_desafio  public.desafios%ROWTYPE;
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
    'participantes', public.fn_desafio_pessoas_interna(v_desafio.empresa_id),
    'linhas',        v_linhas
  );
END;
$dados$;

-- ── O interruptor por setor ─────────────────────────────────────────────────
--
-- ## Por que uma tabela, e nao uma coluna em `setores`
--
-- Porque a ausencia significa ATIVO. Uma coluna obrigaria a preencher todo
-- setor que ja existe e todo setor que vier depois; a tabela guarda so a
-- excecao, e um setor novo nasce participando sem ninguem precisar lembrar.
--
-- ## Isto NAO substitui a chave de permissao
--
-- `analitico_sub_desafios` decide por CARGO; esta tabela decide por SETOR. As
-- duas se somam, e sao perguntas diferentes: um operador do Play 1 e um do
-- Digital tem o mesmo cargo, e a campanha pode ser de um so.

CREATE TABLE IF NOT EXISTS public.desafios_setores (
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id       UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, setor_id)
);

COMMENT ON TABLE public.desafios_setores IS
  'Setores em que a aba Desafios NAO participa. Linha ausente = participa. '
  'Complementa a chave de cargo analitico_sub_desafios. Ver 20260823190000.';

ALTER TABLE public.desafios_setores ENABLE ROW LEVEL SECURITY;

-- Todo mundo da empresa LE: a tela precisa saber se deve mostrar a aba, e a
-- resposta nao e segredo.
DROP POLICY IF EXISTS desafios_setores_select ON public.desafios_setores;
CREATE POLICY desafios_setores_select ON public.desafios_setores
  FOR SELECT TO authenticated
  USING (public.fn_can_access_empresa(empresa_id));

-- Escrever e da administracao. `fn_user_is_super_admin()` esta explicito para
-- que o super_admin continue podendo mesmo se alguem desligar a chave; e
-- `administrar_sistema` mantem a decisao governavel pelo painel, que e a regra
-- permanente do projeto.
DROP POLICY IF EXISTS desafios_setores_escreve ON public.desafios_setores;
CREATE POLICY desafios_setores_escreve ON public.desafios_setores
  FOR ALL TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND (public.fn_user_is_super_admin() OR public.fn_user_tem('administrar_sistema'))
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (public.fn_user_is_super_admin() OR public.fn_user_tem('administrar_sistema'))
  );

-- Ligar ou desligar um setor aparece na tela de quem esta com a aba aberta.
ALTER TABLE public.desafios_setores REPLICA IDENTITY FULL;

DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.desafios_setores;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$realtime$;

-- ── O vocabulario: quem tem DESAFIO e o operador ────────────────────────────
--
-- A tela passou a chamar o numero de cada operador de "desafio", e nao de
-- "meta" — e o pedido: a campanha distribui desafios, e "meta" na operacao ja
-- significa outra coisa (a meta mensal, do Painel Metas). A descricao da
-- campanha acompanha, porque ela e a frase que o Hero anuncia.
--
-- Roda solto e idempotente: pega a campanha esteja ela com o texto de origem
-- ("mais perto da meta") ou com o da correcao anterior ("alcançar a meta").
UPDATE public.desafios d
   SET descricao = 'Quem alcançar o valor do seu desafio até 28/08 leva o café no IBIS.'
  FROM public.empresas e
 WHERE e.id          = d.empresa_id
   AND e.slug        = 'bookplay'
   AND d.nome        = 'Café no IBIS'
   AND d.data_inicio = DATE '2026-08-21'
   AND d.descricao IS DISTINCT FROM
       'Quem alcançar o valor do seu desafio até 28/08 leva o café no IBIS.';

COMMIT;
