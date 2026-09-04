-- ============================================================================
-- Relatório 59: o mestre da BookPlay
-- ============================================================================
--
-- ## O que este arquivo cria, e o que ele NÃO faz
--
-- Cria a casa do relatório 59 — o mestre do ERP, um arquivo por mês com todos
-- os setores. Nada aqui toca em `analitico_recebimentos`, em meta, em painel ou
-- em qualquer número que alguém veja hoje. É de propósito: o mestre entra em
-- paralelo, é conferido, e só depois vira fonte. Enquanto isso ele é uma aba de
-- super_admin que lê o próprio dado e mais nada.
--
-- ## Por que tabela própria
--
-- `analitico_recebimentos` não tem onde guardar a verdade da linha: não tem
-- parcela, título, colchão, equipe nem grupo. E ela carrega tabulação, `visto`
-- e vínculo com acordo — coisas que uma pessoa produziu e que um retrato
-- substituível não pode apagar junto. São dois ciclos de vida diferentes na
-- mesma tabela, e misturá-los seria a origem do próximo bug silencioso.
--
-- ## A descoberta que sustenta o desenho (medida em 04/09/2026)
--
-- O relatório 58 — o que a liderança importa hoje, um por setor — é uma FATIA
-- EXATA do 59, recortada pela coluna `NomeGrupoFiltro`:
--
--   58 do Play 5                                  2.210 linhas · R$ 361.768,85
--   59 com `NomeGrupoFiltro = 'MARILIA - PLAY 5'`  2.210 linhas · R$ 361.768,85
--   diferença                                          0 linhas · R$      0,00
--
-- Pareamento bijetivo por NrDocumento + Parcela + DtPgto + Recebido + Cobradora
-- + Título, e 13 das 15 colunas comuns idênticas célula a célula.
--
-- ⚠️ A análise de 01/09/2026 cruzava os dois pela coluna `Setor` e concluiu que
-- discordavam. Está anulada. `Setor` responde «para quem o dinheiro conta»
-- (34 rótulos, 377 linhas vazias, receptivo composto); `NomeGrupoFiltro`
-- responde «quem cobrou» (16 rótulos, zero linha vazia, soma exata do arquivo).
--
-- ## O vínculo é pelo CÓDIGO, não pelo nome
--
-- `CodGrupoFiltro` e `NomeGrupoFiltro` são 1-para-1 exatos: 16 códigos, 16
-- nomes, nenhum código com dois nomes e nenhum nome com dois códigos. O código
-- sobrevive à troca de liderança — `COB PLAY 1 - PAOLA` vira outro texto quando
-- a Paola sair, e o código 25 continua 25. Por isso `mestre_grupos` é única por
-- (empresa, `cod_grupo_filtro`) e guarda o nome apenas como rótulo.
--
-- ## Um lote é um retrato, e retratos se substituem
--
-- Não existe chave única no 59: 4.338 linhas do arquivo são idênticas nas 28
-- colunas (4.334 delas no `MARILIA - COFEN`), e nenhuma coluna as separa. Pior:
-- sob a chave de dedupe que `analitico_recebimentos` usa hoje, 25,6% do arquivo
-- colidiria — 19.402 linhas, R$ 3.038.257,81.
--
-- Então aqui não há `ON CONFLICT` e não há upsert. A carga insere um lote novo
-- inteiro, e a PROMOÇÃO troca o ponteiro numa transação só: o lote anterior do
-- mesmo mês vira `substituido` e as linhas dele são apagadas. Ninguém nunca vê
-- meio retrato.
--
-- O lote substituído SOBREVIVE como registro (hash, contagem, quem, quando) —
-- só as 50 mil linhas dele saem. É o que permite responder «esta carga mudou
-- alguma coisa?» sem guardar o mês inteiro várias vezes.
--
-- ## O hash existe por um motivo medido
--
-- A rotina do ERP reescreve o arquivo no servidor mesmo quando não há dado novo
-- (visto 3× em 25/08/2026, conteúdo idêntico). Automação que decidir "mudou"
-- pelo `mtime` vai anunciar sincronização que não aconteceu. `arquivo_hash` é
-- SHA-256 do conteúdo, e é ele que responde.
-- ============================================================================

-- ── Lotes ───────────────────────────────────────────────────────────────────

