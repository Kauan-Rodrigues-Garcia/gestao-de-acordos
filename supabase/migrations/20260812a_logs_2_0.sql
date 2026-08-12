-- ═══════════════════════════════════════════════════════════════════════════
-- LOGS 2.0 — a auditoria deixa de depender de quem lembrou de chamá-la
-- ═══════════════════════════════════════════════════════════════════════════
-- Pedido de 12/08/2026: "tudo que seja importante fica registrado, tudo mesmo".
--
-- ── O que estava errado ─────────────────────────────────────────────────────
-- `logs_sistema` tinha 8 colunas e era escrita à mão, em 7 lugares do frontend.
-- Consequências concretas, todas verificáveis no repositório antes desta
-- migration:
--
--   1. COBERTURA POR SORTE. Editar um acordo, trocar o cargo de alguém, mexer
--      nas permissões de um cargo, aprovar uma comissão de Pix, mudar a meta do
--      mês, apagar um setor — nada disso gravava log. Só exclusão de acordo,
--      lembrete de WhatsApp, troca de extra, impersonação e senha gravavam, e
--      apenas quando o clique passava por aquela tela específica. O mesmo dado
--      alterado por outro caminho (RPC, importação, SQL Editor) não deixava
--      rastro nenhum.
--
--   2. O LOG PERDIA O AUTOR. `usuario_id` é FK para `perfis` com ON DELETE SET
--      NULL. Desligar um usuário apagava a autoria de tudo que ele fez — que é
--      exatamente o histórico que alguém vai querer ler depois. Agora nome,
--      e-mail e cargo ficam desnormalizados na linha: o log sobrevive ao perfil.
--
--   3. NÃO DAVA PARA SABER O QUE MUDOU. `detalhes` era um JSONB livre, cada
--      chamada com um formato diferente, nenhuma com valor anterior. "UPDATE em
--      acordos" não responde a única pergunta que importa: mudou de quanto para
--      quanto.
--
--   4. O BOTÃO "LIMPAR LOGS" NUNCA APAGOU NADA. A tabela tem RLS ligada e
--      políticas só de SELECT e INSERT. Sem política de DELETE, o PostgREST
--      responde 204 com zero linhas afetadas — a tela dava "Logs apagados com
--      sucesso" e nada acontecia. Ver seção 8.
--
-- ── A decisão ───────────────────────────────────────────────────────────────
-- Auditoria confiável não pode morar na tela. Ela vira TRIGGER: o banco grava
-- porque a linha mudou, não porque alguém se lembrou de gravar. Uma única
-- função genérica (`fn_log_auditoria`) atende 20 tabelas, com diff campo a
-- campo, frase pronta em português e severidade.
--
-- O frontend continua registrando o que o banco não tem como ver — login,
-- login recusado, logout, exportação de dados, resumo de importação, leitura
-- por imagem — via `fn_log_registrar`.
--
-- ── Custo assumido ──────────────────────────────────────────────────────────
-- Uma linha de log por linha alterada. Numa importação de 3 mil acordos, 3 mil
-- logs. Isso é o preço de "tudo mesmo", e é gerenciável: o payload de INSERT
-- guarda campos-chave (não a linha inteira), textos longos são truncados, os
-- índices cobrem todos os filtros da tela, a contagem e os agregados são
-- calculados no banco (`fn_logs_resumo`) e existe expurgo por idade
-- (`fn_logs_expurgar`). Recomendação: 180 dias de retenção.
--
-- Idempotente. Pode rodar novamente sem efeito colateral.

-- ─── 0. pg_trgm: busca livre por texto na tela ──────────────────────────────
-- A tela tem uma caixa de busca que varre descrição, rótulo do alvo e nome do
-- autor. Sem trigramas, `ILIKE '%texto%'` é varredura sequencial. Se o papel
-- do banco não puder criar extensão, seguimos sem ela — os índices btree já
-- cobrem todos os outros filtros, e a busca continua correta, só mais lenta.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
  RAISE NOTICE 'pg_trgm indisponível — busca livre em logs seguirá sem índice de trigrama.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. AS COLUNAS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.logs_sistema
  -- Domínio do evento. É por aqui que a tela agrupa: quem quer ver dinheiro não
  -- quer ver login no meio.
  ADD COLUMN IF NOT EXISTS categoria     TEXT NOT NULL DEFAULT 'sistema',
  -- Quanto isso importa. 'critico' é o que um administrador precisa ver mesmo
  -- sem procurar: permissão alterada, exclusão de usuário, acesso concedido.
  ADD COLUMN IF NOT EXISTS severidade    TEXT NOT NULL DEFAULT 'info',
  -- Frase pronta, em português, montada onde o evento aconteceu. Mesmo padrão
  -- do `pix_automatico_log` (ver 20260811c): a tela mostra o histórico sem
  -- reconstruir a redação a partir do JSON, e a redação não muda quando a tela
  -- muda.
  ADD COLUMN IF NOT EXISTS descricao     TEXT,
  -- Autor desnormalizado. O log tem de sobreviver ao desligamento da pessoa.
  ADD COLUMN IF NOT EXISTS usuario_nome  TEXT,
  ADD COLUMN IF NOT EXISTS usuario_email TEXT,
  ADD COLUMN IF NOT EXISTS usuario_cargo TEXT,
  -- O que foi mexido, em termos humanos. `tabela`/`registro_id` respondem "onde"
  -- para quem lê SQL; `alvo_tipo`/`alvo_rotulo` respondem para quem lê a tela.
  ADD COLUMN IF NOT EXISTS alvo_tipo     TEXT,
  ADD COLUMN IF NOT EXISTS alvo_rotulo   TEXT,
  -- Diff. Só os campos que mudaram, mascarados e truncados. Em UPDATE são os
  -- dois lados; em INSERT só `depois`; em DELETE só `antes`.
  ADD COLUMN IF NOT EXISTS antes         JSONB,
  ADD COLUMN IF NOT EXISTS depois        JSONB,
  ADD COLUMN IF NOT EXISTS campos        TEXT[],
  -- De onde veio o registro. Separa o que uma pessoa fez do que o sistema fez.
  ADD COLUMN IF NOT EXISTS origem        TEXT NOT NULL DEFAULT 'ui',
  -- Contexto da requisição. `ip` e `user_agent` saem dos headers que o
  -- PostgREST expõe; `rota` é informada pelo frontend.
  ADD COLUMN IF NOT EXISTS rota          TEXT,
  ADD COLUMN IF NOT EXISTS ip            TEXT,
  ADD COLUMN IF NOT EXISTS user_agent    TEXT;

COMMENT ON COLUMN public.logs_sistema.categoria IS
  'Domínio do evento: acordo, financeiro, usuario, autenticacao, seguranca, '
  'configuracao, importacao, whatsapp, ouvidoria, meta, lixeira, comunicacao, '
  'sistema. Ver 20260812a.';
COMMENT ON COLUMN public.logs_sistema.severidade IS
  'info | aviso | critico. "critico" é o que o administrador precisa ver sem '
  'procurar (permissão, exclusão de usuário, concessão de acesso).';
COMMENT ON COLUMN public.logs_sistema.descricao IS
  'Frase pronta em português. Montada na origem do evento — a tela não '
  'reconstrói redação a partir de JSON.';
COMMENT ON COLUMN public.logs_sistema.usuario_nome IS
  'Nome do autor no momento do evento. Desnormalizado de propósito: usuario_id '
  'é ON DELETE SET NULL e desligar alguém apagava a autoria do histórico dele.';
COMMENT ON COLUMN public.logs_sistema.antes IS
  'Valores anteriores dos campos que mudaram — mascarados (telefone, senha, '
  'documento) e truncados em 500 caracteres. Nunca a linha inteira.';
COMMENT ON COLUMN public.logs_sistema.campos IS
  'Nomes dos campos que mudaram. Permite filtrar "quem mexeu em valor" sem '
  'abrir o JSON.';
COMMENT ON COLUMN public.logs_sistema.origem IS
  'ui | trigger | api | importacao | automatico | anon. Separa ação de pessoa '
  'de rotina de sistema.';

