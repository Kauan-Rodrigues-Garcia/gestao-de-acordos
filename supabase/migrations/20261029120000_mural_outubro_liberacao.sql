-- ============================================================================
-- Mural de Outubro: liberar para o pessoal e soltar a abertura
-- 29/10/2026 · pedido do Kauan
-- ============================================================================
--
-- O mural (src/components/PortalOutubro) só aparecia no `npm run dev`. Agora
-- o super_admin libera pelo botão em Configurações > Geral:
--
--   liberado   o bueiro e os avisos aparecem para todo mundo, no ponto da
--              semana em que estamos (a hora decide: quinta treme e avisa
--              «Amanhã, às 16h.»; sexta conta até as 16h).
--   abre_em    o botão «Soltar a abertura»: um minuto depois do clique, a
--              contagem grande termina, a tela desmancha e o mural aparece
--              para todos ao mesmo tempo. Vazio = sexta 30/10, 16h (o
--              horário de sempre, decidido na tela).
--
-- «Na hora» é o caminho do jumpscare (20261023160000): um Broadcast `mudou`
-- no tópico `permissoes:<empresa>` de todas as empresas; cada tela relê a
-- linha e marca o relógio pela hora do banco. A abertura em si não lê nada
-- do banco (o retrato do mural está congelado no código).
--
-- Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.mural_outubro (
  id                   SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  liberado             BOOLEAN NOT NULL DEFAULT FALSE,
  abre_em              TIMESTAMPTZ,
  atualizado_por       UUID,
  atualizado_por_nome  TEXT,
  atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.mural_outubro IS
  'Uma linha = a liberação do Mural de Outubro (bueiro da semana e abertura). Escrita só por '
  'fn_mural_outubro_liberar / _soltar / _cancelar (super_admin). Ver 20261029120000.';

INSERT INTO public.mural_outubro (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.mural_outubro ENABLE ROW LEVEL SECURITY;
-- Sem policy: a leitura é `fn_mural_outubro_ler`, que devolve o relógio do banco junto.
REVOKE ALL ON public.mural_outubro FROM anon, authenticated;
GRANT ALL ON public.mural_outubro TO service_role;

-- ── O aviso: todas as empresas ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mural_outubro_avisar()
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
      jsonb_build_object('tabela', 'mural_outubro', 'operacao', tg_op, 'importado_por', '[]'::jsonb),
      'mudou',
      'permissoes:' || v_empresa::text,
      true);
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_mural_outubro_avisar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mural_outubro_avisar ON public.mural_outubro;
CREATE TRIGGER trg_mural_outubro_avisar
  AFTER INSERT OR UPDATE OR DELETE ON public.mural_outubro
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_mural_outubro_avisar();

-- ── Ler ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mural_outubro_ler()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'agora',    now(),
    'liberado', coalesce(m.liberado, false),
    'abre_em',  m.abre_em,
    'atualizado_por_nome', CASE WHEN (SELECT public.fn_user_is_super_admin()) THEN m.atualizado_por_nome END,
    'atualizado_em',       CASE WHEN (SELECT public.fn_user_is_super_admin()) THEN m.atualizado_em END)
  FROM (SELECT 1) um
  LEFT JOIN public.mural_outubro m ON m.id = 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_mural_outubro_ler() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mural_outubro_ler() TO authenticated;

-- ── Liberar / recolher ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mural_outubro_liberar(p_liberado boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin libera o mural' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.mural_outubro AS m (id, liberado, atualizado_por, atualizado_por_nome, atualizado_em)
  VALUES (1, coalesce(p_liberado, false), auth.uid(),
          (SELECT p.nome FROM public.perfis p WHERE p.id = auth.uid()), now())
  ON CONFLICT (id) DO UPDATE
    SET liberado = excluded.liberado, atualizado_por = excluded.atualizado_por,
        atualizado_por_nome = excluded.atualizado_por_nome, atualizado_em = excluded.atualizado_em;
  RETURN public.fn_mural_outubro_ler();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_mural_outubro_liberar(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mural_outubro_liberar(boolean) TO authenticated;

-- ── Soltar a abertura: daqui a 1 minuto, para todos (e libera junto) ────────
-- O minuto é a contagem grande no meio da tela, e o tempo de o aviso chegar a
-- todas as telas. A hora é a do banco: ninguém depende do relógio do próprio PC.
CREATE OR REPLACE FUNCTION public.fn_mural_outubro_soltar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin solta a abertura do mural' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.mural_outubro AS m (id, liberado, abre_em, atualizado_por, atualizado_por_nome, atualizado_em)
  VALUES (1, true, now() + interval '1 minute', auth.uid(),
          (SELECT p.nome FROM public.perfis p WHERE p.id = auth.uid()), now())
  ON CONFLICT (id) DO UPDATE
    SET liberado = true, abre_em = excluded.abre_em, atualizado_por = excluded.atualizado_por,
        atualizado_por_nome = excluded.atualizado_por_nome, atualizado_em = excluded.atualizado_em;
  RETURN public.fn_mural_outubro_ler();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_mural_outubro_soltar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mural_outubro_soltar() TO authenticated;

-- ── Cancelar a abertura solta (volta para sexta 16h) ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mural_outubro_cancelar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin cancela a abertura do mural' USING ERRCODE = '42501';
  END IF;
  UPDATE public.mural_outubro
     SET abre_em = NULL, atualizado_por = auth.uid(),
         atualizado_por_nome = (SELECT p.nome FROM public.perfis p WHERE p.id = auth.uid()),
         atualizado_em = now()
   WHERE id = 1 AND abre_em IS NOT NULL;
  RETURN public.fn_mural_outubro_ler();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_mural_outubro_cancelar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mural_outubro_cancelar() TO authenticated;

-- ── Prova ──────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.mural_outubro') IS NULL THEN
    RAISE EXCEPTION 'mural_outubro: faltou a tabela';
  END IF;
  IF has_table_privilege('authenticated', 'public.mural_outubro', 'INSERT')
     OR has_table_privilege('authenticated', 'public.mural_outubro', 'SELECT') THEN
    RAISE EXCEPTION 'mural_outubro: tabela aberta demais';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_mural_outubro_avisar()', 'EXECUTE') THEN
    RAISE EXCEPTION 'mural_outubro: função interna aberta demais';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mural_outubro_avisar') THEN
    RAISE EXCEPTION 'mural_outubro: faltou o gatilho do aviso';
  END IF;
  IF (SELECT liberado FROM public.mural_outubro WHERE id = 1) IS NOT FALSE
     AND NOT EXISTS (SELECT 1 FROM public.mural_outubro WHERE id = 1 AND atualizado_por IS NOT NULL) THEN
    RAISE EXCEPTION 'mural_outubro: deveria nascer fechado';
  END IF;
END;
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Para desfazer ──────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.fn_mural_outubro_cancelar(), public.fn_mural_outubro_soltar(),
--   public.fn_mural_outubro_liberar(boolean), public.fn_mural_outubro_ler();
-- DROP TABLE IF EXISTS public.mural_outubro;  (leva o gatilho junto)
-- DROP FUNCTION IF EXISTS public.fn_mural_outubro_avisar();
