-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 2: as divergências entre o 59 e o 58, sem afogar quem olha
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fase 2 do `docs/PLANO-SINCRONIZACAO-59.md`, regra 5.
--
-- ## O que se compara
--
-- Os dois lados são agrupados por **setor + cobradora + NR do documento**, cada
-- um passado pelo recorte que `docs/SINCRONIZACAO-58-59.md` provou em agosto:
-- carteira (`cod_grupo_filtro`) manda, colchão fora do setor, Retenção fora do
-- setor. O que sobra é diferença de verdade entre as duas fontes.
--
-- ## A primeira versão desta função não servia, e o número dizia isso
--
-- Com três classes (`do_dia`, `estrutural`, `divergencia`), setembro/2026 dava
-- **1.090 NRs e R$ 375.193,73 de «divergência»**. Ninguém olha mil linhas, e o
-- aviso já tinha sido dado: se a aba listar ausência de importação como se
-- fosse divergência, ela vira ruído e ninguém abre.
--
-- Duas coisas estavam sendo chamadas de divergência sem ser:
--
-- **1. Setor cujo 58 não chegou naquele dia.** A regra é «dos dias que já estão
-- atualizados» — e isso é por setor, não do mês. Jornada Play e Manutenção não
-- importam o 58 nenhum dia; o Play 1 estava no dia 11 enquanto o Receptivo já
-- tinha o 14.
--
-- **2. O último dia importado é parcial.** Esta não estava à vista. As 198
-- divergências do Play 1 caíam *todas* no dia 11 — justamente o último dia do
-- 58 dele: o relatório foi exportado no meio do dia, o 59 tem o dia inteiro. O
-- último dia do 58 de cada setor é um dia aberto, exatamente como hoje é, só
-- que relativo à importação daquele setor e não ao calendário.
--
-- ## As cinco classes
--
--   sem_58 ......... o setor não importou o 58 neste mês. Não é divergência,
--                    é importação que falta.
--   aguardando_58 .. o 58 do setor ainda não chegou nesse dia.
--   dia_aberto ..... o dia é hoje/futuro, ou é o último dia do 58 do setor —
--                    dia ainda em movimento dos dois lados.
--   estrutural ..... o NR existe do outro lado, em outro setor ou carteira.
--                    É o recorte funcionando (rateio, carteira diferente).
--   divergencia .... nada explica. Alguém precisa olhar.
--
-- Em setembro/2026, com as cinco classes:
--
--   sem_58 ......... 629 NRs .... R$ 197.401,20   (Jornada Play + Manutenção)
--   dia_aberto ..... 406 NRs .... R$ 160.574,51
--   aguardando_58 .. 171 NRs .... R$  61.477,75
--   divergencia .....  6 NRs .... R$   1.174,08
--   estrutural ......  1 NR ..... R$     179,10
--
-- **Seis.** Todas `so_no_59` em dia que o 58 já cobria — pagamento lançado no
-- ERP depois da exportação daquele 58. É o caso que merece olho humano, e agora
-- ele aparece sozinho em vez de perdido em mil linhas.
--
-- ## Escrita: nenhuma
--
-- ## Nota de histórico
--
-- A versão de três classes foi registrada como `20260914004249
-- fase2_divergencias_consolidadas` e substituída por esta dentro da mesma hora,
-- antes de qualquer tela usá-la. Ela não tem arquivo no repo de propósito: o
-- estado final das duas é este aqui. Se `list_migrations` mostrar aquela versão
-- sem arquivo correspondente, é isso — não é arquivo perdido.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

-- A assinatura muda (entra `p_classe`), entao o drop e necessario.
drop function if exists public.fn_mestre_divergencias(uuid, text, uuid, text, integer);

