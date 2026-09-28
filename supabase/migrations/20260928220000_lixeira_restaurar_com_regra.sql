-- ============================================================================
-- Lixeira: transferência não se restaura; só volta o que você excluiu (ou o
-- que a liderança devolve à pessoa), e nunca por cima de um NR já retomado
-- ============================================================================
--
-- ## O que estava errado (medido em 28/09/2026)
--
-- 1. TRANSFERÊNCIA APARECENDO COMO EXCLUSÃO MANUAL. A tela só reconhecia o
--    motivo `transferencia_nr`; o banco grava também `autorizacao_solicitada`
--    (transferência aprovada pelo pedido de autorização) e o tipo prevê
--    `troca_extra`. Tudo que não era `transferencia_nr` ganhava o selo
--    vermelho de «Exclusão Manual». Corrigido na tela.
--
-- 2. RESTAURAR ERA UM INSERT DO NAVEGADOR, sem regra nenhuma: qualquer um com a
--    chave restaurava qualquer item — inclusive transferência (o NR voltava
--    para quem o perdeu, e ficava em duas mãos) e inclusive um NR que outra
--    pessoa já tinha registrado enquanto o acordo estava na lixeira.
--
-- 3. A LIXEIRA NÃO SABIA QUEM EXCLUIU. `operador_nome` recebia o nome de QUEM
--    CLICOU, não o dono do acordo. Sem isso não dá para dizer «só restaura quem
--    excluiu».
--
-- 4. `lixeira_delete` era `USING (true)`: qualquer usuário logado apagava item
--    da lixeira de qualquer empresa. `lixeira_insert` também era `true`.
--
-- ## A regra agora (`fn_lixeira_restaurar`)
--
--   - Transferência (transferencia_nr, autorizacao_solicitada, troca_extra)
--     não se restaura. Nunca.
--   - Precisa da chave `lixeira_restaurar` (o painel decide quem).
--   - Restaura quem EXCLUIU; ou quem responde pelo dono do acordo no escopo da
--     aba Lixeira (equipe / setor / todos) — o líder devolvendo à pessoa. O
--     acordo volta como era, para o operador de antes, e ele é avisado.
--   - Se o NR foi registrado de novo enquanto estava na lixeira (outra pessoa,
--     ou a própria pessoa por outro caminho), não restaura: duplicaria.
--
-- O Pix automático ganha o mesmo selo: o que saiu por transferência do pedido
-- de NR (20260928190000) é marcado e não volta pela lixeira do Pix.
--
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

-- ── 1. Quem excluiu ─────────────────────────────────────────────────────────

alter table public.lixeira_acordos add column if not exists excluido_por_id   uuid;
alter table public.lixeira_acordos add column if not exists excluido_por_nome text;
alter table public.lixeira_acordos alter column excluido_por_id set default auth.uid();

comment on column public.lixeira_acordos.excluido_por_id is
  'Quem mandou o acordo para a lixeira. Decide quem pode restaurar (fn_lixeira_restaurar).';

create or replace function public.fn_lixeira_acordos_carimbar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_nome text;
begin
  new.excluido_por_id := coalesce(new.excluido_por_id, auth.uid());
  if new.excluido_por_nome is null and new.excluido_por_id is not null then
    select p.nome into new.excluido_por_nome from public.perfis p where p.id = new.excluido_por_id;
  end if;
  -- O nome do DONO do acordo. A tela mandava o de quem clicou.
  if new.operador_id is not null then
    select p.nome into v_nome from public.perfis p where p.id = new.operador_id;
    new.operador_nome := coalesce(v_nome, new.operador_nome);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_lixeira_acordos_carimbar on public.lixeira_acordos;
create trigger trg_lixeira_acordos_carimbar
  before insert on public.lixeira_acordos
  for each row execute function public.fn_lixeira_acordos_carimbar();

-- Os itens que já estão na lixeira: quem excluiu sai do log da exclusão, e o
-- dono, do cadastro.
update public.lixeira_acordos l
   set excluido_por_id = (
         select lg.usuario_id from public.logs_sistema lg
          where lg.tabela = 'acordos' and lg.acao = 'acordo_excluido'
            and lg.registro_id = l.acordo_id::text
          order by abs(extract(epoch from lg.criado_em - l.excluido_em))
          limit 1)
 where l.excluido_por_id is null and l.motivo = 'exclusao_manual';

