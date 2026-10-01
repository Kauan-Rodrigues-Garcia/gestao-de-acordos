-- ============================================================================
-- Excluir usuário não pode mudar mês fechado
-- ============================================================================
--
-- ## O buraco (achado na virada de 01/10/2026)
--
-- Excluir alguém leva junto, por desenho, o que é dele:
--
--   acordos                  apagados por `fn_admin_apagar_acordos_do_usuario`
--   pix_automatico_acordos   ON DELETE CASCADE (só o pago é barrado antes)
--   analitico_recebimentos   ON DELETE SET NULL — a linha fica, sem dono
--   diario_recebimentos      ON DELETE SET NULL
--   comissao_config_usuarios ON DELETE CASCADE — a exceção de comissão do mês
--   comissao_bonus_usuarios  ON DELETE CASCADE — o bônus do mês
--
-- Para o mês corrente é o que se quer. Para um mês FECHADO, cada um desses
-- muda um número já apresentado: o dinheiro sai do card da equipe, do ranking
-- e dos quartis (o total do setor fica, porque soma pelo carimbo), o Pix e a
-- comissão de setembro encolhem, e os acordos de setembro somem do Dashboard.
--
-- A regra (Cleber, 01/10/2026): «nada muda no mês passado, mesmo se eu
-- excluir um usuário». Quem trabalhou num mês fechado sai da operação por
-- «Desligar», que tira o login e preserva tudo.
--
-- ## O que entra
--
--   fn_usuario_historico_em_mes_fechado(uuid)  o que a pessoa tem em mês
--                                              fechado, em texto; NULL = nada
--   fn_exigir_sem_historico_fechado(uuid)      levanta MES_FECHADO_USUARIO
--   fn_admin_delete_user                       chama a exigência ANTES de
--                                              apagar qualquer coisa
--   trg_perfis_preserva_mes_fechado            a mesma exigência no DELETE de
--                                              `perfis` — cobre exclusão por
--                                              qualquer outro caminho (painel
--                                              do Supabase, API de admin)
--
-- `fn_admin_delete_user` NÃO é reescrita a partir de uma cópia: o corpo
-- vigente no banco recebe só a linha nova, pelo mesmo método de
-- `20260906120000` — uma cópia velha desfaria correções aplicadas pelo editor
-- SQL. Se o ponto de inserção não for achado, a migration para sem gravar nada.
--
-- Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── O que a pessoa tem em mês fechado ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_usuario_historico_em_mes_fechado(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- O 1º dia do mês corrente em São Paulo: tudo antes disso é mês fechado.
  v_inicio  DATE := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE;
  v_anomes  INTEGER;
  v_partes  TEXT[] := '{}';
  v_empresa UUID;
  n         BIGINT;
BEGIN
  SELECT empresa_id INTO v_empresa FROM public.perfis WHERE id = p_user_id;

  -- Quem pergunta precisa poder excluir aquela pessoa. Sem sessão (gatilho
  -- disparado pelo dono, API de admin) a pergunta é do próprio banco.
  IF auth.uid() IS NOT NULL AND NOT (
    public.fn_can_access_empresa(v_empresa) AND public.fn_user_tem('usuarios_excluir')
  ) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;

  v_anomes := extract(year FROM v_inicio)::INTEGER * 100 + extract(month FROM v_inicio)::INTEGER;

  SELECT count(*) INTO n FROM public.acordos
   WHERE operador_id = p_user_id AND vencimento < v_inicio;
  IF n > 0 THEN v_partes := v_partes || format('%s acordo(s)', n); END IF;

  SELECT count(*) INTO n FROM public.analitico_recebimentos
   WHERE operador_id = p_user_id AND data_pagamento < v_inicio;
  IF n > 0 THEN v_partes := v_partes || format('%s pagamento(s) no analítico', n); END IF;

  SELECT count(*) INTO n FROM public.diario_recebimentos
   WHERE operador_id = p_user_id AND dia_referencia < v_inicio;
  IF n > 0 THEN v_partes := v_partes || format('%s linha(s) do recebimento diário', n); END IF;

  SELECT count(*) INTO n FROM public.pix_automatico_acordos
   WHERE operador_id = p_user_id
     AND (criado_em AT TIME ZONE 'America/Sao_Paulo')::DATE < v_inicio;
  IF n > 0 THEN v_partes := v_partes || format('%s registro(s) de Pix', n); END IF;

  IF to_regclass('public.comissao_config_usuarios') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.comissao_config_usuarios
              WHERE usuario_id = $1 AND ano * 100 + mes < $2'
       INTO n USING p_user_id, v_anomes;
    IF n > 0 THEN v_partes := v_partes || format('%s exceção(ões) de comissão', n); END IF;
  END IF;

  IF to_regclass('public.comissao_bonus_usuarios') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.comissao_bonus_usuarios bu
               JOIN public.comissao_bonus b ON b.id = bu.bonus_id
              WHERE bu.usuario_id = $1 AND b.ano * 100 + b.mes < $2'
       INTO n USING p_user_id, v_anomes;
    IF n > 0 THEN v_partes := v_partes || format('%s bônus de comissão', n); END IF;
  END IF;

  IF cardinality(v_partes) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN array_to_string(v_partes, ', ');
END;
$function$;

COMMENT ON FUNCTION public.fn_usuario_historico_em_mes_fechado(uuid) IS
  'O que a pessoa tem em mes ja fechado (acordos, analitico, diario, Pix, comissao), '
  'em texto. NULL = nada: pode ser excluida sem mudar mes fechado (20261001120000).';

REVOKE ALL ON FUNCTION public.fn_usuario_historico_em_mes_fechado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_usuario_historico_em_mes_fechado(uuid) TO authenticated;

-- ── A exigência ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_exigir_sem_historico_fechado(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hist TEXT := public.fn_usuario_historico_em_mes_fechado(p_user_id);
BEGIN
  IF v_hist IS NOT NULL THEN
    RAISE EXCEPTION
      'MES_FECHADO_USUARIO: esta pessoa tem histórico em mês já fechado (%). Excluir mudaria números de um mês fechado. Use «Desligar» na aba Usuários: o login é bloqueado e o histórico fica.',
      v_hist
      USING ERRCODE = '23503';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_exigir_sem_historico_fechado(uuid) FROM PUBLIC, anon, authenticated;

-- ── O gatilho em `perfis` ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_perfis_preserva_mes_fechado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_exigir_sem_historico_fechado(OLD.id);
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_perfis_preserva_mes_fechado ON public.perfis;
CREATE TRIGGER trg_perfis_preserva_mes_fechado
  BEFORE DELETE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_perfis_preserva_mes_fechado();

-- ── `fn_admin_delete_user`: a exigência antes de apagar qualquer coisa ──────
--
-- O gatilho sozinho chegaria tarde para os acordos: a função os apaga ANTES de
-- excluir o perfil, e o gatilho já não os veria. A transação seria desfeita do
-- mesmo jeito pelo analítico ou pelo Pix, mas quem tem só acordo passaria.
DO $patch$
DECLARE
  v_src    TEXT;
  v_ancora CONSTANT TEXT := 'IF p_apagar_acordos THEN';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_admin_delete_user';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'fn_admin_delete_user não existe — confira antes de seguir.';
  END IF;

  IF position('fn_exigir_sem_historico_fechado' IN v_src) > 0 THEN
    RAISE NOTICE 'fn_admin_delete_user já exige histórico fechado. Nada a fazer.';
    RETURN;
  END IF;

  IF position(v_ancora IN v_src) = 0 THEN
    RAISE EXCEPTION
      'Ponto de inserção «%» não achado em fn_admin_delete_user. Ajuste à mão em vez de gravar pela metade.',
      v_ancora;
  END IF;

  v_src := replace(
    v_src,
    v_ancora,
    E'-- Mês fechado não muda por exclusão (20261001120000).\n'
    || E'  PERFORM public.fn_exigir_sem_historico_fechado(p_user_id);\n\n  '
    || v_ancora
  );

  EXECUTE v_src;
END
$patch$;

COMMIT;

-- ── Conferência. SOMENTE LEITURA, rode depois ───────────────────────────────
-- Espere `true` nas duas colunas.
SELECT position('fn_exigir_sem_historico_fechado' IN pg_get_functiondef(p.oid)) > 0 AS exclusao_exige,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_perfis_preserva_mes_fechado') AS gatilho
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'fn_admin_delete_user';
