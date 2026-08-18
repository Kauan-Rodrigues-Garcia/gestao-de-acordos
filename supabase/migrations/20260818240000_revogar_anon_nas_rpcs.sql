-- ============================================================================
-- Tirar o papel `anon` das RPCs que exigem sessao
-- ============================================================================
--
-- ## O que se descobriu
--
-- Doze funcoes do schema `public` estavam com EXECUTE concedido a `anon` — o
-- papel de quem chama a API sem login. Entre elas as quatro de autorizacao de
-- NR, a de Direto/Extra, a de recebimento indireto e as seis de monitoramento
-- de uso.
--
-- ## Por que aconteceu
--
-- As migrations diziam:
--
--     revoke all on function ... from public;
--     grant execute on function ... to authenticated;
--
-- e isso NAO basta neste projeto. O Supabase mantem um
-- `ALTER DEFAULT PRIVILEGES` no schema `public` que concede EXECUTE a `anon`,
-- `authenticated` e `service_role` em toda funcao nova. `revoke ... from public`
-- remove a concessao do pseudo-papel PUBLIC; nao toca numa concessao EXPLICITA
-- ao papel `anon`, que e o que o default privilege cria.
--
-- Migrations mais antigas do projeto ja acertavam isso — `fn_metas_upsert` e
-- `fn_transferir_acordo_nr` nao tem `anon` no ACL. As novas escaparam.
--
-- ## O que era possivel fazer com isso: nada
--
-- Verificado contra a producao com a chave anonima, sem sessao:
--
--   fn_direto_extra_definir      -> {"ok": false, "erro": "sem_sessao"}
--   fn_uso_por_pessoa            -> permission denied for function fn_user_empresa_id
--   fn_recebimento_indireto_mes  -> permission denied for function fn_user_is_super_admin
--
-- Toda funcao morre numa segunda tranca: as `SECURITY DEFINER` conferem
-- `auth.uid()` na primeira linha, e as `SECURITY INVOKER` dependem de helpers e
-- de policies que o `anon` tambem nao alcanca. Nao houve exposicao de dado nem
-- caminho de escrita.
--
-- Isto e higiene, nao remendo de incidente: a defesa nao deve depender de a
-- segunda tranca continuar la depois do proximo refactor.
-- ============================================================================

-- ## Sao DOIS caminhos, nao um
--
-- A primeira versao desta migration revogava so de `anon` e falhou na propria
-- verificacao, em `fn_pode_autorizar_pedido`. O ACL dela era:
--
--     {=X/postgres, postgres=X/postgres, anon=X/postgres, ...}
--
-- O `=X` inicial, sem papel antes do sinal, e a concessao ao pseudo-papel
-- PUBLIC — o default do PostgreSQL para funcao nova, que as migrations de
-- autorizacao nunca revogaram. Tirar de `anon` nao adianta enquanto PUBLIC
-- estiver la: `anon` continua alcancando a funcao por PUBLIC.
--
-- Entao o laco revoga dos DOIS e, logo depois, devolve a `authenticated` o que
-- ela precisa. A ordem importa: `revoke ... from public` atinge todo mundo, e
-- sem a devolucao explicita a policy `autorizacoes_select` — que CHAMA
-- `fn_pode_autorizar_pedido` — passaria a falhar com "permission denied", e com
-- ela toda leitura de `autorizacoes_pedidos`.

do $$
declare
  v_fn   record;
  v_qtd  integer := 0;
begin
  for v_fn in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         -- Autorizacao de NR por solicitacao (20260818180000 / 20260818200000)
         'fn_autorizacao_solicitar', 'fn_autorizacao_decidir',
         'fn_autorizacao_cancelar',  'fn_pode_autorizar_pedido',
         -- Direto/Extra por escopo (20260818220000)
         'fn_direto_extra_definir',
         -- Meta indireta (20260818160000)
         'fn_recebimento_indireto_mes',
         -- Monitoramento de uso (20260817180000 / 20260817200000 / 20260818140000)
         'fn_uso_por_pessoa', 'fn_uso_por_tela', 'fn_uso_por_dia',
         'fn_uso_adocao_tela', 'fn_uso_detalhe_pessoa', 'fn_uso_detalhe_pessoa_dias'
       )
  loop
    -- PUBLIC primeiro: enquanto ele tiver EXECUTE, tirar de `anon` nao muda
    -- nada — `anon` alcanca a funcao por PUBLIC de qualquer forma.
    execute format('revoke execute on function %s from public', v_fn.assinatura);
    execute format('revoke execute on function %s from anon',   v_fn.assinatura);
    -- E devolve a quem precisa. `revoke ... from public` atinge todo mundo, e
    -- `authenticated` sem EXECUTE quebraria ate a policy que chama a funcao.
    execute format('grant execute on function %s to authenticated', v_fn.assinatura);
    v_qtd := v_qtd + 1;
  end loop;

  raise notice 'EXECUTE ajustado em % funcao(oes).', v_qtd;
end;
$$;

-- `fn_uso_registrar` fica FORA da lista de proposito: ela e chamada de dentro de
-- um efeito de navegacao, e ja devolve em silencio quando `auth.uid()` e nulo.
-- Nao ha nada a ganhar tirando `anon` dela, e ha o que perder se algum caminho
-- de telemetria rodar antes de a sessao assentar.

-- ── Verificacao ────────────────────────────────────────────────────────────
--
-- Falha alto se sobrou alguma. Uma revogacao "quase completa" e pior que
-- nenhuma: da a sensacao de estar fechado.

do $$
declare
  v_sobrou text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_sobrou
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'fn_autorizacao_solicitar', 'fn_autorizacao_decidir',
       'fn_autorizacao_cancelar',  'fn_pode_autorizar_pedido',
       'fn_direto_extra_definir',  'fn_recebimento_indireto_mes',
       'fn_uso_por_pessoa', 'fn_uso_por_tela', 'fn_uso_por_dia',
       'fn_uso_adocao_tela', 'fn_uso_detalhe_pessoa', 'fn_uso_detalhe_pessoa_dias'
     )
     and has_function_privilege('anon', p.oid, 'execute');

  if v_sobrou is not null then
    raise exception 'Ainda executaveis por anon: %', v_sobrou;
  end if;
end;
$$;

-- ── E que `authenticated` nao tenha sido levada junto ──────────────────────

do $$
declare
  v_faltou text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_faltou
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'fn_autorizacao_solicitar', 'fn_autorizacao_decidir',
       'fn_autorizacao_cancelar',  'fn_pode_autorizar_pedido',
       'fn_direto_extra_definir',  'fn_recebimento_indireto_mes',
       'fn_uso_por_pessoa', 'fn_uso_por_tela', 'fn_uso_por_dia',
       'fn_uso_adocao_tela', 'fn_uso_detalhe_pessoa', 'fn_uso_detalhe_pessoa_dias'
     )
     and not has_function_privilege('authenticated', p.oid, 'execute');

  if v_faltou is not null then
    raise exception 'Sem EXECUTE para authenticated (o app quebraria): %', v_faltou;
  end if;
end;
$$;
