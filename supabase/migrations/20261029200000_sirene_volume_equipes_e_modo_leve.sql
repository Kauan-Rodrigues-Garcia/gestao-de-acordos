-- ============================================================================
-- Sirene: volume e equipes; e o modo leve desligado uma vez em todos
-- 29/10/2026 · pedido do Kauan
-- ============================================================================
--
-- ## Sirene (continua 20261029160000)
--
--   volume      0 a 100 (%), em cada horário e em cada «Tocar agora».
--               Padrão 50 — o volume que valia até aqui.
--   equipe_ids  além dos setores, as equipes que ouvem. Ouve quem é de um
--               dos setores OU de uma das equipes; setores e equipes vazios =
--               todo mundo.
--
-- O setor e as equipes de cada pessoa passam a ser os do chat
-- (`fn_chat_setores_do_perfil`, `fn_chat_equipes_do_perfil`): o setor do
-- perfil, os setores das equipes dela e as equipes que ela lidera. Um líder
-- de duas equipes ouve a sirene das duas.
--
-- `fn_sirene_salvar` e `fn_sirene_tocar` ganham parâmetros: as versões
-- antigas saem (DROP) para o PostgREST não ficar com duas.
--
-- ## Modo leve (`src/lib/modoLeve.ts`)
--
-- «Apenas aplique para meio que limpar, e depois eles podem voltar
-- normalmente.» O modo leve é por computador (`localStorage`); esta migration
-- grava, UMA vez, a hora da limpeza em `modo_leve_zerado.zerado_em`, e cada
-- tela que ligou o modo leve ANTES dessa hora o desliga ao ler (quem está com
-- o app aberto, na hora, pelo aviso). Quem precisar liga de novo no próprio
-- computador, e isso fica valendo. Sem cartão nem botão.
--
-- Nenhuma linha de dado existente muda (as colunas novas nascem com o padrão).
-- Reexecutável: rodar de novo NÃO limpa de novo (só grava a hora se estiver
-- vazia).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── Sirene: colunas novas ───────────────────────────────────────────────────
ALTER TABLE public.sirene_agendamentos
  ADD COLUMN IF NOT EXISTS volume     SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS equipe_ids UUID[]   NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE public.sirene_toques
  ADD COLUMN IF NOT EXISTS volume     SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS equipe_ids UUID[]   NOT NULL DEFAULT ARRAY[]::UUID[];

ALTER TABLE public.sirene_agendamentos DROP CONSTRAINT IF EXISTS sirene_ag_volume;
ALTER TABLE public.sirene_agendamentos ADD CONSTRAINT sirene_ag_volume CHECK (volume BETWEEN 0 AND 100);
ALTER TABLE public.sirene_toques DROP CONSTRAINT IF EXISTS sirene_toque_volume;
ALTER TABLE public.sirene_toques ADD CONSTRAINT sirene_toque_volume CHECK (volume BETWEEN 0 AND 100);

-- ── Para quem toca: o meu setor e as minhas equipes ─────────────────────────
-- Vazio nos dois = todo mundo.
CREATE OR REPLACE FUNCTION public.fn_sirene_e_para_mim(p_setor_ids uuid[], p_equipe_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT (cardinality(p_setor_ids) = 0 AND cardinality(p_equipe_ids) = 0)
      OR EXISTS (
           SELECT 1 FROM public.perfis p
            WHERE p.id = (SELECT auth.uid()) AND p.setor_id = ANY (p_setor_ids))
      OR EXISTS (
           SELECT 1 FROM public.fn_chat_setores_do_perfil((SELECT auth.uid())) s
            WHERE s.setor_id = ANY (p_setor_ids))
      OR EXISTS (
           SELECT 1 FROM public.fn_chat_equipes_do_perfil((SELECT auth.uid())) e
            WHERE e.equipe_id = ANY (p_equipe_ids));
$function$;

REVOKE ALL ON FUNCTION public.fn_sirene_e_para_mim(uuid[], uuid[]) FROM PUBLIC, anon, authenticated;

-- ── Ler: o que toca para MIM ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sirene_ler()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'agora', now(),
    'agendamentos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'hora', to_char(a.hora, 'HH24:MI'), 'dias', a.dias,
               'cor', a.cor, 'duracao_s', a.duracao_s, 'descricao', a.descricao, 'volume', a.volume)
             ORDER BY a.hora)
        FROM public.sirene_agendamentos a
       WHERE a.ativo
         AND public.fn_sirene_e_para_mim(a.setor_ids, a.equipe_ids)
    ), '[]'::jsonb),
    'toque', (
      SELECT jsonb_build_object('id', t.id, 'cor', t.cor, 'duracao_s', t.duracao_s,
                                'toca_em', t.toca_em, 'volume', t.volume)
        FROM public.sirene_toques t
       WHERE t.toca_em > now() - interval '2 minutes'
         AND public.fn_sirene_e_para_mim(t.setor_ids, t.equipe_ids)
       ORDER BY t.toca_em DESC
       LIMIT 1
    ));
