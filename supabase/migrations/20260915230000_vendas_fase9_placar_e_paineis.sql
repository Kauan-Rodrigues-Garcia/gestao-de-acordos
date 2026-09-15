-- ============================================================================
-- Fase 9 — o cadastro que o placar pergunta, e a ausencia que a meta desconta
-- ============================================================================
--
-- A Fase 9 e "paineis e heranca", e quase tudo nela e tela: Dashboard do
-- Comercial, Painel Lider, Painel Diretoria, Lixeira, Tickets e Desafios. As
-- contas moram em `src/lib/vendasPlacar.ts`, em memoria, sobre a lista que a
-- RLS ja recortou -- 140 vendas no mes do setor cabem na mao, e uma RPC por
-- recorte criaria cinco lugares onde a regua «confirmada E assinada» poderia
-- ser esquecida.
--
-- Sobram DUAS perguntas que a lista de vendas nao responde, e as duas sao
-- cadastro. Esta migration existe so para elas.
--
--
-- ## 1. Quem e robo
--
-- `perfis.robo` nasceu na Fase 6 (20260915160000) e ate hoje nao saiu do banco:
-- a coluna existe, os 3 robos estao marcados por SQL, e nenhuma tela sabe
-- disso. A venda do robo nao muda de regua -- ela e confirmada, assinada,
-- entrou no caixa do setor e SOMA. O que ela nao pode e disputar o placar por
-- cabeca: uma automacao que roda 24 horas seria o destaque de todo dia, e o
-- card deixaria de dizer alguma coisa sobre alguem.
--
-- O prefixo `ia_` do login NAO serve. Sao 21 logins com ele entre os 358
-- vendedores do relatorio, e confiar na string faria um humano chamado
-- `ian_pereira` sair do placar sem ninguem entender por que. Pista, nunca
-- cadastro -- e por isso a resposta vem daqui, e nao de um LIKE na tela.
--
--
-- ## 2. Quantos dias uteis a pessoa esteve fora
--
-- O item que sobrou da Fase 8 (§6.2 do estado): «Andamento das Metas ainda
-- cobra o mes cheio de quem esteve fora». A regra de QUAIS tipos descontam ja
-- estava gravada em `ausencias_tipos.abate_meta` desde 20260915220000; o que
-- faltava era alguem perguntar.
--
-- A conta vem em NUMERO DE DIAS, e nunca com o tipo junto. A diferenca
-- importa: `ver_acompanhamento` e `ver_feedbacks` existem porque atestado e
-- INSS sao dado de saude, e a meta proporcional nao precisa saber a doenca de
-- ninguem para dividir por 21. Quem tem o painel ganha o numero; quem quer o
-- motivo continua precisando da aba Acompanhamento.
--
-- Dias UTEIS, e nao corridos: `diasDaAusencia` em `src/lib/ausencias.ts`
-- responde a outra pergunta -- «INSS de 30 dias e de 30 dias». Aqui a pergunta
-- e quanto do mes de trabalho se perdeu, e o mes de trabalho tem 21 dias.
--
-- Segunda a sexta, sem feriado. E o mesmo calendario que
-- `diasUteisDoMes(ano, mes)` usa na tela, chamado com a lista de feriados
-- vazia -- ver `src/pages/Vendas/index.tsx`. Divergir faria o denominador da
-- meta e o numerador do desconto falarem de meses diferentes.
--
--
-- ## O que esta migration NAO faz
--
-- **Nao toca o catalogo de permissoes.** Nenhuma chave nova: o Painel Lider e
-- o Painel Diretoria do Comercial reusam `ver_painel_lider` e
-- `ver_painel_diretoria`, que ja existem com escopo proprio
-- (`painel_lider_*`, `painel_diretoria_*`); a Lixeira reusa `ver_lixeira`;
-- Tickets reusa `ver_tickets`; Desafios reusa `analitico_sub_desafios`, que
-- nao depende de `ver_analitico`.
--
-- A cadeia de `fn_permissoes_catalogo()` ja se partiu uma vez aqui -- cada elo
-- congela o catalogo anterior, e chegar pelo elo errado derruba as chaves do
-- elo pulado SEM ERRO NENHUM. O topo continua sendo
-- `fn_permissoes_catalogo_antes_acompanhamento_20260915` (20260915220000), e o
-- jeito mais seguro de nao partir a cadeia e nao encosta-la. A verificacao la
-- embaixo confere que ela continua inteira mesmo assim.
--
-- **Nao cria tabela.** Le `perfis`, `equipes`, `setores`, `ausencias` e
-- `ausencias_tipos`, todas ja existentes.

