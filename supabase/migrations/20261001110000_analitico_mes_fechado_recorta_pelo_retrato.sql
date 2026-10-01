-- ============================================================================
-- Analítico de mês FECHADO: o recorte de quem olha sai do retrato do mês
-- ============================================================================
--
-- ## O buraco (achado na virada de 01/10/2026)
--
-- As três RPCs do analítico que recortam por alcance montam a lista de quem
-- entra (`v_ops`) a partir do cadastro de HOJE — `perfis`, `equipe_lideres`,
-- `equipe_operadores_clones`. Para o mês corrente é o certo. Para um mês
-- fechado, quem trocou de equipe ou de setor depois da virada:
--
--   * sumia do setembro do líder da equipe/setor ANTIGO — o card de setembro
--     da equipe, desenhado pelo retrato, ficava sem o dinheiro dessa pessoa
--     (o card soma o que a RPC devolve, e ela não devolvia);
--   * aparecia no setembro do líder da equipe/setor NOVO, fora de qualquer
--     card daquele mês.
--
-- Escopo de empresa (admin, diretoria) não recorta e nunca foi afetado.
--
-- ## A regra nova
--
-- O ALCANCE de quem olha continua o de hoje — é permissão, e permissão é do
-- presente: as equipes que eu lidero, os setores que eu enxergo.
--
-- QUEM ESTAVA nessas equipes e setores, num mês fechado com retrato, sai do
-- retrato daquele mês (`composicao_mes*`). Quem não está no retrato cai no
-- cadastro de hoje, a mesma reserva de `fn_analitico_setores_no_mes`.
--
-- ## O que muda
--
--   fn_retrato_pessoas_do_alcance (nova)   quem estava nas equipes/setores, no mês
--   fn_analitico_resumo_por_operador       v_ops pelo retrato em mês fechado
--   fn_analitico_dashboard_mes_json        idem, nos ramos de equipe e setor
--   fn_analitico_recebido_fora_do_setor    idem
--
-- Os corpos são os de `20260929211916` (resumo e fora do setor) e
-- `20260929141516` (dashboard), letra por letra, mais o bloco do retrato logo
-- depois de montar `v_ops`.
--
-- Só funções. Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── Quem estava nestas equipes / setores, no mês ───────────────────────────
--
-- `NULL` quando o mês não está fechado ou não tem retrato: quem chama mantém o
-- recorte de hoje. Equipe: membro (equipe do rótulo), as demais em que estava
-- (`equipes_clone`: clones e outras lideradas) e a liderança gravada. Setor: o
-- setor da pessoa no retrato, ou o de qualquer equipe em que ela estava.
CREATE OR REPLACE FUNCTION public.fn_retrato_pessoas_do_alcance(
  p_empresa_id uuid, p_mes text, p_equipes uuid[], p_setores uuid[]
)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH tem AS (
    SELECT public.fn_mes_fechado(p_mes)
       AND EXISTS (
         SELECT 1 FROM public.composicao_mes cm
          WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes
       ) AS sim
  ),
  equipes_alvo AS (
    SELECT unnest(COALESCE(p_equipes, '{}'::uuid[])) AS eq
    UNION
    SELECT ce.equipe_id
      FROM public.composicao_mes_equipe ce
     WHERE ce.empresa_id = p_empresa_id AND ce.mes = p_mes
       AND ce.setor_id = ANY(COALESCE(p_setores, '{}'::uuid[]))
  )
  SELECT CASE WHEN NOT (SELECT sim FROM tem) THEN NULL ELSE ARRAY(
    SELECT cm.operador_id
      FROM public.composicao_mes cm
     WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes
       AND (
         cm.setor_id = ANY(COALESCE(p_setores, '{}'::uuid[]))
         OR cm.equipe_id IN (SELECT eq FROM equipes_alvo)
         OR COALESCE(cm.equipes_clone, '{}'::uuid[]) && ARRAY(SELECT eq FROM equipes_alvo)
       )
    UNION
    SELECT l.lider_id
      FROM public.composicao_mes_lider l
     WHERE l.empresa_id = p_empresa_id AND l.mes = p_mes
       AND l.equipe_id IN (SELECT eq FROM equipes_alvo)
  ) END;
$function$;

COMMENT ON FUNCTION public.fn_retrato_pessoas_do_alcance(uuid, text, uuid[], uuid[]) IS
  'Quem estava nas equipes/setores dados NUM MES FECHADO, pelo retrato (composicao_mes*). '
  'NULL quando o mes esta aberto ou sem retrato. So para uso interno das RPCs do analitico (20261001110000).';

