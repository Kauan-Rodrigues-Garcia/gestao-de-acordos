-- ============================================================================
-- H.O. deixa de vir do relatorio e passa a ser CALCULADO: 24,96% do recebido
-- ============================================================================
--
-- ## O que se descobriu
--
-- A coluna "Total HO" do relatorio analitico do ERP nao traz 24,96% do valor
-- recebido: traz 25,00% exatos. Verificado nos dois lados.
--
--   Banco (analitico_recebimentos, PaguePlay): 11.112 linhas, media 25,0005%,
--   ZERO linhas fora de 25,00%, 11.052 linhas fora de 24,96%.
--
--   Planilha exportada em 18/08/2026 (4.377 linhas, 44 cobradoras): 25,0000%
--   em TODAS as cobradoras, sem excecao. Linha a linha o valor bate casa a casa
--   com `Recebido / 4`, e nao com `Recebido * 0,2496`:
--
--     Recebido 269,02 -> Total HO 67,2550   (269,02/4      = 67,2550)
--                                           (269,02*0,2496 = 67,1474)
--
-- Ou seja: o ERP divide por 4. Nao e arredondamento de 24,96% — e outra conta.
--
-- ## Por que 24,96% e o numero certo
--
-- E a retencao real da PaguePlay. O resto e repasse: 56,28% Coren + 18,76%
-- Cofen. Os tres somam 100,00%. A 25% a soma passaria de 100%. A constante
-- `PP_HO_PERCENTUAL` em `src/lib/index.ts` sempre foi 24,96%, e todo o resto do
-- sistema (metas, Dashboard, Painel do Lider, Diario) ja calculava assim. So o
-- Analitico lia o numero do relatorio — e por isso as duas abas de recebimento
-- divergiam em 0,16%.
--
-- O relatorio vai ser levado a TI. Ate que ele seja corrigido — e mesmo depois,
-- porque a conta nao deve depender de o ERP acertar — o H.O. passa a ser
-- derivado do valor recebido, em todos os casos, e o numero da planilha e
-- ignorado.
--
-- ## Onde isso e resolvido
--
-- Aqui, no banco, e nao em cada tela. Quatro funcoes do schema
-- (`fn_analitico_atualizar_resumo`, `fn_analitico_dashboard_mes`,
-- `fn_analitico_dashboard_mes_json`, `fn_analitico_resumo_por_operador`) e umas
-- quinze telas apenas LEEM a coluna `total_ho`. Consertar a coluna na origem
-- conserta as quinze de uma vez, e nao cria quinze lugares onde a proxima
-- pessoa pode errar.
--
-- O parser (`src/services/analitico/analiticoParser.ts`) tambem passa a
-- calcular, para que a previa da importacao mostre na tela o mesmo numero que
-- vai ficar gravado.
--
-- ## A BookPlay continua zerada
--
-- La `total_ho` e 0,00 em toda linha (13.497 linhas, soma zero) e varias telas
-- usam exatamente isso para decidir se o alternador H.O./bruto aparece. O
-- trigger preserva o zero: 24,96% e retencao da PaguePlay, nao regra geral. Se
-- um dia a BookPlay tiver H.O. proprio, isto vira uma coluna em `empresas` —
-- nao um segundo `if` aqui dentro.
-- ============================================================================

-- ── O percentual, num lugar so do lado do banco ────────────────────────────

create or replace function public.fn_pp_ho_percentual()
returns numeric
language sql
immutable
as $fn$ select 0.2496::numeric $fn$;

comment on function public.fn_pp_ho_percentual() is
  'Retencao da PaguePlay (H.O.). Espelha PP_HO_PERCENTUAL em src/lib/index.ts — mudar um exige mudar o outro.';

-- ── O trigger ─────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER de proposito: a funcao consulta `empresas`, e `empresas` tem
-- RLS. Sem DEFINER, um usuario que insere linha do analitico mas nao enxerga a
-- linha da propria empresa faria o subselect devolver NULL — e o H.O. seria
-- gravado como zero, em silencio, na importacao inteira.

create or replace function public.fn_analitico_ho_calculado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_pagueplay boolean;
begin
  select e.slug = 'pagueplay' into v_pagueplay
    from public.empresas e
   where e.id = new.empresa_id;

  new.total_ho := case
    when coalesce(v_pagueplay, false)
      then round(coalesce(new.valor_recebido, 0) * public.fn_pp_ho_percentual(), 2)
    else 0
  end;

  return new;
end;
$fn$;

