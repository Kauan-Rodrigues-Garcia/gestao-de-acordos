-- ============================================================================
-- 20261022153000_cantina.sql
--
-- Cantina no gestão, fases 1 e 2 (pedido de 22/10/2026). Spec:
-- docs/superpowers/specs/2026-10-22-cantina-fases-1-e-2-design.md
--
-- O colaborador monta o pedido no cardápio, escolhe a faixa de retirada e
-- acompanha; a cantina recebe a fila do dia, conversa no pedido e marca
-- pronto, retirado ou «não retirado» (o que não foi buscado é cobrado em folha).
--
-- ## Quem é a cantina
--
-- Empresa PRÓPRIA (`produto = 'cantina'`), com cargo `cantina`. O menu é lista
-- branca por produto, então quem é da cantina só enxerga o que for marcado
-- `cantina` — nada da cobrança, nem o chat interno. Decisão do Cleber.
--
-- O acesso é por chave, como todo o resto:
--   ver_cantina      a aba de pedir. Nasce para todos os cargos da operação.
--   cantina_painel   a fila. Só o cargo `cantina` na empresa Cantina (e o
--                    acesso total por construção).
--
-- ## Onde mora a regra
--
-- Tudo nas funções abaixo, nunca na tela: janela do item, faixa de retirada,
-- prazo de cancelamento e PREÇO — o total sai do cadastro, o navegador só diz
-- qual item e quantos. As tabelas não têm acesso direto de `authenticated`.
--
-- ## Tempo real
--
-- Mesmo molde de `acordos_pelo_sinal` (20261009220000): gatilho por COMANDO,
-- Broadcast só com ids, canal privado. A tela relê pela função de sempre.
--
--   cantina-pessoa:<perfil_id>   o dono (fn_realtime_posso_ouvir_usuario)
--   cantina-fila:hoje            quem tem cantina_painel
--
-- Nenhuma tabela entra na publicação do Postgres Changes.
--
-- «Pedido pronto» e «mensagem da cantina» também viram linha em `notificacoes`:
-- o sino, o card e o som já existentes chegam em qualquer tela.
--
-- ## O que este arquivo faz
--
--   - aceita o produto `cantina`, cria a empresa Cantina e o cargo `cantina`;
--   - soma 2 chaves ao catálogo e semeia as empresas;
--   - cria 5 tabelas, 2 gatilhos de sinal, 2 policies em realtime.messages e
--     11 funções;
--   - carrega o cardápio do print (12 itens) e a configuração inicial.
--
-- Nenhuma linha existente muda, fora o mapa de permissões (só chave ausente).
-- Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. Produto, empresa e cargo
-- ============================================================================

ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_produto_conhecido;
ALTER TABLE public.empresas
  ADD CONSTRAINT empresas_produto_conhecido
  CHECK (produto IN ('cobranca', 'comercial', 'rh', 'cantina'));

INSERT INTO public.cargos
  (slug, nome, nivel, ordem, pertence_a_setor, exige_tipo_setor,
   acesso_total, conta_no_recebimento, lidera_equipe, ativo)
