-- ============================================================================
-- Nucleo de Inteligencia e Gestao — o cargo Assistente ADM
-- ============================================================================
--
-- ## O que muda
--
-- O Nucleo deixa de usar os cargos da cobranca. Ate aqui quem trabalhava la era
-- operador, lider ou gerencia, e o sistema tentou separar o Nucleo pelo SETOR:
-- o recorte `nucleo` do menu e das rotas, e a concessao das tres chaves do
-- modulo a seis cargos em 11/09/2026. Os cargos da cobranca nao se encaixam no
-- Nucleo, e a separacao passa a ser pelo CARGO: `assistente_adm`.
--
-- Esta migration faz a parte que nao trava ninguem:
--
--   1. o cargo entra no CHECK de `perfis.perfil`;
--   2. o catalogo: as chaves do Nucleo e do Meus Chips passam a nascer no
--      `assistente_adm`, e nasce `chat_cargo_assistente_adm`;
--   3. os seis cargos da cobranca devolvem as tres chaves do Nucleo;
--   4. cada empresa ganha a linha `assistente_adm` em `cargos_permissoes`, a
--      semeadura de empresa nova passa a cria-la, e a chave de chat nova e
--      semeada nos cargos que ja existem;
--   5. `fn_numeros_setor_nucleo`, para a tela de usuarios saber qual setor e o
--      Nucleo.
--
-- A trava — "Assistente ADM so no Nucleo, e o Nucleo so aceita Assistente ADM"
-- — vem em `..._assistente_adm_trava`, DEPOIS da conversao de quem ja esta no
-- setor (`supabase/sql_scripts/assistente_adm_converter_nucleo_20260911.sql`).
-- Antes dela, o proprio banco estaria em violacao.
--
-- ## Por que o painel, e nao o nome do cargo
--
-- A RLS e as RPCs do modulo nao mudam: continuam exigindo "setor do Nucleo +
-- chave". Com as chaves so no `assistente_adm`, isso vira "Assistente ADM do
-- Nucleo" sem escrever nome de cargo em policy — a regra de 23/08/2026, de que
-- o painel de permissoes e a autoridade unica.
--
-- ## O que o Assistente ADM NAO recebe
--
-- Acordos, Analitico, Pix, Painel Lider, Lixeira: nada disso e trabalho do
-- Nucleo. Nem lancar, relancar ou devolver no Meus Chips — sao os passos dos
-- setores que recebem numero, e `fn_numeros_manda_no_setor` recusaria fora do
-- setor da pessoa. O administrador liga o que quiser no painel.
--
-- O chat segue a regra dos outros cargos: as chaves `chat_cargo_*` ligadas, e o
-- interruptor `ver_chat` como esta para todo mundo.
--
-- ## Reaplicavel
--
-- O CHECK e recriado por nome; o INSERT e a semeadura so tocam o que falta; o
-- UPDATE da cobranca so toca linha que ainda tem chave do Nucleo ligada. O
-- `RENAME` do catalogo e o unico passo que nao se repete — como em
-- 20260910165333.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── 1. O cargo ──────────────────────────────────────────────────────────────

DO $cargo$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.perfis'::REGCLASS AND conname = 'perfis_perfil_check'
  ) THEN
    ALTER TABLE public.perfis DROP CONSTRAINT perfis_perfil_check;
  END IF;

  ALTER TABLE public.perfis ADD CONSTRAINT perfis_perfil_check
    CHECK (perfil = ANY (ARRAY[
      'operador', 'lider', 'administrador', 'super_admin',
      'elite', 'gerencia', 'diretoria', 'ouvidoria', 'rh', 'assistente_adm'
    ]));
END
$cargo$;

