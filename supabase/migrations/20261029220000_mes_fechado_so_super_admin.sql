-- ============================================================================
-- Mês fechado: só o super admin escreve
-- ============================================================================
--
-- Fase 2 da auditoria de fechamento (29/10/2026). Decisão do Cleber, no mesmo
-- dia: «só o SuperAdmin edita um mês passado». A permissão «Escrever em mês
-- fechado» (`ignorar_fechamento_mes`) sai do produto.
--
-- REMOVE_PERMISSOES: ignorar_fechamento_mes
--
-- A linha acima é lida por `permissoes-catalogo.sql.test.ts` para subtrair a
-- chave do catálogo montado a partir das migrations (padrão de 20261021150000).
--
-- ## O que muda
--
--   fn_mes_fechado_barrar   deixa de honrar a permissão. Ela era a única função
--                           do banco que a lia (conferido em pg_proc, 29/10).
--   fn_permissoes_catalogo  perde a chave: Admin › Cargos não desenha mais o
--                           interruptor, e empresa nova não nasce com ela.
--
-- Medido antes: 3 cargos com a chave ligada, nenhuma pessoa. Eles perdem a
-- escrita em mês fechado — é a decisão.
--
-- ## O que NÃO muda
--
--   * o valor guardado em `cargos_permissoes`/`perfis_permissoes`. Chave fora do
--     catálogo cai no "ausente vale negado" de `fn_user_tem`, e nada mais a lê;
--   * importação de relatório: não passa por esta trava (nunca passou);
--   * sem sessão (cron, service role) a trava continua não se aplicando.
--
-- Só funções. Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. A barreira ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mes_fechado_barrar(p_mes text, p_oque text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_mes_fechado(p_mes) THEN RETURN; END IF;
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF public.fn_user_is_super_admin() THEN RETURN; END IF;
  RAISE EXCEPTION
    'MES_FECHADO: % de %/% — o mês está fechado, somente leitura. Só o super admin altera mês fechado.',
    p_oque, substr(p_mes, 6, 2), substr(p_mes, 1, 4)
    USING ERRCODE = '42501';
END;
$function$;

COMMENT ON FUNCTION public.fn_mes_fechado_barrar(text, text) IS
  'Levanta MES_FECHADO quando p_mes ja fechou e quem grava nao e super_admin. '
  'Sem sessao (cron/service) passa. A permissao ignorar_fechamento_mes saiu '
  'em 20261029220000.';

REVOKE ALL ON FUNCTION public.fn_mes_fechado_barrar(text, text) FROM PUBLIC, anon, authenticated;

-- ── 2. O catálogo ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_fechamento_so_super_admin_20261029()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_fechamento_so_super_admin_20261029;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_fechamento_so_super_admin_20261029() IS
  'Retrato do catalogo antes de ignorar_fechamento_mes sair (29/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT c.chave, c.tenants, c.padrao, c.explicita
    FROM public.fn_permissoes_catalogo_antes_fechamento_so_super_admin_20261029() c
   WHERE c.chave <> 'ignorar_fechamento_mes';
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261029220000 subtrai ignorar_fechamento_mes: mes '
  'fechado e so do super admin.';

-- Verificação: a chave sumiu e o resto do catálogo continua de pé.
DO $$
DECLARE
  v_total INT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'ignorar_fechamento_mes') THEN
    RAISE EXCEPTION 'chave aposentada ainda esta no catalogo';
  END IF;
  SELECT COUNT(*) INTO v_total FROM public.fn_permissoes_catalogo();
  IF v_total < 30 THEN
    RAISE EXCEPTION 'catalogo voltou so % chaves — o encadeamento quebrou', v_total;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p
              WHERE p.pronamespace = 'public'::regnamespace
                AND p.proname = 'fn_mes_fechado_barrar'
                AND p.prosrc ILIKE '%ignorar_fechamento_mes%') THEN
    RAISE EXCEPTION 'fn_mes_fechado_barrar ainda le a permissao';
  END IF;
END;
$$;

COMMIT;
