-- ============================================================================
-- Modo TV 2.0 — fase 3: roleta, bingo e sorteio de verdade
-- ============================================================================
--
-- O que existia era um esboço. `fn_tv_sorteio_girar` escolhia um nome, gravava
-- e RECUSAVA girar de novo — roleta que gira uma vez não é roleta. O bingo não
-- tinha rodada, então não guardava partida. E sortear pessoa sem id nem foto
-- não dá para desenhar na parede, porque o palco é anônimo e não consegue ir
-- buscar o rosto depois.
--
-- ## O que muda
--
-- 1. `config` na tabela: comportamento e estética de cada jogo, sem coluna nova
--    por ideia nova. Roleta: `remover_ao_sair`, `layout`. Bingo: `ate`.
--
-- 2. `tipo` ganha `'sorteio'`. Sortear PESSOA é outra coisa de girar uma roda de
--    itens escritos à mão, e misturar os dois foi o que deixou a roleta sem
--    lista própria e o sorteio sem foto.
--
-- 3. `resultado` passa a guardar HISTÓRICO. Cada giro entra na lista, com o que
--    saiu e quando. Era um campo `vencedor` único, sobrescrito a cada giro — a
--    pergunta «quem já saiu?» aparece toda vez, e ninguém anota.
--
-- 4. Girar quantas vezes quiser, sorteando entre os que FALTAM quando a opção de
--    remover está ligada.
--
-- ## O sorteio é do servidor, e isso não é preciosismo
--
-- Todas as funções aqui escolhem com `random()` do Postgres e gravam. O cliente
-- só anima até o resultado que já existe. Sorteio decidido no navegador é
-- sorteio escolhido por quem abre o console — e, como o palco é anônimo e a
-- mesa é autenticada, os dois precisam chegar ao MESMO resultado. Só há uma
-- forma de garantir isso: ele já existir quando os dois leem.
--
-- Nenhuma delas sorteia por tentativa-e-erro. Escolher entre os que faltam é
-- uma consulta; tentar até cair num inédito fica cada vez mais lento conforme a
-- lista esvazia, e no último item poderia rodar por muito tempo.
-- ============================================================================

ALTER TABLE public.tv_sorteios
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.tv_sorteios DROP CONSTRAINT IF EXISTS tv_sorteios_tipo;
ALTER TABLE public.tv_sorteios ADD CONSTRAINT tv_sorteios_tipo
  CHECK (tipo = ANY (ARRAY['roleta'::TEXT, 'bingo'::TEXT, 'sorteio'::TEXT]));

COMMENT ON COLUMN public.tv_sorteios.config IS
  'Comportamento e estetica do jogo. roleta: {remover_ao_sair, layout}. '
  'bingo: {ate}. sorteio: {remover_ao_sair}. Fica em jsonb para que um ajuste '
  'novo de aparencia nao vire coluna nova.';

COMMENT ON COLUMN public.tv_sorteios.resultado IS
  'roleta/sorteio: {historico: [{item, indice, em}], ultimo}. '
  'bingo: {numeros: [n], rodada, bingo: {quem, em}}.';

-- ── Criar ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_tv_sorteio_criar(
  p_setor_id UUID, p_tipo TEXT, p_titulo TEXT,
  p_participantes JSONB DEFAULT NULL::JSONB,
  p_config JSONB DEFAULT '{}'::JSONB
)
RETURNS public.tv_sorteios
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_empresa UUID;
  v_lista   JSONB;
  v_tipo    TEXT := CASE WHEN p_tipo IN ('bingo','sorteio','roleta') THEN p_tipo ELSE 'roleta' END;
  v_saida   public.tv_sorteios;
