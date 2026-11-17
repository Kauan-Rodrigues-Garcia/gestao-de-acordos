-- ============================================================================
-- Chips Físicos 2.0 — etiquetas, dias ativo, lembrete e o aviso do fim do tempo
-- ============================================================================
--
-- Pedido do Cleber, 17/11/2026 («Meus Chips 2.0»):
--
--   1. etiquetas no chip (Movimentando, Principal, Reserva, Aquecendo,
--      Campanha, Sem crédito) — a liderança vê qual chip a pessoa movimenta;
--   2. quantos dias o chip ficou ATIVO;
--   3. a pessoa cria um temporizador próprio (lembrete com texto);
--   4. AVISO quando o tempo acaba. Conferido em 17/11: o tempo do status nunca
--      avisou ninguém — só o Controle de Números tinha robô
--      (`numeros-avisar-prazos`). A tela mostrava «Tempo encerrado» e só quem
--      estivesse olhando via.
--
-- ## Dias ativo
--
-- `ativo_acumulado_seg` soma cada período em Ativo quando o chip SAI de Ativo.
-- Dias ativo = acumulado + (agora − status_desde, se está Ativo agora). Os
-- períodos de antes desta migration não estão em lugar nenhum: o acumulado
-- começa em 0 e o período atual conta desde `status_desde`.
--
-- E clicar «Ativo» num chip que já está Ativo não zera mais o relógio: antes a
-- RPC regravava `status_desde` em toda chamada.
--
-- ## O aviso
--
-- `fn_chips_fisicos_avisar()` a cada minuto (pg_cron), no mesmo molde de
-- `fn_numeros_avisar_prazos`: avisa o dono do chip e quem marcou (sem
-- repetir), e grava `*_notificado_em` para não avisar duas vezes. Rota
-- `/meus-chips`.
--
-- Escrita de dados: nenhuma (colunas novas com padrão).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

-- ── 1. Colunas ───────────────────────────────────────────────────────────────
ALTER TABLE public.chips_fisicos
  ADD COLUMN IF NOT EXISTS etiquetas              TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ativo_acumulado_seg    BIGINT      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prazo_notificado_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lembrete_texto         TEXT,
  ADD COLUMN IF NOT EXISTS lembrete_ate           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lembrete_por           UUID,
  ADD COLUMN IF NOT EXISTS lembrete_notificado_em TIMESTAMPTZ;

ALTER TABLE public.chips_fisicos DROP CONSTRAINT IF EXISTS chips_fisicos_etiquetas;
ALTER TABLE public.chips_fisicos
  ADD CONSTRAINT chips_fisicos_etiquetas
  CHECK (etiquetas <@ ARRAY['movimentando', 'principal', 'reserva', 'aquecendo',
                            'campanha', 'sem_credito']::TEXT[]);

ALTER TABLE public.chips_fisicos DROP CONSTRAINT IF EXISTS chips_fisicos_lembrete;
ALTER TABLE public.chips_fisicos
  ADD CONSTRAINT chips_fisicos_lembrete
  CHECK ((lembrete_ate IS NULL AND lembrete_texto IS NULL)
         OR (lembrete_ate IS NOT NULL AND lembrete_texto IS NOT NULL
             AND char_length(lembrete_texto) BETWEEN 1 AND 80));

-- A fila do robô: só o que ainda não avisou.
CREATE INDEX IF NOT EXISTS idx_chips_fisicos_prazo_aviso
  ON public.chips_fisicos (prazo_ate) WHERE prazo_ate IS NOT NULL AND prazo_notificado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_chips_fisicos_lembrete_aviso
  ON public.chips_fisicos (lembrete_ate) WHERE lembrete_ate IS NOT NULL AND lembrete_notificado_em IS NULL;

