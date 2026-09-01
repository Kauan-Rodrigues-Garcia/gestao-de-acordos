-- Modo TV — fase 1: o palco e o corte.
--
-- ## O que esta migration cria
--
-- Duas superfícies, uma verdade:
--
--   MESA   `/modo-tv`      autenticada, atrás do painel. Monta a cena na
--                          prévia e decide o que vai ao ar.
--   PALCO  `/tv/:slug`     PÚBLICA. Roda no PC ligado à TV por HDMI, em tela
--                          cheia, o dia inteiro, sem ninguém sentado na frente.
--
-- ## Por que o palco é público, e o que isso obriga
--
-- Decisão do dono do produto: o que vai na parede (ranking, meta, arte de
-- campanha) é justamente o que a operação inteira deve ver. Não há sigilo a
-- proteger aqui, e exigir sessão num PC sem teclado só produziria uma parede
-- exibindo tela de login no meio da tarde.
--
-- Mas "o dado não é secreto" NÃO é licença para abrir o banco. A superfície
-- anônima alcança exatamente UMA porta — `fn_tv_palco` — que é somente leitura
-- e devolve só o que está na tela. As tabelas continuam com RLS fechada: nem
-- `anon` nem `authenticated` sem chave leem `tv_cenas` diretamente. Os
-- advisors já apontam 79 funções alcançáveis pelo papel anônimo neste projeto;
-- esta é a octogésima e é a última que precisa existir para o Modo TV.
--
-- ## Escopo é por SETOR
--
-- Cada setor configura o próprio Modo TV, e até duas telas por setor. Por isso
-- `setor_id` é obrigatório em tela e cena — não é herdado da empresa nem
-- inferido do usuário. Uma cena do Play 3 não aparece na TV do Receptivo.
--
-- ## O painel manda
--
-- Cinco chaves novas, todas nascendo DESLIGADAS para todo cargo configurável
-- (`padrao` vazio). Enquanto ninguém ligar no painel, só quem tem acesso total
-- alcança o Modo TV — que é o pedido para esta fase. Nenhuma decisão pergunta
-- o cargo, aqui ou na tela: `fn_user_tem` é a única pergunta.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Telas (os palcos)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tv_telas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id       UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  -- O slug É a URL: `/tv/recepcao`. Único no sistema inteiro, não por empresa,
  -- porque quem digita o endereço no PC da TV não informa empresa nenhuma.
  slug           TEXT NOT NULL,
  nome           TEXT NOT NULL,
  ativa          BOOLEAN NOT NULL DEFAULT TRUE,
  -- Último sinal de vida do palco. É o que a mesa mostra como "online há 3s".
  ultimo_sinal   TIMESTAMPTZ,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por     UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Minúsculas, dígitos e hífen. Sem acento e sem barra: isto vira endereço, e
  -- endereço digitado à mão no navegador de um PC sem teclado decente.
  CONSTRAINT tv_telas_slug_formato CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tv_telas_slug ON public.tv_telas (slug);
CREATE INDEX IF NOT EXISTS idx_tv_telas_setor ON public.tv_telas (setor_id) WHERE ativa;

COMMENT ON TABLE public.tv_telas IS
  'Cada palco do Modo TV. O slug e a URL publica, e por isso e unico no sistema.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Cenas
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tv_cenas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id       UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  ordem          INTEGER NOT NULL DEFAULT 0,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por     UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tv_cenas_setor ON public.tv_cenas (setor_id, ordem);

COMMENT ON TABLE public.tv_cenas IS
  'Arranjo salvo de fontes. Por setor: cada setor monta as proprias cenas.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Fontes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O enquadramento é PERCENTUAL, nunca pixel — mesmo modelo do
-- `src/pages/Comemoracoes/layout.ts`. É isso que faz a prévia na mesa bater
-- com a TV independentemente da resolução: a TV pode ser Full HD hoje e outra
-- coisa amanhã, e nenhum número guardado aqui muda.