VALUES
  ('cantina', 'Cantina', NULL,
   COALESCE((SELECT MAX(ordem) FROM public.cargos), 0) + 1,
   FALSE, NULL, FALSE, FALSE, FALSE, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 2. Catálogo de permissões
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_cantina_20261022()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_cantina_20261022;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_cantina_20261022() IS
  'Retrato do catalogo antes das chaves da Cantina (22/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_cantina_20261022()
  UNION ALL
  SELECT * FROM (VALUES
    -- Pedir na cantina: todo mundo que trabalha na operação.
    ('ver_cantina',    NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm']::TEXT[], false),
    -- A fila da cantina: só o cargo dela, ligado abaixo na empresa Cantina.
    ('cantina_painel', NULL::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261022153000 soma ver_cantina e cantina_painel.';

-- A empresa nasce depois do catálogo: o gatilho de empresa nova a semeia.
INSERT INTO public.empresas (nome, slug, produto, ativo)
VALUES ('Cantina', 'cantina', 'cantina', TRUE)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- `rh` fica fora da semeadura (o mapa dele nasce vazio de propósito, ver
-- 20260825170000). Pedir lanche não é acesso a dado de ninguém: a chave entra
-- onde ainda não foi decidida.
UPDATE public.cargos_permissoes
   SET permissoes = permissoes || '{"ver_cantina": true}'::JSONB
 WHERE cargo = 'rh'
   AND NOT (permissoes ? 'ver_cantina');

-- O mapa do cargo da cantina, na empresa dela: só a fila.
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes)
SELECT e.id, 'cantina', '{"cantina_painel": true, "ver_cantina": false}'::JSONB
  FROM public.empresas e
 WHERE e.slug = 'cantina'
ON CONFLICT (empresa_id, cargo) DO UPDATE
  SET permissoes = public.cargos_permissoes.permissoes
                   || '{"cantina_painel": true, "ver_cantina": false}'::JSONB;

-- ============================================================================
-- 3. As tabelas
-- ============================================================================

-- Configuração: uma linha só.
CREATE TABLE IF NOT EXISTS public.cantina_config (
  id                BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  aberta            BOOLEAN  NOT NULL DEFAULT TRUE,
  aviso_titulo      TEXT,
  aviso_texto       TEXT,
  -- Minutos entre o pedido e a primeira faixa de retirada possível.
  preparo_min       SMALLINT NOT NULL DEFAULT 15 CHECK (preparo_min BETWEEN 0 AND 240),
  -- Quem pediu cancela até X minutos antes da retirada.
  cancelamento_min  SMALLINT NOT NULL DEFAULT 15 CHECK (cancelamento_min BETWEEN 0 AND 240),
  -- Tamanho da faixa de retirada.
  faixa_min         SMALLINT NOT NULL DEFAULT 15 CHECK (faixa_min IN (5, 10, 15, 20, 30, 60)),
  abre_as           TIME     NOT NULL DEFAULT '07:00',
  fecha_as          TIME     NOT NULL DEFAULT '17:00',
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cantina_config_horario CHECK (abre_as < fecha_as),
  CONSTRAINT cantina_config_textos CHECK (
    char_length(COALESCE(aviso_titulo, '')) <= 80
    AND char_length(COALESCE(aviso_texto, '')) <= 400)
);

COMMENT ON TABLE public.cantina_config IS
  'Configuracao da cantina (linha unica): aberta, aviso do dia, preparo, prazo '
  'de cancelamento, faixa e horario. Ver 20261022153000.';

-- O cardápio.
CREATE TABLE IF NOT EXISTS public.cantina_itens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- O número do cardápio antigo (8, 9, 50…). É como o balcão chama o item.
  codigo       INTEGER NOT NULL UNIQUE CHECK (codigo > 0),
  nome         TEXT    NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 60),
  descricao    TEXT    CHECK (char_length(descricao) <= 300),
  ingredientes TEXT[]  NOT NULL DEFAULT '{}',
  preco        NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  foto_url     TEXT,
  categoria    TEXT    NOT NULL DEFAULT 'outros'
               CHECK (categoria IN ('lanches', 'bebidas', 'doces', 'salgados', 'refeicoes', 'outros')),
  ordem        INTEGER NOT NULL DEFAULT 0,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  -- Janela para FAZER o pedido deste item. Nula = o horário da cantina.
  pedido_de    TIME,
  pedido_ate   TIME,
  -- Escolha obrigatória de uma opção (sabor). Vazio = sem escolha.
  opcoes       TEXT[]  NOT NULL DEFAULT '{}',
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cantina_itens_janela CHECK (
    (pedido_de IS NULL AND pedido_ate IS NULL)
    OR (pedido_de IS NOT NULL AND pedido_ate IS NOT NULL AND pedido_de < pedido_ate))
);

COMMENT ON TABLE public.cantina_itens IS
  'Cardapio da cantina. pedido_de/pedido_ate e a janela para FAZER o pedido do '
  'item. opcoes = escolha obrigatoria (sabor). Ver 20261022153000.';

-- O pedido.
CREATE TABLE IF NOT EXISTS public.cantina_pedidos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Dia (horário de Brasília) e o número dentro dele: «pedido #12».
  dia               DATE    NOT NULL,
  numero            INTEGER NOT NULL,
  -- Quem pediu. Pessoa excluída do sistema deixa o pedido de pé (o nome fica
  -- no retrato abaixo): o mês continua fechando para o desconto em folha.
  perfil_id         UUID    REFERENCES public.perfis(id) ON DELETE SET NULL,
  -- Retrato de quem pediu, no momento do pedido.
  nome              TEXT    NOT NULL,
  empresa_id        UUID    REFERENCES public.empresas(id) ON DELETE SET NULL,
  empresa_nome      TEXT,
  setor_nome        TEXT,
  retirada_em       TIMESTAMPTZ NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'novo'
                    CHECK (status IN ('novo', 'preparando', 'pronto', 'retirado', 'nao_retirado', 'cancelado')),
  total             NUMERIC(10,2) NOT NULL CHECK (total >= 0),
  observacao        TEXT    CHECK (char_length(observacao) <= 300),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  preparando_em     TIMESTAMPTZ,
  pronto_em         TIMESTAMPTZ,
  encerrado_em      TIMESTAMPTZ,
  encerrado_por     UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  motivo_cancelamento TEXT CHECK (char_length(motivo_cancelamento) <= 300),
  cancelado_pela_cantina BOOLEAN NOT NULL DEFAULT FALSE,
  -- Até quando cada lado leu a conversa.
  lido_cliente_em   TIMESTAMPTZ,
  lido_cantina_em   TIMESTAMPTZ,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cantina_pedidos_numero_do_dia UNIQUE (dia, numero)
);

CREATE INDEX IF NOT EXISTS cantina_pedidos_dia_idx    ON public.cantina_pedidos (dia, retirada_em);
CREATE INDEX IF NOT EXISTS cantina_pedidos_perfil_idx ON public.cantina_pedidos (perfil_id, dia DESC);

COMMENT ON TABLE public.cantina_pedidos IS
  'Pedidos da cantina. Guarda retrato de quem pediu (nome, empresa, setor). '
  'nao_retirado continua cobrado em folha. Escrita so pelas funcoes fn_cantina_*. '
  'Ver 20261022153000.';

CREATE TABLE IF NOT EXISTS public.cantina_pedido_itens (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id   UUID    NOT NULL REFERENCES public.cantina_pedidos(id) ON DELETE CASCADE,
  item_id     UUID    REFERENCES public.cantina_itens(id) ON DELETE SET NULL,
  -- Retrato do item: preço novo não muda pedido velho.
  codigo      INTEGER,
  nome        TEXT    NOT NULL,
  preco       NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  quantidade  SMALLINT NOT NULL CHECK (quantidade BETWEEN 1 AND 20),
  opcao       TEXT,
  observacao  TEXT CHECK (char_length(observacao) <= 140)
);

CREATE INDEX IF NOT EXISTS cantina_pedido_itens_pedido_idx ON public.cantina_pedido_itens (pedido_id);

CREATE TABLE IF NOT EXISTS public.cantina_mensagens (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id  UUID NOT NULL REFERENCES public.cantina_pedidos(id) ON DELETE CASCADE,
  autor_id   UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  lado       TEXT NOT NULL CHECK (lado IN ('cliente', 'cantina', 'sistema')),
  texto      TEXT NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 500),
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cantina_mensagens_pedido_idx ON public.cantina_mensagens (pedido_id, id);

-- Sem acesso direto: tudo passa pelas funções.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cantina_config', 'cantina_itens', 'cantina_pedidos',
                           'cantina_pedido_itens', 'cantina_mensagens'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- ============================================================================
