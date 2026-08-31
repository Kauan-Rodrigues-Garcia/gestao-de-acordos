-- Desligado continua inteiro até a virada do mês.
--
-- ## A regra
--
-- Marcar alguém como desligado NÃO muda mais nada no mês corrente: o
-- recebimento continua contando, a pessoa segue na equipe, no analítico e nos
-- cards, e ganha apenas uma etiqueta "Desligado" nas listas. Na virada para o
-- dia 1º ela é ARQUIVADA: some de tudo e passa a existir só na aba Desligados,
-- que é de administrador.
--
-- O motivo é de negócio: quem trabalhou até o dia 20 produziu recebimento até o
-- dia 20, e esse dinheiro é da equipe naquele mês. Tirar a pessoa no ato do
-- desligamento fazia o total da equipe encolher no meio do mês, sem que uma
-- linha do relatório tivesse mudado. Foi assim que R$ 370,00 sumiram do
-- Desempenho Equipes de agosto/2026 e continuaram no relatório do ERP.
--
-- ## O que muda no banco
--
-- 1. `fn_arquivar_desligados_ids` — mesma varredura de
--    `fn_arquivar_desligados_anteriores`, mas devolve QUEM foi arquivado. O
--    cliente precisa da lista para soltar os vínculos de acordo dessas pessoas
--    (`liberarVinculosDeDesligado`), coisa que antes acontecia no ato do
--    desligamento e agora só pode acontecer aqui.
--
-- 2. `fn_arquivar_desligados_virada` — a versão do pg_cron. Varre TODAS as
--    empresas e não checa `fn_can_access_empresa`: sob cron não existe
--    `auth.uid()`, e a checagem faria a função devolver zero em silêncio todo
--    dia 1º. Por isso ela é `service_role` apenas.
--
-- A antiga `fn_arquivar_desligados_anteriores` fica de pé, sem alteração: ela é
-- chamada pela tela de Usuários e trocar a assinatura quebraria o tipo gerado.

CREATE OR REPLACE FUNCTION public.fn_arquivar_desligados_ids(p_empresa_id UUID)
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
     SET arquivado = TRUE
   WHERE p.empresa_id = p_empresa_id
     AND p.situacao = 'desligado'
     AND p.arquivado = FALSE
     AND p.desligado_em IS NOT NULL
     -- Estritamente MENOR que o primeiro dia deste mês: quem foi desligado
     -- neste mês continua contando até a virada.
     AND p.desligado_em < date_trunc('month', now())
  RETURNING p.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_arquivar_desligados_ids(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_arquivar_desligados_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_arquivar_desligados_ids(UUID) TO service_role;

COMMENT ON FUNCTION public.fn_arquivar_desligados_ids(UUID) IS
  'Arquiva os desligados de meses anteriores e devolve QUEM foi arquivado. A '
  'lista importa: e nela que o cliente sabe de quem soltar os vinculos de '
  'acordo, que ate 31/08/2026 eram soltos no ato do desligamento.';

-- ── A virada, sem depender de alguem abrir a tela ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_arquivar_desligados_virada()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_n INTEGER;
BEGIN
  UPDATE public.perfis p
     SET arquivado = TRUE
   WHERE p.situacao = 'desligado'
     AND p.arquivado = FALSE
     AND p.desligado_em IS NOT NULL
     AND p.desligado_em < date_trunc('month', now());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_arquivar_desligados_virada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_arquivar_desligados_virada() TO service_role;

COMMENT ON FUNCTION public.fn_arquivar_desligados_virada() IS
  'Arquivamento de todas as empresas, para o pg_cron do dia 1. Sem checagem de '
  'empresa de proposito: sob cron nao existe auth.uid(), e fn_can_access_empresa '
  'devolveria falso em silencio.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('desligados-arquivar-virada')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'desligados-arquivar-virada');
    -- 00:10 de Sao Paulo = 03:10 UTC. O cron do Supabase roda em UTC, e as
    -- outras tarefas do projeto ja seguem essa conversao.
    --
    -- Todo dia, e nao so no dia 1: se a instancia estiver fora do ar na virada,
    -- a proxima execucao pega o atrasado. A varredura e barata e idempotente
    -- (`arquivado = FALSE` no WHERE).
    PERFORM cron.schedule('desligados-arquivar-virada', '10 3 * * *',
      'SELECT public.fn_arquivar_desligados_virada();');
  END IF;
END;
$$;
