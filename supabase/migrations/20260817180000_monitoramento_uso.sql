-- ============================================================================
-- Monitoramento de uso — quem abre quais telas, e por quanto tempo
-- ============================================================================
--
-- ## O buraco que isto tapa
--
-- `logs_sistema` registra quem ESCREVE: criar acordo, alterar status, importar.
-- Um líder que abre o Painel Líder, olha os cards e fecha não deixa uma linha.
-- A coluna `rota` existia e não resolvia: 7,1% preenchida, e o único valor que
-- ela já teve é `/` — a rota do login.
--
-- ## Por que uma tabela separada, e não `logs_sistema`
--
-- A trilha de auditoria roda a 500–750 linhas/dia. Navegação são milhares. Jogar
-- uma dentro da outra é exatamente o que produziu as 11.297 linhas de ruído que
-- a migration 20260817120000 expurgou.
--
-- E os dois dados têm prazos opostos. A auditoria guarda 730 dias porque precisa
-- responder "quem alterou isto em março". Uso de tela guarda 180: um relatório de
-- adoção de dois anos atrás não descreve mais nem as telas nem as pessoas.
--
-- ## Por que agregado diário, e não um evento por clique
--
-- Uma linha por `(empresa, usuário, dia, tela)`, com contador e segundos
-- somados. Teto real: ~45 pessoas × ~12 telas = 540 linhas/dia, e na prática
-- bem menos. Um fluxo de eventos daria o mesmo número multiplicado por cada
-- navegação, para responder as mesmas perguntas.
--
-- O que se perde é a ordem exata das visitas dentro do dia. Nenhuma pergunta
-- desta tela depende disso.
-- ============================================================================

-- ── 1. A tabela ────────────────────────────────────────────────────────────

create table if not exists public.uso_telas (
  empresa_id   uuid        not null references public.empresas(id),
  usuario_id   uuid        not null references public.perfis(id) on delete cascade,
  dia          date        not null,
  /**
   * Identificador da tela. Rota, ou rota + sub-aba separadas por dois-pontos:
   * `lider`, `lider:desempenho`, `admin/configuracoes:logs`.
   *
   * Sub-aba importa: "Desempenho Equipes" é aba DENTRO do Painel Líder, não uma
   * rota. Sem esse nível, a pergunta que originou o painel — quais líderes abrem
   * o Desempenho Equipes — fica sem resposta.
   */
  tela         text        not null,
  /** Quantas vezes a tela foi aberta no dia. */
  aberturas    integer     not null default 0,
  /**
   * Segundos com a tela EM FOCO. Aba aberta em segundo plano não conta — sem
   * isso, quem deixa a planilha aberta o dia todo lidera qualquer ranking sem
   * ter usado nada.
   */
  segundos     integer     not null default 0,
  primeiro_em  timestamptz not null default now(),
  ultimo_em    timestamptz not null default now(),
  /**
   * Cargo no momento do uso, desnormalizado.
   *
   * O painel separa por cargo, e ler o cargo ATUAL do perfil faria o histórico
   * mudar retroativamente: promover um operador a líder reescreveria meses de
   * "uso de operador" como "uso de líder". Mesma razão de `logs_sistema` guardar
   * `usuario_cargo` na linha.
   */
  cargo        text,
  primary key (empresa_id, usuario_id, dia, tela)
);

comment on table public.uso_telas is
  'Uso agregado por dia: quantas vezes cada pessoa abriu cada tela e quantos segundos ficou nela com a aba em foco. Separado de logs_sistema por volume e por prazo de retenção (180 dias, contra 730 da auditoria).';

-- Ranking por período e por cargo é a consulta da tela; a data vem primeiro.
create index if not exists ix_uso_telas_empresa_dia
  on public.uso_telas (empresa_id, dia desc);
create index if not exists ix_uso_telas_usuario_dia
  on public.uso_telas (usuario_id, dia desc);
