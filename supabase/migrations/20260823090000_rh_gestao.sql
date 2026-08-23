-- ============================================================================
-- RH Gestao — Controle de Premiacao e Comissao
-- ============================================================================
--
-- ## O processo que isto passa a guardar
--
--   operador -> lider -> gerencia -> RH
--
-- O operador nao preenche a propria premiacao. A lideranca confere e preenche,
-- a gerencia valida o escopo dela, e so entao o pacote chega ao RH — que aprova
-- ou devolve. Devolver UM operador nao pode reprovar os outros da equipe.
--
-- ## Cinco tabelas, e por que nao mais
--
--   `rh_celulas`         Birigui, Marilia, e o que vier. Tabela propria para
--                        renomear uma cidade nao exigir mexer em N setores.
--   `rh_config_setores`  o vinculo setor -> celula + tipo de remuneracao.
--                        E ele que substitui o `if (setor === 'Play 4')` que o
--                        pedido proibe espalhar pelo codigo.
--   `rh_dados_operadores` o CRACHA, isolado de `perfis` de proposito — ver
--                        abaixo.
--   `rh_fechamentos`     a competencia (Setembro/2026), com prazo e status.
--   `rh_lancamentos`     UMA linha por operador por competencia. E aqui que
--                        vivem o valor, o status e os snapshots.
--   `rh_eventos`         a trilha do modulo, escrita so por gatilho e RPC.
--
-- ## O estado de equipe e de setor NAO tem tabela
--
-- O pedido pede para calcular o estado dos niveis de cima a partir dos filhos
-- "quando possivel", e aqui e possivel sempre:
--
--   equipe concluida  = todos os lancamentos dela em `concluido_lider` ou adiante
--   equipe validada   = todos em `validado_gerencia` ou adiante
--   setor enviado     = todos os lancamentos dele em `enviado_rh` ou adiante
--
-- Guardar tambem um `status` de equipe criaria a possibilidade de a equipe
-- dizer "validada" com um operador dentro dizendo "devolvido" — o estado
-- contraditorio que o pedido manda evitar. Sem a coluna, nao ha o que divergir.
--
-- A unica coisa que NAO se deriva e a INTENCAO de uma devolucao: devolver a
-- equipe inteira e devolver seis operadores por acaso resultam no mesmo
-- conjunto de linhas. Dai `devolucao_escopo` na linha, que diz qual das duas
-- aconteceu, e nada mais.
--
-- ## O cracha mora fora de `perfis`
--
-- O pedido e explicito: "o restante do Gestao de Acordos NAO devera comecar a
-- apresentar cracha em telas existentes". Uma coluna em `perfis` chegaria de
-- graca em toda tela que faz `select *` — e sao muitas. Numa tabela propria,
-- com RLS propria, quem nao pergunta nao recebe.
--
-- ## O percentual nao e recalculado aqui
--
-- `181%` ja tem dono no projeto: `calcularProjecao` em `src/lib/projecaoMetas.ts`,
-- alimentado por `metas`, `analitico_recebimentos` e `metas_config_mes`
-- (feriados e quartis). Reescrever essa conta em SQL criaria um segundo numero
-- para a mesma pergunta, e um dos dois estaria errado em algum mes.
--
-- Entao o banco RECEBE o percentual ja calculado e o CONGELA no fechamento. Ele
-- e a fotografia usada para pagar; nada que mude depois — meta, feriado, equipe
-- do operador — pode reescrever um valor ja pago.
--
-- ## Escopo: o painel manda, como no resto do sistema
--
-- A aba entra em `fn_abas_escopo()` com tres niveis:
--
--   equipe          as equipes que a pessoa LIDERA (`equipe_lideres`), e nao o
--                   setor inteiro. E o requisito 4 do pedido: pertencer ao mesmo
--                   setor nao da acesso a equipe que nao se lidera.
--   setor           o setor da pessoa — a visao da gerencia.
--   todos_setores   a empresa — a visao do RH.
--
-- `individual` nao existe: o operador nao preenche o proprio lancamento, entao
-- um nivel "so os meus" seria um interruptor que liga e nao mostra nada.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── Celulas (cidades) ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rh_celulas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  -- Ordem de exibicao na visao consolidada do RH. Birigui antes de Marilia
  -- porque foi assim que o pedido desenhou a tela, e nao por acaso alfabetico.
  ordem      INTEGER NOT NULL DEFAULT 0,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, nome)
);

COMMENT ON TABLE public.rh_celulas IS
  'Celula/cidade do RH (Birigui, Marilia...). Tabela propria para renomear uma '
  'cidade nao exigir tocar em cada setor.';

