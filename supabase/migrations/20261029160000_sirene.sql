-- ============================================================================
-- Sirene: a luz giratória com som, num horário, na cor escolhida, por setor
-- 29/10/2026 · pedido do Kauan
-- ============================================================================
--
-- O super admin, em Configurações > Geral:
--
--   sirene_agendamentos   os horários fixos: hora, dias da semana, cor,
--                         setores e duração. «Às 9h toca azul, às 14h verde.»
--                         `setor_ids` vazio = todos os setores.
--   sirene_toques         o «Tocar agora»: um toque solto, 5 segundos depois
--                         do clique (hora do banco), para os setores escolhidos.
--
-- Cada tela lê SÓ o que é para o setor dela (`fn_sirene_ler`) e marca o timer
-- pela hora do banco — na hora de tocar, ninguém pergunta nada ao servidor
-- (a lição da gargalhada da bruxa, 15/10/2026). O aviso de que algo mudou é o
-- caminho do jumpscare (20261023160000): um Broadcast `mudou` no tópico
-- `permissoes:<empresa>` de todas as empresas, e cada tela relê.
--
-- Hora e dias são de São Paulo. Nenhuma linha de dado existente muda.
-- Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── As cores (o mesmo conjunto da tela, `src/components/Sirene/cores.ts`) ────
-- `policia` é o azul e vermelho alternados.

CREATE TABLE IF NOT EXISTS public.sirene_agendamentos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hora           TIME NOT NULL,
  dias           SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::SMALLINT[],
  cor            TEXT NOT NULL DEFAULT 'policia',
  setor_ids      UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  duracao_s      INTEGER NOT NULL DEFAULT 10,
  descricao      TEXT,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por     UUID,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sirene_ag_cor      CHECK (cor IN ('policia','azul','vermelho','verde','amarelo','laranja','roxo','branco')),
  CONSTRAINT sirene_ag_duracao  CHECK (duracao_s BETWEEN 3 AND 60),
  CONSTRAINT sirene_ag_dias     CHECK (cardinality(dias) > 0 AND dias <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]),
  CONSTRAINT sirene_ag_descricao CHECK (descricao IS NULL OR char_length(descricao) <= 80)
);

COMMENT ON TABLE public.sirene_agendamentos IS
  'Horários fixos da sirene (hora e dias de São Paulo; dias 0 = domingo). setor_ids vazio = todos. '
  'Escrita só por fn_sirene_salvar / fn_sirene_apagar (super_admin). Ver 20261029160000.';

CREATE TABLE IF NOT EXISTS public.sirene_toques (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cor              TEXT NOT NULL,
  setor_ids        UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  duracao_s        INTEGER NOT NULL DEFAULT 10,
  toca_em          TIMESTAMPTZ NOT NULL,
  criado_por       UUID,
  criado_por_nome  TEXT,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sirene_toque_cor     CHECK (cor IN ('policia','azul','vermelho','verde','amarelo','laranja','roxo','branco')),
  CONSTRAINT sirene_toque_duracao CHECK (duracao_s BETWEEN 3 AND 60)
);

COMMENT ON TABLE public.sirene_toques IS
  'Toques soltos da sirene («Tocar agora»). Escrita só por fn_sirene_tocar (super_admin). Ver 20261029160000.';

CREATE INDEX IF NOT EXISTS idx_sirene_toques_toca_em ON public.sirene_toques (toca_em DESC);

ALTER TABLE public.sirene_agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sirene_toques       ENABLE ROW LEVEL SECURITY;
-- Sem policy: leitura e escrita só pelas funções abaixo.
REVOKE ALL ON public.sirene_agendamentos FROM anon, authenticated;
REVOKE ALL ON public.sirene_toques       FROM anon, authenticated;
GRANT ALL ON public.sirene_agendamentos TO service_role;
GRANT ALL ON public.sirene_toques       TO service_role;