create index if not exists ix_uso_telas_tela
  on public.uso_telas (empresa_id, tela, dia desc);

-- ── 2. RLS ─────────────────────────────────────────────────────────────────
--
-- Leitura: a MESMA trava de `logs_sistema` — super_admin e administrador. Foi
-- decisão explícita em 17/08/2026 que diretoria e líder não veem a trilha, e
-- monitoramento de uso é dado da mesma natureza.
--
-- Escrita: ninguém, por caminho direto. Só a RPC abaixo, que é SECURITY DEFINER
-- e resolve a identidade de `auth.uid()`. Sem isso, qualquer pessoa com um token
-- poderia inflar o próprio uso ou o de outra — e um painel de uso que aceita
-- números vindos do cliente sem amarra não mede nada.

alter table public.uso_telas enable row level security;

drop policy if exists uso_telas_select on public.uso_telas;
create policy uso_telas_select on public.uso_telas
  for select to authenticated
  using (
    public.fn_user_is_super_admin()
    or (empresa_id = public.fn_user_empresa_id()
        and public.fn_user_has_any_role(array['administrador']))
  );

-- Sem policy de INSERT/UPDATE/DELETE: a tabela é fail-closed para escrita
-- direta, e a RPC passa por cima por ser SECURITY DEFINER.

-- ── 3. Registro ────────────────────────────────────────────────────────────

