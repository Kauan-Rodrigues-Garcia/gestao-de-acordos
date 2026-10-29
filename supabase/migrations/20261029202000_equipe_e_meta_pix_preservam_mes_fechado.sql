-- ============================================================================
-- Excluir equipe e mexer em meta de Pix não podem mudar mês fechado
-- ============================================================================
--
-- Fase 1 da auditoria de fechamento (29/10/2026). Conferido em produção.
--
-- ## Os buracos
--
-- 1. `pix_automatico_metas` não tem trava de mês fechado. É a única tabela de
--    meta que ficou fora de 20261001130000: a meta de Pix de setembro pode ser
--    editada ou apagada em outubro.
--
-- 2. A tela de Equipes apaga a equipe com `DELETE` direto
--    (`AdminEquipes.confirmarExcluirEquipe`), e três tabelas descem em CASCADE:
--
--      comissao_config.equipe_id       a comissão da equipe de cada mês
--      pix_automatico_metas.equipe_id  a meta de Pix da equipe de cada mês
--      tv_paineis.equipe_id            o painel da TV (guardado por mês em
--                                      tv_paineis_mes desde 20261029200000)
--
--    Para quem não é super admin a trava de `comissao_config` barra o CASCADE
--    — mas com um erro que fala de comissão, depois de a tela já ter tirado
--    todo mundo da equipe. Para o super admin o CASCADE passa e apaga o
--    histórico de meses fechados.
--
--    O resto do que aponta para `equipes` não perde mês fechado: o retrato
--    (`composicao_mes*`) não tem FK para equipe, e `metas` guarda a equipe em
--    `referencia_id` sem FK.
--
-- ## O que entra
--
--   trg_trava_mes_fechado em pix_automatico_metas   a trava de sempre
--   fn_equipe_historico_fechado(uuid)  o que a equipe tem em mês fechado, em
--                                      texto; NULL = nada. A tela pergunta
--                                      ANTES de mover as pessoas.
--   trg_equipes_preserva_mes_fechado   a mesma pergunta no DELETE de
--                                      `equipes`, para qualquer caminho —
--                                      inclusive super admin. Apagar histórico
--                                      tem de ser um ato separado e consciente.
--
-- Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. Meta de Pix ──────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_trava_mes_fechado ON public.pix_automatico_metas;
CREATE TRIGGER trg_trava_mes_fechado
  BEFORE INSERT OR UPDATE OR DELETE ON public.pix_automatico_metas
  FOR EACH ROW EXECUTE FUNCTION public.fn_trava_mes_fechado_ano_mes('Meta de Pix');

-- ── 2. O que a equipe tem em mês fechado ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_equipe_historico_fechado(p_equipe_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_corrente TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_empresa  UUID;
  v_partes   TEXT[] := '{}';
  n          BIGINT;
BEGIN
  SELECT empresa_id INTO v_empresa FROM public.equipes WHERE id = p_equipe_id;
  IF v_empresa IS NULL THEN RETURN NULL; END IF;

  IF auth.uid() IS NOT NULL AND NOT public.fn_can_access_empresa(v_empresa) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO n FROM public.comissao_config
   WHERE equipe_id = p_equipe_id AND public.fn_mes_texto(ano, mes) < v_corrente;
  IF n > 0 THEN v_partes := v_partes || format('comissão de %s mês(es) fechado(s)', n); END IF;

  SELECT count(*) INTO n FROM public.pix_automatico_metas
   WHERE equipe_id = p_equipe_id AND public.fn_mes_texto(ano, mes) < v_corrente;
  IF n > 0 THEN v_partes := v_partes || format('meta de Pix de %s mês(es) fechado(s)', n); END IF;

  IF cardinality(v_partes) = 0 THEN RETURN NULL; END IF;
  RETURN array_to_string(v_partes, ', ');
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_equipe_historico_fechado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_equipe_historico_fechado(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_equipes_preserva_mes_fechado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hist TEXT;
BEGIN
  v_hist := public.fn_equipe_historico_fechado(OLD.id);
  IF v_hist IS NOT NULL THEN
    RAISE EXCEPTION
      'MES_FECHADO_EQUIPE: a equipe «%» tem % — excluir apagaria esse histórico. O retrato do mês continua guardando a equipe; para tirá-la da operação, deixe-a sem pessoas.',
      OLD.nome, v_hist
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_equipes_preserva_mes_fechado ON public.equipes;
CREATE TRIGGER trg_equipes_preserva_mes_fechado
  BEFORE DELETE ON public.equipes
  FOR EACH ROW EXECUTE FUNCTION public.fn_equipes_preserva_mes_fechado();

COMMIT;
