-- ─────────────────────────────────────────────────────────────────────────────
-- O gatilho do diário para de pagar a RLS de `perfis` por linha
--
-- ── O sintoma ────────────────────────────────────────────────────────────────
-- `canceling statement due to statement timeout` no INSERT em lote de
-- `diario_recebimentos` — 9 em 24 h, sempre 3 por importação, todo dia. Era o
-- único timeout que não caía na listagem de acordos, e o único que a correção
-- de 20260910131500 não tocou.
--
-- ── A medição ────────────────────────────────────────────────────────────────
-- `fn_diario_preencher_setor` roda BEFORE INSERT, por linha, e faz:
--
--     SELECT setor_id FROM public.perfis WHERE id = NEW.operador_id;
--
-- Uma busca por chave primária, que deveria custar nada. Medido em produção,
-- 200 buscas idênticas:
--
--     como quem importa (com RLS) ...... 28.069 ms  →  140 ms cada
--     como dono da tabela (sem RLS) ....      2,2 ms →    0,011 ms cada
--
-- Doze mil vezes mais cara. E o maior lote já importado tem 20.938 linhas.
--
-- ── De onde vem o custo ──────────────────────────────────────────────────────
-- Não é do scan: a EXPLAIN mostra `Index Scan using perfis_pkey`. O custo é
-- fixo, por CONSULTA, e vem dos InitPlans da policy `perfis_select`:
--
--     InitPlan 6  → 34,9 ms      as três são a MESMA função,
--     InitPlan 7  → 35,2 ms      `fn_user_escopo_perfis()`, que a policy
--     InitPlan 10 → 37,0 ms      compara três vezes (>= 3, = 2, = 1)
--
-- `fn_user_escopo_perfis()` percorre as 9 abas de `fn_abas_escopo()` e, em cada
-- uma, chama `fn_user_tem` até cinco vezes — ~45 chamadas, cada uma com quatro
-- buscas. O Postgres não deduplica InitPlans idênticos, então são ~105 ms de
-- pedágio em QUALQUER consulta que toque `perfis`.
--
-- Com `statement_timeout` de 8 s, qualquer lote acima de ~57 linhas estoura.
--
-- ── A correção ───────────────────────────────────────────────────────────────
-- `SECURITY DEFINER` no gatilho. Ele deixa de ser lido através da RLS e passa a
-- custar 0,011 ms por linha.
--
-- Não é só velocidade: hoje, quando quem importa NÃO enxerga o perfil do
-- operador, a busca volta vazia e o `setor_id` é gravado NULL **em silêncio** —
-- o recebimento entra sem setor e some das somas por setor. O mesmo tipo de
-- perda silenciosa que a escrita em `profissionais` já teve.
--
-- ── O que isso expõe ─────────────────────────────────────────────────────────
-- O gatilho passa a enxergar o `setor_id` de qualquer perfil da empresa. Quem
-- pode inserir no diário já é decidido pela RLS de `diario_recebimentos`, que
-- não muda aqui; o gatilho só preenche uma coluna derivada, e o mesmo dado já
-- sai de `fn_setores_do_operador`, que é `SECURITY DEFINER` desde sempre.
--
-- `SET search_path` explícito porque `SECURITY DEFINER` sem ele é o vetor
-- clássico de escalonamento: quem chama planta um schema no caminho e a função
-- executa código dele como dono.
--
-- ── Como voltar atrás ────────────────────────────────────────────────────────
--     ALTER FUNCTION public.fn_diario_preencher_setor() SECURITY INVOKER;
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_diario_preencher_setor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.setor_id := NULL;
  ELSIF NEW.operador_id IS DISTINCT FROM OLD.operador_id THEN
    NEW.setor_id := NULL;
  END IF;

  IF NEW.setor_id IS NULL THEN
    IF NEW.operador_id IS NOT NULL THEN
      SELECT setor_id INTO NEW.setor_id FROM public.perfis WHERE id = NEW.operador_id;
    END IF;
    IF NEW.setor_id IS NULL AND NEW.importado_por_id IS NOT NULL THEN
      SELECT setor_id INTO NEW.setor_id FROM public.perfis WHERE id = NEW.importado_por_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_diario_preencher_setor() IS
  'Preenche o setor do recebimento a partir do perfil do operador (ou de quem '
  'importou). SECURITY DEFINER: a leitura de perfis atraves da RLS custava '
  '140 ms POR LINHA e estourava o tempo do INSERT em lote — e devolvia setor '
  'NULL em silencio quando quem importa nao enxergava o operador.';
