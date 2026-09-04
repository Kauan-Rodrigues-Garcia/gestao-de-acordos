-- ============================================================================
-- O dinheiro segue a PESSOA, não a carteira -- e o vínculo congela no lote
--
-- `NomeGrupoFiltro` é a CARTEIRA, não a equipe de quem cobrou. Um operador do
-- Play 5 que trabalha a carteira do Play Mix aparece sob `MARILIA PLAY MIX`, e
-- é assim que o 58 do Play Mix o traz. Só que o recebimento é do Play 5.
--
-- Hoje o sistema resolve isso à mão, em `analitico_ajustes_manuais`. Agosto/2026
-- prova o custo: a Brenda lançou seis das SETE pessoas do caso Play Mix -> Play 5
-- em 31/08, todas com motivo `playmix`, somando R$ 36.733,36. A sétima, Allana
-- Barbosa (R$ 3.270,34), ficou de fora -- e ninguém tinha como saber, porque
-- nada no sistema lista quem falta.
--
-- ---- O que muda ------------------------------------------------------------
--
-- Cada linha do 59 passa a guardar QUEM cobrou (`operador_id`) e em que setor
-- essa pessoa estava (`operador_setor_id`), resolvidos na promoção do lote e
-- congelados ali.
--
-- Congelados, e não resolvidos na leitura, de propósito: com o cadastro de hoje,
-- mover alguém de setor em outubro faria o número de agosto andar junto. Mês
-- fechado que se reescreve sozinho é exatamente o que `composicao_mes` existe
-- para impedir, e o 59 não vai repetir esse erro. Ver
-- [[lider-cadastro-residuo-e-retrato-fechado]].
--
-- ---- A camada de empréstimo ------------------------------------------------
--
-- Com o operador congelado, a leitura ganha duas direções novas:
--
--   emprestado_para  o grupo cobrou, mas a pessoa é de OUTRO setor. Sai daqui.
--   emprestado_de    outra carteira cobrou, mas a pessoa é DESTE setor. Entra.
--
-- É o mesmo desenho de `contrib_integral` e das equipes movidas: nada some do
-- relatório, o dinheiro muda de onde CONTA. Uma linha já movida pelo destino da
-- equipe não entra no empréstimo -- senão sairia duas vezes.
--
-- Só o empréstimo com destino conhecido conta. Operador sem cadastro (19 pessoas
-- e R$ 340 mil só no receptivo de agosto) fica na carteira: não há para onde
-- mandar, e inventar um destino seria pior que deixar onde está.
--
-- Compatibilidade: duas colunas novas, sem NOT NULL e sem default -- linha
-- antiga fica nula e cai no `coalesce`. O backfill dos lotes vigentes vai em
-- migration separada, porque escreve dado.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ---- As duas colunas congeladas --------------------------------------------
--
-- `on delete set null` nos dois: apagar um perfil ou um setor não pode derrubar
-- a linha do relatório. Mesmo tratamento que `analitico_ajustes_manuais` dá ao
-- setor carimbado dela.

alter table public.mestre_recebimentos
  add column if not exists operador_id       uuid references public.perfis(id)  on delete set null,
  add column if not exists operador_setor_id uuid references public.setores(id) on delete set null;

comment on column public.mestre_recebimentos.operador_id is
  'Perfil casado com `Cobradora` na promocao do lote. Congelado: nao e re-resolvido na leitura.';
comment on column public.mestre_recebimentos.operador_setor_id is
  'Setor que o operador tinha quando o lote foi promovido. E por ele que o recebimento conta, e nao pela carteira.';

-- O agrupamento do empréstimo: "quanto entrou neste setor vindo de fora".
create index if not exists mestre_recebimentos_operador_setor
  on public.mestre_recebimentos (empresa_id, mes, operador_setor_id)
  where operador_setor_id is not null;

