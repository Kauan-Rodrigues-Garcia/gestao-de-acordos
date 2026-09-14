-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 5, parte 2: o registro do que a importação do 58 apaga
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Regra 7 do `docs/PLANO-SINCRONIZACAO-59.md`. SQL mostrado e aprovado antes de
-- rodar.
--
-- ## Por que isto existe
--
-- Na BookPlay o 58 é o retrato completo do mês: o que não está no arquivo é
-- REMOVIDO do setor. A regra está certa — é ela que tira do sistema a linha que
-- o ERP cancelou. O que estava errado é que a remoção era um `delete` e ponto:
-- nada guardava o que saiu.
--
-- Medido: **2.659 linhas removidas entre 12/08 e 13/09/2026**, e elas não
-- existem mais em lugar nenhum. Entre elas, as 413 linhas e R$ 175.768,38 do
-- Receptivo apagadas em 13/09 por um export salvo da manhã do dia 11. Naquele
-- caso deu para recuperar reimportando o arquivo novo, porque tudo era do 58 e
-- o ERP ainda tinha o dado. Não há garantia de que a próxima vez seja assim.
--
-- ## A lixeira que já existe não serve
--
-- `lixeira_acordos` é moldada para ACORDO: `acordo_id` obrigatório, campos de
-- acordo, e expira em 3 dias. Rollback de importação precisa de linha de
-- recebimento e de prazo de meses. São coisas diferentes.
--
-- ## `conteudo` é jsonb, e não 23 colunas espelhadas
--
-- De propósito: assim a restauração sobrevive a mudança de coluna. Duas foram
-- adicionadas hoje mesmo (`procedencia` e `confirmado_em`, migration
-- 20260914010002); uma tabela-espelho já estaria desatualizada. Restaurar é
-- `jsonb_populate_record(null::analitico_recebimentos, conteudo)`.
--
-- As quatro colunas soltas (codigo, operador, data, valor) existem só para a
-- tela listar sem abrir o jsonb linha a linha.
--
-- ## Custo
--
-- No ritmo medido, ~2.600 linhas/mês, algo como 2 MB/mês. Sem expiração por
-- enquanto — apagar o registro do que foi apagado tem que ser decisão
-- consciente, não efeito de um default que ninguém escolheu.
--
-- ## O que isto NÃO faz
--
-- Não recupera as 2.659 já perdidas. Vale daqui para frente.
--
-- ## Escrita: cria tabela nova, vazia. Nenhuma linha existente é tocada.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create table if not exists public.analitico_removidos (
  id                uuid primary key default gen_random_uuid(),
  lote_id           uuid not null,
  empresa_id        uuid not null,
  setor_id          uuid,
  mes_referencia    date,
  codigo            text,
  operador_usuario  text,
  data_pagamento    date,
  valor_recebido    numeric(14,2),
  conteudo          jsonb not null,
  removido_por_id   uuid,
  removido_em       timestamptz not null default now(),
  restaurado_em     timestamptz,
  restaurado_por_id uuid
);

create index if not exists analitico_removidos_lote
  on public.analitico_removidos (lote_id);
create index if not exists analitico_removidos_empresa_mes
  on public.analitico_removidos (empresa_id, mes_referencia, removido_em desc);

alter table public.analitico_removidos enable row level security;

-- Leitura: quem alcanca a empresa. Escrita: NINGUEM direto — so pelas funcoes
-- abaixo, que sao security definer. Linha de snapshot escrita a mao seria um
-- registro de algo que nao aconteceu.
drop policy if exists analitico_removidos_select on public.analitico_removidos;
create policy analitico_removidos_select on public.analitico_removidos
  for select using (fn_user_is_super_admin() or fn_can_access_empresa(empresa_id));

comment on table public.analitico_removidos is
  'O que a importacao do 58 apagou, para poder voltar. A importacao trata o '
  'arquivo como retrato do mes e remove o que nao esta nele; ate 14/09/2026 '
  'nada guardava o que saia — 2.659 linhas se perderam assim. conteudo e jsonb '
  'para a restauracao sobreviver a mudanca de coluna.';

comment on column public.analitico_removidos.conteudo is
  'A linha inteira de analitico_recebimentos, via to_jsonb. Restaurar e '
  'jsonb_populate_record(null::analitico_recebimentos, conteudo).';

-- ───────────────────────────────────────────────────────────────────────────
-- Copiar e apagar, numa transação só
-- ───────────────────────────────────────────────────────────────────────────
--
-- Antes o cliente fazia `delete ... in (ids)` direto. Se a cópia fosse um
-- segundo comando do cliente, uma falha entre os dois deixaria o dado apagado
-- sem registro — exatamente o que se quer evitar. Aqui as duas coisas são a
-- mesma transação: ou as duas acontecem, ou nenhuma.
--
-- A guarda de procedência está repetida aqui de propósito. O 58 só apaga o que
-- o 58 trouxe (migration 20260914010002), e essa regra não pode depender de o
-- cliente ter filtrado certo.

create or replace function public.fn_analitico_remover_com_snapshot(
  p_lote_id uuid,
  p_ids     uuid[]
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n integer;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select p_lote_id, a.empresa_id, a.setor_id, a.mes_referencia,
         a.codigo, a.operador_usuario, a.data_pagamento, a.valor_recebido,
         to_jsonb(a), auth.uid()
    from analitico_recebimentos a
   where a.id = any(p_ids)
     and a.procedencia = 'relatorio_58'
     and (fn_user_is_super_admin() or fn_can_access_empresa(a.empresa_id));

  get diagnostics v_n = row_count;

  -- Mesmo WHERE da copia, mesma transacao: nao ha como apagar o que nao foi
  -- guardado.
  delete from analitico_recebimentos a
   where a.id = any(p_ids)
     and a.procedencia = 'relatorio_58'
     and (fn_user_is_super_admin() or fn_can_access_empresa(a.empresa_id));

  return v_n;
end;
$function$;

comment on function public.fn_analitico_remover_com_snapshot(uuid, uuid[]) is
  'Remove linhas do 58 guardando o que saiu em analitico_removidos, na mesma '
  'transacao. Substitui o delete direto do cliente: se a copia falhar, nada e '
  'apagado. So mexe em linhas com procedencia relatorio_58.';

grant execute on function public.fn_analitico_remover_com_snapshot(uuid, uuid[]) to authenticated;

commit;
