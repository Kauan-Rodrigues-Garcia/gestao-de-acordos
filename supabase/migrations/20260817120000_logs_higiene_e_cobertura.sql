-- ============================================================================
-- Trilha de auditoria — higiene e cobertura.
-- ============================================================================
-- Seis correções encontradas ao cruzar a aba de Logs com o banco de produção
-- em 17/08/2026. Nenhuma foi encontrada lendo código: todas apareceram olhando
-- o que a tabela realmente guarda.
--
--   1. permissão que promete o que o RLS não entrega
--   2. contexto de rede faltando em quem escreve fora da RPC
--   3. 11.309 linhas de ruído afogando a trilha
--   4. quatro tabelas sensíveis sem auditoria
--   5. tabela de log morta, e uma contagem mentindo por causa dela
--
-- Ordem importa: a seção 2 precisa existir antes da 4, senão os gatilhos novos
-- nascem sem IP.
-- ============================================================================


-- ============================================================================
-- 1. `ver_logs` desligado onde o RLS nunca vai deixar ler
-- ============================================================================
-- A aba de Logs aparece para quem tem a permissão `ver_logs`. A política de
-- leitura de `logs_sistema` é outra coisa:
--
--   logs_sis_admin USING (fn_user_is_super_admin() OR (empresa_id = ...
--     AND fn_user_has_any_role(ARRAY['administrador'])))
--
-- E `administrador` não existe como perfil nesta base — os cargos são
-- diretoria, elite, gerencia, lider, operador, ouvidoria e super_admin. Na
-- prática, só super_admin lê a trilha.
--
-- Medido em 17/08/2026, na PaguePlay, `ver_logs = true` para três cargos:
--
--   diretoria .... 2 usuários ativos   ← veriam a aba e receberiam zero linhas
--   elite ........ 0 usuários ativos   ← armado para o próximo contratado
--   gerencia ..... 0 usuários ativos   ← idem
--
-- Na BookPlay, os quatro cargos já estavam com `false`. Duas pessoas afetadas
-- hoje, e dois cargos esperando alguém para afetar.
--
-- O que elas veem: `fn_logs_resumo` é SECURITY INVOKER, então até os números do
-- painel vêm zerados. Sem erro e sem explicação — uma tela vazia, que qualquer
-- um lê como defeito do sistema.
--
-- A decisão foi confirmada: diretoria e líder NÃO devem ver a trilha. Estava
-- ligado sem querer na semeadura. Então a correção é desligar a permissão, e
-- não afrouxar o RLS.
--
-- O RLS continua sendo o piso: mesmo que alguém religue `ver_logs` amanhã, a
-- leitura segue restrita. As duas coisas não são acopladas de propósito — uma
-- permissão de tela não deveria conseguir conceder acesso a dado de auditoria.
-- Quem impede a divergência de voltar é o teste
-- `src/lib/__tests__/logs-permissao-vs-rls.test.ts`.
-- ============================================================================

update public.cargos_permissoes
   set permissoes = jsonb_set(permissoes, '{ver_logs}', 'false'::jsonb)
 where cargo not in ('super_admin', 'administrador')
   and coalesce((permissoes->>'ver_logs')::boolean, false);

-- Concessão individual também sai. Remover a CHAVE (em vez de gravar `false`)
-- devolve o usuário à regra do cargo, que é onde essa decisão pertence.
update public.perfis_permissoes pp
   set permissoes = pp.permissoes - 'ver_logs'
 where pp.permissoes ? 'ver_logs'
   and exists (
     select 1 from public.perfis p
      where p.id = pp.usuario_id
        and p.perfil not in ('super_admin', 'administrador')
   );

