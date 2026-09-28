-- ============================================================================
-- Líder tem equipe — em todo lugar que pergunta «qual é a minha equipe?»
-- ============================================================================
--
-- ## O defeito (28/09/2026)
--
-- «Os líderes do comercial estão configurados numa equipe, e na lista de
-- usuários aparece que a liderança não está em nenhuma equipe.»
--
-- Há dois lugares que dizem de que equipe alguém é:
--
--   perfis.equipe_id   o cadastro do MEMBRO. Para líder é resíduo do modelo
--                      antigo: a tela de Equipes nunca o preenche nem o mostra.
--   equipe_lideres     a liderança, explícita desde 20260725b. É onde a tela
--                      de Equipes grava o líder.
--
-- Medido: dos 50 líderes ativos, 33 têm a equipe SÓ em `equipe_lideres`, com o
-- cadastro vazio — os 8 do Comercial que lideram inclusive (outros 11 não lideram
-- equipe nenhuma, e 6 têm cadastro). Toda pergunta «qual é a MINHA
-- equipe?» feita ao cadastro respondia «nenhuma» para eles. No banco eram seis
-- funções; no app, a coluna da lista de usuários e ~15 telas.
--
-- ## A regra, uma só (a de `src/services/equipes/equipeDoLider.ts`)
--
--   fn_equipes_de_alcance(p)  as equipes por onde a pessoa responde: as que
--                             ela lidera; mais a do cadastro, EXCETO quando
--                             ela é `lider` e já lidera alguma — aí o
--                             cadastro é resíduo (caso Maria Oliveira: lidera
--                             «Maria - Capitã», cadastro em «Digital Bruno»,
--                             que é do Brunno).
--   fn_equipe_principal(p)    UMA equipe, para o que precisa de uma só
--                             (config de Direto/Extra): líder → a única que
--                             lidera, senão o cadastro; demais → o cadastro,
--                             senão a única que lidera. Quem lidera várias e
--                             não tem cadastro fica sem principal — escolher
--                             uma no escuro seria pior.
--
-- ## O que muda
--
--   fn_operador_no_meu_alcance_de_equipe  RLS de acordos, escopo «só a minha»
--   fn_analitico_dashboard_mes_json       Dashboard do analítico, idem
--   fn_analitico_resumo_por_operador      ranking do analítico (equipe e setor)
--   fn_chat_monitoraveis / _posso_monitorar  monitor do chat (equipe e setor)
--   fn_direto_extra_ativo                 a config de Direto/Extra da equipe
--
-- Vendas, Indicações, RH, Pix e o chat de contatos já usavam liderança
-- (`fn_equipes_com_lideranca`, `fn_setores_do_operador`) e ficam como estão.
--
-- Reexecutável. Só funções; nenhuma linha de dados muda.
-- ============================================================================

begin;

set local lock_timeout = '15s';

create or replace function public.fn_equipes_de_alcance(p_perfil uuid)
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select el.equipe_id
    from public.equipe_lideres el
   where el.lider_id = p_perfil
  union
  select p.equipe_id
    from public.perfis p
   where p.id = p_perfil
     and p.equipe_id is not null
     and (p.perfil <> 'lider'
          or not exists (select 1 from public.equipe_lideres el2 where el2.lider_id = p_perfil));
$function$;

comment on function public.fn_equipes_de_alcance(uuid) is
  'Equipes por onde a pessoa responde: as que lidera, mais a do cadastro (para lider que ja lidera, o cadastro e residuo). Ver 20260928210000.';

create or replace function public.fn_equipe_principal(p_perfil uuid)
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  with p as (
    select perfil, equipe_id from public.perfis where id = p_perfil
  ), lid as (
    select case when count(distinct el.equipe_id) = 1
                then (array_agg(el.equipe_id))[1] end as unica
      from public.equipe_lideres el
     where el.lider_id = p_perfil
  )
  select case when p.perfil = 'lider'
              then coalesce(lid.unica, p.equipe_id)
              else coalesce(p.equipe_id, lid.unica) end
    from p cross join lid;
$function$;

comment on function public.fn_equipe_principal(uuid) is
  'A equipe que vale para a pessoa quando so cabe uma (config por equipe). Mesma regra de equipeQueCredita no app. Ver 20260928210000.';

revoke all on function public.fn_equipes_de_alcance(uuid) from public, anon;
revoke all on function public.fn_equipe_principal(uuid) from public, anon;
grant execute on function public.fn_equipes_de_alcance(uuid) to authenticated, service_role;
grant execute on function public.fn_equipe_principal(uuid) to authenticated, service_role;

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
    -- So a minha: as equipes que eu lidero, ou a do meu cadastro
    -- (`fn_equipes_de_alcance`, 20260928210000). Olhar so o cadastro deixava o
    -- lider — que esta em `equipe_lideres`, com o cadastro vazio — sem equipe.
    ELSE EXISTS (
      SELECT 1
        FROM public.perfis dele
       WHERE dele.id = p_operador
         AND dele.equipe_id IS NOT NULL
         AND dele.equipe_id IN (SELECT public.fn_equipes_de_alcance((SELECT auth.uid())))
    )
  END;
