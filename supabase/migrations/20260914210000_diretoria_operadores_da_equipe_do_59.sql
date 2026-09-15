-- ============================================================================
-- Painel Diretoria: quem recebeu, dentro de uma equipe do 59
-- ============================================================================
--
-- Pedido de 14/09/2026: no detalhe do setor, a lista «No 59, sem vínculo com
-- equipe do sistema» mostrava «COB RECEPTIVO - BEATRIZ · 6 operadores», e não
-- dizia QUEM são os seis. Clicar na equipe tem que abrir os operadores e quanto
-- cada um recebeu.
--
-- ## Por que uma função nova
--
-- `fn_mestre_operadores_da_equipe` já existe, mas é da aba Relatório 59: só
-- responde para super_admin e soma o 59 cru da carteira, sem corte de dia,
-- com colchão e sem a regra de atribuição. A diretoria veria lista vazia, e o
-- super_admin veria um total que não fecha com a linha da equipe logo acima.
--
-- Esta lê as MESMAS linhas do detalhe do setor (`fn_mestre_diretoria_linhas`:
-- equipe movida, 2a perna do Integral, colchão fora, corte de dia) e filtra a
-- equipe. A soma dos operadores é, por construção, o valor da linha da equipe.
--
-- Carteira ainda sem setor (`p_setor_id` nulo) segue o caminho cru do detalhe da
-- carteira, com o mesmo recorte.
--
-- ## Acesso
--
-- O portão do Painel Diretoria: quem enxerga a empresa. O casamento com o
-- cadastro é o de sempre — `perfis.usuario` em minúsculo, na mesma empresa.
--
-- Sem escrita, sem tabela nova. Reaplicar é inofensivo.
-- ============================================================================

create or replace function public.fn_mestre_diretoria_equipe_operadores(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid,
  p_cod_grupo  text,
  p_subgrupo   text,
  p_dia_corte  integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
set statement_timeout to '20s'
as $function$
declare
  v_mes     date;
  v_ult_dia integer;
  v_corte   integer;
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res     jsonb;
begin
  if not (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)) then
    raise exception 'Sem acesso a esta empresa.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;
  if p_cod_grupo is null then
    raise exception 'Informe p_cod_grupo.';
  end if;
  if p_setor_id is not null and not exists (
       select 1 from setores s where s.id = p_setor_id and s.empresa_id = p_empresa_id) then
    raise exception 'Setor nao pertence a esta empresa.';
  end if;

  -- O mesmo corte de `fn_mestre_diretoria_setor`.
  v_mes     := (p_mes || '-01')::date;
  v_ult_dia := extract(day from (v_mes + interval '1 month - 1 day'))::integer;
  v_corte   := coalesce(
    p_dia_corte,
    case when date_trunc('month', v_hoje) = v_mes
         then extract(day from v_hoje)::integer else v_ult_dia end);
  v_corte   := greatest(1, least(v_corte, v_ult_dia));

  with
  linhas as (
    select l.cobradora, l.dt_pgto, l.recebido, l.origem
      from fn_mestre_diretoria_linhas(p_empresa_id, p_mes, v_corte) l
     where p_setor_id is not null
       and l.setor_id = p_setor_id
       and l.cod_grupo_filtro = p_cod_grupo
       and l.subgrupo_equipe is not distinct from p_subgrupo
    union all
    select r.cobradora, r.dt_pgto, r.recebido, 'proprio'
      from mestre_recebimentos r
      join mestre_lotes lo on lo.id = r.lote_id and lo.estado = 'vigente'
     where p_setor_id is null
       and r.empresa_id = p_empresa_id
       and r.mes = v_mes
       and r.cod_grupo_filtro = p_cod_grupo
       and r.subgrupo_equipe is not distinct from p_subgrupo
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and extract(day from r.dt_pgto) <= v_corte
  ),
  por_operador as (
    select btrim(cobradora)                                          as cobradora,
           count(*)::bigint                                          as linhas,
           sum(recebido)::numeric(14,2)                              as recebido,
           coalesce(sum(recebido) filter (where origem = 'integral'), 0)::numeric(14,2) as integral_para_ca,
           count(distinct dt_pgto)::bigint                           as dias,
           min(dt_pgto)                                              as primeiro_pgto,
           max(dt_pgto)                                              as ultimo_pgto
      from linhas
     where btrim(coalesce(cobradora, '')) <> ''
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cobradora',        o.cobradora,
           'linhas',           o.linhas,
           'recebido',         o.recebido,
           'integral_para_ca', o.integral_para_ca,
           'dias',             o.dias,
           'primeiro_pgto',    o.primeiro_pgto,
           'ultimo_pgto',      o.ultimo_pgto,
           'perfil_id',        p.id,
           'perfil_nome',      p.nome,
           'perfil_ativo',     p.ativo,
           'foto_url',         p.foto_url,
           'equipe_atual',     eq.nome,
           'setor_atual',      s.nome
         ) order by o.recebido desc, o.cobradora), '[]'::jsonb)
    into v_res
    from por_operador o
    left join lateral (
      -- Um perfil por login: dois cadastros com o mesmo usuário na empresa não
      -- podem duplicar o operador e dobrar a soma na tela.
      select pp.id, pp.nome, pp.ativo, pp.foto_url, pp.equipe_id, pp.setor_id
        from perfis pp
       where pp.empresa_id = p_empresa_id
         and lower(pp.usuario) = lower(o.cobradora)
       order by pp.ativo desc nulls last, pp.id
       limit 1
    ) p on true
    left join equipes eq on eq.id = p.equipe_id
    left join setores s  on s.id = p.setor_id;

  return v_res;
end;
$function$;

revoke all on function public.fn_mestre_diretoria_equipe_operadores(uuid, text, uuid, text, text, integer) from public, anon;
grant execute on function public.fn_mestre_diretoria_equipe_operadores(uuid, text, uuid, text, text, integer) to authenticated;

comment on function public.fn_mestre_diretoria_equipe_operadores(uuid, text, uuid, text, text, integer) is
  'Operadores de uma equipe do 59 no detalhe do setor do Painel Diretoria, com o que cada um recebeu. '
  'Mesmas linhas de fn_mestre_diretoria_setor (atribuicao, corte, colchao fora): a soma fecha com a '
  'linha da equipe. Portao: quem enxerga a empresa.';