comment on function public.fn_analitico_ho_calculado() is
  'Deriva total_ho de valor_recebido (24,96%) na PaguePlay e forca zero nas demais. O H.O. que vier do relatorio e descartado — o ERP manda 25,00%.';

drop trigger if exists trg_analitico_recebimentos_ho on public.analitico_recebimentos;
create trigger trg_analitico_recebimentos_ho
  before insert or update of valor_recebido, total_ho, empresa_id
  on public.analitico_recebimentos
  for each row execute function public.fn_analitico_ho_calculado();

drop trigger if exists trg_analitico_colchao_ho on public.analitico_colchao_fora_meta;
create trigger trg_analitico_colchao_ho
  before insert or update of valor_recebido, total_ho, empresa_id
  on public.analitico_colchao_fora_meta
  for each row execute function public.fn_analitico_ho_calculado();

-- ── Corrigir o que ja esta gravado ────────────────────────────────────────
--
-- O `update` dispara o trigger, e e o trigger que faz a conta. O `where` evita
-- reescrever linha que ja esta certa — a BookPlay inteira, entre outras.

update public.analitico_recebimentos r
   set valor_recebido = r.valor_recebido   -- no-op: quem muda total_ho e o trigger
  from public.empresas e
 where e.id = r.empresa_id
   and r.total_ho is distinct from (
     case when e.slug = 'pagueplay'
       then round(coalesce(r.valor_recebido, 0) * public.fn_pp_ho_percentual(), 2)
       else 0 end
   );

update public.analitico_colchao_fora_meta c
   set valor_recebido = c.valor_recebido
  from public.empresas e
 where e.id = c.empresa_id
   and c.total_ho is distinct from (
     case when e.slug = 'pagueplay'
       then round(coalesce(c.valor_recebido, 0) * public.fn_pp_ho_percentual(), 2)
       else 0 end
   );

-- ── O snapshot mensal ─────────────────────────────────────────────────────
--
-- `analitico_resumo_mensal` e alimentado por `fn_analitico_atualizar_resumo`,
-- que soma `total_ho` das linhas. Chamar a funcao daqui nao adianta: a primeira
-- coisa que ela faz e `fn_can_access_empresa()`, e numa migration nao ha sessao.
-- Entao o snapshot e refeito com a mesma soma que a funcao faria.

update public.analitico_resumo_mensal s
   set total_ho      = sub.soma_ho,
       atualizado_em = now()
  from (
    select r.empresa_id,
           to_char(r.data_pagamento, 'YYYY-MM') as mes,
           coalesce(sum(r.total_ho), 0)         as soma_ho
      from public.analitico_recebimentos r
     group by 1, 2
  ) sub
 where sub.empresa_id = s.empresa_id
   and sub.mes        = s.mes
   and s.total_ho is distinct from sub.soma_ho;

-- ── Verificacao ───────────────────────────────────────────────────────────
--
-- Falha alto. Uma correcao "quase completa" e pior que nenhuma: some da vista e
-- deixa duas abas discordando de novo.

do $ver$
declare
  v_fora    bigint;
  v_achados bigint;
begin
  select count(*) into v_fora
    from public.analitico_recebimentos r
    join public.empresas e on e.id = r.empresa_id
   where r.total_ho is distinct from (
     case when e.slug = 'pagueplay'
       then round(coalesce(r.valor_recebido, 0) * public.fn_pp_ho_percentual(), 2)
       else 0 end
   );
  if v_fora > 0 then
    raise exception 'analitico_recebimentos: % linha(s) com total_ho fora de 24,96%%', v_fora;
  end if;

  select count(*) into v_fora
    from public.analitico_colchao_fora_meta c
    join public.empresas e on e.id = c.empresa_id
   where c.total_ho is distinct from (
     case when e.slug = 'pagueplay'
       then round(coalesce(c.valor_recebido, 0) * public.fn_pp_ho_percentual(), 2)
       else 0 end
   );
  if v_fora > 0 then
    raise exception 'analitico_colchao_fora_meta: % linha(s) com total_ho fora de 24,96%%', v_fora;
  end if;

  -- Os dois triggers no lugar: sem eles a proxima importacao regrava 25%.
  select count(*) into v_achados
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and t.tgname in ('trg_analitico_recebimentos_ho', 'trg_analitico_colchao_ho');
  if v_achados <> 2 then
    raise exception 'Trigger de H.O. faltando (esperados 2, achados %)', v_achados;
  end if;

  raise notice 'H.O. normalizado em 24,96%% e trigger ativo nas duas tabelas.';
end;
$ver$;