update public.lixeira_acordos l
   set excluido_por_nome = p.nome
  from public.perfis p
 where p.id = l.excluido_por_id and l.excluido_por_nome is null;

update public.lixeira_acordos l
   set operador_nome = p.nome
  from public.perfis p
 where p.id = l.operador_id and l.operador_nome is distinct from p.nome;

-- ── 2. As portas abertas ─────────────────────────────────────────────────────

-- Inserir: fica a policy por empresa (`lixeira_insert_empresa_2026`).
drop policy if exists lixeira_insert on public.lixeira_acordos;

-- Apagar: só na própria empresa, e só o vencido (a purga) ou com a chave de
-- limpar a lixeira. A restauração apaga pela função, que não passa por aqui.
drop policy if exists lixeira_delete on public.lixeira_acordos;
create policy lixeira_delete on public.lixeira_acordos
  for delete to authenticated
  using (
    (select public.fn_can_access_empresa(lixeira_acordos.empresa_id))
    and (lixeira_acordos.expira_em < now() or (select public.fn_user_tem('lixeira_limpar')))
  );

-- ── 3. Restaurar, com regra ──────────────────────────────────────────────────

create or replace function public.fn_lixeira_restaurar(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_eu        uuid := auth.uid();
  v_eu_nome   text;
  v_eu_foto   text;
  v_item      public.lixeira_acordos;
  v_snap      jsonb;
  v_pode      boolean;
  v_escopo    integer;
  v_op_setor  uuid;
  v_op_equipe uuid;
  v_campo     text;
  v_valor     text;
  v_conflito  record;
  v_cols      text;
  v_id        uuid;
  v_rotulo    text;
begin
  if v_eu is null then raise exception 'LIXEIRA_SEM_SESSAO: entre de novo.'; end if;

  select * into v_item from public.lixeira_acordos where id = p_item_id for update;
  if not found then
    raise exception 'LIXEIRA_ITEM_NAO_ENCONTRADO: este item ja saiu da lixeira.';
  end if;
  if not public.fn_can_access_empresa(v_item.empresa_id) then
    raise exception 'LIXEIRA_SEM_ACESSO: item de outra empresa.';
  end if;

  if v_item.motivo in ('transferencia_nr', 'autorizacao_solicitada', 'troca_extra') then
    raise exception 'LIXEIRA_TRANSFERENCIA: este acordo foi transferido para %. Transferencia nao se desfaz pela lixeira.',
      coalesce(v_item.transferido_para_nome, 'outra pessoa');
  end if;
  if v_item.expira_em < now() then
    raise exception 'LIXEIRA_EXPIRADO: o prazo de 3 dias deste item acabou.';
  end if;
  if not public.fn_user_tem('lixeira_restaurar') then
    raise exception 'LIXEIRA_SEM_PERMISSAO: voce nao tem a permissao de restaurar da lixeira.';
  end if;

  -- Quem pode: quem excluiu, ou quem responde pelo dono do acordo no escopo
  -- da aba Lixeira — o líder devolvendo o acordo à pessoa.
  v_pode := v_item.excluido_por_id = v_eu or public.fn_user_is_super_admin();
  if not v_pode then
    v_escopo := public.fn_user_escopo('lixeira');
    select p.setor_id, p.equipe_id into v_op_setor, v_op_equipe
      from public.perfis p where p.id = v_item.operador_id;
    v_op_setor := coalesce(v_op_setor, nullif(v_item.dados_completos->>'setor_id', '')::uuid);
    v_pode := v_escopo >= 3
           or (v_escopo >= 2 and v_op_setor in (select public.fn_setores_do_operador(v_eu)))
           or (v_escopo >= 1 and v_op_equipe in (select public.fn_equipes_de_alcance(v_eu)));
  end if;
  if not v_pode then
    raise exception 'LIXEIRA_NAO_FOI_VOCE: so restaura quem excluiu, ou a lideranca de quem e o acordo.';
  end if;

  v_snap := v_item.dados_completos;
  if v_snap is null or nullif(v_snap->>'id', '') is null then
    raise exception 'LIXEIRA_SEM_SNAPSHOT: este item nao guardou o acordo completo.';
  end if;
  if exists (select 1 from public.acordos a where a.id = (v_snap->>'id')::uuid) then
    raise exception 'LIXEIRA_JA_VOLTOU: este acordo ja esta de volta na lista.';
  end if;

  -- O NR foi retomado enquanto estava na lixeira? Pela mesma chave que o
  -- registro de NR usa (`fn_nr_campo_chave`). Outras parcelas do MESMO acordo
  -- não contam.
  v_campo := public.fn_nr_campo_chave(v_snap->>'nr_cliente', v_snap->>'instituicao');
  v_valor := case v_campo
               when 'nr_cliente'  then trim(v_snap->>'nr_cliente')
               when 'instituicao' then trim(v_snap->>'instituicao')
             end;
  v_rotulo := case v_campo when 'instituicao' then 'Codigo ' else 'NR ' end || coalesce(v_valor, '?');

  if v_campo is not null then
    select a.id, a.operador_id, p.nome, a.criado_em into v_conflito
      from public.acordos a
      left join public.perfis p on p.id = a.operador_id
     where a.empresa_id = v_item.empresa_id
       and public.fn_nr_campo_chave(a.nr_cliente, a.instituicao) = v_campo
       and (case v_campo when 'nr_cliente' then trim(a.nr_cliente) else trim(a.instituicao) end) = v_valor
       and not (a.acordo_grupo_id is not null
                and a.acordo_grupo_id = nullif(v_snap->>'acordo_grupo_id', '')::uuid)
     order by a.criado_em
     limit 1;
    if found then
      raise exception 'LIXEIRA_NR_OCUPADO: o % foi registrado % em % enquanto este acordo estava na lixeira. Restaurar duplicaria.',
        v_rotulo,
        case when v_conflito.operador_id = v_item.operador_id then 'pelo proprio operador'
             else 'por ' || coalesce(v_conflito.nome, 'outra pessoa') end,
        to_char(v_conflito.criado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
    end if;
  end if;

  -- Volta como era — mesmo id, mesmo operador, mesmo status. Só as colunas que
  -- o retrato tem: coluna criada depois da exclusão fica com o padrão dela.
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into v_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'acordos'
     and v_snap ? c.column_name
     and c.is_generated = 'NEVER';

  execute format(
    'insert into public.acordos (%1$s) select %1$s from jsonb_populate_record(null::public.acordos, $1) returning id',
    v_cols)
    into v_id
    using v_snap;

  delete from public.lixeira_acordos where id = p_item_id;

  -- O dono é avisado quando outra pessoa devolveu o acordo a ele.
  if v_item.operador_id is not null and v_item.operador_id <> v_eu
     and exists (select 1 from public.perfis p where p.id = v_item.operador_id) then
    select p.nome, p.foto_url into v_eu_nome, v_eu_foto from public.perfis p where p.id = v_eu;
    insert into public.notificacoes
      (usuario_id, empresa_id, titulo, mensagem, lida, rota, autor_id, autor_nome, autor_foto)
    values
      (v_item.operador_id, v_item.empresa_id, 'Acordo restaurado da lixeira',
       coalesce(v_eu_nome, 'A liderança') || ' restaurou o seu acordo do ' || v_rotulo
         || coalesce(' (' || nullif(trim(v_item.nome_cliente), '') || ')', '') || '. Ele voltou para a sua lista.',
       false, '/acordos', v_eu, v_eu_nome, v_eu_foto);
  end if;

  return jsonb_build_object('acordo_id', v_id, 'operador_nome', v_item.operador_nome, 'rotulo', v_rotulo);
end;
$function$;

comment on function public.fn_lixeira_restaurar(uuid) is
  'Restaura um acordo da lixeira com regra: transferencia nao volta; so quem excluiu ou a lideranca do dono; nunca por cima de NR retomado. Ver 20260928220000.';

revoke all on function public.fn_lixeira_restaurar(uuid) from public, anon;
grant execute on function public.fn_lixeira_restaurar(uuid) to authenticated;

-- ── 4. Pix automático: transferência marcada na lixeira dele ────────────────

alter table public.lixeira_pix_automatico add column if not exists motivo text not null default 'exclusao';
alter table public.lixeira_pix_automatico add column if not exists transferido_para_nome text;

comment on column public.lixeira_pix_automatico.motivo is
  '''exclusao'' ou ''transferencia'' (pedido de NR autorizado). Transferencia nao se restaura.';

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

CREATE OR REPLACE FUNCTION public.fn_pix_restaurar_lixeira(p_item_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item  public.lixeira_pix_automatico%ROWTYPE;
  v_dados JSONB;
  v_novo  UUID;
BEGIN
  SELECT * INTO v_item FROM public.lixeira_pix_automatico WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIXEIRA_ITEM_NAO_ENCONTRADO';
  END IF;

  -- SECURITY DEFINER ignora RLS: a autorização é conferida aqui, à mão.
  IF NOT public.fn_can_access_empresa(v_item.empresa_id)
     OR NOT public.fn_user_has_any_role(
          ARRAY['lider','elite','gerencia','administrador','super_admin']) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_RESTAURAR';
  END IF;

  -- Transferido não volta: o NR já é de outra pessoa (20260928220000).
  IF v_item.motivo = 'transferencia' THEN
    RAISE EXCEPTION 'LIXEIRA_TRANSFERENCIA: o NR % foi transferido para %. Transferencia nao se desfaz pela lixeira.',
      v_item.nr_cliente, COALESCE(v_item.transferido_para_nome, 'outra pessoa');
  END IF;

  v_dados := v_item.dados_completos;

  -- Lida pelo trigger de log. `SET LOCAL` morre no fim da transação.
  PERFORM set_config('pix.restaurando', 'on', true);

  INSERT INTO public.pix_automatico_acordos (
    id, empresa_id, operador_id, operador_nome, setor_id,
    nr_cliente, valor, status, pct_comissao,
    avaliado_por, avaliado_por_nome, avaliado_em,
    pago, pago_em, pago_por, pago_por_nome, criado_em
  ) VALUES (
    v_item.acordo_id,
    v_item.empresa_id,
    (v_dados->>'operador_id')::UUID,
    v_dados->>'operador_nome',
    NULLIF(v_dados->>'setor_id', '')::UUID,
    v_dados->>'nr_cliente',
    (v_dados->>'valor')::NUMERIC,
    v_dados->>'status',
    NULLIF(v_dados->>'pct_comissao', '')::NUMERIC,
    NULLIF(v_dados->>'avaliado_por', '')::UUID,
    v_dados->>'avaliado_por_nome',
    NULLIF(v_dados->>'avaliado_em', '')::TIMESTAMPTZ,
    COALESCE((v_dados->>'pago')::BOOLEAN, FALSE),
    NULLIF(v_dados->>'pago_em', '')::TIMESTAMPTZ,
    NULLIF(v_dados->>'pago_por', '')::UUID,
    v_dados->>'pago_por_nome',
    COALESCE(NULLIF(v_dados->>'criado_em', '')::TIMESTAMPTZ, NOW())
  )
  RETURNING id INTO v_novo;

  PERFORM set_config('pix.restaurando', 'off', true);

  -- O AFTER INSERT acabou de gravar o registro de NR como 'pendente' — é o que
  -- ele faz para linha nova. Aqui a linha não é nova: ela volta com o status
  -- que tinha, e o registro precisa dizer o mesmo.
  UPDATE public.pix_automatico_nr_registro r SET
    status            = CASE v_dados->>'status'
                          WHEN 'aprovado'    THEN 'validado'
                          WHEN 'desaprovado' THEN 'recusado'
                          ELSE 'pendente'
                        END,
    avaliado_por      = NULLIF(v_dados->>'avaliado_por', '')::UUID,
    avaliado_por_nome = v_dados->>'avaliado_por_nome',
    avaliado_em       = NULLIF(v_dados->>'avaliado_em', '')::TIMESTAMPTZ,
    atualizado_em     = NOW()
  WHERE r.empresa_id     = v_item.empresa_id
    AND r.nr_normalizado = public.fn_pix_nr_normalizar(v_item.nr_cliente)
    AND r.acordo_id      = v_novo;

  DELETE FROM public.lixeira_pix_automatico WHERE id = p_item_id;

  RETURN v_novo;
END;
$function$;

commit;

-- Conferência (só leitura):
--   select motivo, count(*), count(excluido_por_id) from public.lixeira_acordos group by 1;
--   select polname, pg_get_expr(polqual, polrelid) from pg_policy
--    where polrelid = 'public.lixeira_acordos'::regclass;
