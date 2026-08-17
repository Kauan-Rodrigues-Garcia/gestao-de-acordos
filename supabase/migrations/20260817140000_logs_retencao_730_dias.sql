-- ============================================================================
-- Retenção da trilha de auditoria: 730 dias (2 anos), aplicada sozinha.
-- ============================================================================
-- Decisão tomada em 17/08/2026, faixa única de 2 anos para toda a trilha.
--
-- ## Por que 730 dias
--
--   • piso legal com folga — o Marco Civil (Art. 15) exige 6 meses para
--     registros de acesso;
--   • cobre a janela trabalhista: 2 anos para ajuizar após a rescisão. Os logs
--     são o que responde "esse operador tabulou esse acordo?" numa disputa de
--     comissão, e é essa a pergunta mais provável sobre esta trilha;
--   • minimização (LGPD, Art. 6º III): 4.183 das 4.310 linhas da categoria
--     `acordo` carregam rótulo identificável — nome de profissional do
--     COREN/COFEN. `fn_log_mascarar` protege CPF, telefone e token, mas NÃO
--     mascara nome de cliente nem NR. Guardar isso por 5 anos seria acumular
--     dado de terceiro sem necessidade proporcional.
--
-- O log NÃO é o registro: o acordo continua em `acordos`, que não é expurgado.
-- A trilha responde "quem mexeu e quando", e essa pergunta envelhece mais
-- rápido que "o que foi contratado".
--
-- ## O que se perde, e foi aceito
--
-- Faixa única significa que eventos de `seguranca` (impersonação, senha,
-- permissão, cargo) com mais de 2 anos também saem. Eu recomendei 5 anos para
-- essa categoria; a decisão foi pela simplicidade de um número só. Se um dia
-- isso incomodar, o caminho é acrescentar recorte por categoria em
-- `fn_logs_retencao_aplicar` — não mexer no prazo geral.
--
-- ## Nota sobre o efeito imediato
--
-- A trilha começa em 01/04/2026. Com corte em 730 dias, este trabalho não
-- apaga NADA até abril de 2028. É esperado: a primeira execução vai registrar
-- zero remoções, e isso é o sinal de que está funcionando, não de que falhou.
-- ============================================================================


-- ============================================================================
-- 1. O caminho automático
-- ============================================================================
-- `fn_logs_expurgar` (a do botão) não serve para rodar agendada, por três
-- motivos que só aparecem quando não há sessão:
--
--   • ela exige `fn_user_is_super_admin()`, que é falso sob o cron — a chamada
--     morreria na primeira linha;
--   • `fn_user_empresa_id()` volta NULL, e o `COALESCE` faria a exclusão pegar
--     todas as empresas. É o comportamento desejado num trabalho global, mas
--     por acidente, não por decisão escrita;
--   • ela registra o expurgo via `fn_log_registrar`, que sem sessão não resolve
--     empresa e devolve NULL SEM INSERIR. Ou seja: um trabalho destrutivo
--     rodando todo mês e não deixando rastro. Esse é o problema grave.
--
-- Então o caminho automático é outra função, explícita em tudo o que a de
-- botão faz por dedução.
-- ============================================================================

create or replace function public.fn_logs_retencao_aplicar(p_dias integer default 730)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_corte   timestamptz;
  v_total   int := 0;
  v_qtd     int;
  r         record;
