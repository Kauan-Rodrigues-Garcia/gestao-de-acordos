-- ============================================================================
-- Pedidos de transferência: quem não é super admin PEDE, o super admin aprova
-- ============================================================================
--
-- Pedido do Cleber, 03/11/2026 (virada do mês, muita transferência):
--
--   • quem tem `usuarios_transferir` e não é super admin não transfere mais —
--     pede. Dois sentidos: TIRAR gente do próprio setor para outro, ou TRAZER
--     gente de outro setor para o seu;
--   • um pedido leva várias pessoas, todas no mesmo sentido e destino;
--   • o super admin aprova uma parte e recusa o resto. Cada aprovação roda a
--     MESMA transferência da tela (`executarTransferencia`, no navegador dele:
--     relatório antes de apagar, fantasma, Núcleo, empresa, registro e
--     desfazer). Este arquivo só guarda o pedido e trava a concorrência;
--   • os pedidos chegam no chat, no canal «Transferências»: o super admin vê
--     todos, quem pediu vê só os dele.
--
-- ## Nada pela tabela
--
-- RLS ligada e NENHUMA policy: toda leitura e escrita passa pelas funções
-- abaixo (SECURITY DEFINER). Quem pode pedir o quê e quem vê o quê vive aqui,
-- num lugar só — e o líder nunca lê `perfis` de outro setor, só a lista de
-- nome e cargo que `fn_transferencia_pessoas_do_setor` devolve.
--
-- ## A concorrência
--
-- Dois super admins podem aprovar o mesmo pedido ao mesmo tempo. Antes de
-- transferir uma pessoa, o navegador RESERVA o item (`executando`); o segundo
-- recebe `em_andamento`. Reserva esquecida (aba fechada no meio) vence em 10
-- minutos. Um índice único impede a mesma pessoa em dois pedidos abertos.
--
-- ## Líder transferido sai da liderança do setor antigo
--
-- Achado na conferência de 03/11/2026: a transferência trocava `setor_id` e
-- zerava `equipe_id`, mas não tocava `equipe_lideres`. O líder do Play 2
-- transferido para o Play 3 continuava liderando a equipe do Play 2 — e cargo
-- `lider` credita na equipe que LIDERA. `fn_transferencia_sai_da_lideranca`
-- tira só as lideranças em equipes do setor de ORIGEM; a de setor alternativo
-- fica, pelo mesmo motivo que o clone fica (quem decide é aquele setor).
-- ============================================================================

BEGIN;

