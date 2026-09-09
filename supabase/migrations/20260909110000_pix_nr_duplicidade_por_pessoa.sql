-- ═══════════════════════════════════════════════════════════════════════════
-- Pix Automático: duplicidade é o mesmo NR em MÃOS DIFERENTES — e a autorização
-- passa a exigir os dois líderes
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## 1. O erro que aparecia ao clicar em «Autorizar»
--
--     duplicate key value violates unique constraint "idx_pix_auto_nr_unico"
--
-- A migration 20260902100000 ensinou o TRIGGER a deixar passar o segundo
-- registro autorizado (`app.pix_nr_autorizado`, local à transação). Mas o NR
-- único não é garantido só pelo trigger: existe também
--
--     CREATE UNIQUE INDEX idx_pix_auto_nr_unico
--       ON pix_automatico_acordos (empresa_id, fn_pix_nr_normalizar(nr_cliente));
--
-- e índice não lê sinalizador de transação. O trigger abria a porta, o índice
-- fechava logo atrás: a autorização NUNCA funcionou desde que foi criada, e o
-- líder via um erro do Postgres que não diz o que fazer.
--
-- A correção é dizer ao índice a mesma coisa que se disse ao trigger. A linha
-- que nasceu de uma autorização carimba `duplicidade_autorizada = TRUE` e o
-- índice passa a ser PARCIAL, ignorando essas linhas. O NR continua único
-- entre os registros comuns — que é a regra que interessa; a exceção é
-- exatamente a que um líder assinou.
--
-- ## 2. Duplicidade é entre PESSOAS diferentes
--
-- Regra da operação, 09/09/2026:
--
--   • o mesmo operador que tabulou o acordo na aba Acordos e depois o registra
--     aqui NÃO está duplicando nada — é o mesmo acordo, a mesma pessoa,
--     acompanhado nos dois lugares (e é assim que ele recebe a premiação). As
--     duas tabelas nunca conversaram, e o teste-guarda em
--     `pix_nr_duplicidade.test.ts` existe para que continue assim;
--
--   • o mesmo operador registrando o MESMO NR duas vezes DENTRO do Pix
--     continua barrado, e agora com uma mensagem que diz isso — não vai para a
--     fila de autorização. Não é caso de líder: é a mesma linha duas vezes, e
--     passar seria contar o mesmo dinheiro duas vezes na comissão e na dobra;
--
--   • pessoas diferentes — inclusive de setores diferentes — é o caso do
--     pedido. Receptivo registra o NR 23323; depois a Nicole, do Play 3, tenta
--     o mesmo NR. Aí sim há uma decisão a tomar.
--
-- ## 3. Dois setores, dois líderes
--
-- O pedido do Play 3 sobre um NR do Receptivo era decidido por UM líder — e
-- qualquer um dos dois lados podia decidir sozinho pelo outro. Agora a
-- autorização é dos DOIS setores envolvidos: enquanto faltar um, o pedido
-- continua pendente. Uma recusa, de qualquer lado, encerra.
--
-- Quando os dois lados estão no mesmo setor (ou o registro antigo não tem setor
-- carimbado) exige-se uma aprovação só: não há segundo líder a ouvir, e pedir
-- duas assinaturas da mesma pessoa seria cerimônia sem conteúdo.
--
-- Quem tem alcance sobre os dois setores (diretoria, administração, ou o líder
-- que acumula) pode assinar os dois lados — em dois cliques, um por lado, cada
-- um com o seu registro. Travar isso não protegeria ninguém: travaria o caso
-- legítimo de um setor sem líder próprio.

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. O selo da linha autorizada, e o índice que passa a respeitá-lo
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pix_automatico_acordos
  ADD COLUMN IF NOT EXISTS duplicidade_autorizada BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.pix_automatico_acordos.duplicidade_autorizada IS
  'Esta linha nasceu de um pedido de NR duplicado aprovado pelos lideres dos '
  'setores envolvidos. E o que a tira do indice unico idx_pix_auto_nr_unico — '
  'sem isso a autorizacao estourava com duplicate key.';

