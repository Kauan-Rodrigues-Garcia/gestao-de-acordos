-- ============================================================================
-- Pedidos de reset de senha: a liderança pede, o super admin aprova
-- ============================================================================
--
-- Pedido do Cleber, 05/11/2026. O operador esquece a senha, avisa o líder, o
-- líder manda mensagem, o super admin troca para 123456 e o operador entra e
-- (talvez) troca. Agora:
--
--   • quem acessa Usuários (`ver_usuarios`) e não é super admin PEDE o reset
--     de uma pessoa do setor dele (os setores de `fn_transferencia_meus_setores`:
--     o do cadastro e os das equipes que lidera). Nunca de super admin,
--     administrador ou diretoria;
--   • o pedido chega no chat, no canal «Senhas»: o super admin vê todos, quem
--     pediu vê só os dele;
--   • aprovar roda em `api/aprovar-pedido-senha.ts`: o servidor gera uma senha
--     aleatória de 6 caracteres, redefine no GoTrue e chama
--     `fn_senha_pedido_concluir` (só service_role). A senha aparece no cartão
--     para quem pediu;
--   • quem teve a senha resetada POR PEDIDO fica com
--     `perfis.senha_troca_obrigatoria`: o sistema não deixa usar nada até ela
--     trocar a senha. O reset direto do campo «Nova senha» NÃO liga a trava
--     (decisão do Cleber, 05/11/2026).
--
-- ## A senha guardada
--
-- O líder precisa ler a senha provisória, então ela fica em texto no pedido.
-- Ela sai de lá quando a pessoa troca a senha (`fn_senha_troca_concluida`) e,
-- se ninguém trocar, depois de 7 dias (a leitura já esconde; o pg_cron apaga).
-- Ela nunca vai para notificação nem para log.
--
-- ## Nada pela tabela
--
-- RLS ligada e NENHUMA policy, igual a `transferencia_pedidos`: toda leitura
-- e escrita passa pelas `fn_senha_*` (SECURITY DEFINER).
-- ============================================================================

BEGIN;

-- ── 1. A trava no perfil ────────────────────────────────────────────────────

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS senha_troca_obrigatoria BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.perfis.senha_troca_obrigatoria IS
  'Senha resetada por pedido (senha_pedidos): o sistema exige a troca antes de qualquer uso. Liga em fn_senha_pedido_concluir, desliga em fn_senha_troca_concluida. 20261105100000.';

-- A própria pessoa não desliga a trava por um UPDATE em `perfis`: só trocando
-- a senha (`fn_senha_troca_concluida`). Passam o SQL Editor/service_role (sem
-- auth.uid()), o super admin e as funções deste arquivo (`app.senha_troca`).
CREATE OR REPLACE FUNCTION public.fn_perfis_guarda_troca_obrigatoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.senha_troca_obrigatoria IS NOT DISTINCT FROM OLD.senha_troca_obrigatoria THEN
    RETURN NEW;
  END IF;
  IF (SELECT auth.uid()) IS NULL
     OR current_setting('app.senha_troca', true) = 'ok'
     OR public.fn_user_is_super_admin() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A troca obrigatória de senha só sai trocando a senha.'
    USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_perfis_guarda_troca_obrigatoria() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_perfis_guarda_troca_obrigatoria ON public.perfis;
CREATE TRIGGER trg_perfis_guarda_troca_obrigatoria
  BEFORE UPDATE OF senha_troca_obrigatoria ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_perfis_guarda_troca_obrigatoria();

