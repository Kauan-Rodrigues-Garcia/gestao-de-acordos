-- ============================================================================
-- Chat: uma conversa só por par de pessoas, e conversa de super admin privada
-- ============================================================================
--
-- Pedido do Cleber, 28/10/2026. Duas coisas.
--
-- ## 1. A conversa duplicada
--
-- O Cleber e o Kauan (os dois super admins) tinham DUAS conversas diretas, cada
-- uma com uma parte do histórico: uma de 25/08 (empresa pagueplay, 55
-- mensagens) e outra de 04/09 (empresa bookplay, 58). Conferido no banco em
-- 28/10: é o ÚNICO par duplicado.
--
-- A causa: `ux_chat_conversa_par` era único por (empresa_id, par_menor,
-- par_maior). A empresa da conversa é a de quem a abriu, e o chat atravessa
-- empresas desde 20260825230000. Duas pessoas de empresas diferentes podiam
-- ter uma conversa em cada empresa sem o índice reclamar — e o
-- `fn_chat_disparar` ainda procurava a conversa existente SÓ na empresa de quem
-- dispara, então um disparo do lado de lá criava a segunda.
--
-- Agora o par é único sem a empresa. As duplicadas que existirem são juntadas
-- na mais antiga: as mensagens mudam de conversa, o estado de cada pessoa
-- (leitura, entrega, fixada, apagada) fica o mais favorável dos dois, e a
-- duplicada some. Os anexos guardam no caminho o id da conversa antiga; por
-- isso `fn_chat_posso_ler_anexo` passa a achar o anexo também pela mensagem
-- (o mesmo caminho que já servia ao disparo).
--
-- ## 2. Conversa de super admin não é monitorada por ninguém
--
-- Até aqui ninguém monitorava o super admin, mas a conversa dele com um
-- operador continuava legível pelo LADO do operador: o líder do João lia o que
-- o super admin conversou com o João (20260903360000 dizia que era de
-- propósito). O Cleber pediu o contrário: nenhuma conversa que tenha um super
-- admin entre os participantes aparece no Monitor — nem para outro super
-- admin. Quem participa continua lendo, como sempre.
--
-- A trava fica em `fn_chat_monitoro_conversa` (as policies de conversa,
-- participantes e mensagens, e o anexo, passam por ela) e nas duas listas do
-- Monitor. Nenhuma policy é recriada.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1a. Juntar as conversas diretas repetidas ───────────────────────────────
DO $junta$
DECLARE
  r      RECORD;
  v_fica UUID;
  v_sai  UUID;
BEGIN
  FOR r IN
    SELECT c.par_menor, c.par_maior, array_agg(c.id ORDER BY c.criado_em, c.id) AS ids
      FROM public.chat_conversas c
     WHERE c.tipo = 'direta'
     GROUP BY c.par_menor, c.par_maior
    HAVING count(*) > 1
  LOOP
    v_fica := r.ids[1];
    FOREACH v_sai IN ARRAY r.ids[2:array_length(r.ids, 1)] LOOP
      UPDATE public.chat_mensagens m
         SET conversa_id = v_fica, empresa_id = c.empresa_id
        FROM public.chat_conversas c
       WHERE c.id = v_fica AND m.conversa_id = v_sai;

      UPDATE public.chat_disparo_destinos SET conversa_id = v_fica WHERE conversa_id = v_sai;
      UPDATE public.push_chat_fila        SET conversa_id = v_fica WHERE conversa_id = v_sai;

      -- O estado de cada pessoa: o mais favorável das duas conversas.
      INSERT INTO public.chat_participantes (conversa_id, perfil_id)
      SELECT v_fica, s.perfil_id FROM public.chat_participantes s WHERE s.conversa_id = v_sai
      ON CONFLICT DO NOTHING;

      UPDATE public.chat_participantes f
         SET ultima_leitura_em   = GREATEST(f.ultima_leitura_em, s.ultima_leitura_em),
             ultima_entrega_em   = GREATEST(f.ultima_entrega_em, s.ultima_entrega_em),
             ultima_atividade_em = GREATEST(f.ultima_atividade_em, s.ultima_atividade_em),
             fixada_em           = COALESCE(f.fixada_em, s.fixada_em),
             apagada_em = CASE WHEN f.apagada_em IS NULL OR s.apagada_em IS NULL THEN NULL
                               ELSE GREATEST(f.apagada_em, s.apagada_em) END,
             oculta_em  = CASE WHEN f.oculta_em IS NULL OR s.oculta_em IS NULL THEN NULL
                               ELSE GREATEST(f.oculta_em, s.oculta_em) END
        FROM public.chat_participantes s
       WHERE f.conversa_id = v_fica AND s.conversa_id = v_sai AND s.perfil_id = f.perfil_id;

      UPDATE public.chat_conversas f
         SET ultima_mensagem_em = GREATEST(f.ultima_mensagem_em, s.ultima_mensagem_em)
        FROM public.chat_conversas s
       WHERE f.id = v_fica AND s.id = v_sai;

      DELETE FROM public.chat_conversas WHERE id = v_sai;
      RAISE NOTICE 'conversa % juntada em %', v_sai, v_fica;
    END LOOP;
  END LOOP;