/*
 * As linhas que JÁ existem por autorização.
 *
 * A 20260902100000 criou `acordo_id` no pedido: todo acordo apontado por um
 * pedido aprovado nasceu pela porta de dentro e, portanto, é exceção legítima.
 * Sem este backfill, o índice novo recusaria a própria criação (as duas linhas
 * do mesmo NR estariam dentro dele) e a migration não subiria.
 */
UPDATE public.pix_automatico_acordos a
   SET duplicidade_autorizada = TRUE
  FROM public.pix_automatico_nr_pedidos p
 WHERE p.acordo_id = a.id
   AND p.status    = 'aprovado'
   AND a.duplicidade_autorizada = FALSE;

/*
 * Antes de trocar o índice: sobrou duplicata sem selo?
 *
 * O índice novo é único do mesmo jeito para as linhas comuns. Se houver duas
 * delas com o mesmo NR — coisa que o índice antigo não deixaria acontecer, mas
 * que uma restauração de backup ou uma carga manual pode ter criado —, o
 * CREATE falha com uma mensagem que não diz QUAIS são. Falhar aqui, dizendo os
 * NRs, poupa a caçada.
 */
DO $$
DECLARE v_lista TEXT;
BEGIN
  SELECT string_agg(DISTINCT nr, ', ')
    INTO v_lista
    FROM (
      SELECT public.fn_pix_nr_normalizar(a.nr_cliente) AS nr
        FROM public.pix_automatico_acordos a
       WHERE NOT a.duplicidade_autorizada
       GROUP BY a.empresa_id, public.fn_pix_nr_normalizar(a.nr_cliente)
      HAVING COUNT(*) > 1
    ) AS duplicados;

  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION
      'Ha NRs duplicados sem autorizacao no Pix (%). Resolva-os (excluir a linha errada, ou marcar duplicidade_autorizada na que um lider aprovou) antes de aplicar esta migration.',
      v_lista;
  END IF;
END
$$;

DROP INDEX IF EXISTS public.idx_pix_auto_nr_unico;

CREATE UNIQUE INDEX idx_pix_auto_nr_unico
    ON public.pix_automatico_acordos
       (empresa_id, public.fn_pix_nr_normalizar(nr_cliente))
 WHERE NOT duplicidade_autorizada;

COMMENT ON INDEX public.idx_pix_auto_nr_unico IS
  'Um NR, um registro comum por empresa. PARCIAL desde 20260909: a linha com '
  'duplicidade_autorizada fica de fora, porque um lider assinou aquela '
  'excecao. O trigger fn_pix_nr_bloqueia_duplicado continua sendo o portao.';

/*
 * O selo é do banco, não de quem edita.
 *
 * Duas coisas, e as duas protegem a mesma frase — «esta exceção foi assinada
 * por um líder, para AQUELE NR»:
 *
 *   1. trocar o NR derruba o selo. Sem isso a linha autorizada viraria um
 *      passe permanente: bastaria editá-la para gravar qualquer NR já ocupado,
 *      sem passar por líder nenhum;
 *
 *   2. ninguém LIGA o selo por UPDATE. Quem liga é `fn_pix_nr_pedido_decidir`,
 *      no INSERT, com o sinalizador de transação ligado. Um UPDATE solto que
 *      pusesse `duplicidade_autorizada = TRUE` tiraria a própria linha do
 *      índice único — a autorização inteira pela porta dos fundos.
 */
CREATE OR REPLACE FUNCTION public.fn_pix_selo_de_duplicidade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.duplicidade_autorizada
     AND NOT COALESCE(OLD.duplicidade_autorizada, FALSE)
     AND COALESCE(current_setting('app.pix_nr_autorizado', true), '') <> 'on' THEN
    NEW.duplicidade_autorizada := OLD.duplicidade_autorizada;
  END IF;

  IF public.fn_pix_nr_normalizar(NEW.nr_cliente)
     IS DISTINCT FROM public.fn_pix_nr_normalizar(OLD.nr_cliente) THEN
    NEW.duplicidade_autorizada := FALSE;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_pix_selo_de_duplicidade() IS
  'Trocar o NR derruba duplicidade_autorizada, e nenhum UPDATE liga o selo: '
  'quem liga e fn_pix_nr_pedido_decidir, no INSERT.';

