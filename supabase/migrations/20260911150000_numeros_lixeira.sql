-- ============================================================================
-- Controle de Numeros — a Lixeira de Numeros
-- ============================================================================
--
-- ## O que muda
--
-- Excluir um numero ou um celular deixa de ser DELETE sem volta. A exclusao
-- passa por RPC, que guarda uma copia inteira em `numeros_lixeira` — a linha, o
-- aparelho quando ele vai junto, e a trilha (`numeros_movimentacoes`) — e so
-- depois apaga. Restaurar recria tudo com os mesmos ids.
--
-- ## Por que copia, e nao uma coluna `excluido_em`
--
-- Marcar como excluido deixaria a linha na tabela, e toda leitura do modulo
-- teria de aprender a ignora-la: a RLS, o limite de 6 por celular, o UNIQUE do
-- numero, as RPCs do fluxo, Meus Chips e o painel do Nucleo. Um caminho
-- esquecido seria um numero "excluido" ainda circulando.
--
-- Com a copia, o numero excluido simplesmente nao existe para nada disso. E as
-- travas que ja existem — UNIQUE do numero, limite de 6, setor do celular —
-- recusam sozinhas a restauracao que daria conflito.
--
-- ## Quem exclui o que
--
--   super_admin .. qualquer numero ou celular: com setor, com operador, tanto
--                  faz. E a chave-mestra que as RPCs do modulo ja usam.
--   Nucleo ....... (`fn_numeros_nucleo_administra`) numero que esta no Nucleo e
--                  sem operador. "Ja circulou por um setor" deixa de impedir:
--                  a trilha vai junto para a lixeira e volta na restauracao, e
--                  o motivo daquela trava — apagar prova — acabou.
--
-- O DELETE direto (SQL Editor, script) continua com a trava antiga de
-- `fn_numeros_pode_excluir`. A excecao vale so para a linha que ja tem copia
-- na lixeira, e quem cria a copia sao as RPCs: nao ha variavel de sessao para
-- forjar pela API.
--
-- ## Sem prazo
--
-- Nada sai sozinho. Sai ao restaurar, ou por exclusao definitiva de quem tem
-- `numeros_lixeira_esvaziar` — chave nova, nascida desligada.
--
-- ## Reaplicavel
--
-- Tabela e indices com IF NOT EXISTS, funcoes com CREATE OR REPLACE, policy e
-- CHECK com DROP ... IF EXISTS antes. O RENAME do catalogo e o unico passo que
-- nao se repete — como nas migrations anteriores do catalogo.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ============================================================================
-- 1. A trilha ganha dois tipos
-- ============================================================================

ALTER TABLE public.numeros_movimentacoes
  DROP CONSTRAINT IF EXISTS numeros_movimentacoes_tipo_check;
ALTER TABLE public.numeros_movimentacoes
  ADD CONSTRAINT numeros_movimentacoes_tipo_check CHECK (tipo IN (
    'cadastro', 'situacao_alterada', 'liberado_ao_setor',
    'lancado_ao_operador', 'devolvido_a_lideranca', 'relancado_ao_nucleo',
    'numero_corrigido', 'etiquetas_alteradas',
    'tratamento_iniciado', 'tratamento_concluido',
    -- os dois desta migration
    'excluido_para_lixeira', 'restaurado_da_lixeira'));

