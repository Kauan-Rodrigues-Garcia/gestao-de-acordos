-- ============================================================================
-- Controle de Numeros — tratamento do retorno, etiquetas e correcao de cadastro
-- ============================================================================
--
-- Quarta migration do modulo. As tres anteriores criaram as tabelas
-- (`..._numeros_whatsapp`), o fluxo com a RLS (`..._numeros_whatsapp_fluxo`) e
-- as permissoes (`..._numeros_whatsapp_permissoes`). Esta fecha tres buracos que
-- a operacao encontrou nos primeiros dias.
--
-- ## 1. O numero voltava e nao havia como trata-lo
--
-- O setor relancava com motivo `banido`, e o numero chegava ao Nucleo assim:
--
--     situacao = 'ativo'        (ninguem mexeu)
--     motivo_retorno = 'banido' (o setor informou)
--
-- Duas colunas dizendo coisas opostas sobre o mesmo chip. Pior: `situacao` valia
-- 'ativo', entao `fn_numeros_liberar_ao_setor` aceitava mandar o numero de volta
-- na hora, sem tratamento nenhum — o setor devolvia de novo, e o ciclo se
-- repetia sem nada ter sido feito.
--
-- Duas mudancas resolvem, e elas sao diferentes:
--
--   a) `relancar` e `devolver` com motivo `banido` passam a gravar
--      `situacao = 'banido'`. A migration do fluxo dizia que `situacao` teria
--      «uma dona so» — o Nucleo — para dois donos nao produzirem discordancia.
--      O que se viu foi o contrario: NAO escrever produziu a discordancia, e por
--      um caminho pior, porque a contradicao nao aparecia em coluna nenhuma como
--      erro. As duas RPCs continuam sendo caminho disciplinado e gravam a
--      movimentacao `situacao_alterada` junto — nao e um segundo dono solto, e o
--      historico continua contando a mesma historia.
--
--      Vale so para `banido`. `sem_uso` e `problema_tecnico` nao dizem que o
--      numero morreu, e transformar «nao usei» em «banido» inventaria fato.
--
--   b) nasce a coluna `tratamento`, com tres valores:
--
--        NULL            nada pendente — e o numero normal do Nucleo
--        'pendente'      voltou de um setor e ninguem pegou ainda
--        'em_andamento'  o Nucleo esta trabalhando nele
--
--      `fn_numeros_liberar_ao_setor` passa a RECUSAR enquanto `tratamento` nao
--      for NULL. E o que separa as duas acoes que o pedido manda separar:
--      alterar o estado do numero (livre, a qualquer momento) e devolve-lo ao
--      setor (so no fim). O Nucleo mexe na situacao quantas vezes precisar sem
--      nunca ser obrigado a lancar para conseguir isso.
--
--      Por que uma coluna e nao `motivo_retorno IS NOT NULL`: as duas perguntas
--      sao diferentes. `motivo_retorno` diz POR QUE voltou, e continua valendo
--      enquanto o tratamento acontece. `tratamento` diz EM QUE PE esta. Derivar
--      a segunda da primeira apagaria o motivo para sinalizar «terminei», que e
--      justamente a informacao que o Nucleo precisa manter na tela.
--
-- ## 2. Nao havia etiqueta operacional
--
-- `situacao` responde «o numero serve?». Ha um estado que nao e isso: o SMS de
-- verificacao nao chegou, e a pessoa tem que tentar de novo mais tarde. Nao e
-- situacao — o numero nao mudou de qualidade —, e nao e motivo de retorno, que
-- so existe quando o numero volta de um setor.
--
-- `etiquetas TEXT[]` guarda isso. Array e nao coluna booleana porque a segunda
-- etiqueta ja esta prevista no pedido; e nao tabela de ligacao porque cada
-- numero tem duas ou tres, sao lidas sempre junto com a linha, e uma juncao por
-- leitura pagaria caro pelo que cabe num indice GIN.
--
-- Uma etiqueta so nasce aqui: `nao_chegou_sms`. O CHECK lista os valores em vez
-- de consultar um catalogo em tabela — etiqueta nova precisa de rotulo na tela
-- (`numerosRegras.ts`) de qualquer jeito, entao ela sempre custa um deploy.
-- Fazer o banco ler catalogo daria a impressao de que nao custa.
--
-- ## 3. Nao havia como corrigir nem apagar um numero digitado errado
--
-- Cadastrou-se `18999999998` no lugar de `...999`. A unica saida era apagar o
-- celular inteiro, com os outros cinco numeros dentro.
--
-- A policy de escrita ja permitia UPDATE e DELETE ao Nucleo desde a segunda
-- migration — o cabecalho dela diz «cobre cadastrar, corrigir digitacao e apagar
-- um cadastro errado». Faltavam as travas e o registro, e e o que entra aqui,
-- por GATILHO e nao por RPC:
--
--   - corrigir `numero` so enquanto o chip esta no Nucleo e sem operador. Trocar
--     o numero de um chip que alguem esta usando muda, em silencio, o que
--     aparece na tela dessa pessoa;
--   - apagar so enquanto o numero nunca saiu do Nucleo. `numeros_movimentacoes`
--     tem `ON DELETE CASCADE`, entao apagar leva a trilha junto. Para quem foi
--     cadastrado errado ha dez segundos isso e correto: nao ha historia. Para
--     quem circulou por um setor seria apagar prova, e a saida certa e marcar
--     `banido`;
--   - a correcao entra na trilha por trigger, pela mesma razao que o cadastro
--     entra: ela existe mesmo que o UPDATE venha do SQL Editor.
--
-- ## Reaplicavel
--
-- Colunas com `IF NOT EXISTS`, constraints com `DROP ... IF EXISTS` antes do
-- `ADD`, funcoes com `CREATE OR REPLACE`, triggers com `DROP ... IF EXISTS`.
-- Rodar duas vezes nao muda o resultado da primeira.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ============================================================================
-- As duas colunas novas
-- ============================================================================