begin
  /*
   * Piso de 365 dias, e não os 30 da função de botão.
   *
   * A diferença é deliberada: o botão tem um humano do outro lado que digitou
   * "EXPURGAR" e escolheu o número. Aqui não tem ninguém olhando, roda todo mês
   * e não pergunta nada. Um trabalho assim, se for reagendado com 60 dias por
   * descuido, come dois anos de trilha em silêncio na primeira execução.
   */
  if p_dias is null or p_dias < 365 then
    raise exception 'Retencao automatica minima de 365 dias (pedido: % dias).', p_dias
      using errcode = 'check_violation';
  end if;

  v_corte := now() - make_interval(days => p_dias);

  -- Empresa por empresa: a trilha é por tenant, e uma contagem global daria um
  -- registro que não bate com o que cada painel mostra.
  for r in select id, nome from public.empresas loop
    delete from public.logs_sistema
     where empresa_id = r.id
       and criado_em < v_corte;
    get diagnostics v_qtd = row_count;
    v_total := v_total + v_qtd;

    /*
     * Registra SEMPRE, inclusive quando não removeu nada.
     *
     * Um trabalho destrutivo silencioso é indistinguível de um trabalho que
     * parou de rodar. A linha de zero remoções é a prova de vida — e nos
     * primeiros dois anos ela vai ser a única coisa que este trabalho produz.
     *
     * INSERT direto, e não `fn_log_registrar`: sem sessão, ela não resolve
     * empresa e devolve NULL sem inserir.
     */
    insert into public.logs_sistema (
      empresa_id, acao, categoria, severidade, descricao,
      tabela, alvo_tipo, origem, detalhes
    ) values (
      r.id, 'logs_expurgados', 'seguranca',
      case when v_qtd > 0 then 'critico' else 'info' end,
      case when v_qtd > 0
        then format('Retenção automática: expurgou %s registro(s) com mais de %s dias.', v_qtd, p_dias)
        else format('Retenção automática: nenhum registro com mais de %s dias.', p_dias)
      end,
      'logs_sistema', 'trilha de auditoria', 'automatico',
      jsonb_build_object(
        'dias_retencao', p_dias,
        'corte', v_corte,
        'removidos', v_qtd,
        'agendado', true,
        'politica', 'faixa unica de 730 dias, decidida em 17/08/2026'
      )
    );
  end loop;

  return v_total;
end
$$;

comment on function public.fn_logs_retencao_aplicar(integer) is
  'Retencao automatica da trilha (730 dias). Chamada pelo pg_cron; nao exposta ao PostgREST.';

-- Fora do alcance do REST. A proteção desta função não é um teste de cargo — é
-- não ser alcançável por quem tem um token. Quem chama é o cron.
revoke all on function public.fn_logs_retencao_aplicar(integer) from public, anon, authenticated;


-- ============================================================================
-- 2. O padrão da função de botão passa a ser o da política
-- ============================================================================
-- `fn_logs_expurgar` continua existindo para o expurgo manual, com o piso de 30
-- dias e a confirmação digitada. Só o valor DEFAULT muda: 180 dias era um
-- número de antes de haver política, e uma chamada sem argumento sugeria uma
-- retenção mais curta do que a que foi decidida.
-- ============================================================================

