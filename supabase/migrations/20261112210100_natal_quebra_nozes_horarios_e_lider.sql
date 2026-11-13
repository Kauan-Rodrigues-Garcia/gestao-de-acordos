-- ============================================================================
-- Natal: os quebra-nozes — horário de cada aparição e o boletim de quem mais
-- recebeu até agora
-- ============================================================================
--
-- Pedido do Cleber, 12/11/2026, em cima da 20261112180100.
--
-- ## O horário de cada aparição
--
-- A agenda continua sorteada no navegador (`quebraNozes/agenda.ts`). O que
-- muda: o super_admin pode trocar a hora de uma sessão, uma por uma, na lista
-- do card de Configurações › Geral.
--
--   natal_quebra_nozes.ajustes   {"<dia>:<cidade>:<indice>": <minuto do dia>}
--                                  dia     contado de 1º/11/2026 (o relógio do
--                                          Natal, `EPOCA` em `Natal/musica.ts`)
--                                  indice  0 = a chamada das dez, 1 a 3 = as
--                                          aparições, na ordem das janelas
--                                  minuto  0 a 1439, de Brasília
--
-- Sem a chave, vale o sorteio. Os dias que já passaram saem do mapa a cada
-- ajuste.
--
-- ## O boletim
--
-- Uma das aparições da tarde vira o boletim: os dois dizem quem mais recebeu
-- hoje na cidade até aquela hora, com o cartão da pessoa.
--
--   natal_quebra_nozes.boletim   liga e desliga (sobe DESLIGADO, como o resto;
--                                só aparece com as aparições automáticas
--                                ligadas)
--   chamada_tipo                 passa a aceitar 'boletim' (chamar na hora)
--   natal_quebra_nozes_lider     o resultado, por cidade e por sessão: o
--                                primeiro que pergunta calcula, e a cidade
--                                inteira lê o mesmo nome.
--
-- Quem mais recebeu é o primeiro do dia de hoje na cena «Destaque» do Modo TV
-- (`fn_tv_numeros_calcular`, escopo `setor`) entre os setores da cidade; vale o
-- maior. O valor não sai daqui: só o setor, o nome e a foto. Sem recebimento
-- hoje não há líder, e a sessão vira uma aparição comum.
--
-- Para ninguém fazer o banco calcular à toa, um cálculo por cidade a cada cinco
-- minutos: quem pergunta por outra sessão nesse intervalo leva o mesmo resultado.
--
-- ## Funções (todas para `authenticated`)
--
--   fn_natal_quebra_nozes_configurar(p_automaticas, p_chamada_10h, p_sons, p_boletim)
--                                         só o super_admin; NULL = não mexe.
--                                         Troca a de três parâmetros.
--   fn_natal_quebra_nozes_ajustar_horario(p_dia, p_cidade, p_indice, p_minuto)
--                                         só o super_admin; `p_minuto` NULL
--                                         devolve a sessão ao sorteio.
--   fn_natal_quebra_nozes_chamar(p_tipo, p_cidade)
--                                         agora também 'boletim'.
--   fn_natal_quebra_nozes_lider(p_sessao, p_cidade)
--                                         quem mais recebeu hoje na cidade de
--                                         quem pergunta (`p_cidade` só vale para
--                                         o super_admin, para conferir).
--
-- ## Tudo desligado
--
-- Pedido do Cleber ao lançar (12/11/2026): «quero que venha tudo desativado,
-- aparições e qualquer coisa». A migration desliga as aparições automáticas, a
-- chamada das 10h e o boletim, se algum estiver ligado; quem liga é o
-- super_admin, pelo card. (Os sons ficam como estão: é só a permissão de tocar
-- quando houver espetáculo.)
--
-- Fora isso, nenhuma linha de dado existente muda. Reexecutável (mas desliga de
-- novo o que estiver ligado).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

DO $antes$
BEGIN
  IF to_regclass('public.natal_quebra_nozes') IS NULL THEN
    RAISE EXCEPTION 'natal_quebra_nozes não existe: aplique antes a 20261112180100';
  END IF;