-- ─── Domínios fechados ──────────────────────────────────────────────────────
-- CHECK e não ENUM: a lista cresce com o produto, e alterar CHECK é uma
-- migration curta, enquanto alterar ENUM em transação tem armadilhas.
DO $$
BEGIN
  ALTER TABLE public.logs_sistema DROP CONSTRAINT IF EXISTS logs_sistema_categoria_check;
  ALTER TABLE public.logs_sistema ADD CONSTRAINT logs_sistema_categoria_check
    CHECK (categoria IN (
      'acordo', 'financeiro', 'usuario', 'autenticacao', 'seguranca',
      'configuracao', 'importacao', 'whatsapp', 'ouvidoria', 'meta',
      'lixeira', 'comunicacao', 'sistema'
    ));

  ALTER TABLE public.logs_sistema DROP CONSTRAINT IF EXISTS logs_sistema_severidade_check;
  ALTER TABLE public.logs_sistema ADD CONSTRAINT logs_sistema_severidade_check
    CHECK (severidade IN ('info', 'aviso', 'critico'));

  ALTER TABLE public.logs_sistema DROP CONSTRAINT IF EXISTS logs_sistema_origem_check;
  ALTER TABLE public.logs_sistema ADD CONSTRAINT logs_sistema_origem_check
    CHECK (origem IN ('ui', 'trigger', 'api', 'importacao', 'automatico', 'anon'));
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. FERRAMENTAS: mascarar, truncar, diferenciar, rotular
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 2.1 Máscara + truncamento ──────────────────────────────────────────────
-- Duas coisas nunca entram inteiras no log:
--   • Dado pessoal sensível (telefone, documento, senha, token). O projeto já
--     bloqueia CPF nos campos de acordo (ver 20260803a/b) — seria contraditório
--     o log guardar o que o formulário recusa.
--   • Texto longo (conteúdo de modelo de mensagem, documento LGPD). Guardar
--     10 KB por edição infla a tabela sem responder nada que os 500 primeiros
--     caracteres não respondam.
CREATE OR REPLACE FUNCTION public.fn_log_mascarar(p_dados JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_saida JSONB := '{}'::jsonb;
  v_chave TEXT;
  v_valor JSONB;
  v_texto TEXT;
BEGIN
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RETURN p_dados;
  END IF;

  FOR v_chave, v_valor IN SELECT * FROM jsonb_each(p_dados) LOOP
    -- Sensível: fica só o final, o suficiente para reconhecer sem expor.
    IF v_chave ~* '(whatsapp|telefone|celular|senha|password|token|secret|cpf|cnpj|documento)' THEN
      v_texto := NULLIF(v_valor #>> '{}', '');
      v_saida := v_saida || jsonb_build_object(
        v_chave,
        CASE
          WHEN v_texto IS NULL THEN v_valor
          WHEN length(v_texto) <= 4 THEN to_jsonb('••••'::text)
          ELSE to_jsonb('••••' || right(v_texto, 4))
        END
      );

    -- Texto longo: corta e diz quanto era.
    ELSIF jsonb_typeof(v_valor) = 'string' AND length(v_valor #>> '{}') > 500 THEN
      v_texto := v_valor #>> '{}';
      v_saida := v_saida || jsonb_build_object(
        v_chave,
        to_jsonb(left(v_texto, 500) || '… (' || length(v_texto) || ' caracteres)')
      );

    ELSE
      v_saida := v_saida || jsonb_build_object(v_chave, v_valor);
    END IF;
  END LOOP;

  RETURN v_saida;
END $$;

COMMENT ON FUNCTION public.fn_log_mascarar(JSONB) IS
  'Mascara dado pessoal sensível (mantendo os 4 últimos caracteres) e trunca '
  'texto acima de 500 caracteres antes de gravar no log. Ver 20260812a.';

-- ─── 2.2 Diff campo a campo ─────────────────────────────────────────────────
-- Devolve `{campo: {antes, depois}}` apenas para o que realmente mudou. É o
-- que responde "mudou de quanto para quanto" — a pergunta que o log antigo não
-- respondia.
CREATE OR REPLACE FUNCTION public.fn_log_diff(
  p_antes   JSONB,
  p_depois  JSONB,
  p_ignorar TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      chave,
      jsonb_build_object('antes', p_antes -> chave, 'depois', p_depois -> chave)
    ),
    '{}'::jsonb
  )
  FROM (
    SELECT k AS chave FROM jsonb_object_keys(COALESCE(p_antes,  '{}'::jsonb)) AS k
    UNION
    SELECT k          FROM jsonb_object_keys(COALESCE(p_depois, '{}'::jsonb)) AS k
  ) AS chaves
  WHERE NOT (chave = ANY (COALESCE(p_ignorar, ARRAY[]::TEXT[])))
    AND COALESCE(p_antes  -> chave, 'null'::jsonb)
        IS DISTINCT FROM
        COALESCE(p_depois -> chave, 'null'::jsonb);
$$;

COMMENT ON FUNCTION public.fn_log_diff(JSONB, JSONB, TEXT[]) IS
  'Diff de dois JSONB: {campo: {antes, depois}} só para o que mudou, ignorando '
  'as chaves pedidas. Ver 20260812a.';

-- ─── 2.3 Rótulo de campo em português ───────────────────────────────────────
-- A frase pronta ("Alterou o acordo NR 123: valor, vencimento") precisa dos
-- nomes que a operação usa, não dos nomes das colunas. A tela tem o catálogo
-- completo; aqui ficam os campos que aparecem em frase.
CREATE OR REPLACE FUNCTION public.fn_log_rotulo_campo(p_campo TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_campo
    WHEN 'nome_cliente'       THEN 'cliente'
    WHEN 'nr_cliente'         THEN 'NR'
    WHEN 'valor'              THEN 'valor'
    WHEN 'valor_total'        THEN 'valor total'
    WHEN 'vencimento'         THEN 'vencimento'
    WHEN 'status'             THEN 'status'
    WHEN 'tipo'               THEN 'tipo'
    WHEN 'tipo_vinculo'       THEN 'Direto/Extra'
    WHEN 'parcelas'           THEN 'parcelas'
    WHEN 'numero_parcela'     THEN 'número da parcela'
    WHEN 'observacoes'        THEN 'observações'
    WHEN 'operador_id'        THEN 'operador'
    WHEN 'setor_id'           THEN 'setor'
    WHEN 'equipe_id'          THEN 'equipe'
    WHEN 'lider_id'           THEN 'líder'
    WHEN 'instituicao'        THEN 'instituição'
    WHEN 'estado_uf'          THEN 'estado'
    WHEN 'data_pagamento'     THEN 'data de pagamento'
    WHEN 'pago_em'            THEN 'pago em'
    WHEN 'usou_quarenta_pct'  THEN 'usou 40%'
    WHEN 'tag_ids'            THEN 'tags'
    WHEN 'perfil'             THEN 'cargo'
    WHEN 'ativo'              THEN 'ativo'
    WHEN 'situacao'           THEN 'situação'
    WHEN 'arquivado'          THEN 'arquivado'
    WHEN 'desligado_em'       THEN 'desligamento'
    WHEN 'permissoes'         THEN 'permissões'
    WHEN 'meta_valor'         THEN 'meta de valor'
    WHEN 'meta_acordos'       THEN 'meta de acordos'
    WHEN 'pct'                THEN 'percentual'
    WHEN 'pct_comissao'       THEN 'percentual de comissão'
    WHEN 'pago'               THEN 'pagamento'
    WHEN 'nivel'              THEN 'nível de acesso'
    WHEN 'conteudo'           THEN 'conteúdo'
    WHEN 'nome'               THEN 'nome'
    WHEN 'email'              THEN 'e-mail'
    WHEN 'usuario'            THEN 'usuário'
    WHEN 'cor'                THEN 'cor'
    WHEN 'escopo'             THEN 'escopo'
    WHEN 'referencia_id'      THEN 'referência'
    WHEN 'responsavel_id'     THEN 'responsável'
    WHEN 'categoria'          THEN 'categoria'
    WHEN 'mensagem'           THEN 'mensagem'
    ELSE replace(p_campo, '_', ' ')
  END;
$$;

-- ─── 2.4 Contexto da requisição ─────────────────────────────────────────────
-- O PostgREST publica os headers da chamada no GUC `request.headers`. É de lá
-- que sai o IP real (atrás do proxy da Supabase) e o navegador. Fora de uma
-- requisição HTTP (psql, cron) o GUC não existe e as duas voltam NULL — que é
-- a verdade, não uma falha.
CREATE OR REPLACE FUNCTION public.fn_log_contexto(p_header TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_headers TEXT := current_setting('request.headers', true);
  v_valor   TEXT;
BEGIN
  IF v_headers IS NULL OR v_headers = '' THEN
    RETURN NULL;
  END IF;
  v_valor := v_headers::json ->> p_header;
  -- x-forwarded-for pode vir com a cadeia inteira; o primeiro é o cliente.
  IF p_header = 'x-forwarded-for' AND v_valor IS NOT NULL THEN
    v_valor := split_part(v_valor, ',', 1);
  END IF;
  RETURN left(trim(v_valor), 400);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. fn_log_registrar — a única porta de entrada do log
-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER por dois motivos:
--   • As triggers gravam em nome de quem alterou a linha, e a política de
--     INSERT exige `fn_can_access_empresa` — um operador alterando o próprio
--     acordo passa, mas uma rotina de sistema (auth.uid() nulo) não passaria.
--   • Com a tabela append-only (seção 8), esta função é o único caminho de
--     escrita — o que torna o formato do log garantido, não sugerido.
--
-- SEGURANÇA: como qualquer autenticado pode chamá-la, ela NÃO aceita autoria
-- forjada. `usuario_id` é sempre `auth.uid()` quando há sessão; o valor
-- informado só é usado quando não há sessão nenhuma (rotina, endpoint com
-- service_role). Quem não é super_admin também não escolhe a empresa: cai na
-- própria. O valor recusado fica visível em `detalhes` — tentativa de forjar
-- autoria é, ela mesma, informação de auditoria.
--
-- A função NUNCA levanta exceção: log é efeito colateral, e derrubar a
-- operação de negócio porque a auditoria falhou seria trocar um problema por
-- um pior.
CREATE OR REPLACE FUNCTION public.fn_log_registrar(
  p_acao        TEXT,
  p_categoria   TEXT    DEFAULT 'sistema',
  p_severidade  TEXT    DEFAULT 'info',
  p_descricao   TEXT    DEFAULT NULL,
  p_empresa_id  UUID    DEFAULT NULL,
  p_tabela      TEXT    DEFAULT NULL,
  p_registro_id TEXT    DEFAULT NULL,
  p_alvo_tipo   TEXT    DEFAULT NULL,
  p_alvo_rotulo TEXT    DEFAULT NULL,
  p_antes       JSONB   DEFAULT NULL,
  p_depois      JSONB   DEFAULT NULL,
  p_campos      TEXT[]  DEFAULT NULL,
  p_detalhes    JSONB   DEFAULT NULL,
  p_origem      TEXT    DEFAULT 'ui',
  p_rota        TEXT    DEFAULT NULL,
  p_usuario_id  UUID    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao     UUID := auth.uid();
  v_autor      UUID;
  v_nome       TEXT;
  v_email      TEXT;
  v_cargo      TEXT;
  v_empresa    UUID;
  v_minha      UUID;
  v_super      BOOLEAN := false;
  v_detalhes   JSONB := COALESCE(p_detalhes, '{}'::jsonb);
  v_id         UUID;
BEGIN
  -- Autoria: a sessão manda. Sem sessão, aceita o que foi informado.
  v_autor := COALESCE(v_sessao, p_usuario_id);
  IF v_sessao IS NOT NULL AND p_usuario_id IS NOT NULL AND p_usuario_id <> v_sessao THEN
    v_detalhes := v_detalhes || jsonb_build_object('usuario_informado', p_usuario_id);
  END IF;

  SELECT p.nome, p.email, p.perfil, p.empresa_id
    INTO v_nome, v_email, v_cargo, v_minha
    FROM public.perfis p
   WHERE p.id = v_autor;

  v_super := (v_cargo = 'super_admin');

  -- Empresa: super_admin escolhe (ele opera nas duas operações); os demais
  -- ficam na própria, independente do que mandaram.
  IF v_super THEN
    v_empresa := COALESCE(p_empresa_id, v_minha);
  ELSE
    v_empresa := COALESCE(v_minha, p_empresa_id);
    IF p_empresa_id IS NOT NULL AND v_minha IS NOT NULL AND p_empresa_id <> v_minha THEN
      v_detalhes := v_detalhes || jsonb_build_object('empresa_informada', p_empresa_id);
    END IF;
  END IF;

  -- `empresa_id` é NOT NULL desde 11_tenant_lockdown. Sem empresa não há onde
  -- pendurar o log: aborta em silêncio em vez de estourar na operação real.
  IF v_empresa IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.logs_sistema (
    usuario_id, usuario_nome, usuario_email, usuario_cargo,
    empresa_id, acao, categoria, severidade, descricao,
    tabela, registro_id, alvo_tipo, alvo_rotulo,
    antes, depois, campos, detalhes,
    origem, rota, ip, user_agent
  ) VALUES (
    v_autor, v_nome, v_email, v_cargo,
    v_empresa, p_acao,
    COALESCE(p_categoria, 'sistema'),
    COALESCE(p_severidade, 'info'),
    NULLIF(btrim(COALESCE(p_descricao, '')), ''),
    p_tabela, p_registro_id, p_alvo_tipo, NULLIF(btrim(COALESCE(p_alvo_rotulo, '')), ''),
    public.fn_log_mascarar(p_antes),
    public.fn_log_mascarar(p_depois),
    p_campos,
    CASE WHEN v_detalhes = '{}'::jsonb THEN NULL ELSE public.fn_log_mascarar(v_detalhes) END,
    COALESCE(p_origem, 'ui'),
    p_rota,
    public.fn_log_contexto('x-forwarded-for'),
    public.fn_log_contexto('user-agent')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  -- Auditoria é efeito colateral. Se ela falhar, quem falha é ela.
  RAISE WARNING 'fn_log_registrar falhou (acao=%): %', p_acao, SQLERRM;
  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.fn_log_registrar IS
  'Única porta de escrita em logs_sistema. Resolve autor pela sessão (não '
  'aceita autoria forjada), força a empresa do autor para quem não é '
  'super_admin, mascara dado sensível e captura IP/user-agent dos headers. '
  'Nunca levanta exceção. Ver 20260812a.';

GRANT EXECUTE ON FUNCTION public.fn_log_registrar(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT,
  JSONB, JSONB, TEXT[], JSONB, TEXT, TEXT, UUID
) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. fn_log_auditoria — uma trigger para todas as tabelas
-- ═══════════════════════════════════════════════════════════════════════════
-- Argumentos (TG_ARGV, todos texto):
--   0 categoria      domínio do evento
--   1 alvo_slug      chave em snake_case, usada para montar o nome da AÇÃO
--   2 alvo_nome      substantivo em português, usado nas FRASES ('acordo',
--                    'usuário', 'permissões do cargo')
--   3 colunas_rotulo colunas que formam o rótulo humano, separadas por vírgula
--                    ('nr_cliente,nome_cliente' → "NR 123 — João da Silva")
--   4 ignorar        colunas fora do diff, separadas por vírgula
--   5 col_empresa    coluna do tenant ('empresa_id'; 'id' na tabela empresas)
--   6 severidade     severidade base ('info' por padrão; DELETE sobe um nível)
--
-- Convenção de ação: <alvo_slug>_criado | _alterado | _excluido, com casos
-- especiais nomeados (status de acordo, cargo de usuário, permissões).
--
-- Slug e nome são dois argumentos porque servem a públicos diferentes: a ação é
-- chave de filtro e de catálogo (tem de ser estável, sem acento e sem espaço), e
-- a frase é texto que alguém lê. Juntar os dois dava ações como
-- "item da lixeira_criado".
--
-- Nada aqui pode derrubar a operação de negócio: o corpo inteiro está sob
-- EXCEPTION WHEN OTHERS.
CREATE OR REPLACE FUNCTION public.fn_log_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria  TEXT := COALESCE(TG_ARGV[0], 'sistema');
  v_slug       TEXT := COALESCE(NULLIF(TG_ARGV[1], ''), TG_TABLE_NAME);
  v_alvo       TEXT := COALESCE(NULLIF(TG_ARGV[2], ''), TG_TABLE_NAME);
  -- COALESCE por fora: `string_to_array('', ',')` devolve array vazio no
  -- PostgreSQL atual, mas devolvia NULL em versões antigas — e `NULL || array` é
  -- NULL, o que faria a lista de ignorados desaparecer silenciosamente.
  v_cols_rot   TEXT[] := COALESCE(string_to_array(COALESCE(TG_ARGV[3], ''), ','), ARRAY[]::TEXT[]);
  -- Duas listas: a configurada na trigger (colunas que nunca interessam, como
  -- `dados_completos`) e ela mais os carimbos de tempo. A diferença importa no
  -- DELETE — ver o comentário lá embaixo.
  v_ignorar_cfg TEXT[] := COALESCE(string_to_array(COALESCE(TG_ARGV[4], ''), ','), ARRAY[]::TEXT[]);
  v_ignorar    TEXT[];
  v_col_emp    TEXT := COALESCE(NULLIF(TG_ARGV[5], ''), 'empresa_id');
  v_sev_base   TEXT := COALESCE(NULLIF(TG_ARGV[6], ''), 'info');

  v_antes_row  JSONB;
  v_depois_row JSONB;
  v_diff       JSONB;
  v_campos     TEXT[];
  v_antes      JSONB;
  v_depois     JSONB;

  v_empresa    UUID;
  v_registro   TEXT;
  v_rotulo     TEXT;
  v_acao       TEXT;
  v_sev        TEXT;
  v_descricao  TEXT;
  v_detalhes   JSONB := '{}'::jsonb;

  v_col        TEXT;
  v_pedaco     TEXT;
  v_pedacos    TEXT[] := ARRAY[]::TEXT[];
  v_de         TEXT;
  v_para       TEXT;
BEGIN
  -- Sempre ignorados NO DIFF: carimbos de tempo mudam em toda escrita e não são
  -- informação de auditoria — se só eles mudaram, não houve mudança.
  v_ignorar := v_ignorar_cfg || ARRAY['atualizado_em', 'updated_at', 'criado_em', 'created_at'];

  v_antes_row  := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_depois_row := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;

  -- ── Tenant e identidade da linha ──────────────────────────────────────────
  v_empresa  := NULLIF(COALESCE(v_depois_row, v_antes_row) ->> v_col_emp, '')::UUID;
  v_registro := COALESCE(v_depois_row, v_antes_row) ->> 'id';

  -- ── Rótulo humano ─────────────────────────────────────────────────────────
  FOREACH v_col IN ARRAY v_cols_rot LOOP
    v_col := btrim(v_col);
    CONTINUE WHEN v_col = '';
    v_pedaco := NULLIF(btrim(COALESCE(v_depois_row, v_antes_row) ->> v_col), '');
    IF v_pedaco IS NOT NULL THEN
      -- NR é o identificador que a operação fala em voz alta; ganha prefixo.
      IF v_col = 'nr_cliente' OR v_col = 'nr_value' THEN
        v_pedaco := 'NR ' || v_pedaco;
      END IF;
      v_pedacos := v_pedacos || v_pedaco;
    END IF;
  END LOOP;
  v_rotulo := NULLIF(array_to_string(v_pedacos, ' — '), '');

  -- ── Diff ──────────────────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' THEN
    v_diff := public.fn_log_diff(v_antes_row, v_depois_row, v_ignorar);

    -- Só carimbo de tempo mudou: não é evento. Sai sem gravar nada — é isto que
    -- impede a tabela de encher de linhas que não dizem nada.
    IF v_diff = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    SELECT array_agg(k ORDER BY k) INTO v_campos FROM jsonb_object_keys(v_diff) AS k;

    SELECT jsonb_object_agg(k, v_diff -> k -> 'antes'),
           jsonb_object_agg(k, v_diff -> k -> 'depois')
      INTO v_antes, v_depois
      FROM jsonb_object_keys(v_diff) AS k;

    v_acao := v_slug || '_alterado';
    v_sev  := v_sev_base;

    -- Frase: "Alterou o acordo NR 123 — João: valor, vencimento".
    SELECT string_agg(public.fn_log_rotulo_campo(k), ', ' ORDER BY k)
      INTO v_pedaco
      FROM unnest(v_campos) AS k;
    v_descricao := 'Alterou ' || v_alvo
                   || COALESCE(' ' || v_rotulo, '')
                   || COALESCE(': ' || v_pedaco, '');

  ELSIF TG_OP = 'INSERT' THEN
    -- Em criação, `depois` guarda os campos-chave e não a linha inteira: o
    -- volume de INSERT é o maior de todos (importação) e a linha completa
    -- está no próprio registro, que acabou de nascer.
    v_diff := public.fn_log_diff('{}'::jsonb, v_depois_row, v_ignorar || ARRAY['id']);
    SELECT jsonb_object_agg(k, v_diff -> k -> 'depois') INTO v_depois
      FROM jsonb_object_keys(v_diff) AS k;
    v_acao      := v_slug || '_criado';
    v_sev       := v_sev_base;
    v_descricao := 'Criou ' || v_alvo || COALESCE(' ' || v_rotulo, '');

  ELSE  -- DELETE
    -- Exclusão guarda a linha inteira: é o único lugar onde ela ainda existe.
    --
    -- Menos as colunas que a trigger declarou ignorar — e essa subtração é o
    -- motivo de existirem duas listas. `lixeira_acordos.dados_completos` é o
    -- acordo inteiro em JSON: guardá-lo aqui gravaria o mesmo dado duas vezes, e
    -- em toda linha expurgada. Os carimbos de tempo, ao contrário, FICAM: em
    -- exclusão, saber quando o registro nasceu é informação, não ruído.
    v_antes := v_antes_row - v_ignorar_cfg;
    v_acao  := v_slug || '_excluido';
    -- Apagar é sempre pelo menos um aviso; o que já era crítico continua.
    v_sev   := CASE WHEN v_sev_base = 'critico' THEN 'critico' ELSE 'aviso' END;
    v_descricao := 'Excluiu ' || v_alvo || COALESCE(' ' || v_rotulo, '');
  END IF;

  -- ── Casos especiais: onde a frase genérica não serve ──────────────────────

  -- Acordo: mudança de status é o evento que a operação inteira acompanha.
  IF TG_TABLE_NAME = 'acordos' AND TG_OP = 'UPDATE' AND ('status' = ANY (v_campos)) THEN
    v_de   := v_antes  ->> 'status';
    v_para := v_depois ->> 'status';
    v_acao := 'acordo_status_alterado';
    v_sev  := CASE WHEN v_para = 'pago' THEN 'info' ELSE 'aviso' END;
    v_descricao := 'Mudou o status do acordo ' || COALESCE(v_rotulo, '')
                   || ' de "' || COALESCE(v_de, '—') || '" para "' || COALESCE(v_para, '—') || '"'
                   || CASE WHEN array_length(v_campos, 1) > 1
                           THEN ' (e mais ' || (array_length(v_campos, 1) - 1) || ' campo(s))'
                           ELSE '' END;
  END IF;

  -- Acordo excluído: dizer se foi para a lixeira e por quê. Sem isto, "Excluiu
  -- o acordo" não distingue soft delete de perda definitiva — e é justamente
  -- essa a pergunta de quem abre o log.
  IF TG_TABLE_NAME = 'acordos' AND TG_OP = 'DELETE' THEN
    SELECT l.motivo INTO v_pedaco
      FROM public.lixeira_acordos l
     WHERE l.acordo_id = OLD.id
     ORDER BY l.excluido_em DESC
     LIMIT 1;
    v_descricao := 'Excluiu o acordo ' || COALESCE(v_rotulo, '')
                   || CASE WHEN v_pedaco IS NOT NULL
                           THEN ' (foi para a lixeira: ' || v_pedaco || ')'
                           ELSE ' (sem passar pela lixeira)' END;
    IF v_pedaco IS NULL THEN
      v_sev := 'critico';   -- exclusão sem rede de segurança
    END IF;
    v_detalhes := v_detalhes || jsonb_build_object(
      'valor', OLD.valor, 'status', OLD.status, 'operador_id', OLD.operador_id
    );
  END IF;

  -- Usuário: cargo e situação não são "mais um campo".
  IF TG_TABLE_NAME = 'perfis' AND TG_OP = 'UPDATE' THEN
    IF 'perfil' = ANY (v_campos) THEN
      v_acao := 'usuario_cargo_alterado';
      v_sev  := 'critico';
      v_descricao := 'Mudou o cargo de ' || COALESCE(v_rotulo, 'um usuário')
                     || ' de "' || COALESCE(v_antes ->> 'perfil', '—')
                     || '" para "' || COALESCE(v_depois ->> 'perfil', '—') || '"';
    ELSIF ('ativo' = ANY (v_campos)) OR ('situacao' = ANY (v_campos))
       OR ('desligado_em' = ANY (v_campos)) OR ('arquivado' = ANY (v_campos)) THEN
      v_acao := 'usuario_situacao_alterada';
      v_sev  := 'aviso';
      v_descricao := 'Alterou a situação de ' || COALESCE(v_rotulo, 'um usuário')
                     || COALESCE(': ' || (
                          SELECT string_agg(public.fn_log_rotulo_campo(k) || ' → '
                                            || COALESCE(v_depois ->> k, 'nulo'), ', ' ORDER BY k)
                            FROM unnest(v_campos) AS k
                           WHERE k IN ('ativo', 'situacao', 'desligado_em', 'arquivado')
                        ), '');
    END IF;
  END IF;

  -- Permissões de cargo: o diff útil é chave por chave, não "o JSONB mudou".
  -- Sem isto, a linha diria apenas "alterou permissões" e a tela mostraria dois
  -- objetos de 40 chaves para o administrador comparar a olho.
  IF TG_TABLE_NAME = 'cargos_permissoes' AND TG_OP = 'UPDATE'
     AND ('permissoes' = ANY (v_campos)) THEN
    v_diff := public.fn_log_diff(
      COALESCE(v_antes_row -> 'permissoes', '{}'::jsonb),
      COALESCE(v_depois_row -> 'permissoes', '{}'::jsonb),
      ARRAY[]::TEXT[]
    );
    SELECT array_agg(k ORDER BY k) INTO v_campos FROM jsonb_object_keys(v_diff) AS k;
    SELECT jsonb_object_agg(k, v_diff -> k -> 'antes'),
           jsonb_object_agg(k, v_diff -> k -> 'depois')
      INTO v_antes, v_depois
      FROM jsonb_object_keys(v_diff) AS k;

    v_acao := 'permissoes_alteradas';
    v_sev  := 'critico';
    v_descricao := 'Alterou permissões do cargo "' || COALESCE(NEW.cargo, '—') || '": '
      || COALESCE((
           SELECT string_agg(
                    CASE WHEN (v_depois -> k)::text = 'true' THEN '+' ELSE '−' END || k,
                    ', ' ORDER BY k)
             FROM unnest(v_campos) AS k
         ), 'nenhuma chave');
  END IF;

  -- ── Grava ─────────────────────────────────────────────────────────────────
  PERFORM public.fn_log_registrar(
    p_acao        := v_acao,
    p_categoria   := v_categoria,
    p_severidade  := v_sev,
    p_descricao   := v_descricao,
    p_empresa_id  := v_empresa,
    p_tabela      := TG_TABLE_NAME,
    p_registro_id := v_registro,
    -- `alvo_tipo` guarda o SLUG, não a frase: é chave de agrupamento na tela
    -- ("todo o histórico de acordos"), e chave não leva artigo nem acento.
    p_alvo_tipo   := v_slug,
    p_alvo_rotulo := v_rotulo,
    p_antes       := v_antes,
    p_depois      := v_depois,
    p_campos      := v_campos,
    p_detalhes    := CASE WHEN v_detalhes = '{}'::jsonb THEN NULL ELSE v_detalhes END,
    p_origem      := 'trigger'
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

EXCEPTION WHEN OTHERS THEN
  -- Nenhuma operação do sistema pode morrer porque a auditoria tropeçou.
  RAISE WARNING 'fn_log_auditoria falhou (%.% %): %', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, SQLERRM;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

COMMENT ON FUNCTION public.fn_log_auditoria() IS
  'Trigger genérica de auditoria: diff campo a campo, frase pronta em '
  'português, severidade e rótulo humano. Configurada por TG_ARGV: '
  '(0) categoria, (1) slug da ação, (2) substantivo da frase, (3) colunas do '
  'rótulo, (4) colunas ignoradas, (5) coluna do tenant, (6) severidade base. '
  'Nunca levanta exceção. Ver 20260812a.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. AS TRIGGERS — o que passa a ficar registrado
-- ═══════════════════════════════════════════════════════════════════════════
-- Uma linha por tabela auditada. O DO block salta as que não existem no banco
-- em questão (o projeto tem migrations que criam tabelas em fases), o que
-- mantém a migration idempotente e independente da ordem.
--
-- Ausências deliberadas, para constar:
--   • `analitico_recebimentos` e `diario_recebimentos` — são o resultado de
--     importação em massa (milhares de linhas por arquivo). O evento útil ali é
--     o RESUMO da importação, que o frontend grava com contagens; auditar linha
--     a linha só encheria a tabela.
--   • `notificacoes` — derivada, gerada por outras triggers. Auditar geraria
--     log do log.
--   • `logs_sistema` — não se audita o próprio livro.
--   • `pet_*` — economia congelada, aba fora do ar (ver 20260809c).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    -- A última coluna diz QUAIS eventos são auditados. Quase toda tabela leva os
    -- três, mas duas seriam puro eco do log de `acordos`:
    --
    --   • `lixeira_acordos` INSERT — a exclusão do acordo já registra "foi para a
    --     lixeira, motivo X". Aqui interessam UPDATE e DELETE, que são a
    --     restauração e o expurgo.
    --   • `nr_registros` INSERT — nasce junto com todo acordo criado, e diria a
    --     mesma coisa que "acordo criado". O que importa é a titularidade
    --     MUDANDO de dono ou sendo liberada, que é onde nascem as disputas de
    --     comissão.
    SELECT * FROM (VALUES
      -- tabela                     categoria       slug da ação        substantivo da frase     colunas do rótulo              ignorar                            tenant        sev.       eventos
      ('acordos',                   'acordo',       'acordo',           'o acordo',              'nr_cliente,nome_cliente',     'acordo_grupo_id',                 'empresa_id', 'info',    'INSERT OR UPDATE OR DELETE'),
      ('lixeira_acordos',           'lixeira',      'lixeira_item',     'o item da lixeira',     'nr_cliente,nome_cliente',     'dados_completos,expira_em',       'empresa_id', 'aviso',   'UPDATE OR DELETE'),
      ('nr_registros',              'acordo',       'nr_titularidade',  'a titularidade de NR',  'nr_value,operador_nome',      '',                                'empresa_id', 'aviso',   'UPDATE OR DELETE'),
      ('perfis',                    'usuario',      'usuario',          'o usuário',             'nome,usuario',                'foto_url,viu_notificacao_chatplay,pet_despedida,tampermonkey_configured,senha_alterada', 'empresa_id', 'aviso', 'INSERT OR UPDATE OR DELETE'),
      ('cargos_permissoes',         'seguranca',    'cargo_permissoes', 'as permissões do cargo','cargo',                       '',                                'empresa_id', 'critico', 'INSERT OR UPDATE OR DELETE'),
      ('empresas',                  'configuracao', 'empresa',          'a empresa',             'nome,slug',                   '',                                'id',         'critico', 'INSERT OR UPDATE OR DELETE'),
      ('setores',                   'configuracao', 'setor',            'o setor',               'nome',                        'foto_url',                        'empresa_id', 'info',    'INSERT OR UPDATE OR DELETE'),
      ('equipes',                   'configuracao', 'equipe',           'a equipe',              'nome',                        '',                                'empresa_id', 'info',    'INSERT OR UPDATE OR DELETE'),
      ('equipe_lideres',            'seguranca',    'equipe_lideranca', 'a liderança da equipe', '',                            '',                                'empresa_id', 'aviso',   'INSERT OR UPDATE OR DELETE'),
      ('equipe_operadores_clones',  'configuracao', 'equipe_clone',     'o clone de operador',   '',                            '',                                'empresa_id', 'info',    'INSERT OR UPDATE OR DELETE'),
      ('metas',                     'meta',         'meta',             'a meta',                'tipo',                        '',                                'empresa_id', 'aviso',   'INSERT OR UPDATE OR DELETE'),
      ('metas_config_mes',          'meta',         'meta_config',      'a configuração de metas','',                           '',                                'empresa_id', 'aviso',   'INSERT OR UPDATE OR DELETE'),
      ('metas_validacoes',          'meta',         'meta_validacao',   'a validação de meta',   '',                            '',                                'empresa_id', 'info',    'INSERT OR UPDATE OR DELETE'),
      ('direto_extra_config',       'configuracao', 'direto_extra',     'a regra Direto/Extra',  'escopo',                      '',                                'empresa_id', 'aviso',   'INSERT OR UPDATE OR DELETE'),
      ('modelos_mensagem',          'comunicacao',  'modelo_mensagem',  'o modelo de mensagem',  'nome',                        '',                                'empresa_id', 'info',    'INSERT OR UPDATE OR DELETE'),
      ('tags',                      'configuracao', 'tag',              'a tag',                 'nome',                        '',                                'empresa_id', 'info',    'INSERT OR UPDATE OR DELETE'),
      ('documentos_lgpd',           'configuracao', 'documento_lgpd',   'o documento LGPD',      'titulo,tipo',                 '',                                'empresa_id', 'aviso',   'INSERT OR UPDATE OR DELETE'),
      ('termos_uso',                'configuracao', 'termo_uso',        'o termo de uso',        '',                            '',                                'empresa_id', 'aviso',   'INSERT OR UPDATE OR DELETE'),
      ('pix_automatico_acordos',    'financeiro',   'pix_registro',     'o registro de Pix',     'nr_cliente,operador_nome',    '',                                'empresa_id', 'info',    'INSERT OR UPDATE OR DELETE'),
      ('pix_automatico_config',     'financeiro',   'pix_config',       'a configuração do Pix', '',                            '',                                'empresa_id', 'critico', 'INSERT OR UPDATE OR DELETE'),
      ('pix_automatico_metas',      'financeiro',   'pix_meta',         'a meta de Pix',         '',                            '',                                'empresa_id', 'aviso',   'INSERT OR UPDATE OR DELETE'),
      ('lixeira_pix_automatico',    'financeiro',   'pix_lixeira',      'o Pix na lixeira',      'nr_cliente',                  'dados_completos',                 'empresa_id', 'aviso',   'UPDATE OR DELETE'),
      ('solicitacoes_whatsapp',     'whatsapp',     'solicitacao_wpp',  'a solicitação',         'codigo_cliente,nome_cliente', '',                                'empresa_id', 'info',    'INSERT OR UPDATE OR DELETE'),
      ('ouvidoria_acessos',         'seguranca',    'ouvidoria_acesso', 'o acesso à ouvidoria',  'concedido_por_nome',          '',                                'empresa_id', 'critico', 'INSERT OR UPDATE OR DELETE'),
      ('ouvidoria_atendimentos',    'ouvidoria',    'ouvidoria_atend',  'o atendimento',         '',                            '',                                'empresa_id', 'aviso',   'INSERT OR UPDATE OR DELETE'),
      ('relatorio_validacoes_dia',  'importacao',   'relatorio_dia',    'a validação do dia',    '',                            '',                                'empresa_id', 'info',    'INSERT OR UPDATE OR DELETE'),
      ('composicao_mes',            'importacao',   'composicao_mes',   'a composição do mês',   '',                            '',                                'empresa_id', 'aviso',   'INSERT OR UPDATE OR DELETE'),
      ('campanha_facil_descontos',  'configuracao', 'campanha_desconto','o desconto de campanha','',                            '',                                'empresa_id', 'info',    'INSERT OR UPDATE OR DELETE'),
      ('comemoracoes',              'comunicacao',  'comemoracao',      'a comemoração',         '',                            '',                                'empresa_id', 'info',    'INSERT OR UPDATE OR DELETE')
    ) AS t(tabela, categoria, slug, alvo, cols_rotulo, ignorar, col_empresa, sev, eventos)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = r.tabela
    ) THEN
      RAISE NOTICE 'Logs 2.0: tabela % ausente — trigger de auditoria não criada.', r.tabela;
      CONTINUE;
    END IF;

    -- A coluna do tenant precisa existir, senão a trigger loga tudo sem empresa
    -- e `fn_log_registrar` descarta em silêncio.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = r.tabela AND column_name = r.col_empresa
    ) THEN
      RAISE NOTICE 'Logs 2.0: %.% sem coluna % — trigger não criada.', 'public', r.tabela, r.col_empresa;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_log_%1$s ON public.%1$I', r.tabela);
    -- `%8$s` sem quoting porque é a lista de eventos ('INSERT OR UPDATE OR
    -- DELETE'), que é sintaxe e não valor. Os valores todos vão por %L.
    EXECUTE format(
      'CREATE TRIGGER trg_log_%1$s AFTER %8$s ON public.%1$I '
      'FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(%2$L, %3$L, %4$L, %5$L, %6$L, %7$L, %9$L)',
      r.tabela, r.categoria, r.slug, r.alvo, r.cols_rotulo, r.ignorar, r.col_empresa,
      r.eventos, r.sev
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. LOGIN RECUSADO — o evento que só existe antes de haver sessão
-- ═══════════════════════════════════════════════════════════════════════════
-- Tentativa de login com senha errada é a informação de segurança mais básica
-- que existe, e é justamente a que o frontend não consegue gravar: sem sessão,
-- a política de INSERT recusa. Daí uma função SECURITY DEFINER chamável por
-- anônimo.
--
-- Ela é escrita para não virar vetor de lixo:
--   • Só grava se o usuário/e-mail informado EXISTIR. Nome inventado não cria
--     linha — senão qualquer um enche a tabela com um laço de requisições.
--   • Uma linha por usuário a cada 30 segundos. Quem está sob ataque de força
--     bruta vê o padrão sem receber 5 mil linhas idênticas; a contagem real da
--     rajada fica em `detalhes.tentativas_janela`.
--   • Nunca devolve se o usuário existe (retorna void). Não serve para
--     enumerar contas.
CREATE OR REPLACE FUNCTION public.fn_log_login_recusado(
  p_identificador TEXT,
  p_motivo        TEXT DEFAULT 'credenciais_invalidas'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id       UUID;
  v_nome     TEXT;
  v_empresa  UUID;
  v_recente  UUID;
  v_qtd      INT;
  v_ident    TEXT := left(btrim(COALESCE(p_identificador, '')), 200);
BEGIN
  IF v_ident = '' THEN
    RETURN;
  END IF;

  SELECT p.id, p.nome, p.empresa_id
    INTO v_id, v_nome, v_empresa
    FROM public.perfis p
   WHERE lower(p.usuario) = lower(v_ident)
      OR lower(p.email)   = lower(v_ident)
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;   -- não existe: nada a auditar, nada a revelar
  END IF;

  -- Janela de 30s: agrupa a rajada em vez de multiplicá-la.
  SELECT l.id, COALESCE((l.detalhes ->> 'tentativas_janela')::INT, 1)
    INTO v_recente, v_qtd
    FROM public.logs_sistema l
   WHERE l.acao = 'login_recusado'
     AND l.registro_id = v_id::TEXT
     AND l.criado_em > now() - interval '30 seconds'
   ORDER BY l.criado_em DESC
   LIMIT 1;

  IF v_recente IS NOT NULL THEN
    UPDATE public.logs_sistema
       SET detalhes = COALESCE(detalhes, '{}'::jsonb)
                      || jsonb_build_object('tentativas_janela', v_qtd + 1),
           severidade = CASE WHEN v_qtd + 1 >= 5 THEN 'critico' ELSE 'aviso' END,
           descricao  = 'Login recusado para ' || COALESCE(v_nome, v_ident)
                        || ' (' || (v_qtd + 1) || ' tentativas em menos de 1 minuto)'
     WHERE id = v_recente;
    RETURN;
  END IF;

  INSERT INTO public.logs_sistema (
    usuario_id, usuario_nome, empresa_id, acao, categoria, severidade,
    descricao, tabela, registro_id, alvo_tipo, alvo_rotulo,
    detalhes, origem, ip, user_agent
  ) VALUES (
    v_id, v_nome, v_empresa, 'login_recusado', 'autenticacao', 'aviso',
    'Login recusado para ' || COALESCE(v_nome, v_ident),
    'auth.users', v_id::TEXT, 'usuario', COALESCE(v_nome, v_ident),
    jsonb_build_object('motivo', p_motivo, 'identificador', v_ident, 'tentativas_janela', 1),
    'anon',
    public.fn_log_contexto('x-forwarded-for'),
    public.fn_log_contexto('user-agent')
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_log_login_recusado falhou: %', SQLERRM;
END $$;

COMMENT ON FUNCTION public.fn_log_login_recusado(TEXT, TEXT) IS
  'Registra tentativa de login recusada. Chamável por anônimo — só grava se o '
  'identificador existir, agrupa rajadas de 30s numa linha e nunca revela se a '
  'conta existe. Ver 20260812a.';

GRANT EXECUTE ON FUNCTION public.fn_log_login_recusado(TEXT, TEXT) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. fn_logs_resumo — os números da tela vêm do banco
-- ═══════════════════════════════════════════════════════════════════════════
-- A tela antiga carregava 200 linhas e não tinha número nenhum. Contar no
-- navegador só descreveria as 200 — "3 exclusões hoje" seria mentira quando
-- houve 300. Aqui os agregados saem de um SELECT sobre o filtro inteiro.
--
-- SECURITY INVOKER de propósito: a função é filtrada pelo RLS de quem chama, e
-- por isso um administrador não consegue somar a operação da outra empresa.
CREATE OR REPLACE FUNCTION public.fn_logs_resumo(
  p_empresa_id UUID        DEFAULT NULL,
  p_de         TIMESTAMPTZ DEFAULT NULL,
  p_ate        TIMESTAMPTZ DEFAULT NULL,
  p_categoria  TEXT        DEFAULT NULL,
  p_severidade TEXT        DEFAULT NULL,
  p_acao       TEXT        DEFAULT NULL,
  p_usuario_id UUID        DEFAULT NULL,
  p_tabela     TEXT        DEFAULT NULL,
  p_origem     TEXT        DEFAULT NULL,
  p_busca      TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT l.*
      FROM public.logs_sistema l
     WHERE (p_empresa_id IS NULL OR l.empresa_id = p_empresa_id)
       AND (p_de         IS NULL OR l.criado_em >= p_de)
       AND (p_ate        IS NULL OR l.criado_em <= p_ate)
       AND (p_categoria  IS NULL OR l.categoria = p_categoria)
       AND (p_severidade IS NULL OR l.severidade = p_severidade)
       AND (p_acao       IS NULL OR l.acao = p_acao)
       AND (p_usuario_id IS NULL OR l.usuario_id = p_usuario_id)
       AND (p_tabela     IS NULL OR l.tabela = p_tabela)
       AND (p_origem     IS NULL OR l.origem = p_origem)
       AND (
         p_busca IS NULL OR btrim(p_busca) = ''
         OR l.descricao    ILIKE '%' || p_busca || '%'
         OR l.alvo_rotulo  ILIKE '%' || p_busca || '%'
         OR l.usuario_nome ILIKE '%' || p_busca || '%'
         OR l.acao         ILIKE '%' || p_busca || '%'
         OR l.registro_id  ILIKE '%' || p_busca || '%'
       )
  )
  SELECT jsonb_build_object(
    'total',            (SELECT count(*)                        FROM base),
    'criticos',         (SELECT count(*) FROM base WHERE severidade = 'critico'),
    'avisos',           (SELECT count(*) FROM base WHERE severidade = 'aviso'),
    'exclusoes',        (SELECT count(*) FROM base WHERE acao LIKE '%_excluido%' OR acao LIKE '%exclu%'),
    'usuarios_ativos',  (SELECT count(DISTINCT usuario_id)      FROM base WHERE usuario_id IS NOT NULL),
    'automaticos',      (SELECT count(*) FROM base WHERE origem IN ('automatico', 'importacao')),
    'primeiro_em',      (SELECT min(criado_em)                  FROM base),
    'ultimo_em',        (SELECT max(criado_em)                  FROM base),

    'por_categoria', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT categoria AS chave, count(*) AS total
          FROM base GROUP BY categoria ORDER BY count(*) DESC
      ) x), '[]'::jsonb),

    'por_severidade', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT severidade AS chave, count(*) AS total
          FROM base GROUP BY severidade
      ) x), '[]'::jsonb),

    'por_acao', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT acao AS chave, count(*) AS total
          FROM base GROUP BY acao ORDER BY count(*) DESC LIMIT 12
      ) x), '[]'::jsonb),

    'por_usuario', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT COALESCE(usuario_nome, 'Sistema') AS chave,
               usuario_id                        AS id,
               count(*)                          AS total
          FROM base GROUP BY usuario_nome, usuario_id ORDER BY count(*) DESC LIMIT 8
      ) x), '[]'::jsonb),

    'por_tabela', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT COALESCE(tabela, '—') AS chave, count(*) AS total
          FROM base GROUP BY tabela ORDER BY count(*) DESC LIMIT 10
      ) x), '[]'::jsonb),

    -- Série diária no fuso de São Paulo: o gráfico tem de bater com o dia que
    -- a operação viveu, não com o dia UTC.
    'por_dia', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x ->> 'chave')) FROM (
        SELECT jsonb_build_object(
                 'chave', to_char((criado_em AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD'),
                 'total', count(*),
                 'criticos', count(*) FILTER (WHERE severidade = 'critico')
               ) AS x
          FROM base
         GROUP BY (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
      ) s), '[]'::jsonb),

    'por_hora', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x ->> 'chave')::INT) FROM (
        SELECT jsonb_build_object(
                 'chave', extract(hour FROM criado_em AT TIME ZONE 'America/Sao_Paulo')::INT,
                 'total', count(*)
               ) AS x
          FROM base
         GROUP BY extract(hour FROM criado_em AT TIME ZONE 'America/Sao_Paulo')
      ) s), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.fn_logs_resumo IS
  'Agregados da tela de Logs calculados sobre o filtro INTEIRO (não sobre a '
  'página carregada). SECURITY INVOKER: respeita o RLS de quem chama. '
  'Ver 20260812a.';

