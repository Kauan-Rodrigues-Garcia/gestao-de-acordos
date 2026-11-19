-- =============================================================================
-- Painel Líder › Gráfico recebimento: setor Cofen pelo relatório 945
-- =============================================================================
-- Pedido do Cleber, 19/11/2026: o gráfico do setor Cofen tem de bater com o
-- relatório 945 de pagamento do Painel Diretoria › Relatórios PaguePlay.
--
-- Antes ele somava o recebimento diário (`fn_diario_resumo_mensal`), que sai do
-- mesmo arquivo mas diverge em dois pontos:
--   • baixa sem operador (Coren, IA) só entra num setor pelo setor de QUEM
--     IMPORTOU — importada pela diretoria/super admin sem setor, sumia do
--     gráfico do setor;
--   • somava o ajuste de recebimento, que o 945 não tem (o card do setor Cofen
--     já não soma).
--
-- Agora, com o setor Cofen inteiro em tela, o gráfico lê
-- `pp_relatorio_pagamentos` por dia pela coluna `data`, a mesma tabela e a
-- mesma coluna que a tela da diretoria agrupa. Com equipe filtrada, continua no
-- diário: só ele sabe o operador de cada baixa.
--
-- Mesmo desenho de `fn_pp_conciliacao_setor` (20260911231007): o 945 não diz o
-- setor, então só vale com UM setor de regra Cofen (fora o alternativo) na
-- empresa; a pública é SECURITY INVOKER e só repassa; a privada confere tudo.
-- Decide pela regra do setor (`setores.regra`), não pela empresa.
--
-- Só função nova. Nenhuma linha de dado muda.
-- =============================================================================

create or replace function private.pp_pagamento_setor_por_dia(p_empresa_id uuid, p_mes text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_inicio date;
  v_setores uuid[];
  v_escopo integer;
begin
  if auth.uid() is null
     or not coalesce(public.fn_can_access_empresa(p_empresa_id), false)
     or not coalesce(public.fn_user_tem('ver_painel_lider'), false)
     or not coalesce(public.fn_user_tem('painel_lider_sub_grafico_recebimento'), false) then
    raise exception 'Sem acesso ao relatório 945 do setor' using errcode = '42501';
  end if;
  v_escopo := public.fn_user_escopo('painel_lider');
  if coalesce(v_escopo, -1) < 2 then
    raise exception 'Sem acesso ao recebimento do setor' using errcode = '42501';
  end if;
  if p_mes is null or p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mês inválido';
  end if;
  v_inicio := (p_mes || '-01')::date;
  select array_agg(s.id) into v_setores from public.setores s
    where s.empresa_id = p_empresa_id and s.regra = 'cofen'
      and not coalesce(s.alternativo, false) and s.excluido_em is null;
  if coalesce(cardinality(v_setores), 0) <> 1 then
    raise exception 'O relatório 945 precisa de um único setor Cofen configurado';
  end if;
  if v_escopo = 2 and not exists (
    select 1 from public.perfis p where p.id = auth.uid() and p.setor_id = v_setores[1]
  ) then
    raise exception 'Sem acesso ao setor do relatório 945' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'setor_id', v_setores[1],
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data', x.data, 'total_centavos', x.total::text, 'ho_centavos', x.pp::text, 'quantidade', x.n)
             order by x.data)
        from (select r.data, sum(r.total) total, sum(r.pp) pp, count(*) n
                from public.pp_relatorio_pagamentos r
               where r.empresa_id = p_empresa_id
                 and r.data >= v_inicio and r.data < (v_inicio + interval '1 month')::date
               group by r.data) x
    ), '[]'::jsonb));
end;
$$;
revoke all on function private.pp_pagamento_setor_por_dia(uuid, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.pp_pagamento_setor_por_dia(uuid, text) to authenticated;

create or replace function public.fn_pp_pagamento_setor_por_dia(p_empresa_id uuid, p_mes text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.pp_pagamento_setor_por_dia(p_empresa_id, p_mes);
$$;
revoke all on function public.fn_pp_pagamento_setor_por_dia(uuid, text) from public, anon;
grant execute on function public.fn_pp_pagamento_setor_por_dia(uuid, text) to authenticated;
