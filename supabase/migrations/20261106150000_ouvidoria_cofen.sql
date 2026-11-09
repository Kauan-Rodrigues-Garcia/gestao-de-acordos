-- ============================================================================
-- Ouvidoria da regra Cofen (06/11/2026)
-- ============================================================================
--
-- ## O pedido (Cleber, 06/11/2026)
--
-- O 0800 da empresa ganhou um canal de ouvidoria: o profissional liga para
-- reclamar. Cada reclamação precisa ficar guardada como histórico, e algumas
-- têm ACOMPANHAMENTO (está pendente? já foi resolvida? o profissional já teve
-- retorno?). A aba é só do setor de regra Cofen (`setores.regra = 'cofen'`, hoje
-- o Conecta Play) e, dentro dele, nasce só para o líder. O líder escolhe, na
-- própria aba, quem do setor atende.
--
-- A aba Ouvidoria antiga (arquivada em 05/09/2026, `arquivo-morto/ouvidoria/`)
-- tinha outros campos e decidia pela empresa. Nada dela é reaproveitado: as
-- tabelas `ouvidoria_atendimentos` e `ouvidoria_acessos` e as chaves antigas
-- (`ver_ouvidoria`…) continuam como estão, sem uso.
--
-- ## O que muda
--
--   1. `ouvidoria_manifestacoes`: uma linha por reclamação, com os campos da
--      planilha do Cleber (código, data, canal, profissional, CPF, Coren,
--      assunto, descrição, anuidade, situação financeira, providência,
--      responsável, data da resposta, status, observações) e `acompanhar`.
--   2. `ouvidoria_andamentos`: a linha do tempo de cada manifestação (criada,
--      status, retorno, responsável, notas).
--   3. Duas chaves no catálogo, que aparecem em Configurações › Permissões de
--      toda empresa e de todo cargo:
--        ver_ouvidoria_cofen        abrir a aba (nasce só no líder)
--        ouvidoria_cofen_gerenciar  escolher quem atende e excluir (só no líder)
--   4. Funções: as tabelas não têm acesso direto, tudo passa por elas.
--
-- ## Quem enxerga
--
-- A aba vale só em setor Cofen. Quem tem acesso total (administrador, super
-- admin) vê todos os setores Cofen das empresas que alcança. Os demais precisam
-- da chave `ver_ouvidoria_cofen` E de estar no setor (`fn_setores_do_operador`).
--
-- O líder libera um atendente gravando a EXCEÇÃO POR PESSOA de sempre
-- (`perfis_permissoes`, a mesma de Configurações › Permissões › Por pessoa):
-- liberar = `ver_ouvidoria_cofen: true`; tirar = apagar a exceção (a pessoa
-- volta a herdar do cargo). Assim a aba, o menu, a rota e o painel de
-- permissões respondem a mesma coisa. Uma exceção «não» gravada pelo
-- administrador é respeitada: o líder não a derruba.
--
-- ## CPF
--
-- A diretoria fixou em 28/07/2026 que nenhum CPF de cliente fica inteiro no
-- banco. O campo CPF é opcional e é gravado MASCARADO (`xxx.xxx.789-00`, como
-- na Campanha Fácil): a função recebe os 11 dígitos e guarda só os 5 últimos.
-- A coluna recusa qualquer outro formato.
--
-- Nenhum dado de outra tabela muda, além de semear as duas chaves novas nos
-- mapas de cargo (só onde ainda não existem). Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Tabelas ──────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.ouvidoria_manifestacoes_numero_seq;

