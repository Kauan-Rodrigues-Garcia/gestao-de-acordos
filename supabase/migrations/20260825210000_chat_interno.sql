-- ============================================================================
-- Chat interno — a base: tabelas, alcance, RLS e o expurgo de CPF
-- ============================================================================
--
-- ## O que isto substitui
--
-- A "Pomba" do sistema da empresa. O pedido foi estetica limpa, tempo real de
-- verdade, anexo que funcione, e o historico inteiro guardado.
--
-- ## Conversa e de DUAS pessoas
--
-- Sem grupo nesta fase, por decisao de 25/08/2026. A unicidade e garantida por
-- `(empresa_id, par_menor, par_maior)` com os dois ids ORDENADOS: sem a ordem,
-- (A,B) e (B,A) seriam duas conversas, e os dois lados escreveriam em salas
-- diferentes achando que era a mesma.
--
-- ## Apagar e por pessoa, e nao apaga nada
--
-- `chat_participantes.apagada_em` some a conversa da MINHA lista. A do outro
-- continua, e as mensagens ficam — "tudo tem que ficar registrado". Mensagem
-- nova rearma os dois lados: quem apagou volta a ver quando o outro escreve.
--
-- ## A aba nasce fechada, e mais fechada que a de Tickets
--
-- `tickets_config.liberado_para_lideranca` deixava o ADMINISTRADOR entrar no
-- primeiro dia. Aqui nem ele: enquanto `chat_config.liberado` for FALSE, so
-- passa super_admin. Foi pedido assim — "quem vai ter acesso em primeira mao e
-- eu e os outros super admins apenas".
--
-- Por que uma chave separada, e nao so o catalogo: `fn_user_tem` responde TRUE
-- para administrador em qualquer chave que nao seja `explicita`. Semear
-- `ver_chat` como 'ninguem' fecha para os cargos configuraveis e NAO fecha para
-- o administrador. A trava de lancamento precisava viver fora do catalogo.
--
-- Quando o chat abrir para a operacao, vira a chave e o catalogo assume.
--
-- ## Alcance: quem eu ACHO, nao quem me acha
--
-- `chat_escopo_*` decide com quem eu consigo INICIAR conversa. Quem ja me
-- mandou mensagem eu respondo sempre, mesmo fora do meu alcance — decisao de
-- 25/08. Perder a conversa apagada e nao conseguir reabrir e o comportamento
-- aceito.
--
-- Sem `individual`: conversar consigo mesmo nao e alcance, e nao existe.
--
-- ## CPF sai em 12 horas, com o mecanismo que ja existia
--
-- `fn_texto_tem_cpf` valida digito verificador, entao CNPJ nao cai na rede. O
-- gatilho arma `expurgar_em` UMA vez (COALESCE): editar depois nao estica o
-- prazo. Quem varre e `fn_expurgar_cpf_chat`, agora com a tabela nova junto.
--
-- ⚠️ O expurgo depende do pg_cron. Se a extensao nao estiver ativa, o CPF NAO
--    sai sozinho — vale a mesma conferencia que o chat da PaguePlay precisa.
-- ============================================================================

