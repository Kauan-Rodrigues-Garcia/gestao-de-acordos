-- ============================================================================
-- Fase 5 da reorganizacao: a equipe numa tabela so (`equipe_membros`)
-- ============================================================================
--
-- Ate aqui uma pessoa entrava numa equipe por tres portas, e cada leitor
-- somava as tres do seu jeito (regra de 29/09/2026, 20260929141516):
--
--   membro  `perfis.equipe_id` de quem NAO tem cargo `lider` (no lider o
--           campo e residuo e nao conta)
--   lider   `equipe_lideres`
--   clone   `equipe_operadores_clones`, com `conta_recebimento`
--
-- `equipe_membros` guarda o resultado dessa regra: uma linha por pessoa,
-- equipe e papel. Quem pergunta "em que equipes a pessoa esta" le uma tabela.
--
-- ## Transicao
--
-- As telas continuam gravando nas tres tabelas antigas. Gatilhos nelas mantem
-- `equipe_membros` em espelho, na mesma transacao. Nenhuma tela de cadastro
-- muda nesta fase; as antigas saem na fase 7, depois de um mes fechado sem
-- divergencia.
--
-- ## O que passa a ler a tabela nova
--
--   fn_equipes_do_operador   fn_pessoas_das_equipes   fn_equipes_de_alcance
--   fn_equipe_principal      fn_setores_do_operador
--
-- Todo o resto (acordos, analitico, dashboard, desafios) chega nelas por essas
-- funcoes. O retrato do mes (`fn_composicao_mes_snapshot`) fica como esta:
-- mes fechado nao se reescreve (20260903330000), e o corrente continua lendo as
-- tabelas antigas, que seguem sendo a fonte das gravacoes.
--
-- ## Prova
--
-- Antes de trocar as funcoes, o resultado de cada uma e fotografado para TODA
-- pessoa e TODA equipe. Depois da troca, a mesma pergunta tem de dar a mesma
-- resposta, linha por linha; qualquer diferenca desfaz a migration inteira.
--
-- Reaplicavel.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 1. A tabela ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.equipe_membros (
  equipe_id         UUID        NOT NULL REFERENCES public.equipes (id)  ON DELETE CASCADE,
  pessoa_id         UUID        NOT NULL REFERENCES public.perfis (id)   ON DELETE CASCADE,
  papel             TEXT        NOT NULL CHECK (papel IN ('membro', 'lider', 'clone')),
  empresa_id        UUID        NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  -- So o clone pode deixar de contar; membro e lider contam sempre.
  conta_recebimento BOOLEAN     NOT NULL DEFAULT TRUE,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (equipe_id, pessoa_id, papel)
);

COMMENT ON TABLE public.equipe_membros IS
  'Em que equipes cada pessoa esta: membro, lider ou clone. Espelho de '
  'perfis.equipe_id (sem o cargo lider), equipe_lideres e '
  'equipe_operadores_clones, mantido por gatilho. Ver 20261002220000.';

