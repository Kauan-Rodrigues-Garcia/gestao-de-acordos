-- ============================================================================
-- Fase 7 da reorganizacao: as tabelas antigas de equipe viram janelas
-- ============================================================================
--
-- NAO APLICAR ANTES DE 01/11/2026. A fase 7 so entra depois de outubro fechar
-- sem divergencia entre `equipe_membros` e as tabelas antigas
-- (docs/REORGANIZACAO-HIERARQUIA-ESTADO.md).
--
-- ## Por que
--
-- Desde a fase 5 (20261002220000) `equipe_membros` e a resposta de "quem esta
-- em que equipe", mas as telas ainda gravam em `equipe_lideres` e
-- `equipe_operadores_clones`, e gatilhos copiam para `equipe_membros`. Sao
-- duas copias da mesma informacao.
--
-- ## O que muda
--
-- 1. `equipe_membros` ganha `id` e `criado_por`, com os valores das tabelas
--    antigas. O `id` e o que as telas usam para remover e editar um vinculo.
-- 2. As tabelas antigas mudam de nome para `*_legado`, perdem os gatilhos e
--    o acesso do app. Ficam guardadas ate a fase 8.
-- 3. No lugar delas entram VIEWS com o mesmo nome e as mesmas colunas, lendo
--    `equipe_membros` (papel `lider` e papel `clone`). Quem le continua lendo
--    igual: as ~50 funcoes do banco e as telas nao mudam.
-- 4. Gravar na view grava em `equipe_membros` (gatilhos INSTEAD OF). Insert,
--    update e delete continuam funcionando, com `RETURNING`.
-- 5. Quem pode gravar: as mesmas regras de antes (`equipes_gerenciar_composicao`
--    na empresa, ou super_admin), agora em `equipe_membros`, e so para os
--    papeis `lider` e `clone`. O papel `membro` continua vindo de
--    `perfis.equipe_id`.
-- 6. A auditoria (`fn_log_auditoria`) passa para `equipe_membros`, com os
--    mesmos rotulos, separada por papel.
--
-- ## Duplicado
--
-- Gravar um vinculo que ja existe nao da erro: a view devolve zero linhas.
-- Assim `INSERT ... ON CONFLICT DO NOTHING` (fn_transferencia_desfazer)
-- continua valendo, e o `.insert().select().single()` das telas continua
-- voltando sem linha, como voltava com o erro de chave unica.
--
-- ## Prova
--
-- Antes de qualquer troca: as tabelas antigas e `equipe_membros` tem de bater
-- linha por linha, e nada no banco pode depender das tabelas antigas de um
-- jeito que o RENAME carregaria junto (view, regra, FK, funcao BEGIN ATOMIC).
-- Depois: as views devolvem exatamente as linhas das tabelas legado, e um
-- clone gravado pela view aparece em `equipe_membros` e some ao apagar.
-- Qualquer falha desfaz tudo.
--
-- Reaplicavel.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 0. Ja aplicada? ─────────────────────────────────────────────────────────
-- Se as views ja estao no lugar, pula a troca e so refaz o que e reaplicavel.

CREATE TEMP TABLE _fase7 ON COMMIT DROP AS
SELECT (SELECT relkind FROM pg_class
         WHERE oid = to_regclass('public.equipe_lideres')) = 'v' AS ja_aplicada;

-- ── 1. Antes de mexer ───────────────────────────────────────────────────────

DO $antes$
DECLARE
  v_ja_aplicada BOOLEAN := (SELECT ja_aplicada FROM _fase7);
  v_n           INTEGER;
  v_lista       TEXT;
