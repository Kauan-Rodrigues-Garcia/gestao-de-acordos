-- Férias com data de retorno, e que acabam sozinhas.
--
-- ## O problema
--
-- `situacao = 'ferias'` tira a pessoa de ranking e quartil e é MANUAL nas duas
-- pontas: alguém liga, e alguém precisa lembrar de desligar. A segunda metade
-- nunca acontece. Operador que voltou em 12/08 continuava fora do analítico em
-- setembro porque ninguém reabriu a tela de Usuários para mudar o estado — e a
-- ausência não dá erro nenhum, ela só faz a pessoa não aparecer.
--
-- ## A regra
--
-- Marcar férias passa a exigir a data de RETORNO. A etiqueta vale até essa
-- data; a partir do dia seguinte a pessoa volta a ser `ativo` sozinha e
-- reaparece no analítico, sem ninguém tocar em nada.
--
-- `ferias_ate` NÃO é apagada no retorno, de propósito. Ela vira o rastro que a
-- tela de Metas usa para avisar «esta pessoa esteve de férias» — quem define a
-- meta do mês precisa saber que o operador não trabalhou o mês inteiro, senão
-- cobra cheio de quem esteve fora. O aviso morre quando a próxima meta é
-- configurada: aí a informação já foi usada, e é a tela de Metas que zera o
-- campo.
--
-- ## Por que uma coluna nova e não uma tabela de períodos
--
-- Um histórico de férias seria mais completo e não é o que a operação pede: a
-- pergunta que aparece é «esta pessoa está de férias e volta quando?», que é
-- um estado, não uma série. Quando o RH precisar do histórico, ele nasce de uma
-- tabela própria em vez de deformar esta.

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS ferias_desde DATE,
  ADD COLUMN IF NOT EXISTS ferias_ate   DATE;

COMMENT ON COLUMN public.perfis.ferias_desde IS
  'Primeiro dia das ferias. Informativo: quem manda na etiqueta e ferias_ate.';
COMMENT ON COLUMN public.perfis.ferias_ate IS
  'Ultimo dia das ferias. Passando dele a situacao volta para ativo sozinha '
  '(fn_encerrar_ferias_vencidas). NAO e apagada no retorno: e o rastro que a '
  'tela de Metas usa para avisar que a pessoa esteve fora, e e la que zera.';

-- Quem ainda está de férias, para a varredura diária não ler a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_perfis_ferias_ate
  ON public.perfis (ferias_ate)
  WHERE situacao = 'ferias' AND ferias_ate IS NOT NULL;

-- ── O retorno, por empresa (a tela chama esta) ──────────────────────────────
--
-- Devolve QUEM voltou: a tela precisa da lista para avisar na hora («2 pessoas
-- voltaram de férias») em vez de a lista mudar sem explicação.
CREATE OR REPLACE FUNCTION public.fn_encerrar_ferias_vencidas(p_empresa_id UUID)
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.perfis p
     SET situacao      = 'ativo',
         atualizado_em = NOW()
   WHERE p.empresa_id = p_empresa_id
     AND p.situacao   = 'ferias'
     AND p.ferias_ate IS NOT NULL
     -- ESTRITAMENTE menor: no ultimo dia a pessoa ainda esta de ferias.
     -- A data e a de Sao Paulo, nao a do servidor: as ferias acabam no fuso de
     -- quem trabalha, e ate as 21h de Sao Paulo o UTC ja virou o dia.
     AND p.ferias_ate < (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE
  RETURNING p.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_encerrar_ferias_vencidas(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_encerrar_ferias_vencidas(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_encerrar_ferias_vencidas(UUID) TO service_role;

COMMENT ON FUNCTION public.fn_encerrar_ferias_vencidas(UUID) IS
  'Devolve ao estado ativo quem passou da data de retorno, e diz quem voltou. '
  'ferias_ate fica: e o rastro que a tela de Metas consome.';

-- ── O retorno, todo dia, sem depender de alguém abrir a tela ────────────────
CREATE OR REPLACE FUNCTION public.fn_encerrar_ferias_diario()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_n INTEGER;
BEGIN
  UPDATE public.perfis p
     SET situacao      = 'ativo',
         atualizado_em = NOW()
   WHERE p.situacao   = 'ferias'
     AND p.ferias_ate IS NOT NULL
     AND p.ferias_ate < (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_encerrar_ferias_diario() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_encerrar_ferias_diario() TO service_role;

COMMENT ON FUNCTION public.fn_encerrar_ferias_diario() IS
  'Versao do pg_cron: todas as empresas, sem checagem de acesso — sob cron nao '
  'existe auth.uid(). Mesma razao de fn_arquivar_desligados_virada.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ferias-encerrar-vencidas')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ferias-encerrar-vencidas');
    -- 00:15 de Sao Paulo = 03:15 UTC, cinco minutos depois do arquivamento de
    -- desligados, para as duas varreduras nao disputarem a mesma conexao.
    PERFORM cron.schedule('ferias-encerrar-vencidas', '15 3 * * *',
      'SELECT public.fn_encerrar_ferias_diario();');
  END IF;
END;
$$;
