-- ============================================================================
-- Desafios: a arte de divulgação, e o convidado de teste
-- ============================================================================
--
-- ## Duas imagens, e não uma
--
-- `midia_url` virou uma coisa só fazendo dois trabalhos: ela é o selo pequeno
-- do menu lateral E era a única arte que a campanha tinha. São formatos
-- diferentes — o menu quer algo que se leia a 40 px, a divulgação é um cartaz.
-- Espremer o cartaz no botão do menu dá o zoom que ninguém pediu.
--
-- Então:
--
--   `midia_url` — o DESTAQUE. O selo do menu lateral e o fundo do card no
--                 catálogo. Continua sendo o que já era.
--   `arte_url`  — a ARTE DE DIVULGAÇÃO. O cartaz da campanha, inteiro, na
--                 tela do desafio e no topo da gaveta. Opcional.
--
-- Nenhuma campanha existente muda: `arte_url` nasce nula, e a tela cai no
-- destaque quando ela não existe.
--
-- ## O convidado de teste
--
-- `fn_desafio_pessoas_multi` exclui `perfil = 'super_admin'` de propósito —
-- super_admin não é operação e encheria todo ranking de gente que não disputa.
--
-- Só que isso também impede quem administra de ENTRAR numa campanha para ver
-- como ela se comporta antes de publicar. A saída é nominal: `p_convidados`
-- traz os super_admins que aquela campanha convidou, e só eles furam a
-- exclusão. Ninguém entra por cargo; entra por ter sido convidado, um a um, na
-- tela de configuração.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. A arte de divulgação ─────────────────────────────────────────────────

ALTER TABLE public.desafios
  ADD COLUMN IF NOT EXISTS arte_url     TEXT,
  ADD COLUMN IF NOT EXISTS arte_caminho TEXT;

COMMENT ON COLUMN public.desafios.arte_url IS
  'Arte de divulgacao da campanha — o cartaz, mostrado inteiro na tela do '
  'desafio. Opcional. NAO e o selo do menu lateral, que e midia_url.';
COMMENT ON COLUMN public.desafios.midia_url IS
  'Imagem de DESTAQUE: o selo do menu lateral e o fundo do card no catalogo. '
  'A arte de divulgacao e arte_url. Ver 20260903600000.';

-- ── 2. O quadro de pessoal aceita convidados ────────────────────────────────
--
-- A assinatura ganha um parâmetro, e por isso as funções são derrubadas antes:
-- `CREATE OR REPLACE` com um argumento a mais criaria uma SEGUNDA função, e a
-- chamada com um argumento só passaria a ser ambígua.

DROP FUNCTION IF EXISTS public.fn_desafio_pessoas_multi(UUID[]);