-- ── Configuracao de RH por setor ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rh_config_setores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id     UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  celula_id    UUID NOT NULL REFERENCES public.rh_celulas(id) ON DELETE RESTRICT,
  -- TEXT com CHECK, e nao ENUM: o pedido proibe "enums rigidos dificeis de
  -- alterar", e acrescentar um terceiro tipo aqui e um ALTER de constraint,
  -- nao uma migracao de tipo com dependencias.
  tipo_remuneracao TEXT NOT NULL CHECK (tipo_remuneracao IN ('premiacao', 'comissao')),
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  atualizado_por      UUID,
  atualizado_por_nome TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, setor_id)
);

CREATE INDEX IF NOT EXISTS idx_rh_cfg_setor_empresa
  ON public.rh_config_setores(empresa_id, ativo);

COMMENT ON TABLE public.rh_config_setores IS
  'Qual setor entra no RH, em que celula e sob qual tipo de remuneracao. E a '
  'configuracao central que substitui condicional por nome de setor no codigo.';

-- ── Dados de RH do operador (o cracha) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rh_dados_operadores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  operador_id  UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  cracha       TEXT,
  atualizado_por      UUID,
  atualizado_por_nome TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, operador_id)
);

-- Dois operadores com o mesmo cracha e erro de digitacao, e o erro so aparece
-- na hora de pagar. Indice parcial porque cracha em branco e normal — nem todo
-- mundo tem um cadastrado ainda.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rh_cracha_unico
  ON public.rh_dados_operadores(empresa_id, cracha)
  WHERE cracha IS NOT NULL AND TRIM(cracha) <> '';

COMMENT ON TABLE public.rh_dados_operadores IS
  'Dados de RH do operador, hoje so o cracha. Tabela separada de `perfis` de '
  'proposito: o cracha nao pode vazar para as telas que fazem select * em perfis.';

-- ── Fechamento (competencia) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rh_fechamentos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Sempre o dia 1: a competencia e um MES, e guardar 'YYYY-MM-01' deixa
  -- ordenacao, comparacao e intervalo funcionarem sem parse de texto.
  competencia DATE NOT NULL,
  /*
   * O mes cujo DESEMPENHO alimenta o percentual.
   *
   * Nao e sempre igual a competencia, e o proprio exemplo do pedido mostra por
   * que: competencia Setembro/2026 com prazo em 02/09 so faz sentido se o que
   * se confere ali e o desempenho de AGOSTO. O padrao e o mes anterior; o RH
   * ajusta quando o combinado for outro.
   */
  mes_apuracao DATE NOT NULL,
  /** Prazo maximo para a gerencia enviar ao RH. */
  prazo       DATE,
  status      TEXT NOT NULL DEFAULT 'aberto'
              CHECK (status IN ('aberto', 'finalizado')),
  observacao  TEXT,
  aberto_por       UUID,
  aberto_por_nome  TEXT,
  aberto_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_por   UUID,
  finalizado_por_nome TEXT,
  finalizado_em    TIMESTAMPTZ,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_rh_fech_empresa_comp
  ON public.rh_fechamentos(empresa_id, competencia DESC);

