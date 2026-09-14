-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 7, passo 3: o 59 escreve no analítico, e o 58 vira prévia
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## A marca de «este setor é do 59» não precisa de tabela
--
-- Ela é derivável: se existe linha com `procedencia = 'relatorio_59'` naquele
-- setor e mês, o 59 é o dono. Menos estado, nada para dessincronizar, e a
-- verdade é auto-evidente — o 59 possui o que o 59 escreveu.
--
-- Mesma disciplina de `fn_mes_fechado` (Fase 6) e das pendências (Fase 2):
-- derivar em vez de guardar um flag que alguém precisa lembrar de ligar.
--
-- ## A janela de contagem dupla, e por que o 58 tem de parar de gravar
--
-- Sem isto, depois que o 59 escrevesse, a próxima importação do 58 reinseriria
-- as linhas dela. Nos 44 NRs (de 7.584) em que as duas fontes discordam da
-- DATA, a chave de `idx_analitico_unicidade` é outra — então entrariam duas
-- linhas para o mesmo pagamento, e o dinheiro seria contado duas vezes até a
-- promoção seguinte do 59.
--
-- A trava de procedência da Fase 2 impede o 58 de APAGAR a linha do 59, mas não
-- de INSERIR a dele ao lado. Por isso o 58 precisa parar de gravar naquele
-- setor, e não só parar de apagar. O lado do cliente está em
-- `analitico.service.ts`, logo depois da montagem das linhas.
--
-- ## `on conflict do update`, e não `do nothing`
--
-- A chave de `idx_analitico_unicidade` não inclui o setor. Se o 58 tinha um
-- recebimento num setor e o 59 diz que ele é de outro, `do nothing` deixaria a
-- linha errada de pé e o dinheiro no lugar errado. `do update` corrige — o 59 é
-- a autoridade sobre onde cada recebimento conta.
--
-- Em setembro/2026 esse caso é 1 NR. A função devolve quantas linhas vieram de
-- outro setor, para o número não passar despercebido quando for maior.
--
-- ## Verificado contra produção (Play 4, em bloco revertido)
--
--     antes ....... 225 linhas / R$ 67.023,90
--     removidas ... 225   (snapshot: 225 — tudo guardado)
--     gravadas .... 254   (de outro setor: 0)
--     depois ...... 254 linhas / R$ 73.052,59
--
-- Bate ao centavo com a projeção de `20260914024100`.
--
-- ## Escrita
--
-- Apaga (guardando em `analitico_removidos`, Fase 5) as linhas do setor/mês com
-- procedência 58 ou 59, e grava a projeção. Linha `manual` NÃO é tocada — ela é
-- correção humana e não pertence a nenhuma das duas fontes.
--
-- Super_admin apenas.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

-- ── Quem manda neste setor, neste mês ──────────────────────────────────────

create or replace function public.fn_analitico_fonte_do_setor(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid
)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when exists (
           select 1 from analitico_recebimentos a
            where a.empresa_id = p_empresa_id
              and a.mes_referencia = ((p_mes || '-01')::date)
              and a.setor_id = p_setor_id
              and a.procedencia = 'relatorio_59')
         then 'relatorio_59' else 'relatorio_58' end
   where fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id);
$function$;

comment on function public.fn_analitico_fonte_do_setor(uuid, text, uuid) is
  'Quem e a fonte deste setor neste mes: relatorio_59 se o 59 ja escreveu ali, '
  'senao relatorio_58. DERIVADO — o 59 possui o que o 59 escreveu, entao nao ha '
  'flag para alguem esquecer de ligar. E o que faz a importacao do 58 saber que '
  'virou previa naquele setor.';

grant execute on function public.fn_analitico_fonte_do_setor(uuid, text, uuid) to authenticated;

