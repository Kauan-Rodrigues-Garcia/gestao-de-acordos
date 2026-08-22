-- ============================================================================
-- Faxina das chaves aposentadas — fase 8
-- ============================================================================
--
-- ## O que sai
--
-- As cinco chaves globais de escopo que as fases 3b a 6a aposentaram do
-- catalogo, e cujos valores continuaram gravados em `cargos_permissoes` como
-- entradas orfas e inertes:
--
--   filtrar_por_setor, filtrar_por_equipe   (fase 3b)
--   ver_analiticos_global                   (fase 4)
--   ver_acordos_gerais                      (fase 5a)
--   ver_todos_setores                       (fase 6a)
--
-- Elas ficaram de proposito ate aqui: apagar dado de permissao no meio de uma
-- reestruturacao, para nao ganhar nada, nao se paga — e enquanto as derivacoes
-- ainda liam esses valores, apagar seria destruir a fonte da propria conversao.
-- Agora nenhuma migration futura precisa deles.
--
-- ## E um defeito latente que apareceu ao mexer nisto
--
-- `fn_super_admin_permissoes_completas()` — a funcao que a trigger de empresa
-- nova usa para semear a linha do `super_admin` — monta o mapa a partir de uma
-- lista de 26 chaves escrita a mao, que diz espelhar `src/pages/AdminCargos.tsx`.
-- Esse arquivo nao existe mais: a lista e de antes da reestruturacao de 15/08.
--
-- Pior que estar velha, ela une essa lista com TODAS as chaves ja presentes na
-- tabela e devolve `true` para cada uma. Inclusive `ignorar_fechamento_mes`,
-- que exige concessao explicita e que o catalogo TypeScript garante nascer
-- desligada. Ou seja: a proxima empresa criada teria um super_admin capaz de
-- escrever em mes fechado, sem ninguem decidir isso.
--
-- Nao havia como ver: o teste "nenhum cargo nasce podendo escrever em mes
-- fechado" cobre o lado TypeScript, e esta funcao e o lado SQL.
--
-- A funcao passa a ler `fn_permissoes_catalogo()`, que ja e a fonte unica dos
-- dois lados, e a respeitar a marca `explicita`.
--
-- ## O que NAO sai
--
-- `filtrar_por_usuario` fica. Ela tem consumidor (o seletor de pessoa em
-- Acordos) e nao e chave de escopo — governa um filtro, nao alcance. Renomea-la
-- para `acordos_filtrar_por_usuario` seria so trocar a ordem das palavras.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── Snapshot ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissoes_backup_20260822_faxina AS
SELECT now() AS copiado_em, c.* FROM public.cargos_permissoes c WITH NO DATA;

INSERT INTO public.permissoes_backup_20260822_faxina
SELECT now(), c.* FROM public.cargos_permissoes c
WHERE NOT EXISTS (SELECT 1 FROM public.permissoes_backup_20260822_faxina);

ALTER TABLE public.permissoes_backup_20260822_faxina ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.permissoes_backup_20260822_faxina FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.permissoes_backup_20260822_faxina IS
  'Snapshot de cargos_permissoes antes da fase 8 (remocao das chaves aposentadas).';

-- ── Guarda: so apaga o que ja saiu do catalogo ──────────────────────────────
-- Lista explicita, e nao "tudo que nao esta no catalogo": uma chave nova que
-- chegasse ao banco antes do catalogo seria apagada em silencio pela versao
-- generica. Aqui o que nao esta na lista sobrevive, e a prova no fim acusa.
DO $guarda$
DECLARE
  v_erro TEXT;
BEGIN
  SELECT string_agg(k, ', ')
    INTO v_erro
  FROM unnest(ARRAY[
    'filtrar_por_setor', 'filtrar_por_equipe',
    'ver_analiticos_global', 'ver_acordos_gerais', 'ver_todos_setores'
  ]) AS k
  WHERE k IN (SELECT chave FROM public.fn_permissoes_catalogo());

  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION
      'Estas chaves ainda estao no catalogo e nao podem ser apagadas: %', v_erro;
  END IF;
END
$guarda$;

-- ── Remocao ─────────────────────────────────────────────────────────────────
UPDATE public.cargos_permissoes
SET permissoes = permissoes
      - 'filtrar_por_setor'
      - 'filtrar_por_equipe'
      - 'ver_analiticos_global'
      - 'ver_acordos_gerais'
      - 'ver_todos_setores',
    atualizado_em = now()
WHERE permissoes ?| ARRAY[
  'filtrar_por_setor', 'filtrar_por_equipe',
  'ver_analiticos_global', 'ver_acordos_gerais', 'ver_todos_setores'
];

