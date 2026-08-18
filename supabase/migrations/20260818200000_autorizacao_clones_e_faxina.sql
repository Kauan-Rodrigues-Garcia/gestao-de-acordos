-- ============================================================================
-- Autorizacao: alcance por CLONE e faxina diaria da gaveta
-- ============================================================================
--
-- Duas mudancas sobre a 20260818180000.
--
-- ## 1. O pedido alcanca os lideres dos setores onde a pessoa e CLONE
--
-- O recorte era so `perfis.setor_id`. Mas um operador pode estar emprestado a
-- uma equipe de OUTRO setor (`equipe_operadores_clones`), e o lider daquele
-- setor supervisiona o trabalho dele ali. Hoje, na PaguePlay, quase todo o
-- setor "Amauri Digital" e formado por clones do Play 4 e do Play 5: um pedido
-- de qualquer um deles nao chegava ao lider do Amauri Digital.
--
-- ## 2. Pedido decidido sai da gaveta
--
-- Aceito ou recusado, some da janela. O historico fica em `logs_sistema`, que e
-- append-only e tem retencao propria de 730 dias. A gaveta e uma fila de
-- trabalho: item resolvido ali dentro so ocupa espaco.
--
-- Para isso a RECUSA passa a ser registrada na trilha — antes so a aprovacao
-- era, e apagar a linha levaria junto a unica memoria de que alguem recusou.
-- ============================================================================

-- ── 1. Os setores de um operador — REUSO, nao funcao nova ──────────────────
--
-- `public.fn_setores_do_operador(uuid)` JA EXISTE e faz exatamente isto: setor
-- de origem UNION setores das equipes em que a pessoa e clone. Nasceu em
-- `20260731e_comemoracoes.sql`, para decidir na tela de quem a comemoracao
-- explode, e esta na baseline.
--
-- A primeira versao desta migration criava uma segunda funcao com o mesmo nome
-- e outro tipo de retorno (`uuid[]` em vez de `SETOF uuid`). O PostgreSQL
-- recusou — 42P13, "cannot change return type of existing function" — e a
-- recusa estava certa: seriam duas respostas para a mesma pergunta, e a segunda
-- nasceria ja em divergencia com a primeira no dia em que a regra de clone
-- mudasse.
--
-- Fica a que existe. Onde e preciso um array, `array(select ...)` resolve.
--
-- `conta_recebimento` nao entra no filtro dela, e esta certo para o nosso caso:
-- aquele campo decide de quem e o DINHEIRO, e a pergunta aqui e de SUPERVISAO.
-- Um clone que nao soma no recebimento continua sendo alguem que aquele lider
-- acompanha.
--
-- ⚠️ Ha ainda uma versao em TypeScript da mesma regra — `setoresDoOperador`, em
-- `services/analitico/analitico.service.ts` — que opera sobre mapas ja
-- carregados, para agregacao em massa. Mudou a regra de clone, mudam as duas.
-- Esta nota existe nos dois lugares.

-- ── 2. O escopo vai gravado no pedido ──────────────────────────────────────
--
-- Desnormalizado pela MESMA razao de `setor_id` ja ser: e ele que decide quem
-- ve o pedido, e ler os clones ATUAIS faria um pedido de ontem mudar de dono
-- quando alguem entra ou sai de uma equipe emprestada.

alter table public.autorizacoes_pedidos
  add column if not exists setores_escopo uuid[] not null default '{}'::uuid[];

comment on column public.autorizacoes_pedidos.setores_escopo is
  'Setores que podem decidir este pedido: o do solicitante mais os das equipes em que ele e clone, congelados na criacao.';

-- Preenche o que ja existe. `setor_id` sozinho e o que a versao anterior sabia.
update public.autorizacoes_pedidos
   set setores_escopo = array(select public.fn_setores_do_operador(solicitante_id))
 where setores_escopo = '{}'::uuid[];

-- Busca por "algum destes setores" — GIN e o indice de array.
create index if not exists ix_autorizacoes_escopo
  on public.autorizacoes_pedidos using gin (setores_escopo);

-- ── 3. Quem pode decidir ───────────────────────────────────────────────────
--
-- A policy depende da funcao, entao a ordem e: derrubar a policy, trocar a
-- funcao, recriar a policy. `create or replace` nao serve — a assinatura muda.

drop policy if exists autorizacoes_select on public.autorizacoes_pedidos;
drop function if exists public.fn_pode_autorizar_pedido(uuid, uuid);