-- ── Aplicar o 59 sobre o analítico de um setor ─────────────────────────────

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
  v_lote        uuid;
  v_mes_data    date := (p_mes || '-01')::date;
  v_valor_antes numeric;
  v_linhas_antes integer;
  v_removidas   integer := 0;
  v_projetadas  integer;
  v_de_outro    integer := 0;
  v_valor_depois numeric;
  v_linhas_depois integer;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Somente super_admin pode trocar a fonte de um setor.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  -- Sem lote vigente do 59 nao ha o que aplicar. Seguir daqui apagaria o 58 e
  -- nao poria nada no lugar.
  select ml.id into v_lote
    from mestre_lotes ml
   where ml.empresa_id = p_empresa_id and ml.mes = v_mes_data and ml.estado = 'vigente';
  if v_lote is null then
    raise exception 'SEM_LOTE_59: nao ha lote vigente do 59 em %.', p_mes;
  end if;

  select count(*), coalesce(sum(valor_recebido), 0)
    into v_linhas_antes, v_valor_antes
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data and setor_id = p_setor_id;

  -- A projecao precisa ter conteudo. Vazia com 59 cheio significa que algo
  -- barrou a leitura (acesso, vinculo de carteira) — e apagar o 58 nesse estado
  -- deixaria o setor zerado em toda tela do sistema.
  select count(*) into v_projetadas
    from fn_mestre_projecao_analitico(p_empresa_id, p_mes, p_setor_id);
  if v_projetadas = 0 then
    raise exception
      'PROJECAO_VAZIA: o 59 nao projeta nenhuma linha para este setor em %. '
      'Confira o vinculo da carteira antes de trocar a fonte.', p_mes;
  end if;

  -- ── 1. Guardar e tirar o que esta la ────────────────────────────────────
  --
  -- Procedencia 58 (a fonte antiga) e 59 (uma aplicacao anterior, para esta
  -- operacao ser repetivel). `manual` fica: e correcao humana, nao pertence a
  -- fonte nenhuma, e apaga-la seria descartar trabalho de gente.
  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select v_lote, a.empresa_id, a.setor_id, a.mes_referencia,
         a.codigo, a.operador_usuario, a.data_pagamento, a.valor_recebido,
         to_jsonb(a), auth.uid()
    from analitico_recebimentos a
   where a.empresa_id = p_empresa_id
     and a.mes_referencia = v_mes_data
     and a.setor_id = p_setor_id
     and a.procedencia in ('relatorio_58', 'relatorio_59');

  get diagnostics v_removidas = row_count;

  delete from analitico_recebimentos a
   where a.empresa_id = p_empresa_id
     and a.mes_referencia = v_mes_data
     and a.setor_id = p_setor_id
     and a.procedencia in ('relatorio_58', 'relatorio_59');

  -- ── 2. Gravar a projecao ────────────────────────────────────────────────
  with gravadas as (
    insert into analitico_recebimentos (
      empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
      forma_pagamento, forma_detalhe, valor_recebido, total_ho,
      data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
      procedencia, lote_id, importado_por_id, importado_em)
    select p_empresa_id, p.operador_id, p.operador_usuario, p.codigo, p.nome_cliente,
           p.forma_pagamento, p.forma_detalhe, p.valor_recebido, 0,
           p.data_pagamento, v_mes_data, p.setor_id, p.tipo_comissao, p.instituicao,
           'relatorio_59', v_lote, auth.uid(), now()
      from fn_mestre_projecao_analitico(p_empresa_id, p_mes, p_setor_id) p
    -- A chave nao inclui o setor: se a linha existir noutro setor, o 59 manda e
    -- ela e corrigida para ca. `do nothing` deixaria o dinheiro no lugar errado.
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
    returning (xmax <> 0) as era_de_outro_setor
  )
  select count(*) filter (where era_de_outro_setor) into v_de_outro from gravadas;

  select count(*), coalesce(sum(valor_recebido), 0)
    into v_linhas_depois, v_valor_depois
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data and setor_id = p_setor_id;

  perform fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'aviso',
    p_descricao  => format(
      'Fonte do setor trocada para o relatório 59 em %s — %s linha(s) guardadas e '
      || 'removidas, %s gravadas, de R$ %s para R$ %s',
      p_mes, v_removidas, v_projetadas,
      translate(to_char(v_valor_antes, 'FM999,999,990.00'), ',.', '.,'),
      translate(to_char(v_valor_depois, 'FM999,999,990.00'), ',.', '.,')),
    p_empresa_id => p_empresa_id,
    p_tabela     => 'analitico_recebimentos',
    p_alvo_tipo  => 'importacao_analitico',
    p_alvo_rotulo=> format('Mês %s', p_mes),
    p_detalhes   => jsonb_build_object(
      'mes', p_mes, 'setor_id', p_setor_id, 'lote_59', v_lote,
      'removidos', v_removidas, 'gravadas', v_projetadas,
      'de_outro_setor', v_de_outro,
      'valor_antes', v_valor_antes, 'valor_depois', v_valor_depois),
    p_origem     => 'ui'
  );

  return jsonb_build_object(
    'mes', p_mes, 'setor_id', p_setor_id, 'lote_59', v_lote,
    'linhas_antes', v_linhas_antes, 'linhas_depois', v_linhas_depois,
    'removidas', v_removidas, 'gravadas', v_projetadas,
    'de_outro_setor', v_de_outro,
    'valor_antes', round(v_valor_antes, 2), 'valor_depois', round(v_valor_depois, 2),
    'delta', round(v_valor_depois - v_valor_antes, 2));
end;
$function$;

comment on function public.fn_mestre_aplicar_no_analitico(uuid, text, uuid) is
  'Faz o 59 virar a fonte de um setor: guarda e remove as linhas 58/59 daquele '
  'setor e grava a projecao com procedencia relatorio_59. Linha manual nao e '
  'tocada. A partir dai fn_analitico_fonte_do_setor devolve relatorio_59 e a '
  'importacao do 58 naquele setor vira previa. Super_admin.';

grant execute on function public.fn_mestre_aplicar_no_analitico(uuid, text, uuid) to authenticated;

commit;
