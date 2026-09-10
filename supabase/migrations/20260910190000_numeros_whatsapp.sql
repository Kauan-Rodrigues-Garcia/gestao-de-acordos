-- ============================================================================
-- Controle de Numeros de WhatsApp — tabelas, travas e visibilidade
-- ============================================================================
--
-- ## O processo que isto passa a guardar
--
--   Nucleo ──libera──> setor ──lanca──> operador
--     ^                  |                 |
--     └──relanca─────────┘   devolve ──────┘
--
-- O setor "Nucleo de Inteligencia e Gestao" compra numeros de WhatsApp por
-- site, com DDD aleatorio, aquece cada um, e distribui os que ficaram prontos.
-- Nao ha chip fisico e nao ha lote: a unidade e O NUMERO.
--
-- Um numero nasce no Nucleo, vai para o setor dono do celular, e pode voltar —
-- sem nunca ser recadastrado, e sem perder o caminho que percorreu.
--
-- ## Quatro tabelas, e por que nao mais
--
--   `numeros_config`        uma linha por empresa, dizendo QUAL setor e o
--                           Nucleo. E ela que substitui o `if (setor = '...')`
--                           que este projeto passou uma migration inteira
--                           removendo (ver 20260823092000).
--   `numeros_celulares`     o aparelho. Pertence a um setor, e a um so.
--   `numeros_whatsapp`      o numero. E o registro que se move.
--   `numeros_movimentacoes` a trilha. Append-only, escrita so por RPC.
--
-- Nao existe tabela de "lote", de "operadora" nem de "custo": nada disso foi
-- pedido, e cada uma seria uma coluna que ninguem preenche.
--
-- ## `situacao` e `posse` sao colunas SEPARADAS
--
-- `situacao` responde COMO o numero esta: em_aquecimento, ativo, banido.
-- `posse`    responde ONDE ele esta: nucleo ou setor.
-- `operador_id` responde COM QUEM, dentro do setor.
--
-- Uma lista unica precisaria do produto dos dois eixos — "banido no Nucleo" e
-- "banido no setor" sao estados reais e diferentes —, e o pedido e explicito em
-- nao criar status a mais. Separadas, tres valores e dois valores cobrem tudo.
--
-- O `CHECK` de coerencia impede o estado contraditorio: numero com
-- `posse = 'nucleo'` nao pode estar na mao de um operador.
--
-- ## Por que `setor_id` esta DENTRO do numero, se ja esta no celular
--
-- Denormalizacao deliberada. A RLS filtra por setor em TODA leitura, e resolver
-- isso por JOIN com `numeros_celulares` dentro da policy paga o JOIN por linha
-- — exatamente o custo que as migrations 20260910125537 a 20260910180000
-- passaram a semana removendo de outras tabelas.
--
-- A copia nao e mantida pela aplicacao: `fn_numeros_whatsapp_valida` sobrescreve
-- `setor_id` com o do celular em todo INSERT e todo UPDATE. O cliente pode
-- mandar o que quiser no campo — o que vale e o do aparelho.
--
-- ## O limite de 6 e trigger com lock, nao CHECK
--
-- `CHECK` nao enxerga outras linhas. Uma contagem solta perde a corrida entre
-- dois cadastros simultaneos e grava o setimo numero em silencio.
--
-- A trigger trava a linha do celular (`SELECT ... FOR UPDATE`) antes de contar:
-- o segundo cadastro espera o primeiro terminar e ve o total certo. A tela
-- tambem mostra "4/6" e desabilita o botao, mas a tela e conveniencia — a
-- garantia esta aqui.
--
-- ## O vinculo celular -> setor nunca se mistura
--
-- Um celular do Play 3 nao pode hospedar numero do Play 1. Duas travas fazem
-- isso valer:
--
--   1. o numero HERDA o setor do celular (nao ha como escolher outro);
--   2. trocar o setor de um celular QUE JA TEM NUMERO levanta excecao.
--
-- A segunda existe porque a primeira sozinha nao basta: sem ela, bastaria
-- cadastrar seis numeros e depois mudar o setor do aparelho para mover seis
-- numeros de setor sem nenhuma movimentacao registrada.
--
-- ## RLS entra LIGADA e SEM POLICY
--
-- As policies chegam na proxima migration (`..._numeros_whatsapp_fluxo`). Ligar
-- a RLS aqui, sem policy nenhuma, faz a janela entre as duas migrations negar
-- tudo em vez de liberar tudo. Se a segunda nao rodar, o modulo fica inerte —
-- que e a direcao certa para falhar.
--
-- Pelo mesmo motivo, enquanto a terceira migration (permissoes) nao rodar,
-- `fn_user_escopo('chips')` devolve -1 (aba desconhecida) e
-- `fn_user_tem('ver_controle_numeros')` devolve FALSE (chave ausente vale
-- negado). O modulo nasce fechado e so abre quando as tres estiverem aplicadas.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── Qual setor e o Nucleo ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.numeros_config (
  empresa_id      UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- RESTRICT, e nao CASCADE: apagar o setor do Nucleo por engano nao pode
  -- desligar o modulo inteiro em silencio. O erro obriga a decisao explicita.
  setor_nucleo_id UUID NOT NULL REFERENCES public.setores(id) ON DELETE RESTRICT,
  atualizado_por      UUID,
  atualizado_por_nome TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.numeros_config IS
  'Qual setor e o Nucleo de Inteligencia e Gestao, por empresa. A PK por '
  'empresa garante um Nucleo so. Substitui condicional por nome de setor.';

-- ── O aparelho ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.numeros_celulares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  /** Como a operacao chama o aparelho: "Celular 05". */
  identificacao TEXT NOT NULL,
  /** Opcional por pedido: nem todo aparelho tem modelo anotado. */
  modelo        TEXT,
  setor_id      UUID NOT NULL REFERENCES public.setores(id) ON DELETE RESTRICT,
  /** Aparelho sai de uso, nao e apagado — os numeros dele tem historico. */
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por      UUID,
  criado_por_nome TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT numeros_celulares_identificacao_preenchida
    CHECK (TRIM(identificacao) <> '')
);