CREATE TABLE IF NOT EXISTS public.tv_fontes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cena_id   UUID NOT NULL REFERENCES public.tv_cenas(id) ON DELETE CASCADE,
  tipo      TEXT NOT NULL,
  -- O que cada tipo precisa saber. `jsonb` de propósito: tipo de fonte novo
  -- (vídeo, relógio, desafio) entra sem migration de coluna.
  config    JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Centro do elemento, em % do palco.
  x         NUMERIC NOT NULL DEFAULT 50,
  y         NUMERIC NOT NULL DEFAULT 50,
  -- Largura em % do palco. A altura sai do conteúdo.
  largura   NUMERIC NOT NULL DEFAULT 40,
  escala    NUMERIC NOT NULL DEFAULT 1,
  camada    INTEGER NOT NULL DEFAULT 0,
  visivel   BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tv_fontes_tipo    CHECK (tipo IN ('texto', 'imagem', 'ranking', 'meta')),
  -- Deixa sair um pouco da borda (sangria proposital), mas não some da tela.
  CONSTRAINT tv_fontes_x       CHECK (x BETWEEN -20 AND 120),
  CONSTRAINT tv_fontes_y       CHECK (y BETWEEN -20 AND 120),
  CONSTRAINT tv_fontes_largura CHECK (largura BETWEEN 2 AND 100),
  CONSTRAINT tv_fontes_escala  CHECK (escala BETWEEN 0.1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_tv_fontes_cena ON public.tv_fontes (cena_id, camada);

COMMENT ON COLUMN public.tv_fontes.x IS
  'Centro em % da largura do palco. Percentual e nao pixel: e o que faz a previa '
  'bater com a TV em qualquer resolucao.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Estado — o que cada tela está exibindo agora
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A metade durável do corte. O broadcast faz a parede mudar no mesmo segundo;
-- ESTA tabela é o que faz a TV voltar sozinha ao que estava depois de um
-- reboot, de uma queda de rede ou do Windows Update das 3h da manhã.

CREATE TABLE IF NOT EXISTS public.tv_estado (
  tela_id        UUID PRIMARY KEY REFERENCES public.tv_telas(id) ON DELETE CASCADE,
  cena_id        UUID REFERENCES public.tv_cenas(id) ON DELETE SET NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.tv_estado IS
  'Uma linha por tela: a cena no ar. E a durabilidade do corte — o palco le '
  'daqui ao abrir e ao reconectar.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS — as tabelas ficam fechadas; o publico entra so pela RPC
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tv_telas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_cenas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_fontes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tv_estado ENABLE ROW LEVEL SECURITY;

-- ── Telas ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tv_telas_select ON public.tv_telas;
CREATE POLICY tv_telas_select ON public.tv_telas
  FOR SELECT TO authenticated
  USING (public.fn_user_tem('ver_modo_tv') AND public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS tv_telas_write ON public.tv_telas;
CREATE POLICY tv_telas_write ON public.tv_telas
  FOR ALL TO authenticated
  USING (public.fn_user_tem('tv_gerenciar_telas') AND public.fn_can_access_empresa(empresa_id))
  WITH CHECK (public.fn_user_tem('tv_gerenciar_telas') AND public.fn_can_access_empresa(empresa_id));

-- ── Cenas ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tv_cenas_select ON public.tv_cenas;
CREATE POLICY tv_cenas_select ON public.tv_cenas
  FOR SELECT TO authenticated
  USING (public.fn_user_tem('ver_modo_tv') AND public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS tv_cenas_write ON public.tv_cenas;
CREATE POLICY tv_cenas_write ON public.tv_cenas
  FOR ALL TO authenticated
  USING (public.fn_user_tem('tv_editar_cenas') AND public.fn_can_access_empresa(empresa_id))
  WITH CHECK (public.fn_user_tem('tv_editar_cenas') AND public.fn_can_access_empresa(empresa_id));

-- ── Fontes ─────────────────────────────────────────────────────────────────
--
-- A fonte não carrega `empresa_id`: ela pertence à cena, e é a cena que
-- responde pelo escopo. Perguntar à cena evita a segunda cópia do escopo, que
-- é onde os dois divergem com o tempo.

DROP POLICY IF EXISTS tv_fontes_select ON public.tv_fontes;
CREATE POLICY tv_fontes_select ON public.tv_fontes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tv_cenas c
     WHERE c.id = cena_id
       AND public.fn_user_tem('ver_modo_tv')
       AND public.fn_can_access_empresa(c.empresa_id)
  ));

DROP POLICY IF EXISTS tv_fontes_write ON public.tv_fontes;
CREATE POLICY tv_fontes_write ON public.tv_fontes
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tv_cenas c
     WHERE c.id = cena_id
       AND public.fn_user_tem('tv_editar_cenas')
       AND public.fn_can_access_empresa(c.empresa_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tv_cenas c
     WHERE c.id = cena_id
       AND public.fn_user_tem('tv_editar_cenas')
       AND public.fn_can_access_empresa(c.empresa_id)
  ));

-- ── Estado ─────────────────────────────────────────────────────────────────
--
-- Escrever aqui É ir ao ar. Por isso a chave é `tv_cortar` e não
-- `tv_editar_cenas`: montar a cena e decidir que ela vai para a parede da
-- empresa inteira são decisões diferentes, e é assim que redação de
-- transmissão funciona.

DROP POLICY IF EXISTS tv_estado_select ON public.tv_estado;
CREATE POLICY tv_estado_select ON public.tv_estado
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tv_telas t
     WHERE t.id = tela_id
       AND public.fn_user_tem('ver_modo_tv')
       AND public.fn_can_access_empresa(t.empresa_id)
  ));

