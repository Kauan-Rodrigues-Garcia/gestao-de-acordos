-- ═══════════════════════════════════════════════════════════════════════════
-- O que entrou e o que saiu, setor a setor, em cada importação
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A aba «Histórico de importações» dizia QUANTO cada importação mexeu, no
-- agregado. Faltava o principal quando alguém pergunta «por que o meu setor
-- mudou?»: a quebra por setor, com o que entrou e o que saiu.
--
-- ## De onde sai cada metade
--
--   ENTROU .. `analitico_recebimentos` com aquele `lote_id`. É o que aquela
--             importação escreveu E QUE AINDA ESTÁ LÁ — se uma importação
--             posterior substituiu a linha, ela conta para a posterior. Isso é
--             proposital: a pergunta útil é «o que deste lote vale hoje», não
--             «o que ele escreveu num instante que já passou».
--
--   SAIU .... `analitico_removidos` com aquele `lote_id`, que só existe desde
--             14/09/2026. Antes disso a remoção era um `delete` e ponto — e
--             justamente por isso 2.659 linhas se perderam entre agosto e
--             setembro sem deixar registro.
--
-- Medido em 14/09/2026: 29 lotes têm o «entrou»; 3 têm o «saiu». Para os demais
-- o histórico continua mostrando as contagens do log, que existem desde 12/08 —
-- e a tela diz qual é qual, em vez de abrir uma tabela vazia que parece defeito.
--
-- ## O detalhe da primeira sincronização automática, como exemplo
--
--   Receptivo ... entrou 2.549 linhas / R$ 1.168.927,69
--                 saiu   2.542 linhas / R$ 1.167.350,54   → +R$ 1.577,15
--   Play 1 ...... entrou 3.697 / R$ 977.018,78
--                 saiu   3.696 / R$ 976.815,30            → +R$   203,48
--   outros 8 .... entrou = saiu                           →     R$     0,00
--
-- ## Escrita: nenhuma
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_importacoes_detalhe(
  p_empresa_id uuid,
  p_lote_id    uuid
)
returns table(
  setor_id        uuid,
  setor_nome      text,
  entrou_linhas   bigint,
  entrou_valor    numeric,
  saiu_linhas     bigint,
  saiu_valor      numeric,
  delta           numeric,
  saiu_restaurado bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with entrou as (
    select a.setor_id, a.mes_referencia,
           count(*)::bigint as linhas,
           round(sum(a.valor_recebido), 2) as valor
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id and a.lote_id = p_lote_id
     group by 1, 2
  ),
  saiu as (
    select r.setor_id, r.mes_referencia,
           count(*)::bigint as linhas,
           round(sum(r.valor_recebido), 2) as valor,
           count(*) filter (where r.restaurado_em is not null)::bigint as restaurado
      from analitico_removidos r
     where r.empresa_id = p_empresa_id and r.lote_id = p_lote_id
     group by 1, 2
  ),
  juntos as (
    select coalesce(e.setor_id, s.setor_id) as setor_id,
           coalesce(e.mes_referencia, s.mes_referencia) as mes,
           coalesce(e.linhas, 0) as entrou_linhas,
           coalesce(e.valor, 0)  as entrou_valor,
           coalesce(s.linhas, 0) as saiu_linhas,
           coalesce(s.valor, 0)  as saiu_valor,
           coalesce(s.restaurado, 0) as restaurado
      from entrou e
      full outer join saiu s
        -- `is not distinct from`: setor nulo (linha orfa) tem de casar com
        -- setor nulo, e `=` devolveria nulo e a linha apareceria duas vezes.
        on s.setor_id is not distinct from e.setor_id
       and s.mes_referencia = e.mes_referencia
  )
  select j.setor_id,
         coalesce(cms.nome, se.nome, '(sem setor)'),
         j.entrou_linhas, j.entrou_valor,
         j.saiu_linhas, j.saiu_valor,
         round(j.entrou_valor - j.saiu_valor, 2),
         j.restaurado
    from juntos j
    left join setores se on se.id = j.setor_id
    left join composicao_mes_setor cms
      on cms.empresa_id = p_empresa_id
     and cms.mes = to_char(j.mes, 'YYYY-MM')
     and cms.setor_id = j.setor_id
   where fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)
   order by abs(j.entrou_valor - j.saiu_valor) desc,
            coalesce(cms.nome, se.nome);
$function$;

comment on function public.fn_importacoes_detalhe(uuid, uuid) is
  'O que entrou e o que saiu, por setor, numa importacao. ENTROU sai das linhas '
  'que aquele lote escreveu e que ainda estao la; SAIU sai de analitico_removidos, '
  'que so existe desde 14/09/2026 — antes disso a remocao nao deixava registro. '
  'So leitura.';

grant execute on function public.fn_importacoes_detalhe(uuid, uuid) to authenticated;

commit;