BEGIN
  IF NOT public.fn_user_tem('tv_cortar') THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO: abrir sorteio muda o que esta na parede.'
      USING errcode = '42501';
  END IF;

  SELECT s.empresa_id INTO v_empresa FROM public.setores s WHERE s.id = p_setor_id;
  IF v_empresa IS NULL OR NOT public.fn_can_access_empresa(v_empresa) THEN
    RAISE EXCEPTION 'TV_SETOR: setor fora do seu acesso.' USING errcode = '42501';
  END IF;

  IF p_participantes IS NOT NULL AND jsonb_array_length(p_participantes) > 0 THEN
    v_lista := p_participantes;

  ELSIF v_tipo = 'sorteio' THEN
    /*
     * Sortear PESSOA precisa de id, nome e foto: a parede mostra o rosto, e um
     * nome solto obrigaria o palco anonimo a ir buscar a foto depois — o que
     * ele nao pode, porque nao tem sessao.
     *
     * So gente ativa: sortear quem saiu da empresa e o tipo de constrangimento
     * que acontece na frente de todo mundo.
     */
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', q.id, 'nome', q.nome, 'foto_url', q.foto_url) ORDER BY q.nome),
           '[]'::JSONB) INTO v_lista
      FROM (
        SELECT p.id, COALESCE(NULLIF(trim(p.nome), ''), p.email) AS nome, p.foto_url
          FROM public.perfis p
         WHERE p.setor_id = p_setor_id
           AND p.empresa_id = v_empresa
           AND COALESCE(p.ativo, TRUE)
      ) q;

  ELSIF v_tipo = 'bingo' THEN
    v_lista := '[]'::JSONB;   -- bingo nao tem participante: tem numero

  ELSE
    -- Roleta sem lista nasce com o setor, que e o caso comum e poupa digitar.
    SELECT COALESCE(jsonb_agg(nome ORDER BY nome), '[]'::JSONB) INTO v_lista
      FROM (
        SELECT COALESCE(NULLIF(trim(p.nome), ''), p.email) AS nome
          FROM public.perfis p
         WHERE p.setor_id = p_setor_id
           AND p.empresa_id = v_empresa
           AND COALESCE(p.ativo, TRUE)
      ) q;
  END IF;

  IF v_tipo <> 'bingo' AND jsonb_array_length(v_lista) = 0 THEN
    RAISE EXCEPTION 'TV_SORTEIO_VAZIO: nao ha ninguem para sortear neste setor.'
      USING errcode = 'check_violation';
  END IF;

  INSERT INTO public.tv_sorteios (
    empresa_id, setor_id, tipo, titulo, participantes, config, resultado, criado_por
  ) VALUES (
    v_empresa, p_setor_id, v_tipo,
    COALESCE(NULLIF(trim(p_titulo), ''), 'Sorteio'),
    v_lista, COALESCE(p_config, '{}'::JSONB),
    CASE WHEN v_tipo = 'bingo'
         THEN jsonb_build_object('numeros', '[]'::JSONB, 'rodada', 1)
         ELSE jsonb_build_object('historico', '[]'::JSONB) END,
    auth.uid()
  )
  RETURNING * INTO v_saida;

  RETURN v_saida;
END;
$function$;

-- ── Girar (roleta e sorteio de pessoa) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_tv_sorteio_girar(p_sorteio_id UUID)
RETURNS public.tv_sorteios
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_s          public.tv_sorteios;
  v_historico  JSONB;
  v_saidos     JSONB;
  v_candidatos JSONB := '[]'::JSONB;
  v_indice     INT;
  v_item       JSONB;
  v_quem       TEXT;
  v_i          INT;
  v_remover    BOOLEAN;
