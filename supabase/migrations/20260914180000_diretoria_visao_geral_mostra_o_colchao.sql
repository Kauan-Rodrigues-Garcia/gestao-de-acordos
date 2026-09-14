-- ═══════════════════════════════════════════════════════════════════════════
-- A Visão Geral passa a MOSTRAR o colchão que ela já soma
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que estava errado
--
-- Desde a 20260913200932 as duas abas do Painel Diretoria respondem coisas
-- diferentes sobre o mesmo arquivo, de propósito:
--
--   Visão Geral ........ total da empresa, colchão INCLUÍDO
--   Setores e equipes .. o que conta para setor, colchão DE FORA
--
-- A regra é a que a diretoria pediu. O problema é que a diferença — R$
-- 163.876,90 em setembro/2026 — não tinha nome em tela nenhuma. Quem abria as
-- duas abas via dois totais para o mesmo mês, sem nada explicando, e a leitura
-- óbvia é «um dos dois está quebrado».
--
-- ## O que esta migration faz
--
-- `fn_mestre_diretoria_visao_geral` passa a devolver um bloco `colchao` com o
-- valor, a quantidade de linhas e o mesmo recorte do mês anterior. Nada mais
-- muda: `total` continua sendo o arquivo inteiro, colchão dentro — é isso que
-- «total da empresa» significa.
--
-- O bloco existe para a tela poder dizer, com número: «deste total, X é
-- colchão, e é exatamente por isso que a soma dos setores é menor».
--
-- ## A régua é `fn_mestre_conta_na_meta`, e não um `where colchao`
--
-- Colchão de 01 a 14/08/2026 CONTA para setor (agosto foi fechado com essa
-- janela valendo). Filtrar por `r.colchao` direto aqui faria este bloco
-- discordar do que Setores e equipes descarta, justamente no mês em que a
-- exceção existe — e o número que deveria explicar a diferença passaria a
-- inventar outra.
--
-- ## Escrita: nenhuma. Só `create or replace` de função de leitura.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_mestre_diretoria_visao_geral(
  p_empresa_id uuid,
  p_mes        text,                 -- 'yyyy-MM'
  p_dia_corte  integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_mes       date;
  v_mes_ant   date;
  v_lote      uuid;
  v_lote_ant  uuid;
  v_corte     integer;
  v_ult_dia   integer;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res       jsonb;
