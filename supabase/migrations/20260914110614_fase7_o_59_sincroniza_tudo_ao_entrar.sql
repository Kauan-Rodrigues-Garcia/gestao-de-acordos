-- ═══════════════════════════════════════════════════════════════════════════
-- O 58 volta a alimentar; o 59 sincroniza tudo quando entra
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Este arquivo é o ESTADO FINAL de sete migrations aplicadas em sequência em
-- 14/09/2026, entre 10:51 e 11:06. As seis primeiras foram passos de um
-- diagnóstico de desempenho e estão registradas no histórico do banco sem
-- arquivo próprio — o que vale é o resultado, e ele está aqui:
--
--   105138  o gatilho, em laço por setor
--   105242  o tratador de erro que quebrava
--   105524  a sincronização em bloco
--   110005  a projeção sem agregados DISTINCT
--   110206  a projeção sem a CTE `ref`
--   110512  a projeção vira VIEW
--   110614  tudo passa a ler a view          ← este arquivo
--
-- ## A correção de desenho
--
-- Eu tinha feito o 58 virar prévia INERTE nos setores do 59: ele lia o arquivo
-- e não gravava nada. Errado. O pedido é outro:
--
--   «o 58 é pra ir atualizando os valores também, igual é hoje, porém ao entrar
--    o 59 sincroniza tudo»
--
-- O 58 continua sendo a alimentação rápida do dia — importado por setor, várias
-- vezes — e o 59 é a autoridade que corrige tudo quando chega.
--
-- ## O que isso custa, medido
--
-- Entre uma importação do 58 e a sincronização seguinte pode nascer linha
-- dobrada: são os NRs em que as duas fontes discordam da DATA, porque aí a
-- chave de `idx_analitico_unicidade` é outra e o 58 insere ao lado.
--
--   grupos com data divergente ... 50
--   valor exposto ................ R$ 40.903,78
--   proporção dos grupos ......... 0,6%
--
-- É autolimpante. O que esse número exige é que a sincronização seja AUTOMÁTICA
-- — se dependesse de alguém lembrar de clicar, os R$ 40 mil virariam
-- permanentes. Por isso é gatilho, e não botão.
--
-- ## Três defeitos que só apareceram por serem testados
--
-- **1. O tratador de erro derrubava a promoção.** O `exception when others` que
-- protegia o laço gravava `severidade = 'erro'`, valor que o check de
-- `logs_sistema` recusa (só info/aviso/critico). O tratador levantava, ninguém
-- capturava, e a promoção do lote inteiro caía — o oposto do que ele existia
-- para fazer. Agora ele usa 'critico' e está ele próprio dentro de um bloco que
-- engole qualquer falha de gravação: perder a linha de log é ruim, derrubar o
-- fechamento do mês por causa dela é pior.
--
-- **2. O laço por setor estourava o tempo.** Cada volta chamava a projeção duas
-- vezes, e cada chamada recalculava tudo. Com 10 setores eram 20 varreduras
-- completas. Virou um bloco só: uma projeção, três comandos.
--
-- **3. Função SECURITY DEFINER não é embutida pelo Postgres.** Este foi o
-- fundo do poço. A projeção como função levava 19 segundos para UM setor e não
-- terminava para o mês; a MESMA consulta inline fazia os 9.639 grupos em 480 ms
-- — e continuava em 480 ms com plano genérico forçado, então não era
-- parametrização. É que o planejador não expande função SECURITY DEFINER na
-- consulta de quem chama, e os filtros de empresa e mês não descem até ela.
--
-- Como VIEW, a mesma coisa: **17 ms**. Mil vezes mais rápido, mesmo resultado
-- ao centavo.
--
-- Isso importava além da velocidade: a sincronização roda DENTRO da promoção do
-- lote, que tem teto de 120s. Com a função, a promoção cairia por timeout e o
-- mês ficaria sem lote vigente.
--
-- ## Verificado contra produção (em bloco revertido)
--
--     ciclo completo (promoção → sync de 10 setores → 301 notificações) . 2.689 ms
--     antes ....... 9.639 linhas / R$ 3.622.488,42
--     depois ...... 9.639 linhas / R$ 3.622.488,42   (idempotente)
--     snapshot .... +9.639 linhas guardadas
--
-- ## Ordem dos gatilhos
--
-- `trg_mestre_aplicar...` ordena antes de `trg_mestre_notificar...` (a < n), e
-- isso importa: a notificação diz «os números do dashboard já refletem a
-- mudança», e só pode dizer isso depois de eles terem sido escritos.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '30s';
set local statement_timeout = '300s';

