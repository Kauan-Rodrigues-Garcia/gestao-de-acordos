-- ═══════════════════════════════════════════════════════════════════════════
-- Líder de SETOR ALTERNATIVO disputa pelo setor, não pela média das equipes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que estava errado na tela
--
-- Setor alternativo (`setores.alternativo`) é o setor que não tem relatório
-- próprio: o Digital existe porque operadores do Play 4 e do Play 5 são
-- clonados para dentro dele. Quem lidera um setor desses lidera, na prática,
-- UM número — o do setor —, e não um punhado de equipes independentes.
--
-- No ranking de líderes dos Desafios ele aparecia com a MÉDIA das porcentagens
-- das equipes que lidera (`agregacaoLider = 'media_das_equipes'`). Duas coisas
-- davam errado com isso:
--
--   • a média de três equipes não é a porcentagem do setor — o setor tem meta
--     própria em `metas` (tipo `setor`), e é contra ela que a diretoria cobra;
--   • o mesmo líder aparecia medido por uma régua diferente da dos colegas de
--     setor normal, sem nada na tela dizendo isso.
--
-- ## O que esta migration acrescenta
--
-- `fn_desafio_contexto_equipe` passa a devolver, além do que já devolvia:
--
--   metas_setor          meta mensal por setor (tipo `setor`, > 0)
--   setores_alternativos os ids marcados como alternativos
--   setor_empresa        de qual empresa é cada setor (régua de dias úteis)
--   recebido_mes_setor   o recebido do MÊS por setor
--
-- O cálculo de quem disputa com o quê continua no cliente
-- (`calcularDesafio.ts`): aqui só se entrega o quadro.
--
-- ## A regra do `recebido_mes_setor`
--
-- É a MESMA de `linhaNoEscopo` (`services/analitico/escopoAnalitico.ts`), que o
-- card «Total recebido» da aba Analítico e o Painel Líder já usam:
--
--   • setor NORMAL      → linhas CARIMBADAS com o setor na importação. Clone
--                         emprestado para outro setor não muda este total, e as
--                         órfãs (sem operador) do setor entram.
--   • setor ALTERNATIVO → o setor não tem relatório próprio: total = soma dos
--                         usuários dele (cadastro + clones com
--                         `conta_recebimento`) + as órfãs carimbadas nele.
--
-- Esta é, portanto, a segunda escrita dessa regra — a primeira é o TypeScript
-- citado acima. A duplicação é deliberada e tem a mesma razão da 20260909160000:
-- o desafio atravessa empresas e não alcança essas tabelas pela RLS de quem
-- olha, que foi por que esta função SECURITY DEFINER nasceu. O que dá para
-- fazer é o que está feito — escrever a regra uma vez, aqui, dizendo de onde
-- ela veio, para que quem mexer numa lembre da outra.
--
-- Os portões continuam os mesmos três de `fn_desafio_dados`.

