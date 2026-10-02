-- ============================================================================
-- Fase 6: tipo de setor (Núcleo) e variante de empresa
-- ============================================================================
--
-- ## setores.tipo
--
-- Até aqui «este setor é o Núcleo» só existia como ponteiro em
-- `numeros_config.setor_nucleo_id`, e a trava do cargo Assistente ADM
-- (`fn_perfis_cargo_do_nucleo`, 20260911121000) repetia em literal quem
-- atravessa e quem é do Núcleo. Agora:
--
--   setores.tipo             'operacao' (padrão) ou 'nucleo'
--   cargos.exige_tipo_setor  o tipo de setor que o cargo exige (20261002173500)
--
-- e a regra fica uma só, lida do cadastro:
--
--   - cargo de acesso total atravessa;
--   - cargo que não pertence a setor não é olhado (o setor dele já foi zerado
--     por `a_trg_perfis_escopo_empresa`);
--   - cargo com `exige_tipo_setor` só existe em setor daquele tipo;
--   - setor de um tipo que algum cargo exige só aceita esses cargos.
--
-- Para os cargos de hoje o resultado é o mesmo da função antiga; as frases de
-- erro também (a tela as repete, ver `src/lib/cargoDoNucleo.ts`).
--
-- `numeros_config.setor_nucleo_id` continua sendo onde a tela de Configuração
-- escolhe o Núcleo. Um gatilho mantém `setores.tipo` em espelho, e o índice
-- único garante um Núcleo por empresa, como o ponteiro já garantia.
--
-- ## empresas.variante
--
-- Dentro do produto cobrança há duas variações: BookPlay e PaguePlay. O front
-- decidia isso comparando o slug (`isPaguePlay(slug)`). A coluna passa a dizer;
-- `isPaguePlay` lê dela. Só empresa de cobrança tem variante, e tem de ter.
--
-- Os corpos de `fn_perfis_cargo_do_nucleo` e `fn_numeros_config_valida` partem
-- do que estava em produção em 02/10/2026 (pg_get_functiondef).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 0. O ponto de partida é o esperado ──────────────────────────────────────

DO $antes$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.cargos
     WHERE exige_tipo_setor IS NOT NULL AND exige_tipo_setor <> 'nucleo'
  ) THEN
    RAISE EXCEPTION 'Ha cargo exigindo tipo de setor diferente de nucleo.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.empresas
     WHERE produto = 'cobranca' AND slug NOT IN ('bookplay', 'pagueplay')
  ) THEN
    RAISE EXCEPTION 'Ha empresa de cobranca fora de bookplay/pagueplay: decidir a variante dela antes.';
  END IF;
END
$antes$;

-- ── 1. setores.tipo ─────────────────────────────────────────────────────────

ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'operacao';

DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.setores'::REGCLASS AND conname = 'setores_tipo_conhecido'
  ) THEN
    ALTER TABLE public.setores
      ADD CONSTRAINT setores_tipo_conhecido CHECK (tipo IN ('operacao', 'nucleo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.cargos'::REGCLASS AND conname = 'cargos_exige_tipo_conhecido'
  ) THEN
    ALTER TABLE public.cargos
      ADD CONSTRAINT cargos_exige_tipo_conhecido
      CHECK (exige_tipo_setor IS NULL OR exige_tipo_setor IN ('operacao', 'nucleo'));
  END IF;
END
$check$;

COMMENT ON COLUMN public.setores.tipo IS
  'operacao ou nucleo. Setor de um tipo que algum cargo exige '
  '(cargos.exige_tipo_setor) so aceita esses cargos. O nucleo e espelho de '
  'numeros_config.setor_nucleo_id. Ver 20261002230000.';

UPDATE public.setores s
   SET tipo = 'nucleo'
  FROM public.numeros_config c
 WHERE c.setor_nucleo_id = s.id
   AND s.tipo <> 'nucleo';

CREATE UNIQUE INDEX IF NOT EXISTS setores_um_nucleo_por_empresa
  ON public.setores (empresa_id) WHERE tipo = 'nucleo';

-- ── 2. A regra única, em perfis ─────────────────────────────────────────────
--
-- Mesmo nome e mesmo gatilho (`b_trg_perfis_cargo_do_nucleo`, depois de
-- `a_trg_perfis_escopo_empresa`). Só o corpo muda.

CREATE OR REPLACE FUNCTION public.fn_setor_tipo_rotulo(p_tipo TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT CASE p_tipo
    WHEN 'nucleo' THEN 'Núcleo de Inteligência e Gestão'
    ELSE p_tipo
  END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_perfis_cargo_do_nucleo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cargo   public.cargos%ROWTYPE;
  v_tipo    TEXT;
  v_aceitos TEXT;
BEGIN
  SELECT * INTO v_cargo FROM public.cargos c WHERE c.slug = NEW.perfil;

  -- Acesso total atravessa; quem nao pertence a setor ja teve o setor zerado.
  IF NOT FOUND OR v_cargo.acesso_total OR NOT v_cargo.pertence_a_setor THEN
    RETURN NEW;
  END IF;

  SELECT s.tipo INTO v_tipo FROM public.setores s WHERE s.id = NEW.setor_id;

  IF v_cargo.exige_tipo_setor IS NOT NULL THEN
    IF v_tipo IS DISTINCT FROM v_cargo.exige_tipo_setor THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.setores s
         WHERE s.empresa_id = NEW.empresa_id AND s.tipo = v_cargo.exige_tipo_setor
      ) THEN
        RAISE EXCEPTION '% é o cargo do %, e esta empresa não tem o % configurado.',
          v_cargo.nome, public.fn_setor_tipo_rotulo(v_cargo.exige_tipo_setor),
          CASE v_cargo.exige_tipo_setor WHEN 'nucleo' THEN 'Núcleo' ELSE v_cargo.exige_tipo_setor END
          USING ERRCODE = '23514';
      END IF;
      RAISE EXCEPTION '% só pode estar no setor %.',
        v_cargo.nome, public.fn_setor_tipo_rotulo(v_cargo.exige_tipo_setor)
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Setor de tipo exclusivo: so os cargos que exigem aquele tipo.
  SELECT string_agg(c.nome, ', ' ORDER BY c.ordem) INTO v_aceitos
    FROM public.cargos c
   WHERE c.exige_tipo_setor = v_tipo;

  IF v_aceitos IS NOT NULL THEN
    RAISE EXCEPTION 'O setor % só aceita o cargo %.',
      public.fn_setor_tipo_rotulo(v_tipo), v_aceitos
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_perfis_cargo_do_nucleo() FROM PUBLIC, anon, authenticated;

-- ── 3. Trocar o tipo de um setor não deixa ninguém em violação ──────────────

CREATE OR REPLACE FUNCTION public.fn_setores_tipo_valida()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_qtd INTEGER;
BEGIN
  IF NEW.tipo IS NOT DISTINCT FROM OLD.tipo THEN
    RETURN NEW;
  END IF;

  -- Quem esta no setor e deixaria de caber nele com o tipo novo.
  SELECT COUNT(*) INTO v_qtd
    FROM public.perfis p
    JOIN public.cargos c ON c.slug = p.perfil
   WHERE p.setor_id = NEW.id
     AND NOT c.acesso_total
     AND c.pertence_a_setor
     AND (
       -- cargo que exige outro tipo
       (c.exige_tipo_setor IS NOT NULL AND c.exige_tipo_setor <> NEW.tipo)
       -- cargo comum num tipo exclusivo
       OR (c.exige_tipo_setor IS NULL
           AND EXISTS (SELECT 1 FROM public.cargos x WHERE x.exige_tipo_setor = NEW.tipo))
     );

  IF v_qtd > 0 THEN
    RAISE EXCEPTION
      'O setor tem % pessoa(s) cujo cargo não cabe num setor do tipo %. Transfira ou troque o cargo delas antes.',
      v_qtd, NEW.tipo
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_setores_tipo_valida() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_setores_tipo_valida ON public.setores;
CREATE TRIGGER trg_setores_tipo_valida
  BEFORE UPDATE OF tipo ON public.setores
  FOR EACH ROW EXECUTE FUNCTION public.fn_setores_tipo_valida();

-- ── 4. numeros_config: valida pelo cadastro e espelha em setores.tipo ───────

CREATE OR REPLACE FUNCTION public.fn_numeros_config_valida()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_numeros_setor_e_da_empresa(NEW.setor_nucleo_id, NEW.empresa_id) THEN
    RAISE EXCEPTION 'O setor escolhido nao pertence a esta empresa.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' OR NEW.setor_nucleo_id IS DISTINCT FROM OLD.setor_nucleo_id THEN
    IF TG_OP = 'UPDATE' AND EXISTS (
      SELECT 1 FROM public.perfis p
        JOIN public.cargos c ON c.slug = p.perfil
       WHERE p.empresa_id = NEW.empresa_id
         AND c.exige_tipo_setor = 'nucleo'
         AND p.setor_id = OLD.setor_nucleo_id
    ) THEN
      RAISE EXCEPTION
        'Há Assistente ADM no setor atual do Núcleo. Transfira essas pessoas ou troque o cargo delas antes de apontar outro setor.'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.perfis p
        JOIN public.cargos c ON c.slug = p.perfil
       WHERE p.empresa_id = NEW.empresa_id
         AND p.setor_id = NEW.setor_nucleo_id
         AND NOT c.acesso_total
         AND c.exige_tipo_setor IS DISTINCT FROM 'nucleo'
    ) THEN
      RAISE EXCEPTION
        'O setor escolhido tem pessoas com cargo comum, e o Núcleo só aceita Assistente ADM. Troque o cargo delas antes.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.atualizado_em := NOW();
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_numeros_config_espelha_tipo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Primeiro solta o antigo, depois marca o novo: o indice unico aceita um
  -- Nucleo por empresa.
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.setor_nucleo_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR OLD.setor_nucleo_id IS DISTINCT FROM NEW.setor_nucleo_id) THEN
    UPDATE public.setores SET tipo = 'operacao'
     WHERE id = OLD.setor_nucleo_id AND tipo = 'nucleo';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.setor_nucleo_id IS NOT NULL THEN
    UPDATE public.setores SET tipo = 'nucleo'
     WHERE id = NEW.setor_nucleo_id AND tipo <> 'nucleo';
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_config_espelha_tipo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_numeros_config_espelha_tipo ON public.numeros_config;
CREATE TRIGGER trg_numeros_config_espelha_tipo
  AFTER INSERT OR UPDATE OF setor_nucleo_id OR DELETE ON public.numeros_config
  FOR EACH ROW EXECUTE FUNCTION public.fn_numeros_config_espelha_tipo();