-- ---- O congelamento --------------------------------------------------------
--
-- Mesma regra de casamento que `fn_mestre_operadores_da_equipe` já usa para
-- mostrar o vínculo na tela: `Cobradora` contra `perfis.usuario`, em minúsculo.
-- A diferença é que ali ela é calculada e descartada; aqui ela é gravada.
--
-- Idempotente: rodar de novo no mesmo lote reescreve com o cadastro do momento.
-- Serve para consertar um lote promovido antes de alguém corrigir um cadastro,
-- e é a única porta para isso -- a promoção não volta atrás.

create or replace function public.fn_mestre_congelar_operadores(p_lote_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_n integer;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Apenas super_admin pode congelar operadores do relatório mestre.';
  end if;

  update mestre_recebimentos r
     set operador_id       = p.id,
         operador_setor_id = p.setor_id
    from perfis p
   where r.lote_id = p_lote_id
     and r.cobradora <> ''
     and p.empresa_id = r.empresa_id
     and lower(p.usuario) = lower(r.cobradora);
  get diagnostics v_n = row_count;

  return v_n;
end;
$fn$;

comment on function public.fn_mestre_congelar_operadores(uuid) is
  'Grava em cada linha do lote o perfil e o setor do operador NAQUELE momento. Chamada na promocao; idempotente.';

-- ---- A promoção passa a congelar -------------------------------------------
--
-- Só a diferença: uma chamada antes da troca do ponteiro, e a contagem no
-- evento. O resto do corpo é o de 20260904100000, sem alteração.

create or replace function public.fn_mestre_promover_lote(p_lote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_empresa    uuid;
  v_mes        date;
  v_estado     text;
  v_anterior   uuid;
  v_linhas     integer;
  v_total      numeric(14,2);
  v_novos      integer := 0;
  v_sumiram    integer := 0;
  v_voltaram   integer := 0;
  v_eq_novas   integer := 0;
  v_eq_sumiram integer := 0;
  v_congelados integer := 0;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Apenas super_admin pode importar o relatório mestre.';
  end if;

  select empresa_id, mes, estado into v_empresa, v_mes, v_estado
    from mestre_lotes where id = p_lote_id for update;
  if v_empresa is null then
    raise exception 'Lote % não existe.', p_lote_id;
  end if;
  if v_estado <> 'aberto' then
    raise exception 'Lote % está em "%" — só um lote aberto pode ser promovido.', p_lote_id, v_estado;
  end if;

  select count(*), coalesce(sum(recebido), 0) into v_linhas, v_total
    from mestre_recebimentos where lote_id = p_lote_id;
  if v_linhas = 0 then
    raise exception 'Lote % está vazio — promovê-lo apagaria o retrato do mês e não poria nada no lugar.', p_lote_id;
  end if;

  select id into v_anterior
    from mestre_lotes
   where empresa_id = v_empresa and mes = v_mes and estado = 'vigente'
   for update;

  if v_anterior is not null then
    insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
    select v_empresa, p_lote_id, 'grupo_sumiu', a.cod_grupo_filtro,
           max(a.nome_grupo_filtro),
           jsonb_build_object('linhas', count(*), 'recebido', sum(a.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
           auth.uid()
      from mestre_recebimentos a
     where a.lote_id = v_anterior
       and not exists (
             select 1 from mestre_recebimentos n
              where n.lote_id = p_lote_id and n.cod_grupo_filtro = a.cod_grupo_filtro)
     group by a.cod_grupo_filtro;
    get diagnostics v_sumiram = row_count;

    insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
    select v_empresa, p_lote_id, 'equipe_sumiu', a.cod_grupo_filtro, a.subgrupo_equipe,
           jsonb_build_object('linhas', count(*), 'recebido', sum(a.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
           auth.uid()
      from mestre_recebimentos a
     where a.lote_id = v_anterior and a.subgrupo_equipe <> ''
       and not exists (
             select 1 from mestre_recebimentos n
              where n.lote_id = p_lote_id
                and n.cod_grupo_filtro = a.cod_grupo_filtro
                and n.subgrupo_equipe  = a.subgrupo_equipe)
     group by a.cod_grupo_filtro, a.subgrupo_equipe;
    get diagnostics v_eq_sumiram = row_count;
  end if;

  insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
  select v_empresa, p_lote_id, 'grupo_novo', n.cod_grupo_filtro, max(n.nome_grupo_filtro),
         jsonb_build_object('linhas', count(*), 'recebido', sum(n.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
         auth.uid()
    from mestre_recebimentos n
   where n.lote_id = p_lote_id
     and not exists (
           select 1 from mestre_grupos g
            where g.empresa_id = v_empresa and g.cod_grupo_filtro = n.cod_grupo_filtro)
   group by n.cod_grupo_filtro;
  get diagnostics v_novos = row_count;

  if v_anterior is not null then
    insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
    select v_empresa, p_lote_id, 'grupo_voltou', n.cod_grupo_filtro, max(n.nome_grupo_filtro),
           jsonb_build_object('linhas', count(*), 'recebido', sum(n.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
           auth.uid()
      from mestre_recebimentos n
     where n.lote_id = p_lote_id
       and exists (
             select 1 from mestre_grupos g
              where g.empresa_id = v_empresa and g.cod_grupo_filtro = n.cod_grupo_filtro)
       and not exists (
             select 1 from mestre_recebimentos a
              where a.lote_id = v_anterior and a.cod_grupo_filtro = n.cod_grupo_filtro)
     group by n.cod_grupo_filtro;
    get diagnostics v_voltaram = row_count;
  end if;

  insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
  select v_empresa, p_lote_id, 'equipe_nova', n.cod_grupo_filtro, n.subgrupo_equipe,
         jsonb_build_object('linhas', count(*), 'recebido', sum(n.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
         auth.uid()
    from mestre_recebimentos n
   where n.lote_id = p_lote_id and n.subgrupo_equipe <> ''
     and not exists (
           select 1 from mestre_equipes e
            where e.empresa_id = v_empresa
              and e.cod_grupo_filtro = n.cod_grupo_filtro
              and e.nome_subgrupo    = n.subgrupo_equipe)
   group by n.cod_grupo_filtro, n.subgrupo_equipe;
  get diagnostics v_eq_novas = row_count;

  insert into mestre_grupos (
    empresa_id, cod_grupo_filtro, nome_grupo_filtro, primeira_aparicao, ultima_aparicao)
  select v_empresa, n.cod_grupo_filtro,
         (array_agg(n.nome_grupo_filtro order by n.id))[1],
         v_mes, v_mes
    from mestre_recebimentos n
   where n.lote_id = p_lote_id
   group by n.cod_grupo_filtro
  on conflict (empresa_id, cod_grupo_filtro) do update
     set nome_grupo_filtro = excluded.nome_grupo_filtro,
         primeira_aparicao = least(mestre_grupos.primeira_aparicao, excluded.primeira_aparicao),
         ultima_aparicao   = greatest(mestre_grupos.ultima_aparicao, excluded.ultima_aparicao),
         atualizado_em     = now();

  insert into mestre_equipes (
    empresa_id, cod_grupo_filtro, nome_subgrupo, primeira_aparicao, ultima_aparicao)
  select v_empresa, n.cod_grupo_filtro, n.subgrupo_equipe, v_mes, v_mes
    from mestre_recebimentos n
   where n.lote_id = p_lote_id and n.subgrupo_equipe <> ''
   group by n.cod_grupo_filtro, n.subgrupo_equipe
  on conflict (empresa_id, cod_grupo_filtro, nome_subgrupo) do update
     set primeira_aparicao = least(mestre_equipes.primeira_aparicao, excluded.primeira_aparicao),
         ultima_aparicao   = greatest(mestre_equipes.ultima_aparicao, excluded.ultima_aparicao),
         atualizado_em     = now();

  -- ── O congelamento do operador ───────────────────────────────────────────
  -- Antes da troca do ponteiro, e depois do cadastro de rótulos: o retrato só
  -- fica vigente quando já sabe de quem é cada linha.
  v_congelados := fn_mestre_congelar_operadores(p_lote_id);

  if v_anterior is not null then
    update mestre_lotes
       set estado = 'substituido', substituido_em = now(), substituido_por = p_lote_id
     where id = v_anterior;
    delete from mestre_recebimentos where lote_id = v_anterior;
  end if;

  update mestre_lotes
     set estado = 'vigente', promovido_em = now(), linhas = v_linhas, total_recebido = v_total
   where id = p_lote_id;

  insert into mestre_eventos (empresa_id, lote_id, tipo, detalhes, usuario_id)
  values (v_empresa, p_lote_id, 'lote_promovido',
          jsonb_build_object(
            'mes', to_char(v_mes, 'YYYY-MM'),
            'linhas', v_linhas,
            'total_recebido', v_total,
            'substituiu', v_anterior,
            'grupos_novos', v_novos,
            'grupos_sumiram', v_sumiram,
            'grupos_voltaram', v_voltaram,
            'equipes_novas', v_eq_novas,
            'equipes_sumiram', v_eq_sumiram,
            'operadores_congelados', v_congelados),
          auth.uid());

  return jsonb_build_object(
    'lote_id', p_lote_id,
    'mes', to_char(v_mes, 'YYYY-MM'),
    'linhas', v_linhas,
    'total_recebido', v_total,
    'substituiu', v_anterior,
    'grupos_novos', v_novos,
    'grupos_sumiram', v_sumiram,
    'grupos_voltaram', v_voltaram,
    'equipes_novas', v_eq_novas,
    'equipes_sumiram', v_eq_sumiram,
    'operadores_congelados', v_congelados);
end;
$fn$;

comment on function public.fn_mestre_promover_lote(uuid) is
  'Troca o retrato do mes pelo lote aberto, registra o historico e congela o operador de cada linha. Tudo numa transacao.';

-- ---- Resumo por grupo: o que sai por empréstimo -----------------------------

drop function if exists public.fn_mestre_resumo_grupos(uuid, text);

create function public.fn_mestre_resumo_grupos(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  cod_grupo_filtro  text,
  nome_no_relatorio text,
  nome_cadastrado   text,
  setor_id          uuid,
  setor_nome        text,
  estado            text,
  linhas            bigint,
  recebido_proprio  numeric,
  integral_proprio  numeric,
  extra_proprio     numeric,
  contrib_integral  numeric,
  contrib_extra     numeric,
  saiu_outro_setor  numeric,
  saiu_somente_geral numeric,
  -- Cobrado nesta carteira por gente de OUTRO setor. Sai do total daqui e
  -- entra lá — ver `fn_mestre_resumo_setores`.
  emprestado_para   numeric,
  emprestado_pessoas bigint,
  recebido_total    numeric,
  para_outros_integral numeric,
  para_outros_extra    numeric,
  sem_destino       numeric,
  colchao_valor     numeric,
  colchao_fora      numeric,
  atestado_valor    numeric,
  equipes           bigint,
  cobradoras        bigint,
  dias              bigint,
  primeira_aparicao date,
  ultima_aparicao   date
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with ref as (select ((p_mes || '-01')::date) as d),
  fatia as (
    select r.*, fn_mestre_conta_na_meta(r.colchao, r.dt_pgto) as conta
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id and r.mes = (select d from ref)
  ),
  nomes as (
    select distinct f.cod_grupo_filtro, f.nome_grupo_filtro
      from fatia f where f.nome_grupo_filtro <> ''
  ),
  resolvida as (
    select f.*, dn.destino_nome, n.cod_grupo_filtro as cod_destino,
           coalesce(me.destino, 'proprio') as destino_equipe,
           -- A carteira aponta para um setor? Só então faz sentido perguntar se
           -- o operador é de outro.
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
  -- A linha é emprestada quando o operador tem setor congelado, a carteira tem
  -- setor, e os dois são diferentes. `destino_equipe = 'proprio'` porque uma
  -- equipe já movida à mão sai por aquele caminho — sairia duas vezes.
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
$fn$;

comment on function public.fn_mestre_resumo_grupos(uuid, text) is
  'Um grupo do 59 por linha, sem o colchao fora da meta e sem o que foi cobrado aqui por gente de outro setor. So leitura.';

-- ---- Quem entra por empréstimo, por setor -----------------------------------
--
-- Existe separado porque é a única pergunta do modelo que nasce POR SETOR e não
-- por grupo: o dinheiro vem de várias carteiras ao mesmo tempo.

create or replace function public.fn_mestre_emprestimo_do_setor(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  setor_id      uuid,
  valor         numeric,
  pessoas       bigint
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with ref as (select ((p_mes || '-01')::date) as d)
  select r.operador_setor_id, sum(r.recebido), count(distinct r.cobradora)::bigint
    from mestre_recebimentos r
    join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
    join mestre_grupos g
      on g.empresa_id = r.empresa_id and g.cod_grupo_filtro = r.cod_grupo_filtro
     and g.estado = 'vinculado' and g.setor_id is not null
    left join mestre_equipes me
      on me.empresa_id = r.empresa_id
     and me.cod_grupo_filtro = r.cod_grupo_filtro
     and me.nome_subgrupo = r.subgrupo_equipe
   where r.empresa_id = p_empresa_id
     and r.mes = (select d from ref)
     and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
     and r.operador_setor_id is not null
     and r.operador_setor_id <> g.setor_id
     and coalesce(me.destino, 'proprio') = 'proprio'
   group by r.operador_setor_id;
$fn$;

comment on function public.fn_mestre_emprestimo_do_setor(uuid, text) is
  'Quanto cada setor recebeu por gente sua cobrando carteira alheia. O outro lado de emprestado_para.';

-- ---- Quem exatamente foi emprestado ----------------------------------------
--
-- A lista nominal. É o que substitui alguém lembrar de lançar o ajuste: em
-- agosto/2026 a Brenda lançou seis de sete, e a sétima só apareceu porque
-- alguém foi procurar.

create or replace function public.fn_mestre_emprestados(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  cobradora        text,
  operador_id      uuid,
  operador_nome    text,
  de_cod           text,
  de_carteira      text,
  de_setor_id      uuid,
  de_setor         text,
  para_setor_id    uuid,
  para_setor       text,
  linhas           bigint,
  valor            numeric,
  -- Já existe ajuste manual no destino para esta pessoa neste mês?
  ajuste_valor     numeric
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with ref as (select ((p_mes || '-01')::date) as d),
  emp as (
    select r.cobradora, r.operador_id, r.cod_grupo_filtro,
           max(r.nome_grupo_filtro) as carteira,
           g.setor_id as de_setor, r.operador_setor_id as para_setor,
           count(*)::bigint as linhas, sum(r.recebido) as valor
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_grupos g
        on g.empresa_id = r.empresa_id and g.cod_grupo_filtro = r.cod_grupo_filtro
       and g.estado = 'vinculado' and g.setor_id is not null
      left join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and r.operador_setor_id is not null
       and r.operador_setor_id <> g.setor_id
       and coalesce(me.destino, 'proprio') = 'proprio'
     group by r.cobradora, r.operador_id, r.cod_grupo_filtro, g.setor_id, r.operador_setor_id
  ),
  aju as (
    select j.operador_id, j.setor_id, sum(j.valor) as valor
      from analitico_ajustes_manuais j
     where j.empresa_id = p_empresa_id
       and j.mes_referencia = (select d from ref)
       and not j.cancelado
     group by j.operador_id, j.setor_id
  )
  select e.cobradora, e.operador_id, p.nome,
         e.cod_grupo_filtro, e.carteira,
         e.de_setor, sd.nome,
         e.para_setor, sp.nome,
         e.linhas, e.valor,
         a.valor
    from emp e
    left join perfis  p  on p.id  = e.operador_id
    left join setores sd on sd.id = e.de_setor
    left join setores sp on sp.id = e.para_setor
    left join aju a on a.operador_id = e.operador_id and a.setor_id = e.para_setor
   where fn_user_is_super_admin()
   order by e.valor desc;
$fn$;

comment on function public.fn_mestre_emprestados(uuid, text) is
  'Quem cobrou carteira de outro setor, quanto, e se ja existe ajuste manual no destino. A lista que faltava para ninguem esquecer um lancamento.';

-- ---- Resumo por setor ------------------------------------------------------

drop function if exists public.fn_mestre_resumo_setores(uuid, text);

create function public.fn_mestre_resumo_setores(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  setor_id      uuid,
  setor_nome    text,
  dos_grupos    numeric,
  recebido_movido numeric,
  recebido_emprestado numeric,
  total         numeric,
  grupos        bigint
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with ref as (select ((p_mes || '-01')::date) as d),
  g as (
    select x.setor_id, sum(x.recebido_total) as valor, count(*)::bigint as grupos
      from fn_mestre_resumo_grupos(p_empresa_id, p_mes) x
     where x.setor_id is not null and x.estado = 'vinculado'
     group by x.setor_id
  ),
  movido as (
    select me.destino_setor_id as setor_id, sum(r.recebido) as valor
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and me.destino = 'outro_setor'
       and me.destino_setor_id is not null
     group by me.destino_setor_id
  ),
  emp as (
    select e.setor_id, e.valor
      from fn_mestre_emprestimo_do_setor(p_empresa_id, p_mes) e
  )
  select s.id, s.nome,
         coalesce(g.valor, 0),
         coalesce(m.valor, 0),
         coalesce(e.valor, 0),
         coalesce(g.valor, 0) + coalesce(m.valor, 0) + coalesce(e.valor, 0),
         coalesce(g.grupos, 0)
    from setores s
    left join g on g.setor_id = s.id
    left join movido m on m.setor_id = s.id
    left join emp e on e.setor_id = s.id
   where s.empresa_id = p_empresa_id
     and fn_user_is_super_admin()
     and (g.valor is not null or m.valor is not null or e.valor is not null)
   order by 6 desc, s.nome;
$fn$;

comment on function public.fn_mestre_resumo_setores(uuid, text) is
  'Quanto cada setor recebeu de verdade: os grupos ligados a ele, menos o que saiu, mais o que veio -- por equipe movida ou por gente sua cobrando fora.';

-- ---- A comparação ----------------------------------------------------------

drop function if exists public.fn_mestre_comparar_setores(uuid, text);

create function public.fn_mestre_comparar_setores(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  cod_grupo_filtro  text,
  rotulo            text,
  setor_id          uuid,
  setor_nome        text,
  estado            text,
  mestre_total      numeric,
  mestre_proprio    numeric,
  mestre_contribuido numeric,
  mestre_colchao_fora numeric,
  -- Cobrado nesta carteira por gente de fora (saiu) e cobrado fora por gente
  -- daqui (entrou). Já dentro de `mestre_total`.
  mestre_emprestado_para numeric,
  mestre_emprestado_de   numeric,
  mestre_comparavel numeric,
  sistema_total     numeric,
  sistema_linhas    bigint,
  sistema_analitico numeric,
  sistema_ajustes   numeric,
  sistema_contrib_receptivo numeric,
  diferenca         numeric
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with ref as (select ((p_mes || '-01')::date) as d),
  m as (
    select g.cod_grupo_filtro, g.nome_no_relatorio, g.nome_cadastrado,
           g.setor_id, g.setor_nome, g.estado,
           g.recebido_total, g.recebido_proprio, g.contrib_integral,
           g.colchao_fora, g.emprestado_para
      from fn_mestre_resumo_grupos(p_empresa_id, p_mes) g
  ),
  movido as (
    select me.destino_setor_id as setor_id, sum(r.recebido) as valor
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and me.destino = 'outro_setor'
       and me.destino_setor_id is not null
     group by me.destino_setor_id
  ),
  emp as (
    select e.setor_id, e.valor from fn_mestre_emprestimo_do_setor(p_empresa_id, p_mes) e
  ),
  -- O que chega POR SETOR (movido, emprestado) entra na linha de UM grupo desse
  -- setor -- o de maior recebimento. Com dois grupos no mesmo setor, dividir
  -- seria inventar critério; o número honesto do setor vive em
  -- `fn_mestre_resumo_setores`, e aqui a comparação é sempre por grupo.
  principal as (
    select distinct on (m.setor_id) m.setor_id, m.cod_grupo_filtro
      from m where m.setor_id is not null and m.estado = 'vinculado'
     order by m.setor_id, m.recebido_total desc, m.cod_grupo_filtro
  ),
  sis as (
    select a.setor_id,
           sum(a.valor_recebido) as total,
           count(*)::bigint      as linhas
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.data_pagamento >= (select d from ref)
       and a.data_pagamento <  ((select d from ref) + interval '1 month')
       and a.setor_id is not null
     group by a.setor_id
  ),
  aju as (
    select j.setor_id, sum(j.valor) as valor
      from analitico_ajustes_manuais j
     where j.empresa_id = p_empresa_id
       and j.mes_referencia = (select d from ref)
       and not j.cancelado
       and j.setor_id is not null
     group by j.setor_id
  ),
  crec as (
    select c.setor_id, sum(c.acumulado) as valor
      from contribuicao_receptivo c
     where c.empresa_id = p_empresa_id and c.mes = p_mes
     group by c.setor_id
  ),
  base as (
    select m.*,
           case when pr.cod_grupo_filtro = m.cod_grupo_filtro
                then coalesce(mv.valor, 0) + coalesce(ep.valor, 0) else 0 end as chegou,
           coalesce(ep.valor, 0) as emprestado_de,
           coalesce(s.total, 0)  as sis_analitico,
           coalesce(s.linhas, 0) as sis_linhas,
           coalesce(a.valor, 0)  as sis_ajustes,
           coalesce(cr.valor, 0) as sis_contrib
      from m
      left join sis s        on s.setor_id  = m.setor_id
      left join movido mv    on mv.setor_id = m.setor_id
      left join emp ep       on ep.setor_id = m.setor_id
      left join principal pr on pr.setor_id = m.setor_id
      left join aju a        on a.setor_id  = m.setor_id
      left join crec cr      on cr.setor_id = m.setor_id
  )
  select
    b.cod_grupo_filtro,
    coalesce(nullif(b.nome_no_relatorio, ''), b.nome_cadastrado),
    b.setor_id,
    b.setor_nome,
    b.estado,
    b.recebido_total + b.chegou,
    b.recebido_proprio,
    b.contrib_integral,
    b.colchao_fora,
    b.emprestado_para,
    b.emprestado_de,
    (b.recebido_total + b.chegou) - b.contrib_integral,
    b.sis_analitico + b.sis_ajustes,
    b.sis_linhas,
    b.sis_analitico,
    b.sis_ajustes,
    b.sis_contrib,
    ((b.recebido_total + b.chegou) - b.contrib_integral) - (b.sis_analitico + b.sis_ajustes)
  from base b
  where fn_user_is_super_admin()
  order by 6 desc, b.cod_grupo_filtro;
$fn$;

comment on function public.fn_mestre_comparar_setores(uuid, text) is
  'O 59 contra o sistema, na mesma regua: sem colchao fora da meta, sem o integral do receptivo, com o emprestimo de operador resolvido e com os ajustes manuais somados do lado do sistema. So leitura.';

grant execute on function public.fn_mestre_congelar_operadores(uuid)                     to authenticated;
grant execute on function public.fn_mestre_resumo_grupos(uuid, text)                     to authenticated;
grant execute on function public.fn_mestre_emprestimo_do_setor(uuid, text)               to authenticated;
grant execute on function public.fn_mestre_emprestados(uuid, text)                       to authenticated;
grant execute on function public.fn_mestre_resumo_setores(uuid, text)                    to authenticated;
grant execute on function public.fn_mestre_comparar_setores(uuid, text)                  to authenticated;

COMMIT;