CREATE TABLE IF NOT EXISTS public.ouvidoria_manifestacoes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID        NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  -- Sem cascade: setor não é apagado (`excluido_em`), e o histórico fica.
  setor_id            UUID        NOT NULL REFERENCES public.setores (id),
  numero              BIGINT      NOT NULL DEFAULT nextval('public.ouvidoria_manifestacoes_numero_seq'),
  codigo              TEXT        NOT NULL,
  data_manifestacao   DATE        NOT NULL,
  canal               TEXT        NOT NULL,
  nome_profissional   TEXT        NOT NULL,
  cpf                 TEXT,
  conselho_uf         TEXT,
  assunto             TEXT        NOT NULL,
  descricao           TEXT        NOT NULL,
  anuidades           INTEGER[]   NOT NULL DEFAULT '{}',
  situacao_financeira TEXT,
  providencia         TEXT,
  responsavel_id      UUID        REFERENCES public.perfis (id) ON DELETE SET NULL,
  responsavel_nome    TEXT,
  data_resposta       DATE,
  status              TEXT        NOT NULL DEFAULT 'aberto',
  acompanhar          BOOLEAN     NOT NULL DEFAULT FALSE,
  observacoes         TEXT,
  criado_por          UUID        REFERENCES public.perfis (id) ON DELETE SET NULL,
  criado_por_nome     TEXT,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por      UUID        REFERENCES public.perfis (id) ON DELETE SET NULL,
  atualizado_por_nome TEXT,
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ouvidoria_manifestacoes_codigo_unico UNIQUE (codigo),
  CONSTRAINT ouvidoria_manifestacoes_canal CHECK (
    canal IN ('telefone', 'whatsapp', 'email', 'ouvidoria', 'outro')),
  CONSTRAINT ouvidoria_manifestacoes_assunto CHECK (
    assunto IN ('operador', 'chatplay', 'cobranca_indevida', 'reclamacao_generica', 'outros')),
  CONSTRAINT ouvidoria_manifestacoes_situacao CHECK (
    situacao_financeira IS NULL
    OR situacao_financeira IN ('em_aberto', 'parcelada', 'quitada', 'judicializada', 'outra')),
  CONSTRAINT ouvidoria_manifestacoes_status CHECK (
    status IN ('aberto', 'em_andamento', 'pendente_documentos', 'encaminhado_coren', 'concluido')),
  CONSTRAINT ouvidoria_manifestacoes_uf CHECK (
    conselho_uf IS NULL OR conselho_uf IN (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
      'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  -- Só o CPF mascarado: o inteiro não entra (ordem da diretoria, 28/07/2026).
  CONSTRAINT ouvidoria_manifestacoes_cpf_mascarado CHECK (
    cpf IS NULL OR cpf ~ '^xxx\.xxx\.[0-9]{3}-[0-9]{2}$'),
  CONSTRAINT ouvidoria_manifestacoes_nome CHECK (btrim(nome_profissional) <> ''),
  CONSTRAINT ouvidoria_manifestacoes_descricao CHECK (btrim(descricao) <> '')
);

CREATE INDEX IF NOT EXISTS ouvidoria_manifestacoes_setor_data
  ON public.ouvidoria_manifestacoes (setor_id, data_manifestacao DESC, numero DESC);

COMMENT ON TABLE public.ouvidoria_manifestacoes IS
  'Reclamações do canal de ouvidoria (0800) da regra Cofen. Sem acesso direto: '
  'tudo passa pelas funções fn_ouvidoria_cofen_*. CPF só mascarado. Ver 20261106150000.';
COMMENT ON COLUMN public.ouvidoria_manifestacoes.acompanhar IS
  'TRUE = tem acompanhamento (status, retorno, linha do tempo na fila). FALSE = só histórico.';
COMMENT ON COLUMN public.ouvidoria_manifestacoes.data_resposta IS
  'Data em que o profissional teve retorno. Preenchida = o profissional já foi respondido.';

CREATE TABLE IF NOT EXISTS public.ouvidoria_andamentos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A ordem: várias entradas nascem na mesma transação (mesmo now()).
  ordem           BIGINT      GENERATED ALWAYS AS IDENTITY,
  manifestacao_id UUID       NOT NULL REFERENCES public.ouvidoria_manifestacoes (id) ON DELETE CASCADE,
  empresa_id      UUID        NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  tipo            TEXT        NOT NULL,
  texto           TEXT,
  status_de       TEXT,
  status_para     TEXT,
  autor_id        UUID        REFERENCES public.perfis (id) ON DELETE SET NULL,
  autor_nome      TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ouvidoria_andamentos_tipo CHECK (
    tipo IN ('criada', 'status', 'retorno', 'responsavel', 'acompanhamento', 'edicao', 'nota'))
);

