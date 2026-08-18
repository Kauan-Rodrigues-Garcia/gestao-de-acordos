-- ============================================================================
-- Acesso multiempresa: a TERCEIRA forma do gate de empresa, e tres funcoes
-- ============================================================================
--
-- ## O defeito
--
-- Robson (gerencia) foi liberado para as duas empresas. Ao trocar de empresa,
-- so o Dashboard aparecia no menu.
--
-- Nao era o menu: era `cargos_permissoes`. Todo item do menu lateral, menos o
-- Dashboard, exige uma `permissaoKey`, e `useCargoPermissoes` le as permissoes
-- do cargo NA EMPRESA ATIVA. A policy de leitura dessa tabela e:
--
--     empresa_id IN (select perfis.empresa_id from perfis where perfis.id = auth.uid())
--
-- Trocando de empresa, a consulta voltava vazia, `permissoes` virava `{}` e
-- `temPermissao` respondia nao para tudo. Dashboard sobrava porque e o unico
-- item sem `permissaoKey`.
--
-- ## Por que a migration anterior nao pegou
--
-- `20260818300000` converteu 51 policies procurando pelo texto
-- `fn_user_empresa_id`. Esta forma nao usa a funcao — escreve a subconsulta a
-- `perfis` na mao. Sao TRES dialetos do mesmo gate no schema, nao dois:
--
--     A) fn_can_access_empresa(empresa_id)                      -- 68 policies
--     B) super_admin OR empresa_id = fn_user_empresa_id()       -- 51, ja feitas
--     C) empresa_id IN (select empresa_id from perfis where id = auth.uid())
--
-- Esta migration fecha o C. A busca agora e por `empresa_id` na expressao, nao
-- pelo nome de uma funcao — e a verificacao no fim vale para qualquer dialeto
-- futuro, inclusive um quarto.
--
-- ## O que NAO entra na conversao
--
-- Quatro policies do dialeto C tem checagem de cargo DENTRO da subconsulta
-- (`perfil = any(array['administrador','super_admin'])`): `cargos_admin_write` e
-- as tres de `tags`. Elas ficam como estao — e continuam certas. Quem recebe
-- acesso multiempresa e gerencia ou diretoria, nunca administrador, entao essas
-- policies ja negam nas duas empresas por cargo, e nao por empresa. Converter
-- ali seria dar poder de administrador a quem nao tem.
--
-- Duas policies mencionam `empresa_id` sem ser gate — passam a coluna como
-- ARGUMENTO para outra funcao: `autorizacoes_select` (fn_pode_autorizar_pedido)
-- e `metas_delete` (fn_meta_esta_bloqueada). Ficam de fora, e a verificacao no
-- fim as conhece pelo nome.
--
-- ## Duas funcoes que recusavam a outra empresa
--
-- O mesmo desenho aparece em `SECURITY DEFINER` que compara a empresa do
-- chamador com a empresa alvo e abre excecao so para super_admin:
--
--   fn_metas_upsert           'Permissao negada: empresa_id invalido'
--   fn_pode_autorizar_pedido  p.empresa_id = p_empresa_id
--
-- Nenhuma gravava na empresa errada — as duas recusavam, que e a falha certa.
-- Mas recusar tambem esta errado agora. As duas passam a perguntar
-- `fn_can_access_empresa`, que responde a mesma coisa de antes para todo mundo
-- que nao foi liberado.
--
-- (`fn_direto_extra_definir` tem o mesmo desenho e fica de fora — o porque esta
-- na Parte 2.)
--
-- `fn_pode_autorizar_pedido` merece nota: a troca vale so para o lado da
-- EMPRESA. A regra de setor continua igual, e o setor da empresa de origem nao
-- corresponde a nenhum setor da outra — entao uma gerencia liberada nao decide
-- pedidos de setor do outro lado, so diretoria decide, que ja e a visao ampla.
-- Isso e proposital: acesso multiempresa amplia o alcance, nao o cargo.
--
-- ## O que continua carimbando a empresa de origem
--
-- `fn_log_registrar` e `fn_uso_registrar` gravam log e telemetria com a empresa
-- do PERFIL, nao com a empresa que a pessoa esta olhando. Fica assim de
-- proposito: log e registro de quem fez, e quem fez pertence a uma empresa so.
-- ============================================================================