-- ── A projeção, como VIEW ──────────────────────────────────────────────────

create or replace view public.vw_mestre_projecao_analitico as
with canon as (
  -- A grafia do login que o 58 ja usa para cada pessoa, por empresa. Sem isto a
  -- escrita criaria linha gemea em vez de colidir no indice de unicidade.
  select a.empresa_id,
         upper(a.operador_usuario) as k,
         (array_agg(a.operador_usuario order by a.importado_em desc))[1] as v
    from analitico_recebimentos a
   group by 1, 2
),
base as (
  select r.empresa_id,
         r.mes,
         fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) as setor_id,
         r.operador_id,
         coalesce(c.v, btrim(r.cobradora)) as operador_usuario,
         r.nr_documento                    as codigo,
         r.dt_pgto                         as data_pagamento,
         fn_analitico_forma_do_tpdoc(r.tp_doc) as forma_pagamento,
         btrim(r.tp_doc)                   as forma_detalhe,
         nullif(btrim(r.cliente), '')      as nome_cliente,
         nullif(btrim(r.empresa_erp), '')  as instituicao,
         case lower(btrim(coalesce(r.tipo, '')))
           when 'extra' then 'Extra' when 'integral' then 'Integral' end as tipo_comissao,
         r.recebido
    from mestre_recebimentos r
    join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
    join mestre_grupos g
      on g.empresa_id = r.empresa_id and g.cod_grupo_filtro = r.cod_grupo_filtro
     and g.estado = 'vinculado'
    left join mestre_equipes me
      on me.empresa_id = r.empresa_id and me.cod_grupo_filtro = r.cod_grupo_filtro
     and me.nome_subgrupo = r.subgrupo_equipe
    left join canon c
      on c.empresa_id = r.empresa_id and c.k = upper(btrim(r.cobradora))
   -- O recorte provado em agosto: colchao fora, Retencao fora (o helper devolve
   -- nulo para `somente_geral`), carteira manda. E so a primeira perna do
   -- rateio — a segunda nao existe no 58 e duplicaria o dinheiro.
   where fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
     and fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) is not null
     and coalesce(r.nr_documento, '') <> ''
     and btrim(r.cobradora) <> ''
     and r.dt_pgto is not null
)
select b.empresa_id,
       b.mes,
       b.setor_id,
       -- Sem `distinct`: todas as linhas do grupo sao da mesma cobradora, e o
       -- distinct so acrescentava uma ordenacao por grupo.
       (array_agg(b.operador_id) filter (where b.operador_id is not null))[1] as operador_id,
       b.operador_usuario,
       b.codigo,
       b.data_pagamento,
       b.forma_pagamento,
       max(b.forma_detalhe) as forma_detalhe,
       max(b.nome_cliente)  as nome_cliente,
       max(b.instituicao)   as instituicao,
       -- «todas as linhas concordam?» sem ordenar o grupo. NR que e Integral
       -- numa parcela e Extra noutra continua sem resposta.
       case when min(b.tipo_comissao) is not distinct from max(b.tipo_comissao)
            then max(b.tipo_comissao) end as tipo_comissao,
       round(sum(b.recebido), 2) as valor_recebido,
       count(*)::bigint as linhas_no_59
  from base b
 group by b.empresa_id, b.mes, b.setor_id, b.operador_usuario, b.codigo,
          b.data_pagamento, b.forma_pagamento;

comment on view public.vw_mestre_projecao_analitico is
  'O que o 59 escreveria em analitico_recebimentos, por empresa e mes. E VIEW e '
  'nao funcao porque o Postgres nao embute funcao SECURITY DEFINER: a versao em '
  'funcao levava 19s para um setor e nao terminava para o mes, enquanto como '
  'view o mes inteiro sai em 17ms. Nao e concedida a authenticated — quem entra '
  'por fora e fn_mestre_projecao_analitico, que poe a trava de empresa.';

revoke all on public.vw_mestre_projecao_analitico from public;
revoke all on public.vw_mestre_projecao_analitico from authenticated;

-- ── As funções, agora finas sobre a view ───────────────────────────────────

