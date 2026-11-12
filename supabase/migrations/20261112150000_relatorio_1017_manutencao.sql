-- =============================================================================
-- Relatório do setor: o 1017 soma no recebimento GERAL da Manutenção
-- =============================================================================
--
-- ## Pedido (Cleber, 12/11/2026)
--
-- Alguns setores têm relatório do ERP que só eles usam. O primeiro é o 1017 da
-- Manutenção — o setor que cuida do colchão: as parcelas da 2ª em diante de
-- Pix automático e cartão recorrente. O valor do 1017 soma no recebimento do
-- SETOR, e só nele: não conta para operador, nem para equipe, nem para o total
-- da empresa («só no setor por enquanto»). Importa o líder do setor ou o super
-- admin, e mais ninguém.
--
-- ## Medido antes (01–12/11/2026, BookPlay)
--
--   1017                         3.239 linhas   R$ 619.861,88
--   └ já no 59 como colchão        487          R$  92.750,30   (geral, setor nenhum)
--   └ fora do 59                 2.752          R$ 527.111,58
--   linha do 1017 que o 59 já conta para algum setor: nenhuma
--
--   Manutenção: meta R$ 1.700.000; recebido R$ 137.880,07 (22% projetado).
--   Com o 1017, ~R$ 757,7 mil — os ~114% que o líder calculou.
--
-- ## O desenho
--
-- 1. O 1017 NÃO entra em `analitico_recebimentos`. Ali toda linha sem operador
--    é órfã, toda soma de empresa a contaria, e a sincronização do 59 tem
--    regra para cada procedência. Ele mora em tabela própria
--    (`relatorio_setor_linhas`) e nenhuma das ~60 funções que leem o analítico
--    precisa saber dele.
-- 2. Ele chega às telas pela leitura única do dinheiro de setor sem pessoa,
--    `fn_ajustes_recebimento` — o mesmo caminho do ajuste lançado para o setor
--    (20261026170000): Painel Líder, Analítico, Dashboard, TV, app e
--    `fn_recebido_por_setor` já o somam no setor e em ninguém.
-- 3. `fn_ajustes_recebimento` ganha a coluna `origem` ('ajuste' ou
--    'relatorio_1017'). Quem monta total de EMPRESA filtra por ela: a view do
--    Painel Diretoria (abaixo) e o escopo «empresa» do front.
-- 4. Fora do desafio do dia: o desafio mede o esforço do dia, e a recorrência
--    cai sozinha (remendo em `fn_desafio_diario`). Com janela de chegada
--    (`p_de`/`p_ate`) o 1017 também fica de fora: ele não tem hora de chegada.
-- 5. Qual setor usa qual relatório é cadastro (`setor_relatorios`), não nome de
--    setor no código. Desligar (`ativo = false`) tira o 1017 de todas as telas
--    sem apagar nada.
-- 6. Escrita só pela RPC `fn_relatorio_setor_importar` — as tabelas não têm
--    policy de escrita. Cada importação TROCA o mês do setor inteiro e deixa o
--    lote no histórico.
-- 7. Trava contra contar duas vezes: linha do 1017 que o lote vigente do 59 já
--    conta para setor (mesmo NR, mesmo dia, sem colchão) fica fora e é
--    informada na resposta. Hoje são zero.
--
-- A troca de colunas de `fn_ajustes_recebimento` exige DROP: a única
-- dependente registrada é a view `private.mestre_recebimentos_com_ajuste`,
-- recriada aqui igual, só com o filtro de origem. As funções que chamam a
-- leitura (plpgsql/sql) selecionam colunas por nome e continuam valendo.
-- =============================================================================

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

-- ── 1. Quem usa qual relatório ────────────────────────────────────────────────

create table if not exists public.setor_relatorios (
  setor_id      uuid not null references public.setores(id),
  relatorio     text not null,
  empresa_id    uuid not null references public.empresas(id),
  ativo         boolean not null default true,
  criado_por_id uuid references public.perfis(id) on delete set null,
  criado_em     timestamptz not null default now(),
  primary key (setor_id, relatorio),
  constraint setor_relatorios_relatorio_valido check (relatorio in ('1017'))
);