-- ── O aviso: todas as empresas ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sirene_avisar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa uuid;
BEGIN
  FOR v_empresa IN SELECT e.id FROM public.empresas e LOOP
    PERFORM realtime.send(
      jsonb_build_object('tabela', 'sirene', 'operacao', tg_op, 'importado_por', '[]'::jsonb),
      'mudou',
      'permissoes:' || v_empresa::text,
      true);
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_sirene_avisar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sirene_ag_avisar ON public.sirene_agendamentos;
CREATE TRIGGER trg_sirene_ag_avisar
  AFTER INSERT OR UPDATE OR DELETE ON public.sirene_agendamentos
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_sirene_avisar();

DROP TRIGGER IF EXISTS trg_sirene_toque_avisar ON public.sirene_toques;
CREATE TRIGGER trg_sirene_toque_avisar
  AFTER INSERT ON public.sirene_toques
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_sirene_avisar();

-- ── Ler: o que toca para MIM, e o relógio do banco ──────────────────────────
-- Só os horários ativos do meu setor (ou de todos) e o último toque solto que
-- ainda não passou de 2 minutos. O setor é o do perfil.
CREATE OR REPLACE FUNCTION public.fn_sirene_ler()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH eu AS (
    SELECT p.setor_id FROM public.perfis p WHERE p.id = (SELECT auth.uid())
  )
  SELECT jsonb_build_object(
    'agora', now(),
    'agendamentos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'hora', to_char(a.hora, 'HH24:MI'), 'dias', a.dias,
               'cor', a.cor, 'duracao_s', a.duracao_s, 'descricao', a.descricao)
             ORDER BY a.hora)
        FROM public.sirene_agendamentos a
       WHERE a.ativo
         AND (cardinality(a.setor_ids) = 0 OR (SELECT setor_id FROM eu) = ANY (a.setor_ids))
    ), '[]'::jsonb),
    'toque', (
      SELECT jsonb_build_object('id', t.id, 'cor', t.cor, 'duracao_s', t.duracao_s, 'toca_em', t.toca_em)
        FROM public.sirene_toques t
       WHERE t.toca_em > now() - interval '2 minutes'
         AND (cardinality(t.setor_ids) = 0 OR (SELECT setor_id FROM eu) = ANY (t.setor_ids))
       ORDER BY t.toca_em DESC
       LIMIT 1
    ));
$function$;

REVOKE ALL ON FUNCTION public.fn_sirene_ler() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sirene_ler() TO authenticated;

-- ── O painel do super admin: tudo ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sirene_painel()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin configura a sirene' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'agora', now(),
    'agendamentos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'hora', to_char(a.hora, 'HH24:MI'), 'dias', a.dias, 'cor', a.cor,
               'setor_ids', a.setor_ids, 'duracao_s', a.duracao_s, 'descricao', a.descricao,
               'ativo', a.ativo)
             ORDER BY a.hora)
        FROM public.sirene_agendamentos a
    ), '[]'::jsonb),
    'toques', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'toca_em' DESC) FROM (
        SELECT jsonb_build_object('id', t.id, 'cor', t.cor, 'setor_ids', t.setor_ids,
                                  'duracao_s', t.duracao_s, 'toca_em', t.toca_em,
                                  'criado_por_nome', t.criado_por_nome) AS x
          FROM public.sirene_toques t
         ORDER BY t.toca_em DESC
         LIMIT 10
      ) ult
    ), '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_sirene_painel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sirene_painel() TO authenticated;

