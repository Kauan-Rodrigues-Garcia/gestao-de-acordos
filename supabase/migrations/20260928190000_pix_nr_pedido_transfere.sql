-- ============================================================================
-- Pix automático: autorizar um NR duplicado TRANSFERE o acordo (28/09/2026)
-- ============================================================================
--
-- ## O que acontecia
--
-- Autorizar o pedido de NR duplicado criava um SEGUNDO acordo para quem pediu
-- e deixava o de quem já tinha o NR exatamente como estava. Os dois ficavam
-- com o mesmo NR, e o cartão não dizia isso em lugar nenhum.
--
-- Caso real, NR 12139503 em 28/09/2026: o NR estava com Juliana Itala
-- (Receptivo, aprovado); Kaio Santana (Play 4) pediu para registrar. A
-- diretoria conferiu com os dois setores que o acordo era da Juliana, leu o
-- cartão como «autorizar a correção», assinou os dois lados — e o sistema
-- criou um acordo para o Kaio sem tirar o da Juliana. O contrário do que se
-- queria, e ainda com o NR em duas mãos.
--
-- ## O que passa a acontecer
--
-- Um NR tem um dono. O pedido pergunta UMA coisa: com quem o NR fica.
--
--   Autorizar (todos os lados) → TRANSFERE: o acordo de quem tinha o NR vai
--     para a lixeira do Pix (recuperável por 3 dias, como qualquer exclusão),
--     e nasce o de quem pediu, PENDENTE de avaliação como qualquer registro.
--     Quem perdeu o NR é notificado com a palavra certa: transferido.
--   Recusar (qualquer lado)     → o NR fica com quem já tinha, e o pedido some.
--
-- Acordo com comissão JÁ PAGA não sai: a transferência é recusada com a
-- mensagem para desfazer o pagamento antes. O trigger `trg_pix_a_impede_pago`
-- recusaria de qualquer forma; parar antes dá a frase certa e não deixa cópia
-- na lixeira.
--
-- Se quem pediu já tem o NR (registrou por outro caminho enquanto o pedido
-- esperava), a transferência só tira o dos outros — nada é duplicado.
--
-- ## O que NÃO muda
--
-- Quem assina (os líderes dos dois setores, ou um só quando é o mesmo setor),
-- a regra de que uma recusa encerra, e as mensagens de erro já conhecidas.
--
-- Reexecutável. Só troca duas funções; nenhuma linha de dados é alterada.
-- ============================================================================

begin;

set local lock_timeout = '15s';

-- ============================================================================
-- 1. A exclusão avisa com o motivo que a transferência der
-- ============================================================================
--
-- Idêntica à anterior, mais `app.pix_exclusao_motivo`: quando a exclusão é
-- parte de uma transferência, a notificação e o histórico dizem isso — e não
-- «Fulano excluiu o seu registro», que parece punição sem explicação.

create or replace function public.fn_pix_registrar_exclusao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quem   uuid := auth.uid();
  v_nome   text;
  v_foto   text;
  v_motivo text := nullif(current_setting('app.pix_exclusao_motivo', true), '');
begin
  select coalesce(nullif(trim(p.nome), ''), 'Alguém'), p.foto_url
    into v_nome, v_foto
    from public.perfis p
   where p.id = v_quem;

  perform public.fn_pix_log(
    old.empresa_id, old.id, old.nr_cliente, 'excluido',
    coalesce(v_motivo,
      'Excluiu o NR ' || old.nr_cliente
        || ' (R$ ' || public.fn_pix_valor_br(old.valor) || ', ' || old.status || ')'),
    old.valor, old.operador_id, old.operador_nome,
    to_jsonb(old), null
  );

  -- Ninguém precisa ser avisado do próprio clique — nem da própria exclusão:
  -- na cascata de `perfis` o operador já foi apagado antes de a cascata
  -- começar, e a notificação apontaria para um perfil inexistente.
  if old.operador_id is not null
     and (v_quem is null or old.operador_id <> v_quem)
     and exists (select 1 from public.perfis p where p.id = old.operador_id) then
    insert into public.notificacoes
      (usuario_id, empresa_id, titulo, mensagem, lida, rota,
       autor_id, autor_nome, autor_foto)
    values (
      old.operador_id,
      old.empresa_id,
      case when v_motivo is not null
           then 'Pix automático — NR transferido'
           else 'Pix automático — registro excluído' end,
      coalesce(v_motivo,
        coalesce(v_nome, 'Alguém') || ' excluiu o seu registro do NR '
          || old.nr_cliente || ' (R$ ' || public.fn_pix_valor_br(old.valor)
          || ', ' || old.status || ').'),
      false,
      '/acordos?tab=pix',
      v_quem,
      v_nome,
      v_foto
    );
  end if;

  return old;
end;
$function$;

-- ============================================================================
-- 2. A decisão do pedido
-- ============================================================================

create or replace function public.fn_pix_nr_pedido_decidir(
  p_pedido_id uuid,
  p_aprovar   boolean,
  p_motivo    text default null,
  p_lado      text default null
)
returns public.pix_automatico_nr_pedidos
language plpgsql
security definer
set search_path to 'public'
as $function$
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
   * Todos assinaram: o NR MUDA DE DONO.
   *
   * Sai de todo mundo que não é quem pediu. Normalmente é um acordo só (o do
   * cartão); se sobrou duplicidade autorizada do tempo em que autorizar
   * duplicava, ela sai junto — um NR, um dono.
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
     order by a.criado_em
       for update
  loop
    if v_saida.pago then
      raise exception
        'PIX_NR_TRANSFERENCIA_PAGA: o NR % ja teve a comissao paga para %. Desfaca o pagamento antes de transferir.',
        v_saida.nr_cliente, coalesce(v_saida.operador_nome, 'outra pessoa')
        using errcode = 'restrict_violation';
    end if;

    insert into public.lixeira_pix_automatico
      (empresa_id, acordo_id, nr_cliente, valor, status, operador_id, operador_nome,
       setor_id, dados_completos, excluido_por, excluido_por_nome)
    values
      (v_saida.empresa_id, v_saida.id, v_saida.nr_cliente, v_saida.valor, v_saida.status,
       v_saida.operador_id, v_saida.operador_nome, v_saida.setor_id, to_jsonb(v_saida),
       v_eu, v_nome);

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

comment on function public.fn_pix_nr_pedido_decidir(uuid, boolean, text, text) is
  'Assina um lado do pedido de NR duplicado. Todos autorizando, o NR e TRANSFERIDO: '
  'o acordo de quem tinha vai para a lixeira e nasce o de quem pediu. Uma recusa '
  'mantem o NR com quem tinha. Ver 20260928190000.';

commit;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
--   select pg_get_functiondef('public.fn_pix_nr_pedido_decidir(uuid,boolean,text,text)'::regprocedure)
--          ~ 'PIX_NR_TRANSFERENCIA_PAGA';                                  -- true
--   select pg_get_functiondef('public.fn_pix_registrar_exclusao()'::regprocedure)
--          ~ 'app.pix_exclusao_motivo';                                     -- true