CREATE INDEX IF NOT EXISTS ouvidoria_andamentos_manifestacao
  ON public.ouvidoria_andamentos (manifestacao_id, ordem);

COMMENT ON TABLE public.ouvidoria_andamentos IS
  'Linha do tempo de cada manifestação da ouvidoria Cofen. Ver 20261106150000.';

-- Fechadas: RLS ligada e nenhuma policy. Quem lê e grava são as funções.
ALTER TABLE public.ouvidoria_manifestacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ouvidoria_andamentos    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ouvidoria_manifestacoes FROM anon, authenticated;
REVOKE ALL ON public.ouvidoria_andamentos    FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.ouvidoria_manifestacoes_numero_seq FROM anon, authenticated;

-- Auditoria (Configurações › Logs), como toda tabela de negócio.
DROP TRIGGER IF EXISTS trg_log_ouvidoria_manifestacoes ON public.ouvidoria_manifestacoes;
CREATE TRIGGER trg_log_ouvidoria_manifestacoes
  AFTER INSERT OR DELETE OR UPDATE ON public.ouvidoria_manifestacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
    'ouvidoria', 'ouvidoria_manifestacao', 'a manifestação', 'codigo,nome_profissional',
    'atualizado_por,atualizado_por_nome', 'empresa_id', 'aviso');

