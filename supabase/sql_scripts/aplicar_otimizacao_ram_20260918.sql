-- ============================================================================
-- JÁ APLICADO em 18/09/2026 ~13:40 UTC pelo MCP (as duas migrations e o
-- registro em schema_migrations). NÃO precisa rodar. O corpo das 4 funções no
-- banco confere por md5 com os arquivos de migration.
--
-- No SQL Editor este arquivo falhou com «unterminated dollar-quoted string»:
-- o banco recebeu só até a linha 150, e a função aberta na 124 fecha na 419.
-- O mesmo texto passou inteiro pelo MCP, então o corte foi no caminho, não no
-- SQL. Causa não confirmada.
-- ============================================================================
-- Otimização de RAM/CPU — 18/09/2026. Rodar INTEIRO no SQL Editor, uma vez.
-- ============================================================================
-- Junta, em ordem, as duas migrations do dia e registra as versões:
--
--   1. 20260918100000_sincronizacao_59_so_o_que_mudou
--      A sincronização do 59 deixa de apagar e reinserir o setor inteiro de
--      hora em hora. Provada antes em transação desfeita contra o lote vigente
--      de setembro: estado final idêntico à projeção (0 faltando, 0 sobrando,
--      R$ 5.521.928,00 dos dois lados); 41 linhas arquivadas em vez de 14.683.
--
--   2. 20260918110000_chat_por_broadcast
--      Gatilhos do chat avisam só quem participa, por Broadcast, só com ids.
--      Provada em transação desfeita: UPDATE sem mudança → 0 avisos; UPDATE
--      real → 1 aviso por participante; payload sem texto.
--
-- ORDEM DE PUBLICAÇÃO: este script ANTES do deploy do front. O front novo
-- ouve o tópico `chat:<perfil>`, que só existe depois do item 2. O front
-- antigo continua funcionando com o banco novo (a publicação não muda).
--
-- Reexecutável.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- A sincronização do 59 passa a mexer só no que mudou
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que acontecia
--
-- `fn_mestre_sincronizar_analitico` (gatilho de `mestre_lotes`, uma vez por
-- lote vigente — o robô sobe um de hora em hora) fazia, para cada setor do 59:
--
--   1. copiar TODAS as linhas do setor no mês para `analitico_removidos`;
--   2. apagar todas;
--   3. inserir de novo a projeção inteira.
--
-- Medido em 18/09/2026, BookPlay, setembro: 10 setores, 14.683 linhas. Da
-- projeção daquela hora, só 40 linhas tinham saído de fato. As outras 14.643
-- foram guardadas, apagadas e reinseridas iguais — de hora em hora.
--
-- Consequências, todas medidas:
--
--   - `analitico_removidos` cresceu 108–148 MB POR DIA desde 14/09 (508 mil
--     linhas, 593 MB). A migration que a criou estimava 2 MB por mês. O banco
--     inteiro tem 1,27 GB; o compute Small tem 2 GB de RAM.
--   - A linha reinserida nasce com id novo, `status_tabulacao = nao_tabulado`,
--     `acordo_id` nulo e `visto = false`. Toda tela do Analítico aberta refazia
--     a tabulação LINHA A LINHA (`TabulacaoCell`: uma consulta em `acordos` e
--     um UPDATE por linha — 113 mil consultas e 13 mil UPDATEs em 3 dias).
--   - Cada um desses UPDATEs dispara o sinal `analitico:<empresa>`, e todo
--     dashboard aberto relê o mês: ~700 sinais por hora e 95.874 chamadas de
--     `fn_analitico_dashboard_mes_json` em 3 dias (13,4 h de banco).
--   - O operador via todas as linhas do mês como «novas» a cada hora.
--
-- ## O que passa a acontecer
--
-- A mesma projeção, comparada pela chave única do analítico
-- (`empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario`):
--
--   - linha que SAIU do 59  → guardada em `analitico_removidos` e apagada;
--   - linha que MUDOU       → a versão antiga é guardada e a linha é atualizada
--                             com os valores da projeção, com o lote novo;
--   - linha NOVA            → inserida;
--   - linha IGUAL           → não é tocada. Mesmo id, mesma tabulação, mesmo
--                             `visto`, mesmo lote de origem.
--
-- Os VALORES finais são os mesmos da versão anterior: a linha alterada recebe
-- exatamente o que a reinserção gravaria (inclusive `tipo_comissao`,
-- `nome_cliente` e `instituicao` da projeção, sem `coalesce` com o antigo). A
-- tabulação só é zerada quando o operador da linha muda — é a única mudança que
-- invalida `tabulado`/`divergente`.
--
-- ## O histórico de importações continua fechando
--
-- `fn_importacoes_detalhe` mostra «entrou» (linhas deste lote ainda presentes)
-- e «saiu» (o que este lote guardou). Antes: entrou = projeção inteira, saiu =
-- setor inteiro. Agora: entrou = novas + alteradas, saiu = removidas + versão
-- antiga das alteradas. A diferença (entrou − saiu) é a mesma nos dois casos:
-- linha igual pesa zero dos dois lados.
--
-- `fn_analitico_restaurar_remocao` continua valendo: repõe o que saiu, e a
-- versão antiga de uma linha alterada esbarra na atual (`on conflict do
-- nothing`) — igual ao que já acontecia com a cópia inteira.
--
-- ## A projeção é lida uma vez
--
-- A view `vw_mestre_projecao_analitico` agrupa `analitico_recebimentos` INTEIRA
-- (grafia canônica do operador). Antes ela era avaliada duas vezes por lote;
-- agora vai para uma tabela temporária, com `analyze`, e é comparada dali.
--
-- A grafia canônica é calculada ANTES de apagar as linhas que saíram (antes era
-- depois de apagar o setor inteiro). No regime normal dá a mesma grafia — a
-- linha do setor já foi gravada com a grafia canônica da hora anterior — e
-- fica mais estável: a chave não troca de caixa entre uma hora e outra.
--
-- ## O que NÃO muda
--
-- - `fn_mestre_aplicar_no_analitico_interno` (troca manual de fonte 58 → 59):
--   ali guardar o setor inteiro é o objetivo — é o retrato que o «devolver ao
--   58» repõe.
-- - As 508 mil linhas já guardadas. Apagar registro de remoção é decisão à
--   parte (ver o fim deste arquivo).
--
-- Reexecutável.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O trabalho, numa função própria (testável sem mexer em `mestre_lotes`)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_mestre_sincronizar_analitico_aplicar(
  p_empresa_id uuid,
  p_mes        date,
  p_lote_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_alvos         integer;
  v_pulados       integer;
  v_antes         numeric;
  v_depois        numeric;
  v_projetadas    integer;
  v_contrib_proj  integer;
  v_removidas     integer := 0;
  v_alteradas     integer := 0;
  v_alteradas_c   integer := 0;
  v_inseridas     integer := 0;
  v_inseridas_c   integer := 0;
begin
  -- O alvo: setor que JA e do 59 E que a projecao deste lote tem. Setor que o
  -- lote nao trouxe fica de fora e conserva o dado anterior.
  drop table if exists _sync_alvo;
  create temp table _sync_alvo on commit drop as
    select distinct a.setor_id
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id is not null
       and a.procedencia = 'relatorio_59';

  -- A projecao, uma vez so. A view agrupa o analitico inteiro.
  drop table if exists _sync_59;
  create temp table _sync_59 on commit drop as
    select v.operador_id, v.operador_usuario, v.codigo, v.nome_cliente,
           v.forma_pagamento, v.forma_detalhe, v.valor_recebido,
           v.data_pagamento, v.setor_id, v.tipo_comissao, v.instituicao
      from vw_mestre_projecao_analitico v
     where v.empresa_id = p_empresa_id and v.mes = p_mes
       and v.setor_id in (select setor_id from _sync_alvo);

  delete from _sync_alvo z
   where not exists (select 1 from _sync_59 n where n.setor_id = z.setor_id);

  select count(*) into v_alvos from _sync_alvo;
  if v_alvos = 0 then
    return jsonb_build_object('setores_sincronizados', 0);
  end if;

  drop table if exists _sync_contrib;
  create temp table _sync_contrib on commit drop as
    select c.operador_usuario, c.codigo, c.nome_cliente, c.forma_pagamento,
           c.forma_detalhe, c.valor_recebido, c.data_pagamento, c.setor_id,
           c.instituicao, c.origem_setor_id
      from vw_mestre_contribuicao_analitico c
     where c.empresa_id = p_empresa_id and c.mes = p_mes
       and c.setor_id in (select setor_id from _sync_alvo);

  analyze _sync_59;
  analyze _sync_contrib;
  select count(*) into v_projetadas   from _sync_59;
  select count(*) into v_contrib_proj from _sync_contrib;

  select count(distinct a.setor_id) into v_pulados
    from analitico_recebimentos a
   where a.empresa_id = p_empresa_id and a.mes_referencia = p_mes
     and a.setor_id is not null and a.procedencia = 'relatorio_59'
     and not exists (select 1 from _sync_alvo z where z.setor_id = a.setor_id);

  select coalesce(sum(valor_recebido), 0) into v_antes
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = p_mes
     and setor_id in (select setor_id from _sync_alvo);

  -- ── 1. O que saiu do 59: guardar e apagar ────────────────────────────────
  with saiu as (
    delete from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id in (select setor_id from _sync_alvo)
       and a.procedencia in ('relatorio_58', 'relatorio_59', 'contribuicao_59')
       and not exists (
         select 1 from _sync_59 n
          where n.codigo = a.codigo and n.data_pagamento = a.data_pagamento
            and n.forma_pagamento = a.forma_pagamento
            and n.operador_usuario = a.operador_usuario)
       and not exists (
         select 1 from _sync_contrib n
          where n.codigo = a.codigo and n.data_pagamento = a.data_pagamento
            and n.forma_pagamento = a.forma_pagamento
            and n.operador_usuario = a.operador_usuario)
    returning a.*
  )
  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select p_lote_id, s.empresa_id, s.setor_id, s.mes_referencia,
         s.codigo, s.operador_usuario, s.data_pagamento, s.valor_recebido,
         to_jsonb(s), auth.uid()
    from saiu s;
  get diagnostics v_removidas = row_count;

  -- ── 2. Linha do setor que mudou: guardar a versão antiga e atualizar ──────
  -- Recebe exatamente o que a reinserção gravaria. Tabulação e `visto` ficam,
  -- salvo troca de operador.
  drop table if exists _sync_mudou;
  create temp table _sync_mudou on commit drop as
    select a.id, n.*
      from analitico_recebimentos a
      join _sync_59 n
        on n.codigo = a.codigo and n.data_pagamento = a.data_pagamento
       and n.forma_pagamento = a.forma_pagamento
       and n.operador_usuario = a.operador_usuario
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id in (select setor_id from _sync_alvo)
       and a.procedencia in ('relatorio_58', 'relatorio_59', 'contribuicao_59')
       and (a.setor_id, a.operador_id, a.valor_recebido, a.nome_cliente,
            a.forma_detalhe, a.tipo_comissao, a.instituicao, a.procedencia,
            a.contribuicao_de_setor_id, a.pagamentos_detalhados)
           is distinct from
           (n.setor_id, n.operador_id, n.valor_recebido, n.nome_cliente,
            n.forma_detalhe, n.tipo_comissao, n.instituicao, 'relatorio_59'::text,
            null::uuid, null::jsonb);

  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select p_lote_id, a.empresa_id, a.setor_id, a.mes_referencia,
         a.codigo, a.operador_usuario, a.data_pagamento, a.valor_recebido,
         to_jsonb(a), auth.uid()
    from analitico_recebimentos a
    join _sync_mudou m on m.id = a.id;

  update analitico_recebimentos a
     set setor_id                 = m.setor_id,
         operador_id              = m.operador_id,
         valor_recebido           = m.valor_recebido,
         total_ho                 = 0,
         nome_cliente             = m.nome_cliente,
         forma_detalhe            = m.forma_detalhe,
         tipo_comissao            = m.tipo_comissao,
         instituicao              = m.instituicao,
         procedencia              = 'relatorio_59',
         contribuicao_de_setor_id = null,
         pagamentos_detalhados    = null,
         status_tabulacao         = case when a.operador_id is distinct from m.operador_id
                                         then 'nao_tabulado' else a.status_tabulacao end,
         acordo_id                = case when a.operador_id is distinct from m.operador_id
                                         then null else a.acordo_id end,
         lote_id                  = p_lote_id,
         importado_por_id         = auth.uid(),
         importado_em             = now()
    from _sync_mudou m
   where a.id = m.id;
  get diagnostics v_alteradas = row_count;

  -- ── 3. Linha nova do 59 ───────────────────────────────────────────────────
  -- O conflito aqui é com linha FORA do setor-alvo (outro setor, outra
  -- procedência): mesmo `do update` de antes, só quando algo muda.
  insert into analitico_recebimentos (
    empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
    forma_pagamento, forma_detalhe, valor_recebido, total_ho,
    data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
    procedencia, lote_id, importado_por_id, importado_em)
  select p_empresa_id, n.operador_id, n.operador_usuario, n.codigo, n.nome_cliente,
         n.forma_pagamento, n.forma_detalhe, n.valor_recebido, 0,
         n.data_pagamento, p_mes, n.setor_id, n.tipo_comissao, n.instituicao,
         'relatorio_59', p_lote_id, auth.uid(), now()
    from _sync_59 n
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
    lote_id        = excluded.lote_id
  where (analitico_recebimentos.setor_id, analitico_recebimentos.operador_id,
         analitico_recebimentos.valor_recebido, analitico_recebimentos.nome_cliente,
         analitico_recebimentos.forma_detalhe, analitico_recebimentos.tipo_comissao,
         analitico_recebimentos.instituicao, analitico_recebimentos.procedencia)
        is distinct from
        (excluded.setor_id, excluded.operador_id, excluded.valor_recebido,
         coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
         excluded.forma_detalhe,
         coalesce(excluded.tipo_comissao, analitico_recebimentos.tipo_comissao),
         coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
         'relatorio_59'::text);
  get diagnostics v_inseridas = row_count;

  -- ── 4. A contribuição que outro setor cobrou para este (14/09/2026) ──────
  drop table if exists _sync_mudou_c;
  create temp table _sync_mudou_c on commit drop as
    select a.id, c.*
      from analitico_recebimentos a
      join _sync_contrib c
        on c.codigo = a.codigo and c.data_pagamento = a.data_pagamento
       and c.forma_pagamento = a.forma_pagamento
       and c.operador_usuario = a.operador_usuario
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id in (select setor_id from _sync_alvo)
       and a.procedencia in ('relatorio_58', 'relatorio_59', 'contribuicao_59')
       and (a.setor_id, a.operador_id, a.valor_recebido, a.nome_cliente,
            a.forma_detalhe, a.tipo_comissao, a.instituicao, a.procedencia,
            a.contribuicao_de_setor_id, a.pagamentos_detalhados)
           is distinct from
           (c.setor_id, null::uuid, c.valor_recebido, c.nome_cliente,
            c.forma_detalhe, 'Integral'::text, c.instituicao, 'contribuicao_59'::text,
            c.origem_setor_id, null::jsonb);

  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select p_lote_id, a.empresa_id, a.setor_id, a.mes_referencia,
         a.codigo, a.operador_usuario, a.data_pagamento, a.valor_recebido,
         to_jsonb(a), auth.uid()
    from analitico_recebimentos a
    join _sync_mudou_c m on m.id = a.id;

  update analitico_recebimentos a
     set setor_id                 = m.setor_id,
         operador_id              = null,
         valor_recebido           = m.valor_recebido,
         total_ho                 = 0,
         nome_cliente             = m.nome_cliente,
         forma_detalhe            = m.forma_detalhe,
         tipo_comissao            = 'Integral',
         instituicao              = m.instituicao,
         procedencia              = 'contribuicao_59',
         contribuicao_de_setor_id = m.origem_setor_id,
         pagamentos_detalhados    = null,
         status_tabulacao         = case when a.operador_id is not null
                                         then 'nao_tabulado' else a.status_tabulacao end,
         acordo_id                = case when a.operador_id is not null
                                         then null else a.acordo_id end,
         lote_id                  = p_lote_id,
         importado_por_id         = auth.uid(),
         importado_em             = now()
    from _sync_mudou_c m
   where a.id = m.id;
  get diagnostics v_alteradas_c = row_count;

  insert into analitico_recebimentos (
    empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
    forma_pagamento, forma_detalhe, valor_recebido, total_ho,
    data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
    procedencia, contribuicao_de_setor_id, lote_id, importado_por_id, importado_em)
  select p_empresa_id, null, c.operador_usuario, c.codigo, c.nome_cliente,
         c.forma_pagamento, c.forma_detalhe, c.valor_recebido, 0,
         c.data_pagamento, p_mes, c.setor_id, 'Integral', c.instituicao,
         'contribuicao_59', c.origem_setor_id, p_lote_id, auth.uid(), now()
    from _sync_contrib c
  on conflict (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)
  do update set
    setor_id                 = excluded.setor_id,
    valor_recebido           = excluded.valor_recebido,
    nome_cliente             = coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
    forma_detalhe            = excluded.forma_detalhe,
    instituicao              = coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
    procedencia              = 'contribuicao_59',
    contribuicao_de_setor_id = excluded.contribuicao_de_setor_id,
    lote_id                  = excluded.lote_id
  where (analitico_recebimentos.setor_id, analitico_recebimentos.valor_recebido,
         analitico_recebimentos.nome_cliente, analitico_recebimentos.forma_detalhe,
         analitico_recebimentos.instituicao, analitico_recebimentos.procedencia,
         analitico_recebimentos.contribuicao_de_setor_id)
        is distinct from
        (excluded.setor_id, excluded.valor_recebido,
         coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
         excluded.forma_detalhe,
         coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
         'contribuicao_59'::text, excluded.contribuicao_de_setor_id);
  get diagnostics v_inseridas_c = row_count;

  select coalesce(sum(valor_recebido), 0) into v_depois
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = p_mes
     and setor_id in (select setor_id from _sync_alvo);

  return jsonb_build_object(
    'setores_sincronizados', v_alvos,
    'setores_pulados',       v_pulados,
    'projetadas',            v_projetadas,
    'contribuicoes',         v_contrib_proj,
    'removidas',             v_removidas,
    'alteradas',             v_alteradas + v_alteradas_c,
    'inseridas',             v_inseridas + v_inseridas_c,
    'intactas',              greatest(v_projetadas + v_contrib_proj
                                      - v_alteradas - v_alteradas_c
                                      - v_inseridas - v_inseridas_c, 0),
    'valor_antes',           v_antes,
    'valor_depois',          v_depois);
end;
$function$;

comment on function public.fn_mestre_sincronizar_analitico_aplicar(uuid, date, uuid) is
  'Aplica a projecao do 59 no analitico do mes, so no que mudou: guarda e apaga o que saiu, '
  'guarda a versao antiga e atualiza o que mudou, insere o novo, nao toca no igual. '
  'Chamada por fn_mestre_sincronizar_analitico. Ver 20260918100000.';

revoke all on function public.fn_mestre_sincronizar_analitico_aplicar(uuid, date, uuid)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O gatilho: decide se roda e registra no log
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_mestre_sincronizar_analitico()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mes text;
  v_r   jsonb;
begin
  if new.estado is distinct from 'vigente'
     or coalesce(old.estado, '') = 'vigente' then
    return new;
  end if;

  v_mes := to_char(new.mes, 'YYYY-MM');
  v_r   := public.fn_mestre_sincronizar_analitico_aplicar(new.empresa_id, new.mes, new.id);

  if coalesce((v_r ->> 'setores_sincronizados')::integer, 0) = 0 then
    return new;
  end if;

  begin
    insert into logs_sistema (
      acao, categoria, severidade, descricao, empresa_id, tabela,
      alvo_tipo, alvo_rotulo, origem, detalhes)
    values ('importacao_concluida', 'importacao',
      case when (v_r ->> 'setores_pulados')::integer > 0 then 'aviso' else 'info' end,
      format('O relatório 59 sincronizou %s setor(es) em %s — %s nova(s), %s alterada(s), '
             || '%s removida(s), %s sem mudança; de R$ %s para R$ %s%s',
             v_r ->> 'setores_sincronizados', v_mes,
             v_r ->> 'inseridas', v_r ->> 'alteradas', v_r ->> 'removidas', v_r ->> 'intactas',
             translate(to_char((v_r ->> 'valor_antes')::numeric, 'FM999,999,990.00'), ',.', '.,'),
             translate(to_char((v_r ->> 'valor_depois')::numeric, 'FM999,999,990.00'), ',.', '.,'),
             case when (v_r ->> 'setores_pulados')::integer > 0
                  then format('; %s setor(es) sem linha neste lote, mantidos como estavam',
                              v_r ->> 'setores_pulados')
                  else '' end),
      new.empresa_id, 'analitico_recebimentos', 'importacao_analitico',
      format('Mês %s', v_mes), 'trigger',
      v_r || jsonb_build_object('mes', v_mes, 'lote_59', new.id,
        -- Chave antiga, com o significado antigo: linhas do 59 no lugar.
        'gravadas', (v_r ->> 'projetadas')::integer));
  exception when others then
    null;  -- trilha e conveniencia; nada aqui derruba a promocao.
  end;

  return new;
end;
$function$;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fora desta migration, e só com autorização: as ~508 mil linhas que a versão
-- anterior guardou sem necessidade. São cópias de linhas que voltaram iguais
-- (a mesma chave existe hoje em analitico_recebimentos, com o mesmo valor).
-- Contar antes de qualquer coisa:
--
--   select count(*), pg_size_pretty(sum(pg_column_size(r.*))::bigint)
--     from analitico_removidos r
--    where r.removido_em >= '2026-09-14'
--      and r.restaurado_em is null
--      and exists (select 1 from analitico_recebimentos a
--                   where a.empresa_id = r.empresa_id and a.codigo = r.codigo
--                     and a.data_pagamento = r.data_pagamento
--                     and a.operador_usuario = r.operador_usuario
--                     and a.forma_pagamento = r.conteudo ->> 'forma_pagamento'
--                     and a.valor_recebido = r.valor_recebido);
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- Chat: o aviso de tempo real vai por Broadcast, para quem participa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que acontecia
--
-- `useChat` assina `chat_mensagens` e `chat_participantes` por Postgres Changes
-- SEM filtro — a tabela de participantes não tem coluna que diga «é meu», e o
-- chat atravessa empresas. Medido em 18/09/2026: 166 assinaturas em cada uma.
--
-- Para cada linha que muda, o Realtime avalia a RLS de CADA assinante dentro
-- do banco (`realtime.list_changes` → `apply_rls`). Em 3 dias foram 14 mil
-- UPDATEs em `chat_participantes` (leitura, entrega) e 2 mil em
-- `chat_mensagens`: ~2,7 milhões de avaliações de RLS para entregar eventos a,
-- em média, 2,1 pessoas por conversa. O leitor do WAL somou 13.972 s de banco
-- no período — o segundo maior consumo depois do dashboard.
--
-- ## O que passa a acontecer
--
-- Gatilhos por LINHA mandam um Broadcast privado para o tópico pessoal de cada
-- participante da conversa:
--
--   tópico `chat:<perfil_id>`
--   evento `mensagem`     { operacao, id, conversa_id, autor_id,
--                           curtida_por, curtida_em, curtida_em_antes }
--   evento `participante` { operacao, conversa_id, perfil_id }
--
-- Só ids e carimbos. O TEXTO não viaja: `realtime.send` grava o payload em
-- `realtime.messages`, e o texto de uma mensagem com CPF ficaria lá depois do
-- expurgo. O cliente busca a mensagem pelo id, pela RLS de sempre.
--
-- A policy deixa cada pessoa ouvir só o próprio tópico: a checagem é
-- `topic = 'chat:' || auth.uid()`, feita uma vez na entrada do canal.
--
-- ## O que NÃO muda
--
-- - A publicação `supabase_realtime`. O cliente antigo (aba sem recarregar)
--   continua recebendo por Postgres Changes; o novo não assina mais. As
--   assinaturas somem com as abas antigas, sem janela sem aviso.
-- - O painel de monitoria (`PainelMonitor`) continua em Postgres Changes: só
--   existe com o painel aberto, e quem monitora não é participante.
--
-- Reexecutável.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Mensagem nova ou alterada → quem participa
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_chat_sinal_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payload jsonb;
  v_perfil  uuid;
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return null;
  end if;

  v_payload := jsonb_build_object(
    'operacao',         tg_op,
    'id',               new.id,
    'conversa_id',      new.conversa_id,
    'autor_id',         new.autor_id,
    'curtida_por',      new.curtida_por,
    'curtida_em',       new.curtida_em,
    'curtida_em_antes', case when tg_op = 'UPDATE' then old.curtida_em end);

  -- Aviso é conveniência: falhar aqui não pode derrubar o envio da mensagem.
  begin
    for v_perfil in
      select cp.perfil_id
        from public.chat_participantes cp
       where cp.conversa_id = new.conversa_id
         and (cp.saiu_em is null or cp.saiu_em >= new.criado_em)
    loop
      perform realtime.send(v_payload, 'mensagem', 'chat:' || v_perfil::text, true);
    end loop;
  exception when others then
    raise warning 'fn_chat_sinal_mensagem: %', sqlerrm;
  end;

  return null;
end;
$function$;

comment on function public.fn_chat_sinal_mensagem() is
  'Broadcast «mensagem» no topico chat:<perfil_id> de cada participante. So ids — '
  'o texto e lido pela RLS. Ver 20260918110000.';

revoke all on function public.fn_chat_sinal_mensagem() from public, anon, authenticated;

drop trigger if exists trg_chat_sinal_mensagem on public.chat_mensagens;
create trigger trg_chat_sinal_mensagem
  after insert or update on public.chat_mensagens
  for each row execute function public.fn_chat_sinal_mensagem();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Participante mudou (leitura, entrega, entrou, saiu) → quem participa
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_chat_sinal_participante()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_conversa uuid;
  v_quem     uuid;
  v_payload  jsonb;
  v_perfil   uuid;
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_conversa := old.conversa_id;
    v_quem     := old.perfil_id;
  else
    v_conversa := new.conversa_id;
    v_quem     := new.perfil_id;
  end if;

  v_payload := jsonb_build_object(
    'operacao',    tg_op,
    'conversa_id', v_conversa,
    'perfil_id',   v_quem);

  begin
    for v_perfil in
      select cp.perfil_id
        from public.chat_participantes cp
       where cp.conversa_id = v_conversa
      union
      -- Quem foi tirado já não está na tabela, e é quem mais precisa saber.
      select v_quem
    loop
      perform realtime.send(v_payload, 'participante', 'chat:' || v_perfil::text, true);
    end loop;
  exception when others then
    raise warning 'fn_chat_sinal_participante: %', sqlerrm;
  end;

  return null;
end;
$function$;

comment on function public.fn_chat_sinal_participante() is
  'Broadcast «participante» no topico chat:<perfil_id> de cada participante da conversa. '
  'Ver 20260918110000.';

revoke all on function public.fn_chat_sinal_participante() from public, anon, authenticated;

drop trigger if exists trg_chat_sinal_participante on public.chat_participantes;
create trigger trg_chat_sinal_participante
  after insert or update or delete on public.chat_participantes
  for each row execute function public.fn_chat_sinal_participante();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cada pessoa ouve só o próprio tópico
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists chat_sinal_receber on realtime.messages;
create policy chat_sinal_receber on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) = 'chat:' || (select auth.uid())::text
  );

commit;

-- ── Registro das versões (o histórico de migrations do projeto) ─────────────
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260918100000', 'sincronizacao_59_so_o_que_mudou'),
  ('20260918110000', 'chat_por_broadcast')
on conflict (version) do nothing;

-- ── Conferência: deve voltar 4 funções, 2 gatilhos do chat e 1 policy ───────
select 'funcao' as tipo, p.proname as nome
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('fn_mestre_sincronizar_analitico', 'fn_mestre_sincronizar_analitico_aplicar',
                     'fn_chat_sinal_mensagem', 'fn_chat_sinal_participante')
union all
select 'gatilho', tgname from pg_trigger
 where tgname in ('trg_chat_sinal_mensagem', 'trg_chat_sinal_participante')
union all
select 'policy', policyname from pg_policies
 where schemaname = 'realtime' and policyname = 'chat_sinal_receber'
union all
select 'versao', version from supabase_migrations.schema_migrations
 where version in ('20260918100000', '20260918110000')
order by 1, 2;