create or replace function public.fn_pode_autorizar_pedido(
  p_empresa_id uuid,
  p_setores    uuid[]
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
         -- Quem lidera um setor decide os pedidos daquele setor — inclusive os
         -- de quem esta ali como CLONE. Array vazio (solicitante sem setor
         -- nenhum) cai so para os de visao ampla, de proposito: pedido sem
         -- setor nao tem lider natural, e deixa-lo visivel para todo lider da
         -- empresa devolveria o ruido que o recorte existe para tirar.
         or (p.perfil in ('lider','elite','gerencia')
             and p.setor_id is not null
             and p.setor_id = any(coalesce(p_setores, '{}'::uuid[])))
       )
  )
  or public.fn_user_is_super_admin();
$function$;

comment on function public.fn_pode_autorizar_pedido(uuid, uuid[]) is
  'Quem pode ver e decidir um pedido. Espelha PERFIS_AUTORIZADORES, com recorte pelos setores do solicitante (origem + clones).';

create policy autorizacoes_select on public.autorizacoes_pedidos
  for select to authenticated
  using (
    solicitante_id = auth.uid()
    or public.fn_pode_autorizar_pedido(empresa_id, setores_escopo)
  );

-- ── 4. Solicitar: escopo e notificacao pelos clones ────────────────────────

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
  v_setores uuid[];
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

  -- `array(select ...)`: a funcao devolve SETOF, e o escopo e gravado como
  -- array numa coluna. Ver a secao 1 para o porque de nao existir uma variante
  -- que ja devolva `uuid[]`.
  v_setores := array(select public.fn_setores_do_operador(v_uid));

  -- Pedido repetido do mesmo operador para o mesmo NR nao vira fila.
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
    empresa_id, solicitante_id, solicitante_nome, setor_id, setores_escopo, modo,
    nr_label, nr_valor, acordo_alvo_id, dono_id, dono_nome,
    extra_atual_id, extra_atual_op_id, extra_atual_op_nome,
    payload, resumo
  ) values (
    v_empresa, v_uid, coalesce(v_nome, 'Operador'), v_setor, v_setores, p_modo,
    coalesce(nullif(btrim(p_nr_label), ''), 'NR'), btrim(p_nr_valor),
    p_acordo_alvo_id, p_dono_id, p_dono_nome,
    p_extra_atual_id, p_extra_atual_op_id, p_extra_atual_op_nome,
    p_payload, coalesce(p_resumo, '{}'::jsonb)
  )
  returning id into v_id;

  -- Notifica quem pode decidir, pela MESMA regra da policy — agora abrangendo
  -- os setores onde o solicitante e clone.
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
       or (p.perfil in ('lider','elite','gerencia')
           and p.setor_id is not null
           and p.setor_id = any(v_setores))
     );
  get diagnostics v_qtd = row_count;

  return jsonb_build_object('ok', true, 'id', v_id, 'notificados', v_qtd,
                            'setores', to_jsonb(v_setores));
end;
$function$;

revoke all on function public.fn_autorizacao_solicitar(text, text, text, jsonb, jsonb, uuid, uuid, text, uuid, uuid, text) from public;
grant execute on function public.fn_autorizacao_solicitar(text, text, text, jsonb, jsonb, uuid, uuid, text, uuid, uuid, text) to authenticated;

-- ── 5. Decidir: novo escopo, e a RECUSA tambem vai para a trilha ───────────

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
  -- raro — a notificacao chega para todos de uma vez.
  select * into v_ped from public.autorizacoes_pedidos where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'pedido_inexistente');
  end if;

  if not public.fn_pode_autorizar_pedido(v_ped.empresa_id, v_ped.setores_escopo) then
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

    -- A trilha passa a registrar a RECUSA, e nao so a aprovacao. Sem isto, a
    -- faxina diaria levaria embora a unica memoria de que alguem recusou.
    insert into public.logs_sistema
      (usuario_id, acao, categoria, severidade, descricao, origem, tabela, registro_id,
       empresa_id, alvo_tipo, alvo_rotulo, detalhes)
    values (
      v_uid, 'autorizacao_recusada', 'acordo', 'aviso',
      format('Recusou o pedido de %s para registrar o %s %s.%s',
             v_ped.solicitante_nome, v_ped.nr_label, v_ped.nr_valor,
             case when nullif(btrim(p_motivo), '') is not null
                  then ' Motivo: ' || btrim(p_motivo) else '' end),
      'ui', 'autorizacoes_pedidos', p_id, v_ped.empresa_id,
      'acordo', format('%s %s', v_ped.nr_label, v_ped.nr_valor),
      jsonb_build_object(
        'modo',             v_ped.modo,
        'solicitante_id',   v_ped.solicitante_id,
        'solicitante_nome', v_ped.solicitante_nome,
        'dono_atual',       v_ped.dono_nome,
        'motivo',           nullif(btrim(p_motivo), '')
      )
    );

    return jsonb_build_object('ok', true, 'status', 'recusado');
  end if;

  -- ── Aprovacao ───────────────────────────────────────────────────────────
  --
  -- Os DEFAULTS de `acordos` entram a mao, antes do payload:
  -- `jsonb_populate_record` grava NULL em toda coluna ausente do JSON, e o
  -- default da tabela nao se aplica porque a linha ja chega completa.
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