CREATE OR REPLACE FUNCTION public.fn_desafio_contexto_equipe(p_desafio_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_desafio      public.desafios%ROWTYPE;
  v_empresas     UUID[];
  v_ano          INT;
  v_mes          INT;
  v_ini          DATE;
  v_fim          DATE;
  v_mes_txt      TEXT;
  v_metas        JSONB;
  v_equipe_emp   JSONB;
  v_config       JSONB;
  v_receb_equipe JSONB;
  v_metas_setor  JSONB;
  v_setor_emp    JSONB;
  v_setores_alt  JSONB;
  v_receb_setor  JSONB;
BEGIN
  SELECT * INTO v_desafio FROM public.desafios WHERE id = p_desafio_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_empresas := public.fn_desafio_empresas(v_desafio.empresa_id, v_desafio.empresas);

  -- ── Os mesmos três portões de fn_desafio_dados ────────────────────────────
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

  v_ano     := EXTRACT(YEAR  FROM v_desafio.data_fim)::INT;
  v_mes     := EXTRACT(MONTH FROM v_desafio.data_fim)::INT;
  v_ini     := make_date(v_ano, v_mes, 1);
  v_fim     := (v_ini + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_mes_txt := to_char(v_ini, 'YYYY-MM');

  -- Meta mensal por equipe. `meta_valor > 0` porque equipe com meta zero é
  -- equipe sem meta — é assim que o cliente já lia.
  SELECT COALESCE(jsonb_object_agg(m.referencia_id, m.meta_valor), '{}'::JSONB)
    INTO v_metas
    FROM public.metas m
   WHERE m.empresa_id = ANY (v_empresas)
     AND m.tipo       = 'equipe'
     AND m.mes        = v_mes
     AND m.ano        = v_ano
     AND m.meta_valor > 0;

  -- Meta mensal por SETOR, pela mesma régua do `> 0`.
  SELECT COALESCE(jsonb_object_agg(m.referencia_id, m.meta_valor), '{}'::JSONB)
    INTO v_metas_setor
    FROM public.metas m
   WHERE m.empresa_id = ANY (v_empresas)
     AND m.tipo       = 'setor'
     AND m.mes        = v_mes
     AND m.ano        = v_ano
     AND m.meta_valor > 0;

  -- De qual empresa é cada equipe — é o que liga a equipe à régua de dias
  -- úteis dela. Só as equipes que têm meta interessam.
  SELECT COALESCE(jsonb_object_agg(e.id, e.empresa_id), '{}'::JSONB)
    INTO v_equipe_emp
    FROM public.equipes e
   WHERE e.empresa_id = ANY (v_empresas)
     AND v_metas ? e.id::TEXT;

  -- O mesmo para os setores, e a lista dos alternativos. Aqui não se filtra por
  -- «tem meta»: o cliente precisa saber que o setor é alternativo mesmo quando
  -- ninguém configurou meta para ele — é o que o faz dizer «sem meta» em vez de
  -- cair na média das equipes pelas costas.
  SELECT COALESCE(jsonb_object_agg(st.id, st.empresa_id), '{}'::JSONB),
         COALESCE(jsonb_agg(st.id) FILTER (WHERE st.alternativo IS TRUE), '[]'::JSONB)
    INTO v_setor_emp, v_setores_alt
    FROM public.setores st
   WHERE st.empresa_id = ANY (v_empresas);

  -- Feriados e `contar_dia_atual` de cada empresa do desafio. Empresa sem
  -- linha de config não aparece; o cliente trata a ausência como «sem feriado
  -- e sem contar o dia atual», que é o padrão de `getMetasConfig`.
  SELECT COALESCE(jsonb_object_agg(c.empresa_id, jsonb_build_object(
           'feriados',         COALESCE(c.feriados, '[]'::JSONB),
           'contar_dia_atual', COALESCE(c.contar_dia_atual, FALSE)
         )), '{}'::JSONB)
    INTO v_config
    FROM public.metas_config_mes c
   WHERE c.empresa_id = ANY (v_empresas)
     AND c.mes = v_mes
     AND c.ano = v_ano;

  -- ── O recebido do mês POR EQUIPE ──────────────────────────────────────────
  -- Ver o cabeçalho da 20260909160000: as três regras de Desempenho Equipes.
  WITH
  -- Vínculo de liderança, e só quando é ÚNICO. Quem lidera três equipes não
  -- tem «a sua equipe»: creditá-lo nas três contaria o mesmo dinheiro três
  -- vezes. Mesma decisão de `equipeUnicaPorLider`.
  lider_unico AS (
    SELECT el.lider_id, MIN(el.equipe_id::TEXT)::UUID AS equipe_id
      FROM public.equipe_lideres el
     WHERE el.empresa_id = ANY (v_empresas)
     GROUP BY el.lider_id
    HAVING COUNT(DISTINCT el.equipe_id) = 1
  ),
  -- Transferido no mês: credita a equipe de ORIGEM, e isso vence tudo.
  fantasma AS (
    SELECT DISTINCT ON (t.perfil_id) t.perfil_id, t.origem_equipe_id
      FROM public.perfis_transferencias t
     WHERE t.empresa_id     = ANY (v_empresas)
       AND t.mes            = v_mes_txt
       AND t.fantasma_ativo IS TRUE
       AND t.desfeita_em    IS NULL
     ORDER BY t.perfil_id, t.id
  ),
  -- O caixa do mês por operador. `super_admin` fora, como em
  -- `fn_analitico_resumo_por_operador`.
  soma AS (
    SELECT ar.operador_id,
           SUM(ar.valor_recebido)::NUMERIC AS total,
           COUNT(*)::BIGINT                AS qtd
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis p ON p.id = ar.operador_id
     WHERE ar.empresa_id      = ANY (v_empresas)
       AND ar.operador_id    IS NOT NULL
       AND COALESCE(p.perfil, '') <> 'super_admin'
       AND ar.data_pagamento >= v_ini
       AND ar.data_pagamento <= v_fim
     GROUP BY ar.operador_id
  ),
  -- A equipe principal de cada um. Arquivado e desativado-à-mão ficam de fora,
  -- como em `buscarComposicaoAnalitica`; o fantasma entra mesmo sem perfil
  -- visível, porque quem mudou de empresa não aparece mais na consulta de lá.
  principal AS (
    SELECT s.operador_id,
           COALESCE(
             f.origem_equipe_id,
             CASE WHEN p.perfil = 'lider'
                  THEN COALESCE(lu.equipe_id, p.equipe_id)
                  ELSE COALESCE(p.equipe_id, lu.equipe_id)
             END
           ) AS equipe_id
      FROM soma s
      LEFT JOIN public.perfis p  ON p.id       = s.operador_id
      LEFT JOIN lider_unico  lu  ON lu.lider_id = s.operador_id
      LEFT JOIN fantasma     f   ON f.perfil_id = s.operador_id
     WHERE f.perfil_id IS NOT NULL
        OR (p.id IS NOT NULL
            AND p.arquivado IS NOT TRUE
            AND NOT (p.ativo IS FALSE
                     AND COALESCE(p.situacao, 'ativo') <> 'desligado'))
  ),
  -- Principal mais as equipes em que a pessoa é clone que conta. `UNION`
  -- deduplica o par, então clone dentro da própria equipe não conta duas vezes.
  vinculos AS (
    SELECT pr.operador_id, pr.equipe_id
      FROM principal pr
     WHERE pr.equipe_id IS NOT NULL
    UNION
    SELECT cl.operador_id, cl.equipe_id
      FROM public.equipe_operadores_clones cl
      JOIN soma s2 ON s2.operador_id = cl.operador_id
     WHERE cl.empresa_id        = ANY (v_empresas)
       AND cl.conta_recebimento IS TRUE
  )
  SELECT COALESCE(jsonb_object_agg(x.equipe_id, jsonb_build_object(
           'total', x.total, 'qtd', x.qtd
         )), '{}'::JSONB)
    INTO v_receb_equipe
    FROM (
      SELECT v.equipe_id,
             SUM(s.total)::NUMERIC AS total,
             SUM(s.qtd)::BIGINT    AS qtd
        FROM vinculos v
        JOIN soma s ON s.operador_id = v.operador_id
       GROUP BY v.equipe_id
    ) x;

  -- ── O recebido do mês POR SETOR ───────────────────────────────────────────
  -- A régua de `linhaNoEscopo`: carimbo no setor normal, soma dos usuários no
  -- alternativo. Ver o cabeçalho.
  WITH
  setores_emp AS (
    SELECT st.id, COALESCE(st.alternativo, FALSE) AS alternativo
      FROM public.setores st
     WHERE st.empresa_id = ANY (v_empresas)
  ),
  linhas AS (
    SELECT ar.operador_id, ar.setor_id, ar.valor_recebido
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis p ON p.id = ar.operador_id
     WHERE ar.empresa_id      = ANY (v_empresas)
       AND COALESCE(p.perfil, '') <> 'super_admin'
       AND ar.data_pagamento >= v_ini
       AND ar.data_pagamento <= v_fim
  ),
  -- Quem CONTA em cada setor: o cadastro mais os clones com
  -- `conta_recebimento`. É a mesma pergunta de `setoresDoOperador`.
  conta_no_setor AS (
    SELECT p.setor_id, p.id AS operador_id
      FROM public.perfis p
     WHERE p.empresa_id  = ANY (v_empresas)
       AND p.setor_id   IS NOT NULL
    UNION
    SELECT e.setor_id, cl.operador_id
      FROM public.equipe_operadores_clones cl
      JOIN public.equipes e ON e.id = cl.equipe_id
     WHERE cl.empresa_id        = ANY (v_empresas)
       AND cl.conta_recebimento IS TRUE
       AND e.setor_id          IS NOT NULL
  ),
  receb_setor AS (
    -- Setor NORMAL: o carimbo do relatório, inclusive o das órfãs.
    SELECT se.id AS setor_id, l.valor_recebido
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND NOT se.alternativo
    UNION ALL
    -- ALTERNATIVO: os usuários que contam nele.
    SELECT c.setor_id, l.valor_recebido
      FROM linhas l
      JOIN conta_no_setor c  ON c.operador_id = l.operador_id
      JOIN setores_emp    se ON se.id = c.setor_id AND se.alternativo
     WHERE l.operador_id IS NOT NULL
    UNION ALL
    -- ALTERNATIVO: mais as órfãs carimbadas nele.
    SELECT se.id, l.valor_recebido
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND se.alternativo
     WHERE l.operador_id IS NULL
  )
  SELECT COALESCE(jsonb_object_agg(y.setor_id, jsonb_build_object(
           'total', y.total, 'qtd', y.qtd
         )), '{}'::JSONB)
    INTO v_receb_setor
    FROM (
      SELECT setor_id,
             SUM(valor_recebido)::NUMERIC AS total,
             COUNT(*)::BIGINT             AS qtd
        FROM receb_setor
       GROUP BY setor_id
    ) y;

  RETURN jsonb_build_object(
    'mes',                 v_mes,
    'ano',                 v_ano,
    'empresas',            to_jsonb(v_empresas),
    'metas',               v_metas,
    'equipe_empresa',      v_equipe_emp,
    'config',              v_config,
    'recebido_mes_equipe', v_receb_equipe,
    'metas_setor',         v_metas_setor,
    'setor_empresa',       v_setor_emp,
    'setores_alternativos', v_setores_alt,
    'recebido_mes_setor',  v_receb_setor
  );
END;
$function$;

-- `anon` não tem o que fazer aqui: desafio é tela de gente logada, e a função
-- é SECURITY DEFINER — deixá-la aberta ao anônimo seria abrir a meta de todas
-- as empresas para quem tem só a chave pública.
REVOKE ALL ON FUNCTION public.fn_desafio_contexto_equipe(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_contexto_equipe(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_desafio_contexto_equipe(UUID) IS
  'Metas de equipe E DE SETOR, config de dias uteis e recebido do mes por '
  'equipe e por setor das empresas do desafio. Por equipe segue as tres regras '
  'de Desempenho Equipes (lider credita a equipe que lidera, transferido a de '
  'origem no mes, clone com conta_recebimento tambem a clonada). Por setor '
  'segue linhaNoEscopo: carimbo no setor normal, soma dos usuarios no '
  'alternativo. Repete os tres portoes de fn_desafio_dados: quem nao ve o '
  'quadro nao ve o contexto.';

-- ── Guarda ──────────────────────────────────────────────────────────────────
DO $guarda$
BEGIN
  IF to_regprocedure('public.fn_desafio_contexto_equipe(uuid)') IS NULL THEN
    RAISE EXCEPTION 'fn_desafio_contexto_equipe nao foi criada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public'
       AND routine_name   = 'fn_desafio_contexto_equipe'
       AND grantee        = 'anon'
  ) THEN
    RAISE EXCEPTION 'fn_desafio_contexto_equipe continua alcancavel pelo anon';
  END IF;
END
$guarda$;
