-- Modo TV — fases 2 e 3.
--
-- FASE 2  transições, rotação automática, cena de emergência, tirar do ar.
-- FASE 3  biblioteca de mídia, vídeo em laço, volume por fonte.
--
-- ## A rotação é calculada no BANCO, não no navegador
--
-- Poderia ser um `setInterval` no palco avançando a fila. Não é, e o motivo é
-- o recarregamento: a TV recarrega de madrugada, cai a rede, alguém dá F5 — e
-- um contador em memória recomeçaria do zero toda vez, deixando a fila sempre
-- presa nas primeiras cenas.
--
-- Aqui a cena atual é FUNÇÃO DO RELÓGIO: soma-se a duração das cenas, tira-se o
-- resto da divisão do horário pelo total do ciclo, e a cena é a que cobre esse
-- instante. Recarregar cai exatamente onde a fila estava. Duas TVs do mesmo
-- setor ficam em sincronia sem combinarem nada.
--
-- A RPC devolve junto `proxima_em_s` — quantos segundos faltam para a troca —
-- para o palco agendar a releitura no momento certo em vez de ficar
-- perguntando de 20 em 20 segundos e trocar de cena atrasado.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Cenas: transição, duração na rotação, emergência
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tv_cenas
  ADD COLUMN IF NOT EXISTS transicao   TEXT    NOT NULL DEFAULT 'corte',
  ADD COLUMN IF NOT EXISTS duracao_s   INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS na_rotacao  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS emergencia  BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.tv_cenas DROP CONSTRAINT IF EXISTS tv_cenas_transicao;
ALTER TABLE public.tv_cenas
  ADD CONSTRAINT tv_cenas_transicao CHECK (transicao IN ('corte', 'fade', 'deslize'));

ALTER TABLE public.tv_cenas DROP CONSTRAINT IF EXISTS tv_cenas_duracao;
ALTER TABLE public.tv_cenas
  -- Piso de 5s: abaixo disso a parede vira estroboscópio e ninguém lê nada.
  -- Teto de 1h: acima disso não é rotação, é cena fixa — e para isso existe
  -- desligar a rotação.
  ADD CONSTRAINT tv_cenas_duracao CHECK (duracao_s BETWEEN 5 AND 3600);

/*
 * Uma cena de emergência por setor. É a que entra quando não há nada no ar —
 * melhor uma arte da empresa na parede do que "Nenhuma cena no ar" em cinza na
 * frente da operação inteira.
 */
CREATE UNIQUE INDEX IF NOT EXISTS ux_tv_cena_emergencia
  ON public.tv_cenas (setor_id) WHERE emergencia;

COMMENT ON COLUMN public.tv_cenas.duracao_s IS
  'Segundos que a cena fica no ar durante a rotacao automatica.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Telas: a rotação ligada ou desligada
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tv_telas
  ADD COLUMN IF NOT EXISTS rotacao_ativa BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.tv_telas.rotacao_ativa IS
  'Ligada, a cena vem do relogio e nao de tv_estado. Cortar a mao desliga: '
  'quem assume o controle manual nao quer a fila puxando a tela de volta.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Fontes: vídeo e som
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tv_fontes
  ADD COLUMN IF NOT EXISTS volume NUMERIC NOT NULL DEFAULT 1,
  -- Mudo por PADRÃO, e isto não é detalhe: som na parede mal usado faz alguém
  -- desligar a TV no segundo dia. Quem quiser som liga de propósito.
  ADD COLUMN IF NOT EXISTS mudo   BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.tv_fontes DROP CONSTRAINT IF EXISTS tv_fontes_volume;
ALTER TABLE public.tv_fontes
  ADD CONSTRAINT tv_fontes_volume CHECK (volume BETWEEN 0 AND 1);