-- ── 2. A tabela ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.senha_pedidos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A empresa da pessoa que teve a senha pedida.
  empresa_id            UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  solicitante_id        UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  solicitante_nome      TEXT NOT NULL,
  solicitante_cargo     TEXT,
  solicitante_setor_id  UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  -- Cópias: a pessoa pode mudar de nome, cargo ou setor depois.
  alvo_id               UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  alvo_nome             TEXT NOT NULL,
  alvo_usuario          TEXT,
  alvo_cargo            TEXT,
  alvo_setor_id         UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  motivo                TEXT CHECK (motivo IS NULL OR length(motivo) <= 300),
  status                TEXT NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('pendente', 'executando', 'aprovado', 'recusado', 'cancelado')),
  -- Aprovar reserva o pedido (`executando`) enquanto o servidor troca a senha.
  reservado_por         UUID,
  reservado_em          TIMESTAMPTZ,
  decidido_por_id       UUID,
  decidido_por_nome     TEXT,
  decidido_em           TIMESTAMPTZ,
  motivo_recusa         TEXT CHECK (motivo_recusa IS NULL OR length(motivo_recusa) <= 300),
  -- Última falha ao trocar a senha (o pedido volta a pendente).
  erro                  TEXT,
  -- Só até a pessoa trocar ou 7 dias. Ver o cabeçalho.
  senha_provisoria      TEXT,
  trocada_em            TIMESTAMPTZ,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_senha_pedidos_solicitante
  ON public.senha_pedidos (solicitante_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_senha_pedidos_status
  ON public.senha_pedidos (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_senha_pedidos_alvo
  ON public.senha_pedidos (alvo_id, criado_em DESC);
-- Um pedido aberto por pessoa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_senha_pedido_aberto
  ON public.senha_pedidos (alvo_id)
  WHERE status IN ('pendente', 'executando');

ALTER TABLE public.senha_pedidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.senha_pedidos FROM anon, authenticated;
GRANT ALL ON public.senha_pedidos TO service_role;

COMMENT ON TABLE public.senha_pedidos IS
  'Pedido de reset de senha feito pela liderança; o super admin aprova. Sem policy: só pelas fn_senha_*. 20261105100000.';

-- ── 3. Quem pede, e de quem ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_senha_posso_pedir()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND NOT public.fn_user_is_super_admin()
     AND public.fn_user_tem('ver_usuarios');
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_posso_pedir() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_posso_pedir() TO authenticated;

-- Conta ativa, fora da cúpula. A senha provisória fica visível para quem
-- pediu: pedir a de um diretor seria entrar como ele.
CREATE OR REPLACE FUNCTION public.fn_senha_pode_ser_pedido(p public.perfis)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT COALESCE(p.ativo, TRUE)
     AND NOT COALESCE(p.arquivado, FALSE)
     AND COALESCE(p.situacao, 'ativo') <> 'desligado'
     AND COALESCE(p.perfil::TEXT, '') NOT IN ('administrador', 'super_admin', 'diretoria');
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pode_ser_pedido(public.perfis) FROM PUBLIC, anon, authenticated;

-- ── 4. Pedir ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_senha_pedir(p_alvo UUID, p_motivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu     public.perfis%ROWTYPE;
  v_alvo   public.perfis%ROWTYPE;
  v_aberto RECORD;
  v_pedido UUID;
  v_motivo TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF NOT public.fn_senha_posso_pedir() THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'sem_permissao');
  END IF;
  SELECT * INTO v_eu FROM public.perfis WHERE id = (SELECT auth.uid());
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'sem_permissao'); END IF;

  IF length(COALESCE(v_motivo, '')) > 300 THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'motivo_longo');
  END IF;

  SELECT * INTO v_alvo FROM public.perfis WHERE id = p_alvo;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'alvo_inexistente'); END IF;
  IF v_alvo.id = v_eu.id THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'propria_senha');
  END IF;
  IF NOT public.fn_senha_pode_ser_pedido(v_alvo) THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'alvo_invalido');
  END IF;
  IF v_alvo.setor_id IS NULL
     OR v_alvo.setor_id NOT IN (SELECT public.fn_transferencia_meus_setores()) THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'fora_do_seu_setor');
  END IF;

  SELECT sp.solicitante_nome INTO v_aberto
    FROM public.senha_pedidos sp
   WHERE sp.alvo_id = v_alvo.id AND sp.status IN ('pendente', 'executando')
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'ja_pedido', 'por', v_aberto.solicitante_nome);
  END IF;

  INSERT INTO public.senha_pedidos
    (empresa_id, solicitante_id, solicitante_nome, solicitante_cargo, solicitante_setor_id,
     alvo_id, alvo_nome, alvo_usuario, alvo_cargo, alvo_setor_id, motivo)
  VALUES
    (v_alvo.empresa_id, v_eu.id, v_eu.nome, v_eu.perfil::TEXT, v_eu.setor_id,
     v_alvo.id, v_alvo.nome, v_alvo.usuario, v_alvo.perfil::TEXT, v_alvo.setor_id, v_motivo)
  RETURNING id INTO v_pedido;

  -- Aviso para cada super admin. Leva ao canal «Senhas» do chat.
  INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, rota, autor_id, autor_nome, autor_foto)
  SELECT sa.id,
         'Pedido de reset de senha',
         format('%s (%s) pede resetar a senha de %s.',
                v_eu.nome,
                COALESCE((SELECT s.nome FROM public.setores s WHERE s.id = v_eu.setor_id), 'sem setor'),
                v_alvo.nome),
         sa.empresa_id, '/senhas', v_eu.id, v_eu.nome, v_eu.foto_url
    FROM public.perfis sa
   WHERE sa.perfil::TEXT = 'super_admin' AND COALESCE(sa.ativo, TRUE) AND NOT COALESCE(sa.arquivado, FALSE);

  RETURN jsonb_build_object('ok', TRUE, 'id', v_pedido);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedir(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedir(UUID, TEXT) TO authenticated;

-- ── 5. Ler ──────────────────────────────────────────────────────────────────
--
-- Super admin: todos (os abertos e os 30 dias mais recentes). Os outros: só os
-- que pediram. A senha só vem com o pedido aprovado, enquanto a pessoa não
-- trocou e por 7 dias. Reserva com mais de 5 minutos (aba fechada no meio)
-- volta a aparecer como pendente.

CREATE OR REPLACE FUNCTION public.fn_senha_pedidos_listar()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_super BOOLEAN := public.fn_user_is_super_admin();
  v_eu    UUID := (SELECT auth.uid());
BEGIN
  IF v_eu IS NULL THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', t.id,
             'empresa_id', t.empresa_id,
             'solicitante_id', t.solicitante_id,
             'solicitante_nome', t.solicitante_nome,
             'solicitante_cargo', t.solicitante_cargo,
             'solicitante_setor', ss.nome,
             'solicitante_foto', sp.foto_url,
             'alvo_id', t.alvo_id,
             'alvo_nome', t.alvo_nome,
             'alvo_usuario', COALESCE(ap.usuario, t.alvo_usuario),
             'alvo_cargo', t.alvo_cargo,
             'alvo_setor', sa.nome,
             'alvo_foto', ap.foto_url,
             'motivo', t.motivo,
             'status', CASE WHEN t.status = 'executando' AND t.reservado_em < now() - INTERVAL '5 minutes'
                            THEN 'pendente' ELSE t.status END,
             'decidido_por_nome', t.decidido_por_nome,
             'decidido_em', t.decidido_em,
             'motivo_recusa', t.motivo_recusa,
             'erro', t.erro,
             'senha', CASE WHEN t.status = 'aprovado' AND t.trocada_em IS NULL
                                AND t.decidido_em > now() - INTERVAL '7 days'
                           THEN t.senha_provisoria END,
             'trocada_em', t.trocada_em,
             'criado_em', t.criado_em
           ) ORDER BY t.criado_em DESC)
      FROM public.senha_pedidos t
      LEFT JOIN public.perfis sp  ON sp.id = t.solicitante_id
      LEFT JOIN public.setores ss ON ss.id = t.solicitante_setor_id
      LEFT JOIN public.perfis ap  ON ap.id = t.alvo_id
      LEFT JOIN public.setores sa ON sa.id = t.alvo_setor_id
     WHERE (v_super OR t.solicitante_id = v_eu)
       AND (t.status IN ('pendente', 'executando') OR t.criado_em > now() - INTERVAL '30 days')
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedidos_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedidos_listar() TO authenticated;

