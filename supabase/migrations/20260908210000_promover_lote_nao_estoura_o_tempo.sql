-- ═══════════════════════════════════════════════════════════════════════════
-- Promover o lote do 59 para de estourar o tempo quando SUBSTITUI outro
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que acontecia
--
-- `fn_mestre_promover_lote` funcionou nas duas primeiras cargas — agosto
-- (50.934 linhas, 04/09 15:32) e setembro (9.211 linhas, 04/09 21:34) — e
-- passou a devolver 500 em 08/09/2026, em três tentativas seguidas. O log do
-- Postgres diz o que a resposta HTTP não dizia:
--
--     canceling statement due to statement timeout
--
-- O role `authenticated` roda com `statement_timeout = 8s`.
--
-- ## Por que só agora
--
-- Porque as duas primeiras cargas foram as PRIMEIRAS do mês delas: `v_anterior`
-- era NULL e os trechos caros nem chegaram a rodar. A promoção de 08/09 foi a
-- primeira que de fato SUBSTITUIU um lote vigente — e é aí que a função faz o
-- trabalho pesado:
--
--   • dois `insert ... select ... not exists` cruzando o lote novo (13.307
--     linhas) com o anterior (9.211), por `cod_grupo_filtro` e por
--     `subgrupo_equipe`;
--   • `delete from mestre_recebimentos where lote_id = v_anterior`.
--
-- O caminho de substituição nunca tinha sido exercitado. Ele existe desde a
-- 20260904100000 e só foi ao ar quatro dias depois.
--
-- ## Duas causas, dois consertos
--
-- **1. Faltava índice.** `mestre_recebimentos` só tinha `btree (lote_id)`. Os
-- `not exists` filtram por `lote_id` E por `cod_grupo_filtro`/`subgrupo_equipe`,
-- então cada sonda varria todas as linhas do lote para achar uma. Com 121.796
-- linhas na tabela — as duas vigentes mais 61.651 de lotes presos —, isso
-- sozinho já passava dos 8 segundos.
--
-- **2. 8s é pouco para esta operação, com ou sem índice.** Promover um retrato
-- de dezenas de milhares de linhas não é uma leitura de tela; é uma carga. O
-- teto do role está certo para o resto do sistema e errado para ela.
--
-- `SET statement_timeout` no corpo da função vale só enquanto ela executa e
-- volta ao valor do role ao sair — não afrouxa nada fora daqui. Dois minutos é
-- folga larga sobre o pior caso medido, e continua sendo um teto: uma promoção
-- que passe disso está com outro problema e deve falhar mesmo.
--
-- ## O que este arquivo NÃO conserta
--
-- Os lotes já presos em «aberto». Eles ficaram porque o `catch` do cliente
-- chamava `.catch()` num `PostgrestFilterBuilder`, que não tem esse método — o
-- descarte quebrava antes de rodar. Isso é código, e foi corrigido em
-- `services/mestre/mestre.service.ts`. A limpeza das linhas que sobraram é
-- operação de dado, feita à parte e com autorização.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Os índices que as sondas de substituição pedem ──────────────────────
--
-- CONCURRENTLY não pode: a CLI roda migrations dentro de transação. A tabela é
-- de carga, escrita por uma pessoa por vez, e o bloqueio dura o tempo do build
-- do índice.

create index if not exists mestre_recebimentos_lote_grupo
  on public.mestre_recebimentos (lote_id, cod_grupo_filtro);

create index if not exists mestre_recebimentos_lote_equipe
  on public.mestre_recebimentos (lote_id, cod_grupo_filtro, subgrupo_equipe);

comment on index public.mestre_recebimentos_lote_grupo is
  'Sondas `not exists` de fn_mestre_promover_lote ao substituir um lote vigente.';
comment on index public.mestre_recebimentos_lote_equipe is
  'Idem, para as sondas por subgrupo de equipe.';

-- ── 2. O teto de tempo da promoção ─────────────────────────────────────────
--
-- `ALTER FUNCTION ... SET` acrescenta o parâmetro sem reescrever o corpo: a
-- lógica da 20260904100000 e das correções de 04/09 fica intacta, e este
-- arquivo não vira uma segunda cópia dela que amanhã diverge.

alter function public.fn_mestre_promover_lote(uuid)
  set statement_timeout = '120s';

-- `fn_mestre_congelar_operadores` roda por dentro da promoção, mas também é
-- chamável sozinha e faz um UPDATE sobre o lote inteiro. Mesmo teto, mesmo
-- motivo.
alter function public.fn_mestre_congelar_operadores(uuid)
  set statement_timeout = '120s';

-- ── 3. Verificação ─────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname='public' and indexname='mestre_recebimentos_lote_grupo'
  ) then
    raise exception 'indice mestre_recebimentos_lote_grupo nao foi criado';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname='public' and indexname='mestre_recebimentos_lote_equipe'
  ) then
    raise exception 'indice mestre_recebimentos_lote_equipe nao foi criado';
  end if;

  -- O teto tem que estar GRAVADO na função. Sem isto o conserto passaria a
  -- depender de o índice ser rápido o bastante, que é a aposta que falhou.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_mestre_promover_lote'
       and p.proconfig @> array['statement_timeout=120s']
  ) then
    raise exception 'fn_mestre_promover_lote ficou sem statement_timeout proprio';
  end if;
end;
$$;
