-- ============================================================================
-- Tempo real sem Postgres Changes: as 15 tabelas que sobraram (13/10/2026)
-- ============================================================================
--
-- Memória da Small em 93% no expediente. `realtime.list_changes` — a sondagem
-- do Postgres Changes — era 28,8% do tempo do banco (654 mil chamadas em 5
-- dias, até 24 s cada). Ela roda enquanto existir UMA assinatura de tabela, e
-- lê o WAL inteiro, inclusive as gravações em massa do 59. Restavam 56
-- assinaturas em 10 tabelas; com estas trocas, zero.
--
-- Dois jeitos de avisar, conforme o que a tela precisa:
--
-- 1. SINAL COM FILA (`fn_realtime_sinal_mudou`, 20260917110000/20261005200000)
--    — o primeiro aviso sai na hora; os seguintes, dentro de 10 s, juntam-se e
--    saem pelo `realtime-despachar` (15 s). Para listas que só são relidas:
--
--      autorizacoes_pedidos                         → `autorizacoes`
--      contribuicao_receptivo                       → `contribuicao`
--      numeros_celulares, numeros_whatsapp,
--      numeros_config, numeros_lixeira              → `numeros`
--      analitico_ajustes_manuais                    → `ajustes`
--
-- 2. AVISO COM OS IDS, DIRETO (`fn_realtime_avisar_ids`, novo) — sem fila: é
--    conversa e mural, o atraso aparece. Mesmo desenho de acordos
--    (20261009220000): o payload leva só operação, tabela e ids — nenhum
--    conteúdo —, e a tela relê o que é dela com a RLS de sempre.
--
--      solicitacoes_whatsapp (id), _mensagens e
--        _leitura (solicitacao_id)                  → `solicitacoes`
--      tickets (id), tickets_mensagens e
--        tickets_eventos (ticket_id; empresa do pai) → `tickets`
--      comemoracao_parabens (comemoracao_id;
--        empresa do pai)                            → `parabens`
--
--    `autores` vai junto (autor da mensagem, quem leu, quem parabenizou): é o
--    que deixa a tela ignorar o eco do próprio envio sem reler.
--
-- `nr_registros` sai sem substituto: o único ouvinte era o cache de conflitos
-- do cadastro inline, que carregava os ~10,7 mil NRs da empresa (0,7 s) a cada
-- abertura — e a gravação já confere o NR no banco (`verificarNrRegistro`).
--
-- Ordem do deploy: esta migration ANTES do código. Aba antiga (sem recarregar)
-- deixa de receber essas mudanças ao vivo até recarregar; nada se perde.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. O aviso com os ids ───────────────────────────────────────────────────
--
-- Argumentos do gatilho:
--   [0] prefixo do tópico
--   [1] coluna cujo valor vai em `ids` (o pedido, o ticket, a comemoração)
--   [2] tabela pai de onde vem a empresa, '' = a própria linha tem empresa_id
--   [3] coluna do autor, '' = sem autor

CREATE OR REPLACE FUNCTION public.fn_realtime_avisar_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_prefixo CONSTANT text    := tg_argv[0];
  v_coluna  CONSTANT text    := tg_argv[1];
  v_pai     CONSTANT text    := tg_argv[2];
  v_autor   CONSTANT text    := tg_argv[3];
  c_teto    CONSTANT integer := 200;
  v_linhas  jsonb;
  v_alvos   uuid[];
  v_mapa    jsonb := '{}'::jsonb;
  r         record;