END
$antes$;

-- ── As colunas novas ───────────────────────────────────────────────────────
-- (Coluna nova não dispara o gatilho de aviso, que é de UPDATE.)
ALTER TABLE public.natal_quebra_nozes
  ADD COLUMN IF NOT EXISTS boletim BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ajustes JSONB   NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.natal_quebra_nozes.ajustes IS
  'Horários trocados à mão: {"<dia do Natal>:<cidade>:<indice>": <minuto do dia>}. Ver 20261112210100.';

-- Tudo desligado no lançamento. Só roda o UPDATE se houver algo ligado: o
-- gatilho de aviso é por comando e dispararia mesmo sem mudar linha nenhuma.
-- No máximo 1 linha.
DO $desliga$
BEGIN
  IF EXISTS (SELECT 1 FROM public.natal_quebra_nozes WHERE id = 1 AND (automaticas OR chamada_10h OR boletim)) THEN
    UPDATE public.natal_quebra_nozes
       SET automaticas   = FALSE,
           chamada_10h   = FALSE,
           boletim       = FALSE,
           atualizado_em = now()
     WHERE id = 1;
  END IF;
END
$desliga$;

-- A chamada na hora passa a aceitar o boletim.
DO $tipo$
DECLARE
  v_nome text;
BEGIN
  FOR v_nome IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.natal_quebra_nozes'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%chamada_tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.natal_quebra_nozes DROP CONSTRAINT %I', v_nome);
  END LOOP;
END
$tipo$;

ALTER TABLE public.natal_quebra_nozes
  ADD CONSTRAINT natal_quebra_nozes_chamada_tipo_check
  CHECK (chamada_tipo IN ('aparicao', 'parabens', 'boletim'));

-- ── Os interruptores, agora com o boletim ──────────────────────────────────
-- A de três parâmetros sai: com as duas, o PostgREST não saberia qual chamar.
DROP FUNCTION IF EXISTS public.fn_natal_quebra_nozes_configurar(BOOLEAN, BOOLEAN, BOOLEAN);