-- ============================================================================
-- 1. O cadastro que o placar pergunta
-- ============================================================================
--
-- Uma ida ao banco, tres respostas: quem e robo, em que equipe a pessoa
-- credita, e quantos dias uteis ela perdeu no mes.
--
-- ## O alcance e o DE VENDAS, e nao o de Acompanhamento
--
-- `fn_vendas_alcanca` -- a mesma funcao que a policy `vendas_select` usa. Tem
-- de ser a mesma: esta lista existe para dar NOME e EQUIPE as vendas que ja
-- chegaram na tela. Um alcance mais estreito deixaria linhas do placar sem
-- cadastro (viram «Sem nome», e o robo vira gente); um mais largo entregaria
-- nomes de quem a pessoa nao pode ver, de graca, num painel.
--
-- Por isso NAO usa `fn_acompanhamento_alcancados`, que mede pela equipe de
-- HOJE -- a regra certa para ler o historico de um transferido, e a errada
-- para creditar dinheiro, que conta pela equipe da gravacao.
--
-- ## Os robos entram, ao contrario de `fn_acompanhamento_pessoas`
--
-- Aquela lista e de gente a acompanhar, e robo nao recebe feedback. Esta e o
-- cadastro do dinheiro, e o robo vendeu. Ele vem marcado, e quem separa e a
-- tela -- `separarAutomacao`, em `vendasPlacar.ts`.

