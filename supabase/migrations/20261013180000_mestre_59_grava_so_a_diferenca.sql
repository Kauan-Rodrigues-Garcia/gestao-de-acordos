-- ============================================================================
-- Relatório 59: a promoção grava só a DIFERENÇA (13/10/2026)
-- ============================================================================
--
-- ## O que custava
--
-- A cada hora o robô sobe o 59 inteiro (~60 mil linhas) e promove. Medido em
-- 13/10/2026, por promoção: 33,5 s, 622 mil registros de WAL, 85 MB — e mais
-- 60 mil linhas entrando com 11 índices ANTES, na carga. Quase tudo para
-- trocar um retrato que, de uma hora para outra, muda algumas dezenas de linhas:
--
--   • o lote novo inteiro entra em `mestre_recebimentos` (11 índices);
--   • `fn_mestre_congelar_operadores` dá UPDATE nas 60 mil (índices de operador:
--     não é HOT);
--   • o lote antigo inteiro sai (DELETE de 60 mil).
--
-- A sincronização com o analítico (`fn_mestre_sincronizar_analitico_aplicar`)
-- já grava só o que mudou. O desperdício está no retrato do 59 em si.
--
-- ## O que muda
--
-- 1. As linhas que chegam vão para uma tabela de PASSAGEM, `mestre_recebimentos_stage`
--    (UNLOGGED, sem índice além do lote): não gera WAL, e some sozinha se o
--    banco cair no meio — a carga só é refeita.
-- 2. `fn_mestre_promover_lote(lote, completo := false)` compara a passagem com o
--    retrato vigente do mês e grava, nele, só as linhas que entraram e as que
--    saíram. Mesmo conteúdo = mesma linha, mesmo que a posição no arquivo tenha
--    mudado (compara o conteúdo, não o número da linha).
-- 3. O mapeamento do operador (cobradora → perfil) é reavaliado para todas as
--    linhas, mas só se grava onde mudou.
-- 4. O retrato vigente MANTÉM o mesmo lote físico. O lote que o robô abriu
--    guarda o retrato ANTERIOR (arquivo, hash, linhas, total) e continua sendo
--    o «id da importação»: é ele que o analítico, os removidos e o histórico
--    registram. Nada que lê «o lote vigente» muda — todos juntam por estado.
-- 5. `p_completo := true` (só super_admin) e o primeiro lote do mês fazem o que
--    sempre fizeram: o lote novo vira o vigente e o antigo sai inteiro. É o
--    botão de emergência.
--
-- ## O contrato com o robô não muda
--
-- `fn_mestre_abrir_lote`, `fn_mestre_inserir_linhas` e `fn_mestre_promover_lote`
-- continuam com os mesmos nomes, argumentos e retorno (o retorno ganha `modo`
-- e contagens). O robô fica fora do repositório e não precisa mudar.
--
-- ## Os gatilhos
--
-- `trg_mestre_aplicar_no_analitico` e `trg_mestre_notificar_atualizacao` só
-- reagem à entrada de um lote em «vigente». Aqui o lote vigente é o mesmo, então
-- ele é «aberto» e volta a «vigente» dentro da transação, e as duas funções
-- aprenderam a ler o id da importação em `mestre.lote_importacao` (variável de
-- transação), no lugar de `new.id`.
--
-- Ordem do deploy: esta migration pode vir antes ou depois do front — o front
-- novo só acrescenta o argumento `p_completo`.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. A tabela de passagem ─────────────────────────────────────────────────

CREATE UNLOGGED TABLE IF NOT EXISTS public.mestre_recebimentos_stage
  (LIKE public.mestre_recebimentos INCLUDING DEFAULTS INCLUDING IDENTITY);

CREATE INDEX IF NOT EXISTS mestre_recebimentos_stage_lote
  ON public.mestre_recebimentos_stage (lote_id);

ALTER TABLE public.mestre_recebimentos_stage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mestre_recebimentos_stage FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.mestre_recebimentos_stage IS
  'Passagem do relatório 59: as linhas de um lote aberto, até a promoção. UNLOGGED, sem policy — só as funções '
  'SECURITY DEFINER de fn_mestre_* tocam nela. Esvazia na promoção ou no descarte.';

