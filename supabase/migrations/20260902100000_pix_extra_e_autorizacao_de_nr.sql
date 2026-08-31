-- Pix automático: etiqueta EXTRA e o NR duplicado que vira pedido.
--
-- ## A etiqueta EXTRA
--
-- Uma coluna booleana e nada mais. Ela NÃO muda regra nenhuma — não libera
-- duplicidade, não altera comissão, não pula autorização. Existe para o líder
-- olhar duas vezes, e o motivo é operacional: acontece de o Pix cair para um
-- operador, o Receptivo lançar o mesmo recebimento e um terceiro setor lançar
-- de novo. Três registros, um dinheiro. A etiqueta é o aviso de que aquele
-- registro é candidato a esse enredo.
--
-- Registrar isso como regra de sistema seria o erro: quem decide se o caso é
-- legítimo é a pessoa que confere, e ela precisa da informação, não de um
-- bloqueio automático que ela não consegue destravar.
--
-- ## O NR duplicado deixa de ser porta fechada
--
-- Hoje `fn_pix_nr_bloqueia_duplicado` recusa o INSERT com `unique_violation`, e
-- a tela diz «exclua o registro existente para liberá-lo». Isso empurra a
-- decisão para o pior lugar possível: quem apaga é o operador do OUTRO setor,
-- que não sabe do caso e não deveria poder desfazer o registro alheio.
--
-- A partir daqui o segundo registro vira um PEDIDO. O líder vê os dois lado a
-- lado — quem registrou primeiro, quem está pedindo, os valores, se é Extra — e
-- decide. Aprovado, o acordo nasce; recusado, fica o registro do pedido e o
-- porquê.
--
-- ### O acordo só nasce por dentro
--
-- O trigger continua recusando qualquer INSERT duplicado vindo do cliente. A
-- única forma de criar o segundo é `fn_pix_nr_pedido_decidir`, que liga um
-- sinalizador de transação (`app.pix_nr_autorizado`) antes de inserir. O
-- sinalizador é `is_local = true`: ele morre no fim da transação, então não
-- existe janela em que um INSERT solto passe.
--
-- ### Quem decide
--
-- `aprovar_pix_automatico`, a mesma chave de aprovar ou desaprovar um registro.
-- Não há chave nova: julgar duplicidade é a mesma responsabilidade de julgar o
-- registro, e uma segunda chave para a mesma pessoa seria mais um interruptor
-- para manter em dia.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A etiqueta
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pix_automatico_acordos
  ADD COLUMN IF NOT EXISTS extra BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.pix_automatico_acordos.extra IS
  'Marcador VISUAL para a conferencia do lider. Nao altera comissao, nao libera '
  'duplicidade e nao pula autorizacao — existe porque o mesmo Pix as vezes e '
  'lancado pelo operador, pelo Receptivo e por um terceiro setor.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. O pedido de NR duplicado
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pix_automatico_nr_pedidos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Quem vai FICAR com o acordo se for aprovado. Pode não ser quem pediu:
  -- líder registra em nome de operador, como no fluxo normal.
  operador_id        UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  operador_nome      TEXT,
  setor_id           UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  nr_cliente         TEXT NOT NULL,
  valor              NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  extra              BOOLEAN NOT NULL DEFAULT FALSE,
  /*
   * O registro que já existia. Guardado por ID e também DESNORMALIZADO
   * (`conflito_*`): o acordo em conflito pode ser excluído entre o pedido e a
   * decisão, e sem a cópia o líder ficaria decidindo sobre «um registro que
   * não existe mais» — sem saber de quem era nem de quanto.
   */
  conflito_acordo_id UUID REFERENCES public.pix_automatico_acordos(id) ON DELETE SET NULL,
  conflito_operador  TEXT,
  conflito_valor     NUMERIC(14,2),
  conflito_status    TEXT,
  conflito_em        TIMESTAMPTZ,
  /** Por que este lançamento é legítimo, na palavra de quem pede. */
  motivo             TEXT,
  status             TEXT NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente', 'aprovado', 'recusado')),
  decidido_por       UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  decidido_por_nome  TEXT,
  decidido_em        TIMESTAMPTZ,
  decisao_motivo     TEXT,
  /** O acordo criado quando o pedido foi aprovado. */
  acordo_id          UUID REFERENCES public.pix_automatico_acordos(id) ON DELETE SET NULL,
  criado_por         UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pix_nr_pedidos_abertos
  ON public.pix_automatico_nr_pedidos (empresa_id, criado_em DESC)
  WHERE status = 'pendente';

-- Um pedido aberto por NR por pessoa: clicar duas vezes não vira dois pedidos.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pix_nr_pedido_aberto
  ON public.pix_automatico_nr_pedidos
     (empresa_id, operador_id, public.fn_pix_nr_normalizar(nr_cliente))
  WHERE status = 'pendente';

ALTER TABLE public.pix_automatico_nr_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pix_automatico_nr_pedidos REPLICA IDENTITY FULL;