GRANT EXECUTE ON FUNCTION public.fn_logs_resumo(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT
) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. APPEND-ONLY + EXPURGO CONTROLADO
-- ═══════════════════════════════════════════════════════════════════════════
-- Um log que qualquer administrador pode editar ou apagar linha a linha não
-- serve como auditoria — é rascunho. A tabela passa a ser append-only de forma
-- explícita: sem política de UPDATE, sem política de DELETE, e um REVOKE para
-- que a ausência seja intenção declarada e não esquecimento.
--
-- Isto também conserta, de verdade, o "Limpar Logs" que respondia sucesso e
-- não apagava nada: apagar deixa de ser DELETE do PostgREST e passa a ser uma
-- função com regra — só super_admin, por idade, e ela mesma se registra.
REVOKE UPDATE, DELETE ON public.logs_sistema FROM authenticated;

DROP POLICY IF EXISTS "logs_sis_admin" ON public.logs_sistema;
CREATE POLICY "logs_sis_admin" ON public.logs_sistema
  FOR SELECT USING (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND public.fn_user_has_any_role(ARRAY['administrador'])
    )
  );

-- INSERT direto fica restrito a linhas em nome de quem está inserindo.
--
-- Antes a política aceitava qualquer `usuario_id`: qualquer autenticado podia
-- gravar um evento assinado por outra pessoa, o que esvazia a trilha como prova.
-- Agora o caminho normal do frontend é `fn_log_registrar` (SECURITY DEFINER, que
-- passa por cima desta política e resolve o autor pela sessão), e o INSERT
-- direto — que ainda existe para não quebrar chamadas legadas — só aceita a
-- própria autoria.
--
-- Os endpoints de servidor (`api/alterar-senha`, `api/impersonar-usuario`) usam
-- service_role e não passam por RLS; é por isso que eles conseguem registrar o
-- admin como autor sem ter sessão.
DROP POLICY IF EXISTS "logs_sis_insert" ON public.logs_sistema;
CREATE POLICY "logs_sis_insert" ON public.logs_sistema
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND usuario_id = auth.uid()
  );

