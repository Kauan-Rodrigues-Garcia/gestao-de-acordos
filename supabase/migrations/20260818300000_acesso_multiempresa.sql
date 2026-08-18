-- ============================================================================
-- Acesso as duas empresas para gerencia/diretoria escolhidos pelo super_admin
-- ============================================================================
--
-- ## O que muda
--
-- Ate aqui, ver o conteudo das duas empresas era privilegio exclusivo de
-- `super_admin`: `fn_can_access_empresa` devolvia true para ele e, para todo o
-- resto, so para a propria empresa. O seletor de empresa no cabecalho seguia a
-- mesma regra.
--
-- Agora o super_admin pode liberar nominalmente usuarios de `gerencia` ou
-- `diretoria`. Quem for liberado enxerga as duas empresas e ganha o botao de
-- trocar de empresa.
--
-- ## O gate de empresa mora em DOIS lugares, e os dois precisam saber
--
-- 68 policies chamam `fn_can_access_empresa(empresa_id)`. Outras 51 escrevem a
-- mesma regra inline:
--
--     fn_user_is_super_admin() OR (empresa_id = fn_user_empresa_id())
--
-- Enquanto o unico caso especial era o super_admin, dava no mesmo. Com um
-- segundo caso especial, nao da: `perfis`, `acordos`, `analitico_recebimentos`,
-- `diario_recebimentos`, `comemoracoes`, `solicitacoes_whatsapp` e mais uma
-- duzia continuariam presas a empresa de origem. O usuario liberado trocaria de
-- empresa, veria o nome e as cores da outra — e telas vazias.
--
-- ## Por que a substituicao nao vira `fn_can_access_empresa(empresa_id)`
--
-- Seria o obvio, e seria mais lento. `pg_get_expr` mostra que as policies
-- grandes hoje escrevem `( SELECT fn_user_empresa_id() AS ...)`: o `SELECT` sem
-- referencia a coluna vira InitPlan e roda UMA vez na consulta inteira. Trocar
-- por uma chamada que recebe `empresa_id` como argumento a transforma em
-- chamada POR LINHA — em `analitico_recebimentos` (24 mil linhas) isso e 24 mil
-- consultas a `perfis` onde antes havia uma.
--
-- Entao a substituicao acrescenta a excecao ao lado, preservando o InitPlan:
--
--     (empresa_id = ( SELECT fn_user_empresa_id() AS ...))
--  -> (( SELECT fn_user_acesso_multiempresa()) OR (empresa_id = ( SELECT ...)))
--
-- O `OR fn_user_is_super_admin()` que vier antes fica onde esta. Mexer nele
-- mudaria policies como `perfis_admin_all`, onde o super_admin passa POR FORA
-- da checagem de cargo — e ele perderia acesso, nao ganharia.
--
-- ## Hoje isso nao muda nada para ninguem
--
-- Enquanto ninguem for liberado, `fn_user_acesso_multiempresa()` e false para
-- todo mundo e cada expressao acima responde exatamente o que respondia antes.
-- Reverter na pratica e revogar o acesso de todos — nao precisa desfazer DDL.
--
-- ## O que o usuario liberado ve, e o que nao ve
--
-- Ele ve a outra empresa COM O PROPRIO CARGO, nao com poderes de super_admin.
-- Onde a policy exige setor (`acordos_select` para gerencia na BookPlay, por
-- exemplo), o setor da empresa de origem nao casa com os setores da outra e a
-- lista vem curta. Cargo `diretoria`, liberado por cargo e nao por setor na
-- maioria das telas, atravessa inteiro. E a diferenca esperada entre "ver a
-- outra empresa" e "ser super_admin".
--
-- Tres funcoes seguem presas a empresa de origem porque nao recebem empresa por
-- parametro: `fn_wpp_diretorio`, `fn_creators_lab_ranking` e
-- `fn_creators_lab_descobridores`. Sao diretorio de nomes e ranking de easter
-- egg — nenhuma decide acesso a dado de operacao.
--
-- ## O cargo e conferido na hora, nao na hora de liberar
--
-- `fn_user_acesso_multiempresa` exige `acesso_multiempresa = true` E cargo atual
-- em (gerencia, diretoria). Um liberado que for rebaixado perde o acesso no
-- mesmo instante, sem depender de alguem lembrar de revogar. Este projeto ja
-- levou quatro bugs do padrao "registro antigo que continua valendo" (Direto/
-- Extra por escopo, foto de lider removido); a flag sozinha seria o quinto.
-- ============================================================================