-- ── 6. Faxina diaria ───────────────────────────────────────────────────────
--
-- O pedido decidido FICA na gaveta o dia inteiro: e o registro de que aquilo ja
-- foi resolvido e por quem, e e o que impede duas pessoas de perguntarem a mesma
-- coisa. Na virada do dia ele sai, e a lista amanhece so com pendentes.
--
-- A memoria de longo prazo fica em `logs_sistema` — append-only, 730 dias, com
-- a aprovacao E a recusa registradas.
--
-- Duas coisas acontecem, nesta ordem:
--
-- 1. pendente VENCIDO vira 'cancelado'. Nao e "limpar pendente": um pedido com
--    `expira_em` no passado ja nao pode ser aprovado — `fn_autorizacao_decidir`
--    o recusa. Sem este passo ele ficaria na tabela para sempre, porque o que o
--    marcava era alguem TENTAR decidi-lo;
-- 2. decidido ANTES de hoje e apagado. O corte e a meia-noite de Sao Paulo, e
--    nao "agora menos 24 h": quem recusou as 23h59 ve o proprio trabalho ate a
--    virada, em vez de a linha sumir um minuto depois.
--
-- O corte e `timestamptz`, e nao `date`. Comparar `decidido_em < <date>` faria o
-- PostgreSQL converter a data para timestamptz no fuso do SERVIDOR (UTC), e
-- meia-noite em Sao Paulo e 03:00 UTC: o corte sairia tres horas fora do lugar,
-- e as decisoes tomadas entre 21h e 24h sobreviveriam um dia a mais.

create or replace function public.fn_autorizacao_faxina()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_corte timestamptz :=
    date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_qtd   integer;
begin
  update public.autorizacoes_pedidos
     set status = 'cancelado',
         decidido_em = now(),
         motivo_recusa = coalesce(motivo_recusa, 'Pedido expirou sem decisão.')
   where status = 'pendente'
     and expira_em <= now();

  delete from public.autorizacoes_pedidos
   where status <> 'pendente'
     and coalesce(decidido_em, criado_em) < v_corte;
  get diagnostics v_qtd = row_count;

  return v_qtd;
end;
$function$;

revoke all on function public.fn_autorizacao_faxina() from public, anon, authenticated;

comment on function public.fn_autorizacao_faxina() is
  'Faxina diaria da gaveta de autorizacoes: vencidos viram cancelados, decididos de dias anteriores sao apagados. O historico fica em logs_sistema.';

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('autorizacoes-faxina')
      where exists (select 1 from cron.job where jobname = 'autorizacoes-faxina');
    -- 00:05 em Sao Paulo = 03:05 UTC. O cron do Supabase roda em UTC, e as
    -- outras tarefas do projeto ja seguem essa conversao.
    perform cron.schedule('autorizacoes-faxina', '5 3 * * *',
      'SELECT public.fn_autorizacao_faxina();');
  end if;
end;
$$;

-- ── 7. Verificacao ─────────────────────────────────────────────────────────

do $$
begin
  -- A funcao de escopo e REUSADA, nao criada aqui. Se alguem a renomear ou
  -- trocar o retorno, o roteamento por clone para de funcionar em silencio —
  -- os pedidos continuariam chegando, so que ao lider errado. Falha alto.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_setores_do_operador'
       and pg_get_function_identity_arguments(p.oid) = 'p_operador uuid'
       and pg_get_function_result(p.oid) = 'SETOF uuid'
  ) then
    raise exception 'fn_setores_do_operador(p_operador uuid) RETURNS SETOF uuid nao existe — o escopo por clone depende dela';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_pode_autorizar_pedido'
       and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id uuid, p_setores uuid[]'
  ) then
    raise exception 'fn_pode_autorizar_pedido nao ficou com a assinatura de array';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'autorizacoes_pedidos'
       and policyname = 'autorizacoes_select'
  ) then
    raise exception 'policy autorizacoes_select nao foi recriada';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'autorizacoes_pedidos'
       and cmd in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception 'autorizacoes_pedidos nao pode ter policy de escrita';
  end if;
end;
$$;