-- "Celular 5" e "celular 5 " sao o mesmo aparelho para quem opera, e dois
-- cadastros para o banco. O indice funcional acaba com a diferenca.
CREATE UNIQUE INDEX IF NOT EXISTS idx_numeros_cel_identificacao
  ON public.numeros_celulares (empresa_id, lower(trim(identificacao)));

CREATE INDEX IF NOT EXISTS idx_numeros_cel_empresa_setor
  ON public.numeros_celulares (empresa_id, setor_id)
  WHERE ativo;

COMMENT ON TABLE public.numeros_celulares IS
  'Aparelho usado para movimentar numeros. Pertence a UM setor, e os numeros '
  'dele herdam esse setor. Ate 6 numeros por aparelho.';

-- ── O numero ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.numeros_whatsapp (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  celular_id UUID NOT NULL REFERENCES public.numeros_celulares(id) ON DELETE RESTRICT,
  /*
   * Copia do setor do celular, mantida por `fn_numeros_whatsapp_valida`.
   * Existe para a RLS filtrar sem JOIN. Ver o cabecalho.
   */
  setor_id   UUID NOT NULL REFERENCES public.setores(id) ON DELETE RESTRICT,

  /*
   * So digitos, sem codigo de pais: `18999999999`.
   *
   * O regex codifica a mesma regra de `src/services/numeros/numerosFormato.ts`:
   * DDD de 11 a 99, mais 8 digitos (fixo) ou 9 (celular). Ele existe para o
   * UNIQUE abaixo significar alguma coisa — sem normalizacao, `(18) 99999-9999`
   * e `18999999999` sao duas strings, e o mesmo numero entraria duas vezes.
   *
   * O nono digito NAO e exigido: estes numeros vem de site, com DDD aleatorio,
   * e recusar um numero que existe de verdade por regra de formato trava a
   * operacao sem motivo bom.
   */
  numero     TEXT NOT NULL,

  situacao   TEXT NOT NULL DEFAULT 'em_aquecimento'
             CHECK (situacao IN ('em_aquecimento', 'ativo', 'banido')),
  posse      TEXT NOT NULL DEFAULT 'nucleo'
             CHECK (posse IN ('nucleo', 'setor')),
  /*
   * Quem esta com o numero DENTRO do setor. NULL enquanto a lideranca nao
   * lancou. `ON DELETE SET NULL`: desligar uma pessoa solta o numero de volta
   * para a lideranca, e nao apaga o numero.
   */
  operador_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,

  /** Por que voltou, na ultima vez que voltou. O historico guarda todas. */
  motivo_retorno     TEXT CHECK (motivo_retorno IN
                       ('banido', 'sem_uso', 'problema_tecnico', 'outro')),
  observacao_retorno TEXT,

  criado_por      UUID,
  criado_por_nome TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT numeros_whatsapp_formato
    CHECK (numero ~ '^(1[1-9]|[2-9][0-9])[0-9]{8,9}$'),
  -- O estado contraditorio que este modulo existe para nao ter.
  CONSTRAINT numeros_whatsapp_nucleo_sem_operador
    CHECK (posse <> 'nucleo' OR operador_id IS NULL),
  -- A regra central do pedido: o mesmo numero nao se cadastra duas vezes.
  CONSTRAINT numeros_whatsapp_unico_por_empresa
    UNIQUE (empresa_id, numero)
);

