-- ============================================================================
-- Natal: a liberação para todos e o acompanhamento de quem abriu o presente
-- ============================================================================
--
-- Pedido do Cleber, 09/11/2026. Mesmo molde do Halloween (20261001140000).
--
-- ## A liberação
--
-- O tema sobe DESLIGADO para todos: só o super_admin vê, para validar. Quando
-- ele aperta «Liberar para todos» em Configurações › Geral, quem está logado
-- recebe o presente na hora e quem entrar depois recebe ao entrar.
--
--   natal_liberacao   uma linha só: existe = liberado. Grava quem liberou e
--                     quando. Só `fn_natal_liberar` escreve, e só para o
--                     super_admin. Diferente do Halloween, dá para RECOLHER
--                     (`fn_natal_liberar(false)` apaga a linha): o tema volta a
--                     ser só do super_admin.
--
-- «Na hora» é um Broadcast no tópico `permissoes:<empresa>` de TODAS as
-- empresas, que todo mundo logado já escuta. Um sinal por liberação.
--
-- ## O presente de cada pessoa
--
--   natal_abertura    uma linha por pessoa, criada no primeiro passo dela:
--                     o vídeo que viu (Birigui ou Marília), se assistiu até o
--                     fim, se pulou, quantas vezes deixou para depois, e
--                     quando entrou no Natal. É o que o card de
--                     acompanhamento mostra, e o que faz o Natal seguir a
--                     pessoa de um computador para outro.
--
-- O vídeo sai da cidade do setor (`setores.cidade_id` › `rh_celulas.nome`):
-- Marília vê o de Marília; Birigui, outra cidade ou sem cidade, o de Birigui.
-- O setor é o da pessoa ou, sem ele, o da equipe dela.
--
-- ## Funções (todas para `authenticated`)
--
--   fn_natal_liberar(p_liberar)           só o super_admin.
--   fn_natal_minha_abertura()             a cidade e o que a pessoa já fez.
--   fn_natal_abertura_marcar(p_evento, p_video)
--                                         'assistiu' | 'pulou' | 'adiou' | 'liberou'.
--   fn_natal_abertura_painel()            só o super_admin: todo mundo ativo,
--                                         com a cidade e o que fez.
--
-- As tabelas têm RLS ligado; `natal_abertura` não tem policy (só as funções
-- mexem nela). Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

-- ── A liberação ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.natal_liberacao (
  id                SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  liberado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  liberado_por      UUID,
  liberado_por_nome TEXT
);

COMMENT ON TABLE public.natal_liberacao IS
  'Uma linha = tema de Natal liberado para todos. Escrita só por fn_natal_liberar '
  '(super_admin). Ver 20261109150000.';

ALTER TABLE public.natal_liberacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS natal_liberacao_leitura ON public.natal_liberacao;
CREATE POLICY natal_liberacao_leitura ON public.natal_liberacao
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.natal_liberacao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.natal_liberacao TO authenticated;
GRANT ALL    ON public.natal_liberacao TO service_role;

-- Liberar (ou recolher) avisa quem está logado em todas as empresas.
CREATE OR REPLACE FUNCTION public.fn_natal_avisar()
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
      jsonb_build_object('tabela', 'natal_liberacao', 'operacao', tg_op, 'importado_por', '[]'::jsonb),
      'mudou',
      'permissoes:' || v_empresa::text,
      true);
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_avisar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_natal_avisar ON public.natal_liberacao;
CREATE TRIGGER trg_natal_avisar
  AFTER INSERT OR DELETE ON public.natal_liberacao
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_natal_avisar();

