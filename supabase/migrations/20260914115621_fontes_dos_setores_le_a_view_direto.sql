-- ═══════════════════════════════════════════════════════════════════════════
-- A aba «Fonte dos dados» estourava o tempo: três camadas SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Estado final de duas migrations (115529 e 115621): a primeira corrigiu a aba,
-- a segunda achatou a função pública e removeu a intermediária que sobrou.
--
-- ## O sintoma
--
-- «canceling statement due to statement timeout» ao abrir a aba. O papel
-- `authenticated` roda com `statement_timeout = 8s`.
--
-- ## A causa — a mesma já diagnosticada, num lugar que escapou
--
-- A cadeia era:
--
--   fn_mestre_fontes_dos_setores           (security definer)
--     → fn_mestre_projecao_analitico       (security definer)
--       → fn_mestre_projecao_analitico_interno  (security definer)
--         → vw_mestre_projecao_analitico
--
-- **O Postgres não embute função SECURITY DEFINER.** Cada camada vira uma
-- barreira de otimização: os filtros de empresa e mês não descem até a view, e
-- o plano degenera — o mesmo defeito que fazia a projeção levar 19s para um
-- setor e não terminar para o mês.
--
-- Eu consertei a cadeia da sincronização e deixei esta de fora. Só apareceu
-- quando a aba foi aberta de verdade.
--
-- ## Medido depois
--
--   corpo da função, com o teto de 8s do papel `authenticated` ... 782 ms
--   ciclo de sincronização completo (verificação de regressão) ... 3.201 ms
--
-- ## A intermediária saiu junto
--
-- Com a pública lendo a view direto, `fn_mestre_projecao_analitico_interno`
-- ficou sem nenhum chamador — o `aplicar_interno` e o gatilho já liam a view.
-- Função sem porta é dívida: alguém a encontra, acha que é o caminho certo, e
-- reintroduz a pilha.
--
-- ## A lição que fica registrada
--
-- Função SECURITY DEFINER chamando função SECURITY DEFINER é caro, e o custo
-- não aparece em consulta pequena. Quem precisa da trava põe a trava e lê a
-- fonte; empilhar wrappers «para reaproveitar» paga em plano.
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
  -- A VIEW direto, e nao fn_mestre_projecao_analitico: aquela e SECURITY
  -- DEFINER, o Postgres nao a embute, e os filtros de empresa e mes nao desciam
  -- ate aqui. Era o que estourava os 8s do papel `authenticated`.
  proj as (
    select v.setor_id, count(*)::bigint as linhas, round(sum(v.valor_recebido), 2) as valor
      from vw_mestre_projecao_analitico v
     where v.empresa_id = p_empresa_id and v.mes = (select d from ref)
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
  'Le a VIEW direto — passar por fn_mestre_projecao_analitico empilhava tres '
  'camadas SECURITY DEFINER, que o Postgres nao embute, e a aba estourava os 8s '
  'do papel authenticated. So leitura.';

grant execute on function public.fn_mestre_fontes_dos_setores(uuid, text) to authenticated;

-- ── A pública achata, e a intermediária sai ────────────────────────────────

create or replace function public.fn_mestre_projecao_analitico(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid default null
)
returns table(
  setor_id uuid, operador_id uuid, operador_usuario text, codigo text,
  data_pagamento date, forma_pagamento text, forma_detalhe text,
  nome_cliente text, instituicao text, tipo_comissao text,
  valor_recebido numeric, linhas_no_59 bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select v.setor_id, v.operador_id, v.operador_usuario, v.codigo,
         v.data_pagamento, v.forma_pagamento, v.forma_detalhe,
         v.nome_cliente, v.instituicao, v.tipo_comissao,
         v.valor_recebido, v.linhas_no_59
    from vw_mestre_projecao_analitico v
   where v.empresa_id = p_empresa_id
     and v.mes = ((p_mes || '-01')::date)
     and (p_setor_id is null or v.setor_id = p_setor_id)
     and (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id));
$function$;

comment on function public.fn_mestre_projecao_analitico(uuid, text, uuid) is
  'O que o 59 escreveria em analitico_recebimentos. Le vw_mestre_projecao_analitico '
  'direto, com trava de empresa. Nao empilhar outra funcao SECURITY DEFINER em '
  'cima disto: o Postgres nao as embute, os filtros nao descem, e o plano '
  'degenera — foi assim que a aba «Fonte dos dados» estourou o tempo.';

grant execute on function public.fn_mestre_projecao_analitico(uuid, text, uuid) to authenticated;

drop function if exists public.fn_mestre_projecao_analitico_interno(uuid, text, uuid);

commit;
