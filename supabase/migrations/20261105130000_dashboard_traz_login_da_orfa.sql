-- ============================================================================
-- 20261105130000_dashboard_traz_login_da_orfa.sql
--
-- O Dashboard passa a receber o LOGIN das linhas sem conta (órfãs) — para a
-- divisão do setor (20261105120500) saber de quem é o recebimento de
-- `Pagueplay_play1`, `Pagueplay_play2`… que não têm usuário cadastrado.
--
-- Em outubro/2026 eram R$ 252 mil no Receptivo nessas linhas: sem o login,
-- tudo isso caía em «Sem divisão».
--
-- ## A única mudança
--
-- `fn_analitico_dashboard_mes_json` ganha UMA coluna no agrupamento:
--
--   case when ar.operador_id is null then lower(btrim(ar.operador_usuario)) end
--
-- Só a linha SEM operador ganha o login; a linha com operador continua com
-- `null` ali e agrupa exatamente como antes. O efeito é dividir o grupo das
-- órfãs de um mesmo dia/forma/setor em um grupo por login.
--
-- ## Por que isso não muda número nenhum
--
-- O agrupamento só fica mais fino: a soma de `total`, `total_ho` e `qtd` dos
-- grupos novos é a soma do grupo antigo, centavo por centavo. Quem lê esta
-- função (o `agregarAnalitico` do app) SOMA esses três campos — nunca conta
-- linhas. O total da empresa, do setor, da equipe e da pessoa é o mesmo.
--
-- O corpo é a cópia da versão em produção, lida com pg_get_functiondef em
-- 05/11/2026 (igual à da 20261031220000), com as duas linhas marcadas «05/11».
-- Nenhuma outra função é tocada. Reaplicável.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_analitico_dashboard_mes_json(p_empresa_id uuid, p_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Mês fechado: quem estava no alcance NAQUELE mês (20261001110000).
  v_retrato    uuid[];
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
        -- 05/11: o login só da linha sem conta (divisão do setor).
        case when ar.operador_id is null then lower(btrim(ar.operador_usuario)) end as operador_usuario,
        coalesce(ar.setor_id, imp.setor_id) as setor_id,
        ar.forma_pagamento,
        ar.forma_detalhe,
        ar.status_tabulacao,
        (ar.procedencia = 'contribuicao_59') as contribuicao,
        ar.contribuicao_de_setor_id,
        ar.espelho_extra,
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
               -- 05/11: o mesmo login do select.
               case when ar.operador_id is null then lower(btrim(ar.operador_usuario)) end,
               coalesce(ar.setor_id, imp.setor_id),
               ar.forma_pagamento, ar.forma_detalhe, ar.status_tabulacao,
               (ar.procedencia = 'contribuicao_59'), ar.contribuicao_de_setor_id,
               ar.espelho_extra
    ) t
  $q$;
begin
  if not public.fn_can_access_empresa(p_empresa_id) then
    return '[]'::jsonb;
  end if;

  v_escopo := public.fn_user_escopo_analitico();

  -- ── Quem entra no recorte ────────────────────────────────────────────────
  if v_escopo = 2 then
    v_setores := array(select public.fn_setores_do_operador_no_mes(v_eu, p_empresa_id, p_mes));
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
    v_retrato := public.fn_retrato_pessoas_do_alcance(p_empresa_id, p_mes, '{}', v_setores);

  elsif v_escopo = 1 then
    -- Estas duas são constantes na consulta inteira. Ficavam DENTRO de
    -- `fn_operador_no_meu_alcance_de_equipe`, recalculadas por linha de
    -- `perfis` — 432 vezes cada. Ver o cabeçalho.
    v_todas := public.fn_user_tem('dashboard_escopo_equipe_todas');

    if v_todas then
      v_setores := array(select public.fn_setores_do_operador_no_mes(v_eu, p_empresa_id, p_mes));
      v_operadores := array(
        select p.id
          from public.perfis p
         where p.empresa_id = p_empresa_id
           and exists (
             select 1 from public.fn_equipes_do_operador(p.id) eq
              where eq.setor_id = any(v_setores)
           )
      );
      -- Mês fechado: as equipes que o retrato põe nesses setores — o recorte
      -- aqui é por EQUIPE, como no ramo vivo logo acima.
      v_retrato := public.fn_retrato_pessoas_do_alcance(
        p_empresa_id, p_mes,
        array(select ce.equipe_id from public.composicao_mes_equipe ce
               where ce.empresa_id = p_empresa_id and ce.mes = p_mes
                 and ce.setor_id = any(v_setores)),
        '{}');
      -- O escopo de equipe credita pela EQUIPE, não pelo setor: o recorte por
      -- setor não vale aqui, e `v_setores` foi só o insumo do alcance.
      v_setores := array[]::uuid[];
    else
      -- «Só a minha»: todo mundo que ESTÁ nas equipes por onde eu respondo —
      -- membro, líder ou clone — e eu mesmo (20260929120000). Olhar só o
      -- `perfis.equipe_id` de quem recebeu deixava de fora o líder da equipe,
      -- que não tem esse campo.
      v_operadores := array(
        select public.fn_pessoas_das_equipes(
                 array(select public.fn_equipes_de_alcance_no_mes(v_eu, p_empresa_id, p_mes)))
        union
        select v_eu
      );
      v_retrato := public.fn_retrato_pessoas_do_alcance(
        p_empresa_id, p_mes, array(select public.fn_equipes_de_alcance_no_mes(v_eu, p_empresa_id, p_mes)), '{}');
    end if;
  end if;

  -- Mês fechado com retrato: quem estava no alcance naquele mês; quem não
  -- está no retrato fica pelo cadastro de hoje.
  if v_retrato is not null then
    v_operadores := v_retrato
      || array(
           select o from unnest(v_operadores) as o
            where not exists (
              select 1 from public.composicao_mes cm
               where cm.empresa_id = p_empresa_id and cm.mes = p_mes and cm.operador_id = o));
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