-- ============================================================================
-- 2. A lixeira
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.numeros_lixeira (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  /*
   * O que foi excluido JUNTO. Excluir um celular leva os numeros dele no mesmo
   * lote, e restaurar o celular traz de volta os numeros daquele lote.
   */
  lote_id     UUID NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('numero', 'celular')),
  /* O id que a linha tinha — e volta a ter na restauracao. */
  registro_id UUID NOT NULL,

  /*
   * ── O que a tela lista ──
   *
   * Copiado da linha na hora da exclusao, para a lista e a busca nao abrirem o
   * JSON. Sem foreign key de proposito, como a trilha: o setor ou a pessoa podem
   * deixar de existir, e o item continua dizendo o que era.
   */
  numero                TEXT,
  celular_id            UUID NOT NULL,
  celular_identificacao TEXT NOT NULL,
  setor_id              UUID,
  setor_nome            TEXT,
  situacao              TEXT,
  posse                 TEXT,
  operador_nome         TEXT,
  /* Celular: quantos numeros foram junto. Numero: zero. */
  quantidade_numeros    INTEGER NOT NULL DEFAULT 0,

  /* A linha inteira (`to_jsonb`), para recriar exatamente como estava. */
  registro      JSONB NOT NULL,
  /* A trilha do numero, em ordem. Vazia para celular. */
  movimentacoes JSONB NOT NULL DEFAULT '[]'::JSONB,

  excluido_por      UUID,
  excluido_por_nome TEXT,
  excluido_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT numeros_lixeira_numero_preenchido
    CHECK (tipo <> 'numero' OR numero IS NOT NULL)
);

-- Uma copia por registro: o mesmo numero nao entra duas vezes na lixeira.
CREATE UNIQUE INDEX IF NOT EXISTS idx_numeros_lixeira_registro
  ON public.numeros_lixeira (tipo, registro_id);
-- A lista da tela: da empresa, do mais recente para o mais antigo.
CREATE INDEX IF NOT EXISTS idx_numeros_lixeira_empresa
  ON public.numeros_lixeira (empresa_id, excluido_em DESC);
-- Restaurar um celular procura os numeros do lote dele.
CREATE INDEX IF NOT EXISTS idx_numeros_lixeira_lote
  ON public.numeros_lixeira (lote_id);
-- Restaurar um numero procura o celular dele na lixeira.
CREATE INDEX IF NOT EXISTS idx_numeros_lixeira_celular
  ON public.numeros_lixeira (celular_id);

COMMENT ON TABLE public.numeros_lixeira IS
  'Copia do que foi excluido no Controle de Numeros: a linha, a trilha e o lote '
  'excluido junto. Escrita so pelas RPCs fn_numeros_excluir*, fn_numeros_restaurar '
  'e fn_numeros_lixeira_*. Sem prazo: sai ao restaurar ou por exclusao definitiva.';

ALTER TABLE public.numeros_lixeira ENABLE ROW LEVEL SECURITY;

-- So leitura, e so para quem administra o modulo. Escrever e das RPCs abaixo,
-- que sao SECURITY DEFINER: nao existe policy de INSERT, UPDATE nem DELETE, e a
-- ausencia e a regra — a mesma decisao da trilha.
DROP POLICY IF EXISTS numeros_lixeira_select ON public.numeros_lixeira;
CREATE POLICY numeros_lixeira_select ON public.numeros_lixeira
FOR SELECT TO authenticated
USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_numeros_nucleo_administra(empresa_id))
);

DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.numeros_lixeira;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  ELSE
    RAISE NOTICE 'Sem publicacao supabase_realtime — a lixeira so atualiza ao recarregar.';
  END IF;
END
$realtime$;

-- ============================================================================
-- 3. As duas travas antigas reconhecem a lixeira
-- ============================================================================

-- ── Apagar: a copia na lixeira e o salvo-conduto ────────────────────────────
--
-- A funcao inteira e reescrita (a de 20260910210000). O que muda e so o
-- primeiro bloco; as duas perguntas de baixo continuam valendo para o DELETE
-- direto, que nao guarda copia de nada.