BEGIN
  IF to_regclass('public.equipe_membros') IS NULL THEN
    RAISE EXCEPTION 'equipe_membros ausente: aplique 20261002220000 (fase 5) antes.';
  END IF;

  IF v_ja_aplicada THEN
    RETURN;
  END IF;

  IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.equipe_operadores_clones')) <> 'r'
     OR (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.equipe_lideres')) <> 'r' THEN
    RAISE EXCEPTION 'equipe_lideres e equipe_operadores_clones deviam ser tabelas.';
  END IF;

  IF to_regclass('public.equipe_lideres_legado') IS NOT NULL
     OR to_regclass('public.equipe_operadores_clones_legado') IS NOT NULL THEN
    RAISE EXCEPTION 'Ja existe tabela *_legado: confira antes de reaplicar.';
  END IF;

  -- Nada pode depender das tabelas de um jeito que o RENAME levaria junto.
  SELECT COUNT(*), string_agg(DISTINCT o.descricao, ', ') INTO v_n, v_lista
    FROM (
      SELECT pg_describe_object(d.classid, d.objid, d.objsubid) AS descricao
        FROM pg_depend d
       WHERE d.refobjid IN ('public.equipe_lideres'::REGCLASS,
                            'public.equipe_operadores_clones'::REGCLASS)
         AND (   (d.classid = 'pg_rewrite'::REGCLASS
                  AND NOT EXISTS (SELECT 1 FROM pg_rewrite r
                                   WHERE r.oid = d.objid AND r.ev_class = d.refobjid))
              OR d.classid = 'pg_proc'::REGCLASS)
      UNION ALL
      SELECT conname::TEXT
        FROM pg_constraint
       WHERE confrelid IN ('public.equipe_lideres'::REGCLASS,
                           'public.equipe_operadores_clones'::REGCLASS)
    ) o;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Objetos presos as tabelas antigas (o RENAME os levaria junto): %', v_lista;
  END IF;

  -- As tabelas antigas e equipe_membros batem? (o mes de prova da fase 5)
  SELECT COUNT(*) INTO v_n FROM (
    (SELECT el.equipe_id, el.lider_id, el.criado_em FROM public.equipe_lideres el
     EXCEPT
     SELECT m.equipe_id, m.pessoa_id, m.criado_em FROM public.equipe_membros m WHERE m.papel = 'lider')
    UNION ALL
    (SELECT m.equipe_id, m.pessoa_id, m.criado_em FROM public.equipe_membros m WHERE m.papel = 'lider'
     EXCEPT
     SELECT el.equipe_id, el.lider_id, el.criado_em FROM public.equipe_lideres el)
  ) x;
  IF v_n > 0 THEN
    RAISE EXCEPTION '% lideranca(s) diferentes entre equipe_lideres e equipe_membros.', v_n;
  END IF;

  SELECT COUNT(*) INTO v_n FROM (
    (SELECT c.equipe_id, c.operador_id, c.conta_recebimento, c.criado_em
       FROM public.equipe_operadores_clones c
     EXCEPT
     SELECT m.equipe_id, m.pessoa_id, m.conta_recebimento, m.criado_em
       FROM public.equipe_membros m WHERE m.papel = 'clone')
    UNION ALL
    (SELECT m.equipe_id, m.pessoa_id, m.conta_recebimento, m.criado_em
       FROM public.equipe_membros m WHERE m.papel = 'clone'
     EXCEPT
     SELECT c.equipe_id, c.operador_id, c.conta_recebimento, c.criado_em
       FROM public.equipe_operadores_clones c)
  ) x;
  IF v_n > 0 THEN
    RAISE EXCEPTION '% clone(s) diferentes entre equipe_operadores_clones e equipe_membros.', v_n;
  END IF;

  -- A empresa gravada na linha antiga e a da equipe (a view vai mostrar a da equipe).
  SELECT COUNT(*) INTO v_n FROM (
    SELECT 1 FROM public.equipe_lideres x JOIN public.equipes e ON e.id = x.equipe_id
     WHERE x.empresa_id IS DISTINCT FROM e.empresa_id
    UNION ALL
    SELECT 1 FROM public.equipe_operadores_clones x JOIN public.equipes e ON e.id = x.equipe_id
     WHERE x.empresa_id IS DISTINCT FROM e.empresa_id
  ) x;
  IF v_n > 0 THEN
    RAISE EXCEPTION '% vinculo(s) com empresa diferente da empresa da equipe.', v_n;
  END IF;
END
$antes$;

-- ── 2. equipe_membros ganha id e criado_por ─────────────────────────────────

ALTER TABLE public.equipe_membros
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.equipe_membros
  ADD COLUMN IF NOT EXISTS criado_por UUID;

DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.equipe_membros'::REGCLASS
                    AND conname = 'equipe_membros_criado_por_fkey') THEN
    ALTER TABLE public.equipe_membros
      ADD CONSTRAINT equipe_membros_criado_por_fkey FOREIGN KEY (criado_por)
      REFERENCES public.perfis (id) ON DELETE SET NULL;
  END IF;