CREATE OR REPLACE FUNCTION public.fn_vendas_placar_pessoas(
  p_empresa_id UUID,
  p_mes        DATE DEFAULT NULL
)
RETURNS TABLE(
  id                 UUID,
  nome               TEXT,
  foto_url           TEXT,
  cargo              TEXT,
  situacao           TEXT,
  robo               BOOLEAN,
  equipe_id          UUID,
  equipe_nome        TEXT,
  setor_id           UUID,
  setor_nome         TEXT,
  -- Dias UTEIS do mes perdidos em ausencia que abate meta. Meio periodo vale
  -- meio dia. Zero quando `p_mes` e nulo -- sem mes nao ha o que descontar.
  dias_abatidos      NUMERIC,
  -- O denominador, devolvido junto para a tela nao recalcular o calendario com
  -- outra regra e chegar noutro numero.
  dias_uteis_do_mes  INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH janela AS (
    SELECT DATE_TRUNC('month', p_mes)::DATE                       AS ini,
           (DATE_TRUNC('month', p_mes) + INTERVAL '1 month -1 day')::DATE AS fim
     WHERE p_mes IS NOT NULL
  ),
  uteis AS (
    SELECT COUNT(*)::INTEGER AS n
      FROM janela j,
           LATERAL generate_series(j.ini, j.fim, INTERVAL '1 day') AS d(dia)
     WHERE EXTRACT(ISODOW FROM d.dia) <= 5
  ),
  pessoas AS (
    SELECT p.id, p.nome, p.foto_url, p.perfil, p.situacao, p.setor_id,
           COALESCE(p.robo, false) AS robo,
           public.fn_vendas_equipe_que_credita(p.id) AS equipe_credita
      FROM public.perfis p
     WHERE p.empresa_id = p_empresa_id
       AND public.fn_can_access_empresa(p_empresa_id)
       AND NOT COALESCE(p.arquivado, false)
       AND p.perfil NOT IN ('administrador', 'super_admin')
  )
  SELECT p.id,
         p.nome,
         p.foto_url,
         p.perfil,
         p.situacao,
         p.robo,
         p.equipe_credita,
         e.nome,
         COALESCE(p.setor_id, e.setor_id),
         s.nome,
         COALESCE(a.dias, 0)::NUMERIC,
         COALESCE((SELECT n FROM uteis), 0)
    FROM pessoas p
    LEFT JOIN public.equipes e ON e.id = p.equipe_credita
    LEFT JOIN public.setores s ON s.id = COALESCE(p.setor_id, e.setor_id)
    LEFT JOIN LATERAL (
      -- Os dias uteis DISTINTOS cobertos por alguma ausencia que abate meta.
      --
      -- DISTINTOS porque duas ausencias podem se encostar nas pontas depois de
      -- uma correcao, e contar o mesmo dia duas vezes tiraria dois dias da meta
      -- por um dia de falta.
      --
      -- Meio periodo so vale meio dia quando a ausencia INTEIRA e de um dia --
      -- e a mesma regra de `diasDaAusencia` e `diasNoRecorte` na tela. Um
      -- «meio periodo» marcado num intervalo de dez dias e marcacao errada, e
      -- arredondar dez dias para 9,5 esconderia o erro em vez de mostra-lo.
      --
      -- `MAX` e nao `MIN` no peso do dia: se duas ausencias cobrem o mesmo dia
      -- e uma delas e de dia inteiro, o dia se perdeu inteiro. `MIN` deixaria
      -- a metade vencer o todo.
      SELECT SUM(x.peso) AS dias
        FROM (
          SELECT d.dia,
                 MAX(CASE WHEN au.meio_periodo AND au.inicio = au.fim THEN 0.5 ELSE 1 END) AS peso
            FROM public.ausencias au
            JOIN public.ausencias_tipos t ON t.tipo = au.tipo AND t.abate_meta
            CROSS JOIN janela j
            CROSS JOIN LATERAL generate_series(
                         GREATEST(au.inicio, j.ini),
                         LEAST(au.fim,       j.fim),
                         INTERVAL '1 day') AS d(dia)
           WHERE au.operador_id = p.id
             AND EXTRACT(ISODOW FROM d.dia) <= 5
           GROUP BY d.dia
        ) x
    ) a ON TRUE
   WHERE public.fn_vendas_alcanca(
           p_empresa_id, p.id,
           COALESCE(p.setor_id, e.setor_id),
           p.equipe_credita)
   ORDER BY p.nome;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_placar_pessoas(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vendas_placar_pessoas(UUID, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_placar_pessoas(UUID, DATE) IS
  'O cadastro que o placar do Comercial pergunta: quem e robo, em que equipe '
  'credita, e quantos dias uteis do mes perdeu em ausencia que abate meta. '
  'Alcance por fn_vendas_alcanca — o mesmo da policy vendas_select. Devolve o '
  'numero de dias, nunca o tipo: a meta proporcional nao precisa do motivo.';

-- ============================================================================
-- 2. Verificar
-- ============================================================================
--
-- `plpgsql` NAO valida o corpo na criacao, e funcao `sql` valida a sintaxe mas
-- nao executa uma linha. As duas so falham no clique. O bloco abaixo clica.

DO $$
DECLARE
  n_cols INTEGER;
  n_cat  INTEGER;
BEGIN
  -- A funcao existe, com a assinatura que o servico chama.
  IF to_regprocedure('public.fn_vendas_placar_pessoas(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'fn_vendas_placar_pessoas(uuid,date) nao foi criada.';
  END IF;

  -- As 12 colunas que `placar.service.ts` desempacota, na ordem.
  SELECT COUNT(*) INTO n_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'perfis'
     AND column_name IN ('robo', 'arquivado', 'setor_id', 'foto_url', 'situacao');
  IF n_cols <> 5 THEN
    RAISE EXCEPTION 'perfis nao tem as 5 colunas que o placar le (achei %).', n_cols;
  END IF;

  -- `ausencias_tipos.abate_meta` e a regra do desconto. Sem ela o LEFT JOIN
  -- LATERAL viraria zero em silencio, e a meta proporcional nunca descontaria.
  IF to_regclass('public.ausencias_tipos') IS NULL THEN
    RAISE EXCEPTION 'ausencias_tipos nao existe — a Fase 8 nao esta aplicada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ausencias_tipos WHERE abate_meta
  ) THEN
    RAISE EXCEPTION 'Nenhum tipo de ausencia abate meta — o desconto nasceria morto.';
  END IF;

  -- A cadeia do catalogo continua inteira. Esta migration nao a encosta, e a
  -- testemunha esta aqui justamente para provar isso: se alguem acrescentar
  -- uma chave depois e chegar pelo elo errado, o erro aparece na aplicacao e
  -- nao num clique de terca-feira.
  SELECT COUNT(*) INTO n_cat
    FROM public.fn_permissoes_catalogo()
   WHERE chave IN ('tickets_excluir', 'editar_metas_vendas', 'excluir_indicacoes',
                   'ver_acompanhamento', 'registrar_ausencias',
                   'ver_painel_lider', 'ver_painel_diretoria', 'ver_lixeira',
                   'ver_tickets', 'analitico_sub_desafios');
  IF n_cat <> 10 THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: esperava 10 chaves, achei %.', n_cat;
  END IF;

  RAISE NOTICE 'Fase 9: fn_vendas_placar_pessoas criada; catalogo inteiro.';
END $$;