-- ── Parte 1: o dialeto C ──────────────────────────────────────────────────
--
-- Aqui a expressao inteira E o gate, entao ela e ENVOLVIDA em vez de editada
-- por dentro — mais seguro que casar texto multilinha vindo de `pg_get_expr`.
-- O laco recusa envolver qualquer expressao que tenha checagem de cargo junto:
-- envolver uma dessas daria a quem foi liberado um poder que o cargo nao da.

do $sweep$
declare
  v_alvo     record;
  v_qual     text;
  v_check    text;
  v_alterada integer := 0;
begin
  for v_alvo in
    select * from (values
      ('cargos_permissoes',     'cargos_select_empresa'),
      ('composicao_mes',        'composicao_mes_leitura'),
      ('composicao_mes_equipe', 'composicao_mes_equipe_leitura'),
      ('lixeira_acordos',       'lixeira_acordos_select_empresa'),
      ('lixeira_acordos',       'lixeira_insert_empresa_2026'),
      ('notificacoes',          'notificacoes_insert_empresa_2026'),
      ('nr_registros',          'nr_delete_authenticated'),
      ('nr_registros',          'nr_insert_authenticated'),
      ('nr_registros',          'nr_select_authenticated'),
      ('nr_registros',          'nr_update_authenticated'),
      ('profissionais',         'prof_select')
    ) as t(tabela, policy)
  loop
    select pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)
      into v_qual, v_check
      from pg_policy p
      join pg_class     c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_alvo.tabela and p.polname = v_alvo.policy;

    if v_qual is null and v_check is null then
      raise exception 'Policy %.% nao existe — o schema mudou desde o levantamento',
        v_alvo.tabela, v_alvo.policy;
    end if;

    -- Ja convertida: migration reaplicada nao empilha a excecao de novo.
    if coalesce(v_qual, '')  like '%fn_user_acesso_multiempresa%'
    or coalesce(v_check, '') like '%fn_user_acesso_multiempresa%' then
      continue;
    end if;

    -- A trava que impede escalada de poder: so se envolve expressao que e o
    -- gate de empresa e nada mais.
    if coalesce(v_qual, '')  ~* 'perfil\s*=\s*ANY|fn_user_has_any_role'
    or coalesce(v_check, '') ~* 'perfil\s*=\s*ANY|fn_user_has_any_role' then
      raise exception
        'Policy %.% tem checagem de cargo junto do gate — envolver daria poder que o cargo nao da',
        v_alvo.tabela, v_alvo.policy;
    end if;

    if v_qual is not null then
      v_qual := format('(fn_user_acesso_multiempresa() OR (%s))', v_qual);
    end if;
    if v_check is not null then
      v_check := format('(fn_user_acesso_multiempresa() OR (%s))', v_check);
    end if;

    if v_qual is not null and v_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)',
                     v_alvo.policy, v_alvo.tabela, v_qual, v_check);
    elsif v_qual is not null then
      execute format('alter policy %I on public.%I using (%s)',
                     v_alvo.policy, v_alvo.tabela, v_qual);
    else
      execute format('alter policy %I on public.%I with check (%s)',
                     v_alvo.policy, v_alvo.tabela, v_check);
    end if;

    v_alterada := v_alterada + 1;
  end loop;

  raise notice 'Policies do dialeto C convertidas: %', v_alterada;
end;
$sweep$;

-- ── Parte 2: as tres funcoes ──────────────────────────────────────────────