-- 4. Funções de apoio
-- ============================================================================

-- O relógio da cantina. Existe para o teste poder trocá-lo.
CREATE OR REPLACE FUNCTION public.fn_cantina_agora()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$ SELECT now() $function$;

REVOKE ALL ON FUNCTION public.fn_cantina_agora() FROM PUBLIC, anon, authenticated;

-- Um pedido com os itens, como as telas leem.
CREATE OR REPLACE FUNCTION public.fn_cantina_pedido_json(p_pedido public.cantina_pedidos, p_lado TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'id',            p_pedido.id,
    'dia',           p_pedido.dia,
    'numero',        p_pedido.numero,
    'perfil_id',     p_pedido.perfil_id,
    'nome',          p_pedido.nome,
    'empresa_nome',  p_pedido.empresa_nome,
    'setor_nome',    p_pedido.setor_nome,
    'retirada_em',   p_pedido.retirada_em,
    'status',        p_pedido.status,
    'total',         p_pedido.total,
    'observacao',    p_pedido.observacao,
    'criado_em',     p_pedido.criado_em,
    'preparando_em', p_pedido.preparando_em,
    'pronto_em',     p_pedido.pronto_em,
    'encerrado_em',  p_pedido.encerrado_em,
    'motivo_cancelamento',    p_pedido.motivo_cancelamento,
    'cancelado_pela_cantina', p_pedido.cancelado_pela_cantina,
    'itens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'codigo', i.codigo, 'nome', i.nome, 'preco', i.preco,
               'quantidade', i.quantidade, 'opcao', i.opcao, 'observacao', i.observacao)
             ORDER BY i.id)
        FROM public.cantina_pedido_itens i
       WHERE i.pedido_id = p_pedido.id), '[]'::JSONB),
    -- Mensagens do OUTRO lado que ainda não foram lidas por quem pergunta.
    'nao_lidas', (
      SELECT COUNT(*)
        FROM public.cantina_mensagens m
       WHERE m.pedido_id = p_pedido.id
         AND m.lado = CASE WHEN p_lado = 'cantina' THEN 'cliente' ELSE 'cantina' END
         AND m.criado_em > COALESCE(
               CASE WHEN p_lado = 'cantina' THEN p_pedido.lido_cantina_em ELSE p_pedido.lido_cliente_em END,
               '-infinity'::TIMESTAMPTZ))
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_cantina_pedido_json(public.cantina_pedidos, TEXT) FROM PUBLIC, anon, authenticated;

-- Mensagem automática do sistema na conversa do pedido.
CREATE OR REPLACE FUNCTION public.fn_cantina_registrar(p_pedido UUID, p_texto TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  INSERT INTO public.cantina_mensagens (pedido_id, autor_id, lado, texto)
  VALUES (p_pedido, NULL, 'sistema', p_texto);
$function$;

REVOKE ALL ON FUNCTION public.fn_cantina_registrar(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Avisa o dono do pedido pelo sino do sistema.
CREATE OR REPLACE FUNCTION public.fn_cantina_notificar(p_pedido public.cantina_pedidos, p_titulo TEXT, p_mensagem TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, rota, autor_nome)
  VALUES (p_pedido.perfil_id, p_pedido.empresa_id, p_titulo, p_mensagem,
          '/cantina?pedido=' || p_pedido.id::TEXT, 'Cantina');
$function$;

REVOKE ALL ON FUNCTION public.fn_cantina_notificar(public.cantina_pedidos, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. O colaborador
-- ============================================================================

-- O cardápio, a configuração e a hora do servidor (a tela calcula as faixas
-- com ela, e não com o relógio do computador).
CREATE OR REPLACE FUNCTION public.fn_cantina_cardapio()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cfg public.cantina_config;
BEGIN
  IF NOT ((SELECT public.fn_user_tem('ver_cantina')) OR (SELECT public.fn_user_tem('cantina_painel'))) THEN
    RAISE EXCEPTION 'Sem acesso à cantina.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cfg FROM public.cantina_config WHERE id;

  RETURN jsonb_build_object(
    'agora', public.fn_cantina_agora(),
    'config', jsonb_build_object(
      'aberta',           COALESCE(v_cfg.aberta, FALSE),
      'aviso_titulo',     v_cfg.aviso_titulo,
      'aviso_texto',      v_cfg.aviso_texto,
      'preparo_min',      COALESCE(v_cfg.preparo_min, 15),
      'cancelamento_min', COALESCE(v_cfg.cancelamento_min, 15),
      'faixa_min',        COALESCE(v_cfg.faixa_min, 15),
      'abre_as',          to_char(COALESCE(v_cfg.abre_as, '07:00'::TIME), 'HH24:MI'),
      'fecha_as',         to_char(COALESCE(v_cfg.fecha_as, '17:00'::TIME), 'HH24:MI')),
    'itens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', i.id, 'codigo', i.codigo, 'nome', i.nome, 'descricao', i.descricao,
               'ingredientes', to_jsonb(i.ingredientes), 'preco', i.preco, 'foto_url', i.foto_url,
               'categoria', i.categoria, 'opcoes', to_jsonb(i.opcoes),
               'pedido_de',  to_char(i.pedido_de,  'HH24:MI'),
               'pedido_ate', to_char(i.pedido_ate, 'HH24:MI'))
             ORDER BY i.ordem, i.codigo)
        FROM public.cantina_itens i
       WHERE i.ativo), '[]'::JSONB)
  );
END;
$function$;

