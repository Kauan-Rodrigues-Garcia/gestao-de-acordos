-- ============================================================================
-- Modo TV: o palco parava de responder ao mandar cena ao ar
-- ============================================================================
--
-- ## O sintoma
--
-- Clicar em «mandar ao ar» e a tela do link gerado passar a mostrar
-- «Reconectando…». Parecia queda de rede. Não era.
--
-- ## O defeito
--
-- `fn_tv_palco` juntava `desafios` com `desafios_setores` por `ds.desafio_id`.
-- Essa coluna NÃO existe. `desafios_setores` é outra coisa: é a tabela que liga
-- a ABA Desafios a um setor — (empresa_id, setor_id, ativo) —, e não uma tabela
-- de ligação de desafio. O desafio já carrega `setor_id` na própria linha.
--
--   ERROR: 42703 column ds.desafio_id does not exist
--
-- ## Por que quebrava mesmo sem fonte de desafio na cena
--
-- O `CASE fo.tipo ... END` é UMA expressão. O Postgres resolve os nomes de
-- TODOS os ramos ao planejar a consulta, muito antes de saber qual ramo cada
-- linha vai tomar. Bastava a cena ter QUALQUER fonte para a RPC estourar — e a
-- cena de teste tinha três.
--
-- E ela estoura no palco ANÔNIMO, que por desenho trata erro como queda de rede
-- e mantém a última cena boa com o aviso «Reconectando…». Daí a leitura de que
-- a conexão caía logo depois do corte: cortar põe a cena no ar, o palco relê, a
-- RPC quebra, o aviso aparece. O corte funcionava; a leitura seguinte é que
-- morria.
--
-- ## A correção
--
-- Ler `d.setor_id` direto, sem join. E, já que `desafios_setores` foi
-- consultada por engano, ela passa a ser consultada de propósito: um setor que
-- desligou o módulo de Desafios não mostra desafio na parede.
--
-- O resto da função fica letra por letra como estava.
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
    'proxima_em_s', v_proxima_s,
    'servidor_em',  now()
  );
END;
$function$;

REVOKE ALL     ON FUNCTION public.fn_tv_palco(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_tv_palco(TEXT, UUID) TO anon, authenticated, service_role;

-- ── Prova: a RPC responde para uma tela ativa com fontes na cena ────────────
DO $prova$
DECLARE
  v_slug TEXT;
  v_out  JSONB;
BEGIN
  SELECT t.slug INTO v_slug
    FROM public.tv_telas t
    JOIN public.tv_estado e ON e.tela_id = t.id
    JOIN public.tv_fontes fo ON fo.cena_id = e.cena_id
   WHERE t.ativa
   LIMIT 1;

  IF v_slug IS NULL THEN
    RAISE NOTICE 'Nenhuma tela ativa com cena no ar para provar — nada a verificar.';
    RETURN;
  END IF;

  v_out := public.fn_tv_palco(v_slug);

  IF NOT COALESCE((v_out ->> 'encontrada')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION 'a tela % deveria ser encontrada', v_slug;
  END IF;

  RAISE NOTICE 'fn_tv_palco(%) respondeu com % fonte(s).',
    v_slug, jsonb_array_length(COALESCE(v_out -> 'fontes', '[]'::JSONB));
END
$prova$;
