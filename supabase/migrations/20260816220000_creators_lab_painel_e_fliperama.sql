-- ============================================================================
-- Creators Lab — quem descobriu o segredo, e a ficha única do fliperama.
-- ============================================================================
-- Duas coisas que o cliente NÃO pode decidir sozinho, e por isso moram aqui:
--
--   1. quem entra no painel de descobridores;
--   2. quantas vezes cada pessoa joga o fliperama (resposta: uma).
--
-- Se qualquer das duas ficasse no front, bastaria abrir o console para virar o
-- primeiro descobridor da empresa ou repetir a partida até o placar ficar bom.
-- Nenhuma das duas vale dinheiro, mas as duas valem a graça — e um brinquedo
-- que se burla com F12 deixa de ser brinquedo.
-- ============================================================================


-- ============================================================================
-- 1. Elegibilidade para o painel
-- ============================================================================
-- Três regras, nesta ordem:
--
--   • conta administrativa não entra. São as contas que existem para operar o
--     sistema, não para usá-lo — e o painel é uma brincadeira entre quem usa;
--   • quem já tinha acessado o Lab antes desta migration não entra. São os
--     testes do próprio desenvolvimento: começariam ocupando o primeiro lugar,
--     que é justamente o lugar que se quer dar a quem descobrir de verdade;
--   • a decisão é tomada UMA vez, na descoberta, e congela. Quem descobriu como
--     operador e depois virou líder continua no painel: o painel conta o que
--     aconteceu, não o organograma de hoje.
-- ============================================================================

alter table public.creators_lab_progresso
  add column if not exists elegivel_painel boolean not null default true;

comment on column public.creators_lab_progresso.elegivel_painel is
  'Entra no painel de descobridores? Decidido pelo gatilho na descoberta e imutável depois.';

-- As contas que já haviam acessado até agora ficam de fora. Roda antes do
-- gatilho existir, de propósito: é um acerto histórico, não uma regra.
update public.creators_lab_progresso set elegivel_painel = false;

create or replace function public.fn_creators_lab_selar_descoberta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_perfil text;
begin
  if tg_op = 'INSERT' then
    select perfil into v_perfil from public.perfis where id = new.usuario_id;

    -- "Admins e super admins" nesta base: `super_admin` e o legado
    -- `administrador`. Diretoria, gerência e liderança USAM o sistema e
    -- continuam valendo. Para mudar quem fica de fora, é esta lista.
    new.elegivel_painel := coalesce(v_perfil, '') not in ('super_admin', 'administrador');
    new.descoberto_em   := now();
    return new;
  end if;

  -- UPDATE: as duas colunas do painel não se mexem mais. O cliente grava
  -- progresso o tempo todo; nenhuma dessas gravações pode reescrever a posição
  -- na fila nem devolver a elegibilidade a quem não tem.
  new.elegivel_painel := old.elegivel_painel;
  new.descoberto_em   := old.descoberto_em;
  return new;
end
$$;

drop trigger if exists trg_creators_lab_selar_descoberta on public.creators_lab_progresso;
create trigger trg_creators_lab_selar_descoberta
  before insert or update on public.creators_lab_progresso
  for each row execute function public.fn_creators_lab_selar_descoberta();


-- ============================================================================
-- 2. A ficha do fliperama — uma por pessoa, e olhe lá
-- ============================================================================
-- A linha nasce quando a partida COMEÇA, não quando termina. É o que fecha a
-- brecha óbvia: jogar, ver que o placar ficou ruim e recarregar a página antes
-- de morrer. Quem abandona no meio fica com a ficha queimada e zero ponto — e
-- a tela avisa isso antes de começar, com todas as letras.
--
-- Depois de `finalizado_em`, a linha é pedra: sem UPDATE, sem DELETE, sem
-- segunda chance.
-- ============================================================================

create table if not exists public.creators_lab_fliperama (
  usuario_id    uuid primary key references public.perfis(id) on delete cascade,
  iniciado_em   timestamptz not null default now(),
  finalizado_em timestamptz,
  pontos        int     not null default 0     check (pontos >= 0),
  vidas_usadas  int     not null default 0     check (vidas_usadas between 0 and 3),
  duracao_ms    int                            check (duracao_ms is null or duracao_ms >= 0),
  venceu        boolean not null default false
);