CREATE OR REPLACE FUNCTION public.fn_natal_liberar(p_liberar BOOLEAN DEFAULT TRUE)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_em   timestamptz;
  v_nome text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin libera o Natal' USING ERRCODE = '42501';
  END IF;

  SELECT l.liberado_em INTO v_em FROM public.natal_liberacao l WHERE l.id = 1;

  IF NOT COALESCE(p_liberar, TRUE) THEN
    -- Recolher: só apaga (e só avisa) se estava liberado — o gatilho é por
    -- comando e dispararia o aviso a todo mundo mesmo com zero linhas.
    IF v_em IS NOT NULL THEN
      DELETE FROM public.natal_liberacao WHERE id = 1;
    END IF;
    RETURN NULL;
  END IF;

  -- Já liberado: devolve a data de antes e NÃO insere.
  IF v_em IS NOT NULL THEN
    RETURN v_em;
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = auth.uid();

  INSERT INTO public.natal_liberacao (id, liberado_por, liberado_por_nome)
  VALUES (1, auth.uid(), v_nome)
  RETURNING liberado_em INTO v_em;
  RETURN v_em;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_liberar(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_liberar(BOOLEAN) TO authenticated;

-- ── O presente de cada pessoa ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.natal_abertura (
  usuario_id     UUID PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  -- O vídeo da última vez que a pessoa abriu o presente.
  video          TEXT CHECK (video IN ('birigui', 'marilia')),
  -- As primeiras vezes: chegar ao fim do vídeo, pular no meio, entrar no Natal.
  assistiu_em    TIMESTAMPTZ,
  pulou_em       TIMESTAMPTZ,
  liberou_em     TIMESTAMPTZ,
  -- Quantas vezes fechou o vídeo no meio e deixou para depois.
  adiou_vezes    INTEGER NOT NULL DEFAULT 0,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.natal_abertura IS
  'O presente de Natal de cada pessoa: vídeo, assistiu/pulou/adiou e quando entrou no tema. '
  'Escrita só por fn_natal_abertura_marcar. Ver 20261109150000.';

ALTER TABLE public.natal_abertura ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.natal_abertura FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.natal_abertura TO service_role;

-- A cidade do setor da pessoa (o dela ou, sem ele, o da equipe), sem acento:
-- 'birigui', 'marilia', outra, ou NULL.
CREATE OR REPLACE FUNCTION public.fn_natal_cidade_de(p_usuario UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT translate(lower(btrim(c.nome)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
    FROM public.perfis p
    LEFT JOIN public.equipes eq ON eq.id = p.equipe_id
    JOIN public.setores s       ON s.id = COALESCE(p.setor_id, eq.setor_id)
    JOIN public.rh_celulas c    ON c.id = s.cidade_id
   WHERE p.id = p_usuario
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_cidade_de(UUID) FROM PUBLIC, anon, authenticated;

-- SQL, não plpgsql: o corpo é conferido já na criação.
CREATE OR REPLACE FUNCTION public.fn_natal_minha_abertura()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
    'cidade',      public.fn_natal_cidade_de(auth.uid()),
    'video',       a.video,
    'assistiu_em', a.assistiu_em,
    'pulou_em',    a.pulou_em,
    'liberou_em',  a.liberou_em
  ) END
    FROM (SELECT 1) AS um
    LEFT JOIN public.natal_abertura a ON a.usuario_id = auth.uid()
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_minha_abertura() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_minha_abertura() TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_natal_abertura_marcar(p_evento TEXT, p_video TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu    uuid := auth.uid();
  v_video text := CASE WHEN p_video IN ('birigui', 'marilia') THEN p_video END;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  IF p_evento NOT IN ('assistiu', 'pulou', 'adiou', 'liberou') THEN
    RAISE EXCEPTION 'EVENTO_INVALIDO: %', p_evento USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.natal_abertura AS a (usuario_id, video, assistiu_em, pulou_em, liberou_em, adiou_vezes)
  VALUES (
    v_eu, v_video,
    CASE WHEN p_evento = 'assistiu' THEN now() END,
    CASE WHEN p_evento = 'pulou'    THEN now() END,
    CASE WHEN p_evento = 'liberou'  THEN now() END,
    CASE WHEN p_evento = 'adiou'    THEN 1 ELSE 0 END)
  ON CONFLICT (usuario_id) DO UPDATE SET
    video         = COALESCE(EXCLUDED.video, a.video),
    -- Só a primeira vez de cada coisa fica.
    assistiu_em   = COALESCE(a.assistiu_em, EXCLUDED.assistiu_em),
    pulou_em      = COALESCE(a.pulou_em,    EXCLUDED.pulou_em),
    liberou_em    = COALESCE(a.liberou_em,  EXCLUDED.liberou_em),
    adiou_vezes   = a.adiou_vezes + EXCLUDED.adiou_vezes,
    atualizado_em = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_abertura_marcar(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_abertura_marcar(TEXT, TEXT) TO authenticated;

-- ── O card de acompanhamento (Configurações › Geral) ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_natal_abertura_painel()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'liberacao', (
      SELECT jsonb_build_object('liberado_em', l.liberado_em, 'liberado_por_nome', l.liberado_por_nome)
        FROM public.natal_liberacao l WHERE l.id = 1
    ),
    'pessoas', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.nome)
        FROM (
          SELECT p.id                                        AS usuario_id,
                 p.nome,
                 COALESCE(cg.nome, p.perfil::text)           AS cargo,
                 e.nome                                      AS empresa_nome,
                 s.nome                                      AS setor_nome,
                 translate(lower(btrim(c.nome)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') AS cidade,
                 a.video,
                 a.assistiu_em,
                 a.pulou_em,
                 a.liberou_em,
                 COALESCE(a.adiou_vezes, 0)                  AS adiou_vezes
            FROM public.perfis p
            LEFT JOIN public.natal_abertura a ON a.usuario_id = p.id
            LEFT JOIN public.cargos     cg ON cg.slug = p.perfil::text
            LEFT JOIN public.empresas   e  ON e.id = p.empresa_id
            LEFT JOIN public.equipes    eq ON eq.id = p.equipe_id
            LEFT JOIN public.setores    s  ON s.id = COALESCE(p.setor_id, eq.setor_id)
            LEFT JOIN public.rh_celulas c  ON c.id = s.cidade_id
           WHERE p.ativo
             AND p.perfil::text <> 'super_admin'
        ) x
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_natal_abertura_painel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_abertura_painel() TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.natal_liberacao') IS NULL OR to_regclass('public.natal_abertura') IS NULL THEN
    RAISE EXCEPTION 'as tabelas do Natal não foram criadas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_natal_avisar' AND tgrelid = 'public.natal_liberacao'::regclass) THEN
    RAISE EXCEPTION 'trg_natal_avisar ausente';
  END IF;
END
$prova$;

COMMIT;
