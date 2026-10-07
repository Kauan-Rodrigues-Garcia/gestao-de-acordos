-- ============================================================================
-- Desempenho: 4 policies que recalculavam o usuário por linha, e 8 índices de
-- chave estrangeira em tabelas grandes (auditoria, 07/10/2026)
-- ============================================================================
--
-- ## Policies (advisor `auth_rls_initplan`)
--
-- `auth.uid()` e as funções sem argumento de linha (`fn_user_tem('x')`,
-- `fn_user_is_super_admin()`, `fn_user_setor_id()`) eram chamadas uma vez POR
-- LINHA. Dentro de `(select ...)` o Postgres calcula uma vez por consulta.
-- A regra é a mesma, expressão por expressão — só muda quantas vezes roda.
-- Funções que dependem da linha (`fn_pode_autorizar_pedido`,
-- `fn_ajuste_no_meu_alcance`) ficam como estavam.
--
-- Definições de partida lidas do banco em 07/10/2026 (pg_policies).
--
-- ## Índices (advisor `unindexed_foreign_keys`)
--
-- Só as chaves em tabelas grandes e lidas por pessoa/setor. Sem índice, apagar
-- ou transferir uma pessoa varre as 110 mil linhas de `mestre_recebimentos`,
-- as 100 mil do diário e as 74 mil do analítico. `CREATE INDEX` comum: as
-- tabelas são pequenas o bastante para o índice sair em segundos (a gravação
-- nelas espera esse tempo).
--
-- ## O que NÃO entra
--
-- Remover os 84 índices "sem uso": `pg_stat_database.stats_reset` está nulo,
-- então não se sabe desde quando o uso é contado — pode ser desde um reinício
-- recente. Sem essa janela, apagar índice é chute.
-- ============================================================================

-- 1) perfis_empresas_acesso
alter policy perfis_empresas_acesso_select on public.perfis_empresas_acesso
  using ((perfil_id = (select auth.uid())) or (select public.fn_user_is_super_admin()));

-- 2) autorizacoes_pedidos
alter policy autorizacoes_select on public.autorizacoes_pedidos
  using ((solicitante_id = (select auth.uid()))
         or public.fn_pode_autorizar_pedido(empresa_id, setores_escopo));

-- 3) analitico_ajustes_manuais
alter policy ajustes_insert on public.analitico_ajustes_manuais
  with check (
    ((empresa_id = any ((select public.fn_empresas_acessiveis())::uuid[]))
      or (select public.fn_user_is_super_admin()))
    and ((select public.fn_user_tem('ajuste_recebimento_lancar'))
      or (select public.fn_user_tem('ajuste_recebimento_administrar')))
    and public.fn_ajuste_no_meu_alcance(operador_id)
    and (criado_por = (select auth.uid()))
  );

-- 4) desafios
alter policy desafios_insert on public.desafios
  with check (
    ((empresa_id = any ((select public.fn_empresas_acessiveis())::uuid[]))
      or (select public.fn_user_is_super_admin()))
    and ((select public.fn_user_tem('desafios_configurar'))
      or ((select public.fn_user_tem('desafios_configurar_setor'))
          and (setor_id is not null)
          and (setor_id = (select public.fn_user_setor_id()))))
    and (criado_por = (select auth.uid()))
    and ((cardinality(coalesce(empresas, '{}'::uuid[])) = 0)
      or (empresas <@ array[empresa_id])
      or (select public.fn_user_tem('desafios_multiempresa')))
  );

-- 5) Índices de chave estrangeira
create index if not exists idx_mestre_receb_operador_id       on public.mestre_recebimentos (operador_id);
create index if not exists idx_mestre_receb_operador_setor_id on public.mestre_recebimentos (operador_setor_id);
create index if not exists idx_diario_receb_operador_id       on public.diario_recebimentos (operador_id);
create index if not exists idx_analitico_receb_operador_id    on public.analitico_recebimentos (operador_id);
create index if not exists idx_acordos_setor_id               on public.acordos (setor_id);
create index if not exists idx_chat_mensagens_autor_id        on public.chat_mensagens (autor_id);
create index if not exists idx_pix_auto_acordos_operador_id   on public.pix_automatico_acordos (operador_id);
create index if not exists idx_pix_auto_acordos_setor_id      on public.pix_automatico_acordos (setor_id);