comment on table public.creators_lab_fliperama is
  'Uma partida por usuário no fliperama do Creators Lab. A linha nasce no início da partida.';
comment on column public.creators_lab_fliperama.duracao_ms is
  'Calculado pelo servidor entre iniciado_em e finalizado_em. O cliente não envia tempo.';

create or replace function public.fn_creators_lab_partida()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- A partida sempre começa do zero, independente do que o cliente mandou.
    new.iniciado_em   := now();
    new.finalizado_em := null;
    new.pontos        := 0;
    new.vidas_usadas  := 0;
    new.duracao_ms    := null;
    new.venceu        := false;
    return new;
  end if;

  if old.finalizado_em is not null then
    raise exception 'creators_lab: a partida deste usuario ja foi encerrada'
      using errcode = '23505';
  end if;

  new.iniciado_em := old.iniciado_em;

  -- Encerrando agora: o tempo é medido pelo relógio do servidor. O cliente
  -- poderia mandar qualquer número, e "tempo" é um dos critérios do ranking.
  if new.finalizado_em is not null then
    new.finalizado_em := now();
    new.duracao_ms    := greatest(
      0, round(extract(epoch from (now() - old.iniciado_em)) * 1000)
    )::int;
  end if;

  return new;
end
$$;

drop trigger if exists trg_creators_lab_partida on public.creators_lab_fliperama;
create trigger trg_creators_lab_partida
  before insert or update on public.creators_lab_fliperama
  for each row execute function public.fn_creators_lab_partida();

alter table public.creators_lab_fliperama enable row level security;

do $$
begin
  if not exists (select 1 from pg_policy
                 where polrelid = 'public.creators_lab_fliperama'::regclass
                   and polname  = 'creators_lab_fliperama_select') then
    create policy creators_lab_fliperama_select
      on public.creators_lab_fliperama for select
      to authenticated
      using (usuario_id = (select auth.uid()));
  end if;

  if not exists (select 1 from pg_policy
                 where polrelid = 'public.creators_lab_fliperama'::regclass
                   and polname  = 'creators_lab_fliperama_insert') then
    create policy creators_lab_fliperama_insert
      on public.creators_lab_fliperama for insert
      to authenticated
      with check (usuario_id = (select auth.uid()));
  end if;

  -- UPDATE existe só para ENCERRAR a partida em andamento. O gatilho recusa
  -- qualquer update numa linha já finalizada, então a política pode ser
  -- simples: a defesa está no gatilho, que o cliente não alcança.
  if not exists (select 1 from pg_policy
                 where polrelid = 'public.creators_lab_fliperama'::regclass
                   and polname  = 'creators_lab_fliperama_update') then
    create policy creators_lab_fliperama_update
      on public.creators_lab_fliperama for update
      to authenticated
      using      (usuario_id = (select auth.uid()))
      with check (usuario_id = (select auth.uid()));
  end if;
end
$$;


-- ============================================================================
-- 3. As duas listas públicas
-- ============================================================================
-- Painel e ranking mostram NOME e FOTO de outras pessoas, e a RLS das duas
-- tabelas só deixa cada um ver a própria linha — corretamente. Por isso as
-- listas saem por função `security definer`, que é onde o recorte fica
-- explícito e auditável:
--
--   • só a MESMA empresa (o sistema é multi-tenant; misturar BookPlay e
--     PaguePlay num painel seria vazamento, não brincadeira);
--   • só o que o painel precisa — nome, foto e a marca do tempo. Nada de
--     e-mail, usuário, setor, cargo ou progresso de conquistas.
-- ============================================================================