-- ── 1. As tabelas ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transferencia_pedidos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A empresa de quem pediu.
  empresa_id            UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  solicitante_id        UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  solicitante_nome      TEXT NOT NULL,
  solicitante_cargo     TEXT,
  solicitante_setor_id  UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  direcao               TEXT NOT NULL CHECK (direcao IN ('tirar', 'trazer')),
  origem_setor_id       UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  destino_setor_id      UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  -- A sugestão de quem pediu. Quem aprova confirma ou troca.
  levar_acordos         BOOLEAN NOT NULL DEFAULT FALSE,
  motivo                TEXT CHECK (motivo IS NULL OR length(motivo) <= 500),
  status                TEXT NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('pendente', 'concluido', 'cancelado')),
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.transferencia_pedido_itens (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id          UUID NOT NULL REFERENCES public.transferencia_pedidos(id) ON DELETE CASCADE,
  perfil_id          UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  -- Cópias: a pessoa pode ser excluída ou mudar de cargo depois.
  perfil_nome        TEXT NOT NULL,
  perfil_cargo       TEXT,
  status             TEXT NOT NULL DEFAULT 'pendente'
                       CHECK (status IN ('pendente', 'executando', 'transferida', 'recusada', 'cancelada', 'sem_efeito')),
  reservado_por      UUID,
  reservado_em       TIMESTAMPTZ,
  decidido_por_id    UUID,
  decidido_por_nome  TEXT,
  decidido_em        TIMESTAMPTZ,
  motivo_recusa      TEXT CHECK (motivo_recusa IS NULL OR length(motivo_recusa) <= 500),
  -- Última falha ao transferir (o item volta a pendente).
  erro               TEXT,
  levou_acordos      BOOLEAN,
  transferencia_id   UUID REFERENCES public.perfis_transferencias(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transferencia_pedidos_solicitante
  ON public.transferencia_pedidos (solicitante_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_transferencia_pedidos_status
  ON public.transferencia_pedidos (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_transferencia_pedido_itens_pedido
  ON public.transferencia_pedido_itens (pedido_id);
-- A mesma pessoa não fica em dois pedidos abertos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transferencia_item_aberto
  ON public.transferencia_pedido_itens (perfil_id)
  WHERE status IN ('pendente', 'executando');

ALTER TABLE public.transferencia_pedidos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencia_pedido_itens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transferencia_pedidos      FROM anon, authenticated;
REVOKE ALL ON public.transferencia_pedido_itens FROM anon, authenticated;

COMMENT ON TABLE public.transferencia_pedidos IS
  'Pedido de transferência de setor feito por quem não é super admin. Sem policy: só pelas fn_transferencia_*. 20261103150000.';
COMMENT ON TABLE public.transferencia_pedido_itens IS
  'Uma pessoa de um pedido de transferência, com a decisão dela. 20261103150000.';

-- ── 2. Os setores de quem pede ──────────────────────────────────────────────
--
-- O do perfil e os das equipes que ele LIDERA. Clone não conta: emprestar
-- gente a um setor não faz dele o seu. Diretoria e administração veem a
-- empresa inteira (as empresas que alcançam).

CREATE OR REPLACE FUNCTION public.fn_transferencia_meus_setores()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.setor_id FROM public.perfis p
   WHERE p.id = (SELECT auth.uid()) AND p.setor_id IS NOT NULL
  UNION
  SELECT e.setor_id
    FROM public.equipe_membros m
    JOIN public.equipes e ON e.id = m.equipe_id
   WHERE m.pessoa_id = (SELECT auth.uid()) AND m.papel = 'lider' AND e.setor_id IS NOT NULL
  UNION
  SELECT s.id
    FROM public.setores s
    JOIN public.perfis p ON p.id = (SELECT auth.uid())
   WHERE p.perfil IN ('diretoria', 'administrador')
     AND COALESCE(s.ativo, TRUE)
     AND public.fn_can_access_empresa(s.empresa_id);
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_meus_setores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_meus_setores() TO authenticated;

-- Quem pode pedir: a chave da transferência, e não ser super admin (ele
-- transfere direto).
CREATE OR REPLACE FUNCTION public.fn_transferencia_posso_pedir()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND NOT public.fn_user_is_super_admin()
     AND public.fn_user_tem('usuarios_transferir');
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_posso_pedir() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_posso_pedir() TO authenticated;

-- ── 3. Os setores da lista de destino/origem ────────────────────────────────
--
-- Todos os setores ativos de operação, das duas empresas, com cidade e regra:
-- a tela marca BookPlay/PaguePlay (pela cidade) e Nosso produto/Cofen (pela
-- regra). O Núcleo fica de fora: entrar ou sair dele troca o cargo, e isso é
-- só na transferência direta do super admin.

CREATE OR REPLACE FUNCTION public.fn_transferencia_setores()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (public.fn_transferencia_posso_pedir() OR public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'Sem permissão para transferir.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', s.id, 'nome', s.nome, 'empresa_id', s.empresa_id,
             'cidade', c.nome, 'regra', s.regra,
             'meu', s.id IN (SELECT public.fn_transferencia_meus_setores()))
           ORDER BY s.nome)
      FROM public.setores s
      LEFT JOIN public.rh_celulas c ON c.id = s.cidade_id
     WHERE COALESCE(s.ativo, TRUE)
       AND COALESCE(s.tipo, 'operacao') <> 'nucleo'
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_setores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_setores() TO authenticated;

-- Quem pode entrar num pedido: ativo, não arquivado, não desligado, e não é
-- administrador nem super admin.
CREATE OR REPLACE FUNCTION public.fn_transferencia_pode_ser_pedido(p public.perfis)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT COALESCE(p.ativo, TRUE)
     AND NOT COALESCE(p.arquivado, FALSE)
     AND COALESCE(p.situacao, 'ativo') <> 'desligado'
     AND COALESCE(p.perfil, '') NOT IN ('administrador', 'super_admin');
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_pode_ser_pedido(public.perfis) FROM PUBLIC, anon, authenticated;

-- As pessoas de um setor, só nome e cargo — para o «trazer de outro setor».
CREATE OR REPLACE FUNCTION public.fn_transferencia_pessoas_do_setor(p_setor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (public.fn_transferencia_posso_pedir() OR public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'Sem permissão para transferir.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', p.id, 'nome', p.nome, 'cargo', p.perfil,
             'em_pedido', EXISTS (SELECT 1 FROM public.transferencia_pedido_itens i
                                   WHERE i.perfil_id = p.id AND i.status IN ('pendente', 'executando')))
           ORDER BY p.nome)
      FROM public.perfis p
      JOIN public.setores s ON s.id = p.setor_id
     WHERE p.setor_id = p_setor_id
       AND COALESCE(s.ativo, TRUE)
       AND COALESCE(s.tipo, 'operacao') <> 'nucleo'
       AND public.fn_transferencia_pode_ser_pedido(p)
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_pessoas_do_setor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_pessoas_do_setor(UUID) TO authenticated;

-- ── 4. Pedir ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_transferencia_pedir(
  p_direcao  TEXT,
  p_origem   UUID,
  p_destino  UUID,
  p_pessoas  UUID[],
  p_levar    BOOLEAN DEFAULT FALSE,
  p_motivo   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu        public.perfis%ROWTYPE;
  v_origem    public.setores%ROWTYPE;
  v_destino   public.setores%ROWTYPE;
  v_ids       UUID[];
  v_invalidos TEXT[];
  v_ocupados  TEXT[];
  v_pedido    UUID;
  v_qtd       INTEGER;
  v_motivo    TEXT := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF NOT public.fn_transferencia_posso_pedir() THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'sem_permissao');
  END IF;
  SELECT * INTO v_eu FROM public.perfis WHERE id = (SELECT auth.uid());
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'sem_permissao'); END IF;

  IF p_direcao NOT IN ('tirar', 'trazer') THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'direcao_invalida');
  END IF;
  IF length(COALESCE(v_motivo, '')) > 500 THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'motivo_longo');
  END IF;

  SELECT * INTO v_origem  FROM public.setores WHERE id = p_origem;
  SELECT * INTO v_destino FROM public.setores WHERE id = p_destino;
  IF v_origem.id IS NULL OR v_destino.id IS NULL
     OR NOT COALESCE(v_destino.ativo, TRUE)
     OR COALESCE(v_origem.tipo, 'operacao') = 'nucleo'
     OR COALESCE(v_destino.tipo, 'operacao') = 'nucleo' THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'setor_invalido');
  END IF;
  IF v_origem.id = v_destino.id THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'mesmo_setor');
  END IF;

  -- Tirar: a origem é um setor meu. Trazer: o destino é um setor meu.
  IF (p_direcao = 'tirar'  AND v_origem.id  NOT IN (SELECT public.fn_transferencia_meus_setores()))
  OR (p_direcao = 'trazer' AND v_destino.id NOT IN (SELECT public.fn_transferencia_meus_setores())) THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'setor_nao_e_seu');
  END IF;

  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_pessoas) x WHERE x IS NOT NULL;
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'sem_pessoas');
  END IF;
  IF cardinality(v_ids) > 100 THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'pessoas_demais');
  END IF;

  -- Todas no setor de origem e aptas.
  SELECT array_agg(COALESCE(p.nome, x::TEXT)) INTO v_invalidos
    FROM unnest(v_ids) x
    LEFT JOIN public.perfis p ON p.id = x
   WHERE p.id IS NULL OR p.setor_id IS DISTINCT FROM v_origem.id
      OR NOT public.fn_transferencia_pode_ser_pedido(p);
  IF v_invalidos IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'pessoa_invalida', 'nomes', to_jsonb(v_invalidos));
  END IF;

  SELECT array_agg(p.nome) INTO v_ocupados
    FROM public.transferencia_pedido_itens i
    JOIN public.perfis p ON p.id = i.perfil_id
   WHERE i.perfil_id = ANY (v_ids) AND i.status IN ('pendente', 'executando');
  IF v_ocupados IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'ja_em_pedido', 'nomes', to_jsonb(v_ocupados));
  END IF;

  INSERT INTO public.transferencia_pedidos
    (empresa_id, solicitante_id, solicitante_nome, solicitante_cargo, solicitante_setor_id,
     direcao, origem_setor_id, destino_setor_id, levar_acordos, motivo)
  VALUES
    (v_eu.empresa_id, v_eu.id, v_eu.nome, v_eu.perfil, v_eu.setor_id,
     p_direcao, v_origem.id, v_destino.id, COALESCE(p_levar, FALSE), v_motivo)
  RETURNING id INTO v_pedido;

  INSERT INTO public.transferencia_pedido_itens (pedido_id, perfil_id, perfil_nome, perfil_cargo)
  SELECT v_pedido, p.id, p.nome, p.perfil
    FROM public.perfis p WHERE p.id = ANY (v_ids);
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  -- Aviso para cada super admin. Leva ao canal «Transferências» do chat.
  INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, rota, autor_id, autor_nome, autor_foto)
  SELECT sa.id,
         'Pedido de transferência',
         format('%s (%s) pede transferir %s do %s para o %s.',
                v_eu.nome,
                COALESCE((SELECT s.nome FROM public.setores s WHERE s.id = v_eu.setor_id), 'sem setor'),
                CASE WHEN v_qtd = 1 THEN '1 pessoa' ELSE v_qtd || ' pessoas' END,
                v_origem.nome, v_destino.nome),
         sa.empresa_id, '/transferencias', v_eu.id, v_eu.nome, v_eu.foto_url
    FROM public.perfis sa
   WHERE sa.perfil = 'super_admin' AND COALESCE(sa.ativo, TRUE) AND NOT COALESCE(sa.arquivado, FALSE);

  RETURN jsonb_build_object('ok', TRUE, 'id', v_pedido, 'pessoas', v_qtd);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_pedir(TEXT, UUID, UUID, UUID[], BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_pedir(TEXT, UUID, UUID, UUID[], BOOLEAN, TEXT) TO authenticated;

-- ── 5. Ler ──────────────────────────────────────────────────────────────────
--
-- Super admin: todos (os abertos e os 60 dias mais recentes). Os outros: só os
-- que pediram. O que o navegador do super admin precisa para transferir (a
-- empresa, o setor e a equipe de HOJE de cada pessoa, o login) só vai para ele.

CREATE OR REPLACE FUNCTION public.fn_transferencia_pedidos_listar()
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
             'direcao', t.direcao,
             'origem', CASE WHEN so.id IS NULL THEN NULL ELSE jsonb_build_object(
                         'id', so.id, 'nome', so.nome, 'empresa_id', so.empresa_id,
                         'cidade', co.nome, 'regra', so.regra) END,
             'destino', CASE WHEN sd.id IS NULL THEN NULL ELSE jsonb_build_object(
                         'id', sd.id, 'nome', sd.nome, 'empresa_id', sd.empresa_id,
                         'cidade', cd.nome, 'regra', sd.regra) END,
             'levar_acordos', t.levar_acordos,
             'motivo', t.motivo,
             'status', t.status,
             'criado_em', t.criado_em,
             'concluido_em', t.concluido_em,
             'itens', (
               SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'id', i.id,
                        'perfil_id', i.perfil_id,
                        'perfil_nome', i.perfil_nome,
                        'perfil_cargo', i.perfil_cargo,
                        'status', i.status,
                        'reservado_em', i.reservado_em,
                        'decidido_por_nome', i.decidido_por_nome,
                        'decidido_em', i.decidido_em,
                        'motivo_recusa', i.motivo_recusa,
                        'erro', i.erro,
                        'levou_acordos', i.levou_acordos,
                        'atual', CASE WHEN v_super AND p.id IS NOT NULL THEN jsonb_build_object(
                                   'usuario', p.usuario, 'empresa_id', p.empresa_id,
                                   'setor_id', p.setor_id, 'equipe_id', p.equipe_id,
                                   'cargo', p.perfil,
                                   'apto', public.fn_transferencia_pode_ser_pedido(p)) END)
                      ORDER BY i.perfil_nome), '[]'::jsonb)
                 FROM public.transferencia_pedido_itens i
                 LEFT JOIN public.perfis p ON p.id = i.perfil_id
                WHERE i.pedido_id = t.id)
           ) ORDER BY t.criado_em DESC)
      FROM public.transferencia_pedidos t
      LEFT JOIN public.perfis sp     ON sp.id = t.solicitante_id
      LEFT JOIN public.setores ss    ON ss.id = t.solicitante_setor_id
      LEFT JOIN public.setores so    ON so.id = t.origem_setor_id
      LEFT JOIN public.rh_celulas co ON co.id = so.cidade_id
      LEFT JOIN public.setores sd    ON sd.id = t.destino_setor_id
      LEFT JOIN public.rh_celulas cd ON cd.id = sd.cidade_id
     WHERE (v_super OR t.solicitante_id = v_eu)
       AND (t.status = 'pendente' OR t.criado_em > now() - INTERVAL '60 days')
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_pedidos_listar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_pedidos_listar() TO authenticated;