-- Faz o pedido.
--   p_itens: [{ "item_id": uuid, "quantidade": int, "opcao": text?, "observacao": text? }]
--   p_hora:  'HH:MM' de hoje, em horário de Brasília, na grade de faixas.
CREATE OR REPLACE FUNCTION public.fn_cantina_fazer_pedido(p_itens JSONB, p_hora TEXT, p_observacao TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid       UUID := (SELECT auth.uid());
  v_cfg       public.cantina_config;
  v_agora     TIMESTAMPTZ := public.fn_cantina_agora();
  v_local     TIMESTAMP := v_agora AT TIME ZONE 'America/Sao_Paulo';
  v_dia       DATE := v_local::DATE;
  v_hora      TIME;
  v_retirada  TIMESTAMP;
  v_linha     JSONB;
  v_item      public.cantina_itens;
  v_qtd       INTEGER;
  v_opcao     TEXT;
  v_total     NUMERIC(10,2) := 0;
  v_validos   JSONB := '[]'::JSONB;
  v_numero    INTEGER;
  v_pedido    public.cantina_pedidos;
  v_perfil    RECORD;
BEGIN
  IF v_uid IS NULL OR NOT (SELECT public.fn_user_tem('ver_cantina')) THEN
    RAISE EXCEPTION 'Sem acesso à cantina.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cfg FROM public.cantina_config WHERE id;
  IF NOT COALESCE(v_cfg.aberta, FALSE) THEN
    RAISE EXCEPTION 'A cantina não está recebendo pedidos agora.';
  END IF;

  IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'O pedido está vazio.';
  END IF;
  IF jsonb_array_length(p_itens) > 30 THEN
    RAISE EXCEPTION 'Itens demais num pedido só.';
  END IF;

  -- A faixa de retirada.
  BEGIN
    v_hora := p_hora::TIME;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Horário de retirada inválido.';
  END;
  IF EXTRACT(SECOND FROM v_hora) <> 0
     OR (EXTRACT(HOUR FROM v_hora) * 60 + EXTRACT(MINUTE FROM v_hora))::INTEGER % v_cfg.faixa_min <> 0 THEN
    RAISE EXCEPTION 'Escolha uma das faixas de retirada.';
  END IF;
  IF v_hora < v_cfg.abre_as OR v_hora > v_cfg.fecha_as THEN
    RAISE EXCEPTION 'A cantina retira pedidos das % às %.',
      to_char(v_cfg.abre_as, 'HH24:MI'), to_char(v_cfg.fecha_as, 'HH24:MI');
  END IF;
  v_retirada := v_dia + v_hora;
  IF v_retirada < v_local + make_interval(mins => v_cfg.preparo_min) THEN
    RAISE EXCEPTION 'Esse horário já passou ou está perto demais. Escolha a partir de %.',
      to_char(v_local + make_interval(mins => v_cfg.preparo_min), 'HH24:MI');
  END IF;

  -- Quem pede, em retrato.
  SELECT p.nome, p.empresa_id, e.nome AS empresa_nome, s.nome AS setor_nome
    INTO v_perfil
    FROM public.perfis p
    LEFT JOIN public.empresas e ON e.id = p.empresa_id
    LEFT JOIN public.setores  s ON s.id = p.setor_id
   WHERE p.id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado.';
  END IF;

  -- Primeiro confere tudo e soma; só depois grava. Assim o pedido nasce com o
  -- total certo, num INSERT só — e o aviso de tempo real sai uma vez.
  FOR v_linha IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    SELECT * INTO v_item FROM public.cantina_itens
     WHERE id = NULLIF(v_linha ->> 'item_id', '')::UUID AND ativo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Um dos itens saiu do cardápio. Atualize a página.';
    END IF;

    v_qtd := COALESCE((v_linha ->> 'quantidade')::INTEGER, 0);
    IF v_qtd < 1 OR v_qtd > 20 THEN
      RAISE EXCEPTION 'Quantidade inválida em %.', v_item.nome;
    END IF;

    IF v_item.pedido_de IS NOT NULL
       AND (v_local::TIME < v_item.pedido_de OR v_local::TIME > v_item.pedido_ate) THEN
      RAISE EXCEPTION '% só pode ser pedido das % às %.', v_item.nome,
        to_char(v_item.pedido_de, 'HH24:MI'), to_char(v_item.pedido_ate, 'HH24:MI');
    END IF;

    v_opcao := NULLIF(btrim(v_linha ->> 'opcao'), '');
    IF cardinality(v_item.opcoes) > 0 THEN
      IF v_opcao IS NULL OR NOT (v_opcao = ANY(v_item.opcoes)) THEN
        RAISE EXCEPTION 'Escolha a opção de %.', v_item.nome;
      END IF;
    ELSE
      v_opcao := NULL;
    END IF;

    v_validos := v_validos || jsonb_build_object(
      'item_id', v_item.id, 'codigo', v_item.codigo, 'nome', v_item.nome,
      'preco', v_item.preco, 'quantidade', v_qtd, 'opcao', v_opcao,
      'observacao', left(NULLIF(btrim(v_linha ->> 'observacao'), ''), 140));
    v_total := v_total + v_item.preco * v_qtd;
  END LOOP;

  -- O número do dia. A trava é por dia: dois pedidos no mesmo segundo não
  -- pegam o mesmo número.
  PERFORM pg_advisory_xact_lock(hashtext('cantina_numero:' || v_dia::TEXT));
  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
    FROM public.cantina_pedidos WHERE dia = v_dia;

  INSERT INTO public.cantina_pedidos
    (dia, numero, perfil_id, nome, empresa_id, empresa_nome, setor_nome,
     retirada_em, status, total, observacao)
  VALUES
    (v_dia, v_numero, v_uid, v_perfil.nome, v_perfil.empresa_id, v_perfil.empresa_nome,
     v_perfil.setor_nome, v_retirada AT TIME ZONE 'America/Sao_Paulo', 'novo', v_total,
     left(NULLIF(btrim(p_observacao), ''), 300))
  RETURNING * INTO v_pedido;

  INSERT INTO public.cantina_pedido_itens
    (pedido_id, item_id, codigo, nome, preco, quantidade, opcao, observacao)
  SELECT v_pedido.id, (l ->> 'item_id')::UUID, (l ->> 'codigo')::INTEGER, l ->> 'nome',
         (l ->> 'preco')::NUMERIC, (l ->> 'quantidade')::SMALLINT, l ->> 'opcao', l ->> 'observacao'
    FROM jsonb_array_elements(v_validos) WITH ORDINALITY AS t(l, n)
   ORDER BY n;

  PERFORM public.fn_cantina_registrar(v_pedido.id, 'Pedido recebido pela cantina.');

  RETURN public.fn_cantina_pedido_json(v_pedido, 'cliente');
END;
$function$;

-- Os pedidos de quem pergunta: os de hoje e os dos últimos 30 dias.
CREATE OR REPLACE FUNCTION public.fn_cantina_meus_pedidos()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_dia DATE := (public.fn_cantina_agora() AT TIME ZONE 'America/Sao_Paulo')::DATE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(public.fn_cantina_pedido_json(p, 'cliente') ORDER BY p.dia DESC, p.retirada_em DESC)
      FROM public.cantina_pedidos p
     WHERE p.id IN (SELECT q.id FROM public.cantina_pedidos q
                     WHERE q.perfil_id = v_uid AND q.dia >= v_dia - 30
                     ORDER BY q.dia DESC, q.retirada_em DESC
                     LIMIT 60)
  ), '[]'::JSONB);