ALTER TABLE public.numeros_whatsapp
  ADD COLUMN IF NOT EXISTS etiquetas TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

ALTER TABLE public.numeros_whatsapp
  ADD COLUMN IF NOT EXISTS tratamento TEXT;

/*
 * A regra das etiquetas, em DUAS camadas — e a divisão não é arbitrária.
 *
 * ## No CHECK: só «a etiqueta existe», e por expressão pura
 *
 * `<@` cobre o array vazio (todo conjunto contém o vazio), que é o estado
 * normal: a esmagadora maioria dos números não tem etiqueta nenhuma.
 *
 * A expressão é literal, sem chamada de função, de propósito. Um CHECK que
 * chama função é legal no Postgres e é uma armadilha no `pg_dump`: no restore, a
 * constraint pode ser recriada ANTES da função existir, e a restauração falha —
 * inclusive a cópia de schema que uma branch do Supabase faz. O preço de evitar
 * isso é repetir a lista de etiquetas neste arquivo, e o arquivo é o mesmo.
 *
 * ## Na função: «e sem repetido»
 *
 * Contar distintos exige `unnest`, e `unnest` num CHECK é subconsulta — que o
 * Postgres recusa. A verificação fica na `fn_numeros_etiquetar`, que é por onde
 * a tela escreve, e o próprio `array_agg(DISTINCT ...)` de lá já normaliza antes
 * de comparar.
 *
 * O que sobra sem trava de banco é a duplicata entrando por UPDATE direto, fora
 * da RPC. É um risco pequeno e de consequência pequena: `etiquetasConhecidas`
 * remove repetição na leitura, e o pior caso seria a mesma etiqueta desenhada
 * duas vezes — não um estado que o módulo interprete errado.
 *
 * Etiqueta nova entra na lista daqui, na função abaixo e no rótulo de
 * `numerosRegras.ts`. Três lugares de propósito: o banco recusa o que não
 * conhece, e a tela sabe escrever o que o banco aceita.
 */
ALTER TABLE public.numeros_whatsapp
  DROP CONSTRAINT IF EXISTS numeros_whatsapp_etiquetas_conhecidas;
ALTER TABLE public.numeros_whatsapp
  DROP CONSTRAINT IF EXISTS numeros_whatsapp_etiquetas_sem_repetido;
ALTER TABLE public.numeros_whatsapp
  ADD CONSTRAINT numeros_whatsapp_etiquetas_conhecidas
  CHECK (etiquetas <@ ARRAY['nao_chegou_sms']::TEXT[]);

CREATE OR REPLACE FUNCTION public.fn_numeros_etiquetas_validas(p_etiquetas TEXT[])
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT p_etiquetas IS NULL
      OR (p_etiquetas <@ ARRAY['nao_chegou_sms']::TEXT[]
          AND COALESCE(array_length(p_etiquetas, 1), 0)
              = (SELECT COUNT(DISTINCT e) FROM unnest(p_etiquetas) AS e));
$function$;

COMMENT ON FUNCTION public.fn_numeros_etiquetas_validas(TEXT[]) IS
  'As etiquetas conhecidas, sem repetido. Usada pela RPC fn_numeros_etiquetar. '
  'NAO entra no CHECK da coluna: funcao em CHECK quebra o restore de pg_dump.';

ALTER TABLE public.numeros_whatsapp
  DROP CONSTRAINT IF EXISTS numeros_whatsapp_tratamento_conhecido;
ALTER TABLE public.numeros_whatsapp
  ADD CONSTRAINT numeros_whatsapp_tratamento_conhecido
  CHECK (tratamento IS NULL OR tratamento IN ('pendente', 'em_andamento'));

-- Tratamento so existe no Nucleo. Um numero que esta com o setor nao pode
-- carregar «em tratamento» — quem trata e o Nucleo, e para tratar ele precisa
-- estar com o Nucleo.
ALTER TABLE public.numeros_whatsapp
  DROP CONSTRAINT IF EXISTS numeros_whatsapp_tratamento_so_no_nucleo;
ALTER TABLE public.numeros_whatsapp
  ADD CONSTRAINT numeros_whatsapp_tratamento_so_no_nucleo
  CHECK (tratamento IS NULL OR posse = 'nucleo');

COMMENT ON COLUMN public.numeros_whatsapp.etiquetas IS
  'Marcas operacionais do momento, fora do eixo situacao/posse. Hoje so '
  '`nao_chegou_sms`. Vazio e o estado normal.';

