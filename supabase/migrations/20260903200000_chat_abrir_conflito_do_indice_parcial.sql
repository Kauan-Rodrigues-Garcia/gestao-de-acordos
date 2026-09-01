-- ============================================================================
-- Chat: abrir conversa volta a funcionar (ON CONFLICT x indice parcial)
-- ============================================================================
--
-- ## O defeito, exatamente
--
--   POST /rest/v1/rpc/fn_chat_abrir 400
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- Iniciar QUALQUER conversa nova estava quebrado. Nao era permissao, nao era
-- alcance: a RPC morria no INSERT, antes de qualquer regra de negocio.
--
-- ## Por que quebrou
--
-- `20260901120000_chat_grupos_e_monitor` transformou o indice de unicidade do
-- par em um indice PARCIAL, e com razao — dois grupos com as mesmas pessoas sao
-- dois grupos, e a linha de grupo tem `par_menor`/`par_maior` nulos:
--
--   DROP INDEX ux_chat_conversa_par;
--   CREATE UNIQUE INDEX ux_chat_conversa_par
--     ON chat_conversas (empresa_id, par_menor, par_maior)
--     WHERE tipo = 'direta';                     -- <<< a novidade
--
-- O que nao acompanhou foram as duas RPCs que inserem par. O Postgres so
-- INFERE um indice parcial quando o `ON CONFLICT` repete o predicado dele; sem
-- o `WHERE`, ele procura um indice total sobre as tres colunas, nao acha, e
-- levanta o erro acima. A migration dos grupos foi aplicada, as funcoes
-- ficaram como estavam, e o chat parou de abrir conversa no mesmo instante.
--
-- ## O que muda aqui
--
-- Duas funcoes, uma linha cada:
--
--   fn_chat_abrir     ON CONFLICT (...) WHERE tipo = 'direta' DO NOTHING
--   fn_chat_disparar  idem
--
-- E, junto, o `tipo = 'direta'` nas buscas do par. Elas ja nao casavam linha de
-- grupo (o par de um grupo e NULL, e NULL nao casa igualdade), entao isso nao
-- muda resultado — muda o plano: com o predicado escrito, a busca usa o indice
-- parcial em vez de varrer.
--
-- Nenhuma regra de acesso e tocada. `fn_chat_alcanca` continua decidindo com
-- quem se pode INICIAR, e responder continua nao dependendo de alcance.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── Guarda: o indice tem que ser o parcial que motivou esta correcao ────────
-- Se um dia alguem devolver o indice total, este bloco avisa que o `WHERE`
-- abaixo virou ruido — e nao quebra nada, porque `ON CONFLICT ... WHERE` casa
-- indice parcial e so ele.
DO $guarda$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index ix
     WHERE ix.indexrelid = 'public.ux_chat_conversa_par'::regclass
       AND ix.indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'ux_chat_conversa_par nao e mais parcial. Revise esta migration antes de '
      'aplicar: o ON CONFLICT ... WHERE tipo = ''direta'' deixaria de casar.';
  END IF;
END
$guarda$;

-- ── Abrir (ou reabrir) uma conversa ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chat_abrir(p_alvo UUID)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eu        UUID := (SELECT auth.uid());
  v_empresa   UUID;
  v_menor     UUID;
  v_maior     UUID;
  v_conversa  UUID;
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'sem_sessao'; END IF;

  SELECT c.id INTO v_conversa
    FROM public.chat_conversas c
   WHERE c.tipo = 'direta'
     AND (v_eu, p_alvo) IN ((c.par_menor, c.par_maior), (c.par_maior, c.par_menor));

  -- Conversa que ja existe eu reabro sempre: responder nao depende de alcance.
  IF v_conversa IS NULL AND NOT public.fn_chat_alcanca(p_alvo) THEN
    RAISE EXCEPTION 'fora_do_alcance';
  END IF;

  IF v_conversa IS NULL THEN
    SELECT p.empresa_id INTO v_empresa FROM public.perfis p WHERE p.id = v_eu;
    v_menor := LEAST(v_eu, p_alvo);
    v_maior := GREATEST(v_eu, p_alvo);

    -- O `WHERE tipo = 'direta'` repete o predicado de `ux_chat_conversa_par`.
    -- Sem ele o Postgres nao infere o indice parcial e recusa o comando.
    INSERT INTO public.chat_conversas (empresa_id, par_menor, par_maior)
    VALUES (v_empresa, v_menor, v_maior)
    ON CONFLICT (empresa_id, par_menor, par_maior) WHERE tipo = 'direta' DO NOTHING
    RETURNING id INTO v_conversa;

    IF v_conversa IS NULL THEN     -- perdi a corrida; pego a que o outro criou
      SELECT c.id INTO v_conversa FROM public.chat_conversas c
       WHERE c.tipo = 'direta' AND c.empresa_id = v_empresa
         AND c.par_menor = v_menor AND c.par_maior = v_maior;
    END IF;

    INSERT INTO public.chat_participantes (conversa_id, perfil_id)
    VALUES (v_conversa, v_menor), (v_conversa, v_maior)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Reabrir para MIM. O outro lado so volta quando eu escrever de fato.
  UPDATE public.chat_participantes
     SET apagada_em = NULL
   WHERE conversa_id = v_conversa AND perfil_id = v_eu;

  RETURN v_conversa;
END;
$$;