-- ── 6. Fechar o pedido quando não sobra nada aberto ─────────────────────────

CREATE OR REPLACE FUNCTION public.fn_transferencia_pedido_fechar_se_acabou(p_pedido UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ped      public.transferencia_pedidos%ROWTYPE;
  v_feitas   INTEGER;
  v_recusas  INTEGER;
  v_outras   INTEGER;
  v_msg      TEXT;
BEGIN
  SELECT * INTO v_ped FROM public.transferencia_pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND OR v_ped.status <> 'pendente' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.transferencia_pedido_itens
              WHERE pedido_id = p_pedido AND status IN ('pendente', 'executando')) THEN
    RETURN;
  END IF;

  SELECT count(*) FILTER (WHERE status = 'transferida'),
         count(*) FILTER (WHERE status = 'recusada'),
         count(*) FILTER (WHERE status IN ('cancelada', 'sem_efeito'))
    INTO v_feitas, v_recusas, v_outras
    FROM public.transferencia_pedido_itens WHERE pedido_id = p_pedido;

  UPDATE public.transferencia_pedidos
     SET status = CASE WHEN v_feitas = 0 AND v_recusas = 0 THEN 'cancelado' ELSE 'concluido' END,
         concluido_em = now()
   WHERE id = p_pedido;

  -- Quem pediu e cancelou não precisa de aviso do próprio cancelamento.
  IF v_feitas = 0 AND v_recusas = 0 THEN RETURN; END IF;

  v_msg := concat_ws(' · ',
    CASE WHEN v_feitas  > 0 THEN v_feitas  || CASE WHEN v_feitas  = 1 THEN ' transferida' ELSE ' transferidas' END END,
    CASE WHEN v_recusas > 0 THEN v_recusas || CASE WHEN v_recusas = 1 THEN ' recusada'    ELSE ' recusadas'    END END,
    CASE WHEN v_outras  > 0 THEN v_outras  || ' sem efeito' END);

  INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, rota)
  SELECT v_ped.solicitante_id, 'Pedido de transferência decidido',
         format('Seu pedido para o %s: %s.',
                COALESCE((SELECT s.nome FROM public.setores s WHERE s.id = v_ped.destino_setor_id), 'setor de destino'),
                v_msg),
         v_ped.empresa_id, '/transferencias'
   WHERE v_ped.solicitante_id IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_pedido_fechar_se_acabou(UUID) FROM PUBLIC, anon, authenticated;