-- ─────────────────────────────────────────────────────────────────────────────
-- E a SEMEADURA, senão a próxima empresa nasce com o mesmo problema.
--
-- O padrão de cada permissão existe em dois lugares: `permissoes-catalogo.ts`,
-- que a tela usa, e `fn_permissoes_catalogo()`, que semeia empresa nova por
-- gatilho. Desligar só no TypeScript corrigiria a tela de hoje e deixaria a
-- armadilha armada para a terceira operação que entrar no sistema.
--
-- A função é recolada INTEIRA, com uma linha mudada — `ver_logs` de `cupula`
-- para `ninguem`. Tentei fazer a troca por `regexp_replace` sobre
-- `pg_get_functiondef` para não repetir 40 chaves, e o teste de contrato
-- `permissoes-catalogo.sql.test.ts` recusou: ele lê a LISTA no arquivo da
-- migration, e uma função montada em tempo de execução some da leitura. O teste
-- está certo — quem revisa a migration precisa ver o valor, não um regex que
-- promete alterá-lo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH atalhos AS (
    SELECT
      ARRAY['lider','elite','gerencia','diretoria']::TEXT[] AS lideranca,
      ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[] AS todos,
      ARRAY['gerencia','diretoria']::TEXT[] AS cupula,
      ARRAY[]::TEXT[] AS ninguem
  )
  -- `t.*`, nunca `*`: as colunas de `atalhos` também entrariam no retorno e o
  -- tipo declarado não bateria.
  SELECT t.* FROM atalhos, LATERAL (VALUES
    -- Abas e telas
    ('ver_acordos',                 ARRAY['bookplay'],  todos,     false),
    ('ver_analitico',               NULL::TEXT[],       todos,     false),
    ('ver_painel_lider',            NULL::TEXT[],       lideranca, false),
    ('ver_painel_diretoria',        NULL::TEXT[],       ARRAY['diretoria'], false),
    ('ver_ouvidoria',               ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('ver_campanha_facil',          ARRAY['bookplay'],  lideranca, false),
    ('ver_solicitacoes_whatsapp',   NULL::TEXT[],       todos,     false),
    ('ver_pix_automatico',          ARRAY['bookplay'],  todos,     false),
    ('ver_lixeira',                 NULL::TEXT[],       todos,     false),
    -- Trilha de auditoria: NINGUÉM por padrão.
    -- A leitura de `logs_sistema` é limitada pelo RLS a super_admin (política
    -- `logs_sis_admin`). Conceder aqui a outro cargo não dá acesso: dá uma aba
    -- VAZIA, porque o RLS devolve zero linhas e `fn_logs_resumo`, que é
    -- SECURITY INVOKER, devolve zeros. Era `cupula` até 17/08/2026, e na
    -- PaguePlay havia dois diretores com a aba e sem nada dentro dela.
    -- Mexer aqui exige mexer na política, na mesma migration.
    ('ver_logs',                    NULL::TEXT[],       ninguem,   false),
    ('ver_configuracoes',           NULL::TEXT[],       ninguem,   false),
    -- Acordos
    ('ver_acordos_gerais',          NULL::TEXT[],       lideranca, false),
    ('criar_acordos',               NULL::TEXT[],       todos,     false),
    ('editar_acordos',              NULL::TEXT[],       todos,     false),
    ('excluir_acordos',             NULL::TEXT[],       todos,     false),
    ('excluir_em_lote',             NULL::TEXT[],       lideranca, false),
    -- Importações
    ('importar_excel',              NULL::TEXT[],       todos,     false),
    ('importar_analitico',          NULL::TEXT[],       lideranca, false),
    ('importar_diario',             NULL::TEXT[],       lideranca, false),
    -- Gestão de pessoas
    ('ver_usuarios',                NULL::TEXT[],       lideranca, false),
    ('editar_usuarios',             NULL::TEXT[],       ninguem,   false),
    ('ver_equipes',                 NULL::TEXT[],       lideranca, false),
    ('editar_equipes',              NULL::TEXT[],       ninguem,   false),
    ('ver_operadores',              NULL::TEXT[],       lideranca, false),
    -- Metas
    ('ver_metas',                   NULL::TEXT[],       lideranca, false),
    ('gerenciar_metas',             NULL::TEXT[],       cupula,    false),
    -- Filtros e visão
    ('ver_todos_setores',           NULL::TEXT[],       cupula,    false),
    ('ver_analiticos_global',       NULL::TEXT[],       cupula,    false),
    ('filtrar_por_setor',           NULL::TEXT[],       lideranca, false),
    ('filtrar_por_equipe',          NULL::TEXT[],       lideranca, false),
    ('filtrar_por_usuario',         NULL::TEXT[],       lideranca, false),
    -- Ações específicas
    ('editar_ouvidoria',            ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('gerenciar_acessos_ouvidoria', ARRAY['pagueplay'], ninguem,   false),
    ('criar_solicitacao_whatsapp',  NULL::TEXT[],       todos,     false),
    ('aprovar_pix_automatico',      ARRAY['bookplay'],  lideranca, false),
    -- Escrever em mês fechado: explícita, e desligada para todos.
    ('ignorar_fechamento_mes',      NULL::TEXT[],       ninguem,   true)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catálogo oficial de permissões. Espelha src/lib/permissoes-catalogo.ts; os '
  'testes de contrato quebram a CI se divergirem.';


-- ============================================================================
-- 2. Contexto de rede para TODO mundo que escreve log
-- ============================================================================
-- `fn_log_registrar` captura IP e navegador. Quem não passa por ela, não:
--
--   fn_metas_validar_setor, fn_metas_reabrir_setor,
--   fn_relatorio_validar_setor, fn_relatorio_reabrir_setor,
--   fn_transferir_acordo_nr, fn_pet_admin_ajustar_moedas
--
-- Seis funções com INSERT direto. Validar meta e transferir NR mexem em
-- dinheiro, e as linhas delas não dizem de onde vieram.
--
-- A saída NÃO é reescrever as seis. Seria seis oportunidades de errar hoje e
-- nenhuma garantia para a sétima função que alguém escrever amanhã. Um gatilho
-- BEFORE INSERT na própria tabela resolve de uma vez e não tem como divergir:
-- preenche só quando o campo está nulo, então quem já traz o valor certo —
-- `fn_log_registrar`, e as funções serverless que passam o IP do cliente —
-- continua mandando.
--
-- `fn_log_contexto` lê `request.headers`, que existe em qualquer statement
-- dentro de uma requisição do PostgREST, e nunca levanta exceção.
-- ============================================================================

create or replace function public.fn_log_contexto_padrao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Só completa o que faltou. Valor explícito de quem chamou tem precedência:
  -- as funções serverless mandam o IP REAL do cliente, e o cabeçalho que o
  -- Postgres veria naquela chamada é o do servidor da Vercel.
  if new.ip is null then
    new.ip := public.fn_log_contexto('x-forwarded-for');
  end if;
  if new.user_agent is null then
    new.user_agent := public.fn_log_contexto('user-agent');
  end if;
  return new;
end
$$;

comment on function public.fn_log_contexto_padrao() is
  'Completa ip/user_agent de qualquer INSERT em logs_sistema que não os tenha trazido.';

drop trigger if exists trg_log_contexto_padrao on public.logs_sistema;
create trigger trg_log_contexto_padrao
  before insert on public.logs_sistema
  for each row execute function public.fn_log_contexto_padrao();

-- Gatilho não é endpoint — mesma regra da migration 20260816150000.
revoke all on function public.fn_log_contexto_padrao() from public, anon, authenticated;


-- ============================================================================
-- 3. O ruído da composição do mês sai
-- ============================================================================
-- Entre 12 e 15/08/2026 a trilha recebeu 11.309 linhas
-- `composicao_mes_criado` / `composicao_mes_excluido`: uma execução da
-- composição gravava ~240 delas. São 64% de tudo que existe na tabela.
--
-- A migration 20260815122118 estancou a fonte — 16/08 fechou com 187 linhas e
-- 17/08 com 232, que é o volume normal do sistema. As linhas antigas ficaram, e
-- fazem estrago: quem filtra aquela semana só vê isso, e todos os agregados do
-- painel (por ação, por dia, por tabela) saem dominados por elas.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Apagar auditoria não é coisa que se faça de leve. O que justifica aqui:
--
--   • `composicao_mes` é tabela DERIVADA, reconstruída inteira a partir de
--     `acordos` a cada execução. A linha não guarda decisão de ninguém —
--     guarda o resultado de um cálculo que dá para refazer;
--   • o evento com valor de auditoria é "alguém regerou a composição", e ele
--     continua: `composicao_mes_regerado` fica;
--   • o recorte é cirúrgico — duas ações, origem `trigger`, até 16/08. Nada
--     mais é tocado;
--   • o expurgo se registra na própria trilha, com a contagem.
--
-- O corte por data existe para o caso de a fonte voltar a jorrar: linha nova
-- dessas ações não seria apagada por esta migration, e apareceria no painel
-- como o sinal de que a regressão voltou.
-- ============================================================================

do $$
declare
  v_alvo    int;
  v_apagados int;
  v_empresa  uuid;
begin
  select count(*) into v_alvo
    from public.logs_sistema
   where acao in ('composicao_mes_criado', 'composicao_mes_excluido')
     and origem = 'trigger'
     and criado_em < '2026-08-16'::timestamptz;

  if v_alvo = 0 then
    raise notice 'Nada a expurgar: o ruido da composicao ja saiu.';
    return;
  end if;

  delete from public.logs_sistema
   where acao in ('composicao_mes_criado', 'composicao_mes_excluido')
     and origem = 'trigger'
     and criado_em < '2026-08-16'::timestamptz;
  get diagnostics v_apagados = row_count;

  -- Uma linha por empresa afetada: a trilha é por tenant, e um expurgo sem
  -- empresa não apareceria em painel nenhum.
  for v_empresa in select id from public.empresas loop
    insert into public.logs_sistema (
      empresa_id, acao, categoria, severidade, descricao,
      tabela, alvo_tipo, origem, detalhes
    ) values (
      v_empresa, 'logs_expurgados', 'sistema', 'aviso',
      format('Expurgou %s linha(s) de auditoria da composição do mês (12–15/08/2026), '
             || 'geradas linha a linha antes da correção de 15/08. A fonte foi corrigida '
             || 'e o evento "composição regerada" continua registrado.', v_apagados),
      'logs_sistema', 'registro', 'automatico',
      jsonb_build_object(
        'linhas_apagadas', v_apagados,
        'acoes', array['composicao_mes_criado', 'composicao_mes_excluido'],
        'motivo', 'tabela derivada, auditada linha a linha por engano',
        'migration', '20260817120000'
      )
    );
  end loop;

  raise notice 'Expurgo do ruido da composicao: % linha(s).', v_apagados;
end
$$;


-- ============================================================================
-- 4. Quatro tabelas sensíveis que estavam fora da trilha
-- ============================================================================
-- 31 tabelas já eram auditadas. Estas quatro têm volume baixo (custo zero) e
-- consequência alta:
--
--   ai_config                    muda o comportamento do sistema
--   pix_automatico_nr_registro   máquina de estado financeira (status, avaliação)
--   contribuicao_receptivo       entra no cálculo de meta
--   atendimento_responsaveis     define quem responde pela fila
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Duas que eu havia listado e que ficam DE FORA, por decisão e não por
-- esquecimento:
--
--   `analitico_colchao_fora_meta` — é dado importado, com `lote_id` e
--     `importado_por_id`. Auditar linha a linha aqui repetiria exatamente o
--     desastre da composição do mês: uma importação de 200 linhas viraria 200
--     entradas. O evento de auditoria certo já existe e é de LOTE
--     (`importacao_concluida`, com os números da carga).
--
--   `aceites_termo` — a linha JÁ É o registro de consentimento, imutável, e já
--     carrega `ip` e `user_agent`. Um log ao lado dela seria o mesmo fato
--     gravado duas vezes.
--
-- Assinatura de `fn_log_auditoria`:
--   (categoria, slug, frase_do_alvo, colunas_do_rotulo, colunas_ignoradas,
--    coluna_da_empresa, severidade_base)
-- ============================================================================

drop trigger if exists trg_log_ai_config on public.ai_config;
create trigger trg_log_ai_config
  after insert or update or delete on public.ai_config
  for each row execute function public.fn_log_auditoria(
    'configuracao', 'ai_config', 'a configuração de IA', 'model', '', 'empresa_id', 'aviso');

drop trigger if exists trg_log_pix_nr_registro on public.pix_automatico_nr_registro;
create trigger trg_log_pix_nr_registro
  after insert or update or delete on public.pix_automatico_nr_registro
  for each row execute function public.fn_log_auditoria(
    'financeiro', 'pix_nr_registro', 'o registro de NR do Pix',
    'nr_cliente,operador_nome', '', 'empresa_id', 'info');

drop trigger if exists trg_log_contribuicao_receptivo on public.contribuicao_receptivo;
create trigger trg_log_contribuicao_receptivo
  after insert or update or delete on public.contribuicao_receptivo
  for each row execute function public.fn_log_auditoria(
    'meta', 'contribuicao_receptivo', 'a contribuição do receptivo',
    'mes', '', 'empresa_id', 'aviso');

drop trigger if exists trg_log_atendimento_responsaveis on public.atendimento_responsaveis;
create trigger trg_log_atendimento_responsaveis
  after insert or update or delete on public.atendimento_responsaveis
  for each row execute function public.fn_log_auditoria(
    'configuracao', 'atendimento_responsavel', 'o responsável pelo atendimento',
    '', '', 'empresa_id', 'aviso');


-- ============================================================================
-- 5. `logs_whatsapp` — tabela morta que fazia uma contagem mentir
-- ============================================================================
-- Zero linhas. Nunca escrita, nunca lida pelo aplicativo. Sobreviveu em dois
-- lugares do baseline, e um deles é pior que inútil:
--
--   • `fn_admin_resumo_exclusao_usuario` conta essa tabela e devolve o número
--     no campo `logs` do resumo mostrado antes de excluir um usuário. Como a
--     tabela está vazia, o resumo SEMPRE diz zero — enquanto a pessoa pode ter
--     centenas de eventos em `logs_sistema`. Um relatório de exclusão que
--     afirma "0 logs" é pior que um relatório sem o campo.
--
--   • `fn_admin_apagar_acordos_do_usuario` faz um DELETE que nunca apaga nada.
--
-- A contagem passa a sair de `logs_sistema`, com o nome `logs_auditoria` para
-- dizer o que é. E ela é INFORMATIVA: a trilha é append-only e a exclusão do
-- usuário não a toca — quem apaga auditoria é `fn_logs_expurgar`, com piso de
-- 30 dias e registro próprio. O DELETE morto sai sem substituto, de propósito:
-- pedido de exclusão de usuário não apaga trilha de auditoria.
-- ============================================================================

create or replace function public.fn_admin_resumo_exclusao_usuario(p_user_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa uuid;
  v_nome    text;
begin
  if not public.fn_user_has_any_role(array['administrador','super_admin']) then
    raise exception 'Sem permissão para excluir usuários' using errcode = '42501';
  end if;

  select empresa_id, nome into v_empresa, v_nome
    from public.perfis where id = p_user_id;

  if not public.fn_can_access_empresa(v_empresa) then
    raise exception 'Sem permissão para excluir usuário de outra empresa' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'nome',       v_nome,
    'empresa_id', v_empresa,
    'acordos',    (select count(*) from public.acordos           where operador_id = p_user_id),
    'historico',  (select count(*) from public.historico_acordos where usuario_id  = p_user_id),
    -- Informativo: a trilha NÃO é apagada com o usuário. O campo existe para o
    -- administrador saber o tamanho do rastro que fica, não o que sai.
    'logs_auditoria', (select count(*) from public.logs_sistema  where usuario_id  = p_user_id)
  );
end;
$$;

create or replace function public.fn_admin_apagar_acordos_do_usuario(
  p_user_id uuid, p_empresa_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_apagados       int := 0;
  v_empresa_escopo uuid;
begin
  if not public.fn_user_has_any_role(array['administrador','super_admin']) then
    raise exception 'Sem permissão para apagar acordos de usuário' using errcode = '42501';
  end if;

  if p_empresa_id is null then
    select empresa_id into v_empresa_escopo from public.perfis where id = p_user_id;
    if not found then
      raise exception 'Perfil % não encontrado', p_user_id;
    end if;
  else
    v_empresa_escopo := p_empresa_id;
  end if;

  if not public.fn_can_access_empresa(v_empresa_escopo) then
    raise exception 'Sem permissão para apagar acordos de usuário de outra empresa'
      using errcode = '42501';
  end if;

  -- O acordo do outro operador sobrevive. Só a referência ao transferido sai:
  -- DIRETO fica sem EXTRA; EXTRA continua EXTRA, porém sem DIRETO associado.
  update public.acordos
     set vinculo_operador_id   = null,
         vinculo_operador_nome = null
   where vinculo_operador_id = p_user_id
     and operador_id is distinct from p_user_id
     and (p_empresa_id is null or empresa_id = p_empresa_id);

  delete from public.acordos
   where operador_id = p_user_id
     and (p_empresa_id is null or empresa_id = p_empresa_id);
  get diagnostics v_apagados = row_count;

  -- Rastro deixado pelo perfil em acordos de terceiros.
  delete from public.historico_acordos where usuario_id = p_user_id;

  -- Aqui existia `DELETE FROM logs_whatsapp`, que nunca apagou nada (tabela
  -- vazia, hoje removida). NÃO ganhou substituto: a trilha de auditoria é
  -- append-only, e exclusão de usuário não apaga auditoria. Expurgo de trilha
  -- tem caminho próprio, com piso de idade e registro — `fn_logs_expurgar`.

  -- Sobra defensiva: `nr_registros` é índice derivado e não tem FK.
  delete from public.nr_registros nr
   where nr.operador_id = p_user_id
     and not exists (select 1 from public.acordos a where a.id = nr.acordo_id);

  return v_apagados;
end;
$$;

drop table if exists public.logs_whatsapp;


-- ============================================================================
-- Verificação — para ser lida, não só executada.
-- ============================================================================
do $$
declare
  v_promete   int;
  v_ruido     int;
  v_gatilhos  int;
  v_contexto  int;
  v_morta     int;
begin
  -- 1. Ninguém mais vê a aba sem poder ler o conteúdo dela.
  select count(*) into v_promete
    from public.perfis p
    left join public.cargos_permissoes cp on cp.empresa_id = p.empresa_id and cp.cargo = p.perfil
    left join public.perfis_permissoes  pp on pp.usuario_id = p.id
   where p.ativo and not p.arquivado
     and p.perfil not in ('super_admin', 'administrador')
     and coalesce((pp.permissoes->>'ver_logs')::boolean,
                  (cp.permissoes->>'ver_logs')::boolean, false);
  if v_promete <> 0 then
    raise exception '% usuario(s) ainda veriam a aba de Logs sem poder ler nada', v_promete;
  end if;

  -- 2. O gatilho de contexto existe.
  select count(*) into v_contexto
    from pg_trigger where tgrelid = 'public.logs_sistema'::regclass
     and tgname = 'trg_log_contexto_padrao' and not tgisinternal;
  if v_contexto <> 1 then
    raise exception 'gatilho de contexto ausente em logs_sistema';
  end if;

  -- 3. O ruído saiu.
  select count(*) into v_ruido
    from public.logs_sistema
   where acao in ('composicao_mes_criado', 'composicao_mes_excluido')
     and origem = 'trigger' and criado_em < '2026-08-16'::timestamptz;
  if v_ruido <> 0 then
    raise exception 'sobraram % linha(s) de ruido da composicao', v_ruido;
  end if;

  -- 4. As quatro tabelas novas estão auditadas.
  select count(*) into v_gatilhos
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and c.relname in ('ai_config', 'pix_automatico_nr_registro',
                       'contribuicao_receptivo', 'atendimento_responsaveis')
     and t.tgname like 'trg_log_%';
  if v_gatilhos <> 4 then
    raise exception 'esperava 4 gatilhos de auditoria novos, encontrei %', v_gatilhos;
  end if;

  -- 5. A tabela morta saiu, e ninguém ficou apontando para ela.
  select count(*) into v_morta from pg_class
   where relname = 'logs_whatsapp' and relnamespace = 'public'::regnamespace;
  if v_morta <> 0 then
    raise exception 'logs_whatsapp ainda existe';
  end if;
  if exists (
    select 1 from pg_proc
     where pronamespace = 'public'::regnamespace
       and pg_get_functiondef(oid) ilike '%logs_whatsapp%'
  ) then
    raise exception 'ainda existe funcao referenciando logs_whatsapp';
  end if;

  raise notice 'Logs: permissao alinhada, contexto garantido, ruido fora, +4 tabelas auditadas, tabela morta removida. OK.';
end
$$;
