-- ============================================================================
-- Banco de Horas: liberado para os líderes (19/11/2026)
-- ============================================================================
--
-- Autorização do Cleber, 19/11/2026: a aba sai da trava de super_admin e vai
-- para todos os líderes, cada um vendo o banco de horas do próprio setor.
--
-- PRÉ-REQUISITO: a 20261118200000 (regra dos cargos) aplicada. Ela cria o
-- interruptor `fn_banco_horas_liberado()` e a regra `fn_banco_horas_cargo_passa()`
-- que as três portas leem. Sem ela, este script para no começo sem mexer em nada.
--
-- O que faz:
--
--   1. `fn_banco_horas_liberado()` passa a devolver TRUE. Com isso
--      `fn_banco_horas_cargo_passa()` deixa entrar líder, gerência, diretoria e
--      administrador — operador e os demais cargos continuam fora de vez.
--   2. No mapa do cargo `lider` da BookPlay, liga `ver_banco_horas` (abre a aba)
--      e `banco_horas_escopo_setor` (vê os setores do DP ligados ao seu setor).
--      «Todos os setores» e «importar e ligar setores» continuam desligados.
--   3. Nos mapas próprios de setor do cargo `lider` (cargos_permissoes_setor,
--      «Líder - Manutenção»), as duas chaves também ficam ligadas onde o mapa do
--      setor as tem — senão a chave do setor, desligada, mandaria por cima.
--
-- Gerência e diretoria NÃO são ligadas aqui: passam pela regra do cargo, mas a
-- chave delas continua desligada no painel até alguém ligar.
--
-- ⚠️ O líder só enxerga dado quando o setor do DP está ligado ao setor dele
-- («Ligar setores», banco_horas_mapa). A conferência no fim avisa quantos
-- setores do DP do último relatório ainda estão sem vínculo.
--
-- O lado do app é `BANCO_HORAS_LIBERADO = true` (src/lib/bancoHoras/liberacao.ts).
-- Rodar ESTE SQL antes do deploy do app: ao contrário, o líder vê a aba vazia
-- até o SQL rodar (não vaza nada, só fica vazia).
--
-- Não apaga dado. Pode rodar de novo.
--
-- Voltar a travar: `fn_banco_horas_liberado()` devolvendo FALSE e
-- `BANCO_HORAS_LIBERADO = false` no app (as chaves podem ficar: sem o
-- interruptor, elas não abrem nada).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

-- ── 0. A 20261118200000 precisa estar aplicada ──────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.fn_banco_horas_cargo_passa()') IS NULL
     OR to_regprocedure('public.fn_banco_horas_liberado()') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar antes a 20261118200000_banco_de_horas_cargos.sql (fn_banco_horas_cargo_passa / fn_banco_horas_liberado).';
  END IF;
  IF pg_get_functiondef('public.fn_banco_horas_alcanca(uuid,text,text)'::regprocedure) NOT LIKE '%fn_banco_horas_cargo_passa%'
     OR pg_get_functiondef('public.fn_banco_horas_pode_gerenciar(uuid)'::regprocedure) NOT LIKE '%fn_banco_horas_cargo_passa%' THEN
    RAISE EXCEPTION 'As portas do Banco de Horas ainda estao na trava antiga (so super_admin). Aplicar antes a 20261118200000.';
  END IF;
END $$;

-- ── 1. O interruptor ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_banco_horas_liberado()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$ SELECT TRUE $function$;

COMMENT ON FUNCTION public.fn_banco_horas_liberado() IS
  'Banco de Horas liberado? TRUE desde 19/11/2026 (20261119140000): lider, gerencia, diretoria '
  'e administrador passam pela regra do cargo. Travar de novo = devolver FALSE e '
  'BANCO_HORAS_LIBERADO = false no app.';

-- ── 2. O mapa do cargo lider (BookPlay) ─────────────────────────────────────

UPDATE public.cargos_permissoes cp
   SET permissoes = COALESCE(cp.permissoes, '{}'::jsonb)
                    || jsonb_build_object('ver_banco_horas', true, 'banco_horas_escopo_setor', true),
       atualizado_em = NOW()
  FROM public.empresas e
 WHERE e.id = cp.empresa_id
   AND e.slug = 'bookplay'
   AND cp.cargo = 'lider'
   AND (   COALESCE((cp.permissoes->>'ver_banco_horas')::BOOLEAN, false) = false
        OR COALESCE((cp.permissoes->>'banco_horas_escopo_setor')::BOOLEAN, false) = false);

