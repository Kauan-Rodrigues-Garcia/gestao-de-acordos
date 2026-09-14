-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 7: o painel de fontes — qual setor lê de onde, e o que mudaria
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A tela que troca a fonte de um setor precisa mostrar, na mesma linha, o que
-- há hoje e o que haverá depois. Trocar sem ver o número é apostar com o
-- dinheiro de 301 pessoas.
--
-- `valor_projetado` vem da mesma `fn_mestre_projecao_analitico` que a troca usa
-- para gravar — não de uma segunda conta parecida. Se a tela e a gravação
-- divergissem, a tela viraria propaganda enganosa do próprio botão.
--
-- `tem_lote_59` e `tem_guardado` existem para a tela não oferecer o que o banco
-- recusaria: sem lote vigente do 59 a troca levanta `SEM_LOTE_59`, e sem
-- retrato guardado a volta levanta `NADA_GUARDADO`. Botão que só sabe falhar é
-- pior que botão nenhum — mesma lição de `podeVincular` nas equipes sugeridas.
--
-- Escrita: nenhuma.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_mestre_fontes_dos_setores(
  p_empresa_id uuid,
  p_mes        text
)
returns table(
  setor_id         uuid,
  setor_nome       text,
  fonte            text,
  linhas_hoje      bigint,
  valor_hoje       numeric,
  linhas_projetado bigint,
  valor_projetado  numeric,
  tem_lote_59      boolean,
  tem_guardado     boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  lote as (
    select exists (
      select 1 from mestre_lotes ml
       where ml.empresa_id = p_empresa_id and ml.mes = (select d from ref)
         and ml.estado = 'vigente') as tem
  ),
  hoje as (
    select a.setor_id,
           count(*)::bigint as linhas,
           round(sum(a.valor_recebido), 2) as valor,
           bool_or(a.procedencia = 'relatorio_59') as do_59
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id and a.mes_referencia = (select d from ref)
       and a.setor_id is not null
     group by 1
  ),
  proj as (
    select p.setor_id, count(*)::bigint as linhas, round(sum(p.valor_recebido), 2) as valor
      from fn_mestre_projecao_analitico(p_empresa_id, p_mes, null) p
     group by 1
  ),
  guardado as (
    select r.setor_id, true as tem
      from analitico_removidos r
     where r.empresa_id = p_empresa_id and r.mes_referencia = (select d from ref)
       and r.restaurado_em is null
     group by 1
  ),
  setores_do_mes as (
    select setor_id from hoje
    union
    select setor_id from proj
  )
  select s.setor_id,
         coalesce(cms.nome, se.nome, '(setor sem nome)'),
         case when coalesce(h.do_59, false) then 'relatorio_59' else 'relatorio_58' end,
         coalesce(h.linhas, 0), coalesce(h.valor, 0),
         coalesce(pr.linhas, 0), coalesce(pr.valor, 0),
         (select tem from lote),
         coalesce(g.tem, false)
    from setores_do_mes s
    left join hoje h  on h.setor_id  = s.setor_id
    left join proj pr on pr.setor_id = s.setor_id
    left join guardado g on g.setor_id = s.setor_id
    left join setores se on se.id = s.setor_id
    left join composicao_mes_setor cms
      on cms.empresa_id = p_empresa_id and cms.mes = p_mes and cms.setor_id = s.setor_id
   where fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)
   order by abs(coalesce(pr.valor, 0) - coalesce(h.valor, 0)) desc,
            coalesce(cms.nome, se.nome);
$function$;

comment on function public.fn_mestre_fontes_dos_setores(uuid, text) is
  'Por setor: de onde o dado vem hoje, quanto e hoje, e quanto seria com o 59. '
  'O projetado sai da MESMA funcao que a troca usa para gravar — tela e '
  'gravacao com contas diferentes seria propaganda enganosa do proprio botao. '
  'So leitura.';

grant execute on function public.fn_mestre_fontes_dos_setores(uuid, text) to authenticated;

commit;