-- ── 2. O catalogo ───────────────────────────────────────────────────────────
--
-- Por acumulacao, como 20260910165333. A diferenca: esta versao REDEFINE chaves
-- que ja existem — as cinco do Nucleo e do Meus Chips, e as nove de chat —, entao
-- elas saem da versao anterior pelo `NOT IN` e voltam com o padrao novo.
--
-- `permissoes-catalogo.sql.test.ts` le as definicoes em ordem de migration e
-- fica com a ULTIMA de cada chave, que e a que o banco devolve.

ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_assistente_adm_20260911;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT c.* FROM public.fn_permissoes_catalogo_antes_assistente_adm_20260911() c
   WHERE c.chave NOT IN (
     'ver_dashboard',
     'ver_controle_numeros', 'numeros_administrar', 'numeros_liberar_ao_setor',
     'ver_meus_chips', 'chips_escopo_setor',
     'chat_cargo_operador', 'chat_cargo_lider', 'chat_cargo_elite',
     'chat_cargo_gerencia', 'chat_cargo_diretoria', 'chat_cargo_ouvidoria',
     'chat_cargo_rh', 'chat_cargo_administrador', 'chat_cargo_super_admin')
  UNION ALL
  SELECT * FROM (VALUES
    -- A porta de entrada: `/` exige `ver_dashboard`, e para o Assistente ADM ela
    -- desenha o painel do Nucleo. Sem ela, a tela inicial dele seria "aba nao
    -- liberada".
    ('ver_dashboard',             NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm']::TEXT[], false),
    -- O Nucleo: so o Assistente ADM nasce com elas.
    ('ver_controle_numeros',      ARRAY['bookplay']::TEXT[], ARRAY['assistente_adm']::TEXT[], false),
    ('numeros_administrar',       ARRAY['bookplay']::TEXT[], ARRAY['assistente_adm']::TEXT[], false),
    ('numeros_liberar_ao_setor',  ARRAY['bookplay']::TEXT[], ARRAY['assistente_adm']::TEXT[], false),
    -- Meus Chips: os setores como antes, mais o Assistente ADM, que acompanha a
    -- distribuicao inteira.
    ('ver_meus_chips',            ARRAY['bookplay']::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','assistente_adm']::TEXT[], false),
    ('chips_escopo_setor',        ARRAY['bookplay']::TEXT[], ARRAY['lider','elite','gerencia','diretoria','assistente_adm']::TEXT[], false),
    -- Chat: o cargo novo fala e e procurado como os outros.
    ('chat_cargo_operador',       NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm']::TEXT[], false),
    ('chat_cargo_lider',          NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm']::TEXT[], false),
    ('chat_cargo_elite',          NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm']::TEXT[], false),
    ('chat_cargo_gerencia',       NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm']::TEXT[], false),
    ('chat_cargo_diretoria',      NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm']::TEXT[], false),
    ('chat_cargo_ouvidoria',      NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm']::TEXT[], false),
    ('chat_cargo_rh',             NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm']::TEXT[], false),
    ('chat_cargo_administrador',  NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm']::TEXT[], false),
    ('chat_cargo_super_admin',    NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm']::TEXT[], false),
    ('chat_cargo_assistente_adm', NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao 20260911 da ao cargo '
  'assistente_adm as chaves do Nucleo e do chat, sem perder o catalogo anterior. '
  'Espelha src/lib/permissoes-catalogo.ts; o teste de contrato quebra a CI '
  'se os dois lados divergirem.';

-- ── 3. Os cargos da cobranca devolvem as chaves do Nucleo ────────────────────
--
-- Desfaz a concessao de 11/09/2026. So toca a linha que ainda tem alguma das
-- tres ligada: quem ja estava desligado nao ganha `atualizado_em` novo a toa.

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
         'ver_controle_numeros',     false,
         'numeros_administrar',      false,
         'numeros_liberar_ao_setor', false),
       atualizado_em = NOW()
 WHERE cp.cargo IN ('operador', 'ouvidoria', 'lider', 'elite', 'gerencia', 'diretoria')
   AND (COALESCE((cp.permissoes->>'ver_controle_numeros')::BOOLEAN, FALSE)
     OR COALESCE((cp.permissoes->>'numeros_administrar')::BOOLEAN, FALSE)
     OR COALESCE((cp.permissoes->>'numeros_liberar_ao_setor')::BOOLEAN, FALSE));

-- ── 4. A linha do cargo em cada empresa, e a semeadura ──────────────────────

-- As empresas que ja existem, com o padrao do catalogo — o mesmo passo que o
-- cargo `rh` teve em 20260823200000.
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes)
SELECT
  e.id,
  'assistente_adm',
  COALESCE(
    (SELECT jsonb_object_agg(c.chave, 'assistente_adm' = ANY(c.padrao))
       FROM public.fn_permissoes_catalogo() c
      WHERE c.tenants IS NULL OR e.slug = ANY(c.tenants)),
    '{}'::JSONB)
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM public.cargos_permissoes cp
   WHERE cp.empresa_id = e.id AND cp.cargo = 'assistente_adm'
);

-- A chave de chat nova, nos cargos que ja existem. Sem isto a ausencia vale
-- NEGADO, e ninguem conseguiria iniciar conversa com um Assistente ADM.
UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
         'chat_cargo_assistente_adm',
         cp.cargo IN ('administrador', 'super_admin')
           OR cp.cargo = ANY(ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria','rh','assistente_adm'])),
       atualizado_em = NOW()
 WHERE NOT (cp.permissoes ? 'chat_cargo_assistente_adm');

-- Empresa NOVA: a mesma funcao de 20260815164659, com o cargo na lista.
CREATE OR REPLACE FUNCTION public.fn_permissoes_semear_empresa(p_empresa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slug    TEXT;
  v_cargo   TEXT;
  v_mapa    JSONB;
  v_atual   JSONB;
  r         RECORD;
  v_total   INTEGER := 0;
BEGIN
  SELECT slug INTO v_slug FROM public.empresas WHERE id = p_empresa_id;

  FOREACH v_cargo IN ARRAY ARRAY[
    'operador','ouvidoria','lider','elite','gerencia','diretoria',
    'assistente_adm',
    'administrador','super_admin'
  ] LOOP
    SELECT COALESCE(permissoes, '{}'::jsonb) INTO v_atual
      FROM public.cargos_permissoes
     WHERE empresa_id = p_empresa_id AND cargo = v_cargo;
    v_atual := COALESCE(v_atual, '{}'::jsonb);

    v_mapa := '{}'::jsonb;

    FOR r IN
      SELECT c.chave, c.tenants, c.padrao, c.explicita
        FROM public.fn_permissoes_catalogo() c
    LOOP
      -- Permissão de outra operação não entra: um toggle de Ouvidoria na
      -- BookPlay controlaria um módulo que não existe lá.
      CONTINUE WHEN r.tenants IS NOT NULL
                AND (v_slug IS NULL OR NOT (v_slug = ANY(r.tenants)));

      v_mapa := v_mapa || jsonb_build_object(
        r.chave,
        CASE
          -- Acesso total por construção (20260812b) — menos o que exige
          -- concessão nominal, que cai nas regras de baixo como qualquer cargo.
          WHEN v_cargo IN ('administrador','super_admin') AND NOT r.explicita
            THEN true
          -- Valor já gravado manda. É o que preserva a configuração que o
          -- administrador ajustou na tela, inclusive uma chave explícita que ele
          -- tenha concedido de propósito.
          WHEN v_atual ? r.chave
            THEN (v_atual -> r.chave)::boolean
          -- Chave nova (ou empresa nova) nasce no padrão do catálogo, e não
          -- negada.
          ELSE (v_cargo = ANY(COALESCE(r.padrao, ARRAY[]::TEXT[])))
        END
      );
    END LOOP;

    INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes)
    VALUES (p_empresa_id, v_cargo, v_mapa)
    ON CONFLICT (empresa_id, cargo) DO UPDATE SET permissoes = EXCLUDED.permissoes;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

-- ── 5. Qual setor e o Nucleo, para quem cadastra gente ──────────────────────
--
-- A tela de usuarios precisa saber qual setor e o Nucleo para oferecer so o
-- Assistente ADM ali, e so ali. `numeros_config` tem RLS — le quem e do Nucleo,
-- quem tem `numeros_configurar` e o super_admin —, e o administrador comum que
-- cadastra gente nao esta em nenhum dos tres.
--
-- Abrir a policy entregaria a linha inteira. Esta funcao entrega so o id do
-- setor, que ja aparece para qualquer um na lista de setores da empresa: o que
-- ela acrescenta e saber QUAL deles e o Nucleo, e isso nao e segredo.

CREATE OR REPLACE FUNCTION public.fn_numeros_setor_nucleo(p_empresa_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.setor_nucleo_id
    FROM public.numeros_config c
   WHERE c.empresa_id = p_empresa_id
     AND public.fn_can_access_empresa(p_empresa_id);
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_setor_nucleo(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_numeros_setor_nucleo(UUID) TO authenticated;

-- ── 6. Prova ────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_faltando INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.perfis'::REGCLASS
       AND conname = 'perfis_perfil_check'
       AND pg_get_constraintdef(oid) LIKE '%assistente_adm%'
  ) THEN
    RAISE EXCEPTION 'O cargo assistente_adm nao entrou no CHECK de perfis.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'chat_cargo_assistente_adm'
  ) THEN
    RAISE EXCEPTION 'chat_cargo_assistente_adm ausente do catalogo.';
  END IF;

  -- A redefinicao nao pode duplicar chave: o NOT IN e o VALUES tem de casar.
  IF EXISTS (
    SELECT 1 FROM public.fn_permissoes_catalogo() GROUP BY chave HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'O catalogo ficou com chave repetida.';
  END IF;

  SELECT COUNT(*) INTO v_faltando
    FROM public.empresas e
   WHERE NOT EXISTS (
     SELECT 1 FROM public.cargos_permissoes cp
      WHERE cp.empresa_id = e.id AND cp.cargo = 'assistente_adm');
  IF v_faltando > 0 THEN
    RAISE EXCEPTION '% empresa(s) sem a linha assistente_adm.', v_faltando;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp
     WHERE cp.cargo IN ('operador', 'ouvidoria', 'lider', 'elite', 'gerencia', 'diretoria')
       AND (COALESCE((cp.permissoes->>'ver_controle_numeros')::BOOLEAN, FALSE)
         OR COALESCE((cp.permissoes->>'numeros_administrar')::BOOLEAN, FALSE)
         OR COALESCE((cp.permissoes->>'numeros_liberar_ao_setor')::BOOLEAN, FALSE))
  ) THEN
    RAISE EXCEPTION 'Algum cargo da cobranca continua com chave do Nucleo.';
  END IF;
END
$prova$;

COMMIT;