-- Para o diálogo de Usuários: os pedidos abertos de pessoas que eu alcanço.
-- Só id da pessoa e quem pediu — nada de senha.
CREATE OR REPLACE FUNCTION public.fn_senha_pedidos_abertos()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('alvo_id', t.alvo_id, 'por', t.solicitante_nome)), '[]'::jsonb)
    FROM public.senha_pedidos t
   WHERE t.status IN ('pendente', 'executando')
     AND (SELECT auth.uid()) IS NOT NULL
     AND (public.fn_user_is_super_admin()
          OR t.solicitante_id = (SELECT auth.uid())
          OR t.alvo_setor_id IN (SELECT public.fn_transferencia_meus_setores()));
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedidos_abertos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedidos_abertos() TO authenticated;

-- ── 6. Aprovar: reservar (super admin) → concluir ou falhou (servidor) ──────

CREATE OR REPLACE FUNCTION public.fn_senha_pedido_reservar(p_pedido UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu   UUID := (SELECT auth.uid());
  v_p    public.senha_pedidos%ROWTYPE;
  v_alvo public.perfis%ROWTYPE;
BEGIN
  IF v_eu IS NULL OR NOT public.fn_user_is_super_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'so_super_admin');
  END IF;

  SELECT * INTO v_p FROM public.senha_pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'pedido_inexistente'); END IF;

  IF v_p.status = 'executando' AND v_p.reservado_em >= now() - INTERVAL '5 minutes'
     AND v_p.reservado_por IS DISTINCT FROM v_eu THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'em_andamento',
      'por', (SELECT nome FROM public.perfis WHERE id = v_p.reservado_por));
  END IF;
  IF v_p.status NOT IN ('pendente', 'executando') THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'ja_decidido', 'por', v_p.decidido_por_nome);
  END IF;

  SELECT * INTO v_alvo FROM public.perfis WHERE id = v_p.alvo_id;
  IF NOT FOUND OR NOT public.fn_senha_pode_ser_pedido(v_alvo) THEN
    UPDATE public.senha_pedidos
       SET status = 'cancelado', decidido_por_id = v_eu,
           decidido_por_nome = (SELECT nome FROM public.perfis WHERE id = v_eu),
           decidido_em = now(), erro = 'A pessoa foi desligada, excluída ou mudou para um cargo de cúpula.'
     WHERE id = v_p.id;
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'sem_efeito');
  END IF;

  UPDATE public.senha_pedidos
     SET status = 'executando', reservado_por = v_eu, reservado_em = now()
   WHERE id = v_p.id;

  RETURN jsonb_build_object('ok', TRUE, 'alvo_id', v_alvo.id, 'alvo_nome', v_alvo.nome,
                            'alvo_usuario', v_alvo.usuario, 'empresa_id', v_alvo.empresa_id,
                            'solicitante_nome', v_p.solicitante_nome);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedido_reservar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedido_reservar(UUID) TO authenticated;