DROP TRIGGER IF EXISTS trg_pix_selo_cai_ao_trocar_nr ON public.pix_automatico_acordos;
DROP TRIGGER IF EXISTS trg_pix_selo_de_duplicidade ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_selo_de_duplicidade
  BEFORE UPDATE ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_selo_de_duplicidade();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. O portão: mesmo operador é engano; pessoa diferente é pedido
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_pix_nr_bloqueia_duplicado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mesmo   RECORD;
  v_outro   RECORD;
BEGIN
  -- A porta de dentro: `fn_pix_nr_pedido_decidir` liga este sinalizador (LOCAL
  -- à transação) antes de inserir o acordo que os líderes autorizaram.
  IF COALESCE(current_setting('app.pix_nr_autorizado', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  /*
   * Duas perguntas diferentes, e a ordem importa.
   *
   * Primeiro: ESTA pessoa já registrou este NR? Se sim, não há o que autorizar
   * — é a mesma linha duas vezes, e mandá-la para a fila do líder daria à
   * duplicata a aparência de um caso a decidir.
   */
  SELECT a.id, a.status INTO v_mesmo
    FROM public.pix_automatico_acordos a
   WHERE a.empresa_id  = NEW.empresa_id
     AND a.id         <> NEW.id
     AND a.operador_id = NEW.operador_id
     AND public.fn_pix_nr_normalizar(a.nr_cliente)
         = public.fn_pix_nr_normalizar(NEW.nr_cliente)
   LIMIT 1;

  IF v_mesmo.id IS NOT NULL THEN
    RAISE EXCEPTION
      'PIX_NR_MESMO_OPERADOR: o NR % já está registrado no Pix por esta mesma pessoa (status: %). O mesmo acordo não entra duas vezes.',
      NEW.nr_cliente, v_mesmo.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Depois: outra pessoa está com o NR? Aí sim é o caso do pedido.
  SELECT a.id, a.status, a.operador_nome INTO v_outro
    FROM public.pix_automatico_acordos a
   WHERE a.empresa_id = NEW.empresa_id
     AND a.id        <> NEW.id
     AND public.fn_pix_nr_normalizar(a.nr_cliente)
         = public.fn_pix_nr_normalizar(NEW.nr_cliente)
   LIMIT 1;

  IF v_outro.id IS NOT NULL THEN
    RAISE EXCEPTION
      'NR % já está registrado no Pix automático por % (status: %). Peça autorização dos líderes dos dois setores para registrar mesmo assim.',
      NEW.nr_cliente, COALESCE(v_outro.operador_nome, 'outra pessoa'), v_outro.status
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_pix_nr_bloqueia_duplicado() IS
  'v6 — duplicidade e o mesmo NR em MAOS DIFERENTES: vira pedido, decidido '
  'pelos lideres dos dois setores. O mesmo operador repetindo o proprio NR e '
  'engano, e para com PIX_NR_MESMO_OPERADOR (restrict_violation). A porta de '
  'dentro (app.pix_nr_autorizado) segue valendo para o registro autorizado.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. O pedido ganha o lado do conflito
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pix_automatico_nr_pedidos
  ADD COLUMN IF NOT EXISTS conflito_operador_id UUID
    REFERENCES public.perfis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conflito_setor_id UUID
    REFERENCES public.setores(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pix_automatico_nr_pedidos.conflito_setor_id IS
  'Setor do registro que ja existia. E ele que diz QUEM e o segundo lider a '
  'assinar: NULL, ou igual ao setor de quem pede, exige uma aprovacao so.';

-- Os pedidos abertos de antes desta migration não têm o lado do conflito.
-- Sem o preenchimento eles ficariam com um lado só — o que não é errado, mas
-- é menos do que a regra nova promete.
UPDATE public.pix_automatico_nr_pedidos p
   SET conflito_operador_id = a.operador_id,
       conflito_setor_id    = a.setor_id
  FROM public.pix_automatico_acordos a
 WHERE p.conflito_acordo_id = a.id
   AND p.conflito_operador_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. As assinaturas, uma por lado
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pix_automatico_nr_pedido_aprovacoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id      UUID NOT NULL
                 REFERENCES public.pix_automatico_nr_pedidos(id) ON DELETE CASCADE,
  -- 'solicitante' = o setor de quem quer registrar; 'conflito' = o setor do
  -- registro que já existia.
  lado           TEXT NOT NULL CHECK (lado IN ('solicitante', 'conflito')),
  setor_id       UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  aprovador_id   UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  aprovador_nome TEXT,
  aprovado       BOOLEAN NOT NULL,
  motivo         TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Um lado assina uma vez. Clicar duas vezes não vira duas assinaturas, e
  -- mudar de ideia depois de assinar é assunto de um pedido novo.
  UNIQUE (pedido_id, lado)
);

CREATE INDEX IF NOT EXISTS idx_pix_nr_aprovacoes_pedido
  ON public.pix_automatico_nr_pedido_aprovacoes (pedido_id);

COMMENT ON TABLE public.pix_automatico_nr_pedido_aprovacoes IS
  'Quem assinou cada lado de um pedido de NR duplicado. O pedido so vira '
  'aprovado quando todos os lados exigidos assinaram; uma recusa encerra.';

ALTER TABLE public.pix_automatico_nr_pedido_aprovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pix_automatico_nr_pedido_aprovacoes REPLICA IDENTITY FULL;

-- Quem enxerga o pedido enxerga as assinaturas dele: o operador precisa saber
-- que falta um líder, senão «pendente» parece esquecimento.
DROP POLICY IF EXISTS pix_nr_aprovacoes_select ON public.pix_automatico_nr_pedido_aprovacoes;
CREATE POLICY pix_nr_aprovacoes_select ON public.pix_automatico_nr_pedido_aprovacoes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pix_automatico_nr_pedidos p
     WHERE p.id = pedido_id
       AND (
         p.operador_id = (SELECT auth.uid())
         OR p.criado_por = (SELECT auth.uid())
         OR (public.fn_can_access_empresa(p.empresa_id)
             AND public.fn_user_tem('aprovar_pix_automatico'))
       )
  ));