create table if not exists public.mestre_lotes (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  -- Primeiro dia do mês. O mês sai de `DtPgto` — decisão de 04/09/2026, tomada
  -- porque o 59 traz também `PrevPgto` e `DtLig`, e duas datas competindo pela
  -- mesma pergunta é como a divergência volta pela porta dos fundos.
  mes               date not null,
  arquivo_nome      text not null,
  -- SHA-256 hex do conteúdo do arquivo. Ver o cabeçalho.
  arquivo_hash      text not null,
  linhas            integer not null default 0,
  total_recebido    numeric(14,2) not null default 0,
  estado            text not null default 'aberto'
                      check (estado in ('aberto', 'vigente', 'substituido', 'descartado')),
  importado_por_id  uuid references public.perfis(id) on delete set null,
  importado_em      timestamptz not null default now(),
  promovido_em      timestamptz,
  substituido_em    timestamptz,
  -- Qual lote tomou o lugar deste. Nulo enquanto vigente.
  substituido_por   uuid references public.mestre_lotes(id) on delete set null
);

comment on table public.mestre_lotes is
  'Cada carga do relatório 59. Um único lote `vigente` por (empresa, mês) — ver o índice parcial abaixo.';

-- A regra central do desenho, escrita como constraint em vez de confiada ao
-- código: dois lotes vigentes no mesmo mês seriam o mês contado em dobro.
create unique index if not exists mestre_lotes_um_vigente_por_mes
  on public.mestre_lotes (empresa_id, mes)
  where estado = 'vigente';

create index if not exists mestre_lotes_empresa_mes
  on public.mestre_lotes (empresa_id, mes desc, importado_em desc);

-- ── As linhas do retrato ────────────────────────────────────────────────────
--
-- 26 das 28 colunas do arquivo. `DDD1` e `Fone1` ficam de fora: são telefone do
-- cliente, nada no sistema usa, e trazer contato pessoal para uma tabela nova é
-- ampliar o dado guardado sem ninguém ter pedido.

create table if not exists public.mestre_recebimentos (
  id                   bigint generated always as identity primary key,
  lote_id              uuid not null references public.mestre_lotes(id) on delete cascade,
  empresa_id           uuid not null references public.empresas(id) on delete cascade,
  -- Repetidos do lote de propósito: toda consulta filtra por eles, e o join
  -- para o lote em 50 mil linhas custa mais do que a redundância.
  mes                  date not null,

  -- Atribuição do ERP. Para o receptivo vem composta:
  -- `COB RECEPTIVO - BEATRIZ - «destino»`. NÃO é o recorte do 58.
  setor                text not null default '',
  -- O recorte do 58, e a chave do vínculo. Ver o cabeçalho.
  cod_grupo_filtro     text not null,
  nome_grupo_filtro    text not null default '',
  cod_grupo            text not null default '',
  cod_grupo_representa text,
  setor_orig           text,

  cobradora            text not null default '',
  operador_orig        text,
  -- Só texto, sem código no arquivo — é a dimensão que precisa de histórico.
  subgrupo_equipe      text not null default '',

  cliente              text not null default '',
  cod_cli              text not null default '',
  titulo               text not null default '',
  nr_documento         text not null default '',
  -- Texto, não número: o COFEN usa `201601`, que é competência, não parcela.
  parcela              text not null default '',
  empresa_erp          text not null default '',
  tipo_venda           text,
  tp_doc               text not null default '',
  -- `Colchão?` = Sim. Recebimento automático de acordo de período anterior.
  -- A marcação NÃO é derivável das outras colunas (melhor tentativa: ~87%) —
  -- depender da coluna, nunca recalcular.
  colchao              boolean not null default false,
  -- `Integral` / `Extra`. O Direto/Extra deixa de ser inferido.
  tipo                 text not null default '',

  dt_lig               date,
  prev_pgto            date,
  dt_pgto              date not null,
  dias                 integer,
  dias_atraso          integer,
  dias_ligacao_baixa   integer,
  recebido             numeric(12,2) not null default 0,

  -- Linha no arquivo. Serve para casar um erro da tela com o CSV aberto no
  -- Excel, e para provar que a ordem do retrato foi preservada.
  linha_num            integer not null
);

comment on table public.mestre_recebimentos is
  'Linhas do relatório 59, verbatim. Substituídas inteiras a cada promoção de lote — nunca atualizadas linha a linha.';

-- Índice do descarte: apagar as ~50 mil linhas do lote substituído.
create index if not exists mestre_recebimentos_lote
  on public.mestre_recebimentos (lote_id);

-- O agrupamento que a aba faz o tempo todo.
create index if not exists mestre_recebimentos_grupo
  on public.mestre_recebimentos (empresa_id, mes, cod_grupo_filtro);

create index if not exists mestre_recebimentos_dia
  on public.mestre_recebimentos (empresa_id, mes, dt_pgto);

create index if not exists mestre_recebimentos_cobradora
  on public.mestre_recebimentos (empresa_id, mes, cobradora);

