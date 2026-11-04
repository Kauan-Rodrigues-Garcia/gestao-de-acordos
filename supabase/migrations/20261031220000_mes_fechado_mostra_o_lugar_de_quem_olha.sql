-- ============================================================================
-- Mês fechado: quem olha vê o mês do LUGAR onde estava naquele mês
-- ============================================================================
--
-- Decisão do Cleber (31/10/2026): «se a pessoa trocar para o mês passado,
-- aparece o setor que ela terminou o mês, o setor que ela estava». Quem mudou
-- de setor ou de equipe abre o mês fechado e vê o setor e a equipe onde estava,
-- com os números de lá.
--
-- ## O que era
--
-- O recorte das RPCs do mês tem duas partes:
--
--   o NÍVEL   equipe / setor / empresa — `fn_user_escopo*`, permissão de hoje;
--   o LUGAR   quais setores e equipes são «os meus» — `fn_setores_do_operador`
--             e `fn_equipes_de_alcance`, sempre do cadastro de hoje.
--
-- O retrato já convertia o lugar em PESSOAS do mês (`fn_retrato_pessoas_do_alcance`),
-- mas o lugar continuava sendo o de hoje: quem saiu do Play 1 para o Play 2 em
-- novembro abria outubro e via o Play 2 de outubro, onde não estava. Entre
-- setembro e outubro, 58 pessoas da BookPlay trocaram de setor e 162 de equipe.
--
-- ## O que muda
--
-- O nível continua o de hoje (é permissão). O lugar passa a ser o do mês:
--
--   fn_setores_do_operador_no_mes(perfil, empresa, mes)
--     = fn_analitico_setores_no_mes: mês fechado e a pessoa no retrato, os
--       setores do retrato (o dela, o das equipes que lidera e onde é clone);
--       senão, `fn_setores_do_operador` — a mesma chamada de antes.
--   fn_equipes_de_alcance_no_mes(perfil, empresa, mes)
--     mês fechado e a pessoa no retrato: a equipe de membro (cargo que não é
--     líder) e as lideranças explícitas (ordem < 100); senão,
--     `fn_equipes_de_alcance` — a mesma chamada de antes.
--
-- Conferido em 31/10/2026 contra o retrato de outubro gravado às 19:36: para
-- as 571 pessoas, as duas fórmulas do retrato devolvem exatamente o que as
-- funções de hoje devolvem. É a mesma regra, lida da foto.
--
-- As três RPCs do mês trocam só essas chamadas, texto por texto, a partir da
-- definição vigente em produção em 31/10/2026:
--
--   fn_analitico_dashboard_mes_json       Dashboard, Painel do Líder, app
--   fn_analitico_resumo_por_operador      Ranking, Comissão, RH
--   fn_analitico_recebido_fora_do_setor   o card do recebido fora do setor
--
-- `fn_analitico_mudancas_do_mes` fica de fora: é das últimas 24 h, não do mês.
--
-- ## Prova
--
-- No mês corrente as funções novas devolvem, para cada pessoa, o mesmo que as
-- de hoje — qualquer diferença desfaz a migration inteira.
--
-- Só funções. Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── O lugar no mês ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_setores_do_operador_no_mes(p_perfil uuid, p_empresa_id uuid, p_mes text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT sm.setor_id
    FROM public.fn_analitico_setores_no_mes(p_empresa_id, p_mes, ARRAY[p_perfil]) sm
   WHERE sm.setor_id IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.fn_equipes_de_alcance_no_mes(p_perfil uuid, p_empresa_id uuid, p_mes text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH r AS (
    SELECT cm.equipe_id, cm.cargo
      FROM public.composicao_mes cm
     WHERE public.fn_mes_fechado(p_mes)
       AND cm.empresa_id  = p_empresa_id
       AND cm.mes         = p_mes
       AND cm.operador_id = p_perfil
  )
  SELECT r.equipe_id FROM r
   WHERE r.cargo IS DISTINCT FROM 'lider' AND r.equipe_id IS NOT NULL
  UNION
  SELECT l.equipe_id
    FROM public.composicao_mes_lider l
   WHERE EXISTS (SELECT 1 FROM r)
     AND l.empresa_id = p_empresa_id
     AND l.mes        = p_mes
     AND l.lider_id   = p_perfil
     AND COALESCE(l.ordem, 0) < 100
  UNION
  SELECT e.eq
    FROM public.fn_equipes_de_alcance(p_perfil) AS e(eq)
   WHERE NOT EXISTS (SELECT 1 FROM r);
$function$;

REVOKE ALL ON FUNCTION public.fn_setores_do_operador_no_mes(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_equipes_de_alcance_no_mes(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_setores_do_operador_no_mes(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_equipes_de_alcance_no_mes(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_setores_do_operador_no_mes(uuid, uuid, text) IS
  'Setores da pessoa NO MES: retrato no mes fechado, fn_setores_do_operador no corrente (20261031220000).';
COMMENT ON FUNCTION public.fn_equipes_de_alcance_no_mes(uuid, uuid, text) IS
  'Equipes de membro e lideranca da pessoa NO MES: retrato no mes fechado, fn_equipes_de_alcance no corrente (20261031220000).';

-- ── fn_analitico_dashboard_mes_json (2 + 2 troca(s)) ───────────────────
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

-- ── fn_analitico_resumo_por_operador (1 + 2 troca(s)) ──────────────────
CREATE OR REPLACE FUNCTION public.fn_analitico_resumo_por_operador(p_empresa_id uuid, p_mes text, p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS TABLE(operador_id uuid, operador_usuario text, operador_nome text, total_recebido numeric, total_ho numeric, total_pagamentos bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eu      UUID := (SELECT auth.uid());
  v_escopo  INTEGER;
  v_ops     UUID[] := '{}';
  v_setores UUID[] := '{}';
  v_de      DATE;
  v_ate     DATE;
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

  v_de  := COALESCE(p_inicio, (p_mes || '-01')::DATE);
  v_ate := COALESCE(p_fim, ((p_mes || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE);

  v_por_setor := p_mes >= '2026-09'
    AND EXISTS (SELECT 1 FROM public.empresas em WHERE em.id = p_empresa_id AND em.slug = 'bookplay');

  v_escopo := public.fn_user_escopo('analitico');

  IF v_escopo = 2 THEN
    v_setores := ARRAY(SELECT public.fn_setores_do_operador_no_mes(v_eu, p_empresa_id, p_mes));
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
    v_ops := ARRAY(
      SELECT public.fn_pessoas_das_equipes(
        ARRAY(SELECT public.fn_equipes_de_alcance_no_mes(v_eu, p_empresa_id, p_mes)))
      UNION
      SELECT v_eu
    );
    v_retrato := public.fn_retrato_pessoas_do_alcance(
      p_empresa_id, p_mes, ARRAY(SELECT public.fn_equipes_de_alcance_no_mes(v_eu, p_empresa_id, p_mes)), '{}');
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

-- ── fn_analitico_recebido_fora_do_setor (1 + 1 troca(s)) ───────────────
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
    v_setores := ARRAY(SELECT public.fn_setores_do_operador_no_mes(v_eu, p_empresa_id, p_mes));
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
    v_equipes := ARRAY(SELECT public.fn_equipes_de_alcance_no_mes(v_eu, p_empresa_id, p_mes));
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

-- ── O lugar no mês para a tela ──────────────────────────────────────────────
-- A tela pergunta aqui «onde eu estava» e recebe a MESMA resposta que as RPCs
-- usam para recortar. `null` em `equipe_principal` = sem equipe no mês.
-- `do_retrato` diz se a resposta veio da foto (mês fechado) ou de hoje.
CREATE OR REPLACE FUNCTION public.fn_meu_lugar_no_mes(p_empresa_id uuid, p_mes text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH eu AS (SELECT auth.uid() AS id),
  r AS (
    SELECT cm.equipe_id, cm.setor_id, cm.cargo
      FROM public.composicao_mes cm, eu
     WHERE public.fn_mes_fechado(p_mes)
       AND public.fn_can_access_empresa(p_empresa_id)
       AND cm.empresa_id  = p_empresa_id
       AND cm.mes         = p_mes
       AND cm.operador_id = eu.id
  )
  SELECT jsonb_build_object(
    'do_retrato', EXISTS (SELECT 1 FROM r),
    'setor_id', CASE WHEN EXISTS (SELECT 1 FROM r) THEN (SELECT r.setor_id FROM r)
                     ELSE (SELECT p.setor_id FROM public.perfis p, eu WHERE p.id = eu.id) END,
    'setores', COALESCE((SELECT jsonb_agg(s ORDER BY s)
                           FROM public.fn_setores_do_operador_no_mes((SELECT id FROM eu), p_empresa_id, p_mes) s), '[]'::jsonb),
    'equipes', COALESCE((SELECT jsonb_agg(e ORDER BY e)
                           FROM public.fn_equipes_de_alcance_no_mes((SELECT id FROM eu), p_empresa_id, p_mes) e), '[]'::jsonb),
    'equipes_lideradas', CASE WHEN EXISTS (SELECT 1 FROM r) THEN
        COALESCE((SELECT jsonb_agg(l.equipe_id ORDER BY l.ordem, l.equipe_id)
                    FROM public.composicao_mes_lider l, eu
                   WHERE l.empresa_id = p_empresa_id AND l.mes = p_mes
                     AND l.lider_id = eu.id AND COALESCE(l.ordem, 0) < 100), '[]'::jsonb)
      ELSE NULL END,
    -- A equipe do rótulo no retrato: a de membro; no líder, a primeira que lidera.
    'equipe_principal', CASE WHEN EXISTS (SELECT 1 FROM r) THEN (SELECT r.equipe_id FROM r) ELSE NULL END
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_meu_lugar_no_mes(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_meu_lugar_no_mes(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_meu_lugar_no_mes(uuid, text) IS
  'Setor e equipes de quem olha NO MES (retrato no mes fechado). Mesma regra do recorte das RPCs do mes (20261031220000).';

-- ── Prova: no mês corrente, o lugar novo é o de hoje ────────────────────────
DO $prova$
DECLARE
  v_mes TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_dif BIGINT;
BEGIN
  SELECT count(*) INTO v_dif
    FROM public.perfis p
   WHERE p.empresa_id IS NOT NULL
     AND (
       ARRAY(SELECT x FROM public.fn_setores_do_operador(p.id) x WHERE x IS NOT NULL ORDER BY 1)
         IS DISTINCT FROM
       ARRAY(SELECT x FROM public.fn_setores_do_operador_no_mes(p.id, p.empresa_id, v_mes) x ORDER BY 1)
       OR
       ARRAY(SELECT x FROM public.fn_equipes_de_alcance(p.id) x ORDER BY 1)
         IS DISTINCT FROM
       ARRAY(SELECT x FROM public.fn_equipes_de_alcance_no_mes(p.id, p.empresa_id, v_mes) x ORDER BY 1)
     );
  IF v_dif > 0 THEN
    RAISE EXCEPTION 'PROVA: o lugar do mês corrente mudou para % pessoa(s) — nada foi aplicado', v_dif;
  END IF;
  RAISE NOTICE 'PROVA: lugar do mês corrente idêntico ao de hoje';
END
$prova$;

COMMIT;
