-- ============================================================================
-- 20260816150100_limite_busca_email_pre_login.sql
--
-- Fecha a enumeração de e-mail apontada na auditoria de 16/08/2026.
--
-- ## O problema
--
-- `buscar_email_por_usuario_empresa` é `SECURITY DEFINER`, está publicada em
-- `/rest/v1/rpc/` e é executável por `anon`. Recebe um nome de usuário e
-- devolve o e-mail corporativo. Sem limite, alguém de fora varre nomes e monta
-- a lista de e-mails da empresa inteira.
--
-- Revogar não é opção: ela é o primeiro passo do login (usuário → e-mail →
-- autenticação), e roda antes de existir sessão.
--
-- ## Por que contar SÓ o que não achou
--
-- Um login legítimo ACERTA: a pessoa digita o próprio usuário e o e-mail volta.
-- Uma varredura ERRA quase sempre, porque está adivinhando nomes.
--
-- Contar toda chamada puniria o uso normal. Contar só as buscas que voltaram
-- vazias separa os dois casos quase perfeitamente — e isso importa muito aqui,
-- porque **a empresa inteira sai por um IP só**. São 199 pessoas atrás do NAT
-- do escritório: um limite sobre o total de buscas travaria o login de todo
-- mundo numa manhã de segunda.
--
-- ## Por que o bloqueio vale também para quem acerta
--
-- Uma vez estourado o limite, a função devolve NULL para TUDO, inclusive para
-- usuário que existe. Se continuasse respondendo aos acertos, o atacante ainda
-- teria o oráculo que a migration veio tirar — bastaria ignorar os NULLs.
--
-- A saída para quem for pego junto é entrar com o **e-mail** em vez do nome de
-- usuário: esse caminho nem passa por aqui (`useAuth.signIn` só chama a RPC
-- quando o identificador não tem "@"). E a janela é de 15 minutos.
--
-- ## O número
--
-- 60 buscas vazias por IP a cada 15 minutos. Um login que falha custa DUAS
-- (`useAuth` tenta primeiro com o slug do tenant e depois sem), então o teto
-- real é de ~30 tentativas erradas por quarto de hora, vindas do mesmo lugar.
-- Para varredura é o fim: passa de milhares por minuto para 120 por hora.
-- ============================================================================