END;
$function$;

-- De que lado quem chama está falando: `cliente` (o dono do pedido) ou
-- `cantina` (quem tem a fila). A tela diz; o banco confere. Explícito porque a
-- mesma pessoa pode ser os dois — o super_admin testando pede e atende.
CREATE OR REPLACE FUNCTION public.fn_cantina_lado(p_pedido public.cantina_pedidos, p_lado TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_lado = 'cliente' AND p_pedido.perfil_id = (SELECT auth.uid()) THEN
    RETURN 'cliente';
  END IF;
  IF p_lado = 'cantina' AND (SELECT public.fn_user_tem('cantina_painel')) THEN
    RETURN 'cantina';
  END IF;
  RAISE EXCEPTION 'Pedido não encontrado.';
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cantina_lado(public.cantina_pedidos, TEXT) FROM PUBLIC, anon, authenticated;

-- Cancela. Quem pediu: até X min antes, enquanto novo ou preparando. A cantina:
-- a qualquer hora antes de encerrar, com motivo.
CREATE OR REPLACE FUNCTION public.fn_cantina_cancelar(p_pedido UUID, p_lado TEXT, p_motivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid     UUID := (SELECT auth.uid());
  v_pedido  public.cantina_pedidos;
  v_cfg     public.cantina_config;
  v_motivo  TEXT := left(NULLIF(btrim(p_motivo), ''), 300);
BEGIN
  SELECT * INTO v_pedido FROM public.cantina_pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  PERFORM public.fn_cantina_lado(v_pedido, p_lado);
  IF v_pedido.status NOT IN ('novo', 'preparando', 'pronto') THEN
    RAISE EXCEPTION 'Este pedido já foi encerrado.';
  END IF;

  IF p_lado = 'cliente' THEN
    SELECT * INTO v_cfg FROM public.cantina_config WHERE id;
    IF v_pedido.status = 'pronto' THEN
      RAISE EXCEPTION 'O pedido já está pronto e não pode mais ser cancelado.';
    END IF;
    IF public.fn_cantina_agora() > v_pedido.retirada_em - make_interval(mins => COALESCE(v_cfg.cancelamento_min, 15)) THEN
      RAISE EXCEPTION 'Cancelamento só até % minutos antes da retirada.', COALESCE(v_cfg.cancelamento_min, 15);
    END IF;

    UPDATE public.cantina_pedidos
       SET status = 'cancelado', encerrado_em = now(), encerrado_por = v_uid,
           motivo_cancelamento = v_motivo, cancelado_pela_cantina = FALSE, atualizado_em = now()
     WHERE id = p_pedido
    RETURNING * INTO v_pedido;
    PERFORM public.fn_cantina_registrar(p_pedido, 'Pedido cancelado por quem pediu.');
    RETURN public.fn_cantina_pedido_json(v_pedido, 'cliente');
  END IF;

  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Diga o motivo do cancelamento.';
  END IF;

  UPDATE public.cantina_pedidos
     SET status = 'cancelado', encerrado_em = now(), encerrado_por = v_uid,
         motivo_cancelamento = left(v_motivo, 300), cancelado_pela_cantina = TRUE, atualizado_em = now()
   WHERE id = p_pedido
  RETURNING * INTO v_pedido;
  PERFORM public.fn_cantina_registrar(p_pedido, 'Pedido cancelado pela cantina: ' || left(v_motivo, 300));
  PERFORM public.fn_cantina_notificar(v_pedido, 'Cantina cancelou seu pedido',
    'Pedido #' || v_pedido.numero || ': ' || left(v_motivo, 200));
  RETURN public.fn_cantina_pedido_json(v_pedido, 'cantina');
END;
$function$;

-- ============================================================================
-- 6. A cantina
-- ============================================================================

-- A fila de um dia (padrão: hoje).
CREATE OR REPLACE FUNCTION public.fn_cantina_fila(p_dia DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_dia DATE := COALESCE(p_dia, (public.fn_cantina_agora() AT TIME ZONE 'America/Sao_Paulo')::DATE);
BEGIN
  IF NOT (SELECT public.fn_user_tem('cantina_painel')) THEN
    RAISE EXCEPTION 'Sem acesso ao painel da cantina.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'agora', public.fn_cantina_agora(),
    'dia',   v_dia,
    'pedidos', COALESCE((
      SELECT jsonb_agg(public.fn_cantina_pedido_json(p, 'cantina') ORDER BY p.retirada_em, p.numero)
        FROM public.cantina_pedidos p
       WHERE p.dia = v_dia), '[]'::JSONB)
  );
END;
$function$;

-- Muda o status. As idas e voltas permitidas estão na tabela abaixo; voltar
-- existe para o clique errado no balcão.
CREATE OR REPLACE FUNCTION public.fn_cantina_mudar_status(p_pedido UUID, p_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid    UUID := (SELECT auth.uid());
  v_pedido public.cantina_pedidos;
  v_pode   BOOLEAN;
BEGIN
  IF NOT (SELECT public.fn_user_tem('cantina_painel')) THEN
    RAISE EXCEPTION 'Sem acesso ao painel da cantina.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pedido FROM public.cantina_pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF v_pedido.status = p_status THEN
    RETURN public.fn_cantina_pedido_json(v_pedido, 'cantina');
  END IF;

  v_pode := (v_pedido.status, p_status) IN (
    ('novo',         'preparando'),
    ('novo',         'pronto'),
    ('preparando',   'pronto'),
    ('preparando',   'novo'),
    ('pronto',       'retirado'),
    ('pronto',       'nao_retirado'),
    ('pronto',       'preparando'),
    ('retirado',     'pronto'),
    ('nao_retirado', 'pronto'),
    ('nao_retirado', 'retirado')
  );
  IF NOT v_pode THEN
    RAISE EXCEPTION 'Não dá para passar de % para %.', v_pedido.status, p_status;
  END IF;
  IF p_status = 'nao_retirado' AND public.fn_cantina_agora() < v_pedido.retirada_em THEN
    RAISE EXCEPTION 'Ainda não chegou o horário de retirada deste pedido.';
  END IF;

  UPDATE public.cantina_pedidos
     SET status        = p_status,
         preparando_em = CASE WHEN p_status = 'preparando' THEN now()
                              WHEN p_status = 'novo' THEN NULL ELSE preparando_em END,
         pronto_em     = CASE WHEN p_status = 'pronto' AND pronto_em IS NULL THEN now()
                              WHEN p_status IN ('novo', 'preparando') THEN NULL ELSE pronto_em END,
         encerrado_em  = CASE WHEN p_status IN ('retirado', 'nao_retirado') THEN now() ELSE NULL END,
         encerrado_por = CASE WHEN p_status IN ('retirado', 'nao_retirado') THEN v_uid ELSE NULL END,
         atualizado_em = now()
   WHERE id = p_pedido
  RETURNING * INTO v_pedido;

  PERFORM public.fn_cantina_registrar(p_pedido, CASE p_status
    WHEN 'novo'         THEN 'Pedido voltou para a fila.'
    WHEN 'preparando'   THEN 'A cantina começou a preparar o seu pedido.'
    WHEN 'pronto'       THEN 'Pedido pronto! Pode retirar no balcão.'
    WHEN 'retirado'     THEN 'Pedido retirado. Bom apetite!'
    WHEN 'nao_retirado' THEN 'Pedido não retirado. O valor será cobrado conforme a regra da cantina.'
  END);

  IF p_status = 'pronto' THEN
    PERFORM public.fn_cantina_notificar(v_pedido, 'Seu pedido está pronto',
      'Pedido #' || v_pedido.numero || ' pronto para retirada na cantina.');
  ELSIF p_status = 'nao_retirado' THEN
    PERFORM public.fn_cantina_notificar(v_pedido, 'Pedido não retirado',
      'Pedido #' || v_pedido.numero || ' foi marcado como não retirado e será cobrado.');
  END IF;

  RETURN public.fn_cantina_pedido_json(v_pedido, 'cantina');
END;
$function$;

-- Relatório do mês para o desconto em folha: tudo que foi entregue ou não
-- retirado (cancelado não entra).
CREATE OR REPLACE FUNCTION public.fn_cantina_relatorio_mes(p_mes DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_inicio DATE := date_trunc('month', p_mes)::DATE;
BEGIN
  IF NOT (SELECT public.fn_user_tem('cantina_painel')) THEN
    RAISE EXCEPTION 'Sem acesso ao painel da cantina.' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'dia', p.dia, 'numero', p.numero, 'nome', p.nome,
             'empresa_nome', p.empresa_nome, 'setor_nome', p.setor_nome,
             'retirada_em', p.retirada_em, 'status', p.status, 'total', p.total,
             'itens', (SELECT string_agg(i.quantidade || '× ' || i.nome
                                         || COALESCE(' (' || i.opcao || ')', ''), ', ' ORDER BY i.id)
                         FROM public.cantina_pedido_itens i WHERE i.pedido_id = p.id))
           ORDER BY p.dia, p.numero)
      FROM public.cantina_pedidos p
     WHERE p.dia >= v_inicio
       AND p.dia <  (v_inicio + INTERVAL '1 month')::DATE
       AND p.status IN ('retirado', 'nao_retirado', 'pronto', 'preparando', 'novo')
  ), '[]'::JSONB);