CREATE OR REPLACE FUNCTION public.fn_numeros_pode_excluir()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_circulou BOOLEAN;
BEGIN
  /*
   * A linha ja tem copia na lixeira: quem esta apagando e
   * `fn_numeros_lixeira_mover_numero`, e a trilha esta guardada. As perguntas
   * de baixo existem para nao perder historia — aqui nada se perde.
   *
   * O salvo-conduto e a copia, e nao uma variavel de sessao: so as RPCs
   * escrevem em `numeros_lixeira`, entao nao ha como forjar pela API.
   */
  IF EXISTS (
    SELECT 1 FROM public.numeros_lixeira l
     WHERE l.tipo = 'numero' AND l.registro_id = OLD.id
  ) THEN
    RETURN OLD;
  END IF;

  IF OLD.posse <> 'nucleo' OR OLD.operador_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Este numero esta com um setor. Relance ao Nucleo antes de excluir.'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.numeros_movimentacoes m
     WHERE m.numero_id = OLD.id
       AND m.tipo NOT IN ('cadastro', 'numero_corrigido', 'etiquetas_alteradas')
  ) INTO v_circulou;

  IF v_circulou THEN
    RAISE EXCEPTION
      'Este numero ja circulou por um setor e tem historico. Exclua pela tela do '
      'Controle de Numeros: ela guarda a trilha na lixeira.'
      USING ERRCODE = '22023';
  END IF;

  RETURN OLD;
END;
$function$;

-- ── Cadastro: a restauracao nao e um numero novo ────────────────────────────
--
-- A de 20260910191000, com o primeiro bloco a mais. O numero restaurado volta
-- com a trilha inteira, que ja tem o cadastro original; gravar outro diria que
-- ele nasceu hoje.

CREATE OR REPLACE FUNCTION public.fn_numeros_registra_cadastro()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.numeros_lixeira l
     WHERE l.tipo = 'numero' AND l.registro_id = NEW.id
  ) THEN
    RETURN NULL;
  END IF;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id        => NEW.id,
    p_tipo             => 'cadastro',
    p_setor_destino_id => NEW.setor_id,
    p_situacao_nova    => NEW.situacao
  );
  RETURN NULL;  -- AFTER trigger: o retorno e ignorado.
END;
$function$;

-- ============================================================================
-- 4. As pecas internas — nenhuma e chamavel pela API
-- ============================================================================

-- ── Quem esta agindo, pelo nome ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_autor_nome()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT NULLIF(TRIM(p.nome), '') FROM public.perfis p
      WHERE p.id = (SELECT auth.uid())),
    'Sistema');
$function$;

-- ── Uma linha na trilha, com a frase pronta ─────────────────────────────────
--
-- Nao passa por `fn_numeros_movimentacao` porque as frases dela moram num CASE
-- no meio da funcao, e reescreve-la inteira por duas frases arriscaria as dez
-- que ja existem. A descricao continua montada no banco.

CREATE OR REPLACE FUNCTION public.fn_numeros_lixeira_registrar(
  p_numero_id UUID, p_tipo TEXT, p_descricao TEXT
)
RETURNS VOID
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  INSERT INTO public.numeros_movimentacoes (
    empresa_id, numero_id, tipo, descricao, autor_id, autor_nome
  )
  SELECT n.empresa_id, n.id, p_tipo, p_descricao,
         (SELECT auth.uid()), public.fn_numeros_autor_nome()
    FROM public.numeros_whatsapp n
   WHERE n.id = p_numero_id;
$function$;

-- ── Guardar a copia de um numero, e so entao apaga-lo ───────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_lixeira_mover_numero(
  p_numero_id UUID, p_lote_id UUID, p_descricao TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
BEGIN
  /*
   * A exclusao entra na trilha ANTES da copia: a trilha guardada ja conta quem
   * excluiu, e o numero restaurado mostra a exclusao no meio do caminho.
   */
  PERFORM public.fn_numeros_lixeira_registrar(
    p_numero_id, 'excluido_para_lixeira', p_descricao);

  INSERT INTO public.numeros_lixeira (
    empresa_id, lote_id, tipo, registro_id,
    numero, celular_id, celular_identificacao, setor_id, setor_nome,
    situacao, posse, operador_nome,
    registro, movimentacoes, excluido_por, excluido_por_nome
  )
  SELECT
    n.empresa_id, p_lote_id, 'numero', n.id,
    n.numero, n.celular_id, c.identificacao, n.setor_id, s.nome,
    n.situacao, n.posse, op.nome,
    to_jsonb(n),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.criado_em, m.id)
        FROM public.numeros_movimentacoes m
       WHERE m.numero_id = n.id
    ), '[]'::JSONB),
    (SELECT auth.uid()), public.fn_numeros_autor_nome()
    FROM public.numeros_whatsapp n
    JOIN public.numeros_celulares c ON c.id = n.celular_id
    LEFT JOIN public.setores s  ON s.id  = n.setor_id
    LEFT JOIN public.perfis  op ON op.id = n.operador_id
   WHERE n.id = p_numero_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Número não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  -- Com a copia gravada, `fn_numeros_pode_excluir` deixa passar. A trilha sai
  -- junto por `ON DELETE CASCADE` — e ja esta guardada acima.
  DELETE FROM public.numeros_whatsapp WHERE id = p_numero_id;

  RETURN v_id;