-- ── 2. Catálogo: as duas chaves ─────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_ouvidoria_cofen_20261106()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_ouvidoria_cofen_20261106;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_ouvidoria_cofen_20261106() IS
  'Retrato do catalogo antes da Ouvidoria da regra Cofen (06/11/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_ouvidoria_cofen_20261106()
  UNION ALL
  SELECT * FROM (VALUES
    -- Nascem só no líder; a aba só existe em setor Cofen.
    ('ver_ouvidoria_cofen',       NULL::TEXT[], ARRAY['lider']::TEXT[], false),
    ('ouvidoria_cofen_gerenciar', NULL::TEXT[], ARRAY['lider']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261106150000 soma ver_ouvidoria_cofen e ouvidoria_cofen_gerenciar.';

-- Semeia só as chaves ausentes (o que já está configurado não muda).
DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ── 3. Quem alcança ─────────────────────────────────────────────────────────

-- Os setores Cofen que a pessoa logada alcança na ouvidoria, e se ela gerencia.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_setores()
RETURNS TABLE(setor_id UUID, setor_nome TEXT, empresa_id UUID, pode_gerir BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH eu AS (
    SELECT p.id, COALESCE(c.acesso_total, FALSE) AS total
      FROM public.perfis p
      LEFT JOIN public.cargos c ON c.slug = p.perfil
     WHERE p.id = (SELECT auth.uid())
       AND NOT COALESCE(p.arquivado, FALSE)
  ),
  chaves AS (
    SELECT public.fn_user_tem('ver_ouvidoria_cofen')       AS ver,
           public.fn_user_tem('ouvidoria_cofen_gerenciar') AS gerir
  )
  SELECT s.id, s.nome, s.empresa_id, (eu.total OR (ch.ver AND ch.gerir))
    FROM public.setores s
    CROSS JOIN eu
    CROSS JOIN chaves ch
   WHERE s.regra = 'cofen'
     AND s.excluido_em IS NULL
     AND public.fn_can_access_empresa(s.empresa_id)
     AND (eu.total OR (ch.ver AND s.id IN (SELECT public.fn_setores_do_operador(eu.id))))
   ORDER BY s.nome;
$function$;

COMMENT ON FUNCTION public.fn_ouvidoria_cofen_setores() IS
  'Setores Cofen que a pessoa logada alcança na Ouvidoria (chave ver_ouvidoria_cofen + '
  'estar no setor; acesso total vê todos) e se gerencia. 20261106150000.';

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_alcanca(p_setor_id UUID, p_gerir BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.fn_ouvidoria_cofen_setores() x
     WHERE x.setor_id = p_setor_id AND (NOT p_gerir OR x.pode_gerir)
  );
$function$;

-- ── 4. Ler, gravar, excluir ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_listar(p_setor_id UUID)
RETURNS SETOF public.ouvidoria_manifestacoes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso à Ouvidoria deste setor.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.* FROM public.ouvidoria_manifestacoes m
     WHERE m.setor_id = p_setor_id
     ORDER BY m.data_manifestacao DESC, m.numero DESC;
END;
$function$;

-- Cria (p_id NULL) ou atualiza uma manifestação. `p_dados` traz o formulário
-- inteiro; campo ausente vira vazio. Registra na linha do tempo o que mudou.
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
  v_cpf_in     TEXT := NULLIF(btrim(p_dados ->> 'cpf'), '');
  v_cpf        TEXT;
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
  v_mudou      TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso à Ouvidoria deste setor.' USING ERRCODE = '42501';
  END IF;

  SELECT s.empresa_id INTO v_empresa FROM public.setores s WHERE s.id = p_setor_id;
  SELECT p.nome INTO v_eu_nome FROM public.perfis p WHERE p.id = v_uid;

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

  -- CPF: chega com 11 dígitos (ou já mascarado, ao editar) e sai mascarado.
  IF v_cpf_in IS NOT NULL THEN
    IF v_cpf_in ~ '^xxx\.xxx\.[0-9]{3}-[0-9]{2}$' THEN
      v_cpf := v_cpf_in;
    ELSIF length(regexp_replace(v_cpf_in, '\D', '', 'g')) = 11 THEN
      v_cpf := 'xxx.xxx.' || substr(regexp_replace(v_cpf_in, '\D', '', 'g'), 7, 3)
            || '-' || substr(regexp_replace(v_cpf_in, '\D', '', 'g'), 10, 2);
    ELSE
      RAISE EXCEPTION 'CPF inválido: informe os 11 dígitos.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Anuidades: anos de quatro dígitos, sem repetir, em ordem.
  SELECT COALESCE(array_agg(DISTINCT a ORDER BY a), ARRAY[]::INTEGER[]) INTO v_anuidades
    FROM (
      SELECT x::INTEGER AS a
        FROM jsonb_array_elements_text(COALESCE(p_dados -> 'anuidades', '[]'::jsonb)) x
       WHERE x ~ '^[0-9]{4}$'
    ) t
   WHERE a BETWEEN 1990 AND 2100;

  -- Responsável: alguém da mesma empresa (o nome fica gravado junto).
  IF v_resp_id IS NOT NULL THEN
    SELECT p.nome INTO v_resp_nome FROM public.perfis p
     WHERE p.id = v_resp_id AND p.empresa_id = v_empresa;
    IF v_resp_nome IS NULL THEN
      RAISE EXCEPTION 'O responsável escolhido não é desta empresa.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Sem status escolhido: a acompanhada nasce aberta; a de histórico, concluída.
  v_status := COALESCE(v_status, CASE WHEN v_acompanhar THEN 'aberto' ELSE 'concluido' END);

  IF p_id IS NULL THEN
    v_num := nextval('public.ouvidoria_manifestacoes_numero_seq');
    INSERT INTO public.ouvidoria_manifestacoes (
      empresa_id, setor_id, numero, codigo, data_manifestacao, canal, nome_profissional, cpf,
      conselho_uf, assunto, descricao, anuidades, situacao_financeira, providencia,
      responsavel_id, responsavel_nome, data_resposta, status, acompanhar, observacoes,
      criado_por, criado_por_nome, atualizado_por, atualizado_por_nome
    ) VALUES (
      v_empresa, p_setor_id, v_num, 'OUV-' || lpad(v_num::TEXT, 5, '0'), v_data, v_canal, v_nome, v_cpf,
      v_uf, v_assunto, v_descricao, v_anuidades, v_situacao, v_providenc,
      v_resp_id, v_resp_nome, v_resposta, v_status, v_acompanhar, v_obs,
      v_uid, v_eu_nome, v_uid, v_eu_nome
    ) RETURNING * INTO v_depois;

    INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, status_para, autor_id, autor_nome)
    VALUES (v_depois.id, v_empresa, 'criada',
            CASE WHEN v_acompanhar THEN 'Registrada com acompanhamento' ELSE 'Registrada para histórico' END,
            v_status, v_uid, v_eu_nome);
    IF v_resposta IS NOT NULL THEN
      INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, autor_id, autor_nome)
      VALUES (v_depois.id, v_empresa, 'retorno',
              'Retorno ao profissional em ' || to_char(v_resposta, 'DD/MM/YYYY'), v_uid, v_eu_nome);
    END IF;
    RETURN v_depois;
  END IF;

  SELECT * INTO v_antes FROM public.ouvidoria_manifestacoes m
   WHERE m.id = p_id AND m.setor_id = p_setor_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manifestação não encontrada neste setor.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.ouvidoria_manifestacoes m SET
    data_manifestacao   = v_data,
    canal               = v_canal,
    nome_profissional   = v_nome,
    cpf                 = v_cpf,
    conselho_uf         = v_uf,
    assunto             = v_assunto,
    descricao           = v_descricao,
    anuidades           = v_anuidades,
    situacao_financeira = v_situacao,
    providencia         = v_providenc,
    responsavel_id      = v_resp_id,
    responsavel_nome    = v_resp_nome,
    data_resposta       = v_resposta,
    status              = v_status,
    acompanhar          = v_acompanhar,
    observacoes         = v_obs,
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
    INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, autor_id, autor_nome)
    VALUES (p_id, v_empresa, 'retorno',
            CASE WHEN v_depois.data_resposta IS NULL THEN 'Retorno ao profissional desmarcado'
                 ELSE 'Retorno ao profissional em ' || to_char(v_depois.data_resposta, 'DD/MM/YYYY') END,
            v_uid, v_eu_nome);
  END IF;
  IF v_depois.responsavel_id IS DISTINCT FROM v_antes.responsavel_id THEN
    INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, autor_id, autor_nome)
    VALUES (p_id, v_empresa, 'responsavel',
            COALESCE('Responsável: ' || v_depois.responsavel_nome, 'Responsável removido'), v_uid, v_eu_nome);
  END IF;
  IF v_depois.acompanhar IS DISTINCT FROM v_antes.acompanhar THEN
    INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, autor_id, autor_nome)
    VALUES (p_id, v_empresa, 'acompanhamento',
            CASE WHEN v_depois.acompanhar THEN 'Passou a ter acompanhamento' ELSE 'Passou a ser só histórico' END,
            v_uid, v_eu_nome);
  END IF;

  IF v_depois.data_manifestacao   IS DISTINCT FROM v_antes.data_manifestacao   THEN v_mudou := array_append(v_mudou, 'data'); END IF;
  IF v_depois.canal               IS DISTINCT FROM v_antes.canal               THEN v_mudou := array_append(v_mudou, 'canal'); END IF;
  IF v_depois.nome_profissional   IS DISTINCT FROM v_antes.nome_profissional   THEN v_mudou := array_append(v_mudou, 'nome'); END IF;
  IF v_depois.cpf                 IS DISTINCT FROM v_antes.cpf                 THEN v_mudou := array_append(v_mudou, 'CPF'); END IF;
  IF v_depois.conselho_uf         IS DISTINCT FROM v_antes.conselho_uf         THEN v_mudou := array_append(v_mudou, 'conselho'); END IF;
  IF v_depois.assunto             IS DISTINCT FROM v_antes.assunto             THEN v_mudou := array_append(v_mudou, 'assunto'); END IF;
  IF v_depois.descricao           IS DISTINCT FROM v_antes.descricao           THEN v_mudou := array_append(v_mudou, 'descrição'); END IF;
  IF v_depois.anuidades           IS DISTINCT FROM v_antes.anuidades           THEN v_mudou := array_append(v_mudou, 'anuidade'); END IF;
  IF v_depois.situacao_financeira IS DISTINCT FROM v_antes.situacao_financeira THEN v_mudou := array_append(v_mudou, 'situação financeira'); END IF;
  IF v_depois.providencia         IS DISTINCT FROM v_antes.providencia         THEN v_mudou := array_append(v_mudou, 'providência'); END IF;
  IF v_depois.observacoes         IS DISTINCT FROM v_antes.observacoes         THEN v_mudou := array_append(v_mudou, 'observações'); END IF;
  IF cardinality(v_mudou) > 0 THEN
    INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, autor_id, autor_nome)
    VALUES (p_id, v_empresa, 'edicao', 'Alterou ' || array_to_string(v_mudou, ', '), v_uid, v_eu_nome);
  END IF;

  RETURN v_depois;