-- ── A liberacao ───────────────────────────────────────────────────────────

alter table public.perfis
  add column if not exists acesso_multiempresa        boolean not null default false,
  add column if not exists acesso_multiempresa_por_id uuid references public.perfis(id) on delete set null,
  add column if not exists acesso_multiempresa_em     timestamptz;

comment on column public.perfis.acesso_multiempresa is
  'Liberado pelo super_admin para ver as duas empresas. So vale com cargo atual gerencia/diretoria — ver fn_user_acesso_multiempresa.';
comment on column public.perfis.acesso_multiempresa_por_id is
  'Quem liberou. Fica gravado para a lista em Configuracoes dizer de quem foi a decisao.';

create index if not exists idx_perfis_acesso_multiempresa
  on public.perfis (acesso_multiempresa) where acesso_multiempresa;

-- ── Quem tem, de fato ─────────────────────────────────────────────────────

create or replace function public.fn_user_acesso_multiempresa()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select exists (
    select 1
      from public.perfis p
     where p.id = auth.uid()
       and p.acesso_multiempresa
       and p.perfil in ('gerencia', 'diretoria')
  );
$fn$;

comment on function public.fn_user_acesso_multiempresa() is
  'true quando o usuario foi liberado pelo super_admin E o cargo atual ainda e gerencia/diretoria. O cargo e conferido na hora: rebaixamento corta o acesso sem precisar revogar a flag.';

-- As 68 policies (e as funcoes do analitico) que ja passavam por aqui.

