-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 7: desfazer a troca de fonte — o setor volta para o 58
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trocar a fonte de um setor muda o número que 301 pessoas veem. Uma operação
-- dessas não pode existir sem caminho de volta — e o caminho de volta não pode
-- depender de reimportar nada, porque o 58 daquele dia pode não existir mais.
--
-- Dá para voltar porque `fn_mestre_aplicar_no_analitico` guardou tudo em
-- `analitico_removidos` (Fase 5) antes de apagar. Esta função é o par dela:
-- tira o que o 59 escreveu e repõe o que estava guardado.
--
-- ## A ordem importa, e é a regra inteira desta função
--
-- Apagar o 59 ANTES de repor o 58. Ao contrário, a reposição esbarraria em
-- `idx_analitico_unicidade` nas linhas onde as duas fontes concordam da chave —
-- que são a maioria — e voltaria quase nada, silenciosamente. Um desfazer que
-- não desfaz e não reclama é pior que não ter desfazer.
--
-- ## `on conflict do nothing` na volta
--
-- Entre a troca e o arrependimento, alguém pode ter lançado correção manual
-- naquela chave. A correção manual fica: ela é trabalho de gente, e
-- sobrescrevê-la para repor um retrato antigo seria descartar decisão humana em
-- favor de arquivo.
--
-- ## Escrita
--
-- DELETE das linhas `relatorio_59` do setor/mês e INSERT do que estava guardado.
-- Linha `manual` não é tocada em nenhum dos dois passos. Super_admin.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_mestre_devolver_ao_58(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mes_data  date := (p_mes || '-01')::date;
  v_tiradas   integer := 0;
  v_guardadas integer;
  v_voltaram  integer := 0;
  v_valor_antes  numeric;
  v_valor_depois numeric;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Somente super_admin pode trocar a fonte de um setor.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  select coalesce(sum(valor_recebido), 0) into v_valor_antes
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data and setor_id = p_setor_id;

  select count(*) into v_guardadas
    from analitico_removidos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data
     and setor_id = p_setor_id and restaurado_em is null;

  -- Sem retrato guardado, apagar o 59 deixaria o setor vazio. A recusa vem
  -- ANTES de qualquer delete, de proposito.
  if v_guardadas = 0 then
    raise exception
      'NADA_GUARDADO: nao ha retrato guardado do setor em % para repor. '
      'Ou a fonte nunca foi trocada, ou ja foi devolvida.', p_mes;
  end if;

  -- 1. Tirar o que o 59 escreveu. Antes de repor, senao a reposicao esbarra no
  --    indice de unicidade e volta quase nada, em silencio.
  delete from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data
     and setor_id = p_setor_id and procedencia = 'relatorio_59';
  get diagnostics v_tiradas = row_count;

  -- 2. Repor o que estava guardado.
  with alvo as (
    select r.conteudo
      from analitico_removidos r
     where r.empresa_id = p_empresa_id and r.mes_referencia = v_mes_data
       and r.setor_id = p_setor_id and r.restaurado_em is null
  ),
  voltou as (
    insert into analitico_recebimentos
    select (jsonb_populate_record(null::analitico_recebimentos, a.conteudo)).*
      from alvo a
    -- Correcao manual lancada no meio-tempo fica: e trabalho de gente.
    on conflict do nothing
    returning id
  )
  select count(*) into v_voltaram from voltou;

  update analitico_removidos
     set restaurado_em = now(), restaurado_por_id = auth.uid()
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data
     and setor_id = p_setor_id and restaurado_em is null;

  select coalesce(sum(valor_recebido), 0) into v_valor_depois
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data and setor_id = p_setor_id;

  return jsonb_build_object(
    'mes', p_mes, 'setor_id', p_setor_id,
    'tiradas_do_59', v_tiradas,
    'guardadas', v_guardadas,
    'voltaram', v_voltaram,
    'ja_estavam', v_guardadas - v_voltaram,
    'valor_antes', round(v_valor_antes, 2),
    'valor_depois', round(v_valor_depois, 2));
end;
$function$;

comment on function public.fn_mestre_devolver_ao_58(uuid, text, uuid) is
  'Desfaz fn_mestre_aplicar_no_analitico: tira as linhas do 59 e repoe o que '
  'ficou guardado em analitico_removidos. Apaga o 59 ANTES de repor — ao '
  'contrario, a reposicao esbarraria no indice de unicidade e voltaria quase '
  'nada em silencio. Correcao manual nao e tocada. Super_admin.';

grant execute on function public.fn_mestre_devolver_ao_58(uuid, text, uuid) to authenticated;

commit;