comment on table public.setor_relatorios is
  'Relatório do ERP que só um setor usa e que soma no recebimento GERAL dele (nunca em operador, '
  'equipe ou empresa). ativo = false tira o valor de todas as telas sem apagar as linhas (20261112150000).';

alter table public.setor_relatorios enable row level security;

drop policy if exists setor_relatorios_select on public.setor_relatorios;
create policy setor_relatorios_select on public.setor_relatorios
  for select to authenticated
  using ((select public.fn_user_is_super_admin()) or public.fn_can_access_empresa(empresa_id));

drop policy if exists setor_relatorios_super_admin on public.setor_relatorios;
create policy setor_relatorios_super_admin on public.setor_relatorios
  for all to authenticated
  using ((select public.fn_user_is_super_admin()))
  with check ((select public.fn_user_is_super_admin()));

revoke all on public.setor_relatorios from anon;
grant select, insert, update, delete on public.setor_relatorios to authenticated;

-- ── 2. Cada importação ────────────────────────────────────────────────────────

create table if not exists public.relatorio_setor_lotes (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id),
  setor_id          uuid not null,
  relatorio         text not null,
  mes_referencia    date not null,
  arquivo_nome      text,
  linhas            integer not null,
  valor_total       numeric(14,2) not null,
  -- O que ficou de fora porque o 59 já conta para setor (mesmo NR e dia).
  ignoradas_59      integer not null default 0,
  valor_ignorado_59 numeric(14,2) not null default 0,
  -- O que o lote anterior tinha, para a tela dizer quanto mudou.
  valor_anterior    numeric(14,2) not null default 0,
  primeiro_pagamento date,
  ultimo_pagamento   date,
  importado_por_id  uuid references public.perfis(id) on delete set null,
  importado_em      timestamptz not null default now(),
  foreign key (setor_id, relatorio) references public.setor_relatorios (setor_id, relatorio),
  constraint relatorio_setor_lotes_mes_dia_1 check (extract(day from mes_referencia) = 1)
);

create index if not exists relatorio_setor_lotes_ultimo
  on public.relatorio_setor_lotes (setor_id, relatorio, mes_referencia, importado_em desc);

comment on table public.relatorio_setor_lotes is
  'Histórico das importações de relatório do setor. As linhas vivas são só as do último lote do mês.';

-- ── 3. As linhas ──────────────────────────────────────────────────────────────

create table if not exists public.relatorio_setor_linhas (
  id              bigint generated always as identity primary key,
  lote_id         uuid not null references public.relatorio_setor_lotes(id) on delete cascade,
  empresa_id      uuid not null references public.empresas(id),
  setor_id        uuid not null,
  relatorio       text not null,
  mes_referencia  date not null,
  nr_documento    text not null,
  cod_cliente     text,
  franquia        text,
  tipo            text,
  status          text,
  parcela         integer,
  data_vencimento date,
  data_pagamento  date not null,
  valor           numeric(12,2) not null,
  foreign key (setor_id, relatorio) references public.setor_relatorios (setor_id, relatorio),
  constraint relatorio_setor_linhas_no_mes check (
    data_pagamento >= mes_referencia
    and data_pagamento < (mes_referencia + interval '1 month')::date)
);

create unique index if not exists ux_relatorio_setor_linha
  on public.relatorio_setor_linhas (setor_id, relatorio, nr_documento, data_pagamento, coalesce(parcela, 0));

-- A leitura de `fn_ajustes_recebimento`: empresa + intervalo de dias.
create index if not exists relatorio_setor_linhas_empresa_dia
  on public.relatorio_setor_linhas (empresa_id, data_pagamento);

comment on table public.relatorio_setor_linhas is
  'Linhas do relatório do setor (o 1017 da Manutenção). Somam só no recebimento geral do setor, '
  'por fn_ajustes_recebimento (origem relatorio_<n>). Escrita só por fn_relatorio_setor_importar.';