-- ── O vínculo: rótulo do ERP → setor do sistema ─────────────────────────────

create table if not exists public.mestre_grupos (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresas(id) on delete cascade,
  -- A chave. Sobrevive à troca de liderança; o nome não.
  cod_grupo_filtro   text not null,
  -- Último nome visto. Rótulo de tela e histórico, nunca chave.
  nome_grupo_filtro  text not null default '',
  setor_id           uuid references public.setores(id) on delete set null,
  -- `novo`      — apareceu e ninguém decidiu ainda. O dinheiro não conta.
  -- `vinculado` — tem setor. Exige `setor_id`, e a constraint garante.
  -- `ignorado`  — decidido que não entra (ex.: rótulo que não é operação).
  estado             text not null default 'novo'
                       check (estado in ('novo', 'vinculado', 'ignorado')),
  primeira_aparicao  date not null,
  ultima_aparicao    date not null,
  vinculado_por_id   uuid references public.perfis(id) on delete set null,
  vinculado_em       timestamptz,
  observacao         text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),

  constraint mestre_grupos_unico unique (empresa_id, cod_grupo_filtro),
  -- Estado e setor não podem discordar: `vinculado` sem setor seria dinheiro
  -- que a tela promete ter destino e não tem.
  constraint mestre_grupos_vinculo_coerente check (
    (estado = 'vinculado' and setor_id is not null)
    or (estado <> 'vinculado' and setor_id is null)
  )
);

comment on table public.mestre_grupos is
  'Liga `CodGrupoFiltro` do relatório 59 a um setor do sistema. Preenchido à mão — o sistema nunca adivinha em definitivo.';

-- ── A dimensão equipe: observada, ainda não vinculada ───────────────────────
--
-- `SubgrupoEquipe` vem na LINHA, e é o maior ganho do 59: hoje a equipe de um
-- recebimento sai do cadastro ATUAL da pessoa, então quem troca de equipe
-- reescreve o passado até o `composicao_mes` congelar. No 59 a equipe é a que
-- valia no dia do pagamento.
--
-- Mas essa coluna não tem código, só texto — 58 rótulos distintos, incluindo
-- `ATESTADOS|FERIAS`, `LIDERANÇA`, `SUPERVISORES` e o vazio, que não são
-- equipes. Por isso ela nasce só como OBSERVAÇÃO com histórico: quem apareceu,
-- quando, e quando sumiu. Vincular equipe é fase seguinte.

create table if not exists public.mestre_equipes (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  cod_grupo_filtro  text not null,
  nome_subgrupo     text not null,
  equipe_id         uuid references public.equipes(id) on delete set null,
  estado            text not null default 'novo'
                      check (estado in ('novo', 'vinculado', 'ignorado')),
  primeira_aparicao date not null,
  ultima_aparicao   date not null,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),

  constraint mestre_equipes_unico unique (empresa_id, cod_grupo_filtro, nome_subgrupo)
);

create index if not exists mestre_equipes_grupo
  on public.mestre_equipes (empresa_id, cod_grupo_filtro);

-- ── O histórico ─────────────────────────────────────────────────────────────
--
-- `logs_sistema` existe e continua sendo a trilha geral. Isto aqui é outra
-- coisa: a linha do tempo dos RÓTULOS, que é o que se consulta quando o número
-- de um setor muda e ninguém sabe por quê. Uma equipe que sumiu do relatório em
-- 12/08 explica um card vazio melhor do que qualquer log de importação.

create table if not exists public.mestre_eventos (
  id                bigint generated always as identity primary key,
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  lote_id           uuid references public.mestre_lotes(id) on delete set null,
  tipo              text not null check (tipo in (
                      'lote_promovido', 'lote_descartado',
                      'grupo_novo', 'grupo_sumiu', 'grupo_voltou',
                      'equipe_nova', 'equipe_sumiu', 'equipe_voltou',
                      'vinculo_definido', 'vinculo_alterado', 'vinculo_removido',
                      'grupo_ignorado'
                    )),
  cod_grupo_filtro  text,
  rotulo            text,
  detalhes          jsonb,
  usuario_id        uuid references public.perfis(id) on delete set null,
  criado_em         timestamptz not null default now()
);

create index if not exists mestre_eventos_empresa
  on public.mestre_eventos (empresa_id, criado_em desc);

create index if not exists mestre_eventos_grupo
  on public.mestre_eventos (empresa_id, cod_grupo_filtro, criado_em desc);