BEGIN
  IF NOT public.fn_user_tem('tv_cortar') THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO: girar muda o que esta na parede.'
      USING errcode = '42501';
  END IF;

  SELECT * INTO v_s FROM public.tv_sorteios WHERE id = p_sorteio_id;
  IF v_s.id IS NULL OR NOT public.fn_can_access_empresa(v_s.empresa_id) THEN
    RAISE EXCEPTION 'TV_SORTEIO: sorteio fora do seu acesso.' USING errcode = '42501';
  END IF;

  IF v_s.tipo = 'bingo' THEN
    RAISE EXCEPTION 'TV_SORTEIO_TIPO: bingo sorteia numero, use fn_tv_bingo_sortear.'
      USING errcode = 'check_violation';
  END IF;

  v_historico := COALESCE(v_s.resultado -> 'historico', '[]'::JSONB);
  v_remover   := COALESCE((v_s.config ->> 'remover_ao_sair')::BOOLEAN, FALSE);

  -- Os indices que ja sairam, quando a opcao de remover esta ligada.
  SELECT COALESCE(jsonb_agg(h -> 'indice'), '[]'::JSONB) INTO v_saidos
    FROM jsonb_array_elements(v_historico) h;

  /*
   * Sorteia entre os que FALTAM, e nao por tentativa-e-erro ate cair num
   * inedito: com a lista quase esgotada, a tentativa roda muitas vezes, e no
   * ultimo item poderia rodar por muito tempo.
   */
  FOR v_i IN 0 .. jsonb_array_length(v_s.participantes) - 1 LOOP
    IF NOT v_remover OR NOT (v_saidos @> to_jsonb(v_i)) THEN
      v_candidatos := v_candidatos || jsonb_build_array(v_i);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_candidatos) = 0 THEN
    RAISE EXCEPTION 'TV_SORTEIO_FIM: todos os itens ja sairam. Reinicie para girar de novo.'
      USING errcode = 'check_violation';
  END IF;

  -- `random()` do Postgres, no SERVIDOR. No cliente, qualquer um com o
  -- console aberto escolheria o vencedor.
  v_indice := (v_candidatos ->> floor(random() * jsonb_array_length(v_candidatos))::INT)::INT;
  v_item   := v_s.participantes -> v_indice;

  SELECT COALESCE(NULLIF(trim(p.nome), ''), p.email) INTO v_quem
    FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.tv_sorteios
     SET resultado = jsonb_build_object(
           'historico', v_historico || jsonb_build_array(jsonb_build_object(
             'item', v_item, 'indice', v_indice, 'em', now())),
           'ultimo', jsonb_build_object('item', v_item, 'indice', v_indice, 'em', now())),
         -- `girando`: e o palco que decide quando a animacao acabou. O estado
         -- so vira `encerrado` quando alguem fecha o jogo.
         estado    = 'girando',
         girado_em = now(),
         girado_por = auth.uid(),
         girado_por_nome = v_quem
   WHERE id = p_sorteio_id
  RETURNING * INTO v_s;

  RETURN v_s;
END;
$function$;

-- ── Bingo: sortear numero ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_tv_bingo_sortear(p_sorteio_id UUID, p_ate INT DEFAULT 75)
RETURNS public.tv_sorteios
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_s      public.tv_sorteios;
  v_saidos INT[];
  v_novo   INT;
  v_teto   INT;
BEGIN
  IF NOT public.fn_user_tem('tv_cortar') THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO: sortear muda o que esta na parede.'
      USING errcode = '42501';
  END IF;

  SELECT * INTO v_s FROM public.tv_sorteios WHERE id = p_sorteio_id;
  IF v_s.id IS NULL OR NOT public.fn_can_access_empresa(v_s.empresa_id) THEN
    RAISE EXCEPTION 'TV_SORTEIO: sorteio fora do seu acesso.' USING errcode = '42501';
  END IF;

  IF v_s.tipo <> 'bingo' THEN
    RAISE EXCEPTION 'TV_SORTEIO_TIPO: este jogo nao e bingo.'
      USING errcode = 'check_violation';
  END IF;

  -- O teto vem da config do jogo; o argumento e so o padrao de quem nao guardou.
  v_teto := GREATEST(10, LEAST(99, COALESCE(
    (v_s.config ->> 'ate')::INT, p_ate, 75)));

  SELECT COALESCE(array_agg(x::INT), ARRAY[]::INT[]) INTO v_saidos
    FROM jsonb_array_elements_text(COALESCE(v_s.resultado -> 'numeros', '[]'::JSONB)) x;

  IF COALESCE(array_length(v_saidos, 1), 0) >= v_teto THEN
    RAISE EXCEPTION 'TV_BINGO_FIM: todos os numeros ja sairam. Comece outra rodada.'
      USING errcode = 'check_violation';
  END IF;

  SELECT n INTO v_novo
    FROM generate_series(1, v_teto) n
   WHERE NOT (n = ANY (v_saidos))
   ORDER BY random()
   LIMIT 1;

  UPDATE public.tv_sorteios
     SET resultado = COALESCE(v_s.resultado, '{}'::JSONB)
                     || jsonb_build_object(
                          'numeros', COALESCE(v_s.resultado -> 'numeros', '[]'::JSONB)
                                     || to_jsonb(v_novo),
                          'ultimo', v_novo,
                          'rodada', COALESCE((v_s.resultado ->> 'rodada')::INT, 1)),
         estado    = 'girando',
         girado_em = now(),
         girado_por = auth.uid()
   WHERE id = p_sorteio_id
  RETURNING * INTO v_s;

  RETURN v_s;
