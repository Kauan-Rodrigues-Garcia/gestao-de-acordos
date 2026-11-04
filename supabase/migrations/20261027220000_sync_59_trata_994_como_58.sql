-- ============================================================================
-- Sincronização do 59: a linha do 994 é prévia, igual à do 58
-- ============================================================================
--
-- ## O que o banco mostrou (27/10/2026, consulta autorizada)
--
-- A premissa de 20261027210000 — «a Retenção não está no 59 do Jornada» — é
-- falsa. O Jornada é setor do 59 em outubro (só linhas `relatorio_59` e
-- `contribuicao_59`, nenhuma `relatorio_58`), e o 59 já grava a Retenção nele:
--
--   jessica_s_souza ..... 14 linhas, R$ 15.758,56
--   monica_souza ........  9 linhas, R$ 12.392,60
--   vitoria_nascimento .. 13 linhas, R$ 20.920,09
--   total ............... 36 linhas, R$ 49.071,25 (colchão fora)
--
-- Com o 994 fora da sincronização, o mesmo pagamento podia ficar duas vezes:
-- o 994 com uma data ou forma, o 59 com outra — e nenhum apagava o outro.
--
-- ## A regra
--
-- O 994 segue o caminho que o 58 já segue diante do 59 (20260928200000):
--
--   • o app grava do 994 só hoje e ontem que o 59 ainda não trouxe;
--   • quando o 59 traz o mesmo pagamento, a linha passa a ser do 59 e guarda
--     a hora em que chegou pelo 994;
--   • o 994 de hoje e de ontem que o 59 ainda não trouxe fica; passados dois
--     dias sem o 59 confirmar, sai (com cópia em `analitico_removidos`);
--   • o card de mudanças do mês não avisa esse vai e vem — é prévia, como o 58.
--
-- A procedência própria continua: o importador do 58 não apaga a Retenção, e
-- o do 994 não apaga o 58.
--
-- Depende de 20261027210000 (a procedência `relatorio_994`). O resto das duas
-- funções é IDÊNTICO a 20261002180000 e 20260929020000: só a lista de
-- procedências muda. Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_mestre_sincronizar_analitico_aplicar(p_empresa_id uuid, p_mes date, p_lote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- «Hoje» em São Paulo: o 58 de hoje e de ontem pode estar à frente do 59.
  v_hoje          date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- O alvo: setor que JA e do 59 E que a projecao deste lote tem. Setor que o
  -- lote nao trouxe fica de fora e conserva o dado anterior.
  drop table if exists _sync_alvo;
  --
  -- Herança (20261002180000): o setor que foi do 59 no MÊS ANTERIOR continua
  -- do 59 neste, sem ninguém precisar trocar a fonte de novo. Sem isto, na
  -- virada do mês nenhum setor tem linha do 59 ainda, o alvo sai vazio e o 59
  -- para de escrever no analítico — foi o que aconteceu em 01-02/10/2026.
  -- Quem foi devolvido ao 58 NESTE mês (linha restaurada) não é retomado.
  create temp table _sync_alvo on commit drop as
    select distinct a.setor_id
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id is not null
       and a.procedencia = 'relatorio_59'
    union
    select distinct a.setor_id
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = (p_mes - interval '1 month')::date
       and a.setor_id is not null
       and a.procedencia = 'relatorio_59'
       and not exists (
         select 1 from analitico_removidos r
          where r.empresa_id = p_empresa_id
            and r.mes_referencia = p_mes
            and r.setor_id = a.setor_id
            and r.restaurado_em is not null);

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

  -- A hora em que cada pagamento do 58 CHEGOU. Quando o 59 alcança a linha,
  -- ela passa a ser do 59 mas não pode mudar de hora: o Plantão Elite monta o
  -- quadro hora a hora pela chegada (ver 20260928200000).
  drop table if exists _sync_chegada;
  create temp table _sync_chegada on commit drop as
    select a.codigo, a.data_pagamento, a.operador_id, min(a.importado_em) as chegou
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id in (select setor_id from _sync_alvo)
       and a.procedencia in ('relatorio_58', 'relatorio_994')
     group by a.codigo, a.data_pagamento, a.operador_id;

  -- ── 1. O que saiu do 59: guardar e apagar ────────────────────────────────
  with saiu as (
    delete from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id in (select setor_id from _sync_alvo)
       and a.procedencia in ('relatorio_58', 'relatorio_994', 'relatorio_59', 'contribuicao_59')
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
       -- O 58 de hoje e de ontem que o 59 AINDA NÃO TROUXE fica. O 59 chega
       -- horas depois do pagamento; apagar antes era sumir com o recebimento
       -- do dia (28/09/2026: 36 linhas, R$ 19.896,59 — o Plantão Elite do
       -- Matheus caiu de R$ 4.925,66 para R$ 234,01). Quando o 59 trouxer o
       -- mesmo NR na mesma data, a linha dele manda; passados dois dias, o 58
       -- que o 59 nunca confirmou sai como antes.
       and not (a.procedencia in ('relatorio_58', 'relatorio_994')
                and a.data_pagamento >= v_hoje - 1
                and not exists (select 1 from _sync_59 n
                                 where n.codigo = a.codigo and n.data_pagamento = a.data_pagamento)
                and not exists (select 1 from _sync_contrib n
                                 where n.codigo = a.codigo and n.data_pagamento = a.data_pagamento))
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
       and a.procedencia in ('relatorio_58', 'relatorio_994', 'relatorio_59', 'contribuicao_59')
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
         -- A linha do 58 que o 59 confirmou guarda a hora em que chegou.
         importado_em             = case
                                      when a.procedencia in ('relatorio_58', 'relatorio_994')
                                       and a.operador_id is not distinct from m.operador_id
                                      then a.importado_em
                                      else now()
                                    end
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
         -- Mesmo pagamento que o 58 já tinha trazido (outra forma ou outro
         -- usuário na chave): a hora continua a da chegada pelo 58.
         'relatorio_59', p_lote_id, auth.uid(), coalesce(ch.chegou, now())
    from _sync_59 n
    left join _sync_chegada ch
      on ch.codigo = n.codigo and ch.data_pagamento = n.data_pagamento
     and ch.operador_id is not distinct from n.operador_id
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
       and a.procedencia in ('relatorio_58', 'relatorio_994', 'relatorio_59', 'contribuicao_59')
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

CREATE OR REPLACE FUNCTION public.fn_analitico_mudancas_do_mes(
  p_empresa_id uuid,
  p_mes        text,
  p_limite     integer DEFAULT 200
)
RETURNS TABLE(
  codigo               text,
  nome_cliente         text,
  data_pagamento       date,
  lote_id              uuid,
  ocorrido_em          timestamptz,
  operador_antes_id    uuid,
  operador_antes_nome  text,
  valor_antes          numeric,
  com_ele_desde        timestamptz,
  operador_depois_id   uuid,
  operador_depois_nome text,
  valor_depois         numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mes      DATE;
  v_escopo   INTEGER;
  v_equipes  UUID[] := '{}';
  v_setores  UUID[] := '{}';
  v_ops      UUID[] := '{}';
  v_limite   INTEGER := LEAST(GREATEST(COALESCE(p_limite, 200), 1), 500);
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('ver_analitico') THEN
    RETURN;
  END IF;

  v_mes    := (p_mes || '-01')::DATE;
  v_escopo := public.fn_user_escopo('analitico');

  -- Liderança inclusive: o cadastro sozinho deixava o líder sem equipe
  -- (20260928210000).
  v_equipes := ARRAY(SELECT public.fn_equipes_de_alcance(auth.uid()));
  v_setores := ARRAY(SELECT public.fn_setores_do_operador(auth.uid()));

  IF v_escopo = 2 AND cardinality(v_setores) > 0 THEN
    v_ops := ARRAY(
      SELECT pf.id FROM public.perfis pf WHERE pf.setor_id = ANY(v_setores)
      UNION
      SELECT c.operador_id
        FROM public.equipe_operadores_clones c
        JOIN public.equipes e ON e.id = c.equipe_id
       WHERE e.setor_id = ANY(v_setores)
    );
  ELSIF v_escopo < 2 AND cardinality(v_equipes) > 0 THEN
    v_ops := ARRAY(
      SELECT pf.id FROM public.perfis pf WHERE pf.equipe_id = ANY(v_equipes)
      UNION
      SELECT c.operador_id
        FROM public.equipe_operadores_clones c
       WHERE c.equipe_id = ANY(v_equipes)
      UNION
      SELECT auth.uid()
    );
  ELSIF v_escopo < 2 THEN
    v_ops := ARRAY[auth.uid()];
  END IF;

  RETURN QUERY
  WITH antes AS (
    SELECT r.codigo,
           r.data_pagamento,
           r.lote_id,
           r.removido_em,
           r.conteudo->>'nome_cliente'                       AS nome_cliente,
           r.conteudo->>'forma_pagamento'                    AS forma,
           NULLIF(r.conteudo->>'operador_id', '')::UUID      AS operador_id,
           COALESCE((r.conteudo->>'valor_recebido')::NUMERIC, 0) AS valor,
           NULLIF(r.conteudo->>'importado_em', '')::TIMESTAMPTZ  AS desde
      FROM public.analitico_removidos r
     WHERE r.empresa_id     = p_empresa_id
       AND r.mes_referencia = v_mes
       -- Linha devolvida pelo rollback não é mudança: voltou a ser o que era.
       AND r.restaurado_em IS NULL
       AND r.codigo IS NOT NULL
       AND r.data_pagamento IS NOT NULL
       -- O 58 é PRÉVIA, por contrato. Promovê-lo ao 59 (ou descartá-lo quando
       -- o 59 nunca confirma) é o pipeline funcionando, não alguém mexendo no
       -- recebimento de ninguém. Medido em 29/09/2026, no mês corrente:
       --
       --                      saindo do 58     já definitivo
       --   removido .............. 689 .............. 12
       --   transferido ........... 739 .............. 91
       --   valor alterado ....... 2804 ............. 105
       --
       -- Sem este corte o card entregava 4.232 avisos por mês, 96% deles
       -- rotina, e ninguém lia os 5% que importam.
       -- O 994 da Retenção é prévia do mesmo jeito (20261027220000).
       AND COALESCE(r.conteudo->>'procedencia', '') NOT IN ('relatorio_58', 'relatorio_994')
       -- 24 horas de presença (29/09/2026). A linha tem de ter ficado ao
       -- menos um dia com a pessoa antes de sair ou mudar de dono. O que
       -- aparece e some no mesmo dia é o 58 e o 59 se acertando, não notícia.
       --
       -- Filtrado AQUI, antes do ROW_NUMBER, de propósito: se o 59 mexeu no
       -- valor da linha duas horas antes de transferi-la, o retrato dessas
       -- duas horas não prova o dia, mas o retrato anterior prova — e é ele
       -- que tem de sobrar para o ranking escolher.
       AND NULLIF(r.conteudo->>'importado_em', '')::TIMESTAMPTZ
           <= r.removido_em - INTERVAL '24 hours'
  ),
  -- O retrato de agora, na MESMA chave do snapshot: NR + data + forma. A chave
  -- de `analitico_recebimentos` inclui a forma, e agrupar só por NR + data
  -- somava as formas de um mesmo pagamento contra o valor de uma linha só —
  -- toda conta de valor saía errada.
  depois AS (
    SELECT ar.codigo,
           ar.data_pagamento,
           ar.forma_pagamento AS forma,
           SUM(ar.valor_recebido) AS valor,
           (ARRAY_AGG(ar.operador_id ORDER BY ar.valor_recebido DESC, ar.operador_id))[1] AS operador_id
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id     = p_empresa_id
       AND ar.mes_referencia = v_mes
     GROUP BY ar.codigo, ar.data_pagamento, ar.forma_pagamento
  ),
  par AS (
    SELECT a.codigo, a.nome_cliente, a.data_pagamento, a.lote_id,
           a.removido_em, a.operador_id AS op_antes, a.valor AS val_antes,
           a.desde, d.operador_id AS op_depois, d.valor AS val_depois,
           -- Um NR pode ter sido mexido várias vezes no mês; a tela mostra a
           -- mais recente de cada, não a história inteira de cada um.
           ROW_NUMBER() OVER (
             PARTITION BY a.codigo, a.data_pagamento, a.forma
             ORDER BY a.removido_em DESC) AS ordem
      FROM antes a
      LEFT JOIN depois d
        ON d.codigo = a.codigo
       AND d.data_pagamento = a.data_pagamento
       AND d.forma IS NOT DISTINCT FROM a.forma
  )
  SELECT p.codigo,
         p.nome_cliente,
         p.data_pagamento,
         p.lote_id,
         p.removido_em,
         p.op_antes,
         pa.nome,
         ROUND(p.val_antes, 2),
         p.desde,
         p.op_depois,
         pd.nome,
         ROUND(p.val_depois, 2)
    FROM par p
    LEFT JOIN public.perfis pa ON pa.id = p.op_antes
    LEFT JOIN public.perfis pd ON pd.id = p.op_depois
   WHERE p.ordem = 1
     -- Só as duas notícias: o NR sumiu, ou mudou de dono. «Valor alterado»
     -- saiu em 29/09/2026 — a leitura de valor entre retratos dava números
     -- errados, e a pedido foi retirada em vez de corrigida.
     AND (p.val_depois IS NULL
          OR p.op_depois IS DISTINCT FROM p.op_antes)
     AND (
       v_escopo >= 3
       OR p.op_antes  = ANY(v_ops)
       OR p.op_depois = ANY(v_ops)
     )
   ORDER BY p.removido_em DESC, p.codigo
   LIMIT v_limite;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_analitico_mudancas_do_mes(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_mudancas_do_mes(uuid, text, integer) TO authenticated;

COMMENT ON FUNCTION public.fn_analitico_mudancas_do_mes(uuid, text, integer) IS
  'Remoções e transferências que a importação do 59 fez no mês, já no escopo '
  'de quem pergunta. Só linhas que estavam há mais de 24 h com a pessoa. Sem '
  'valor alterado. O 58 e o 994 ficam de fora (são prévia). Só leitura. '
  'Migrations 20260929000000, 20260929020000 e 20261027220000.';
commit;
