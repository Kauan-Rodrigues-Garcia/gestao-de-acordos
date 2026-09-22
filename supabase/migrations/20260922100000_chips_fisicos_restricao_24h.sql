-- ============================================================================
-- Chips Fisicos — status Restricao e tempo de ate 24 horas
-- ============================================================================
--
-- Pedido de 22/09/2026, depois de ver a tela de 20260921160000:
--
--   1. um quarto status, «Restricao» (o WhatsApp restringiu o chip por um
--      tempo), ao lado de Ativo, Banido e Recuperar;
--   2. o tempo para o chip voltar vai ate 24 horas (era 12);
--   3. o tempo vale em todo status fora de Ativo — Restricao inclusive.
--
-- O item 3 ja era a regra (`status <> 'ativo'` no CHECK e na RPC): o status
-- novo entra nela sem mudar nada.
--
-- ## Depende de 20260921160000
--
-- A tabela e a RPC nascem la. Esta migration so troca dois CHECKs e redefine
-- `fn_chips_fisicos_alterar_status`. Rodar sem a anterior falha logo no
-- primeiro ALTER — nada fica pela metade (transacao unica).
--
-- Re-executavel: os CHECKs sao derrubados com IF EXISTS e recriados, a
-- funcao e CREATE OR REPLACE.
--
-- ## Por que nao editar a 20260921160000
--
-- Ela pode ja ter sido colada no SQL Editor (que nao registra versao — ver o
-- CLAUDE.md). Editar o arquivo deixaria o banco e o repositorio discordando
-- sem ninguem saber. Uma migration nova vale nos dois casos.
--
-- Escrita de dados: nenhuma. As linhas existentes cabem nos CHECKs novos,
-- que so alargam (um status a mais, um teto maior).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

-- ============================================================================
-- 1. Os CHECKs
-- ============================================================================

ALTER TABLE public.chips_fisicos DROP CONSTRAINT IF EXISTS chips_fisicos_status;
ALTER TABLE public.chips_fisicos
  ADD CONSTRAINT chips_fisicos_status
  CHECK (status IN ('ativo', 'restricao', 'banido', 'recuperar'));

-- Tempo so fora de Ativo, e no maximo 24 horas.
ALTER TABLE public.chips_fisicos DROP CONSTRAINT IF EXISTS chips_fisicos_prazo;
ALTER TABLE public.chips_fisicos
  ADD CONSTRAINT chips_fisicos_prazo
  CHECK (prazo_ate IS NULL
         OR (status <> 'ativo'
             AND prazo_ate > status_desde
             AND prazo_ate <= status_desde + INTERVAL '24 hours'));

COMMENT ON TABLE public.chips_fisicos IS
  'Chips fisicos que cada pessoa tem, com status (ativo, restricao, banido, '
  'recuperar) e tempo opcional de ate 24 h fora de ativo. Separado do Controle '
  'de Numeros. Escrita so pelas RPCs fn_chips_fisicos_*. Ver 20260921160000 e '
  '20260922100000.';

-- ============================================================================
-- 2. A RPC do status
-- ============================================================================
--
-- O corpo de 20260921160000 com duas trocas: o status novo na lista e o teto
-- de 720 para 1440 minutos. `p_minutos` nulo = sem tempo; Ativo nao leva.

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

  UPDATE public.chips_fisicos
     SET status          = p_status,
         status_desde    = v_agora,
         prazo_ate       = CASE WHEN p_minutos IS NULL THEN NULL
                                ELSE v_agora + make_interval(mins => p_minutos) END,
         status_por      = v_eu,
         status_por_nome = (SELECT p.nome FROM public.perfis p WHERE p.id = v_eu),
         atualizado_em   = v_agora
   WHERE id = p_id;
END;
$function$;

-- CREATE OR REPLACE mantem os privilegios; repetidos para a migration valer
-- sozinha na leitura.
REVOKE ALL ON FUNCTION public.fn_chips_fisicos_alterar_status(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chips_fisicos_alterar_status(UUID, TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- 3. Prova
-- ============================================================================

DO $prova$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.chips_fisicos'::regclass AND conname = 'chips_fisicos_status';
  IF v_def IS NULL OR v_def NOT LIKE '%restricao%' THEN
    RAISE EXCEPTION 'chips_fisicos_status nao aceita restricao: %', v_def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.chips_fisicos'::regclass AND conname = 'chips_fisicos_prazo';
  IF v_def IS NULL OR v_def !~ '24:00:00|24 hours' THEN
    RAISE EXCEPTION 'chips_fisicos_prazo nao ficou em 24 horas: %', v_def;
  END IF;

  IF pg_get_functiondef('public.fn_chips_fisicos_alterar_status(uuid,text,integer)'::regprocedure)
       NOT LIKE '%1440%' THEN
    RAISE EXCEPTION 'fn_chips_fisicos_alterar_status nao ficou com o teto de 24 horas.';
  END IF;

  IF has_function_privilege('anon', 'public.fn_chips_fisicos_alterar_status(uuid,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_chips_fisicos_alterar_status ficou aberta para anon.';
  END IF;
END
$prova$;

COMMIT;