-- ── Contador ────────────────────────────────────────────────────────────────
--
-- Tabela própria em vez de reaproveitar `api_rate_limits`: aquela é chaveada
-- por `usuario_id UUID` com FK para `auth.users` e exige `service_role`. Aqui
-- não há usuário — é justamente o que vem ANTES de haver.
CREATE TABLE IF NOT EXISTS public.login_busca_limite (
  origem         TEXT        PRIMARY KEY,
  janela_inicio  TIMESTAMPTZ NOT NULL DEFAULT now(),
  vazias         INTEGER     NOT NULL DEFAULT 0 CHECK (vazias >= 0),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.login_busca_limite IS
  'Buscas de e-mail sem resultado, por IP, antes do login. Sem policy de RLS de '
  'propósito: só a função SECURITY DEFINER buscar_email_por_usuario_empresa '
  'escreve aqui, como dona da tabela. Ninguém mais lê nem grava.';

ALTER TABLE public.login_busca_limite ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.login_busca_limite FROM PUBLIC, anon, authenticated;

-- ── Origem da chamada ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_origem_da_requisicao()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_xff TEXT;
BEGIN
  -- Fora do PostgREST não existe cabeçalho nenhum, e `request.headers` nem
  -- sequer está definido — daí o segundo argumento de current_setting.
  v_xff := current_setting('request.headers', true)::json ->> 'x-forwarded-for';

  -- O cabeçalho vem como "cliente, proxy1, proxy2". O primeiro é quem chamou.
  v_xff := btrim(split_part(COALESCE(v_xff, ''), ',', 1));

  -- NULL quando não dá para identificar a origem. Quem chama decide o que
  -- fazer com isso — ver o comentário do `IF v_origem IS NULL` na busca.
  RETURN left(NULLIF(v_xff, ''), 100);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.fn_origem_da_requisicao() FROM PUBLIC, anon, authenticated;

-- ── A busca, agora com freio ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buscar_email_por_usuario_empresa(
  p_usuario      TEXT,
  p_empresa_slug TEXT DEFAULT NULL::TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Buscas vazias toleradas por IP dentro da janela. Ver o cabeçalho da
  -- migration para o raciocínio do número.
  c_limite  CONSTANT INT := 60;
  c_janela  CONSTANT INTERVAL := INTERVAL '15 minutes';

  v_email    TEXT;
  v_usuario  TEXT;
  v_slug     TEXT;
  v_origem   TEXT;
  v_inicio   TIMESTAMPTZ;
  v_vazias   INT;
  v_agora    TIMESTAMPTZ := clock_timestamp();
BEGIN
  v_usuario := NULLIF(lower(btrim(COALESCE(p_usuario, ''))), '');
  v_slug    := NULLIF(lower(btrim(COALESCE(p_empresa_slug, ''))), '');

  IF v_usuario IS NULL THEN
    RETURN NULL;
  END IF;

  v_origem := public.fn_origem_da_requisicao();

  /*
   * Origem desconhecida: NÃO limita.
   *
   * Parece o contrário do esperado, e é deliberado. Se o cabeçalho não chegar
   * — outro proxy na frente, chamada por conexão direta, mudança de
   * infraestrutura — todas as buscas cairiam no MESMO balde. Aí bastaria um
   * atacante gastar 60 tentativas para deixar a empresa inteira sem conseguir
   * entrar por nome de usuário, durante 15 minutos, repetidamente.
   *
   * Trocar um vazamento de e-mail por um desligamento remoto do login é um mau
   * negócio. Sem conseguir distinguir quem chama, não existe limite por
   * chamador — existe só um interruptor geral.
   *
   * O efeito prático de o cabeçalho sumir é o limite parar de agir, o que é
   * visível: `login_busca_limite` fica vazia. Ver a consulta de conferência no
   * fim desta migration.
   */
  IF v_origem IS NULL THEN
    SELECT p.email INTO v_email
    FROM public.perfis p
    LEFT JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.usuario IS NOT NULL
      AND lower(btrim(p.usuario)) = v_usuario
      AND p.ativo = true
      AND (v_slug IS NULL OR e.slug = v_slug)
    ORDER BY p.criado_em DESC
    LIMIT 1;
    RETURN v_email;
  END IF;

  -- Faxina barata: uma linha por IP, e nenhuma sobrevive à janela. Sem isto a
  -- tabela viraria um registro permanente de endereços que tentaram entrar —
  -- o oposto do que uma correção de privacidade deveria deixar para trás.
  DELETE FROM public.login_busca_limite
   WHERE janela_inicio < v_agora - c_janela - INTERVAL '1 hour';

  INSERT INTO public.login_busca_limite (origem, janela_inicio, vazias, atualizado_em)
  VALUES (v_origem, v_agora, 0, v_agora)
  ON CONFLICT (origem) DO NOTHING;

  SELECT l.janela_inicio, l.vazias
    INTO v_inicio, v_vazias
    FROM public.login_busca_limite l
   WHERE l.origem = v_origem
   FOR UPDATE;

  -- Janela vencida: zera e recomeça.
  IF v_inicio <= v_agora - c_janela THEN
    v_inicio := v_agora;
    v_vazias := 0;
    UPDATE public.login_busca_limite
       SET janela_inicio = v_inicio, vazias = 0, atualizado_em = v_agora
     WHERE origem = v_origem;
  END IF;

  -- Estourado: responde como se não existisse, inclusive para usuário real.
  -- Responder aos acertos devolveria o oráculo ao atacante.
  IF v_vazias >= c_limite THEN
    RETURN NULL;
  END IF;

  SELECT p.email INTO v_email
  FROM public.perfis p
  LEFT JOIN public.empresas e ON e.id = p.empresa_id
  WHERE p.usuario IS NOT NULL
    AND lower(btrim(p.usuario)) = v_usuario
    AND p.ativo = true
    AND (v_slug IS NULL OR e.slug = v_slug)
  ORDER BY p.criado_em DESC
  LIMIT 1;

  -- Só a busca que não achou nada conta. Login legítimo acerta e nunca soma.
  IF v_email IS NULL THEN
    UPDATE public.login_busca_limite
       SET vazias = vazias + 1, atualizado_em = v_agora
     WHERE origem = v_origem;
  END IF;

  RETURN v_email;
END;
$$;

-- A pública continua sendo o atalho para "procura em qualquer empresa"; o
-- freio mora na função que ela chama, então os dois caminhos ficam cobertos.
COMMENT ON FUNCTION public.buscar_email_por_usuario_empresa(TEXT, TEXT) IS
  'Resolve nome de usuário para e-mail antes do login. Limitada a 60 buscas '
  'sem resultado por IP a cada 15 min — ver login_busca_limite. Acerto não '
  'consome cota, para não travar o escritório inteiro atrás de um NAT.';

-- ── Verificação ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_config TEXT[];
BEGIN
  SELECT p.proconfig INTO v_config
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'buscar_email_por_usuario_empresa';

  IF v_config IS NULL
     OR NOT EXISTS (SELECT 1 FROM unnest(v_config) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'buscar_email_por_usuario_empresa ficou sem search_path fixo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='login_busca_limite'
  ) THEN
    RAISE EXCEPTION 'login_busca_limite não foi criada';
  END IF;

  RAISE NOTICE 'OK: busca de e-mail pré-login com limite por IP.';
END $$;

-- ── Conferência depois de aplicar ───────────────────────────────────────────
--
-- Entre no sistema com um nome de usuário QUE NÃO EXISTE, pela tela de login,
-- e rode:
--
--   SELECT * FROM public.login_busca_limite;
--
-- Esperado: uma linha, com o IP de quem tentou e `vazias` >= 1.
--
-- Se voltar VAZIA, o `x-forwarded-for` não está chegando até o Postgres e o
-- limite não está agindo — a busca continua funcionando, mas sem freio. Nesse
-- caso o caminho é aplicar o limite na borda (WAF/proxy) em vez de no banco.
--
-- Login com usuário QUE EXISTE não deve criar nem incrementar linha nenhuma.

