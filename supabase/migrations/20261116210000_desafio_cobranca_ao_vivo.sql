-- ============================================================================
-- Desafio Cobrança ao vivo: o banco avisa quando o placar muda (16/11/2026)
-- ============================================================================
--
-- Pedido do usuário: «assim que um valor for atualizado, deve atualizar para
-- quem está olhando, nem que demore uns segundos, mas sem recarregar a página».
--
-- As tabelas do desafio são só do super_admin (RLS), então Postgres Changes
-- não chegaria a quem olha. Vai pelo sinal que o resto do sistema já usa
-- (20260917110000 / 20261009201000): Broadcast `desafios:<empresa>`, evento
-- `mudou`, payload `{tabela, operacao, importado_por}`. O tópico `desafios` já
-- está na policy `sinal_mudou_receber` — nada muda em `realtime.messages`.
--
-- O payload não leva valor nenhum: só «a tabela X mudou». Quem ouve relê pelo
-- `fn_desafio_cobranca_atual`, que continua decidindo quem vê o quê. Por isso
-- o sinal vai para TODAS as empresas (são poucas, e quem vê o desafio pode
-- estar com outra empresa em foco), como o do Natal (20261109150000).
--
-- Gatilhos por COMANDO, não por linha: uma leitura do 59 grava dezenas de
-- linhas e vira um sinal só. `fn_realtime_sinal_emitir` ainda junta sinais do
-- mesmo tópico numa janela de 10 s (o resto sai pelo agendador).
--
--   desafio_cobranca_leituras  → o robô do 59 subiu um lote (de hora em hora)
--   desafio_cobranca_ajustes   → o super_admin lançou ou removeu um ajuste
--   desafio_cobranca           → meta, dias, fonte, liberado…
--   desafio_cobranca_setores   → setor passou a somar / ver
--
-- `desafio_cobranca_aberturas` fica de fora de propósito: cada pessoa que abre
-- a gaveta seria um sinal para a empresa inteira.
--
-- Nunca derruba quem escreveu (o robô do 59, sobretudo): erro vira WARNING.
--
-- Ordem: pode ir antes ou depois do front. Sem ela, a tela segue relendo a
-- cada 5 minutos, como antes.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_realtime_sinal_desafio_cobranca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa uuid;
BEGIN
  BEGIN
    FOR v_empresa IN SELECT e.id FROM public.empresas e LOOP
      PERFORM public.fn_realtime_sinal_emitir('desafios:' || v_empresa::text,
        jsonb_build_object('tabela', tg_table_name, 'operacao', tg_op, 'importado_por', '[]'::jsonb));
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'desafio_cobranca: sinal de % falhou: %', tg_table_name, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_realtime_sinal_desafio_cobranca() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_realtime_sinal_desafio_cobranca_leituras ON public.desafio_cobranca_leituras;
CREATE TRIGGER trg_realtime_sinal_desafio_cobranca_leituras
  AFTER INSERT OR UPDATE OR DELETE ON public.desafio_cobranca_leituras
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_sinal_desafio_cobranca();

DROP TRIGGER IF EXISTS trg_realtime_sinal_desafio_cobranca_ajustes ON public.desafio_cobranca_ajustes;
CREATE TRIGGER trg_realtime_sinal_desafio_cobranca_ajustes
  AFTER INSERT OR UPDATE OR DELETE ON public.desafio_cobranca_ajustes
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_sinal_desafio_cobranca();

DROP TRIGGER IF EXISTS trg_realtime_sinal_desafio_cobranca ON public.desafio_cobranca;
CREATE TRIGGER trg_realtime_sinal_desafio_cobranca
  AFTER INSERT OR UPDATE OR DELETE ON public.desafio_cobranca
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_sinal_desafio_cobranca();

DROP TRIGGER IF EXISTS trg_realtime_sinal_desafio_cobranca_setores ON public.desafio_cobranca_setores;
CREATE TRIGGER trg_realtime_sinal_desafio_cobranca_setores
  AFTER INSERT OR UPDATE OR DELETE ON public.desafio_cobranca_setores
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_sinal_desafio_cobranca();

COMMIT;
