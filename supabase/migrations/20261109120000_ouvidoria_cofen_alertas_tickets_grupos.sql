-- ============================================================================
-- Ouvidoria Cofen 2: retorno agendado, encaminhamento, etiquetas de anuidade,
-- tickets pendentes e grupos (09/11/2026)
-- ============================================================================
--
-- Pedido do Cleber (09/11/2026), sobre a aba de 20261106150000/180000:
--
--   1. RETORNO AGENDADO. Cada manifestação aberta em acompanhamento pode ter
--      um retorno marcado (dia e hora). A aba avisa uma hora antes. Colunas
--      `retorno_agendado_*`; `fn_ouvidoria_cofen_agendar_retorno` marca ou
--      cancela, `fn_ouvidoria_cofen_retorno_dado` dá baixa.
--
--   2. ENCAMINHAMENTO. Quem registra é o responsável primário (`criado_por`,
--      que já existia e não muda). `responsavel_id` passa a ser «encaminhado
--      para»: a pessoa acima que vai analisar. Ela recebe notificação, dá
--      ciência e responde; quem encaminhou vê a resposta.
--      `fn_ouvidoria_cofen_encaminhamento(id, 'ciente' | 'responder' | 'visto')`.
--      O encaminhado precisa ter acesso à Ouvidoria (senão não veria o aviso).
--
--   3. ETIQUETAS DE ANUIDADE. Cada setor tem a sua legenda de cores
--      (`ouvidoria_etiquetas`: «verde = alegou ter pago»…). A manifestação
--      guarda qual etiqueta cada ano tem (`anuidades_etiquetas`, {"2024": id}).
--
--   4. TICKETS. A manifestação pode ser marcada «precisa abrir ticket» (no
--      sistema Mundial). `ticket_status` pendente → aberto (com o número).
--      `fn_ouvidoria_cofen_ticket`. O texto do ticket é montado na tela.
--
--   5. GRUPOS. Reclamação repetida do dia (ex.: «pagou e não deu baixa»):
--      `ouvidoria_grupos` guarda o assunto e o relato padrão; a manifestação
--      ganha `grupo_id`. Entra ao nascer (salvar com `grupo_id`) ou movida
--      depois (`fn_ouvidoria_cofen_grupo_mover`).
--
-- `fn_ouvidoria_cofen_salvar` é reescrita: os campos novos só mudam quando
-- vêm no `p_dados` (`?`), então uma tela antiga não apaga o que não conhece.
--
-- Nada é destrutivo: só ADD COLUMN, tabelas novas e funções. Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Tabelas novas ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ouvidoria_etiquetas (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID        NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  setor_id   UUID        NOT NULL REFERENCES public.setores (id),
  nome       TEXT        NOT NULL,
  cor        TEXT        NOT NULL,
  criado_por UUID        REFERENCES public.perfis (id) ON DELETE SET NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ouvidoria_etiquetas_nome CHECK (char_length(btrim(nome)) BETWEEN 1 AND 40),
  CONSTRAINT ouvidoria_etiquetas_cor CHECK (
    cor IN ('verde', 'vermelho', 'amarelo', 'azul', 'roxo', 'laranja', 'rosa', 'cinza'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ouvidoria_etiquetas_nome_unico
  ON public.ouvidoria_etiquetas (setor_id, lower(btrim(nome)));

COMMENT ON TABLE public.ouvidoria_etiquetas IS
  'Legenda de cores das anuidades na Ouvidoria Cofen, por setor. Ver 20261109120000.';

CREATE SEQUENCE IF NOT EXISTS public.ouvidoria_grupos_numero_seq;

CREATE TABLE IF NOT EXISTS public.ouvidoria_grupos (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID        NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  setor_id            UUID        NOT NULL REFERENCES public.setores (id),
  numero              BIGINT      NOT NULL DEFAULT nextval('public.ouvidoria_grupos_numero_seq'),
  codigo              TEXT        NOT NULL,
  titulo              TEXT        NOT NULL,
  assunto             TEXT        NOT NULL,
  canal               TEXT,
  descricao           TEXT        NOT NULL,
  providencia         TEXT,
  responsavel_id      UUID        REFERENCES public.perfis (id) ON DELETE SET NULL,
  responsavel_nome    TEXT,
  encerrado_em        TIMESTAMPTZ,
  criado_por          UUID        REFERENCES public.perfis (id) ON DELETE SET NULL,
  criado_por_nome     TEXT,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por      UUID        REFERENCES public.perfis (id) ON DELETE SET NULL,
  atualizado_por_nome TEXT,
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ouvidoria_grupos_codigo_unico UNIQUE (codigo),
  CONSTRAINT ouvidoria_grupos_titulo CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 120),
  CONSTRAINT ouvidoria_grupos_descricao CHECK (btrim(descricao) <> ''),
  CONSTRAINT ouvidoria_grupos_assunto CHECK (
    assunto IN ('operador', 'chatplay', 'cobranca_indevida', 'reclamacao_generica', 'outros')),
  CONSTRAINT ouvidoria_grupos_canal CHECK (
    canal IS NULL OR canal IN ('telefone', 'whatsapp', 'email', 'ouvidoria', 'outro'))
);

CREATE INDEX IF NOT EXISTS ouvidoria_grupos_setor
  ON public.ouvidoria_grupos (setor_id, criado_em DESC);

COMMENT ON TABLE public.ouvidoria_grupos IS
  'Grupos de manifestações com a mesma reclamação (Ouvidoria Cofen). Ver 20261109120000.';

ALTER TABLE public.ouvidoria_etiquetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ouvidoria_grupos    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ouvidoria_etiquetas FROM anon, authenticated;
REVOKE ALL ON public.ouvidoria_grupos    FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.ouvidoria_grupos_numero_seq FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_ouvidoria_grupos ON public.ouvidoria_grupos;
CREATE TRIGGER trg_log_ouvidoria_grupos
  AFTER INSERT OR DELETE OR UPDATE ON public.ouvidoria_grupos
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
    'ouvidoria', 'ouvidoria_grupo', 'o grupo', 'codigo,titulo',
    'atualizado_por,atualizado_por_nome', 'empresa_id', 'aviso');

-- ── 2. Colunas novas na manifestação ────────────────────────────────────────

ALTER TABLE public.ouvidoria_manifestacoes
  ADD COLUMN IF NOT EXISTS grupo_id                     UUID REFERENCES public.ouvidoria_grupos (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anuidades_etiquetas          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retorno_agendado_em          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retorno_agendado_nota        TEXT,
  ADD COLUMN IF NOT EXISTS retorno_agendado_por         UUID REFERENCES public.perfis (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retorno_agendado_por_nome    TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_encaminhado_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responsavel_ciente_em        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responsavel_respondeu_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responsavel_resposta_vista_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ticket_status                TEXT,
  ADD COLUMN IF NOT EXISTS ticket_pedido                TEXT,
  ADD COLUMN IF NOT EXISTS ticket_numero                TEXT,
  ADD COLUMN IF NOT EXISTS ticket_aberto_em             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ticket_aberto_por_nome       TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'ouvidoria_manifestacoes_ticket_status'
                    AND conrelid = 'public.ouvidoria_manifestacoes'::regclass) THEN
    ALTER TABLE public.ouvidoria_manifestacoes
      ADD CONSTRAINT ouvidoria_manifestacoes_ticket_status
      CHECK (ticket_status IS NULL OR ticket_status IN ('pendente', 'aberto'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'ouvidoria_manifestacoes_etiquetas_objeto'
                    AND conrelid = 'public.ouvidoria_manifestacoes'::regclass) THEN
    ALTER TABLE public.ouvidoria_manifestacoes
      ADD CONSTRAINT ouvidoria_manifestacoes_etiquetas_objeto
      CHECK (jsonb_typeof(anuidades_etiquetas) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ouvidoria_manifestacoes_grupo
  ON public.ouvidoria_manifestacoes (grupo_id) WHERE grupo_id IS NOT NULL;

COMMENT ON COLUMN public.ouvidoria_manifestacoes.responsavel_id IS
  'Encaminhado para: quem analisa acima de quem registrou. O responsável primário é criado_por.';
COMMENT ON COLUMN public.ouvidoria_manifestacoes.anuidades_etiquetas IS
  'Etiqueta (ouvidoria_etiquetas.id) de cada ano de anuidade: {"2024": "<uuid>"}.';
COMMENT ON COLUMN public.ouvidoria_manifestacoes.ticket_status IS
  'NULL = não precisa; pendente = falta abrir no sistema Mundial; aberto = aberto (ticket_numero).';

-- ── 3. Linha do tempo: os tipos novos ───────────────────────────────────────

ALTER TABLE public.ouvidoria_andamentos DROP CONSTRAINT IF EXISTS ouvidoria_andamentos_tipo;
ALTER TABLE public.ouvidoria_andamentos ADD CONSTRAINT ouvidoria_andamentos_tipo CHECK (
  tipo IN ('criada', 'status', 'retorno', 'responsavel', 'acompanhamento', 'edicao', 'nota',
           'agendamento', 'ciencia', 'resposta', 'ticket', 'grupo'));

-- Uma entrada na linha do tempo. Só as funções da Ouvidoria chamam.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_andar(p_m UUID, p_empresa UUID, p_tipo TEXT, p_texto TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, autor_id, autor_nome)
  SELECT p_m, p_empresa, p_tipo, p_texto, (SELECT auth.uid()),
         (SELECT p.nome FROM public.perfis p WHERE p.id = (SELECT auth.uid()));
$function$;

REVOKE ALL ON FUNCTION public.fn_ouvidoria_andar(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ── 4. Legenda inicial: as duas cores do pedido, em cada setor Cofen ────────

INSERT INTO public.ouvidoria_etiquetas (empresa_id, setor_id, nome, cor)
SELECT s.empresa_id, s.id, v.nome, v.cor
  FROM public.setores s
 CROSS JOIN (VALUES ('Alegou ter pago', 'verde'), ('Alegou ter cancelado', 'vermelho')) v(nome, cor)
 WHERE s.regra = 'cofen'
   AND s.excluido_em IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.ouvidoria_etiquetas e
                    WHERE e.setor_id = s.id AND lower(btrim(e.nome)) = lower(v.nome));

-- ── 5. Salvar (reescrita) ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_salvar(p_setor_id UUID, p_id UUID, p_dados JSONB)
RETURNS public.ouvidoria_manifestacoes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid        UUID := (SELECT auth.uid());
  v_eu_nome    TEXT;
  v_empresa    UUID;
  v_antes      public.ouvidoria_manifestacoes;
  v_depois     public.ouvidoria_manifestacoes;
  v_num        BIGINT;
  v_data       DATE;
  v_canal      TEXT := NULLIF(btrim(p_dados ->> 'canal'), '');
  v_nome       TEXT := NULLIF(btrim(p_dados ->> 'nome_profissional'), '');
  v_codigo_cli TEXT := NULLIF(regexp_replace(COALESCE(p_dados ->> 'codigo_cliente', ''), '\s', '', 'g'), '');
  v_uf         TEXT := NULLIF(upper(btrim(p_dados ->> 'conselho_uf')), '');
  v_assunto    TEXT := NULLIF(btrim(p_dados ->> 'assunto'), '');
  v_descricao  TEXT := NULLIF(btrim(p_dados ->> 'descricao'), '');
  v_anuidades  INTEGER[];
  v_situacao   TEXT := NULLIF(btrim(p_dados ->> 'situacao_financeira'), '');
  v_providenc  TEXT := NULLIF(btrim(p_dados ->> 'providencia'), '');
  v_resp_id    UUID := NULLIF(p_dados ->> 'responsavel_id', '')::UUID;
  v_resp_nome  TEXT;
  v_resposta   DATE := NULLIF(p_dados ->> 'data_resposta', '')::DATE;
  v_acompanhar BOOLEAN := COALESCE((p_dados ->> 'acompanhar')::BOOLEAN, FALSE);
  v_status     TEXT := NULLIF(btrim(p_dados ->> 'status'), '');
  v_obs        TEXT := NULLIF(btrim(p_dados ->> 'observacoes'), '');
  v_grupo      UUID := NULLIF(p_dados ->> 'grupo_id', '')::UUID;
  v_grupo_row  public.ouvidoria_grupos;
  v_etq_fonte  JSONB;
  v_etq        JSONB;
  v_tkt_status TEXT;
  v_tkt_pedido TEXT;
  v_resp_mudou BOOLEAN;
  v_mudou      TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso à Ouvidoria deste setor.' USING ERRCODE = '42501';
  END IF;

  SELECT s.empresa_id INTO v_empresa FROM public.setores s WHERE s.id = p_setor_id;
  SELECT p.nome INTO v_eu_nome FROM public.perfis p WHERE p.id = v_uid;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_antes FROM public.ouvidoria_manifestacoes m
     WHERE m.id = p_id AND m.setor_id = p_setor_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Manifestação não encontrada neste setor.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Obrigatórios.
  v_data := COALESCE(NULLIF(p_dados ->> 'data_manifestacao', '')::DATE,
                     (now() AT TIME ZONE 'America/Sao_Paulo')::DATE);
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Informe o nome do profissional.' USING ERRCODE = '22023'; END IF;
  IF v_canal IS NULL THEN RAISE EXCEPTION 'Escolha o canal de atendimento.' USING ERRCODE = '22023'; END IF;
  IF v_assunto IS NULL THEN RAISE EXCEPTION 'Escolha o assunto.' USING ERRCODE = '22023'; END IF;
  IF v_descricao IS NULL THEN RAISE EXCEPTION 'Descreva a reclamação.' USING ERRCODE = '22023'; END IF;
  IF v_data > (now() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'A data da manifestação não pode ser no futuro.' USING ERRCODE = '22023';
  END IF;
  IF v_resposta IS NOT NULL AND v_resposta < v_data THEN
    RAISE EXCEPTION 'A data da resposta não pode ser antes da manifestação.' USING ERRCODE = '22023';
  END IF;

  -- Código do cliente: só números, como no acordo, e nunca um CPF.
  IF v_codigo_cli IS NOT NULL THEN
    IF v_codigo_cli !~ '^[0-9]{1,20}$' THEN
      RAISE EXCEPTION 'O código do cliente é só números.' USING ERRCODE = '22023';
    END IF;
    IF public.fn_ouvidoria_eh_cpf(v_codigo_cli) THEN
      RAISE EXCEPTION 'Esse número é um CPF. Use o código do cliente no ERP — CPF não pode ser gravado no sistema.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Anuidades: anos de quatro dígitos, sem repetir, em ordem.
  SELECT COALESCE(array_agg(DISTINCT a ORDER BY a), ARRAY[]::INTEGER[]) INTO v_anuidades
    FROM (
      SELECT x::INTEGER AS a
        FROM jsonb_array_elements_text(
               CASE WHEN jsonb_typeof(p_dados -> 'anuidades') = 'array' THEN p_dados -> 'anuidades' ELSE '[]'::jsonb END) x
       WHERE x ~ '^[0-9]{4}$'
    ) t
   WHERE a BETWEEN 1990 AND 2100;

  -- Etiquetas: só de ano que está na lista e de etiqueta deste setor.
  -- Sem a chave no p_dados, fica a que já estava.
  v_etq_fonte := CASE
    WHEN p_dados ? 'anuidades_etiquetas' THEN
      CASE WHEN jsonb_typeof(p_dados -> 'anuidades_etiquetas') = 'object' THEN p_dados -> 'anuidades_etiquetas' ELSE '{}'::jsonb END
    ELSE COALESCE(v_antes.anuidades_etiquetas, '{}'::jsonb) END;
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO v_etq
    FROM jsonb_each_text(v_etq_fonte) e
   WHERE e.key ~ '^[0-9]{4}$'
     AND e.key::INTEGER = ANY (v_anuidades)
     AND EXISTS (SELECT 1 FROM public.ouvidoria_etiquetas t
                  WHERE t.id::TEXT = e.value AND t.setor_id = p_setor_id);

  -- Encaminhado para: alguém da empresa com acesso à Ouvidoria (senão não veria o aviso).
  v_resp_mudou := (p_id IS NULL AND v_resp_id IS NOT NULL) OR v_resp_id IS DISTINCT FROM v_antes.responsavel_id;
  IF v_resp_id IS NOT NULL THEN
    SELECT p.nome INTO v_resp_nome FROM public.perfis p
     WHERE p.id = v_resp_id AND p.empresa_id = v_empresa;
    IF v_resp_nome IS NULL THEN
      RAISE EXCEPTION 'O responsável escolhido não é desta empresa.' USING ERRCODE = '22023';
    END IF;
    IF v_resp_mudou AND NOT public.fn_perfil_tem(v_resp_id, 'ver_ouvidoria_cofen') THEN
      RAISE EXCEPTION '% não tem acesso à Ouvidoria. Peça ao líder para liberar na aba antes de encaminhar.', v_resp_nome
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Ticket: só muda quando a tela manda.
  v_tkt_status := v_antes.ticket_status;
  IF p_dados ? 'precisa_ticket' THEN
    IF COALESCE((p_dados ->> 'precisa_ticket')::BOOLEAN, FALSE) THEN
      v_tkt_status := COALESCE(v_tkt_status, 'pendente');
    ELSIF v_tkt_status = 'pendente' THEN
      v_tkt_status := NULL;
    END IF;
  END IF;
  v_tkt_pedido := CASE WHEN p_dados ? 'ticket_pedido' THEN NULLIF(btrim(p_dados ->> 'ticket_pedido'), '')
                       ELSE v_antes.ticket_pedido END;

  -- Sem status escolhido: a acompanhada nasce aberta; a de histórico, concluída.
  v_status := COALESCE(v_status, CASE WHEN v_acompanhar THEN 'aberto' ELSE 'concluido' END);

  IF p_id IS NULL THEN
    -- Nascer dentro de um grupo.
    IF v_grupo IS NOT NULL THEN
      SELECT * INTO v_grupo_row FROM public.ouvidoria_grupos g WHERE g.id = v_grupo AND g.setor_id = p_setor_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Grupo não encontrado neste setor.' USING ERRCODE = 'P0002';
      END IF;
      IF v_grupo_row.encerrado_em IS NOT NULL THEN
        RAISE EXCEPTION 'O grupo % está encerrado. Reabra para incluir mais gente.', v_grupo_row.codigo USING ERRCODE = '22023';
      END IF;
    END IF;

    v_num := nextval('public.ouvidoria_manifestacoes_numero_seq');
    INSERT INTO public.ouvidoria_manifestacoes (
      empresa_id, setor_id, numero, codigo, data_manifestacao, canal, nome_profissional, codigo_cliente,
      conselho_uf, assunto, descricao, anuidades, anuidades_etiquetas, situacao_financeira, providencia,
      responsavel_id, responsavel_nome, responsavel_encaminhado_em, responsavel_ciente_em,
      data_resposta, status, acompanhar, observacoes, grupo_id, ticket_status, ticket_pedido,
      criado_por, criado_por_nome, atualizado_por, atualizado_por_nome
    ) VALUES (
      v_empresa, p_setor_id, v_num, 'OUV-' || lpad(v_num::TEXT, 5, '0'), v_data, v_canal, v_nome, v_codigo_cli,
      v_uf, v_assunto, v_descricao, v_anuidades, v_etq, v_situacao, v_providenc,
      v_resp_id, v_resp_nome,
      CASE WHEN v_resp_id IS NOT NULL THEN now() END,
      CASE WHEN v_resp_id = v_uid THEN now() END,
      v_resposta, v_status, v_acompanhar, v_obs, v_grupo, v_tkt_status, v_tkt_pedido,
      v_uid, v_eu_nome, v_uid, v_eu_nome
    ) RETURNING * INTO v_depois;

    INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, status_para, autor_id, autor_nome)
    VALUES (v_depois.id, v_empresa, 'criada',
            CASE WHEN v_acompanhar THEN 'Registrada com acompanhamento' ELSE 'Registrada para histórico' END,
            v_status, v_uid, v_eu_nome);
    IF v_grupo IS NOT NULL THEN
      PERFORM public.fn_ouvidoria_andar(v_depois.id, v_empresa, 'grupo',
        'No grupo ' || v_grupo_row.codigo || ' · ' || v_grupo_row.titulo);
    END IF;
    IF v_resposta IS NOT NULL THEN
      PERFORM public.fn_ouvidoria_andar(v_depois.id, v_empresa, 'retorno',
        'Retorno ao profissional em ' || to_char(v_resposta, 'DD/MM/YYYY'));
    END IF;
    IF v_resp_id IS NOT NULL THEN
      PERFORM public.fn_ouvidoria_andar(v_depois.id, v_empresa, 'responsavel', 'Encaminhada para ' || v_resp_nome);
    END IF;
    IF v_tkt_status = 'pendente' THEN
      PERFORM public.fn_ouvidoria_andar(v_depois.id, v_empresa, 'ticket', 'Marcada para abrir ticket');
    END IF;
  ELSE
    UPDATE public.ouvidoria_manifestacoes m SET
      data_manifestacao   = v_data,
      canal               = v_canal,
      nome_profissional   = v_nome,
      codigo_cliente      = v_codigo_cli,
      conselho_uf         = v_uf,
      assunto             = v_assunto,
      descricao           = v_descricao,
      anuidades           = v_anuidades,
      anuidades_etiquetas = v_etq,
      situacao_financeira = v_situacao,
      providencia         = v_providenc,
      responsavel_id      = v_resp_id,
      responsavel_nome    = v_resp_nome,
      responsavel_encaminhado_em    = CASE WHEN NOT v_resp_mudou THEN m.responsavel_encaminhado_em
                                           WHEN v_resp_id IS NOT NULL THEN now() END,
      responsavel_ciente_em         = CASE WHEN NOT v_resp_mudou THEN m.responsavel_ciente_em
                                           WHEN v_resp_id = v_uid THEN now() END,
      responsavel_respondeu_em      = CASE WHEN v_resp_mudou THEN NULL ELSE m.responsavel_respondeu_em END,
      responsavel_resposta_vista_em = CASE WHEN v_resp_mudou THEN NULL ELSE m.responsavel_resposta_vista_em END,
      data_resposta       = v_resposta,
      status              = v_status,
      acompanhar          = v_acompanhar,
      observacoes         = v_obs,
      ticket_status       = v_tkt_status,
      ticket_pedido       = v_tkt_pedido,
      -- Concluída ou só histórico: o retorno agendado perde o sentido.
      retorno_agendado_em       = CASE WHEN v_status = 'concluido' OR NOT v_acompanhar THEN NULL ELSE m.retorno_agendado_em END,
      retorno_agendado_nota     = CASE WHEN v_status = 'concluido' OR NOT v_acompanhar THEN NULL ELSE m.retorno_agendado_nota END,
      retorno_agendado_por      = CASE WHEN v_status = 'concluido' OR NOT v_acompanhar THEN NULL ELSE m.retorno_agendado_por END,
      retorno_agendado_por_nome = CASE WHEN v_status = 'concluido' OR NOT v_acompanhar THEN NULL ELSE m.retorno_agendado_por_nome END,
      atualizado_por      = v_uid,
      atualizado_por_nome = v_eu_nome,
      atualizado_em       = now()
     WHERE m.id = p_id
     RETURNING * INTO v_depois;

    -- A linha do tempo: uma entrada para cada coisa que importa acompanhar.
    IF v_depois.status IS DISTINCT FROM v_antes.status THEN
      INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, status_de, status_para, autor_id, autor_nome)
      VALUES (p_id, v_empresa, 'status', v_antes.status, v_depois.status, v_uid, v_eu_nome);
    END IF;
    IF v_depois.data_resposta IS DISTINCT FROM v_antes.data_resposta THEN
      PERFORM public.fn_ouvidoria_andar(p_id, v_empresa, 'retorno',
        CASE WHEN v_depois.data_resposta IS NULL THEN 'Retorno ao profissional desmarcado'
             ELSE 'Retorno ao profissional em ' || to_char(v_depois.data_resposta, 'DD/MM/YYYY') END);
    END IF;
    IF v_resp_mudou THEN
      PERFORM public.fn_ouvidoria_andar(p_id, v_empresa, 'responsavel',
        COALESCE('Encaminhada para ' || v_depois.responsavel_nome, 'Encaminhamento removido'));
    END IF;
    IF v_depois.acompanhar IS DISTINCT FROM v_antes.acompanhar THEN
      PERFORM public.fn_ouvidoria_andar(p_id, v_empresa, 'acompanhamento',
        CASE WHEN v_depois.acompanhar THEN 'Passou a ter acompanhamento' ELSE 'Passou a ser só histórico' END);
    END IF;
    IF v_antes.retorno_agendado_em IS NOT NULL AND v_depois.retorno_agendado_em IS NULL THEN
      PERFORM public.fn_ouvidoria_andar(p_id, v_empresa, 'agendamento', 'Retorno agendado cancelado (manifestação fechada)');
    END IF;
    IF v_depois.ticket_status IS DISTINCT FROM v_antes.ticket_status THEN
      PERFORM public.fn_ouvidoria_andar(p_id, v_empresa, 'ticket',
        CASE WHEN v_depois.ticket_status = 'pendente' THEN 'Marcada para abrir ticket' ELSE 'Ticket não é mais necessário' END);
    END IF;

    IF v_depois.data_manifestacao   IS DISTINCT FROM v_antes.data_manifestacao   THEN v_mudou := array_append(v_mudou, 'data'); END IF;
    IF v_depois.canal               IS DISTINCT FROM v_antes.canal               THEN v_mudou := array_append(v_mudou, 'canal'); END IF;
    IF v_depois.nome_profissional   IS DISTINCT FROM v_antes.nome_profissional   THEN v_mudou := array_append(v_mudou, 'nome'); END IF;
    IF v_depois.codigo_cliente      IS DISTINCT FROM v_antes.codigo_cliente      THEN v_mudou := array_append(v_mudou, 'código do cliente'); END IF;
    IF v_depois.conselho_uf         IS DISTINCT FROM v_antes.conselho_uf         THEN v_mudou := array_append(v_mudou, 'conselho'); END IF;
    IF v_depois.assunto             IS DISTINCT FROM v_antes.assunto             THEN v_mudou := array_append(v_mudou, 'assunto'); END IF;
    IF v_depois.descricao           IS DISTINCT FROM v_antes.descricao           THEN v_mudou := array_append(v_mudou, 'descrição'); END IF;
    IF v_depois.anuidades           IS DISTINCT FROM v_antes.anuidades           THEN v_mudou := array_append(v_mudou, 'anuidade'); END IF;
    IF v_depois.anuidades_etiquetas IS DISTINCT FROM v_antes.anuidades_etiquetas THEN v_mudou := array_append(v_mudou, 'cores das anuidades'); END IF;
    IF v_depois.situacao_financeira IS DISTINCT FROM v_antes.situacao_financeira THEN v_mudou := array_append(v_mudou, 'situação financeira'); END IF;
    IF v_depois.providencia         IS DISTINCT FROM v_antes.providencia         THEN v_mudou := array_append(v_mudou, 'providência'); END IF;
    IF v_depois.observacoes         IS DISTINCT FROM v_antes.observacoes         THEN v_mudou := array_append(v_mudou, 'observações'); END IF;
    IF v_depois.ticket_pedido       IS DISTINCT FROM v_antes.ticket_pedido       THEN v_mudou := array_append(v_mudou, 'pedido do ticket'); END IF;
    IF cardinality(v_mudou) > 0 THEN
      PERFORM public.fn_ouvidoria_andar(p_id, v_empresa, 'edicao', 'Alterou ' || array_to_string(v_mudou, ', '));
    END IF;
  END IF;

  -- Aviso para quem recebeu o encaminhamento (fora da aba também).
  IF v_resp_mudou AND v_resp_id IS NOT NULL AND v_resp_id IS DISTINCT FROM v_uid THEN
    INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, rota, autor_id, autor_nome)
    VALUES (v_resp_id, 'Ouvidoria: manifestação para você',
            format('%s encaminhou para você a %s (%s). Abra a Ouvidoria e dê ciência.',
                   COALESCE(v_eu_nome, 'Alguém'), v_depois.codigo, v_depois.nome_profissional),
            v_empresa, '/ouvidoria?m=' || v_depois.id::TEXT, v_uid, v_eu_nome);
  END IF;

  RETURN v_depois;
END;
$function$;

-- ── 6. Retorno agendado ─────────────────────────────────────────────────────

-- Marca (p_quando) ou cancela (p_quando NULL) o retorno agendado.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_agendar_retorno(p_id UUID, p_quando TIMESTAMPTZ, p_nota TEXT)
RETURNS public.ouvidoria_manifestacoes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid  UUID := (SELECT auth.uid());
  v_nome TEXT;
  v_m    public.ouvidoria_manifestacoes;
  v_nota TEXT := NULLIF(btrim(p_nota), '');
BEGIN
  SELECT * INTO v_m FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.fn_ouvidoria_cofen_alcanca(v_m.setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta manifestação.' USING ERRCODE = '42501';
  END IF;
  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = v_uid;

  IF p_quando IS NULL THEN
    IF v_m.retorno_agendado_em IS NULL THEN RETURN v_m; END IF;
    UPDATE public.ouvidoria_manifestacoes SET
      retorno_agendado_em = NULL, retorno_agendado_nota = NULL,
      retorno_agendado_por = NULL, retorno_agendado_por_nome = NULL, atualizado_em = now()
     WHERE id = p_id RETURNING * INTO v_m;
    PERFORM public.fn_ouvidoria_andar(p_id, v_m.empresa_id, 'agendamento', 'Retorno agendado cancelado');
    RETURN v_m;
  END IF;

  IF v_m.status = 'concluido' OR NOT v_m.acompanhar THEN
    RAISE EXCEPTION 'Só manifestação aberta, em acompanhamento, tem retorno agendado.' USING ERRCODE = '22023';
  END IF;
  IF p_quando <= now() THEN
    RAISE EXCEPTION 'Escolha um horário que ainda não passou.' USING ERRCODE = '22023';
  END IF;
  IF p_quando > now() + INTERVAL '180 days' THEN
    RAISE EXCEPTION 'O retorno agendado pode ser no máximo daqui a 180 dias.' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(v_nota, '')) > 300 THEN
    RAISE EXCEPTION 'A nota do agendamento tem no máximo 300 letras.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ouvidoria_manifestacoes SET
    retorno_agendado_em = p_quando, retorno_agendado_nota = v_nota,
    retorno_agendado_por = v_uid, retorno_agendado_por_nome = v_nome, atualizado_em = now()
   WHERE id = p_id RETURNING * INTO v_m;
  PERFORM public.fn_ouvidoria_andar(p_id, v_m.empresa_id, 'agendamento',
    'Retorno agendado para ' || to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
    || COALESCE(' — ' || v_nota, ''));
  RETURN v_m;
END;
$function$;

-- O retorno foi dado ao profissional hoje: grava a data e tira o agendamento.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_retorno_dado(p_id UUID, p_texto TEXT)
RETURNS public.ouvidoria_manifestacoes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_m     public.ouvidoria_manifestacoes;
  v_hoje  DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_texto TEXT := NULLIF(btrim(p_texto), '');
BEGIN
  SELECT * INTO v_m FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.fn_ouvidoria_cofen_alcanca(v_m.setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta manifestação.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ouvidoria_manifestacoes SET
    data_resposta = GREATEST(v_hoje, data_manifestacao),
    retorno_agendado_em = NULL, retorno_agendado_nota = NULL,
    retorno_agendado_por = NULL, retorno_agendado_por_nome = NULL,
    atualizado_por = (SELECT auth.uid()),
    atualizado_por_nome = (SELECT p.nome FROM public.perfis p WHERE p.id = (SELECT auth.uid())),
    atualizado_em = now()
   WHERE id = p_id RETURNING * INTO v_m;
  PERFORM public.fn_ouvidoria_andar(p_id, v_m.empresa_id, 'retorno',
    'Retorno dado ao profissional em ' || to_char(v_m.data_resposta, 'DD/MM/YYYY') || COALESCE(' — ' || v_texto, ''));
  RETURN v_m;
END;
$function$;

-- ── 7. Encaminhamento: ciência, resposta e «vi a resposta» ──────────────────

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_encaminhamento(p_id UUID, p_acao TEXT, p_texto TEXT)
RETURNS public.ouvidoria_manifestacoes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid   UUID := (SELECT auth.uid());
  v_nome  TEXT;
  v_m     public.ouvidoria_manifestacoes;
  v_texto TEXT := NULLIF(btrim(p_texto), '');
BEGIN
  SELECT * INTO v_m FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.fn_ouvidoria_cofen_alcanca(v_m.setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta manifestação.' USING ERRCODE = '42501';
  END IF;
  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = v_uid;

  IF p_acao IN ('ciente', 'responder') THEN
    IF v_m.responsavel_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Só quem recebeu o encaminhamento (%) faz isso.', COALESCE(v_m.responsavel_nome, 'ninguém')
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_acao = 'ciente' THEN
    IF v_m.responsavel_ciente_em IS NOT NULL THEN RETURN v_m; END IF;
    UPDATE public.ouvidoria_manifestacoes SET responsavel_ciente_em = now(), atualizado_em = now()
     WHERE id = p_id RETURNING * INTO v_m;
    PERFORM public.fn_ouvidoria_andar(p_id, v_m.empresa_id, 'ciencia', COALESCE(v_nome, 'O responsável') || ' está ciente');

  ELSIF p_acao = 'responder' THEN
    IF v_texto IS NULL THEN
      RAISE EXCEPTION 'Escreva a resposta.' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_texto) > 2000 THEN
      RAISE EXCEPTION 'A resposta tem no máximo 2000 letras.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.ouvidoria_manifestacoes SET
      responsavel_ciente_em = COALESCE(responsavel_ciente_em, now()),
      responsavel_respondeu_em = now(),
      responsavel_resposta_vista_em = NULL,
      atualizado_em = now()
     WHERE id = p_id RETURNING * INTO v_m;
    PERFORM public.fn_ouvidoria_andar(p_id, v_m.empresa_id, 'resposta', v_texto);
    IF v_m.criado_por IS NOT NULL AND v_m.criado_por IS DISTINCT FROM v_uid THEN
      INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, rota, autor_id, autor_nome)
      VALUES (v_m.criado_por, 'Ouvidoria: resposta do encaminhamento',
              format('%s respondeu sobre a %s (%s).', COALESCE(v_nome, 'O responsável'), v_m.codigo, v_m.nome_profissional),
              v_m.empresa_id, '/ouvidoria?m=' || v_m.id::TEXT, v_uid, v_nome);
    END IF;

  ELSIF p_acao = 'visto' THEN
    IF v_m.criado_por IS DISTINCT FROM v_uid AND NOT public.fn_ouvidoria_cofen_alcanca(v_m.setor_id, TRUE) THEN
      RAISE EXCEPTION 'Só quem registrou a manifestação marca a resposta como vista.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.ouvidoria_manifestacoes SET responsavel_resposta_vista_em = now()
     WHERE id = p_id RETURNING * INTO v_m;

  ELSE
    RAISE EXCEPTION 'Ação desconhecida: %.', p_acao USING ERRCODE = '22023';
  END IF;

  RETURN v_m;
END;
$function$;

-- ── 8. Ticket no sistema Mundial ────────────────────────────────────────────

--   pedir     marca «precisa abrir ticket» (pendente), com o que pedir
--   abrir     o ticket foi aberto (número opcional)
--   cancelar  não precisa mais
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_ticket(p_id UUID, p_acao TEXT, p_numero TEXT, p_pedido TEXT)
RETURNS public.ouvidoria_manifestacoes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid    UUID := (SELECT auth.uid());
  v_nome   TEXT;
  v_m      public.ouvidoria_manifestacoes;
  v_numero TEXT := NULLIF(btrim(p_numero), '');
  v_pedido TEXT := NULLIF(btrim(p_pedido), '');
BEGIN
  SELECT * INTO v_m FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.fn_ouvidoria_cofen_alcanca(v_m.setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta manifestação.' USING ERRCODE = '42501';
  END IF;
  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = v_uid;
  IF char_length(COALESCE(v_numero, '')) > 60 THEN
    RAISE EXCEPTION 'O número do ticket tem no máximo 60 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_acao = 'pedir' THEN
    UPDATE public.ouvidoria_manifestacoes SET
      ticket_status = 'pendente', ticket_pedido = COALESCE(v_pedido, ticket_pedido),
      ticket_numero = NULL, ticket_aberto_em = NULL, ticket_aberto_por_nome = NULL, atualizado_em = now()
     WHERE id = p_id RETURNING * INTO v_m;
    PERFORM public.fn_ouvidoria_andar(p_id, v_m.empresa_id, 'ticket', 'Marcada para abrir ticket');
  ELSIF p_acao = 'abrir' THEN
    IF v_m.ticket_status IS DISTINCT FROM 'pendente' THEN
      RAISE EXCEPTION 'Esta manifestação não está com ticket pendente.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.ouvidoria_manifestacoes SET
      ticket_status = 'aberto', ticket_numero = v_numero,
      ticket_aberto_em = now(), ticket_aberto_por_nome = v_nome, atualizado_em = now()
     WHERE id = p_id RETURNING * INTO v_m;
    PERFORM public.fn_ouvidoria_andar(p_id, v_m.empresa_id, 'ticket',
      'Ticket aberto' || COALESCE(' nº ' || v_numero, ''));
  ELSIF p_acao = 'cancelar' THEN
    IF v_m.ticket_status IS NULL THEN RETURN v_m; END IF;
    UPDATE public.ouvidoria_manifestacoes SET
      ticket_status = NULL, ticket_numero = NULL, ticket_aberto_em = NULL, ticket_aberto_por_nome = NULL,
      atualizado_em = now()
     WHERE id = p_id RETURNING * INTO v_m;
    PERFORM public.fn_ouvidoria_andar(p_id, v_m.empresa_id, 'ticket', 'Ticket não é mais necessário');
  ELSE
    RAISE EXCEPTION 'Ação desconhecida: %.', p_acao USING ERRCODE = '22023';
  END IF;
  RETURN v_m;
END;
$function$;

-- ── 9. Etiquetas (legenda de cores das anuidades) ───────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_etiquetas(p_setor_id UUID)
RETURNS SETOF public.ouvidoria_etiquetas
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso à Ouvidoria deste setor.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT e.* FROM public.ouvidoria_etiquetas e WHERE e.setor_id = p_setor_id ORDER BY e.criado_em, e.nome;
END;
$function$;

-- Cria (p_id NULL) ou muda uma etiqueta. Quem atende cria; mudar é de quem
-- criou ou de quem gerencia.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_etiqueta_salvar(p_setor_id UUID, p_id UUID, p_nome TEXT, p_cor TEXT)
RETURNS public.ouvidoria_etiquetas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid  UUID := (SELECT auth.uid());
  v_nome TEXT := NULLIF(btrim(p_nome), '');
  v_e    public.ouvidoria_etiquetas;
BEGIN
  IF NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso à Ouvidoria deste setor.' USING ERRCODE = '42501';
  END IF;
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Dê um nome para a cor.' USING ERRCODE = '22023'; END IF;
  IF char_length(v_nome) > 40 THEN RAISE EXCEPTION 'O nome tem no máximo 40 letras.' USING ERRCODE = '22023'; END IF;
  IF p_cor IS NULL OR p_cor NOT IN ('verde', 'vermelho', 'amarelo', 'azul', 'roxo', 'laranja', 'rosa', 'cinza') THEN
    RAISE EXCEPTION 'Escolha uma cor.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    IF p_id IS NULL THEN
      INSERT INTO public.ouvidoria_etiquetas (empresa_id, setor_id, nome, cor, criado_por)
      SELECT s.empresa_id, s.id, v_nome, p_cor, v_uid FROM public.setores s WHERE s.id = p_setor_id
      RETURNING * INTO v_e;
    ELSE
      SELECT * INTO v_e FROM public.ouvidoria_etiquetas e WHERE e.id = p_id AND e.setor_id = p_setor_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Etiqueta não encontrada.' USING ERRCODE = 'P0002'; END IF;
      IF v_e.criado_por IS DISTINCT FROM v_uid AND NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, TRUE) THEN
        RAISE EXCEPTION 'Só quem criou a etiqueta ou quem gerencia a Ouvidoria muda ela.' USING ERRCODE = '42501';
      END IF;
      UPDATE public.ouvidoria_etiquetas SET nome = v_nome, cor = p_cor WHERE id = p_id RETURNING * INTO v_e;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe uma etiqueta «%» neste setor.', v_nome USING ERRCODE = '23505';
  END;
  RETURN v_e;
END;
$function$;

-- Só quem gerencia apaga. A cor sai das anuidades que a usavam.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_etiqueta_excluir(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_e public.ouvidoria_etiquetas;
BEGIN
  SELECT * INTO v_e FROM public.ouvidoria_etiquetas e WHERE e.id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etiqueta não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.fn_ouvidoria_cofen_alcanca(v_e.setor_id, TRUE) THEN
    RAISE EXCEPTION 'Só quem gerencia a Ouvidoria do setor apaga uma etiqueta.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ouvidoria_manifestacoes m SET
    anuidades_etiquetas = (SELECT COALESCE(jsonb_object_agg(x.key, x.value), '{}'::jsonb)
                             FROM jsonb_each_text(m.anuidades_etiquetas) x WHERE x.value <> p_id::TEXT)
   WHERE m.setor_id = v_e.setor_id
     AND EXISTS (SELECT 1 FROM jsonb_each_text(m.anuidades_etiquetas) x WHERE x.value = p_id::TEXT);
  DELETE FROM public.ouvidoria_etiquetas WHERE id = p_id;
END;
$function$;

-- ── 10. Grupos ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_grupos(p_setor_id UUID)
RETURNS SETOF public.ouvidoria_grupos
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso à Ouvidoria deste setor.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT g.* FROM public.ouvidoria_grupos g WHERE g.setor_id = p_setor_id
                ORDER BY (g.encerrado_em IS NOT NULL), g.criado_em DESC;
END;
$function$;

-- Cria (p_id NULL) ou atualiza um grupo. `encerrado` fecha e reabre.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_grupo_salvar(p_setor_id UUID, p_id UUID, p_dados JSONB)
RETURNS public.ouvidoria_grupos
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid       UUID := (SELECT auth.uid());
  v_eu_nome   TEXT;
  v_empresa   UUID;
  v_g         public.ouvidoria_grupos;
  v_num       BIGINT;
  v_titulo    TEXT := NULLIF(btrim(p_dados ->> 'titulo'), '');
  v_assunto   TEXT := NULLIF(btrim(p_dados ->> 'assunto'), '');
  v_canal     TEXT := NULLIF(btrim(p_dados ->> 'canal'), '');
  v_descricao TEXT := NULLIF(btrim(p_dados ->> 'descricao'), '');
  v_providenc TEXT := NULLIF(btrim(p_dados ->> 'providencia'), '');
  v_resp_id   UUID := NULLIF(p_dados ->> 'responsavel_id', '')::UUID;
  v_resp_nome TEXT;
  v_encerrado BOOLEAN := COALESCE((p_dados ->> 'encerrado')::BOOLEAN, FALSE);
BEGIN
  IF NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso à Ouvidoria deste setor.' USING ERRCODE = '42501';
  END IF;
  SELECT s.empresa_id INTO v_empresa FROM public.setores s WHERE s.id = p_setor_id;
  SELECT p.nome INTO v_eu_nome FROM public.perfis p WHERE p.id = v_uid;

  IF v_titulo IS NULL THEN RAISE EXCEPTION 'Dê um nome ao grupo.' USING ERRCODE = '22023'; END IF;
  IF v_assunto IS NULL THEN RAISE EXCEPTION 'Escolha o assunto do grupo.' USING ERRCODE = '22023'; END IF;
  IF v_descricao IS NULL THEN RAISE EXCEPTION 'Descreva a reclamação em comum.' USING ERRCODE = '22023'; END IF;
  IF v_resp_id IS NOT NULL THEN
    SELECT p.nome INTO v_resp_nome FROM public.perfis p WHERE p.id = v_resp_id AND p.empresa_id = v_empresa;
    IF v_resp_nome IS NULL THEN
      RAISE EXCEPTION 'O responsável escolhido não é desta empresa.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    v_num := nextval('public.ouvidoria_grupos_numero_seq');
    INSERT INTO public.ouvidoria_grupos (
      empresa_id, setor_id, numero, codigo, titulo, assunto, canal, descricao, providencia,
      responsavel_id, responsavel_nome, criado_por, criado_por_nome, atualizado_por, atualizado_por_nome
    ) VALUES (
      v_empresa, p_setor_id, v_num, 'GRP-' || lpad(v_num::TEXT, 4, '0'), v_titulo, v_assunto, v_canal, v_descricao,
      v_providenc, v_resp_id, v_resp_nome, v_uid, v_eu_nome, v_uid, v_eu_nome
    ) RETURNING * INTO v_g;
    RETURN v_g;
  END IF;

  UPDATE public.ouvidoria_grupos g SET
    titulo = v_titulo, assunto = v_assunto, canal = v_canal, descricao = v_descricao, providencia = v_providenc,
    responsavel_id = v_resp_id, responsavel_nome = v_resp_nome,
    encerrado_em = CASE WHEN NOT v_encerrado THEN NULL ELSE COALESCE(g.encerrado_em, now()) END,
    atualizado_por = v_uid, atualizado_por_nome = v_eu_nome, atualizado_em = now()
   WHERE g.id = p_id AND g.setor_id = p_setor_id
   RETURNING * INTO v_g;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grupo não encontrado neste setor.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_g;
END;
$function$;

-- Põe (p_grupo_id) ou tira (NULL) uma manifestação de um grupo do mesmo setor.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_grupo_mover(p_id UUID, p_grupo_id UUID)
RETURNS public.ouvidoria_manifestacoes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_m     public.ouvidoria_manifestacoes;
  v_g     public.ouvidoria_grupos;
  v_velho public.ouvidoria_grupos;
BEGIN
  SELECT * INTO v_m FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.fn_ouvidoria_cofen_alcanca(v_m.setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta manifestação.' USING ERRCODE = '42501';
  END IF;
  IF v_m.grupo_id IS NOT DISTINCT FROM p_grupo_id THEN RETURN v_m; END IF;

  IF p_grupo_id IS NOT NULL THEN
    SELECT * INTO v_g FROM public.ouvidoria_grupos g WHERE g.id = p_grupo_id AND g.setor_id = v_m.setor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Grupo não encontrado neste setor.' USING ERRCODE = 'P0002'; END IF;
    IF v_g.encerrado_em IS NOT NULL THEN
      RAISE EXCEPTION 'O grupo % está encerrado. Reabra para incluir mais gente.', v_g.codigo USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_m.grupo_id IS NOT NULL THEN
    SELECT * INTO v_velho FROM public.ouvidoria_grupos g WHERE g.id = v_m.grupo_id;
  END IF;

  UPDATE public.ouvidoria_manifestacoes SET grupo_id = p_grupo_id, atualizado_em = now()
   WHERE id = p_id RETURNING * INTO v_m;
  PERFORM public.fn_ouvidoria_andar(p_id, v_m.empresa_id, 'grupo',
    CASE WHEN p_grupo_id IS NULL THEN 'Saiu do grupo ' || COALESCE(v_velho.codigo, '')
         ELSE 'Movida para o grupo ' || v_g.codigo || ' · ' || v_g.titulo END);
  RETURN v_m;
END;
$function$;

-- Só quem gerencia apaga um grupo. As manifestações ficam, fora de grupo.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_grupo_excluir(p_grupo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_g public.ouvidoria_grupos;
  r   RECORD;
BEGIN
  SELECT * INTO v_g FROM public.ouvidoria_grupos g WHERE g.id = p_grupo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Grupo não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.fn_ouvidoria_cofen_alcanca(v_g.setor_id, TRUE) THEN
    RAISE EXCEPTION 'Só quem gerencia a Ouvidoria do setor apaga um grupo.' USING ERRCODE = '42501';
  END IF;
  FOR r IN SELECT m.id, m.empresa_id FROM public.ouvidoria_manifestacoes m WHERE m.grupo_id = p_grupo_id LOOP
    PERFORM public.fn_ouvidoria_andar(r.id, r.empresa_id, 'grupo', 'O grupo ' || v_g.codigo || ' foi apagado');
  END LOOP;
  UPDATE public.ouvidoria_manifestacoes SET grupo_id = NULL, atualizado_em = now() WHERE grupo_id = p_grupo_id;
  DELETE FROM public.ouvidoria_grupos WHERE id = p_grupo_id;
END;
$function$;

-- ── 11. Permissões de execução ──────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_salvar(UUID, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_agendar_retorno(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_retorno_dado(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_encaminhamento(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_ticket(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_etiquetas(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_etiqueta_salvar(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_etiqueta_excluir(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_grupos(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_grupo_salvar(UUID, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_grupo_mover(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_grupo_excluir(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_salvar(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_agendar_retorno(UUID, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_retorno_dado(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_encaminhamento(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_ticket(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_etiquetas(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_etiqueta_salvar(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_etiqueta_excluir(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_grupos(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_grupo_salvar(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_grupo_mover(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_grupo_excluir(UUID) TO authenticated;

-- ── 12. Prova ───────────────────────────────────────────────────────────────

DO $prova$
DECLARE v_faltam TEXT[];
BEGIN
  SELECT array_agg(c) INTO v_faltam
    FROM unnest(ARRAY['grupo_id', 'anuidades_etiquetas', 'retorno_agendado_em', 'responsavel_ciente_em',
                      'responsavel_respondeu_em', 'responsavel_resposta_vista_em', 'ticket_status', 'ticket_numero']) c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'ouvidoria_manifestacoes' AND column_name = c);
  IF v_faltam IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam colunas em ouvidoria_manifestacoes: %', v_faltam;
  END IF;
  IF to_regprocedure('public.fn_ouvidoria_cofen_agendar_retorno(uuid, timestamptz, text)') IS NULL
     OR to_regprocedure('public.fn_ouvidoria_cofen_encaminhamento(uuid, text, text)') IS NULL
     OR to_regprocedure('public.fn_ouvidoria_cofen_ticket(uuid, text, text, text)') IS NULL
     OR to_regprocedure('public.fn_ouvidoria_cofen_grupo_mover(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Alguma função nova da Ouvidoria não foi criada.';
  END IF;
END
$prova$;

COMMIT;