-- ── 7. Aprovar: reservar, concluir, falhar ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_transferencia_item_reservar(p_item UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_item  public.transferencia_pedido_itens%ROWTYPE;
  v_ped   public.transferencia_pedidos%ROWTYPE;
  v_p     public.perfis%ROWTYPE;
  v_dest  public.setores%ROWTYPE;
  v_eu    UUID := (SELECT auth.uid());
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'so_super_admin');
  END IF;

  SELECT * INTO v_item FROM public.transferencia_pedido_itens WHERE id = p_item FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'item_inexistente'); END IF;
  IF v_item.status = 'executando' AND v_item.reservado_por IS DISTINCT FROM v_eu
     AND v_item.reservado_em > now() - INTERVAL '10 minutes' THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'em_andamento');
  END IF;
  IF v_item.status NOT IN ('pendente', 'executando') THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'ja_decidido', 'por', v_item.decidido_por_nome);
  END IF;

  SELECT * INTO v_ped  FROM public.transferencia_pedidos WHERE id = v_item.pedido_id;
  SELECT * INTO v_p    FROM public.perfis WHERE id = v_item.perfil_id;
  SELECT * INTO v_dest FROM public.setores WHERE id = v_ped.destino_setor_id;

  -- A pessoa saiu, mudou de setor ou foi desligada depois do pedido: sem efeito.
  IF v_p.id IS NULL OR v_p.setor_id IS DISTINCT FROM v_ped.origem_setor_id
     OR NOT public.fn_transferencia_pode_ser_pedido(v_p)
     OR v_dest.id IS NULL OR NOT COALESCE(v_dest.ativo, TRUE) THEN
    UPDATE public.transferencia_pedido_itens
       SET status = 'sem_efeito', decidido_em = now(), decidido_por_id = v_eu,
           decidido_por_nome = (SELECT nome FROM public.perfis WHERE id = v_eu),
           erro = CASE
             WHEN v_p.id IS NULL THEN 'A pessoa não existe mais.'
             WHEN v_dest.id IS NULL OR NOT COALESCE(v_dest.ativo, TRUE) THEN 'O setor de destino não está mais ativo.'
             WHEN NOT public.fn_transferencia_pode_ser_pedido(v_p) THEN 'A pessoa foi desligada ou arquivada.'
             ELSE 'A pessoa já mudou de setor depois do pedido.' END,
           reservado_por = NULL, reservado_em = NULL
     WHERE id = p_item;
    PERFORM public.fn_transferencia_pedido_fechar_se_acabou(v_item.pedido_id);
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'sem_efeito');
  END IF;

  UPDATE public.transferencia_pedido_itens
     SET status = 'executando', reservado_por = v_eu, reservado_em = now(), erro = NULL
   WHERE id = p_item;

  RETURN jsonb_build_object('ok', TRUE,
    'perfil_id', v_p.id, 'nome', v_p.nome, 'usuario', v_p.usuario,
    'origem_empresa_id', v_p.empresa_id, 'origem_setor_id', v_p.setor_id, 'origem_equipe_id', v_p.equipe_id,
    'destino_empresa_id', v_dest.empresa_id, 'destino_setor_id', v_dest.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_item_reservar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_item_reservar(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_transferencia_item_concluir(
  p_item UUID, p_transferencia_id UUID, p_levou BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_item public.transferencia_pedido_itens%ROWTYPE;
  v_ped  public.transferencia_pedidos%ROWTYPE;
  v_eu   UUID := (SELECT auth.uid());
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'so_super_admin');
  END IF;
  SELECT * INTO v_item FROM public.transferencia_pedido_itens WHERE id = p_item FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'erro', 'item_inexistente'); END IF;
  IF v_item.status <> 'executando' OR v_item.reservado_por IS DISTINCT FROM v_eu THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'nao_reservado');
  END IF;
  SELECT * INTO v_ped FROM public.transferencia_pedidos WHERE id = v_item.pedido_id;

  -- A transferência aconteceu de verdade: a pessoa está no destino.
  IF NOT EXISTS (SELECT 1 FROM public.perfis WHERE id = v_item.perfil_id AND setor_id = v_ped.destino_setor_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'nao_transferida');
  END IF;

  UPDATE public.transferencia_pedido_itens
     SET status = 'transferida', decidido_em = now(), decidido_por_id = v_eu,
         decidido_por_nome = (SELECT nome FROM public.perfis WHERE id = v_eu),
         levou_acordos = COALESCE(p_levou, FALSE),
         transferencia_id = (SELECT t.id FROM public.perfis_transferencias t WHERE t.id = p_transferencia_id),
         reservado_por = NULL, reservado_em = NULL, erro = NULL
   WHERE id = p_item;

  PERFORM public.fn_transferencia_pedido_fechar_se_acabou(v_item.pedido_id);
  RETURN jsonb_build_object('ok', TRUE);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_item_concluir(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_item_concluir(UUID, UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_transferencia_item_falhou(p_item UUID, p_erro TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'so_super_admin');
  END IF;
  UPDATE public.transferencia_pedido_itens
     SET status = 'pendente', erro = left(COALESCE(p_erro, 'Falhou.'), 500),
         reservado_por = NULL, reservado_em = NULL
   WHERE id = p_item AND status = 'executando' AND reservado_por = (SELECT auth.uid());
  RETURN jsonb_build_object('ok', TRUE);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_item_falhou(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_item_falhou(UUID, TEXT) TO authenticated;

-- ── 8. Recusar e cancelar ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_transferencia_itens_recusar(p_itens UUID[], p_motivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu      UUID := (SELECT auth.uid());
  v_pedidos UUID[];
  v_pedido  UUID;
  v_qtd     INTEGER;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'so_super_admin');
  END IF;

  WITH recusados AS (
    UPDATE public.transferencia_pedido_itens i
       SET status = 'recusada', decidido_em = now(), decidido_por_id = v_eu,
           decidido_por_nome = (SELECT nome FROM public.perfis WHERE id = v_eu),
           motivo_recusa = NULLIF(left(btrim(COALESCE(p_motivo, '')), 500), ''),
           reservado_por = NULL, reservado_em = NULL
     WHERE i.id = ANY (p_itens) AND i.status = 'pendente'
     RETURNING i.pedido_id
  )
  SELECT array_agg(DISTINCT pedido_id), count(*) INTO v_pedidos, v_qtd FROM recusados;

  FOREACH v_pedido IN ARRAY COALESCE(v_pedidos, ARRAY[]::UUID[]) LOOP
    PERFORM public.fn_transferencia_pedido_fechar_se_acabou(v_pedido);
  END LOOP;
  RETURN jsonb_build_object('ok', TRUE, 'recusados', COALESCE(v_qtd, 0));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_itens_recusar(UUID[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_itens_recusar(UUID[], TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_transferencia_pedido_cancelar(p_pedido UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_qtd INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.transferencia_pedidos
                  WHERE id = p_pedido AND solicitante_id = (SELECT auth.uid())) THEN
    RETURN jsonb_build_object('ok', FALSE, 'erro', 'pedido_inexistente');
  END IF;
  UPDATE public.transferencia_pedido_itens
     SET status = 'cancelada', decidido_em = now()
   WHERE pedido_id = p_pedido AND status = 'pendente';
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  PERFORM public.fn_transferencia_pedido_fechar_se_acabou(p_pedido);
  RETURN jsonb_build_object('ok', TRUE, 'cancelados', v_qtd);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_pedido_cancelar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_pedido_cancelar(UUID) TO authenticated;

-- ── 9. Líder transferido sai da liderança do setor antigo ───────────────────
--
-- Chamado pela transferência de setor/empresa depois de mover o perfil. Só as
-- equipes do setor de ORIGEM. `equipe_lideres` ainda é tabela (a fase 7 de
-- `equipe_membros` não foi aplicada); quando virar view, sobra o DELETE em
-- `equipe_membros`.

CREATE OR REPLACE FUNCTION public.fn_transferencia_sai_da_lideranca(p_perfil UUID, p_setor_origem UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_equipes JSONB;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF p_perfil IS NULL OR p_setor_origem IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', e.id, 'nome', e.nome)), '[]'::jsonb)
    INTO v_equipes
    FROM public.equipe_membros m
    JOIN public.equipes e ON e.id = m.equipe_id
   WHERE m.pessoa_id = p_perfil AND m.papel = 'lider' AND e.setor_id = p_setor_origem;

  IF (SELECT c.relkind FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'equipe_lideres') = 'r' THEN
    DELETE FROM public.equipe_lideres l
     USING public.equipes e
     WHERE e.id = l.equipe_id AND l.lider_id = p_perfil AND e.setor_id = p_setor_origem;
  END IF;

  DELETE FROM public.equipe_membros m
   USING public.equipes e
   WHERE e.id = m.equipe_id AND m.pessoa_id = p_perfil AND m.papel = 'lider'
     AND e.setor_id = p_setor_origem;

  RETURN v_equipes;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_sai_da_lideranca(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_sai_da_lideranca(UUID, UUID) TO authenticated;

-- ── 10. Prova ───────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF to_regclass('public.transferencia_pedidos') IS NULL
     OR to_regclass('public.transferencia_pedido_itens') IS NULL
     OR to_regprocedure('public.fn_transferencia_pedir(text, uuid, uuid, uuid[], boolean, text)') IS NULL
     OR to_regprocedure('public.fn_transferencia_pedidos_listar()') IS NULL
     OR to_regprocedure('public.fn_transferencia_item_reservar(uuid)') IS NULL
     OR to_regprocedure('public.fn_transferencia_sai_da_lideranca(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Pedidos de transferência: objeto faltando. Nada aplicado.';
  END IF;
  IF has_table_privilege('authenticated', 'public.transferencia_pedidos', 'SELECT') THEN
    RAISE EXCEPTION 'transferencia_pedidos não deveria ser legível direto. Nada aplicado.';
  END IF;
END
$prova$;

COMMIT;