-- Só o servidor (service_role): a senha já foi trocada no GoTrue.
CREATE OR REPLACE FUNCTION public.fn_senha_pedido_concluir(p_pedido UUID, p_senha TEXT, p_por UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_p    public.senha_pedidos%ROWTYPE;
  v_nome TEXT;
BEGIN
  SELECT * INTO v_p FROM public.senha_pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'pedido_inexistente'); END IF;
  IF v_p.status <> 'executando' OR v_p.reservado_por IS DISTINCT FROM p_por THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'nao_reservado');
  END IF;
  IF p_senha IS NULL OR length(p_senha) < 6 OR length(p_senha) > 72 THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'senha_invalida');
  END IF;

  SELECT nome INTO v_nome FROM public.perfis WHERE id = p_por;

  UPDATE public.senha_pedidos
     SET status = 'aprovado', decidido_por_id = p_por, decidido_por_nome = v_nome,
         decidido_em = now(), senha_provisoria = p_senha, erro = NULL, trocada_em = NULL
   WHERE id = v_p.id;

  PERFORM set_config('app.senha_troca', 'ok', true);
  UPDATE public.perfis
     SET senha_troca_obrigatoria = TRUE, senha_alterada = FALSE
   WHERE id = v_p.alvo_id;
  PERFORM set_config('app.senha_troca', '', true);

  IF v_p.solicitante_id IS NOT NULL THEN
    INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, rota, autor_id, autor_nome)
    SELECT v_p.solicitante_id, 'Senha resetada',
           format('A senha de %s foi resetada. Veja a senha provisória no chat, canal «Senhas».', v_p.alvo_nome),
           s.empresa_id, '/senhas', p_por, v_nome
      FROM public.perfis s WHERE s.id = v_p.solicitante_id;
  END IF;

  RETURN jsonb_build_object('ok', TRUE);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedido_concluir(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedido_concluir(UUID, TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_senha_pedido_falhou(p_pedido UUID, p_erro TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  UPDATE public.senha_pedidos
     SET status = 'pendente', reservado_por = NULL, reservado_em = NULL,
         erro = left(COALESCE(p_erro, 'Falha ao trocar a senha.'), 500)
   WHERE id = p_pedido AND status = 'executando';
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedido_falhou(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedido_falhou(UUID, TEXT) TO service_role;

-- ── 7. Recusar (super admin) e cancelar (quem pediu) ────────────────────────

CREATE OR REPLACE FUNCTION public.fn_senha_pedido_recusar(p_pedido UUID, p_motivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu     UUID := (SELECT auth.uid());
  v_nome   TEXT;
  v_p      public.senha_pedidos%ROWTYPE;
  v_motivo TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF v_eu IS NULL OR NOT public.fn_user_is_super_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'so_super_admin');
  END IF;
  IF length(COALESCE(v_motivo, '')) > 300 THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'motivo_longo');
  END IF;

  SELECT * INTO v_p FROM public.senha_pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'pedido_inexistente'); END IF;
  IF v_p.status = 'executando' AND v_p.reservado_em >= now() - INTERVAL '5 minutes' THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'em_andamento');
  END IF;
  IF v_p.status NOT IN ('pendente', 'executando') THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'ja_decidido', 'por', v_p.decidido_por_nome);
  END IF;

  SELECT nome INTO v_nome FROM public.perfis WHERE id = v_eu;
  UPDATE public.senha_pedidos
     SET status = 'recusado', decidido_por_id = v_eu, decidido_por_nome = v_nome,
         decidido_em = now(), motivo_recusa = v_motivo
   WHERE id = v_p.id;

  IF v_p.solicitante_id IS NOT NULL THEN
    INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, rota, autor_id, autor_nome)
    SELECT v_p.solicitante_id, 'Reset de senha recusado',
           format('O pedido de resetar a senha de %s foi recusado%s', v_p.alvo_nome,
                  CASE WHEN v_motivo IS NULL THEN '.' ELSE ': ' || v_motivo END),
           s.empresa_id, '/senhas', v_eu, v_nome
      FROM public.perfis s WHERE s.id = v_p.solicitante_id;
  END IF;

  RETURN jsonb_build_object('ok', TRUE);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedido_recusar(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedido_recusar(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_senha_pedido_cancelar(p_pedido UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu UUID := (SELECT auth.uid());
  v_n  INTEGER;
BEGIN
  IF v_eu IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'sem_permissao'); END IF;
  UPDATE public.senha_pedidos
     SET status = 'cancelado', decidido_por_id = v_eu, decidido_por_nome = solicitante_nome, decidido_em = now()
   WHERE id = p_pedido AND solicitante_id = v_eu AND status = 'pendente';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'ja_decidido'); END IF;
  RETURN jsonb_build_object('ok', TRUE);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_pedido_cancelar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_pedido_cancelar(UUID) TO authenticated;

-- ── 8. A pessoa trocou a senha ──────────────────────────────────────────────
--
-- Chamada pelo navegador DEPOIS de `supabase.auth.updateUser` dar certo.
-- Desliga a trava, apaga a senha provisória dos pedidos e marca a troca.
-- Chamar sem ter trocado só prejudica a própria pessoa (continua com a senha
-- que o líder conhece) e já apaga essa senha do pedido.

CREATE OR REPLACE FUNCTION public.fn_senha_troca_concluida()
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu UUID := (SELECT auth.uid());
BEGIN
  IF v_eu IS NULL THEN RETURN; END IF;

  PERFORM set_config('app.senha_troca', 'ok', true);
  UPDATE public.perfis
     SET senha_troca_obrigatoria = FALSE, senha_alterada = TRUE
   WHERE id = v_eu;
  PERFORM set_config('app.senha_troca', '', true);

  UPDATE public.senha_pedidos
     SET senha_provisoria = NULL, trocada_em = now()
   WHERE alvo_id = v_eu AND status = 'aprovado' AND trocada_em IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_senha_troca_concluida() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_senha_troca_concluida() TO authenticated;

-- ── 9. Senha esquecida no pedido some em 7 dias ─────────────────────────────

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'senha-pedidos-apagar-provisoria',
      '23 4 * * *',
      $job$UPDATE public.senha_pedidos SET senha_provisoria = NULL
            WHERE senha_provisoria IS NOT NULL AND decidido_em < now() - INTERVAL '7 days'$job$
    );
  END IF;
END
$cron$;

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF to_regclass('public.senha_pedidos') IS NULL THEN
    RAISE EXCEPTION 'senha_pedidos não foi criada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.perfis'::regclass
                    AND tgname = 'trg_perfis_guarda_troca_obrigatoria') THEN
    RAISE EXCEPTION 'Gatilho da troca obrigatória ausente.';
  END IF;
END
$prova$;

COMMIT;