ALTER TABLE public.tv_fontes DROP CONSTRAINT IF EXISTS tv_fontes_tipo;
ALTER TABLE public.tv_fontes
  ADD CONSTRAINT tv_fontes_tipo
  CHECK (tipo IN ('texto', 'imagem', 'ranking', 'meta', 'fundo', 'relogio', 'video'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Biblioteca de mídia
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O que já foi enviado fica reaproveitável. Sem isto, a mesma arte de campanha
-- é enviada de novo a cada cena e o bucket vira depósito de duplicatas.

CREATE TABLE IF NOT EXISTS public.tv_midias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  caminho     TEXT NOT NULL,
  url         TEXT NOT NULL,
  tipo        TEXT NOT NULL,
  nome        TEXT NOT NULL,
  tamanho     BIGINT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por  UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  CONSTRAINT tv_midias_tipo CHECK (tipo IN ('imagem', 'video'))
);

CREATE INDEX IF NOT EXISTS idx_tv_midias_empresa
  ON public.tv_midias (empresa_id, criado_em DESC);

ALTER TABLE public.tv_midias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tv_midias_select ON public.tv_midias;
CREATE POLICY tv_midias_select ON public.tv_midias
  FOR SELECT TO authenticated
  USING (public.fn_user_tem('ver_modo_tv') AND public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS tv_midias_write ON public.tv_midias;
CREATE POLICY tv_midias_write ON public.tv_midias
  FOR ALL TO authenticated
  USING (public.fn_user_tem('tv_enviar_midia') AND public.fn_can_access_empresa(empresa_id))
  WITH CHECK (public.fn_user_tem('tv_enviar_midia') AND public.fn_can_access_empresa(empresa_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. `fn_tv_palco` — agora com rotação, transição e emergência
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
  v_fontes      JSONB;
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
    -- Prévia da mesa: a cena pedida, desde que seja do setor desta tela.
    SELECT c.* INTO v_cena
      FROM public.tv_cenas c
     WHERE c.id = p_cena_id
       AND c.setor_id = v_tela.setor_id;

  ELSIF v_tela.rotacao_ativa THEN
    /*
     * A fila, resolvida pelo relógio.
     *
     * `fim` é a soma acumulada das durações na ordem das cenas; `total` é o
     * ciclo inteiro. A cena atual é a primeira cujo `fim` passa do instante
     * dentro do ciclo. Recarregar a página cai no mesmo ponto, porque a conta
     * não depende de estado nenhum do navegador.
     */
    WITH fila AS (
      SELECT c.*,
             SUM(c.duracao_s) OVER (ORDER BY c.ordem, c.id
                                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS fim,
             SUM(c.duracao_s) OVER () AS total
        FROM public.tv_cenas c
       WHERE c.setor_id = v_tela.setor_id
         AND c.na_rotacao
    )
    /*
     * Em dois passos, e não `SELECT f.* INTO v_cena, v_proxima_s`: o plpgsql
     * não aceita misturar variável de LINHA com escalar na mesma lista de
     * INTO, e a CTE ainda traz `fim` e `total`, que não existem em
     * `tv_cenas`. Pegar o id e reler a linha é o caminho que não depende
     * dessas sutilezas.
     */
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
    -- A cena que foi cortada à mão.
    SELECT c.* INTO v_cena
      FROM public.tv_estado e
      JOIN public.tv_cenas c ON c.id = e.cena_id
     WHERE e.tela_id = v_tela.id;
  END IF;

  /*
   * Nada no ar: cai para a cena de emergência, se o setor tiver uma. É a
   * diferença entre a parede exibir a arte da empresa e exibir um aviso cinza
   * de sistema na frente de todo mundo.
   */
  IF v_cena.id IS NULL AND p_cena_id IS NULL THEN
    SELECT c.* INTO v_cena
      FROM public.tv_cenas c
     WHERE c.setor_id = v_tela.setor_id
       AND c.emergencia;
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
          'volume',  fo.volume,
          'mudo',    fo.mudo,
          'dados',   CASE fo.tipo

            WHEN 'ranking' THEN (
              SELECT COALESCE(jsonb_agg(r ORDER BY r.total DESC), '[]'::JSONB)
                FROM (
                  SELECT
                    COALESCE(NULLIF(trim(p.nome), ''), 'Sem nome') AS nome,
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

            ELSE NULL
          END
        ) AS fonte
        FROM public.tv_fontes fo
       WHERE fo.cena_id = v_cena.id
         AND fo.visivel
    ) f;

  RETURN jsonb_build_object(
    'encontrada',  TRUE,
    'tela',        jsonb_build_object(
                     'nome', v_tela.nome, 'slug', v_tela.slug,
                     'rotacao', v_tela.rotacao_ativa),
    'cena',        jsonb_build_object(
                     'id', v_cena.id, 'nome', v_cena.nome,
                     'transicao', v_cena.transicao),
    'fontes',      v_fontes,
    'proxima_em_s', v_proxima_s,
    'servidor_em', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_palco(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_palco(TEXT, UUID) TO anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. `fn_tv_cortar` — agora aceita tirar do ar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `p_cena_id` nulo LIMPA a tela. Antes não havia como tirar nada do ar: uma vez
-- no ar, a única saída era cortar para outra cena.
--
-- Cortar à mão também DESLIGA a rotação. Quem assume o controle manual não quer
-- a fila puxando a parede de volta trinta segundos depois — é a "pausa imediata
-- ao assumir o controle" que qualquer mesa de transmissão tem.

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

  IF p_cena_id IS NOT NULL THEN
    SELECT * INTO v_cena FROM public.tv_cenas WHERE id = p_cena_id;
    IF v_cena.id IS NULL THEN
      RAISE EXCEPTION 'TV_CENA: cena nao encontrada.'
        USING errcode = 'check_violation';
    END IF;

    IF v_cena.setor_id <> v_tela.setor_id THEN
      RAISE EXCEPTION 'TV_SETOR: esta cena e de outro setor.'
        USING errcode = 'check_violation';
    END IF;
  END IF;

  UPDATE public.tv_telas SET rotacao_ativa = FALSE, atualizado_em = now()
   WHERE id = p_tela_id;

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
-- 7. `fn_tv_rotacao` — ligar e desligar a fila
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_tv_rotacao(p_tela_id UUID, p_ativa BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tela public.tv_telas;
BEGIN
  IF NOT public.fn_user_tem('tv_cortar') THEN
    RAISE EXCEPTION 'TV_SEM_PERMISSAO: ligar a rotacao muda o que esta na parede.'
      USING errcode = '42501';
  END IF;

  SELECT * INTO v_tela FROM public.tv_telas WHERE id = p_tela_id AND ativa;
  IF v_tela.id IS NULL OR NOT public.fn_can_access_empresa(v_tela.empresa_id) THEN
    RAISE EXCEPTION 'TV_TELA: tela nao encontrada no seu acesso.'
      USING errcode = '42501';
  END IF;

  UPDATE public.tv_telas
     SET rotacao_ativa = COALESCE(p_ativa, FALSE), atualizado_em = now()
   WHERE id = p_tela_id;

  RETURN COALESCE(p_ativa, FALSE);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_rotacao(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_rotacao(UUID, BOOLEAN) TO authenticated, service_role;