END
$fk$;

-- Escrita trancada nas antigas ate o COMMIT: nada grava entre a copia e a troca.
DO $copia$
BEGIN
  IF (SELECT ja_aplicada FROM _fase7) THEN
    RETURN;
  END IF;

  LOCK TABLE public.equipe_lideres, public.equipe_operadores_clones IN EXCLUSIVE MODE;

  UPDATE public.equipe_membros m
     SET id = el.id, criado_por = el.criado_por
    FROM public.equipe_lideres el
   WHERE m.papel = 'lider' AND m.equipe_id = el.equipe_id AND m.pessoa_id = el.lider_id;

  UPDATE public.equipe_membros m
     SET id = c.id, criado_por = c.criado_por
    FROM public.equipe_operadores_clones c
   WHERE m.papel = 'clone' AND m.equipe_id = c.equipe_id AND m.pessoa_id = c.operador_id;
END
$copia$;

CREATE UNIQUE INDEX IF NOT EXISTS equipe_membros_id_key ON public.equipe_membros (id);

-- ── 3. As antigas saem de cena ──────────────────────────────────────────────

DO $legado$
BEGIN
  IF (SELECT ja_aplicada FROM _fase7) THEN
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS trg_equipe_membros_espelho     ON public.equipe_lideres;
  DROP TRIGGER IF EXISTS trg_equipe_membros_espelho     ON public.equipe_operadores_clones;
  DROP TRIGGER IF EXISTS trg_log_equipe_lideres         ON public.equipe_lideres;
  DROP TRIGGER IF EXISTS trg_log_equipe_operadores_clones ON public.equipe_operadores_clones;

  ALTER TABLE public.equipe_lideres           RENAME TO equipe_lideres_legado;
  ALTER TABLE public.equipe_operadores_clones RENAME TO equipe_operadores_clones_legado;

  REVOKE ALL ON public.equipe_lideres_legado           FROM anon, authenticated;
  REVOKE ALL ON public.equipe_operadores_clones_legado FROM anon, authenticated;

  COMMENT ON TABLE public.equipe_lideres_legado IS
    'Copia congelada de equipe_lideres no dia da fase 7. Ninguem grava nem le. '
    'Sai na fase 8. Ver 20261101120000.';
  COMMENT ON TABLE public.equipe_operadores_clones_legado IS
    'Copia congelada de equipe_operadores_clones no dia da fase 7. Ninguem grava '
    'nem le. Sai na fase 8. Ver 20261101120000.';
END
$legado$;

DROP FUNCTION IF EXISTS public.fn_equipe_membros_espelho_lideres();
DROP FUNCTION IF EXISTS public.fn_equipe_membros_espelho_clones();

-- ── 4. As views ─────────────────────────────────────────────────────────────
-- security_invoker: quem le pela view passa pela RLS de equipe_membros.

CREATE OR REPLACE VIEW public.equipe_lideres
WITH (security_invoker = true) AS
SELECT m.id, m.empresa_id, m.equipe_id, m.pessoa_id AS lider_id, m.criado_por, m.criado_em
  FROM public.equipe_membros m
 WHERE m.papel = 'lider';

CREATE OR REPLACE VIEW public.equipe_operadores_clones
WITH (security_invoker = true) AS
SELECT m.id, m.empresa_id, m.equipe_id, m.pessoa_id AS operador_id, m.criado_por, m.criado_em,
       m.conta_recebimento
  FROM public.equipe_membros m
 WHERE m.papel = 'clone';

ALTER VIEW public.equipe_lideres           ALTER COLUMN id        SET DEFAULT gen_random_uuid();
ALTER VIEW public.equipe_lideres           ALTER COLUMN criado_em SET DEFAULT now();
ALTER VIEW public.equipe_operadores_clones ALTER COLUMN id        SET DEFAULT gen_random_uuid();
ALTER VIEW public.equipe_operadores_clones ALTER COLUMN criado_em SET DEFAULT now();
ALTER VIEW public.equipe_operadores_clones ALTER COLUMN conta_recebimento SET DEFAULT TRUE;

COMMENT ON VIEW public.equipe_lideres IS
  'Os lideres de cada equipe: equipe_membros com papel lider. Grava em '
  'equipe_membros (fn_equipe_vinculo_gravar). Ver 20261101120000.';
