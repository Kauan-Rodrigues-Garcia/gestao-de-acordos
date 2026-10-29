-- ============================================================================
-- O 994 é dono da Retenção do Jornada, e o extra não conta duas vezes
-- ============================================================================
--
-- ## O que estava errado (conferido no banco em 28/10/2026, consulta autorizada)
--
-- Com o 994 como prévia do 59 (20261027220000), a Jessica fechava outubro em
-- R$ 16.078,56 no gestão e R$ 30.423,30 no ERP. A diferença:
--
--   PADRÃO de boleto/carnê com pagamento futuro ...... R$ 13.151,67 (fora)
--   Pix Automático de acordo antigo (colchão) ........ R$    894,98 (fora)
--   Pix que o 59 deu a outra pessoa (extra) .......... R$  1.875,00
--   Pix pago que ninguém gravou ...................... R$    836,85
--   cartão que o 59 traz em dobro do 994 ............. R$  2.194,00
--   NR 13056405 dobrado (59 em 27/10, 994 em 28/10) .. R$    160,00
--
-- O «só hoje e ontem que o 59 não trouxe» não fecha: o 994 é a PRODUÇÃO da
-- Retenção (todo acordo fechado, pelo valor cheio), não um relatório de caixa.
--
-- ## A regra (decisão do usuário, 28/10/2026)
--
-- No setor em que o 994 é importado, quem aparece no 994 do mês é lido SÓ do
-- 994. Hoje: monica_souza, vitoria_nascimento e jessica_s_souza (Sub Grupo
-- RETENÇÃO — quem diz é o arquivo, não esta migration).
--
--   • `fn_analitico_994_substituir` troca o mês dessas pessoas no setor pelo
--     arquivo inteiro, numa transação: o que não veio sai (com cópia em
--     `analitico_removidos`), o que mudou é atualizado (tabulação fica), o que
--     é novo entra. Correção `manual` nunca é tocada.
--   • A sincronização do 59 não grava, não altera e não apaga linha de quem tem
--     994 no setor/mês. Antes da primeira importação do 994 do mês, o 59 segue
--     alimentando a pessoa como antes.
--
-- ## O extra não conta duas vezes
--
-- Quando a Retenção fecha acordo de cliente de outro setor, o 59 lança o
-- pagamento como EXTRA para o operador daquele setor (NR 13052605: Juliana;
-- NR 13026089: Camila) — e o 994 conta o mesmo pagamento para a Retenção. É a
-- 2ª perna do Integral do Receptivo (14/09/2026): conta nos dois setores e
-- UMA vez na empresa.
--
-- `espelho_extra` marca a linha do 994 que tem par do 59 em OUTRO setor, com
-- outro operador, no mesmo NR e no mesmo dia. Ela conta para a pessoa, a
-- equipe e o setor; fica fora só do total da empresa (`linhaNoEscopo`). Quem
-- recalcula a marca é o banco, nos dois escritores — a importação do 994 e a
-- sincronização do 59 —, então o 59 trazer ou tirar o extra depois acerta a
-- marca sozinho.
--
-- O Painel Diretoria não muda: o total da empresa lá sai do 59 bruto
-- (`mestre_recebimentos`), e o 994 nunca entrou nele.
--
-- ## Dependências e o que é copiado
--
-- Depende de 20261027210000 (procedência `relatorio_994`). Reescreve:
--   fn_mestre_sincronizar_analitico_aplicar  corpo de 20261027220000 + dono 994
--   fn_analitico_dashboard_mes_json          corpo de 20261001110000 + espelho
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

-- ── 1. A marca do espelho ───────────────────────────────────────────────────

alter table public.analitico_recebimentos
  add column if not exists espelho_extra boolean not null default false;

comment on column public.analitico_recebimentos.espelho_extra is
  'Linha do 994 (Retencao) cujo pagamento o 59 ja lancou como extra para outro operador em '
  'outro setor (mesmo NR e dia). Conta para a pessoa, a equipe e o setor; fica fora do total '
  'da empresa. Mantida por fn_analitico_994_marcar_espelhos. Migration 20261028150000.';

