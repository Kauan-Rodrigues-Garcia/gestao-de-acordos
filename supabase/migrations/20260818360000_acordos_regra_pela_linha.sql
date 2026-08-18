-- ============================================================================
-- Acordos: a regra passa a olhar a empresa DA LINHA, nao a do cracha
-- ============================================================================
--
-- ## O defeito
--
-- Robson e `diretoria` com empresa de origem PaguePlay e acesso multiempresa.
-- Ao abrir a lista de Acordos — que e tela da BookPlay — nao vinha nada.
--
-- As quatro policies de `acordos` decidem em dois ramos:
--
--     ... OR (fn_user_empresa_is_bookplay() AND role in (administrador, diretoria) ...)
--     ... OR ((NOT fn_user_empresa_is_bookplay()) AND role in (lider, administrador))
--
-- e `fn_user_empresa_is_bookplay()` responde sobre a empresa do PERFIL, nao
-- sobre a empresa da linha:
--
--     SELECT EXISTS (SELECT 1 FROM perfis p JOIN empresas e ON e.id = p.empresa_id
--                     WHERE p.id = auth.uid() AND lower(e.slug) = 'bookplay')
--
-- Robson e da PaguePlay, entao para ele a funcao e FALSE mesmo quando a linha e
-- da BookPlay. O segundo ramo assume o comando e exige cargo `lider` ou
-- `administrador` — `diretoria` nao esta la. Resultado: zero linhas, nas duas
-- empresas.
--
-- ## Por que isso so apareceu agora
--
-- Antes do acesso multiempresa, o gate de empresa garantia que toda linha
-- visivel era da empresa do usuario. "A empresa do cracha" e "a empresa da
-- linha" eram sempre a mesma coisa, e escrever uma no lugar da outra nao tinha
-- consequencia. O acesso multiempresa separou as duas, e a diferenca virou bug.
--
-- ## A correcao
--
-- A pergunta certa sempre foi sobre a LINHA: uma linha da BookPlay segue as
-- regras da BookPlay, uma da PaguePlay segue as da PaguePlay — independente de
-- onde esta lotado quem consulta.
--
--     fn_user_empresa_is_bookplay()  ->  empresa_id = fn_empresa_id_bookplay()
--
-- Para quem NAO tem acesso multiempresa nada muda: o gate de empresa que vem
-- antes ja garante `empresa_id` = empresa do usuario, entao a nova expressao
-- responde exatamente o que a antiga respondia.
--
-- ## Custo
--
-- `fn_empresa_id_bookplay()` nao recebe argumento, entao vira InitPlan e roda
-- UMA vez por consulta; o que sobra por linha e uma comparacao de uuid. Uma
-- funcao que recebesse `empresa_id` rodaria por linha — o mesmo cuidado da
-- migration `20260818300000`.
--
-- ## O que NAO se mexe aqui
--
-- O ramo da PaguePlay continua sendo `lider` e `administrador`, sem `diretoria`.
-- Isso vem de antes de tudo isto e nunca foi notado porque Acordos e um modulo
-- so da BookPlay (`hiddenForPaguePay` no menu) — uma diretoria da PaguePlay
-- nunca teve acordos proprios para ver. Abrir esse ramo e decisao de negocio,
-- nao conserto de bug, e nao entra numa migration que se anuncia como correcao.
-- Com a troca acima, a diretoria da PaguePlay ja passa a enxergar os acordos da
-- BookPlay, que era o que faltava.
-- ============================================================================

-- ── A empresa da linha ────────────────────────────────────────────────────
--
-- SECURITY DEFINER porque `empresas` tem RLS (`empresas_select` e
-- `ativo = true`): sem isso, desativar a empresa um dia faria a funcao devolver
-- NULL e as duas pontas do `case` ficariam falsas ao mesmo tempo — ninguem
-- veria acordo nenhum, e o motivo estaria a tres saltos de distancia.

create or replace function public.fn_empresa_id_bookplay()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select e.id from public.empresas e where lower(e.slug) = 'bookplay' limit 1;
$fn$;

comment on function public.fn_empresa_id_bookplay() is
  'Id da empresa BookPlay. Sem argumento de proposito: assim vira InitPlan na policy e roda uma vez por consulta, nao por linha.';

revoke execute on function public.fn_empresa_id_bookplay() from public;
revoke execute on function public.fn_empresa_id_bookplay() from anon;
grant  execute on function public.fn_empresa_id_bookplay() to authenticated;

