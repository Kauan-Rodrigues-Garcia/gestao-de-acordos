-- ═══════════════════════════════════════════════════════════════════════════
-- Quem credita na equipe: a MESMA regra de Desempenho Equipes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que a migration anterior não resolveu
--
-- A 20260909120000 acertou a JANELA (o recebido passou a ser o do mês, como a
-- meta), e ainda assim os dois números discordavam. Medido em 09/09/2026, na
-- equipe `Digital` da PaguePlay:
--
--   meta do mês  R$ 1.081.730,77 · 21 dias úteis · 5 decorridos
--   esperado     R$   257.554,95
--
--   Desafio            R$ 282.138,75 ÷ esperado = 109,5%
--   Desempenho Equipes R$ 327.497,02 ÷ esperado = 127%
--
-- Mesma meta, mesmos dias úteis, mesma tabela de recebimento. O que diferia era
-- **quem conta como sendo da equipe**, e o desafio não sabia de nenhuma das
-- três regras que o painel aplica:
--
--   1. **Líder credita a equipe que LIDERA.** `equipeQueCredita`
--      (`services/equipes/equipeDoLider.ts`): para cargo `lider` vale
--      `equipe_lideres`, e `perfis.equipe_id` é só reserva — aquele campo é
--      resíduo do modelo antigo, que a tela de Equipes nem edita. Leticia
--      Romeu é `lider`, está cadastrada na `Digital` e lidera outra equipe:
--      os R$ 8.054,46 dela saem da `Digital` no painel e ficavam nela no
--      desafio.
--
--   2. **Fantasma de transferência.** Quem foi transferido no meio do mês
--      continua creditando a equipe de ORIGEM naquele mês
--      (`perfis_transferencias` com `fantasma_ativo`, `aplicarFantasmas`).
--      Karolaine Silva (R$ 25.420,27) e Helton Roldon (R$ 27.992,46) saíram da
--      PaguePlay em setembro: o painel os soma na `Digital`, o desafio não.
--
--   3. **Clone que conta.** `equipe_operadores_clones.conta_recebimento`
--      credita TAMBÉM a equipe clonada. Esta o desafio já tinha, pelo elenco.
--
--   282.138,75 − 8.054,46 + 25.420,27 + 27.992,46 = 327.497,02
--
-- ## A correção
--
-- `recebido_mes` deixa de ser por OPERADOR e passa a ser por EQUIPE:
-- `recebido_mes_equipe`, montado aqui com as três regras acima. Somar por
-- operador e deixar o elenco do desafio decidir a equipe era o erro — o elenco
-- responde «quem disputa», não «de quem é este dinheiro», e as duas perguntas
-- têm respostas diferentes.
--
-- Isto torna esta função a segunda implementação de «quem credita nesta
-- equipe», e essa duplicação é deliberada: a primeira vive no cliente do
-- Analítico (`buscarComposicaoAnalitica`), que monta o mapa a partir de quatro
-- tabelas com a RLS de quem olha. O desafio atravessa empresas e não alcança
-- essas tabelas pela RLS — foi por isso que esta função SECURITY DEFINER nasceu.
-- O que se pode fazer é o que está feito: escrever a regra uma vez, aqui,
-- explicando de onde ela veio, para que quem mexer numa lembre da outra.
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

  -- De qual empresa é cada equipe — é o que liga a equipe à régua de dias
  -- úteis dela. Só as equipes que têm meta interessam.
  SELECT COALESCE(jsonb_object_agg(e.id, e.empresa_id), '{}'::JSONB)
    INTO v_equipe_emp
    FROM public.equipes e
   WHERE e.empresa_id = ANY (v_empresas)
     AND v_metas ? e.id::TEXT;

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
  -- Ver o cabeçalho: as três regras de Desempenho Equipes, nesta ordem.
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

  RETURN jsonb_build_object(
    'mes',                v_mes,
    'ano',                v_ano,
    'empresas',           to_jsonb(v_empresas),
    'metas',              v_metas,
    'equipe_empresa',     v_equipe_emp,
    'config',             v_config,
    'recebido_mes_equipe', v_receb_equipe
  );
END;
$function$;

-- `anon` não tem o que fazer aqui: desafio é tela de gente logada, e a função
-- é SECURITY DEFINER — deixá-la aberta ao anônimo seria abrir a meta de todas
-- as empresas para quem tem só a chave pública.
REVOKE ALL ON FUNCTION public.fn_desafio_contexto_equipe(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_contexto_equipe(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_desafio_contexto_equipe(UUID) IS
  'Metas de equipe, config de dias uteis e RECEBIDO DO MES POR EQUIPE das '
  'empresas do desafio. O recebido e por equipe, e nao por operador, porque a '
  'equipe que credita segue as tres regras de Desempenho Equipes: lider '
  'credita a equipe que lidera, transferido credita a de origem no mes, clone '
  'com conta_recebimento credita tambem a clonada. Repete os tres portoes de '
  'fn_desafio_dados: quem nao ve o quadro nao ve o contexto.';

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