begin
  -- O portão é o mesmo do resto do mestre: quem enxerga a empresa, enxerga.
  if not (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)) then
    raise exception 'Sem acesso a esta empresa.';
  end if;

  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  v_mes     := (p_mes || '-01')::date;
  v_mes_ant := v_mes - interval '1 month';
  v_ult_dia := extract(day from (v_mes + interval '1 month - 1 day'))::integer;

  -- Corte: o pedido, ou hoje no mês corrente, ou o mês fechado inteiro.
  v_corte := coalesce(
    p_dia_corte,
    case when date_trunc('month', v_hoje) = v_mes
         then extract(day from v_hoje)::integer
         else v_ult_dia end
  );
  v_corte := greatest(1, least(v_corte, v_ult_dia));

  select id into v_lote from mestre_lotes
   where empresa_id = p_empresa_id and mes = v_mes and estado = 'vigente' limit 1;
  select id into v_lote_ant from mestre_lotes
   where empresa_id = p_empresa_id and mes = v_mes_ant and estado = 'vigente' limit 1;

  with
  -- As linhas dos dois meses, já recortadas pelo corte. Tudo o mais sai daqui,
  -- e é isso que garante que os blocos fechem entre si.
  atual as (
    select r.* from mestre_recebimentos r
     where r.lote_id = v_lote
       and extract(day from r.dt_pgto) <= v_corte
  ),
  anterior as (
    select r.* from mestre_recebimentos r
     where r.lote_id = v_lote_ant
       and extract(day from r.dt_pgto) <= v_corte
  ),
  tot_atual as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v,
           count(*)::bigint n,
           count(distinct cobradora) filter (where cobradora <> '')::bigint operadores,
           count(distinct cod_grupo_filtro)::bigint carteiras
      from atual
  ),
  tot_ant as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v, count(*)::bigint n from anterior
  ),
  /* O colchao que ESTE total inclui e que Setores e equipes descarta.
     `fn_mestre_conta_na_meta` e nao `where colchao`: a janela de 01 a
     14/08/2026 conta para setor, e ignora-la faria este numero explicar uma
     diferenca diferente da que existe naquele mes. Ver o cabecalho. */
  colchao_atual as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v, count(*)::bigint n
      from atual where not fn_mestre_conta_na_meta(colchao, dt_pgto)
  ),
  colchao_ant as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v
      from anterior where not fn_mestre_conta_na_meta(colchao, dt_pgto)
  ),
  -- Série diária: uma linha por dia do mês, mesmo os dias sem recebimento. O
  -- gráfico precisa do zero para o traço não pular o buraco e mentir a forma.
  dias as (select generate_series(1, v_ult_dia) d),
  serie as (
    select d.d as dia,
           coalesce((select sum(a.recebido) from atual a
                      where extract(day from a.dt_pgto) = d.d), 0)::numeric(14,2) as valor,
           coalesce((select sum(b.recebido) from anterior b
                      where extract(day from b.dt_pgto) = d.d), 0)::numeric(14,2) as valor_anterior,
           d.d <= v_corte as dentro_do_corte
      from dias d
  ),
  /* Os dois lados agregados SEPARADAMENTE e depois juntos. Uma subconsulta
     correlacionada aqui nao compila: ela olharia `tp_doc` linha a linha, e a
     linha ja nao existe depois do `group by`. */
  formas_atual as (
    select coalesce(nullif(btrim(tp_doc), ''), 'NÃO INFORMADO') as forma,
           sum(recebido)::numeric(14,2) valor, count(*)::bigint qtd
      from atual group by 1
  ),
  formas_ant as (
    select coalesce(nullif(btrim(tp_doc), ''), 'NÃO INFORMADO') as forma,
           sum(recebido)::numeric(14,2) valor
      from anterior group by 1
  ),
  /* Left join, e nao full: o donut e do mes EM FOCO. Uma forma que sumiu
     entraria como fatia de zero e sujaria a leitura. */
  formas as (
    select fa.forma, fa.valor, fa.qtd, coalesce(fb.valor, 0)::numeric(14,2) valor_anterior
      from formas_atual fa left join formas_ant fb on fb.forma = fa.forma
  ),
  /* Mesma forma das formas de pagamento, pelo mesmo motivo. O `setor_id` vem do
     vinculo em `mestre_grupos`: carteira sem setor vinculado chega com nulo, e
     o painel a mostra assim mesmo — «sem setor» e informacao, nao ausencia. */
  cart_atual as (
    select cod_grupo_filtro cod, max(nome_grupo_filtro) nome,
           sum(recebido)::numeric(14,2) valor, count(*)::bigint qtd
      from atual group by 1
  ),
  cart_ant as (
    select cod_grupo_filtro cod, sum(recebido)::numeric(14,2) valor
      from anterior group by 1
  ),
  carteiras as (
    select ca.cod, ca.nome, ca.valor, ca.qtd,
           coalesce(cb.valor, 0)::numeric(14,2) valor_anterior,
           g.setor_id, s.nome as setor_nome
      from cart_atual ca
      left join cart_ant cb on cb.cod = ca.cod
      left join mestre_grupos g
             on g.empresa_id = p_empresa_id and g.cod_grupo_filtro = ca.cod
      left join setores s on s.id = g.setor_id
  )
  select jsonb_build_object(
    'mes',              p_mes,
    'mes_anterior',     to_char(v_mes_ant, 'YYYY-MM'),
    'dia_corte',        v_corte,
    'dias_no_mes',      v_ult_dia,
    'tem_lote',         v_lote is not null,
    'tem_lote_anterior', v_lote_ant is not null,
    'total',            (select jsonb_build_object(
                            'recebido', v, 'linhas', n,
                            'operadores', operadores, 'carteiras', carteiras)
                           from tot_atual),
    'total_anterior',   (select jsonb_build_object('recebido', v, 'linhas', n) from tot_ant),
    'colchao',          jsonb_build_object(
                            'valor',          (select v from colchao_atual),
                            'linhas',         (select n from colchao_atual),
                            'valor_anterior', (select v from colchao_ant)),
    'serie',            coalesce((select jsonb_agg(jsonb_build_object(
                            'dia', dia, 'valor', valor,
                            'valor_anterior', valor_anterior,
                            'dentro_do_corte', dentro_do_corte) order by dia) from serie), '[]'::jsonb),
    'formas',           coalesce((select jsonb_agg(jsonb_build_object(
                            'forma', forma, 'valor', valor, 'qtd', qtd,
                            'valor_anterior', valor_anterior) order by valor desc) from formas), '[]'::jsonb),
    'carteiras',        coalesce((select jsonb_agg(jsonb_build_object(
                            'cod', cod, 'nome', nome, 'valor', valor, 'qtd', qtd,
                            'valor_anterior', valor_anterior,
                            'setor_id', setor_id, 'setor_nome', setor_nome) order by valor desc)
                           from carteiras), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$function$;

comment on function public.fn_mestre_diretoria_visao_geral(uuid, text, integer) is
  'Visao geral do Painel Diretoria a partir do relatorio 59: total do mes (colchao INCLUIDO), '
  'mes anterior no MESMO corte de dia, serie diaria dos dois, formas de pagamento, quebra por '
  'carteira e o bloco `colchao` — a parte do total que NAO conta para setor e que explica a '
  'diferenca contra Setores e equipes. Mes sem lote devolve estrutura vazia, nao erro.';

revoke all on function public.fn_mestre_diretoria_visao_geral(uuid, text, integer) from public, anon;
grant execute on function public.fn_mestre_diretoria_visao_geral(uuid, text, integer) to authenticated;

commit;
