-- ============================================================================
-- Autorizacao de NR por SOLICITACAO — as duas empresas
-- ============================================================================
--
-- ## O que muda
--
-- Ate aqui, registrar um NR/Codigo que ja tem vinculo exigia o lider ir ate o
-- computador do operador e digitar o proprio usuario e senha. Funcionava, e
-- custava um deslocamento por acordo — alem de treinar a equipe inteira a ver
-- um lider digitando a senha dele numa maquina que nao e a dele.
--
-- Agora o operador clica em "Solicitar autorizacao". O pedido fica em
-- `autorizacoes_pedidos`, os autorizadores recebem notificacao e decidem de
-- onde estiverem, pela gaveta no canto da tela. O login do lider sai do fluxo.
--
-- ## Quem decide
--
-- Os MESMOS seis cargos de `PERFIS_AUTORIZADORES` no frontend, que sao os
-- mesmos que `fn_transferir_acordo_nr` ja aceita: lider, elite, gerencia,
-- diretoria, administrador, super_admin. Nenhum poder novo e nenhum poder
-- perdido — muda o caminho, nao quem pode.
--
-- O RECORTE, esse sim, e por setor para quem lidera um: lider, elite e gerencia
-- so veem e decidem pedidos do proprio setor. Diretoria, administrador e
-- super_admin veem a empresa inteira. Sem esse recorte, o lider do Play 1
-- receberia notificacao de todo pedido do Play 6 e a gaveta viraria ruido.
--
-- ## Por que a execucao acontece no servidor
--
-- Quando o lider aprova, o operador pode nem estar com a tela aberta — ele
-- fechou a janela ao solicitar, por decisao de produto ("surge uma mensagem
-- temporaria e ele recebe a resposta por notificacao"). Entao a aprovacao tem
-- de FAZER a coisa, nao liberar um botao: mover o acordo antigo para a lixeira,
-- transferir a titularidade do NR e criar o acordo novo.
--
-- Por isso o pedido carrega o `payload` do acordo a criar, exatamente como o
-- cliente o montaria. E por isso a decisao e uma RPC, nao um UPDATE.
--
-- `fn_transferir_acordo_nr` e REUSADA em vez de copiada. Ela roda como
-- SECURITY DEFINER lendo `auth.uid()`, e quem chama aqui e o LIDER que aprovou
-- — o que grava, sem nenhum esforco extra, o autorizador certo na lixeira e no
-- log. Copiar aquela logica seria criar um segundo caminho de transferencia
-- para divergir do primeiro.
--
-- ## Irreversivel, e a tela diz isso
--
-- Aprovar apaga o acordo de alguem. Nao ha "desfazer": o acordo antigo vai para
-- a lixeira (retencao de 3 dias) e o novo ja nasce no lugar. A confirmacao
-- extra pedida para o lider e de tela; aqui embaixo o que existe e o registro
-- de quem decidiu, visivel para todos os outros autorizadores.
-- ============================================================================

-- ── 1. A tabela ────────────────────────────────────────────────────────────

create table if not exists public.autorizacoes_pedidos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id),

  -- Quem pediu. O nome fica desnormalizado porque a gaveta do lider precisa
  -- exibi-lo, e `perfis` so libera a linha de terceiros para lider+ — um
  -- operador olhando o proprio pedido nao conseguiria resolver o join.
  solicitante_id   uuid not null references public.perfis(id) on delete cascade,
  solicitante_nome text not null,
  /**
   * Setor do solicitante NO MOMENTO do pedido.
   *
   * Desnormalizado de proposito, igual ao `usuario_cargo` de `logs_sistema`:
   * e ele que decide quais lideres veem o pedido, e ler o setor ATUAL faria um
   * pedido de ontem mudar de dono quando a pessoa troca de setor.
   */
  setor_id       uuid references public.setores(id),

  -- 'transferencia_completa' = assumir o DIRETO de outro operador.
  -- 'troca_extra'            = assumir o vinculo EXTRA que ja e de outro.
  modo           text not null check (modo in ('transferencia_completa','troca_extra')),

  -- O identificador como a empresa o chama ('NR' ou 'Codigo') e o valor dele.
  -- Ver docs/DIVIDA-TECNICA.md item 1: qual COLUNA e a chave depende do tenant,
  -- e aqui interessa exibir, nao decidir. Por isso guarda-se o rotulo tambem.
  nr_label       text not null,
  nr_valor       text not null,

  -- O acordo do outro operador que sera afetado.
  acordo_alvo_id uuid,
  dono_id        uuid references public.perfis(id),
  dono_nome      text,

  -- Modo troca_extra: o EXTRA atual, que sai para o solicitante entrar.
  extra_atual_id      uuid,
  extra_atual_op_id   uuid references public.perfis(id),
  extra_atual_op_nome text,

  /**
   * O acordo a criar, ja montado pelo cliente.
   *
   * O mesmo objeto que o `insert` do navegador usaria hoje. Guardar o payload —
   * e nao os campos soltos — mantem esta tabela indiferente a colunas novas em
   * `acordos`: quem monta o acordo continua sendo uma tela so.
   *
   * `operador_id` e `empresa_id` do payload sao IGNORADOS na hora de gravar: a
   * RPC os reescreve com o solicitante e a empresa do pedido. Payload vem do
   * cliente, e cliente nao decide de quem e o acordo.
   */
  payload        jsonb not null,
  /** Cliente, valor, vencimento e parcelas — o que a gaveta mostra sem abrir. */
  resumo         jsonb not null default '{}'::jsonb,

  status         text not null default 'pendente'
                 check (status in ('pendente','aprovado','recusado','cancelado','falhou')),
  decidido_por_id   uuid references public.perfis(id),
  decidido_por_nome text,
  decidido_em       timestamptz,
  motivo_recusa     text,
  /** Mensagem tecnica quando a execucao falhou depois do aceite. */
  erro           text,
  /** Acordo criado ao aprovar — o rastro de que a execucao chegou ao fim. */
  acordo_criado_id uuid,

  criado_em      timestamptz not null default now(),
  /**
   * 24 horas. Um pedido de ontem nao pode ser aprovado hoje: o operador ja
   * seguiu a vida, e criar o acordo dele sem aviso seria pior que recusar.
   * A expiracao e verificada na decisao, nao por trabalho agendado — assim nao
   * existe janela entre expirar e alguem reparar.
   */
  expira_em      timestamptz not null default now() + interval '24 hours'
);