-- ── 2. A carga cai na passagem ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_mestre_inserir_linhas(p_lote_id uuid, p_linhas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_empresa uuid;
  v_mes     date;
  v_estado  text;
  v_n       integer;
begin
  if not (fn_user_is_super_admin() or fn_user_tem('mestre_importar_automatico')) then
    raise exception 'Apenas super_admin pode importar o relatório mestre.';
  end if;

  select empresa_id, mes, estado into v_empresa, v_mes, v_estado
    from mestre_lotes where id = p_lote_id;
  if v_empresa is null then
    raise exception 'Lote % não existe.', p_lote_id;
  end if;
  if v_estado <> 'aberto' then
    raise exception 'Lote % está em "%" — só um lote aberto recebe linhas.', p_lote_id, v_estado;
  end if;

  insert into mestre_recebimentos_stage (
    lote_id, empresa_id, mes,
    setor, cod_grupo_filtro, nome_grupo_filtro, cod_grupo, cod_grupo_representa, setor_orig,
    cobradora, operador_orig, subgrupo_equipe,
    cliente, cod_cli, titulo, nr_documento, parcela, empresa_erp, tipo_venda, tp_doc,
    colchao, tipo,
    dt_lig, prev_pgto, dt_pgto, dias, dias_atraso, dias_ligacao_baixa, recebido, linha_num
  )
  select
    p_lote_id, v_empresa, v_mes,
    coalesce(x.setor, ''), x.cod_grupo_filtro, coalesce(x.nome_grupo_filtro, ''),
    coalesce(x.cod_grupo, ''), x.cod_grupo_representa, x.setor_orig,
    coalesce(x.cobradora, ''), x.operador_orig, coalesce(x.subgrupo_equipe, ''),
    coalesce(x.cliente, ''), coalesce(x.cod_cli, ''), coalesce(x.titulo, ''),
    coalesce(x.nr_documento, ''), coalesce(x.parcela, ''), coalesce(x.empresa_erp, ''),
    x.tipo_venda, coalesce(x.tp_doc, ''),
    coalesce(x.colchao, false), coalesce(x.tipo, ''),
    x.dt_lig, x.prev_pgto, x.dt_pgto, x.dias, x.dias_atraso, x.dias_ligacao_baixa,
    coalesce(x.recebido, 0), coalesce(x.linha_num, 0)
  from jsonb_to_recordset(p_linhas) as x(
    setor                text,
    cod_grupo_filtro     text,
    nome_grupo_filtro    text,
    cod_grupo            text,
    cod_grupo_representa text,
    setor_orig           text,
    cobradora            text,
    operador_orig        text,
    subgrupo_equipe      text,
    cliente              text,
    cod_cli              text,
    titulo               text,
    nr_documento         text,
    parcela              text,
    empresa_erp          text,
    tipo_venda           text,
    tp_doc               text,
    colchao              boolean,
    tipo                 text,
    dt_lig               date,
    prev_pgto            date,
    dt_pgto              date,
    dias                 integer,
    dias_atraso          integer,
    dias_ligacao_baixa   integer,
    recebido             numeric,
    linha_num            integer
  );

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- ── 3. Descartar limpa a passagem também ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_mestre_descartar_lote(p_lote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_estado text; v_empresa uuid;
begin
  if not (fn_user_is_super_admin() or fn_user_tem('mestre_importar_automatico')) then
    raise exception 'Apenas super_admin pode importar o relatório mestre.';
  end if;

  select estado, empresa_id into v_estado, v_empresa from mestre_lotes where id = p_lote_id;
  if v_estado is null then return; end if;
  if v_estado <> 'aberto' then
    raise exception 'Lote % está em "%" — só um lote aberto pode ser descartado.', p_lote_id, v_estado;
  end if;

  delete from mestre_recebimentos_stage where lote_id = p_lote_id;
  delete from mestre_recebimentos where lote_id = p_lote_id;
  update mestre_lotes set estado = 'descartado' where id = p_lote_id;

  insert into mestre_eventos (empresa_id, lote_id, tipo, detalhes, usuario_id)
  values (v_empresa, p_lote_id, 'lote_descartado', jsonb_build_object('motivo', 'descartado pela tela'), auth.uid());
end;
$function$;

-- ── 4. Os gatilhos leem o id da importação ──────────────────────────────────
--
-- Mesmo corpo de 13/10/2026 em `pg_proc`; muda só `v_lote`, que vale
-- `mestre.lote_importacao` quando a promoção por diferença o define e `new.id`
-- em todo o resto.

CREATE OR REPLACE FUNCTION public.fn_mestre_sincronizar_analitico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_mes  text;
  v_r    jsonb;
  v_lote uuid := coalesce(nullif(current_setting('mestre.lote_importacao', true), '')::uuid, new.id);
begin
  if new.estado is distinct from 'vigente'
     or coalesce(old.estado, '') = 'vigente' then
    return new;
  end if;

  v_mes := to_char(new.mes, 'YYYY-MM');
  v_r   := public.fn_mestre_sincronizar_analitico_aplicar(new.empresa_id, new.mes, v_lote);

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
      v_r || jsonb_build_object('mes', v_mes, 'lote_59', v_lote,
        -- Chave antiga, com o significado antigo: linhas do 59 no lugar.
        'gravadas', (v_r ->> 'projetadas')::integer));
  exception when others then
    null;  -- trilha e conveniencia; nada aqui derruba a promocao.
  end;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_mestre_notificar_atualizacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_anterior numeric;
  v_delta    numeric;
  v_sync     numeric;
  v_setores  integer;
  v_mes      text;
  v_msg      text;
  v_lote     uuid := coalesce(nullif(current_setting('mestre.lote_importacao', true), '')::uuid, new.id);
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

  -- Mesmo arquivo de novo: nada mudou em lugar nenhum.
  if v_anterior is not null and v_delta = 0 then
    return new;
  end if;

  -- O que a sincronizacao acabou de mover, deixado na trilha pelo gatilho que
  -- roda antes deste, na mesma transacao. E este o numero que as telas mostram.
  select (lg.detalhes->>'valor_depois')::numeric - (lg.detalhes->>'valor_antes')::numeric,
         (lg.detalhes->>'setores_sincronizados')::integer
    into v_sync, v_setores
    from logs_sistema lg
   where lg.origem = 'trigger'
     and lg.detalhes->>'lote_59' = v_lote::text
     and lg.detalhes ? 'setores_sincronizados'
   order by lg.criado_em desc
   limit 1;

  -- A sincronizacao rodou e nao moveu nada: a diferenca do lote era toda
  -- colchao, Retencao ou segunda perna de rateio. Nenhuma tela mudou, entao
  -- nao ha o que avisar.
  if v_setores is not null and v_setores > 0 and coalesce(v_sync, 0) = 0 then
    return new;
  end if;

  v_msg := case
    when v_setores is not null and v_setores > 0 then
      format('O relatório 59 de %s foi atualizado: R$ %s %s nos setores. '
             || 'Os números do dashboard, do painel e do analítico já refletem a mudança.',
             v_mes,
             translate(to_char(abs(v_sync), 'FM999,999,990.00'), ',.', '.,'),
             case when v_sync >= 0 then 'a mais' else 'a menos' end)
    when v_anterior is null then
      format('O relatório 59 de %s entrou no sistema.', v_mes)
    else
      format('O relatório 59 de %s foi atualizado: R$ %s %s no total da empresa.',
             v_mes,
             translate(to_char(abs(v_delta), 'FM999,999,990.00'), ',.', '.,'),
             case when v_delta >= 0 then 'a mais' else 'a menos' end)
  end;

  insert into notificacoes (usuario_id, titulo, mensagem, empresa_id, rota)
  select p.id, 'Dados analíticos atualizados', v_msg, new.empresa_id, '/'
    from perfis p
   where p.empresa_id = new.empresa_id
     and coalesce(p.ativo, true);

  return new;
end;
$function$;

-- ── 5. A promoção completa (o que sempre existiu) passa a ter outro nome ────
--
-- Espera as linhas do lote em `mestre_recebimentos`. Quem chama de fora é o
-- `fn_mestre_promover_lote`, abaixo.

DO $renomear$
BEGIN
  IF to_regprocedure('public.fn_mestre_promover_lote_completo(uuid)') IS NULL THEN
    ALTER FUNCTION public.fn_mestre_promover_lote(uuid) RENAME TO fn_mestre_promover_lote_completo;
  END IF;
END;
$renomear$;

REVOKE ALL ON FUNCTION public.fn_mestre_promover_lote_completo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mestre_promover_lote_completo(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_mestre_promover_lote_completo(uuid) IS
  'Promoção que troca o retrato inteiro: o lote novo vira o vigente e o antigo sai. Interna — chamada por '
  'fn_mestre_promover_lote no primeiro lote do mês e no modo completo (emergência, super_admin).';

-- ── 6. A promoção por diferença ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_mestre_promover_lote(p_lote_id uuid, p_completo boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $function$
declare
  v_empresa    uuid;
  v_mes        date;
  v_estado     text;
  v_base       uuid;
  v_linhas     integer;
  v_total      numeric(14,2);
  v_novos      integer := 0;
  v_sumiram    integer := 0;
  v_voltaram   integer := 0;
  v_eq_novas   integer := 0;
  v_eq_sumiram integer := 0;
  v_inseridas  integer := 0;
  v_removidas  integer := 0;
  v_congelados integer := 0;
  v_ant        record;
  v_novo       record;
begin
  if not (fn_user_is_super_admin() or fn_user_tem('mestre_importar_automatico')) then
    raise exception 'Apenas super_admin pode importar o relatório mestre.';
  end if;
  if p_completo and not fn_user_is_super_admin() then
    raise exception 'Apenas super_admin pode reescrever o retrato inteiro do relatório mestre.';
  end if;

  select empresa_id, mes, estado into v_empresa, v_mes, v_estado
    from mestre_lotes where id = p_lote_id for update;
  if v_empresa is null then
    raise exception 'Lote % não existe.', p_lote_id;
  end if;
  if v_estado <> 'aberto' then
    raise exception 'Lote % está em "%" — só um lote aberto pode ser promovido.', p_lote_id, v_estado;
  end if;

  select count(*), coalesce(sum(recebido), 0) into v_linhas, v_total
    from mestre_recebimentos_stage where lote_id = p_lote_id;
  if v_linhas = 0 then
    raise exception 'Lote % está vazio — promovê-lo apagaria o retrato do mês e não poria nada no lugar.', p_lote_id;
  end if;

  select id into v_base
    from mestre_lotes
   where empresa_id = v_empresa and mes = v_mes and estado = 'vigente'
   for update;

  -- ── Primeiro lote do mês, ou pedido de reescrita completa ────────────────
  if v_base is null or p_completo then
    insert into mestre_recebimentos (
      lote_id, empresa_id, mes,
      setor, cod_grupo_filtro, nome_grupo_filtro, cod_grupo, cod_grupo_representa, setor_orig,
      cobradora, operador_orig, subgrupo_equipe,
      cliente, cod_cli, titulo, nr_documento, parcela, empresa_erp, tipo_venda, tp_doc,
      colchao, tipo,
      dt_lig, prev_pgto, dt_pgto, dias, dias_atraso, dias_ligacao_baixa, recebido, linha_num)
    select
      s.lote_id, s.empresa_id, s.mes,
      s.setor, s.cod_grupo_filtro, s.nome_grupo_filtro, s.cod_grupo, s.cod_grupo_representa, s.setor_orig,
      s.cobradora, s.operador_orig, s.subgrupo_equipe,
      s.cliente, s.cod_cli, s.titulo, s.nr_documento, s.parcela, s.empresa_erp, s.tipo_venda, s.tp_doc,
      s.colchao, s.tipo,
      s.dt_lig, s.prev_pgto, s.dt_pgto, s.dias, s.dias_atraso, s.dias_ligacao_baixa, s.recebido, s.linha_num
      from mestre_recebimentos_stage s
     where s.lote_id = p_lote_id;
    delete from mestre_recebimentos_stage where lote_id = p_lote_id;

    return public.fn_mestre_promover_lote_completo(p_lote_id)
           || jsonb_build_object('modo', 'completo');
  end if;

  -- ── Por diferença ────────────────────────────────────────────────────────

  insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
  select v_empresa, p_lote_id, 'grupo_sumiu', a.cod_grupo_filtro,
         max(a.nome_grupo_filtro),
         jsonb_build_object('linhas', count(*), 'recebido', sum(a.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
         auth.uid()
    from mestre_recebimentos a
   where a.lote_id = v_base
     and not exists (
           select 1 from mestre_recebimentos_stage n
            where n.lote_id = p_lote_id and n.cod_grupo_filtro = a.cod_grupo_filtro)
   group by a.cod_grupo_filtro;
  get diagnostics v_sumiram = row_count;

  insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
  select v_empresa, p_lote_id, 'equipe_sumiu', a.cod_grupo_filtro, a.subgrupo_equipe,
         jsonb_build_object('linhas', count(*), 'recebido', sum(a.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
         auth.uid()
    from mestre_recebimentos a
   where a.lote_id = v_base and a.subgrupo_equipe <> ''
     and not exists (
           select 1 from mestre_recebimentos_stage n
            where n.lote_id = p_lote_id
              and n.cod_grupo_filtro = a.cod_grupo_filtro
              and n.subgrupo_equipe  = a.subgrupo_equipe)
   group by a.cod_grupo_filtro, a.subgrupo_equipe;
  get diagnostics v_eq_sumiram = row_count;

  insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
  select v_empresa, p_lote_id, 'grupo_novo', n.cod_grupo_filtro, max(n.nome_grupo_filtro),
         jsonb_build_object('linhas', count(*), 'recebido', sum(n.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
         auth.uid()
    from mestre_recebimentos_stage n
   where n.lote_id = p_lote_id
     and not exists (
           select 1 from mestre_grupos g
            where g.empresa_id = v_empresa and g.cod_grupo_filtro = n.cod_grupo_filtro)
   group by n.cod_grupo_filtro;
  get diagnostics v_novos = row_count;

  insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
  select v_empresa, p_lote_id, 'grupo_voltou', n.cod_grupo_filtro, max(n.nome_grupo_filtro),
         jsonb_build_object('linhas', count(*), 'recebido', sum(n.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
         auth.uid()
    from mestre_recebimentos_stage n
   where n.lote_id = p_lote_id
     and exists (
           select 1 from mestre_grupos g
            where g.empresa_id = v_empresa and g.cod_grupo_filtro = n.cod_grupo_filtro)
     and not exists (
           select 1 from mestre_recebimentos a
            where a.lote_id = v_base and a.cod_grupo_filtro = n.cod_grupo_filtro)
   group by n.cod_grupo_filtro;
  get diagnostics v_voltaram = row_count;

  insert into mestre_eventos (empresa_id, lote_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
  select v_empresa, p_lote_id, 'equipe_nova', n.cod_grupo_filtro, n.subgrupo_equipe,
         jsonb_build_object('linhas', count(*), 'recebido', sum(n.recebido), 'mes', to_char(v_mes, 'YYYY-MM')),
         auth.uid()
    from mestre_recebimentos_stage n
   where n.lote_id = p_lote_id and n.subgrupo_equipe <> ''
     and not exists (
           select 1 from mestre_equipes e
            where e.empresa_id = v_empresa
              and e.cod_grupo_filtro = n.cod_grupo_filtro
              and e.nome_subgrupo    = n.subgrupo_equipe)
   group by n.cod_grupo_filtro, n.subgrupo_equipe;
  get diagnostics v_eq_novas = row_count;

  insert into mestre_grupos (
    empresa_id, cod_grupo_filtro, nome_grupo_filtro, primeira_aparicao, ultima_aparicao)
  select v_empresa, n.cod_grupo_filtro,
         (array_agg(n.nome_grupo_filtro order by n.id))[1],
         v_mes, v_mes
    from mestre_recebimentos_stage n
   where n.lote_id = p_lote_id
   group by n.cod_grupo_filtro
  on conflict (empresa_id, cod_grupo_filtro) do update
     set nome_grupo_filtro = excluded.nome_grupo_filtro,
         primeira_aparicao = least(mestre_grupos.primeira_aparicao, excluded.primeira_aparicao),
         ultima_aparicao   = greatest(mestre_grupos.ultima_aparicao, excluded.ultima_aparicao),
         atualizado_em     = now();

  insert into mestre_equipes (
    empresa_id, cod_grupo_filtro, nome_subgrupo, primeira_aparicao, ultima_aparicao)
  select v_empresa, n.cod_grupo_filtro, n.subgrupo_equipe, v_mes, v_mes
    from mestre_recebimentos_stage n
   where n.lote_id = p_lote_id and n.subgrupo_equipe <> ''
   group by n.cod_grupo_filtro, n.subgrupo_equipe
  on conflict (empresa_id, cod_grupo_filtro, nome_subgrupo) do update
     set primeira_aparicao = least(mestre_equipes.primeira_aparicao, excluded.primeira_aparicao),
         ultima_aparicao   = greatest(mestre_equipes.ultima_aparicao, excluded.ultima_aparicao),
         atualizado_em     = now();

  -- A diferença. Duas linhas são a MESMA se têm o mesmo conteúdo (tudo menos o
  -- id, o lote, o número da linha no arquivo e o operador congelado). Repetidas
  -- contam por ocorrência: quem tem 3 iguais e passa a ter 2 perde uma só.
  drop table if exists _mestre_velho;
  create temp table _mestre_velho on commit drop as
    select z.id, z.h, row_number() over (partition by z.h order by z.id) as rn
      from (select r.id,
                   md5((to_jsonb(r) - array['id','lote_id','linha_num','operador_id','operador_setor_id'])::text) as h
              from mestre_recebimentos r where r.lote_id = v_base) z;

  drop table if exists _mestre_novo;
  create temp table _mestre_novo on commit drop as
    select z.id, z.h, row_number() over (partition by z.h order by z.id) as rn
      from (select s.id,
                   md5((to_jsonb(s) - array['id','lote_id','linha_num','operador_id','operador_setor_id'])::text) as h
              from mestre_recebimentos_stage s where s.lote_id = p_lote_id) z;

  create index on _mestre_velho (h, rn);
  create index on _mestre_novo (h, rn);

  delete from mestre_recebimentos r
   using _mestre_velho v
   where r.id = v.id
     and not exists (select 1 from _mestre_novo n where n.h = v.h and n.rn = v.rn);
  get diagnostics v_removidas = row_count;

  insert into mestre_recebimentos (
    lote_id, empresa_id, mes,
    setor, cod_grupo_filtro, nome_grupo_filtro, cod_grupo, cod_grupo_representa, setor_orig,
    cobradora, operador_orig, subgrupo_equipe,
    cliente, cod_cli, titulo, nr_documento, parcela, empresa_erp, tipo_venda, tp_doc,
    colchao, tipo,
    dt_lig, prev_pgto, dt_pgto, dias, dias_atraso, dias_ligacao_baixa, recebido, linha_num)
  select
    v_base, s.empresa_id, s.mes,
    s.setor, s.cod_grupo_filtro, s.nome_grupo_filtro, s.cod_grupo, s.cod_grupo_representa, s.setor_orig,
    s.cobradora, s.operador_orig, s.subgrupo_equipe,
    s.cliente, s.cod_cli, s.titulo, s.nr_documento, s.parcela, s.empresa_erp, s.tipo_venda, s.tp_doc,
    s.colchao, s.tipo,
    s.dt_lig, s.prev_pgto, s.dt_pgto, s.dias, s.dias_atraso, s.dias_ligacao_baixa, s.recebido, s.linha_num
    from mestre_recebimentos_stage s
    join _mestre_novo n on n.id = s.id
   where not exists (select 1 from _mestre_velho v where v.h = n.h and v.rn = n.rn);
  get diagnostics v_inseridas = row_count;

  -- O operador congelado, reavaliado para o retrato inteiro (perfil criado,
  -- renomeado ou apagado desde a última carga), mas gravado só onde mudou. É o
  -- mesmo critério de `fn_mestre_congelar_operadores`.
  drop table if exists _mestre_cobradora;
  create temp table _mestre_cobradora on commit drop as
    select distinct on (c.empresa_id, c.cobradora)
           c.empresa_id, c.cobradora, p.id as operador_id, p.setor_id as operador_setor_id
      from (select distinct empresa_id, cobradora
              from mestre_recebimentos where lote_id = v_base) c
      left join perfis p
        on c.cobradora <> ''
       and p.empresa_id = c.empresa_id
       and lower(p.usuario) = lower(c.cobradora)
     order by c.empresa_id, c.cobradora, p.id;

  update mestre_recebimentos r
     set operador_id       = m.operador_id,
         operador_setor_id = m.operador_setor_id
    from _mestre_cobradora m
   where r.lote_id = v_base
     and m.empresa_id = r.empresa_id and m.cobradora = r.cobradora
     and (r.operador_id is distinct from m.operador_id
          or r.operador_setor_id is distinct from m.operador_setor_id);
  get diagnostics v_congelados = row_count;

  -- A passagem se esvazia. O que o arquivo trouxe de metadado vai para o
  -- retrato; o que o retrato tinha vai para o lote desta importação.
  select arquivo_nome, arquivo_hash, importado_por_id, importado_em
    into v_novo from mestre_lotes where id = p_lote_id;
  select arquivo_nome, arquivo_hash, linhas, total_recebido, importado_por_id, importado_em, promovido_em
    into v_ant from mestre_lotes where id = v_base;

  delete from mestre_recebimentos_stage where lote_id = p_lote_id;

  -- `notificar_atualizacao` acha o total anterior por `substituido_por = id`:
  -- as importações antigas largam a referência, para só haver uma.
  update mestre_lotes set substituido_por = null
   where substituido_por = v_base and id <> p_lote_id;

  update mestre_lotes set estado = 'aberto' where id = v_base;   -- os gatilhos ignoram

  update mestre_lotes
     set estado = 'substituido', substituido_em = now(), substituido_por = v_base,
         arquivo_nome = v_ant.arquivo_nome, arquivo_hash = v_ant.arquivo_hash,
         linhas = v_ant.linhas, total_recebido = v_ant.total_recebido,
         importado_por_id = v_ant.importado_por_id, importado_em = v_ant.importado_em,
         promovido_em = v_ant.promovido_em
   where id = p_lote_id;

  perform set_config('mestre.lote_importacao', p_lote_id::text, true);

  update mestre_lotes     -- aqui os gatilhos sincronizam o analítico e avisam
     set estado = 'vigente', promovido_em = now(),
         arquivo_nome = v_novo.arquivo_nome, arquivo_hash = v_novo.arquivo_hash,
         importado_por_id = v_novo.importado_por_id, importado_em = v_novo.importado_em,
         linhas = v_linhas, total_recebido = v_total,
         substituido_em = null, substituido_por = null
   where id = v_base;

  perform set_config('mestre.lote_importacao', '', true);

  insert into mestre_eventos (empresa_id, lote_id, tipo, detalhes, usuario_id)
  values (v_empresa, p_lote_id, 'lote_promovido',
          jsonb_build_object(
            'mes', to_char(v_mes, 'YYYY-MM'),
            'modo', 'diferenca',
            'linhas', v_linhas,
            'total_recebido', v_total,
            'substituiu', v_base,
            'linhas_inseridas', v_inseridas,
            'linhas_removidas', v_removidas,
            'linhas_mantidas', v_linhas - v_inseridas,
            'grupos_novos', v_novos,
            'grupos_sumiram', v_sumiram,
            'grupos_voltaram', v_voltaram,
            'equipes_novas', v_eq_novas,
            'equipes_sumiram', v_eq_sumiram,
            'operadores_atualizados', v_congelados),
          auth.uid());

  return jsonb_build_object(
    'lote_id', p_lote_id,
    'mes', to_char(v_mes, 'YYYY-MM'),
    'modo', 'diferenca',
    'linhas', v_linhas,
    'total_recebido', v_total,
    'substituiu', v_base,
    'linhas_inseridas', v_inseridas,
    'linhas_removidas', v_removidas,
    'linhas_mantidas', v_linhas - v_inseridas,
    'grupos_novos', v_novos,
    'grupos_sumiram', v_sumiram,
    'grupos_voltaram', v_voltaram,
    'equipes_novas', v_eq_novas,
    'equipes_sumiram', v_eq_sumiram,
    'operadores_congelados', v_congelados);
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_mestre_promover_lote(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mestre_promover_lote(uuid, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_mestre_promover_lote(uuid, boolean) IS
  'Promove o lote aberto. Por padrão grava no retrato vigente SÓ a diferença (linhas que entraram e que saíram); '
  'p_completo = true (super_admin) ou o primeiro lote do mês troca o retrato inteiro, como antes.';

-- ── 7. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF (SELECT count(*) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname = 'fn_mestre_promover_lote') <> 1 THEN
    RAISE EXCEPTION 'Esperava uma única fn_mestre_promover_lote (a de dois argumentos).';
  END IF;
  IF to_regprocedure('public.fn_mestre_promover_lote_completo(uuid)') IS NULL THEN
    RAISE EXCEPTION 'A promoção completa não existe.';
  END IF;
  IF (SELECT relpersistence FROM pg_class WHERE oid = 'public.mestre_recebimentos_stage'::regclass) <> 'u' THEN
    RAISE EXCEPTION 'A passagem deveria ser UNLOGGED.';
  END IF;
  IF (SELECT count(*) FROM mestre_recebimentos_stage) <> 0 THEN
    RAISE EXCEPTION 'A passagem nasceu com linhas.';
  END IF;
  IF (SELECT count(*) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace
         AND proname IN ('fn_mestre_sincronizar_analitico', 'fn_mestre_notificar_atualizacao')
         AND prosrc LIKE '%mestre.lote_importacao%') <> 2 THEN
    RAISE EXCEPTION 'Os gatilhos não leem o id da importação.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261013180000', 'mestre_59_grava_so_a_diferenca', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
