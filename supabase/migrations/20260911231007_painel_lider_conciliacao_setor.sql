-- Só o consolidado mensal do setor no Painel Líder. O relatório 945 não
-- identifica setor: hoje PaguePlay possui apenas Conecta Play. Recusamos uma
-- futura configuração ambígua em vez de repetir o total em vários setores.
create or replace function private.pp_conciliacao_setor(p_empresa_id uuid, p_mes text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_inicio date;
  v_setores uuid[];
  v_escopo integer;
  v_resultado jsonb;
begin
  if auth.uid() is null
     or not coalesce(public.fn_can_access_empresa(p_empresa_id), false)
     or not coalesce(public.fn_user_tem('ver_painel_lider'), false)
     or not coalesce(public.fn_user_tem('painel_lider_sub_desempenho_equipes'), false)
     or not exists (select 1 from public.empresas where id = p_empresa_id and slug = 'pagueplay') then
    raise exception 'Sem acesso à conciliação do setor' using errcode = '42501';
  end if;
  v_escopo := public.fn_user_escopo('painel_lider');
  if coalesce(v_escopo, -1) < 2 then
    raise exception 'Sem acesso ao acumulado do setor' using errcode = '42501';
  end if;
  if p_mes is null or p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido';
  end if;
  v_inicio := (p_mes || '-01')::date;
  select array_agg(s.id) into v_setores from public.setores s
    where s.empresa_id = p_empresa_id and not coalesce(s.alternativo, false);
  if coalesce(cardinality(v_setores), 0) <> 1 then
    raise exception 'A conciliação precisa de um único setor de origem configurado';
  end if;
  if v_escopo = 2 and not exists (
    select 1 from public.perfis p where p.id = auth.uid() and p.setor_id = v_setores[1]
  ) then
    raise exception 'Sem acesso ao setor da conciliação' using errcode = '42501';
  end if;
  -- Competência = data, como no acumulado da diretoria; data_pagamento é
  -- usada exclusivamente no resultado diário. Somar centavos no Postgres.
  select jsonb_build_object(
    'setor_id', v_setores[1],
    'total_centavos', coalesce(sum(r.total), 0)::text,
    'ho_centavos', coalesce(sum(r.pp), 0)::text,
    'quantidade', count(*)
  ) into v_resultado
  from public.pp_relatorio_conciliacoes r
  where r.empresa_id = p_empresa_id
    and r.data >= v_inicio and r.data < (v_inicio + interval '1 month')::date;
  return v_resultado;
end;
$$;
revoke all on function private.pp_conciliacao_setor(uuid, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.pp_conciliacao_setor(uuid, text) to authenticated;

create or replace function public.fn_pp_conciliacao_setor(p_empresa_id uuid, p_mes text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.pp_conciliacao_setor(p_empresa_id, p_mes);
$$;
revoke all on function public.fn_pp_conciliacao_setor(uuid, text) from public, anon;
grant execute on function public.fn_pp_conciliacao_setor(uuid, text) to authenticated;
