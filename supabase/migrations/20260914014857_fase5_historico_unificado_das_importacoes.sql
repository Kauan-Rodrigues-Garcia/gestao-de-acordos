-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 5, parte 1: o histórico das importações dos DOIS relatórios, junto
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Regra 7 do `docs/PLANO-SINCRONIZACAO-59.md`.
--
-- ## O plano dizia «criar tabela de lotes do 58». Não precisa.
--
-- O plano supunha que o histórico do 58 não existia, porque `lote_id` em
-- `analitico_recebimentos` é só um agrupador. Medido antes de construir:
--
--   logs_sistema, alvo_tipo = 'importacao_analitico'
--     importacao_concluida .... 1.416 eventos, 12/08 a 13/09/2026
--     importacao_falhou .......    34 eventos
--     linhas removidas somadas . 2.659
--
-- Cada evento já tem quem, quando, o arquivo, as contagens e os erros. É o
-- histórico completo do 58, e ele está ali desde agosto. Na BookPlay: 463
-- eventos, 26 pessoas importando, 12 falhas.
--
-- Reconstruir lotes a partir de `analitico_recebimentos` seria PIOR: mostraria
-- só o que sobreviveu, não o que aconteceu. Lote cujas linhas foram todas
-- substituídas depois ficaria invisível — justamente o caso que mais interessa
-- olhar.
--
-- ## O que continua faltando, e não é isto
--
-- O SNAPSHOT do que foi removido. Aquelas 2.659 linhas se foram: a importação
-- apaga e nada guarda. **Sem isso não há rollback do 58** — só histórico. É a
-- parte 2 da Fase 5, e ela precisa de tabela nova.
--
-- ## As duas fontes, e por que a forma difere
--
--   58 → `logs_sistema`. Evento por importação, um por setor, vários por dia.
--   59 → `mestre_lotes`. Lote por arquivo, do mês inteiro, com estado
--        (aberto/vigente/substituído) — o 59 já nasceu com versionamento.
--
-- Não dá para forçar as duas na mesma forma sem mentir sobre uma delas. O que
-- esta função faz é pô-las na mesma LINHA DO TEMPO, com as colunas que as duas
-- respondem, e um campo `origem` dizendo de qual lado cada linha veio.
--
-- ## Escrita: nenhuma
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_importacoes_historico(
  p_empresa_id uuid,
  p_mes        text    default null,
  p_origem     text    default null,
  p_limite     integer default 200
)
returns table(
  origem        text,
  evento_id     text,
  quando        timestamptz,
  quem_id       uuid,
  quem          text,
  setor_id      uuid,
  setor_nome    text,
  mes           text,
  arquivo       text,
  linhas        integer,
  inseridos     integer,
  atualizados   integer,
  removidos     integer,
  valor         numeric,
  estado        text,
  deu_errado    boolean,
  descricao     text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with do58 as (
    select
      '58'::text as origem,
      lg.id::text as evento_id,
      lg.criado_em as quando,
      lg.usuario_id as quem_id,
      coalesce(lg.usuario_nome, '—') as quem,
      nullif(lg.detalhes->>'setor_importacao_id', '')::uuid as setor_id,
      -- O mes vem do array `meses`. Importacao de mais de um mes e rara e
      -- aparece pelo primeiro: a linha do tempo e por evento, nao por mes.
      substr(coalesce(lg.detalhes->'meses'->>0, ''), 1, 7) as mes,
      lg.alvo_rotulo as arquivo,
      coalesce((lg.detalhes->>'linhas_no_arquivo')::int, 0) as linhas,
      coalesce((lg.detalhes->>'inseridos')::int, 0)   as inseridos,
      coalesce((lg.detalhes->>'atualizados')::int, 0) as atualizados,
      coalesce((lg.detalhes->>'removidos')::int, 0)   as removidos,
      null::numeric as valor,
      case when lg.acao = 'importacao_falhou' then 'falhou' else 'concluida' end as estado,
      (lg.acao = 'importacao_falhou') as deu_errado,
      lg.descricao
    from logs_sistema lg
    where lg.empresa_id = p_empresa_id
      and lg.alvo_tipo = 'importacao_analitico'
  ),
  do59 as (
    select
      '59'::text as origem,
      ml.id::text as evento_id,
      coalesce(ml.promovido_em, ml.importado_em) as quando,
      ml.importado_por_id as quem_id,
      coalesce(pf.nome, '—') as quem,
      null::uuid as setor_id,   -- o 59 e do mes inteiro, nao de um setor
      to_char(ml.mes, 'YYYY-MM') as mes,
      ml.arquivo_nome as arquivo,
      coalesce(ml.linhas, 0) as linhas,
      null::int as inseridos,
      null::int as atualizados,
      null::int as removidos,
      ml.total_recebido as valor,
      ml.estado,
      (ml.estado = 'descartado') as deu_errado,
      case ml.estado
        when 'vigente'     then 'Lote vigente do mes'
        when 'substituido' then 'Substituido por um lote mais novo'
        when 'aberto'      then 'Importado e ainda nao promovido'
        else 'Descartado'
      end as descricao
    from mestre_lotes ml
    left join perfis pf on pf.id = ml.importado_por_id
    where ml.empresa_id = p_empresa_id
  ),
  tudo as (select * from do58 union all select * from do59)
  select t.origem, t.evento_id, t.quando, t.quem_id, t.quem,
         t.setor_id,
         coalesce(cms.nome, s.nome) as setor_nome,
         t.mes, t.arquivo, t.linhas, t.inseridos, t.atualizados, t.removidos,
         t.valor, t.estado, t.deu_errado, t.descricao
    from tudo t
    left join setores s on s.id = t.setor_id
    left join composicao_mes_setor cms
      on cms.empresa_id = p_empresa_id and cms.mes = t.mes and cms.setor_id = t.setor_id
   where (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
     and (p_mes    is null or t.mes = p_mes)
     and (p_origem is null or t.origem = p_origem)
   order by t.quando desc
   limit greatest(coalesce(p_limite, 200), 1);
$function$;

comment on function public.fn_importacoes_historico(uuid, text, text, integer) is
  'Linha do tempo das importacoes dos dois relatorios: o 58 vem de logs_sistema '
  '(1.416 eventos desde 12/08/2026) e o 59 de mestre_lotes. Nao cria estrutura '
  'nova de proposito — reconstruir lotes a partir dos recebimentos mostraria so '
  'o que sobreviveu, nao o que aconteceu. So leitura.';

grant execute on function public.fn_importacoes_historico(uuid, text, text, integer) to authenticated;

commit;
