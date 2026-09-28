-- ============================================================================
-- Reverte a autorização do NR 12139503 no Pix automático (28/09/2026)
-- ============================================================================
--
-- O que aconteceu: o NR estava com Juliana Itala (Receptivo, aprovado e com
-- comissão paga). Kaio Santana (Play 4) pediu o mesmo NR. Às 10:47/10:48 os dois
-- lados do pedido f8c629f2 foram autorizados por Cleber Junior, que tinha
-- conferido com o Receptivo e o Play 4 que o acordo é da Juliana e entendeu o
-- «Autorizar» como correção a favor dela. A função da época criou um segundo
-- acordo, para o Kaio (5f1e0a6a, pendente), e deixou o da Juliana.
--
-- O que este script faz, pedido e autorizado por Cleber Junior:
--   1. o acordo do Kaio vai para a lixeira do Pix e sai da tabela — ele é
--      avisado com o motivo;
--   2. o registro histórico do NR volta a apontar para o acordo da Juliana
--      (validado, como estava antes do pedido);
--   3. o pedido fica RECUSADO, com o motivo da reversão. As duas assinaturas
--      ficam como foram dadas: são o registro do que aconteceu.
--
-- O acordo da Juliana não é tocado.
--
-- Roda uma vez; se o estado não for o esperado, aborta sem mudar nada.
-- ============================================================================

begin;

-- A autoria vai para quem pediu a reversão: é ela que o histórico do Pix, a
-- lixeira e a notificação mostram.
select set_config('request.jwt.claims',
  '{"sub":"c963eb7e-e68c-478f-89d6-f4e2e3a6aa80","role":"authenticated"}', true);

do $reverte$
declare
  v_kaio     public.pix_automatico_acordos;
  v_juliana  public.pix_automatico_acordos;
  v_pedido   public.pix_automatico_nr_pedidos;
begin
  select * into v_kaio    from public.pix_automatico_acordos where id = '5f1e0a6a-610c-4232-b38d-d1d690a6089a' for update;
  select * into v_juliana from public.pix_automatico_acordos where id = 'e6b30aea-7561-42bc-875c-f4b0973aa077';
  select * into v_pedido  from public.pix_automatico_nr_pedidos where id = 'f8c629f2-7822-40af-83e0-85184089ce31' for update;

  if v_kaio.id is null then raise exception 'Acordo do Kaio (5f1e0a6a) nao existe mais — nada a reverter.'; end if;
  if v_kaio.operador_nome <> 'Kaio Santana' or v_kaio.nr_cliente <> '12139503' then
    raise exception 'Acordo 5f1e0a6a nao e o esperado (% / %).', v_kaio.operador_nome, v_kaio.nr_cliente;
  end if;
  if v_kaio.pago then raise exception 'Acordo do Kaio ja tem comissao paga — reverter a mao.'; end if;
  if v_juliana.id is null or v_juliana.operador_nome <> 'Juliana Itala' then
    raise exception 'Acordo da Juliana (e6b30aea) nao esta como esperado.';
  end if;
  if v_pedido.id is null or v_pedido.status <> 'aprovado' then
    raise exception 'Pedido f8c629f2 nao esta aprovado (status: %).', v_pedido.status;
  end if;

  -- 1. Kaio: lixeira e saída.
  insert into public.lixeira_pix_automatico
    (empresa_id, acordo_id, nr_cliente, valor, status, operador_id, operador_nome,
     setor_id, dados_completos, excluido_por, excluido_por_nome)
  values
    (v_kaio.empresa_id, v_kaio.id, v_kaio.nr_cliente, v_kaio.valor, v_kaio.status,
     v_kaio.operador_id, v_kaio.operador_nome, v_kaio.setor_id, to_jsonb(v_kaio),
     'c963eb7e-e68c-478f-89d6-f4e2e3a6aa80', 'Cleber Junior');

  perform set_config('app.pix_exclusao_motivo',
    'O NR 12139503 foi revertido para Juliana Itala: o acordo é dela (conferido com Receptivo e Play 4). '
      || 'O registro criado para você hoje saiu do seu Pix automático.', true);

  delete from public.pix_automatico_acordos where id = v_kaio.id;

  perform set_config('app.pix_exclusao_motivo', '', true);

  -- 2. Registro histórico do NR: de volta para a Juliana, como estava.
  insert into public.pix_automatico_nr_registro
    (empresa_id, nr_normalizado, nr_cliente, acordo_id, operador_id, operador_nome,
     status, avaliado_por, avaliado_por_nome, avaliado_em, criado_em, atualizado_em)
  values
    (v_juliana.empresa_id, public.fn_pix_nr_normalizar(v_juliana.nr_cliente), v_juliana.nr_cliente,
     v_juliana.id, v_juliana.operador_id, v_juliana.operador_nome,
     case v_juliana.status when 'aprovado' then 'validado' when 'desaprovado' then 'recusado' else 'pendente' end,
     v_juliana.avaliado_por, v_juliana.avaliado_por_nome, v_juliana.avaliado_em,
     v_juliana.criado_em, now())
  on conflict (empresa_id, nr_normalizado) do update set
    nr_cliente        = excluded.nr_cliente,
    acordo_id         = excluded.acordo_id,
    operador_id       = excluded.operador_id,
    operador_nome     = excluded.operador_nome,
    status            = excluded.status,
    avaliado_por      = excluded.avaliado_por,
    avaliado_por_nome = excluded.avaliado_por_nome,
    avaliado_em       = excluded.avaliado_em,
    atualizado_em     = now();

  -- 3. O pedido: recusado, com o porquê.
  update public.pix_automatico_nr_pedidos
     set status            = 'recusado',
         acordo_id         = null,
         decidido_por      = 'c963eb7e-e68c-478f-89d6-f4e2e3a6aa80',
         decidido_por_nome = 'Cleber Junior',
         decidido_em       = now(),
         decisao_motivo    = 'Revertido em 28/09/2026 a pedido de Cleber Junior: o acordo é da Juliana Itala '
                             || '(conferido com Receptivo e Play 4). O registro criado para Kaio Santana foi '
                             || 'para a lixeira; o NR ficou só com a Juliana.'
   where id = v_pedido.id;
end
$reverte$;

commit;

-- Conferência (só leitura):
--   select operador_nome, status, pago from public.pix_automatico_acordos
--    where public.fn_pix_nr_normalizar(nr_cliente) = '12139503';        -- só Juliana Itala
--   select operador_nome, status from public.pix_automatico_nr_registro
--    where nr_normalizado = '12139503';                                   -- Juliana Itala, validado
--   select status, decisao_motivo from public.pix_automatico_nr_pedidos
--    where id = 'f8c629f2-7822-40af-83e0-85184089ce31';                   -- recusado