REVOKE ALL ON FUNCTION public.fn_retrato_pessoas_do_alcance(uuid, text, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;

-- ── Resumo por operador ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_analitico_resumo_por_operador(p_empresa_id uuid, p_mes text, p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS TABLE(operador_id uuid, operador_usuario text, operador_nome text, total_recebido numeric, total_ho numeric, total_pagamentos bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu      UUID := (SELECT auth.uid());
  v_escopo  INTEGER;
  -- Quem entra no recorte, montado UMA vez — não por linha do analítico.
  -- É o pertencimento de QUEM RECEBEU (membro, líder ou clone), e não o
  -- cadastro: o líder não tem `perfis.equipe_id`, e o de uma equipe noutro
  -- setor não tem o `setor_id` de quem olha (20260929120000).
  v_ops     UUID[] := '{}';
  v_setores UUID[] := '{}';
  v_de      DATE;
  v_ate     DATE;
  -- A linha só conta no setor onde a pessoa está (20260929211916).
  v_por_setor BOOLEAN;
  -- Mês fechado: quem estava no alcance NAQUELE mês (20261001110000).
  v_retrato UUID[];
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('ver_analitico')
     OR NOT public.fn_user_tem('analitico_sub_analitico')
     OR NOT public.fn_user_tem('analitico_sub_ranking') THEN
    RETURN;
  END IF;

  -- Sem intervalo, o mês inteiro: o comportamento que as lentes Mês e Dia
  -- esperam, e o que esta função sempre fez.
  v_de  := COALESCE(p_inicio, (p_mes || '-01')::DATE);
  v_ate := COALESCE(p_fim, ((p_mes || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE);

  v_por_setor := p_mes >= '2026-09'
    AND EXISTS (SELECT 1 FROM public.empresas em WHERE em.id = p_empresa_id AND em.slug = 'bookplay');

  v_escopo := public.fn_user_escopo('analitico');

  IF v_escopo = 2 THEN
    -- Setor: quem é do setor pelo perfil, quem está numa equipe do setor, e eu.
    v_setores := ARRAY(SELECT public.fn_setores_do_operador(v_eu));
    v_ops := ARRAY(
      SELECT pf.id
        FROM public.perfis pf
       WHERE pf.setor_id = ANY(v_setores)
      UNION
      SELECT public.fn_pessoas_das_equipes(ARRAY(
        SELECT e.id FROM public.equipes e WHERE e.setor_id = ANY(v_setores)
      ))
      UNION
      SELECT v_eu
    );
    v_retrato := public.fn_retrato_pessoas_do_alcance(p_empresa_id, p_mes, '{}', v_setores);
  ELSIF v_escopo < 2 THEN
    -- Equipe: quem está nas equipes por onde eu respondo, e eu.
    v_ops := ARRAY(
      SELECT public.fn_pessoas_das_equipes(
        ARRAY(SELECT public.fn_equipes_de_alcance(v_eu)))
      UNION
      SELECT v_eu
    );
    v_retrato := public.fn_retrato_pessoas_do_alcance(
      p_empresa_id, p_mes, ARRAY(SELECT public.fn_equipes_de_alcance(v_eu)), '{}');
  END IF;

  -- Mês fechado com retrato: quem estava no alcance naquele mês; quem não
  -- está no retrato fica pelo cadastro de hoje.
  IF v_retrato IS NOT NULL THEN
    v_ops := v_retrato
      || ARRAY(
           SELECT o FROM unnest(v_ops) AS o
            WHERE NOT EXISTS (
              SELECT 1 FROM public.composicao_mes cm
               WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes AND cm.operador_id = o))
      || v_eu;
  END IF;

  RETURN QUERY
  WITH linhas AS (
    SELECT ar.operador_id AS op, ar.operador_usuario AS usuario, ar.setor_id AS setor,
           ar.valor_recebido AS valor, ar.total_ho AS ho
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id = p_empresa_id
       AND ar.operador_id IS NOT NULL
       AND ar.data_pagamento BETWEEN v_de AND v_ate
       AND (v_escopo >= 3 OR ar.operador_id = ANY(v_ops))
  ),
  casa AS (
    SELECT sm.operador_id AS op, sm.setor_id AS setor
      FROM public.fn_analitico_setores_no_mes(
             p_empresa_id, p_mes, ARRAY(SELECT DISTINCT x.op FROM linhas x)) sm
     WHERE v_por_setor
  )
  SELECT
    li.op,
    MIN(li.usuario),
    p.nome,
    SUM(li.valor)::NUMERIC,
    SUM(li.ho)::NUMERIC,
    COUNT(*)::BIGINT
  FROM linhas li
  LEFT JOIN public.perfis p ON p.id = li.op
  WHERE COALESCE(p.perfil, '') <> 'super_admin'
    AND (NOT v_por_setor
         OR li.setor IS NULL
         OR NOT EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op)
         OR EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op AND c.setor = li.setor))
  GROUP BY li.op, p.nome
  ORDER BY 4 DESC;
END;
$function$;

-- ── Dashboard do analítico ─────────────────────────────────────────────────
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
    v_retrato := public.fn_retrato_pessoas_do_alcance(p_empresa_id, p_mes, '{}', v_setores);

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
                 array(select public.fn_equipes_de_alcance(v_eu)))
        union
        select v_eu
      );
      v_retrato := public.fn_retrato_pessoas_do_alcance(
        p_empresa_id, p_mes, array(select public.fn_equipes_de_alcance(v_eu)), '{}');
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

-- ── O que ficou de fora do setor da pessoa ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_analitico_recebido_fora_do_setor(p_empresa_id uuid, p_mes text, p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS TABLE(operador_id uuid, setor_id uuid, total_recebido numeric, total_ho numeric, total_pagamentos bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu      UUID := (SELECT auth.uid());
  v_escopo  INTEGER;
  v_ops     UUID[] := '{}';
  v_setores UUID[] := '{}';
  v_equipes UUID[] := '{}';
  v_de      DATE;
  v_ate     DATE;
  -- Mês fechado: quem estava no alcance NAQUELE mês (20261001110000).
  v_retrato UUID[];
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('ver_analitico')
     OR NOT public.fn_user_tem('analitico_sub_analitico')
     OR NOT public.fn_user_tem('analitico_sub_ranking') THEN
    RETURN;
  END IF;

  IF p_mes < '2026-09'
     OR NOT EXISTS (SELECT 1 FROM public.empresas em WHERE em.id = p_empresa_id AND em.slug = 'bookplay') THEN
    RETURN;
  END IF;

  v_de  := COALESCE(p_inicio, (p_mes || '-01')::DATE);
  v_ate := COALESCE(p_fim, ((p_mes || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE);

  v_escopo := public.fn_user_escopo('analitico');

  IF v_escopo = 2 THEN
    v_setores := ARRAY(SELECT public.fn_setores_do_operador(v_eu));
    v_equipes := ARRAY(SELECT e.id FROM public.equipes e WHERE e.setor_id = ANY(v_setores));
    v_ops := ARRAY(
      SELECT pf.id FROM public.perfis pf WHERE pf.setor_id = ANY(v_setores)
      UNION
      SELECT public.fn_pessoas_das_equipes(v_equipes)
      UNION
      SELECT v_eu
    );
    v_retrato := public.fn_retrato_pessoas_do_alcance(p_empresa_id, p_mes, '{}', v_setores);
  ELSIF v_escopo < 2 THEN
    v_equipes := ARRAY(SELECT public.fn_equipes_de_alcance(v_eu));
    v_ops := ARRAY(
      SELECT public.fn_pessoas_das_equipes(v_equipes)
      UNION
      SELECT v_eu
    );
    v_retrato := public.fn_retrato_pessoas_do_alcance(p_empresa_id, p_mes, v_equipes, '{}');
  END IF;

  IF v_retrato IS NOT NULL THEN
    v_ops := v_retrato
      || ARRAY(
           SELECT o FROM unnest(v_ops) AS o
            WHERE NOT EXISTS (
              SELECT 1 FROM public.composicao_mes cm
               WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes AND cm.operador_id = o))
      || v_eu;
  END IF;

  IF v_escopo < 3 THEN
    v_ops := v_ops || ARRAY(
      SELECT t.perfil_id
        FROM public.perfis_transferencias t
       WHERE t.empresa_id = p_empresa_id
         AND t.mes = p_mes
         AND t.tipo = 'setor'
         AND t.fantasma_ativo
         AND t.desfeita_em IS NULL
         AND (t.origem_equipe_id = ANY(v_equipes) OR t.origem_setor_id = ANY(v_setores))
    );
  END IF;

  RETURN QUERY
  WITH linhas AS (
    SELECT ar.operador_id AS op, ar.setor_id AS setor,
           ar.valor_recebido AS valor, ar.total_ho AS ho
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id = p_empresa_id
       AND ar.operador_id IS NOT NULL
       AND ar.setor_id IS NOT NULL
       AND ar.data_pagamento BETWEEN v_de AND v_ate
       AND (v_escopo >= 3 OR ar.operador_id = ANY(v_ops))
  ),
  casa AS (
    SELECT sm.operador_id AS op, sm.setor_id AS setor
      FROM public.fn_analitico_setores_no_mes(
             p_empresa_id, p_mes, ARRAY(SELECT DISTINCT x.op FROM linhas x)) sm
  )
  SELECT li.op, li.setor, SUM(li.valor)::NUMERIC, SUM(li.ho)::NUMERIC, COUNT(*)::BIGINT
    FROM linhas li
   WHERE EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op)
     AND NOT EXISTS (SELECT 1 FROM casa c WHERE c.op = li.op AND c.setor = li.setor)
   GROUP BY li.op, li.setor;
END;
$function$;

COMMIT;