-- Sem policy de escrita de propósito: quem corta passa por `fn_tv_cortar`.
-- Assim a checagem de `tv_cortar` mora num lugar só.

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. `fn_tv_palco` — a única porta pública
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Recebe o slug e devolve a cena no ar inteira resolvida: as fontes, o
-- enquadramento de cada uma e os números JÁ AGREGADOS.
--
-- Os números vêm de `analitico_recebimentos` agrupado, e nunca de varredura de
-- acordos: o palco reconsulta o dia inteiro, e uma TV que recalcula o mês a
-- cada 20 segundos vira carga fixa no banco durante todo o expediente.
--
-- O mês é o de São Paulo, não o do servidor. Sem isso, todo dia às 21h a
-- parede pularia para o mês seguinte e zeraria o ranking na frente de todos.
--
-- ## `p_cena_id`: a prévia da mesa passa por AQUI também
--
-- Sem parâmetro, devolve a cena NO AR — é o que a TV pede. Com uma cena
-- informada, devolve aquela cena — é o que a mesa pede para desenhar a prévia.
--
-- É o mesmo resolvedor nos dois casos, e isso é o ponto: se a prévia tivesse a
-- própria consulta, os números da mesa e os da parede divergiriam algum dia, e
-- a divergência apareceria justamente quando alguém confiasse nela.
--
-- A cena pedida precisa ser do mesmo setor da tela — o palco não empresta cena
-- de outro setor nem por parâmetro.

