-- ============================================================================
-- Natal: a agenda do trenzinho — ligado/desligado, horário e a primeira viagem
-- ============================================================================
--
-- Pedido do Cleber, 04/11/2026. Depende de 20261104120100 (a fila e o sorteio).
--
--   1. Ligado ou desligado. Desligado, o trem fica parado na estação «em
--      manutenção», e não há sorteio.
--   2. O horário (padrão 8h às 17h, em Brasília). Passou do fechamento, a
--      volta que estiver acontecendo termina, e o trem fica fechado na estação
--      com a placa «abre às 08:00». A fila continua aberta.
--   3. A primeira viagem: na primeira vez, o trem espera os CINCO PRIMEIROS da
--      fila; quando o quinto entra, a viagem sai e leva esses cinco, na ordem
--      em que entraram. Daí em diante, o ciclo de todo dia (o sorteio de
--      sempre).
--
-- Um trem só, para o sistema inteiro (Cleber, 05/11/2026: «o mesmo tempo e o
-- mesmo sorteio para todos»): uma fila, e UMA primeira viagem — o relógio do
-- trem é o mesmo em todas as empresas e nas duas regras.
--
-- O horário das voltas sai do relógio, no navegador
-- (`src/components/Natal/trem/horario.ts`): as voltas começam em
-- max(abertura do dia, início) e só começa volta antes do fechamento. O banco
-- guarda a agenda e responde por ela.
--
-- ## Tabelas
--
-- `natal_trem_config` — uma linha só (`id = true`): ativo, abre, fecha.
-- `natal_trem_inicio` — uma linha só (`id = true`): quando o quinto entrou na fila.
-- As duas com RLS ligado e sem policy: só as funções abaixo mexem nelas.
--
-- ## Funções
--
-- `fn_natal_trem_na_fila()`                      — quantos da fila valem (interna).
-- `fn_natal_trem_estado()`                       — a agenda (authenticated).
-- `fn_natal_trem_configurar(ativo, abre, fecha)` — só o super_admin, como os
--                                                  outros eventos da aba
--                                                  «Eventos e gincanas» (Corrida,
--                                                  Sirene). O tema de Natal ainda
--                                                  é prévia do super_admin.
-- `fn_natal_trem_inscrever(p_entrar)`            — refeita: o quinto da fila
--                                                  grava o início.
-- `fn_natal_trem_passageiros(p_chave)`           — refeita: sem início, ou
--                                                  desligado, não sorteia; a
--                                                  primeira viagem leva os cinco
--                                                  primeiros por ordem de entrada.
--
-- Antes de aplicar: nunca aplicada até 05/11/2026; a versão de antes guardava
-- o início por empresa e regra. Se `natal_trem_inicio` já existir com as
-- colunas `empresa_id`/`regra`, ela NÃO serve — conferir antes.
--
-- Reaplicável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.natal_trem_config (
  id             BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  ativo          BOOLEAN NOT NULL DEFAULT true,
  abre           TIME    NOT NULL DEFAULT '08:00',
  fecha          TIME    NOT NULL DEFAULT '17:00',
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  CONSTRAINT natal_trem_config_horario CHECK (abre < fecha)
);
ALTER TABLE public.natal_trem_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.natal_trem_config (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.natal_trem_inicio (
  id     BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  inicio TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.natal_trem_inicio ENABLE ROW LEVEL SECURITY;

-- ── Quantos da fila valem, em um lugar só ───────────────────────────────────

-- A versão de antes (nunca aplicada) recebia empresa e regra.
DROP FUNCTION IF EXISTS public.fn_natal_trem_na_fila(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.fn_natal_trem_na_fila()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT count(*)::INT
    FROM public.natal_trem_inscricoes i
    JOIN public.perfis p ON p.id = i.perfil_id
   WHERE p.ativo AND NOT p.arquivado AND p.situacao <> 'desligado';
$fn$;

-- ── A agenda ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_estado()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
           'ativo', c.ativo,
           'abre', to_char(c.abre, 'HH24:MI'),
           'fecha', to_char(c.fecha, 'HH24:MI'),
           'inicio', (SELECT n.inicio FROM public.natal_trem_inicio n WHERE n.id),
           'inscritos', public.fn_natal_trem_na_fila())
    FROM public.natal_trem_config c
   WHERE c.id AND auth.uid() IS NOT NULL;
$fn$;

-- ── O painel (só o super_admin) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_configurar(p_ativo BOOLEAN, p_abre TIME, p_fecha TIME)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin configura o trenzinho' USING ERRCODE = '42501';
  END IF;
  IF p_ativo IS NULL OR p_abre IS NULL OR p_fecha IS NULL THEN
    RAISE EXCEPTION 'Preencha tudo.' USING ERRCODE = '22023';
  END IF;
  IF p_abre >= p_fecha THEN
    RAISE EXCEPTION 'A estação tem de abrir antes de fechar.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.natal_trem_config
     SET ativo = p_ativo, abre = p_abre, fecha = p_fecha, atualizado_em = now(), atualizado_por = auth.uid()
   WHERE id;
  RETURN public.fn_natal_trem_estado();
END;
$fn$;

-- ── Entrar ou sair da fila: o quinto grava o início ─────────────────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_inscrever(p_entrar BOOLEAN)
RETURNS TABLE(inscrito BOOLEAN, total INT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF p_entrar THEN
    INSERT INTO public.natal_trem_inscricoes (perfil_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
    -- A primeira viagem sai quando a fila chega a cinco (uma vez só, para o sistema inteiro).
    IF public.fn_natal_trem_na_fila() >= 5 THEN
      INSERT INTO public.natal_trem_inicio (id, inicio) VALUES (true, now()) ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    DELETE FROM public.natal_trem_inscricoes WHERE perfil_id = auth.uid();
  END IF;
  RETURN QUERY SELECT * FROM public.fn_natal_trem_inscricao();
END;
$fn$;

-- ── Os passageiros: sem início ou desligado, nada; a primeira leva os cinco primeiros ──

CREATE OR REPLACE FUNCTION public.fn_natal_trem_passageiros(p_chave BIGINT)
RETURNS TABLE(ordem INT, perfil_id UUID, nome TEXT, foto_url TEXT, setor_nome TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_eu       UUID := auth.uid();
  v_dia      DATE;
  v_minuto   BIGINT := floor(extract(epoch FROM now()) / 60)::BIGINT;
  v_lista    UUID[];
  v_primeira BOOLEAN;
BEGIN
  IF v_eu IS NULL OR p_chave IS NULL OR p_chave NOT BETWEEN v_minuto - 30 AND v_minuto + 30 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = v_eu) THEN RETURN; END IF;

  SELECT v.passageiros INTO v_lista FROM public.natal_trem_viagens v WHERE v.chave = p_chave;

  IF v_lista IS NULL THEN
    -- Trem desligado, ou a fila ainda sem os cinco primeiros: não há viagem para sortear.
    IF NOT EXISTS (SELECT 1 FROM public.natal_trem_config c WHERE c.id AND c.ativo)
       OR NOT EXISTS (SELECT 1 FROM public.natal_trem_inicio n WHERE n.id) THEN
      RETURN;
    END IF;
    v_primeira := NOT EXISTS (SELECT 1 FROM public.natal_trem_viagens);
    v_dia := (to_timestamp(p_chave * 60) AT TIME ZONE 'America/Sao_Paulo')::DATE;
    SELECT COALESCE(array_agg(x.id ORDER BY x.n), '{}') INTO v_lista
      FROM (
        SELECT p.id, row_number() OVER (
                 -- A primeira viagem: os cinco primeiros a entrar na fila, nessa ordem.
                 ORDER BY CASE WHEN v_primeira THEN i.inscrito_em END,
                          -- Depois: primeiro quem ainda não viajou hoje; acabando, quem viajou menos vezes.
                          (SELECT count(*) FROM public.natal_trem_viagens v
                            WHERE v.dia = v_dia AND p.id = ANY (v.passageiros)),
                          random()) AS n
          FROM public.natal_trem_inscricoes i
          JOIN public.perfis p ON p.id = i.perfil_id
         WHERE p.ativo AND NOT p.arquivado AND p.situacao <> 'desligado'
      ) x
     WHERE x.n <= 5;
    INSERT INTO public.natal_trem_viagens (chave, dia, passageiros)
    VALUES (p_chave, v_dia, v_lista)
    ON CONFLICT DO NOTHING;
    -- Se outra pergunta sorteou ao mesmo tempo, vale a dela.
    SELECT v.passageiros INTO v_lista FROM public.natal_trem_viagens v WHERE v.chave = p_chave;
  END IF;

  RETURN QUERY
  SELECT l.ordem::INT, p.id, p.nome::TEXT, p.foto_url::TEXT, s.nome::TEXT
    FROM unnest(v_lista) WITH ORDINALITY AS l(id, ordem)
    JOIN public.perfis p ON p.id = l.id
    LEFT JOIN public.setores s ON s.id = p.setor_id
   ORDER BY l.ordem;
END;
$fn$;

-- Se a fila já tinha cinco antes desta migration, o trem começa agora.
INSERT INTO public.natal_trem_inicio (id, inicio)
SELECT true, now() WHERE public.fn_natal_trem_na_fila() >= 5
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION public.fn_natal_trem_na_fila()                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_natal_trem_estado()                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_natal_trem_configurar(BOOLEAN, TIME, TIME)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_natal_trem_inscrever(BOOLEAN)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_natal_trem_passageiros(BIGINT)              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_estado()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_configurar(BOOLEAN, TIME, TIME) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_inscrever(BOOLEAN)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_passageiros(BIGINT)             TO authenticated;

COMMENT ON TABLE public.natal_trem_config IS 'Natal 2026: o trenzinho ligado ou não e o horário da estação (uma linha). Ver a migration 20261104200100.';
COMMENT ON TABLE public.natal_trem_inicio IS 'Natal 2026: quando a fila do trenzinho chegou a cinco — a primeira viagem, uma só para o sistema inteiro (uma linha). Ver a migration 20261104200100.';

COMMIT;