END;
$function$;

-- Só quem gerencia exclui. A auditoria guarda a linha inteira.
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_excluir(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_setor UUID;
BEGIN
  SELECT m.setor_id INTO v_setor FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id;
  IF v_setor IS NULL THEN
    RAISE EXCEPTION 'Manifestação não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_ouvidoria_cofen_alcanca(v_setor, TRUE) THEN
    RAISE EXCEPTION 'Só quem gerencia a Ouvidoria do setor exclui um registro.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.ouvidoria_manifestacoes WHERE id = p_id;
END;
$function$;

-- ── 5. Linha do tempo ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_andamentos(p_id UUID)
RETURNS SETOF public.ouvidoria_andamentos
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_setor UUID;
BEGIN
  SELECT m.setor_id INTO v_setor FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id;
  IF v_setor IS NULL OR NOT public.fn_ouvidoria_cofen_alcanca(v_setor, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta manifestação.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT a.* FROM public.ouvidoria_andamentos a
     WHERE a.manifestacao_id = p_id
     ORDER BY a.ordem;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_anotar(p_id UUID, p_texto TEXT)
RETURNS public.ouvidoria_andamentos
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_m     public.ouvidoria_manifestacoes;
  v_nome  TEXT;
  v_linha public.ouvidoria_andamentos;
BEGIN
  SELECT * INTO v_m FROM public.ouvidoria_manifestacoes m WHERE m.id = p_id;
  IF NOT FOUND OR NOT public.fn_ouvidoria_cofen_alcanca(v_m.setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta manifestação.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_texto), '') IS NULL THEN
    RAISE EXCEPTION 'Escreva o andamento.' USING ERRCODE = '22023';
  END IF;
  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = (SELECT auth.uid());
  INSERT INTO public.ouvidoria_andamentos (manifestacao_id, empresa_id, tipo, texto, autor_id, autor_nome)
  VALUES (p_id, v_m.empresa_id, 'nota', btrim(p_texto), (SELECT auth.uid()), v_nome)
  RETURNING * INTO v_linha;
  UPDATE public.ouvidoria_manifestacoes SET atualizado_em = now() WHERE id = p_id;
  RETURN v_linha;
END;
$function$;

-- ── 6. Quem atende: o card de acessos da aba ────────────────────────────────

-- As pessoas do setor (perfil no setor ou líder de equipe dele) e de onde vem
-- o acesso de cada uma:
--   total      cargo de acesso total
--   liberado   exceção por pessoa «sim» (o líder liberou aqui ou no painel)
--   bloqueado  exceção por pessoa «não» (só o administrador desfaz)
--   cargo      o mapa do cargo (ou do cargo no setor) concede
--   sem        não tem
-- Quem gerencia vê o setor inteiro; quem só atende vê quem tem acesso (para
-- escolher o responsável).
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_pessoas(p_setor_id UUID)
RETURNS TABLE(perfil_id UUID, nome TEXT, cargo TEXT, foto_url TEXT, tem_acesso BOOLEAN, origem TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_gerir BOOLEAN;
BEGIN
  IF NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, FALSE) THEN
    RAISE EXCEPTION 'Você não tem acesso à Ouvidoria deste setor.' USING ERRCODE = '42501';
  END IF;
  v_gerir := public.fn_ouvidoria_cofen_alcanca(p_setor_id, TRUE);

  RETURN QUERY
    WITH gente AS (
      SELECT p.id FROM public.perfis p WHERE p.setor_id = p_setor_id
      UNION
      SELECT m.pessoa_id FROM public.equipe_membros m
        JOIN public.equipes e ON e.id = m.equipe_id
       WHERE e.setor_id = p_setor_id AND m.papel = 'lider'
    ),
    x AS (
      SELECT p.id, p.nome, p.perfil, p.foto_url,
             public.fn_perfil_tem(p.id, 'ver_ouvidoria_cofen') AS tem,
             COALESCE(c.acesso_total, FALSE) AS total,
             pp.permissoes -> 'ver_ouvidoria_cofen' AS excecao
        FROM gente g
        JOIN public.perfis p ON p.id = g.id
        LEFT JOIN public.cargos c ON c.slug = p.perfil
        LEFT JOIN public.perfis_permissoes pp ON pp.usuario_id = p.id AND pp.empresa_id = p.empresa_id
       WHERE NOT COALESCE(p.arquivado, FALSE)
         AND p.situacao IS DISTINCT FROM 'desligado'
    )
    SELECT x.id, x.nome, x.perfil, x.foto_url, x.tem,
           CASE WHEN x.total THEN 'total'
                WHEN x.excecao IS NOT NULL AND x.excecao = 'true'::jsonb THEN 'liberado'
                WHEN x.excecao IS NOT NULL THEN 'bloqueado'
                WHEN x.tem THEN 'cargo'
                ELSE 'sem' END
      FROM x
     WHERE v_gerir OR x.tem
     ORDER BY x.tem DESC, x.nome;
END;
$function$;

-- Libera ou tira o acesso de uma pessoa do setor, pela exceção por pessoa.
-- Devolve a origem nova (mesmos valores de fn_ouvidoria_cofen_pessoas).
CREATE OR REPLACE FUNCTION public.fn_ouvidoria_cofen_definir_acesso(p_setor_id UUID, p_perfil_id UUID, p_liberar BOOLEAN)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_chave   CONSTANT TEXT := 'ver_ouvidoria_cofen';
  v_alvo    RECORD;
  v_excecao JSONB;
BEGIN
  IF NOT public.fn_ouvidoria_cofen_alcanca(p_setor_id, TRUE) THEN
    RAISE EXCEPTION 'Só quem gerencia a Ouvidoria do setor escolhe quem atende.' USING ERRCODE = '42501';
  END IF;
  IF p_perfil_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Você não pode mudar o seu próprio acesso.' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.nome, p.empresa_id, p.setor_id, COALESCE(p.arquivado, FALSE) AS arquivado,
         COALESCE(c.acesso_total, FALSE) AS total
    INTO v_alvo
    FROM public.perfis p
    LEFT JOIN public.cargos c ON c.slug = p.perfil
   WHERE p.id = p_perfil_id;
  IF NOT FOUND OR v_alvo.arquivado THEN
    RAISE EXCEPTION 'Pessoa não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_alvo.setor_id IS DISTINCT FROM p_setor_id AND NOT EXISTS (
       SELECT 1 FROM public.equipe_membros m JOIN public.equipes e ON e.id = m.equipe_id
        WHERE m.pessoa_id = p_perfil_id AND m.papel = 'lider' AND e.setor_id = p_setor_id) THEN
    RAISE EXCEPTION '% não é deste setor.', v_alvo.nome USING ERRCODE = '42501';
  END IF;
  IF v_alvo.total THEN
    RAISE EXCEPTION '% já tem acesso total pelo cargo.', v_alvo.nome USING ERRCODE = '22023';
  END IF;

  SELECT pp.permissoes -> v_chave INTO v_excecao
    FROM public.perfis_permissoes pp
   WHERE pp.usuario_id = p_perfil_id AND pp.empresa_id = v_alvo.empresa_id
   FOR UPDATE;

  IF p_liberar THEN
    IF v_excecao IS NOT NULL AND v_excecao <> 'true'::jsonb THEN
      RAISE EXCEPTION 'O acesso de % está bloqueado em Configurações › Permissões. Só o administrador desfaz.', v_alvo.nome
        USING ERRCODE = '42501';
    END IF;
    IF v_excecao IS NULL AND NOT public.fn_perfil_tem(p_perfil_id, v_chave) THEN
      INSERT INTO public.perfis_permissoes (empresa_id, usuario_id, permissoes, atualizado_em, atualizado_por)
      VALUES (v_alvo.empresa_id, p_perfil_id, jsonb_build_object(v_chave, TRUE), now(), (SELECT auth.uid()))
      ON CONFLICT (empresa_id, usuario_id) DO UPDATE
        SET permissoes     = public.perfis_permissoes.permissoes || jsonb_build_object(v_chave, TRUE),
            atualizado_em  = now(),
            atualizado_por = (SELECT auth.uid());
    END IF;
  ELSE
    IF v_excecao IS NOT NULL AND v_excecao = 'true'::jsonb THEN
      UPDATE public.perfis_permissoes pp
         SET permissoes     = pp.permissoes - v_chave,
             atualizado_em  = now(),
             atualizado_por = (SELECT auth.uid())
       WHERE pp.usuario_id = p_perfil_id AND pp.empresa_id = v_alvo.empresa_id;
    END IF;
    IF public.fn_perfil_tem(p_perfil_id, v_chave) THEN
      RAISE EXCEPTION 'O acesso de % vem do cargo. Para tirar, desligue em Configurações › Permissões.', v_alvo.nome
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN (SELECT x.origem FROM public.fn_ouvidoria_cofen_pessoas(p_setor_id) x WHERE x.perfil_id = p_perfil_id);
END;
$function$;

-- ── 7. Grants ──────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_setores() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_alcanca(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_listar(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_salvar(UUID, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_excluir(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_andamentos(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_anotar(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_pessoas(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ouvidoria_cofen_definir_acesso(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_setores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_alcanca(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_listar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_salvar(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_excluir(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_andamentos(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_anotar(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_pessoas(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ouvidoria_cofen_definir_acesso(UUID, UUID, BOOLEAN) TO authenticated;

-- ── 8. Prova ───────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF (SELECT COUNT(*) FROM public.fn_permissoes_catalogo()
       WHERE chave IN ('ver_ouvidoria_cofen', 'ouvidoria_cofen_gerenciar')) <> 2 THEN
    RAISE EXCEPTION 'As chaves da Ouvidoria Cofen não entraram no catálogo (ou entraram duas vezes).';
  END IF;
  IF (SELECT COUNT(*) FROM public.fn_permissoes_catalogo())
     <> (SELECT COUNT(*) FROM public.fn_permissoes_catalogo_antes_ouvidoria_cofen_20261106()) + 2 THEN
    RAISE EXCEPTION 'O catálogo não é o anterior mais as duas chaves: o encadeamento quebrou.';
  END IF;
END
$prova$;

COMMIT;