create or replace function public.fn_can_access_empresa(target_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  SELECT public.fn_user_is_super_admin()
      OR public.fn_user_acesso_multiempresa()
      OR target_empresa_id = public.fn_user_empresa_id();
$fn$;

comment on function public.fn_can_access_empresa(uuid) is
  'O gate de empresa do schema. Passam: super_admin, quem tem acesso multiempresa liberado, e todo mundo na propria empresa.';

-- ── As 51 policies que escreviam o gate inline ────────────────────────────

do $sweep$
declare
  v_pol      record;
  v_qual     text;
  v_check    text;
  v_col      text;
  v_alterada integer := 0;
begin
  for v_pol in
    select c.relname                               as tabela,
           p.polname                               as nome,
           pg_get_expr(p.polqual,      p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as chk
      from pg_policy p
      join pg_class     c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and (coalesce(pg_get_expr(p.polqual,      p.polrelid), '') like '%fn_user_empresa_id%'
         or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%fn_user_empresa_id%')
       -- Ja convertida (migration reaplicada): nao empilhar a excecao de novo.
       and coalesce(pg_get_expr(p.polqual,      p.polrelid), '') not like '%fn_user_acesso_multiempresa%'
       and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%fn_user_acesso_multiempresa%'
  loop
    v_qual  := v_pol.qual;
    v_check := v_pol.chk;

    -- `pg_get_expr` imprime a comparacao de duas formas: direta, e envolvida
    -- num `( SELECT ... AS alias)` quando o planejador a marcou como InitPlan.
    -- As duas aparecem no schema e as duas precisam ser trocadas.
    foreach v_col in array array['empresa_id', 'destino_empresa_id'] loop
      v_qual := replace(v_qual,
        format('(%s = fn_user_empresa_id())', v_col),
        format('(fn_user_acesso_multiempresa() OR (%s = fn_user_empresa_id()))', v_col));
      v_qual := replace(v_qual,
        format('(%s = ( SELECT fn_user_empresa_id() AS fn_user_empresa_id))', v_col),
        format('(( SELECT fn_user_acesso_multiempresa()) OR (%s = ( SELECT fn_user_empresa_id() AS fn_user_empresa_id)))', v_col));

      v_check := replace(v_check,
        format('(%s = fn_user_empresa_id())', v_col),
        format('(fn_user_acesso_multiempresa() OR (%s = fn_user_empresa_id()))', v_col));
      v_check := replace(v_check,
        format('(%s = ( SELECT fn_user_empresa_id() AS fn_user_empresa_id))', v_col),
        format('(( SELECT fn_user_acesso_multiempresa()) OR (%s = ( SELECT fn_user_empresa_id() AS fn_user_empresa_id)))', v_col));
    end loop;

    -- Sobrou mencao sem a excecao ao lado: e uma forma nao prevista. Parar aqui
    -- e melhor que deixar meia policy convertida.
    if (coalesce(v_qual, '')  like '%fn_user_empresa_id%' and coalesce(v_qual, '')  not like '%fn_user_acesso_multiempresa%')
    or (coalesce(v_check, '') like '%fn_user_empresa_id%' and coalesce(v_check, '') not like '%fn_user_acesso_multiempresa%') then
      raise exception
        'Policy %.% usa fn_user_empresa_id numa forma nao prevista. using=% check=%',
        v_pol.tabela, v_pol.nome, v_qual, v_check;
    end if;

    if v_qual is not null and v_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)',
                     v_pol.nome, v_pol.tabela, v_qual, v_check);
    elsif v_qual is not null then
      execute format('alter policy %I on public.%I using (%s)',
                     v_pol.nome, v_pol.tabela, v_qual);
    else
      execute format('alter policy %I on public.%I with check (%s)',
                     v_pol.nome, v_pol.tabela, v_check);
    end if;

    v_alterada := v_alterada + 1;
  end loop;

  raise notice 'Policies com gate inline atualizadas: %', v_alterada;
end;
$sweep$;

-- ── So o super_admin mexe na liberacao ────────────────────────────────────
--
-- `perfis` tem UPDATE liberado para administrador (`perfis_admin_all`) e para
-- lider/elite/gerencia sobre o proprio setor (`perfis_lider_update`). Sem esta
-- trava, um administrador — ou uma gerencia sobre um subordinado — ligaria a
-- flag por baixo, e a tela de Configuracoes deixaria de ser a fonte da verdade.
--
-- `auth.uid() is null` passa de proposito: e o caso de migration, `service_role`
-- e job de manutencao, que ja passam por cima de RLS de qualquer forma.

create or replace function public.fn_perfis_guardar_multiempresa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.acesso_multiempresa        is distinct from old.acesso_multiempresa
  or new.acesso_multiempresa_por_id is distinct from old.acesso_multiempresa_por_id
  or new.acesso_multiempresa_em     is distinct from old.acesso_multiempresa_em then
    if auth.uid() is not null and not public.fn_user_is_super_admin() then
      raise exception 'Acesso multiempresa so pode ser alterado por super_admin'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_perfis_guardar_multiempresa on public.perfis;
create trigger trg_perfis_guardar_multiempresa
  before update on public.perfis
  for each row execute function public.fn_perfis_guardar_multiempresa();

-- ── As RPCs da tela ───────────────────────────────────────────────────────

create or replace function public.fn_multiempresa_listar()
returns table (
  usuario_id    uuid,
  nome          text,
  email         text,
  perfil        text,
  foto_url      text,
  empresa_nome  text,
  e_super_admin boolean,
  concedido_por text,
  concedido_em  timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select p.id, p.nome, p.email, p.perfil, p.foto_url,
         e.nome,
         p.perfil = 'super_admin',
         q.nome,
         p.acesso_multiempresa_em
    from public.perfis p
    left join public.empresas e on e.id = p.empresa_id
    left join public.perfis   q on q.id = p.acesso_multiempresa_por_id
   where public.fn_user_is_super_admin()
     and coalesce(p.arquivado, false) = false
     and (
       p.perfil = 'super_admin'
       or (p.acesso_multiempresa and p.perfil in ('gerencia', 'diretoria'))
     )
   order by (p.perfil = 'super_admin') desc, p.nome;
$fn$;

comment on function public.fn_multiempresa_listar() is
  'Quem enxerga as duas empresas: super_admins (por cargo, nao removivel) e os liberados nominalmente. So responde para super_admin.';

create or replace function public.fn_multiempresa_elegiveis()
returns table (
  usuario_id   uuid,
  nome         text,
  email        text,
  perfil       text,
  foto_url     text,
  empresa_nome text
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select p.id, p.nome, p.email, p.perfil, p.foto_url, e.nome
    from public.perfis p
    left join public.empresas e on e.id = p.empresa_id
   where public.fn_user_is_super_admin()
     and p.perfil in ('gerencia', 'diretoria')
     and not p.acesso_multiempresa
     and coalesce(p.arquivado, false) = false
     and coalesce(p.situacao, 'ativo') <> 'desligado'
   order by e.nome, p.nome;
$fn$;

comment on function public.fn_multiempresa_elegiveis() is
  'Candidatos a liberacao: gerencia e diretoria ativos das duas empresas que ainda nao tem acesso.';

create or replace function public.fn_multiempresa_definir(
  p_usuario_id uuid,
  p_liberado   boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_perfil text;
  v_nome   text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  end if;

  if not public.fn_user_is_super_admin() then
    return jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  end if;

  select p.perfil, p.nome into v_perfil, v_nome
    from public.perfis p where p.id = p_usuario_id;

  if v_perfil is null then
    return jsonb_build_object('ok', false, 'erro', 'usuario_nao_encontrado');
  end if;

  -- Super_admin ja tem por cargo. Ligar a flag nele nao mudaria nada e faria a
  -- lista sugerir que o acesso dele depende de uma liberacao que pode ser tirada.
  if v_perfil = 'super_admin' then
    return jsonb_build_object('ok', false, 'erro', 'super_admin_ja_tem');
  end if;

  -- Revogar vale para qualquer cargo: e assim que se limpa a flag de quem foi
  -- rebaixado. Conceder e que exige o cargo certo.
  if p_liberado and v_perfil not in ('gerencia', 'diretoria') then
    return jsonb_build_object('ok', false, 'erro', 'cargo_nao_elegivel', 'perfil', v_perfil);
  end if;

  update public.perfis
     set acesso_multiempresa        = p_liberado,
         acesso_multiempresa_por_id = case when p_liberado then auth.uid() else null end,
         acesso_multiempresa_em     = case when p_liberado then now()      else null end
   where id = p_usuario_id;

  return jsonb_build_object('ok', true, 'liberado', p_liberado, 'nome', v_nome);
end;
$fn$;

comment on function public.fn_multiempresa_definir(uuid, boolean) is
  'Liga/desliga o acesso as duas empresas. So super_admin executa; so gerencia/diretoria recebem.';

-- ── Grants ────────────────────────────────────────────────────────────────
--
-- Ver `20260818240000_revogar_anon_nas_rpcs.sql`: `revoke ... from public` nao
-- basta, e `revoke ... from anon` sozinho tambem nao. Sao os dois, e depois a
-- devolucao explicita para `authenticated` — sem ela, as policies que CHAMAM
-- `fn_user_acesso_multiempresa` passariam a falhar com "permission denied".

do $grants$
declare
  v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'fn_user_acesso_multiempresa', 'fn_perfis_guardar_multiempresa',
         'fn_multiempresa_listar', 'fn_multiempresa_elegiveis',
         'fn_multiempresa_definir'
       )
  loop
    execute format('revoke execute on function %s from public', v_fn.assinatura);
    execute format('revoke execute on function %s from anon',   v_fn.assinatura);
    execute format('grant  execute on function %s to authenticated', v_fn.assinatura);
  end loop;
end;
$grants$;

-- ── Verificacao ───────────────────────────────────────────────────────────
--
-- Falha alto. Uma conversao "quase completa" e o pior desfecho possivel aqui:
-- entrega o botao de trocar de empresa e metade das telas vazias do outro lado.

do $ver$
declare
  v_sobrou text;
  v_falta  text;
begin
  -- Toda policy que fala de `fn_user_empresa_id` tem que ter a excecao ao lado.
  select string_agg(c.relname || '.' || p.polname, ', ' order by c.relname) into v_sobrou
    from pg_policy p
    join pg_class     c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and (
       (coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%fn_user_empresa_id%'
        and coalesce(pg_get_expr(p.polqual, p.polrelid), '') not like '%fn_user_acesso_multiempresa%')
       or
       (coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%fn_user_empresa_id%'
        and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%fn_user_acesso_multiempresa%')
     );
  if v_sobrou is not null then
    raise exception 'Policies ainda presas a empresa de origem: %', v_sobrou;
  end if;

  -- E o outro caminho do gate, o das 68 que chamam a funcao.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_can_access_empresa'
       and p.prosrc like '%fn_user_acesso_multiempresa%'
  ) then
    raise exception 'fn_can_access_empresa nao consulta fn_user_acesso_multiempresa';
  end if;

  select string_agg(x.nome, ', ') into v_falta
    from (values
      ('fn_user_acesso_multiempresa'), ('fn_multiempresa_listar'),
      ('fn_multiempresa_elegiveis'),   ('fn_multiempresa_definir')
    ) as x(nome)
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = x.nome
        and has_function_privilege('authenticated', p.oid, 'execute')
   );
  if v_falta is not null then
    raise exception 'Sem EXECUTE para authenticated (a tela quebraria): %', v_falta;
  end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'perfis' and t.tgname = 'trg_perfis_guardar_multiempresa'
  ) then
    raise exception 'Trigger que protege a flag de multiempresa nao foi criado';
  end if;

  raise notice 'Acesso multiempresa pronto. Ninguem liberado ainda — nada muda ate a tela conceder.';
end;
$ver$;