create or replace function public.fn_creators_lab_descobridores()
returns table (
  usuario_id    uuid,
  nome          text,
  foto_url      text,
  descoberto_em timestamptz,
  posicao       int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    d.usuario_id,
    p.nome,
    p.foto_url,
    d.descoberto_em,
    row_number() over (order by d.descoberto_em, d.usuario_id)::int
  from public.creators_lab_progresso d
  join public.perfis p on p.id = d.usuario_id
  where d.elegivel_painel
    and p.empresa_id = public.fn_user_empresa_id()
  order by d.descoberto_em, d.usuario_id;
$$;

comment on function public.fn_creators_lab_descobridores() is
  'Painel do Creators Lab: quem descobriu o Easter Egg, na ordem, dentro da propria empresa.';

create or replace function public.fn_creators_lab_ranking()
returns table (
  usuario_id   uuid,
  nome         text,
  foto_url     text,
  pontos       int,
  vidas_usadas int,
  duracao_ms   int,
  venceu       boolean,
  jogado_em    timestamptz,
  posicao      int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- A ordem do ranking, nesta prioridade: quem zerou vem antes de quem não
  -- zerou; depois mais pontos; depois menos vidas gastas; depois menos tempo.
  -- `usuario_id` no fim só para o empate ser estável entre duas consultas.
  select
    f.usuario_id,
    p.nome,
    p.foto_url,
    f.pontos,
    f.vidas_usadas,
    f.duracao_ms,
    f.venceu,
    f.finalizado_em,
    row_number() over (
      order by f.venceu desc, f.pontos desc, f.vidas_usadas asc,
               f.duracao_ms asc, f.usuario_id
    )::int
  from public.creators_lab_fliperama f
  join public.perfis p on p.id = f.usuario_id
  where f.finalizado_em is not null
    and p.empresa_id = public.fn_user_empresa_id()
  order by f.venceu desc, f.pontos desc, f.vidas_usadas asc,
           f.duracao_ms asc, f.usuario_id;
$$;

comment on function public.fn_creators_lab_ranking() is
  'Ranking do fliperama do Creators Lab, dentro da propria empresa. Ordem: venceu, pontos, vidas, tempo.';

-- Só quem tem sessão. `anon` não chega perto de nenhuma das duas.
revoke all on function public.fn_creators_lab_descobridores() from public, anon;
revoke all on function public.fn_creators_lab_ranking()       from public, anon;
grant execute on function public.fn_creators_lab_descobridores() to authenticated;
grant execute on function public.fn_creators_lab_ranking()       to authenticated;

-- Gatilhos não são endpoint. A migration 20260816150000 tirou todo
-- `returns trigger` do alcance do PostgREST; estes dois entram na mesma regra.
revoke all on function public.fn_creators_lab_selar_descoberta() from public, anon, authenticated;
revoke all on function public.fn_creators_lab_partida()          from public, anon, authenticated;


-- ============================================================================
-- Verificação — para ser lida, não só executada.
-- ============================================================================
do $$
declare
  v_elegiveis int;
  v_pols      int;
  v_rls       boolean;
  v_gatilhos  int;
begin
  select count(*) into v_elegiveis
    from public.creators_lab_progresso where elegivel_painel;
  if v_elegiveis <> 0 then
    raise exception 'as % contas que ja acessaram deveriam estar fora do painel', v_elegiveis;
  end if;

  select relrowsecurity into v_rls
    from pg_class where oid = 'public.creators_lab_fliperama'::regclass;
  if not v_rls then
    raise exception 'creators_lab_fliperama ficou SEM row level security';
  end if;

  select count(*) into v_pols
    from pg_policy where polrelid = 'public.creators_lab_fliperama'::regclass;
  if v_pols <> 3 then
    raise exception 'creators_lab_fliperama deveria ter 3 politicas, tem %', v_pols;
  end if;

  -- Nenhuma política de DELETE: a ficha queimada não se apaga.
  if exists (select 1 from pg_policy
             where polrelid = 'public.creators_lab_fliperama'::regclass and polcmd = 'd') then
    raise exception 'creators_lab_fliperama nao pode ter politica de DELETE';
  end if;

  select count(*) into v_gatilhos from pg_trigger
   where tgrelid in ('public.creators_lab_progresso'::regclass,
                     'public.creators_lab_fliperama'::regclass)
     and not tgisinternal;
  if v_gatilhos <> 2 then
    raise exception 'esperava 2 gatilhos, encontrei %', v_gatilhos;
  end if;

  raise notice 'Creators Lab: painel zerado, fliperama com RLS, 3 politicas, 2 gatilhos, 0 DELETE. OK.';
end
$$;
