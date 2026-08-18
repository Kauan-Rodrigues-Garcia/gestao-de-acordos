-- ============================================================================
-- Autorizacao por solicitacao tambem na tela de EDICAO
-- ============================================================================
--
-- A 20260818180000 tirou o login do lider da tela de NOVO acordo. A de edicao
-- ficou para tras porque ali nao se cria um acordo: atualiza-se o que ja existe,
-- e eu tinha assumido que o servidor precisaria reproduzir o recalculo de
-- parcelamento que `gravar()` faz no cliente — o que seria um SEGUNDO caminho de
-- gravacao de acordo, para divergir do primeiro.
--
-- Nao precisa. O cliente ja monta o payload inteiro antes de descobrir o
-- conflito; basta ele viajar junto com o pedido, como ja acontece na criacao. O
-- servidor nao recalcula nada — aplica o que foi decidido no momento do pedido.
--
-- ## E a mudanca de quantidade de parcelas?
--
-- Fica no cliente, aplicada ANTES do pedido, e nao passa por aqui. Ela e
-- independente da autorizacao: mexer na quantidade de parcelas do proprio grupo
-- nunca exigiu lider nenhum — quem exige e a troca da CHAVE para uma que e de
-- outra pessoa. Sao duas edicoes diferentes que a tela juntava numa so.
--
-- (E so existe na BookPlay: na PaguePlay `planoQuantidade` e sempre nulo.)
--
-- ## O que a aprovacao faz agora
--
--   pedido SEM `acordo_editado_id`  -> INSERT (tela de novo acordo)
--   pedido COM `acordo_editado_id`  -> UPDATE naquele acordo (tela de edicao)
--
-- O UPDATE toca SO as chaves presentes no payload. `coalesce` estaria errado:
-- limpar uma observacao e mandar `null` de proposito, e o coalesce reporia o
-- valor antigo. `v_payload ? 'campo'` distingue "nao mandou" de "mandou vazio".
-- ============================================================================

-- ── 1. A coluna ────────────────────────────────────────────────────────────

alter table public.autorizacoes_pedidos
  add column if not exists acordo_editado_id uuid;

comment on column public.autorizacoes_pedidos.acordo_editado_id is
  'Preenchido quando o pedido nasce da tela de EDICAO: ao aprovar, o payload e aplicado como UPDATE neste acordo em vez de criar um novo. A RPC confere que ele e do solicitante.';

-- ── 2. Solicitar: aceita e valida o alvo da edicao ─────────────────────────

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
  p_extra_atual_op_nome text default null,
  p_acordo_editado_id   uuid default null
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

  -- Editar acordo de OUTRA pessoa por este caminho seria escalada de
  -- privilegio: o pedido e aprovado por um lider, mas quem escolhe o alvo e o
  -- solicitante. So o proprio acordo entra.
  if p_acordo_editado_id is not null and not exists (
    select 1 from public.acordos
     where id = p_acordo_editado_id
       and operador_id = v_uid
       and empresa_id = v_empresa
  ) then
    return jsonb_build_object('ok', false, 'erro', 'acordo_editado_invalido');
  end if;

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
    payload, acordo_editado_id, resumo
  ) values (
    v_empresa, v_uid, coalesce(v_nome, 'Operador'), v_setor, v_setores, p_modo,
    coalesce(nullif(btrim(p_nr_label), ''), 'NR'), btrim(p_nr_valor),
    p_acordo_alvo_id, p_dono_id, p_dono_nome,
    p_extra_atual_id, p_extra_atual_op_id, p_extra_atual_op_nome,
    p_payload, p_acordo_editado_id, coalesce(p_resumo, '{}'::jsonb)
  )
  returning id into v_id;

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

  return jsonb_build_object('ok', true, 'id', v_id, 'notificados', v_qtd);
end;
$function$;