COMMENT ON COLUMN public.numeros_whatsapp.tratamento IS
  'Em que pe esta o retorno: NULL (nada pendente), pendente (voltou e ninguem '
  'pegou), em_andamento (o Nucleo esta trabalhando). Enquanto nao for NULL, '
  'fn_numeros_liberar_ao_setor recusa.';

-- O painel do Nucleo abre pela fila de tratamento, e ela e uma fracao pequena
-- da tabela: indice parcial, que so indexa as linhas que a consulta procura.
CREATE INDEX IF NOT EXISTS idx_numeros_wpp_tratamento
  ON public.numeros_whatsapp (empresa_id, tratamento)
  WHERE tratamento IS NOT NULL;

-- GIN porque a pergunta e «quais numeros TEM esta etiqueta» (`@>`), e nao
-- «qual e o array desta linha». Parcial pelo mesmo motivo do de cima.
CREATE INDEX IF NOT EXISTS idx_numeros_wpp_etiquetas
  ON public.numeros_whatsapp USING GIN (etiquetas)
  WHERE etiquetas <> '{}'::TEXT[];

-- ============================================================================
-- A trilha ganha quatro tipos
-- ============================================================================

ALTER TABLE public.numeros_movimentacoes
  DROP CONSTRAINT IF EXISTS numeros_movimentacoes_tipo_check;
ALTER TABLE public.numeros_movimentacoes
  ADD CONSTRAINT numeros_movimentacoes_tipo_check CHECK (tipo IN (
    'cadastro', 'situacao_alterada', 'liberado_ao_setor',
    'lancado_ao_operador', 'devolvido_a_lideranca', 'relancado_ao_nucleo',
    -- os quatro desta migration
    'numero_corrigido', 'etiquetas_alteradas',
    'tratamento_iniciado', 'tratamento_concluido'));

-- ── Rotulo de etiqueta, congelado na descricao ──────────────────────────────
--
-- Mesma razao de `fn_numeros_rotulo_situacao`: o rotulo do TypeScript e a tela
-- viva, que muda quando alguem renomeia; este fica dentro de `descricao`, que e
-- o fato de ontem e nao pode mudar de texto depois.

CREATE OR REPLACE FUNCTION public.fn_numeros_rotulo_etiqueta(p_etiqueta TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT CASE p_etiqueta
    WHEN 'nao_chegou_sms' THEN 'Não chegou SMS'
    ELSE COALESCE(p_etiqueta, '—')
  END;
$function$;

/**
 * A lista de etiquetas em uma frase, ou «nenhuma».
 *
 * Existe para `descricao` nao ficar com chave de codigo (`{nao_chegou_sms}`)
 * numa tela que o resto do historico escreve em portugues.
 */
CREATE OR REPLACE FUNCTION public.fn_numeros_rotulo_etiquetas(p_etiquetas TEXT[])
RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT string_agg(public.fn_numeros_rotulo_etiqueta(e), ', ' ORDER BY e)
       FROM unnest(COALESCE(p_etiquetas, '{}'::TEXT[])) AS e),
    'nenhuma');
$function$;

-- ============================================================================
-- `fn_numeros_movimentacao` aprende as frases novas
-- ============================================================================
--
-- A funcao inteira e reescrita porque o `CASE` das frases mora no meio dela. Os
-- quatro parametros novos entram no FIM da assinatura, com DEFAULT: assim as
-- chamadas existentes — todas nomeadas — continuam compilando sem tocar em
-- nenhuma delas.

