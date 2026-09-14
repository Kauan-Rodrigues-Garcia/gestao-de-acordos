-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 5, parte 3: trazer de volta o que uma importação apagou
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Regra 7 do plano. Depende de `20260914021223`, que passou a guardar o que sai.
--
-- ## Desfaz a REMOÇÃO, não a importação inteira
--
-- A regra falava em «voltar a um ponto do dia — o que foi importado depois é
-- apagado». Implementei metade disso de propósito, e a razão é assimetria de
-- risco:
--
--   o que a importação REMOVEU .... perdido para sempre, até agora. É o dano.
--   o que a importação INSERIU .... reimportar o arquivo traz de volta.
--
-- Apagar o que uma importação inseriu, para «voltar ao ponto», tiraria linhas
-- que o 58 atual diz que existem — e a próxima importação as traria de novo.
-- Muito barulho para desfazer o lado que já se desfaz sozinho.
--
-- O botão que faltava é este: trazer de volta o que sumiu. Se depois disso o
-- estado ainda estiver errado, o caminho é o que a própria regra 7 diz — «para
-- avançar, importa-se um relatório novo».
--
-- ## `on conflict do nothing`, e o número diz a verdade
--
-- Entre a remoção e o arrependimento, outra importação pode ter trazido a mesma
-- linha de volta. Restaurar por cima estouraria `idx_analitico_unicidade`. A
-- função ignora essas e devolve os dois números separados: quantas voltaram e
-- quantas já estavam lá. Dizer «restaurei 413» quando 400 já tinham voltado
-- seria número bonito e mentiroso.
--
-- ## Escrita
--
-- INSERT em `analitico_recebimentos` (o que estava guardado) e UPDATE em
-- `analitico_removidos` (marca como restaurado). Nenhuma linha viva é apagada.
-- Super_admin apenas.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_analitico_restaurar_remocao(
  p_lote_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total    integer;
  v_valor    numeric;
  v_voltaram integer;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Somente super_admin pode desfazer a remocao de uma importacao.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*), coalesce(sum(valor_recebido), 0)
    into v_total, v_valor
    from analitico_removidos
   where lote_id = p_lote_id and restaurado_em is null;

  if v_total = 0 then
    return jsonb_build_object(
      'voltaram', 0, 'ja_estavam', 0, 'total', 0, 'valor', 0,
      'nota', 'Nada guardado para esta importacao — ou ela nao removeu nada, '
              'ou ja foi restaurada.');
  end if;

  with alvo as (
    select r.conteudo
      from analitico_removidos r
     where r.lote_id = p_lote_id and r.restaurado_em is null
  ),
  voltou as (
    insert into analitico_recebimentos
    select (jsonb_populate_record(null::analitico_recebimentos, a.conteudo)).*
      from alvo a
    -- Outra importacao pode ter trazido a mesma linha de volta no meio tempo.
    on conflict do nothing
    returning id
  )
  select count(*) into v_voltaram from voltou;

  update analitico_removidos
     set restaurado_em = now(), restaurado_por_id = auth.uid()
   where lote_id = p_lote_id and restaurado_em is null;

  return jsonb_build_object(
    'voltaram',   v_voltaram,
    'ja_estavam', v_total - v_voltaram,
    'total',      v_total,
    'valor',      round(v_valor, 2));
end;
$function$;

comment on function public.fn_analitico_restaurar_remocao(uuid) is
  'Traz de volta as linhas que uma importacao do 58 apagou, a partir de '
  'analitico_removidos. Desfaz a REMOCAO e nao a importacao inteira: o que ela '
  'inseriu se desfaz reimportando, o que ela removeu nao se desfazia de jeito '
  'nenhum. Devolve quantas voltaram e quantas ja estavam la. Super_admin.';

grant execute on function public.fn_analitico_restaurar_remocao(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- O que cada importação tem guardado, para a tela saber se há o que desfazer
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.fn_analitico_remocoes_guardadas(
  p_empresa_id uuid,
  p_mes        text default null
)
returns table(
  lote_id       uuid,
  setor_id      uuid,
  mes           text,
  linhas        bigint,
  valor         numeric,
  removido_em   timestamptz,
  restaurado_em timestamptz,
  pode_desfazer boolean
)
returns null on null input
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.lote_id,
         (array_agg(distinct r.setor_id) filter (where r.setor_id is not null))[1],
         to_char(min(r.mes_referencia), 'YYYY-MM'),
         count(*)::bigint,
         round(sum(r.valor_recebido), 2),
         min(r.removido_em),
         max(r.restaurado_em),
         bool_or(r.restaurado_em is null)
    from analitico_removidos r
   where r.empresa_id = p_empresa_id
     and (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
     and (p_mes is null or to_char(r.mes_referencia, 'YYYY-MM') = p_mes)
   group by r.lote_id
   order by min(r.removido_em) desc;
$function$;

comment on function public.fn_analitico_remocoes_guardadas(uuid, text) is
  'Quantas linhas cada importacao do 58 removeu e se ainda da para desfazer. '
  'So leitura. Comeca vazia: o snapshot vale de 14/09/2026 em diante.';

grant execute on function public.fn_analitico_remocoes_guardadas(uuid, text) to authenticated;

commit;
