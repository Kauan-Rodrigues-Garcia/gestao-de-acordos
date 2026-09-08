-- ═══════════════════════════════════════════════════════════════════════════
-- Índice duplicado em equipe_lideres, e search_path fixo em três funções
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dois apontamentos dos advisors do Supabase, ambos de higiene e nenhum
-- tocando linha de dado.
--
-- ## 1. `duplicate_index` em equipe_lideres
--
-- `idx_equipe_lideres_lider` vem da baseline (20260813225412) e
-- `equipe_lideres_lider_id_idx` foi criado depois pela 20260903290000. Aquela
-- migration usou `CREATE INDEX IF NOT EXISTS`, que protege contra o mesmo
-- NOME e não contra o mesmo ÍNDICE sob outro nome — os dois são btree em
-- `(lider_id)`, mesma coluna e mesmo método.
--
-- Fica o da baseline: é o mais antigo e segue a convenção `idx_*` do projeto.
-- Índice duplicado cobra escrita em todo INSERT e UPDATE da tabela e não
-- devolve nada em leitura.
--
-- ## 2. `function_search_path_mutable` em três funções
--
-- As três são SECURITY INVOKER e PURAS — não tocam tabela nenhuma:
--
--   fn_pp_ho_percentual()               retorna a constante 0,2496
--   fn_mestre_e_equipe(text)            comparação de string
--   fn_mestre_conta_na_meta(bool, date) comparação de data
--
-- Por isso `''` e não `'public'`, que é o valor mais comum no resto do
-- schema: elas não resolvem NADA de schema algum, e o vazio é o mais restrito
-- que existe. `pg_catalog` continua implícito, que é de onde saem `upper()` e
-- o tipo `date`.
--
-- Reversível: `ALTER FUNCTION ... RESET search_path` e um `CREATE INDEX`
-- devolvem o estado anterior.

DROP INDEX IF EXISTS public.equipe_lideres_lider_id_idx;

ALTER FUNCTION public.fn_mestre_conta_na_meta(p_colchao boolean, p_dt date) SET search_path = '';
ALTER FUNCTION public.fn_mestre_e_equipe(p_nome text) SET search_path = '';
ALTER FUNCTION public.fn_pp_ho_percentual() SET search_path = '';

-- ── Verificação ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_idx INT;
  v_sem INT;
BEGIN
  SELECT count(*) INTO v_idx
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'equipe_lideres_lider_id_idx';
  IF v_idx > 0 THEN
    RAISE EXCEPTION 'o indice duplicado continua de pe';
  END IF;

  -- O que FICA tem que continuar existindo: derrubar os dois seria pior que
  -- não ter mexido.
  IF to_regclass('public.idx_equipe_lideres_lider') IS NULL THEN
    RAISE EXCEPTION 'o indice que devia ficar sumiu';
  END IF;

  SELECT count(*) INTO v_sem
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('fn_mestre_e_equipe','fn_mestre_conta_na_meta','fn_pp_ho_percentual')
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%');
  IF v_sem > 0 THEN
    RAISE EXCEPTION '% funcao(oes) continuam sem search_path', v_sem;
  END IF;
END;
$$;