-- Leitura: quem enxerga o setor inteiro no Analítico, ou é do próprio setor.
-- Sem policy de escrita: só a RPC grava.
alter table public.relatorio_setor_lotes  enable row level security;
alter table public.relatorio_setor_linhas enable row level security;

drop policy if exists relatorio_setor_lotes_select on public.relatorio_setor_lotes;
create policy relatorio_setor_lotes_select on public.relatorio_setor_lotes
  for select to authenticated
  using ((select public.fn_user_is_super_admin())
         or (public.fn_can_access_empresa(empresa_id)
             and ((select public.fn_user_escopo('analitico')) >= 2
                  or setor_id = (select public.fn_user_setor_id()))));

drop policy if exists relatorio_setor_linhas_select on public.relatorio_setor_linhas;
create policy relatorio_setor_linhas_select on public.relatorio_setor_linhas
  for select to authenticated
  using ((select public.fn_user_is_super_admin())
         or (public.fn_can_access_empresa(empresa_id)
             and ((select public.fn_user_escopo('analitico')) >= 2
                  or setor_id = (select public.fn_user_setor_id()))));

revoke all on public.relatorio_setor_lotes  from anon, authenticated;
revoke all on public.relatorio_setor_linhas from anon, authenticated;
grant select on public.relatorio_setor_lotes  to authenticated;
grant select on public.relatorio_setor_linhas to authenticated;

-- As telas releem o dinheiro de setor quando chega o sinal «ajustes» (o mesmo
-- do ajuste de recebimento). Um sinal por importação: no lote, não na linha.
drop trigger if exists trg_realtime_sinal_ins on public.relatorio_setor_lotes;
create trigger trg_realtime_sinal_ins
  after insert on public.relatorio_setor_lotes
  referencing new table as novas
  for each statement execute function public.fn_realtime_sinal_mudou('ajustes');

-- ── 4. A importação ───────────────────────────────────────────────────────────
--
-- p_linhas: [{nr, cod_cliente, franquia, tipo, status, parcela, vencimento,
--             pagamento ('yyyy-MM-dd'), valor}] — já sem o rodapé de total.

