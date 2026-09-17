-- ============================================================================
-- Painel Diretoria (BookPlay): as abas do 59 sem estourar os 8 segundos
-- ============================================================================
--
-- Medido em produção em 17/09/2026 (pg_stat_statements das últimas 48 h e
-- EXPLAIN ANALYZE como `postgres`, só leitura). As abas do painel davam
-- «canceling statement due to statement timeout».
--
--   função                              chamadas  média    máx     disco temp.
--   fn_mestre_diretoria_setor               220   1.654 ms 4.742 ms 3,3 GB
--   fn_mestre_diretoria_visao_geral          35   2.148 ms 6.428 ms 535 MB
--   fn_mestre_diretoria_setores              52     872 ms 2.751 ms 814 MB
--   fn_mestre_fontes_dos_setores              2   3.318 ms 4.428 ms —
--   fn_analitico_remocoes_guardadas           7   2.154 ms 6.827 ms 114 MB
--   fn_mestre_resumo_grupos                  10   1.245 ms 5.628 ms 298 MB
--   fn_mestre_equipes_sugeridas              10   1.326 ms 3.879 ms —
--   fn_mestre_divergencias(+_resumo)         20     680 ms 1.785 ms —
--
-- Nenhuma resposta muda. `mestreDiretoriaDesempenho.sql.test.ts` guarda as
-- definições de produção de 17/09/2026, roda as duas versões sobre os mesmos
-- dados em PGlite e compara resposta a resposta.
--
-- ## 1. Os dois ajudantes voltam a ser embutidos
--
-- `fn_mestre_conta_na_meta` e `fn_mestre_e_equipe` ganharam `SET search_path`
-- na 20260908004649, para calar o advisor `function_search_path_mutable`.
-- Função SQL com cláusula `SET` NÃO é embutida pelo planejador: vira uma
-- chamada de verdade para cada linha do 59, em quase toda função do mestre.
--
-- Medido sobre as ~28 mil linhas de setembro, mesma regra:
--
--   where fn_mestre_conta_na_meta(colchao, dt_pgto) ........... 340 ms
--   where not coalesce(colchao, false) or dt_pgto between ... ..  43 ms
--
-- As duas são puras: não leem tabela, não chamam nada fora de `pg_catalog`
-- (que é sempre o primeiro schema da busca). Sem `search_path` não há o que
-- sequestrar. O aviso do advisor volta para estas duas e fica aceito aqui.
-- `fn_mestre_setor_resolvido` já era assim, pelo mesmo motivo.
--
-- ## 2. `fn_mestre_diretoria_linhas`: só as colunas usadas, pelo lote
--
-- A base de Setores, do detalhe de setor e da tabela «Onde o resultado
-- acontece». Levava 1,19 s sozinha e gravava em disco:
--
--   - `select r.*` num CTE lido duas vezes (as duas pernas) — o Postgres
--     guardava as ~35 colunas da linha (cliente, título, NR…) para usar 9;
--   - o filtro era `empresa + mês` com junção ao lote vigente, que lê também
--     as linhas de lotes abertos ou presos do mesmo mês (há um de setembro com
--     27.927 linhas). Agora é `lote_id = <lote vigente>`, pelo índice
--     `mestre_recebimentos_lote`. `fn_mestre_inserir_linhas` grava `empresa_id`
--     e `mes` copiados do lote, então as duas formas escolhem as mesmas linhas.
--
-- ## 3. Série diária por `group by`
--
-- `fn_mestre_diretoria_visao_geral` e `fn_mestre_diretoria_setor` montavam a
-- série com uma subconsulta por dia, duas vezes (mês e anterior): 62 varreduras
-- do mês. Agora é uma agregação por lado, juntada ao calendário. A visão geral
-- também passa a ler só as 7 colunas que usa.
--
-- ## 4. `fn_mestre_diretoria_equipes_dos_setores` (nova)
--
-- A tabela «Onde o resultado acontece» chamava `fn_mestre_diretoria_setor` uma
-- vez por setor, só para usar o bloco `equipes` — e cada chamada resolvia o 59
-- do mês inteiro duas vezes e montava série, formas e carteiras jogadas fora.
-- São as 220 chamadas e os 3,3 GB da tabela acima. A nova resolve o mês uma vez
-- e devolve `{ setor_id: equipes }`, com o bloco idêntico ao do detalhe.
--
-- ## 5. `fn_mestre_conferencia` (nova)
--
-- A aba «Conferência 58 × 59» pedia `fn_mestre_divergencias` (lista) e
-- `fn_mestre_divergencias_resumo` juntas — e o resumo chama
-- `fn_mestre_divergencias` inteira de novo. O cruzamento do mês rodava duas
-- vezes em paralelo. A nova chama uma vez e devolve os dois. As duas funções
-- antigas ficam: o front cai nelas enquanto esta migration não for aplicada.
--
-- ## 6. `fn_mestre_resumo_grupos`: só as colunas usadas, pelo lote
--
-- Mesmo remédio do item 2. Lida pelo «Relatório 59», por «Códigos» e, dentro
-- do banco, por `fn_mestre_comparar_setores`.
--
-- ## 7. `fn_analitico_remocoes_guardadas`: o mês pelo índice
--
-- `to_char(mes_referencia, 'YYYY-MM') = p_mes` não usa o índice
-- `analitico_removidos_empresa_mes`: a consulta lia a empresa inteira (a tabela
-- tem 393 mil linhas) para ficar com um mês. Agora é um intervalo de datas.
-- `STRICT` fica como está — ver a nota no fim.
--
-- ## 8. Índice parcial para o histórico de importações
--
-- `fn_importacoes_historico` filtra `logs_sistema` por `alvo_tipo`, que não tem
-- índice: 747 linhas de importação no meio de 48.805 logs.
--
-- ## 9. Teto de tempo nas funções das abas que não tinham
--
-- Sem `SET statement_timeout` a função herda os 8 s do papel `authenticated`.
-- Com as mudanças acima nenhuma deve chegar perto; o teto é rede de proteção
-- para mês grande, não conserto. Atenção: `create or replace` sem o `SET` numa
-- migration futura destas funções tira o teto (e o `work_mem` da 20260917140000).
--
-- ## Nota: «todos os meses» no histórico sempre voltou vazio
--
-- `fn_analitico_remocoes_guardadas` é `STRICT` e o front chama com `p_mes` nulo
-- quando o filtro de mês é desligado — a resposta é nula, sem erro. NÃO foi
-- mudado aqui porque muda o que a tela mostra, e a leitura sem mês agrega a
-- tabela inteira. Fica para decisão à parte.
--
-- Escrita de dado: nenhuma. Só funções, um índice e `alter function ... set`.
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ============================================================================
-- 1. Ajudantes embutíveis
-- ============================================================================

