-- ============================================================================
-- A pessoa está nas equipes em que está — e o recebimento conta em todas
-- ============================================================================
--
-- ## A regra (29/09/2026)
--
-- «Ou a pessoa está em uma equipe e tem uma equipe, ou a pessoa não está em
-- uma equipe e ela não tem uma equipe, isso para líderes ou operadores.»
-- «Se tem 2 equipes, soma em todas que faz parte, não só em uma, só não
-- duplica o recebimento no geral.»
--
-- Está numa equipe quem a tela de Equipes mostra nela, por um destes três
-- caminhos:
--
--   membro  `perfis.equipe_id` de quem NÃO tem cargo `lider`. No líder esse
--           campo é resíduo do modelo antigo: a tela o esconde das listas de
--           membros e nunca o edita. Deixa de valer em todo lugar.
--   líder   `equipe_lideres` — TODAS as que lidera.
--   clone   `equipe_operadores_clones`.
--
-- A mesma regra do app, em `src/services/equipes/equipeDoLider.ts`.
--
-- ## O que estava errado (medido na BookPlay, setembro/2026, antes daqui)
--
--   * Quem liderava mais de uma equipe não contava em NENHUMA: Brunno (6),
--     Samara (5), Yann (4), Daniele (2). R$ 0 no mês, mas a regra estava errada.
--   * O `perfis.equipe_id` do líder ainda decidia coisas: Tamires Valentin, que
--     não lidera nada, contava em «Maria - Capitã» pelo resíduo.
--   * O recorte do ranking/cards (`fn_analitico_resumo_por_operador`) e do
--     dashboard olhava o CADASTRO de quem recebeu: o líder de uma equipe em
--     outro setor, ou o co-líder de uma equipe, ficava de fora da lista e do
--     card de quem olhava. Não pegava ninguém hoje (os 34 líderes da BookPlay
--     têm setor igual ao da equipe), mas com a soma em todas as equipes o
--     líder de equipes em setores diferentes passaria a sumir.
--
-- ## O que muda
--
--   fn_equipes_do_operador          membro + líder + clone (era membro + clone)
--   fn_pessoas_das_equipes (nova)   o inverso: quem está nestas equipes
--   fn_equipes_de_alcance           líder nunca responde pelo resíduo
--   fn_equipe_principal             a única equipe; havendo várias, a de membro
--   fn_operador_no_meu_alcance_de_equipe  «só a minha» pelo pertencimento
--   fn_analitico_resumo_por_operador      recorte pelo pertencimento de quem recebeu
--   fn_analitico_dashboard_mes_json       idem, no ramo «só a minha»
--   fn_composicao_mes_snapshot            o retrato guarda TODAS as equipes
--
-- Só funções e um índice. Nenhuma linha de dados muda. O retrato de mês já
-- fechado não se reescreve (regra de 20260903330000) — vale do mês corrente em
-- diante.
--
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

-- Os clones passam a ser procurados por pessoa em todo recorte (a chave única
-- da tabela começa por `equipe_id` e não serve a essa busca).
create index if not exists idx_equipe_operadores_clones_operador
  on public.equipe_operadores_clones (operador_id);

