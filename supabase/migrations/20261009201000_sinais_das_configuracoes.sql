-- ============================================================================
-- Tempo real das configurações: Postgres Changes → sinal «mudou» (09/10/2026)
-- ============================================================================
--
-- Quedas de 09/10: a máquina sem memória (swap de ~1 GB) e o Postgres Changes
-- respondendo por 22,6% do tempo do banco, com 1.387 assinaturas abertas. Cada
-- mudança numa tabela publicada é conferida contra a RLS de CADA assinante.
--
-- Estas tabelas mudam poucas vezes por dia e quem ouve só relê a lista — não
-- usa a linha que chega. Passam para o sinal que o banco já manda para o
-- analítico, permissões, vendas, RH e diário (20260917110000): um Broadcast
-- por empresa, `<nome>:<empresa_id>`, evento `mudou`, autorizado UMA vez na
-- entrada do canal.
--
--   comemoracoes                                   → `comemoracoes`
--   desafios (vale também para as empresas da
--     campanha multiempresa, `desafios.empresas`)  → `desafios`
--   desafios_setores                               → `desafios`
--   direto_extra_config                            → `direto_extra`
--   comissao_config, comissao_config_usuarios,
--   comissao_bonus                                 → `comissao`
--   comissao_faixas, comissao_bonus_usuarios
--     (sem empresa_id: a do pai)                   → `comissao`
--
-- `perfis` sai da publicação: o único ouvinte era a foto do próprio perfil
-- no menu (Layout), que passa a reler ao voltar para a aba. As 215
-- assinaturas de `perfis` somem com isso.
--
-- `comemoracao_parabens` fica no Postgres Changes por enquanto: é o mural ao
-- vivo durante a festa, precisa da linha.
--
-- Ordem do deploy: esta migration ANTES do código. Aba antiga (sem recarregar)
-- deixa de receber atualização dessas tabelas até recarregar — nada se perde,
-- a próxima leitura traz tudo.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. Desafios: a dona e as empresas da campanha multiempresa ──────────────

CREATE OR REPLACE FUNCTION public.fn_realtime_sinal_desafios()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa uuid;
BEGIN
  IF tg_op = 'INSERT' THEN
    FOR v_empresa IN
      SELECT DISTINCT e FROM (
        SELECT n.empresa_id AS e FROM novas n
        UNION ALL
        SELECT unnest(n.empresas) FROM novas n
      ) x WHERE e IS NOT NULL
    LOOP
      PERFORM public.fn_realtime_sinal_emitir('desafios:' || v_empresa::text,
        jsonb_build_object('tabela', tg_table_name, 'operacao', tg_op, 'importado_por', '[]'::jsonb));
    END LOOP;
  ELSIF tg_op = 'UPDATE' THEN
    FOR v_empresa IN
      SELECT DISTINCT e FROM (
        SELECT n.empresa_id AS e FROM novas n
        UNION ALL SELECT unnest(n.empresas) FROM novas n
        UNION ALL SELECT a.empresa_id FROM antigas a
        UNION ALL SELECT unnest(a.empresas) FROM antigas a
      ) x WHERE e IS NOT NULL
    LOOP
      PERFORM public.fn_realtime_sinal_emitir('desafios:' || v_empresa::text,
        jsonb_build_object('tabela', tg_table_name, 'operacao', tg_op, 'importado_por', '[]'::jsonb));
    END LOOP;
  ELSE
    FOR v_empresa IN
      SELECT DISTINCT e FROM (
        SELECT a.empresa_id AS e FROM antigas a
        UNION ALL SELECT unnest(a.empresas) FROM antigas a
      ) x WHERE e IS NOT NULL
    LOOP
      PERFORM public.fn_realtime_sinal_emitir('desafios:' || v_empresa::text,
        jsonb_build_object('tabela', tg_table_name, 'operacao', tg_op, 'importado_por', '[]'::jsonb));
    END LOOP;
  END IF;
  RETURN NULL;
END;
$function$;

-- ── 2. Filhas da comissão: a empresa vem do pai ─────────────────────────────
--
-- `comissao_faixas.config_id` → comissao_config; `comissao_bonus_usuarios.
-- bonus_id` → comissao_bonus. Apagadas em cascata junto do pai, o pai já não
-- existe e a filha não acha a empresa — mas o DELETE do pai já mandou o sinal.

CREATE OR REPLACE FUNCTION public.fn_realtime_sinal_comissao_filhas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa uuid;
  v_pais    uuid[];