create or replace function public.fn_relatorio_setor_importar(
  p_setor_id  uuid,
  p_relatorio text,
  p_mes       text,
  p_arquivo   text,
  p_linhas    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid        uuid := auth.uid();
  v_mes        date;
  v_empresa    uuid;
  v_lote       uuid;
  v_n          integer;
  v_total      numeric;
  v_ign        integer;
  v_ign_valor  numeric;
  v_anterior   numeric;
  v_removidas  integer;
  v_primeiro   date;
  v_ultimo     date;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_mes is null or p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'Mês inválido: % (esperado yyyy-MM).', p_mes;
  end if;
  v_mes := (p_mes || '-01')::date;
  if v_mes > date_trunc('month', now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O mês % ainda não começou.', p_mes;
  end if;

  select sr.empresa_id into v_empresa
    from setor_relatorios sr
    join setores s on s.id = sr.setor_id
   where sr.setor_id = p_setor_id and sr.relatorio = p_relatorio and sr.ativo
     and s.excluido_em is null;
  if v_empresa is null then
    raise exception 'RELATORIO_NAO_HABILITADO: o setor não usa o relatório %.', p_relatorio
      using errcode = '42501';
  end if;

  -- Líder do PRÓPRIO setor ou super admin. Nenhuma permissão de cargo abre isto.
  if not (fn_user_is_super_admin()
          or (fn_user_perfil() = 'lider' and fn_user_setor_id() = p_setor_id)) then
    raise exception 'SEM_PERMISSAO: só o líder do setor ou o super admin importa o relatório %.', p_relatorio
      using errcode = '42501';
  end if;

  perform fn_mes_fechado_barrar(p_mes, 'Relatório ' || p_relatorio);

  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'ARQUIVO_VAZIO: nenhuma linha para importar.';
  end if;
  if jsonb_array_length(p_linhas) > 50000 then
    raise exception 'ARQUIVO_GRANDE: % linhas; o limite é 50.000.', jsonb_array_length(p_linhas);
  end if;

  drop table if exists _rel_setor;
  create temp table _rel_setor on commit drop as
    select nullif(btrim(x.nr), '')              as nr,
           nullif(btrim(x.cod_cliente), '')     as cod_cliente,
           nullif(btrim(x.franquia), '')        as franquia,
           nullif(btrim(x.tipo), '')            as tipo,
           nullif(btrim(x.status), '')          as status,
           x.parcela,
           x.vencimento,
           x.pagamento,
           round(x.valor, 2)                    as valor,
           false                                as no_59
      from jsonb_to_recordset(p_linhas) as x(
             nr text, cod_cliente text, franquia text, tipo text, status text,
             parcela integer, vencimento date, pagamento date, valor numeric);

  if exists (select 1 from _rel_setor where nr is null or pagamento is null or valor is null) then
    raise exception 'LINHA_INCOMPLETA: há linha sem Nr. Documento, Dt. Pagamento ou Valor.';
  end if;
  if exists (select 1 from _rel_setor
              where pagamento < v_mes or pagamento >= (v_mes + interval '1 month')::date) then
    raise exception 'FORA_DO_MES: há pagamento fora de %. Exporte o relatório só do mês.', p_mes;
  end if;
  if exists (select 1 from _rel_setor
              group by nr, pagamento, coalesce(parcela, 0) having count(*) > 1) then
    raise exception 'LINHA_REPETIDA: o mesmo Nr. Documento aparece duas vezes no mesmo dia e parcela.';
  end if;

  -- O que o 59 vigente já conta para setor fica de fora (contaria duas vezes).
  update _rel_setor t
     set no_59 = true
   where exists (
     select 1
       from mestre_recebimentos r
       join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      where r.empresa_id = v_empresa
        and r.mes = v_mes
        and r.dt_pgto = t.pagamento
        and r.nr_documento = t.nr
        and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto));

  select count(*) filter (where no_59), coalesce(sum(valor) filter (where no_59), 0),
         count(*) filter (where not no_59), coalesce(sum(valor) filter (where not no_59), 0),
         min(pagamento) filter (where not no_59), max(pagamento) filter (where not no_59)
    into v_ign, v_ign_valor, v_n, v_total, v_primeiro, v_ultimo
    from _rel_setor;

  select coalesce(sum(valor), 0) into v_anterior
    from relatorio_setor_linhas
   where setor_id = p_setor_id and relatorio = p_relatorio and mes_referencia = v_mes;

  -- O arquivo é o retrato do mês: o anterior sai inteiro.
  delete from relatorio_setor_linhas
   where setor_id = p_setor_id and relatorio = p_relatorio and mes_referencia = v_mes;
  get diagnostics v_removidas = row_count;

  insert into relatorio_setor_lotes (
    empresa_id, setor_id, relatorio, mes_referencia, arquivo_nome, linhas, valor_total,
    ignoradas_59, valor_ignorado_59, valor_anterior, primeiro_pagamento, ultimo_pagamento,
    importado_por_id)
  values (v_empresa, p_setor_id, p_relatorio, v_mes, left(p_arquivo, 200), v_n, v_total,
          v_ign, v_ign_valor, v_anterior, v_primeiro, v_ultimo, v_uid)
  returning id into v_lote;

  insert into relatorio_setor_linhas (
    lote_id, empresa_id, setor_id, relatorio, mes_referencia, nr_documento, cod_cliente,
    franquia, tipo, status, parcela, data_vencimento, data_pagamento, valor)
  select v_lote, v_empresa, p_setor_id, p_relatorio, v_mes, t.nr, t.cod_cliente,
         t.franquia, t.tipo, t.status, t.parcela, t.vencimento, t.pagamento, t.valor
    from _rel_setor t
   where not t.no_59;

  return jsonb_build_object(
    'lote_id',           v_lote,
    'linhas',            v_n,
    'valor',             round(v_total, 2),
    'ignoradas_59',      v_ign,
    'valor_ignorado_59', round(v_ign_valor, 2),
    'valor_anterior',    round(v_anterior, 2),
    'removidas',         v_removidas,
    'primeiro_pagamento', v_primeiro,
    'ultimo_pagamento',  v_ultimo);
end;
$function$;

comment on function public.fn_relatorio_setor_importar(uuid, text, text, text, jsonb) is
  'Troca o mês do setor pelo arquivo do relatório do setor (o 1017 da Manutenção). Só líder do '
  'próprio setor ou super admin; mês fechado segue fn_mes_fechado_barrar. Linha que o 59 vigente '
  'já conta para setor (mesmo NR e dia, sem colchão) fica fora (20261112150000).';

revoke all on function public.fn_relatorio_setor_importar(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.fn_relatorio_setor_importar(uuid, text, text, text, jsonb) to authenticated;

-- ── 5. A leitura única ganha o relatório do setor e a coluna `origem` ────────

drop view if exists private.mestre_recebimentos_com_ajuste;
drop function if exists public.fn_ajustes_recebimento(uuid[], date, date, timestamptz, timestamptz);

create function public.fn_ajustes_recebimento(
  p_empresas uuid[], p_ini date, p_fim date,
  p_de timestamptz default null, p_ate timestamptz default null)
returns table(empresa_id uuid, alvo text, operador_id uuid, equipe_id uuid, setor_id uuid,
              dia date, valor numeric, valor_ho numeric, origem text)
language sql stable set search_path = public as $$
  WITH aj AS (
    SELECT a.id, a.empresa_id, a.alvo, a.operador_id, a.equipe_id,
           -- Setor carimbado no lançamento; o da equipe ou o da pessoa de reserva.
           COALESCE(a.setor_id, eq.setor_id, pf.setor_id) AS setor_id,
           a.valor, a.cancelado,
           a.mes_referencia AS m_ini,
           (a.mes_referencia + INTERVAL '1 month' - INTERVAL '1 day')::date AS m_fim
      FROM public.analitico_ajustes_manuais a
      LEFT JOIN public.equipes eq ON eq.id = a.equipe_id
      LEFT JOIN public.perfis  pf ON pf.id = a.operador_id
     WHERE a.empresa_id = ANY (p_empresas)
       AND a.mes_referencia <= p_fim
       AND a.mes_referencia + INTERVAL '1 month' > p_ini
       AND COALESCE(pf.perfil, '') <> 'super_admin'
  ),
  -- Cada alteração do card no dia em que foi feita, preso ao mês de competência.
  ev AS (
    SELECT e.ajuste_id,
           LEAST(GREATEST((e.criado_em AT TIME ZONE 'America/Sao_Paulo')::date, aj.m_ini), aj.m_fim) AS dia,
           e.criado_em, e.delta
      FROM public.analitico_ajustes_eventos e
      JOIN aj ON aj.id = e.ajuste_id
  ),
  -- O que os eventos não explicam (card anterior ao histórico) fica no dia 1.
  residuo AS (
    SELECT aj.id AS ajuste_id, aj.m_ini AS dia, NULL::timestamptz AS criado_em,
           (CASE WHEN aj.cancelado THEN 0 ELSE aj.valor END)
             - COALESCE((SELECT SUM(ev.delta) FROM ev WHERE ev.ajuste_id = aj.id), 0) AS delta
      FROM aj
  ),
  partes AS (
    SELECT * FROM ev
    UNION ALL
    SELECT * FROM residuo WHERE delta <> 0
  )
  SELECT aj.empresa_id, aj.alvo, aj.operador_id, aj.equipe_id, aj.setor_id, p.dia,
         SUM(p.delta)::numeric,
         -- H.O. pela regra do setor (Cofen), não pela marca.
         ROUND(SUM(p.delta) * CASE WHEN st.regra = 'cofen' THEN public.fn_pp_ho_percentual() ELSE 0 END, 2)::numeric,
         'ajuste'::text
    FROM partes p
    JOIN aj ON aj.id = p.ajuste_id
    LEFT JOIN public.setores st ON st.id = aj.setor_id
   WHERE p.dia BETWEEN p_ini AND p_fim
     -- Janela de chegada (desafio com horário): só o que foi lançado nela.
     AND (p_de  IS NULL OR (p.criado_em IS NOT NULL AND p.criado_em >= p_de))
     AND (p_ate IS NULL OR (p.criado_em IS NOT NULL AND p.criado_em <  p_ate))
   GROUP BY aj.empresa_id, aj.alvo, aj.operador_id, aj.equipe_id, aj.setor_id, p.dia, st.regra
  HAVING SUM(p.delta) <> 0

  UNION ALL

  -- O relatório do setor (20261112150000): dinheiro do SETOR, no dia do
  -- pagamento, sem H.O. Só com o cadastro ativo; sem janela de chegada (não
  -- tem hora de chegada — fica fora de quem pergunta por ela).
  SELECT l.empresa_id, 'setor'::text, NULL::uuid, NULL::uuid, l.setor_id, l.data_pagamento,
         SUM(l.valor)::numeric, 0::numeric, 'relatorio_' || l.relatorio
    FROM public.relatorio_setor_linhas l
    JOIN public.setor_relatorios sr
      ON sr.setor_id = l.setor_id AND sr.relatorio = l.relatorio AND sr.ativo
   WHERE l.empresa_id = ANY (p_empresas)
     AND l.data_pagamento BETWEEN p_ini AND p_fim
     AND p_de  IS NULL
     AND p_ate IS NULL
   GROUP BY l.empresa_id, l.setor_id, l.data_pagamento, l.relatorio
  HAVING SUM(l.valor) <> 0;
$$;

comment on function public.fn_ajustes_recebimento(uuid[], date, date, timestamptz, timestamptz) is
  'Dinheiro fora do relatório do 58/59, por dia: o ajuste de recebimento (origem ajuste; pessoa, '
  'equipe ou setor) e o relatório do setor (origem relatorio_<n>; só setor, nunca empresa). '
  'Invocadora: a RLS das tabelas recorta (20261026170000, 20261112150000).';

revoke all on function public.fn_ajustes_recebimento(uuid[], date, date, timestamptz, timestamptz) from public, anon;
grant execute on function public.fn_ajustes_recebimento(uuid[], date, date, timestamptz, timestamptz) to authenticated, service_role;

-- A view do Painel Diretoria, igual à de 20261026170000, só com o ajuste: o
-- relatório do setor não entra no total da empresa (e por ora nem no setor
-- de lá — o Painel Diretoria segue o 59).
create view private.mestre_recebimentos_com_ajuste as
select r.id, r.lote_id, r.empresa_id, r.mes, r.setor, r.cod_grupo_filtro, r.nome_grupo_filtro, r.cod_grupo,
       r.cod_grupo_representa, r.setor_orig, r.cobradora, r.operador_orig, r.subgrupo_equipe, r.cliente, r.cod_cli,
       r.titulo, r.nr_documento, r.parcela, r.empresa_erp, r.tipo_venda, r.tp_doc, r.colchao, r.tipo, r.dt_lig,
       r.prev_pgto, r.dt_pgto, r.dias, r.dias_atraso, r.dias_ligacao_baixa, r.recebido, r.linha_num,
       r.operador_id, r.operador_setor_id
  from public.mestre_recebimentos r
union all
select -1 - (hashtextextended(l.id::text || x.alvo || coalesce(x.operador_id, x.equipe_id, x.setor_id)::text || x.dia::text, 0)
             & 9223372036854775807),
       l.id, l.empresa_id, l.mes, '', c.cod, c.nome, '', null, null,
       coalesce(pf.usuario, ''), null, coalesce(c.subgrupo, ''), 'AJUSTE DE RECEBIMENTO', '', '', '', '', '', null,
       'AJUSTE MANUAL', false, '', null, null, x.dia, null, null, null, x.valor, 0,
       x.operador_id, x.setor_id
  from public.mestre_lotes l
 cross join lateral public.fn_ajustes_recebimento(
         array[l.empresa_id], l.mes, (l.mes + interval '1 month' - interval '1 day')::date) x
  left join public.perfis pf on pf.id = x.operador_id
 cross join lateral (
   select coalesce(g.cod_grupo_filtro, 'AJUSTE') as cod,
          coalesce(g.nome_grupo_filtro, 'AJUSTE DE RECEBIMENTO') as nome,
          me.nome_subgrupo as subgrupo
     from (select 1) um
     left join lateral (
       select g.cod_grupo_filtro, g.nome_grupo_filtro
         from public.mestre_grupos g
        where g.empresa_id = l.empresa_id and g.estado = 'vinculado' and g.setor_id = x.setor_id
        order by exists (select 1 from public.mestre_equipes e2
                          where e2.empresa_id = g.empresa_id and e2.cod_grupo_filtro = g.cod_grupo_filtro
                            and e2.equipe_id = x.equipe_id) desc,
                 g.cod_grupo_filtro
        limit 1) g on true
     left join lateral (
       select e.nome_subgrupo
         from public.mestre_equipes e
        where e.empresa_id = l.empresa_id and e.cod_grupo_filtro = g.cod_grupo_filtro
          and e.equipe_id = x.equipe_id
        order by e.ultima_aparicao desc nulls last
        limit 1) me on true
 ) c
 where l.estado = 'vigente'
   and x.origem = 'ajuste';

revoke all on private.mestre_recebimentos_com_ajuste from public, anon, authenticated;

-- ── 6. Fora do desafio do dia ─────────────────────────────────────────────────
--
-- Remendo na definição VIVA, com a contagem conferida (12/11/2026: 1). Se o
-- texto mudou, a migration inteira falha e nada é aplicado.

create function pg_temp.remendar(p_fn regprocedure, p_re text, p_por text, p_vezes integer)
returns void language plpgsql as $$
declare d text; n integer;
begin
  d := pg_get_functiondef(p_fn);
  select count(*) into n from regexp_matches(d, p_re, 'g');
  if n <> p_vezes then
    raise exception 'Remendo em %: esperava % ocorrência(s) de «%», achou %. Nada foi aplicado.',
      p_fn, p_vezes, left(p_re, 80), n;
  end if;
  execute regexp_replace(d, p_re, p_por, 'g');
end;
$$;

select pg_temp.remendar('public.fn_desafio_diario(uuid)'::regprocedure,
  '(WHERE x\.alvo <> ''operador'')(\s+AND \(\(v_publico = ''setor'')',
  '\1 AND x.origem = ''ajuste''\2', 1);

-- ── 7. A Manutenção usa o 1017 ────────────────────────────────────────────────

insert into public.setor_relatorios (setor_id, relatorio, empresa_id)
select s.id, '1017', s.empresa_id
  from public.setores s
 where s.id = '2b9ad301-cc59-4d9c-9694-24320a865976'
on conflict (setor_id, relatorio) do nothing;

-- ── Prova ─────────────────────────────────────────────────────────────────────

do $prova$
begin
  if not exists (select 1 from public.setor_relatorios
                  where setor_id = '2b9ad301-cc59-4d9c-9694-24320a865976' and relatorio = '1017') then
    raise exception 'A Manutenção (2b9ad301) não ficou cadastrada no 1017.';
  end if;
  if pg_get_functiondef('public.fn_desafio_diario(uuid)'::regprocedure) !~ 'x\.origem = ''ajuste''' then
    raise exception 'O desafio do dia não recebeu o filtro de origem.';
  end if;
  -- A view continua com as mesmas 33 colunas que as funções do Painel Diretoria leem.
  if (select count(*) from information_schema.columns
       where table_schema = 'private' and table_name = 'mestre_recebimentos_com_ajuste') <> 33 then
    raise exception 'A view do Painel Diretoria mudou de colunas.';
  end if;
end;
$prova$;

notify pgrst, 'reload schema';

commit;