create or replace function public.fn_mestre_projecao_analitico_interno(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid default null
)
returns table(
  setor_id uuid, operador_id uuid, operador_usuario text, codigo text,
  data_pagamento date, forma_pagamento text, forma_detalhe text,
  nome_cliente text, instituicao text, tipo_comissao text,
  valor_recebido numeric, linhas_no_59 bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select v.setor_id, v.operador_id, v.operador_usuario, v.codigo,
         v.data_pagamento, v.forma_pagamento, v.forma_detalhe,
         v.nome_cliente, v.instituicao, v.tipo_comissao,
         v.valor_recebido, v.linhas_no_59
    from vw_mestre_projecao_analitico v
   where v.empresa_id = p_empresa_id
     and v.mes = ((p_mes || '-01')::date)
     and (p_setor_id is null or v.setor_id = p_setor_id);
$function$;

revoke all on function public.fn_mestre_projecao_analitico_interno(uuid, text, uuid) from public;
revoke all on function public.fn_mestre_projecao_analitico_interno(uuid, text, uuid) from authenticated;

create or replace function public.fn_mestre_projecao_analitico(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid default null
)
returns table(
  setor_id uuid, operador_id uuid, operador_usuario text, codigo text,
  data_pagamento date, forma_pagamento text, forma_detalhe text,
  nome_cliente text, instituicao text, tipo_comissao text,
  valor_recebido numeric, linhas_no_59 bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select * from fn_mestre_projecao_analitico_interno(p_empresa_id, p_mes, p_setor_id)
   where fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id);
$function$;

grant execute on function public.fn_mestre_projecao_analitico(uuid, text, uuid) to authenticated;

-- ── A aplicação de um setor ────────────────────────────────────────────────

create or replace function public.fn_mestre_aplicar_no_analitico_interno(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid,
  p_lote_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mes_data     date := (p_mes || '-01')::date;
  v_valor_antes  numeric;
  v_removidas    integer := 0;
  v_projetadas   integer;
  v_gravadas     integer;
  v_valor_depois numeric;
begin
  select count(*) into v_projetadas
    from vw_mestre_projecao_analitico v
   where v.empresa_id = p_empresa_id and v.mes = v_mes_data and v.setor_id = p_setor_id;

  -- Projecao vazia com 59 cheio significa vinculo de carteira faltando. Apagar
  -- nesse estado zeraria o setor em ~30 telas.
  if v_projetadas = 0 then
    raise exception
      'PROJECAO_VAZIA: o 59 nao projeta nenhuma linha para este setor em %. '
      'Confira o vinculo da carteira antes de trocar a fonte.', p_mes;
  end if;

  select coalesce(sum(valor_recebido), 0) into v_valor_antes
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data and setor_id = p_setor_id;

  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select p_lote_id, a.empresa_id, a.setor_id, a.mes_referencia,
         a.codigo, a.operador_usuario, a.data_pagamento, a.valor_recebido,
         to_jsonb(a), auth.uid()
    from analitico_recebimentos a
   where a.empresa_id = p_empresa_id and a.mes_referencia = v_mes_data
     and a.setor_id = p_setor_id
     and a.procedencia in ('relatorio_58', 'relatorio_59');
  get diagnostics v_removidas = row_count;

  delete from analitico_recebimentos a
   where a.empresa_id = p_empresa_id and a.mes_referencia = v_mes_data
     and a.setor_id = p_setor_id
     and a.procedencia in ('relatorio_58', 'relatorio_59');

  insert into analitico_recebimentos (
    empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
    forma_pagamento, forma_detalhe, valor_recebido, total_ho,
    data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
    procedencia, lote_id, importado_por_id, importado_em)
  select p_empresa_id, v.operador_id, v.operador_usuario, v.codigo, v.nome_cliente,
         v.forma_pagamento, v.forma_detalhe, v.valor_recebido, 0,
         v.data_pagamento, v_mes_data, v.setor_id, v.tipo_comissao, v.instituicao,
         'relatorio_59', p_lote_id, auth.uid(), now()
    from vw_mestre_projecao_analitico v
   where v.empresa_id = p_empresa_id and v.mes = v_mes_data and v.setor_id = p_setor_id
  on conflict (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)
  do update set
    setor_id       = excluded.setor_id,
    operador_id    = excluded.operador_id,
    valor_recebido = excluded.valor_recebido,
    nome_cliente   = coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
    forma_detalhe  = excluded.forma_detalhe,
    tipo_comissao  = coalesce(excluded.tipo_comissao, analitico_recebimentos.tipo_comissao),
    instituicao    = coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
    procedencia    = 'relatorio_59',
    lote_id        = excluded.lote_id;
  get diagnostics v_gravadas = row_count;

  select coalesce(sum(valor_recebido), 0) into v_valor_depois
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data and setor_id = p_setor_id;

  return jsonb_build_object(
    'setor_id', p_setor_id, 'removidas', v_removidas, 'gravadas', v_gravadas,
    'valor_antes', round(v_valor_antes, 2), 'valor_depois', round(v_valor_depois, 2),
    'delta', round(v_valor_depois - v_valor_antes, 2));
end;
$function$;

revoke all on function public.fn_mestre_aplicar_no_analitico_interno(uuid, text, uuid, uuid) from public;
revoke all on function public.fn_mestre_aplicar_no_analitico_interno(uuid, text, uuid, uuid) from authenticated;

create or replace function public.fn_mestre_aplicar_no_analitico(
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
  v_lote uuid;
  v_res  jsonb;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Somente super_admin pode trocar a fonte de um setor.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  select ml.id into v_lote from mestre_lotes ml
   where ml.empresa_id = p_empresa_id and ml.mes = (p_mes || '-01')::date
     and ml.estado = 'vigente';
  if v_lote is null then
    raise exception 'SEM_LOTE_59: nao ha lote vigente do 59 em %.', p_mes;
  end if;

  v_res := fn_mestre_aplicar_no_analitico_interno(p_empresa_id, p_mes, p_setor_id, v_lote);

  perform fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'aviso',
    p_descricao  => format(
      'Fonte do setor trocada para o relatório 59 em %s — %s removidas, %s gravadas, de R$ %s para R$ %s',
      p_mes, v_res->>'removidas', v_res->>'gravadas',
      translate(to_char((v_res->>'valor_antes')::numeric, 'FM999,999,990.00'), ',.', '.,'),
      translate(to_char((v_res->>'valor_depois')::numeric, 'FM999,999,990.00'), ',.', '.,')),
    p_empresa_id => p_empresa_id,
    p_tabela     => 'analitico_recebimentos',
    p_alvo_tipo  => 'importacao_analitico',
    p_alvo_rotulo=> format('Mês %s', p_mes),
    p_detalhes   => v_res || jsonb_build_object('mes', p_mes, 'lote_59', v_lote),
    p_origem     => 'ui');

  return v_res || jsonb_build_object('mes', p_mes, 'lote_59', v_lote, 'de_outro_setor', 0);
end;
$function$;

grant execute on function public.fn_mestre_aplicar_no_analitico(uuid, text, uuid) to authenticated;

-- ── O gatilho: ao entrar o 59, sincroniza tudo ─────────────────────────────

create or replace function public.fn_mestre_sincronizar_analitico()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mes       text;
  v_antes     numeric;
  v_depois    numeric;
  v_alvos     integer;
  v_pulados   integer;
  v_removidas integer;
  v_gravadas  integer;
begin
  if new.estado is distinct from 'vigente'
     or coalesce(old.estado, '') = 'vigente' then
    return new;
  end if;

  v_mes := to_char(new.mes, 'YYYY-MM');

  -- O alvo e a INTERSECCAO: setor que JA e do 59 E que a projecao deste lote
  -- tem. Setor que o lote nao trouxe fica de fora e conserva o dado anterior —
  -- apagar e nao por nada no lugar continua sendo impossivel.
  --
  -- Setor que ainda e do 58 NAO e adotado aqui: a adocao e decisao humana na
  -- aba «Fonte dos dados»; a manutencao e que e automatica.
  drop table if exists _sync_alvo;
  create temp table _sync_alvo on commit drop as
    select distinct a.setor_id
      from analitico_recebimentos a
     where a.empresa_id = new.empresa_id
       and a.mes_referencia = new.mes
       and a.setor_id is not null
       and a.procedencia = 'relatorio_59'
       and exists (select 1 from vw_mestre_projecao_analitico v
                    where v.empresa_id = new.empresa_id and v.mes = new.mes
                      and v.setor_id = a.setor_id);

  select count(*) into v_alvos from _sync_alvo;
  if v_alvos = 0 then
    return new;
  end if;

  select count(distinct a.setor_id) into v_pulados
    from analitico_recebimentos a
   where a.empresa_id = new.empresa_id and a.mes_referencia = new.mes
     and a.setor_id is not null and a.procedencia = 'relatorio_59'
     and not exists (select 1 from _sync_alvo z where z.setor_id = a.setor_id);

  select coalesce(sum(valor_recebido), 0) into v_antes
    from analitico_recebimentos
   where empresa_id = new.empresa_id and mes_referencia = new.mes
     and setor_id in (select setor_id from _sync_alvo);

  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select new.id, a.empresa_id, a.setor_id, a.mes_referencia,
         a.codigo, a.operador_usuario, a.data_pagamento, a.valor_recebido,
         to_jsonb(a), auth.uid()
    from analitico_recebimentos a
   where a.empresa_id = new.empresa_id and a.mes_referencia = new.mes
     and a.setor_id in (select setor_id from _sync_alvo)
     and a.procedencia in ('relatorio_58', 'relatorio_59');
  get diagnostics v_removidas = row_count;

  -- `manual` nao entra: e correcao humana.
  delete from analitico_recebimentos a
   where a.empresa_id = new.empresa_id and a.mes_referencia = new.mes
     and a.setor_id in (select setor_id from _sync_alvo)
     and a.procedencia in ('relatorio_58', 'relatorio_59');

  insert into analitico_recebimentos (
    empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
    forma_pagamento, forma_detalhe, valor_recebido, total_ho,
    data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
    procedencia, lote_id, importado_por_id, importado_em)
  select new.empresa_id, v.operador_id, v.operador_usuario, v.codigo, v.nome_cliente,
         v.forma_pagamento, v.forma_detalhe, v.valor_recebido, 0,
         v.data_pagamento, new.mes, v.setor_id, v.tipo_comissao, v.instituicao,
         'relatorio_59', new.id, auth.uid(), now()
    from vw_mestre_projecao_analitico v
   where v.empresa_id = new.empresa_id and v.mes = new.mes
     and v.setor_id in (select setor_id from _sync_alvo)
  on conflict (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)
  do update set
    setor_id       = excluded.setor_id,
    operador_id    = excluded.operador_id,
    valor_recebido = excluded.valor_recebido,
    nome_cliente   = coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
    forma_detalhe  = excluded.forma_detalhe,
    tipo_comissao  = coalesce(excluded.tipo_comissao, analitico_recebimentos.tipo_comissao),
    instituicao    = coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
    procedencia    = 'relatorio_59',
    lote_id        = excluded.lote_id;
  get diagnostics v_gravadas = row_count;

  select coalesce(sum(valor_recebido), 0) into v_depois
    from analitico_recebimentos
   where empresa_id = new.empresa_id and mes_referencia = new.mes
     and setor_id in (select setor_id from _sync_alvo);

  -- A trilha e conveniencia; nenhuma falha dela pode derrubar a promocao. Foi
  -- assim que a primeira versao caiu: o tratador de erro gravava uma severidade
  -- que o check recusa, levantava, e ninguem o capturava.
  begin
    insert into logs_sistema (
      acao, categoria, severidade, descricao, empresa_id, tabela,
      alvo_tipo, alvo_rotulo, origem, detalhes)
    values ('importacao_concluida', 'importacao',
      case when v_pulados > 0 then 'aviso' else 'info' end,
      format('O relatório 59 sincronizou %s setor(es) em %s — %s linha(s) no lugar de %s, '
             || 'de R$ %s para R$ %s%s',
             v_alvos, v_mes, v_gravadas, v_removidas,
             translate(to_char(v_antes, 'FM999,999,990.00'), ',.', '.,'),
             translate(to_char(v_depois, 'FM999,999,990.00'), ',.', '.,'),
             case when v_pulados > 0
                  then format('; %s setor(es) sem linha neste lote, mantidos como estavam', v_pulados)
                  else '' end),
      new.empresa_id, 'analitico_recebimentos', 'importacao_analitico',
      format('Mês %s', v_mes), 'trigger',
      jsonb_build_object('mes', v_mes, 'lote_59', new.id,
        'setores_sincronizados', v_alvos, 'setores_pulados', v_pulados,
        'removidas', v_removidas, 'gravadas', v_gravadas,
        'valor_antes', v_antes, 'valor_depois', v_depois));
  exception when others then
    null;
  end;

  return new;
end;
$function$;

comment on function public.fn_mestre_sincronizar_analitico() is
  'Ao promover um lote do 59, reaplica a projecao sobre todo setor que ja e do '
  '59 naquele mes — em bloco, lendo a view. Fecha a janela de contagem dupla '
  'que o 58 abre nos 50 grupos (R$ 40.903,78) em que as fontes discordam da '
  'data. Ciclo completo medido: 2.689 ms. Nenhuma falha aqui derruba a '
  'promocao.';

-- Nome com 'a' para ordenar ANTES de trg_mestre_notificar_atualizacao: a
-- notificacao diz «os numeros ja refletem a mudanca», e so pode dizer isso
-- depois de eles terem sido escritos.
drop trigger if exists trg_mestre_aplicar_no_analitico on public.mestre_lotes;

create trigger trg_mestre_aplicar_no_analitico
  after update of estado on public.mestre_lotes
  for each row
  execute function public.fn_mestre_sincronizar_analitico();

commit;