create or replace function public.fn_logs_expurgar(
  p_dias integer default 730, p_empresa_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_super   boolean := public.fn_user_is_super_admin();
  v_minha   uuid    := public.fn_user_empresa_id();
  v_empresa uuid;
  v_corte   timestamptz;
  v_qtd     int;
begin
  if not v_super then
    raise exception 'Apenas super_admin pode expurgar logs.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Piso de 30 dias. "Apagar tudo agora" é o pedido de quem quer esconder algo,
  -- e é exatamente o que uma trilha de auditoria não deve oferecer com um
  -- clique. Quem precisar de menos, faz no SQL Editor e deixa rastro lá.
  if p_dias is null or p_dias < 30 then
    raise exception 'Retenção mínima de 30 dias (pedido: % dias).', p_dias
      using errcode = 'check_violation';
  end if;

  v_empresa := coalesce(p_empresa_id, v_minha);
  v_corte   := now() - make_interval(days => p_dias);

  delete from public.logs_sistema
   where criado_em < v_corte
     and (v_empresa is null or empresa_id = v_empresa);
  get diagnostics v_qtd = row_count;

  -- O expurgo é um evento de auditoria como qualquer outro — e, por ser
  -- destrutivo, dos mais importantes.
  perform public.fn_log_registrar(
    p_acao        := 'logs_expurgados',
    p_categoria   := 'seguranca',
    p_severidade  := 'critico',
    p_descricao   := 'Expurgou ' || v_qtd || ' registro(s) de log com mais de '
                     || p_dias || ' dias',
    p_empresa_id  := v_empresa,
    p_tabela      := 'logs_sistema',
    p_alvo_tipo   := 'trilha de auditoria',
    p_detalhes    := jsonb_build_object(
                       'dias_retencao', p_dias,
                       'corte', v_corte,
                       'removidos', v_qtd
                     ),
    p_origem      := 'ui'
  );

  return v_qtd;
end
$$;


-- ============================================================================
-- 3. O agendamento
-- ============================================================================
-- Mensal, dia 1, 03:40 UTC — 00:40 em São Paulo, fora do horário de operação.
--
-- O horário foi escolhido olhando o que já existe: `comemoracao-faxina` roda
-- todo dia às 04:17 e `composicao-mes-congelar` às 02:50. 03:40 fica sozinho.
-- Nada quebraria se colidissem — o pg_cron roda trabalhos em paralelo —, mas
-- não há motivo para dois DELETE grandes disputarem I/O na mesma janela.
--
-- Nome em kebab-case e comando com `SELECT ...;`, seguindo os três trabalhos que
-- já estão agendados. Convenção existente vale mais que preferência nova.
--
-- Mensal e não diário: o corte é de dois anos, então a diferença entre apagar
-- hoje e apagar em três semanas é irrelevante — e um trabalho que roda 12 vezes
-- por ano deixa 12 linhas de prova de vida, em vez de 365 linhas de ruído na
-- própria trilha que ele existe para preservar.
-- ============================================================================

do $$
begin
  -- Reaplicar a migration não deve criar um segundo trabalho igual.
  if exists (select 1 from cron.job where jobname = 'logs-retencao-730d') then
    perform cron.unschedule('logs-retencao-730d');
  end if;

  perform cron.schedule(
    'logs-retencao-730d',
    '40 3 1 * *',
    'SELECT public.fn_logs_retencao_aplicar(730);'
  );
end
$$;


-- ============================================================================
-- Verificação — para ser lida, não só executada.
-- ============================================================================
do $$
declare
  v_job      record;
  v_exposta  int;
  v_padrao   int;
begin
  select jobname, schedule, command, active, database into v_job
    from cron.job where jobname = 'logs-retencao-730d';

  -- `FOUND`, e não `v_job IS NULL`: um RECORD só é NULL quando TODOS os campos
  -- são nulos, o que é verdade aqui por coincidência e deixaria de ser no dia em
  -- que alguém acrescentasse um campo com default à consulta.
  if not found then
    raise exception 'o trabalho logs-retencao-730d nao foi agendado';
  end if;
  if not v_job.active then
    raise exception 'o trabalho logs-retencao-730d esta inativo';
  end if;
  if v_job.command not like '%fn_logs_retencao_aplicar(730)%' then
    raise exception 'o trabalho agendado nao chama a retencao de 730 dias: %', v_job.command;
  end if;
  -- Trabalho agendado no banco errado nunca roda, e não avisa.
  if v_job.database <> current_database() then
    raise exception 'o trabalho foi agendado no banco % em vez de %',
      v_job.database, current_database();
  end if;

  /*
   * A função automática não pode ser chamável por quem tem um token.
   *
   * A conta sai do `proacl` e não de `information_schema.role_routine_grants`:
   * a visão do information_schema filtra pelas roles de que o usuário corrente
   * participa, então ela pode devolver zero por falta de visibilidade em vez de
   * por ausência de concessão — um falso "está seguro". `grantee = 0` é PUBLIC.
   */
  select count(*) into v_exposta
    from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.oid = 'public.fn_logs_retencao_aplicar(integer)'::regprocedure
     and a.privilege_type = 'EXECUTE'
     and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated'));
  if v_exposta <> 0 then
    raise exception 'fn_logs_retencao_aplicar esta exposta ao PostgREST (% concessoes)', v_exposta;
  end if;

  -- O padrão da função de botão acompanha a política.
  select pg_get_function_arg_default(p.oid, 1)::int into v_padrao
    from pg_proc p
   where p.oid = 'public.fn_logs_expurgar(integer, uuid)'::regprocedure;
  if v_padrao <> 730 then
    raise exception 'fn_logs_expurgar ainda tem padrao de % dias', v_padrao;
  end if;

  raise notice
    'Retencao: 730 dias, agendada mensalmente (cron "%" UTC, banco %). '
    || 'A primeira execucao vai registrar ZERO remocoes — a trilha comeca em '
    || '01/04/2026 e o corte de 2 anos so alcanca algo em abril/2028. '
    || 'Linha de zero remocoes e prova de vida, nao falha.',
    v_job.schedule, v_job.database;
end
$$;