-- Quem decide um pedido de autorizacao. O lado da EMPRESA passa a aceitar quem
-- foi liberado; a regra de SETOR nao muda — ver o cabecalho.
create or replace function public.fn_pode_autorizar_pedido(
  p_empresa_id uuid,
  p_setores    uuid[]
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select exists (
    select 1
      from public.perfis p
     where p.id = auth.uid()
       and public.fn_can_access_empresa(p_empresa_id)
       and (
         -- Visao da empresa inteira.
         p.perfil in ('diretoria','administrador','super_admin')
         -- Quem lidera um setor decide os pedidos daquele setor — inclusive os
         -- de quem esta ali como CLONE. Array vazio (solicitante sem setor
         -- nenhum) cai so para os de visao ampla, de proposito: pedido sem
         -- setor nao tem lider natural, e deixa-lo visivel para todo lider da
         -- empresa devolveria o ruido que o recorte existe para tirar.
         or (p.perfil in ('lider','elite','gerencia')
             and p.setor_id is not null
             and p.setor_id = any(coalesce(p_setores, '{}'::uuid[])))
       )
  )
  or public.fn_user_is_super_admin();
$fn$;

-- Salvar metas. O `empresa_id` vem no payload da tela, que manda a empresa
-- ATIVA — a conferencia so precisava deixar de ser "a minha ou nada".
create or replace function public.fn_metas_upsert(p_payloads jsonb)
returns table(salvos integer, bloqueados jsonb)
language plpgsql
security definer
set search_path to 'public'
as $fn$
DECLARE
  v_perfil     TEXT;
  v_item       JSONB;
  v_tipo       TEXT;
  v_ref        UUID;
  v_emp_item   UUID;
  v_mes        INTEGER;
  v_ano        INTEGER;
  v_ind_ativa  BOOLEAN;
  v_ind_valor  NUMERIC;
  v_salvos     INTEGER := 0;
  v_bloqueados JSONB := '[]'::JSONB;
BEGIN
  SELECT perfil::text INTO v_perfil FROM public.perfis WHERE id = auth.uid();

  IF v_perfil IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;
  IF v_perfil NOT IN ('administrador','lider','super_admin','elite','gerencia') THEN
    RAISE EXCEPTION 'Permissão negada: cargo % não pode salvar metas', v_perfil;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payloads) LOOP
    v_tipo     := v_item->>'tipo';
    v_ref      := (v_item->>'referencia_id')::UUID;
    v_emp_item := (v_item->>'empresa_id')::UUID;
    v_mes      := (v_item->>'mes')::INTEGER;
    v_ano      := (v_item->>'ano')::INTEGER;

    -- Era `v_emp_item != v_empresa AND v_perfil != 'super_admin'`. A pergunta
    -- passa a ser a mesma do resto do schema, e responde igual para quem nao
    -- tem acesso multiempresa.
    IF NOT public.fn_can_access_empresa(v_emp_item) THEN
      RAISE EXCEPTION 'Permissão negada: empresa_id inválido';
    END IF;

    IF public.fn_meta_esta_bloqueada(v_tipo, v_ref, v_emp_item, v_mes, v_ano) THEN
      v_bloqueados := v_bloqueados || jsonb_build_object('referencia_id', v_ref, 'tipo', v_tipo);
      CONTINUE;
    END IF;

    -- Meta indireta so existe para OPERADOR. Setor e equipe nao tem recebimento
    -- indireto proprio; aceitar o campo ali criaria um numero que nenhuma tela
    -- sabe cobrar.
    v_ind_ativa := COALESCE((v_item->>'meta_indireta_ativa')::BOOLEAN, false) AND v_tipo = 'operador';
    v_ind_valor := CASE WHEN v_ind_ativa
                        THEN COALESCE((v_item->>'meta_indireta_valor')::NUMERIC, 0)
                        ELSE 0 END;

    -- Ligada sem valor nao passa no CHECK e derrubaria o lote inteiro. Vale
    -- mais desligar em silencio do que perder as outras metas do salvamento.
    IF v_ind_ativa AND v_ind_valor <= 0 THEN
      v_ind_ativa := false;
      v_ind_valor := 0;
    END IF;

    INSERT INTO public.metas
      (tipo, referencia_id, empresa_id, meta_valor, meta_acordos, meta_proporcional,
       metas_extras, meta_indireta_ativa, meta_indireta_valor, mes, ano)
    VALUES (
      v_tipo, v_ref, v_emp_item,
      (v_item->>'meta_valor')::NUMERIC,
      COALESCE((v_item->>'meta_acordos')::INTEGER, 0),
      COALESCE((v_item->>'meta_proporcional')::BOOLEAN, false),
      COALESCE(v_item->'metas_extras', '[]'::jsonb),
      v_ind_ativa, v_ind_valor,
      v_mes, v_ano
    )
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE SET
      meta_valor        = EXCLUDED.meta_valor,
      meta_acordos      = EXCLUDED.meta_acordos,
      meta_proporcional = EXCLUDED.meta_proporcional,
      metas_extras      = CASE WHEN v_item ? 'metas_extras' THEN EXCLUDED.metas_extras ELSE public.metas.metas_extras END,
      -- Só sobrescreve quando a tela mandou.
      meta_indireta_ativa = CASE WHEN v_item ? 'meta_indireta_ativa'
                                 THEN EXCLUDED.meta_indireta_ativa
                                 ELSE public.metas.meta_indireta_ativa END,
      meta_indireta_valor = CASE WHEN v_item ? 'meta_indireta_ativa'
                                 THEN EXCLUDED.meta_indireta_valor
                                 ELSE public.metas.meta_indireta_valor END,
      updated_at        = now();

    v_salvos := v_salvos + 1;
  END LOOP;

  RETURN QUERY SELECT v_salvos, v_bloqueados;
