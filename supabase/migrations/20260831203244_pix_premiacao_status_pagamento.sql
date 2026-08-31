-- Status mensal da premiação exibida em Pix Automático.
--
-- O pagamento das comissões por acordo (`pix_automatico_acordos.pago`) e a
-- confirmação de que a PREMIAÇÃO mensal foi paga são fatos diferentes. Esta
-- tabela guarda o segundo sem alterar o cálculo financeiro existente.

create table public.pix_automatico_premiacoes_pagamento (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  operador_id uuid not null references public.perfis(id) on delete cascade,
  operador_nome text not null,
  mes date not null,
  pago boolean not null default false,
  pago_em timestamptz,
  pago_por uuid references public.perfis(id) on delete set null,
  pago_por_nome text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.perfis(id) on delete set null,
  atualizado_por_nome text,
  constraint pix_premiacao_pagamento_mes_inicio_check
    check (mes = date_trunc('month', mes)::date),
  constraint pix_premiacao_pagamento_carimbo_check
    check (
      (pago and pago_em is not null and pago_por is not null)
      or
      (not pago and pago_em is null and pago_por is null and pago_por_nome is null)
    ),
  constraint pix_premiacao_pagamento_unico
    unique (empresa_id, operador_id, mes)
);

comment on table public.pix_automatico_premiacoes_pagamento is
  'Confirmação manual mensal de pagamento da premiação do Pix Automático; uma linha por empresa, operador e mês.';

alter table public.pix_automatico_premiacoes_pagamento enable row level security;

-- O painel já exige alcance de setor na aba Pix. A leitura acompanha o mesmo
-- cadeado; escrita direta não existe, pois só a RPC abaixo pode mudar o status.
create policy pix_premiacao_pagamento_select
on public.pix_automatico_premiacoes_pagamento
for select to authenticated
using (
  (select public.fn_can_access_empresa(empresa_id))
  and (select public.fn_user_escopo('pix')) >= 2
);

revoke all on table public.pix_automatico_premiacoes_pagamento from public, anon, authenticated;
grant select on table public.pix_automatico_premiacoes_pagamento to authenticated;

create or replace function public.fn_pix_premiacao_marcar_pagamento(
  p_empresa_id uuid,
  p_operador_id uuid,
  p_mes date,
  p_pago boolean
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

  -- “A partir da gerência”: elite, líder e ouvidoria continuam vendo a coluna,
  -- mas não conseguem escrever nem chamando a RPC manualmente.
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
    empresa_id, operador_id, operador_nome, mes, pago,
    pago_em, pago_por, pago_por_nome,
    atualizado_em, atualizado_por, atualizado_por_nome
  ) values (
    p_empresa_id, p_operador_id, v_operador_nome, p_mes, p_pago,
    case when p_pago then now() else null end,
    case when p_pago then v_autor else null end,
    case when p_pago then v_autor_nome else null end,
    now(), v_autor, v_autor_nome
  )
  on conflict (empresa_id, operador_id, mes) do update set
    operador_nome = excluded.operador_nome,
    pago = excluded.pago,
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

revoke all on function public.fn_pix_premiacao_marcar_pagamento(uuid, uuid, date, boolean)
  from public, anon;
grant execute on function public.fn_pix_premiacao_marcar_pagamento(uuid, uuid, date, boolean)
  to authenticated, service_role;

comment on function public.fn_pix_premiacao_marcar_pagamento(uuid, uuid, date, boolean) is
  'Marca/desmarca a premiação mensal como paga. Exige cargo gerência ou superior e acesso à empresa.';

-- Dinheiro exige trilha: quem marcou/desmarcou e os dois estados ficam também
-- na auditoria append-only, além dos carimbos da própria linha.
create trigger trg_log_pix_premiacao_pagamento
after insert or update on public.pix_automatico_premiacoes_pagamento
for each row execute function public.fn_log_auditoria(
  'financeiro', 'pix_premiacao_pagamento', 'o pagamento mensal da premiação do Pix',
  'operador_nome', '', 'empresa_id', 'aviso');