-- ── 3. Mapas próprios de setor do lider ─────────────────────────────────────
--
-- Só as chaves que o mapa do setor já tem: a que ele não tem vem do cargo,
-- que acabou de ser ligado acima.

UPDATE public.cargos_permissoes_setor cps
   SET permissoes = cps.permissoes
                    || (CASE WHEN cps.permissoes ? 'ver_banco_horas'
                             THEN jsonb_build_object('ver_banco_horas', true) ELSE '{}'::jsonb END)
                    || (CASE WHEN cps.permissoes ? 'banco_horas_escopo_setor'
                             THEN jsonb_build_object('banco_horas_escopo_setor', true) ELSE '{}'::jsonb END),
       atualizado_em = NOW()
  FROM public.empresas e
 WHERE e.id = cps.empresa_id
   AND e.slug = 'bookplay'
   AND cps.cargo = 'lider'
   AND (   (cps.permissoes ? 'ver_banco_horas'
            AND COALESCE((cps.permissoes->>'ver_banco_horas')::BOOLEAN, false) = false)
        OR (cps.permissoes ? 'banco_horas_escopo_setor'
            AND COALESCE((cps.permissoes->>'banco_horas_escopo_setor')::BOOLEAN, false) = false));

-- ── 4. Prova e avisos ───────────────────────────────────────────────────────

DO $verificacao$
DECLARE
  v_sem_vinculo INTEGER;
  v_total       INTEGER;
BEGIN
  IF NOT public.fn_banco_horas_liberado() THEN
    RAISE EXCEPTION 'O interruptor do Banco de Horas nao virou.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp JOIN public.empresas e ON e.id = cp.empresa_id
     WHERE e.slug = 'bookplay' AND cp.cargo = 'lider'
  ) THEN
    RAISE EXCEPTION 'Nao ha mapa do cargo lider na BookPlay.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp JOIN public.empresas e ON e.id = cp.empresa_id
     WHERE e.slug = 'bookplay' AND cp.cargo = 'lider'
       AND NOT (COALESCE((cp.permissoes->>'ver_banco_horas')::BOOLEAN, false)
                AND COALESCE((cp.permissoes->>'banco_horas_escopo_setor')::BOOLEAN, false))
  ) OR EXISTS (
    SELECT 1 FROM public.cargos_permissoes_setor cps JOIN public.empresas e ON e.id = cps.empresa_id
     WHERE e.slug = 'bookplay' AND cps.cargo = 'lider'
       AND (   cps.permissoes->>'ver_banco_horas' = 'false'
            OR cps.permissoes->>'banco_horas_escopo_setor' = 'false')
  ) THEN
    RAISE EXCEPTION 'Algum mapa de lider da BookPlay ficou sem ver_banco_horas ou banco_horas_escopo_setor.';
  END IF;

  -- Operador continua fora: a regra do cargo nao mudou.
  IF pg_get_functiondef('public.fn_banco_horas_cargo_passa()'::regprocedure) LIKE '%''operador''%' THEN
    RAISE EXCEPTION 'A regra do cargo do Banco de Horas deixa o operador entrar.';
  END IF;

  -- Setores do DP do último relatório sem vínculo: o líder deles não vê nada.
  SELECT count(*) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM public.banco_horas_mapa m
            WHERE m.empresa_id = b.empresa_id AND m.empresa_codigo = b.empresa_codigo
              AND m.setor_dp = b.setor_dp)),
         count(*)
    INTO v_sem_vinculo, v_total
    FROM public.banco_horas_setores b
   WHERE b.saldo_em = (SELECT max(saldo_em) FROM public.banco_horas_setores);

  RAISE NOTICE 'Banco de Horas liberado para os lideres. Setores do DP no ultimo relatorio: %; sem vinculo a setor do gestao: %.',
    v_total, v_sem_vinculo;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261119140000', 'banco_de_horas_liberar_lideres', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
--   select public.fn_banco_horas_liberado();
--   select cp.permissoes->>'ver_banco_horas', cp.permissoes->>'banco_horas_escopo_setor'
--     from cargos_permissoes cp join empresas e on e.id = cp.empresa_id
--    where e.slug = 'bookplay' and cp.cargo = 'lider';
--   select b.empresa_codigo, b.setor_dp
--     from banco_horas_setores b
--    where b.saldo_em = (select max(saldo_em) from banco_horas_setores)
--      and not exists (select 1 from banco_horas_mapa m
--                       where m.empresa_id = b.empresa_id and m.empresa_codigo = b.empresa_codigo
--                         and m.setor_dp = b.setor_dp);