create or replace function public.fn_uso_registrar(
  p_tela     text,
  p_segundos integer default 0,
  p_abertura boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_empresa uuid;
  v_cargo   text;
  v_tela    text;
  v_seg     integer;
begin
  -- Sem sessão não há o que registrar. Devolve em silêncio: esta função é
  -- chamada de dentro de um efeito de tela, e estourar aqui quebraria a
  -- navegação por causa de telemetria.
  if auth.uid() is null then return; end if;

  v_tela := nullif(btrim(p_tela), '');
  if v_tela is null then return; end if;

  -- Teto no identificador: ele vem do cliente, e uma string enorme viraria uma
  -- linha permanente na tabela e uma coluna ilegível no painel.
  v_tela := left(v_tela, 120);

  -- Teto no tempo. O cliente manda o intervalo desde o último envio; um relógio
  -- errado, uma máquina que hibernou ou um payload adulterado mandariam horas
  -- numa tacada. 3600 é o máximo que uma única janela de envio pode valer.
  v_seg := least(greatest(coalesce(p_segundos, 0), 0), 3600);

  select p.empresa_id, p.perfil into v_empresa, v_cargo
    from public.perfis p where p.id = auth.uid();
  if v_empresa is null then return; end if;

  insert into public.uso_telas as u
    (empresa_id, usuario_id, dia, tela, aberturas, segundos, cargo,
     primeiro_em, ultimo_em)
  values
    (v_empresa, auth.uid(), (now() at time zone 'America/Sao_Paulo')::date, v_tela,
     case when p_abertura then 1 else 0 end, v_seg, v_cargo, now(), now())
  on conflict (empresa_id, usuario_id, dia, tela) do update
     set aberturas = u.aberturas + excluded.aberturas,
         segundos  = u.segundos  + excluded.segundos,
         -- O cargo mais recente do dia vence: quem foi promovido no meio do dia
         -- termina o dia no cargo novo.
         cargo     = coalesce(excluded.cargo, u.cargo),
         ultimo_em = now();
end;
$function$;

comment on function public.fn_uso_registrar(text, integer, boolean) is
  'Soma uso de tela no dia corrente para o usuário da sessão. Identidade vem de auth.uid(), nunca do cliente.';

-- O dia é o de São Paulo, não UTC: um acesso às 22h de terça em Brasília é
-- 01h de quarta em UTC, e cairia no dia seguinte no relatório.

revoke all on function public.fn_uso_registrar(text, integer, boolean) from public;
grant execute on function public.fn_uso_registrar(text, integer, boolean) to authenticated;

-- ── 4. Leitura agregada ────────────────────────────────────────────────────
--
-- Agregação no BANCO, não no cliente. 180 dias de retenção × ~540 linhas/dia dá
-- ~97 mil linhas; trazer isso para o navegador a cada abertura do painel seria
-- megabytes para exibir uma tabela de vinte linhas.

create or replace function public.fn_uso_por_pessoa(
  p_empresa_id uuid,
  p_desde      date,
  p_ate        date,
  p_cargo      text default null
)
returns table (
  usuario_id   uuid,
  nome         text,
  cargo        text,
  aberturas    bigint,
  segundos     bigint,
  dias_ativos  bigint,
  telas_usadas bigint,
  ultimo_em    timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  -- SECURITY INVOKER de propósito: a RLS de `uso_telas` decide o que a pessoa
  -- pode ver. Uma função DEFINER aqui daria a qualquer um com EXECUTE o poder de
  -- ler o uso da empresa inteira, contornando a trava que a policy impõe.
  select u.usuario_id,
         coalesce(p.nome, '(removido)') as nome,
         -- O cargo da linha, não o do perfil: histórico não muda quando alguém
         -- é promovido. `mode()` resolve o dia em que o cargo mudou.
         mode() within group (order by u.cargo) as cargo,
         sum(u.aberturas)::bigint          as aberturas,
         sum(u.segundos)::bigint           as segundos,
         count(distinct u.dia)::bigint     as dias_ativos,
         count(distinct u.tela)::bigint    as telas_usadas,
         max(u.ultimo_em)                  as ultimo_em
    from public.uso_telas u
    left join public.perfis p on p.id = u.usuario_id
   where u.empresa_id = p_empresa_id
     and u.dia between p_desde and p_ate
     and (p_cargo is null or u.cargo = p_cargo)
   group by u.usuario_id, p.nome
   order by sum(u.segundos) desc, sum(u.aberturas) desc;
$function$;

create or replace function public.fn_uso_por_tela(
  p_empresa_id uuid,
  p_desde      date,
  p_ate        date,
  p_cargo      text default null
)
returns table (
  tela       text,
  aberturas  bigint,
  segundos   bigint,
  pessoas    bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select u.tela,
         sum(u.aberturas)::bigint       as aberturas,
         sum(u.segundos)::bigint        as segundos,
         count(distinct u.usuario_id)::bigint as pessoas
    from public.uso_telas u
   where u.empresa_id = p_empresa_id
     and u.dia between p_desde and p_ate
     and (p_cargo is null or u.cargo = p_cargo)
   group by u.tela
   order by sum(u.segundos) desc;
$function$;

/**
 * Uso de UMA tela, pessoa a pessoa, incluindo quem NÃO usou.
 *
 * É a consulta que originou o painel: "quais líderes abrem o Desempenho
 * Equipes". A resposta útil não é o ranking de quem abre — é a lista de quem
 * nunca abriu, e essa lista não existe dentro de `uso_telas`, justamente porque
 * quem não usou não tem linha. Por isso parte de `perfis` e traz o uso por
 * LEFT JOIN.
 */
create or replace function public.fn_uso_adocao_tela(
  p_empresa_id uuid,
  p_desde      date,
  p_ate        date,
  p_tela       text,
  p_cargo      text default null
)
returns table (
  usuario_id uuid,
  nome       text,
  cargo      text,
  aberturas  bigint,
  segundos   bigint,
  ultimo_em  timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select p.id,
         p.nome,
         p.perfil,
         coalesce(sum(u.aberturas), 0)::bigint as aberturas,
         coalesce(sum(u.segundos), 0)::bigint  as segundos,
         max(u.ultimo_em)                      as ultimo_em
    from public.perfis p
    left join public.uso_telas u
           on u.usuario_id = p.id
          and u.empresa_id = p.empresa_id
          and u.tela = p_tela
          and u.dia between p_desde and p_ate
   where p.empresa_id = p_empresa_id
     and p.ativo = true
     and coalesce(p.situacao, 'ativo') = 'ativo'
     and (p_cargo is null or p.perfil = p_cargo)
   group by p.id, p.nome, p.perfil
   order by coalesce(sum(u.segundos), 0) desc, p.nome;
$function$;

/** Série diária para o gráfico do painel. */
create or replace function public.fn_uso_por_dia(
  p_empresa_id uuid,
  p_desde      date,
  p_ate        date,
  p_cargo      text default null
)
returns table (
  dia       date,
  aberturas bigint,
  segundos  bigint,
  pessoas   bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select u.dia,
         sum(u.aberturas)::bigint             as aberturas,
         sum(u.segundos)::bigint              as segundos,
         count(distinct u.usuario_id)::bigint as pessoas
    from public.uso_telas u
   where u.empresa_id = p_empresa_id
     and u.dia between p_desde and p_ate
     and (p_cargo is null or u.cargo = p_cargo)
   group by u.dia
   order by u.dia;
$function$;

revoke all on function public.fn_uso_por_pessoa(uuid, date, date, text)   from public;
revoke all on function public.fn_uso_por_tela(uuid, date, date, text)     from public;
revoke all on function public.fn_uso_adocao_tela(uuid, date, date, text, text) from public;
revoke all on function public.fn_uso_por_dia(uuid, date, date, text)      from public;
grant execute on function public.fn_uso_por_pessoa(uuid, date, date, text)   to authenticated;
grant execute on function public.fn_uso_por_tela(uuid, date, date, text)     to authenticated;
grant execute on function public.fn_uso_adocao_tela(uuid, date, date, text, text) to authenticated;
grant execute on function public.fn_uso_por_dia(uuid, date, date, text)      to authenticated;

-- `fn_uso_adocao_tela` lê `perfis` diretamente, e `perfis_select` só devolve as
-- linhas da própria empresa para quem tem cargo de liderança. Combinada com a
-- RLS de `uso_telas`, quem não pode ver o painel recebe lista vazia em vez de
-- erro — que é o comportamento fail-closed do resto do projeto.

-- ── 5. Retenção ────────────────────────────────────────────────────────────
--
-- 180 dias. Mais curto que a auditoria (730) de propósito: uso de tela responde
-- "como as pessoas estão trabalhando AGORA", e um retrato de dois anos atrás não
-- descreve mais nem as telas nem as pessoas. Menos dado guardado sem perda de
-- utilidade é a escolha certa.

create or replace function public.fn_uso_expurgar(p_dias integer default 180)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_corte date;
  v_qtd   integer;
begin
  if p_dias is null or p_dias < 30 then
    raise exception 'Retencao minima de 30 dias (pedido: % dias).', p_dias
      using errcode = 'check_violation';
  end if;

  v_corte := (now() at time zone 'America/Sao_Paulo')::date - p_dias;

  delete from public.uso_telas where dia < v_corte;
  get diagnostics v_qtd = row_count;

  -- Registra na trilha de auditoria: um trabalho destrutivo silencioso é
  -- indistinguível de um trabalho que parou de rodar. `fn_log_registrar` não
  -- serve aqui — sem sessão ela devolve NULL sem inserir —, então grava direto.
  -- `origem` só aceita ui/trigger/api/importacao/automatico/anon
  -- (`logs_sistema_origem_check`). Trabalho de cron é 'automatico' — o mesmo
  -- valor que `fn_logs_retencao_aplicar` usa.
  insert into public.logs_sistema
    (acao, categoria, severidade, descricao, origem, tabela, alvo_tipo, detalhes)
  values
    ('uso_expurgado', 'sistema', 'info',
     format('Expurgo de uso de telas: %s linha(s) anterior(es) a %s.', v_qtd, v_corte),
     'automatico', 'uso_telas', 'monitoramento de uso',
     jsonb_build_object('dias', p_dias, 'corte', v_corte, 'removidas', v_qtd));

  return v_qtd;
end;
$function$;

revoke all on function public.fn_uso_expurgar(integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('uso-telas-expurgo-180d')
      where exists (select 1 from cron.job where jobname = 'uso-telas-expurgo-180d');
    -- 04:50: livre. `comemoracao-faxina` é 04:17, `composicao-mes-congelar` 02:50,
    -- `expurgar-cpf-chat` a cada 10 min, `logs-retencao-730d` 03:40 do dia 1.
    perform cron.schedule('uso-telas-expurgo-180d', '50 4 * * *',
      'SELECT public.fn_uso_expurgar(180);');
  end if;
end;
$$;

-- ── 6. Verificação ─────────────────────────────────────────────────────────

do $$
declare
  v_pol    text;
  v_grant  integer;
  v_job    text;
  v_aviso  text;
begin
  -- A tabela não aceita escrita direta: nenhuma policy de INSERT/UPDATE/DELETE.
  select count(*) into v_grant
    from pg_policies
   where schemaname = 'public' and tablename = 'uso_telas'
     and cmd <> 'SELECT';
  if v_grant > 0 then
    raise exception 'uso_telas tem % policy(s) de escrita — o registro deve passar so pela RPC', v_grant;
  end if;

  select policyname into v_pol
    from pg_policies
   where schemaname = 'public' and tablename = 'uso_telas' and policyname = 'uso_telas_select';
  if not found then
    raise exception 'policy uso_telas_select ausente';
  end if;

  -- As funções de leitura NÃO podem ser SECURITY DEFINER: seriam um contorno da
  -- policy acima para qualquer um com EXECUTE.
  select count(*) into v_grant
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('fn_uso_por_pessoa', 'fn_uso_por_tela', 'fn_uso_adocao_tela', 'fn_uso_por_dia')
     and p.prosecdef;
  if v_grant > 0 then
    raise exception '% funcao(oes) de leitura de uso estao como SECURITY DEFINER', v_grant;
  end if;

  -- `fn_uso_expurgar` não pode ser alcançável por quem tem um token.
  --
  -- `proacl` NULO é o caso perigoso, não o inofensivo: sem ACL explícita o
  -- PostgreSQL concede EXECUTE a PUBLIC por padrão, e `aclexplode(NULL)` devolve
  -- zero linhas — a checagem passaria justamente quando a função está aberta.
  -- Por isso o NULL é testado à parte, antes de contar concessões.
  if (select p.proacl is null from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = 'fn_uso_expurgar') then
    raise exception 'fn_uso_expurgar esta sem ACL explicita — EXECUTE fica em PUBLIC por padrao';
  end if;

  select count(*) into v_grant
    from pg_proc p, aclexplode(p.proacl) a
   where p.pronamespace = 'public'::regnamespace
     and p.proname = 'fn_uso_expurgar'
     and a.privilege_type = 'EXECUTE'
     and (a.grantee = 0 or a.grantee = 'authenticated'::regrole or a.grantee = 'anon'::regrole);
  if v_grant > 0 then
    raise exception 'fn_uso_expurgar esta exposta (% concessoes)', v_grant;
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select j.jobname into v_job from cron.job j where j.jobname = 'uso-telas-expurgo-180d';
    if not found then
      raise exception 'trabalho uso-telas-expurgo-180d nao foi agendado';
    end if;
  end if;

  -- Literais adjacentes: o SQL concatena no parse. `format()` sem placeholder
  -- não acrescentaria nada, e o formato de RAISE tem de ser literal de qualquer
  -- forma — concatenar com `||` ali é erro de parse (42601).
  v_aviso := 'Monitoramento de uso pronto. Leitura travada em super_admin/administrador, '
             'escrita so por fn_uso_registrar, retencao de 180 dias as 04:50. '
             'A tabela comeca VAZIA: nao ha historico de navegacao para recuperar.';
  raise notice '%', v_aviso;
end;
$$;
