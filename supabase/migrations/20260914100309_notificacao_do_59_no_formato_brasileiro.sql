-- ═══════════════════════════════════════════════════════════════════════════
-- A notificação do 59 estava dizendo o valor em formato americano
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `to_char(v, 'FM999G999G990D00')` usa `G` e `D`, que seguem o `lc_numeric` do
-- banco — e o deste banco não é o brasileiro. O teste do gatilho devolveu:
--
--     «R$ 36,849.34 a mais que a importação anterior»
--
-- Trinta e seis mil virou trinta e seis, com centavos errados. Numa mensagem
-- que 301 pessoas leem, isso não é cosmético.
--
-- No `to_char`, `,` e `.` são **literais** e não dependem de locale — são `G` e
-- `D` que dependem. Então o caminho seguro é formatar com os literais no padrão
-- americano e inverter os dois separadores:
--
--     translate(to_char(v, 'FM999,999,990.00'), ',.', '.,')  →  36.849,34
--
-- Verificado em produção, em bloco revertido: a mensagem saiu com
-- R$ 36.849,34 e 301 notificações foram criadas e desfeitas.
--
-- Escrita: nenhuma.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';

create or replace function public.fn_mestre_notificar_atualizacao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_anterior numeric;
  v_delta    numeric;
  v_mes      text;
  v_msg      text;
begin
  if new.estado is distinct from 'vigente'
     or coalesce(old.estado, '') = 'vigente' then
    return new;
  end if;

  v_mes := to_char(new.mes, 'YYYY-MM');

  select ml.total_recebido into v_anterior
    from mestre_lotes ml
   where ml.substituido_por = new.id
   limit 1;

  v_delta := coalesce(new.total_recebido, 0) - coalesce(v_anterior, 0);

  if v_anterior is not null and v_delta = 0 then
    return new;
  end if;

  -- `,` e `.` sao literais no to_char; `G` e `D` e que seguem o locale.
  v_msg := case
    when v_anterior is null then
      format('O relatório 59 de %s entrou no sistema. Os números do dashboard, '
             || 'do painel e do analítico já estão com ele.', v_mes)
    when v_delta > 0 then
      format('O relatório 59 de %s foi atualizado: R$ %s a mais que a importação '
             || 'anterior. Os números do dashboard, do painel e do analítico já '
             || 'refletem a mudança.',
             v_mes, translate(to_char(v_delta, 'FM999,999,990.00'), ',.', '.,'))
    else
      format('O relatório 59 de %s foi atualizado: R$ %s a menos que a importação '
             || 'anterior. Os números do dashboard, do painel e do analítico já '
             || 'refletem a mudança.',
             v_mes, translate(to_char(abs(v_delta), 'FM999,999,990.00'), ',.', '.,'))
  end;

  insert into notificacoes (usuario_id, titulo, mensagem, empresa_id, rota)
  select p.id, 'Dados analíticos atualizados', v_msg, new.empresa_id, '/'
    from perfis p
   where p.empresa_id = new.empresa_id
     and coalesce(p.ativo, true);

  return new;
end;
$function$;

commit;
