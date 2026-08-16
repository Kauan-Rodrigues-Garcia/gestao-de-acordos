-- ============================================================================
-- 20260816190000_higiene_de_banco.sql
--
-- Bloco "Banco" da auditoria de 16/08/2026. Quatro coisas, da mais segura para
-- a mais delicada:
--
--   1. apaga a tabela `profiles`, morta desde o começo do projeto
--   2. remove 3 índices duplicados
--   3. remove 5 índices que nunca foram usados em 101 dias de estatística
--   4. reescreve 59 policies para avaliar `auth.uid()` uma vez por consulta
--      em vez de uma vez por linha
--
-- O item 4 mexe em CONTROLE DE ACESSO de um sistema multiempresa. Por isso ele
-- não é escrito à mão: é gerado a partir do próprio catálogo e conferido no
-- fim, comparando a expressão antes e depois. Qualquer divergência derruba a
-- transação inteira.
-- ============================================================================

-- ── 1. A tabela `profiles` ──────────────────────────────────────────────────
--
-- Andaime do início do projeto, nunca usada: 0 linhas, e o modelo de cargo
-- dela é `CHECK (perfil IN ('admin','setor'))` — duas opções, contra os oito
-- cargos que o sistema realmente tem. Quem faz o trabalho é `perfis`, com 199
-- linhas.
--
-- Levava junto 5 policies de RLS, 1 gatilho e 2 índices. Nada no código a
-- referencia, nenhuma FK aponta para ela e nenhuma view depende dela —
-- conferido antes de escrever isto.
--
-- O incômodo real não é o espaço: são duas tabelas com o mesmo nome em
-- idiomas diferentes, e a pergunta "qual das duas vale?" na primeira auditoria
-- de quem chega.
DROP TABLE IF EXISTS public.profiles;

-- ── 2. Índices duplicados ───────────────────────────────────────────────────
--
-- Mesma tabela, mesmas colunas, mesma expressão. O segundo de cada par só
-- ocupa espaço e trabalho de escrita.

-- nr_registros(acordo_id): os dois existem e os dois são usados (4.501 e 3.649
-- varreduras) porque o planner alterna entre eles. Sai o maior e menos usado;
-- o que fica absorve a carga inteira.
DROP INDEX IF EXISTS public.nr_registros_acordo_id_idx;

-- pix_automatico_acordos: mesma expressão do índice UNIQUE que garante a
-- unicidade. O UNIQUE atende as consultas (154 varreduras); este aqui ficou em
-- zero, porque nunca houve o que ele fizesse melhor.
DROP INDEX IF EXISTS public.idx_pix_auto_nr_busca;

-- pix_automatico_metas: DUAS constraints UNIQUE sobre (empresa_id, equipe_id,
-- mes, ano). A regra é a mesma declarada duas vezes. Fica a mais usada
-- (`_periodo`, 304 varreduras contra 3).
ALTER TABLE public.pix_automatico_metas DROP CONSTRAINT IF EXISTS uq_pix_metas_equipe;

-- ── 3. Índices sem uso ──────────────────────────────────────────────────────
--
-- As estatísticas correm desde 07/05/2026 — 101 dias. Zero varreduras nesse
-- intervalo é evidência, não coincidência.
--
-- Ficam de fora os índices criados nos últimos dias (`analitico_colchao_*`,
-- `idx_analitico_tipo_comissao`): para eles o zero não significa nada ainda.
-- E ficam de fora os de 16 kB, onde apagar não devolve espaço mensurável e
-- ainda assim custa uma chance de regressão.

-- Os dois `gin_trgm` da busca de Logs. A investigação: a busca faz
-- `or(descricao.ilike, alvo_rotulo.ilike, usuario_nome.ilike, acao.ilike,
-- registro_id.ilike)` — cinco colunas — e só existe índice em duas. O planner
-- não consegue montar um BitmapOr parcial, então varre a tabela inteira e
-- ignora os dois. Não é a busca que está sem uso: é o índice que nunca teve
-- como ajudar, desde o dia em que foi criado.
--
-- Apagar não deixa a busca mais lenta (ela já varre tudo) e devolve 3,9 MB.
-- Se um dia a busca de logs precisar ser rápida, o caminho é outro: índice
-- sobre as cinco colunas de verdade, ou uma coluna `tsvector`. Recriar estes
-- dois traria o mesmo zero.
DROP INDEX IF EXISTS public.idx_logs_descricao_trgm;      -- 2.696 kB
DROP INDEX IF EXISTS public.idx_logs_alvo_rotulo_trgm;    -- 1.184 kB

