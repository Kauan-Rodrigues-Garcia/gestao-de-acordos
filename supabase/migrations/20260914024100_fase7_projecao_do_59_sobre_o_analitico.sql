-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 7, passo 1: o que o 59 escreveria no analítico — sem escrever nada
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ A versão original desta migration saiu SECURITY DEFINER **sem trava de
-- acesso**. Corrigido em `20260914024126`, minutos depois. O corpo abaixo já é
-- o corrigido; a migration seguinte existe no histórico do banco e é o registro
-- honesto do erro.
--
-- ## O objetivo, e por que este é o caminho de menor risco
--
-- O pedido é que TODA tela — Dashboard, Painel Líder e suas sub-abas,
-- Analítico, comissão, desafios — mostre o dado alinhado ao 59, e não só o
-- Painel Diretoria.
--
-- Inventário feito antes de desenhar: o 58 (`analitico_recebimentos`) alimenta
-- ~30 módulos; o 59 (`mestre_recebimentos`) alimenta só o Painel Diretoria.
-- Reescrever 30 módulos para lerem o 59 seria caro, arriscado, e ainda deixaria
-- duas verdades no sistema.
--
-- O caminho curto é o que a Fase 2 já preparou: **o 59 passa a ESCREVER em
-- `analitico_recebimentos`**, com `procedencia = 'relatorio_59'`. Nenhuma das 30
-- telas muda de código — todas continuam lendo a mesma tabela e passam a ver o
-- número do 59.
--
-- ## Antes de escrever, medir. Esta migration só mede.
--
-- Trocar a fonte de todas as telas de uma vez é a mudança mais perigosa desta
-- sequência. O primeiro passo é uma PROJEÇÃO: o que o 59 escreveria, e o que
-- isso mudaria em relação ao que está lá. Sem gravar nada.
--
-- ## O que a medição respondeu
--
--   H.O. na BookPlay ............ zero. Nada se perde ao escrever pelo 59.
--   tipo (59) × tipo_comissao (58) .. mesmo vocabulário (Integral/Extra), e o
--                                   58 tem 4.750 linhas com esse campo NULO,
--                                   R$ 1.542.372,87 — que o 59 preenche.
--   data divergente ............. só 44 de 7.584 NRs (0,58%).
--   tp_doc → forma_pagamento .... a regra do 58 é `norm(tpdoc) contém 'cartao'`.
--                                 RECORRENTE vai para boleto_pix, e não para
--                                 cartão: R$ 156.609,84 que iriam para o balde
--                                 errado numa leitura apressada.
--
-- O impacto por setor, em setembro/2026:
--
--   Jornada Play ....... R$       0 → R$ 122.778   (não tem 58)
--   Play 1 ............. R$ 873.308 → R$ 976.815
--   Manutenção ......... R$       0 → R$  74.623   (não tem 58)
--   Play 3 ............. R$ 334.475 → R$ 384.457
--   Playmix ............ R$ 229.389 → R$ 257.871
--   Play 2 ............. R$ 355.837 → R$ 379.843
--   Play 4 ............. R$  67.024 → R$  73.053
--   Play Mix Marília ... R$  35.543 → R$  39.526
--   Play 5 ............. R$ 143.877 → R$ 146.172
--   Receptivo .......... R$1.171.117 → R$1.167.351  (o 58 tem um agendamento
--                                                    de 14/09 que o 59 não tem)
--   ─────────────────────────────────────────────
--   TOTAL .............. R$3.210.569 → R$3.622.488
--
-- E 5.834 linhas ganhariam `tipo_comissao`.
--
-- ## A caixa do login importa
--
-- `idx_analitico_unicidade` é (empresa, codigo, data, forma, **operador_usuario**)
-- — pelo LOGIN, e é sensível a maiúsculas. O 58 tem 1.185 linhas com minúscula,
-- o 59 tem 5.063. Escrever `THALITA_ANGELO` onde o 58 gravou `Thalita_Angelo`
-- criaria uma linha gêmea em vez de colidir, e o dinheiro dobraria.
--
-- Hoje não há colisão (medido: 0 grupos com duas grafias). A projeção reusa a
-- grafia que o 58 já usa para aquela pessoa, e só cai na do 59 para quem o 58
-- nunca viu.
--
-- ## O recorte é o mesmo provado em agosto
--
-- Colchão fora, Retenção fora, carteira manda. E **só a primeira perna do
-- rateio**: o Integral cobrado PARA outra carteira não vira segunda linha aqui.
-- O 58 não tem essa perna — é por isso que ela é «contrib_integral», fora do
-- comparável — e escrevê-la duplicaria o dinheiro em toda tela do sistema.
--
-- ## Escrita: nenhuma
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

