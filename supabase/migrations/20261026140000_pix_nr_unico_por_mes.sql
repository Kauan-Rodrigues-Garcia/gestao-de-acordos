-- ═══════════════════════════════════════════════════════════════════════════
-- Pix Automático: o NR é único DENTRO DO MÊS (26/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O caso
--
-- NR 12963612. A Agatha (Receptivo) registrou em 10/08; em 26/10 a Erika quis
-- registrar o mesmo NR, e o sistema abriu um pedido de transferência para os
-- líderes — por causa de um registro de dois meses antes. Não há o que decidir:
-- agosto é outro mês, outra comissão, e o registro de agosto continua onde está.
--
-- ## A regra nova
--
--   • OUTRA pessoa com o NR no MESMO MÊS → o pedido aos líderes, como antes;
--   • outra pessoa só em OUTRO mês → o registro entra normal;
--   • a MESMA pessoa com o NR, em QUALQUER mês → continua barrado
--     (PIX_NR_MESMO_OPERADOR): a mesma operadora registrar o mesmo NR outra vez
--     é repetição, não um acordo novo.
--
-- O mês é o do registro (`criado_em`) no fuso da operação — o mesmo de
-- `mesLocalPix` na tela, da aba do Pix e do fechamento.
--
-- ## O que muda
--
--   1. `fn_pix_mes(timestamptz)`: o mês, em São Paulo.
--   2. `idx_pix_auto_nr_unico` passa a ser único por (empresa, NR, MÊS).
--   3. `fn_pix_nr_bloqueia_duplicado`: outra pessoa só barra no mesmo mês.
--   4. `fn_pix_nr_pedir`: o conflito é o registro de outra pessoa NESTE mês.
--   5. `fn_pix_nr_pedido_decidir`: transferir tira o NR só de quem o tem no mês
--      do pedido — o registro de outro mês fica.
--   6. Os pedidos abertos que a regra nova já não faria (o da Erika, em
--      26/10/2026) viram registro de quem pediu, pendente de avaliação.
--
-- `pix_automatico_nr_registro` continua um por NR e passa a dizer quem registrou
-- POR ÚLTIMO (o AFTER INSERT já fazia upsert). `fn_pix_nr_bloqueia_troca` não
-- muda: trocar o NR de um registro para um NR já usado segue barrado.
--
-- Os corpos partem do que estava em produção em 26/10/2026 (pg_get_functiondef).
-- Reaplicável.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── 1. O mês do registro ────────────────────────────────────────────────────
--
-- IMMUTABLE para poder entrar no índice. O fuso é fixo de propósito (a operação
-- é uma só, ver `src/lib/mesPix.ts`).

CREATE OR REPLACE FUNCTION public.fn_pix_mes(p_instante TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
  SELECT date_trunc('month', p_instante AT TIME ZONE 'America/Sao_Paulo')::date;
$function$;

COMMENT ON FUNCTION public.fn_pix_mes(TIMESTAMPTZ) IS
  'O mês (1º dia) de um registro do Pix, no fuso da operação. É o mês em que o NR é único. Ver 20261026140000.';

-- ── 2. O índice único passa a ser por mês ───────────────────────────────────
--
-- Hoje o NR é único na empresa inteira, então já é único em cada mês: o índice
-- novo nasce sem conflito.

DROP INDEX IF EXISTS public.idx_pix_auto_nr_unico;

CREATE UNIQUE INDEX idx_pix_auto_nr_unico
    ON public.pix_automatico_acordos
       (empresa_id, public.fn_pix_nr_normalizar(nr_cliente), public.fn_pix_mes(criado_em))
 WHERE NOT duplicidade_autorizada;

COMMENT ON INDEX public.idx_pix_auto_nr_unico IS
  'Um NR, um registro comum por empresa POR MÊS (20261026140000). A linha com '
  'duplicidade_autorizada fica de fora. O trigger fn_pix_nr_bloqueia_duplicado '
  'continua sendo o portão: a mesma pessoa não repete o NR em mês nenhum.';

-- ── 3. O portão ─────────────────────────────────────────────────────────────

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
   * Primeiro: ESTA pessoa já registrou este NR? Se sim — em qualquer mês —, não
   * há o que autorizar: é a mesma linha duas vezes, e mandá-la para a fila do
   * líder daria à duplicata a aparência de um caso a decidir.
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

  -- Depois: outra pessoa está com o NR NESTE MÊS? Aí sim é o caso do pedido.
  -- O registro de outra pessoa em outro mês não barra (20261026140000).
  SELECT a.id, a.status, a.operador_nome INTO v_outro
    FROM public.pix_automatico_acordos a
   WHERE a.empresa_id = NEW.empresa_id
     AND a.id        <> NEW.id
     AND public.fn_pix_nr_normalizar(a.nr_cliente)
         = public.fn_pix_nr_normalizar(NEW.nr_cliente)
     AND public.fn_pix_mes(a.criado_em) = public.fn_pix_mes(COALESCE(NEW.criado_em, now()))
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
  'v7 — o NR e unico DENTRO DO MES (20261026140000): outra pessoa com o NR no '
  'mesmo mes vira pedido aos lideres; em outro mes, o registro entra. A mesma '
  'pessoa repetindo o proprio NR, em qualquer mes, para com PIX_NR_MESMO_OPERADOR.';

-- ── 4. O pedido: o conflito é o registro de outra pessoa NESTE mês ─────────

CREATE OR REPLACE FUNCTION public.fn_pix_nr_pedir(p_operador_id uuid, p_nr_cliente text, p_valor numeric, p_extra boolean DEFAULT false, p_motivo text DEFAULT NULL::text)
 RETURNS pix_automatico_nr_pedidos
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

  -- O registro em conflito: o mais antigo DESTE MÊS, que é o que "chegou
  -- primeiro". O de outro mês não é conflito (20261026140000).
  SELECT a.id, a.operador_id, a.operador_nome, a.setor_id, a.valor, a.status, a.criado_em
    INTO v_conflito
    FROM public.pix_automatico_acordos a
   WHERE a.empresa_id = v_empresa
     AND public.fn_pix_nr_normalizar(a.nr_cliente)
         = public.fn_pix_nr_normalizar(p_nr_cliente)
     AND public.fn_pix_mes(a.criado_em) = public.fn_pix_mes(now())
   ORDER BY a.criado_em
   LIMIT 1;

  IF v_conflito.id IS NULL THEN
    RAISE EXCEPTION 'Este NR nao esta com outra pessoa neste mes — faca o registro normal.';
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

-- ── 5. Transferir tira o NR só de quem o tem no mês do pedido ──────────────

CREATE OR REPLACE FUNCTION public.fn_pix_nr_pedido_decidir(p_pedido_id uuid, p_aprovar boolean, p_motivo text DEFAULT NULL::text, p_lado text DEFAULT NULL::text)
 RETURNS pix_automatico_nr_pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_eu        uuid := (select auth.uid());
  v_nome      text;
  v_p         public.pix_automatico_nr_pedidos;
  v_lados     text[];
  v_lado      text;
  v_setor     uuid;
  v_faltam    integer;
  v_acordo    uuid;
  v_ja        uuid;
  v_saida     public.pix_automatico_acordos;
  v_sairam    text[] := '{}';
  v_destino   text;
  v_resumo    text;
begin
  if v_eu is null then raise exception 'Sem sessao.'; end if;

  -- `FOR UPDATE`: duas telas assinando lados diferentes ao mesmo tempo é o
  -- caso real. Sem a trava, as duas leriam «falta o outro lado» e nenhuma
  -- concluiria.
  select * into v_p
    from public.pix_automatico_nr_pedidos
   where id = p_pedido_id
     for update;

  if v_p.id is null then raise exception 'Pedido nao encontrado.'; end if;
  if v_p.status <> 'pendente' then raise exception 'Este pedido ja foi decidido.'; end if;

  /*
   * Os lados que precisam assinar.
   *
   * Dois setores distintos e conhecidos: os dois líderes. Mesmo setor, ou o
   * registro antigo sem setor carimbado: um só — não há segundo líder a ouvir.
   */
  if v_p.setor_id is not null
     and v_p.conflito_setor_id is not null
     and v_p.conflito_setor_id <> v_p.setor_id then
    v_lados := array['solicitante', 'conflito'];
  else
    v_lados := array['solicitante'];
  end if;

  -- Qual lado estou assinando?
  if p_lado is not null then
    if not (p_lado = any (v_lados)) then
      raise exception 'PIX_NR_LADO_INVALIDO: este pedido nao tem o lado %.', p_lado;
    end if;
    v_lado := p_lado;
  else
    select t.lado into v_lado
      from unnest(v_lados) as t(lado)
     where not exists (
             select 1 from public.pix_automatico_nr_pedido_aprovacoes ap
              where ap.pedido_id = v_p.id and ap.lado = t.lado)
       and public.fn_pix_pode_decidir_lado(
             v_p.empresa_id,
             case when t.lado = 'solicitante'
                  then v_p.setor_id else v_p.conflito_setor_id end)
     limit 1;

    if v_lado is null then
      raise exception
        'PIX_NR_SEM_LADO: voce nao pode decidir por nenhum dos setores deste pedido, ou o seu lado ja assinou.';
    end if;
  end if;

  v_setor := case when v_lado = 'solicitante' then v_p.setor_id else v_p.conflito_setor_id end;

  if not public.fn_pix_pode_decidir_lado(v_p.empresa_id, v_setor) then
    raise exception
      'PIX_NR_LADO_NAO_PERMITIDO: voce nao pode decidir pelo setor deste lado do pedido.';
  end if;

  if exists (select 1 from public.pix_automatico_nr_pedido_aprovacoes ap
              where ap.pedido_id = v_p.id and ap.lado = v_lado) then
    raise exception 'PIX_NR_LADO_JA_DECIDIDO: este lado ja assinou este pedido.';
  end if;

  select nome into v_nome from public.perfis where id = v_eu;

  insert into public.pix_automatico_nr_pedido_aprovacoes
    (pedido_id, lado, setor_id, aprovador_id, aprovador_nome, aprovado, motivo)
  values
    (v_p.id, v_lado, v_setor, v_eu, v_nome, coalesce(p_aprovar, false),
     nullif(trim(p_motivo), ''));

  /*
   * Uma recusa encerra o pedido: o NR fica com quem já tinha.
   *
   * Não se espera o outro lado — a transferência só acontece se TODOS
   * concordarem, então um «não» já respondeu a pergunta.
   */
  if not coalesce(p_aprovar, false) then
    update public.pix_automatico_nr_pedidos
       set status = 'recusado',
           decidido_por = v_eu, decidido_por_nome = v_nome,
           decidido_em = now(), decisao_motivo = nullif(trim(p_motivo), '')
     where id = v_p.id
    returning * into v_p;
    return v_p;
  end if;

  -- Falta algum lado? O pedido segue pendente, e a tela mostra quem já assinou.
  select count(*) into v_faltam
    from unnest(v_lados) as t(lado)
   where not exists (
     select 1 from public.pix_automatico_nr_pedido_aprovacoes ap
      where ap.pedido_id = v_p.id and ap.lado = t.lado and ap.aprovado);

  if v_faltam > 0 then
    return v_p;
  end if;

  /*
   * Todos assinaram: o NR MUDA DE DONO — no mês do pedido.
   *
   * Sai de todo mundo que não é quem pediu e que tem o NR NAQUELE MÊS. O
   * registro de outro mês é outro acordo, de outra comissão, e fica onde está
   * (20261026140000).
   *
   * Cada saída passa pela lixeira do Pix, como a exclusão feita pela tela
   * (`excluirAcordoPix`): recuperável por 3 dias. Os triggers de exclusão
   * cuidam do resto (histórico, saldo, registro de NR, aviso ao operador) e
   * leem `app.pix_exclusao_motivo` para dizer «transferido», não «excluído».
   */
  v_destino := coalesce(nullif(trim(v_p.operador_nome), ''), 'quem pediu');

  for v_saida in
    select a.*
      from public.pix_automatico_acordos a
     where a.empresa_id = v_p.empresa_id
       and a.operador_id is distinct from v_p.operador_id
       and public.fn_pix_nr_normalizar(a.nr_cliente)
           = public.fn_pix_nr_normalizar(v_p.nr_cliente)
       and public.fn_pix_mes(a.criado_em) = public.fn_pix_mes(v_p.criado_em)
     order by a.criado_em
       for update
  loop
    if v_saida.pago then
      raise exception
        'PIX_NR_TRANSFERENCIA_PAGA: o NR % ja teve a comissao paga para %. Desfaca o pagamento antes de transferir.',
        v_saida.nr_cliente, coalesce(v_saida.operador_nome, 'outra pessoa')
        using errcode = 'restrict_violation';
    end if;

    -- `motivo = 'transferencia'`: o que saiu por transferência não volta pela
    -- lixeira (20260928220000) — voltaria o NR para duas mãos.
    insert into public.lixeira_pix_automatico
      (empresa_id, acordo_id, nr_cliente, valor, status, operador_id, operador_nome,
       setor_id, dados_completos, excluido_por, excluido_por_nome, motivo, transferido_para_nome)
    values
      (v_saida.empresa_id, v_saida.id, v_saida.nr_cliente, v_saida.valor, v_saida.status,
       v_saida.operador_id, v_saida.operador_nome, v_saida.setor_id, to_jsonb(v_saida),
       v_eu, v_nome, 'transferencia', v_destino);

    perform set_config(
      'app.pix_exclusao_motivo',
      'O NR ' || v_saida.nr_cliente || ' (R$ ' || public.fn_pix_valor_br(v_saida.valor)
        || ') saiu do seu Pix automático e foi transferido para ' || v_destino
        || ', com autorização dos líderes.',
      true);

    delete from public.pix_automatico_acordos where id = v_saida.id;

    v_sairam := array_append(v_sairam, coalesce(nullif(trim(v_saida.operador_nome), ''), 'outra pessoa'));
  end loop;

  perform set_config('app.pix_exclusao_motivo', '', true);

  v_resumo := case
    when cardinality(v_sairam) > 0
      then 'Transferido de ' || array_to_string(v_sairam, ', ') || ' para ' || v_destino || '.'
    else 'O registro de origem já não existia; registrado para ' || v_destino || '.'
  end;

  /*
   * Quem pediu já tem o NR? Aconteceu no NR 13020393 (09/09/2026): o acordo
   * em conflito sumiu e a pessoa registrou pelo caminho normal enquanto o
   * pedido esperava. Criar de novo o duplicaria — o pedido fecha apontando
   * para o que já existe.
   */
  select a.id into v_ja
    from public.pix_automatico_acordos a
   where a.empresa_id  = v_p.empresa_id
     and a.operador_id = v_p.operador_id
     and public.fn_pix_nr_normalizar(a.nr_cliente)
         = public.fn_pix_nr_normalizar(v_p.nr_cliente)
   order by a.criado_em
   limit 1;

  if v_ja is not null then
    update public.pix_automatico_nr_pedidos
       set status            = 'aprovado',
           decidido_por      = v_eu,
           decidido_por_nome = v_nome,
           decidido_em       = now(),
           acordo_id         = v_ja,
           decisao_motivo    = coalesce(nullif(trim(p_motivo), '') || ' — ', '')
                               || v_resumo || ' O NR já estava registrado em nome de '
                               || v_destino || '.'
     where id = v_p.id
    returning * into v_p;
    return v_p;
  end if;

  -- Ninguém mais tem o NR: o registro entra pela porta normal, sem selo de
  -- duplicidade, e o índice único volta a protegê-lo.
  insert into public.pix_automatico_acordos (
    empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, extra,
    status, duplicidade_autorizada
  ) values (
    v_p.empresa_id, v_p.operador_id, v_p.operador_nome, v_p.setor_id,
    v_p.nr_cliente, v_p.valor, v_p.extra, 'pendente', false
  )
  returning id into v_acordo;

  update public.pix_automatico_nr_pedidos
     set status            = 'aprovado',
         decidido_por      = v_eu,
         decidido_por_nome = v_nome,
         decidido_em       = now(),
         decisao_motivo    = coalesce(nullif(trim(p_motivo), '') || ' — ', '') || v_resumo,
         acordo_id         = v_acordo
   where id = v_p.id
  returning * into v_p;

  return v_p;
end;
$function$;

-- ── 6. Os pedidos abertos que a regra nova não faria ────────────────────────
--
-- Pedido pendente em que ninguém mais tem o NR no mês do pedido, e quem pediu
-- não tem o NR em mês nenhum: com a regra nova ele teria sido um registro
-- comum. Vira esse registro — pendente de avaliação, na data do pedido —, e o
-- pedido fecha apontando para ele. O registro do outro mês não é tocado.
--
-- Em 26/10/2026 era um só: NR 12963612, Erika Eduarda (registro antigo da
-- Agatha Rocha, de 10/08/2026).

DO $pedidos$
DECLARE
  v_p      public.pix_automatico_nr_pedidos;
  v_acordo UUID;
  v_total  INTEGER := 0;
BEGIN
  FOR v_p IN
    SELECT p.*
      FROM public.pix_automatico_nr_pedidos p
     WHERE p.status = 'pendente'
       AND NOT EXISTS (
         SELECT 1 FROM public.pix_automatico_acordos a
          WHERE a.empresa_id = p.empresa_id
            AND a.operador_id IS DISTINCT FROM p.operador_id
            AND public.fn_pix_nr_normalizar(a.nr_cliente) = public.fn_pix_nr_normalizar(p.nr_cliente)
            AND public.fn_pix_mes(a.criado_em) = public.fn_pix_mes(p.criado_em))
       AND NOT EXISTS (
         SELECT 1 FROM public.pix_automatico_acordos a
          WHERE a.empresa_id = p.empresa_id
            AND a.operador_id = p.operador_id
            AND public.fn_pix_nr_normalizar(a.nr_cliente) = public.fn_pix_nr_normalizar(p.nr_cliente))
     ORDER BY p.criado_em
       FOR UPDATE
  LOOP
    INSERT INTO public.pix_automatico_acordos (
      empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, extra,
      status, duplicidade_autorizada, criado_em
    ) VALUES (
      v_p.empresa_id, v_p.operador_id, v_p.operador_nome, v_p.setor_id,
      v_p.nr_cliente, v_p.valor, v_p.extra, 'pendente', false, v_p.criado_em
    )
    RETURNING id INTO v_acordo;

    UPDATE public.pix_automatico_nr_pedidos
       SET status            = 'aprovado',
           decidido_por      = NULL,
           decidido_por_nome = 'Sistema',
           decidido_em       = now(),
           acordo_id         = v_acordo,
           decisao_motivo    = 'Registrado direto: o registro de '
                               || COALESCE(NULLIF(TRIM(v_p.conflito_operador), ''), 'outra pessoa')
                               || ' é de outro mês, e desde 26/10/2026 o NR é único dentro do mês.'
     WHERE id = v_p.id;

    v_total := v_total + 1;
  END LOOP;

  RAISE NOTICE 'Pedidos de NR convertidos em registro: %', v_total;
END
$pedidos$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Rollback (manual):
--   Recriar fn_pix_nr_bloqueia_duplicado e fn_pix_nr_pedir pelos corpos de
--   20260909110000, e fn_pix_nr_pedido_decidir pelo de 20260928220000. O
--   índice por empresa+NR só volta se não houver o mesmo NR em dois meses:
--     DROP INDEX public.idx_pix_auto_nr_unico;
--     CREATE UNIQUE INDEX idx_pix_auto_nr_unico ON public.pix_automatico_acordos
--       (empresa_id, public.fn_pix_nr_normalizar(nr_cliente)) WHERE NOT duplicidade_autorizada;
-- ═══════════════════════════════════════════════════════════════════════════