-- GIN sobre `campos` (jsonb). Nenhuma consulta do projeto filtra por dentro
-- desse jsonb — ele é lido inteiro, para montar o texto do log.
DROP INDEX IF EXISTS public.idx_logs_campos;              --   216 kB

DROP INDEX IF EXISTS public.idx_diario_lote;              --   680 kB
DROP INDEX IF EXISTS public.idx_historico_campo_valor;    --   232 kB

-- ── 4. `auth.uid()` uma vez por consulta ────────────────────────────────────
--
-- Numa policy, `auth.uid()` solto é reavaliado A CADA LINHA varrida. Envolto
-- em `(select auth.uid())` vira subconsulta escalar, avaliada uma vez só. A
-- função é STABLE, então o valor é o mesmo nas duas formas — muda o número de
-- chamadas, não o resultado.
--
-- São 59 policies. 24 outras já estavam na forma boa e NÃO são tocadas.
--
-- Reescrever controle de acesso à mão, 59 vezes, é pedir para errar em
-- silêncio. Aqui o texto sai do próprio `pg_policies` (que é a versão
-- impressa pelo Postgres da expressão que ele guarda), recebe só o embrulho, e
-- volta por `ALTER POLICY` — que preserva comando, papéis e permissividade
-- sem que seja preciso repeti-los.
--
-- A reescrita e a conferência vivem no MESMO bloco de propósito. O retrato do
-- "antes" precisa sobreviver até a comparação, e um `CREATE TEMP TABLE` num
-- bloco e a leitura em outro dependeria de os dois caírem na mesma transação —
-- o que o editor de SQL do Supabase não garante. Em jsonb, dentro de uma
-- variável, o retrato vai junto com o código que o usa.
DO $$
DECLARE
  v_p        RECORD;
  v_qual     TEXT;
  v_check    TEXT;
  v_alterada INT := 0;
  v_antes    JSONB;
  v_lista    JSONB;
  v_falhas   TEXT;
  v_qtd      INT;