END;
$function$;

-- ============================================================================
-- 7. A conversa do pedido
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_cantina_mensagens(p_pedido UUID, p_lado TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_pedido public.cantina_pedidos;
BEGIN
  SELECT * INTO v_pedido FROM public.cantina_pedidos WHERE id = p_pedido;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  PERFORM public.fn_cantina_lado(v_pedido, p_lado);

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', m.id, 'lado', m.lado, 'texto', m.texto, 'criado_em', m.criado_em,
             'autor_nome', CASE WHEN m.lado = 'cliente' THEN p.nome
                                WHEN m.lado = 'cantina' THEN 'Cantina' END)
           ORDER BY m.id)
      FROM public.cantina_mensagens m
      JOIN public.cantina_pedidos p ON p.id = m.pedido_id
     WHERE m.pedido_id = p_pedido
  ), '[]'::JSONB);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_cantina_enviar_mensagem(p_pedido UUID, p_lado TEXT, p_texto TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid    UUID := (SELECT auth.uid());
  v_pedido public.cantina_pedidos;
  v_lado   TEXT;
  v_texto  TEXT := btrim(COALESCE(p_texto, ''));
BEGIN
  SELECT * INTO v_pedido FROM public.cantina_pedidos WHERE id = p_pedido;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  v_lado := public.fn_cantina_lado(v_pedido, p_lado);

  IF v_texto = '' THEN
    RAISE EXCEPTION 'Mensagem vazia.';
  END IF;
  IF v_pedido.dia < (public.fn_cantina_agora() AT TIME ZONE 'America/Sao_Paulo')::DATE - 7 THEN
    RAISE EXCEPTION 'A conversa deste pedido já foi encerrada.';
  END IF;

  INSERT INTO public.cantina_mensagens (pedido_id, autor_id, lado, texto)
  VALUES (p_pedido, v_uid, v_lado, left(v_texto, 500));

  -- Quem escreve já leu tudo até aqui.
  IF v_lado = 'cliente' THEN
    UPDATE public.cantina_pedidos SET lido_cliente_em = now() WHERE id = p_pedido;
  ELSE
    UPDATE public.cantina_pedidos SET lido_cantina_em = now() WHERE id = p_pedido;
    PERFORM public.fn_cantina_notificar(v_pedido, 'Mensagem da cantina',
      'Pedido #' || v_pedido.numero || ': ' || left(v_texto, 160));
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_cantina_marcar_lido(p_pedido UUID, p_lado TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_pedido public.cantina_pedidos;
BEGIN
  SELECT * INTO v_pedido FROM public.cantina_pedidos WHERE id = p_pedido;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  -- Sem sinal: marcar lido não muda nada que o outro lado veja. O gatilho
  -- abaixo ignora UPDATE que só mexe na leitura.
  IF public.fn_cantina_lado(v_pedido, p_lado) = 'cliente' THEN
    UPDATE public.cantina_pedidos SET lido_cliente_em = now() WHERE id = p_pedido;
  ELSE
    UPDATE public.cantina_pedidos SET lido_cantina_em = now() WHERE id = p_pedido;
  END IF;
END;
$function$;

-- Quem chama o quê.
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.fn_cantina_cardapio()',
    'public.fn_cantina_fazer_pedido(jsonb, text, text)',
    'public.fn_cantina_meus_pedidos()',
    'public.fn_cantina_cancelar(uuid, text, text)',
    'public.fn_cantina_fila(date)',
    'public.fn_cantina_mudar_status(uuid, text)',
    'public.fn_cantina_relatorio_mes(date)',
    'public.fn_cantina_mensagens(uuid, text)',
    'public.fn_cantina_enviar_mensagem(uuid, text, text)',
    'public.fn_cantina_marcar_lido(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- ============================================================================
-- 8. Tempo real: o aviso com os ids
-- ============================================================================
--
-- Um aviso por COMANDO. Para a fila vai `novo: true` quando entrou pedido (a
-- tela toca o som); para o dono, só os ids. UPDATE que só mexe na leitura da
-- conversa não avisa ninguém.

CREATE OR REPLACE FUNCTION public.fn_cantina_pedidos_sinal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ids JSONB;
  r     RECORD;
BEGIN
  IF tg_op = 'INSERT' THEN
    SELECT jsonb_agg(n.id) INTO v_ids FROM novas n;
  ELSE
    SELECT jsonb_agg(n.id) INTO v_ids
      FROM novas n JOIN antigas a ON a.id = n.id
     WHERE (n.status, n.total, n.retirada_em) IS DISTINCT FROM (a.status, a.total, a.retirada_em);
  END IF;

  IF v_ids IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object('ids', v_ids, 'novo', tg_op = 'INSERT'),
    'mudou', 'cantina-fila:hoje', TRUE);

  FOR r IN
    SELECT n.perfil_id, jsonb_agg(n.id) AS ids
      FROM novas n
     WHERE v_ids ? n.id::TEXT AND n.perfil_id IS NOT NULL
     GROUP BY n.perfil_id
  LOOP
    PERFORM realtime.send(
      jsonb_build_object('ids', r.ids),
      'mudou', 'cantina-pessoa:' || r.perfil_id::TEXT, TRUE);
  END LOOP;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cantina_pedidos_sinal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cantina_pedidos_sinal_ins ON public.cantina_pedidos;
DROP TRIGGER IF EXISTS trg_cantina_pedidos_sinal_upd ON public.cantina_pedidos;
CREATE TRIGGER trg_cantina_pedidos_sinal_ins AFTER INSERT ON public.cantina_pedidos
  REFERENCING NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION public.fn_cantina_pedidos_sinal();
CREATE TRIGGER trg_cantina_pedidos_sinal_upd AFTER UPDATE ON public.cantina_pedidos
  REFERENCING OLD TABLE AS antigas NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION public.fn_cantina_pedidos_sinal();

-- Mensagem nova: a fila fica sabendo da do cliente; o dono, da da cantina. A
-- mensagem do sistema acompanha uma mudança de pedido, que já avisou.
CREATE OR REPLACE FUNCTION public.fn_cantina_mensagens_sinal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ids JSONB;
  r     RECORD;
BEGIN
  SELECT jsonb_agg(DISTINCT n.pedido_id) INTO v_ids FROM novas n WHERE n.lado = 'cliente';
  IF v_ids IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object('ids', v_ids, 'mensagem', TRUE),
      'mudou', 'cantina-fila:hoje', TRUE);
  END IF;

  FOR r IN
    SELECT p.perfil_id, jsonb_agg(DISTINCT p.id) AS ids
      FROM novas n JOIN public.cantina_pedidos p ON p.id = n.pedido_id
     WHERE n.lado = 'cantina' AND p.perfil_id IS NOT NULL
     GROUP BY p.perfil_id
  LOOP
    PERFORM realtime.send(
      jsonb_build_object('ids', r.ids, 'mensagem', TRUE),
      'mudou', 'cantina-pessoa:' || r.perfil_id::TEXT, TRUE);
  END LOOP;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cantina_mensagens_sinal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cantina_mensagens_sinal ON public.cantina_mensagens;
