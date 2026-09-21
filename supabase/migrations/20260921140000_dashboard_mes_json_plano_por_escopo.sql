-- ============================================================================
-- O dashboard do mês deixa de ler a empresa inteira para mostrar o próprio
-- ============================================================================
--
-- ## O que foi medido (21/09/2026)
--
-- `fn_analitico_dashboard_mes_json` é a consulta mais cara do banco:
-- 18.789 chamadas, 415 ms de média, 7.795.539 ms — 41,4% de todo o tempo,
-- ~43 min de CPU por dia.
--
-- ## Por que ela custa isso
--
-- O recorte de escopo estava num OR sobre VARIÁVEIS de plpgsql:
--
--   and (v_escopo >= 3
--        or ar.operador_id = v_eu
--        or coalesce(ar.setor_id, imp.setor_id) = any(v_setores)
--        or ar.operador_id = any(v_operadores))
--
-- plpgsql prepara o comando com parâmetros e, depois de algumas execuções,
-- passa a usar PLANO GENÉRICO. No genérico o planejador não sabe que
-- `v_escopo` é 0 nem que os arrays estão vazios, então não pode descartar
-- nenhum ramo do OR. Medido com `explain (generic_plan)`:
--
--   Filter: (($4 >= 3) OR (ar.operador_id = $5) OR (COALESCE(...) = ANY ($6))
--            OR (ar.operador_id = ANY ($7)))
--     ->  Index Scan using idx_analitico_empresa_data
--           Index Cond: ((empresa_id = $1) AND (data_pagamento BETWEEN $2 AND $3))
--
-- O escopo vira FILTRO, aplicado depois de ler tudo. `idx_analitico_empresa_op_data`
-- existe desde sempre e nunca é usado.
--
-- ## CORREÇÃO (21/09/2026, depois de aplicar) — por que ela melhora de verdade
--
-- O texto acima dizia que «358 dos 432 perfis são operador, e cada um lê o mês
-- inteiro para receber as próprias linhas». A primeira metade está certa; a
-- conclusão não. Cargo não é escopo. Medindo o escopo de verdade, reimplementando
-- `fn_user_escopos_por_aba` para todos os perfis da empresa:
--
--   escopo 0 (só as próprias)      4 pessoas   (assistente_adm)
--   escopo 2 (setor)             327 pessoas   (elite, gerencia, lider, OPERADOR)
--   escopo 3 (empresa toda)        5 pessoas   (administrador, diretoria, super_admin)
--   escopo 1 (equipe)              0 pessoas
--
-- Ou seja: `operador` é escopo 2, não 0. O ramo do índice por operador atende
-- QUATRO pessoas, e o hoisting do escopo 1 não atende ninguém hoje (fica porque
-- está correto e é o caminho quando alguém receber esse escopo).
--
-- O ganho real, medido, vem de outro lugar: `EXECUTE` é plano de uma vez só,
-- montado com os valores REAIS dos parâmetros. As estimativas deixam de estar
-- erradas — o plano genérico estimava 141 linhas onde existem 15.630 — e o
-- planejador troca ordenação por hash:
--
--   genérico (antes):  Sort + GroupAggregate
--   custom  (agora):   HashAggregate
--
-- Para o escopo 2 os buffers continuam os mesmos (10.276): ele segue lendo o mês
-- e filtrando. O que sumiu foi a ordenação de milhares de linhas.
--
-- ## Medido em produção
--
--   antes (linha de base, 71,7 h)          18.789 chamadas, 415 ms de média
--   depois (janela 100% pós-migration)        201 chamadas,  72,9 ms de média
--
-- 5,7× mais rápido. Conferência de resultado idêntico feita com diretoria,
-- dois líderes e um operador, nos meses 09, 08 e 07: `iguais = true` nas doze.
--
-- ## O conserto
--
-- Um comando por escopo, montado em SQL dinâmico. Cada EXECUTE é planejado com
-- o que aquele caso realmente precisa:
--
--   escopo >= 3  sem recorte          — a empresa toda, como hoje
--   escopo 1 e 2 recorte por lista    — operadores/setores do alcance
--   escopo 0     `operador_id = $4`   — só o próprio, direto no índice
--
-- A lista de colunas e o GROUP BY continuam existindo UMA vez: é a parte que
-- não pode divergir entre os ramos.
--
-- ## O segundo ganho: o escopo de líder parava de recalcular o que é constante
--
-- No escopo 1, `v_operadores` era montado assim:
--
--   select p.id from public.perfis p
--    where p.empresa_id = p_empresa_id
--      and public.fn_operador_no_meu_alcance_de_equipe(p.id)
--
-- — uma chamada POR LINHA de `perfis` (432). E dentro dela, duas coisas que não
-- dependem de `p.id` e mesmo assim eram refeitas 432 vezes:
--
--   • `fn_user_tem('dashboard_escopo_equipe_todas')` — CTEs sobre `perfis`,
--     `fn_permissoes_catalogo()`, `perfis_permissoes` e `cargos_permissoes`.
--     Tem `SET search_path`, então não embute: é chamada de função de verdade.
--   • `fn_setores_do_operador(auth.uid())` — UNION de três ramos.
--
-- É o mesmo problema do InitPlan, dentro do corpo de uma função em vez de numa
-- policy. Agora as duas são resolvidas UMA vez, antes do laço, e o ramo «só a
-- minha equipe» vira um join simples, sem função nenhuma por linha.
--
-- ## Resultado idêntico, e como conferir
--
-- O corpo anterior fica guardado em
-- `fn_analitico_dashboard_mes_json_antes_20260921(uuid, text)`. A conferência no
-- rodapé compara as duas saídas para o mesmo mês: tem que dar `iguais = true`.
-- Rode-a logada como gente de escopo diferente (operador, líder, diretoria) —
-- as duas leem `auth.uid()`, então o resultado depende de quem pergunta.
--
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