create or replace function public.fn_mestre_divergencias(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid    default null,
  p_cobradora  text    default null,
  p_classe     text    default null,
  p_limite     integer default 300
)
returns table(
  setor_id        uuid,
  setor_nome      text,
  cobradora       text,
  operador_id     uuid,
  operador_nome   text,
  nr_documento    text,
  dia             date,
  valor_59        numeric,
  valor_58        numeric,
  delta           numeric,
  situacao        text,
  classe          text,
  ultimo_dia_58   date
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (
    select ((p_mes || '-01')::date) as d,
           (now() at time zone 'America/Sao_Paulo')::date as hoje
  ),
  -- Ate onde o 58 de CADA setor chegou. Sem isso, setor que nao importou vira
  -- «divergencia» e afoga o que importa.
  ate_onde as (
    select x.setor_id, max(x.data_pagamento) as ultimo_dia
      from analitico_recebimentos x
     where x.empresa_id = p_empresa_id
       and x.mes_referencia = (select d from ref)
       and x.setor_id is not null
     group by 1
  ),
  -- Lado 59, ja com o recorte do 58: carteira manda, colchao e Retencao ficam
  -- fora do setor.
  lado59 as (
    select g.setor_id,
           upper(btrim(r.cobradora)) as cobradora,
           r.nr_documento            as nr,
           (array_agg(distinct r.operador_id) filter (where r.operador_id is not null))[1] as operador_id,
           sum(r.recebido) as valor,
           max(r.dt_pgto)  as dia
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_grupos g
        on g.empresa_id = r.empresa_id
       and g.cod_grupo_filtro = r.cod_grupo_filtro
       and g.estado = 'vinculado'
       and g.setor_id is not null
      left join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and coalesce(me.destino, 'proprio') <> 'somente_geral'
       and coalesce(r.nr_documento, '') <> ''
       and btrim(r.cobradora) <> ''
     group by 1, 2, 3
  ),
  lado58 as (
    select x.setor_id,
           upper(btrim(x.operador_usuario)) as cobradora,
           x.codigo as nr,
           (array_agg(distinct x.operador_id) filter (where x.operador_id is not null))[1] as operador_id,
           sum(x.valor_recebido) as valor,
           max(x.data_pagamento) as dia
      from analitico_recebimentos x
     where x.empresa_id = p_empresa_id
       and x.mes_referencia = (select d from ref)
       and x.setor_id is not null
       and coalesce(x.codigo, '') <> ''
     group by 1, 2, 3
  ),
  -- O NR existe do outro lado, noutro setor/carteira? Entao a diferenca e o
  -- recorte trabalhando, nao erro.
  nr58 as (
    select x.codigo as nr from analitico_recebimentos x
     where x.empresa_id = p_empresa_id and x.mes_referencia = (select d from ref)
       and x.setor_id is not null group by 1
  ),
  nr59 as (
    select r.nr_documento as nr
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_grupos g
        on g.empresa_id = r.empresa_id and g.cod_grupo_filtro = r.cod_grupo_filtro
       and g.estado = 'vinculado'
     where r.empresa_id = p_empresa_id and r.mes = (select d from ref) group by 1
  ),
  juntos as (
    select coalesce(a.setor_id, b.setor_id)       as setor_id,
           coalesce(a.cobradora, b.cobradora)     as cobradora,
           coalesce(a.nr, b.nr)                   as nr,
           coalesce(a.operador_id, b.operador_id) as operador_id,
           round(coalesce(a.valor, 0), 2) as v59,
           round(coalesce(b.valor, 0), 2) as v58,
           round(coalesce(a.valor, 0) - coalesce(b.valor, 0), 2) as delta,
           greatest(coalesce(a.dia, b.dia), coalesce(b.dia, a.dia)) as dia,
           (a.nr is not null) as tem59,
           (b.nr is not null) as tem58
      from lado59 a
      full outer join lado58 b
        on b.setor_id = a.setor_id and b.cobradora = a.cobradora and b.nr = a.nr
  ),
  classificado as (
    select j.*, ao.ultimo_dia,
           case when not j.tem58 then 'so_no_59'
                when not j.tem59 then 'so_no_58'
                else 'valor_difere' end as situacao,
           case
             when ao.ultimo_dia is null then 'sem_58'
             when j.dia > ao.ultimo_dia  then 'aguardando_58'
             when j.dia >= (select hoje from ref) or j.dia = ao.ultimo_dia then 'dia_aberto'
             when not j.tem58 and n58.nr is not null then 'estrutural'
             when not j.tem59 and n59.nr is not null then 'estrutural'
             else 'divergencia'
           end as classe
      from juntos j
      left join ate_onde ao on ao.setor_id = j.setor_id
      left join nr58 n58 on n58.nr = j.nr
      left join nr59 n59 on n59.nr = j.nr
     where abs(j.delta) >= 0.01
  )
  select c.setor_id,
         coalesce(cms.nome, s.nome),
         c.cobradora,
         c.operador_id,
         coalesce(cm.nome, c.cobradora),
         c.nr, c.dia, c.v59, c.v58, c.delta,
         c.situacao, c.classe, c.ultimo_dia
    from classificado c
    left join setores s on s.id = c.setor_id
    left join composicao_mes_setor cms
      on cms.empresa_id = p_empresa_id and cms.mes = p_mes and cms.setor_id = c.setor_id
    left join composicao_mes cm
      on cm.empresa_id = p_empresa_id and cm.mes = p_mes and cm.operador_id = c.operador_id
   where (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
     and (p_setor_id  is null or c.setor_id = p_setor_id)
     and (p_cobradora is null or c.cobradora = upper(btrim(p_cobradora)))
     and (p_classe    is null or c.classe = p_classe)
   -- Divergencia de verdade primeiro. O resto e contexto.
   order by case c.classe
              when 'divergencia'   then 0
              when 'estrutural'    then 1
              when 'dia_aberto'    then 2
              when 'aguardando_58' then 3
              else 4 end,
            abs(c.delta) desc
   limit greatest(coalesce(p_limite, 300), 1);
$function$;

comment on function public.fn_mestre_divergencias(uuid, text, uuid, text, text, integer) is
  'Diferencas entre o 59 e o 58 por setor+cobradora+NR, classificadas em '
  'sem_58 / aguardando_58 / dia_aberto / estrutural / divergencia. As quatro '
  'primeiras existem para NAO chamar de divergencia o que e importacao faltando '
  'ou dia ainda aberto: em setembro/2026 elas separam 1.206 NRs de ruido das 6 '
  'divergencias reais. So leitura.';

grant execute on function public.fn_mestre_divergencias(uuid, text, uuid, text, text, integer) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- O resumo que a aba mostra no topo
-- ───────────────────────────────────────────────────────────────────────────
--
-- Uma linha por setor e classe, mais `ultimo_dia_58` — que e a informacao que
-- torna `aguardando_58` legivel. Sem ela, «R$ 46 mil aguardando» e um numero
-- sem explicacao; com ela vira «o 58 do Play 1 esta no dia 11».

create or replace function public.fn_mestre_divergencias_resumo(
  p_empresa_id uuid,
  p_mes        text
)
returns table(
  setor_id      uuid,
  setor_nome    text,
  ultimo_dia_58 date,
  classe        text,
  nrs           bigint,
  valor         numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with linhas as (
    select * from fn_mestre_divergencias(p_empresa_id, p_mes, null, null, null, 1000000)
  )
  select l.setor_id,
         max(l.setor_nome),
         max(l.ultimo_dia_58),
         l.classe,
         count(*)::bigint,
         round(sum(abs(l.delta)), 2)
    from linhas l
   group by l.setor_id, l.classe
   order by max(l.setor_nome),
            case l.classe
              when 'divergencia'   then 0
              when 'estrutural'    then 1
              when 'dia_aberto'    then 2
              when 'aguardando_58' then 3
              else 4 end;
$function$;

comment on function public.fn_mestre_divergencias_resumo(uuid, text) is
  'Resumo de fn_mestre_divergencias por setor e classe, com ate que dia o 58 de '
  'cada setor chegou — e isso que faz «aguardando_58» ser lido como «o 58 deste '
  'setor esta no dia 11» em vez de um numero sem causa. So leitura.';

grant execute on function public.fn_mestre_divergencias_resumo(uuid, text) to authenticated;

commit;