alter function public.fn_mestre_conta_na_meta(boolean, date) reset search_path;
alter function public.fn_mestre_e_equipe(text) reset search_path;

-- ============================================================================
-- 2. fn_mestre_diretoria_linhas
-- ============================================================================

create or replace function public.fn_mestre_diretoria_linhas(
  p_empresa_id uuid, p_mes text, p_dia_corte integer default null::integer
)
returns table(setor_id uuid, cod_grupo_filtro text, nome_grupo_filtro text,
              subgrupo_equipe text, cobradora text, dt_pgto date, tp_doc text,
              recebido numeric, origem text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- O lote vigente do mês. No máximo um (`mestre_lotes_um_vigente_por_mes`);
  -- nenhum = nenhuma linha, como a junção de antes.
  with lote as (
    select l.id
      from mestre_lotes l
     where l.empresa_id = p_empresa_id
       and l.mes = (p_mes || '-01')::date
       and l.estado = 'vigente'
  ),
  -- Mapa de nome->codigo do MES INTEIRO, sem corte: o mapa e cadastral, nao
  -- temporal. Corta-lo faria contribuicoes ficarem orfas por causa de data.
  -- Tambem NAO filtra colchao: o mapa e de nomes, nao de dinheiro.
  nomes as (
    select distinct r.cod_grupo_filtro, r.nome_grupo_filtro
      from mestre_recebimentos r
     where r.lote_id = (select id from lote)
       and r.nome_grupo_filtro <> ''
  ),
  -- Só as colunas que as duas pernas usam. `select r.*` aqui guardava a linha
  -- inteira do 59 num CTE lido duas vezes — ver 20260917160000.
  fatia as (
    select r.setor, r.nome_grupo_filtro, r.cod_grupo_filtro, r.subgrupo_equipe,
           r.cobradora, r.dt_pgto, r.tp_doc, r.recebido, r.tipo
      from mestre_recebimentos r
     where r.lote_id = (select id from lote)
       and (p_dia_corte is null or extract(day from r.dt_pgto) <= p_dia_corte)
       -- Colchao nao conta para SETOR: ele entra no total da empresa
       -- (fn_mestre_diretoria_visao_geral) e fica de fora daqui, igual a
       -- Retencao. Uma linha so, na entrada, para as duas pernas abaixo.
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
  ),
  resolvida as (
    select f.*,
           n.cod_grupo_filtro as cod_destino,
           coalesce(me.destino, 'proprio') as destino_equipe,
           me.destino_setor_id,
           -- Grupo so empresta o setor dele quando o vinculo esta confirmado.
           case when g.estado = 'vinculado' then g.setor_id end as setor_do_grupo
      from fatia f
      cross join lateral (
        select case
                 when f.nome_grupo_filtro <> ''
                  and starts_with(f.setor, f.nome_grupo_filtro || ' - ')
                 then substr(f.setor, length(f.nome_grupo_filtro) + 4)
               end as destino_nome
      ) dn
      left join nomes n on n.nome_grupo_filtro = dn.destino_nome
      left join mestre_equipes me
        on me.empresa_id = p_empresa_id
       and me.cod_grupo_filtro = f.cod_grupo_filtro
       and me.nome_subgrupo = f.subgrupo_equipe
      left join mestre_grupos g
        on g.empresa_id = p_empresa_id
       and g.cod_grupo_filtro = f.cod_grupo_filtro
  )
  -- 1a perna: onde a linha conta por direito proprio (ou para onde foi movida).
  select
    case r.destino_equipe
      when 'outro_setor'   then r.destino_setor_id
      when 'somente_geral' then null::uuid
      else r.setor_do_grupo
    end,
    r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
    r.cobradora, r.dt_pgto, r.tp_doc, r.recebido,
    case r.destino_equipe
      when 'outro_setor'   then 'movido'
      when 'somente_geral' then 'somente_geral'
      else 'proprio'
    end
  from resolvida r

  union all

  -- 2a perna: o Integral cobrado por um grupo PARA outro. Soma no destino sem
  -- sair da origem. So Integral: o Extra e a segunda representacao de um
  -- pagamento que o destino ja tem como direto.
  select
    gd.setor_id,
    r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
    r.cobradora, r.dt_pgto, r.tp_doc, r.recebido,
    'integral'
  from resolvida r
  join mestre_grupos gd
    on gd.empresa_id = p_empresa_id
   and gd.cod_grupo_filtro = r.cod_destino
   and gd.estado = 'vinculado'
   and gd.setor_id is not null
  where r.cod_destino is not null
    and r.cod_destino <> r.cod_grupo_filtro
    and lower(r.tipo) <> 'extra';
$function$;

comment on function public.fn_mestre_diretoria_linhas(uuid, text, integer) is
  'Uma linha por recebimento do 59, ja resolvida para o setor que a recebe. '
  'Origem: proprio, movido, integral ou somente_geral (Retencao e afins — conta '
  'no total da empresa e em setor nenhum). Colchao NAO entra. Le o lote vigente '
  'pelo lote_id e so as colunas usadas (20260917160000). Base de '
  'fn_mestre_diretoria_setores, fn_mestre_diretoria_setor e '
  'fn_mestre_diretoria_equipes_dos_setores.';

-- ============================================================================
-- 3a. fn_mestre_diretoria_visao_geral
-- ============================================================================

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
set statement_timeout to '20s'
set work_mem to '32MB'
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
  -- e é isso que garante que os blocos fechem entre si. Só as colunas usadas
  -- (20260917160000): estes CTEs são lidos várias vezes e ficam em memória.
  atual as (
    select extract(day from r.dt_pgto)::integer as dia,
           r.dt_pgto, r.recebido, r.cobradora, r.cod_grupo_filtro,
           r.nome_grupo_filtro, r.tp_doc, r.colchao
      from mestre_recebimentos r
     where r.lote_id = v_lote
       and extract(day from r.dt_pgto) <= v_corte
  ),
  anterior as (
    select extract(day from r.dt_pgto)::integer as dia,
           r.dt_pgto, r.recebido, r.cod_grupo_filtro, r.tp_doc, r.colchao
      from mestre_recebimentos r
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
     diferenca diferente da que existe naquele mes. */
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
  -- Uma agregação por lado, juntada ao calendário — antes era uma subconsulta
  -- por dia (20260917160000).
  dias as (select generate_series(1, v_ult_dia) d),
  serie_atual as (select dia, sum(recebido) v from atual group by dia),
  serie_ant   as (select dia, sum(recebido) v from anterior group by dia),
  serie as (
    select d.d as dia,
           coalesce(sa.v, 0)::numeric(14,2) as valor,
           coalesce(sb.v, 0)::numeric(14,2) as valor_anterior,
           d.d <= v_corte as dentro_do_corte
      from dias d
      left join serie_atual sa on sa.dia = d.d
      left join serie_ant   sb on sb.dia = d.d
  ),
  /* Os dois lados agregados SEPARADAMENTE e depois juntos. */
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
  /* Left join, e nao full: o donut e do mes EM FOCO. */
  formas as (
    select fa.forma, fa.valor, fa.qtd, coalesce(fb.valor, 0)::numeric(14,2) valor_anterior
      from formas_atual fa left join formas_ant fb on fb.forma = fa.forma
  ),
  /* O `setor_id` vem do vinculo em `mestre_grupos`: carteira sem setor
     vinculado chega com nulo, e o painel a mostra assim mesmo. */
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

-- ============================================================================
-- 3b. fn_mestre_diretoria_setor — a definição de produção de 17/09/2026, com a
--     série por `group by` no lugar da subconsulta por dia
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_setor(p_empresa_id uuid, p_mes text, p_setor_id uuid DEFAULT NULL::uuid, p_cod_grupo text DEFAULT NULL::text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
 SET work_mem TO '32MB'
AS $function$
declare
  v_mes      date;
  v_mes_ant  date;
  v_mes_ant_txt text;
  v_ult_dia  integer;
  v_corte    integer;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res      jsonb;
begin
  if not (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)) then
    raise exception 'Sem acesso a esta empresa.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;
  if (p_setor_id is null) = (p_cod_grupo is null) then
    raise exception 'Informe p_setor_id OU p_cod_grupo, exatamente um dos dois.';
  end if;
  if p_setor_id is not null and not exists (
       select 1 from setores s where s.id = p_setor_id and s.empresa_id = p_empresa_id) then
    raise exception 'Setor nao pertence a esta empresa.';
  end if;

  v_mes     := (p_mes || '-01')::date;
  v_mes_ant := (v_mes - interval '1 month')::date;
  v_mes_ant_txt := to_char(v_mes_ant, 'YYYY-MM');
  v_ult_dia := extract(day from (v_mes + interval '1 month - 1 day'))::integer;
  v_corte   := coalesce(
    p_dia_corte,
    case when date_trunc('month', v_hoje) = v_mes
         then extract(day from v_hoje)::integer else v_ult_dia end);
  v_corte   := greatest(1, least(v_corte, v_ult_dia));

  with
  atual as (
    select l.* from fn_mestre_diretoria_linhas(p_empresa_id, p_mes, v_corte) l
     where p_setor_id is not null and l.setor_id = p_setor_id
    union all
    -- Modo carteira crua: direto da tabela, sem passar pela atribuicao. O
    -- colchao fica de fora aqui tambem — carteira e recorte de setor, e a via
    -- do `fn_mestre_diretoria_linhas` acima ja o descarta. Sem esta linha, abrir
    -- a mesma carteira pelos dois caminhos daria dois numeros.
    select null::uuid, r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
           r.cobradora, r.dt_pgto, r.tp_doc, r.recebido, 'proprio'
      from mestre_recebimentos r
      join mestre_lotes lo on lo.id = r.lote_id and lo.estado = 'vigente'
     where p_cod_grupo is not null
       and r.empresa_id = p_empresa_id
       and r.mes = v_mes
       and r.cod_grupo_filtro = p_cod_grupo
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and extract(day from r.dt_pgto) <= v_corte
  ),
  anterior as (
    select l.* from fn_mestre_diretoria_linhas(p_empresa_id, v_mes_ant_txt, v_corte) l
     where p_setor_id is not null and l.setor_id = p_setor_id
    union all
    select null::uuid, r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
           r.cobradora, r.dt_pgto, r.tp_doc, r.recebido, 'proprio'
      from mestre_recebimentos r
      join mestre_lotes lo on lo.id = r.lote_id and lo.estado = 'vigente'
     where p_cod_grupo is not null
       and r.empresa_id = p_empresa_id
       and r.mes = v_mes_ant
       and r.cod_grupo_filtro = p_cod_grupo
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and extract(day from r.dt_pgto) <= v_corte
  ),
  tot as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v, count(*)::bigint n,
           count(distinct cobradora) filter (where cobradora <> '')::bigint ops
      from atual
  ),
  tot_ant as (select coalesce(sum(recebido), 0)::numeric(14,2) v from anterior),
  dias as (select generate_series(1, v_ult_dia) d),
  -- Uma agregação por lado, juntada ao calendário. Antes era uma subconsulta
  -- por dia, nos dois meses (20260917160000).
  serie_atual as (
    select extract(day from dt_pgto)::integer dia, sum(recebido) v from atual group by 1
  ),
  serie_ant as (
    select extract(day from dt_pgto)::integer dia, sum(recebido) v from anterior group by 1
  ),
  serie as (
    select d.d dia,
           coalesce(sa.v, 0)::numeric(14,2) valor,
           coalesce(sb.v, 0)::numeric(14,2) valor_anterior,
           d.d <= v_corte dentro_do_corte
      from dias d
      left join serie_atual sa on sa.dia = d.d
      left join serie_ant   sb on sb.dia = d.d
  ),
  formas as (
    select coalesce(nullif(btrim(tp_doc), ''), 'NAO INFORMADO') forma,
           sum(recebido)::numeric(14,2) valor, count(*)::bigint qtd,
           0::numeric(14,2) valor_anterior
      from atual group by 1
  ),
  -- As equipes NAO comparam com o mes anterior, de proposito: subgrupo do ERP
  -- muda de nome, e casar por nome inventaria equipe nova onde houve renomeacao.
  --
  -- O nome e `equipes_do_59` e NAO `equipes` porque existe uma TABELA com esse
  -- nome, e um CTE sombreia a tabela homonima em toda referencia nao
  -- qualificada do mesmo comando. Com o CTE chamado `equipes`, o
  -- `left join equipes eq` abaixo pegava o CTE e estourava com
  -- «column eq.id does not exist».
  equipes_do_59 as (
    select a.subgrupo_equipe nome,
           a.cod_grupo_filtro cod,
           max(a.nome_grupo_filtro) carteira,
           sum(a.recebido)::numeric(14,2) valor,
           count(*)::bigint linhas,
           count(distinct a.cobradora) filter (where a.cobradora <> '')::bigint operadores,
           bool_or(a.origem = 'movido')   veio_de_fora,
           bool_or(a.origem = 'integral') e_integral,
           fn_mestre_e_equipe(a.subgrupo_equipe) e_equipe
      from atual a group by 1, 2
  ),
  equipes_completas as (
    select e.*, me.equipe_id, eq.nome equipe_nome,
           lp.id lider_id, lp.nome lider_nome, lp.foto_url lider_foto
      from equipes_do_59 e
      left join mestre_equipes me
        on me.empresa_id = p_empresa_id
       and me.cod_grupo_filtro = e.cod
       and me.nome_subgrupo = e.nome
      left join equipes eq on eq.id = me.equipe_id
      left join lateral (
        select p.id, p.nome, p.foto_url
          from equipe_lideres el
          join perfis p on p.id = el.lider_id
         where el.equipe_id = me.equipe_id
           and el.empresa_id = p_empresa_id
         order by el.criado_em
         limit 1
      ) lp on true
  ),
  carteiras as (
    select a.cod_grupo_filtro cod, max(a.nome_grupo_filtro) nome,
           sum(a.recebido)::numeric(14,2) valor, count(*)::bigint qtd
      from atual a group by 1
  )
  select jsonb_build_object(
    'setor_id',     p_setor_id,
    'cod_grupo',    p_cod_grupo,
    'setor_nome',   coalesce(
                      (select nome from setores where id = p_setor_id),
                      (select max(nome_grupo_filtro) from atual),
                      p_cod_grupo),
    'vinculado',    p_setor_id is not null,
    'mes',          p_mes,
    'mes_anterior', to_char(v_mes_ant, 'YYYY-MM'),
    'dia_corte',    v_corte,
    'dias_no_mes',  v_ult_dia,
    'recebido',     (select v from tot),
    'linhas',       (select n from tot),
    'operadores',   (select ops from tot),
    'recebido_anterior', (select v from tot_ant),
    'tem_anterior', (select v from tot_ant) <> 0,
    'serie',        coalesce((select jsonb_agg(jsonb_build_object(
                       'dia', dia, 'valor', valor, 'valor_anterior', valor_anterior,
                       'dentro_do_corte', dentro_do_corte) order by dia) from serie), '[]'::jsonb),
    'formas',       coalesce((select jsonb_agg(jsonb_build_object(
                       'forma', forma, 'valor', valor, 'qtd', qtd,
                       'valor_anterior', valor_anterior) order by valor desc) from formas), '[]'::jsonb),
    'carteiras',    coalesce((select jsonb_agg(jsonb_build_object(
                       'cod', cod, 'nome', nome, 'valor', valor, 'qtd', qtd)
                       order by valor desc) from carteiras), '[]'::jsonb),
    'equipes',      coalesce((select jsonb_agg(jsonb_build_object(
                       'nome', nome, 'cod_grupo', cod, 'carteira', carteira,
                       'valor', valor, 'linhas', linhas, 'operadores', operadores,
                       'veio_de_fora', veio_de_fora, 'e_integral', e_integral,
                       'e_equipe', e_equipe, 'equipe_id', equipe_id,
                       'equipe_nome', equipe_nome, 'lider_id', lider_id,
                       'lider_nome', lider_nome, 'lider_foto', lider_foto)
                       order by valor desc) from equipes_completas), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$function$;

-- ============================================================================
-- 4. fn_mestre_diretoria_equipes_dos_setores (nova)
-- ============================================================================

create or replace function public.fn_mestre_diretoria_equipes_dos_setores(
  p_empresa_id uuid, p_mes text, p_dia_corte integer default null::integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
set statement_timeout to '20s'
set work_mem to '32MB'
as $function$
declare
  v_mes      date;
  v_ult_dia  integer;
  v_corte    integer;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res      jsonb;
begin
  if not (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)) then
    raise exception 'Sem acesso a esta empresa.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  -- O mesmo corte de `fn_mestre_diretoria_setor`.
  v_mes     := (p_mes || '-01')::date;
  v_ult_dia := extract(day from (v_mes + interval '1 month - 1 day'))::integer;
  v_corte   := coalesce(
    p_dia_corte,
    case when date_trunc('month', v_hoje) = v_mes
         then extract(day from v_hoje)::integer else v_ult_dia end);
  v_corte   := greatest(1, least(v_corte, v_ult_dia));

  /* O bloco `equipes` de `fn_mestre_diretoria_setor`, para todos os setores de
     uma vez: a mesma agregação, com `setor_id` na chave. Ver o cabeçalho da
     migration. `equipes_do_59` e nao `equipes`: um CTE sombreia a tabela
     homonima em toda referencia nao qualificada do mesmo comando. */
  with
  atual as (
    select l.* from fn_mestre_diretoria_linhas(p_empresa_id, p_mes, v_corte) l
     where l.setor_id is not null
  ),
  equipes_do_59 as (
    select a.setor_id,
           a.subgrupo_equipe nome,
           a.cod_grupo_filtro cod,
           max(a.nome_grupo_filtro) carteira,
           sum(a.recebido)::numeric(14,2) valor,
           count(*)::bigint linhas,
           count(distinct a.cobradora) filter (where a.cobradora <> '')::bigint operadores,
           bool_or(a.origem = 'movido')   veio_de_fora,
           bool_or(a.origem = 'integral') e_integral,
           fn_mestre_e_equipe(a.subgrupo_equipe) e_equipe
      from atual a group by 1, 2, 3
  ),
  equipes_completas as (
    select e.*, me.equipe_id, eq.nome equipe_nome,
           lp.id lider_id, lp.nome lider_nome, lp.foto_url lider_foto
      from equipes_do_59 e
      left join mestre_equipes me
        on me.empresa_id = p_empresa_id
       and me.cod_grupo_filtro = e.cod
       and me.nome_subgrupo = e.nome
      left join equipes eq on eq.id = me.equipe_id
      left join lateral (
        select p.id, p.nome, p.foto_url
          from equipe_lideres el
          join perfis p on p.id = el.lider_id
         where el.equipe_id = me.equipe_id
           and el.empresa_id = p_empresa_id
         order by el.criado_em
         limit 1
      ) lp on true
  ),
  por_setor as (
    select e.setor_id,
           jsonb_agg(jsonb_build_object(
             'nome', nome, 'cod_grupo', cod, 'carteira', carteira,
             'valor', valor, 'linhas', linhas, 'operadores', operadores,
             'veio_de_fora', veio_de_fora, 'e_integral', e_integral,
             'e_equipe', e_equipe, 'equipe_id', equipe_id,
             'equipe_nome', equipe_nome, 'lider_id', lider_id,
             'lider_nome', lider_nome, 'lider_foto', lider_foto)
             order by valor desc) as equipes
      from equipes_completas e
     group by e.setor_id
  )
  select coalesce(jsonb_object_agg(setor_id::text, equipes), '{}'::jsonb)
    into v_res
    from por_setor;

  return v_res;
end;
$function$;

comment on function public.fn_mestre_diretoria_equipes_dos_setores(uuid, text, integer) is
  'As equipes do 59 de todos os setores numa chamada: { setor_id: [equipes] }, cada '
  'lista igual ao bloco `equipes` de fn_mestre_diretoria_setor para aquele setor. '
  'Substitui uma chamada de detalhe por setor na Visao Geral (20260917160000).';

revoke all on function public.fn_mestre_diretoria_equipes_dos_setores(uuid, text, integer) from public, anon;
grant execute on function public.fn_mestre_diretoria_equipes_dos_setores(uuid, text, integer) to authenticated;

-- ============================================================================
-- 5. fn_mestre_conferencia (nova)
-- ============================================================================

create or replace function public.fn_mestre_conferencia(
  p_empresa_id uuid, p_mes text, p_limite integer default 500
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '20s'
set work_mem to '32MB'
as $function$
  -- O cruzamento inteiro, uma vez. `with ordinality` guarda a ordem em que
  -- `fn_mestre_divergencias` devolve — é ela que decide quais linhas cabem no
  -- limite, exatamente como a chamada com `p_limite` fazia.
  with linhas as materialized (
    select d.*
      from fn_mestre_divergencias(p_empresa_id, p_mes, null, null, null, 1000000)
           with ordinality as d(setor_id, setor_nome, cobradora, operador_id,
                                operador_nome, nr_documento, dia, valor_59,
                                valor_58, delta, situacao, classe, ultimo_dia_58, ord)
  ),
  -- A consulta de `fn_mestre_divergencias_resumo`, sobre as mesmas linhas.
  resumo as (
    select l.setor_id,
           max(l.setor_nome)    as setor_nome,
           max(l.ultimo_dia_58) as ultimo_dia_58,
           l.classe,
           count(*)::bigint     as nrs,
           round(sum(abs(l.delta)), 2) as valor
      from linhas l
     group by l.setor_id, l.classe
  )
  select jsonb_build_object(
    'resumo', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.setor_nome,
               case r.classe
                 when 'divergencia'   then 0
                 when 'estrutural'    then 1
                 when 'dia_aberto'    then 2
                 when 'aguardando_58' then 3
                 else 4 end)
        from resumo r), '[]'::jsonb),
    'linhas', coalesce((
      select jsonb_agg(to_jsonb(l) - 'ord' order by l.ord)
        from linhas l
       where l.ord <= greatest(coalesce(p_limite, 300), 1)), '[]'::jsonb)
  );
$function$;

comment on function public.fn_mestre_conferencia(uuid, text, integer) is
  'Conferencia 58 x 59 numa chamada: { resumo, linhas }, iguais a '
  'fn_mestre_divergencias_resumo e a fn_mestre_divergencias(..., p_limite), com o '
  'cruzamento do mes rodando uma vez so (20260917160000). So leitura.';

revoke all on function public.fn_mestre_conferencia(uuid, text, integer) from public, anon;
grant execute on function public.fn_mestre_conferencia(uuid, text, integer) to authenticated;

-- ============================================================================
-- 6. fn_mestre_resumo_grupos — a definição de produção de 17/09/2026, lendo só
--    as colunas usadas e pelo lote vigente
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_mestre_resumo_grupos(p_empresa_id uuid, p_mes text)
 RETURNS TABLE(cod_grupo_filtro text, nome_no_relatorio text, nome_cadastrado text, setor_id uuid, setor_nome text, estado text, linhas bigint, recebido_proprio numeric, integral_proprio numeric, extra_proprio numeric, contrib_integral numeric, contrib_extra numeric, saiu_outro_setor numeric, saiu_somente_geral numeric, emprestado_para numeric, emprestado_pessoas bigint, recebido_total numeric, para_outros_integral numeric, para_outros_extra numeric, sem_destino numeric, colchao_valor numeric, colchao_fora numeric, atestado_valor numeric, equipes bigint, cobradoras bigint, dias bigint, primeira_aparicao date, ultima_aparicao date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '32MB'
 SET statement_timeout TO '30s'
AS $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  -- O lote vigente do mês, e dele só as colunas usadas abaixo. `select r.*`
  -- guardava a linha inteira do 59 num CTE lido várias vezes (20260917160000).
  lote as (
    select l.id from mestre_lotes l
     where l.empresa_id = p_empresa_id and l.mes = (select d from ref)
       and l.estado = 'vigente'
  ),
  fatia as (
    select r.id, r.cod_grupo_filtro, r.nome_grupo_filtro, r.setor, r.subgrupo_equipe,
           r.cobradora, r.dt_pgto, r.recebido, r.tipo, r.colchao, r.operador_setor_id,
           fn_mestre_conta_na_meta(r.colchao, r.dt_pgto) as conta
      from mestre_recebimentos r
     where r.lote_id = (select id from lote)
  ),
  nomes as (
    select distinct f.cod_grupo_filtro, f.nome_grupo_filtro
      from fatia f where f.nome_grupo_filtro <> ''
  ),
  resolvida as (
    select f.*, dn.destino_nome, n.cod_grupo_filtro as cod_destino,
           coalesce(me.destino, 'proprio') as destino_equipe,
           gr.setor_id as setor_carteira
      from fatia f
      cross join lateral (
        select case
                 when f.nome_grupo_filtro <> ''
                  and starts_with(f.setor, f.nome_grupo_filtro || ' - ')
                 then substr(f.setor, length(f.nome_grupo_filtro) + 4)
               end as destino_nome
      ) dn
      left join nomes n on n.nome_grupo_filtro = dn.destino_nome
      left join mestre_equipes me
        on me.empresa_id = p_empresa_id
       and me.cod_grupo_filtro = f.cod_grupo_filtro
       and me.nome_subgrupo = f.subgrupo_equipe
      left join mestre_grupos gr
        on gr.empresa_id = p_empresa_id
       and gr.cod_grupo_filtro = f.cod_grupo_filtro
       and gr.estado = 'vinculado'
  ),
  marcada as (
    select r.*,
           (r.conta
            and r.operador_setor_id is not null
            and r.setor_carteira is not null
            and r.operador_setor_id <> r.setor_carteira
            and r.destino_equipe = 'proprio') as emprestada
      from resolvida r
  ),
  propria as (
    select r.cod_grupo_filtro as cod,
           count(*) filter (where r.conta)                                     as linhas,
           sum(r.recebido) filter (where r.conta)                              as valor,
           sum(r.recebido) filter (where r.conta and lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where r.conta and lower(r.tipo) =  'extra') as extra,
           sum(r.recebido) filter (where r.colchao)                            as colchao,
           sum(r.recebido) filter (where not r.conta)                          as colchao_fora,
           sum(r.recebido) filter (where r.emprestada)                         as emprestado_para,
           count(distinct r.cobradora) filter (where r.emprestada)             as emprestado_pessoas,
           sum(r.recebido) filter (where r.conta and upper(r.subgrupo_equipe) = 'ATESTADOS|FERIAS') as atestado,
           sum(r.recebido) filter (where r.conta and r.destino_nome is not null and r.cod_destino is null) as sem_destino,
           sum(r.recebido) filter (where r.conta and r.destino_equipe = 'outro_setor')   as saiu_outro,
           sum(r.recebido) filter (where r.conta and r.destino_equipe = 'somente_geral') as saiu_geral,
           sum(r.recebido) filter (where r.conta and r.cod_destino is not null
                                     and r.cod_destino <> r.cod_grupo_filtro
                                     and lower(r.tipo) <> 'extra')             as p_outros_integral,
           sum(r.recebido) filter (where r.conta and r.cod_destino is not null
                                     and r.cod_destino <> r.cod_grupo_filtro
                                     and lower(r.tipo) =  'extra')             as p_outros_extra,
           count(distinct r.subgrupo_equipe) filter (where r.conta and fn_mestre_e_equipe(r.subgrupo_equipe)) as equipes,
           count(distinct r.cobradora) filter (where r.conta)                  as cobradoras,
           count(distinct r.dt_pgto)   filter (where r.conta)                  as dias
      from marcada r
     group by r.cod_grupo_filtro
  ),
  contribuida as (
    select r.cod_destino as cod,
           sum(r.recebido) filter (where lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where lower(r.tipo) =  'extra') as extra
      from marcada r
     where r.conta and r.cod_destino is not null and r.cod_destino <> r.cod_grupo_filtro
     group by r.cod_destino
  ),
  chaves as (
    select cod from propria
    union select cod from contribuida
    union select g.cod_grupo_filtro from mestre_grupos g where g.empresa_id = p_empresa_id
  ),
  rotulo as (
    select f.cod_grupo_filtro as cod,
           (array_agg(f.nome_grupo_filtro order by f.id))[1] as nome
      from fatia f group by f.cod_grupo_filtro
  )
  select
    k.cod,
    coalesce(ro.nome, ''),
    coalesce(g.nome_grupo_filtro, ''),
    g.setor_id,
    s.nome,
    coalesce(g.estado, 'novo'),
    coalesce(p.linhas, 0),
    coalesce(p.valor, 0),
    coalesce(p.integral, 0),
    coalesce(p.extra, 0),
    coalesce(c.integral, 0),
    coalesce(c.extra, 0),
    coalesce(p.saiu_outro, 0),
    coalesce(p.saiu_geral, 0),
    coalesce(p.emprestado_para, 0),
    coalesce(p.emprestado_pessoas, 0),
    coalesce(p.valor, 0) + coalesce(c.integral, 0)
      - coalesce(p.saiu_outro, 0) - coalesce(p.saiu_geral, 0)
      - coalesce(p.emprestado_para, 0),
    coalesce(p.p_outros_integral, 0),
    coalesce(p.p_outros_extra, 0),
    coalesce(p.sem_destino, 0),
    coalesce(p.colchao, 0),
    coalesce(p.colchao_fora, 0),
    coalesce(p.atestado, 0),
    coalesce(p.equipes, 0),
    coalesce(p.cobradoras, 0),
    coalesce(p.dias, 0),
    g.primeira_aparicao,
    g.ultima_aparicao
  from chaves k
  left join propria     p  on p.cod  = k.cod
  left join contribuida c  on c.cod  = k.cod
  left join rotulo      ro on ro.cod = k.cod
  left join mestre_grupos g on g.empresa_id = p_empresa_id and g.cod_grupo_filtro = k.cod
  left join setores     s  on s.id = g.setor_id
  where fn_user_is_super_admin()
  order by (coalesce(p.valor, 0) + coalesce(c.integral, 0)
            - coalesce(p.saiu_outro, 0) - coalesce(p.saiu_geral, 0)
            - coalesce(p.emprestado_para, 0)) desc, k.cod;
$function$;

-- ============================================================================
-- 7. fn_analitico_remocoes_guardadas
-- ============================================================================

create or replace function public.fn_analitico_remocoes_guardadas(
  p_empresa_id uuid,
  p_mes        text default null
)
returns table(
  lote_id       uuid,
  setor_id      uuid,
  mes           text,
  linhas        bigint,
  valor         numeric,
  removido_em   timestamptz,
  restaurado_em timestamptz,
  pode_desfazer boolean
)
returns null on null input
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '20s'
set work_mem to '32MB'
as $function$
  select r.lote_id,
         (array_agg(distinct r.setor_id) filter (where r.setor_id is not null))[1],
         to_char(min(r.mes_referencia), 'YYYY-MM'),
         count(*)::bigint,
         round(sum(r.valor_recebido), 2),
         min(r.removido_em),
         max(r.restaurado_em),
         bool_or(r.restaurado_em is null)
    from analitico_removidos r
   where r.empresa_id = p_empresa_id
     and (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
     -- O mês como intervalo, para o índice `analitico_removidos_empresa_mes`
     -- servir. `to_char(...) = p_mes` lia a empresa inteira. Texto fora de
     -- 'yyyy-MM' não casa com nada, como antes: o `case` devolve nulo.
     and r.mes_referencia >= case when p_mes ~ '^\d{4}-\d{2}$'
                                  then (p_mes || '-01')::date end
     and r.mes_referencia <  case when p_mes ~ '^\d{4}-\d{2}$'
                                  then ((p_mes || '-01')::date + interval '1 month')::date end
   group by r.lote_id
   order by min(r.removido_em) desc;
$function$;

-- ============================================================================
-- 8. Índice do histórico de importações
-- ============================================================================

create index if not exists idx_logs_importacao_analitico
  on public.logs_sistema (empresa_id, criado_em desc)
  where alvo_tipo = 'importacao_analitico';

comment on index public.idx_logs_importacao_analitico is
  'fn_importacoes_historico: as importacoes do 58 sem varrer os logs da empresa (20260917160000).';

-- ============================================================================
-- 9. Teto de tempo nas funções das abas que não tinham
-- ============================================================================

alter function public.fn_mestre_diretoria_setores(uuid, text, integer)            set statement_timeout = '20s';
alter function public.fn_mestre_operadores_do_mes(uuid, text, integer)            set statement_timeout = '20s';
alter function public.fn_mestre_equipes_sugeridas(uuid, text, numeric)            set statement_timeout = '20s';
alter function public.fn_mestre_divergencias(uuid, text, uuid, text, text, integer) set statement_timeout = '20s';
alter function public.fn_mestre_divergencias_resumo(uuid, text)                   set statement_timeout = '20s';
alter function public.fn_importacoes_historico(uuid, text, text, integer)         set statement_timeout = '20s';
alter function public.fn_mestre_fontes_dos_setores(uuid, text)                    set statement_timeout = '30s';
alter function public.fn_mestre_comparar_setores(uuid, text)                      set statement_timeout = '30s';

commit;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
--   select p.oid::regprocedure, p.proconfig from pg_proc p
--    where p.proname in ('fn_mestre_conta_na_meta', 'fn_mestre_e_equipe')
--       or p.proname like 'fn_mestre_diretoria%' or p.proname = 'fn_mestre_conferencia';
--   -- os dois ajudantes: proconfig nulo.
--
--   explain analyze
--   select count(*) from public.fn_mestre_diretoria_linhas(
--     (select id from public.empresas where slug = 'bookplay'), '2026-09', 17);
--   -- antes: 1.192 ms, com disco temporário.
