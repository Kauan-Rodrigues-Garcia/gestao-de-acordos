-- Colchão do relatório 58 que deve permanecer visível para conferência, mas
-- nunca participar de analitico_recebimentos, metas, projeções nem rankings.
--
-- Compatibilidade: mudança somente expansiva; nenhuma tabela/função existente
-- é alterada. Rollback seguro antes de haver consumidores: DROP TABLE
-- public.analitico_colchao_fora_meta; Depois de uso, exportar/preservar os dados
-- antes de qualquer remoção (a contração não faz parte desta migration).

create table public.analitico_colchao_fora_meta (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  setor_id uuid references public.setores(id) on delete set null,
  operador_id uuid references public.perfis(id) on delete set null,
  operador_usuario text not null,
  equipe text not null default '',
  codigo text not null,
  nome_cliente text,
  nr_documento text not null default '',
  titulo text not null default '',
  parcela text not null default '',
  forma_pagamento text not null,
  tpdoc_original text not null,
  tipo_comissao text,
  valor_recebido numeric(12,2) not null default 0,
  total_ho numeric(12,2) not null default 0,
  data_pagamento date not null,
  mes_referencia date not null,
  chave_deduplicacao text not null,
  lote_id uuid not null,
  importado_por_id uuid references auth.users(id) on delete set null,
  importado_em timestamptz not null default now(),
  constraint analitico_colchao_forma_pagamento_check
    check (forma_pagamento in ('boleto_pix', 'cartao')),
  constraint analitico_colchao_mes_referencia_check
    check (mes_referencia = date_trunc('month', data_pagamento)::date),
  constraint analitico_colchao_fora_da_excecao_check
    check (
      data_pagamento < date '2026-08-01'
      or data_pagamento > date '2026-08-12'
    )
);

comment on table public.analitico_colchao_fora_meta is
  'Linhas Colchão?=Sim fora da exceção até 12/08/2026. Acompanhamento por NR; não integra metas.';
comment on column public.analitico_colchao_fora_meta.chave_deduplicacao is
  'Chave estável do detalhe ERP (operador, cliente, NR, título, parcela, data, forma e valor).';

create unique index analitico_colchao_empresa_chave_uidx
  on public.analitico_colchao_fora_meta (empresa_id, chave_deduplicacao);
create index analitico_colchao_empresa_mes_data_idx
  on public.analitico_colchao_fora_meta (empresa_id, mes_referencia, data_pagamento, id);
create index analitico_colchao_empresa_setor_mes_data_idx
  on public.analitico_colchao_fora_meta (empresa_id, setor_id, mes_referencia, data_pagamento, id)
  where setor_id is not null;
create index analitico_colchao_operador_id_idx
  on public.analitico_colchao_fora_meta (operador_id)
  where operador_id is not null;
create index analitico_colchao_setor_id_idx
  on public.analitico_colchao_fora_meta (setor_id)
  where setor_id is not null;
create index analitico_colchao_importado_por_id_idx
  on public.analitico_colchao_fora_meta (importado_por_id)
  where importado_por_id is not null;

alter table public.analitico_colchao_fora_meta enable row level security;

create policy analitico_colchao_select
  on public.analitico_colchao_fora_meta
  for select
  to authenticated
  using (
    (
      (select public.fn_user_is_super_admin())
      or empresa_id = (select public.fn_user_empresa_id())
    )
    and (
      (operador_id = (select auth.uid()) and operador_id is not null)
      or (select public.fn_user_has_any_role(array[
        'lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin'
      ]))
    )
  );

create policy analitico_colchao_insert
  on public.analitico_colchao_fora_meta
  for insert
  to authenticated
  with check (
    (
      (select public.fn_user_is_super_admin())
      or empresa_id = (select public.fn_user_empresa_id())
    )
    and (select public.fn_user_has_any_role(array[
      'lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin'
    ]))
  );

-- UPDATE existe somente para revincular órfãos quando o perfil é criado depois.
create policy analitico_colchao_update
  on public.analitico_colchao_fora_meta
  for update
  to authenticated
  using (
    (
      (select public.fn_user_is_super_admin())
      or empresa_id = (select public.fn_user_empresa_id())
    )
    and (select public.fn_user_has_any_role(array[
      'lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin'
    ]))
  )
  with check (
    (
      (select public.fn_user_is_super_admin())
      or empresa_id = (select public.fn_user_empresa_id())
    )
    and (select public.fn_user_has_any_role(array[
      'lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin'
    ]))
  );

-- A Data API não expõe novas tabelas automaticamente neste projeto.
grant select, insert, update on table public.analitico_colchao_fora_meta to authenticated;
grant all on table public.analitico_colchao_fora_meta to service_role;
grant usage, select on sequence public.analitico_colchao_fora_meta_id_seq to authenticated, service_role;
