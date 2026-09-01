-- Premiação paga deixa de ser um carimbo genérico e passa a dizer QUANTO saiu.
--
-- Como estava: `pix_automatico_premiacoes_pagamento.pago` era um booleano
-- solto. O painel mostrava "Pago" no switch e, na mesma linha, "Falta pagar
-- R$ 412,30" — porque o "já pago" só somava as linhas de `pix_automatico_acordos`
-- marcadas uma a uma. Dois números contando a mesma verdade e discordando.
--
-- Como fica: marcar a premiação registra o valor que quitou o restante, e esse
-- valor entra no "já pago" do painel. É a mesma mecânica do pagamento por linha
-- do Pix Automático (`valorAPagarDe`), agora aplicada à premiação do mês.
--
-- O que já estava pago continua pago: as linhas antigas ficam com
-- `valor_pago` NULL, e o painel lê "NULL + pago" como "quitou o que faltava".
-- Nenhum registro é reescrito por adivinhação — o dado que não existe não é
-- inventado, é interpretado no lugar certo, uma vez só.

alter table public.pix_automatico_premiacoes_pagamento
  add column if not exists valor_pago numeric(12,2);

comment on column public.pix_automatico_premiacoes_pagamento.valor_pago is
  'Valor que saiu ao marcar a premiação como paga. NULL em linha anterior a esta migration: o painel a lê como quitação total do que faltava.';

-- Desmarcar apaga o valor junto: premiação "não paga" com valor gravado seria
-- um resto de estado antigo, e é exatamente o tipo de sobra que faz o painel
-- somar dinheiro que ninguém pagou.
alter table public.pix_automatico_premiacoes_pagamento
  drop constraint if exists pix_premiacao_pagamento_valor_check;

alter table public.pix_automatico_premiacoes_pagamento
  add constraint pix_premiacao_pagamento_valor_check
  check (
    (pago and (valor_pago is null or valor_pago >= 0))
    or
    (not pago and valor_pago is null)
  );

-- ── A RPC passa a receber o valor ──────────────────────────────────────────
--
-- Arity nova (5 argumentos), a antiga preservada logo abaixo delegando para
-- esta com NULL. Duas assinaturas com contagem diferente não são ambíguas para
-- o PostgREST, e é o que mantém de pé um navegador que ainda esteja com o
-- bundle anterior em cache.

create or replace function public.fn_pix_premiacao_marcar_pagamento(
  p_empresa_id uuid,
  p_operador_id uuid,
  p_mes date,
  p_pago boolean,
  p_valor_pago numeric
)
returns public.pix_automatico_premiacoes_pagamento
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_autor uuid := auth.uid();
  v_autor_nome text;
  v_operador_nome text;
  v_valor numeric(12,2);
  v_resultado public.pix_automatico_premiacoes_pagamento;
begin
  if v_autor is null then
    raise exception 'PIX_PREMIACAO_SEM_SESSAO: entre novamente no sistema.'
      using errcode = '42501';
  end if;

  if not public.fn_can_access_empresa(p_empresa_id) then
    raise exception 'PIX_PREMIACAO_EMPRESA: esta empresa não está no seu acesso.'
      using errcode = '42501';
  end if;

  if not public.fn_user_has_any_role(
    array['gerencia', 'diretoria', 'administrador', 'super_admin']::text[]
  ) then
    raise exception 'PIX_PREMIACAO_SEM_PERMISSAO: somente a gerência ou cargo superior pode alterar.'
      using errcode = '42501';
  end if;

  if p_mes is null or p_mes <> date_trunc('month', p_mes)::date then
    raise exception 'PIX_PREMIACAO_MES: informe o primeiro dia do mês.'
      using errcode = 'check_violation';
  end if;

  -- Valor negativo é sempre erro de quem chamou: "já saiu mais do que era
  -- devido" é caso do saldo de divergência, não de um pagamento negativo.
  if p_valor_pago is not null and p_valor_pago < 0 then
    raise exception 'PIX_PREMIACAO_VALOR: o valor pago não pode ser negativo.'
      using errcode = 'check_violation';
  end if;

  v_valor := case when p_pago then round(p_valor_pago, 2) else null end;

  select nullif(trim(p.nome), '')
    into v_operador_nome
    from public.perfis p
   where p.id = p_operador_id
     and p.empresa_id = p_empresa_id;

  if v_operador_nome is null then
    raise exception 'PIX_PREMIACAO_OPERADOR: pessoa não encontrada nesta empresa.'
      using errcode = 'check_violation';
  end if;

  select coalesce(nullif(trim(p.nome), ''), p.email, 'Gerência')
    into v_autor_nome
    from public.perfis p
   where p.id = v_autor;

  insert into public.pix_automatico_premiacoes_pagamento (
    empresa_id, operador_id, operador_nome, mes, pago, valor_pago,
    pago_em, pago_por, pago_por_nome,
    atualizado_em, atualizado_por, atualizado_por_nome
  ) values (
    p_empresa_id, p_operador_id, v_operador_nome, p_mes, p_pago, v_valor,
    case when p_pago then now() else null end,
    case when p_pago then v_autor else null end,
    case when p_pago then v_autor_nome else null end,
    now(), v_autor, v_autor_nome
  )
  on conflict (empresa_id, operador_id, mes) do update set
    operador_nome = excluded.operador_nome,
    pago = excluded.pago,
    valor_pago = excluded.valor_pago,
    pago_em = excluded.pago_em,
    pago_por = excluded.pago_por,
    pago_por_nome = excluded.pago_por_nome,
    atualizado_em = excluded.atualizado_em,
    atualizado_por = excluded.atualizado_por,
    atualizado_por_nome = excluded.atualizado_por_nome
  returning * into v_resultado;

  return v_resultado;
end
$function$;

revoke all on function public.fn_pix_premiacao_marcar_pagamento(uuid, uuid, date, boolean, numeric)
  from public, anon;
grant execute on function public.fn_pix_premiacao_marcar_pagamento(uuid, uuid, date, boolean, numeric)
  to authenticated, service_role;

comment on function public.fn_pix_premiacao_marcar_pagamento(uuid, uuid, date, boolean, numeric) is
  'Marca/desmarca a premiação mensal como paga, guardando quanto saiu. Exige cargo gerência ou superior e acesso à empresa.';

-- A assinatura antiga vira um atalho para a nova. Sem valor informado, a linha
-- fica com `valor_pago` NULL — que o painel lê como quitação total, o mesmo
-- significado que as linhas gravadas antes desta migration já têm.
create or replace function public.fn_pix_premiacao_marcar_pagamento(
  p_empresa_id uuid,
  p_operador_id uuid,
  p_mes date,
  p_pago boolean
)
returns public.pix_automatico_premiacoes_pagamento
language sql
security definer
set search_path to 'public'
as $function$
  select public.fn_pix_premiacao_marcar_pagamento(
    p_empresa_id, p_operador_id, p_mes, p_pago, null::numeric
  );
$function$;

comment on function public.fn_pix_premiacao_marcar_pagamento(uuid, uuid, date, boolean) is
  'Compatibilidade: chama a versão de 5 argumentos sem valor. Ver a migration 20260903100000.';
