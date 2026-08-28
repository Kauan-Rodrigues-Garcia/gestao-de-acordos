-- Cache privado da localização aproximada dos IPs exibidos na trilha de logs.
-- A aplicação renova sob demanda: sucesso vale 30 dias; falha tenta novamente
-- em uma hora sem apagar a última localização conhecida.

create table public.ip_localizacoes (
  ip inet primary key,
  cidade text,
  estado text,
  estado_codigo text,
  pais text,
  pais_codigo text,
  status text not null default 'erro',
  consultado_em timestamptz,
  ultima_tentativa_em timestamptz not null default now(),
  expira_em timestamptz not null default now(),
  ultimo_erro text,
  constraint ip_localizacoes_status_check
    check (status in ('sucesso', 'erro')),
  constraint ip_localizacoes_pais_codigo_check
    check (pais_codigo is null or pais_codigo ~ '^[A-Z]{2}$')
);

comment on table public.ip_localizacoes is
  'Cache privado da geolocalizacao aproximada por IP usada nos logs. '
  'Sucesso expira em 30 dias; falha e repetida sob demanda.';
comment on column public.ip_localizacoes.consultado_em is
  'Instante da ultima consulta bem-sucedida ao provedor.';
comment on column public.ip_localizacoes.expira_em is
  'Depois deste instante, o proximo acesso aos logs tenta renovar a localizacao.';

alter table public.ip_localizacoes enable row level security;

-- A tabela nunca e lida pelo navegador. Somente a rota serverless autenticada
-- usa service_role; por isso nao existe policy para anon/authenticated.
revoke all on table public.ip_localizacoes from public, anon, authenticated;
grant select, insert, update on table public.ip_localizacoes to service_role;