-- ── As equipes de uma pessoa ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_equipes_do_operador(p_operador uuid)
 RETURNS TABLE(equipe_id uuid, setor_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT e.id, e.setor_id
    FROM public.perfis p
    JOIN public.equipes e ON e.id = p.equipe_id
   WHERE p.id = p_operador
     AND p.perfil IS DISTINCT FROM 'lider'
  UNION
  SELECT e.id, e.setor_id
    FROM public.equipe_lideres el
    JOIN public.equipes e ON e.id = el.equipe_id
   WHERE el.lider_id = p_operador
  UNION
  SELECT e.id, e.setor_id
    FROM public.equipe_operadores_clones c
    JOIN public.equipes e ON e.id = c.equipe_id
   WHERE c.operador_id = p_operador;
$function$;

COMMENT ON FUNCTION public.fn_equipes_do_operador(uuid) IS
  'Equipes em que a pessoa esta, com o setor de cada uma: membro (perfis.equipe_id, '
  'exceto cargo lider), lider (equipe_lideres) e clone. Ver 20260929120000.';

-- ── Quem está nestas equipes ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pessoas_das_equipes(p_equipes uuid[])
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p.id
    FROM public.perfis p
   WHERE p.equipe_id = ANY(p_equipes)
     AND p.perfil IS DISTINCT FROM 'lider'
  UNION
  SELECT el.lider_id
    FROM public.equipe_lideres el
   WHERE el.equipe_id = ANY(p_equipes)
  UNION
  SELECT c.operador_id
    FROM public.equipe_operadores_clones c
   WHERE c.equipe_id = ANY(p_equipes);
$function$;

COMMENT ON FUNCTION public.fn_pessoas_das_equipes(uuid[]) IS
  'Quem esta nas equipes dadas — membro, lider ou clone. O inverso de '
  'fn_equipes_do_operador. So para uso interno das funcoes de recorte.';

-- Interna: quem chama são funções SECURITY DEFINER, que executam como dono.
REVOKE ALL ON FUNCTION public.fn_pessoas_das_equipes(uuid[]) FROM public, anon, authenticated;

-- ── As equipes por onde a pessoa responde ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_equipes_de_alcance(p_perfil uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT el.equipe_id
    FROM public.equipe_lideres el
   WHERE el.lider_id = p_perfil
  UNION
  SELECT p.equipe_id
    FROM public.perfis p
   WHERE p.id = p_perfil
     AND p.equipe_id IS NOT NULL
     AND p.perfil IS DISTINCT FROM 'lider';
$function$;

COMMENT ON FUNCTION public.fn_equipes_de_alcance(uuid) IS
  'Equipes por onde a pessoa responde: as que lidera, mais a de membro (no cargo '
  'lider o perfis.equipe_id e residuo e nao conta). Ver 20260929120000.';

CREATE OR REPLACE FUNCTION public.fn_equipe_principal(p_perfil uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH p AS (
    SELECT perfil, equipe_id FROM public.perfis WHERE id = p_perfil
  ), todas AS (
    SELECT array_agg(a.equipe_id) AS lista
      FROM public.fn_equipes_de_alcance(p_perfil) AS a(equipe_id)
  )
  SELECT CASE
           WHEN cardinality(todas.lista) = 1 THEN todas.lista[1]
           WHEN p.perfil IS DISTINCT FROM 'lider' THEN p.equipe_id
         END
    FROM p CROSS JOIN todas;
$function$;

COMMENT ON FUNCTION public.fn_equipe_principal(uuid) IS
  'A equipe que vale quando so cabe uma (config por equipe): a unica em que a '
  'pessoa esta; havendo varias, a de membro. Lider de varias nao tem principal. '
  'Mesma regra de equipesDoPerfil no app. Ver 20260929120000.';

-- ── Acordos, escopo «só a minha» ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_operador_no_meu_alcance_de_equipe(p_operador uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    -- Todas as equipes: basta a pessoa estar em ALGUMA equipe de um setor meu.
    WHEN public.fn_user_tem('dashboard_escopo_equipe_todas') THEN EXISTS (
      SELECT 1 FROM public.fn_equipes_do_operador(p_operador) dele
       WHERE dele.setor_id IN (
         SELECT public.fn_setores_do_operador((SELECT auth.uid()))
       )
    )
    -- Só a minha: a pessoa está (membro, líder ou clone) numa equipe por onde
    -- eu respondo. Olhar só o `perfis.equipe_id` dela deixava de fora o líder
    -- da equipe, que não tem esse campo (20260929120000).
    ELSE EXISTS (
      SELECT 1
        FROM public.fn_equipes_do_operador(p_operador) dele
       WHERE dele.equipe_id IN (SELECT public.fn_equipes_de_alcance((SELECT auth.uid())))
    )
  END;
$function$;

-- ── Ranking, lista por operador e cards de equipe do analítico ─────────────

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
  ELSIF v_escopo < 2 THEN
    -- Equipe: quem está nas equipes por onde eu respondo, e eu.
    v_ops := ARRAY(
      SELECT public.fn_pessoas_das_equipes(
        ARRAY(SELECT public.fn_equipes_de_alcance(v_eu)))
      UNION
      SELECT v_eu
    );
  END IF;

  RETURN QUERY
  SELECT
    ar.operador_id,
    MIN(ar.operador_usuario) AS operador_usuario,
    p.nome AS operador_nome,
    SUM(ar.valor_recebido)::NUMERIC AS total_recebido,
    SUM(ar.total_ho)::NUMERIC AS total_ho,
    COUNT(*)::BIGINT AS total_pagamentos
  FROM public.analitico_recebimentos ar
  LEFT JOIN public.perfis p ON p.id = ar.operador_id
  WHERE ar.empresa_id = p_empresa_id
    AND ar.operador_id IS NOT NULL
    AND COALESCE(p.perfil, '') <> 'super_admin'
    AND ar.data_pagamento BETWEEN v_de AND v_ate
    AND (v_escopo >= 3 OR ar.operador_id = ANY(v_ops))
  GROUP BY ar.operador_id, p.nome
  ORDER BY total_recebido DESC;
END;
$function$;

-- ── Dashboard do analítico ─────────────────────────────────────────────────
-- Setor e «todas as equipes» já passam por `fn_equipes_do_operador`, que agora
-- inclui a liderança. Só o ramo «só a minha» muda.

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

-- ── O retrato do mês ───────────────────────────────────────────────────────
-- Só a equipe do rótulo e a lista das demais mudam; travas, `v_fechado`, os
-- DELETEs, a liderança do retrato e o log ficam letra por letra.

CREATE OR REPLACE FUNCTION public.fn_composicao_mes_snapshot(p_empresa_id uuid, p_mes text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linhas          INTEGER;
  v_equipes         INTEGER;
  v_lideres         INTEGER;
  v_setores         INTEGER;
  v_antes_operador  INTEGER;
  v_antes_equipe    INTEGER;
  v_mes_corrente    TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_fechado         BOOLEAN;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.fn_can_access_empresa(p_empresa_id)
    OR NOT (
      public.fn_user_is_super_admin()
      OR public.fn_user_has_any_role(
        ARRAY['lider','elite','gerencia','diretoria','administrador']
      )
    )
  ) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: usuário não pode gerar este retrato'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NULL
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: sessão ausente' USING ERRCODE = '42501';
  END IF;

  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  SELECT count(*) INTO v_antes_operador
    FROM public.composicao_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes;
  SELECT count(*) INTO v_antes_equipe
    FROM public.composicao_mes_equipe
   WHERE empresa_id = p_empresa_id AND mes = p_mes;

  v_fechado := p_mes < v_mes_corrente AND v_antes_operador > 0;

  IF NOT v_fechado THEN
    DELETE FROM public.composicao_mes        WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_equipe WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_lider  WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_setor  WHERE empresa_id = p_empresa_id AND mes = p_mes;
  END IF;

  INSERT INTO public.composicao_mes_setor
    (empresa_id, mes, setor_id, nome, ativo, alternativo)
  SELECT p_empresa_id, p_mes, s.id, s.nome,
         COALESCE(s.ativo, TRUE), COALESCE(s.alternativo, FALSE)
    FROM public.setores s
   WHERE s.empresa_id = p_empresa_id
     AND (NOT v_fechado OR NOT EXISTS (
       SELECT 1 FROM public.composicao_mes_setor cs
        WHERE cs.empresa_id = p_empresa_id AND cs.mes = p_mes AND cs.setor_id = s.id))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_setores = ROW_COUNT;

  INSERT INTO public.composicao_mes_equipe
    (empresa_id, mes, equipe_id, nome, setor_id)
  SELECT p_empresa_id, p_mes, e.id, e.nome, e.setor_id
    FROM public.equipes e
   WHERE e.empresa_id = p_empresa_id
     AND (NOT v_fechado OR NOT EXISTS (
       SELECT 1 FROM public.composicao_mes_equipe ce
        WHERE ce.empresa_id = p_empresa_id AND ce.mes = p_mes AND ce.equipe_id = e.id))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_equipes = ROW_COUNT;

  INSERT INTO public.composicao_mes_lider (empresa_id, mes, equipe_id, lider_id, ordem)
  WITH explicitos AS (
    SELECT el.equipe_id, el.lider_id, el.criado_em
      FROM public.equipe_lideres el
      JOIN public.perfis p ON p.id = el.lider_id AND p.perfil = 'lider'
     WHERE el.empresa_id = p_empresa_id
  ),
  ja_lidera AS (SELECT DISTINCT lider_id FROM explicitos),
  reserva AS (
    SELECT e.id AS equipe_id, p.id AS lider_id, p.nome
      FROM public.equipes e
      JOIN public.perfis p ON p.equipe_id = e.id AND p.perfil = 'lider'
     WHERE e.empresa_id = p_empresa_id
       AND p.id NOT IN (SELECT lider_id FROM ja_lidera)
       AND NOT EXISTS (SELECT 1 FROM explicitos x WHERE x.equipe_id = e.id)
    UNION
    SELECT c.equipe_id, p.id, p.nome
      FROM public.equipe_operadores_clones c
      JOIN public.perfis p ON p.id = c.operador_id AND p.perfil = 'lider'
     WHERE c.empresa_id = p_empresa_id
       AND p.id NOT IN (SELECT lider_id FROM ja_lidera)
       AND NOT EXISTS (SELECT 1 FROM explicitos x WHERE x.equipe_id = c.equipe_id)
  ),
  lista AS (
    SELECT equipe_id, lider_id,
           row_number() OVER (PARTITION BY equipe_id ORDER BY criado_em, lider_id)::INTEGER AS ordem
      FROM explicitos
    UNION ALL
    SELECT equipe_id, lider_id,
           (100 + row_number() OVER (PARTITION BY equipe_id ORDER BY nome, lider_id))::INTEGER
      FROM reserva
  )
  SELECT p_empresa_id, p_mes, l.equipe_id, l.lider_id, l.ordem
    FROM lista l
   WHERE NOT v_fechado OR NOT EXISTS (
     SELECT 1 FROM public.composicao_mes_lider cl
      WHERE cl.empresa_id = p_empresa_id AND cl.mes = p_mes AND cl.equipe_id = l.equipe_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_lideres = ROW_COUNT;

  INSERT INTO public.composicao_mes
    (empresa_id, mes, operador_id, equipe_id, equipe_nome, setor_id,
     situacao, equipes_clone,
     nome, usuario, email, cargo, foto_url, ativo, desligado_em)
  SELECT p_empresa_id, p_mes, p.id, v.equipe_id,
         COALESCE(e.nome, 'Sem equipe'), COALESCE(e.setor_id, p.setor_id),
         COALESCE(p.situacao, 'ativo'),
         -- As OUTRAS equipes em que a pessoa está: as que lidera além da do
         -- rótulo, e os clones que contam. O app soma o recebimento em todas
         -- (`equipesExtrasPorOperador`) sem duplicar setor nem geral.
         COALESCE((
           SELECT array_agg(DISTINCT x.equipe_id)
             FROM (
               SELECT el.equipe_id
                 FROM public.equipe_lideres el
                WHERE el.empresa_id = p_empresa_id AND el.lider_id = p.id
               UNION
               SELECT c.equipe_id
                 FROM public.equipe_operadores_clones c
                WHERE c.empresa_id = p_empresa_id
                  AND c.operador_id = p.id
                  AND COALESCE(c.conta_recebimento, TRUE)
             ) x
            WHERE x.equipe_id IS DISTINCT FROM v.equipe_id
         ), '{}'::UUID[]),
         p.nome, p.usuario, p.email, p.perfil::TEXT, p.foto_url,
         COALESCE(p.ativo, TRUE), p.desligado_em
    FROM public.perfis p
    -- A equipe do RÓTULO: a de membro; sem ela, a primeira que lidera. No
    -- cargo `lider` o `perfis.equipe_id` é resíduo e não conta (20260929120000).
    LEFT JOIN LATERAL (
      SELECT el.equipe_id
        FROM public.equipe_lideres el
       WHERE el.empresa_id = p_empresa_id AND el.lider_id = p.id
       ORDER BY el.criado_em, el.equipe_id
       LIMIT 1
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT CASE
               WHEN p.perfil = 'lider' THEN l.equipe_id
               ELSE COALESCE(p.equipe_id, l.equipe_id)
             END AS equipe_id
    ) v ON TRUE
    LEFT JOIN public.equipes e ON e.id = v.equipe_id
   WHERE p.empresa_id = p_empresa_id
     AND (NOT v_fechado OR NOT EXISTS (
       SELECT 1 FROM public.composicao_mes cm
        WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes AND cm.operador_id = p.id))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  PERFORM public.fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'info',
    p_descricao  => CASE WHEN v_fechado THEN format(
      'Completou a composição do mês fechado %s — %s operador(es), %s equipe(s), %s liderança(s) e %s setor(es) que faltavam',
      p_mes, v_linhas, v_equipes, v_lideres, v_setores
    ) ELSE format(
      'Regerou a composição do mês %s — %s operador(es), %s equipe(s), %s liderança(s) e %s setor(es)',
      p_mes, v_linhas, v_equipes, v_lideres, v_setores
    ) END,
    p_empresa_id => p_empresa_id,
    p_tabela     => 'composicao_mes',
    p_alvo_tipo  => 'composicao_mes',
    p_alvo_rotulo=> p_mes,
    p_detalhes   => jsonb_build_object(
      'mes', p_mes, 'preservado', v_fechado,
      'operadores', v_linhas, 'equipes', v_equipes,
      'lideres', v_lideres, 'setores', v_setores,
      'operadores_antes', v_antes_operador, 'equipes_antes', v_antes_equipe
    ),
    p_origem     => 'automatico'
  );

  RETURN v_linhas;
END;
$function$;

COMMENT ON FUNCTION public.fn_composicao_mes_snapshot(uuid, text) IS
  'Congela o mes: vinculo (equipe, setor, TODAS as equipes em que a pessoa esta, '
  'situacao) E identidade (nome, login, email, cargo, foto). Mes corrente '
  'reescreve; mes fechado so acrescenta quem falta e nunca reescreve quem ja esta '
  'la. Ver 20260929120000.';

commit;