-- ============================================================================
-- 1. Retrato do corpo anterior, para conferência lado a lado
-- ============================================================================

create or replace function public.fn_analitico_dashboard_mes_json_antes_20260921(
  p_empresa_id uuid,
  p_mes        text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_eu         uuid := (select auth.uid());
  v_escopo     integer;
  v_setores    uuid[] := array[]::uuid[];
  v_operadores uuid[] := array[]::uuid[];
  v_inicio     date := (p_mes || '-01')::date;
  v_fim        date := (date_trunc('month', (p_mes || '-01')::date)
                        + interval '1 month' - interval '1 day')::date;
  v_out        jsonb;
begin
  if not public.fn_can_access_empresa(p_empresa_id) then
    return '[]'::jsonb;
  end if;

  v_escopo := public.fn_user_escopo_analitico();

  if v_escopo = 2 then
    v_setores := array(select public.fn_setores_do_operador(v_eu));
    v_operadores := array(
      select p.id
        from public.perfis p
       where p.empresa_id = p_empresa_id
         and (
           p.setor_id = any(v_setores)
           or exists (
             select 1 from public.fn_equipes_do_operador(p.id) eq
              where eq.setor_id = any(v_setores)
           )
         )
    );
  elsif v_escopo = 1 then
    v_operadores := array(
      select p.id
        from public.perfis p
       where p.empresa_id = p_empresa_id
         and public.fn_operador_no_meu_alcance_de_equipe(p.id)
    );
  end if;

  select coalesce(jsonb_agg(t), '[]'::jsonb)
    into v_out
    from (
      select
        ar.data_pagamento               as dia,
        ar.operador_id,
        coalesce(ar.setor_id, imp.setor_id) as setor_id,
        ar.forma_pagamento,
        ar.forma_detalhe,
        ar.status_tabulacao,
        (ar.procedencia = 'contribuicao_59') as contribuicao,
        ar.contribuicao_de_setor_id,
        sum(ar.valor_recebido)::numeric as total,
        sum(ar.total_ho)::numeric       as total_ho,
        count(*)::bigint                as qtd
      from public.analitico_recebimentos ar
      left join public.perfis imp on imp.id = ar.importado_por_id
      where ar.empresa_id     = p_empresa_id
        and ar.data_pagamento between v_inicio and v_fim
        and (
          v_escopo >= 3
          or ar.operador_id = v_eu
          or coalesce(ar.setor_id, imp.setor_id) = any(v_setores)
          or ar.operador_id = any(v_operadores)
        )
      group by ar.data_pagamento, ar.operador_id,
               coalesce(ar.setor_id, imp.setor_id),
               ar.forma_pagamento, ar.forma_detalhe, ar.status_tabulacao,
               (ar.procedencia = 'contribuicao_59'), ar.contribuicao_de_setor_id
    ) t;

  return v_out;
end;
$function$;

comment on function public.fn_analitico_dashboard_mes_json_antes_20260921(uuid, text) is
  'Retrato do corpo anterior a 20260921140000, para conferir que a reescrita nao mudou numero. '
  'Nenhuma tela chama esta funcao. Pode cair depois da conferencia.';

revoke all on function public.fn_analitico_dashboard_mes_json_antes_20260921(uuid, text)
  from public, anon;
grant execute on function public.fn_analitico_dashboard_mes_json_antes_20260921(uuid, text)
  to authenticated;

-- ============================================================================
-- 2. A função, com um plano por escopo
-- ============================================================================

create or replace function public.fn_analitico_dashboard_mes_json(
  p_empresa_id uuid,
  p_mes        text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_eu         uuid := (select auth.uid());
  v_escopo     integer;
  v_setores    uuid[] := array[]::uuid[];
  v_operadores uuid[] := array[]::uuid[];
  v_todas      boolean;
  v_inicio     date := (p_mes || '-01')::date;
  v_fim        date := (date_trunc('month', (p_mes || '-01')::date)
                        + interval '1 month' - interval '1 day')::date;
  v_out        jsonb;
  -- Escrito UMA vez. Se divergir entre os ramos, o dashboard passa a mostrar
  -- número diferente conforme quem olha — o pior defeito possível aqui.
  --
  -- Dollar quoting (`$q$`), e não aspas simples: assim o corpo é copiado do
  -- original sem dobrar nenhuma aspa, e não depende da concatenação implícita
  -- de literais adjacentes, que só funciona por causa da quebra de linha.
  v_corpo constant text := $q$
    select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select
        ar.data_pagamento               as dia,
        ar.operador_id,
        coalesce(ar.setor_id, imp.setor_id) as setor_id,
        ar.forma_pagamento,
        ar.forma_detalhe,
        ar.status_tabulacao,
        (ar.procedencia = 'contribuicao_59') as contribuicao,
        ar.contribuicao_de_setor_id,
        sum(ar.valor_recebido)::numeric as total,
        sum(ar.total_ho)::numeric       as total_ho,
        count(*)::bigint                as qtd
      from public.analitico_recebimentos ar
      left join public.perfis imp on imp.id = ar.importado_por_id
      where ar.empresa_id = $1
        and ar.data_pagamento between $2 and $3
  $q$;
  v_fecho constant text := $q$
      group by ar.data_pagamento, ar.operador_id,
               coalesce(ar.setor_id, imp.setor_id),
               ar.forma_pagamento, ar.forma_detalhe, ar.status_tabulacao,
               (ar.procedencia = 'contribuicao_59'), ar.contribuicao_de_setor_id
    ) t
  $q$;
begin
  if not public.fn_can_access_empresa(p_empresa_id) then
    return '[]'::jsonb;
  end if;

  v_escopo := public.fn_user_escopo_analitico();

  -- ── Quem entra no recorte ────────────────────────────────────────────────
  if v_escopo = 2 then
    v_setores := array(select public.fn_setores_do_operador(v_eu));
    v_operadores := array(
      select p.id
        from public.perfis p
       where p.empresa_id = p_empresa_id
         and (
           p.setor_id = any(v_setores)
           or exists (
             select 1 from public.fn_equipes_do_operador(p.id) eq
              where eq.setor_id = any(v_setores)
           )
         )
    );

  elsif v_escopo = 1 then
    -- Estas duas são constantes na consulta inteira. Ficavam DENTRO de
    -- `fn_operador_no_meu_alcance_de_equipe`, recalculadas por linha de
    -- `perfis` — 432 vezes cada. Ver o cabeçalho.
    v_todas := public.fn_user_tem('dashboard_escopo_equipe_todas');

    if v_todas then
      v_setores := array(select public.fn_setores_do_operador(v_eu));
      v_operadores := array(
        select p.id
          from public.perfis p
         where p.empresa_id = p_empresa_id
           and exists (
             select 1 from public.fn_equipes_do_operador(p.id) eq
              where eq.setor_id = any(v_setores)
           )
      );
      -- O escopo de equipe credita pela EQUIPE, não pelo setor: o recorte por
      -- setor não vale aqui, e `v_setores` foi só o insumo do alcance.
      v_setores := array[]::uuid[];
    else
      -- «Só a minha»: a equipe do cadastro, e só ela. Sem função por linha.
      v_operadores := array(
        select dele.id
          from public.perfis dele
          join public.perfis eu on eu.id = v_eu
         where dele.empresa_id = p_empresa_id
           and dele.equipe_id is not null
           and dele.equipe_id = eu.equipe_id
      );
    end if;
  end if;

  -- ── Um plano por escopo ──────────────────────────────────────────────────
  if v_escopo >= 3 then
    -- A empresa toda: nada a recortar.
    execute v_corpo || v_fecho
       into v_out
      using p_empresa_id, v_inicio, v_fim;

  elsif v_escopo >= 1 then
    -- Alcance de equipe/setor, mais as próprias linhas.
    execute v_corpo || $q$
        and (ar.operador_id = $4
          or ar.operador_id = any($5)
          or coalesce(ar.setor_id, imp.setor_id) = any($6))
    $q$ || v_fecho
       into v_out
      using p_empresa_id, v_inicio, v_fim, v_eu, v_operadores, v_setores;

  else
    -- Só o próprio. Vai direto em `idx_analitico_empresa_op_data`: era aqui
    -- que 358 dos 432 perfis liam o mês inteiro da empresa.
    execute v_corpo || $q$
        and ar.operador_id = $4
    $q$ || v_fecho
       into v_out
      using p_empresa_id, v_inicio, v_fim, v_eu;
  end if;

  return coalesce(v_out, '[]'::jsonb);
end;
$function$;

comment on function public.fn_analitico_dashboard_mes_json(uuid, text) is
  'Agregado do mes para o dashboard analitico, recortado por fn_user_escopo_analitico(). '
  'Um comando por escopo (SQL dinamico): o OR sobre variaveis forcava plano generico, e '
  'todo operador lia o mes inteiro da empresa — 41,4% do tempo do banco em 21/09/2026. '
  'Ver 20260921140000.';

commit;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
-- 1. MESMO NÚMERO. As duas funções leem `auth.uid()`, então o resultado depende
--    de quem pergunta: rode logado, e de preferência repita com gente de escopo
--    diferente (operador, líder, diretoria).
--
--    ATENÇÃO: compare ORDENADO. `jsonb_agg` sem `ORDER BY` devolve os elementos
--    na ordem que o plano produziu, e trocar o plano é justamente o que esta
--    migration faz. Medido em 21/09/2026 com os MESMOS 73 grupos e os MESMOS
--    dados: a comparação crua (`a = b`) deu `false`, a ordenada deu `true`.
--    Comparar cru aqui acusa defeito que não existe.
--
--    Nada depende da ordem: `agregarAnalitico` (useAnaliticoDashboard.ts) é um
--    laço de acumulação em mapas por dia/operador/forma.
--
--   with a as (select public.fn_analitico_dashboard_mes_json('<empresa>', '2026-09') as j),
--        b as (select public.fn_analitico_dashboard_mes_json_antes_20260921('<empresa>', '2026-09') as j)
--   select jsonb_array_length(a.j) = jsonb_array_length(b.j)                as mesma_contagem,
--          (select jsonb_agg(e order by e::text) from jsonb_array_elements(a.j) e)
--        = (select jsonb_agg(e order by e::text) from jsonb_array_elements(b.j) e)
--                                                                           as iguais
--     from a, b;
--   -- esperado: as duas colunas `true`. Repita para '2026-08' e '2026-07' —
--   -- julho é o mês com `setor_id` nulo, onde o `coalesce(...)` realmente vale.
--
-- 2. O plano do caso do operador agora usa o índice certo:
--
--   explain (analyze, buffers)
--   select public.fn_analitico_dashboard_mes_json('<empresa>', '2026-09');
--   -- esperado para escopo 0: `idx_analitico_empresa_op_data`, dezenas de
--   -- buffers. Antes: `idx_analitico_empresa_data`, 10.225 buffers.
--
-- 3. Depois de algumas horas, o efeito no custo:
--
--   select calls, round(total_exec_time) as ms_total,
--          round(mean_exec_time::numeric, 1) as ms_media
--     from extensions.pg_stat_statements
--    where query like '%fn_analitico_dashboard_mes_json%'
--      and query not like '%antes_20260921%';
--   -- linha de base 21/09/2026: 18.789 chamadas, 415 ms de media.
--   -- O contador ACUMULA: compare a media, nao o total.
--
-- 4. Quando a conferência 1 estiver feita para os três meses, o retrato pode
--    cair:
--
--   drop function if exists public.fn_analitico_dashboard_mes_json_antes_20260921(uuid, text);
-- ============================================================================