CREATE FUNCTION public.fn_desafio_pessoas_multi(
  p_empresas   UUID[],
  p_convidados UUID[] DEFAULT '{}'::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $pessoas$
DECLARE
  v_out        JSONB;
  v_convidados UUID[] := COALESCE(p_convidados, '{}'::UUID[]);
BEGIN
  WITH lider_unico AS (
    SELECT el.lider_id, MIN(el.equipe_id::TEXT)::UUID AS equipe_id
      FROM public.equipe_lideres el
     WHERE el.empresa_id = ANY (p_empresas)
     GROUP BY el.lider_id
    HAVING COUNT(*) = 1
  ),
  clones AS (
    SELECT c.operador_id, c.equipe_id, e.setor_id
      FROM public.equipe_operadores_clones c
      JOIN public.equipes e ON e.id = c.equipe_id
     WHERE c.empresa_id = ANY (p_empresas)
       AND c.conta_recebimento IS TRUE
  ),
  com_equipe AS (
    SELECT
      p.id,
      p.nome,
      p.usuario,
      p.foto_url,
      p.empresa_id,
      COALESCE(p.perfil, 'operador')      AS perfil,
      COALESCE(p.situacao, 'ativo')       AS situacao,
      COALESCE(p.equipe_id, lu.equipe_id) AS equipe_id,
      e.nome                              AS equipe_nome,
      COALESCE(e.setor_id, p.setor_id)    AS setor_id
    FROM public.perfis p
    LEFT JOIN lider_unico lu   ON lu.lider_id = p.id
    LEFT JOIN public.equipes e ON e.id = COALESCE(p.equipe_id, lu.equipe_id)
    WHERE p.arquivado IS NOT TRUE
      AND NOT (p.ativo IS FALSE AND COALESCE(p.situacao, 'ativo') <> 'desligado')
      AND (
        -- O quadro normal: a operação das empresas da campanha, sem
        -- super_admin — que não é operação e encheria todo ranking.
        (
          p.empresa_id = ANY (p_empresas)
          AND COALESCE(p.perfil, '') <> 'super_admin'
        )
        -- E o convidado nominal, que fura a exclusão acima por ter sido
        -- escolhido um a um na configuração. Sem recorte de empresa: quem
        -- convida um super_admin para testar sabe de que empresa ele é.
        OR p.id = ANY (v_convidados)
      )
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
        ce.empresa_id,
        ce.perfil,
        ce.equipe_id,
        COALESCE(ce.equipe_nome, 'Sem equipe') AS equipe_nome,
        ce.setor_id,
        ce.situacao,
        COALESCE(ag.setores, ARRAY[]::UUID[]) AS setores,
        COALESCE(ag.equipes, ARRAY[]::UUID[]) AS equipes,
        -- A tela precisa distinguir quem está ali para testar de quem disputa
        -- de verdade — senão o convidado vira mais um nome no ranking.
        (ce.id = ANY (v_convidados))          AS convidado
      FROM com_equipe ce
      LEFT JOIN agregados ag ON ag.pessoa_id = ce.id
    ) t;

  RETURN v_out;
END;
$pessoas$;

REVOKE ALL ON FUNCTION public.fn_desafio_pessoas_multi(UUID[], UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_desafio_pessoas_multi(UUID[], UUID[]) FROM authenticated;

COMMENT ON FUNCTION public.fn_desafio_pessoas_multi(UUID[], UUID[]) IS
  'Participantes possiveis de um desafio em UMA OU MAIS empresas. '
  'p_convidados: super_admins que aquela campanha convidou para teste, os '
  'unicos que furam a exclusao de super_admin. NAO checa permissao.';

-- As duas wrappers voltam apontando para a assinatura nova.

CREATE OR REPLACE FUNCTION public.fn_desafio_pessoas_interna(p_empresa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $pessoas$
BEGIN
  RETURN public.fn_desafio_pessoas_multi(ARRAY[p_empresa_id], '{}'::UUID[]);
END;
$pessoas$;

CREATE OR REPLACE FUNCTION public.fn_desafio_pessoas_empresas(p_empresas UUID[])
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $lista$
DECLARE
  v_liberadas UUID[];
BEGIN
  IF NOT public.fn_user_tem('desafios_configurar')
     AND NOT public.fn_user_tem('desafios_configurar_setor') THEN
    RETURN '[]'::JSONB;
  END IF;

  SELECT COALESCE(array_agg(e), ARRAY[]::UUID[])
    INTO v_liberadas
    FROM unnest(COALESCE(p_empresas, '{}'::UUID[])) AS e
   WHERE public.fn_can_access_empresa(e);

  IF cardinality(v_liberadas) = 0 THEN RETURN '[]'::JSONB; END IF;
  RETURN public.fn_desafio_pessoas_multi(v_liberadas, '{}'::UUID[]);
END;
$lista$;

REVOKE ALL ON FUNCTION public.fn_desafio_pessoas_empresas(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_desafio_pessoas_empresas(UUID[]) TO authenticated;

-- ── 3. A lista de super_admins, para convidar ───────────────────────────────
--
-- Só super_admin enxerga esta lista, e a razão é a mesma de a caixa existir:
-- é uma ferramenta de teste de quem administra o sistema. Um gerente com
-- `desafios_configurar` não tem o que fazer com ela.

CREATE OR REPLACE FUNCTION public.fn_desafio_super_admins()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT CASE
    WHEN NOT public.fn_user_is_super_admin() THEN '[]'::JSONB
    ELSE COALESCE(
      (SELECT jsonb_agg(t ORDER BY t.nome)
         FROM (
           SELECT p.id, p.nome, p.usuario, p.foto_url, p.empresa_id
             FROM public.perfis p
            WHERE p.perfil = 'super_admin'
              AND p.arquivado IS NOT TRUE
              AND p.ativo IS NOT FALSE
         ) t),
      '[]'::JSONB)
  END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_desafio_super_admins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_desafio_super_admins() TO authenticated;

COMMENT ON FUNCTION public.fn_desafio_super_admins() IS
  'Os super_admins ativos, para a caixa de convidados de teste da configuracao '
  'de desafio. Devolve [] para quem nao e super_admin.';

-- ── 4. O quadro do desafio passa os convidados adiante ──────────────────────

CREATE OR REPLACE FUNCTION public.fn_desafio_dados(p_desafio_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $dados$
DECLARE
  v_desafio    public.desafios%ROWTYPE;
  v_empresas   UUID[];
  v_convidados UUID[] := '{}'::UUID[];
  v_linhas     JSONB;
BEGIN
  SELECT * INTO v_desafio FROM public.desafios WHERE id = p_desafio_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_empresas := public.fn_desafio_empresas(v_desafio.empresa_id, v_desafio.empresas);

  IF NOT public.fn_desafio_alcanca_empresa(v_empresas) THEN
    RETURN NULL;
  END IF;

  IF v_desafio.status = 'rascunho'
     AND NOT public.fn_user_tem('desafios_configurar')
     AND NOT public.fn_user_tem('desafios_configurar_setor') THEN
    RETURN NULL;
  END IF;

  IF NOT public.fn_desafio_no_meu_alcance(
           v_desafio.setor_id, v_desafio.regra, v_desafio.visibilidade) THEN
    RETURN NULL;
  END IF;

  -- JSONB malformado não pode derrubar o quadro: sem convidados a campanha é
  -- exatamente a de antes desta migration.
  BEGIN
    SELECT COALESCE(
             ARRAY(SELECT jsonb_array_elements_text(
                            v_desafio.regra->'participantes'->'convidados')::UUID),
             '{}'::UUID[])
      INTO v_convidados;
  EXCEPTION WHEN OTHERS THEN
    v_convidados := '{}'::UUID[];
  END;

  SELECT COALESCE(jsonb_agg(t), '[]'::JSONB)
    INTO v_linhas
    FROM (
      SELECT
        ar.operador_id,
        COALESCE(ar.setor_id, imp.setor_id) AS setor_id,
        SUM(ar.valor_recebido)::NUMERIC     AS total,
        SUM(ar.total_ho)::NUMERIC           AS total_ho,
        COUNT(*)::BIGINT                    AS qtd
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis imp ON imp.id = ar.importado_por_id
      WHERE ar.empresa_id     = ANY (v_empresas)
        AND ar.operador_id   IS NOT NULL
        AND ar.data_pagamento BETWEEN v_desafio.data_inicio AND v_desafio.data_fim
      GROUP BY ar.operador_id, COALESCE(ar.setor_id, imp.setor_id)
    ) t;

  RETURN jsonb_build_object(
    'participantes', public.fn_desafio_pessoas_multi(v_empresas, v_convidados),
    'linhas',        v_linhas,
    'empresas',      to_jsonb(v_empresas)
  );
END;
$dados$;

COMMENT ON FUNCTION public.fn_desafio_dados(UUID) IS
  'Participantes e recebimento agregado de UMA campanha, somando todas as '
  'empresas que ela alcanca, mais os super_admins convidados para teste.';

-- ── 5. O menu lateral também precisa da arte ────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_desafio_em_cartaz()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(jsonb_agg(t ORDER BY t.data_fim ASC), '[]'::JSONB)
    FROM (
      SELECT d.id, d.nome, d.descricao, d.premio, d.data_inicio, d.data_fim,
             d.midia_url, d.arte_url, d.visual, d.tipo, d.empresa_id, d.empresas,
             d.regra, d.status, d.setor_id, d.visibilidade
        FROM public.desafios d
       WHERE d.status = 'ativo'
         AND CURRENT_DATE BETWEEN d.data_inicio AND d.data_fim
       LIMIT 12
    ) t;
$fn$;

REVOKE ALL ON FUNCTION public.fn_desafio_em_cartaz() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_desafio_em_cartaz() TO authenticated;

COMMIT;