/*
 * Quem enxerga o pedido: o dono e quem aprova Pix na empresa.
 *
 * O operador precisa ver o próprio pedido — senão ele clica, nada acontece na
 * tela e ele registra de novo. Quem aprova vê os da empresa dele: a duplicidade
 * costuma cruzar setores (é justamente o caso do Receptivo), e limitar ao setor
 * esconderia metade do conflito de quem tem de julgá-lo.
 */
DROP POLICY IF EXISTS pix_nr_pedidos_select ON public.pix_automatico_nr_pedidos;
CREATE POLICY pix_nr_pedidos_select ON public.pix_automatico_nr_pedidos
  FOR SELECT TO authenticated
  USING (
    operador_id = (SELECT auth.uid())
    OR criado_por = (SELECT auth.uid())
    OR (public.fn_can_access_empresa(empresa_id)
        AND public.fn_user_tem('aprovar_pix_automatico'))
  );

-- Escrita SÓ por RPC: um INSERT solto criaria pedido em nome de outro, e um
-- UPDATE solto se autoaprovaria.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. O trigger passa a admitir a porta de dentro
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_pix_nr_bloqueia_duplicado()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_status TEXT;
BEGIN
  /*
   * A porta de dentro: `fn_pix_nr_pedido_decidir` liga este sinalizador antes
   * de inserir o acordo autorizado.
   *
   * `current_setting(..., true)` devolve NULL em vez de estourar quando a
   * variável nunca foi definida — que é o caso de 100% dos INSERTs normais.
   * E o `set_config` de lá é LOCAL: morre no fim da transação, então não há
   * janela em que um INSERT solto do cliente encontre o portão aberto.
   */
  IF COALESCE(current_setting('app.pix_nr_autorizado', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT a.status INTO v_status
    FROM public.pix_automatico_acordos a
   WHERE a.empresa_id = NEW.empresa_id
     AND a.id <> NEW.id
     AND public.fn_pix_nr_normalizar(a.nr_cliente)
         = public.fn_pix_nr_normalizar(NEW.nr_cliente)
   LIMIT 1;

  IF v_status IS NOT NULL THEN
    RAISE EXCEPTION
      'NR % já está registrado no Pix automático (status: %). Peça autorização do líder para registrar mesmo assim.',
      NEW.nr_cliente, v_status
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_pix_nr_bloqueia_duplicado() IS
  'v5 — um NR so pode ter UM registro vivo. A partir de 20260902 existe uma '
  'porta de dentro: fn_pix_nr_pedido_decidir liga app.pix_nr_autorizado (LOCAL) '
  'para criar o segundo registro que o lider autorizou.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Pedir
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_pix_nr_pedir(
  p_operador_id UUID,
  p_nr_cliente  TEXT,
  p_valor       NUMERIC,
  p_extra       BOOLEAN DEFAULT FALSE,
  p_motivo      TEXT DEFAULT NULL
)
RETURNS public.pix_automatico_nr_pedidos
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eu       UUID := (SELECT auth.uid());
  v_empresa  UUID;
  v_setor    UUID;
  v_nome     TEXT;
  v_conflito RECORD;
  v_saida    public.pix_automatico_nr_pedidos;
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'Sem sessao.'; END IF;
  IF COALESCE(TRIM(p_nr_cliente), '') = '' THEN RAISE EXCEPTION 'Informe o NR.'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN RAISE EXCEPTION 'Valor invalido.'; END IF;

  SELECT empresa_id, setor_id, nome INTO v_empresa, v_setor, v_nome
    FROM public.perfis WHERE id = p_operador_id;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'Operador nao encontrado.'; END IF;

  -- Registrar em nome de outro é o mesmo poder do fluxo normal: quem aprova
  -- Pix pode; o resto pede só para si.
  IF p_operador_id <> v_eu AND NOT public.fn_user_tem('aprovar_pix_automatico') THEN
    RAISE EXCEPTION 'Voce so pode pedir autorizacao para o proprio registro.';
  END IF;

  IF NOT public.fn_can_access_empresa(v_empresa) THEN
    RAISE EXCEPTION 'Operador de outra empresa.';
  END IF;

  SELECT a.id, a.operador_nome, a.valor, a.status, a.criado_em
    INTO v_conflito
    FROM public.pix_automatico_acordos a
   WHERE a.empresa_id = v_empresa
     AND public.fn_pix_nr_normalizar(a.nr_cliente)
         = public.fn_pix_nr_normalizar(p_nr_cliente)
   ORDER BY a.criado_em
   LIMIT 1;

  -- Sem conflito não há o que autorizar: o caminho é o registro normal, e
  -- mandar a pessoa esperar um líder por nada seria pior que o erro.
  IF v_conflito.id IS NULL THEN
    RAISE EXCEPTION 'Este NR nao esta registrado — faca o registro normal.';
  END IF;

  INSERT INTO public.pix_automatico_nr_pedidos (
    empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, extra,
    conflito_acordo_id, conflito_operador, conflito_valor, conflito_status, conflito_em,
    motivo, criado_por
  ) VALUES (
    v_empresa, p_operador_id, v_nome, v_setor, TRIM(p_nr_cliente), p_valor,
    COALESCE(p_extra, FALSE),
    v_conflito.id, v_conflito.operador_nome, v_conflito.valor, v_conflito.status,
    v_conflito.criado_em,
    NULLIF(TRIM(p_motivo), ''), v_eu
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_saida;

  -- `ON CONFLICT DO NOTHING` + o índice parcial: já existe pedido aberto desta
  -- pessoa para este NR. Devolve o que existe em vez de estourar — clicar duas
  -- vezes não é erro do usuário.
  IF v_saida.id IS NULL THEN
    SELECT * INTO v_saida
      FROM public.pix_automatico_nr_pedidos
     WHERE empresa_id = v_empresa
       AND operador_id = p_operador_id
       AND status = 'pendente'
       AND public.fn_pix_nr_normalizar(nr_cliente)
           = public.fn_pix_nr_normalizar(p_nr_cliente)
     LIMIT 1;
  END IF;

  RETURN v_saida;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_nr_pedir(UUID, TEXT, NUMERIC, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pix_nr_pedir(UUID, TEXT, NUMERIC, BOOLEAN, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Decidir
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_pix_nr_pedido_decidir(
  p_pedido_id UUID,
  p_aprovar   BOOLEAN,
  p_motivo    TEXT DEFAULT NULL
)
RETURNS public.pix_automatico_nr_pedidos
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eu     UUID := (SELECT auth.uid());
  v_nome   TEXT;
  v_p      public.pix_automatico_nr_pedidos;
  v_acordo UUID;
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'Sem sessao.'; END IF;

  SELECT * INTO v_p FROM public.pix_automatico_nr_pedidos WHERE id = p_pedido_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Pedido nao encontrado.'; END IF;
  IF v_p.status <> 'pendente' THEN RAISE EXCEPTION 'Este pedido ja foi decidido.'; END IF;

  IF NOT public.fn_can_access_empresa(v_p.empresa_id)
     OR NOT public.fn_user_tem('aprovar_pix_automatico') THEN
    RAISE EXCEPTION 'Voce nao pode decidir autorizacoes do Pix automatico.';
  END IF;

  SELECT nome INTO v_nome FROM public.perfis WHERE id = v_eu;

  IF p_aprovar THEN
    /*
     * A porta de dentro, e só aqui.
     *
     * `is_local = true`: o sinalizador vale até o fim DESTA transação. Sem
     * isso ele ficaria na conexão — e o pool do Supabase reaproveita conexão
     * entre requisições, o que deixaria o portão do trigger aberto para o
     * próximo INSERT de qualquer pessoa.
     */
    PERFORM set_config('app.pix_nr_autorizado', 'on', true);

    INSERT INTO public.pix_automatico_acordos (
      empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, extra, status
    ) VALUES (
      v_p.empresa_id, v_p.operador_id, v_p.operador_nome, v_p.setor_id,
      v_p.nr_cliente, v_p.valor, v_p.extra, 'pendente'
    )
    RETURNING id INTO v_acordo;

    PERFORM set_config('app.pix_nr_autorizado', 'off', true);
  END IF;

  UPDATE public.pix_automatico_nr_pedidos
     SET status            = CASE WHEN p_aprovar THEN 'aprovado' ELSE 'recusado' END,
         decidido_por      = v_eu,
         decidido_por_nome = v_nome,
         decidido_em       = NOW(),
         decisao_motivo    = NULLIF(TRIM(p_motivo), ''),
         acordo_id         = v_acordo
   WHERE id = p_pedido_id
  RETURNING * INTO v_p;

  RETURN v_p;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_nr_pedido_decidir(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pix_nr_pedido_decidir(UUID, BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_pix_nr_pedido_decidir(UUID, BOOLEAN, TEXT) IS
  'Aprova ou recusa o pedido de NR duplicado. Aprovado, cria o acordo pela '
  'porta de dentro do trigger (app.pix_nr_autorizado, LOCAL a transacao). O '
  'acordo nasce PENDENTE: autorizar a duplicidade nao e aprovar a comissao.';

/**
 * Cancelar o próprio pedido.
 *
 * Quem pediu por engano não deveria precisar de um líder para desfazer — e um
 * pedido que ninguém quer mais na fila é ruído para quem julga.
 */
CREATE OR REPLACE FUNCTION public.fn_pix_nr_pedido_cancelar(p_pedido_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_eu UUID := (SELECT auth.uid());
BEGIN
  DELETE FROM public.pix_automatico_nr_pedidos
   WHERE id = p_pedido_id
     AND status = 'pendente'
     AND (criado_por = v_eu OR operador_id = v_eu);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_nr_pedido_cancelar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pix_nr_pedido_cancelar(UUID) TO authenticated;