-- ── Salvar um horário (novo, ou o mesmo id para editar) ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_sirene_salvar(
  p_id uuid, p_hora time, p_dias smallint[], p_cor text, p_setor_ids uuid[],
  p_duracao_s integer, p_ativo boolean, p_descricao text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin configura a sirene' USING ERRCODE = '42501';
  END IF;
  IF p_hora IS NULL THEN
    RAISE EXCEPTION 'Escolha a hora.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.sirene_agendamentos (hora, dias, cor, setor_ids, duracao_s, ativo, descricao, criado_por)
    VALUES (p_hora, COALESCE(p_dias, ARRAY[1,2,3,4,5]::smallint[]), COALESCE(p_cor, 'policia'),
            COALESCE(p_setor_ids, ARRAY[]::uuid[]), COALESCE(p_duracao_s, 10), COALESCE(p_ativo, true),
            NULLIF(btrim(p_descricao), ''), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.sirene_agendamentos
       SET hora = p_hora, dias = COALESCE(p_dias, dias), cor = COALESCE(p_cor, cor),
           setor_ids = COALESCE(p_setor_ids, setor_ids), duracao_s = COALESCE(p_duracao_s, duracao_s),
           ativo = COALESCE(p_ativo, ativo), descricao = NULLIF(btrim(p_descricao), ''),
           atualizado_em = now()
     WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Horário não encontrado.' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_sirene_salvar(uuid, time, smallint[], text, uuid[], integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sirene_salvar(uuid, time, smallint[], text, uuid[], integer, boolean, text) TO authenticated;

-- ── Apagar um horário ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sirene_apagar(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin configura a sirene' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.sirene_agendamentos WHERE id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_sirene_apagar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sirene_apagar(uuid) TO authenticated;

-- ── Tocar agora: daqui a 5 segundos (hora do banco) ─────────────────────────
-- Os 5 s são o tempo de o aviso chegar às telas e cada uma reler.
CREATE OR REPLACE FUNCTION public.fn_sirene_tocar(p_cor text, p_setor_ids uuid[], p_duracao_s integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ultimo timestamptz;
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin toca a sirene' USING ERRCODE = '42501';
  END IF;
  -- Um toque de cada vez: clique duplo não vira duas sirenes.
  SELECT max(t.criado_em) INTO v_ultimo FROM public.sirene_toques t;
  IF v_ultimo IS NOT NULL AND v_ultimo > now() - interval '5 seconds' THEN
    RAISE EXCEPTION 'A sirene acabou de ser tocada. Espere alguns segundos.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.sirene_toques (cor, setor_ids, duracao_s, toca_em, criado_por, criado_por_nome)
  VALUES (COALESCE(p_cor, 'policia'), COALESCE(p_setor_ids, ARRAY[]::uuid[]), COALESCE(p_duracao_s, 10),
          now() + interval '5 seconds', auth.uid(),
          (SELECT p.nome FROM public.perfis p WHERE p.id = auth.uid()));
  RETURN public.fn_sirene_painel();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_sirene_tocar(text, uuid[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sirene_tocar(text, uuid[], integer) TO authenticated;

-- ── Prova ──────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.sirene_agendamentos') IS NULL OR to_regclass('public.sirene_toques') IS NULL THEN
    RAISE EXCEPTION 'sirene: faltou tabela';
  END IF;
  IF has_table_privilege('authenticated', 'public.sirene_agendamentos', 'SELECT')
     OR has_table_privilege('authenticated', 'public.sirene_toques', 'INSERT') THEN
    RAISE EXCEPTION 'sirene: tabela aberta demais';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_sirene_avisar()', 'EXECUTE') THEN
    RAISE EXCEPTION 'sirene: função interna aberta demais';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sirene_ag_avisar')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sirene_toque_avisar') THEN
    RAISE EXCEPTION 'sirene: faltou o gatilho do aviso';
  END IF;
END;
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Para desfazer ──────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.fn_sirene_tocar(text, uuid[], integer), public.fn_sirene_apagar(uuid),
--   public.fn_sirene_salvar(uuid, time, smallint[], text, uuid[], integer, boolean, text),
--   public.fn_sirene_painel(), public.fn_sirene_ler();
-- DROP TABLE IF EXISTS public.sirene_toques, public.sirene_agendamentos;  (levam os gatilhos)
-- DROP FUNCTION IF EXISTS public.fn_sirene_avisar();