CREATE INDEX IF NOT EXISTS idx_equipe_membros_pessoa  ON public.equipe_membros (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_equipe_membros_empresa ON public.equipe_membros (empresa_id);

ALTER TABLE public.equipe_membros ENABLE ROW LEVEL SECURITY;

-- Leitura: quem le as tres tabelas antigas (mesma policy delas). Escrita: so
-- os gatilhos, que rodam como dono.
DROP POLICY IF EXISTS equipe_membros_select_empresa ON public.equipe_membros;
CREATE POLICY equipe_membros_select_empresa ON public.equipe_membros
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

REVOKE ALL ON public.equipe_membros FROM anon, authenticated;
GRANT SELECT ON public.equipe_membros TO authenticated;
GRANT ALL ON public.equipe_membros TO service_role;

-- ── 2. O espelho ────────────────────────────────────────────────────────────
-- A empresa da linha e a da EQUIPE (amarrada ao setor desde a fase 4).

CREATE OR REPLACE FUNCTION public.fn_equipe_membros_espelho_perfis()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public.equipe_membros
   WHERE pessoa_id = NEW.id AND papel = 'membro';

  -- No cargo `lider` o `perfis.equipe_id` e residuo (20260929141516).
  IF NEW.equipe_id IS NOT NULL AND NEW.perfil IS DISTINCT FROM 'lider' THEN
    INSERT INTO public.equipe_membros (equipe_id, pessoa_id, papel, empresa_id)
    SELECT e.id, NEW.id, 'membro', e.empresa_id
      FROM public.equipes e
     WHERE e.id = NEW.equipe_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_equipe_membros_espelho_lideres()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    DELETE FROM public.equipe_membros
     WHERE equipe_id = OLD.equipe_id AND pessoa_id = OLD.lider_id AND papel = 'lider';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.equipe_membros (equipe_id, pessoa_id, papel, empresa_id, criado_em)
    SELECT e.id, NEW.lider_id, 'lider', e.empresa_id, NEW.criado_em
      FROM public.equipes e
     WHERE e.id = NEW.equipe_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_equipe_membros_espelho_clones()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    DELETE FROM public.equipe_membros
     WHERE equipe_id = OLD.equipe_id AND pessoa_id = OLD.operador_id AND papel = 'clone';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO public.equipe_membros
      (equipe_id, pessoa_id, papel, empresa_id, conta_recebimento, criado_em)
    SELECT e.id, NEW.operador_id, 'clone', e.empresa_id,
           COALESCE(NEW.conta_recebimento, TRUE), NEW.criado_em
      FROM public.equipes e
     WHERE e.id = NEW.equipe_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$function$;

-- Equipe que troca de empresa leva a empresa das linhas junto.
CREATE OR REPLACE FUNCTION public.fn_equipe_membros_espelho_equipes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.equipe_membros
     SET empresa_id = NEW.empresa_id
   WHERE equipe_id = NEW.id AND empresa_id IS DISTINCT FROM NEW.empresa_id;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_equipe_membros_espelho_perfis()  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_equipe_membros_espelho_lideres() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_equipe_membros_espelho_clones()  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_equipe_membros_espelho_equipes() FROM public, anon, authenticated;

-- Os gatilhos entram ANTES da carga: o CREATE TRIGGER trava a escrita nas
-- tabelas ate o COMMIT, entao nada grava entre a carga e o espelho.
DROP TRIGGER IF EXISTS trg_equipe_membros_espelho ON public.perfis;
CREATE TRIGGER trg_equipe_membros_espelho
  AFTER INSERT OR UPDATE OF equipe_id, perfil ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_equipe_membros_espelho_perfis();

DROP TRIGGER IF EXISTS trg_equipe_membros_espelho ON public.equipe_lideres;
CREATE TRIGGER trg_equipe_membros_espelho
  AFTER INSERT OR UPDATE OR DELETE ON public.equipe_lideres
  FOR EACH ROW EXECUTE FUNCTION public.fn_equipe_membros_espelho_lideres();

DROP TRIGGER IF EXISTS trg_equipe_membros_espelho ON public.equipe_operadores_clones;
CREATE TRIGGER trg_equipe_membros_espelho
  AFTER INSERT OR UPDATE OR DELETE ON public.equipe_operadores_clones
  FOR EACH ROW EXECUTE FUNCTION public.fn_equipe_membros_espelho_clones();

DROP TRIGGER IF EXISTS trg_equipe_membros_espelho ON public.equipes;
CREATE TRIGGER trg_equipe_membros_espelho
  AFTER UPDATE OF empresa_id ON public.equipes
  FOR EACH ROW EXECUTE FUNCTION public.fn_equipe_membros_espelho_equipes();

-- ── 3. A carga ──────────────────────────────────────────────────────────────
-- Do zero a cada aplicacao, para a reaplicacao nao herdar sobra.

DELETE FROM public.equipe_membros;

INSERT INTO public.equipe_membros (equipe_id, pessoa_id, papel, empresa_id)
SELECT e.id, p.id, 'membro', e.empresa_id
  FROM public.perfis p
  JOIN public.equipes e ON e.id = p.equipe_id
 WHERE p.perfil IS DISTINCT FROM 'lider';

INSERT INTO public.equipe_membros (equipe_id, pessoa_id, papel, empresa_id, criado_em)
SELECT e.id, el.lider_id, 'lider', e.empresa_id, el.criado_em
  FROM public.equipe_lideres el
  JOIN public.equipes e ON e.id = el.equipe_id
ON CONFLICT DO NOTHING;

INSERT INTO public.equipe_membros
  (equipe_id, pessoa_id, papel, empresa_id, conta_recebimento, criado_em)
SELECT e.id, c.operador_id, 'clone', e.empresa_id,
       COALESCE(c.conta_recebimento, TRUE), c.criado_em
  FROM public.equipe_operadores_clones c
  JOIN public.equipes e ON e.id = c.equipe_id
ON CONFLICT DO NOTHING;

-- ── 4. A foto de antes ──────────────────────────────────────────────────────
-- Cada funcao, para cada pessoa e cada equipe, como responde HOJE em producao.

CREATE TEMP TABLE _fase5_pessoas ON COMMIT DROP AS
SELECT p.id,
       ARRAY(SELECT x.equipe_id::TEXT || '/' || COALESCE(x.setor_id::TEXT, '')
               FROM public.fn_equipes_do_operador(p.id) x ORDER BY 1) AS do_operador,
       ARRAY(SELECT a::TEXT FROM public.fn_equipes_de_alcance(p.id) a ORDER BY 1)  AS alcance,
       public.fn_equipe_principal(p.id)                                         AS principal,
       ARRAY(SELECT s::TEXT FROM public.fn_setores_do_operador(p.id) s ORDER BY 1) AS setores
  FROM public.perfis p;

CREATE TEMP TABLE _fase5_equipes ON COMMIT DROP AS
SELECT e.id,
       ARRAY(SELECT x::TEXT FROM public.fn_pessoas_das_equipes(ARRAY[e.id]) x ORDER BY 1) AS pessoas
  FROM public.equipes e;

-- ── 5. As funcoes leem a tabela nova ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_equipes_do_operador(p_operador uuid)
 RETURNS TABLE(equipe_id uuid, setor_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT DISTINCT e.id, e.setor_id
    FROM public.equipe_membros m
    JOIN public.equipes e ON e.id = m.equipe_id
   WHERE m.pessoa_id = p_operador;
$function$;

COMMENT ON FUNCTION public.fn_equipes_do_operador(uuid) IS
  'Equipes em que a pessoa esta, com o setor de cada uma: membro, lider ou clone '
  '(equipe_membros). Ver 20261002220000.';

CREATE OR REPLACE FUNCTION public.fn_pessoas_das_equipes(p_equipes uuid[])
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT DISTINCT m.pessoa_id
    FROM public.equipe_membros m
   WHERE m.equipe_id = ANY(p_equipes);
$function$;

COMMENT ON FUNCTION public.fn_pessoas_das_equipes(uuid[]) IS
  'Quem esta nas equipes dadas: membro, lider ou clone (equipe_membros). O inverso '
  'de fn_equipes_do_operador. So para uso interno das funcoes de recorte.';

CREATE OR REPLACE FUNCTION public.fn_equipes_de_alcance(p_perfil uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT DISTINCT m.equipe_id
    FROM public.equipe_membros m
   WHERE m.pessoa_id = p_perfil
     AND m.papel IN ('lider', 'membro');
$function$;

COMMENT ON FUNCTION public.fn_equipes_de_alcance(uuid) IS
  'Equipes por onde a pessoa responde: as que lidera e a de membro; clone nao '
  'conta (equipe_membros). Ver 20261002220000.';

CREATE OR REPLACE FUNCTION public.fn_equipe_principal(p_perfil uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH todas AS (
    SELECT array_agg(a.equipe_id) AS lista
      FROM public.fn_equipes_de_alcance(p_perfil) AS a(equipe_id)
  )
  SELECT CASE
           WHEN cardinality(todas.lista) = 1 THEN todas.lista[1]
           ELSE (SELECT m.equipe_id
                   FROM public.equipe_membros m
                  WHERE m.pessoa_id = p_perfil AND m.papel = 'membro'
                  LIMIT 1)
         END
    FROM todas
   WHERE EXISTS (SELECT 1 FROM public.perfis WHERE id = p_perfil);
$function$;

COMMENT ON FUNCTION public.fn_equipe_principal(uuid) IS
  'A equipe que vale quando so cabe uma (config por equipe): a unica em que a '
  'pessoa esta; havendo varias, a de membro. Lider de varias nao tem principal. '
  'Mesma regra de equipesDoPerfil no app. Ver 20261002220000.';

CREATE OR REPLACE FUNCTION public.fn_setores_do_operador(p_operador uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p.setor_id
    FROM public.perfis p
   WHERE p.id = p_operador AND p.setor_id IS NOT NULL
  UNION
  SELECT e.setor_id
    FROM public.equipe_membros m
    JOIN public.equipes e ON e.id = m.equipe_id
   WHERE m.pessoa_id = p_operador
     AND m.papel IN ('clone', 'lider');
$function$;

COMMENT ON FUNCTION public.fn_setores_do_operador(uuid) IS
  'Setores em que a pessoa aparece: o do perfil e os das equipes em que e clone '
  'ou lider (equipe_membros). Ver 20261002220000.';

-- ── 6. Prova ────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_pessoas   INTEGER;
  v_equipes   INTEGER;
  v_exemplo   UUID;
  v_membros   INTEGER;
  v_lideres   INTEGER;
  v_clones    INTEGER;
BEGIN
  -- A carga bate com as tres fontes.
  SELECT COUNT(*) INTO v_membros FROM public.equipe_membros WHERE papel = 'membro';
  SELECT COUNT(*) INTO v_lideres FROM public.equipe_membros WHERE papel = 'lider';
  SELECT COUNT(*) INTO v_clones  FROM public.equipe_membros WHERE papel = 'clone';

  IF v_membros <> (SELECT COUNT(*) FROM public.perfis
                    WHERE equipe_id IS NOT NULL AND perfil IS DISTINCT FROM 'lider')
     OR v_lideres <> (SELECT COUNT(*) FROM public.equipe_lideres)
     OR v_clones  <> (SELECT COUNT(*) FROM public.equipe_operadores_clones) THEN
    RAISE EXCEPTION 'Carga de equipe_membros nao bate com as fontes (membro %, lider %, clone %).',
      v_membros, v_lideres, v_clones;
  END IF;

  -- Cada funcao responde igual a antes, para toda pessoa.
  SELECT COUNT(*), MIN(a.id::TEXT)::UUID INTO v_pessoas, v_exemplo
    FROM _fase5_pessoas a
   WHERE a.do_operador IS DISTINCT FROM ARRAY(
           SELECT x.equipe_id::TEXT || '/' || COALESCE(x.setor_id::TEXT, '')
             FROM public.fn_equipes_do_operador(a.id) x ORDER BY 1)
      OR a.alcance IS DISTINCT FROM ARRAY(
           SELECT y::TEXT FROM public.fn_equipes_de_alcance(a.id) y ORDER BY 1)
      OR a.principal IS DISTINCT FROM public.fn_equipe_principal(a.id)
      OR a.setores IS DISTINCT FROM ARRAY(
           SELECT s::TEXT FROM public.fn_setores_do_operador(a.id) s ORDER BY 1);

  IF v_pessoas > 0 THEN
    RAISE EXCEPTION '% pessoa(s) mudariam de equipe ou setor com a troca (ex.: %).',
      v_pessoas, v_exemplo;
  END IF;

  -- E para toda equipe, quem esta nela.
  SELECT COUNT(*), MIN(b.id::TEXT)::UUID INTO v_equipes, v_exemplo
    FROM _fase5_equipes b
   WHERE b.pessoas IS DISTINCT FROM ARRAY(
           SELECT x::TEXT FROM public.fn_pessoas_das_equipes(ARRAY[b.id]) x ORDER BY 1);

  IF v_equipes > 0 THEN
    RAISE EXCEPTION '% equipe(s) mudariam de gente com a troca (ex.: %).', v_equipes, v_exemplo;
  END IF;
END
$prova$;

COMMIT;