-- ── Lancamento por operador ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rh_lancamentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  fechamento_id UUID NOT NULL REFERENCES public.rh_fechamentos(id) ON DELETE CASCADE,
  operador_id   UUID NOT NULL REFERENCES public.perfis(id) ON DELETE RESTRICT,

  /*
   * ── Snapshots ──
   *
   * Nao sao duplicacao preguicosa: sao a fotografia do que foi pago. Um
   * operador que muda de equipe em outubro nao pode reescrever o fechamento de
   * setembro, e um nome corrigido no cadastro nao pode reescrever a folha que
   * ja circulou.
   *
   * As colunas `*_id_snapshot` ficam SEM foreign key de proposito: apagar uma
   * equipe nao pode apagar nem invalidar historico financeiro. O nome ao lado e
   * o que a tela mostra.
   */
  nome_snapshot   TEXT NOT NULL,
  cracha_snapshot TEXT,
  equipe_id_snapshot   UUID,
  equipe_nome_snapshot TEXT,
  setor_id_snapshot    UUID NOT NULL,
  setor_nome_snapshot  TEXT NOT NULL,
  celula_snapshot      TEXT NOT NULL,
  tipo_remuneracao_snapshot TEXT NOT NULL
    CHECK (tipo_remuneracao_snapshot IN ('premiacao', 'comissao')),
  /** 181.00 = 181%. Congelado ao concluir a equipe — antes disso, NULL. */
  percentual_snapshot  NUMERIC(8,2),
  meta_snapshot        NUMERIC(14,2),
  recebido_snapshot    NUMERIC(14,2),

  /** O valor da premiacao/comissao. NUMERIC, nunca float — e dinheiro. */
  valor        NUMERIC(12,2),
  observacao   TEXT,

  /*
   * A maquina de estados, e ela e curta de proposito.
   *
   *   pendente ─> preenchido ─> concluido_lider ─> validado_gerencia
   *        ^                                              │
   *        │                                              v
   *        │                                        enviado_rh ─┬─> aprovado_rh
   *        └──────────────── devolvido_rh <────────────────────┘
   *
   * `preenchido` e `concluido_lider` sao passos DIFERENTES de proposito. Ter
   * todo mundo com valor digitado nao e a mesma coisa que o lider dizer que
   * conferiu a equipe — e e nessa segunda hora que o percentual e congelado.
   * Fundir os dois faria a equipe se declarar pronta sozinha no instante em que
   * o ultimo valor fosse digitado, sem ninguem ter conferido nada.
   *
   * `devolvido_rh` volta para `preenchido` quando o responsavel corrige, e daí
   * refaz o caminho inteiro — a correcao passa pela gerencia de novo. E o
   * requisito 18: correcao de lider nao pode alterar em silencio o que a
   * gerencia ja validou.
   */
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente', 'preenchido', 'concluido_lider', 'validado_gerencia',
    'enviado_rh', 'devolvido_rh', 'aprovado_rh'
  )),
  /** 'operador' ou 'equipe' — a INTENCAO da ultima devolucao. */
  devolucao_escopo TEXT CHECK (devolucao_escopo IN ('operador', 'equipe')),
  motivo_devolucao TEXT,

  preenchido_por      UUID,
  preenchido_por_nome TEXT,
  preenchido_em       TIMESTAMPTZ,
  validado_por        UUID,
  validado_por_nome   TEXT,
  validado_em         TIMESTAMPTZ,
  enviado_em          TIMESTAMPTZ,
  decidido_por        UUID,
  decidido_por_nome   TEXT,
  decidido_em         TIMESTAMPTZ,

  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Uma linha por pessoa por competencia. Duas seria pagar duas vezes.
  UNIQUE (fechamento_id, operador_id)
);

-- Os indices seguem as consultas reais da tela, e nao um palpite: a lista do
-- lider filtra por (fechamento, equipe); a da gerencia por (fechamento, setor);
-- a consolidada do RH agrupa por (fechamento, status).
CREATE INDEX IF NOT EXISTS idx_rh_lanc_fech_equipe
  ON public.rh_lancamentos(fechamento_id, equipe_id_snapshot);
CREATE INDEX IF NOT EXISTS idx_rh_lanc_fech_setor
  ON public.rh_lancamentos(fechamento_id, setor_id_snapshot);
CREATE INDEX IF NOT EXISTS idx_rh_lanc_fech_status
  ON public.rh_lancamentos(fechamento_id, status);
CREATE INDEX IF NOT EXISTS idx_rh_lanc_operador
  ON public.rh_lancamentos(operador_id);
CREATE INDEX IF NOT EXISTS idx_rh_lanc_empresa
  ON public.rh_lancamentos(empresa_id);

