-- ============================================================================
-- Modo TV 2.0 — fase 2: o palco lê as métricas e o ranking aceita equipe
-- ============================================================================
--
-- Duas mudanças em `fn_tv_palco`; o resto da função fica letra por letra.
--
-- 1. A conta de meta SAI daqui e vai para `fn_tv_metricas_setor`, onde o dia
--    útil segue a mesma régua do dashboard. A fonte de meta passa a receber o
--    pacote inteiro — alvo, realizado, projeção, meta diária, ritmo, série — e
--    qual número desenhar vira decisão do `config.modelo` na tela. Um template
--    novo deixa de pedir migration.
--
--    A chamada é UMA por cena, e não uma por fonte: uma cena com barra +
--    projeção + meta do dia leria o mesmo número três vezes.
--
-- 2. O ranking ganha `config.equipe_id`. Sem a chave, o setor inteiro, como
--    sempre foi. Com ela, só aquela equipe — incluindo quem está CLONADO nela,
--    porque na BookPlay a equipe é onde a pessoa trabalha, não onde ela está
--    cadastrada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_tv_palco(p_slug TEXT, p_cena_id UUID DEFAULT NULL::UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tela        public.tv_telas;
  v_cena        public.tv_cenas;
  v_mes         DATE := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE;
  v_hoje        DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_fontes      JSONB;
  v_alertas     JSONB;
  v_metricas    JSONB;
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

  -- Uma consulta so de metricas para a cena inteira: varias fontes de meta na
  -- mesma cena (barra + projecao + diaria) leriam o mesmo numero N vezes.
  v_metricas := public.fn_tv_metricas_setor(v_tela.empresa_id, v_tela.setor_id, v_mes);

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
                     -- Recorte por equipe. Sem a chave, o setor inteiro.
                     AND (
                       fo.config ->> 'equipe_id' IS NULL
                       OR p.equipe_id = (fo.config ->> 'equipe_id')::UUID
                       OR EXISTS (
                         SELECT 1 FROM public.equipe_operadores_clones c
                          WHERE c.operador_id = p.id
                            AND c.equipe_id = (fo.config ->> 'equipe_id')::UUID
                       )
                     )
                   GROUP BY p.id, p.nome, p.foto_url
                   ORDER BY 3 DESC
                   LIMIT GREATEST(1, LEAST(20, COALESCE(
                     CASE WHEN fo.config ->> 'quantidade' ~ '^[0-9]+$'
                          THEN (fo.config ->> 'quantidade')::INT END, 5)))
                ) r
            )

            -- Meta: o pacote inteiro. Qual numero desenhar e decisao do
            -- `config.modelo` na tela, nao daqui — assim um template novo
            -- nao pede migration.
            WHEN 'meta' THEN v_metricas

            /*
             * Desafio: o que está valendo AGORA neste setor.
             *
             * `desafios.setor_id` mora na própria linha — não existe tabela de
             * ligação, e foi tentar usar uma que quebrou esta função inteira.
             * `desafios_setores` entra aqui pelo que ela realmente é: a chave
             * que liga a aba Desafios a um setor. Setor com o módulo desligado
             * não mostra desafio na parede.
             *
             * A classificação da gincana NÃO vem aqui: ela mora em
             * `fn_desafio_dados`, que resolve clones, equipes e escopo por setor
             * a partir de quem chamou — e quem chama aqui é o anônimo.
             */
            WHEN 'desafio' THEN (
              SELECT jsonb_build_object(
                'nome', d.nome, 'premio', d.premio,
                'data_fim', d.data_fim,
                'dias_restantes', GREATEST(0, (d.data_fim - v_hoje))
              )
                FROM public.desafios d
               WHERE d.empresa_id = v_tela.empresa_id
                 AND d.setor_id   = v_tela.setor_id
                 AND d.status     = 'ativo'
                 AND v_hoje BETWEEN d.data_inicio AND d.data_fim
                 AND EXISTS (
                   SELECT 1 FROM public.desafios_setores ds
                    WHERE ds.empresa_id = v_tela.empresa_id
                      AND ds.setor_id   = v_tela.setor_id
                      AND ds.ativo
                 )
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
    'metricas',     v_metricas,
    'proxima_em_s', v_proxima_s,
    'servidor_em',  now()
  );
END;
$function$;

REVOKE ALL     ON FUNCTION public.fn_tv_palco(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_tv_palco(TEXT, UUID) TO anon, authenticated, service_role;