$function$;

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
      -- «Só a minha»: as equipes que eu lidero, ou a do meu cadastro
      -- (`fn_equipes_de_alcance`, 20260928210000), e eu mesmo.
      v_operadores := array(
        select dele.id
          from public.perfis dele
         where dele.empresa_id = p_empresa_id
           and (dele.id = v_eu
                or (dele.equipe_id is not null
                    and dele.equipe_id in (select public.fn_equipes_de_alcance(v_eu))))
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

CREATE OR REPLACE FUNCTION public.fn_analitico_resumo_por_operador(p_empresa_id uuid, p_mes text, p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS TABLE(operador_id uuid, operador_usuario text, operador_nome text, total_recebido numeric, total_ho numeric, total_pagamentos bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_escopo INTEGER;
  v_equipe_id UUID;
  v_setor_id UUID;
  v_ops_setor UUID[] := '{}';
  -- As equipes e os setores por onde respondo — liderança incluída
  -- (20260928210000). O cadastro sozinho deixava o líder sem equipe.
  v_equipes UUID[] := '{}';
  v_setores UUID[] := '{}';
  v_de DATE;
  v_ate DATE;
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

  SELECT p.equipe_id, p.setor_id
    INTO v_equipe_id, v_setor_id
  FROM public.perfis p
  WHERE p.id = auth.uid();

  v_equipes := ARRAY(SELECT public.fn_equipes_de_alcance(auth.uid()));
  v_setores := ARRAY(SELECT public.fn_setores_do_operador(auth.uid()));

  IF v_escopo = 2 AND cardinality(v_setores) > 0 THEN
    v_ops_setor := ARRAY(
      SELECT pf.id
        FROM public.perfis pf
       WHERE pf.setor_id = ANY(v_setores)
      UNION
      SELECT c.operador_id
        FROM public.equipe_operadores_clones c
        JOIN public.equipes e ON e.id = c.equipe_id
       WHERE e.setor_id = ANY(v_setores)
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
    AND (
      v_escopo >= 3
      OR (v_escopo = 2 AND ar.operador_id = ANY(v_ops_setor))
      OR (
        v_escopo < 2
        AND cardinality(v_equipes) > 0
        AND (
          p.equipe_id = ANY(v_equipes)
          OR ar.operador_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.equipe_operadores_clones c
            WHERE c.operador_id = ar.operador_id
              AND c.equipe_id = ANY(v_equipes)
          )
        )
      )
      OR (
        v_escopo < 2
        AND cardinality(v_equipes) = 0
        AND ar.operador_id = auth.uid()
      )
    )
  GROUP BY ar.operador_id, p.nome
  ORDER BY total_recebido DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_chat_monitoraveis(p_busca text DEFAULT NULL::text)
 RETURNS TABLE(perfil_id uuid, nome text, usuario text, foto_url text, cargo text, setor_nome text, empresa_slug text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_eu     UUID := (SELECT auth.uid());
  v_meu    RECORD;
  v_super  BOOLEAN;
  v_todos  BOOLEAN := FALSE;
  v_setor  BOOLEAN := FALSE;
  v_equipe BOOLEAN := FALSE;
  v_termo  TEXT := NULLIF(BTRIM(p_busca), '');
BEGIN
  IF v_eu IS NULL OR NOT public.fn_user_tem('chat_monitor') THEN
    RETURN;
  END IF;

  SELECT p.perfil, p.empresa_id, p.setor_id, p.equipe_id, p.acesso_multiempresa
    INTO v_meu
    FROM public.perfis p
   WHERE p.id = v_eu;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_super := v_meu.perfil = 'super_admin';
  IF NOT v_super THEN
    v_todos := public.fn_user_tem('chat_monitor_escopo_todos_setores');
    IF NOT v_todos THEN
      -- Setores e equipes por onde respondo, liderança incluída (20260928210000).
      v_setor  := EXISTS (SELECT 1 FROM public.fn_chat_setores_do_perfil(v_eu))
                  AND public.fn_user_tem('chat_monitor_escopo_setor');
      v_equipe := EXISTS (SELECT 1 FROM public.fn_equipes_de_alcance(v_eu))
                  AND public.fn_user_tem('chat_monitor_escopo_equipe');
      IF NOT (v_setor OR v_equipe) THEN
        RETURN;
      END IF;
    END IF;
  END IF;

  RETURN QUERY
  SELECT p.id, p.nome::TEXT, p.usuario::TEXT, p.foto_url::TEXT, p.perfil::TEXT,
         s.nome::TEXT, e.slug::TEXT
    FROM public.perfis p
    LEFT JOIN public.setores  s ON s.id = p.setor_id
    LEFT JOIN public.empresas e ON e.id = p.empresa_id
   WHERE COALESCE(p.arquivado, FALSE) = FALSE
     AND p.ativo
     AND p.id <> v_eu
     AND (
       v_super
       OR (
         -- Fora da empresa so com acesso multiempresa.
         (p.empresa_id IS NOT DISTINCT FROM v_meu.empresa_id
          OR COALESCE(v_meu.acesso_multiempresa, FALSE))
         AND (
           v_todos
           OR (v_setor  AND p.setor_id  IN (SELECT s.setor_id FROM public.fn_chat_setores_do_perfil(v_eu) s))
           OR (v_equipe AND p.equipe_id IN (SELECT public.fn_equipes_de_alcance(v_eu)))
         )
       )
     )
     AND (
       v_termo IS NULL
       OR p.nome    ILIKE '%' || v_termo || '%'
       OR p.usuario ILIKE '%' || v_termo || '%'
     )
   ORDER BY p.nome
   LIMIT 60;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_chat_posso_monitorar(p_alvo uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_eu    UUID := (SELECT auth.uid());
  v_meu   RECORD;
  v_alvo  RECORD;
BEGIN
  IF v_eu IS NULL OR p_alvo IS NULL OR p_alvo = v_eu THEN
    RETURN FALSE;
  END IF;

  SELECT perfil, empresa_id, setor_id, equipe_id, acesso_multiempresa
    INTO v_meu FROM public.perfis WHERE id = v_eu;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- `perfil` entrou aqui: e o cargo do ALVO que decide a linha logo abaixo.
  SELECT perfil, empresa_id, setor_id, equipe_id
    INTO v_alvo FROM public.perfis WHERE id = p_alvo;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Super admin alcanca todo mundo, inclusive outro super admin. Fica ANTES da
  -- trava para nao travar a si mesmo.
  IF v_meu.perfil = 'super_admin' THEN RETURN TRUE; END IF;

  -- Ninguem mais monitora administrador nem super admin. Trava de CARGO, e nao
  -- de escopo: escopo se mexe no painel de permissoes, isto nao.
  IF v_alvo.perfil IN ('administrador', 'super_admin') THEN RETURN FALSE; END IF;

  IF NOT public.fn_user_tem('chat_monitor') THEN RETURN FALSE; END IF;

  IF v_alvo.empresa_id IS DISTINCT FROM v_meu.empresa_id
     AND NOT COALESCE(v_meu.acesso_multiempresa, FALSE) THEN
    RETURN FALSE;
  END IF;

  IF public.fn_user_tem('chat_monitor_escopo_todos_setores') THEN
    RETURN TRUE;
  END IF;

  -- Setores e equipes por onde respondo, liderança incluída (20260928210000).
  IF public.fn_user_tem('chat_monitor_escopo_setor')
     AND v_alvo.setor_id IN (SELECT s.setor_id FROM public.fn_chat_setores_do_perfil(v_eu) s) THEN
    RETURN TRUE;
  END IF;

  IF public.fn_user_tem('chat_monitor_escopo_equipe')
     AND v_alvo.equipe_id IN (SELECT public.fn_equipes_de_alcance(v_eu)) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_direto_extra_ativo(p_user_id uuid, p_empresa_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_setor_id  UUID;
  v_equipe_id UUID;
  v_ativo     BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: empresa fora do escopo do usuário'
      USING ERRCODE = '42501';
  END IF;

  -- A equipe que vale para a pessoa: para líder, a que ele lidera
  -- (`fn_equipe_principal`, 20260928210000).
  SELECT p.setor_id, public.fn_equipe_principal(p.id)
    INTO v_setor_id, v_equipe_id
    FROM public.perfis p
   WHERE p.id = p_user_id
     AND p.empresa_id = p_empresa_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT c.ativo INTO v_ativo
    FROM public.direto_extra_config c
   WHERE c.empresa_id = p_empresa_id
     AND c.escopo = 'usuario'
     AND c.referencia_id = p_user_id
   LIMIT 1;
  IF FOUND THEN RETURN v_ativo; END IF;

  IF v_equipe_id IS NOT NULL THEN
    SELECT c.ativo INTO v_ativo
      FROM public.direto_extra_config c
     WHERE c.empresa_id = p_empresa_id
       AND c.escopo = 'equipe'
       AND c.referencia_id = v_equipe_id
     LIMIT 1;
    IF FOUND THEN RETURN v_ativo; END IF;
  END IF;

  IF v_setor_id IS NOT NULL THEN
    SELECT c.ativo INTO v_ativo
      FROM public.direto_extra_config c
     WHERE c.empresa_id = p_empresa_id
       AND c.escopo = 'setor'
       AND c.referencia_id = v_setor_id
     LIMIT 1;
    IF FOUND THEN RETURN v_ativo; END IF;
  END IF;

  RETURN FALSE;
END;
$function$;

commit;