comment on table public.autorizacoes_pedidos is
  'Pedidos de autorizacao para registrar NR/Codigo ja vinculado. Substitui o login+senha do lider na tela do operador. Escrita so por fn_autorizacao_solicitar e fn_autorizacao_decidir.';

-- A gaveta abre filtrando pendentes da empresa; e a consulta quente.
create index if not exists ix_autorizacoes_pendentes
  on public.autorizacoes_pedidos (empresa_id, status, criado_em desc);
create index if not exists ix_autorizacoes_solicitante
  on public.autorizacoes_pedidos (solicitante_id, criado_em desc);

-- ── 2. Quem enxerga o pedido ───────────────────────────────────────────────
--
-- Uma funcao so, usada pela policy E pelas duas RPCs. Tres copias da mesma
-- pergunta e como este projeto ja produziu tres contas para o mesmo dinheiro em
-- outras telas.

create or replace function public.fn_pode_autorizar_pedido(
  p_empresa_id uuid,
  p_setor_id   uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
      from public.perfis p
     where p.id = auth.uid()
       and p.empresa_id = p_empresa_id
       and (
         -- Visao da empresa inteira.
         p.perfil in ('diretoria','administrador','super_admin')
         -- Quem lidera um setor decide o do setor dele. `p_setor_id` nulo
         -- (solicitante sem setor) cai so para os de visao ampla — de proposito:
         -- pedido sem setor nao tem lider natural, e deixa-lo visivel para todo
         -- lider da empresa devolveria o ruido que o recorte existe para tirar.
         or (p.perfil in ('lider','elite','gerencia') and p.setor_id = p_setor_id)
       )
  )
  -- super_admin atravessa empresa, como em todo o resto do sistema.
  or public.fn_user_is_super_admin();
$function$;

comment on function public.fn_pode_autorizar_pedido(uuid, uuid) is
  'Quem pode ver e decidir um pedido de autorizacao. Espelha PERFIS_AUTORIZADORES do frontend, com recorte por setor para lider/elite/gerencia.';

-- ── 3. RLS ─────────────────────────────────────────────────────────────────

alter table public.autorizacoes_pedidos enable row level security;

drop policy if exists autorizacoes_select on public.autorizacoes_pedidos;
create policy autorizacoes_select on public.autorizacoes_pedidos
  for select to authenticated
  using (
    -- O solicitante acompanha o proprio pedido: e assim que a tela dele sabe
    -- que foi aprovado sem precisar de uma segunda consulta.
    solicitante_id = auth.uid()
    or public.fn_pode_autorizar_pedido(empresa_id, setor_id)
  );