-- ── RLS: super_admin, e só ──────────────────────────────────────────────────
--
-- Fase 1 inteira é de conferência. Abrir para diretoria antes de o número estar
-- provado seria publicar um total que ainda pode mudar — e um número visto uma
-- vez vira referência mesmo depois de corrigido.

alter table public.mestre_lotes         enable row level security;
alter table public.mestre_recebimentos  enable row level security;
alter table public.mestre_grupos        enable row level security;
alter table public.mestre_equipes       enable row level security;
alter table public.mestre_eventos       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'mestre_lotes', 'mestre_recebimentos', 'mestre_grupos', 'mestre_equipes', 'mestre_eventos'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_super_admin', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using ((select public.fn_user_is_super_admin())) '
      || 'with check ((select public.fn_user_is_super_admin()))',
      t || '_super_admin', t);
  end loop;
end $$;

-- ── Carga: abrir, encher, promover ──────────────────────────────────────────

create or replace function public.fn_mestre_abrir_lote(
  p_empresa_id uuid,
  p_mes        text,        -- 'yyyy-MM'
  p_arquivo    text,
  p_hash       text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id  uuid;
  v_mes date;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Apenas super_admin pode importar o relatório mestre.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'Mês inválido: %. Esperado aaaa-mm.', p_mes;
  end if;
  v_mes := (p_mes || '-01')::date;

  insert into mestre_lotes (empresa_id, mes, arquivo_nome, arquivo_hash, importado_por_id)
  values (p_empresa_id, v_mes, p_arquivo, p_hash, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.fn_mestre_abrir_lote(uuid, text, text, text) is
  'Cria um lote no estado `aberto`. Ele não conta para nada até `fn_mestre_promover_lote`.';

create or replace function public.fn_mestre_inserir_linhas(
  p_lote_id uuid,
  p_linhas  jsonb          -- array de objetos, campos = colunas da tabela
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_empresa uuid;
  v_mes     date;
  v_estado  text;
  v_n       integer;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Apenas super_admin pode importar o relatório mestre.';
  end if;

  select empresa_id, mes, estado into v_empresa, v_mes, v_estado
    from mestre_lotes where id = p_lote_id;
  if v_empresa is null then
    raise exception 'Lote % não existe.', p_lote_id;
  end if;
  -- Um lote promovido é um retrato fechado. Deixar acrescentar linhas nele
  -- depois seria mudar o passado sem trilha.
  if v_estado <> 'aberto' then
    raise exception 'Lote % está em "%" — só um lote aberto recebe linhas.', p_lote_id, v_estado;
  end if;

  insert into mestre_recebimentos (
    lote_id, empresa_id, mes,
    setor, cod_grupo_filtro, nome_grupo_filtro, cod_grupo, cod_grupo_representa, setor_orig,
    cobradora, operador_orig, subgrupo_equipe,
    cliente, cod_cli, titulo, nr_documento, parcela, empresa_erp, tipo_venda, tp_doc,
    colchao, tipo,
    dt_lig, prev_pgto, dt_pgto, dias, dias_atraso, dias_ligacao_baixa, recebido, linha_num
  )
  select
    p_lote_id, v_empresa, v_mes,
    coalesce(x.setor, ''), x.cod_grupo_filtro, coalesce(x.nome_grupo_filtro, ''),
    coalesce(x.cod_grupo, ''), x.cod_grupo_representa, x.setor_orig,
    coalesce(x.cobradora, ''), x.operador_orig, coalesce(x.subgrupo_equipe, ''),
    coalesce(x.cliente, ''), coalesce(x.cod_cli, ''), coalesce(x.titulo, ''),
    coalesce(x.nr_documento, ''), coalesce(x.parcela, ''), coalesce(x.empresa_erp, ''),
    x.tipo_venda, coalesce(x.tp_doc, ''),
    coalesce(x.colchao, false), coalesce(x.tipo, ''),
    x.dt_lig, x.prev_pgto, x.dt_pgto, x.dias, x.dias_atraso, x.dias_ligacao_baixa,
    coalesce(x.recebido, 0), coalesce(x.linha_num, 0)
  from jsonb_to_recordset(p_linhas) as x(
    setor                text,
    cod_grupo_filtro     text,
    nome_grupo_filtro    text,
    cod_grupo            text,
    cod_grupo_representa text,
    setor_orig           text,
    cobradora            text,
    operador_orig        text,
    subgrupo_equipe      text,
    cliente              text,
    cod_cli              text,
    titulo               text,
    nr_documento         text,
    parcela              text,
    empresa_erp          text,
    tipo_venda           text,
    tp_doc               text,
    colchao              boolean,
    tipo                 text,
    dt_lig               date,
    prev_pgto            date,
    dt_pgto              date,
    dias                 integer,
    dias_atraso          integer,
    dias_ligacao_baixa   integer,
    recebido             numeric,
    linha_num            integer
  );

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.fn_mestre_inserir_linhas(uuid, jsonb) is
  'Insere um pedaço do arquivo num lote aberto. Sem ON CONFLICT: o 59 não tem chave única (4.338 linhas idênticas nas 28 colunas).';

create or replace function public.fn_mestre_promover_lote(p_lote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_empresa    uuid;
  v_mes        date;
  v_estado     text;
  v_anterior   uuid;
  v_linhas     integer;
  v_total      numeric(14,2);
  v_novos      integer := 0;
  v_sumiram    integer := 0;
  v_voltaram   integer := 0;
  v_eq_novas   integer := 0;
  v_eq_sumiram integer := 0;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Apenas super_admin pode importar o relatório mestre.';
  end if;

  select empresa_id, mes, estado into v_empresa, v_mes, v_estado
    from mestre_lotes where id = p_lote_id for update;
  if v_empresa is null then
    raise exception 'Lote % não existe.', p_lote_id;
  end if;
  if v_estado <> 'aberto' then
    raise exception 'Lote % está em "%" — só um lote aberto pode ser promovido.', p_lote_id, v_estado;
  end if;

  select count(*), coalesce(sum(recebido), 0) into v_linhas, v_total
    from mestre_recebimentos where lote_id = p_lote_id;
  if v_linhas = 0 then
    raise exception 'Lote % está vazio — promovê-lo apagaria o retrato do mês e não poria nada no lugar.', p_lote_id;
  end if;

  select id into v_anterior
    from mestre_lotes
   where empresa_id = v_empresa and mes = v_mes and estado = 'vigente'
   for update;

  -- ── Histórico ANTES de trocar o ponteiro ─────────────────────────────────
  -- Comparar contra o retrato que está saindo é o que dá sentido a "sumiu": é
  -- entre esta carga e a anterior DO MESMO MÊS, não entre meses.

  if v_anterior is not null then
    insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
    select v_empresa, p_lote_id, 'grupo_sumiu', a.cod_grupo_filtro,
           max(a.nome_grupo_filtro),
           jsonb_build_object('linhas', count(*), 'recebido', sum(a.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
           auth.uid()
      from mestre_recebimentos a
     where a.lote_id = v_anterior
       and not exists (
             select 1 from mestre_recebimentos n
              where n.lote_id = p_lote_id and n.cod_grupo_filtro = a.cod_grupo_filtro)
     group by a.cod_grupo_filtro;
    get diagnostics v_sumiram = row_count;

    insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
    select v_empresa, p_lote_id, 'equipe_sumiu', a.cod_grupo_filtro, a.subgrupo_equipe,
           jsonb_build_object('linhas', count(*), 'recebido', sum(a.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
           auth.uid()
      from mestre_recebimentos a
     where a.lote_id = v_anterior and a.subgrupo_equipe <> ''
       and not exists (
             select 1 from mestre_recebimentos n
              where n.lote_id = p_lote_id
                and n.cod_grupo_filtro = a.cod_grupo_filtro
                and n.subgrupo_equipe  = a.subgrupo_equipe)
     group by a.cod_grupo_filtro, a.subgrupo_equipe;
    get diagnostics v_eq_sumiram = row_count;
  end if;

  -- Grupo que o cadastro ainda não conhece.
  insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
  select v_empresa, p_lote_id, 'grupo_novo', n.cod_grupo_filtro, max(n.nome_grupo_filtro),
         jsonb_build_object('linhas', count(*), 'recebido', sum(n.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
         auth.uid()
    from mestre_recebimentos n
   where n.lote_id = p_lote_id
     and not exists (
           select 1 from mestre_grupos g
            where g.empresa_id = v_empresa and g.cod_grupo_filtro = n.cod_grupo_filtro)
   group by n.cod_grupo_filtro;
  get diagnostics v_novos = row_count;

  -- Grupo conhecido que estava sem aparecer e voltou. Só faz sentido quando há
  -- retrato anterior para comparar.
  if v_anterior is not null then
    insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
    select v_empresa, p_lote_id, 'grupo_voltou', n.cod_grupo_filtro, max(n.nome_grupo_filtro),
           jsonb_build_object('linhas', count(*), 'recebido', sum(n.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
           auth.uid()
      from mestre_recebimentos n
     where n.lote_id = p_lote_id
       and exists (
             select 1 from mestre_grupos g
              where g.empresa_id = v_empresa and g.cod_grupo_filtro = n.cod_grupo_filtro)
       and not exists (
             select 1 from mestre_recebimentos a
              where a.lote_id = v_anterior and a.cod_grupo_filtro = n.cod_grupo_filtro)
     group by n.cod_grupo_filtro;
    get diagnostics v_voltaram = row_count;
  end if;

  insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
  select v_empresa, p_lote_id, 'equipe_nova', n.cod_grupo_filtro, n.subgrupo_equipe,
         jsonb_build_object('linhas', count(*), 'recebido', sum(n.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
         auth.uid()
    from mestre_recebimentos n
   where n.lote_id = p_lote_id and n.subgrupo_equipe <> ''
     and not exists (
           select 1 from mestre_equipes e
            where e.empresa_id = v_empresa
              and e.cod_grupo_filtro = n.cod_grupo_filtro
              and e.nome_subgrupo    = n.subgrupo_equipe)
   group by n.cod_grupo_filtro, n.subgrupo_equipe;
  get diagnostics v_eq_novas = row_count;

  -- ── Cadastro de rótulos ──────────────────────────────────────────────────
  -- O nome é atualizado; o VÍNCULO nunca. Um rótulo renomeado no ERP continua
  -- apontando para o setor que alguém escolheu — é para isso que a chave é o
  -- código.

  insert into mestre_grupos (
    empresa_id, cod_grupo_filtro, nome_grupo_filtro, primeira_aparicao, ultima_aparicao)
  select v_empresa, n.cod_grupo_filtro,
         (array_agg(n.nome_grupo_filtro order by n.id))[1],
         v_mes, v_mes
    from mestre_recebimentos n
   where n.lote_id = p_lote_id
   group by n.cod_grupo_filtro
  on conflict (empresa_id, cod_grupo_filtro) do update
     set nome_grupo_filtro = excluded.nome_grupo_filtro,
         primeira_aparicao = least(mestre_grupos.primeira_aparicao, excluded.primeira_aparicao),
         ultima_aparicao   = greatest(mestre_grupos.ultima_aparicao, excluded.ultima_aparicao),
         atualizado_em     = now();

  insert into mestre_equipes (
    empresa_id, cod_grupo_filtro, nome_subgrupo, primeira_aparicao, ultima_aparicao)
  select v_empresa, n.cod_grupo_filtro, n.subgrupo_equipe, v_mes, v_mes
    from mestre_recebimentos n
   where n.lote_id = p_lote_id and n.subgrupo_equipe <> ''
   group by n.cod_grupo_filtro, n.subgrupo_equipe
  on conflict (empresa_id, cod_grupo_filtro, nome_subgrupo) do update
     set primeira_aparicao = least(mestre_equipes.primeira_aparicao, excluded.primeira_aparicao),
         ultima_aparicao   = greatest(mestre_equipes.ultima_aparicao, excluded.ultima_aparicao),
         atualizado_em     = now();

  -- ── A troca do ponteiro ──────────────────────────────────────────────────
  -- Tudo daqui para baixo acontece na mesma transação da função. O índice
  -- parcial `mestre_lotes_um_vigente_por_mes` obriga a ordem: aposentar o
  -- anterior ANTES de promover, senão haveria dois vigentes por um instante e
  -- o banco recusaria.

  if v_anterior is not null then
    update mestre_lotes
       set estado = 'substituido', substituido_em = now(), substituido_por = p_lote_id
     where id = v_anterior;
    -- As linhas do retrato antigo saem; o REGISTRO do lote fica, com hash e
    -- contagem, para responder "esta carga mudou alguma coisa?".
    delete from mestre_recebimentos where lote_id = v_anterior;
  end if;

  update mestre_lotes
     set estado = 'vigente', promovido_em = now(), linhas = v_linhas, total_recebido = v_total
   where id = p_lote_id;

  insert into mestre_eventos (empresa_id, lote_id, tipo, detalhes, usuario_id)
  values (v_empresa, p_lote_id, 'lote_promovido',
          jsonb_build_object(
            'mes', to_char(v_mes, 'YYYY-MM'),
            'linhas', v_linhas,
            'total_recebido', v_total,
            'substituiu', v_anterior,
            'grupos_novos', v_novos,
            'grupos_sumiram', v_sumiram,
            'grupos_voltaram', v_voltaram,
            'equipes_novas', v_eq_novas,
            'equipes_sumiram', v_eq_sumiram),
          auth.uid());

  return jsonb_build_object(
    'lote_id', p_lote_id,
    'mes', to_char(v_mes, 'YYYY-MM'),
    'linhas', v_linhas,
    'total_recebido', v_total,
    'substituiu', v_anterior,
    'grupos_novos', v_novos,
    'grupos_sumiram', v_sumiram,
    'grupos_voltaram', v_voltaram,
    'equipes_novas', v_eq_novas,
    'equipes_sumiram', v_eq_sumiram);
end;
$$;

comment on function public.fn_mestre_promover_lote(uuid) is
  'Troca o retrato do mês numa transação: registra o histórico, atualiza o cadastro de rótulos, aposenta o lote anterior e apaga as linhas dele.';

create or replace function public.fn_mestre_descartar_lote(p_lote_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_estado text; v_empresa uuid;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Apenas super_admin pode importar o relatório mestre.';
  end if;

  select estado, empresa_id into v_estado, v_empresa from mestre_lotes where id = p_lote_id;
  if v_estado is null then return; end if;
  -- Descartar um vigente deixaria o mês sem retrato. Para trocar, promova outro.
  if v_estado <> 'aberto' then
    raise exception 'Lote % está em "%" — só um lote aberto pode ser descartado.', p_lote_id, v_estado;
  end if;

  delete from mestre_recebimentos where lote_id = p_lote_id;
  update mestre_lotes set estado = 'descartado' where id = p_lote_id;

  insert into mestre_eventos (empresa_id, lote_id, tipo, detalhes, usuario_id)
  values (v_empresa, p_lote_id, 'lote_descartado', jsonb_build_object('motivo', 'descartado pela tela'), auth.uid());
end;
$$;

-- ── Vínculo ─────────────────────────────────────────────────────────────────

create or replace function public.fn_mestre_vincular_grupo(
  p_empresa_id uuid,
  p_cod        text,
  p_setor_id   uuid,     -- nulo com estado 'novo' ou 'ignorado'
  p_estado     text,
  p_observacao text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_antes   record;
  v_tipo    text;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Apenas super_admin pode vincular grupos do relatório mestre.';
  end if;
  if p_estado not in ('novo', 'vinculado', 'ignorado') then
    raise exception 'Estado inválido: %.', p_estado;
  end if;
  if p_estado = 'vinculado' and p_setor_id is null then
    raise exception 'Vincular exige um setor.';
  end if;
  -- Um setor de outra empresa daria um vínculo que nenhuma tela consegue ler.
  if p_setor_id is not null and not exists (
       select 1 from setores s where s.id = p_setor_id and s.empresa_id = p_empresa_id) then
    raise exception 'O setor não pertence a esta empresa.';
  end if;

  select * into v_antes from mestre_grupos
   where empresa_id = p_empresa_id and cod_grupo_filtro = p_cod;
  if v_antes is null then
    raise exception 'O grupo % ainda não apareceu em nenhuma carga.', p_cod;
  end if;

  update mestre_grupos
     set setor_id         = case when p_estado = 'vinculado' then p_setor_id else null end,
         estado           = p_estado,
         observacao       = coalesce(p_observacao, observacao),
         vinculado_por_id = auth.uid(),
         vinculado_em     = now(),
         atualizado_em    = now()
   where empresa_id = p_empresa_id and cod_grupo_filtro = p_cod;

  v_tipo := case
    when p_estado = 'ignorado'                    then 'grupo_ignorado'
    when p_estado = 'novo'                        then 'vinculo_removido'
    when v_antes.setor_id is null                 then 'vinculo_definido'
    when v_antes.setor_id is distinct from p_setor_id then 'vinculo_alterado'
    else 'vinculo_definido'
  end;

  insert into mestre_eventos (empresa_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
  values (p_empresa_id, v_tipo, p_cod, v_antes.nome_grupo_filtro,
          jsonb_build_object(
            'antes',  jsonb_build_object('estado', v_antes.estado, 'setor_id', v_antes.setor_id),
            'depois', jsonb_build_object('estado', p_estado, 'setor_id', p_setor_id)),
          auth.uid());
end;
$$;

-- ── Leitura: o resumo que a aba mostra ──────────────────────────────────────
--
-- Agrega no BANCO. São ~51 mil linhas por mês; trazê-las para o navegador só
-- para somar seria pagar 13 MB de rede a cada abertura de aba.

create or replace function public.fn_mestre_resumo_grupos(
  p_empresa_id uuid,
  p_mes        text        -- 'yyyy-MM'
) returns table (
  cod_grupo_filtro  text,
  nome_no_relatorio text,
  nome_cadastrado   text,
  setor_id          uuid,
  setor_nome        text,
  estado            text,
  linhas            bigint,
  recebido          numeric,
  colchao_valor     numeric,
  extra_valor       numeric,
  equipes           bigint,
  cobradoras        bigint,
  dias              bigint,
  primeira_aparicao date,
  ultima_aparicao   date
)
language sql
stable
security definer
set search_path to 'public'
as $$
  -- A CTE NÃO se chama `mes`: `mestre_recebimentos` tem uma coluna com esse
  -- nome, e o dia em que alguém tirar um alias da consulta a ambiguidade vira
  -- erro difícil de ler.
  with ref as (select ((p_mes || '-01')::date) as d),
  fatia as (
    select r.*
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id and r.mes = (select d from ref)
  ),
  agg as (
    select f.cod_grupo_filtro,
           (array_agg(f.nome_grupo_filtro order by f.id))[1] as nome_no_relatorio,
           count(*)                                          as linhas,
           sum(f.recebido)                                   as recebido,
           sum(f.recebido) filter (where f.colchao)          as colchao_valor,
           sum(f.recebido) filter (where lower(f.tipo) = 'extra') as extra_valor,
           count(distinct f.subgrupo_equipe) filter (where f.subgrupo_equipe <> '') as equipes,
           count(distinct f.cobradora)                       as cobradoras,
           count(distinct f.dt_pgto)                         as dias
      from fatia f
     group by f.cod_grupo_filtro
  )
  select
    coalesce(a.cod_grupo_filtro, g.cod_grupo_filtro),
    coalesce(a.nome_no_relatorio, ''),
    coalesce(g.nome_grupo_filtro, ''),
    g.setor_id,
    s.nome,
    coalesce(g.estado, 'novo'),
    coalesce(a.linhas, 0),
    coalesce(a.recebido, 0),
    coalesce(a.colchao_valor, 0),
    coalesce(a.extra_valor, 0),
    coalesce(a.equipes, 0),
    coalesce(a.cobradoras, 0),
    coalesce(a.dias, 0),
    g.primeira_aparicao,
    g.ultima_aparicao
  from agg a
  -- FULL JOIN de propósito: um grupo já cadastrado que NÃO veio neste mês tem
  -- que aparecer com zero, e não sumir da tela. Rótulo que some sem aviso é
  -- exatamente o que o histórico existe para impedir.
  full join mestre_grupos g
    on g.empresa_id = p_empresa_id and g.cod_grupo_filtro = a.cod_grupo_filtro
  left join setores s on s.id = g.setor_id
  where fn_user_is_super_admin()
  order by coalesce(a.recebido, 0) desc, 1;
$$;

comment on function public.fn_mestre_resumo_grupos(uuid, text) is
  'Um card por grupo do relatório 59 no mês vigente, com o vínculo ao lado. Grupo cadastrado que não veio no mês aparece zerado, não some.';

create or replace function public.fn_mestre_resumo_equipes(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text
) returns table (
  nome_subgrupo     text,
  linhas            bigint,
  recebido          numeric,
  cobradoras        bigint,
  primeira_aparicao date,
  ultima_aparicao   date,
  estado            text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    coalesce(a.subgrupo_equipe, e.nome_subgrupo),
    coalesce(a.linhas, 0),
    coalesce(a.recebido, 0),
    coalesce(a.cobradoras, 0),
    e.primeira_aparicao,
    e.ultima_aparicao,
    coalesce(e.estado, 'novo')
  from (
    select r.subgrupo_equipe, count(*) as linhas, sum(r.recebido) as recebido,
           count(distinct r.cobradora) as cobradoras
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = ((p_mes || '-01')::date)
       and r.cod_grupo_filtro = p_cod
     group by r.subgrupo_equipe
  ) a
  full join mestre_equipes e
    on e.empresa_id = p_empresa_id and e.cod_grupo_filtro = p_cod
   and e.nome_subgrupo = a.subgrupo_equipe
  where fn_user_is_super_admin()
  order by coalesce(a.recebido, 0) desc, 1;
$$;

-- ── Permissões ──────────────────────────────────────────────────────────────
-- As funções são SECURITY DEFINER e checam `fn_user_is_super_admin()` dentro.
-- O GRANT é para `authenticated` porque é o papel de quem chama; a checagem de
-- cargo é a que decide.

grant execute on function public.fn_mestre_abrir_lote(uuid, text, text, text)          to authenticated;
grant execute on function public.fn_mestre_inserir_linhas(uuid, jsonb)                 to authenticated;
grant execute on function public.fn_mestre_promover_lote(uuid)                         to authenticated;
grant execute on function public.fn_mestre_descartar_lote(uuid)                        to authenticated;
grant execute on function public.fn_mestre_vincular_grupo(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.fn_mestre_resumo_grupos(uuid, text)                   to authenticated;
grant execute on function public.fn_mestre_resumo_equipes(uuid, text, text)            to authenticated;
