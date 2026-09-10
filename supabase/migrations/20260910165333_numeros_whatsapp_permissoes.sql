-- ============================================================================
-- Controle de Numeros de WhatsApp — permissoes e ponto de partida
-- ============================================================================
--
-- Esta e a terceira e ultima migration do modulo. As duas anteriores criaram as
-- tabelas (20260910190000) e o fluxo com a RLS (20260910191000). Ate aqui o
-- modulo existe e nao abre para ninguem: as chaves nao existiam, e chave ausente
-- vale NEGADO.
--
-- ## As dez chaves
--
-- Todas com `tenants = ARRAY['bookplay']`: o setor "Nucleo de Inteligencia e
-- Gestao" so existe na BOOKPLAY, e uma chave que aparece no painel de uma
-- operacao que nao tem o modulo e um interruptor que liga e nao faz nada.
--
--   ver_controle_numeros ........ a aba do Nucleo
--   numeros_administrar ......... cadastrar celular e numero, alterar situacao
--   numeros_liberar_ao_setor .... disponibilizar ao setor dono
--   numeros_configurar .......... apontar QUAL setor e o Nucleo  [EXPLICITA]
--   ver_meus_chips .............. a aba do setor
--   chips_escopo_individual ..... o operador ve o que foi lancado a ele
--   chips_escopo_setor .......... a lideranca ve o setor inteiro
--   chips_lancar_ao_operador .... distribuir dentro do setor
--   chips_relancar_ao_nucleo .... devolver ao Nucleo, com motivo
--   chips_devolver_a_lideranca .. o operador solta o numero
--
-- ## Por que as quatro chaves do Nucleo nascem DESLIGADAS
--
-- Elas nascem em `ninguem`, e nao e esquecimento. O acesso ao modulo e do
-- SETOR, e cargo nao distingue setor: semear `numeros_administrar` em
-- `operador` daria a chave a todo operador de toda a empresa. O administrador
-- concede nominalmente a quem e do Nucleo, por pessoa ou por cargo.
--
-- A RLS ja cobre o outro lado: mesmo com a chave ligada, quem nao esta no setor
-- configurado nao enxerga nada. Sao duas fechaduras, e as duas precisam abrir.
--
-- ## `numeros_configurar` exige concessao NOMINAL
--
-- Ela entra com `explicita = true`, ao lado de `ignorar_fechamento_mes` e
-- `rh_reabrir_fechamento`. Quem muda `numeros_config` decide qual setor manda no
-- modulo inteiro — apontar para outro setor entregaria a ele todos os numeros de
-- todos os setores. E escalonamento de privilegio, e o acesso total do
-- administrador nao deve concede-lo por heranca.
--
-- ## O catalogo cresce por ACUMULACAO
--
-- `fn_permissoes_catalogo()` e renomeada e a nova versao le a antiga com
-- `UNION ALL`. E o padrao que 20260903210000, 20260903500000 e 20260906120000
-- ja usam. Reescrever a lista inteira aqui significaria copiar ~140 chaves e
-- torcer para nao errar nenhuma.
--
-- ## A aba `chips` entra no registro de escopo
--
-- `fn_abas_escopo()` ganha `('chips', 'ver_meus_chips')`. Sem isso
-- `fn_user_escopo('chips')` devolve -1 para sempre (aba desconhecida) e a
-- lideranca nunca enxergaria o setor.
--
-- A aba do NUCLEO nao entra: ela nao tem escada. Quem e do Nucleo ve a empresa
-- inteira por ser do Nucleo, e quem nao e nao ve nada por ali. Registrar niveis
-- que ninguem consulta criaria os toggles decorativos que este projeto passou
-- 2026-08-15 inteiro removendo.
--
-- O registro tem quatro niveis possiveis e a aba usa dois (`individual` e
-- `setor`). O bloco de prova de 20260823020000 emite NOTICE para os dois que
-- faltam — e esperado, e o RH faz igual.
--
-- ## O ponto de partida
--
-- `numeros_config` recebe a linha da BOOKPLAY apontando o setor, procurado por
-- NOME e so quando ele existe. Este script roda em todas as empresas; criar
-- setor aqui inventaria cadastro que ninguem pediu. Empresa sem o setor recebe
-- `RAISE NOTICE` e segue sem configuracao — e, sem configuracao, ninguem e do
-- Nucleo ali.
--
-- Isto e ponto de PARTIDA, nao regra: daqui em diante, trocar o setor do Nucleo
-- e edicao de tela com `numeros_configurar`, nao migration.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── 1. O catalogo ───────────────────────────────────────────────────────────

ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_numeros_20260910;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_numeros_20260910()
  UNION ALL
  SELECT * FROM (VALUES
    ('ver_controle_numeros',       ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('numeros_administrar',        ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('numeros_liberar_ao_setor',   ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('numeros_configurar',         ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], true),
    ('ver_meus_chips',             ARRAY['bookplay']::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[], false),
    ('chips_escopo_individual',    ARRAY['bookplay']::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[], false),
    ('chips_escopo_setor',         ARRAY['bookplay']::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('chips_lancar_ao_operador',   ARRAY['bookplay']::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('chips_relancar_ao_nucleo',   ARRAY['bookplay']::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('chips_devolver_a_lideranca', ARRAY['bookplay']::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo de permissoes. A extensao 20260910 acrescenta as dez '
  'chaves do Controle de Numeros de WhatsApp, sem perder o catalogo anterior. '
  'Espelha src/lib/permissoes-catalogo.ts; o teste de contrato quebra a CI '
  'se os dois lados divergirem.';

-- ── 2. A aba `chips` no registro de escopo ──────────────────────────────────
--
-- As nove entradas anteriores sao repetidas na integra: `fn_abas_escopo` e
-- redefinida por inteiro desde 20260827190000, e nao acumulada como o catalogo.

CREATE OR REPLACE FUNCTION public.fn_abas_escopo()
RETURNS TABLE(aba TEXT, chave_aba TEXT)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  VALUES
    ('dashboard',        'ver_dashboard'),
    ('acordos',          'ver_acordos'),
    ('lixeira',          'ver_lixeira'),
    ('pix',              'ver_pix_automatico'),
    ('painel_lider',     'ver_painel_lider'),
    ('painel_diretoria', 'ver_painel_diretoria'),
    ('analitico',        'ver_analitico'),
    ('usuarios',         'ver_usuarios'),
    ('rh',               'ver_rh_gestao'),
    ('chips',            'ver_meus_chips');
$function$;

COMMENT ON FUNCTION public.fn_abas_escopo() IS
  'Registro de abas com escopo. `chips` entrou em 20260910 com dois niveis '
  '(individual e setor); a aba do Nucleo nao tem escada e nao entra aqui.';

-- ── 3. Semeadura nos cargos que ja existem ──────────────────────────────────
--
-- `fn_permissoes_catalogo` semeia empresa NOVA. As que ja existem precisam das
-- chaves acrescentadas aqui, com o mesmo padrao — senao a ausencia vale NEGADO
-- e o modulo nasce invisivel ate alguem descobrir por que.
--
-- O `WHERE NOT (cp.permissoes ? v_chave.chave)` e o que torna esta migration
-- reaplicavel: linha que ja tem a chave nao e tocada, entao configuracao feita
-- a mao nao regride.

DO $semear$
DECLARE
  v_chave RECORD;
  v_total INTEGER := 0;
  v_linhas INTEGER;
BEGIN
  FOR v_chave IN
    SELECT chave, padrao, explicita
      FROM public.fn_permissoes_catalogo()
     WHERE chave IN (
       'ver_controle_numeros', 'numeros_administrar', 'numeros_liberar_ao_setor',
       'numeros_configurar', 'ver_meus_chips', 'chips_escopo_individual',
       'chips_escopo_setor', 'chips_lancar_ao_operador',
       'chips_relancar_ao_nucleo', 'chips_devolver_a_lideranca')
  LOOP
    UPDATE public.cargos_permissoes cp
       SET permissoes = cp.permissoes || jsonb_build_object(
             v_chave.chave,
             CASE
               -- Acesso total recebe tudo, menos o que exige concessao nominal.
               WHEN cp.cargo IN ('administrador', 'super_admin')
                 THEN NOT v_chave.explicita
               ELSE cp.cargo = ANY(v_chave.padrao)
             END),
           atualizado_em = NOW()
     WHERE NOT (cp.permissoes ? v_chave.chave);

    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    v_total := v_total + v_linhas;
  END LOOP;

  RAISE NOTICE 'Controle de Numeros — % atualizacoes de linha em cargos_permissoes.', v_total;
END
$semear$;

-- ── 4. Ponto de partida: qual setor e o Nucleo ──────────────────────────────

DO $partida$
DECLARE
  v_emp   RECORD;
  v_setor UUID;
BEGIN
  FOR v_emp IN SELECT id, nome FROM public.empresas LOOP
    SELECT s.id INTO v_setor
      FROM public.setores s
     WHERE s.empresa_id = v_emp.id
       AND s.nome = 'Núcleo de Inteligência e Gestão';

    IF v_setor IS NULL THEN
      -- Nao e erro: o setor existe numa operacao so. Mas quem aplica precisa ver.
      RAISE NOTICE
        'Controle de Numeros — % nao tem o setor Nucleo de Inteligencia e Gestao. '
        'Nada foi criado, e ninguem sera Nucleo nesta empresa.', v_emp.nome;
      CONTINUE;
    END IF;

    INSERT INTO public.numeros_config (empresa_id, setor_nucleo_id)
    VALUES (v_emp.id, v_setor)
    ON CONFLICT (empresa_id) DO NOTHING;

    RAISE NOTICE 'Controle de Numeros — % aponta o Nucleo para %.', v_emp.nome, v_setor;
  END LOOP;
END
$partida$;

-- ── 5. Prova ────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_faltando TEXT;
BEGIN
  -- As dez chaves existem no catalogo?
  SELECT string_agg(c, ', ') INTO v_faltando
    FROM unnest(ARRAY[
      'ver_controle_numeros', 'numeros_administrar', 'numeros_liberar_ao_setor',
      'numeros_configurar', 'ver_meus_chips', 'chips_escopo_individual',
      'chips_escopo_setor', 'chips_lancar_ao_operador',
      'chips_relancar_ao_nucleo', 'chips_devolver_a_lideranca']) AS c
   WHERE c NOT IN (SELECT chave FROM public.fn_permissoes_catalogo());

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves do Controle de Numeros ausentes no catalogo: %', v_faltando;
  END IF;

  -- A aba aponta para chave que existe?
  IF NOT EXISTS (
    SELECT 1 FROM public.fn_abas_escopo() a
     WHERE a.aba = 'chips'
       AND a.chave_aba IN (SELECT chave FROM public.fn_permissoes_catalogo())
  ) THEN
    RAISE EXCEPTION 'A aba chips aponta para chave que nao existe no catalogo.';
  END IF;

  -- O catalogo anterior sobreviveu a acumulacao?
  IF (SELECT count(*) FROM public.fn_permissoes_catalogo()) <= 10 THEN
    RAISE EXCEPTION 'O catalogo perdeu as chaves anteriores na acumulacao.';
  END IF;
END
$prova$;

COMMIT;