END;
$function$;

-- ── Recriar um celular ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_lixeira_restaurar_celular(p_lixeira_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  l public.numeros_lixeira%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.numeros_lixeira
   WHERE id = p_lixeira_id AND tipo = 'celular'
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este celular não está mais na lixeira.' USING ERRCODE = 'P0002';
  END IF;

  /*
   * O INSERT passa por `fn_numeros_celular_valida`, como qualquer cadastro. As
   * recusas possiveis viram frase: outro aparelho ja tem o nome, ou o setor
   * dele deixou de existir nesta empresa.
   */
  BEGIN
    INSERT INTO public.numeros_celulares
    SELECT * FROM jsonb_populate_record(NULL::public.numeros_celulares, l.registro);
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION
        'Já existe um celular chamado "%". Renomeie o cadastro atual antes de restaurar este.',
        l.celular_identificacao USING ERRCODE = '22023';
    WHEN foreign_key_violation OR check_violation THEN
      RAISE EXCEPTION
        'O setor do celular "%" não existe mais nesta empresa. Não dá para restaurar.',
        l.celular_identificacao USING ERRCODE = '22023';
  END;

  DELETE FROM public.numeros_lixeira WHERE id = l.id;
END;
$function$;

-- ── Recriar um numero, com a trilha ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_lixeira_restaurar_numero(p_lixeira_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  l          public.numeros_lixeira%ROWTYPE;
  v_registro JSONB;
  v_operador UUID;
  v_setor    UUID;
  v_solto    BOOLEAN := FALSE;
BEGIN
  SELECT * INTO l FROM public.numeros_lixeira
   WHERE id = p_lixeira_id AND tipo = 'numero'
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este número não está mais na lixeira.' USING ERRCODE = 'P0002';
  END IF;

  -- Conferido antes, e nao deixado para o UNIQUE: a frase do UNIQUE diz «ja
  -- existe», e quem restaura precisa saber que foi recadastrado DEPOIS.
  IF EXISTS (
    SELECT 1 FROM public.numeros_whatsapp n
     WHERE n.empresa_id = l.empresa_id AND n.numero = l.numero
  ) THEN
    RAISE EXCEPTION
      'O número % foi cadastrado de novo depois de excluído. Exclua o cadastro novo antes de restaurar este.',
      l.numero USING ERRCODE = '22023';
  END IF;

  v_registro := l.registro;

  /*
   * Quem estava com o numero pode nao servir mais: saiu, foi desativado, mudou
   * de setor. Devolver o numero a essa pessoa entregaria um chip a quem nao o
   * enxerga — a mesma recusa de `fn_numeros_lancar_ao_operador`. Ele volta ao
   * setor sem operador, e a trilha diz isso.
   */
  v_operador := NULLIF(v_registro->>'operador_id', '')::UUID;
  IF v_operador IS NOT NULL THEN
    SELECT c.setor_id INTO v_setor
      FROM public.numeros_celulares c WHERE c.id = l.celular_id;

    IF NOT EXISTS (
      SELECT 1 FROM public.perfis p
       WHERE p.id = v_operador
         AND p.ativo IS TRUE
         AND p.empresa_id = l.empresa_id
         AND p.setor_id IS NOT DISTINCT FROM v_setor
    ) THEN
      v_registro := jsonb_set(v_registro, '{operador_id}', 'null'::JSONB);
      v_solto := TRUE;
    END IF;
  END IF;

  /*
   * Com a copia ainda na lixeira, `fn_numeros_registra_cadastro` nao grava um
   * segundo «cadastro». O limite de 6 e o setor do celular sao conferidos por
   * `fn_numeros_whatsapp_valida`, como em todo INSERT.
   *
   * ⚠️ `jsonb_populate_record` preenche com NULL a coluna que nao estava no JSON.
   * Uma migration futura que acrescentar coluna NOT NULL em `numeros_whatsapp`
   * ou `numeros_movimentacoes` precisa completar `registro`/`movimentacoes` das
   * copias que ja estiverem aqui.
   */
  INSERT INTO public.numeros_whatsapp
  SELECT * FROM jsonb_populate_record(NULL::public.numeros_whatsapp, v_registro);

  INSERT INTO public.numeros_movimentacoes
  SELECT * FROM jsonb_populate_recordset(NULL::public.numeros_movimentacoes, l.movimentacoes);

  PERFORM public.fn_numeros_lixeira_registrar(
    l.registro_id, 'restaurado_da_lixeira',
    'Numero restaurado da lixeira.'
      || CASE WHEN v_solto
           THEN ' Quem estava com ele nao esta mais no setor, e ele voltou sem operador.'
           ELSE '' END);

  DELETE FROM public.numeros_lixeira WHERE id = l.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_autor_nome() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_numeros_lixeira_registrar(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_numeros_lixeira_mover_numero(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_numeros_lixeira_restaurar_celular(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_numeros_lixeira_restaurar_numero(UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. As RPCs
-- ============================================================================

-- ── Excluir um numero ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_excluir(p_numero_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n public.numeros_whatsapp%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Número não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_numeros_nucleo_administra(n.empresa_id) THEN
    RAISE EXCEPTION 'Somente o Núcleo exclui um número.' USING ERRCODE = '42501';
  END IF;

  /*
   * A chave-mestra: o super_admin exclui o que estiver onde estiver. O Nucleo,
   * so o que esta em casa — tirar um numero da mao de um operador e decisao de
   * quem manda no sistema, nao de quem prepara chip.
   */
  IF NOT public.fn_user_is_super_admin()
     AND (n.posse <> 'nucleo' OR n.operador_id IS NOT NULL) THEN
    RAISE EXCEPTION
      'Este número está com um setor. Relance ao Núcleo antes de excluir.'
      USING ERRCODE = '22023';
  END IF;

  RETURN public.fn_numeros_lixeira_mover_numero(
    p_numero_id, gen_random_uuid(), 'Numero excluido e enviado a lixeira.');
END;
$function$;

-- ── Excluir um celular, com os numeros dele ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_excluir_celular(p_celular_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c            public.numeros_celulares%ROWTYPE;
  v_lote       UUID := gen_random_uuid();
  v_presos     INTEGER;
  v_quantos    INTEGER := 0;
  v_setor_nome TEXT;
  r            RECORD;
BEGIN
  -- O aparelho antes dos numeros: e a ordem de `fn_numeros_whatsapp_valida`,
  -- que trava o celular para contar. A mesma ordem dos dois lados nao produz
  -- deadlock.
  SELECT * INTO c FROM public.numeros_celulares WHERE id = p_celular_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Celular não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_numeros_nucleo_administra(c.empresa_id) THEN
    RAISE EXCEPTION 'Somente o Núcleo exclui um celular.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.numeros_whatsapp WHERE celular_id = c.id FOR UPDATE;

  IF NOT public.fn_user_is_super_admin() THEN
    SELECT COUNT(*) INTO v_presos
      FROM public.numeros_whatsapp
     WHERE celular_id = c.id
       AND (posse <> 'nucleo' OR operador_id IS NOT NULL);

    IF v_presos > 0 THEN
      RAISE EXCEPTION
        'Não dá para excluir: % número(s) deste celular estão com setores. Relance ao Núcleo antes.',
        v_presos USING ERRCODE = '22023';
    END IF;
  END IF;

  FOR r IN
    SELECT id FROM public.numeros_whatsapp WHERE celular_id = c.id ORDER BY numero
  LOOP
    PERFORM public.fn_numeros_lixeira_mover_numero(
      r.id, v_lote,
      format('Numero excluido junto com o celular %s e enviado a lixeira.', c.identificacao));
    v_quantos := v_quantos + 1;
  END LOOP;

  SELECT s.nome INTO v_setor_nome FROM public.setores s WHERE s.id = c.setor_id;

  INSERT INTO public.numeros_lixeira (
    empresa_id, lote_id, tipo, registro_id,
    celular_id, celular_identificacao, setor_id, setor_nome,
    quantidade_numeros, registro, excluido_por, excluido_por_nome
  ) VALUES (
    c.empresa_id, v_lote, 'celular', c.id,
    c.id, c.identificacao, c.setor_id, v_setor_nome,
    v_quantos, to_jsonb(c), (SELECT auth.uid()), public.fn_numeros_autor_nome()
  );

  DELETE FROM public.numeros_celulares WHERE id = c.id;

  RETURN v_lote;
END;
$function$;

-- ── Restaurar ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_restaurar(p_lixeira_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  l     public.numeros_lixeira%ROWTYPE;
  v_cel UUID;
  r     RECORD;
BEGIN
  SELECT * INTO l FROM public.numeros_lixeira WHERE id = p_lixeira_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este item não está mais na lixeira.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_numeros_nucleo_administra(l.empresa_id) THEN
    RAISE EXCEPTION 'Somente o Núcleo restaura da lixeira.' USING ERRCODE = '42501';
  END IF;

  IF l.tipo = 'celular' THEN
    PERFORM public.fn_numeros_lixeira_restaurar_celular(l.id);

    /*
     * Desfazer a exclusao do celular e desfazer o LOTE: os numeros que sairam
     * junto com ele. Numero excluido antes, sozinho, fica na lixeira — ele tem
     * a propria exclusao para desfazer. Um conflito em qualquer um derruba a
     * restauracao inteira, e nada volta pela metade.
     */
    FOR r IN
      SELECT id FROM public.numeros_lixeira
       WHERE tipo = 'numero' AND lote_id = l.lote_id
       ORDER BY numero
    LOOP
      PERFORM public.fn_numeros_lixeira_restaurar_numero(r.id);
    END LOOP;
    RETURN;
  END IF;

  -- Numero cujo celular tambem esta na lixeira: o celular volta primeiro, SEM
  -- os outros numeros dele. Quem pediu um numero de volta recebe um.
  IF NOT EXISTS (SELECT 1 FROM public.numeros_celulares c WHERE c.id = l.celular_id) THEN
    SELECT id INTO v_cel FROM public.numeros_lixeira
     WHERE tipo = 'celular' AND registro_id = l.celular_id;

    IF v_cel IS NULL THEN
      RAISE EXCEPTION
        'O celular "%" deste número foi excluído definitivamente. Não dá para restaurar.',
        l.celular_identificacao USING ERRCODE = '22023';
    END IF;

    PERFORM public.fn_numeros_lixeira_restaurar_celular(v_cel);
  END IF;

  PERFORM public.fn_numeros_lixeira_restaurar_numero(l.id);
END;
$function$;

-- ── Excluir de vez ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_lixeira_excluir_definitivo(p_lixeira_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  l       public.numeros_lixeira%ROWTYPE;
  v_total INTEGER;
BEGIN
  SELECT * INTO l FROM public.numeros_lixeira WHERE id = p_lixeira_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este item não está mais na lixeira.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.fn_numeros_nucleo_administra(l.empresa_id)
          AND public.fn_user_tem('numeros_lixeira_esvaziar')) THEN
    RAISE EXCEPTION 'Seu cargo não pode excluir definitivamente da lixeira.'
      USING ERRCODE = '42501';
  END IF;

  -- Celular que sai de vez leva os numeros dele que estao na lixeira: sem o
  -- aparelho, nenhum deles teria para onde voltar.
  DELETE FROM public.numeros_lixeira
   WHERE id = l.id
      OR (l.tipo = 'celular' AND tipo = 'numero' AND celular_id = l.registro_id);

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_numeros_lixeira_esvaziar(p_empresa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_total INTEGER;
BEGIN
  IF NOT (public.fn_numeros_nucleo_administra(p_empresa_id)
          AND public.fn_user_tem('numeros_lixeira_esvaziar')) THEN
    RAISE EXCEPTION 'Seu cargo não pode esvaziar a lixeira.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.numeros_lixeira WHERE empresa_id = p_empresa_id;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_excluir(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_numeros_excluir_celular(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_numeros_restaurar(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_numeros_lixeira_excluir_definitivo(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_numeros_lixeira_esvaziar(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_numeros_excluir(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_numeros_excluir_celular(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_numeros_restaurar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_numeros_lixeira_excluir_definitivo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_numeros_lixeira_esvaziar(UUID) TO authenticated;

-- ============================================================================
-- 6. A chave de excluir de vez
-- ============================================================================

ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_lixeira_numeros_20260911;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_lixeira_numeros_20260911()
  UNION ALL
  SELECT * FROM (VALUES
    -- Sai sem volta, entao nasce desligada para todo cargo configuravel.
    ('numeros_lixeira_esvaziar', ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao 20260911 da lixeira acrescenta '
  'numeros_lixeira_esvaziar, sem perder o catalogo anterior. Espelha '
  'src/lib/permissoes-catalogo.ts; o teste de contrato quebra a CI se os dois '
  'lados divergirem.';

-- A chave nos cargos que ja existem. Ausente vale NEGADO, que ja e o padrao
-- dela — mas o painel mostra o interruptor pela chave gravada, e acesso total
-- nasce ligado como em toda chave nao explicita.
UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
         'numeros_lixeira_esvaziar', cp.cargo IN ('administrador', 'super_admin')),
       atualizado_em = NOW()
  FROM public.empresas e
 WHERE e.id = cp.empresa_id
   AND e.slug = 'bookplay'
   AND NOT (cp.permissoes ? 'numeros_lixeira_esvaziar');

-- ============================================================================
-- 7. Prova
-- ============================================================================

DO $prova$
BEGIN
  IF to_regclass('public.numeros_lixeira') IS NULL THEN
    RAISE EXCEPTION 'A tabela numeros_lixeira nao foi criada.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.numeros_lixeira'::REGCLASS) THEN
    RAISE EXCEPTION 'A RLS de numeros_lixeira esta desligada.';
  END IF;

  IF to_regprocedure('public.fn_numeros_excluir(uuid)') IS NULL
     OR to_regprocedure('public.fn_numeros_excluir_celular(uuid)') IS NULL
     OR to_regprocedure('public.fn_numeros_restaurar(uuid)') IS NULL
     OR to_regprocedure('public.fn_numeros_lixeira_excluir_definitivo(uuid)') IS NULL
     OR to_regprocedure('public.fn_numeros_lixeira_esvaziar(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Alguma RPC da lixeira nao foi criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.numeros_movimentacoes'::REGCLASS
       AND conname = 'numeros_movimentacoes_tipo_check'
       AND pg_get_constraintdef(oid) LIKE '%restaurado_da_lixeira%'
  ) THEN
    RAISE EXCEPTION 'Os tipos da lixeira nao entraram no CHECK da trilha.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'numeros_lixeira_esvaziar'
  ) THEN
    RAISE EXCEPTION 'numeros_lixeira_esvaziar ausente do catalogo.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fn_permissoes_catalogo() GROUP BY chave HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'O catalogo ficou com chave repetida.';
  END IF;
END
$prova$;

COMMIT;