BEGIN
  IF tg_op = 'INSERT' THEN
    SELECT array_agg(DISTINCT (to_jsonb(n) ->> tg_argv[0])::uuid) INTO v_pais FROM novas n;
  ELSIF tg_op = 'UPDATE' THEN
    SELECT array_agg(DISTINCT p) INTO v_pais FROM (
      SELECT (to_jsonb(n) ->> tg_argv[0])::uuid AS p FROM novas n
      UNION ALL SELECT (to_jsonb(a) ->> tg_argv[0])::uuid FROM antigas a) x;
  ELSE
    SELECT array_agg(DISTINCT (to_jsonb(a) ->> tg_argv[0])::uuid) INTO v_pais FROM antigas a;
  END IF;

  FOR v_empresa IN
    SELECT DISTINCT c.empresa_id FROM public.comissao_config c
     WHERE tg_argv[0] = 'config_id' AND c.id = ANY (v_pais)
    UNION
    SELECT DISTINCT b.empresa_id FROM public.comissao_bonus b
     WHERE tg_argv[0] = 'bonus_id' AND b.id = ANY (v_pais)
  LOOP
    PERFORM public.fn_realtime_sinal_emitir('comissao:' || v_empresa::text,
      jsonb_build_object('tabela', tg_table_name, 'operacao', tg_op, 'importado_por', '[]'::jsonb));
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_realtime_sinal_desafios() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_realtime_sinal_comissao_filhas() FROM PUBLIC, anon, authenticated;

-- ── 3. Os gatilhos (um por COMANDO, como os do analítico) ───────────────────

DO $gatilhos$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('comemoracoes',             'public.fn_realtime_sinal_mudou(''comemoracoes'')'),
      ('desafios',                 'public.fn_realtime_sinal_desafios()'),
      ('desafios_setores',         'public.fn_realtime_sinal_mudou(''desafios'')'),
      ('direto_extra_config',      'public.fn_realtime_sinal_mudou(''direto_extra'')'),
      ('comissao_config',          'public.fn_realtime_sinal_mudou(''comissao'')'),
      ('comissao_config_usuarios', 'public.fn_realtime_sinal_mudou(''comissao'')'),
      ('comissao_bonus',           'public.fn_realtime_sinal_mudou(''comissao'')'),
      ('comissao_faixas',          'public.fn_realtime_sinal_comissao_filhas(''config_id'')'),
      ('comissao_bonus_usuarios',  'public.fn_realtime_sinal_comissao_filhas(''bonus_id'')')
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

-- ── 4. Quem pode ouvir: os tópicos novos entram na policy que já existe ─────
--
-- Mesma expressão de `pg_policies` em 09/10/2026, com os quatro nomes a mais.

ALTER POLICY sinal_mudou_receber ON realtime.messages
  USING (((extension = 'broadcast'::text)
    AND (split_part((SELECT realtime.topic()), ':'::text, 1) = ANY (ARRAY[
      'analitico'::text, 'permissoes'::text, 'vendas'::text, 'rh'::text, 'diario'::text,
      'comemoracoes'::text, 'desafios'::text, 'direto_extra'::text, 'comissao'::text]))
    AND (SELECT public.fn_realtime_posso_ouvir_empresa((SELECT realtime.topic())))));

-- ── 5. Fora da publicação: o Realtime deixa de ler essas mudanças ───────────

DO $publicacao$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'comemoracoes', 'desafios', 'desafios_setores', 'direto_extra_config',
    'comissao_config', 'comissao_faixas', 'comissao_config_usuarios',
    'comissao_bonus', 'comissao_bonus_usuarios', 'perfis'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$publicacao$;

-- ── 6. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF (SELECT count(*) FROM pg_trigger t
       WHERE NOT t.tgisinternal AND t.tgname LIKE 'trg_realtime_sinal_%'
         AND t.tgrelid::regclass::text IN ('comemoracoes', 'desafios', 'desafios_setores', 'direto_extra_config',
             'comissao_config', 'comissao_faixas', 'comissao_config_usuarios', 'comissao_bonus', 'comissao_bonus_usuarios')
     ) <> 27 THEN
    RAISE EXCEPTION 'Faltou gatilho de sinal (esperados 27).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
              AND tablename IN ('comemoracoes', 'desafios', 'desafios_setores', 'direto_extra_config', 'perfis',
                                'comissao_config', 'comissao_faixas', 'comissao_config_usuarios', 'comissao_bonus', 'comissao_bonus_usuarios')) THEN
    RAISE EXCEPTION 'Tabela migrada ainda está na publicação.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261009201000', 'sinais_das_configuracoes', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