-- ── tp_doc → forma_pagamento, a MESMA regra do importador do 58 ────────────
--
-- `analiticoComum.ts`: `isCartao = norm(tpdoc).includes('cartao')`. Replicada
-- aqui porque as duas precisam concordar — se divergirem, o gráfico Pix ×
-- Cartão passa a depender de qual fonte trouxe a linha.

create or replace function public.fn_analitico_forma_do_tpdoc(p_tp_doc text)
returns text
language sql
immutable
parallel safe
as $function$
  select case
           when translate(upper(btrim(coalesce(p_tp_doc, ''))),
                          'ÃÁÀÂÄÇÉÊÈËÍÎÏÓÔÒÖÕÚÛÙÜ',
                          'AAAAACEEEEIIIOOOOOUUUU') like '%CARTAO%'
           then 'cartao'
           else 'boleto_pix'
         end;
$function$;

comment on function public.fn_analitico_forma_do_tpdoc(text) is
  'TpDoc do ERP → forma_pagamento do analitico. Mesma regra do importador do 58 '
  '(analiticoComum.ts: norm(tpdoc) contem «cartao»). RECORRENTE cai em '
  'boleto_pix, como no 58 — sao R$ 156.609,84/mes que uma leitura apressada '
  'poria em cartao.';

grant execute on function public.fn_analitico_forma_do_tpdoc(text) to authenticated;

-- ── A projeção ─────────────────────────────────────────────────────────────

create or replace function public.fn_mestre_projecao_analitico(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid default null
)
returns table(
  setor_id         uuid,
  operador_id      uuid,
  operador_usuario text,
  codigo           text,
  data_pagamento   date,
  forma_pagamento  text,
  forma_detalhe    text,
  nome_cliente     text,
  instituicao      text,
  tipo_comissao    text,
  valor_recebido   numeric,
  linhas_no_59     bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  -- A grafia do login que o 58 ja usa para cada pessoa. Sem isto, a escrita
  -- criaria linha gemea em vez de colidir no indice de unicidade.
  canon as (
    select upper(a.operador_usuario) as k,
           (array_agg(a.operador_usuario order by a.importado_em desc))[1] as v
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
     group by 1
  ),
  base as (
    select fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) as setor_id,
           r.operador_id,
           coalesce(c.v, btrim(r.cobradora)) as operador_usuario,
           r.nr_documento                    as codigo,
           r.dt_pgto                         as data_pagamento,
           fn_analitico_forma_do_tpdoc(r.tp_doc) as forma_pagamento,
           btrim(r.tp_doc)                   as forma_detalhe,
           nullif(btrim(r.cliente), '')      as nome_cliente,
           nullif(btrim(r.empresa_erp), '')  as instituicao,
           case lower(btrim(coalesce(r.tipo, '')))
             when 'extra'    then 'Extra'
             when 'integral' then 'Integral'
           end                               as tipo_comissao,
           r.recebido
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_grupos g
        on g.empresa_id = r.empresa_id
       and g.cod_grupo_filtro = r.cod_grupo_filtro
       and g.estado = 'vinculado'
      left join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
      left join canon c on c.k = upper(btrim(r.cobradora))
     where r.empresa_id = p_empresa_id
       -- SECURITY DEFINER ignora o RLS; sem isto, p_empresa_id de outra empresa
       -- devolveria os recebimentos dela. Faltou na primeira versao.
       and (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
       and r.mes = (select d from ref)
       -- O recorte provado em agosto: colchao fora, Retencao fora (o helper
       -- devolve nulo para `somente_geral`), carteira manda.
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) is not null
       and coalesce(r.nr_documento, '') <> ''
       and btrim(r.cobradora) <> ''
       and r.dt_pgto is not null
  )
  select b.setor_id,
         (array_agg(distinct b.operador_id) filter (where b.operador_id is not null))[1],
         b.operador_usuario, b.codigo, b.data_pagamento, b.forma_pagamento,
         max(b.forma_detalhe), max(b.nome_cliente), max(b.instituicao),
         -- NR que aparece como Integral numa parcela e Extra noutra fica sem
         -- resposta, como o 58 faz: escolher uma seria escolher no escuro.
         case when count(distinct b.tipo_comissao) = 1
              then max(b.tipo_comissao) end,
         round(sum(b.recebido), 2),
         count(*)::bigint
    from base b
   where (p_setor_id is null or b.setor_id = p_setor_id)
   group by b.setor_id, b.operador_usuario, b.codigo, b.data_pagamento, b.forma_pagamento;
$function$;

comment on function public.fn_mestre_projecao_analitico(uuid, text, uuid) is
  'O que o 59 escreveria em analitico_recebimentos, agregado pela chave de '
  'idx_analitico_unicidade. So LE — existe para medir a troca de fonte antes de '
  'fazer. Reusa a grafia do login que o 58 ja usa, senao a escrita criaria linha '
  'gemea em vez de colidir.';

grant execute on function public.fn_mestre_projecao_analitico(uuid, text, uuid) to authenticated;

commit;