COMMENT ON TABLE public.logs_sistema IS
  'Trilha de auditoria append-only. Escrita por fn_log_registrar (frontend e '
  'triggers) e por endpoints de servidor com service_role. Sem política de '
  'UPDATE nem de DELETE: para apagar existe fn_logs_expurgar, que só aceita '
  'super_admin, exige idade mínima e registra o próprio expurgo. Ver 20260812a.';

-- ─── Expurgo por idade ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_logs_expurgar(
  p_dias       INT  DEFAULT 180,
  p_empresa_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_super   BOOLEAN := public.fn_user_is_super_admin();
  v_minha   UUID    := public.fn_user_empresa_id();
  v_empresa UUID;
  v_corte   TIMESTAMPTZ;
  v_qtd     INT;
BEGIN
  IF NOT v_super THEN
    RAISE EXCEPTION 'Apenas super_admin pode expurgar logs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Piso de 30 dias. "Apagar tudo agora" é o pedido de quem quer esconder algo,
  -- e é exatamente o que uma trilha de auditoria não deve oferecer com um
  -- clique. Quem precisar de menos, faz no SQL Editor e deixa rastro lá.
  IF p_dias IS NULL OR p_dias < 30 THEN
    RAISE EXCEPTION 'Retenção mínima de 30 dias (pedido: % dias).', p_dias
      USING ERRCODE = 'check_violation';
  END IF;

  v_empresa := COALESCE(p_empresa_id, v_minha);
  v_corte   := now() - make_interval(days => p_dias);

  DELETE FROM public.logs_sistema
   WHERE criado_em < v_corte
     AND (v_empresa IS NULL OR empresa_id = v_empresa);
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  -- O expurgo é um evento de auditoria como qualquer outro — e, por ser
  -- destrutivo, dos mais importantes.
  PERFORM public.fn_log_registrar(
    p_acao        := 'logs_expurgados',
    p_categoria   := 'seguranca',
    p_severidade  := 'critico',
    p_descricao   := 'Expurgou ' || v_qtd || ' registro(s) de log com mais de '
                     || p_dias || ' dias',
    p_empresa_id  := v_empresa,
    p_tabela      := 'logs_sistema',
    p_alvo_tipo   := 'trilha de auditoria',
    p_detalhes    := jsonb_build_object(
                       'dias_retencao', p_dias,
                       'corte', v_corte,
                       'removidos', v_qtd
                     ),
    p_origem      := 'ui'
  );

  RETURN v_qtd;
END $$;

COMMENT ON FUNCTION public.fn_logs_expurgar(INT, UUID) IS
  'Único caminho de exclusão em logs_sistema: super_admin, idade mínima de 30 '
  'dias, e registra o próprio expurgo. Ver 20260812a.';

GRANT EXECUTE ON FUNCTION public.fn_logs_expurgar(INT, UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. ÍNDICES — um por filtro que a tela oferece
-- ═══════════════════════════════════════════════════════════════════════════
-- Todos com `empresa_id` na frente: nenhuma consulta da tela atravessa tenant
-- (o RLS não deixa), então o tenant é sempre o primeiro predicado.
CREATE INDEX IF NOT EXISTS idx_logs_empresa_criado
  ON public.logs_sistema (empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_logs_empresa_categoria_criado
  ON public.logs_sistema (empresa_id, categoria, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_logs_empresa_severidade_criado
  ON public.logs_sistema (empresa_id, severidade, criado_em DESC)
  WHERE severidade <> 'info';
CREATE INDEX IF NOT EXISTS idx_logs_empresa_acao_criado
  ON public.logs_sistema (empresa_id, acao, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_logs_empresa_usuario_criado
  ON public.logs_sistema (empresa_id, usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_logs_empresa_tabela_criado
  ON public.logs_sistema (empresa_id, tabela, criado_em DESC);
-- "Todo o histórico deste acordo": entra pelo registro, não pela empresa.
CREATE INDEX IF NOT EXISTS idx_logs_registro
  ON public.logs_sistema (registro_id, criado_em DESC)
  WHERE registro_id IS NOT NULL;
-- "Quem mexeu no campo valor": campos é TEXT[], então GIN.
CREATE INDEX IF NOT EXISTS idx_logs_campos
  ON public.logs_sistema USING GIN (campos);

-- Busca livre por texto. Só se pg_trgm entrou na seção 0.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_logs_descricao_trgm
      ON public.logs_sistema USING GIN (descricao gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_logs_alvo_rotulo_trgm
      ON public.logs_sistema USING GIN (alvo_rotulo gin_trgm_ops);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. BACKFILL — o histórico que já existe entra no vocabulário novo
-- ═══════════════════════════════════════════════════════════════════════════
-- As linhas antigas têm ação em três dialetos ('INSERT', 'exclusao_acordo',
-- 'TRANSFERENCIA_ANALITICO'). Sem normalizar, a tela precisaria conhecer os
-- três para sempre, e o filtro por ação mostraria a mesma coisa duas vezes.
--
-- Reescrever um livro de auditoria pede cuidado: a ação original fica guardada
-- em `detalhes.acao_original`. Nada é perdido, só traduzido.
UPDATE public.logs_sistema l
   SET usuario_nome  = COALESCE(l.usuario_nome, p.nome),
       usuario_email = COALESCE(l.usuario_email, p.email),
       usuario_cargo = COALESCE(l.usuario_cargo, p.perfil)
  FROM public.perfis p
 WHERE p.id = l.usuario_id
   AND l.usuario_nome IS NULL;

UPDATE public.logs_sistema
   SET detalhes = COALESCE(detalhes, '{}'::jsonb)
                  || jsonb_build_object('acao_original', acao),
       acao = CASE acao
                WHEN 'INSERT'                  THEN 'registro_criado'
                WHEN 'UPDATE'                  THEN 'registro_alterado'
                WHEN 'DELETE'                  THEN 'registro_excluido'
                WHEN 'LOGIN'                   THEN 'login'
                WHEN 'exclusao_acordo'         THEN 'acordo_excluido'
                WHEN 'envio_lembrete_whatsapp' THEN 'whatsapp_lembrete_enviado'
                WHEN 'troca_extra'             THEN 'acordo_extra_trocado'
                WHEN 'TRANSFERENCIA_ANALITICO' THEN 'acordo_transferido'
                ELSE acao
              END
 WHERE acao IN ('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'exclusao_acordo',
                'envio_lembrete_whatsapp', 'troca_extra', 'TRANSFERENCIA_ANALITICO')
   AND NOT COALESCE(detalhes ? 'acao_original', false);

-- Categoria, severidade e origem por ação já normalizada.
UPDATE public.logs_sistema
   SET categoria = CASE
         WHEN acao LIKE 'acordo%'      THEN 'acordo'
         WHEN acao LIKE 'whatsapp%'    THEN 'whatsapp'
         WHEN acao LIKE 'login%'       THEN 'autenticacao'
         WHEN acao LIKE 'impersonar%'  THEN 'seguranca'
         WHEN acao = 'senha_redefinida' THEN 'seguranca'
         WHEN tabela = 'acordos'       THEN 'acordo'
         WHEN tabela = 'perfis'        THEN 'usuario'
         ELSE 'sistema'
       END,
       severidade = CASE
         WHEN acao LIKE '%exclu%'       THEN 'aviso'
         WHEN acao LIKE 'impersonar%'   THEN 'critico'
         WHEN acao = 'senha_redefinida' THEN 'critico'
         ELSE 'info'
       END,
       origem = CASE WHEN usuario_id IS NULL THEN 'automatico' ELSE 'ui' END
 WHERE categoria = 'sistema' AND severidade = 'info';

-- Frase pronta para o histórico antigo, que nasceu sem nenhuma. O `detalhes`
-- de cada dialeto tinha campos diferentes; COALESCE cobre os que existiam.
UPDATE public.logs_sistema
   SET descricao = CASE acao
         WHEN 'acordo_excluido' THEN
           'Excluiu o acordo '
           || COALESCE('NR ' || (detalhes ->> 'nr_cliente'), '')
           || COALESCE(' — ' || (detalhes ->> 'nome_cliente'), '')
           || CASE WHEN detalhes ->> 'modo' = 'lote' THEN ' (exclusão em lote)' ELSE '' END
         WHEN 'whatsapp_lembrete_enviado' THEN
           'Enviou lembrete de WhatsApp'
           || COALESCE(' para ' || (detalhes ->> 'nome_cliente'), '')
           || COALESCE(' (NR ' || (detalhes ->> 'nr_cliente') || ')', '')
         WHEN 'acordo_extra_trocado' THEN
           'Trocou o Extra'
           || COALESCE(' do NR ' || (detalhes ->> 'nr'), '')
           || COALESCE(' — autorizado por ' || (detalhes ->> 'aprovado_por'), '')
         WHEN 'acordo_transferido' THEN
           'Transferiu um acordo divergente do analítico'
         WHEN 'impersonar_inicio' THEN
           'Entrou como ' || COALESCE(detalhes ->> 'alvo_nome', 'outro usuário')
         WHEN 'impersonar_fim' THEN
           'Saiu do modo "entrar como"'
         WHEN 'senha_redefinida' THEN
           'Redefiniu a senha de ' || COALESCE(detalhes ->> 'alvo_nome', 'um usuário')
         WHEN 'login' THEN 'Entrou no sistema'
         ELSE NULL
       END,
       alvo_tipo = CASE
         WHEN acao LIKE 'acordo%' OR acao = 'whatsapp_lembrete_enviado' THEN 'acordo'
         WHEN acao LIKE 'impersonar%' OR acao IN ('login', 'senha_redefinida') THEN 'usuario'
         ELSE alvo_tipo
       END,
       alvo_rotulo = COALESCE(
         alvo_rotulo,
         NULLIF(btrim(
           COALESCE('NR ' || (detalhes ->> 'nr_cliente'), COALESCE('NR ' || (detalhes ->> 'nr'), ''))
           || COALESCE(' — ' || (detalhes ->> 'nome_cliente'), '')
         ), ''),
         detalhes ->> 'alvo_nome'
       )
 WHERE descricao IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. REALTIME — o botão "ao vivo" da tela depende disto
-- ═══════════════════════════════════════════════════════════════════════════
-- Sem a tabela na publicação, o canal do frontend conecta, não recebe nada, e o
-- botão "Ao vivo" fica ligado sem nunca mostrar um evento — falha silenciosa, a
-- pior espécie.
--
-- O RLS continua valendo no realtime: cada administrador só recebe as linhas da
-- própria empresa, e quem não tem a política de SELECT não recebe nada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'logs_sistema'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.logs_sistema;
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- Banco local sem a publicação da Supabase: a tela funciona, só sem "ao vivo".
  RAISE NOTICE 'Publicação supabase_realtime ausente — "ao vivo" da tela de Logs ficará inerte.';
END $$;

-- ─── Sanidade ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_triggers INT;
  v_linhas   INT;
BEGIN
  SELECT count(*) INTO v_triggers
    FROM pg_trigger t
    JOIN pg_proc  p ON p.oid = t.tgfoid
   WHERE p.proname = 'fn_log_auditoria' AND NOT t.tgisinternal;

  SELECT count(*) INTO v_linhas FROM public.logs_sistema;

  RAISE NOTICE 'Logs 2.0 aplicado: % tabelas auditadas por trigger, % linhas na trilha.',
    v_triggers, v_linhas;
END $$;
