-- Identifica o navegador/computador que originou cada evento e sinaliza quando
-- uma conta entra por um identificador diferente do último login conhecido.
--
-- Não há backfill: IP público e user-agent não identificam um computador de
-- forma verídica. Registros anteriores permanecem com dispositivo_id nulo.

alter table public.logs_sistema
  add column if not exists dispositivo_id uuid,
  add column if not exists dispositivo_anterior_id uuid,
  add column if not exists dispositivo_alterado boolean not null default false;

comment on column public.logs_sistema.dispositivo_id is
  'UUID persistente criado pelo navegador; identifica a instalação, não o hostname do Windows.';
comment on column public.logs_sistema.dispositivo_anterior_id is
  'Dispositivo do login identificado imediatamente anterior desta conta.';
comment on column public.logs_sistema.dispositivo_alterado is
  'Verdadeiro quando este login veio de dispositivo diferente do último login identificado.';

-- Atende à busca do último login por usuário sem ampliar o índice para os
-- milhões de eventos que não participam da comparação.
create index if not exists idx_logs_login_usuario_dispositivo
  on public.logs_sistema (usuario_id, criado_em desc, id desc)
  include (dispositivo_id)
  where acao = 'login' and dispositivo_id is not null;

create or replace function public.fn_log_contexto_padrao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_dispositivo_header text;
  v_dispositivo_anterior uuid;
begin
  -- Valores explícitos continuam tendo precedência, como já ocorria para IP e
  -- user-agent nas chamadas feitas pelas funções serverless.
  if new.ip is null then
    new.ip := public.fn_log_contexto('x-forwarded-for');
  end if;
  if new.user_agent is null then
    new.user_agent := public.fn_log_contexto('user-agent');
  end if;

  if new.dispositivo_id is null then
    v_dispositivo_header := lower(trim(public.fn_log_contexto('x-device-id')));
    -- Só converte UUID v4 canônico. Cabeçalho ausente ou adulterado vira nulo,
    -- em vez de abortar a operação de negócio que estava sendo auditada.
    if v_dispositivo_header ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      new.dispositivo_id := v_dispositivo_header::uuid;
    end if;
  end if;

  if new.acao = 'login'
     and new.usuario_id is not null
     and new.dispositivo_id is not null
  then
    select l.dispositivo_id
      into v_dispositivo_anterior
      from public.logs_sistema l
     where l.usuario_id = new.usuario_id
       and l.acao = 'login'
       and l.dispositivo_id is not null
     order by l.criado_em desc, l.id desc
     limit 1;

    new.dispositivo_anterior_id := v_dispositivo_anterior;
    new.dispositivo_alterado :=
      v_dispositivo_anterior is not null
      and v_dispositivo_anterior <> new.dispositivo_id;

    if new.dispositivo_alterado and coalesce(new.severidade, 'info') = 'info' then
      new.severidade := 'aviso';
    end if;
  else
    new.dispositivo_alterado := false;
  end if;

  return new;
end
$$;

comment on function public.fn_log_contexto_padrao() is
  'Completa IP, user-agent e dispositivo; em login, compara com o último dispositivo identificado.';

-- Função interna de gatilho, não um endpoint RPC.
revoke all on function public.fn_log_contexto_padrao() from public, anon, authenticated;