END
$junta$;

-- ── 1b. O par é único sem a empresa ─────────────────────────────────────────
DROP INDEX IF EXISTS public.ux_chat_conversa_par;
CREATE UNIQUE INDEX ux_chat_conversa_par
  ON public.chat_conversas (par_menor, par_maior)
  WHERE tipo = 'direta';

COMMENT ON INDEX public.ux_chat_conversa_par IS
  'Uma conversa direta por par de pessoas, em qualquer empresa (20261028140000). '
  'Com empresa_id no indice, o par de empresas diferentes ganhava duas.';

-- ── 1c. Abrir: o ON CONFLICT acompanha o índice novo ────────────────────────
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

  v_menor := LEAST(v_eu, p_alvo);
  v_maior := GREATEST(v_eu, p_alvo);

  SELECT c.id INTO v_conversa
    FROM public.chat_conversas c
   WHERE c.tipo = 'direta' AND c.par_menor = v_menor AND c.par_maior = v_maior;

  -- Conversa que ja existe eu reabro sempre: responder nao depende de alcance.
  IF v_conversa IS NULL AND NOT public.fn_chat_alcanca(p_alvo) THEN
    RAISE EXCEPTION 'fora_do_alcance';
  END IF;

  IF v_conversa IS NULL THEN
    SELECT p.empresa_id INTO v_empresa FROM public.perfis p WHERE p.id = v_eu;

    -- O par e unico em qualquer empresa (20261028140000). O `WHERE` repete o
    -- predicado do indice parcial: sem ele o Postgres nao o infere.
    INSERT INTO public.chat_conversas (empresa_id, par_menor, par_maior)
    VALUES (v_empresa, v_menor, v_maior)
    ON CONFLICT (par_menor, par_maior) WHERE tipo = 'direta' DO NOTHING
    RETURNING id INTO v_conversa;

    IF v_conversa IS NULL THEN     -- perdi a corrida; pego a que o outro criou
      SELECT c.id INTO v_conversa FROM public.chat_conversas c
       WHERE c.tipo = 'direta' AND c.par_menor = v_menor AND c.par_maior = v_maior;
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
  'Abre ou reabre a conversa direta com uma pessoa. O par e unico em qualquer '
  'empresa (ux_chat_conversa_par, 20261028140000).';

