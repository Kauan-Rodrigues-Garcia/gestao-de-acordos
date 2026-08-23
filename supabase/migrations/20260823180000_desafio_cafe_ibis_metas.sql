-- ============================================================================
-- 20260823180000_desafio_cafe_ibis_metas.sql
--
-- Cafe no IBIS: as metas por operador, a disputa por setor e a regra do premio.
--
-- ## Tres correcoes na CONFIGURACAO, nenhuma no codigo
--
-- 1. **A meta nao e uma so.** Cada operador tem a sua — de R$ 9.428,57 a
--    R$ 40.857,14. `metaIndividual` sai de cena e entra `metasPorOperador`.
--
-- 2. **A disputa e do SETOR**, nao da empresa: `escopoDisputa = 'setor'`.
--
-- 3. **O premio e de quem ALCANCA**, nao de quem chega mais perto. A tela
--    anunciava "quem chegar mais perto da meta leva", que e o contrario da
--    regra: quem atingir o valor ate o encerramento leva o cafe, e podem ser
--    varios. Vira `premiacao = 'todos_que_batem'`.
--
--    Como consequencia, o criterio de ORDENACAO tambem muda: com metas
--    diferentes entre as pessoas, ordenar por valor recebido colocaria na
--    frente quem tem a meta maior mesmo estando mais longe de bate-la.
--    `maior_percentual` ordena por quanto cada um andou da PROPRIA meta, que e
--    a unica comparacao justa aqui.
--
-- ## A meta de equipe some, e isso e proposital
--
-- `metaEquipe` vai a NULL. Com meta individual variavel, um numero fixo por
-- equipe faria a barra da equipe contar uma historia diferente da soma das
-- barras dos integrantes. A aplicacao passa a somar as metas de quem esta na
-- equipe — ver `calcularDesafio.ts`.
--
-- ## Por que resolver o login para o id do perfil
--
-- As metas chegam de planilha, com o login como identificador. Login pode ser
-- renomeado; `perfis.id` nao. A resolucao acontece aqui, uma vez: o que casar
-- fica gravado por UUID, e o que nao casar fica com o login normalizado — que
-- a aplicacao tambem aceita. Assim um login digitado diferente na planilha nao
-- apaga a meta da pessoa em silencio; ela so passa a depender do login.
--
-- Rodar de novo e seguro: e UPDATE, e a resolucao refaz o mapa do zero.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

DO $config$
DECLARE
  v_desafio       RECORD;
  v_metas         JSONB;
  v_sem_cadastro  TEXT;
BEGIN
  FOR v_desafio IN
    SELECT d.id, d.empresa_id
      FROM public.desafios d
      JOIN public.empresas e ON e.id = d.empresa_id
     WHERE e.slug        = 'bookplay'
       AND d.nome        = 'Café no IBIS'
       AND d.data_inicio = DATE '2026-08-21'
  LOOP
    -- ── O mapa login/id → meta ───────────────────────────────────────────
    SELECT
      COALESCE(jsonb_object_agg(x.chave, x.valor), '{}'::JSONB),
      string_agg(x.login, ', ') FILTER (WHERE x.perfil_id IS NULL)
      INTO v_metas, v_sem_cadastro
      FROM (
        SELECT
          m.login,
          m.valor,
          p.id                              AS perfil_id,
          COALESCE(p.id::TEXT, m.login)     AS chave
        FROM (VALUES
          -- Equipe do Bryan
          ('kauan_teixeira',    40857.14),
          ('eduarda_lorenzo',   40857.14),
          ('gabriel_oliveira',  40857.14),
          ('jose_victor',       40857.14),
          ('marianne_freitas',  40857.14),
          ('nayara_cruz',       40857.14),
          ('agatha_rocha',      28285.71),
          ('amanda_paulo',      28285.71),
          ('thiago_alves',      15714.29),
          -- Equipe da Luciana
          ('maria_valeria',     28285.71),
          ('juliana_itala',     19904.76),
          ('eduardo_melo',      28285.71),
          ('eriele_monteiro',   22000.00),
          ('heloisa_camilo',    22000.00),
          ('maria_mazziero',    22000.00),
          ('bianca_s_santos',    9428.57),
          ('jeniffer_oliveira', 28285.71),
          ('nayara_macedo',     22000.00),
          -- Equipe do Matheus
          ('debora_portela',     9428.57),
          ('nanci_moreira',      9428.57),
          ('gabriely_alves',    17285.71),
          ('heloisa_lima',      17285.71),
          ('renata_costa',      17285.71),
          ('viviane_antonio',   17285.71),
          ('larissa_pereiraa',  19904.76),
          ('layra_carini',      17285.71),
          ('fernanda_paliotta',  9428.57)
        ) AS m(login, valor)
        -- LATERAL porque a busca depende do login da linha. `lower(btrim())`
        -- dos dois lados: a planilha mistura maiuscula e minuscula, e o
        -- cadastro tambem.
        LEFT JOIN LATERAL (
          SELECT pf.id
            FROM public.perfis pf
           WHERE pf.empresa_id = v_desafio.empresa_id
             AND lower(btrim(pf.usuario)) = m.login
           LIMIT 1
        ) p ON TRUE
      ) x;

    IF v_sem_cadastro IS NOT NULL THEN
      -- Aviso, nao erro: a meta fica gravada pelo login e a aplicacao a
      -- encontra assim mesmo. Parar a migration por causa de um login
      -- renomeado seria pior — as outras 26 metas ficariam de fora.
      RAISE NOTICE 'Cafe no IBIS: sem perfil para o(s) login(s) %. Meta gravada pelo login.',
                   v_sem_cadastro;
    END IF;

    UPDATE public.desafios
       SET descricao = 'Quem alcançar a meta até 28/08 leva o café no IBIS.',
           regra = regra || jsonb_build_object(
             'escopoDisputa',    'setor',
             'premiacao',        'todos_que_batem',
             'criterioRanking',  'maior_percentual',
             -- Sai a meta unica: cada operador tem a sua, logo abaixo.
             'metaIndividual',   NULL,
             -- Sai a meta fixa de equipe: ela passa a ser a soma das metas
             -- de quem esta na equipe.
             'metaEquipe',       NULL,
             'metasPorOperador', v_metas
           )
     WHERE id = v_desafio.id;
  END LOOP;
END
$config$;

COMMIT;