END;
$fn$;

-- `fn_direto_extra_definir` fica de fora, e nao por esquecimento.
--
-- Ela tambem compara a empresa do chamador com `p_empresa_id` e so abre para
-- super_admin. Mas a unica tela que a chama e a aba "Direto e Extra" dentro de
-- Configuracoes, cuja rota exige cargo `administrador` — e acesso multiempresa
-- so vai para gerencia e diretoria. Ninguem que recebe a liberacao alcanca essa
-- funcao. Reescrever o corpo dela para consertar um caminho que nao existe
-- custaria cirurgia de texto em `prosrc`, com risco real, por zero ganho.
--
-- Se um dia Configuracoes abrir para gerencia, a linha a trocar e esta:
--     if v_empresa is distinct from p_empresa_id and v_perfil <> 'super_admin'
-- por `if not public.fn_can_access_empresa(p_empresa_id)`.

-- ── Grants ────────────────────────────────────────────────────────────────
--
-- `create or replace function` nao mexe em ACL de funcao que ja existia, mas
-- conferir e barato e o default privilege do Supabase ja repos `anon` antes
-- neste projeto. Ver `20260818240000`.

do $grants$
declare
  v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('fn_metas_upsert', 'fn_pode_autorizar_pedido')
  loop
    execute format('revoke execute on function %s from public', v_fn.assinatura);
    execute format('revoke execute on function %s from anon',   v_fn.assinatura);
    execute format('grant  execute on function %s to authenticated', v_fn.assinatura);
  end loop;
end;
$grants$;

-- ── Verificacao ───────────────────────────────────────────────────────────
--
-- Desta vez a rede e larga: qualquer policy que mencione `empresa_id` e nao
-- saiba do acesso multiempresa e apontada, seja qual for o dialeto. As unicas
-- dispensadas estao na lista, cada uma com o motivo.

do $ver$
declare
  v_sobrou text;
  v_faltou text;
begin
  select string_agg(c.relname || '.' || p.polname, ', ' order by c.relname, p.polname) into v_sobrou
    from pg_policy p
    join pg_class     c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%empresa_id%'
       or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%empresa_id%')
     and coalesce(pg_get_expr(p.polqual, p.polrelid), '')      not like '%fn_can_access_empresa%'
     and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%fn_can_access_empresa%'
     and coalesce(pg_get_expr(p.polqual, p.polrelid), '')      not like '%fn_user_acesso_multiempresa%'
     and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%fn_user_acesso_multiempresa%'
     and (c.relname, p.polname) not in (
       -- Gate por CARGO (administrador/super_admin) dentro da subconsulta: quem
       -- recebe multiempresa e gerencia/diretoria e ja e negado por cargo.
       ('cargos_permissoes', 'cargos_admin_write'),
       ('tags', 'tags_insert'), ('tags', 'tags_update'), ('tags', 'tags_delete'),
       -- `empresa_id` aqui e ARGUMENTO de outra funcao, nao gate.
       ('autorizacoes_pedidos', 'autorizacoes_select'),
       ('metas', 'metas_delete')
     );

  if v_sobrou is not null then
    raise exception 'Policies que ainda prendem o usuario a empresa de origem: %', v_sobrou;
  end if;

  -- As duas funcoes convertidas.
  select string_agg(x.nome, ', ') into v_faltou
    from (values ('fn_metas_upsert'), ('fn_pode_autorizar_pedido')) as x(nome)
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = x.nome
        and p.prosrc like '%fn_can_access_empresa%'
   );
  if v_faltou is not null then
    raise exception 'Funcao ainda comparando empresa na mao: %', v_faltou;
  end if;

  -- E a policy que causou o defeito, nominalmente.
  if not exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
     where c.relname = 'cargos_permissoes' and p.polname = 'cargos_select_empresa'
       and pg_get_expr(p.polqual, p.polrelid) like '%fn_user_acesso_multiempresa%'
  ) then
    raise exception 'cargos_select_empresa nao foi convertida — o menu continuaria so com Dashboard';
  end if;

  raise notice 'Gate de empresa fechado nos tres dialetos. O menu volta ao trocar de empresa.';
end;
$ver$;