-- ── As quatro policies de `acordos` ───────────────────────────────────────

do $sweep$
declare
  v_pol      record;
  v_qual     text;
  v_check    text;
  v_novo     constant text := '(empresa_id = ( SELECT fn_empresa_id_bookplay() AS fn_empresa_id_bookplay))';
  v_alterada integer := 0;
begin
  for v_pol in
    select p.polname                               as nome,
           pg_get_expr(p.polqual,      p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as chk
      from pg_policy p
      join pg_class     c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'acordos'
       and (coalesce(pg_get_expr(p.polqual,      p.polrelid), '') like '%fn_user_empresa_is_bookplay%'
         or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%fn_user_empresa_is_bookplay%')
  loop
    v_qual  := v_pol.qual;
    v_check := v_pol.chk;

    -- A forma envolvida em `( SELECT ... AS ...)` PRIMEIRO. Ao contrario, a
    -- troca da forma nua deixaria para tras um subselect correlacionado
    -- (`( SELECT (empresa_id = ...) AS ...)`) — valido, e avaliado por linha.
    v_qual := replace(v_qual,
      '( SELECT fn_user_empresa_is_bookplay() AS fn_user_empresa_is_bookplay)', v_novo);
    v_qual := replace(v_qual, 'fn_user_empresa_is_bookplay()', v_novo);

    v_check := replace(v_check,
      '( SELECT fn_user_empresa_is_bookplay() AS fn_user_empresa_is_bookplay)', v_novo);
    v_check := replace(v_check, 'fn_user_empresa_is_bookplay()', v_novo);

    if coalesce(v_qual, '')  like '%fn_user_empresa_is_bookplay%'
    or coalesce(v_check, '') like '%fn_user_empresa_is_bookplay%' then
      raise exception 'Policy acordos.% ficou com fn_user_empresa_is_bookplay: using=% check=%',
        v_pol.nome, v_qual, v_check;
    end if;

    if v_qual is not null and v_check is not null then
      execute format('alter policy %I on public.acordos using (%s) with check (%s)',
                     v_pol.nome, v_qual, v_check);
    elsif v_qual is not null then
      execute format('alter policy %I on public.acordos using (%s)', v_pol.nome, v_qual);
    else
      execute format('alter policy %I on public.acordos with check (%s)', v_pol.nome, v_check);
    end if;

    v_alterada := v_alterada + 1;
  end loop;

  if v_alterada = 0 then
    raise notice 'Nenhuma policy de acordos usava fn_user_empresa_is_bookplay — ja convertidas.';
  else
    raise notice 'Policies de acordos convertidas para a empresa da linha: %', v_alterada;
  end if;
end;
$sweep$;

-- `fn_user_empresa_is_bookplay()` continua existindo: ela responde uma pergunta
-- legitima ("a pessoa e da BookPlay?") e pode ter uso fora de policy. O que
-- saiu foi o uso dela como se fosse a empresa da linha.

-- ── Verificacao ───────────────────────────────────────────────────────────

do $ver$
declare
  v_sobrou text;
  v_bp     uuid;
begin
  select string_agg(c.relname || '.' || p.polname, ', ') into v_sobrou
    from pg_policy p
    join pg_class     c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and (coalesce(pg_get_expr(p.polqual,      p.polrelid), '') like '%fn_user_empresa_is_bookplay%'
       or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%fn_user_empresa_is_bookplay%');
  if v_sobrou is not null then
    raise exception 'Policies ainda decidindo pela empresa do cracha: %', v_sobrou;
  end if;

  -- A funcao tem que achar a BookPlay, senao os dois ramos ficam falsos juntos.
  select public.fn_empresa_id_bookplay() into v_bp;
  if v_bp is null then
    raise exception 'fn_empresa_id_bookplay() devolveu NULL — nenhuma empresa com slug bookplay';
  end if;

  -- E as quatro policies continuam de pe.
  if (select count(*) from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'acordos'
         and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%fn_empresa_id_bookplay%'
           or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%fn_empresa_id_bookplay%')) <> 4 then
    raise exception 'Esperadas 4 policies de acordos decidindo pela empresa da linha';
  end if;

  raise notice 'Acordos: regra decidida pela empresa da linha. Diretoria enxerga os acordos da BookPlay.';
end;
$ver$;
