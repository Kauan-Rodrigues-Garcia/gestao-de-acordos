-- ============================================================================
-- Senha inicial: o prazo (pedido do Cleber, 10/11/2026)
-- ============================================================================
--
-- A campanha (20261110160000) foi liberada em 10/11 às 11:50. O card barra a
-- TELA de quem ainda está com a senha inicial, mas a senha continua abrindo a
-- API enquanto a pessoa não troca. O prazo fecha isso.
--
-- ## A regra
--
-- Prazo: 13/11/2026, 23:59 (horário de Brasília) — `senha_inicial_liberacao.prazo_em`.
--
-- Passou o prazo, toda conta ainda marcada (`perfis.senha_inicial_pendente`):
--
--   1. recebe uma senha aleatória que NINGUÉM conhece — a senha inicial deixa
--      de abrir a conta, na tela e na API;
--   2. tem as sessões abertas encerradas;
--   3. sai da campanha (`senha_inicial_expirada_em`) e fica com a trava de
--      sempre (`senha_troca_obrigatoria`).
--
-- Para voltar, a pessoa segue o caminho que já existe para senha esquecida: a
-- liderança pede o reset em Usuários (`fn_senha_pedir`), o super admin aprova
-- no canal «Senhas», o líder entrega a senha provisória e a pessoa cria a dela
-- ao entrar. Administrador e diretoria não passam por pedido: o super admin
-- redefine direto.
--
-- A conta do robô do 59 nunca foi marcada e não é tocada.
--
-- ## Objetos
--
--   senha_inicial_liberacao.prazo_em     o prazo (vale também se recolher e
--                                        liberar de novo: é o DEFAULT).
--   perfis.senha_inicial_expirada_em     quando a senha inicial foi anulada.
--   fn_senha_inicial_expirar()           o que o pg_cron chama; não faz nada
--                                        antes do prazo nem com a campanha
--                                        recolhida. Sem EXECUTE para ninguém.
--   fn_senha_inicial_painel()            recriada: devolve o prazo e quantas
--                                        expiraram.
--   cron `senha-inicial-expirar`         de hora em hora, minuto 7.
--
-- Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. O prazo ──────────────────────────────────────────────────────────────

ALTER TABLE public.senha_inicial_liberacao
  ADD COLUMN IF NOT EXISTS prazo_em TIMESTAMPTZ NOT NULL DEFAULT '2026-11-13 23:59:59-03';

COMMENT ON COLUMN public.senha_inicial_liberacao.prazo_em IS
  'Depois deste instante a senha inicial é anulada em quem não trocou (fn_senha_inicial_expirar). 20261110180000.';

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS senha_inicial_expirada_em TIMESTAMPTZ;

COMMENT ON COLUMN public.perfis.senha_inicial_expirada_em IS
  'A pessoa não trocou a senha inicial até o prazo: a senha foi anulada e ela volta por pedido de reset. 20261110180000.';

-- ── 2. Anular a senha inicial de quem não trocou ────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_senha_inicial_expirar()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_prazo TIMESTAMPTZ;
  v_ids   UUID[];
BEGIN
  SELECT l.prazo_em INTO v_prazo FROM public.senha_inicial_liberacao l WHERE l.id = 1;
  IF v_prazo IS NULL OR now() < v_prazo THEN
    RETURN 0;
  END IF;

  SELECT array_agg(p.id) INTO v_ids FROM public.perfis p WHERE p.senha_inicial_pendente;
  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  -- Uma senha aleatória por conta (24 bytes), que não é guardada em lugar
  -- nenhum: só o hash. A pessoa volta por pedido de reset.
  UPDATE auth.users u
     SET encrypted_password = extensions.crypt(
           encode(extensions.gen_random_bytes(24), 'base64'), extensions.gen_salt('bf', 10)),
         updated_at = now()
   WHERE u.id = ANY (v_ids);

  -- Quem estava logado com a senha inicial sai. Se o papel não puder apagar
  -- sessões, a senha já foi anulada: o token vence sozinho em até 1 hora.
  BEGIN
    DELETE FROM auth.sessions s WHERE s.user_id = ANY (v_ids);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'senha inicial: sessões não encerradas (%)', SQLERRM;
  END;

  UPDATE public.perfis p
     SET senha_inicial_pendente    = FALSE,
         senha_inicial_expirada_em = now(),
         senha_troca_obrigatoria   = TRUE,
         senha_alterada            = FALSE
   WHERE p.id = ANY (v_ids);

  RETURN cardinality(v_ids);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_inicial_expirar() FROM PUBLIC, anon, authenticated;

-- ── 3. O andamento, agora com o prazo ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_senha_inicial_painel()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_em        TIMESTAMPTZ;
  v_por       TEXT;
  v_prazo     TIMESTAMPTZ;
  v_pendentes INTEGER;
  v_trocaram  INTEGER;
  v_expiradas INTEGER;
  v_setores   JSONB;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin vê o andamento' USING ERRCODE = '42501';
  END IF;

  SELECT l.liberado_em, l.liberado_por_nome, l.prazo_em INTO v_em, v_por, v_prazo
    FROM public.senha_inicial_liberacao l WHERE l.id = 1;

  SELECT count(*) INTO v_pendentes
    FROM public.perfis p
   WHERE p.senha_inicial_pendente
     AND p.ativo AND NOT p.arquivado
     AND p.situacao IS DISTINCT FROM 'desligado';

  SELECT count(*) INTO v_trocaram
    FROM public.perfis p
   WHERE p.senha_inicial_trocada_em IS NOT NULL;

  -- Ativos que perderam o prazo e ainda não voltaram por pedido de reset.
  SELECT count(*) INTO v_expiradas
    FROM public.perfis p
   WHERE p.senha_inicial_expirada_em IS NOT NULL
     AND p.senha_troca_obrigatoria
     AND p.ativo AND NOT p.arquivado
     AND p.situacao IS DISTINCT FROM 'desligado';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('setor', x.setor, 'pendentes', x.pendentes)
                            ORDER BY x.pendentes DESC, x.setor), '[]'::jsonb)
    INTO v_setores
    FROM (
      SELECT COALESCE(s.nome, 'Sem setor') AS setor, count(*) AS pendentes
        FROM public.perfis p
        LEFT JOIN public.setores s ON s.id = p.setor_id
       WHERE (p.senha_inicial_pendente
              OR (p.senha_inicial_expirada_em IS NOT NULL AND p.senha_troca_obrigatoria))
         AND p.ativo AND NOT p.arquivado
         AND p.situacao IS DISTINCT FROM 'desligado'
       GROUP BY 1
    ) x;

  RETURN jsonb_build_object(
    'liberado_em',       v_em,
    'liberado_por_nome', v_por,
    'prazo_em',          v_prazo,
    'pendentes',         v_pendentes,
    'trocaram',          v_trocaram,
    'expiradas',         v_expiradas,
    'por_setor',         v_setores);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_inicial_painel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_inicial_painel() TO authenticated;

-- ── 4. De hora em hora ──────────────────────────────────────────────────────

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('senha-inicial-expirar', '7 * * * *',
      $job$SELECT public.fn_senha_inicial_expirar()$job$);
  END IF;
END
$cron$;

COMMIT;