CREATE TRIGGER trg_cantina_mensagens_sinal AFTER INSERT ON public.cantina_mensagens
  REFERENCING NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION public.fn_cantina_mensagens_sinal();

-- Quem ouve. Funções em (SELECT ...): uma vez por consulta.
DROP POLICY IF EXISTS cantina_sinal_pessoa ON realtime.messages;
CREATE POLICY cantina_sinal_pessoa ON realtime.messages
  FOR SELECT TO authenticated
  USING ((extension = 'broadcast'::TEXT)
    AND (split_part((SELECT realtime.topic()), ':'::TEXT, 1) = 'cantina-pessoa'::TEXT)
    AND (SELECT public.fn_realtime_posso_ouvir_usuario((SELECT realtime.topic()))));

DROP POLICY IF EXISTS cantina_sinal_fila ON realtime.messages;
CREATE POLICY cantina_sinal_fila ON realtime.messages
  FOR SELECT TO authenticated
  USING ((extension = 'broadcast'::TEXT)
    AND ((SELECT realtime.topic()) = 'cantina-fila:hoje'::TEXT)
    AND (SELECT public.fn_user_tem('cantina_painel')));

-- ============================================================================
-- 9. Configuração e cardápio iniciais (do print do sistema antigo)
-- ============================================================================