BEGIN
  IF tg_op = 'INSERT' THEN
    SELECT jsonb_agg(to_jsonb(n)) INTO v_linhas FROM novas n;
  ELSIF tg_op = 'UPDATE' THEN
    SELECT jsonb_agg(x) INTO v_linhas FROM (
      SELECT to_jsonb(n) AS x FROM novas n
      UNION ALL
      SELECT to_jsonb(a) FROM antigas a) t;
  ELSE
    SELECT jsonb_agg(to_jsonb(a)) INTO v_linhas FROM antigas a;
  END IF;

  IF v_linhas IS NULL THEN
    RETURN NULL;
  END IF;

  -- Filha sem empresa_id: a empresa vem do pai. Pai já apagado (cascata) não
  -- acha empresa — e o DELETE do pai já mandou o aviso dele.
  IF v_pai <> '' THEN
    SELECT array_agg(DISTINCT (l ->> v_coluna)::uuid) INTO v_alvos
      FROM jsonb_array_elements(v_linhas) l
     WHERE l ->> v_coluna IS NOT NULL;
    EXECUTE format(
      'SELECT coalesce(jsonb_object_agg(p.id::text, p.empresa_id::text), ''{}''::jsonb)
         FROM public.%I p WHERE p.id = ANY ($1)', v_pai)
      INTO v_mapa USING v_alvos;
  END IF;

  FOR r IN
    SELECT u.empresa,
           jsonb_agg(DISTINCT to_jsonb(u.alvo)) AS ids,
           coalesce(jsonb_agg(DISTINCT to_jsonb(u.autor)) FILTER (WHERE u.autor IS NOT NULL), '[]'::jsonb) AS autores
      FROM (
        SELECT coalesce(l ->> 'empresa_id', v_mapa ->> (l ->> v_coluna)) AS empresa,
               l ->> v_coluna AS alvo,
               CASE WHEN v_autor <> '' THEN l ->> v_autor END AS autor
          FROM jsonb_array_elements(v_linhas) l
      ) u
     WHERE u.empresa IS NOT NULL AND u.alvo IS NOT NULL
     GROUP BY u.empresa
  LOOP
    PERFORM realtime.send(
      CASE WHEN jsonb_array_length(r.ids) > c_teto
           THEN jsonb_build_object('tabela', tg_table_name, 'operacao', tg_op, 'recarregar', true)
           ELSE jsonb_build_object('tabela', tg_table_name, 'operacao', tg_op,
                                   'ids', r.ids, 'autores', r.autores) END,
      'mudou', v_prefixo || ':' || r.empresa, true);
  END LOOP;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_realtime_avisar_ids() FROM PUBLIC, anon, authenticated;

-- ── 2. Os gatilhos (um por COMANDO) ─────────────────────────────────────────

DO $gatilhos$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('autorizacoes_pedidos',            'public.fn_realtime_sinal_mudou(''autorizacoes'')'),
      ('contribuicao_receptivo',          'public.fn_realtime_sinal_mudou(''contribuicao'')'),
      ('numeros_celulares',               'public.fn_realtime_sinal_mudou(''numeros'')'),
      ('numeros_whatsapp',                'public.fn_realtime_sinal_mudou(''numeros'')'),
      ('numeros_config',                  'public.fn_realtime_sinal_mudou(''numeros'')'),
      ('numeros_lixeira',                 'public.fn_realtime_sinal_mudou(''numeros'')'),
      ('analitico_ajustes_manuais',       'public.fn_realtime_sinal_mudou(''ajustes'')'),
      ('solicitacoes_whatsapp',           'public.fn_realtime_avisar_ids(''solicitacoes'', ''id'', '''', '''')'),
      ('solicitacoes_whatsapp_mensagens', 'public.fn_realtime_avisar_ids(''solicitacoes'', ''solicitacao_id'', '''', ''autor_id'')'),
      ('solicitacoes_whatsapp_leitura',   'public.fn_realtime_avisar_ids(''solicitacoes'', ''solicitacao_id'', '''', ''usuario_id'')'),
      ('tickets',                         'public.fn_realtime_avisar_ids(''tickets'', ''id'', '''', '''')'),
      ('tickets_mensagens',               'public.fn_realtime_avisar_ids(''tickets'', ''ticket_id'', ''tickets'', ''autor_id'')'),
      ('tickets_eventos',                 'public.fn_realtime_avisar_ids(''tickets'', ''ticket_id'', ''tickets'', ''autor_id'')'),
      ('comemoracao_parabens',            'public.fn_realtime_avisar_ids(''parabens'', ''comemoracao_id'', ''comemoracoes'', ''usuario_id'')')
    ) AS t(tabela, funcao)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_realtime_sinal_ins ON public.%I', r.tabela);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_realtime_sinal_upd ON public.%I', r.tabela);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_realtime_sinal_del ON public.%I', r.tabela);
    EXECUTE format('CREATE TRIGGER trg_realtime_sinal_ins AFTER INSERT ON public.%I '
                   'REFERENCING NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION %s', r.tabela, r.funcao);
    EXECUTE format('CREATE TRIGGER trg_realtime_sinal_upd AFTER UPDATE ON public.%I '
                   'REFERENCING OLD TABLE AS antigas NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION %s', r.tabela, r.funcao);
    EXECUTE format('CREATE TRIGGER trg_realtime_sinal_del AFTER DELETE ON public.%I '
                   'REFERENCING OLD TABLE AS antigas FOR EACH STATEMENT EXECUTE FUNCTION %s', r.tabela, r.funcao);
  END LOOP;
END;
$gatilhos$;

-- ── 3. Quem pode ouvir: os nomes novos entram na policy que já existe ───────
--
-- Mesma expressão de `pg_policies` em 13/10/2026, com os sete nomes a mais.

ALTER POLICY sinal_mudou_receber ON realtime.messages
  USING (((extension = 'broadcast'::text)
    AND (split_part((SELECT realtime.topic()), ':'::text, 1) = ANY (ARRAY[
      'analitico'::text, 'permissoes'::text, 'vendas'::text, 'rh'::text, 'diario'::text,
      'comemoracoes'::text, 'desafios'::text, 'direto_extra'::text, 'comissao'::text,
      'autorizacoes'::text, 'contribuicao'::text, 'numeros'::text, 'ajustes'::text,
      'solicitacoes'::text, 'tickets'::text, 'parabens'::text]))
    AND (SELECT public.fn_realtime_posso_ouvir_empresa((SELECT realtime.topic())))));

-- ── 4. A publicação fica vazia: o Postgres Changes para de sondar ───────────

DO $publicacao$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  LOOP
    EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
  END LOOP;
END;
$publicacao$;

-- ── 5. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF (SELECT count(*) FROM pg_trigger t
       WHERE NOT t.tgisinternal AND t.tgname LIKE 'trg_realtime_sinal_%'
         AND t.tgrelid::regclass::text IN (
           'autorizacoes_pedidos', 'contribuicao_receptivo', 'numeros_celulares', 'numeros_whatsapp',
           'numeros_config', 'numeros_lixeira', 'analitico_ajustes_manuais', 'solicitacoes_whatsapp',
           'solicitacoes_whatsapp_mensagens', 'solicitacoes_whatsapp_leitura', 'tickets',
           'tickets_mensagens', 'tickets_eventos', 'comemoracao_parabens')
     ) <> 42 THEN
    RAISE EXCEPTION 'Faltou gatilho de aviso (esperados 42).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'A publicação supabase_realtime ainda tem tabela.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261013170000', 'realtime_sem_postgres_changes', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