revoke all on function public.fn_autorizacao_solicitar(text, text, text, jsonb, jsonb, uuid, uuid, text, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.fn_autorizacao_solicitar(text, text, text, jsonb, jsonb, uuid, uuid, text, uuid, uuid, text, uuid) to authenticated;

-- A assinatura mudou (ganhou o 12o parametro). A antiga continuaria existindo em
-- paralelo e o PostgREST escolheria por nome de argumento — deixando duas portas
-- para a mesma coisa, uma delas sem o alvo da edicao.
drop function if exists public.fn_autorizacao_solicitar(text, text, text, jsonb, jsonb, uuid, uuid, text, uuid, uuid, text);

-- ── 3. Decidir: aprovar cria OU atualiza ───────────────────────────────────
--
-- Só o bloco de gravação muda em relação à 20260818200000; o resto é idêntico.

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

  select * into v_ped from public.autorizacoes_pedidos where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'pedido_inexistente');
  end if;

  if not public.fn_pode_autorizar_pedido(v_ped.empresa_id, v_ped.setores_escopo) then
    return jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  end if;

  if v_ped.status <> 'pendente' then
    return jsonb_build_object('ok', false, 'erro', 'ja_decidido',
                              'status', v_ped.status, 'por', v_ped.decidido_por_nome);
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
      v_ped.solicitante_id, 'Autorização recusada',
      format('Seu pedido para registrar o %s %s foi recusado por %s.%s',
             v_ped.nr_label, v_ped.nr_valor, coalesce(v_nome, 'um autorizador'),
             case when nullif(btrim(p_motivo), '') is not null
                  then ' Motivo: ' || btrim(p_motivo) else '' end),
      v_ped.empresa_id, v_uid, coalesce(v_nome, 'Autorizador')
    );

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
      jsonb_build_object('modo', v_ped.modo,
                         'solicitante_id', v_ped.solicitante_id,
                         'solicitante_nome', v_ped.solicitante_nome,
                         'edicao', v_ped.acordo_editado_id is not null,
                         'motivo', nullif(btrim(p_motivo), ''))
    );

    return jsonb_build_object('ok', true, 'status', 'recusado');
  end if;

  -- ── Aprovacao ───────────────────────────────────────────────────────────
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
        v_ped.extra_atual_op_id, 'Seu vínculo EXTRA foi transferido',
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

  -- ── Gravacao: criar OU atualizar ────────────────────────────────────────
  if v_ped.acordo_editado_id is null then
    insert into public.acordos
    select * from jsonb_populate_record(null::public.acordos, v_payload)
    returning id into v_novo_id;
  else
    -- Veio da tela de EDICAO. So as chaves PRESENTES no payload sao tocadas:
    -- `coalesce` estaria errado, porque limpar uma observacao e mandar `null`
    -- de proposito e o coalesce reporia o valor antigo.
    --
    -- A lista e a dos campos que a tela de edicao escreve. Campo novo por la
    -- precisa entrar aqui — e o preco de aplicar o payload sem reproduzir a
    -- montagem dele, que e o que se quis evitar.
    update public.acordos a
       set nome_cliente = case when v_payload ? 'nome_cliente' then v_payload->>'nome_cliente' else a.nome_cliente end,
           nr_cliente   = case when v_payload ? 'nr_cliente'   then v_payload->>'nr_cliente'   else a.nr_cliente end,
           instituicao  = case when v_payload ? 'instituicao'  then v_payload->>'instituicao'  else a.instituicao end,
           vencimento   = case when v_payload ? 'vencimento'   then (v_payload->>'vencimento')::date else a.vencimento end,
           valor        = case when v_payload ? 'valor'        then (v_payload->>'valor')::numeric else a.valor end,
           valor_total  = case when v_payload ? 'valor_total'  then (v_payload->>'valor_total')::numeric else a.valor_total end,
           valor_entrada = case when v_payload ? 'valor_entrada' then (v_payload->>'valor_entrada')::numeric else a.valor_entrada end,
           tipo         = case when v_payload ? 'tipo'         then v_payload->>'tipo' else a.tipo end,
           parcelas     = case when v_payload ? 'parcelas'     then (v_payload->>'parcelas')::integer else a.parcelas end,
           numero_parcela = case when v_payload ? 'numero_parcela' then (v_payload->>'numero_parcela')::integer else a.numero_parcela end,
           usou_quarenta_pct = case when v_payload ? 'usou_quarenta_pct' then (v_payload->>'usou_quarenta_pct')::boolean else a.usou_quarenta_pct end,
           whatsapp     = case when v_payload ? 'whatsapp'     then v_payload->>'whatsapp' else a.whatsapp end,
           status       = case when v_payload ? 'status'       then v_payload->>'status' else a.status end,
           observacoes  = case when v_payload ? 'observacoes'  then v_payload->>'observacoes' else a.observacoes end,
           estado_uf    = case when v_payload ? 'estado_uf'    then v_payload->>'estado_uf' else a.estado_uf end,
           tag_ids      = case when v_payload ? 'tag_ids'
                               then (select coalesce(array_agg(x::uuid), '{}'::uuid[])
                                       from jsonb_array_elements_text(
                                         case when jsonb_typeof(v_payload->'tag_ids') = 'array'
                                              then v_payload->'tag_ids' else '[]'::jsonb end) as x)
                               else a.tag_ids end,
           tipo_vinculo = case when v_payload ? 'tipo_vinculo' then v_payload->>'tipo_vinculo' else a.tipo_vinculo end,
           vinculo_operador_id   = case when v_payload ? 'vinculo_operador_id'
                                        then nullif(v_payload->>'vinculo_operador_id','')::uuid
                                        else a.vinculo_operador_id end,
           vinculo_operador_nome = case when v_payload ? 'vinculo_operador_nome'
                                        then v_payload->>'vinculo_operador_nome'
                                        else a.vinculo_operador_nome end,
           atualizado_em = now()
     where a.id = v_ped.acordo_editado_id
    returning a.id into v_novo_id;

    if v_novo_id is null then
      update public.autorizacoes_pedidos
         set status = 'falhou', decidido_por_id = v_uid,
             decidido_por_nome = coalesce(v_nome, 'Autorizador'),
             decidido_em = now(), erro = 'acordo_editado_sumiu'
       where id = p_id;
      return jsonb_build_object('ok', false, 'erro', 'acordo_editado_sumiu');
    end if;
  end if;

  update public.autorizacoes_pedidos
     set status = 'aprovado', decidido_por_id = v_uid,
         decidido_por_nome = coalesce(v_nome, 'Autorizador'),
         decidido_em = now(), acordo_criado_id = v_novo_id
   where id = p_id;

  insert into public.notificacoes (usuario_id, titulo, mensagem, empresa_id, acordo_id, autor_id, autor_nome)
  values (
    v_ped.solicitante_id, 'Autorização aprovada',
    format('%s autorizou o registro do %s %s. %s',
           coalesce(v_nome, 'Um autorizador'), v_ped.nr_label, v_ped.nr_valor,
           case when v_ped.acordo_editado_id is null
                then 'O acordo já foi tabulado no seu nome.'
                else 'Seu acordo já foi atualizado.' end),
    v_ped.empresa_id, v_novo_id, v_uid, coalesce(v_nome, 'Autorizador')
  );

  insert into public.logs_sistema
    (usuario_id, acao, categoria, severidade, descricao, origem, tabela, registro_id,
     empresa_id, alvo_tipo, alvo_rotulo, detalhes)
  values (
    v_uid, 'autorizacao_aprovada', 'acordo', 'aviso',
    format('Autorizou %s a %s o %s %s.',
           v_ped.solicitante_nome,
           case when v_ped.acordo_editado_id is null then 'registrar' else 'passar para' end,
           v_ped.nr_label, v_ped.nr_valor),
    'ui', 'autorizacoes_pedidos', p_id, v_ped.empresa_id,
    'acordo', format('%s %s', v_ped.nr_label, v_ped.nr_valor),
    jsonb_build_object('modo', v_ped.modo,
                       'solicitante_id', v_ped.solicitante_id,
                       'solicitante_nome', v_ped.solicitante_nome,
                       'dono_anterior', v_ped.dono_nome,
                       'edicao', v_ped.acordo_editado_id is not null,
                       'acordo', v_novo_id)
  );

  return jsonb_build_object('ok', true, 'status', 'aprovado', 'acordo_id', v_novo_id);
end;
$function$;

revoke all on function public.fn_autorizacao_decidir(uuid, boolean, text) from public, anon;
grant execute on function public.fn_autorizacao_decidir(uuid, boolean, text) to authenticated;

-- ── 4. Verificacao ─────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='autorizacoes_pedidos'
       and column_name='acordo_editado_id'
  ) then
    raise exception 'coluna acordo_editado_id nao foi criada';
  end if;

  -- Uma so porta: a assinatura antiga (11 parametros) nao pode sobreviver.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='fn_autorizacao_solicitar') <> 1 then
    raise exception 'fn_autorizacao_solicitar tem mais de uma assinatura';
  end if;

  if has_function_privilege('anon',
       'public.fn_autorizacao_solicitar(text, text, text, jsonb, jsonb, uuid, uuid, text, uuid, uuid, text, uuid)',
       'execute') then
    raise exception 'fn_autorizacao_solicitar continua executavel por anon';
  end if;
end;
$$;
