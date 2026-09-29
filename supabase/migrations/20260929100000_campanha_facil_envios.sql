-- ============================================================================
-- Campanha Fácil: a campanha chega ao operador pela notificação
-- ============================================================================
--
-- ## O pedido (29/09/2026)
--
-- «Na Campanha Fácil eles não precisam mais preencher os operadores: cada
--  setor tem o vínculo com os operadores que estão lá — o líder do Play 1 só vê
--  e seleciona operadores do Play 1, marcando todos ou só alguns. O operador só
--  vê quando a campanha dele estiver pronta, e recebe uma notificação. Se três
--  não foram, o líder escolhe um para receber os três, ou separa.»
--
-- Decisões com o usuário: o operador baixa a planilha DA NOTIFICAÇÃO, sem aba
-- nova; o repasse não precisa guardar o nome de quem faltou; a campanha fica
-- guardada por DOIS DIAS; a lista do líder é de operadores do setor + clones.
--
-- ## O que existia
--
-- A Campanha Fácil rodava inteira no navegador do líder: ele digitava os nomes
-- em «Encaminhada por», o rodízio repartia e o Excel era baixado. Nada ia ao
-- banco além da biblioteca de mensagens (20260723a).
--
-- ## O que muda
--
-- • `campanha_facil_envios`: uma linha por OPERADOR por liberação. `linhas` é o
--   pedaço dele da campanha já pronto (mensagem renderizada, colunas do Excel),
--   e o navegador do operador remonta a planilha no clique. Guardar as linhas e
--   não o .xlsx é para a faxina ser um DELETE: o Storage recusa DELETE por SQL
--   (ver 20260831120000), e arquivo velho ficaria órfão.
--
-- • `lote_id` agrupa os envios de uma mesma liberação, para o líder repassar a
--   parte de quem faltou dentro da mesma campanha.
--
-- • `expira_em` = criação + 2 dias. A policy de leitura já esconde o vencido;
--   o job `campanha-facil-envios-faxina` apaga de hora em hora.
--
-- • A notificação é gravada pelo navegador do líder na tabela de sempre
--   (`notificacoes_insert_empresa_2026` já permite), com
--   `rota = '/campanha-facil/envio/<id>'`. O front reconhece esse caminho e
--   baixa a planilha em vez de navegar.
--
-- ## Quem faz o quê (RLS)
--
-- • Operador: LÊ os próprios envios não vencidos. Não grava nada.
-- • Líder (chave `ver_campanha_facil`): grava envios em nome próprio para
--   pessoas da própria empresa, lê e apaga os que ele criou.
-- • Sem UPDATE: o repasse cria envios novos para quem recebe e apaga os de
--   quem faltou.
--
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

create table if not exists public.campanha_facil_envios (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  lote_id         uuid not null,
  setor_id        uuid references public.setores(id) on delete set null,
  operador_id     uuid not null references public.perfis(id) on delete cascade,
  operador_nome   text not null,
  titulo          text not null,
  arquivo_nome    text not null,
  qtd             integer not null check (qtd >= 0),
  -- O pedaço do operador, no formato que `xlsx-export.js` lê. Ver o cabeçalho.
  linhas          jsonb not null,
  repasse         boolean not null default false,
  criado_por      uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  criado_por_nome text,
  criado_em       timestamptz not null default now(),
  expira_em       timestamptz not null default (now() + interval '2 days')
);

comment on table public.campanha_facil_envios is
  'Parte de cada operador numa campanha liberada pelo líder na Campanha Fácil. '
  'Vale 2 dias (expira_em); a faxina de hora em hora apaga o vencido. Ver 20260929100000.';

create index if not exists idx_cf_envios_operador
  on public.campanha_facil_envios (operador_id, criado_em desc);
create index if not exists idx_cf_envios_criador
  on public.campanha_facil_envios (criado_por, criado_em desc);
create index if not exists idx_cf_envios_expira
  on public.campanha_facil_envios (expira_em);

alter table public.campanha_facil_envios enable row level security;

drop policy if exists cf_envios_select on public.campanha_facil_envios;
create policy cf_envios_select on public.campanha_facil_envios
  for select to authenticated
  using (
    expira_em > now()
    and (operador_id = (select auth.uid()) or criado_por = (select auth.uid()))
  );

drop policy if exists cf_envios_insert on public.campanha_facil_envios;
create policy cf_envios_insert on public.campanha_facil_envios
  for insert to authenticated
  with check (
    criado_por = (select auth.uid())
    and empresa_id = (select public.fn_user_empresa_id())
    and (select public.fn_user_tem('ver_campanha_facil'))
    and exists (
      select 1 from public.perfis p
       where p.id = operador_id and p.empresa_id = campanha_facil_envios.empresa_id
    )
  );

drop policy if exists cf_envios_delete on public.campanha_facil_envios;
create policy cf_envios_delete on public.campanha_facil_envios
  for delete to authenticated
  using (criado_por = (select auth.uid()));

revoke all on public.campanha_facil_envios from anon;
grant select, insert, delete on public.campanha_facil_envios to authenticated;

-- ── Faxina ──────────────────────────────────────────────────────────────────
create or replace function public.fn_campanha_facil_envios_faxina()
returns integer
language sql
security definer
set search_path = public
as $function$
  with apagados as (
    delete from public.campanha_facil_envios where expira_em <= now() returning 1
  )
  select count(*)::integer from apagados;
$function$;

comment on function public.fn_campanha_facil_envios_faxina() is
  'Apaga os envios vencidos da Campanha Fácil (2 dias). Agendada de hora em hora. Ver 20260929100000.';

revoke all on function public.fn_campanha_facil_envios_faxina() from public, anon, authenticated;

do $agenda$
begin
  if exists (select 1 from cron.job where jobname = 'campanha-facil-envios-faxina') then
    perform cron.unschedule('campanha-facil-envios-faxina');
  end if;
  -- Minuto :23, longe do robô do 59 (:07).
  perform cron.schedule(
    'campanha-facil-envios-faxina',
    '23 * * * *',
    'SELECT public.fn_campanha_facil_envios_faxina();');
end
$agenda$;

commit;
