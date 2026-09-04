-- ============================================================================
-- Relatório 59, fase 2: de onde vem o dinheiro, as equipes, e a comparação
-- ============================================================================
--
-- Continua sem alimentar tela nenhuma. Tudo aqui é leitura e vínculo dentro das
-- tabelas `mestre_*`; `analitico_recebimentos` é LIDO na comparação e nunca
-- escrito.
--
-- ## A contribuição do receptivo, e por que ela não pode ser somada duas vezes
--
-- O receptivo cobra PARA outro setor, e o ERP diz para qual: as linhas dele têm
-- `Setor` composto — `COB RECEPTIVO - BEATRIZ - MARILIA - PLAY 5`. Mas essas
-- linhas moram no `NomeGrupoFiltro` do receptivo, não no do destino. Então o
-- total do Play 5 no arquivo NÃO inclui os R$ 118.763,92 que o receptivo
-- cobrou para ele — é exatamente o valor que hoje alguém digita à mão no card
-- «Contribuição Receptivo» do Desempenho Equipes.
--
-- Somar a contribuição no destino e deixá-la também no receptivo contaria o
-- mesmo dinheiro duas vezes. A regra que este arquivo implementa:
--
--   proprio      linhas do grupo que NÃO têm destino em outro grupo
--   distribuido  linhas do grupo que têm destino em outro grupo
--   contribuido  linhas de OUTROS grupos cujo destino é este
--   total        proprio + contribuido
--
-- Com isso, somar `total` de todos os grupos devolve o total do arquivo ao
-- centavo: o que sai de um entra no outro, e nada é contado duas vezes.
--
-- Medido em agosto/2026: o receptivo distribui R$ 2.733.588,64 e fica com
-- R$ 100.459,73 próprios (os três rótulos avulsos mais um composto órfão).
--
-- ## O prefixo não é «COB RECEPTIVO - BEATRIZ» escrito no código
--
-- Seria escrever o nome de uma pessoa numa migration. A regra é geral: se o
-- `Setor` da linha começa com o NOME DO PRÓPRIO GRUPO seguido de ` - `, o resto
-- é o destino. Vale para o receptivo hoje e para qualquer grupo que passe a
-- carimbar destino amanhã, e sobrevive à troca de liderança porque o nome sai
-- da mesma linha.
--
-- `starts_with` em vez de `like`: o nome do grupo é dado do ERP, e um `%` ou `_`
-- dentro dele viraria curinga em silêncio.
--
-- ## Direto × Extra
--
-- A coluna `Tipo` (Integral/Extra) classifica a MESMA linha — `Integral + Extra
-- = total` em todos os grupos. Ela nunca acrescenta dinheiro; separa o que já
-- está lá. Medido em agosto: Extra só existe no receptivo (R$ 977.345,76 de
-- R$ 2.834.048,37) e todo o resto é 100% Integral. As funções abaixo devolvem
-- os dois lados sempre, para o dia em que outro setor passar a ter Extra.
--
-- ## Atestado
--
-- `SubgrupoEquipe = 'ATESTADOS|FERIAS'` CONTA para o setor — é recebimento de
-- verdade, de quem estava afastado. O que muda é que ele fica visível num
-- número próprio, em vez de diluído no total. Em agosto: R$ 25.944,26 no
-- Play 5 e R$ 5.047,44 no Play Mix.
-- ============================================================================

-- ── Rótulos que não são equipe ──────────────────────────────────────────────
--
-- Vêm em `SubgrupoEquipe` e não representam time nenhum. Ficam numa função para
-- que a tela, o alerta de operador e o resumo concordem sobre a mesma lista —
-- três listas ligeiramente diferentes para a mesma pergunta é o defeito que
-- este projeto já pagou caro.

create or replace function public.fn_mestre_e_equipe(p_nome text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_nome, '') <> ''
     and upper(p_nome) not in ('ATESTADOS|FERIAS', 'LIDERANÇA', 'LIDERANCA', 'SUPERVISORES');
$$;

comment on function public.fn_mestre_e_equipe(text) is
  'Este rótulo de SubgrupoEquipe é uma equipe de verdade? Atestado, liderança, supervisão e vazio não são.';