-- ── 2. Status: acumula os dias ativo e rearma o aviso ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_chips_fisicos_alterar_status(
  p_id      UUID,
  p_status  TEXT,
  p_minutos INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu    UUID := (SELECT auth.uid());
  v_atual public.chips_fisicos%ROWTYPE;
  v_agora TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_atual FROM public.chips_fisicos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chip não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_chips_fisicos_pode_cuidar(v_atual.operador_id) THEN
    RAISE EXCEPTION 'Você não pode alterar este chip.' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('ativo', 'restricao', 'banido', 'recuperar') THEN
    RAISE EXCEPTION 'Status desconhecido.' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'ativo' AND p_minutos IS NOT NULL THEN
    RAISE EXCEPTION 'Chip ativo não leva tempo.' USING ERRCODE = '22023';
  END IF;
  IF p_minutos IS NOT NULL AND (p_minutos < 1 OR p_minutos > 1440) THEN
    RAISE EXCEPTION 'O tempo vai de 1 minuto a 24 horas.' USING ERRCODE = '22023';
  END IF;

  -- Ativo de novo em quem já está Ativo: nada muda, o relógio dos dias segue.
  IF p_status = 'ativo' AND v_atual.status = 'ativo' THEN
    RETURN;
  END IF;

  UPDATE public.chips_fisicos
     SET status              = p_status,
         status_desde        = v_agora,
         prazo_ate           = CASE WHEN p_minutos IS NULL THEN NULL
                                    ELSE v_agora + make_interval(mins => p_minutos) END,
         prazo_notificado_em = NULL,
         -- Saindo de Ativo, o período que acabou entra no acumulado.
         ativo_acumulado_seg = ativo_acumulado_seg
           + CASE WHEN v_atual.status = 'ativo'
                  THEN GREATEST(EXTRACT(EPOCH FROM (v_agora - v_atual.status_desde))::BIGINT, 0)
                  ELSE 0 END,
         status_por          = v_eu,
         status_por_nome     = (SELECT p.nome FROM public.perfis p WHERE p.id = v_eu),
         atualizado_em       = v_agora
   WHERE id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chips_fisicos_alterar_status(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chips_fisicos_alterar_status(UUID, TEXT, INTEGER) TO authenticated;

-- ── 3. Etiquetas ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chips_fisicos_etiquetas(p_id UUID, p_etiquetas TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_dono UUID;
  v_lista TEXT[];
BEGIN
  SELECT operador_id INTO v_dono FROM public.chips_fisicos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chip não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_chips_fisicos_pode_cuidar(v_dono) THEN
    RAISE EXCEPTION 'Você não pode alterar este chip.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT e ORDER BY e), '{}')
    INTO v_lista
    FROM unnest(COALESCE(p_etiquetas, '{}')) e
   WHERE e IS NOT NULL AND e <> '';

  IF NOT v_lista <@ ARRAY['movimentando', 'principal', 'reserva', 'aquecendo',
                          'campanha', 'sem_credito']::TEXT[] THEN
    RAISE EXCEPTION 'Etiqueta desconhecida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.chips_fisicos
     SET etiquetas = v_lista, atualizado_em = NOW()
   WHERE id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chips_fisicos_etiquetas(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chips_fisicos_etiquetas(UUID, TEXT[]) TO authenticated;

-- ── 4. Lembrete (o temporizador da pessoa) ───────────────────────────────────
-- `p_minutos` nulo apaga o lembrete. Até 7 dias.
CREATE OR REPLACE FUNCTION public.fn_chips_fisicos_lembrete(
  p_id UUID, p_texto TEXT, p_minutos INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu    UUID := (SELECT auth.uid());
  v_dono  UUID;
  v_texto TEXT := NULLIF(TRIM(p_texto), '');
BEGIN
  SELECT operador_id INTO v_dono FROM public.chips_fisicos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chip não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_chips_fisicos_pode_cuidar(v_dono) THEN
    RAISE EXCEPTION 'Você não pode alterar este chip.' USING ERRCODE = '42501';
  END IF;

  IF p_minutos IS NULL THEN
    UPDATE public.chips_fisicos
       SET lembrete_texto = NULL, lembrete_ate = NULL, lembrete_por = NULL,
           lembrete_notificado_em = NULL, atualizado_em = NOW()
     WHERE id = p_id;
    RETURN;
  END IF;

  IF p_minutos < 1 OR p_minutos > 10080 THEN
    RAISE EXCEPTION 'O lembrete vai de 1 minuto a 7 dias.' USING ERRCODE = '22023';
  END IF;
  IF v_texto IS NULL THEN
    RAISE EXCEPTION 'Escreva do que é o lembrete.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_texto) > 80 THEN
    RAISE EXCEPTION 'O lembrete passa de 80 caracteres.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.chips_fisicos
     SET lembrete_texto = v_texto,
         lembrete_ate = NOW() + make_interval(mins => p_minutos),
         lembrete_por = v_eu,
         lembrete_notificado_em = NULL,
         atualizado_em = NOW()
   WHERE id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chips_fisicos_lembrete(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chips_fisicos_lembrete(UUID, TEXT, INTEGER) TO authenticated;

-- ── 5. O aviso ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chips_fisicos_avisar()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r       RECORD;
  v_total INTEGER := 0;
  v_num   TEXT;
BEGIN
  -- O tempo do status acabou.
  FOR r IN
    SELECT c.id, c.empresa_id, c.numero, c.status, c.operador_id, c.status_por
      FROM public.chips_fisicos c
     WHERE c.prazo_ate IS NOT NULL
       AND c.prazo_ate <= NOW()
       AND c.prazo_notificado_em IS NULL
     ORDER BY c.prazo_ate
     LIMIT 500
       FOR UPDATE OF c SKIP LOCKED
  LOOP
    v_num := '(' || left(r.numero, 2) || ') ' || substr(r.numero, 3, length(r.numero) - 6)
             || '-' || right(r.numero, 4);
    INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
    SELECT d.usuario_id, r.empresa_id,
           'Tempo do chip encerrado — ' || v_num,
           format('O tempo de %s terminou. Confira o chip e mude o status.',
                  CASE r.status WHEN 'restricao' THEN 'Restrição' WHEN 'banido' THEN 'Banido'
                                WHEN 'recuperar' THEN 'Recuperar' ELSE r.status END),
           false, '/meus-chips'
      FROM (SELECT r.operador_id AS usuario_id UNION SELECT r.status_por) d
      JOIN public.perfis p ON p.id = d.usuario_id AND p.ativo IS TRUE
     WHERE d.usuario_id IS NOT NULL;

    UPDATE public.chips_fisicos SET prazo_notificado_em = NOW() WHERE id = r.id;
    v_total := v_total + 1;
  END LOOP;

  -- O lembrete da pessoa.
  FOR r IN
    SELECT c.id, c.empresa_id, c.numero, c.lembrete_texto, c.operador_id, c.lembrete_por
      FROM public.chips_fisicos c
     WHERE c.lembrete_ate IS NOT NULL
       AND c.lembrete_ate <= NOW()
       AND c.lembrete_notificado_em IS NULL
     ORDER BY c.lembrete_ate
     LIMIT 500
       FOR UPDATE OF c SKIP LOCKED
  LOOP
    v_num := '(' || left(r.numero, 2) || ') ' || substr(r.numero, 3, length(r.numero) - 6)
             || '-' || right(r.numero, 4);
    INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
    SELECT d.usuario_id, r.empresa_id,
           'Lembrete do chip — ' || v_num,
           r.lembrete_texto,
           false, '/meus-chips'
      FROM (SELECT r.operador_id AS usuario_id UNION SELECT r.lembrete_por) d
      JOIN public.perfis p ON p.id = d.usuario_id AND p.ativo IS TRUE
     WHERE d.usuario_id IS NOT NULL;

    UPDATE public.chips_fisicos SET lembrete_notificado_em = NOW() WHERE id = r.id;
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

-- Só o agendamento chama.
REVOKE ALL ON FUNCTION public.fn_chips_fisicos_avisar() FROM PUBLIC, anon, authenticated;

-- Tempos que JÁ acabaram antes desta migration não disparam uma enxurrada de
-- avisos atrasados: entram como avisados.
UPDATE public.chips_fisicos
   SET prazo_notificado_em = NOW()
 WHERE prazo_ate IS NOT NULL AND prazo_ate <= NOW() AND prazo_notificado_em IS NULL;

DO $agenda$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'Sem pg_cron: o aviso dos chips fica sem agendamento.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chips-fisicos-avisar') THEN
    PERFORM cron.unschedule('chips-fisicos-avisar');
  END IF;
  PERFORM cron.schedule(
    'chips-fisicos-avisar', '* * * * *', 'SELECT public.fn_chips_fisicos_avisar();');

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chips-fisicos-avisar-faxina') THEN
    PERFORM cron.unschedule('chips-fisicos-avisar-faxina');
  END IF;
  PERFORM cron.schedule(
    'chips-fisicos-avisar-faxina', '29 4 * * *',
    'DELETE FROM cron.job_run_details d USING cron.job j '
    || 'WHERE d.jobid = j.jobid AND j.jobname = ''chips-fisicos-avisar'' '
    || 'AND d.end_time < NOW() - INTERVAL ''2 days'';');
END
$agenda$;

COMMIT;
