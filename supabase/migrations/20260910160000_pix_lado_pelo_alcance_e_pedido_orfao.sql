-- ─────────────────────────────────────────────────────────────────────────────
-- Pix: quem decide o lado do pedido, e o pedido que perdeu a função
--
-- Duas queixas de 10/09/2026, com a mesma raiz em uma delas: perguntar o setor
-- do CADASTRO para saber por quem a pessoa responde.
--
-- ═══ 1. "a autorização de dois setores só aparece para super_admin" ═════════
--
-- `fn_pix_pode_decidir_lado` lia `perfis.setor_id`. Só que líder não se define
-- pelo cadastro: define-se pelas equipes que lidera, e o `setor_id` do cadastro
-- é resíduo (é o mesmo motivo pelo qual o Desempenho de Equipes lê
-- `equipe_lideres`, e não o cadastro).
--
-- Medido no banco: **Brunno Piccolo lidera 6 equipes espalhadas por 4 setores**
-- e tem um `setor_id` só. Pela comparação antiga ele assinava por 1 dos 4 — os
-- outros três lados ficavam sem ninguém que pudesse assinar, e o pedido só
-- andava se alguém com escopo pix = todos_setores passasse por ali. Daí o
-- sintoma "só aparece para super_admin". Os demais líderes têm cadastro
-- coincidindo com o setor que lideram, e por isso não reclamaram.
--
-- A correção usa `fn_setores_do_operador` — cadastro ∪ clones ∪ setores das
-- equipes lideradas —, que é a mesma função que governa a RLS de `perfis`.
--
-- `fn_meus_setores()` existe para a TELA fazer a mesma pergunta. O cliente
-- decidia por conta própria (`podeAssinarLadoNr` comparava com
-- `perfil.setor_id`), e foi assim que os dois lados divergiram: o botão sumia
-- da tela mesmo quando o banco teria deixado assinar. Uma regra, uma fonte.
--
-- ═══ 2. "diz que já registrei, mas são pessoas diferentes" ═════════════════
--
-- Aqui o fluxo de duas pessoas está correto e funcionando: dos pedidos criados
-- após a migration 20260909110000, os dois entre pessoas diferentes foram
-- aprovados sem obstáculo. O que a pessoa encontrou foi um pedido ÓRFÃO.
--
-- NR 13020393, 09/09: o acordo em conflito (Luan Barreto) foi apagado, a Maria
-- registrou o NR pelo caminho normal às 17:50:30 — sem duplicidade a resolver,
-- e por isso com `duplicidade_autorizada = false` — e o pedido continuou na
-- fila. Clicar em autorizar estourava `PIX_NR_MESMO_OPERADOR`, e a mensagem,
-- lida na tela, dizia o oposto do que o sistema faz: parecia recusar o caso de
-- duas pessoas, que é justamente o que o pedido existe para permitir.
--
-- A recusa estava certa — o NR já está em nome de quem pediu, e criar o acordo
-- de novo o duplicaria. O desfecho é que estava errado: estourar e deixar o
-- pedido pendente para sempre. Agora ele encerra apontando para o acordo que já
-- existe, com o motivo escrito.
--
-- Quando o conflito some mas quem pediu ainda NÃO registrou, nada muda: o
-- caminho normal segue e cria o acordo, que é o que a pessoa queria.
--
-- ── Como voltar atrás ────────────────────────────────────────────────────────
-- As três funções são `CREATE OR REPLACE`; a versão anterior está inteira em
-- 20260909110000_pix_nr_duplicidade_por_pessoa.sql.
-- ─────────────────────────────────────────────────────────────────────────────

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

  /*
   * O setor de quem decide NAO e o do cadastro.
   *
   * Lider se define pelas equipes que lidera, e o `perfis.setor_id` dele e
   * residuo. Brunno Piccolo lidera 6 equipes espalhadas por 4 setores e tinha
   * um `setor_id` so: pela comparacao antiga ele assinava por 1 dos 4, e os
   * outros tres lados ficavam sem ninguem — o pedido so andava se um
   * super_admin (escopo pix = todos_setores) passasse por ali. Foi a queixa de
   * 10/09/2026, que chegou como "so aparece para super_admin".
   *
   * `fn_setores_do_operador` e a resposta que o resto do sistema ja usa:
   * cadastro UNIAO clones UNIAO setores das equipes lideradas. E a mesma
   * funcao que governa a RLS de `perfis`.
   */
  RETURN EXISTS (
    SELECT 1
      FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s(setor_id)
     WHERE s.setor_id = p_setor_id
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_pix_pode_decidir_lado(UUID, UUID) IS
  'Posso assinar pelo setor informado num pedido de NR duplicado? Exige '
  'aprovar_pix_automatico e: escopo pix = todos_setores, ou o setor estar entre '
  'os meus (fn_setores_do_operador: cadastro, clones e equipes que lidero), ou '
  'o lado nao ter setor carimbado.';

REVOKE ALL ON FUNCTION public.fn_pix_pode_decidir_lado(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pix_pode_decidir_lado(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_meus_setores()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.setor_id
    FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s(setor_id);
$function$;

COMMENT ON FUNCTION public.fn_meus_setores() IS
  'Os setores por onde EU respondo: cadastro, clones e as equipes que lidero. '
  'Existe para a tela perguntar o mesmo que o banco, em vez de derivar a '
  'resposta do perfil e divergir.';

REVOKE ALL ON FUNCTION public.fn_meus_setores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_meus_setores() TO authenticated;

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
  v_ja        UUID;
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
  /*
   * O pedido pode ter perdido a funcao enquanto esperava assinatura.
   *
   * Caso real, NR 13020393 em 09/09/2026: o acordo em conflito foi APAGADO, a
   * pessoa registrou o NR pelo caminho normal — que a essa altura ja nao
   * encontrava duplicidade nenhuma, e por isso o acordo dela nasceu com
   * `duplicidade_autorizada = false` — e o pedido ficou na fila. Quem clicou
   * em autorizar levou `PIX_NR_MESMO_OPERADOR: esta pessoa ja registrou este
   * NR`, que lido na tela vira "o sistema nao deixa duas pessoas dividirem um
   * NR" — exatamente a regra que ESTE pedido existe para contornar.
   *
   * A recusa estava certa: o NR ja esta em nome de quem pediu, e criar o
   * acordo de novo o duplicaria. Errado era o desfecho — estourar, e deixar o
   * pedido PENDENTE para alguem tropecar nele de novo amanha.
   *
   * Agora o pedido encerra apontando para o acordo que ja existe. Nada e
   * criado, nada e duplicado, e a fila do lider nao guarda caso resolvido.
   */
  SELECT a.id INTO v_ja
    FROM public.pix_automatico_acordos a
   WHERE a.empresa_id  = v_p.empresa_id
     AND a.operador_id = v_p.operador_id
     AND public.fn_pix_nr_normalizar(a.nr_cliente)
         = public.fn_pix_nr_normalizar(v_p.nr_cliente)
   ORDER BY a.criado_em
   LIMIT 1;

  IF v_ja IS NOT NULL THEN
    UPDATE public.pix_automatico_nr_pedidos
       SET status            = 'aprovado',
           decidido_por      = v_eu,
           decidido_por_nome = v_nome,
           decidido_em       = NOW(),
           acordo_id         = v_ja,
           decisao_motivo    =
             COALESCE(NULLIF(TRIM(p_motivo), '') || ' — ', '')
             || 'Encerrado sem criar acordo: o NR ja estava registrado em nome de '
             || COALESCE(v_p.operador_nome, 'quem pediu') || '.'
     WHERE id = v_p.id
    RETURNING * INTO v_p;
    RETURN v_p;
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
  'Uma recusa encerra o pedido. Pedido cujo NR ja esta em nome de quem pediu '
  'encerra apontando para o acordo existente, sem criar nada.';