CREATE OR REPLACE FUNCTION public.fn_analitico_994_marcar_espelhos(p_empresa_id uuid, p_mes date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n integer;
begin
  -- Também desmarca: linha que deixou de ser do 994, ou cujo par sumiu do 59.
  update analitico_recebimentos a
     set espelho_extra = x.espelho
    from (
      select r.id,
             r.procedencia = 'relatorio_994'
             and exists (
               select 1 from analitico_recebimentos o
                where o.empresa_id = r.empresa_id
                  and o.codigo = r.codigo
                  and o.data_pagamento = r.data_pagamento
                  and o.procedencia = 'relatorio_59'
                  and o.setor_id is distinct from r.setor_id
                  and lower(o.operador_usuario) <> lower(r.operador_usuario)) as espelho
        from analitico_recebimentos r
       where r.empresa_id = p_empresa_id
         and r.mes_referencia = p_mes
         and (r.procedencia = 'relatorio_994' or r.espelho_extra)
    ) x
   where a.id = x.id
     and a.espelho_extra is distinct from x.espelho;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- Só os dois escritores chamam (são SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.fn_analitico_994_marcar_espelhos(uuid, date) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_analitico_994_marcar_espelhos(uuid, date) IS
  'Recalcula espelho_extra das linhas do 994 no mes. Chamada pela importacao do 994 e pela '
  'sincronizacao do 59. Migration 20261028150000.';

-- ── 2. A importação do 994: o mês da Retenção, inteiro ──────────────────────

CREATE OR REPLACE FUNCTION public.fn_analitico_994_substituir(
  p_empresa_id uuid,
  p_setor_id   uuid,
  p_mes        date,
  p_lote_id    uuid,
  p_linhas     jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mes        date := date_trunc('month', p_mes)::date;
  v_ops        text[];
  v_antes      numeric;
  v_depois     numeric;
  v_fora_mes   integer := 0;
  v_removidas  integer := 0;
  v_alteradas  integer := 0;
  v_inseridas  integer := 0;
  v_ignoradas  integer := 0;
  v_espelhos   integer := 0;
begin
  if p_empresa_id is null or p_setor_id is null or p_mes is null or p_lote_id is null then
    raise exception 'Importacao do 994: empresa, setor, mes e lote sao obrigatorios.';
  end if;

  if not (public.fn_user_is_super_admin()
          or (public.fn_can_access_empresa(p_empresa_id)
              and public.fn_user_tem('importar_analitico_retencao'))) then
    raise exception 'Sem permissao para importar o 994.' using errcode = '42501';
  end if;

  if not exists (select 1 from setores s where s.id = p_setor_id and s.empresa_id = p_empresa_id) then
    raise exception 'Importacao do 994: o setor nao e desta empresa.';
  end if;

  drop table if exists _n994;
  create temp table _n994 on commit drop as
    select x.operador_usuario, x.operador_id, x.codigo, x.nome_cliente,
           x.forma_pagamento, x.forma_detalhe, x.valor_recebido, x.data_pagamento
      from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(
             operador_usuario text, operador_id uuid, codigo text, nome_cliente text,
             forma_pagamento text, forma_detalhe text, valor_recebido numeric,
             data_pagamento date);

  -- O mês é um só. Linha de outro mês não entra (e é contada para a tela dizer).
  delete from _n994 where date_trunc('month', data_pagamento)::date is distinct from v_mes;
  get diagnostics v_fora_mes = row_count;

  if exists (select 1 from _n994
              where coalesce(operador_usuario, '') = '' or coalesce(codigo, '') = ''
                 or forma_pagamento is null or valor_recebido is null) then
    raise exception 'Importacao do 994: linha sem operador, codigo, forma ou valor.';
  end if;

  -- O app consolida por pessoa + NR + dia + forma (a chave do indice unico).
  if exists (select 1 from _n994
              group by operador_usuario, codigo, data_pagamento, forma_pagamento
             having count(*) > 1) then
    raise exception 'Importacao do 994: a mesma linha veio duas vezes no lote.';
  end if;

  v_ops := array(select distinct lower(operador_usuario) from _n994);
  -- Arquivo vazio não apaga ninguém.
  if cardinality(v_ops) = 0 then
    return jsonb_build_object('inseridas', 0, 'alteradas', 0, 'removidas', 0,
                              'ignoradas', 0, 'fora_do_mes', v_fora_mes, 'espelhos', 0,
                              'valor_antes', 0, 'valor_depois', 0);
  end if;

  select coalesce(sum(valor_recebido), 0) into v_antes
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes and setor_id = p_setor_id
     and lower(operador_usuario) = any(v_ops);

  -- ── 1. O que não está no arquivo sai ─────────────────────────────────────
  -- Inclusive a linha que o 59 gravou para a pessoa antes do 994 do mês: a
  -- partir daqui ela é lida só do 994.
  with saiu as (
    delete from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = v_mes
       and a.setor_id = p_setor_id
       and lower(a.operador_usuario) = any(v_ops)
       and a.procedencia is distinct from 'manual'
       and not exists (
         select 1 from _n994 n
          where n.operador_usuario = a.operador_usuario and n.codigo = a.codigo
            and n.data_pagamento = a.data_pagamento and n.forma_pagamento = a.forma_pagamento)
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

  -- ── 2. O que mudou: guardar a versão antiga e atualizar ──────────────────
  -- Tabulação e `visto` ficam, salvo troca de operador.
  drop table if exists _m994;
  create temp table _m994 on commit drop as
    select a.id, n.operador_id, n.nome_cliente, n.forma_detalhe, n.valor_recebido
      from analitico_recebimentos a
      join _n994 n
        on n.operador_usuario = a.operador_usuario and n.codigo = a.codigo
       and n.data_pagamento = a.data_pagamento and n.forma_pagamento = a.forma_pagamento
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = v_mes
       and a.setor_id = p_setor_id
       and a.procedencia is distinct from 'manual'
       and (a.operador_id, a.valor_recebido, a.forma_detalhe, a.procedencia, a.total_ho)
           is distinct from
           (n.operador_id, n.valor_recebido, n.forma_detalhe, 'relatorio_994'::text, 0::numeric);

  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select p_lote_id, a.empresa_id, a.setor_id, a.mes_referencia,
         a.codigo, a.operador_usuario, a.data_pagamento, a.valor_recebido,
         to_jsonb(a), auth.uid()
    from analitico_recebimentos a
    join _m994 m on m.id = a.id;

  update analitico_recebimentos a
     set operador_id              = m.operador_id,
         valor_recebido           = m.valor_recebido,
         total_ho                 = 0,
         nome_cliente             = coalesce(m.nome_cliente, a.nome_cliente),
         forma_detalhe            = m.forma_detalhe,
         procedencia              = 'relatorio_994',
         contribuicao_de_setor_id = null,
         pagamentos_detalhados    = null,
         status_tabulacao         = case when a.operador_id is distinct from m.operador_id
                                         then 'nao_tabulado' else a.status_tabulacao end,
         acordo_id                = case when a.operador_id is distinct from m.operador_id
                                         then null else a.acordo_id end,
         lote_id                  = p_lote_id,
         importado_por_id         = auth.uid()
    from _m994 m
   where a.id = m.id;
  get diagnostics v_alteradas = row_count;

  -- ── 3. O que é novo entra ────────────────────────────────────────────────
  -- A chave já ocupada FORA deste recorte (outro setor, correção manual) não
  -- é tomada: a linha é contada como ignorada.
  select count(*) into v_ignoradas
    from _n994 n
   where exists (
     select 1 from analitico_recebimentos a
      where a.empresa_id = p_empresa_id
        and a.operador_usuario = n.operador_usuario and a.codigo = n.codigo
        and a.data_pagamento = n.data_pagamento and a.forma_pagamento = n.forma_pagamento
        and not (a.setor_id = p_setor_id and a.mes_referencia = v_mes
                 and a.procedencia is distinct from 'manual'));

  insert into analitico_recebimentos (
    empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
    forma_pagamento, forma_detalhe, valor_recebido, total_ho,
    data_pagamento, mes_referencia, setor_id, status_tabulacao, visto,
    procedencia, lote_id, importado_por_id, importado_em)
  select p_empresa_id, n.operador_id, n.operador_usuario, n.codigo, n.nome_cliente,
         n.forma_pagamento, n.forma_detalhe, n.valor_recebido, 0,
         n.data_pagamento, v_mes, p_setor_id, 'nao_tabulado', false,
         'relatorio_994', p_lote_id, auth.uid(), now()
    from _n994 n
  on conflict (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario) do nothing;
  get diagnostics v_inseridas = row_count;

  v_espelhos := public.fn_analitico_994_marcar_espelhos(p_empresa_id, v_mes);

  select coalesce(sum(valor_recebido), 0) into v_depois
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes and setor_id = p_setor_id
     and lower(operador_usuario) = any(v_ops);

  return jsonb_build_object(
    'inseridas',    v_inseridas,
    'alteradas',    v_alteradas,
    'removidas',    v_removidas,
    'ignoradas',    v_ignoradas,
    'fora_do_mes',  v_fora_mes,
    'espelhos',     v_espelhos,
    'valor_antes',  v_antes,
    'valor_depois', v_depois);
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_analitico_994_substituir(uuid, uuid, date, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_994_substituir(uuid, uuid, date, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.fn_analitico_994_substituir(uuid, uuid, date, uuid, jsonb) IS
  'Importa o 994: troca o mes de quem veio no arquivo, no setor dado, pelo arquivo inteiro '
  '(com copia em analitico_removidos). Nao toca correcao manual. Exige importar_analitico_retencao. '
  'Migration 20261028150000.';

-- ── 3. A sincronização do 59 deixa o dono do 994 em paz ─────────────────────

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

  -- O dono do 994 (20261028150000): no setor/mês em que a pessoa tem linha do
  -- 994, ela é lida só dele. O 59 não grava, não altera e não apaga nada dela.
  drop table if exists _sync_dono994;
  create temp table _sync_dono994 on commit drop as
    select distinct a.setor_id, lower(a.operador_usuario) as operador_usuario
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id in (select setor_id from _sync_alvo)
       and a.procedencia = 'relatorio_994';

  -- A projecao, uma vez so. A view agrupa o analitico inteiro.
  drop table if exists _sync_59;
  create temp table _sync_59 on commit drop as
    select v.operador_id, v.operador_usuario, v.codigo, v.nome_cliente,
           v.forma_pagamento, v.forma_detalhe, v.valor_recebido,
           v.data_pagamento, v.setor_id, v.tipo_comissao, v.instituicao
      from vw_mestre_projecao_analitico v
     where v.empresa_id = p_empresa_id and v.mes = p_mes
       and v.setor_id in (select setor_id from _sync_alvo)
       and not exists (
         select 1 from _sync_dono994 d
          where d.setor_id = v.setor_id and d.operador_usuario = lower(v.operador_usuario));

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
       -- Quem é do 994 neste setor/mês não sai pelo 59.
       and not exists (
         select 1 from _sync_dono994 d
          where d.setor_id = a.setor_id and d.operador_usuario = lower(a.operador_usuario))
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
       and not exists (
         select 1 from _sync_dono994 d
          where d.setor_id = a.setor_id and d.operador_usuario = lower(a.operador_usuario))
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
  -- Linha do 994 em outro setor não é tomada pelo 59.
  where analitico_recebimentos.procedencia <> 'relatorio_994'
    and (analitico_recebimentos.setor_id, analitico_recebimentos.operador_id,
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
       and not exists (
         select 1 from _sync_dono994 d
          where d.setor_id = a.setor_id and d.operador_usuario = lower(a.operador_usuario))
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
  where analitico_recebimentos.procedencia <> 'relatorio_994'
    and (analitico_recebimentos.setor_id, analitico_recebimentos.valor_recebido,
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

  -- O 59 pode ter trazido ou tirado o extra que o 994 espelha.
  perform public.fn_analitico_994_marcar_espelhos(p_empresa_id, p_mes);

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

-- ── 4. O dashboard leva a marca do espelho ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_analitico_dashboard_mes_json(p_empresa_id uuid, p_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_eu         uuid := (select auth.uid());
  v_escopo     integer;
  v_setores    uuid[] := array[]::uuid[];
  v_operadores uuid[] := array[]::uuid[];
  v_todas      boolean;
  v_inicio     date := (p_mes || '-01')::date;
  v_fim        date := (date_trunc('month', (p_mes || '-01')::date)
                        + interval '1 month' - interval '1 day')::date;
  v_out        jsonb;
  -- Mês fechado: quem estava no alcance NAQUELE mês (20261001110000).
  v_retrato    uuid[];
  -- Escrito UMA vez. Se divergir entre os ramos, o dashboard passa a mostrar
  -- número diferente conforme quem olha — o pior defeito possível aqui.
  --
  -- Dollar quoting (`$q$`), e não aspas simples: assim o corpo é copiado do
  -- original sem dobrar nenhuma aspa, e não depende da concatenação implícita
  -- de literais adjacentes, que só funciona por causa da quebra de linha.
  v_corpo constant text := $q$
    select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select
        ar.data_pagamento               as dia,
        ar.operador_id,
        coalesce(ar.setor_id, imp.setor_id) as setor_id,
        ar.forma_pagamento,
        ar.forma_detalhe,
        ar.status_tabulacao,
        (ar.procedencia = 'contribuicao_59') as contribuicao,
        ar.contribuicao_de_setor_id,
        ar.espelho_extra,
        sum(ar.valor_recebido)::numeric as total,
        sum(ar.total_ho)::numeric       as total_ho,
        count(*)::bigint                as qtd
      from public.analitico_recebimentos ar
      left join public.perfis imp on imp.id = ar.importado_por_id
      where ar.empresa_id = $1
        and ar.data_pagamento between $2 and $3
  $q$;
  v_fecho constant text := $q$
      group by ar.data_pagamento, ar.operador_id,
               coalesce(ar.setor_id, imp.setor_id),
               ar.forma_pagamento, ar.forma_detalhe, ar.status_tabulacao,
               (ar.procedencia = 'contribuicao_59'), ar.contribuicao_de_setor_id,
               ar.espelho_extra
    ) t
  $q$;
begin
  if not public.fn_can_access_empresa(p_empresa_id) then
    return '[]'::jsonb;
  end if;

  v_escopo := public.fn_user_escopo_analitico();

  -- ── Quem entra no recorte ────────────────────────────────────────────────
  if v_escopo = 2 then
    v_setores := array(select public.fn_setores_do_operador(v_eu));
    v_operadores := array(
      select p.id
        from public.perfis p
       where p.empresa_id = p_empresa_id
         and (
           p.setor_id = any(v_setores)
           or exists (
             select 1 from public.fn_equipes_do_operador(p.id) eq
              where eq.setor_id = any(v_setores)
           )
         )
    );
    v_retrato := public.fn_retrato_pessoas_do_alcance(p_empresa_id, p_mes, '{}', v_setores);

  elsif v_escopo = 1 then
    -- Estas duas são constantes na consulta inteira. Ficavam DENTRO de
    -- `fn_operador_no_meu_alcance_de_equipe`, recalculadas por linha de
    -- `perfis` — 432 vezes cada. Ver o cabeçalho.
    v_todas := public.fn_user_tem('dashboard_escopo_equipe_todas');

    if v_todas then
      v_setores := array(select public.fn_setores_do_operador(v_eu));
      v_operadores := array(
        select p.id
          from public.perfis p
         where p.empresa_id = p_empresa_id
           and exists (
             select 1 from public.fn_equipes_do_operador(p.id) eq
              where eq.setor_id = any(v_setores)
           )
      );
      -- Mês fechado: as equipes que o retrato põe nesses setores — o recorte
      -- aqui é por EQUIPE, como no ramo vivo logo acima.
      v_retrato := public.fn_retrato_pessoas_do_alcance(
        p_empresa_id, p_mes,
        array(select ce.equipe_id from public.composicao_mes_equipe ce
               where ce.empresa_id = p_empresa_id and ce.mes = p_mes
                 and ce.setor_id = any(v_setores)),
        '{}');
      -- O escopo de equipe credita pela EQUIPE, não pelo setor: o recorte por
      -- setor não vale aqui, e `v_setores` foi só o insumo do alcance.
      v_setores := array[]::uuid[];
    else
      -- «Só a minha»: todo mundo que ESTÁ nas equipes por onde eu respondo —
      -- membro, líder ou clone — e eu mesmo (20260929120000). Olhar só o
      -- `perfis.equipe_id` de quem recebeu deixava de fora o líder da equipe,
      -- que não tem esse campo.
      v_operadores := array(
        select public.fn_pessoas_das_equipes(
                 array(select public.fn_equipes_de_alcance(v_eu)))
        union
        select v_eu
      );
      v_retrato := public.fn_retrato_pessoas_do_alcance(
        p_empresa_id, p_mes, array(select public.fn_equipes_de_alcance(v_eu)), '{}');
    end if;
  end if;

  -- Mês fechado com retrato: quem estava no alcance naquele mês; quem não
  -- está no retrato fica pelo cadastro de hoje.
  if v_retrato is not null then
    v_operadores := v_retrato
      || array(
           select o from unnest(v_operadores) as o
            where not exists (
              select 1 from public.composicao_mes cm
               where cm.empresa_id = p_empresa_id and cm.mes = p_mes and cm.operador_id = o));
  end if;

  -- ── Um plano por escopo ──────────────────────────────────────────────────
  if v_escopo >= 3 then
    -- A empresa toda: nada a recortar.
    execute v_corpo || v_fecho
       into v_out
      using p_empresa_id, v_inicio, v_fim;

  elsif v_escopo >= 1 then
    -- Alcance de equipe/setor, mais as próprias linhas.
    execute v_corpo || $q$
        and (ar.operador_id = $4
          or ar.operador_id = any($5)
          or coalesce(ar.setor_id, imp.setor_id) = any($6))
    $q$ || v_fecho
       into v_out
      using p_empresa_id, v_inicio, v_fim, v_eu, v_operadores, v_setores;

  else
    -- Só o próprio. Vai direto em `idx_analitico_empresa_op_data`: era aqui
    -- que 358 dos 432 perfis liam o mês inteiro da empresa.
    execute v_corpo || $q$
        and ar.operador_id = $4
    $q$ || v_fecho
       into v_out
      using p_empresa_id, v_inicio, v_fim, v_eu;
  end if;

  return coalesce(v_out, '[]'::jsonb);
end;
$function$;

commit;