-- As mesmas chaves em excecoes por pessoa, se existirem.
UPDATE public.perfis_permissoes
SET permissoes = permissoes
      - 'filtrar_por_setor'
      - 'filtrar_por_equipe'
      - 'ver_analiticos_global'
      - 'ver_acordos_gerais'
      - 'ver_todos_setores'
WHERE permissoes ?| ARRAY[
  'filtrar_por_setor', 'filtrar_por_equipe',
  'ver_analiticos_global', 'ver_acordos_gerais', 'ver_todos_setores'
];

-- ── O seeder de empresa nova passa a ler o catalogo ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_super_admin_permissoes_completas()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  -- O catalogo e a fonte unica dos dois lados (TypeScript e SQL). A marca
  -- `explicita` fica DESLIGADA: acesso total nao concede o que precisa de
  -- concessao nominal — hoje, escrever em mes fechado.
  SELECT COALESCE(jsonb_object_agg(c.chave, NOT c.explicita), '{}'::jsonb)
    FROM public.fn_permissoes_catalogo() c;
$function$;

COMMENT ON FUNCTION public.fn_super_admin_permissoes_completas() IS
  'Mapa inicial do super_admin de uma empresa nova, montado a partir de '
  'fn_permissoes_catalogo(). Chaves de concessao explicita nascem desligadas. '
  'Antes da fase 8 vinha de uma lista de 26 chaves escrita a mao, anterior a '
  'reestruturacao de 15/08, e ligava tudo — inclusive ignorar_fechamento_mes.';

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
DECLARE
  v_erro TEXT;
BEGIN
  -- 1. Nenhuma chave gravada fora do catalogo, em cargo nenhum.
  SELECT string_agg(DISTINCT x.key, ', ')
    INTO v_erro
  FROM public.cargos_permissoes cp
  CROSS JOIN LATERAL jsonb_each_text(cp.permissoes) x
  WHERE x.key NOT IN (SELECT chave FROM public.fn_permissoes_catalogo());
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'Sobraram chaves fora do catalogo: %', v_erro;
  END IF;

  -- 2. Nenhuma chave do catalogo perdida: toda linha continua completa dentro
  --    do recorte da operacao dela.
  SELECT string_agg(e.slug || '/' || cp.cargo || ': ' || c.chave, ', ')
    INTO v_erro
  FROM public.cargos_permissoes cp
  JOIN public.empresas e ON e.id = cp.empresa_id
  CROSS JOIN public.fn_permissoes_catalogo() c
  WHERE (c.tenants IS NULL OR e.slug = ANY(c.tenants))
    AND NOT (cp.permissoes ? c.chave);
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'A faxina levou chave viva junto: %', v_erro;
  END IF;

  -- 3. O seeder nao nasce mais com a chave de mes fechado ligada.
  IF (public.fn_super_admin_permissoes_completas()->>'ignorar_fechamento_mes')::BOOLEAN
     IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION
      'O seeder do super_admin continua ligando ignorar_fechamento_mes.';
  END IF;

  -- 4. E entrega o catalogo inteiro, nem mais nem menos.
  SELECT string_agg(k, ', ')
    INTO v_erro
  FROM (
    SELECT chave AS k FROM public.fn_permissoes_catalogo()
    EXCEPT
    SELECT jsonb_object_keys(public.fn_super_admin_permissoes_completas())
    UNION
    SELECT jsonb_object_keys(public.fn_super_admin_permissoes_completas())
    EXCEPT
    SELECT chave FROM public.fn_permissoes_catalogo()
  ) d;
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION 'O seeder do super_admin divergiu do catalogo em: %', v_erro;
  END IF;

  -- 5. INVARIANTE: acesso total sem chave desligada fora das explicitas.
  SELECT string_agg(e.slug || '/' || cp.cargo || ': ' || x.key, ', ')
    INTO v_erro
  FROM public.cargos_permissoes cp
  JOIN public.empresas e ON e.id = cp.empresa_id
  CROSS JOIN LATERAL jsonb_each_text(cp.permissoes) x
  WHERE cp.cargo IN ('administrador', 'super_admin')
    AND x.value = 'false'
    AND x.key NOT IN (
      SELECT chave FROM public.fn_permissoes_catalogo() WHERE explicita
    );
  IF v_erro IS NOT NULL THEN
    RAISE EXCEPTION
      'Acesso total com chave desligada fora das de concessao explicita: %', v_erro;
  END IF;
END
$prova$;

COMMIT;