-- Sem policy de INSERT/UPDATE/DELETE: a tabela e fail-closed para escrita
-- direta. As duas RPCs abaixo passam por cima por serem SECURITY DEFINER, e sao
-- o unico caminho. Um pedido gravado a mao poderia mentir sobre quem solicitou.

-- Realtime: a gaveta precisa saber do pedido novo sem recarregar a pagina.
-- Guardado porque `ADD TABLE` de uma tabela ja publicada e erro, e reaplicar
-- uma migration nao pode quebrar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'autorizacoes_pedidos'
  ) then
    alter publication supabase_realtime add table public.autorizacoes_pedidos;
  end if;
end;
$$;

-- ── 4. Solicitar ───────────────────────────────────────────────────────────

create or replace function public.fn_autorizacao_solicitar(
  p_modo                text,
  p_nr_label            text,
  p_nr_valor            text,
  p_payload             jsonb,
  p_resumo              jsonb default '{}'::jsonb,
  p_acordo_alvo_id      uuid default null,
  p_dono_id             uuid default null,
  p_dono_nome           text default null,
  p_extra_atual_id      uuid default null,
  p_extra_atual_op_id   uuid default null,
  p_extra_atual_op_nome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid     uuid := auth.uid();
  v_empresa uuid;
  v_setor   uuid;
  v_nome    text;
  v_id      uuid;
  v_qtd     integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  end if;

  select p.empresa_id, p.setor_id, p.nome
    into v_empresa, v_setor, v_nome
    from public.perfis p where p.id = v_uid;

  if v_empresa is null then
    return jsonb_build_object('ok', false, 'erro', 'perfil_inexistente');
  end if;
  if p_modo not in ('transferencia_completa','troca_extra') then
    return jsonb_build_object('ok', false, 'erro', 'modo_invalido');
  end if;
  if coalesce(btrim(p_nr_valor), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'nr_vazio');
  end if;

  -- Pedido repetido do mesmo operador para o mesmo NR nao vira fila: devolve o
  -- que ja existe. Sem isto, cada clique nervoso no botao criaria uma linha, e
  -- o lider veria o mesmo pedido cinco vezes — aprovando o primeiro e ficando
  -- com quatro orfaos que executariam sobre um acordo que ja nao existe.
  select id into v_id
    from public.autorizacoes_pedidos
   where solicitante_id = v_uid
     and status = 'pendente'
     and nr_valor = btrim(p_nr_valor)
     and expira_em > now()
   limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'repetido', true);
  end if;

  insert into public.autorizacoes_pedidos (
    empresa_id, solicitante_id, solicitante_nome, setor_id, modo,
    nr_label, nr_valor, acordo_alvo_id, dono_id, dono_nome,
    extra_atual_id, extra_atual_op_id, extra_atual_op_nome,
    payload, resumo
  ) values (
    v_empresa, v_uid, coalesce(v_nome, 'Operador'), v_setor, p_modo,
    coalesce(nullif(btrim(p_nr_label), ''), 'NR'), btrim(p_nr_valor),
    p_acordo_alvo_id, p_dono_id, p_dono_nome,
    p_extra_atual_id, p_extra_atual_op_id, p_extra_atual_op_nome,
    p_payload, coalesce(p_resumo, '{}'::jsonb)
  )
  returning id into v_id;

  -- Notifica quem pode decidir. A lista sai da MESMA regra da policy, aplicada
  -- linha a linha — e nao de uma segunda consulta parecida, que divergiria.
  insert into public.notificacoes (usuario_id, titulo, mensagem, empresa_id, autor_id, autor_nome)
  select p.id,
         'Autorização solicitada',
         format('%s pediu autorização para registrar o %s %s%s.',
                coalesce(v_nome, 'Um operador'), coalesce(nullif(btrim(p_nr_label), ''), 'NR'),
                btrim(p_nr_valor),
                case when p_dono_nome is not null then ', hoje de ' || p_dono_nome else '' end),
         v_empresa, v_uid, coalesce(v_nome, 'Operador')
    from public.perfis p
   where p.empresa_id = v_empresa
     and p.ativo = true
     and coalesce(p.situacao, 'ativo') = 'ativo'
     and p.id <> v_uid
     and (
       p.perfil in ('diretoria','administrador','super_admin')
       or (p.perfil in ('lider','elite','gerencia') and v_setor is not null and p.setor_id = v_setor)
     );
  get diagnostics v_qtd = row_count;

  return jsonb_build_object('ok', true, 'id', v_id, 'notificados', v_qtd);