CREATE OR REPLACE FUNCTION public.fn_tv_palco(p_slug TEXT, p_cena_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tela    public.tv_telas;
  v_cena    public.tv_cenas;
  v_mes     DATE := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE;
  v_fontes  JSONB;
BEGIN
  SELECT * INTO v_tela
    FROM public.tv_telas t
   WHERE t.slug = lower(trim(COALESCE(p_slug, '')))
     AND t.ativa;

  -- Tela desconhecida não é erro: é o PC da TV com o endereço errado digitado.
  -- Devolver um objeto com `encontrada: false` deixa o palco desenhar um aviso
  -- legível a cinco metros em vez de estourar uma exceção que ninguém vê.
  IF v_tela.id IS NULL THEN
    RETURN jsonb_build_object('encontrada', FALSE);
  END IF;

  IF p_cena_id IS NOT NULL THEN
    -- Prévia da mesa: a cena pedida, desde que seja do setor desta tela.
    SELECT c.* INTO v_cena
      FROM public.tv_cenas c
     WHERE c.id = p_cena_id
       AND c.setor_id = v_tela.setor_id;
  ELSE
    -- A TV: a cena que está no ar.
    SELECT c.* INTO v_cena
      FROM public.tv_estado e
      JOIN public.tv_cenas c ON c.id = e.cena_id
     WHERE e.tela_id = v_tela.id;
  END IF;

  IF v_cena.id IS NULL THEN
    RETURN jsonb_build_object(
      'encontrada', TRUE,
      'tela',       jsonb_build_object('nome', v_tela.nome, 'slug', v_tela.slug),
      'cena',       NULL
    );
  END IF;

  SELECT COALESCE(jsonb_agg(f.fonte ORDER BY f.camada), '[]'::JSONB)
    INTO v_fontes
    FROM (
      SELECT
        fo.camada,
        jsonb_build_object(
          'id',      fo.id,
          'tipo',    fo.tipo,
          'config',  fo.config,
          'x',       fo.x,
          'y',       fo.y,
          'largura', fo.largura,
          'escala',  fo.escala,
          'camada',  fo.camada,
          'dados',   CASE fo.tipo

            -- ── Ranking: top N do setor no mês ─────────────────────────────
            WHEN 'ranking' THEN (
              SELECT COALESCE(jsonb_agg(r ORDER BY r.total DESC), '[]'::JSONB)
                FROM (
                  SELECT
                    COALESCE(NULLIF(trim(p.nome), ''), 'Sem nome') AS nome,
                    p.foto_url,
                    SUM(ar.valor_recebido)::NUMERIC AS total
                    FROM public.analitico_recebimentos ar
                    JOIN public.perfis p ON p.id = ar.operador_id
                   WHERE ar.empresa_id    = v_tela.empresa_id
                     AND ar.setor_id      = v_tela.setor_id
                     AND ar.mes_referencia = v_mes
                   GROUP BY p.id, p.nome, p.foto_url
                   ORDER BY 3 DESC
                   -- O `~ '^[0-9]+$'` antes do cast NÃO é paranoia: `config` é
                   -- jsonb livre, e um `"quantidade": "cinco"` faria o cast
                   -- estourar dentro do CASE e derrubar a resposta INTEIRA da
                   -- RPC. A tela ficaria preta por causa de uma fonte torta.
                   LIMIT GREATEST(1, LEAST(20, COALESCE(
                     CASE WHEN fo.config ->> 'quantidade' ~ '^[0-9]+$'
                          THEN (fo.config ->> 'quantidade')::INT END, 5)))
                ) r
            )

            -- ── Meta: alvo do setor e quanto já entrou ─────────────────────
            WHEN 'meta' THEN (
              SELECT jsonb_build_object(
                'alvo', COALESCE((
                  SELECT m.meta_valor
                    FROM public.metas m
                   WHERE m.empresa_id    = v_tela.empresa_id
                     AND m.tipo          = 'setor'
                     AND m.referencia_id = v_tela.setor_id
                     AND m.mes           = EXTRACT(MONTH FROM v_mes)::INT
                     AND m.ano           = EXTRACT(YEAR  FROM v_mes)::INT
                   LIMIT 1
                ), 0)::NUMERIC,
                'realizado', COALESCE((
                  SELECT SUM(ar.valor_recebido)
                    FROM public.analitico_recebimentos ar
                   WHERE ar.empresa_id     = v_tela.empresa_id
                     AND ar.setor_id       = v_tela.setor_id
                     AND ar.mes_referencia = v_mes
                ), 0)::NUMERIC
              )
            )

            -- Texto e imagem não consultam nada: o que desenham está no config.
            ELSE NULL
          END
        ) AS fonte
        FROM public.tv_fontes fo
       WHERE fo.cena_id = v_cena.id
         AND fo.visivel
    ) f;

  RETURN jsonb_build_object(
    'encontrada', TRUE,
    'tela',       jsonb_build_object('nome', v_tela.nome, 'slug', v_tela.slug),
    'cena',       jsonb_build_object('id', v_cena.id, 'nome', v_cena.nome),
    'fontes',     v_fontes,
    'servidor_em', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_palco(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_palco(TEXT, UUID) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.fn_tv_palco(TEXT, UUID) IS
  'A UNICA porta publica do Modo TV. Somente leitura, devolve so o que esta na '
  'tela, com os numeros ja agregados. Sem p_cena_id devolve a cena no ar (a TV); '
  'com p_cena_id devolve aquela cena (a previa da mesa). Nao acrescentar escrita.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. `fn_tv_sinal_vida` — o palco avisa que está de pé
-- ═══════════════════════════════════════════════════════════════════════════
--
-- É o que faz a mesa saber que a TV da recepção caiu ANTES de alguém passar
-- pelo corredor e reparar. Escreve um carimbo e nada mais.
--
-- Só regrava se o carimbo tiver mais de 30 segundos: sem isso, duas telas
-- batendo a cada 15s produziriam escrita constante em `tv_telas` o dia todo.

CREATE OR REPLACE FUNCTION public.fn_tv_sinal_vida(p_slug TEXT)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  UPDATE public.tv_telas
     SET ultimo_sinal = now()
   WHERE slug = lower(trim(COALESCE(p_slug, '')))
     AND ativa
     AND (ultimo_sinal IS NULL OR ultimo_sinal < now() - INTERVAL '30 seconds');
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_sinal_vida(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_sinal_vida(TEXT) TO anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. `fn_tv_cortar` — ir ao ar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A checagem de `tv_cortar` mora aqui e só aqui. `tv_estado` não tem policy de
-- escrita justamente para que não exista um segundo caminho até a parede.

CREATE OR REPLACE FUNCTION public.fn_tv_cortar(p_tela_id UUID, p_cena_id UUID)
RETURNS public.tv_estado
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tela      public.tv_telas;
  v_cena      public.tv_cenas;
  v_resultado public.tv_estado;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'TV_SEM_SESSAO: entre novamente no sistema.'
      USING errcode = '42501';
  END IF;

  IF NOT public.fn_user_tem('tv_cortar') THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO: voce nao tem a chave para mandar ao ar.'
      USING errcode = '42501';
  END IF;

  SELECT * INTO v_tela FROM public.tv_telas WHERE id = p_tela_id AND ativa;
  IF v_tela.id IS NULL THEN
    RAISE EXCEPTION 'TV_TELA: tela nao encontrada ou desativada.'
      USING errcode = 'check_violation';
  END IF;

  IF NOT public.fn_can_access_empresa(v_tela.empresa_id) THEN
    RAISE EXCEPTION 'TV_EMPRESA: esta empresa nao esta no seu acesso.'
      USING errcode = '42501';
  END IF;

  SELECT * INTO v_cena FROM public.tv_cenas WHERE id = p_cena_id;
  IF v_cena.id IS NULL THEN
    RAISE EXCEPTION 'TV_CENA: cena nao encontrada.'
      USING errcode = 'check_violation';
  END IF;

  -- A cena tem que ser do MESMO setor da tela. Sem isto, um erro de clique
  -- mandaria o ranking do Play 3 para a parede do Receptivo — e o pessoal do
  -- Receptivo passaria a tarde olhando número que não é deles.
  IF v_cena.setor_id <> v_tela.setor_id THEN
    RAISE EXCEPTION 'TV_SETOR: esta cena e de outro setor.'
      USING errcode = 'check_violation';
  END IF;

  INSERT INTO public.tv_estado (tela_id, cena_id, atualizado_em, atualizado_por)
  VALUES (p_tela_id, p_cena_id, now(), auth.uid())
  ON CONFLICT (tela_id) DO UPDATE SET
    cena_id        = EXCLUDED.cena_id,
    atualizado_em  = EXCLUDED.atualizado_em,
    atualizado_por = EXCLUDED.atualizado_por
  RETURNING * INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_cortar(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_cortar(UUID, UUID) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Permissões novas no catálogo do banco
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `fn_permissoes_catalogo` é encadeada (ver 20260825210000): a versão anterior
-- vira a fonte e esta acrescenta as linhas novas por UNION. Reescrever o
-- catálogo inteiro é como se perdem chaves.
--
-- Todas as cinco nascem com `padrao` VAZIO — desligadas para todo cargo
-- configurável. Enquanto ninguém ligar no painel, só o acesso total abre o
-- Modo TV. Isso é o pedido desta fase, e não um teto: o painel continua
-- podendo conceder qualquer uma delas a qualquer cargo, sem deploy.

ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_tv_20260902;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_tv_20260902()
  UNION ALL
  SELECT * FROM (VALUES
    -- `tenants` tem que ser IDÊNTICO ao do catálogo TypeScript: há um teste de
    -- contrato entre os dois lados, e ele reprova divergência. O Modo TV é da
    -- operação de cobrança da BookPlay — é lá que existem os setores, o ranking
    -- de recebimento e a TV na parede.
    ('ver_modo_tv',        ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('tv_editar_cenas',    ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('tv_cortar',          ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('tv_gerenciar_telas', ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('tv_enviar_midia',    ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

REVOKE ALL ON FUNCTION public.fn_permissoes_catalogo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_permissoes_catalogo() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao 20260902 adiciona o Modo TV sem '
  'reescrever nem perder o catalogo anterior.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Bucket da mídia do Modo TV
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Público na leitura porque o palco é anônimo e precisa carregar a arte da
-- campanha sem sessão. Escrita só para quem tem `tv_enviar_midia`.

-- `storage.objects` pertence a `supabase_storage_admin`, não ao dono das
-- tabelas do `public`. Dependendo do papel que aplica esta migration, o
-- CREATE POLICY levanta `insufficient_privilege` — e uma migration que morre
-- AQUI teria deixado para trás as tabelas, as RPCs e o catálogo já criados,
-- num estado meio aplicado que é chato de desfazer.
--
-- Por isso o bloco engole só esse erro e avisa. O Modo TV funciona sem o
-- bucket: a fonte de imagem aceita endereço colado à mão. O que falta, se cair
-- aqui, é o envio pelo computador — e o aviso diz exatamente o que rodar no
-- painel do Supabase para completar.

DO $bloco$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('tv', 'tv', TRUE)
  ON CONFLICT (id) DO NOTHING;

  DROP POLICY IF EXISTS tv_midia_leitura ON storage.objects;
  CREATE POLICY tv_midia_leitura ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'tv');

  DROP POLICY IF EXISTS tv_midia_envio ON storage.objects;
  CREATE POLICY tv_midia_envio ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'tv' AND public.fn_user_tem('tv_enviar_midia'));

  DROP POLICY IF EXISTS tv_midia_remocao ON storage.objects;
  CREATE POLICY tv_midia_remocao ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'tv' AND public.fn_user_tem('tv_enviar_midia'));

EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE
    'Bucket/policies do bucket "tv" NAO criados: sem privilegio em storage. '
    'Crie o bucket "tv" como publico no painel do Supabase e repita as tres '
    'policies (tv_midia_leitura / tv_midia_envio / tv_midia_remocao). Ate la, '
    'a fonte de imagem funciona por endereco colado, e o envio pelo computador nao.';
END
$bloco$;