-- Escrita só por RPC: um INSERT solto seria a assinatura de quem quisesse.

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Quem pode assinar por um setor
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_pix_pode_decidir_lado(
  p_empresa_id UUID,
  p_setor_id   UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_meu_setor UUID;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN FALSE; END IF;
  IF NOT public.fn_user_tem('aprovar_pix_automatico') THEN RETURN FALSE; END IF;

  -- Quem enxerga todos os setores na aba Pix decide por qualquer um deles:
  -- diretoria e administração são exatamente quem resolve o impasse entre dois
  -- setores que não se entendem.
  IF public.fn_user_escopo('pix') >= 3 THEN RETURN TRUE; END IF;

  -- Lado sem setor conhecido: quem aprova Pix decide. Escondê-lo de todos
  -- deixaria o pedido preso para sempre.
  IF p_setor_id IS NULL THEN RETURN TRUE; END IF;

  SELECT setor_id INTO v_meu_setor
    FROM public.perfis WHERE id = (SELECT auth.uid());

  RETURN v_meu_setor IS NOT DISTINCT FROM p_setor_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_pix_pode_decidir_lado(UUID, UUID) IS
  'Posso assinar pelo setor informado num pedido de NR duplicado? Exige '
  'aprovar_pix_automatico e: escopo pix = todos_setores, ou ser do setor, ou '
  'o lado nao ter setor carimbado.';

REVOKE ALL ON FUNCTION public.fn_pix_pode_decidir_lado(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pix_pode_decidir_lado(UUID, UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Pedir — agora recusando o engano do próprio operador
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_pix_nr_pedir(
  p_operador_id UUID,
  p_nr_cliente  TEXT,
  p_valor       NUMERIC,
  p_extra       BOOLEAN DEFAULT FALSE,
  p_motivo      TEXT DEFAULT NULL
)
RETURNS public.pix_automatico_nr_pedidos
LANGUAGE plpgsql
SECURITY DEFINER
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

  IF p_operador_id <> v_eu AND NOT public.fn_user_tem('aprovar_pix_automatico') THEN
    RAISE EXCEPTION 'Voce so pode pedir autorizacao para o proprio registro.';
  END IF;

  IF NOT public.fn_can_access_empresa(v_empresa) THEN
    RAISE EXCEPTION 'Operador de outra empresa.';
  END IF;

  /*
   * O próprio operador repetindo o próprio NR não é pedido: é engano.
   *
   * Mandar isso para a fila faria o líder decidir sobre uma duplicata pura — e
   * aprová-la contaria o mesmo dinheiro duas vezes na comissão e na dobra.
   */
  IF EXISTS (
    SELECT 1 FROM public.pix_automatico_acordos a
     WHERE a.empresa_id  = v_empresa
       AND a.operador_id = p_operador_id
       AND public.fn_pix_nr_normalizar(a.nr_cliente)
           = public.fn_pix_nr_normalizar(p_nr_cliente)
  ) THEN
    RAISE EXCEPTION
      'PIX_NR_MESMO_OPERADOR: este NR ja esta registrado no Pix por esta mesma pessoa.';
  END IF;

  -- O registro em conflito: o mais antigo, que é o que "chegou primeiro".
  SELECT a.id, a.operador_id, a.operador_nome, a.setor_id, a.valor, a.status, a.criado_em
    INTO v_conflito
    FROM public.pix_automatico_acordos a
   WHERE a.empresa_id = v_empresa
     AND public.fn_pix_nr_normalizar(a.nr_cliente)
         = public.fn_pix_nr_normalizar(p_nr_cliente)
   ORDER BY a.criado_em
   LIMIT 1;

  IF v_conflito.id IS NULL THEN
    RAISE EXCEPTION 'Este NR nao esta registrado — faca o registro normal.';
  END IF;

  INSERT INTO public.pix_automatico_nr_pedidos (
    empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, extra,
    conflito_acordo_id, conflito_operador, conflito_operador_id, conflito_setor_id,
    conflito_valor, conflito_status, conflito_em,
    motivo, criado_por
  ) VALUES (
    v_empresa, p_operador_id, v_nome, v_setor, TRIM(p_nr_cliente), p_valor,
    COALESCE(p_extra, FALSE),
    v_conflito.id, v_conflito.operador_nome, v_conflito.operador_id, v_conflito.setor_id,
    v_conflito.valor, v_conflito.status, v_conflito.criado_em,
    NULLIF(TRIM(p_motivo), ''), v_eu
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_saida;

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
-- 7. Decidir — por LADO, e o acordo só nasce com todos os lados assinados
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A assinatura antiga (3 argumentos) sai de cena: mantê-la ao lado da nova
-- deixaria a chamada por nome do PostgREST ambígua, e o cliente escolheria uma
-- das duas por sorteio.

DROP FUNCTION IF EXISTS public.fn_pix_nr_pedido_decidir(UUID, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION public.fn_pix_nr_pedido_decidir(
  p_pedido_id UUID,
  p_aprovar   BOOLEAN,
  p_motivo    TEXT DEFAULT NULL,
  /**
   * Qual lado está assinando. NULL = «o lado que eu puder assinar e que ainda
   * falta» — é o que a tela manda quando há um lado só.
   */
  p_lado      TEXT DEFAULT NULL
)
RETURNS public.pix_automatico_nr_pedidos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eu        UUID := (SELECT auth.uid());
  v_nome      TEXT;
  v_p         public.pix_automatico_nr_pedidos;
  v_lados     TEXT[];
  v_lado      TEXT;
  v_setor     UUID;
  v_faltam    INTEGER;
  v_acordo    UUID;
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'Sem sessao.'; END IF;

  -- `FOR UPDATE`: duas telas assinando lados diferentes ao mesmo tempo é o
  -- caso real. Sem a trava, as duas leriam «falta o outro lado» e nenhuma
  -- criaria o acordo.
  SELECT * INTO v_p
    FROM public.pix_automatico_nr_pedidos
   WHERE id = p_pedido_id
     FOR UPDATE;

  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Pedido nao encontrado.'; END IF;
  IF v_p.status <> 'pendente' THEN RAISE EXCEPTION 'Este pedido ja foi decidido.'; END IF;

  /*
   * Os lados que precisam assinar.
   *
   * Dois setores distintos e conhecidos: os dois líderes. Mesmo setor, ou o
   * registro antigo sem setor carimbado: um só — não há segundo líder a ouvir.
   */
  IF v_p.setor_id IS NOT NULL
     AND v_p.conflito_setor_id IS NOT NULL
     AND v_p.conflito_setor_id <> v_p.setor_id THEN
    v_lados := ARRAY['solicitante', 'conflito'];
  ELSE
    v_lados := ARRAY['solicitante'];
  END IF;

  -- Qual lado estou assinando?
  IF p_lado IS NOT NULL THEN
    IF NOT (p_lado = ANY (v_lados)) THEN
      RAISE EXCEPTION 'PIX_NR_LADO_INVALIDO: este pedido nao tem o lado %.', p_lado;
    END IF;
    v_lado := p_lado;
  ELSE
    -- `AS t(lado)` nomeia a coluna: sem o nome, `l` seria ao mesmo tempo o
    -- alias da tabela e o da coluna, e a leitura fica ambígua para quem vier
    -- depois.
    SELECT t.lado INTO v_lado
      FROM unnest(v_lados) AS t(lado)
     WHERE NOT EXISTS (
             SELECT 1 FROM public.pix_automatico_nr_pedido_aprovacoes ap
              WHERE ap.pedido_id = v_p.id AND ap.lado = t.lado)
       AND public.fn_pix_pode_decidir_lado(
             v_p.empresa_id,
             CASE WHEN t.lado = 'solicitante'
                  THEN v_p.setor_id ELSE v_p.conflito_setor_id END)
     LIMIT 1;

    IF v_lado IS NULL THEN
      RAISE EXCEPTION
        'PIX_NR_SEM_LADO: voce nao pode decidir por nenhum dos setores deste pedido, ou o seu lado ja assinou.';
    END IF;
  END IF;

  v_setor := CASE WHEN v_lado = 'solicitante' THEN v_p.setor_id ELSE v_p.conflito_setor_id END;

  IF NOT public.fn_pix_pode_decidir_lado(v_p.empresa_id, v_setor) THEN
    RAISE EXCEPTION
      'PIX_NR_LADO_NAO_PERMITIDO: voce nao pode decidir pelo setor deste lado do pedido.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pix_automatico_nr_pedido_aprovacoes ap
              WHERE ap.pedido_id = v_p.id AND ap.lado = v_lado) THEN
    RAISE EXCEPTION 'PIX_NR_LADO_JA_DECIDIDO: este lado ja assinou este pedido.';
  END IF;

  SELECT nome INTO v_nome FROM public.perfis WHERE id = v_eu;

  INSERT INTO public.pix_automatico_nr_pedido_aprovacoes
    (pedido_id, lado, setor_id, aprovador_id, aprovador_nome, aprovado, motivo)
  VALUES
    (v_p.id, v_lado, v_setor, v_eu, v_nome, COALESCE(p_aprovar, FALSE),
     NULLIF(TRIM(p_motivo), ''));

  /*
   * Uma recusa encerra o pedido.
   *
   * Não se espera o outro lado: o registro duplicado só existe se TODOS
   * concordarem, então um «não» já respondeu a pergunta. Esperar seria manter
   * na fila um caso que já tem resposta.
   */
  IF NOT COALESCE(p_aprovar, FALSE) THEN
    UPDATE public.pix_automatico_nr_pedidos
       SET status = 'recusado',
           decidido_por = v_eu, decidido_por_nome = v_nome,
           decidido_em = NOW(), decisao_motivo = NULLIF(TRIM(p_motivo), '')
     WHERE id = v_p.id
    RETURNING * INTO v_p;
    RETURN v_p;
  END IF;

  -- Falta algum lado? O pedido segue pendente, e a tela mostra quem já assinou.
  SELECT COUNT(*) INTO v_faltam
    FROM unnest(v_lados) AS t(lado)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.pix_automatico_nr_pedido_aprovacoes ap
      WHERE ap.pedido_id = v_p.id AND ap.lado = t.lado AND ap.aprovado);

  IF v_faltam > 0 THEN
    RETURN v_p;
  END IF;

  /*
   * Todos assinaram. Revalida antes de criar: entre o pedido e a segunda
   * assinatura o mundo andou — a própria pessoa pode ter registrado o NR por
   * outro caminho, e aí o acordo nasceria duplicado em nome dela.
   */
  IF EXISTS (
    SELECT 1 FROM public.pix_automatico_acordos a
     WHERE a.empresa_id  = v_p.empresa_id
       AND a.operador_id = v_p.operador_id
       AND public.fn_pix_nr_normalizar(a.nr_cliente)
           = public.fn_pix_nr_normalizar(v_p.nr_cliente)
  ) THEN
    RAISE EXCEPTION
      'PIX_NR_MESMO_OPERADOR: esta pessoa ja registrou este NR — nao ha o que autorizar.';
  END IF;

  -- A porta de dentro do trigger, e o selo que tira a linha do índice único.
  PERFORM set_config('app.pix_nr_autorizado', 'on', true);

  INSERT INTO public.pix_automatico_acordos (
    empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, extra,
    status, duplicidade_autorizada
  ) VALUES (
    v_p.empresa_id, v_p.operador_id, v_p.operador_nome, v_p.setor_id,
    v_p.nr_cliente, v_p.valor, v_p.extra, 'pendente', TRUE
  )
  RETURNING id INTO v_acordo;

  PERFORM set_config('app.pix_nr_autorizado', 'off', true);

  UPDATE public.pix_automatico_nr_pedidos
     SET status            = 'aprovado',
         decidido_por      = v_eu,
         decidido_por_nome = v_nome,
         decidido_em       = NOW(),
         decisao_motivo    = NULLIF(TRIM(p_motivo), ''),
         acordo_id         = v_acordo
   WHERE id = v_p.id
  RETURNING * INTO v_p;

  RETURN v_p;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_nr_pedido_decidir(UUID, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pix_nr_pedido_decidir(UUID, BOOLEAN, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_pix_nr_pedido_decidir(UUID, BOOLEAN, TEXT, TEXT) IS
  'Assina UM lado do pedido de NR duplicado. O acordo so nasce quando todos os '
  'lados exigidos assinaram — dois setores distintos exigem os dois lideres. '
  'Uma recusa encerra o pedido. O acordo nasce PENDENTE e com '
  'duplicidade_autorizada, que e o que o indice unico parcial ignora.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Verificação — para ser lida, não só executada.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_parcial BOOLEAN;
BEGIN
  SELECT pg_get_indexdef(i.indexrelid) LIKE '%WHERE%duplicidade_autorizada%'
    INTO v_parcial
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname = 'idx_pix_auto_nr_unico';

  IF NOT COALESCE(v_parcial, FALSE) THEN
    RAISE EXCEPTION
      'idx_pix_auto_nr_unico nao ficou parcial — a autorizacao continuaria estourando com duplicate key.';
  END IF;

  IF to_regclass('public.pix_automatico_nr_pedido_aprovacoes') IS NULL THEN
    RAISE EXCEPTION 'A tabela de assinaturas por lado nao foi criada.';
  END IF;

  RAISE NOTICE 'Pix: duplicidade por pessoa e assinatura dos dois setores no ar.';
END
$$;

COMMIT;