end;
$function$;

revoke all on function public.fn_autorizacao_solicitar(text, text, text, jsonb, jsonb, uuid, uuid, text, uuid, uuid, text) from public;
grant execute on function public.fn_autorizacao_solicitar(text, text, text, jsonb, jsonb, uuid, uuid, text, uuid, uuid, text) to authenticated;

-- ── 5. Decidir ─────────────────────────────────────────────────────────────
--
-- Aprovar EXECUTA. Ver o cabecalho para o porque.

create or replace function public.fn_autorizacao_decidir(
  p_id      uuid,
  p_aprovar boolean,
  p_motivo  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid       uuid := auth.uid();
  v_nome      text;
  v_ped       public.autorizacoes_pedidos%rowtype;
  v_payload   jsonb;
  v_novo_id   uuid;
  v_transf    jsonb;
  v_extra     public.acordos%rowtype;
  v_valor_fmt text;
  v_venc_fmt  text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  end if;

  -- FOR UPDATE: dois lideres clicando ao mesmo tempo e o caso normal, nao o
  -- raro — a notificacao chega para todos de uma vez. Sem a trava, os dois
  -- passariam pela checagem de status e o segundo executaria a transferencia
  -- sobre um acordo que o primeiro ja apagou.
  select * into v_ped from public.autorizacoes_pedidos where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'pedido_inexistente');
  end if;

  if not public.fn_pode_autorizar_pedido(v_ped.empresa_id, v_ped.setor_id) then
    return jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  end if;

  if v_ped.status <> 'pendente' then
    return jsonb_build_object('ok', false, 'erro', 'ja_decidido',
                              'status', v_ped.status,
                              'por', v_ped.decidido_por_nome);
  end if;

  if v_ped.expira_em <= now() then
    update public.autorizacoes_pedidos
       set status = 'cancelado', decidido_em = now(),
           motivo_recusa = 'Pedido expirou sem decisão.'
     where id = p_id;
    return jsonb_build_object('ok', false, 'erro', 'expirado');
  end if;

  select nome into v_nome from public.perfis where id = v_uid;

  -- ── Recusa ──────────────────────────────────────────────────────────────
  if not coalesce(p_aprovar, false) then
    update public.autorizacoes_pedidos
       set status = 'recusado', decidido_por_id = v_uid,
           decidido_por_nome = coalesce(v_nome, 'Autorizador'),
           decidido_em = now(), motivo_recusa = nullif(btrim(p_motivo), '')
     where id = p_id;

    insert into public.notificacoes (usuario_id, titulo, mensagem, empresa_id, autor_id, autor_nome)
    values (
      v_ped.solicitante_id,
      'Autorização recusada',
      format('Seu pedido para registrar o %s %s foi recusado por %s.%s',
             v_ped.nr_label, v_ped.nr_valor, coalesce(v_nome, 'um autorizador'),
             case when nullif(btrim(p_motivo), '') is not null
                  then ' Motivo: ' || btrim(p_motivo) else '' end),
      v_ped.empresa_id, v_uid, coalesce(v_nome, 'Autorizador')
    );

    return jsonb_build_object('ok', true, 'status', 'recusado');
  end if;

  -- ── Aprovacao ───────────────────────────────────────────────────────────
  --
  -- `operador_id` e `empresa_id` vem do PEDIDO, nunca do payload: o payload foi
  -- montado no navegador, e navegador nao decide de quem e o acordo.
  --
  -- Os DEFAULTS entram a mao, antes do payload.
  --
  -- `insert into acordos select * from jsonb_populate_record(...)` grava NULL em
  -- toda coluna ausente do JSON — o default da tabela NAO se aplica, porque a
  -- linha ja chega completa. Seis colunas de `acordos` sao NOT NULL COM default
  -- (id, data_cadastro, criado_em, atualizado_em, tipo_vinculo,
  -- usou_quarenta_pct) e o insert falharia em todas elas.
  --
  -- A ordem importa: defaults primeiro, payload do cliente por cima. O que a
  -- tela mandou vence; o que ela nao mandou ganha o valor que o banco daria.
  v_payload := jsonb_build_object(
                 'id',                gen_random_uuid(),
                 'data_cadastro',     (now() at time zone 'America/Sao_Paulo')::date,
                 'criado_em',         now(),
                 'atualizado_em',     now(),
                 'tipo_vinculo',      'direto',
                 'usou_quarenta_pct', false,
                 'parcelas',          1,
                 'numero_parcela',    1
               )
             || v_ped.payload
             || jsonb_build_object('operador_id', v_ped.solicitante_id,
                                   'empresa_id',  v_ped.empresa_id);

  if v_ped.modo = 'troca_extra' then
    -- O EXTRA anterior sai; o solicitante entra no lugar. O DIRETO nao e tocado
    -- alem da referencia de vinculo, que passa a apontar para o novo extra.
    select * into v_extra from public.acordos where id = v_ped.extra_atual_id;
    if found then
      v_valor_fmt := coalesce(to_char(v_extra.valor, 'FM999G999G990D00'), '—');
      v_venc_fmt  := coalesce(to_char(v_extra.vencimento, 'DD/MM/YYYY'), '—');

      insert into public.lixeira_acordos (
        acordo_id, empresa_id, operador_id, operador_nome,
        nome_cliente, nr_cliente, valor, vencimento, tipo, status,
        observacoes, instituicao, dados_completos, motivo,
        autorizado_por_id, autorizado_por_nome,
        transferido_para_id, transferido_para_nome
      ) values (
        v_extra.id, v_extra.empresa_id, v_extra.operador_id,
        coalesce(v_ped.extra_atual_op_nome, '—'),
        v_extra.nome_cliente, v_extra.nr_cliente, v_extra.valor, v_extra.vencimento,
        v_extra.tipo, v_extra.status, v_extra.observacoes, v_extra.instituicao,
        to_jsonb(v_extra), 'troca_extra',
        v_uid, coalesce(v_nome, 'Autorizador'),
        v_ped.solicitante_id, v_ped.solicitante_nome
      );

      delete from public.acordos where id = v_extra.id;

      insert into public.notificacoes (usuario_id, titulo, mensagem, empresa_id, autor_id, autor_nome)
      values (
        v_ped.extra_atual_op_id,
        'Seu vínculo EXTRA foi transferido',
        format('O %s "%s" (EXTRA): Valor R$ %s | Vencimento %s foi transferido para %s. Autorizado por %s.',
               v_ped.nr_label, v_ped.nr_valor, v_valor_fmt, v_venc_fmt,
               v_ped.solicitante_nome, coalesce(v_nome, 'um autorizador')),
        v_ped.empresa_id, v_uid, coalesce(v_nome, 'Autorizador')
      );
    end if;

    v_payload := v_payload || jsonb_build_object(
      'tipo_vinculo', 'extra',
      'vinculo_operador_id',   v_ped.dono_id,
      'vinculo_operador_nome', v_ped.dono_nome
    );
  else
    -- Transferencia completa: REUSA a funcao que ja faz lixeira, delete e log.
    -- Ela le `auth.uid()`, que aqui e o autorizador — exatamente quem deve
    -- constar como quem autorizou.
    v_transf := public.fn_transferir_acordo_nr(
      v_ped.acordo_alvo_id, v_ped.solicitante_id, 'autorizacao_solicitada');

    if coalesce((v_transf->>'ok')::boolean, false) is not true then
      update public.autorizacoes_pedidos
         set status = 'falhou', decidido_por_id = v_uid,
             decidido_por_nome = coalesce(v_nome, 'Autorizador'),
             decidido_em = now(), erro = coalesce(v_transf->>'erro', 'falha_transferencia')
       where id = p_id;
      return jsonb_build_object('ok', false, 'erro', coalesce(v_transf->>'erro', 'falha_transferencia'));
    end if;

    insert into public.notificacoes (usuario_id, titulo, mensagem, empresa_id, autor_id, autor_nome)
    values (
      v_ped.dono_id,
      format('Seu %s "%s" foi transferido', v_ped.nr_label, v_ped.nr_valor),
      format('O %s "%s" foi transferido para %s com autorização de %s. Seu acordo foi movido para a lixeira. Detalhes: Valor R$ %s | Vencimento %s | Status: %s.',
             v_ped.nr_label, v_ped.nr_valor, v_ped.solicitante_nome,
             coalesce(v_nome, 'um autorizador'),
             coalesce(to_char((v_transf->>'valor')::numeric, 'FM999G999G990D00'), '—'),
             coalesce(to_char((v_transf->>'vencimento')::date, 'DD/MM/YYYY'), '—'),
             coalesce(v_transf->>'status', '—')),
      v_ped.empresa_id, v_uid, coalesce(v_nome, 'Autorizador')
    );
  end if;

  -- Grava o acordo do solicitante. `jsonb_populate_record` sobre a propria
  -- tabela ignora chave que nao seja coluna — o payload pode trazer campo a
  -- mais sem derrubar a aprovacao inteira, que era o comportamento em degraus
  -- que o cliente implementava a mao em `executarSalvar`.
  insert into public.acordos
  select * from jsonb_populate_record(null::public.acordos, v_payload)
  returning id into v_novo_id;

  if v_ped.modo = 'troca_extra' and v_ped.acordo_alvo_id is not null then
    update public.acordos
       set vinculo_operador_id   = v_ped.solicitante_id,
           vinculo_operador_nome = v_ped.solicitante_nome
     where id = v_ped.acordo_alvo_id;
  end if;

  update public.autorizacoes_pedidos
     set status = 'aprovado', decidido_por_id = v_uid,
         decidido_por_nome = coalesce(v_nome, 'Autorizador'),
         decidido_em = now(), acordo_criado_id = v_novo_id
   where id = p_id;

  insert into public.notificacoes (usuario_id, titulo, mensagem, empresa_id, acordo_id, autor_id, autor_nome)
  values (
    v_ped.solicitante_id,
    'Autorização aprovada',
    format('%s autorizou o registro do %s %s. O acordo já foi tabulado no seu nome.',
           coalesce(v_nome, 'Um autorizador'), v_ped.nr_label, v_ped.nr_valor),
    v_ped.empresa_id, v_novo_id, v_uid, coalesce(v_nome, 'Autorizador')
  );

  -- A trilha ja registra o delete e o insert pelas triggers; o que ela nao ve e
  -- a DECISAO — que houve pedido, quem decidiu e sobre qual NR.
  insert into public.logs_sistema
    (usuario_id, acao, categoria, severidade, descricao, origem, tabela, registro_id,
     empresa_id, alvo_tipo, alvo_rotulo, detalhes)
  values (
    v_uid, 'autorizacao_aprovada', 'acordo', 'aviso',
    format('Autorizou %s a registrar o %s %s.',
           v_ped.solicitante_nome, v_ped.nr_label, v_ped.nr_valor),
    'ui', 'autorizacoes_pedidos', p_id, v_ped.empresa_id,
    'acordo', format('%s %s', v_ped.nr_label, v_ped.nr_valor),
    jsonb_build_object(
      'modo',             v_ped.modo,
      'solicitante_id',   v_ped.solicitante_id,
      'solicitante_nome', v_ped.solicitante_nome,
      'dono_anterior',    v_ped.dono_nome,
      'acordo_criado',    v_novo_id
    )
  );

  return jsonb_build_object('ok', true, 'status', 'aprovado', 'acordo_id', v_novo_id);