INSERT INTO public.cantina_config (id, aberta, aviso_titulo, aviso_texto)
VALUES (TRUE, TRUE, 'Bom dia! A cantina já está funcionando.',
        'Encomendas não retiradas serão cobradas e não haverá reembolso. '
        'Cancelamentos são aceitos com até 15 minutos de antecedência.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cantina_itens
  (codigo, nome, descricao, ingredientes, preco, categoria, ordem, pedido_de, pedido_ate, opcoes)
VALUES
  (50, 'X-Salada', NULL,
   ARRAY['Pão de hambúrguer','Hambúrguer artesanal','Queijo muçarela','Presunto','Alface','Tomate','Maionese caseira'],
   18.00, 'lanches', 10, '07:00', '13:00', '{}'),
  (51, 'X-Frango', NULL,
   ARRAY['Pão de hambúrguer','Hambúrguer de frango artesanal','Queijo muçarela','Presunto','Alface','Tomate','Maionese caseira'],
   18.00, 'lanches', 20, '11:00', '14:00', '{}'),
  (53, 'X-Saladinha',
   'O novo lanche econômico da cantina: saboroso e feito na medida para matar a fome sem pesar no bolso.',
   '{}', 10.00, 'lanches', 30, '11:00', '14:00', '{}'),
  (59, 'X-Egg', NULL,
   ARRAY['Pão de hambúrguer','Hambúrguer artesanal','Presunto','Queijo prato','Ovo frito','Alface','Tomate'],
   20.00, 'lanches', 40, '07:00', '14:00', '{}'),
  (58, 'X-Calabresa', NULL,
   ARRAY['Pão de hambúrguer','Hambúrguer artesanal','Presunto','Queijo prato','Calabresa','Alface','Tomate'],
   23.00, 'lanches', 50, '07:00', '14:00', '{}'),
  (52, 'Hot-Dog', NULL,
   ARRAY['Pão de hot dog','Salsicha','Maionese caseira','Ketchup','Mostarda','Alface','Cenoura','Batata palha'],
   14.00, 'lanches', 60, '07:00', '12:00', '{}'),
  (57, 'Hot Duplo', NULL,
   ARRAY['Pão de hot dog','2 salsichas','Maionese caseira','Ketchup','Mostarda','Alface','Cenoura','Batata palha'],
   17.00, 'lanches', 70, '07:00', '14:00', '{}'),
  (8,  'Refrigerante lata', 'Lata de 350 ml.', '{}', 6.00, 'bebidas', 110, '13:30', '15:30',
   ARRAY['Coca-Cola','Coca-Cola Zero','Fanta Laranja','Fanta Uva']),
  (9,  'Coca-Cola KS', 'Garrafinha de vidro.', '{}', 5.00, 'bebidas', 120, '13:30', '15:30', '{}'),
  (13, 'Água com gás', 'Garrafa de 510 ml.', '{}', 3.00, 'bebidas', 130, '13:30', '15:30', '{}'),
  (14, 'Guaraná Paulistinha 250 ml', NULL, '{}', 2.50, 'bebidas', 140, '13:30', '15:30', '{}'),
  (15, 'Guaraná Paulistinha 600 ml', NULL, '{}', 6.00, 'bebidas', 150, '13:30', '15:30', '{}')
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================================
-- 10. Verificação
-- ============================================================================

DO $verificacao$
BEGIN
  IF (SELECT COUNT(*) FROM public.fn_permissoes_catalogo() WHERE chave IN ('ver_cantina', 'cantina_painel')) <> 2 THEN
    RAISE EXCEPTION 'Faltou chave da cantina no catalogo.';
  END IF;
  IF (SELECT COUNT(*) FROM public.fn_permissoes_catalogo()) < 30 THEN
    RAISE EXCEPTION 'O encadeamento do catalogo quebrou.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE slug = 'cantina' AND produto = 'cantina') THEN
    RAISE EXCEPTION 'Empresa Cantina nao foi criada.';
  END IF;
  IF (SELECT COUNT(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'trg_cantina_%') <> 3 THEN
    RAISE EXCEPTION 'Faltou gatilho de sinal da cantina (esperados 3).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime' AND tablename LIKE 'cantina_%') THEN
    RAISE EXCEPTION 'Tabela da cantina na publicacao do Postgres Changes.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261022153000', 'cantina', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