-- ── Trava de lancamento ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_config (
  empresa_id     UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  liberado       BOOLEAN NOT NULL DEFAULT FALSE,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.chat_config IS
  'Trava de lancamento do chat por empresa. FALSE = so super_admin entra, '
  'inclusive administrador. Ver o cabecalho da migration 20260825210000.';

INSERT INTO public.chat_config (empresa_id, liberado)
SELECT id, FALSE FROM public.empresas
ON CONFLICT (empresa_id) DO NOTHING;

-- ── Bloqueio por pessoa ─────────────────────────────────────────────────────
--
-- Coluna em `perfis`, e nao tabela a parte: a pergunta "esta pessoa usa o
-- chat?" e do cadastro dela, e a tela de Usuarios ja edita `perfis`.

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS chat_bloqueado BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.perfis.chat_bloqueado IS
  'Fecha o chat para ESTA pessoa sem mexer no cargo dela. Fecha as duas pontas: '
  'ela nao manda e nao recebe.';

-- ── Conversas ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_conversas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Ordenados, sempre. Ver o cabecalho.
  par_menor          UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  par_maior          UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_mensagem_em TIMESTAMPTZ,
  CONSTRAINT chat_par_ordenado CHECK (par_menor < par_maior)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_conversa_par
  ON public.chat_conversas (empresa_id, par_menor, par_maior);
CREATE INDEX IF NOT EXISTS idx_chat_conversa_recente
  ON public.chat_conversas (empresa_id, ultima_mensagem_em DESC NULLS LAST);

-- Estado POR PESSOA da conversa: onde parei de ler, e se sumi com ela da lista.
CREATE TABLE IF NOT EXISTS public.chat_participantes (
  conversa_id      UUID NOT NULL REFERENCES public.chat_conversas(id) ON DELETE CASCADE,
  perfil_id        UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  ultima_leitura_em TIMESTAMPTZ,
  apagada_em       TIMESTAMPTZ,
  PRIMARY KEY (conversa_id, perfil_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_part_pessoa
  ON public.chat_participantes (perfil_id) WHERE apagada_em IS NULL;

COMMENT ON COLUMN public.chat_participantes.ultima_leitura_em IS
  'O "visualizou" do outro lado: mensagem com criado_em <= este valor foi lida.';

-- ── Mensagens ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_mensagens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id  UUID NOT NULL REFERENCES public.chat_conversas(id) ON DELETE CASCADE,
  -- Repetida da conversa de proposito: a RLS e os indices de mensagem nao
  -- precisam de JOIN para saber a empresa.
  empresa_id   UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  autor_id     UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  texto        TEXT,
  -- [{ url, nome, tipo, tamanho }]. Arquivo no balde `chat`; aqui so o endereco.
  anexos       JSONB NOT NULL DEFAULT '[]'::JSONB,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tem_cpf      BOOLEAN NOT NULL DEFAULT FALSE,
  expurgar_em  TIMESTAMPTZ,
  expurgado_em TIMESTAMPTZ,
  CONSTRAINT chat_msg_nao_vazia
    CHECK (COALESCE(TRIM(texto), '') <> '' OR jsonb_array_length(anexos) > 0)
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conversa
  ON public.chat_mensagens (conversa_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_chat_msg_expurgo
  ON public.chat_mensagens (expurgar_em)
  WHERE tem_cpf AND expurgado_em IS NULL;

-- ── A permissao de OUTRA pessoa ─────────────────────────────────────────────
--
-- `fn_user_tem` responde sobre quem esta logado. O chat precisa da mesma
-- pergunta sobre o DESTINATARIO: a lista de contatos nao pode oferecer alguem
-- que nao receberia, senao a mensagem sai e some.
--
-- Mesma ordem de resolucao, para nao existirem duas regras:
--   1. acesso total (admin/super_admin), menos chave `explicita`
--   2. excecao nominal manda sobre o cargo
--   3. o mapa do cargo
--   4. ausente vale negado

CREATE OR REPLACE FUNCTION public.fn_perfil_tem(p_perfil UUID, p_chave TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH ctx AS (
    SELECT p.perfil AS cargo, p.empresa_id, p.id AS usuario_id
      FROM public.perfis p WHERE p.id = p_perfil
  ),
  explicita AS (
    SELECT EXISTS (
      SELECT 1 FROM public.fn_permissoes_catalogo() c
       WHERE c.chave = p_chave AND c.explicita
    ) AS sim
  ),
  excecao AS (
    SELECT pp.permissoes->>p_chave AS valor
      FROM public.perfis_permissoes pp
      JOIN ctx ON pp.usuario_id = ctx.usuario_id
     WHERE pp.permissoes ? p_chave
  ),
  do_cargo AS (
    SELECT cp.permissoes->>p_chave AS valor
      FROM public.cargos_permissoes cp
      JOIN ctx ON cp.empresa_id = ctx.empresa_id AND cp.cargo = ctx.cargo
     WHERE cp.permissoes ? p_chave
  )
  SELECT CASE
    WHEN (SELECT cargo FROM ctx) IN ('administrador', 'super_admin')
         AND NOT (SELECT sim FROM explicita)
      THEN TRUE
    WHEN EXISTS (SELECT 1 FROM excecao)
      THEN COALESCE((SELECT valor FROM excecao)::BOOLEAN, FALSE)
    WHEN EXISTS (SELECT 1 FROM do_cargo)
      THEN COALESCE((SELECT valor FROM do_cargo)::BOOLEAN, FALSE)
    ELSE FALSE
  END;
$function$;

REVOKE ALL     ON FUNCTION public.fn_perfil_tem(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_perfil_tem(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_perfil_tem(UUID, TEXT) IS
  'A permissao de OUTRA pessoa. Espelha fn_user_tem, que so fala do usuario '
  'logado. Nao afrouxa nada: e leitura de configuracao, nao de dado.';

-- ── Quem pode usar o chat ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_pode_usar(p_perfil UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH alvo AS (
    SELECT p.id, p.perfil, p.empresa_id, COALESCE(p.ativo, TRUE) AS ativo, p.chat_bloqueado
      FROM public.perfis p
     WHERE p.id = COALESCE(p_perfil, (SELECT auth.uid()))
  )
  SELECT COALESCE((
    SELECT a.ativo
       AND NOT a.chat_bloqueado
       AND (
         -- Chave-mestra: o super_admin entra com a aba ainda fechada, e nao se
         -- tranca fora mexendo no proprio painel.
         a.perfil = 'super_admin'
         OR (
           COALESCE((SELECT c.liberado FROM public.chat_config c
                      WHERE c.empresa_id = a.empresa_id), FALSE)
           AND public.fn_perfil_tem(a.id, 'ver_chat')
         )
       )
      FROM alvo a
  ), FALSE);
$$;

REVOKE ALL     ON FUNCTION public.fn_chat_pode_usar(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_chat_pode_usar(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_pode_usar(UUID) IS
  'Sem argumento: eu posso usar o chat? Com argumento: aquela pessoa RECEBE? '
  'Fecha as duas pontas — quem nao pode usar tambem nao recebe.';

-- ── Alcance: com quem eu consigo INICIAR ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_alcanca(p_alvo UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_alvo <> (SELECT auth.uid())
     AND public.fn_chat_pode_usar()
     AND public.fn_chat_pode_usar(p_alvo)
     AND EXISTS (SELECT 1 FROM public.perfis a, public.perfis b
                  WHERE a.id = (SELECT auth.uid()) AND b.id = p_alvo
                    AND a.empresa_id = b.empresa_id)
     AND (
       public.fn_user_is_super_admin()
       OR public.fn_user_tem('chat_escopo_todos_setores')
       OR (public.fn_user_tem('chat_escopo_setor') AND EXISTS (
             -- fn_setores_do_operador devolve SETOF uuid (nao uma tabela com
             -- coluna): o valor da linha e o proprio setor.
             SELECT 1 FROM public.fn_setores_do_operador((SELECT auth.uid())) meu
             WHERE meu IN (SELECT public.fn_setores_do_operador(p_alvo))))
       OR (public.fn_user_tem('chat_escopo_equipe') AND EXISTS (
             SELECT 1 FROM public.fn_equipes_do_operador((SELECT auth.uid())) minha
             WHERE minha.equipe_id IN (
               SELECT e.equipe_id FROM public.fn_equipes_do_operador(p_alvo) e
             )))
     );
$$;

REVOKE ALL     ON FUNCTION public.fn_chat_alcanca(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_chat_alcanca(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_chat_alcanca(UUID) IS
  'Consigo INICIAR conversa com esta pessoa? Nao vale para responder: quem ja '
  'me escreveu eu respondo sempre, mesmo fora do alcance. Ver fn_chat_abrir.';

-- ── Sou parte desta conversa? ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_sou_parte(p_conversa UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_conversas c
     WHERE c.id = p_conversa
       AND (SELECT auth.uid()) IN (c.par_menor, c.par_maior)
  ) AND public.fn_chat_pode_usar();
$$;

REVOKE ALL     ON FUNCTION public.fn_chat_sou_parte(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_chat_sou_parte(UUID) TO authenticated;

-- ── Abrir (ou reabrir) uma conversa ─────────────────────────────────────────
--
-- RPC, e nao INSERT direto: a ordenacao do par, a criacao dos dois
-- participantes e a checagem de alcance tem que acontecer juntas. Duas pessoas
-- clicando ao mesmo tempo caem no ON CONFLICT e recebem a MESMA conversa.

CREATE OR REPLACE FUNCTION public.fn_chat_abrir(p_alvo UUID)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eu        UUID := (SELECT auth.uid());
  v_empresa   UUID;
  v_menor     UUID;
  v_maior     UUID;
  v_conversa  UUID;
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'sem_sessao'; END IF;

  SELECT c.id INTO v_conversa
    FROM public.chat_conversas c
   WHERE (v_eu, p_alvo) IN ((c.par_menor, c.par_maior), (c.par_maior, c.par_menor));

  -- Conversa que ja existe eu reabro sempre: responder nao depende de alcance.
  IF v_conversa IS NULL AND NOT public.fn_chat_alcanca(p_alvo) THEN
    RAISE EXCEPTION 'fora_do_alcance';
  END IF;

  IF v_conversa IS NULL THEN
    SELECT p.empresa_id INTO v_empresa FROM public.perfis p WHERE p.id = v_eu;
    v_menor := LEAST(v_eu, p_alvo);
    v_maior := GREATEST(v_eu, p_alvo);

    INSERT INTO public.chat_conversas (empresa_id, par_menor, par_maior)
    VALUES (v_empresa, v_menor, v_maior)
    ON CONFLICT (empresa_id, par_menor, par_maior) DO NOTHING
    RETURNING id INTO v_conversa;

    IF v_conversa IS NULL THEN     -- perdi a corrida; pego a que o outro criou
      SELECT c.id INTO v_conversa FROM public.chat_conversas c
       WHERE c.empresa_id = v_empresa AND c.par_menor = v_menor AND c.par_maior = v_maior;
    END IF;

    INSERT INTO public.chat_participantes (conversa_id, perfil_id)
    VALUES (v_conversa, v_menor), (v_conversa, v_maior)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Reabrir para MIM. O outro lado so volta quando eu escrever de fato.
  UPDATE public.chat_participantes
     SET apagada_em = NULL
   WHERE conversa_id = v_conversa AND perfil_id = v_eu;

  RETURN v_conversa;
END;
$$;

REVOKE ALL     ON FUNCTION public.fn_chat_abrir(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_chat_abrir(UUID) TO authenticated;

-- ── Mensagem nova mexe na conversa ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_apos_mensagem()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.chat_conversas
     SET ultima_mensagem_em = NEW.criado_em
   WHERE id = NEW.conversa_id;

  -- Quem tinha apagado volta a ver: mensagem nova ressuscita a conversa dos
  -- dois lados. Sem isto, apagar viraria bloqueio silencioso.
  UPDATE public.chat_participantes
     SET apagada_em = NULL
   WHERE conversa_id = NEW.conversa_id AND apagada_em IS NOT NULL;

  -- Quem escreveu leu o que escreveu.
  UPDATE public.chat_participantes
     SET ultima_leitura_em = NEW.criado_em
   WHERE conversa_id = NEW.conversa_id AND perfil_id = NEW.autor_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_apos_mensagem ON public.chat_mensagens;
CREATE TRIGGER trg_chat_apos_mensagem
AFTER INSERT ON public.chat_mensagens
FOR EACH ROW EXECUTE FUNCTION public.fn_chat_apos_mensagem();

-- ── CPF: marca na escrita, expurga em 12h ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_marcar_cpf()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Mensagem ja expurgada nao volta a ser marcada: o texto censurado nao tem
  -- CPF, e rearmar o relogio deixaria a linha em ciclo eterno.
  IF NEW.expurgado_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF public.fn_texto_tem_cpf(NEW.texto) THEN
    NEW.tem_cpf := TRUE;
    -- So arma uma vez. Editar depois nao estica o prazo.
    NEW.expurgar_em := COALESCE(NEW.expurgar_em, now() + INTERVAL '12 hours');
  ELSE
    NEW.tem_cpf := FALSE;
    NEW.expurgar_em := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_marcar_cpf ON public.chat_mensagens;
CREATE TRIGGER trg_chat_marcar_cpf
BEFORE INSERT OR UPDATE OF texto ON public.chat_mensagens
FOR EACH ROW EXECUTE FUNCTION public.fn_chat_marcar_cpf();

-- A varredura ganha a tabela nova. Mesma funcao, para existir UM lugar que
-- limpa CPF de chat — e nao dois que podem divergir.
CREATE OR REPLACE FUNCTION public.fn_expurgar_cpf_chat()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_msgs  INTEGER;
  v_solic INTEGER;
  v_chat  INTEGER;
BEGIN
  UPDATE public.solicitacoes_whatsapp_mensagens
     SET conteudo = public.fn_texto_censurado_cpf(), expurgado_em = now()
   WHERE tem_cpf AND expurgado_em IS NULL
     AND expurgar_em IS NOT NULL AND expurgar_em <= now();
  GET DIAGNOSTICS v_msgs = ROW_COUNT;

  UPDATE public.solicitacoes_whatsapp
     SET mensagem = public.fn_texto_censurado_cpf(), msg_expurgado_em = now()
   WHERE msg_tem_cpf AND msg_expurgado_em IS NULL
     AND msg_expurgar_em IS NOT NULL AND msg_expurgar_em <= now();
  GET DIAGNOSTICS v_solic = ROW_COUNT;

  UPDATE public.chat_mensagens
     SET texto = public.fn_texto_censurado_cpf(), expurgado_em = now()
   WHERE tem_cpf AND expurgado_em IS NULL
     AND expurgar_em IS NOT NULL AND expurgar_em <= now();
  GET DIAGNOSTICS v_chat = ROW_COUNT;

  RETURN v_msgs + v_solic + v_chat;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_expurgar_cpf_chat() FROM authenticated;

-- ── Catalogo de permissoes ──────────────────────────────────────────────────
--
-- As quatro chaves novas nascem em `ninguem`. Ver o cabecalho: o administrador
-- ainda assim passaria por `fn_user_tem`, e quem o segura e `chat_config`.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH atalhos AS (
    SELECT
      ARRAY['lider','elite','gerencia','diretoria']::TEXT[] AS lideranca,
      ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[] AS todos,
      ARRAY['gerencia','diretoria']::TEXT[] AS cupula,
      ARRAY[]::TEXT[] AS ninguem
  )
  SELECT t.* FROM atalhos, LATERAL (VALUES
    -- Abas e telas
    ('ver_acordos',                 ARRAY['bookplay'],  todos,     false),
    ('ver_analitico',               NULL::TEXT[],       todos,     false),
    ('ver_painel_lider',            NULL::TEXT[],       lideranca, false),
    ('ver_painel_diretoria',        NULL::TEXT[],       ARRAY['diretoria'], false),
    ('ver_ouvidoria',               ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('ver_campanha_facil',          ARRAY['bookplay'],  lideranca, false),
    ('ver_solicitacoes_whatsapp',   NULL::TEXT[],       todos,     false),
    ('ver_pix_automatico',          ARRAY['bookplay'],  todos,     false),
    ('ver_tickets',                 NULL::TEXT[],       ARRAY['lider','elite','gerencia','diretoria','ouvidoria'], false),
    ('ver_lixeira',                 NULL::TEXT[],       todos,     false),
    ('ver_logs',                    NULL::TEXT[],       ninguem,   false),
    ('ver_configuracoes',           NULL::TEXT[],       ninguem,   false),
    -- Monitoramento de uso: aba interna de Logs, chave propria. Ate 24/08 a
    -- policy exigia cargo `administrador` e a sub-aba nao consultava nada —
    -- quem tinha `ver_logs` via a aba e recebia zero linhas.
    ('ver_monitoramento_uso',       NULL::TEXT[],       ninguem,   false),
    -- Banco de dados: sub-aba de Configuracoes, era `isPerfilAdmin` na tela.
    ('ver_banco_dados',             NULL::TEXT[],       ninguem,   false),
    -- Acordos
    ('acordos_escopo_individual',    ARRAY['bookplay'], todos,     false),
    ('acordos_escopo_equipe',        ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('acordos_escopo_setor',         ARRAY['bookplay'], lideranca, false),
    ('acordos_escopo_todos_setores', ARRAY['bookplay'], cupula,    false),
    ('criar_acordos',               NULL::TEXT[],       todos,     false),
    ('editar_acordos',              NULL::TEXT[],       todos,     false),
    ('excluir_acordos',             NULL::TEXT[],       todos,     false),
    ('excluir_em_lote',             NULL::TEXT[],       lideranca, false),
    -- Autorizar tabulacao (transferir NR, vinculo EXTRA, duplicados na
    -- importacao). Espelha `PERFIS_AUTORIZADORES` no frontend E a checagem de
    -- `fn_transferir_acordo_nr` no banco — as duas listas viram esta chave.
    ('acordos_autorizar_tabulacao', NULL::TEXT[],       lideranca, false),
    ('acordos_capturar_erp',        ARRAY['pagueplay'], ninguem,   false),
    ('acordos_campos_admin',        ARRAY['bookplay'],  ninguem,   false),
    -- Importacoes
    ('importar_excel',              NULL::TEXT[],       todos,     false),
    ('importar_analitico',          NULL::TEXT[],       lideranca, false),
    ('importar_diario',             NULL::TEXT[],       lideranca, false),
    -- Gestao de pessoas
    ('ver_usuarios',                NULL::TEXT[],       lideranca, false),
    ('ver_equipes',                 NULL::TEXT[],       lideranca, false),
    ('ver_operadores',              NULL::TEXT[],       lideranca, false),
    ('usuarios_escopo_setor',         NULL::TEXT[], todos, false),
    ('usuarios_escopo_todos_setores', NULL::TEXT[], ARRAY['gerencia','diretoria','ouvidoria'], false),
    -- Metas
    ('ver_metas',                   NULL::TEXT[],       lideranca, false),
    ('usuarios_administrar',         NULL::TEXT[], ninguem, false),
    ('usuarios_editar_do_setor',     NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('usuarios_transferir',          NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria'], false),
    -- Quem enxerga contas de administrador na LISTA de usuarios. E outro eixo
    -- que o escopo: «ate onde eu vejo» e «quem eu vejo» sao perguntas
    -- diferentes, e juntar as duas foi o que produziu o filtro atual.
    ('usuarios_ver_administradores',    NULL::TEXT[], ninguem, false),
    ('usuarios_desfazer_transferencia', NULL::TEXT[], ninguem, false),
    ('equipes_criar_editar',         NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('equipes_excluir',              NULL::TEXT[], ninguem, false),
    ('equipes_gerenciar_composicao', NULL::TEXT[], ARRAY['lider','gerencia'], false),
    ('metas_editar',                 NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('metas_excluir',                NULL::TEXT[], ninguem, false),
    ('metas_editar_dias_uteis',      NULL::TEXT[], ARRAY['lider'], false),
    ('metas_excluir_dias_uteis',     NULL::TEXT[], ninguem, false),
    -- Acesso as duas operacoes. A flag `acesso_multiempresa` continua sendo por
    -- PESSOA; esta chave e o cargo que a flag pode habilitar.
    ('acesso_multiempresa_permitido', NULL::TEXT[], cupula, false),
    -- Filtros e visao (globais — em desmonte pela reestruturacao por aba)
    ('filtrar_por_usuario',         NULL::TEXT[],       lideranca, false),
    -- Pix Automatico
    ('pix_escopo_individual',        ARRAY['bookplay'], todos,     false),
    ('pix_escopo_equipe',            ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_escopo_setor',             ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_escopo_todos_setores',     ARRAY['bookplay'], ARRAY['gerencia'], false),
    ('pix_editar_configuracoes',     ARRAY['bookplay'], ARRAY['lider','elite','gerencia','ouvidoria'], false),
    ('pix_ajustar_saldo',            ARRAY['bookplay'], ARRAY['lider','elite','gerencia'], false),
    -- Painel Diretoria
    ('painel_diretoria_escopo_setor',         NULL::TEXT[], ARRAY['gerencia'],  false),
    ('painel_diretoria_escopo_todos_setores', NULL::TEXT[], ARRAY['diretoria'], false),
    -- Acoes especificas
    ('administrar_sistema',    NULL::TEXT[], ninguem, false),
    ('comemoracoes_gerenciar', NULL::TEXT[], ARRAY['diretoria'], false),
    ('editar_ouvidoria',            ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('gerenciar_acessos_ouvidoria', ARRAY['pagueplay'], ninguem,   false),
    -- Ser o RESPONSAVEL pela ouvidoria: enxerga tudo da aba sem depender de
    -- concessao em `ouvidoria_acessos`. Era `cargo === 'ouvidoria'` na tela.
    ('ouvidoria_responsavel',       ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('criar_solicitacao_whatsapp',  NULL::TEXT[],       todos,     false),
    ('aprovar_pix_automatico',      ARRAY['bookplay'],  lideranca, false),
    ('ignorar_fechamento_mes',      NULL::TEXT[],       ninguem,   true),
    -- Tickets. A aba ja tinha `ver_tickets`; o que decidia QUEM administra e
    -- quem abre chamado continuava sendo cargo, dentro de `useTicketsAcesso`.
    ('tickets_administrar',         NULL::TEXT[],       ninguem,   false),
    ('tickets_abrir',               NULL::TEXT[],       ARRAY['lider','elite','gerencia','diretoria','ouvidoria'], false),
    -- Lixeira
    ('lixeira_escopo_individual',   NULL::TEXT[],       todos,     false),
    ('lixeira_escopo_equipe',       NULL::TEXT[],       lideranca, false),
    ('lixeira_escopo_setor',        NULL::TEXT[],       lideranca, false),
    ('lixeira_escopo_todos_setores', NULL::TEXT[],      cupula,    false),
    ('lixeira_restaurar',           NULL::TEXT[],       todos,     false),
    ('lixeira_limpar',              NULL::TEXT[],       todos,     false),
    -- Painel Lider
    ('painel_lider_escopo_setor',            NULL::TEXT[], lideranca, false),
    ('painel_lider_escopo_todos_setores',    NULL::TEXT[], ARRAY['diretoria'], false),
    ('painel_lider_sub_acompanhamento',      NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_desempenho_equipes',  NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_quartis',             NULL::TEXT[], lideranca, false),
    ('painel_lider_sub_grafico_recebimento', NULL::TEXT[], lideranca, false),
    -- Dashboard
    ('dashboard_escopo_individual',    NULL::TEXT[], todos,     false),
    ('dashboard_escopo_equipe',        NULL::TEXT[], lideranca, false),
    ('dashboard_escopo_setor',         NULL::TEXT[], lideranca, false),
    ('dashboard_escopo_todos_setores', NULL::TEXT[], cupula,    false),
    -- Analitico
    ('analitico_escopo_individual',      NULL::TEXT[], ARRAY['operador','elite'], false),
    ('analitico_escopo_setor',           NULL::TEXT[], ARRAY['lider','elite','gerencia','ouvidoria','diretoria'], false),
    ('analitico_escopo_todos_setores',   NULL::TEXT[], cupula,    false),
    ('analitico_sub_analitico',          NULL::TEXT[], todos,     false),
    ('analitico_sub_recebimento_diario', NULL::TEXT[], todos,     false),
    ('analitico_sub_colchao',            NULL::TEXT[], todos,     false),
    ('analitico_sub_desafios',           NULL::TEXT[], todos,     false),
    ('analitico_sub_por_operador',       NULL::TEXT[], todos,     false),
    ('analitico_sub_formas_pagamento',   NULL::TEXT[], todos,     false),
    ('analitico_sub_ranking',            NULL::TEXT[], todos,     false),
    ('analitico_sub_destaques_dia',      NULL::TEXT[], todos,     false),
    ('analitico_sub_sem_operador',       NULL::TEXT[], todos,     false),
    -- Validar o relatorio importado. Era `isPerfilAdmin` na tela, e a diretoria
    -- ficava de fora de proposito — validacao desfaz numero ja publicado.
    ('analitico_validar_relatorio',      NULL::TEXT[], ninguem,   false),
    -- RH Gestao. O cargo `rh` entra nominalmente: ele NAO herda o atalho
    -- `todos`, que e da operacao.
    ('ver_rh_gestao',              NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria','rh'], false),
    ('rh_escopo_equipe',           NULL::TEXT[], ARRAY['lider','elite'], false),
    ('rh_escopo_setor',            NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_escopo_todos_setores',    NULL::TEXT[], ARRAY['diretoria','rh'], false),
    ('rh_preencher',               NULL::TEXT[], ARRAY['lider','elite','gerencia'], false),
    ('rh_validar',                 NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_enviar',                  NULL::TEXT[], ARRAY['gerencia'], false),
    ('rh_aprovar',                 NULL::TEXT[], ARRAY['gerencia','rh'], false),
    ('rh_devolver',                NULL::TEXT[], ARRAY['gerencia','rh'], false),
    ('rh_dispensar',               NULL::TEXT[], ARRAY['lider','elite','gerencia','rh'], false),
    ('rh_gerenciar_fechamento',    NULL::TEXT[], ARRAY['rh'], false),
    ('rh_reabrir_fechamento',      NULL::TEXT[], ninguem,   true),
    ('rh_configurar',              NULL::TEXT[], ARRAY['rh'], false),
    ('rh_editar_cracha',           NULL::TEXT[], ARRAY['rh'], false),
    -- Ajuste manual de recebimento
    ('painel_lider_sub_ajuste_recebimento', NULL::TEXT[], lideranca, false),
    ('ajuste_recebimento_lancar',           NULL::TEXT[], lideranca, false),
    ('ajuste_recebimento_administrar',      NULL::TEXT[], ninguem,   false),
    -- Desafios
    ('desafios_configurar',        NULL::TEXT[], ninguem,   false),
    ('desafios_configurar_setor',  NULL::TEXT[], lideranca, false),
    -- Chat interno. TODAS nascem em 'ninguem' — ver o cabecalho da migration.
    ('ver_chat',                   NULL::TEXT[], ninguem,   false),
    ('chat_escopo_equipe',         NULL::TEXT[], ninguem,   false),
    ('chat_escopo_setor',          NULL::TEXT[], ninguem,   false),
    ('chat_escopo_todos_setores',  NULL::TEXT[], ninguem,   false)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- A trava e sempre a mesma: `fn_chat_sou_parte` (ou `fn_chat_pode_usar` para a
-- config). Quem perdeu o direito ao chat para de ler o proprio historico — foi
-- pedido assim: bloquear alguem fecha as duas pontas.

ALTER TABLE public.chat_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mensagens    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_config_select ON public.chat_config;
CREATE POLICY chat_config_select ON public.chat_config FOR SELECT TO authenticated
USING (public.fn_can_access_empresa(empresa_id));

-- So super_admin vira a chave de lancamento.
DROP POLICY IF EXISTS chat_config_update ON public.chat_config;
CREATE POLICY chat_config_update ON public.chat_config FOR UPDATE TO authenticated
USING      (public.fn_user_is_super_admin() AND public.fn_can_access_empresa(empresa_id))
WITH CHECK (public.fn_user_is_super_admin() AND public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS chat_conversas_select ON public.chat_conversas;
CREATE POLICY chat_conversas_select ON public.chat_conversas FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IN (par_menor, par_maior) AND public.fn_chat_pode_usar());

-- Sem INSERT direto: quem cria conversa e `fn_chat_abrir`, que ordena o par e
-- confere o alcance. Um INSERT solto criaria (B,A) alem de (A,B).

DROP POLICY IF EXISTS chat_part_select ON public.chat_participantes;
CREATE POLICY chat_part_select ON public.chat_participantes FOR SELECT TO authenticated
USING (public.fn_chat_sou_parte(conversa_id));

-- Cada um mexe SO na propria linha: marcar lido, apagar da lista.
DROP POLICY IF EXISTS chat_part_update ON public.chat_participantes;
CREATE POLICY chat_part_update ON public.chat_participantes FOR UPDATE TO authenticated
USING      (perfil_id = (SELECT auth.uid()) AND public.fn_chat_sou_parte(conversa_id))
WITH CHECK (perfil_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS chat_msg_select ON public.chat_mensagens;
CREATE POLICY chat_msg_select ON public.chat_mensagens FOR SELECT TO authenticated
USING (public.fn_chat_sou_parte(conversa_id));

DROP POLICY IF EXISTS chat_msg_insert ON public.chat_mensagens;
CREATE POLICY chat_msg_insert ON public.chat_mensagens FOR INSERT TO authenticated
WITH CHECK (
  autor_id = (SELECT auth.uid())
  AND public.fn_chat_sou_parte(conversa_id)
  -- O OUTRO lado tambem precisa poder receber: mandar para quem esta bloqueado
  -- seria escrever no vazio.
  AND EXISTS (
    SELECT 1 FROM public.chat_conversas c
     WHERE c.id = conversa_id
       AND public.fn_chat_pode_usar(
             CASE WHEN c.par_menor = (SELECT auth.uid()) THEN c.par_maior ELSE c.par_menor END)
  )
);

-- Sem UPDATE e sem DELETE de mensagem: "tudo tem que ficar registrado". Quem
-- apaga texto e o expurgo de CPF, por gatilho, e ele deixa o rastro.

GRANT SELECT                 ON public.chat_config        TO authenticated;
GRANT UPDATE                 ON public.chat_config        TO authenticated;
GRANT SELECT                 ON public.chat_conversas     TO authenticated;
GRANT SELECT, UPDATE         ON public.chat_participantes TO authenticated;
GRANT SELECT, INSERT         ON public.chat_mensagens     TO authenticated;

-- ── Anexos ──────────────────────────────────────────────────────────────────
--
-- 10 MB por arquivo, decisao de 25/08. O limite vive no balde, e nao so na
-- tela: validacao que so existe no cliente e sugestao.

-- PRIVADO, ao contrario do balde `tickets`, que e publico.
--
-- Balde publico entrega o arquivo a quem tiver a URL, sem sessao e para sempre.
-- Num chat isso contradiz o resto desta migration: o CPF escrito no texto sai
-- em 12 horas, e o mesmo CPF numa foto ficaria legivel por qualquer um com o
-- link, sem prazo. A tela le anexo por URL assinada.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat', 'chat', FALSE, 10485760)
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS chat_anexo_read ON storage.objects;
CREATE POLICY chat_anexo_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat' AND public.fn_chat_pode_usar());

DROP POLICY IF EXISTS chat_anexo_write ON storage.objects;
CREATE POLICY chat_anexo_write ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat' AND public.fn_chat_pode_usar());

DROP POLICY IF EXISTS chat_anexo_delete ON storage.objects;
CREATE POLICY chat_anexo_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat' AND owner = (SELECT auth.uid()));

-- ── Tempo real ──────────────────────────────────────────────────────────────
--
-- Mensagem e conversa entram por `postgres_changes` (helper `assinarTabela`).
-- "Digitando" e "online" NAO passam por aqui: sao Presence/Broadcast, efemeros,
-- e nao tocam o banco de proposito — heartbeat nao e dado.

ALTER TABLE public.chat_mensagens     REPLICA IDENTITY FULL;
ALTER TABLE public.chat_conversas     REPLICA IDENTITY FULL;
ALTER TABLE public.chat_participantes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensagens;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversas;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participantes;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