$function$;

REVOKE ALL ON FUNCTION public.fn_sirene_ler() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sirene_ler() TO authenticated;

-- ── O painel do super admin ─────────────────────────────────────────────────
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
               'setor_ids', a.setor_ids, 'equipe_ids', a.equipe_ids, 'duracao_s', a.duracao_s,
               'descricao', a.descricao, 'ativo', a.ativo, 'volume', a.volume)
             ORDER BY a.hora)
        FROM public.sirene_agendamentos a
    ), '[]'::jsonb),
    'toques', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'toca_em' DESC) FROM (
        SELECT jsonb_build_object('id', t.id, 'cor', t.cor, 'setor_ids', t.setor_ids,
                                  'equipe_ids', t.equipe_ids, 'duracao_s', t.duracao_s,
                                  'toca_em', t.toca_em, 'volume', t.volume,
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

-- ── Salvar um horário: agora com equipes e volume ───────────────────────────
DROP FUNCTION IF EXISTS public.fn_sirene_salvar(uuid, time, smallint[], text, uuid[], integer, boolean, text);

CREATE OR REPLACE FUNCTION public.fn_sirene_salvar(
  p_id uuid, p_hora time, p_dias smallint[], p_cor text, p_setor_ids uuid[], p_equipe_ids uuid[],
  p_duracao_s integer, p_volume integer, p_ativo boolean, p_descricao text)
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
    INSERT INTO public.sirene_agendamentos
      (hora, dias, cor, setor_ids, equipe_ids, duracao_s, volume, ativo, descricao, criado_por)
    VALUES (p_hora, COALESCE(p_dias, ARRAY[1,2,3,4,5]::smallint[]), COALESCE(p_cor, 'policia'),
            COALESCE(p_setor_ids, ARRAY[]::uuid[]), COALESCE(p_equipe_ids, ARRAY[]::uuid[]),
            COALESCE(p_duracao_s, 10), COALESCE(p_volume, 50), COALESCE(p_ativo, true),
            NULLIF(btrim(p_descricao), ''), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.sirene_agendamentos
       SET hora = p_hora, dias = COALESCE(p_dias, dias), cor = COALESCE(p_cor, cor),
           setor_ids = COALESCE(p_setor_ids, setor_ids), equipe_ids = COALESCE(p_equipe_ids, equipe_ids),
           duracao_s = COALESCE(p_duracao_s, duracao_s), volume = COALESCE(p_volume, volume),
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

REVOKE ALL ON FUNCTION public.fn_sirene_salvar(uuid, time, smallint[], text, uuid[], uuid[], integer, integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sirene_salvar(uuid, time, smallint[], text, uuid[], uuid[], integer, integer, boolean, text) TO authenticated;

-- ── Tocar agora: agora com equipes e volume ─────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_sirene_tocar(text, uuid[], integer);

CREATE OR REPLACE FUNCTION public.fn_sirene_tocar(
  p_cor text, p_setor_ids uuid[], p_equipe_ids uuid[], p_duracao_s integer, p_volume integer)
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
  SELECT max(t.criado_em) INTO v_ultimo FROM public.sirene_toques t;
  IF v_ultimo IS NOT NULL AND v_ultimo > now() - interval '5 seconds' THEN
    RAISE EXCEPTION 'A sirene acabou de ser tocada. Espere alguns segundos.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.sirene_toques (cor, setor_ids, equipe_ids, duracao_s, volume, toca_em, criado_por, criado_por_nome)
  VALUES (COALESCE(p_cor, 'policia'), COALESCE(p_setor_ids, ARRAY[]::uuid[]), COALESCE(p_equipe_ids, ARRAY[]::uuid[]),
          COALESCE(p_duracao_s, 10), COALESCE(p_volume, 50), now() + interval '5 seconds', auth.uid(),
          (SELECT p.nome FROM public.perfis p WHERE p.id = auth.uid()));
  RETURN public.fn_sirene_painel();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_sirene_tocar(text, uuid[], uuid[], integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sirene_tocar(text, uuid[], uuid[], integer, integer) TO authenticated;

-- ── Modo leve: desligar em todos os computadores ────────────────────────────
CREATE TABLE IF NOT EXISTS public.modo_leve_zerado (
  id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  zerado_em        TIMESTAMPTZ
);

COMMENT ON TABLE public.modo_leve_zerado IS
  'Uma linha: quando o modo leve foi desligado em todos os computadores (a limpeza de 29/10/2026). '
  'Cada tela que ligou o modo leve antes dessa hora o desliga. Gravada por esta migration. Ver 20261029200000.';

INSERT INTO public.modo_leve_zerado (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.modo_leve_zerado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.modo_leve_zerado FROM anon, authenticated;
GRANT ALL ON public.modo_leve_zerado TO service_role;

CREATE OR REPLACE FUNCTION public.fn_modo_leve_avisar()
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
      jsonb_build_object('tabela', 'modo_leve', 'operacao', tg_op, 'importado_por', '[]'::jsonb),
      'mudou',
      'permissoes:' || v_empresa::text,
      true);
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_modo_leve_avisar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_modo_leve_avisar ON public.modo_leve_zerado;
CREATE TRIGGER trg_modo_leve_avisar
  AFTER UPDATE ON public.modo_leve_zerado
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_modo_leve_avisar();

CREATE OR REPLACE FUNCTION public.fn_modo_leve_ler()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('zerado_em', z.zerado_em)
  FROM (SELECT 1) um
  LEFT JOIN public.modo_leve_zerado z ON z.id = 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_modo_leve_ler() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_modo_leve_ler() TO authenticated;

-- A limpeza: uma vez só. O gatilho acima avisa as telas abertas.
UPDATE public.modo_leve_zerado SET zerado_em = now() WHERE id = 1 AND zerado_em IS NULL;

-- ── Prova ──────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'sirene_agendamentos' AND column_name = 'equipe_ids') THEN
    RAISE EXCEPTION 'sirene: faltou equipe_ids';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'fn_sirene_salvar') <> 1
     OR (SELECT count(*) FROM pg_proc WHERE proname = 'fn_sirene_tocar') <> 1 THEN
    RAISE EXCEPTION 'sirene: ficou mais de uma versão de salvar/tocar';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_sirene_e_para_mim(uuid[],uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'sirene: função interna aberta demais';
  END IF;
  IF has_table_privilege('authenticated', 'public.modo_leve_zerado', 'SELECT') THEN
    RAISE EXCEPTION 'modo leve: tabela aberta demais';
  END IF;
  IF (SELECT zerado_em FROM public.modo_leve_zerado WHERE id = 1) IS NULL THEN
    RAISE EXCEPTION 'modo leve: faltou gravar a limpeza';
  END IF;
END;
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Para desfazer ──────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.fn_modo_leve_ler();
-- DROP TABLE IF EXISTS public.modo_leve_zerado;  DROP FUNCTION IF EXISTS public.fn_modo_leve_avisar();
-- Reaplicar fn_sirene_ler/painel/salvar/tocar de 20261029160000 (DROP das novas assinaturas antes)
-- e DROP FUNCTION public.fn_sirene_e_para_mim(uuid[], uuid[]);
-- ALTER TABLE ... DROP COLUMN volume, DROP COLUMN equipe_ids (nas duas tabelas da sirene).