COMMENT ON VIEW public.equipe_operadores_clones IS
  'Os clones de cada equipe: equipe_membros com papel clone. Grava em '
  'equipe_membros (fn_equipe_vinculo_gravar). Ver 20261101120000.';

-- ── 5. Gravar pela view ─────────────────────────────────────────────────────
-- SECURITY INVOKER: a RLS de equipe_membros decide quem grava, como a das
-- tabelas antigas decidia. Linha que a RLS filtra devolve NULL (zero linhas),
-- e nao um falso "apagado".

CREATE OR REPLACE FUNCTION public.fn_equipe_vinculo_gravar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_papel   TEXT := TG_ARGV[0];
  v_novo    JSONB;
  v_pessoa  UUID;
  v_conta   BOOLEAN;
  v_empresa UUID;
  v_feitas  INTEGER;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_novo   := to_jsonb(NEW);
    v_pessoa := (v_novo ->> CASE v_papel WHEN 'lider' THEN 'lider_id' ELSE 'operador_id' END)::UUID;
    v_conta  := CASE v_papel WHEN 'clone'
                  THEN COALESCE((v_novo ->> 'conta_recebimento')::BOOLEAN, TRUE)
                  ELSE TRUE END;

    SELECT e.empresa_id INTO v_empresa FROM public.equipes e WHERE e.id = NEW.equipe_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Equipe % nao existe.', NEW.equipe_id USING ERRCODE = '23503';
    END IF;
    IF NEW.empresa_id IS NOT NULL AND NEW.empresa_id IS DISTINCT FROM v_empresa THEN
      RAISE EXCEPTION 'A equipe % nao e da empresa %.', NEW.equipe_id, NEW.empresa_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.equipe_membros
      (id, equipe_id, pessoa_id, papel, empresa_id, conta_recebimento, criado_por, criado_em)
    VALUES
      (COALESCE(NEW.id, gen_random_uuid()), NEW.equipe_id, v_pessoa, v_papel, v_empresa,
       v_conta, NEW.criado_por, COALESCE(NEW.criado_em, now()))
    ON CONFLICT (equipe_id, pessoa_id, papel) DO NOTHING
    RETURNING id, empresa_id, criado_em INTO NEW.id, NEW.empresa_id, NEW.criado_em;
    IF NOT FOUND THEN
      RETURN NULL;   -- ja existia: zero linhas, como o ON CONFLICT DO NOTHING
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    UPDATE public.equipe_membros
       SET equipe_id = NEW.equipe_id, pessoa_id = v_pessoa, empresa_id = v_empresa,
           conta_recebimento = v_conta, criado_por = NEW.criado_por, criado_em = NEW.criado_em,
           id = NEW.id
     WHERE id = OLD.id AND papel = v_papel;
    GET DIAGNOSTICS v_feitas = ROW_COUNT;
    IF v_feitas = 0 THEN
      RETURN NULL;
    END IF;
    NEW.empresa_id := v_empresa;
    RETURN NEW;
  END IF;

  DELETE FROM public.equipe_membros WHERE id = OLD.id AND papel = v_papel;
  GET DIAGNOSTICS v_feitas = ROW_COUNT;
  IF v_feitas = 0 THEN
    RETURN NULL;
  END IF;
  RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION public.fn_equipe_vinculo_gravar() IS
  'Grava em equipe_membros o que chega pelas views equipe_lideres e '
  'equipe_operadores_clones. Argumento: o papel. Ver 20261101120000.';

DROP TRIGGER IF EXISTS trg_equipe_vinculo_gravar ON public.equipe_lideres;
CREATE TRIGGER trg_equipe_vinculo_gravar
  INSTEAD OF INSERT OR UPDATE OR DELETE ON public.equipe_lideres
  FOR EACH ROW EXECUTE FUNCTION public.fn_equipe_vinculo_gravar('lider');

DROP TRIGGER IF EXISTS trg_equipe_vinculo_gravar ON public.equipe_operadores_clones;
CREATE TRIGGER trg_equipe_vinculo_gravar
  INSTEAD OF INSERT OR UPDATE OR DELETE ON public.equipe_operadores_clones
  FOR EACH ROW EXECUTE FUNCTION public.fn_equipe_vinculo_gravar('clone');

