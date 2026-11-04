-- ============================================================================
-- Excluir usuário: saldo e pagamento de premiação do Pix também são mês fechado
-- ============================================================================
--
-- Auditoria do fechamento de outubro (31/10/2026). A trava de 20261001120000
-- recusa excluir quem tem histórico em mês fechado (acordo, analítico, diário,
-- Pix, ajuste, comissão), mas não contava `pix_automatico_saldos` nem
-- `pix_automatico_premiacoes_pagamento` — a exclusão os apagaria ou
-- desvincularia do mês já pago. O caminho continua sendo Desligar.
--
-- Corpo de `fn_usuario_historico_em_mes_fechado` partindo do vigente no banco
-- em 31/10/2026; só os dois blocos novos. Nenhuma linha muda. Reexecutável.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_usuario_historico_em_mes_fechado(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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

  IF to_regclass('public.analitico_ajustes_manuais') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.analitico_ajustes_manuais
              WHERE operador_id = $1 AND mes_referencia < $2 AND NOT cancelado'
       INTO n USING p_user_id, v_inicio;
    IF n > 0 THEN v_partes := v_partes || format('%s ajuste(s) de recebimento', n); END IF;
  END IF;

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

  -- 31/10/2026: saldo e pagamento de premiação do Pix também são do mês.
  IF to_regclass('public.pix_automatico_saldos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.pix_automatico_saldos
              WHERE operador_id = $1 AND (criado_em AT TIME ZONE ''America/Sao_Paulo'')::DATE < $2'
       INTO n USING p_user_id, v_inicio;
    IF n > 0 THEN v_partes := v_partes || format('%s saldo(s) de Pix', n); END IF;
  END IF;

  IF to_regclass('public.pix_automatico_premiacoes_pagamento') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.pix_automatico_premiacoes_pagamento
              WHERE operador_id = $1 AND mes < $2'
       INTO n USING p_user_id, v_inicio;
    IF n > 0 THEN v_partes := v_partes || format('%s pagamento(s) de premiação do Pix', n); END IF;
  END IF;

  IF cardinality(v_partes) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN array_to_string(v_partes, ', ');
END;
$function$;

COMMIT;
