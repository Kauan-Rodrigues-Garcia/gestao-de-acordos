-- ============================================================================
-- Chips Fisicos — o inventario de chips que cada operador tem na mao
-- ============================================================================
--
-- Pedido de 21/09/2026: dentro da aba Meus Chips, uma separacao «Chips
-- Fisicos» onde o operador cadastra os chips que ele possui, e a lideranca
-- enxerga o que cada pessoa do setor tem. Status: Ativo, Banido e Recuperar,
-- com um tempo de ate 12 horas.
--
-- ## Separado do Controle de Numeros, de proposito
--
-- `numeros_whatsapp` e o caminho do Nucleo: aquecer, liberar ao setor, lancar
-- ao operador, relancar. Chip fisico nao passa por esse caminho — ele ja esta
-- com a pessoa, e o que o setor quer e saber QUEM tem O QUE e em que estado.
-- Por isso tabela propria, sem FK para `numeros_whatsapp`, sem trilha de
-- movimentacao e sem posse. Misturar os dois faria um chip fisico aparecer na
-- fila do Nucleo, ou um numero aquecido sumir do Controle ao ser «cadastrado»
-- aqui.
--
-- ## O chip pertence a PESSOA; o setor vem dela
--
-- Nao ha `setor_id` na linha. Quem enxerga pelo setor enxerga os chips das
-- pessoas que ESTAO no setor agora (`perfis.setor_id`). Operador que muda de
-- setor leva os chips junto, e a lideranca nova ve sem ninguem precisar mexer
-- em nada — que e o que acontece com o chip de verdade, na bolsa da pessoa.
--
-- ## O tempo
--
-- `prazo_ate` e opcional e so existe em Banido ou Recuperar, no maximo 12 horas
-- depois de `status_desde` (CHECK `chips_fisicos_prazo`). O fim do tempo NAO
-- troca o status — a mesma decisao de 11/09/2026 no Controle de Numeros: a tela
-- avisa «Tempo encerrado» e quem cuida do chip decide o que fazer.
--
-- ## As tres chaves — todas nascem DESLIGADAS
--
--   ver_chips_fisicos ................ abrir a separacao e cuidar dos PROPRIOS chips
--   chips_fisicos_gerenciar_setor .... cadastrar, alterar e excluir pelos colegas
--   chips_fisicos_todos_setores ...... enxergar os chips de todos os setores
--
-- Padrao `ARRAY[]` nas tres: pedido explicito de nao liberar ao operador antes
-- de ver a tela. Administrador e super_admin enxergam por acesso total, como
-- toda chave nao explicita. Liberar depois e clique no painel de permissoes.
--
-- Ver o SETOR inteiro nao ganhou chave propria: e `chips_escopo_setor`, a
-- mesma escada da aba (a lideranca ja tem). Ligar `ver_chips_fisicos` num lider
-- mostra a ele o setor; alterar pelos colegas pede a segunda chave.
--
-- ## Escrita so por RPC
--
-- A tabela tem policy de SELECT e nenhuma de escrita. Cadastrar, alterar status
-- e excluir passam por tres funcoes `SECURITY DEFINER` que conferem a chave, o
-- alcance e normalizam o numero — o mesmo desenho das transicoes do Controle.
--
-- ## Tempo real
--
-- Nenhum. A tabela nao entra em `supabase_realtime` nem ganha sinal: a tela
-- rele ao voltar para a aba e depois de cada acao. Se a lideranca pedir
-- atualizacao ao vivo, o caminho e o sinal de 20260917110000.
--
-- Escrita de dados na aplicacao: so a semeadura das tres chaves novas em
-- `cargos_permissoes` (fn_permissoes_semear_empresa, que so acrescenta chave
-- ausente). Cria uma tabela vazia, dois indices, uma policy e seis funcoes;
-- redefine fn_permissoes_catalogo.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 0. Catalogo de permissoes
-- ============================================================================
--
-- O topo da cadeia e 20260921150000 (excluir_vendas_na_meta); nenhuma
-- migration depois dela redefiniu `fn_permissoes_catalogo`. O congelamento
-- abaixo repete o corpo atual da funcao — e isso que o torna retrato.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo_antes_chips_fisicos_20260921()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_venda_na_meta_20260921()
  UNION ALL
  SELECT * FROM (VALUES
    ('excluir_vendas_na_meta', ARRAY['comercial']::TEXT[], ARRAY['elite','gerencia']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_chips_fisicos_20260921() IS
  'Retrato do catalogo antes das chaves de Chips Fisicos (21/09/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_chips_fisicos_20260921()
  UNION ALL
  SELECT * FROM (VALUES
    -- As tres nascem desligadas: a tela ainda esta em avaliacao (21/09/2026).
    ('ver_chips_fisicos',             ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('chips_fisicos_gerenciar_setor', ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('chips_fisicos_todos_setores',   ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. A extensao 20260921160000 adiciona as tres chaves de '
  'Chips Fisicos (ver_chips_fisicos, chips_fisicos_gerenciar_setor, '
  'chips_fisicos_todos_setores).';

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ============================================================================
-- 1. A tabela
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chips_fisicos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Quem tem o chip na mao. O setor vem daqui (ver o cabecalho).
  operador_id     UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  -- So digitos, sem o 55 do pais — o mesmo formato de numeros_whatsapp.
  numero          TEXT NOT NULL,
  operadora       TEXT,
  observacao      TEXT,
  status          TEXT NOT NULL DEFAULT 'ativo',
  status_desde    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prazo_ate       TIMESTAMPTZ,
  -- Quem marcou o status atual. O nome vai junto porque o operador nem sempre
  -- le o perfil de quem marcou (o lider, por exemplo).
  status_por      UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  status_por_nome TEXT,
  criado_por      UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chips_fisicos_formato
    CHECK (numero ~ '^(1[1-9]|[2-9][0-9])[0-9]{8,9}$'),
  CONSTRAINT chips_fisicos_status
    CHECK (status IN ('ativo', 'banido', 'recuperar')),
  CONSTRAINT chips_fisicos_operadora
    CHECK (operadora IS NULL OR operadora IN ('vivo', 'claro', 'tim', 'oi', 'outra')),
  CONSTRAINT chips_fisicos_observacao
    CHECK (observacao IS NULL OR char_length(observacao) <= 200),
  -- Tempo so fora de Ativo, e no maximo 12 horas.
  CONSTRAINT chips_fisicos_prazo
    CHECK (prazo_ate IS NULL
           OR (status <> 'ativo'
               AND prazo_ate > status_desde
               AND prazo_ate <= status_desde + INTERVAL '12 hours'))
);

COMMENT ON TABLE public.chips_fisicos IS
  'Chips fisicos que cada pessoa tem, com status (ativo, banido, recuperar) e '
  'tempo opcional de ate 12 h. Separado do Controle de Numeros. Escrita so '
  'pelas RPCs fn_chips_fisicos_*. Ver 20260921160000.';

-- Um chip e um numero: o mesmo numero nao fica com duas pessoas.
CREATE UNIQUE INDEX IF NOT EXISTS chips_fisicos_numero_por_empresa
  ON public.chips_fisicos(empresa_id, numero);

-- A policy e as telas procuram por dono.
CREATE INDEX IF NOT EXISTS idx_chips_fisicos_operador
  ON public.chips_fisicos(operador_id);

-- ============================================================================
-- 2. Quem enxerga o que
-- ============================================================================

-- ── Os colegas de setor que eu enxergo ──────────────────────────────────────
--
-- Os ids das pessoas do MEU setor, quando a escada da aba `chips` chega ao
-- setor (a lideranca). Vazio para quem tem so o individual.
--
-- PL/pgSQL, e nao SQL, para `fn_user_escopo` rodar UMA vez: numa funcao SQL o
-- planejador pode embutir a chamada no filtro e avalia-la por linha de
-- `perfis`, e cada avaliacao percorre o catalogo inteiro.

CREATE OR REPLACE FUNCTION public.fn_chips_fisicos_colegas_de_setor()
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_setor   UUID;
  v_empresa UUID;
BEGIN
  IF public.fn_user_escopo('chips') < 2 THEN
    RETURN;
  END IF;

  v_setor   := public.fn_user_setor_id();
  v_empresa := public.fn_user_empresa_id();
  IF v_setor IS NULL OR v_empresa IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id FROM public.perfis p
     WHERE p.setor_id = v_setor
       AND p.empresa_id = v_empresa;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chips_fisicos_colegas_de_setor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chips_fisicos_colegas_de_setor() TO authenticated;

COMMENT ON FUNCTION public.fn_chips_fisicos_colegas_de_setor() IS
  'Ids das pessoas do setor do usuario atual, quando ele alcanca o setor na aba '
  'chips (escopo >= 2). Usada pela policy de chips_fisicos.';

-- ── Posso cuidar dos chips desta pessoa? ────────────────────────────────────
--
-- Uma funcao so para as tres RPCs nao divergirem. Sem GRANT: so as RPCs
-- chamam, e elas rodam como dona.
--
--   a propria pessoa ........... ver_chips_fisicos
--   um colega ................... + chips_fisicos_gerenciar_setor, e alcancar
--                                   a pessoa: pelo setor (escada da aba) ou
--                                   por chips_fisicos_todos_setores

CREATE OR REPLACE FUNCTION public.fn_chips_fisicos_pode_cuidar(p_operador_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu      UUID := (SELECT auth.uid());
  v_empresa UUID;
  v_setor   UUID;
BEGIN
  IF v_eu IS NULL OR p_operador_id IS NULL THEN
    RETURN FALSE;
  END IF;
  IF NOT public.fn_user_tem('ver_chips_fisicos') THEN
    RETURN FALSE;
  END IF;
  IF p_operador_id = v_eu THEN
    RETURN TRUE;
  END IF;

  IF NOT public.fn_user_tem('chips_fisicos_gerenciar_setor') THEN
    RETURN FALSE;
  END IF;

  SELECT p.empresa_id, p.setor_id INTO v_empresa, v_setor
    FROM public.perfis p WHERE p.id = p_operador_id;
  IF NOT FOUND OR NOT public.fn_can_access_empresa(v_empresa) THEN
    RETURN FALSE;
  END IF;

  IF public.fn_user_tem('chips_fisicos_todos_setores') THEN
    RETURN TRUE;
  END IF;

  RETURN public.fn_user_escopo('chips') >= 2
     AND v_setor IS NOT NULL
     AND v_setor = public.fn_user_setor_id()
     AND v_empresa = public.fn_user_empresa_id();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chips_fisicos_pode_cuidar(UUID) FROM PUBLIC, anon, authenticated;

-- ── A policy ────────────────────────────────────────────────────────────────
--
-- Cada chamada envolta em `(SELECT ...)`: sem isso o Postgres avalia a funcao
-- por linha (licao de 20260910180000). `fn_can_access_empresa(empresa_id)`
-- depende da linha e roda por linha de qualquer jeito — e duas buscas por
-- chave primaria.

ALTER TABLE public.chips_fisicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chips_fisicos_select ON public.chips_fisicos;
CREATE POLICY chips_fisicos_select ON public.chips_fisicos
FOR SELECT TO authenticated
USING (
  (SELECT public.fn_user_tem('ver_chips_fisicos'))
  AND (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    operador_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_tem('chips_fisicos_todos_setores'))
    OR operador_id IN (SELECT public.fn_chips_fisicos_colegas_de_setor())
  )
);

-- Sem policy de INSERT, UPDATE ou DELETE, e sem o privilegio: so as RPCs
-- escrevem.
REVOKE ALL ON public.chips_fisicos FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.chips_fisicos FROM authenticated;
GRANT SELECT ON public.chips_fisicos TO authenticated;

-- ============================================================================
-- 3. As RPCs
-- ============================================================================

-- ── Cadastrar ou corrigir ───────────────────────────────────────────────────
--
-- `p_id` nulo cadastra; preenchido corrige numero, operadora e observacao, e
-- pode passar o chip para outra pessoa (`p_operador_id`), desde que quem pede
-- cuide das duas pontas. `p_operador_id` nulo no cadastro = o proprio usuario.
--
-- O numero chega como a pessoa digitou: a funcao tira tudo que nao e digito e o
-- 55 do pais em 12 ou 13 digitos — a mesma regra de `normalizarNumero`.

CREATE OR REPLACE FUNCTION public.fn_chips_fisicos_salvar(
  p_id          UUID,
  p_operador_id UUID,
  p_numero      TEXT,
  p_operadora   TEXT DEFAULT NULL,
  p_observacao  TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu        UUID := (SELECT auth.uid());
  v_numero    TEXT;
  v_operadora TEXT := NULLIF(LOWER(TRIM(p_operadora)), '');
  v_obs       TEXT := NULLIF(TRIM(p_observacao), '');
  v_dono      UUID;
  v_empresa   UUID;
  v_atual     public.chips_fisicos%ROWTYPE;
  v_outro_id  UUID;
  v_outro_nm  TEXT;
  v_id        UUID;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre de novo.' USING ERRCODE = '42501';
  END IF;

  v_numero := regexp_replace(COALESCE(p_numero, ''), '[^0-9]', '', 'g');
  IF v_numero LIKE '55%' AND char_length(v_numero) IN (12, 13) THEN
    v_numero := substr(v_numero, 3);
  END IF;
  IF v_numero !~ '^(1[1-9]|[2-9][0-9])[0-9]{8,9}$' THEN
    RAISE EXCEPTION 'Número inválido. Use DDD e 10 ou 11 dígitos.' USING ERRCODE = '22023';
  END IF;

  IF v_operadora IS NOT NULL
     AND v_operadora NOT IN ('vivo', 'claro', 'tim', 'oi', 'outra') THEN
    RAISE EXCEPTION 'Operadora desconhecida.' USING ERRCODE = '22023';
  END IF;
  IF v_obs IS NOT NULL AND char_length(v_obs) > 200 THEN
    RAISE EXCEPTION 'A observação passa de 200 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    v_dono := COALESCE(p_operador_id, v_eu);
  ELSE
    SELECT * INTO v_atual FROM public.chips_fisicos WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Chip não encontrado.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.fn_chips_fisicos_pode_cuidar(v_atual.operador_id) THEN
      RAISE EXCEPTION 'Você não pode alterar este chip.' USING ERRCODE = '42501';
    END IF;
    v_dono := COALESCE(p_operador_id, v_atual.operador_id);
  END IF;

  IF NOT public.fn_chips_fisicos_pode_cuidar(v_dono) THEN
    RAISE EXCEPTION 'Você não pode cadastrar chip para esta pessoa.' USING ERRCODE = '42501';
  END IF;

  SELECT p.empresa_id INTO v_empresa FROM public.perfis p WHERE p.id = v_dono;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Pessoa não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF p_id IS NOT NULL AND v_empresa IS DISTINCT FROM v_atual.empresa_id THEN
    RAISE EXCEPTION 'O chip não pode passar para outra empresa.' USING ERRCODE = '22023';
  END IF;

  -- A frase antes do 23505 cru: diz com quem o chip ja esta.
  SELECT c.operador_id, p.nome INTO v_outro_id, v_outro_nm
    FROM public.chips_fisicos c
    LEFT JOIN public.perfis p ON p.id = c.operador_id
   WHERE c.empresa_id = v_empresa
     AND c.numero = v_numero
     AND c.id IS DISTINCT FROM p_id;
  IF FOUND THEN
    IF v_outro_id = v_eu THEN
      RAISE EXCEPTION 'Você já cadastrou este chip.' USING ERRCODE = '23505';
    END IF;
    RAISE EXCEPTION 'Este chip já está cadastrado para %.', COALESCE(v_outro_nm, 'outra pessoa')
      USING ERRCODE = '23505';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.chips_fisicos (
      empresa_id, operador_id, numero, operadora, observacao,
      status, status_desde, status_por, status_por_nome, criado_por
    )
    SELECT v_empresa, v_dono, v_numero, v_operadora, v_obs,
           'ativo', NOW(), v_eu, eu.nome, v_eu
      FROM public.perfis eu WHERE eu.id = v_eu
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.chips_fisicos
       SET operador_id   = v_dono,
           numero        = v_numero,
           operadora     = v_operadora,
           observacao    = v_obs,
           atualizado_em = NOW()
     WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$;

-- ── Alterar o status ────────────────────────────────────────────────────────
--
-- `p_minutos` e o tempo: nulo = sem tempo; de 1 a 720 (12 h) em Banido ou
-- Recuperar. Ativo nao leva tempo. Marcar de novo o mesmo status reinicia o
-- relogio — e o jeito de trocar o tempo.

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

  IF p_status IS NULL OR p_status NOT IN ('ativo', 'banido', 'recuperar') THEN
    RAISE EXCEPTION 'Status desconhecido.' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'ativo' AND p_minutos IS NOT NULL THEN
    RAISE EXCEPTION 'Chip ativo não leva tempo.' USING ERRCODE = '22023';
  END IF;
  IF p_minutos IS NOT NULL AND (p_minutos < 1 OR p_minutos > 720) THEN
    RAISE EXCEPTION 'O tempo vai de 1 minuto a 12 horas.' USING ERRCODE = '22023';
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

-- ── Excluir ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chips_fisicos_excluir(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_dono UUID;
BEGIN
  SELECT operador_id INTO v_dono FROM public.chips_fisicos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chip não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_chips_fisicos_pode_cuidar(v_dono) THEN
    RAISE EXCEPTION 'Você não pode excluir este chip.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.chips_fisicos WHERE id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chips_fisicos_salvar(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chips_fisicos_alterar_status(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chips_fisicos_excluir(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_chips_fisicos_salvar(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chips_fisicos_alterar_status(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chips_fisicos_excluir(UUID) TO authenticated;

-- ============================================================================
-- 4. Prova
-- ============================================================================

DO $prova$
DECLARE
  n INTEGER;
  v_faltando TEXT;
BEGIN
  SELECT string_agg(c, ', ') INTO v_faltando
    FROM unnest(ARRAY[
      'ver_chips_fisicos', 'chips_fisicos_gerenciar_setor',
      'chips_fisicos_todos_setores']) AS c
   WHERE c NOT IN (SELECT chave FROM public.fn_permissoes_catalogo());
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves de Chips Fisicos ausentes no catalogo: %', v_faltando;
  END IF;

  -- A cadeia nao se partiu: a chave do elo anterior continua la.
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'excluir_vendas_na_meta') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: excluir_vendas_na_meta sumiu.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'ver_meus_chips') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: ver_meus_chips sumiu.';
  END IF;

  -- Nasceram desligadas em todo cargo que nao e de acesso total.
  SELECT count(*) INTO n
    FROM public.cargos_permissoes cp
   WHERE cp.cargo NOT IN ('administrador', 'super_admin')
     AND (COALESCE((cp.permissoes->>'ver_chips_fisicos')::BOOLEAN, FALSE)
          OR COALESCE((cp.permissoes->>'chips_fisicos_gerenciar_setor')::BOOLEAN, FALSE)
          OR COALESCE((cp.permissoes->>'chips_fisicos_todos_setores')::BOOLEAN, FALSE));
  IF n > 0 THEN
    RAISE EXCEPTION 'Chaves de Chips Fisicos nasceram ligadas em % cargo(s) comuns.', n;
  END IF;

  IF to_regclass('public.chips_fisicos') IS NULL THEN
    RAISE EXCEPTION 'A tabela chips_fisicos nao foi criada.';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chips_fisicos'::regclass) THEN
    RAISE EXCEPTION 'chips_fisicos ficou sem RLS.';
  END IF;
  IF has_table_privilege('authenticated', 'public.chips_fisicos', 'INSERT')
     OR has_table_privilege('authenticated', 'public.chips_fisicos', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.chips_fisicos', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated ainda escreve direto em chips_fisicos.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_chips_fisicos_salvar(uuid,uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_chips_fisicos_pode_cuidar(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Uma funcao de Chips Fisicos ficou aberta demais.';
  END IF;
END
$prova$;

COMMIT;
