-- ============================================================================
-- creators_lab_progresso — o progresso do Creators Lab preso à PESSOA.
-- ============================================================================
-- Até agora o "descobriu o Easter Egg" e as conquistas moravam só em
-- localStorage. Isso significa que o distintivo pertencia ao NAVEGADOR, não ao
-- usuário: trocar de máquina, entrar pelo celular, usar janela anônima ou
-- limpar cache apagava tudo. Quem descobriu o segredo em casa chegava no
-- trabalho sem nada.
--
-- Esta tabela guarda o mesmo objeto de progresso que o Lab já usava, agora
-- pela chave certa: `usuario_id`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Por que jsonb e não uma coluna por conquista
--
-- O conteúdo do progresso é decidido no front (`lib/conquistas.ts`) e muda
-- toda vez que alguém acrescenta uma conquista nova. Uma coluna por item
-- exigiria uma migration por conquista, aplicada à mão no SQL Editor, para uma
-- área que é um brinquedo. Em jsonb, acrescentar conquista é acrescentar
-- chave — e nenhum relatório, meta ou fechamento lê esta tabela, então não há
-- consulta analítica que sofra com o formato.
--
-- O que NÃO fica aqui: nada que valha nota, dinheiro ou permissão. É progresso
-- de Easter Egg. Se um dia alguém editar o próprio jsonb pelo PostgREST, o
-- prejuízo é ter um troféu que não mereceu.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Segurança
--
-- RLS fecha por padrão, e cada pessoa só enxerga a própria linha. `auth.uid()`
-- vai entre parênteses num SELECT — a forma que o planner avalia UMA vez por
-- consulta em vez de uma vez por linha (é o mesmo ajuste que a migration de
-- higiene aplicou nas 59 políticas antigas).
--
-- Sem política de DELETE de propósito: ninguém precisa apagar o próprio
-- progresso pelo REST, e a linha cai sozinha quando o perfil é removido, pela
-- cascata da chave estrangeira.
-- ============================================================================

create table if not exists public.creators_lab_progresso (
  usuario_id    uuid primary key references public.perfis(id) on delete cascade,
  progresso     jsonb       not null default '{}'::jsonb,
  descoberto_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.creators_lab_progresso is
  'Progresso do Creators Lab por usuário. Substitui o localStorage, que prendia o distintivo ao navegador.';
comment on column public.creators_lab_progresso.progresso is
  'Objeto Progresso de src/pages/CreatorsLab/lib/conquistas.ts. Formato decidido no front.';
comment on column public.creators_lab_progresso.descoberto_em is
  'Quando a pessoa encontrou o Lab pela primeira vez. Nunca é reescrito.';

alter table public.creators_lab_progresso enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.creators_lab_progresso'::regclass
      and polname  = 'creators_lab_progresso_select'
  ) then
    create policy creators_lab_progresso_select
      on public.creators_lab_progresso for select
      to authenticated
      using (usuario_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.creators_lab_progresso'::regclass
      and polname  = 'creators_lab_progresso_insert'
  ) then
    create policy creators_lab_progresso_insert
      on public.creators_lab_progresso for insert
      to authenticated
      with check (usuario_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.creators_lab_progresso'::regclass
      and polname  = 'creators_lab_progresso_update'
  ) then
    create policy creators_lab_progresso_update
      on public.creators_lab_progresso for update
      to authenticated
      using       (usuario_id = (select auth.uid()))
      with check  (usuario_id = (select auth.uid()));
  end if;
end
$$;

-- ============================================================================
-- Verificação — o resultado precisa ser lido, não só executado.
-- ============================================================================
do $$
declare
  v_rls   boolean;
  v_pols  int;
begin
  select relrowsecurity into v_rls
    from pg_class where oid = 'public.creators_lab_progresso'::regclass;

  select count(*) into v_pols
    from pg_policy where polrelid = 'public.creators_lab_progresso'::regclass;

  if not v_rls then
    raise exception 'creators_lab_progresso ficou SEM row level security';
  end if;

  if v_pols <> 3 then
    raise exception 'creators_lab_progresso deveria ter 3 politicas, tem %', v_pols;
  end if;

  raise notice 'creators_lab_progresso: RLS ligada, % politicas. OK.', v_pols;
end
$$;