END;
$function$;

-- ── Bingo: alguem bateu ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_tv_bingo_encerrar(p_sorteio_id UUID, p_vencedor TEXT)
RETURNS public.tv_sorteios
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_s public.tv_sorteios;
BEGIN
  IF NOT public.fn_user_tem('tv_cortar') THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO: anunciar bingo muda o que esta na parede.'
      USING errcode = '42501';
  END IF;

  SELECT * INTO v_s FROM public.tv_sorteios WHERE id = p_sorteio_id;
  IF v_s.id IS NULL OR NOT public.fn_can_access_empresa(v_s.empresa_id) THEN
    RAISE EXCEPTION 'TV_SORTEIO: sorteio fora do seu acesso.' USING errcode = '42501';
  END IF;

  UPDATE public.tv_sorteios
     SET resultado = COALESCE(v_s.resultado, '{}'::JSONB) || jsonb_build_object(
           'bingo', jsonb_build_object(
             'quem', COALESCE(NULLIF(trim(p_vencedor), ''), 'Alguem'),
             'em', now())),
         estado    = 'encerrado',
         girado_em = now()
   WHERE id = p_sorteio_id
  RETURNING * INTO v_s;

  RETURN v_s;
END;
$function$;

-- ── Reiniciar: nova rodada, sem apagar o jogo ───────────────────────────────
--
-- Apagar e criar de novo perderia o titulo e a configuracao — e a pessoa
-- refaria a lista de trinta nomes.
CREATE OR REPLACE FUNCTION public.fn_tv_sorteio_reiniciar(p_sorteio_id UUID)
RETURNS public.tv_sorteios
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_s public.tv_sorteios;
BEGIN
  IF NOT public.fn_user_tem('tv_cortar') THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO: reiniciar muda o que esta na parede.'
      USING errcode = '42501';
  END IF;

  SELECT * INTO v_s FROM public.tv_sorteios WHERE id = p_sorteio_id;
  IF v_s.id IS NULL OR NOT public.fn_can_access_empresa(v_s.empresa_id) THEN
    RAISE EXCEPTION 'TV_SORTEIO: sorteio fora do seu acesso.' USING errcode = '42501';
  END IF;

  UPDATE public.tv_sorteios
     SET resultado = CASE WHEN v_s.tipo = 'bingo'
                          THEN jsonb_build_object(
                                 'numeros', '[]'::JSONB,
                                 'rodada', COALESCE((v_s.resultado ->> 'rodada')::INT, 1) + 1)
                          ELSE jsonb_build_object('historico', '[]'::JSONB) END,
         estado    = 'aberto',
         girado_em = NULL
   WHERE id = p_sorteio_id
  RETURNING * INTO v_s;

  RETURN v_s;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_sorteio_criar(UUID, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_tv_bingo_encerrar(UUID, TEXT)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_tv_sorteio_reiniciar(UUID)      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_sorteio_criar(UUID, TEXT, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tv_bingo_encerrar(UUID, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tv_sorteio_reiniciar(UUID)      TO authenticated;