-- ── 5. empresas.variante ────────────────────────────────────────────────────

ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS variante TEXT;

UPDATE public.empresas SET variante = slug
 WHERE produto = 'cobranca' AND variante IS DISTINCT FROM slug;

DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.empresas'::REGCLASS AND conname = 'empresas_variante_da_cobranca'
  ) THEN
    ALTER TABLE public.empresas
      -- CASE, e nao AND/OR: `NULL IN (...)` da NULL, e CHECK aceita NULL.
      ADD CONSTRAINT empresas_variante_da_cobranca CHECK (
        CASE WHEN produto = 'cobranca'
             THEN COALESCE(variante IN ('bookplay', 'pagueplay'), FALSE)
             ELSE variante IS NULL
        END
      );
  END IF;
END
$check$;

COMMENT ON COLUMN public.empresas.variante IS
  'Variacao da cobranca: bookplay ou pagueplay. Nulo fora da cobranca. '
  'isPaguePlay (src/lib/index.ts) le daqui. Ver 20261002230000.';

-- ── 6. Prova ────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_ponteiros INTEGER;
  v_nucleos   INTEGER;
  v_fora      INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_ponteiros FROM public.numeros_config WHERE setor_nucleo_id IS NOT NULL;
  SELECT COUNT(*) INTO v_nucleos   FROM public.setores WHERE tipo = 'nucleo';
  IF v_nucleos <> v_ponteiros OR EXISTS (
    SELECT 1 FROM public.setores s
     WHERE s.tipo = 'nucleo'
       AND NOT EXISTS (SELECT 1 FROM public.numeros_config c WHERE c.setor_nucleo_id = s.id)
  ) THEN
    RAISE EXCEPTION 'setores.tipo nao espelha numeros_config: % nucleo(s), % ponteiro(s).', v_nucleos, v_ponteiros;
  END IF;

  -- Ninguem em violacao da regra nova.
  SELECT COUNT(*) INTO v_fora
    FROM public.perfis p
    JOIN public.cargos c ON c.slug = p.perfil
    LEFT JOIN public.setores s ON s.id = p.setor_id
   WHERE NOT c.acesso_total AND c.pertence_a_setor
     AND (
       (c.exige_tipo_setor IS NOT NULL AND s.tipo IS DISTINCT FROM c.exige_tipo_setor)
       OR (c.exige_tipo_setor IS NULL AND s.tipo = 'nucleo')
     );
  IF v_fora > 0 THEN
    RAISE EXCEPTION '% pessoa(s) em violacao da regra de tipo de setor.', v_fora;
  END IF;

  IF EXISTS (SELECT 1 FROM public.empresas WHERE slug = 'pagueplay' AND variante IS DISTINCT FROM 'pagueplay')
     OR EXISTS (SELECT 1 FROM public.empresas WHERE slug = 'bookplay' AND variante IS DISTINCT FROM 'bookplay')
     OR EXISTS (SELECT 1 FROM public.empresas WHERE produto <> 'cobranca' AND variante IS NOT NULL) THEN
    RAISE EXCEPTION 'empresas.variante diverge do esperado.';
  END IF;

  IF pg_get_functiondef('public.fn_perfis_cargo_do_nucleo()'::REGPROCEDURE) LIKE '%''assistente_adm''%'
     OR pg_get_functiondef('public.fn_numeros_config_valida()'::REGPROCEDURE) LIKE '%''assistente_adm''%' THEN
    RAISE EXCEPTION 'Ainda ha lista literal de cargo nas funcoes do Nucleo.';
  END IF;
END
$prova$;

COMMIT;
