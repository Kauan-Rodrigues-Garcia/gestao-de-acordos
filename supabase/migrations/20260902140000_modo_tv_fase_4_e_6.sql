-- Modo TV — fases 4 e 6.
--
-- FASE 4  alerta ao vivo (o Alert Box) e a fonte de desafio.
-- FASE 6  roleta e bingo, com resultado sorteado no SERVIDOR.
--
-- (A fase 5 — mosaico, atalhos, várias telas — não tem migration: é tudo mesa.)
--
-- ## O alerta é resolvido pelo RELÓGIO, como a rotação
--
-- Um alerta fica no ar por `duracao_s` a partir de `criado_em`. O palco não
-- marca nada como "já exibi" — se marcasse, a superfície pública passaria a
-- ESCREVER no banco, e a regra desde a fase 1 é que ela só lê.
--
-- Ganha-se ainda: recarregar a página no meio de um alerta não o perde nem o
-- repete, e duas telas do mesmo setor mostram a mesma coisa no mesmo instante,
-- sem combinarem nada.
--
-- ## O sorteio é decidido no SERVIDOR
--
-- Nunca no navegador. Duas razões, e a segunda é a que importa: (1) duas telas
-- veriam vencedores diferentes; (2) sorteio decidido no cliente é sorteio que
-- não se pode auditar — e sorteio de prêmio sem registro de quem entrou e quem
-- ganhou vira discussão na segunda-feira. `tv_sorteios` guarda a lista de
-- participantes no momento do giro, o resultado, quem girou e quando.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Alertas
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tv_alertas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id       UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  titulo         TEXT NOT NULL,
  mensagem       TEXT,
  midia_url      TEXT,
  som_url        TEXT,
  duracao_s      INTEGER NOT NULL DEFAULT 10,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por     UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_por_nome TEXT,
  CONSTRAINT tv_alertas_duracao CHECK (duracao_s BETWEEN 3 AND 60)
);

-- O índice é do caminho quente: o palco pergunta "há alerta vivo neste setor?"
-- a cada leitura, o dia inteiro.
CREATE INDEX IF NOT EXISTS idx_tv_alertas_setor_recente
  ON public.tv_alertas (setor_id, criado_em DESC);

ALTER TABLE public.tv_alertas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tv_alertas_select ON public.tv_alertas;
CREATE POLICY tv_alertas_select ON public.tv_alertas
  FOR SELECT TO authenticated
  USING (public.fn_user_tem('ver_modo_tv') AND public.fn_can_access_empresa(empresa_id));

-- Sem policy de escrita: quem dispara passa por `fn_tv_alerta_disparar`, e a
-- checagem de permissão mora num lugar só.

COMMENT ON TABLE public.tv_alertas IS
  'O Alert Box: entra por cima da cena, fica duracao_s e sai. Vive pelo relogio '
  '(criado_em + duracao_s), sem o palco precisar escrever nada.';

