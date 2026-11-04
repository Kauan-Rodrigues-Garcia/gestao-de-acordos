-- ============================================================================
-- Relatório 994 — a Retenção do Jornada entra pelo próprio relatório
-- ============================================================================
--
-- O Jornada tem dois relatórios do ERP: o 58 (os operadores do setor) e o 994
-- (a equipe de Retenção — monica_souza, vitoria_nascimento e jessica_s_souza
-- em outubro/2026). O 58 continua descartando a Retenção (`ehEquipeRetencao`);
-- o 994 traz só ela.
--
-- O 994 grava com procedência PRÓPRIA, `relatorio_994`, e é isso que deixa os
-- dois conviverem no mesmo setor/mês:
--
--   • o 58 remove o que não veio nele — só linha `relatorio_58`;
--   • o 994 remove o que não veio nele — só linha `relatorio_994`;
--   • diante do 59, o 994 é prévia como o 58: a sincronização assume, preserva
--     ou apaga a linha dele pela mesma regra (20261027220000, que depende
--     desta).
--
-- Sem a procedência nova, importar o 994 apagaria o 58 do setor e o 58
-- seguinte apagaria a Retenção.
--
-- Esta migration NÃO mexe em linha nenhuma: amplia duas travas e a função
-- que remove com cópia. Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';
set local statement_timeout = '180s';

-- 1. A procedência nova ---------------------------------------------------------

alter table public.analitico_recebimentos
  drop constraint if exists analitico_recebimentos_procedencia_valida;
alter table public.analitico_recebimentos
  add constraint analitico_recebimentos_procedencia_valida
  check (procedencia in ('relatorio_58','relatorio_59','manual','contribuicao_59','relatorio_994')) not valid;
alter table public.analitico_recebimentos
  validate constraint analitico_recebimentos_procedencia_valida;

comment on column public.analitico_recebimentos.procedencia is
  'De onde a linha veio: relatorio_58 (importacao do analitico), relatorio_59 (o mestre escreveu), '
  'manual (correcao de super_admin), contribuicao_59 (a 2a perna do Integral que outro setor cobrou '
  'PARA este — sem operador, conta no setor e NAO no total da empresa) ou relatorio_994 (a Retencao '
  'do Jornada, importada pelo relatorio proprio; previa diante do 59, como o 58).';

-- 2. A remoção com cópia aceita a linha do 994 ----------------------------------
--
-- Quem escolhe os ids é o importador (`idsAusentesDoRelatorioMensal`), que só
-- devolve linhas da MESMA procedência do arquivo. Aqui fica a segunda guarda:
-- linha do 59, manual ou de contribuição continua impossível de apagar por
-- esta via.

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
     and a.procedencia in ('relatorio_58', 'relatorio_994')
     and (fn_user_is_super_admin() or fn_can_access_empresa(a.empresa_id));

  get diagnostics v_n = row_count;

  -- Mesmo WHERE da copia, mesma transacao: nao ha como apagar o que nao foi
  -- guardado.
  delete from analitico_recebimentos a
   where a.id = any(p_ids)
     and a.procedencia in ('relatorio_58', 'relatorio_994')
     and (fn_user_is_super_admin() or fn_can_access_empresa(a.empresa_id));

  return v_n;
end;
$function$;
comment on function public.fn_analitico_remover_com_snapshot(uuid, uuid[]) is
  'Remove linhas importadas (58 ou 994) guardando o que saiu em analitico_removidos, na mesma '
  'transacao. Substitui o delete direto do cliente: se a copia falhar, nada e '
  'apagado. So mexe em linhas com procedencia relatorio_58 ou relatorio_994.';

grant execute on function public.fn_analitico_remover_com_snapshot(uuid, uuid[]) to authenticated;

-- 3. O cabeçalho do 994 também é vigiado ---------------------------------------

alter table public.relatorio_assinaturas
  drop constraint if exists relatorio_assinaturas_tipo_check;
alter table public.relatorio_assinaturas
  add constraint relatorio_assinaturas_tipo_check
  check (tipo in ('analitico_pagueplay', 'analitico_bookplay', 'mestre_59', 'analitico_994'));

commit;