-- ── 6. Quem grava ───────────────────────────────────────────────────────────
-- As regras das tabelas antigas (20260823050000 e baseline), em equipe_membros,
-- so para lider e clone: membro vem de perfis.equipe_id pelo espelho.

DROP POLICY IF EXISTS equipe_membros_write_gestao ON public.equipe_membros;
CREATE POLICY equipe_membros_write_gestao ON public.equipe_membros
FOR ALL TO authenticated
USING (
  papel IN ('lider', 'clone')
  AND (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('equipes_gerenciar_composicao'))
)
WITH CHECK (
  papel IN ('lider', 'clone')
  AND (SELECT public.fn_can_access_empresa(empresa_id))
  AND (SELECT public.fn_user_tem('equipes_gerenciar_composicao'))
);

DROP POLICY IF EXISTS equipe_membros_super_admin_total ON public.equipe_membros;
CREATE POLICY equipe_membros_super_admin_total ON public.equipe_membros
FOR ALL TO authenticated
USING (papel IN ('lider', 'clone') AND (SELECT public.fn_user_is_super_admin()))
WITH CHECK (papel IN ('lider', 'clone') AND (SELECT public.fn_user_is_super_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipe_membros          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipe_lideres           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipe_operadores_clones TO authenticated;
GRANT ALL ON public.equipe_lideres           TO service_role;
GRANT ALL ON public.equipe_operadores_clones TO service_role;

-- ── 7. Auditoria ────────────────────────────────────────────────────────────
-- Mesmos rotulos de antes. Gatilho de linha em view so pode ser INSTEAD OF,
-- entao o log fica na tabela, um por papel.

DROP TRIGGER IF EXISTS trg_log_equipe_lideres ON public.equipe_membros;
CREATE TRIGGER trg_log_equipe_lideres
  AFTER INSERT OR UPDATE ON public.equipe_membros
  FOR EACH ROW WHEN (NEW.papel = 'lider')
  EXECUTE FUNCTION public.fn_log_auditoria('seguranca', 'equipe_lideranca', 'a liderança da equipe', '', '', 'empresa_id', 'aviso');

DROP TRIGGER IF EXISTS trg_log_equipe_lideres_sai ON public.equipe_membros;
CREATE TRIGGER trg_log_equipe_lideres_sai
  AFTER DELETE ON public.equipe_membros
  FOR EACH ROW WHEN (OLD.papel = 'lider')
  EXECUTE FUNCTION public.fn_log_auditoria('seguranca', 'equipe_lideranca', 'a liderança da equipe', '', '', 'empresa_id', 'aviso');

DROP TRIGGER IF EXISTS trg_log_equipe_operadores_clones ON public.equipe_membros;
CREATE TRIGGER trg_log_equipe_operadores_clones
  AFTER INSERT OR UPDATE ON public.equipe_membros
  FOR EACH ROW WHEN (NEW.papel = 'clone')
  EXECUTE FUNCTION public.fn_log_auditoria('configuracao', 'equipe_clone', 'o clone de operador', '', '', 'empresa_id', 'info');

DROP TRIGGER IF EXISTS trg_log_equipe_operadores_clones_sai ON public.equipe_membros;
CREATE TRIGGER trg_log_equipe_operadores_clones_sai
  AFTER DELETE ON public.equipe_membros
  FOR EACH ROW WHEN (OLD.papel = 'clone')
  EXECUTE FUNCTION public.fn_log_auditoria('configuracao', 'equipe_clone', 'o clone de operador', '', '', 'empresa_id', 'info');

COMMENT ON TABLE public.equipe_membros IS
  'Em que equipes cada pessoa esta: membro, lider ou clone. Membro vem de '
  'perfis.equipe_id por gatilho; lider e clone sao gravados aqui, direto ou '
  'pelas views equipe_lideres e equipe_operadores_clones. Ver 20261002220000 '
  'e 20261101120000.';

-- ── 8. Prova ────────────────────────────────────────────────────────────────

DO $prova$
DECLARE
  v_n       INTEGER;
  v_equipe  UUID;
  v_pessoa  UUID;
  v_empresa UUID;
  v_id      UUID;
BEGIN
  IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.equipe_lideres')) <> 'v'
     OR (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.equipe_operadores_clones')) <> 'v' THEN
    RAISE EXCEPTION 'As views equipe_lideres / equipe_operadores_clones nao estao no lugar.';
  END IF;

  -- As views devolvem exatamente as linhas das tabelas legado.
  SELECT COUNT(*) INTO v_n FROM (
    (SELECT id, empresa_id, equipe_id, lider_id, criado_por, criado_em FROM public.equipe_lideres_legado
     EXCEPT SELECT id, empresa_id, equipe_id, lider_id, criado_por, criado_em FROM public.equipe_lideres)
    UNION ALL
    (SELECT id, empresa_id, equipe_id, lider_id, criado_por, criado_em FROM public.equipe_lideres
     EXCEPT SELECT id, empresa_id, equipe_id, lider_id, criado_por, criado_em FROM public.equipe_lideres_legado)
  ) x;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'A view equipe_lideres difere da tabela legado em % linha(s).', v_n;
  END IF;

  SELECT COUNT(*) INTO v_n FROM (
    (SELECT id, empresa_id, equipe_id, operador_id, criado_por, criado_em, conta_recebimento
       FROM public.equipe_operadores_clones_legado
     EXCEPT SELECT id, empresa_id, equipe_id, operador_id, criado_por, criado_em, conta_recebimento
       FROM public.equipe_operadores_clones)
    UNION ALL
    (SELECT id, empresa_id, equipe_id, operador_id, criado_por, criado_em, conta_recebimento
       FROM public.equipe_operadores_clones
     EXCEPT SELECT id, empresa_id, equipe_id, operador_id, criado_por, criado_em, conta_recebimento
       FROM public.equipe_operadores_clones_legado)
  ) x;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'A view equipe_operadores_clones difere da tabela legado em % linha(s).', v_n;
  END IF;

  -- As legado nao tem mais gatilho nenhum.
  SELECT COUNT(*) INTO v_n FROM pg_trigger
   WHERE tgrelid IN ('public.equipe_lideres_legado'::REGCLASS,
                     'public.equipe_operadores_clones_legado'::REGCLASS)
     AND NOT tgisinternal;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'As tabelas legado ainda tem % gatilho(s).', v_n;
  END IF;

  -- Um clone gravado pela view entra em equipe_membros e sai ao apagar.
  -- Feito dentro de um bloco que se desfaz: nada fica gravado.
  SELECT e.id, p.id, e.empresa_id INTO v_equipe, v_pessoa, v_empresa
    FROM public.equipes e
    JOIN public.perfis p ON p.empresa_id = e.empresa_id
   WHERE NOT EXISTS (SELECT 1 FROM public.equipe_membros m
                      WHERE m.equipe_id = e.id AND m.pessoa_id = p.id AND m.papel = 'clone')
   LIMIT 1;

  IF v_equipe IS NOT NULL THEN
    BEGIN
      INSERT INTO public.equipe_operadores_clones (empresa_id, equipe_id, operador_id, conta_recebimento)
      VALUES (v_empresa, v_equipe, v_pessoa, FALSE)
      RETURNING id INTO v_id;
      IF v_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.equipe_membros
                                      WHERE id = v_id AND papel = 'clone' AND NOT conta_recebimento) THEN
        RAISE EXCEPTION 'Gravar pela view nao chegou em equipe_membros.';
      END IF;

      INSERT INTO public.equipe_operadores_clones (empresa_id, equipe_id, operador_id)
      VALUES (v_empresa, v_equipe, v_pessoa)
      ON CONFLICT DO NOTHING;

      UPDATE public.equipe_operadores_clones SET conta_recebimento = TRUE WHERE id = v_id;
      IF NOT (SELECT conta_recebimento FROM public.equipe_membros WHERE id = v_id) THEN
        RAISE EXCEPTION 'Editar pela view nao chegou em equipe_membros.';
      END IF;

      DELETE FROM public.equipe_operadores_clones WHERE id = v_id;
      IF EXISTS (SELECT 1 FROM public.equipe_membros WHERE id = v_id) THEN
        RAISE EXCEPTION 'Apagar pela view nao chegou em equipe_membros.';
      END IF;

      RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'ensaio ok';
    EXCEPTION
      WHEN SQLSTATE 'P0099' THEN NULL;   -- desfaz o ensaio, segue
    END;
  END IF;
END
$prova$;

COMMIT;