CREATE OR REPLACE FUNCTION public.fn_natal_quebra_nozes_configurar(
  p_automaticas BOOLEAN DEFAULT NULL,
  p_chamada_10h BOOLEAN DEFAULT NULL,
  p_sons        BOOLEAN DEFAULT NULL,
  p_boletim     BOOLEAN DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_atual public.natal_quebra_nozes%ROWTYPE;
  v_nome  text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin configura os quebra-nozes' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_atual FROM public.natal_quebra_nozes WHERE id = 1;

  -- Nada mudou: não escreve (o gatilho é por comando e avisaria todo mundo à toa).
  IF COALESCE(p_automaticas, v_atual.automaticas) = v_atual.automaticas
     AND COALESCE(p_chamada_10h, v_atual.chamada_10h) = v_atual.chamada_10h
     AND COALESCE(p_sons, v_atual.sons) = v_atual.sons
     AND COALESCE(p_boletim, v_atual.boletim) = v_atual.boletim THEN
    RETURN;
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.natal_quebra_nozes
     SET automaticas         = COALESCE(p_automaticas, automaticas),
         chamada_10h         = COALESCE(p_chamada_10h, chamada_10h),
         sons                = COALESCE(p_sons, sons),
         boletim             = COALESCE(p_boletim, boletim),
         atualizado_em       = now(),
         atualizado_por_nome = v_nome
   WHERE id = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_quebra_nozes_configurar(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_quebra_nozes_configurar(BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- ── O horário de uma sessão ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_natal_quebra_nozes_ajustar_horario(
  p_dia    INTEGER,
  p_cidade TEXT,
  p_indice INTEGER,
  p_minuto INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- O dia do Natal de hoje: contado da meia-noite de Brasília de 1º/11/2026.
  v_hoje  integer := floor(extract(epoch FROM (now() - TIMESTAMPTZ '2026-11-01 03:00:00+00')) / 86400)::integer;
  v_chave text;
  v_atual jsonb;
  v_novo  jsonb;
  v_nome  text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin muda o horário dos quebra-nozes' USING ERRCODE = '42501';
  END IF;
  IF p_dia IS NULL OR p_dia < v_hoje OR p_dia > v_hoje + 7 THEN
    RAISE EXCEPTION 'DIA_INVALIDO: %', p_dia USING ERRCODE = '22023';
  END IF;
  IF p_cidade IS NULL OR p_cidade NOT IN ('birigui', 'marilia') THEN
    RAISE EXCEPTION 'CIDADE_INVALIDA: %', p_cidade USING ERRCODE = '22023';
  END IF;
  IF p_indice IS NULL OR p_indice < 0 OR p_indice > 3 THEN
    RAISE EXCEPTION 'INDICE_INVALIDO: %', p_indice USING ERRCODE = '22023';
  END IF;
  IF p_minuto IS NOT NULL AND (p_minuto < 0 OR p_minuto > 1439) THEN
    RAISE EXCEPTION 'MINUTO_INVALIDO: %', p_minuto USING ERRCODE = '22023';
  END IF;

  v_chave := p_dia::text || ':' || p_cidade || ':' || p_indice::text;

  SELECT q.ajustes INTO v_atual FROM public.natal_quebra_nozes q WHERE q.id = 1 FOR UPDATE;
  v_atual := COALESCE(v_atual, '{}'::jsonb);

  -- Fica o que é de hoje em diante, menos a chave que está sendo mexida.
  SELECT COALESCE(jsonb_object_agg(a.key, a.value), '{}'::jsonb) INTO v_novo
    FROM jsonb_each(v_atual) AS a
   WHERE split_part(a.key, ':', 1) ~ '^\d{1,6}$'
     AND split_part(a.key, ':', 1)::integer >= v_hoje
     AND a.key <> v_chave;

  IF p_minuto IS NOT NULL THEN
    v_novo := v_novo || jsonb_build_object(v_chave, p_minuto);
  END IF;

  -- Nada mudou: não escreve (o gatilho avisaria todo mundo à toa).
  IF v_novo = v_atual THEN
    RETURN v_novo;
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.natal_quebra_nozes
     SET ajustes             = v_novo,
         atualizado_em       = now(),
         atualizado_por_nome = v_nome
   WHERE id = 1;
  RETURN v_novo;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_quebra_nozes_ajustar_horario(INTEGER, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_quebra_nozes_ajustar_horario(INTEGER, TEXT, INTEGER, INTEGER) TO authenticated;

-- ── A chamada na hora, agora também o boletim ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_natal_quebra_nozes_chamar(p_tipo TEXT, p_cidade TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ultima timestamptz;
  v_em     timestamptz := now() + INTERVAL '15 seconds';
  v_nome   text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin chama os quebra-nozes' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('aparicao', 'parabens', 'boletim') THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: %', p_tipo USING ERRCODE = '22023';
  END IF;
  IF p_cidade IS NULL OR p_cidade NOT IN ('birigui', 'marilia', 'todas') THEN
    RAISE EXCEPTION 'CIDADE_INVALIDA: %', p_cidade USING ERRCODE = '22023';
  END IF;

  SELECT q.chamada_em INTO v_ultima FROM public.natal_quebra_nozes q WHERE q.id = 1;
  IF v_ultima IS NOT NULL AND v_ultima > now() - INTERVAL '90 seconds' THEN
    RAISE EXCEPTION 'JA_TEM_CHAMADA: espere a chamada anterior terminar' USING ERRCODE = '55000';
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.natal_quebra_nozes
     SET chamada_em          = v_em,
         chamada_tipo        = p_tipo,
         chamada_cidade      = p_cidade,
         chamada_numero      = chamada_numero + 1,
         atualizado_em       = now(),
         atualizado_por_nome = v_nome
   WHERE id = 1;
  RETURN v_em;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_quebra_nozes_chamar(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_quebra_nozes_chamar(TEXT, TEXT) TO authenticated;

-- ── Quem mais recebeu até agora ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.natal_quebra_nozes_lider (
  cidade       TEXT NOT NULL CHECK (cidade IN ('birigui', 'marilia')),
  -- A chave da sessão (`Sessao.chave`, em agenda.ts): quem assiste à mesma sessão lê a mesma linha.
  sessao       TEXT NOT NULL,
  dia          DATE NOT NULL,
  -- {setor_id, setor, nome, foto}; NULL = ninguém recebeu hoje ainda.
  dados        JSONB,
  calculado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cidade, sessao)
);

COMMENT ON TABLE public.natal_quebra_nozes_lider IS
  'Quem mais recebeu hoje na cidade, por sessão dos quebra-nozes, calculado por fn_natal_quebra_nozes_lider. Ver 20261112210100.';

ALTER TABLE public.natal_quebra_nozes_lider ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.natal_quebra_nozes_lider FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.natal_quebra_nozes_lider TO service_role;

CREATE OR REPLACE FUNCTION public.fn_natal_quebra_nozes_lider(p_sessao TEXT, p_cidade TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
SET statement_timeout TO '45s'
AS $function$
DECLARE
  v_hoje   DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_cidade TEXT;
  v_cache  public.natal_quebra_nozes_lider%ROWTYPE;
  v_setor  RECORD;
  v_pacote JSONB;
  v_item   JSONB;
  v_valor  NUMERIC;
  v_maior  NUMERIC := 0;
  v_lider  JSONB := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_sessao IS NULL OR p_sessao !~ '^[a-z0-9:@_-]{1,80}$' THEN
    RETURN NULL;
  END IF;

  v_cidade := CASE
    WHEN p_cidade IN ('birigui', 'marilia') AND public.fn_user_is_super_admin() THEN p_cidade
    ELSE public.fn_natal_cidade_de(auth.uid())
  END;
  IF v_cidade IS NULL OR v_cidade NOT IN ('birigui', 'marilia') THEN
    RETURN NULL;
  END IF;

  -- Esta sessão já foi calculada: a cidade inteira lê o mesmo nome.
  SELECT * INTO v_cache FROM public.natal_quebra_nozes_lider l
   WHERE l.cidade = v_cidade AND l.sessao = p_sessao;
  IF v_cache.cidade IS NOT NULL THEN
    RETURN jsonb_build_object('pronto', TRUE, 'lider', v_cache.dados);
  END IF;

  -- Outro está calculando agora: quem pergunta tenta de novo daqui a pouco.
  IF NOT pg_try_advisory_xact_lock(hashtext('natal_quebra_nozes_lider:' || v_cidade)) THEN
    RETURN jsonb_build_object('pronto', FALSE);
  END IF;

  SELECT * INTO v_cache FROM public.natal_quebra_nozes_lider l
   WHERE l.cidade = v_cidade AND l.sessao = p_sessao;
  IF v_cache.cidade IS NOT NULL THEN
    RETURN jsonb_build_object('pronto', TRUE, 'lider', v_cache.dados);
  END IF;

  -- Um cálculo por cidade a cada cinco minutos: outra sessão nesse intervalo leva o mesmo resultado.
  SELECT * INTO v_cache FROM public.natal_quebra_nozes_lider l
   WHERE l.cidade = v_cidade AND l.dia = v_hoje AND l.calculado_em > now() - INTERVAL '5 minutes'
   ORDER BY l.calculado_em DESC
   LIMIT 1;
  IF v_cache.cidade IS NOT NULL THEN
    RETURN jsonb_build_object('pronto', TRUE, 'lider', v_cache.dados);
  END IF;

  -- O primeiro de hoje em cada setor da cidade, como a cena «Destaque» do Modo TV; vale o maior.
  FOR v_setor IN
    SELECT s.id, s.nome
      FROM public.setores s
      JOIN public.rh_celulas c ON c.id = s.cidade_id
     WHERE translate(lower(btrim(c.nome)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') = v_cidade
       AND s.excluido_em IS NULL
     ORDER BY s.nome
  LOOP
    BEGIN
      v_pacote := public.fn_tv_numeros_calcular(v_setor.id, NULL);
    EXCEPTION WHEN OTHERS THEN
      -- Um setor que não calcula não derruba o boletim dos outros.
      v_pacote := NULL;
    END;

    v_item := NULL;
    SELECT d.item INTO v_item
      FROM jsonb_array_elements(COALESCE(v_pacote -> 'destaques', '[]'::JSONB)) AS d(item)
     WHERE d.item ->> 'escopo' = 'setor'
       AND d.item ->> 'dia' = v_hoje::TEXT
       AND jsonb_typeof(d.item -> 'valor') = 'number'
       AND NULLIF(btrim(d.item ->> 'nome'), '') IS NOT NULL
     ORDER BY (d.item -> 'valor')::NUMERIC DESC
     LIMIT 1;

    IF v_item IS NOT NULL THEN
      v_valor := (v_item -> 'valor')::NUMERIC;
      IF v_valor > v_maior THEN
        v_maior := v_valor;
        v_lider := jsonb_build_object(
          'setor_id', v_setor.id, 'setor', v_setor.nome,
          'nome', v_item ->> 'nome', 'foto', v_item ->> 'foto');
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.natal_quebra_nozes_lider (cidade, sessao, dia, dados)
  VALUES (v_cidade, p_sessao, v_hoje, v_lider)
  ON CONFLICT (cidade, sessao) DO NOTHING;

  -- O que já passou não serve mais.
  DELETE FROM public.natal_quebra_nozes_lider l WHERE l.calculado_em < now() - INTERVAL '2 days';

  RETURN jsonb_build_object('pronto', TRUE, 'lider', v_lider);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_quebra_nozes_lider(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_quebra_nozes_lider(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_natal_quebra_nozes_lider(TEXT, TEXT) IS
  'Quem mais recebeu hoje (o primeiro do dia no Destaque do Modo TV, o maior entre os setores) na cidade de quem pergunta. '
  'Calcula uma vez por sessão e guarda em natal_quebra_nozes_lider. Ver 20261112210100.';

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'natal_quebra_nozes' AND column_name = 'ajustes') THEN
    RAISE EXCEPTION 'natal_quebra_nozes.ajustes não foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'natal_quebra_nozes' AND column_name = 'boletim') THEN
    RAISE EXCEPTION 'natal_quebra_nozes.boletim não foi criada';
  END IF;
  IF to_regclass('public.natal_quebra_nozes_lider') IS NULL THEN
    RAISE EXCEPTION 'natal_quebra_nozes_lider não foi criada';
  END IF;
  IF to_regprocedure('public.fn_natal_quebra_nozes_configurar(boolean, boolean, boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'a fn_natal_quebra_nozes_configurar de três parâmetros ainda existe';
  END IF;
  IF to_regprocedure('public.fn_natal_quebra_nozes_configurar(boolean, boolean, boolean, boolean)') IS NULL
     OR to_regprocedure('public.fn_natal_quebra_nozes_ajustar_horario(integer, text, integer, integer)') IS NULL
     OR to_regprocedure('public.fn_natal_quebra_nozes_lider(text, text)') IS NULL THEN
    RAISE EXCEPTION 'falta alguma função dos quebra-nozes';
  END IF;
  IF to_regprocedure('public.fn_tv_numeros_calcular(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'fn_tv_numeros_calcular(uuid, uuid) não existe: o boletim depende dela';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.natal_quebra_nozes
     WHERE id = 1 AND NOT automaticas AND NOT chamada_10h AND NOT boletim) THEN
    RAISE EXCEPTION 'os quebra-nozes não ficaram desligados';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.natal_quebra_nozes'::regclass
       AND conname = 'natal_quebra_nozes_chamada_tipo_check'
       AND pg_get_constraintdef(oid) LIKE '%boletim%') THEN
    RAISE EXCEPTION 'chamada_tipo não aceita boletim';
  END IF;
END
$prova$;

COMMIT;