-- ── Trilha do modulo ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rh_eventos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL,
  fechamento_id UUID NOT NULL REFERENCES public.rh_fechamentos(id) ON DELETE CASCADE,
  lancamento_id UUID REFERENCES public.rh_lancamentos(id) ON DELETE CASCADE,
  escopo        TEXT NOT NULL CHECK (escopo IN ('competencia', 'setor', 'equipe', 'operador')),
  tipo          TEXT NOT NULL,
  /** Frase pronta em portugues, montada no banco. A tela so desenha. */
  descricao     TEXT NOT NULL,
  motivo        TEXT,
  valor_anterior NUMERIC(12,2),
  valor_novo     NUMERIC(12,2),
  setor_id      UUID,
  equipe_id     UUID,
  autor_id      UUID,
  autor_nome    TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rh_ev_fechamento
  ON public.rh_eventos(fechamento_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_rh_ev_lancamento
  ON public.rh_eventos(lancamento_id, criado_em DESC);

COMMENT ON TABLE public.rh_eventos IS
  'Trilha do RH Gestao. Append-only: sem policy de UPDATE nem DELETE, e escrita '
  'so por RPC SECURITY DEFINER. Historico que o cliente reescreve nao resolve '
  'discordancia sobre dinheiro.';

-- ============================================================================
-- Funcoes de apoio
-- ============================================================================

-- ── As equipes que a pessoa LIDERA ──────────────────────────────────────────
--
-- Vem de `equipe_lideres`, a fonte oficial do projeto (migration 20260725b), e
-- nao de `perfis.equipe_id`. Uma pessoa pode liderar zero, uma ou varias.

CREATE OR REPLACE FUNCTION public.fn_rh_equipes_que_lidero()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT el.equipe_id
    FROM public.equipe_lideres el
   WHERE el.lider_id = (SELECT auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_equipes_que_lidero() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_equipes_que_lidero() TO authenticated;

COMMENT ON FUNCTION public.fn_rh_equipes_que_lidero() IS
  'Equipes que o usuario atual lidera, de equipe_lideres. Uma pessoa pode '
  'liderar varias; uma equipe pode ter varios lideres.';

-- ── O lancamento esta no meu alcance? ───────────────────────────────────────
--
-- Uma funcao so para as cinco policies nao divergirem entre si — mesma razao
-- de `fn_pode_gerir_acordo` existir do lado dos acordos.

CREATE OR REPLACE FUNCTION public.fn_rh_lancamento_visivel(
  p_empresa_id UUID, p_setor_id UUID, p_equipe_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.fn_can_access_empresa(p_empresa_id)
     AND (
       public.fn_user_is_super_admin()
       -- 3 = todos os setores (a visao do RH)
       OR public.fn_user_escopo('rh') >= 3
       -- 2 = o proprio setor (a visao da gerencia)
       OR (public.fn_user_escopo('rh') >= 2
           AND p_setor_id IS NOT DISTINCT FROM public.fn_user_setor_id())
       -- 1 = as equipes que EU lidero. Nao o setor: pertencer ao mesmo setor
       -- nao da acesso a equipe alheia.
       OR (public.fn_user_escopo('rh') >= 1
           AND p_equipe_id IS NOT NULL
           AND p_equipe_id IN (SELECT public.fn_rh_equipes_que_lidero()))
     );
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_lancamento_visivel(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_rh_lancamento_visivel(UUID, UUID, UUID) TO authenticated;

-- ── Registrar evento ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_rh_evento(
  p_fechamento_id UUID, p_lancamento_id UUID, p_escopo TEXT, p_tipo TEXT,
  p_descricao TEXT, p_motivo TEXT DEFAULT NULL,
  p_valor_anterior NUMERIC DEFAULT NULL, p_valor_novo NUMERIC DEFAULT NULL,
  p_setor_id UUID DEFAULT NULL, p_equipe_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_autor UUID := auth.uid();
  v_nome  TEXT;
  v_emp   UUID;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = v_autor;
  SELECT f.empresa_id INTO v_emp
    FROM public.rh_fechamentos f WHERE f.id = p_fechamento_id;

  INSERT INTO public.rh_eventos (
    empresa_id, fechamento_id, lancamento_id, escopo, tipo, descricao, motivo,
    valor_anterior, valor_novo, setor_id, equipe_id, autor_id, autor_nome
  ) VALUES (
    v_emp, p_fechamento_id, p_lancamento_id, p_escopo, p_tipo, p_descricao,
    NULLIF(TRIM(p_motivo), ''), p_valor_anterior, p_valor_novo,
    p_setor_id, p_equipe_id, v_autor, COALESCE(v_nome, 'Sistema')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_evento(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, UUID, UUID) FROM PUBLIC;

-- ── Notificar ───────────────────────────────────────────────────────────────
--
-- Reaproveita `notificacoes`, com `rota` apontando para o registro. O sino, o
-- painel e o som ja existem — nada disso e reescrito aqui.

CREATE OR REPLACE FUNCTION public.fn_rh_notificar(
  p_usuario_id UUID, p_empresa_id UUID, p_titulo TEXT, p_mensagem TEXT, p_rota TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_autor UUID := auth.uid();
  v_nome  TEXT;
BEGIN
  -- Nao se avisa a si mesmo do que acabou de fazer.
  IF p_usuario_id IS NULL OR p_usuario_id = v_autor THEN RETURN; END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = v_autor;

  INSERT INTO public.notificacoes (
    usuario_id, empresa_id, titulo, mensagem, rota, autor_id, autor_nome
  ) VALUES (
    p_usuario_id, p_empresa_id, p_titulo, p_mensagem, p_rota, v_autor, v_nome
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_rh_notificar(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;

COMMIT;
