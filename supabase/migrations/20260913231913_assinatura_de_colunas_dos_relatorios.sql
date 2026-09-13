-- ═══════════════════════════════════════════════════════════════════════════
-- A armadilha de cabeçalho: avisar quando o relatório muda de formato
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fase 0.1 do `docs/PLANO-SINCRONIZACAO-59.md`.
--
-- ## O problema, e por que ele é silencioso
--
-- Os parsers resolvem coluna por ALIAS (`resolveCols`): procuram "dtpgto",
-- "datapgto", "datapagamento". Isso os torna tolerantes a variação de nome — e
-- é justamente essa tolerância que os torna perigosos.
--
-- Uma coluna renomeada no ERP **não quebra a importação**. Ela simplesmente
-- para de ser lida, e o número fica menor sem ninguém ver. Uma coluna nova
-- também não quebra: entra e é ignorada, mesmo que fosse ela que devia estar
-- sendo somada.
--
-- Coluna obrigatória faltando já é recusada (`resolveCols` devolve `null`). O
-- que não tinha guarda nenhuma era o resto — e o resto é a maioria.
--
-- ## O desenho
--
-- Uma linha por empresa e tipo de relatório, guardando o cabeçalho da ÚLTIMA
-- importação confirmada. O preview compara e avisa; o registro só acontece
-- depois de importar de verdade — um arquivo que a pessoa olhou e descartou não
-- pode redefinir o que o ERP "costuma mandar".
--
-- A ordem das colunas faz parte da assinatura de propósito: cabeçalho com os
-- mesmos nomes em outra ordem é outro formato. Hoje os parsers resolvem por
-- alias e sobreviveriam, mas já houve resolução por índice neste projeto, e ali
-- um cabeçalho reordenado leria tudo trocado sem reclamar.
--
-- `importacoes` conta quantas vezes o formato foi aceito. Formato visto uma vez
-- só merece menos confiança do que um visto cem vezes, e a tela diz isso.
--
-- ## O que esta armadilha NÃO faz
--
-- Não bloqueia. Quem manda decide se o formato novo é legítimo — o ERP muda de
-- verdade de vez em quando, e uma trava dura faria a pessoa procurar como
-- desligá-la. O valor está em avisar ANTES de confirmar.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '60s';

create table if not exists public.relatorio_assinaturas (
  empresa_id    uuid        not null references public.empresas(id) on delete cascade,
  tipo          text        not null,
  colunas       text[]      not null,
  primeira_vez  timestamptz not null default now(),
  visto_em      timestamptz not null default now(),
  visto_por_id  uuid        references public.perfis(id) on delete set null,
  importacoes   integer     not null default 1,
  primary key (empresa_id, tipo),
  constraint relatorio_assinaturas_tipo_check
    check (tipo in ('analitico_pagueplay', 'analitico_bookplay', 'mestre_59'))
);

comment on table public.relatorio_assinaturas is
  'O cabecalho que cada relatorio do ERP vem mandando, por empresa e tipo. A '
  'importacao compara e avisa ANTES de confirmar quando muda. Uma linha por '
  'empresa/tipo: guarda o ultimo formato aceito, nao o historico.';
comment on column public.relatorio_assinaturas.colunas is
  'Cabecalho NORMALIZADO (sem acento, minusculo, so alfanumerico) e na ordem '
  'em que veio. A ordem importa: coluna que troca de lugar e sinal de formato '
  'diferente, mesmo quando todos os nomes continuam ali.';
comment on column public.relatorio_assinaturas.importacoes is
  'Quantas importacoes ja aceitaram este formato. Formato visto uma vez so '
  'merece menos confianca do que um visto cem vezes.';

alter table public.relatorio_assinaturas enable row level security;

drop policy if exists relatorio_assinaturas_leitura on public.relatorio_assinaturas;
create policy relatorio_assinaturas_leitura
  on public.relatorio_assinaturas for select
  to authenticated
  using (fn_user_is_super_admin() or fn_can_access_empresa(empresa_id));

-- Sem policy de escrita: a assinatura muda pela funcao abaixo (security
-- definer), quando uma importacao e confirmada. Nunca por edicao direta.

-- ── Ler a assinatura conhecida ─────────────────────────────────────────────

create or replace function public.fn_relatorio_assinatura(
  p_empresa_id uuid,
  p_tipo       text
)
returns table(colunas text[], visto_em timestamptz, importacoes integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select a.colunas, a.visto_em, a.importacoes
    from relatorio_assinaturas a
   where a.empresa_id = p_empresa_id
     and a.tipo = p_tipo
     and (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id));
$function$;

comment on function public.fn_relatorio_assinatura(uuid, text) is
  'O cabecalho conhecido deste relatorio. Zero linhas = primeira importacao, e '
  'ai nao ha com o que comparar.';

grant execute on function public.fn_relatorio_assinatura(uuid, text) to authenticated;

-- ── Registrar o formato aceito ─────────────────────────────────────────────

create or replace function public.fn_relatorio_assinatura_registrar(
  p_empresa_id uuid,
  p_tipo       text,
  p_colunas    text[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)) then
    raise exception 'Sem acesso a esta empresa.';
  end if;
  if p_colunas is null or array_length(p_colunas, 1) is null then
    raise exception 'Assinatura vazia: o arquivo precisa ter cabecalho.';
  end if;

  insert into relatorio_assinaturas as a (empresa_id, tipo, colunas, visto_por_id)
  values (p_empresa_id, p_tipo, p_colunas, auth.uid())
  on conflict (empresa_id, tipo) do update
     set colunas      = excluded.colunas,
         visto_em     = now(),
         visto_por_id = excluded.visto_por_id,
         -- Formato igual ao conhecido soma confianca; formato novo recomeca a
         -- contagem, porque e um formato novo.
         importacoes  = case when a.colunas = excluded.colunas
                             then a.importacoes + 1 else 1 end;
end;
$function$;

comment on function public.fn_relatorio_assinatura_registrar(uuid, text, text[]) is
  'Grava o cabecalho aceito numa importacao confirmada. Chamada DEPOIS de '
  'importar, nunca no preview — o preview so compara.';

grant execute on function public.fn_relatorio_assinatura_registrar(uuid, text, text[]) to authenticated;

commit;