-- ── Resumo por grupo, agora com origem e destino ────────────────────────────

drop function if exists public.fn_mestre_resumo_grupos(uuid, text);

create or replace function public.fn_mestre_resumo_grupos(
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
  -- Linhas do grupo que ficam com ele (sem destino em outro grupo).
  recebido_proprio  numeric,
  -- Linhas de OUTROS grupos carimbadas para este. O «Contribuição Receptivo».
  recebido_contribuido numeric,
  -- proprio + contribuido. Somar isto em todos os grupos dá o total do arquivo.
  recebido_total    numeric,
  -- Linhas DESTE grupo que foram para outro. Não entram no total dele.
  distribuido       numeric,
  -- Composto cujo destino não casou com nenhum grupo. Fica visível, não some.
  sem_destino       numeric,
  integral_proprio  numeric,
  extra_proprio     numeric,
  integral_contribuido numeric,
  extra_contribuido numeric,
  colchao_valor     numeric,
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
as $$
  with ref as (select ((p_mes || '-01')::date) as d),
  fatia as (
    select r.*
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id and r.mes = (select d from ref)
  ),
  -- Nome → código, tirado do PRÓPRIO lote: é lá que a correspondência 1-para-1
  -- vale. Usar `mestre_grupos` traria o último nome visto, que pode ser de
  -- outra carga.
  nomes as (
    select distinct f.cod_grupo_filtro, f.nome_grupo_filtro
      from fatia f where f.nome_grupo_filtro <> ''
  ),
  marcada as (
    select f.*,
           case
             when f.nome_grupo_filtro <> ''
              and starts_with(f.setor, f.nome_grupo_filtro || ' - ')
             then substr(f.setor, length(f.nome_grupo_filtro) + 4)
           end as destino_nome
      from fatia f
  ),
  resolvida as (
    select m.*, n.cod_grupo_filtro as cod_destino
      from marcada m
      left join nomes n on n.nome_grupo_filtro = m.destino_nome
  ),
  -- O que fica no grupo: sem destino, ou com destino que não resolveu.
  propria as (
    select r.cod_grupo_filtro as cod,
           count(*)                                        as linhas,
           sum(r.recebido)                                 as valor,
           sum(r.recebido) filter (where lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where lower(r.tipo) =  'extra') as extra,
           sum(r.recebido) filter (where r.colchao)        as colchao,
           sum(r.recebido) filter (where upper(r.subgrupo_equipe) = 'ATESTADOS|FERIAS') as atestado,
           sum(r.recebido) filter (where r.destino_nome is not null and r.cod_destino is null) as sem_destino,
           count(distinct r.subgrupo_equipe) filter (where fn_mestre_e_equipe(r.subgrupo_equipe)) as equipes,
           count(distinct r.cobradora)                     as cobradoras,
           count(distinct r.dt_pgto)                       as dias
      from resolvida r
     where r.cod_destino is null or r.cod_destino = r.cod_grupo_filtro
     group by r.cod_grupo_filtro
  ),
  contribuida as (
    select r.cod_destino as cod,
           sum(r.recebido)                                 as valor,
           sum(r.recebido) filter (where lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where lower(r.tipo) =  'extra') as extra
      from resolvida r
     where r.cod_destino is not null and r.cod_destino <> r.cod_grupo_filtro
     group by r.cod_destino
  ),
  distribuida as (
    select r.cod_grupo_filtro as cod, sum(r.recebido) as valor
      from resolvida r
     where r.cod_destino is not null and r.cod_destino <> r.cod_grupo_filtro
     group by r.cod_grupo_filtro
  ),
  -- Todo código que aparece de qualquer lado: o do arquivo e o já cadastrado.
  -- O grupo cadastrado que não veio no mês tem que aparecer zerado, não sumir.
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
    coalesce(c.valor, 0),
    coalesce(p.valor, 0) + coalesce(c.valor, 0),
    coalesce(d.valor, 0),
    coalesce(p.sem_destino, 0),
    coalesce(p.integral, 0),
    coalesce(p.extra, 0),
    coalesce(c.integral, 0),
    coalesce(c.extra, 0),
    coalesce(p.colchao, 0),
    coalesce(p.atestado, 0),
    coalesce(p.equipes, 0),
    coalesce(p.cobradoras, 0),
    coalesce(p.dias, 0),
    g.primeira_aparicao,
    g.ultima_aparicao
  from chaves k
  left join propria     p  on p.cod  = k.cod
  left join contribuida c  on c.cod  = k.cod
  left join distribuida d  on d.cod  = k.cod
  left join rotulo      ro on ro.cod = k.cod
  left join mestre_grupos g on g.empresa_id = p_empresa_id and g.cod_grupo_filtro = k.cod
  left join setores     s  on s.id = g.setor_id
  where fn_user_is_super_admin()
  order by (coalesce(p.valor, 0) + coalesce(c.valor, 0)) desc, k.cod;
$$;

comment on function public.fn_mestre_resumo_grupos(uuid, text) is
  'Um card por grupo do relatório 59: o que é dele, o que veio do receptivo, o que ele distribuiu. Somar `recebido_total` em todos dá o total do arquivo, sem contar nada duas vezes.';

-- ── De onde vem o dinheiro deste setor ──────────────────────────────────────
--
-- Linha zerada NÃO aparece: a lista responde «de onde vem», e uma origem de
-- R$ 0,00 não é resposta, é ruído.

create or replace function public.fn_mestre_origens_do_grupo(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text
) returns table (
  origem     text,     -- 'proprio' | 'contribuicao' | 'distribuido' | 'sem_destino'
  cod_outro  text,     -- grupo de onde vem, ou para onde vai
  rotulo     text,
  tipo       text,     -- 'Integral' | 'Extra'
  linhas     bigint,
  valor      numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ref as (select ((p_mes || '-01')::date) as d),
  fatia as (
    select r.*
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id and r.mes = (select d from ref)
  ),
  nomes as (
    select distinct f.cod_grupo_filtro, f.nome_grupo_filtro
      from fatia f where f.nome_grupo_filtro <> ''
  ),
  resolvida as (
    select f.*,
           dn.destino_nome,
           n.cod_grupo_filtro as cod_destino
      from fatia f
      cross join lateral (
        select case
                 when f.nome_grupo_filtro <> ''
                  and starts_with(f.setor, f.nome_grupo_filtro || ' - ')
                 then substr(f.setor, length(f.nome_grupo_filtro) + 4)
               end as destino_nome
      ) dn
      left join nomes n on n.nome_grupo_filtro = dn.destino_nome
  )
  select origem, cod_outro, rotulo, tipo, linhas, valor from (
    -- O que é do próprio setor.
    select 'proprio'::text as origem, null::text as cod_outro,
           max(r.nome_grupo_filtro) as rotulo,
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end as tipo,
           count(*)::bigint as linhas, sum(r.recebido) as valor
      from resolvida r
     where r.cod_grupo_filtro = p_cod
       and (r.cod_destino is null or r.cod_destino = p_cod)
       and not (r.destino_nome is not null and r.cod_destino is null)
     group by 4

    union all
    -- Composto que não achou destino. Fica à vista para alguém decidir.
    select 'sem_destino', null, max(r.destino_nome),
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end,
           count(*)::bigint, sum(r.recebido)
      from resolvida r
     where r.cod_grupo_filtro = p_cod
       and r.destino_nome is not null and r.cod_destino is null
     group by r.destino_nome, 4

    union all
    -- O que outro grupo cobrou PARA este. A contribuição do receptivo.
    select 'contribuicao', r.cod_grupo_filtro, max(r.nome_grupo_filtro),
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end,
           count(*)::bigint, sum(r.recebido)
      from resolvida r
     where r.cod_destino = p_cod and r.cod_grupo_filtro <> p_cod
     group by r.cod_grupo_filtro, 4

    union all
    -- O que ESTE grupo cobrou para outro. Sai do total dele.
    select 'distribuido', r.cod_destino, max(r.destino_nome),
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end,
           count(*)::bigint, sum(r.recebido)
      from resolvida r
     where r.cod_grupo_filtro = p_cod
       and r.cod_destino is not null and r.cod_destino <> p_cod
     group by r.cod_destino, 4
  ) x
  where fn_user_is_super_admin() and x.valor <> 0
  order by
    case x.origem when 'proprio' then 1 when 'contribuicao' then 2
                  when 'sem_destino' then 3 else 4 end,
    x.valor desc;
$$;

comment on function public.fn_mestre_origens_do_grupo(uuid, text, text) is
  'A composição do recebimento de um grupo: o que é dele, o que veio de fora, o que saiu, separado por Integral/Extra. Origem zerada não aparece.';

-- ── Equipes do grupo ────────────────────────────────────────────────────────

drop function if exists public.fn_mestre_resumo_equipes(uuid, text, text);

create or replace function public.fn_mestre_resumo_equipes(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text
) returns table (
  nome_subgrupo     text,
  e_equipe          boolean,
  linhas            bigint,
  recebido          numeric,
  integral_valor    numeric,
  extra_valor       numeric,
  cobradoras        bigint,
  equipe_id         uuid,
  equipe_nome       text,
  estado            text,
  primeira_aparicao date,
  ultima_aparicao   date
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ref as (select ((p_mes || '-01')::date) as d),
  agg as (
    select r.subgrupo_equipe as nome,
           count(*)::bigint as linhas,
           sum(r.recebido) as recebido,
           sum(r.recebido) filter (where lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where lower(r.tipo) =  'extra') as extra,
           count(distinct r.cobradora)::bigint as cobradoras
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and r.cod_grupo_filtro = p_cod
     group by r.subgrupo_equipe
  )
  select
    a.nome,
    fn_mestre_e_equipe(a.nome),
    a.linhas,
    a.recebido,
    coalesce(a.integral, 0),
    coalesce(a.extra, 0),
    a.cobradoras,
    e.equipe_id,
    eq.nome,
    coalesce(e.estado, 'novo'),
    e.primeira_aparicao,
    e.ultima_aparicao
  from agg a
  -- LEFT, não FULL: equipe sem valor no mês NÃO entra na lista. A lista existe
  -- para responder de onde vem o dinheiro, e uma linha de R$ 0,00 não responde.
  -- O histórico de quem sumiu vive em `mestre_eventos`, que é onde se procura.
  left join mestre_equipes e
    on e.empresa_id = p_empresa_id and e.cod_grupo_filtro = p_cod and e.nome_subgrupo = a.nome
  left join equipes eq on eq.id = e.equipe_id
  where fn_user_is_super_admin() and a.recebido <> 0
  order by a.recebido desc, a.nome;
$$;

comment on function public.fn_mestre_resumo_equipes(uuid, text, text) is
  'Equipes de um grupo no mês, só as que têm valor. `e_equipe` distingue time de verdade de ATESTADOS|FERIAS, LIDERANÇA e SUPERVISORES.';

create or replace function public.fn_mestre_vincular_equipe(
  p_empresa_id uuid,
  p_cod        text,
  p_subgrupo   text,
  p_equipe_id  uuid,
  p_estado     text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_setor_grupo uuid;
  v_setor_eq    uuid;
  v_antes       record;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Apenas super_admin pode vincular equipes do relatório mestre.';
  end if;
  if p_estado not in ('novo', 'vinculado', 'ignorado') then
    raise exception 'Estado inválido: %.', p_estado;
  end if;
  if p_estado = 'vinculado' and p_equipe_id is null then
    raise exception 'Vincular exige uma equipe.';
  end if;

  select g.setor_id into v_setor_grupo
    from mestre_grupos g
   where g.empresa_id = p_empresa_id and g.cod_grupo_filtro = p_cod;

  if p_estado = 'vinculado' then
    -- A ordem importa e é o ponto da tela: sem o setor do grupo definido, não
    -- há como saber quais equipes são candidatas — e vincular a uma equipe de
    -- outro setor produziria um recebimento que nenhuma tela consegue somar.
    if v_setor_grupo is null then
      raise exception 'Vincule o SETOR deste grupo antes de vincular as equipes dele.';
    end if;
    select e.setor_id into v_setor_eq from equipes e
     where e.id = p_equipe_id and e.empresa_id = p_empresa_id;
    if v_setor_eq is null then
      raise exception 'A equipe não pertence a esta empresa.';
    end if;
    if v_setor_eq is distinct from v_setor_grupo then
      raise exception 'A equipe é de outro setor que não o vinculado a este grupo.';
    end if;
  end if;

  select * into v_antes from mestre_equipes
   where empresa_id = p_empresa_id and cod_grupo_filtro = p_cod and nome_subgrupo = p_subgrupo;
  if v_antes is null then
    raise exception 'A equipe "%" ainda não apareceu em nenhuma carga deste grupo.', p_subgrupo;
  end if;

  update mestre_equipes
     set equipe_id     = case when p_estado = 'vinculado' then p_equipe_id else null end,
         estado        = p_estado,
         atualizado_em = now()
   where empresa_id = p_empresa_id and cod_grupo_filtro = p_cod and nome_subgrupo = p_subgrupo;

  insert into mestre_eventos (empresa_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
  values (p_empresa_id,
          case when p_estado = 'vinculado' and v_antes.equipe_id is null then 'vinculo_definido'
               when p_estado = 'vinculado' then 'vinculo_alterado'
               when p_estado = 'ignorado'  then 'grupo_ignorado'
               else 'vinculo_removido' end,
          p_cod, p_subgrupo,
          jsonb_build_object(
            'alvo', 'equipe',
            'antes',  jsonb_build_object('estado', v_antes.estado, 'equipe_id', v_antes.equipe_id),
            'depois', jsonb_build_object('estado', p_estado, 'equipe_id', p_equipe_id)),
          auth.uid());
end;
$$;

-- ── O alerta: quem está na equipe errada ou fora de equipe ──────────────────
--
-- Só faz sentido DEPOIS de vincular as equipes: sem vínculo não há com o que
-- comparar, e a função devolve vazio em vez de acusar todo mundo.
--
-- `Cobradora` casa com `perfis.usuario`, minúsculo — a mesma regra de
-- `resolverOperadores`, que é quem faz esse casamento na importação do 58.

create or replace function public.fn_mestre_operadores_divergentes(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text
) returns table (
  cobradora        text,
  nome_subgrupo    text,
  recebido         numeric,
  problema         text,   -- 'sem_cadastro' | 'sem_equipe' | 'equipe_errada' | 'setor_errado'
  perfil_id        uuid,
  perfil_nome      text,
  equipe_atual     text,
  equipe_esperada  text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ref as (select ((p_mes || '-01')::date) as d),
  linhas as (
    select r.cobradora, r.subgrupo_equipe, sum(r.recebido) as recebido
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and r.cod_grupo_filtro = p_cod
       and fn_mestre_e_equipe(r.subgrupo_equipe)
     group by r.cobradora, r.subgrupo_equipe
  ),
  -- Só as equipes já vinculadas entram: as outras não têm expectativa, e
  -- acusar divergência contra um vínculo que não existe seria ruído puro.
  vinc as (
    select e.nome_subgrupo, e.equipe_id, eq.nome as equipe_nome, eq.setor_id
      from mestre_equipes e
      join equipes eq on eq.id = e.equipe_id
     where e.empresa_id = p_empresa_id and e.cod_grupo_filtro = p_cod
       and e.estado = 'vinculado' and e.equipe_id is not null
  ),
  grupo as (
    select g.setor_id from mestre_grupos g
     where g.empresa_id = p_empresa_id and g.cod_grupo_filtro = p_cod
  )
  select
    l.cobradora,
    l.subgrupo_equipe,
    l.recebido,
    case
      when p.id is null                                   then 'sem_cadastro'
      when p.equipe_id is null                            then 'sem_equipe'
      when p.equipe_id is distinct from v.equipe_id       then 'equipe_errada'
      when p.setor_id  is distinct from (select setor_id from grupo) then 'setor_errado'
    end,
    p.id,
    p.nome,
    eqa.nome,
    v.equipe_nome
  from linhas l
  join vinc v on v.nome_subgrupo = l.subgrupo_equipe
  left join perfis p
    on p.empresa_id = p_empresa_id and lower(p.usuario) = lower(l.cobradora)
  left join equipes eqa on eqa.id = p.equipe_id
  where fn_user_is_super_admin()
    and (
      p.id is null
      or p.equipe_id is null
      or p.equipe_id is distinct from v.equipe_id
      or p.setor_id  is distinct from (select setor_id from grupo)
    )
  order by l.recebido desc, l.cobradora;
$$;

comment on function public.fn_mestre_operadores_divergentes(uuid, text, text) is
  'Depois de vincular as equipes: quem o relatório põe numa equipe e o cadastro põe em outra (ou em nenhuma). Vazio enquanto não houver equipe vinculada.';

-- ── Fase 2: o mestre contra o que o sistema tem hoje ────────────────────────
--
-- Lê `analitico_recebimentos` e NÃO escreve nele. É a tela que responde «dá
-- para trocar de fonte?» antes de trocar — e que hoje não existe: a divergência
-- aparece semanas depois, num card de meta, sem forma de saber de onde veio.

create or replace function public.fn_mestre_comparar_setores(
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
  sistema_total     numeric,
  sistema_linhas    bigint,
  diferenca         numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ref as (select ((p_mes || '-01')::date) as d),
  m as (
    select g.cod_grupo_filtro, g.nome_no_relatorio, g.nome_cadastrado,
           g.setor_id, g.setor_nome, g.estado,
           g.recebido_total, g.recebido_proprio, g.recebido_contribuido
      from fn_mestre_resumo_grupos(p_empresa_id, p_mes) g
  ),
  -- O total que o sistema tem hoje, por setor carimbado na importação do 58.
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
  )
  select
    m.cod_grupo_filtro,
    coalesce(nullif(m.nome_no_relatorio, ''), m.nome_cadastrado),
    m.setor_id,
    m.setor_nome,
    m.estado,
    m.recebido_total,
    m.recebido_proprio,
    m.recebido_contribuido,
    coalesce(s.total, 0),
    coalesce(s.linhas, 0),
    m.recebido_total - coalesce(s.total, 0)
  from m
  left join sis s on s.setor_id = m.setor_id
  where fn_user_is_super_admin()
  order by m.recebido_total desc, m.cod_grupo_filtro;
$$;

comment on function public.fn_mestre_comparar_setores(uuid, text) is
  'Fase 2: o total do mestre contra o de `analitico_recebimentos`, por setor vinculado. Só leitura.';

-- ── O que o sistema tem e o mestre não vincula ──────────────────────────────
--
-- O contrário da comparação acima: setor com dinheiro no sistema que nenhum
-- grupo do 59 aponta. Sem isto, um vínculo esquecido apareceria como «o mestre
-- tem menos» sem dizer onde.

create or replace function public.fn_mestre_setores_sem_grupo(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  setor_id      uuid,
  setor_nome    text,
  sistema_total numeric,
  sistema_linhas bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ref as (select ((p_mes || '-01')::date) as d)
  select s.id, s.nome, sum(a.valor_recebido), count(*)::bigint
    from analitico_recebimentos a
    join setores s on s.id = a.setor_id
   where a.empresa_id = p_empresa_id
     and a.data_pagamento >= (select d from ref)
     and a.data_pagamento <  ((select d from ref) + interval '1 month')
     and fn_user_is_super_admin()
     and not exists (
           select 1 from mestre_grupos g
            where g.empresa_id = p_empresa_id and g.setor_id = a.setor_id
              and g.estado = 'vinculado')
   group by s.id, s.nome
  having sum(a.valor_recebido) <> 0
   order by 3 desc;
$$;

grant execute on function public.fn_mestre_e_equipe(text)                                to authenticated;
grant execute on function public.fn_mestre_resumo_grupos(uuid, text)                     to authenticated;
grant execute on function public.fn_mestre_origens_do_grupo(uuid, text, text)            to authenticated;
grant execute on function public.fn_mestre_resumo_equipes(uuid, text, text)              to authenticated;
grant execute on function public.fn_mestre_vincular_equipe(uuid, text, text, uuid, text) to authenticated;
grant execute on function public.fn_mestre_operadores_divergentes(uuid, text, text)      to authenticated;
grant execute on function public.fn_mestre_comparar_setores(uuid, text)                  to authenticated;
grant execute on function public.fn_mestre_setores_sem_grupo(uuid, text)                 to authenticated;