REVOKE ALL     ON FUNCTION public.fn_chat_abrir(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_chat_abrir(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_abrir(UUID) IS
  'Abre ou reabre a conversa direta com uma pessoa. O ON CONFLICT repete o '
  'predicado do indice parcial ux_chat_conversa_par (tipo = direta) — sem isso '
  'o Postgres nao infere o indice e recusa o INSERT.';

-- ── Disparo em massa ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chat_disparar(
  p_destinos UUID[], p_texto TEXT, p_anexos JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_eu       UUID := (SELECT auth.uid());
  v_empresa  UUID;
  v_disparo  UUID;
  v_alvo     UUID;
  v_conversa UUID;
  v_menor    UUID;
  v_maior    UUID;
  v_aparecia BOOLEAN;
  v_msg      UUID;
  v_enviados INTEGER := 0;
  v_pulados  UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'sem_sessao'; END IF;
  IF NOT public.fn_chat_pode_usar() THEN RAISE EXCEPTION 'sem_chat'; END IF;

  IF COALESCE(TRIM(p_texto), '') = ''
     AND jsonb_array_length(COALESCE(p_anexos, '[]'::JSONB)) = 0 THEN
    RAISE EXCEPTION 'mensagem_vazia';
  END IF;

  SELECT p.empresa_id INTO v_empresa
    FROM public.perfis p
   WHERE p.id = v_eu;

  INSERT INTO public.chat_disparos (empresa_id, autor_id, texto, anexos)
  VALUES (v_empresa, v_eu, NULLIF(TRIM(p_texto), ''),
          COALESCE(p_anexos, '[]'::JSONB))
  RETURNING id INTO v_disparo;

  FOREACH v_alvo IN ARRAY COALESCE(p_destinos, ARRAY[]::UUID[]) LOOP
    CONTINUE WHEN v_alvo IS NULL OR v_alvo = v_eu;

    -- Inclui conversa existente: disparo e uma NOVA iniciativa em massa e
    -- precisa obedecer ao painel atual. Resposta 1:1 continua fora desta RPC.
    IF NOT public.fn_chat_alcanca(v_alvo) THEN
      v_pulados := v_pulados || v_alvo;
      CONTINUE;
    END IF;

    -- Mesmo com conversa aberta, quem perdeu o chat nao recebe.
    IF NOT public.fn_chat_pode_usar(v_alvo) THEN
      v_pulados := v_pulados || v_alvo;
      CONTINUE;
    END IF;

    v_menor := LEAST(v_eu, v_alvo);
    v_maior := GREATEST(v_eu, v_alvo);

    SELECT c.id INTO v_conversa
      FROM public.chat_conversas c
     WHERE c.tipo = 'direta'
       AND c.empresa_id = v_empresa
       AND c.par_menor = v_menor
       AND c.par_maior = v_maior;

    IF v_conversa IS NULL THEN
      INSERT INTO public.chat_conversas (empresa_id, par_menor, par_maior)
      VALUES (v_empresa, v_menor, v_maior)
      ON CONFLICT (empresa_id, par_menor, par_maior) WHERE tipo = 'direta' DO NOTHING
      RETURNING id INTO v_conversa;

      IF v_conversa IS NULL THEN
        SELECT c.id INTO v_conversa
          FROM public.chat_conversas c
         WHERE c.tipo = 'direta'
           AND c.empresa_id = v_empresa
           AND c.par_menor = v_menor
           AND c.par_maior = v_maior;
      END IF;

      INSERT INTO public.chat_participantes (conversa_id, perfil_id)
      VALUES (v_conversa, v_menor), (v_conversa, v_maior)
      ON CONFLICT DO NOTHING;
    END IF;

    -- ANTES de escrever: esta conversa ja aparecia na minha lista?
    SELECT (
      pa.apagada_em IS NULL
      AND pa.oculta_em IS NULL
      AND (
        SELECT c.ultima_mensagem_em
          FROM public.chat_conversas c
         WHERE c.id = v_conversa
      ) IS NOT NULL
    )
      INTO v_aparecia
      FROM public.chat_participantes pa
     WHERE pa.conversa_id = v_conversa
       AND pa.perfil_id = v_eu;

    INSERT INTO public.chat_mensagens (
      conversa_id, empresa_id, autor_id, texto, anexos, disparo_id
    )
    VALUES (
      v_conversa, v_empresa, v_eu, NULLIF(TRIM(p_texto), ''),
      COALESCE(p_anexos, '[]'::JSONB), v_disparo
    )
    RETURNING id INTO v_msg;

    -- Nao aparecia: continua nao aparecendo, ate alguem responder.
    IF NOT COALESCE(v_aparecia, FALSE) THEN
      UPDATE public.chat_participantes
         SET oculta_em = NOW()
       WHERE conversa_id = v_conversa
         AND perfil_id = v_eu;
    END IF;

    INSERT INTO public.chat_disparo_destinos (
      disparo_id, perfil_id, conversa_id, mensagem_id
    )
    VALUES (v_disparo, v_alvo, v_conversa, v_msg)
    ON CONFLICT DO NOTHING;

    v_enviados := v_enviados + 1;
  END LOOP;

  UPDATE public.chat_disparos
     SET total_destinos = v_enviados
   WHERE id = v_disparo;

  RETURN jsonb_build_object(
    'disparo_id', v_disparo,
    'enviados', v_enviados,
    'pulados', to_jsonb(v_pulados)
  );
END;
$$;

REVOKE ALL     ON FUNCTION public.fn_chat_disparar(UUID[], TEXT, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_chat_disparar(UUID[], TEXT, JSONB) TO authenticated;

-- ── Prova: nenhuma funcao ficou com o ON CONFLICT sem predicado ─────────────
DO $prova$
DECLARE
  v_resto TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO v_resto
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND pg_get_functiondef(p.oid) ILIKE '%ON CONFLICT (empresa_id, par_menor, par_maior) DO%';

  IF v_resto IS NOT NULL THEN
    RAISE EXCEPTION
      'Ainda ha funcao com ON CONFLICT sem o predicado do indice parcial: %',
      v_resto;
  END IF;
END
$prova$;

COMMIT;