CREATE OR REPLACE FUNCTION public.fn_tv_alerta_disparar(
  p_setor_id  UUID,
  p_titulo    TEXT,
  p_mensagem  TEXT DEFAULT NULL,
  p_midia_url TEXT DEFAULT NULL,
  p_som_url   TEXT DEFAULT NULL,
  p_duracao_s INTEGER DEFAULT 10
)
RETURNS public.tv_alertas
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa UUID;
  v_nome    TEXT;
  v_saida   public.tv_alertas;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'TV_SEM_SESSAO: entre novamente no sistema.' USING errcode = '42501';
  END IF;

  -- Disparar alerta muda o que a operação inteira vê naquele instante. É a
  -- mesma natureza de cortar, e por isso a mesma chave.
  IF NOT public.fn_user_tem('tv_cortar') THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO: disparar alerta muda o que esta na parede.'
      USING errcode = '42501';
  END IF;

  SELECT s.empresa_id INTO v_empresa FROM public.setores s WHERE s.id = p_setor_id;
  IF v_empresa IS NULL OR NOT public.fn_can_access_empresa(v_empresa) THEN
    RAISE EXCEPTION 'TV_SETOR: setor fora do seu acesso.' USING errcode = '42501';
  END IF;

  IF COALESCE(trim(p_titulo), '') = '' THEN
    RAISE EXCEPTION 'TV_ALERTA_TITULO: o alerta precisa de um titulo.'
      USING errcode = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(trim(p.nome), ''), p.email) INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  INSERT INTO public.tv_alertas (
    empresa_id, setor_id, titulo, mensagem, midia_url, som_url, duracao_s,
    criado_por, criado_por_nome
  ) VALUES (
    v_empresa, p_setor_id, trim(p_titulo), NULLIF(trim(COALESCE(p_mensagem, '')), ''),
    NULLIF(trim(COALESCE(p_midia_url, '')), ''), NULLIF(trim(COALESCE(p_som_url, '')), ''),
    GREATEST(3, LEAST(60, COALESCE(p_duracao_s, 10))),
    auth.uid(), v_nome
  )
  RETURNING * INTO v_saida;

  RETURN v_saida;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_alerta_disparar(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_alerta_disparar(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Sorteios — roleta e bingo
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tv_sorteios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id      UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  tipo          TEXT NOT NULL,
  titulo        TEXT NOT NULL,
  -- Congelada NO MOMENTO DA CRIAÇÃO. Se lesse a lista de gente do setor na hora
  -- do giro, alguém entrando ou saindo entre a abertura e o giro mudaria a
  -- disputa — e ninguem conseguiria reconstruir depois quem estava valendo.
  participantes JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Roleta: {"vencedor": "...", "indice": 3}
  -- Bingo:  {"numeros": [7, 42, 13]}
  resultado     JSONB NOT NULL DEFAULT '{}'::JSONB,
  estado        TEXT NOT NULL DEFAULT 'aberto',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por    UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  girado_em     TIMESTAMPTZ,
  girado_por    UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  girado_por_nome TEXT,
  CONSTRAINT tv_sorteios_tipo   CHECK (tipo IN ('roleta', 'bingo')),
  CONSTRAINT tv_sorteios_estado CHECK (estado IN ('aberto', 'girando', 'encerrado'))
);

CREATE INDEX IF NOT EXISTS idx_tv_sorteios_setor
  ON public.tv_sorteios (setor_id, criado_em DESC);

ALTER TABLE public.tv_sorteios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tv_sorteios_select ON public.tv_sorteios;
CREATE POLICY tv_sorteios_select ON public.tv_sorteios
  FOR SELECT TO authenticated
  USING (public.fn_user_tem('ver_modo_tv') AND public.fn_can_access_empresa(empresa_id));

COMMENT ON TABLE public.tv_sorteios IS
  'Roleta e bingo. Participantes congelados na criacao e resultado sorteado no '
  'servidor: e o que permite responder "quem estava valendo e quem ganhou".';

-- ── Criar ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_tv_sorteio_criar(
  p_setor_id      UUID,
  p_tipo          TEXT,
  p_titulo        TEXT,
  p_participantes JSONB DEFAULT NULL
)
RETURNS public.tv_sorteios
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa UUID;
  v_lista   JSONB;
  v_saida   public.tv_sorteios;
BEGIN
  IF NOT public.fn_user_tem('tv_cortar') THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO: abrir sorteio muda o que esta na parede.'
      USING errcode = '42501';
  END IF;

  SELECT s.empresa_id INTO v_empresa FROM public.setores s WHERE s.id = p_setor_id;
  IF v_empresa IS NULL OR NOT public.fn_can_access_empresa(v_empresa) THEN
    RAISE EXCEPTION 'TV_SETOR: setor fora do seu acesso.' USING errcode = '42501';
  END IF;

  /*
   * Sem lista informada, entra o setor inteiro — que é o caso comum e poupa
   * digitar trinta nomes. Só gente ativa: sortear alguém que saiu da empresa é
   * o tipo de constrangimento que acontece na frente de todo mundo.
   */
  IF p_participantes IS NULL OR jsonb_array_length(p_participantes) = 0 THEN
    SELECT COALESCE(jsonb_agg(nome ORDER BY nome), '[]'::JSONB) INTO v_lista
      FROM (
        SELECT COALESCE(NULLIF(trim(p.nome), ''), p.email) AS nome
          FROM public.perfis p
         WHERE p.setor_id = p_setor_id
           AND p.empresa_id = v_empresa
           AND COALESCE(p.ativo, TRUE)
      ) q;
  ELSE
    v_lista := p_participantes;
  END IF;

  IF jsonb_array_length(v_lista) = 0 THEN
    RAISE EXCEPTION 'TV_SORTEIO_VAZIO: nao ha ninguem para sortear neste setor.'
      USING errcode = 'check_violation';
  END IF;

  INSERT INTO public.tv_sorteios (
    empresa_id, setor_id, tipo, titulo, participantes, criado_por
  ) VALUES (
    v_empresa, p_setor_id,
    CASE WHEN p_tipo = 'bingo' THEN 'bingo' ELSE 'roleta' END,
    COALESCE(NULLIF(trim(p_titulo), ''), 'Sorteio'),
    v_lista, auth.uid()
  )
  RETURNING * INTO v_saida;

  RETURN v_saida;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_sorteio_criar(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_sorteio_criar(UUID, TEXT, TEXT, JSONB)
  TO authenticated, service_role;

-- ── Girar a roleta ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_tv_sorteio_girar(p_sorteio_id UUID)
RETURNS public.tv_sorteios
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_s      public.tv_sorteios;
  v_indice INT;
  v_nome   TEXT;
  v_quem   TEXT;
BEGIN
  IF NOT public.fn_user_tem('tv_cortar') THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO: girar muda o que esta na parede.'
      USING errcode = '42501';
  END IF;

  SELECT * INTO v_s FROM public.tv_sorteios WHERE id = p_sorteio_id;
  IF v_s.id IS NULL OR NOT public.fn_can_access_empresa(v_s.empresa_id) THEN
    RAISE EXCEPTION 'TV_SORTEIO: sorteio fora do seu acesso.' USING errcode = '42501';
  END IF;

  IF v_s.tipo <> 'roleta' THEN
    RAISE EXCEPTION 'TV_SORTEIO_TIPO: este sorteio e de bingo.'
      USING errcode = 'check_violation';
  END IF;

  -- Girar de novo reescreveria o vencedor de um sorteio já feito, e a parede
  -- passaria a mostrar outro nome sem ninguém entender. Uma vez girado, acabou.
  IF v_s.estado = 'encerrado' THEN
    RAISE EXCEPTION 'TV_SORTEIO_FEITO: este sorteio ja foi girado.'
      USING errcode = 'check_violation';
  END IF;

  v_indice := floor(random() * jsonb_array_length(v_s.participantes))::INT;
  v_nome   := v_s.participantes ->> v_indice;

  SELECT COALESCE(NULLIF(trim(p.nome), ''), p.email) INTO v_quem
    FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.tv_sorteios
     SET resultado = jsonb_build_object('vencedor', v_nome, 'indice', v_indice),
         estado    = 'encerrado',
         girado_em = now(),
         girado_por = auth.uid(),
         girado_por_nome = v_quem
   WHERE id = p_sorteio_id
  RETURNING * INTO v_s;

  RETURN v_s;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_sorteio_girar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_sorteio_girar(UUID) TO authenticated, service_role;

-- ── Sortear o próximo número do bingo ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_tv_bingo_sortear(p_sorteio_id UUID, p_ate INT DEFAULT 75)
RETURNS public.tv_sorteios
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_s        public.tv_sorteios;
  v_saidos   INT[];
  v_novo     INT;
  v_teto     INT := GREATEST(10, LEAST(99, COALESCE(p_ate, 75)));
BEGIN
  IF NOT public.fn_user_tem('tv_cortar') THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO: sortear muda o que esta na parede.'
      USING errcode = '42501';
  END IF;

  SELECT * INTO v_s FROM public.tv_sorteios WHERE id = p_sorteio_id;
  IF v_s.id IS NULL OR NOT public.fn_can_access_empresa(v_s.empresa_id) THEN
    RAISE EXCEPTION 'TV_SORTEIO: sorteio fora do seu acesso.' USING errcode = '42501';
  END IF;

  IF v_s.tipo <> 'bingo' THEN
    RAISE EXCEPTION 'TV_SORTEIO_TIPO: este sorteio e de roleta.'
      USING errcode = 'check_violation';
  END IF;

  SELECT COALESCE(array_agg(x::INT), ARRAY[]::INT[]) INTO v_saidos
    FROM jsonb_array_elements_text(COALESCE(v_s.resultado -> 'numeros', '[]'::JSONB)) x;

  IF array_length(v_saidos, 1) >= v_teto THEN
    RAISE EXCEPTION 'TV_BINGO_FIM: todos os numeros ja sairam.'
      USING errcode = 'check_violation';
  END IF;

  /*
   * Sorteia entre os que FALTAM, em vez de tentar de novo até dar um número
   * inédito. A tentativa-e-erro fica cada vez mais lenta conforme a cartela
   * enche, e no último número poderia rodar por muito tempo.
   */
  SELECT n INTO v_novo
    FROM generate_series(1, v_teto) n
   WHERE NOT (n = ANY (v_saidos))
   ORDER BY random()
   LIMIT 1;

  UPDATE public.tv_sorteios
     SET resultado = jsonb_set(
           COALESCE(v_s.resultado, '{}'::JSONB), '{numeros}',
           COALESCE(v_s.resultado -> 'numeros', '[]'::JSONB) || to_jsonb(v_novo)),
         estado    = 'girando',
         girado_em = now(),
         girado_por = auth.uid()
   WHERE id = p_sorteio_id
  RETURNING * INTO v_s;

  RETURN v_s;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_bingo_sortear(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_bingo_sortear(UUID, INT) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Fontes novas: sorteio e desafio
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tv_fontes DROP CONSTRAINT IF EXISTS tv_fontes_tipo;
ALTER TABLE public.tv_fontes
  ADD CONSTRAINT tv_fontes_tipo
  CHECK (tipo IN ('texto', 'imagem', 'ranking', 'meta', 'fundo', 'relogio',
                  'video', 'sorteio', 'desafio'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. `fn_tv_palco` — agora devolve alerta vivo, sorteio e desafio
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_tv_palco(p_slug TEXT, p_cena_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tela        public.tv_telas;
  v_cena        public.tv_cenas;
  v_mes         DATE := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE;
  v_hoje        DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_fontes      JSONB;
  v_alertas     JSONB;
  v_proxima_s   INTEGER := NULL;
  v_fila_id     UUID;
  v_agora       BIGINT  := EXTRACT(EPOCH FROM now())::BIGINT;
BEGIN
  SELECT * INTO v_tela
    FROM public.tv_telas t
   WHERE t.slug = lower(trim(COALESCE(p_slug, '')))
     AND t.ativa;

  IF v_tela.id IS NULL THEN
    RETURN jsonb_build_object('encontrada', FALSE);
  END IF;

  IF p_cena_id IS NOT NULL THEN
    SELECT c.* INTO v_cena
      FROM public.tv_cenas c
     WHERE c.id = p_cena_id AND c.setor_id = v_tela.setor_id;

  ELSIF v_tela.rotacao_ativa THEN
    WITH fila AS (
      SELECT c.*,
             SUM(c.duracao_s) OVER (ORDER BY c.ordem, c.id
                                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS fim,
             SUM(c.duracao_s) OVER () AS total
        FROM public.tv_cenas c
       WHERE c.setor_id = v_tela.setor_id AND c.na_rotacao
    )
    SELECT f.id, (f.fim - (v_agora % f.total))::INT
      INTO v_fila_id, v_proxima_s
      FROM fila f
     WHERE (v_agora % f.total) < f.fim
     ORDER BY f.fim
     LIMIT 1;

    IF v_fila_id IS NOT NULL THEN
      SELECT * INTO v_cena FROM public.tv_cenas WHERE id = v_fila_id;
    END IF;

  ELSE
    SELECT c.* INTO v_cena
      FROM public.tv_estado e
      JOIN public.tv_cenas c ON c.id = e.cena_id
     WHERE e.tela_id = v_tela.id;
  END IF;

  IF v_cena.id IS NULL AND p_cena_id IS NULL THEN
    SELECT c.* INTO v_cena
      FROM public.tv_cenas c
     WHERE c.setor_id = v_tela.setor_id AND c.emergencia;
  END IF;

  /*
   * Alertas vivos: os criados há menos de `duracao_s`. Mais novo primeiro — o
   * palco mostra um de cada vez e enfileira o resto.
   */
  SELECT COALESCE(jsonb_agg(a ORDER BY a.criado_em DESC), '[]'::JSONB)
    INTO v_alertas
    FROM (
      SELECT al.id, al.titulo, al.mensagem, al.midia_url, al.som_url,
             al.duracao_s, al.criado_em,
             EXTRACT(EPOCH FROM (al.criado_em + (al.duracao_s || ' seconds')::INTERVAL - now()))::INT AS resta_s
        FROM public.tv_alertas al
       WHERE al.setor_id = v_tela.setor_id
         AND al.criado_em > now() - (al.duracao_s || ' seconds')::INTERVAL
       ORDER BY al.criado_em DESC
       LIMIT 5
    ) a;

  IF v_cena.id IS NULL THEN
    RETURN jsonb_build_object(
      'encontrada', TRUE,
      'tela',    jsonb_build_object('nome', v_tela.nome, 'slug', v_tela.slug,
                                    'rotacao', v_tela.rotacao_ativa),
      'cena',    NULL,
      'alertas', v_alertas
    );
  END IF;

  SELECT COALESCE(jsonb_agg(f.fonte ORDER BY f.camada), '[]'::JSONB)
    INTO v_fontes
    FROM (
      SELECT
        fo.camada,
        jsonb_build_object(
          'id', fo.id, 'tipo', fo.tipo, 'config', fo.config,
          'x', fo.x, 'y', fo.y, 'largura', fo.largura, 'escala', fo.escala,
          'camada', fo.camada, 'volume', fo.volume, 'mudo', fo.mudo,
          'dados', CASE fo.tipo

            WHEN 'ranking' THEN (
              SELECT COALESCE(jsonb_agg(r ORDER BY r.total DESC), '[]'::JSONB)
                FROM (
                  SELECT COALESCE(NULLIF(trim(p.nome), ''), 'Sem nome') AS nome,
                         p.foto_url,
                         SUM(ar.valor_recebido)::NUMERIC AS total
                    FROM public.analitico_recebimentos ar
                    JOIN public.perfis p ON p.id = ar.operador_id
                   WHERE ar.empresa_id     = v_tela.empresa_id
                     AND ar.setor_id       = v_tela.setor_id
                     AND ar.mes_referencia = v_mes
                   GROUP BY p.id, p.nome, p.foto_url
                   ORDER BY 3 DESC
                   LIMIT GREATEST(1, LEAST(20, COALESCE(
                     CASE WHEN fo.config ->> 'quantidade' ~ '^[0-9]+$'
                          THEN (fo.config ->> 'quantidade')::INT END, 5)))
                ) r
            )

            WHEN 'meta' THEN (
              SELECT jsonb_build_object(
                'alvo', COALESCE((
                  SELECT m.meta_valor FROM public.metas m
                   WHERE m.empresa_id = v_tela.empresa_id AND m.tipo = 'setor'
                     AND m.referencia_id = v_tela.setor_id
                     AND m.mes = EXTRACT(MONTH FROM v_mes)::INT
                     AND m.ano = EXTRACT(YEAR FROM v_mes)::INT
                   LIMIT 1), 0)::NUMERIC,
                'realizado', COALESCE((
                  SELECT SUM(ar.valor_recebido) FROM public.analitico_recebimentos ar
                   WHERE ar.empresa_id = v_tela.empresa_id
                     AND ar.setor_id = v_tela.setor_id
                     AND ar.mes_referencia = v_mes), 0)::NUMERIC
              )
            )

            /*
             * Desafio: o que está valendo AGORA neste setor.
             *
             * Nome, prêmio e quanto falta. A classificação da gincana NÃO vem
             * aqui: ela mora em `fn_desafio_dados`, que resolve clones, equipes
             * e escopo por setor a partir de quem chamou — e quem chama aqui é
             * o anônimo. Replicar aquela lógica às cegas produziria um segundo
             * placar, diferente do que o Analítico mostra, e um placar que
             * discorda do sistema na parede é pior que placar nenhum.
             */
            WHEN 'desafio' THEN (
              SELECT jsonb_build_object(
                'nome', d.nome, 'premio', d.premio,
                'data_fim', d.data_fim,
                'dias_restantes', GREATEST(0, (d.data_fim - v_hoje))
              )
                FROM public.desafios d
                JOIN public.desafios_setores ds ON ds.desafio_id = d.id
               WHERE d.empresa_id = v_tela.empresa_id
                 AND ds.setor_id  = v_tela.setor_id
                 AND d.status     = 'ativo'
                 AND v_hoje BETWEEN d.data_inicio AND d.data_fim
               ORDER BY d.data_fim
               LIMIT 1
            )

            -- Sorteio: o mais recente do setor. O vencedor vem do SERVIDOR.
            WHEN 'sorteio' THEN (
              SELECT jsonb_build_object(
                'id', s.id, 'tipo', s.tipo, 'titulo', s.titulo,
                'participantes', s.participantes, 'resultado', s.resultado,
                'estado', s.estado, 'girado_em', s.girado_em
              )
                FROM public.tv_sorteios s
               WHERE s.setor_id = v_tela.setor_id
               ORDER BY s.criado_em DESC
               LIMIT 1
            )

            ELSE NULL
          END
        ) AS fonte
        FROM public.tv_fontes fo
       WHERE fo.cena_id = v_cena.id AND fo.visivel
    ) f;

  RETURN jsonb_build_object(
    'encontrada',   TRUE,
    'tela',         jsonb_build_object('nome', v_tela.nome, 'slug', v_tela.slug,
                                       'rotacao', v_tela.rotacao_ativa),
    'cena',         jsonb_build_object('id', v_cena.id, 'nome', v_cena.nome,
                                       'transicao', v_cena.transicao),
    'fontes',       v_fontes,
    'alertas',      v_alertas,
    'proxima_em_s', v_proxima_s,
    'servidor_em',  now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_palco(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_palco(TEXT, UUID) TO anon, authenticated, service_role;