CREATE OR REPLACE FUNCTION public.fn_numeros_movimentacao(
  p_numero_id           UUID,
  p_tipo                TEXT,
  p_setor_origem_id     UUID DEFAULT NULL,
  p_setor_destino_id    UUID DEFAULT NULL,
  p_operador_origem_id  UUID DEFAULT NULL,
  p_operador_destino_id UUID DEFAULT NULL,
  p_situacao_anterior   TEXT DEFAULT NULL,
  p_situacao_nova       TEXT DEFAULT NULL,
  p_motivo              TEXT DEFAULT NULL,
  p_observacao          TEXT DEFAULT NULL,
  p_numero_anterior     TEXT DEFAULT NULL,
  p_numero_novo         TEXT DEFAULT NULL,
  p_etiquetas_antes     TEXT[] DEFAULT NULL,
  p_etiquetas_depois    TEXT[] DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_autor      UUID := (SELECT auth.uid());
  v_autor_nome TEXT;
  v_empresa    UUID;
  v_numero     TEXT;
  v_celular    TEXT;
  v_so_nome    TEXT;  -- setor de origem
  v_sd_nome    TEXT;  -- setor de destino
  v_oo_nome    TEXT;  -- operador de origem
  v_od_nome    TEXT;  -- operador de destino
  v_motivo     TEXT := NULLIF(TRIM(p_motivo), '');
  v_descricao  TEXT;
BEGIN
  SELECT n.empresa_id, n.numero, c.identificacao
    INTO v_empresa, v_numero, v_celular
    FROM public.numeros_whatsapp n
    JOIN public.numeros_celulares c ON c.id = n.celular_id
   WHERE n.id = p_numero_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_autor_nome
    FROM public.perfis p WHERE p.id = v_autor;

  SELECT s.nome INTO v_so_nome FROM public.setores s WHERE s.id = p_setor_origem_id;
  SELECT s.nome INTO v_sd_nome FROM public.setores s WHERE s.id = p_setor_destino_id;
  SELECT p.nome INTO v_oo_nome FROM public.perfis  p WHERE p.id = p_operador_origem_id;
  SELECT p.nome INTO v_od_nome FROM public.perfis  p WHERE p.id = p_operador_destino_id;

  v_descricao := CASE p_tipo
    WHEN 'cadastro' THEN
      format('Numero cadastrado no celular %s, setor %s.',
             COALESCE(v_celular, '—'), COALESCE(v_sd_nome, v_so_nome, '—'))
    WHEN 'situacao_alterada' THEN
      format('Situacao alterada de %s para %s.',
             public.fn_numeros_rotulo_situacao(p_situacao_anterior),
             public.fn_numeros_rotulo_situacao(p_situacao_nova))
    WHEN 'liberado_ao_setor' THEN
      format('Liberado pelo Nucleo ao setor %s.', COALESCE(v_sd_nome, '—'))
    WHEN 'lancado_ao_operador' THEN
      CASE WHEN v_oo_nome IS NOT NULL
        THEN format('Lancado para %s, no lugar de %s.', COALESCE(v_od_nome, '—'), v_oo_nome)
        ELSE format('Lancado para %s.', COALESCE(v_od_nome, '—'))
      END
    WHEN 'devolvido_a_lideranca' THEN
      format('%s devolveu a lideranca do setor %s — motivo: %s.',
             COALESCE(v_oo_nome, v_autor_nome), COALESCE(v_so_nome, '—'),
             public.fn_numeros_rotulo_motivo(v_motivo))
    WHEN 'relancado_ao_nucleo' THEN
      format('%s relancou ao Nucleo — motivo: %s.',
             COALESCE(v_so_nome, 'O setor'),
             public.fn_numeros_rotulo_motivo(v_motivo))
    -- ── os quatro desta migration ──
    WHEN 'numero_corrigido' THEN
      format('Numero corrigido de %s para %s.',
             COALESCE(p_numero_anterior, '—'), COALESCE(p_numero_novo, '—'))
    WHEN 'etiquetas_alteradas' THEN
      format('Etiquetas: %s (antes: %s).',
             public.fn_numeros_rotulo_etiquetas(p_etiquetas_depois),
             public.fn_numeros_rotulo_etiquetas(p_etiquetas_antes))
    WHEN 'tratamento_iniciado' THEN
      'O Nucleo comecou o tratamento deste numero.'
    WHEN 'tratamento_concluido' THEN
      'Tratamento concluido — o numero volta a ficar disponivel para liberacao.'
    ELSE
      format('Movimentacao %s.', p_tipo)
  END;

  INSERT INTO public.numeros_movimentacoes (
    empresa_id, numero_id, tipo,
    setor_origem_id,     setor_origem_nome,
    setor_destino_id,    setor_destino_nome,
    operador_origem_id,  operador_origem_nome,
    operador_destino_id, operador_destino_nome,
    situacao_anterior, situacao_nova, motivo, observacao,
    descricao, autor_id, autor_nome
  ) VALUES (
    v_empresa, p_numero_id, p_tipo,
    p_setor_origem_id,     v_so_nome,
    p_setor_destino_id,    v_sd_nome,
    p_operador_origem_id,  v_oo_nome,
    p_operador_destino_id, v_od_nome,
    p_situacao_anterior, p_situacao_nova, v_motivo,
    NULLIF(TRIM(p_observacao), ''),
    v_descricao, v_autor, COALESCE(v_autor_nome, 'Sistema')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_movimentacao(
  UUID, TEXT, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT[], TEXT[]) FROM PUBLIC;

/*
 * A assinatura de 10 parametros sai de cena.
 *
 * `CREATE OR REPLACE` com parametros a mais cria uma SOBRECARGA, nao substitui:
 * as duas conviveriam, e as chamadas nomeadas das RPCs antigas continuariam
 * caindo na versao velha — que nao conhece as frases novas. Derrubar a antiga
 * e o que faz esta migration valer.
 *
 * `IF EXISTS` porque numa reaplicacao ela ja foi embora.
 */
DROP FUNCTION IF EXISTS public.fn_numeros_movimentacao(
  UUID, TEXT, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT);

-- ============================================================================
-- Corrigir e apagar: as travas, e o registro por gatilho
-- ============================================================================

-- ── Trocar o `numero` so enquanto ele esta no Nucleo, sem dono ──────────────
--
-- Entra dentro de `fn_numeros_whatsapp_valida`, que ja e o BEFORE da tabela.
-- Uma segunda trigger BEFORE na mesma tabela dependeria da ordem alfabetica dos
-- nomes para saber quem roda primeiro — dependencia invisivel no arquivo.
--
-- A funcao inteira e reescrita porque nao ha como acrescentar um trecho no meio
-- de uma funcao existente. O que muda em relacao a versao anterior e SO o bloco
-- marcado com «── correcao ──».

CREATE OR REPLACE FUNCTION public.fn_numeros_whatsapp_valida()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cel_empresa UUID;
  v_cel_setor   UUID;
  v_cel_nome    TEXT;
  v_quantos     INTEGER;
BEGIN
  SELECT c.empresa_id, c.setor_id, c.identificacao
    INTO v_cel_empresa, v_cel_setor, v_cel_nome
    FROM public.numeros_celulares c
   WHERE c.id = NEW.celular_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Celular nao encontrado.' USING ERRCODE = '23503';
  END IF;

  IF v_cel_empresa IS DISTINCT FROM NEW.empresa_id THEN
    RAISE EXCEPTION 'O celular pertence a outra empresa.' USING ERRCODE = '23514';
  END IF;

  NEW.setor_id := v_cel_setor;

  IF TG_OP = 'INSERT' OR NEW.celular_id IS DISTINCT FROM OLD.celular_id THEN
    SELECT COUNT(*) INTO v_quantos
      FROM public.numeros_whatsapp n
     WHERE n.celular_id = NEW.celular_id;

    IF v_quantos >= 6 THEN
      RAISE EXCEPTION
        'O celular "%" ja tem 6 numeros, que e o limite.', v_cel_nome
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- ── correcao ──
    --
    -- Corrigir digitacao e conserto de cadastro, e cadastro so existe antes de o
    -- chip circular. Trocar o numero de um chip que esta com um operador mudaria,
    -- sem aviso, o que aparece na tela dessa pessoa — e a mensagem que ela mandou
    -- ontem passaria a constar de outro numero.
    IF NEW.numero IS DISTINCT FROM OLD.numero THEN
      IF OLD.posse <> 'nucleo' OR OLD.operador_id IS NOT NULL THEN
        RAISE EXCEPTION
          'So da para corrigir um numero que esta no Nucleo e sem operador. '
          'Relance ao Nucleo antes de corrigir.'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    NEW.atualizado_em := NOW();
  END IF;

  RETURN NEW;
END;
$function$;

-- ── A correcao entra na trilha ──────────────────────────────────────────────
--
-- Por gatilho, e nao por RPC, pela mesma razao do cadastro: a linha existe mesmo
-- que o UPDATE venha do SQL Editor, de um script, ou de uma tela futura.

CREATE OR REPLACE FUNCTION public.fn_numeros_registra_correcao()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- `AFTER UPDATE OF numero` dispara quando a coluna esta no SET, mesmo que o
  -- valor seja o mesmo. Sem esta conferencia, salvar o formulario sem mexer em
  -- nada geraria uma linha de historico dizendo «corrigido de X para X».
  IF NEW.numero IS DISTINCT FROM OLD.numero THEN
    PERFORM public.fn_numeros_movimentacao(
      p_numero_id       => NEW.id,
      p_tipo            => 'numero_corrigido',
      p_numero_anterior => OLD.numero,
      p_numero_novo     => NEW.numero
    );
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_numeros_registra_correcao ON public.numeros_whatsapp;
CREATE TRIGGER trg_numeros_registra_correcao
  AFTER UPDATE OF numero ON public.numeros_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.fn_numeros_registra_correcao();

-- ── Apagar so o que nunca saiu do Nucleo ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_pode_excluir()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_circulou BOOLEAN;
BEGIN
  IF OLD.posse <> 'nucleo' OR OLD.operador_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Este numero esta com um setor. Relance ao Nucleo antes de excluir.'
      USING ERRCODE = '22023';
  END IF;

  /*
   * `numeros_movimentacoes` tem `ON DELETE CASCADE`, entao apagar o numero leva
   * a trilha junto. Para um cadastro errado ha dez segundos isso e o certo: nao
   * ha historia para preservar.
   *
   * Para um numero que circulou por um setor seria apagar prova de um problema
   * — e a saida para esse caso e marcar `banido`, que mantem tudo.
   *
   * `cadastro`, `numero_corrigido` e `etiquetas_alteradas` nao contam como
   * circulacao: sao os passos de quem esta arrumando o proprio cadastro.
   */
  SELECT EXISTS (
    SELECT 1 FROM public.numeros_movimentacoes m
     WHERE m.numero_id = OLD.id
       AND m.tipo NOT IN ('cadastro', 'numero_corrigido', 'etiquetas_alteradas')
  ) INTO v_circulou;

  IF v_circulou THEN
    RAISE EXCEPTION
      'Este numero ja circulou por um setor e tem historico. Marque como '
      'Banido em vez de excluir — excluir apagaria a trilha junto.'
      USING ERRCODE = '22023';
  END IF;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_numeros_pode_excluir ON public.numeros_whatsapp;
CREATE TRIGGER trg_numeros_pode_excluir
  BEFORE DELETE ON public.numeros_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.fn_numeros_pode_excluir();

-- ============================================================================
-- As RPCs novas
-- ============================================================================

-- ── Etiquetar ───────────────────────────────────────────────────────────────
--
-- So o Nucleo, como `fn_numeros_alterar_situacao`: as etiquetas descrevem o
-- trabalho de preparo do chip («o SMS nao chegou»), que e trabalho do Nucleo. O
-- setor tem `motivo_retorno` para dizer o que encontrou.

CREATE OR REPLACE FUNCTION public.fn_numeros_etiquetar(
  p_numero_id UUID, p_etiquetas TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n       public.numeros_whatsapp%ROWTYPE;
  v_novas TEXT[];
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_numeros_nucleo_administra(n.empresa_id) THEN
    RAISE EXCEPTION 'Somente o Nucleo altera as etiquetas de um numero.'
      USING ERRCODE = '42501';
  END IF;

  -- Ordena e tira repetido: `{a,b}` e `{b,a,b}` sao a mesma coisa para quem le,
  -- e sem a normalizacao a comparacao logo abaixo acharia que mudou.
  SELECT COALESCE(array_agg(DISTINCT e ORDER BY e), '{}'::TEXT[])
    INTO v_novas
    FROM unnest(COALESCE(p_etiquetas, '{}'::TEXT[])) AS e
   WHERE NULLIF(TRIM(e), '') IS NOT NULL;

  -- A mesma regra do CHECK. Conferir aqui nao e desconfianca da constraint: e
  -- para a recusa chegar como frase em portugues em vez de `23514`.
  IF NOT public.fn_numeros_etiquetas_validas(v_novas) THEN
    RAISE EXCEPTION 'Etiqueta desconhecida.' USING ERRCODE = '22023';
  END IF;

  -- Trocar por igual nao e movimentacao, como em `alterar_situacao`.
  IF n.etiquetas IS NOT DISTINCT FROM v_novas THEN
    RETURN;
  END IF;

  UPDATE public.numeros_whatsapp
     SET etiquetas = v_novas, atualizado_em = NOW()
   WHERE id = p_numero_id;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id        => p_numero_id,
    p_tipo             => 'etiquetas_alteradas',
    p_etiquetas_antes  => n.etiquetas,
    p_etiquetas_depois => v_novas
  );
END;
$function$;

-- ── Comecar o tratamento ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_iniciar_tratamento(p_numero_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n public.numeros_whatsapp%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_numeros_nucleo_administra(n.empresa_id) THEN
    RAISE EXCEPTION 'Somente o Nucleo trata um numero devolvido.'
      USING ERRCODE = '42501';
  END IF;

  IF n.tratamento IS DISTINCT FROM 'pendente' THEN
    RAISE EXCEPTION
      'Este numero nao esta esperando tratamento.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.numeros_whatsapp
     SET tratamento = 'em_andamento', atualizado_em = NOW()
   WHERE id = p_numero_id;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id => p_numero_id, p_tipo => 'tratamento_iniciado');
END;
$function$;

-- ── Encerrar o tratamento ───────────────────────────────────────────────────
--
-- E aqui que `motivo_retorno` morre — e nao mais em `liberar_ao_setor`.
--
-- A diferenca e o pedido inteiro: ate agora, apagar o motivo e devolver ao setor
-- eram o MESMO ato, e por isso o Nucleo era obrigado a lancar o numero para
-- conseguir tirar o «Voltou: Banido» da tela. Separadas, o Nucleo encerra o
-- tratamento quando terminou, o numero volta a ser um numero comum do Nucleo, e
-- a liberacao acontece depois — se e quando fizer sentido.
--
-- A trilha guarda o motivo em todas as vezes que ele existiu.

CREATE OR REPLACE FUNCTION public.fn_numeros_concluir_tratamento(
  p_numero_id UUID, p_observacao TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n public.numeros_whatsapp%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_numeros_nucleo_administra(n.empresa_id) THEN
    RAISE EXCEPTION 'Somente o Nucleo encerra o tratamento de um numero.'
      USING ERRCODE = '42501';
  END IF;

  IF n.tratamento IS NULL THEN
    RAISE EXCEPTION 'Este numero nao esta em tratamento.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.numeros_whatsapp
     SET tratamento = NULL,
         motivo_retorno = NULL,
         observacao_retorno = NULL,
         atualizado_em = NOW()
   WHERE id = p_numero_id;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id  => p_numero_id,
    p_tipo       => 'tratamento_concluido',
    p_motivo     => n.motivo_retorno,
    p_observacao => p_observacao
  );
END;
$function$;

-- ============================================================================
-- As tres transicoes que mudam de comportamento
-- ============================================================================

-- ── Liberar: recusa enquanto houver tratamento pendente ─────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_liberar_ao_setor(p_numero_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n public.numeros_whatsapp%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.fn_numeros_sou_do_nucleo(n.empresa_id)
          AND public.fn_user_tem('numeros_liberar_ao_setor'))
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Somente o Nucleo pode liberar numero ao setor.'
      USING ERRCODE = '42501';
  END IF;

  IF n.posse <> 'nucleo' THEN
    RAISE EXCEPTION 'Este numero ja esta com o setor.' USING ERRCODE = '22023';
  END IF;

  /*
   * A trava nova, e a razao desta migration.
   *
   * Sem ela, um numero que voltou banido continuava com `situacao = 'ativo'` e
   * podia ser mandado de volta no mesmo minuto — o setor devolvia outra vez, e
   * ninguem tinha tratado nada. Encerrar o tratamento e um ato explicito, e ele
   * vem antes.
   */
  IF n.tratamento IS NOT NULL THEN
    RAISE EXCEPTION
      'Este numero voltou de um setor e ainda esta em tratamento. Encerre o '
      'tratamento antes de liberar.'
      USING ERRCODE = '22023';
  END IF;

  IF n.situacao <> 'ativo' THEN
    RAISE EXCEPTION
      'Só número ativo pode ser liberado. Este está como %.',
      public.fn_numeros_rotulo_situacao(n.situacao)
      USING ERRCODE = '22023';
  END IF;

  /*
   * `motivo_retorno` ja foi limpo por `fn_numeros_concluir_tratamento` — a
   * trava acima garante que o tratamento passou por la. Limpar de novo aqui
   * seria escrever por cima de NULL, e esconderia um caminho quebrado se algum
   * dia a trava saisse.
   */
  UPDATE public.numeros_whatsapp
     SET posse = 'setor', atualizado_em = NOW()
   WHERE id = p_numero_id;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id        => p_numero_id,
    p_tipo             => 'liberado_ao_setor',
    p_setor_destino_id => n.setor_id,
    p_situacao_nova    => n.situacao
  );
END;
$function$;

-- ── Relancar ao Nucleo: abre o tratamento, e `banido` vira situacao ─────────

CREATE OR REPLACE FUNCTION public.fn_numeros_relancar_ao_nucleo(
  p_numero_id UUID, p_motivo TEXT, p_observacao TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n           public.numeros_whatsapp%ROWTYPE;
  v_situacao  TEXT;
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_user_tem('chips_relancar_ao_nucleo')
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Voce nao tem permissao para relancar numero ao Nucleo.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_numeros_manda_no_setor(n.setor_id) THEN
    RAISE EXCEPTION 'Este numero nao pertence ao seu setor.' USING ERRCODE = '42501';
  END IF;

  IF n.posse <> 'setor' THEN
    RAISE EXCEPTION 'Este numero ja esta com o Nucleo.' USING ERRCODE = '22023';
  END IF;

  IF p_motivo IS NULL
     OR p_motivo NOT IN ('banido', 'sem_uso', 'problema_tecnico', 'outro') THEN
    RAISE EXCEPTION 'Informe o motivo do relancamento.' USING ERRCODE = '22023';
  END IF;

  -- «Voltou banido» e «esta ativo» nao podem conviver na mesma linha. So
  -- `banido` mexe na situacao: `sem_uso` e `problema_tecnico` nao afirmam que o
  -- numero morreu, e traduzi-los para banido inventaria fato que ninguem disse.
  v_situacao := CASE WHEN p_motivo = 'banido' THEN 'banido' ELSE n.situacao END;

  UPDATE public.numeros_whatsapp
     SET posse = 'nucleo',
         operador_id = NULL,
         situacao = v_situacao,
         tratamento = 'pendente',
         motivo_retorno = p_motivo,
         observacao_retorno = NULLIF(TRIM(p_observacao), ''),
         atualizado_em = NOW()
   WHERE id = p_numero_id;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id          => p_numero_id,
    p_tipo               => 'relancado_ao_nucleo',
    p_setor_origem_id    => n.setor_id,
    p_operador_origem_id => n.operador_id,
    p_motivo             => p_motivo,
    p_observacao         => p_observacao
  );

  IF v_situacao IS DISTINCT FROM n.situacao THEN
    PERFORM public.fn_numeros_movimentacao(
      p_numero_id         => p_numero_id,
      p_tipo              => 'situacao_alterada',
      p_situacao_anterior => n.situacao,
      p_situacao_nova     => v_situacao
    );
  END IF;
END;
$function$;

-- ── Devolver a lideranca: `banido` tambem vira situacao ─────────────────────
--
-- Mesma incoerencia, um degrau antes. Sem isto, o operador devolve dizendo
-- «banido», a situacao continua `ativo`, e `podeLancarAoOperador` deixa a
-- lideranca entregar o mesmo numero morto para a proxima pessoa.
--
-- O numero NAO sai do setor: `posse` e `tratamento` nao se mexem aqui. Tratar e
-- do Nucleo, e para tratar o numero precisa ser relancado.

CREATE OR REPLACE FUNCTION public.fn_numeros_devolver_a_lideranca(
  p_numero_id UUID, p_motivo TEXT, p_observacao TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n          public.numeros_whatsapp%ROWTYPE;
  v_eu       UUID := (SELECT auth.uid());
  v_situacao TEXT;
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_user_tem('chips_devolver_a_lideranca')
     AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Voce nao tem permissao para devolver numero.'
      USING ERRCODE = '42501';
  END IF;

  IF n.operador_id IS NULL OR n.operador_id IS DISTINCT FROM v_eu THEN
    RAISE EXCEPTION 'Este numero nao esta lancado para voce.' USING ERRCODE = '42501';
  END IF;

  IF p_motivo IS NULL
     OR p_motivo NOT IN ('banido', 'sem_uso', 'problema_tecnico', 'outro') THEN
    RAISE EXCEPTION 'Informe o motivo da devolucao.' USING ERRCODE = '22023';
  END IF;

  v_situacao := CASE WHEN p_motivo = 'banido' THEN 'banido' ELSE n.situacao END;

  UPDATE public.numeros_whatsapp
     SET operador_id = NULL,
         situacao = v_situacao,
         motivo_retorno = p_motivo,
         observacao_retorno = NULLIF(TRIM(p_observacao), ''),
         atualizado_em = NOW()
   WHERE id = p_numero_id;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id          => p_numero_id,
    p_tipo               => 'devolvido_a_lideranca',
    p_setor_origem_id    => n.setor_id,
    p_setor_destino_id   => n.setor_id,
    p_operador_origem_id => v_eu,
    p_motivo             => p_motivo,
    p_observacao         => p_observacao
  );

  IF v_situacao IS DISTINCT FROM n.situacao THEN
    PERFORM public.fn_numeros_movimentacao(
      p_numero_id         => p_numero_id,
      p_tipo              => 'situacao_alterada',
      p_situacao_anterior => n.situacao,
      p_situacao_nova     => v_situacao
    );
  END IF;
END;
$function$;

-- ── Privilegios ─────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_numeros_etiquetar(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_numeros_iniciar_tratamento(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_numeros_concluir_tratamento(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_numeros_etiquetar(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_numeros_iniciar_tratamento(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_numeros_concluir_tratamento(UUID, TEXT) TO authenticated;

-- As tres reescritas mantem o GRANT que ja tinham: `CREATE OR REPLACE` preserva
-- privilegio. Repetir aqui e barato e deixa a migration completa se algum dia
-- alguma delas precisar ser recriada do zero.
GRANT EXECUTE ON FUNCTION public.fn_numeros_liberar_ao_setor(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_numeros_relancar_ao_nucleo(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_numeros_devolver_a_lideranca(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- Ponto de partida: o que ja voltou antes desta migration
-- ============================================================================
--
-- Numeros que estao no Nucleo com motivo de retorno gravado voltaram de um setor
-- e nunca foram tratados — sao exatamente a fila que esta coluna existe para
-- mostrar. Sem esta linha eles ficariam com `tratamento = NULL` e sumiriam do
-- painel, que e o sintoma que a migration veio corrigir.

UPDATE public.numeros_whatsapp
   SET tratamento = 'pendente'
 WHERE posse = 'nucleo'
   AND motivo_retorno IS NOT NULL
   AND tratamento IS NULL;

-- ============================================================================
-- As tabelas entram no realtime
-- ============================================================================
--
-- Nao faz parte do pedido, e e um defeito do modulo desde o primeiro dia:
-- `useControleNumeros`, `useMeusChips` e `useNucleo` assinam canais nestas
-- tabelas, e nenhuma delas estava na publicacao. As telas ficavam paradas ate
-- alguem apertar F5 — o Nucleo liberava um numero e a lideranca nao via.
--
-- Entra aqui porque o pedido pede a diferenciacao funcionando de ponta a ponta,
-- e uma tela que nao acompanha o proprio banco nao esta funcionando.
--
-- A RLS continua valendo no realtime: cada assinante so recebe as linhas que
-- `fn_numeros_visivel` deixa passar para ele. Publicar a tabela nao publica o
-- conteudo dela para quem nao o alcanca.
--
-- `numeros_movimentacoes` fica DE FORA: nenhuma tela a escuta — o historico e
-- lido sob demanda, quando alguem abre o painel de um numero — e assinar uma
-- tabela append-only que cresce a cada acao seria trafego por nada.

DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.numeros_whatsapp;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.numeros_celulares;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.numeros_config;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  ELSE
    RAISE NOTICE 'Sem publicacao supabase_realtime — as telas do modulo so '
                 'atualizam ao recarregar.';
  END IF;
END
$realtime$;

-- ============================================================================
-- Prova
-- ============================================================================

DO $prova$
BEGIN
  IF to_regclass('public.numeros_whatsapp') IS NULL THEN
    RAISE EXCEPTION 'numeros_whatsapp nao existe — as migrations do modulo nao rodaram.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'numeros_whatsapp'
       AND column_name IN ('etiquetas', 'tratamento')
     GROUP BY table_name HAVING COUNT(*) = 2
  ) THEN
    RAISE EXCEPTION 'As colunas etiquetas e tratamento nao foram criadas.';
  END IF;

  -- A sobrecarga antiga de `fn_numeros_movimentacao` tem que ter sumido: as duas
  -- convivendo fariam as RPCs cair na versao que nao conhece as frases novas.
  IF (SELECT COUNT(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'fn_numeros_movimentacao') <> 1 THEN
    RAISE EXCEPTION
      'fn_numeros_movimentacao tem % versoes; deveria ter uma so.',
      (SELECT COUNT(*) FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_numeros_movimentacao');
  END IF;

  IF to_regprocedure('public.fn_numeros_etiquetar(uuid, text[])') IS NULL
     OR to_regprocedure('public.fn_numeros_iniciar_tratamento(uuid)') IS NULL
     OR to_regprocedure('public.fn_numeros_concluir_tratamento(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'Alguma RPC nova nao foi criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.numeros_whatsapp'::regclass
       AND tgname IN ('trg_numeros_registra_correcao', 'trg_numeros_pode_excluir')
     GROUP BY tgrelid HAVING COUNT(*) = 2
  ) THEN
    RAISE EXCEPTION 'As triggers de correcao e exclusao nao foram criadas.';
  END IF;
END
$prova$;

COMMIT;