BEGIN
  SELECT jsonb_object_agg(
           tablename || '.' || policyname,
           jsonb_build_array(
             regexp_replace(coalesce(qual,''),
               '\( *SELECT +auth\.(uid|role|jwt|email)\(\) +AS +\w+\)', 'auth.\1()', 'gi'),
             regexp_replace(coalesce(with_check,''),
               '\( *SELECT +auth\.(uid|role|jwt|email)\(\) +AS +\w+\)', 'auth.\1()', 'gi')
           ))
    INTO v_antes
    FROM pg_policies
   WHERE schemaname = 'public';

  /*
   * A lista sai do catálogo ANTES de qualquer ALTER, e vai para uma VARIÁVEL.
   *
   * Iterar direto sobre `pg_policies` enquanto se altera policy é ler um
   * catálogo que muda debaixo do cursor: cada ALTER avança o contador de
   * comandos da transação, e o que a consulta enxerga deixa de ser estável.
   * Uma subconsulta não resolveria — o planner a achata de volta. Em jsonb o
   * retrato é material e não muda mais.
   */
  SELECT jsonb_agg(jsonb_build_object(
           'esquema', schemaname, 'tabela', tablename, 'policy', policyname,
           'qual', qual, 'checagem', with_check))
    INTO v_lista
    FROM pg_policies
   WHERE schemaname = 'public'
     -- Usa `auth.*()` de forma crua…
     AND (coalesce(qual,'') ~ 'auth\.(uid|role|jwt|email)\(\)'
       OR coalesce(with_check,'') ~ 'auth\.(uid|role|jwt|email)\(\)')
     -- …e não tem NENHUMA ocorrência já embrulhada. As 24 que já estão certas
     -- ficam intactas, e nenhuma policy mistura as duas formas (conferido:
     -- 24 + 59 = 83, sem sobreposição).
     AND NOT (coalesce(qual,'')       ~ '(?i)\( *SELECT +auth\.'
           OR coalesce(with_check,'') ~ '(?i)\( *SELECT +auth\.');

  FOR v_p IN
    SELECT * FROM jsonb_to_recordset(coalesce(v_lista, '[]'::jsonb))
      AS x(esquema TEXT, tabela TEXT, policy TEXT, qual TEXT, checagem TEXT)
  LOOP
    v_qual  := regexp_replace(v_p.qual,     'auth\.(uid|role|jwt|email)\(\)', '(select auth.\1())', 'g');
    v_check := regexp_replace(v_p.checagem, 'auth\.(uid|role|jwt|email)\(\)', '(select auth.\1())', 'g');

    -- Os três casos, e só eles: 7 policies têm USING e WITH CHECK, 35 só
    -- USING (SELECT/DELETE), 17 só WITH CHECK (INSERT). Somam 59.
    IF v_p.qual IS NOT NULL AND v_p.checagem IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s) WITH CHECK (%s)',
                     v_p.policy, v_p.esquema, v_p.tabela, v_qual, v_check);
    ELSIF v_p.qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',
                     v_p.policy, v_p.esquema, v_p.tabela, v_qual);
    ELSE
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
                     v_p.policy, v_p.esquema, v_p.tabela, v_check);
    END IF;

    v_alterada := v_alterada + 1;
  END LOOP;

  /*
   * A prova de que a reescrita foi fiel.
   *
   * Desembrulha o DEPOIS de volta à mesma forma canônica do retrato guardado
   * em `v_antes`. Se o embrulho foi a única mudança, os dois textos batem
   * caractere a caractere. Se o regex tiver comido um parêntese, invertido uma
   * condição ou mexido em qualquer outra coisa, a diferença aparece aqui e a
   * transação inteira cai — que é exatamente o que se quer quando o assunto é
   * quem enxerga o quê.
   */
  SELECT count(*), string_agg(d.chave, ', ')
    INTO v_qtd, v_falhas
    FROM (
      SELECT p.tablename || '.' || p.policyname AS chave
        FROM pg_policies p
       WHERE p.schemaname = 'public'
         -- `jsonb_exists` em vez do operador `?`: o interrogatório é
         -- placeholder de parâmetro em várias camadas de driver, e este
         -- arquivo vai ser colado num editor de SQL.
         AND jsonb_exists(v_antes, p.tablename || '.' || p.policyname)
         AND jsonb_build_array(
               regexp_replace(coalesce(p.qual,''),
                 '\( *SELECT +auth\.(uid|role|jwt|email)\(\) +AS +\w+\)', 'auth.\1()', 'gi'),
               regexp_replace(coalesce(p.with_check,''),
                 '\( *SELECT +auth\.(uid|role|jwt|email)\(\) +AS +\w+\)', 'auth.\1()', 'gi')
             ) IS DISTINCT FROM (v_antes -> (p.tablename || '.' || p.policyname))
    ) d;

  IF v_qtd > 0 THEN
    RAISE EXCEPTION 'Reescrita mudou o SENTIDO de % policy(ies): %', v_qtd, v_falhas;
  END IF;

  -- E nenhuma pode ter sobrado na forma crua.
  SELECT count(*) INTO v_qtd
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (coalesce(qual,'') ~ 'auth\.(uid|role|jwt|email)\(\)'
       OR coalesce(with_check,'') ~ 'auth\.(uid|role|jwt|email)\(\)')
     AND NOT (coalesce(qual,'')       ~ '(?i)\( *SELECT +auth\.'
           OR coalesce(with_check,'') ~ '(?i)\( *SELECT +auth\.');

  IF v_qtd > 0 THEN
    RAISE EXCEPTION 'Sobraram % policy(ies) reavaliando auth.*() por linha', v_qtd;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='profiles') THEN
    RAISE EXCEPTION 'A tabela profiles continua de pé';
  END IF;

  RAISE NOTICE 'OK: profiles apagada, índices limpos, % policies reescritas sem mudar sentido.',
    v_alterada;
END $$;