end;
$function$;

revoke all on function public.fn_autorizacao_decidir(uuid, boolean, text) from public;
grant execute on function public.fn_autorizacao_decidir(uuid, boolean, text) to authenticated;

-- ── 6. Cancelar (pelo proprio solicitante) ─────────────────────────────────

create or replace function public.fn_autorizacao_cancelar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_ok  boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  end if;

  update public.autorizacoes_pedidos
     set status = 'cancelado', decidido_em = now(),
         motivo_recusa = 'Cancelado pelo solicitante.'
   where id = p_id
     and solicitante_id = v_uid
     and status = 'pendente'
  returning true into v_ok;

  return jsonb_build_object('ok', coalesce(v_ok, false));
end;
$function$;

revoke all on function public.fn_autorizacao_cancelar(uuid) from public;
grant execute on function public.fn_autorizacao_cancelar(uuid) to authenticated;

-- ── 7. Verificacao ─────────────────────────────────────────────────────────

do $$
declare
  v_faltando text;
begin
  select string_agg(nome, ', ') into v_faltando
    from (values
      ('fn_autorizacao_solicitar'), ('fn_autorizacao_decidir'),
      ('fn_autorizacao_cancelar'),  ('fn_pode_autorizar_pedido')
    ) as t(nome)
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = t.nome
   );
  if v_faltando is not null then
    raise exception 'Funcoes de autorizacao nao criadas: %', v_faltando;
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'autorizacoes_pedidos'
       and cmd in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception 'autorizacoes_pedidos nao pode ter policy de escrita: so as RPCs gravam';
  end if;
end;
$$;