-- ── 1d. Disparo: acha a conversa do par em qualquer empresa ─────────────────
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

    -- Sem a empresa (20261028140000): era o filtro que fazia o disparo de um
    -- lado criar a segunda conversa do par.
    SELECT c.id INTO v_conversa
      FROM public.chat_conversas c
     WHERE c.tipo = 'direta'
       AND c.par_menor = v_menor
       AND c.par_maior = v_maior;

    IF v_conversa IS NULL THEN
      INSERT INTO public.chat_conversas (empresa_id, par_menor, par_maior)
      VALUES (v_empresa, v_menor, v_maior)
      ON CONFLICT (par_menor, par_maior) WHERE tipo = 'direta' DO NOTHING
      RETURNING id INTO v_conversa;

      IF v_conversa IS NULL THEN
        SELECT c.id INTO v_conversa
          FROM public.chat_conversas c
         WHERE c.tipo = 'direta'
           AND c.par_menor = v_menor
           AND c.par_maior = v_maior;
      END IF;

      INSERT INTO public.chat_participantes (conversa_id, perfil_id)
      VALUES (v_conversa, v_menor), (v_conversa, v_maior)
      ON CONFLICT DO NOTHING;
    END IF;

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

-- ── 2a. Monitorar: conversa com super admin fica de fora ────────────────────
-- A checagem barata continua primeiro (`fn_user_tem` corta a maioria): esta
-- funcao e reavaliada pelo Realtime linha a linha.
CREATE OR REPLACE FUNCTION public.fn_chat_monitoro_conversa(p_conversa UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_user_tem('chat_monitor')
     AND EXISTS (
       SELECT 1 FROM public.chat_participantes p
        WHERE p.conversa_id = p_conversa
          AND public.fn_chat_posso_monitorar(p.perfil_id)
     )
     -- Conversa que tem super admin nao e monitorada por ninguem (20261028140000).
     AND NOT EXISTS (
       SELECT 1 FROM public.chat_participantes p
         JOIN public.perfis pe ON pe.id = p.perfil_id
        WHERE p.conversa_id = p_conversa
          AND pe.perfil = 'super_admin'
     );
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_monitoro_conversa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_monitoro_conversa(UUID) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.fn_chat_monitoro_conversa(UUID) IS
  'Leio esta conversa como monitor? Algum participante monitoravel E nenhum '
  'participante super admin (20261028140000): conversa de super admin e privada.';

-- ── 2b. A lista de conversas de uma pessoa, no Monitor ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_chat_monitor_conversas(p_alvo UUID)
RETURNS TABLE (
  id                 UUID,
  outro_id           UUID,
  outro_nome         TEXT,
  outro_foto         TEXT,
  outro_perfil       TEXT,
  tipo               TEXT,
  participantes      INTEGER,
  ultima_mensagem_em TIMESTAMPTZ,
  ultimo_texto       TEXT,
  ultimo_anexos      JSONB,
  ultimo_autor_id    UUID
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH dele AS (
    SELECT c.id, c.tipo, c.nome, c.foto_url, c.ultima_mensagem_em,
           CASE WHEN c.tipo = 'direta'
                THEN CASE WHEN c.par_menor = p_alvo THEN c.par_maior ELSE c.par_menor END
           END AS outro
      FROM public.chat_participantes p
      JOIN public.chat_conversas c ON c.id = p.conversa_id
     WHERE p.perfil_id = p_alvo
       AND p.saiu_em IS NULL
       AND c.ultima_mensagem_em IS NOT NULL
       AND public.fn_chat_posso_monitorar(p_alvo)
       -- A conversa com super admin nao entra (20261028140000).
       AND NOT EXISTS (
         SELECT 1 FROM public.chat_participantes sa
           JOIN public.perfis pe ON pe.id = sa.perfil_id
          WHERE sa.conversa_id = c.id
            AND pe.perfil = 'super_admin'
       )
  ),
  ultima AS (
    SELECT DISTINCT ON (m.conversa_id) m.conversa_id, m.texto, m.anexos, m.autor_id
      FROM public.chat_mensagens m
     WHERE m.conversa_id IN (SELECT d.id FROM dele d)
     ORDER BY m.conversa_id, m.criado_em DESC
  ),
  quantos AS (
    SELECT p.conversa_id, count(*)::INTEGER AS n
      FROM public.chat_participantes p
     WHERE p.conversa_id IN (SELECT d.id FROM dele d) AND p.saiu_em IS NULL
     GROUP BY p.conversa_id
  )
  SELECT d.id,
         d.outro,
         COALESCE(d.nome, o.nome),
         COALESCE(d.foto_url, o.foto_url),
         o.perfil::TEXT,
         d.tipo,
         COALESCE(q.n, 2),
         d.ultima_mensagem_em,
         u.texto, u.anexos, u.autor_id
    FROM dele d
    LEFT JOIN public.perfis o ON o.id = d.outro
    LEFT JOIN ultima  u ON u.conversa_id = d.id
    LEFT JOIN quantos q ON q.conversa_id = d.id
   ORDER BY d.ultima_mensagem_em DESC NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_monitor_conversas(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_monitor_conversas(UUID) TO authenticated;

-- ── 2c. As conversas recentes do Monitor ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chat_monitor_recentes(p_limite INTEGER DEFAULT 15)
RETURNS TABLE (
  conversa_id        UUID,
  tipo               TEXT,
  titulo             TEXT,
  foto_url           TEXT,
  participantes      INTEGER,
  ultima_mensagem_em TIMESTAMPTZ,
  ultimo_texto       TEXT,
  ultimo_anexos      JSONB,
  ultimo_autor_id    UUID,
  ultimo_autor_nome  TEXT,
  quem_id            UUID,
  quem_nome          TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH visiveis AS (
    SELECT c.id, c.tipo, c.nome, c.foto_url, c.ultima_mensagem_em
      FROM public.chat_conversas c
     WHERE public.fn_user_tem('chat_monitor')
       AND c.ultima_mensagem_em IS NOT NULL
       AND NOT public.fn_chat_sou_parte(c.id)
       AND EXISTS (
         SELECT 1 FROM public.chat_participantes p
          WHERE p.conversa_id = c.id
            AND p.saiu_em IS NULL
            AND public.fn_chat_posso_monitorar(p.perfil_id)
       )
       -- A conversa com super admin nao entra (20261028140000).
       AND NOT EXISTS (
         SELECT 1 FROM public.chat_participantes sa
           JOIN public.perfis pe ON pe.id = sa.perfil_id
          WHERE sa.conversa_id = c.id
            AND pe.perfil = 'super_admin'
       )
     ORDER BY c.ultima_mensagem_em DESC
     LIMIT GREATEST(COALESCE(p_limite, 15), 1)
  ),
  ancora AS (
    SELECT DISTINCT ON (p.conversa_id) p.conversa_id, p.perfil_id, pe.nome
      FROM public.chat_participantes p
      JOIN public.perfis pe ON pe.id = p.perfil_id
     WHERE p.conversa_id IN (SELECT v.id FROM visiveis v)
       AND p.saiu_em IS NULL
       AND public.fn_chat_posso_monitorar(p.perfil_id)
     ORDER BY p.conversa_id, pe.nome
  ),
  quantos AS (
    SELECT p.conversa_id, count(*)::INTEGER AS n
      FROM public.chat_participantes p
     WHERE p.conversa_id IN (SELECT v.id FROM visiveis v) AND p.saiu_em IS NULL
     GROUP BY p.conversa_id
  ),
  ultima AS (
    SELECT DISTINCT ON (m.conversa_id)
           m.conversa_id, m.texto, m.anexos, m.autor_id, pe.nome
      FROM public.chat_mensagens m
      LEFT JOIN public.perfis pe ON pe.id = m.autor_id
     WHERE m.conversa_id IN (SELECT v.id FROM visiveis v)
     ORDER BY m.conversa_id, m.criado_em DESC
  ),
  nomes AS (
    SELECT p.conversa_id, string_agg(pe.nome, ' e ' ORDER BY pe.nome) AS titulo
      FROM public.chat_participantes p
      JOIN public.perfis pe ON pe.id = p.perfil_id
     WHERE p.conversa_id IN (SELECT v.id FROM visiveis v) AND p.saiu_em IS NULL
     GROUP BY p.conversa_id
  )
  SELECT v.id,
         v.tipo,
         COALESCE(NULLIF(v.nome, ''), n.titulo, 'Conversa'),
         v.foto_url,
         COALESCE(q.n, 0),
         v.ultima_mensagem_em,
         u.texto, u.anexos, u.autor_id, u.nome,
         a.perfil_id, a.nome
    FROM visiveis v
    LEFT JOIN ancora  a ON a.conversa_id = v.id
    LEFT JOIN quantos q ON q.conversa_id = v.id
    LEFT JOIN ultima  u ON u.conversa_id = v.id
    LEFT JOIN nomes   n ON n.conversa_id = v.id
   ORDER BY v.ultima_mensagem_em DESC;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_monitor_recentes(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_monitor_recentes(INTEGER) TO authenticated;

-- ── 1e. Anexo de mensagem que mudou de conversa ─────────────────────────────
-- O caminho `<conversa>/…` diz a conversa ONDE O ANEXO SUBIU. Quando ela nao e
-- legivel (foi juntada em outra, acima), a pergunta vira a mesma do disparo:
-- existe uma mensagem que eu leio carregando este anexo?
CREATE OR REPLACE FUNCTION public.fn_chat_posso_ler_anexo(p_caminho TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_primeiro TEXT;
  v_segundo  TEXT;
  v_conversa UUID;
BEGIN
  IF p_caminho IS NULL OR NOT public.fn_chat_pode_usar() THEN RETURN FALSE; END IF;

  v_primeiro := split_part(p_caminho, '/', 1);
  v_segundo  := split_part(p_caminho, '/', 2);

  -- `grupos/<conversa>/…`: a foto do grupo.
  IF v_primeiro = 'grupos' THEN
    BEGIN v_conversa := v_segundo::UUID; EXCEPTION WHEN others THEN RETURN FALSE; END;
    RETURN public.fn_chat_leio_conversa(v_conversa)
        OR public.fn_chat_monitoro_conversa(v_conversa);
  END IF;

  -- `<conversa>/…`: o caminho comum, e o caso rápido.
  BEGIN
    v_conversa := v_primeiro::UUID;
  EXCEPTION WHEN others THEN
    v_conversa := NULL;
  END;

  IF v_conversa IS NOT NULL
     AND (public.fn_chat_leio_conversa(v_conversa)
          OR public.fn_chat_monitoro_conversa(v_conversa)) THEN
    RETURN TRUE;
  END IF;

  -- O disparo (o caminho é o rascunho) e a mensagem que mudou de conversa.
  RETURN EXISTS (
    SELECT 1
      FROM public.chat_mensagens m
     WHERE m.anexos @> jsonb_build_array(jsonb_build_object('url', p_caminho))
       AND (
         public.fn_chat_monitoro_conversa(m.conversa_id)
         OR (public.fn_chat_leio_conversa(m.conversa_id)
             AND m.criado_em <= public.fn_chat_leio_ate(m.conversa_id))
       )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chat_posso_ler_anexo(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chat_posso_ler_anexo(TEXT) TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.chat_conversas WHERE tipo = 'direta'
     GROUP BY par_menor, par_maior HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Ainda ha par com mais de uma conversa direta.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND pg_get_functiondef(p.oid) ILIKE '%ON CONFLICT (empresa_id, par_menor, par_maior)%'
  ) THEN
    RAISE EXCEPTION 'Ainda ha funcao com o ON CONFLICT do indice antigo.';
  END IF;
END
$prova$;

COMMIT;
