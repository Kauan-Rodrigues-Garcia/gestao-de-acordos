-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 7: quando o 59 atualiza, o sistema inteiro fica sabendo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ A mensagem desta versão formata o valor em padrão americano. Corrigido em
-- `20260914100309`; o corpo abaixo já é o corrigido.
--
-- ## Por que trigger, e não uma chamada dentro da promoção
--
-- `fn_mestre_promover_lote` tem 200 linhas e já estourou o tempo uma vez
-- (migration 20260908210000). Reescrevê-la inteira para acrescentar três linhas
-- transcreveria o resto — e é no resto que o erro se esconde.
--
-- O gatilho pega o momento exato pelo ESTADO: o lote passou a `vigente`. Isso
-- vale para a promoção de hoje e para qualquer outro caminho que venha a
-- promover um lote amanhã, sem ninguém precisar lembrar de chamar nada.
--
-- ## Não avisa quando nada mudou
--
-- Reimportar o mesmo arquivo produz um lote novo com o mesmo total. Avisar 301
-- pessoas de que «os dados mudaram» quando eles não mudaram é a forma mais
-- rápida de ensinar todo mundo a ignorar o aviso.
--
-- A guarda compara o total do lote novo com o do lote que ele substituiu. Igual
-- ao centavo, ninguém é avisado. O primeiro lote do mês sempre avisa — ali o
-- dado nasceu.
--
-- ## ⚠️ Isto precisa ser revisto quando a importação virar horária
--
-- Hoje o 59 é importado à mão, cerca de 1 vez por dia (9 lotes desde 04/09).
-- Com 301 pessoas ativas, são ~300 notificações/dia — aceitável.
--
-- Com importação de hora em hora seriam ~3.000/dia, e aí vira spam. Quando a
-- automação chegar, esta regra tem de mudar junto: avisar só quando a diferença
-- for material, ou resumir uma vez por turno. Fica registrado aqui para não ser
-- descoberto pelo silêncio de quem desligou a notificação.
--
-- ## Verificado contra produção (em bloco revertido)
--
--     notificações antes = 0 → depois = 301
--     «O relatório 59 de 2026-09 foi atualizado: R$ 36.849,34 a mais que a
--      importação anterior…»
--
-- ## Escrita
--
-- INSERT em `notificacoes`, uma linha por pessoa ativa da empresa. Nenhum dado
-- de recebimento é tocado.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

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
  -- So no instante em que o lote PASSA a vigente. Update que ja era vigente,
  -- ou que vai para outro estado, nao e noticia.
  if new.estado is distinct from 'vigente'
     or coalesce(old.estado, '') = 'vigente' then
    return new;
  end if;

  v_mes := to_char(new.mes, 'YYYY-MM');

  -- O lote que este substituiu. Nulo no primeiro lote do mes.
  select ml.total_recebido into v_anterior
    from mestre_lotes ml
   where ml.substituido_por = new.id
   limit 1;

  v_delta := coalesce(new.total_recebido, 0) - coalesce(v_anterior, 0);

  -- Mesmo arquivo de novo: nada mudou, ninguem e avisado.
  if v_anterior is not null and v_delta = 0 then
    return new;
  end if;

  -- `,` e `.` sao literais no to_char; `G` e `D` e que seguem o locale, e o
  -- deste banco daria 36,849.34 em vez de 36.849,34.
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

comment on function public.fn_mestre_notificar_atualizacao() is
  'Avisa toda a empresa quando um lote do 59 passa a vigente. Nao avisa se o '
  'total for identico ao do lote substituido — aviso de mudanca que nao mudou '
  'ensina a ignorar o aviso. Revisar quando a importacao virar horaria: 301 '
  'pessoas x 10 importacoes/dia e spam.';

drop trigger if exists trg_mestre_notificar_atualizacao on public.mestre_lotes;

create trigger trg_mestre_notificar_atualizacao
  after update of estado on public.mestre_lotes
  for each row
  execute function public.fn_mestre_notificar_atualizacao();

commit;