-- Os indices seguem as consultas reais das telas, e nao um palpite:
-- o Nucleo lista por (empresa, setor, posse); o cartao do celular conta os
-- numeros dele; o operador abre "Meus Chips" pelos numeros lancados a ele.
CREATE INDEX IF NOT EXISTS idx_numeros_wpp_empresa_setor_posse
  ON public.numeros_whatsapp (empresa_id, setor_id, posse);
CREATE INDEX IF NOT EXISTS idx_numeros_wpp_celular
  ON public.numeros_whatsapp (celular_id);
CREATE INDEX IF NOT EXISTS idx_numeros_wpp_operador
  ON public.numeros_whatsapp (operador_id)
  WHERE operador_id IS NOT NULL;

COMMENT ON TABLE public.numeros_whatsapp IS
  'O numero de WhatsApp. E o registro que se move entre Nucleo, setor e '
  'operador — nunca recadastrado, nunca apagado.';

-- ── A trilha ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.numeros_movimentacoes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  numero_id  UUID NOT NULL REFERENCES public.numeros_whatsapp(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL CHECK (tipo IN (
               'cadastro', 'situacao_alterada', 'liberado_ao_setor',
               'lancado_ao_operador', 'devolvido_a_lideranca',
               'relancado_ao_nucleo')),

  /*
   * ── Snapshots ──
   *
   * Os `*_id` ficam SEM foreign key de proposito: apagar um setor ou desligar
   * uma pessoa nao pode apagar nem invalidar historico. O nome ao lado e o que
   * a tela mostra, congelado na hora do fato. Mesma decisao de
   * `rh_lancamentos` (20260823090000).
   */
  setor_origem_id       UUID, setor_origem_nome       TEXT,
  setor_destino_id      UUID, setor_destino_nome      TEXT,
  operador_origem_id    UUID, operador_origem_nome    TEXT,
  operador_destino_id   UUID, operador_destino_nome   TEXT,

  situacao_anterior TEXT,
  situacao_nova     TEXT,
  motivo            TEXT,
  observacao        TEXT,

  /** Frase pronta em portugues, montada no banco. A tela so desenha. */
  descricao  TEXT NOT NULL,

  autor_id   UUID,
  autor_nome TEXT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_numeros_mov_numero
  ON public.numeros_movimentacoes (numero_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_numeros_mov_empresa
  ON public.numeros_movimentacoes (empresa_id, criado_em DESC);

COMMENT ON TABLE public.numeros_movimentacoes IS
  'Trilha do Controle de Numeros. Append-only: sem policy de UPDATE nem de '
  'DELETE, e escrita so por fn_numeros_movimentacao. Substituir o historico '
  'pelo estado atual foi o que o pedido proibiu explicitamente.';

-- ============================================================================
-- Travas
-- ============================================================================

-- ── O setor precisa ser da mesma empresa ────────────────────────────────────
--
-- Nao da para expressar isso com foreign key sem acrescentar um indice unico em
-- `setores`, e este modulo nao altera tabela existente. Uma funcao, porque tres
-- triggers fazem a mesma pergunta.

CREATE OR REPLACE FUNCTION public.fn_numeros_setor_e_da_empresa(
  p_setor_id UUID, p_empresa_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.setores s
     WHERE s.id = p_setor_id AND s.empresa_id = p_empresa_id
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_setor_e_da_empresa(UUID, UUID) FROM PUBLIC;

-- ── Celular: setor coerente, e imutavel depois do primeiro numero ───────────

CREATE OR REPLACE FUNCTION public.fn_numeros_celular_valida()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_numeros_setor_e_da_empresa(NEW.setor_id, NEW.empresa_id) THEN
    RAISE EXCEPTION 'O setor escolhido nao pertence a esta empresa.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    /*
     * A trava que impede seis numeros mudarem de setor sem nenhuma
     * movimentacao registrada. Herdar o setor do celular sozinho nao basta:
     * bastaria cadastrar os numeros e depois mexer no aparelho.
     */
    IF NEW.setor_id IS DISTINCT FROM OLD.setor_id
       AND EXISTS (SELECT 1 FROM public.numeros_whatsapp n
                    WHERE n.celular_id = OLD.id) THEN
      RAISE EXCEPTION
        'Nao da para trocar o setor de um celular que ja tem numero. '
        'Relance os numeros ao Nucleo antes, ou cadastre outro aparelho.'
        USING ERRCODE = '23514';
    END IF;

    NEW.atualizado_em := NOW();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_numeros_celular_valida ON public.numeros_celulares;
CREATE TRIGGER trg_numeros_celular_valida
  BEFORE INSERT OR UPDATE ON public.numeros_celulares
  FOR EACH ROW EXECUTE FUNCTION public.fn_numeros_celular_valida();

-- ── Numero: herda o setor, e respeita o limite de 6 ─────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_whatsapp_valida()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cel_empresa UUID;
  v_cel_setor   UUID;
  v_cel_nome    TEXT;
  v_quantos     INTEGER;
BEGIN
  /*
   * `FOR UPDATE` na linha do celular e o que torna o limite confiavel: duas
   * sessoes cadastrando o sexto numero ao mesmo tempo se enfileiram aqui, e a
   * segunda conta DEPOIS de a primeira ter gravado. Sem o lock, as duas leriam
   * 5 e as duas passariam.
   */
  SELECT c.empresa_id, c.setor_id, c.identificacao
    INTO v_cel_empresa, v_cel_setor, v_cel_nome
    FROM public.numeros_celulares c
   WHERE c.id = NEW.celular_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Celular nao encontrado.' USING ERRCODE = '23503';
  END IF;

  IF v_cel_empresa IS DISTINCT FROM NEW.empresa_id THEN
    RAISE EXCEPTION 'O celular pertence a outra empresa.' USING ERRCODE = '23514';
  END IF;

  -- O setor do numero NAO e escolhido: e o do aparelho, sempre. E o que faz
  -- "celular do Play 3 nunca hospeda numero do Play 1" ser verdade e nao
  -- combinado.
  NEW.setor_id := v_cel_setor;

  -- So conta quando um numero ENTRA neste celular. Num UPDATE que nao troca de
  -- aparelho, a contagem incluiria a propria linha e recusaria o sexto numero.
  IF TG_OP = 'INSERT' OR NEW.celular_id IS DISTINCT FROM OLD.celular_id THEN
    SELECT COUNT(*) INTO v_quantos
      FROM public.numeros_whatsapp n
     WHERE n.celular_id = NEW.celular_id;

    IF v_quantos >= 6 THEN
      RAISE EXCEPTION
        'O celular "%" ja tem 6 numeros, que e o limite.', v_cel_nome
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.atualizado_em := NOW();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_numeros_whatsapp_valida ON public.numeros_whatsapp;
CREATE TRIGGER trg_numeros_whatsapp_valida
  BEFORE INSERT OR UPDATE ON public.numeros_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.fn_numeros_whatsapp_valida();

-- ── Config: o setor apontado tem que ser da empresa ─────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_config_valida()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_numeros_setor_e_da_empresa(NEW.setor_nucleo_id, NEW.empresa_id) THEN
    RAISE EXCEPTION 'O setor escolhido nao pertence a esta empresa.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.atualizado_em := NOW();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_numeros_config_valida ON public.numeros_config;
CREATE TRIGGER trg_numeros_config_valida
  BEFORE INSERT OR UPDATE ON public.numeros_config
  FOR EACH ROW EXECUTE FUNCTION public.fn_numeros_config_valida();

-- ============================================================================
-- Quem enxerga o que
-- ============================================================================

-- ── Sou do Nucleo? ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_numeros_sou_do_nucleo(p_empresa_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.numeros_config c
      JOIN public.perfis p ON p.id = (SELECT auth.uid())
     WHERE c.empresa_id = p_empresa_id
       AND p.setor_id IS NOT NULL
       AND p.setor_id = c.setor_nucleo_id
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_sou_do_nucleo(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_numeros_sou_do_nucleo(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_numeros_sou_do_nucleo(UUID) IS
  'O usuario atual pertence ao setor configurado como Nucleo nesta empresa? '
  'Sem linha em numeros_config, ninguem e — o modulo falha fechado.';

-- ── Este registro esta no meu alcance? ──────────────────────────────────────
--
-- Uma funcao so, para as policies nao divergirem entre si — mesma razao de
-- `fn_rh_lancamento_visivel` existir do lado do RH.
--
-- Sao DUAS fechaduras diferentes, e nao uma escada so, porque cargo nao
-- distingue setor: gente do Nucleo tem cargo comum (operador, lider), e ligar
-- `escopo_todos_setores` no cargo `operador` liberaria TODO operador de TODO
-- setor. O Nucleo e reconhecido pelo setor; o resto, pela escada da aba.

CREATE OR REPLACE FUNCTION public.fn_numeros_visivel(
  p_empresa_id UUID, p_setor_id UUID, p_operador_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.fn_can_access_empresa(p_empresa_id)
     AND (
       public.fn_user_is_super_admin()
       -- 1. O Nucleo: o setor manda, e a chave da aba tem que estar ligada.
       OR (public.fn_numeros_sou_do_nucleo(p_empresa_id)
           AND public.fn_user_tem('ver_controle_numeros'))
       -- 2. O setor, pela escada da aba `chips`.
       --
       -- `CASE <expr> WHEN` avalia a expressao UMA vez. Comparar
       -- `fn_user_escopo('chips')` duas vezes criaria dois InitPlans que o
       -- Postgres nao deduplica, e cada avaliacao percorre o catalogo inteiro —
       -- a licao medida em 20260910180000.
       --
       -- Os niveis 1 (equipe) e 3 (todos os setores) nao existem para esta aba:
       -- as chaves nao sao criadas. Se algum dia forem, esta funcao precisa
       -- decidir o que elas significam — por isso ELSE FALSE, e nao um
       -- `>= n` que passaria a valer sozinho.
       OR CASE public.fn_user_escopo('chips')
            -- setor: a lideranca ve o setor inteiro, lancado ou nao
            WHEN 2 THEN p_setor_id IS NOT DISTINCT FROM public.fn_user_setor_id()
            -- individual: o operador ve so o que foi lancado para ele
            WHEN 0 THEN p_operador_id IS NOT NULL
                    AND p_operador_id = (SELECT auth.uid())
                    AND p_setor_id IS NOT DISTINCT FROM public.fn_user_setor_id()
            ELSE FALSE
          END
     );
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_visivel(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_numeros_visivel(UUID, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_numeros_visivel(UUID, UUID, UUID) IS
  'O usuario atual alcanca este registro do Controle de Numeros? Nucleo pelo '
  'setor configurado; lideranca e operador pela escada da aba chips.';

-- ============================================================================
-- A trilha
-- ============================================================================

-- ── Rotulos ─────────────────────────────────────────────────────────────────
--
-- Espelham `SITUACAO_LABELS` e `MOTIVO_LABELS` de
-- `src/services/numeros/numerosRegras.ts`. A duplicacao e aceita porque servem
-- a coisas diferentes: os do TypeScript sao a tela VIVA, que muda quando alguem
-- renomeia; estes ficam CONGELADOS dentro de `descricao`, que e o fato de
-- ontem e nao pode mudar de texto depois.

CREATE OR REPLACE FUNCTION public.fn_numeros_rotulo_situacao(p_situacao TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT CASE p_situacao
    WHEN 'em_aquecimento' THEN 'Em aquecimento'
    WHEN 'ativo'          THEN 'Ativo'
    WHEN 'banido'         THEN 'Banido'
    ELSE COALESCE(p_situacao, '—')
  END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_numeros_rotulo_motivo(p_motivo TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT CASE p_motivo
    WHEN 'banido'           THEN 'Banido'
    WHEN 'sem_uso'          THEN 'Sem uso'
    WHEN 'problema_tecnico' THEN 'Problema tecnico'
    WHEN 'outro'            THEN 'Outro'
    ELSE COALESCE(p_motivo, '—')
  END;
$function$;

-- ── Registrar movimentacao ──────────────────────────────────────────────────
--
-- `SECURITY DEFINER` e sem GRANT para `authenticated`: so as RPCs do fluxo
-- chamam. Historico que o cliente escreve direto nao resolve discordancia sobre
-- o que aconteceu com um numero.

CREATE OR REPLACE FUNCTION public.fn_numeros_movimentacao(
  p_numero_id           UUID,
  p_tipo                TEXT,
  p_setor_origem_id     UUID DEFAULT NULL,
  p_setor_destino_id    UUID DEFAULT NULL,
  p_operador_origem_id  UUID DEFAULT NULL,
  p_operador_destino_id UUID DEFAULT NULL,
  p_situacao_anterior   TEXT DEFAULT NULL,
  p_situacao_nova       TEXT DEFAULT NULL,
  p_motivo              TEXT DEFAULT NULL,
  p_observacao          TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_autor      UUID := (SELECT auth.uid());
  v_autor_nome TEXT;
  v_empresa    UUID;
  v_numero     TEXT;
  v_celular    TEXT;
  v_so_nome    TEXT;  -- setor de origem
  v_sd_nome    TEXT;  -- setor de destino
  v_oo_nome    TEXT;  -- operador de origem
  v_od_nome    TEXT;  -- operador de destino
  v_motivo     TEXT := NULLIF(TRIM(p_motivo), '');
  v_descricao  TEXT;
BEGIN
  SELECT n.empresa_id, n.numero, c.identificacao
    INTO v_empresa, v_numero, v_celular
    FROM public.numeros_whatsapp n
    JOIN public.numeros_celulares c ON c.id = n.celular_id
   WHERE n.id = p_numero_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_autor_nome
    FROM public.perfis p WHERE p.id = v_autor;

  SELECT s.nome INTO v_so_nome FROM public.setores s WHERE s.id = p_setor_origem_id;
  SELECT s.nome INTO v_sd_nome FROM public.setores s WHERE s.id = p_setor_destino_id;
  SELECT p.nome INTO v_oo_nome FROM public.perfis  p WHERE p.id = p_operador_origem_id;
  SELECT p.nome INTO v_od_nome FROM public.perfis  p WHERE p.id = p_operador_destino_id;

  -- A frase, montada aqui para a tela nao precisar interpretar codigo.
  v_descricao := CASE p_tipo
    WHEN 'cadastro' THEN
      format('Numero cadastrado no celular %s, setor %s.',
             COALESCE(v_celular, '—'), COALESCE(v_sd_nome, v_so_nome, '—'))
    WHEN 'situacao_alterada' THEN
      format('Situacao alterada de %s para %s.',
             public.fn_numeros_rotulo_situacao(p_situacao_anterior),
             public.fn_numeros_rotulo_situacao(p_situacao_nova))
    WHEN 'liberado_ao_setor' THEN
      format('Liberado pelo Nucleo ao setor %s.', COALESCE(v_sd_nome, '—'))
    WHEN 'lancado_ao_operador' THEN
      CASE WHEN v_oo_nome IS NOT NULL
        THEN format('Lancado para %s, no lugar de %s.', COALESCE(v_od_nome, '—'), v_oo_nome)
        ELSE format('Lancado para %s.', COALESCE(v_od_nome, '—'))
      END
    WHEN 'devolvido_a_lideranca' THEN
      format('%s devolveu a lideranca do setor %s — motivo: %s.',
             COALESCE(v_oo_nome, v_autor_nome), COALESCE(v_so_nome, '—'),
             public.fn_numeros_rotulo_motivo(v_motivo))
    WHEN 'relancado_ao_nucleo' THEN
      format('%s relancou ao Nucleo — motivo: %s.',
             COALESCE(v_so_nome, 'O setor'),
             public.fn_numeros_rotulo_motivo(v_motivo))
    ELSE
      format('Movimentacao %s.', p_tipo)
  END;

  INSERT INTO public.numeros_movimentacoes (
    empresa_id, numero_id, tipo,
    setor_origem_id,     setor_origem_nome,
    setor_destino_id,    setor_destino_nome,
    operador_origem_id,  operador_origem_nome,
    operador_destino_id, operador_destino_nome,
    situacao_anterior, situacao_nova, motivo, observacao,
    descricao, autor_id, autor_nome
  ) VALUES (
    v_empresa, p_numero_id, p_tipo,
    p_setor_origem_id,     v_so_nome,
    p_setor_destino_id,    v_sd_nome,
    p_operador_origem_id,  v_oo_nome,
    p_operador_destino_id, v_od_nome,
    p_situacao_anterior, p_situacao_nova, v_motivo,
    NULLIF(TRIM(p_observacao), ''),
    v_descricao, v_autor, COALESCE(v_autor_nome, 'Sistema')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_movimentacao(
  UUID, TEXT, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

COMMENT ON FUNCTION public.fn_numeros_movimentacao(
  UUID, TEXT, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT) IS
  'Grava uma linha na trilha, com a frase ja montada. Sem GRANT para '
  'authenticated: so as RPCs do fluxo chamam.';

-- ============================================================================
-- RLS ligada, sem policy
-- ============================================================================
--
-- As policies chegam na proxima migration. Ligar aqui faz a janela entre as
-- duas negar tudo em vez de liberar tudo.

ALTER TABLE public.numeros_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.numeros_celulares     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.numeros_whatsapp      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.numeros_movimentacoes ENABLE ROW LEVEL SECURITY;

COMMIT;
