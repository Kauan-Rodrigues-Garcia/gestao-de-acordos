-- ============================================================================
-- Campanhas de WhatsApp: o operador recebe a campanha numa aba, sem planilha
-- ============================================================================
--
-- ## O pedido (Cleber, 07/10/2026)
--
-- «Cada operador vai receber a sua campanha numa aba Campanhas de WhatsApp,
--  direto no gestão, sem baixar planilha. Um menu mostrando cada campanha e
--  cada mensagem, podendo editar a mensagem individualmente, com um botão de
--  enviar no WhatsApp que abre com a mensagem pronta no número cadastrado. Fica
--  registrado o que ele já enviou e o que não deu para enviar. Enviado é a
--  partir do momento que ele clica para enviar.»
--
-- ## O que existia (20260929100000)
--
-- `campanha_facil_envios`: uma linha por operador por liberação, com a parte
-- dele inteira em `linhas` (jsonb). O operador baixava um .xlsx montado no
-- navegador a partir dela. Não havia estado por mensagem.
--
-- ## O que muda
--
-- • `campanha_facil_contatos`: UMA LINHA POR MENSAGEM, filha do envio. Leva o
--   que a aba mostra (nome, contrato, empresa, telefone, mensagem, pendências)
--   e o estado: `pendente` → `enviado` (no clique em «Enviar no WhatsApp») ou
--   `nao_enviado` (a pessoa marca). `mensagem_editada` guarda a edição da
--   pessoa sem perder a original. CPF NÃO vem: a aba não precisa dele.
--
-- • `empresa_id`, `operador_id`, `criado_por` e `expira_em` são cópia do envio,
--   preenchida por gatilho — o navegador manda só o conteúdo. Ficam na linha
--   para as policies não precisarem de JOIN por linha.
--
-- • `campanha_facil_envios.linhas` deixa de ser obrigatória: envio novo não
--   carrega mais a planilha. Os envios ainda válidos ganham os contatos a
--   partir das `linhas` (abaixo), para quem já recebeu ver na aba nova.
--
-- • `fn_campanha_facil_progresso`: quantos enviados / não enviados por envio,
--   para a lista do operador e o painel do líder. SECURITY INVOKER: cada um só
--   conta o que as policies deixam ver.
--
-- • Chave nova `ver_campanhas_whatsapp` (aba do operador). Só BookPlay, como a
--   Campanha Fácil. Nasce ligada para o cargo `operador`.
--
-- ## Quem faz o quê (RLS)
--
-- • Operador: LÊ as próprias mensagens não vencidas e ALTERA só `status`,
--   `mensagem_editada` e `enviado_em` (grant por coluna).
-- • Líder: grava mensagens nos envios que ELE criou, lê e apaga as que criou
--   (o repasse move as pendentes de quem faltou para quem ficou).
-- • A validade (2 dias) e a faxina de hora em hora seguem as do envio: apagar
--   o envio apaga as mensagens (ON DELETE CASCADE).
--
-- Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. O envio não carrega mais a planilha ──────────────────────────────────

ALTER TABLE public.campanha_facil_envios ALTER COLUMN linhas DROP NOT NULL;

-- ── 2. As mensagens ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campanha_facil_contatos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envio_id         UUID NOT NULL REFERENCES public.campanha_facil_envios(id) ON DELETE CASCADE,
  -- Cópia do envio, pelo gatilho abaixo.
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  operador_id      UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  criado_por       UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  expira_em        TIMESTAMPTZ NOT NULL,
  -- Posição na campanha (a ordem do rodízio).
  ordem            INTEGER NOT NULL,
  nome             TEXT NOT NULL DEFAULT '',
  contrato         TEXT,
  empresa_cliente  TEXT,
  telefone         TEXT,
  -- Só dígitos, com o 55 — o que vai no link do WhatsApp. NULL = sem número.
  whatsapp         TEXT,
  mensagem         TEXT NOT NULL DEFAULT '',
  mensagem_editada TEXT,
  pendencias       TEXT[] NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'pendente'
                   CHECK (status IN ('pendente', 'enviado', 'nao_enviado')),
  enviado_em       TIMESTAMPTZ,
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.campanha_facil_contatos IS
  'Uma mensagem da campanha de WhatsApp de um operador (aba Campanhas de WhatsApp). '
  'Filha de campanha_facil_envios; status pendente/enviado/nao_enviado. Ver 20261007150000.';

CREATE INDEX IF NOT EXISTS idx_cf_contatos_envio    ON public.campanha_facil_contatos (envio_id, ordem);
CREATE INDEX IF NOT EXISTS idx_cf_contatos_operador ON public.campanha_facil_contatos (operador_id);
CREATE INDEX IF NOT EXISTS idx_cf_contatos_criador  ON public.campanha_facil_contatos (criado_por);

-- Na inserção, o que é do envio vem do envio — o navegador não escolhe dono,
-- empresa nem validade.
CREATE OR REPLACE FUNCTION public.fn_cf_contatos_do_envio()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE e RECORD;
BEGIN
  SELECT empresa_id, operador_id, criado_por, expira_em INTO e
    FROM public.campanha_facil_envios WHERE id = NEW.envio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Envio % não encontrado.', NEW.envio_id;
  END IF;
  NEW.empresa_id  := e.empresa_id;
  NEW.operador_id := e.operador_id;
  NEW.criado_por  := e.criado_por;
  NEW.expira_em   := e.expira_em;
  NEW.status      := 'pendente';
  NEW.enviado_em  := NULL;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cf_contatos_do_envio ON public.campanha_facil_contatos;
CREATE TRIGGER trg_cf_contatos_do_envio
  BEFORE INSERT ON public.campanha_facil_contatos
  FOR EACH ROW EXECUTE FUNCTION public.fn_cf_contatos_do_envio();

-- Na alteração: carimbo, hora do envio, e edição igual à original vira NULL.
CREATE OR REPLACE FUNCTION public.fn_cf_contatos_ao_alterar()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.atualizado_em := now();
  IF NEW.status = 'enviado' AND OLD.status IS DISTINCT FROM 'enviado' THEN
    NEW.enviado_em := now();
  ELSIF NEW.status <> 'enviado' THEN
    NEW.enviado_em := NULL;
  END IF;
  IF NEW.mensagem_editada IS NOT NULL
     AND (btrim(NEW.mensagem_editada) = '' OR NEW.mensagem_editada = NEW.mensagem) THEN
    NEW.mensagem_editada := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cf_contatos_ao_alterar ON public.campanha_facil_contatos;
CREATE TRIGGER trg_cf_contatos_ao_alterar
  BEFORE UPDATE ON public.campanha_facil_contatos
  FOR EACH ROW EXECUTE FUNCTION public.fn_cf_contatos_ao_alterar();

ALTER TABLE public.campanha_facil_contatos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cf_contatos_select ON public.campanha_facil_contatos;
CREATE POLICY cf_contatos_select ON public.campanha_facil_contatos
  FOR SELECT TO authenticated
  USING (
    expira_em > now()
    AND (operador_id = (SELECT auth.uid()) OR criado_por = (SELECT auth.uid()))
  );

-- O gatilho já copiou `criado_por` do envio: só passa quem criou o envio.
DROP POLICY IF EXISTS cf_contatos_insert ON public.campanha_facil_contatos;
CREATE POLICY cf_contatos_insert ON public.campanha_facil_contatos
  FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = (SELECT auth.uid())
    AND (SELECT public.fn_user_tem('ver_campanha_facil'))
  );

DROP POLICY IF EXISTS cf_contatos_update ON public.campanha_facil_contatos;
CREATE POLICY cf_contatos_update ON public.campanha_facil_contatos
  FOR UPDATE TO authenticated
  USING (operador_id = (SELECT auth.uid()) AND expira_em > now())
  WITH CHECK (operador_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS cf_contatos_delete ON public.campanha_facil_contatos;
CREATE POLICY cf_contatos_delete ON public.campanha_facil_contatos
  FOR DELETE TO authenticated
  USING (criado_por = (SELECT auth.uid()));

REVOKE ALL ON public.campanha_facil_contatos FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.campanha_facil_contatos TO authenticated;
GRANT UPDATE (status, mensagem_editada, enviado_em) ON public.campanha_facil_contatos TO authenticated;

-- ── 3. O progresso de cada envio ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_campanha_facil_progresso(p_envios UUID[])
RETURNS TABLE(envio_id UUID, total INTEGER, enviados INTEGER, nao_enviados INTEGER)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $function$
  SELECT c.envio_id,
         count(*)::INTEGER,
         count(*) FILTER (WHERE c.status = 'enviado')::INTEGER,
         count(*) FILTER (WHERE c.status = 'nao_enviado')::INTEGER
    FROM public.campanha_facil_contatos c
   WHERE c.envio_id = ANY(p_envios)
   GROUP BY c.envio_id;
$function$;

COMMENT ON FUNCTION public.fn_campanha_facil_progresso(UUID[]) IS
  'Total, enviados e não enviados por envio da Campanha Fácil. SECURITY INVOKER: respeita as policies. Ver 20261007150000.';

REVOKE ALL ON FUNCTION public.fn_campanha_facil_progresso(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_progresso(UUID[]) TO authenticated;

-- ── 4. Os envios ainda válidos ganham as mensagens ──────────────────────────

INSERT INTO public.campanha_facil_contatos
  (envio_id, empresa_id, operador_id, criado_por, expira_em, ordem,
   nome, contrato, empresa_cliente, telefone, whatsapp, mensagem, pendencias)
SELECT e.id, e.empresa_id, e.operador_id, e.criado_por, e.expira_em, l.ord::INTEGER,
       COALESCE(l.v ->> 'name', ''),
       NULLIF(btrim(l.v ->> 'contract'), ''),
       NULLIF(btrim(l.v ->> 'company'), ''),
       NULLIF(btrim(l.v ->> 'phone'), ''),
       CASE WHEN length(d.digitos) IN (10, 11) THEN '55' || d.digitos
            WHEN length(d.digitos) IN (12, 13) THEN d.digitos
       END,
       COALESCE(l.v ->> 'message', ''),
       COALESCE(ARRAY(
         SELECT jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(l.v -> 'issues') = 'array' THEN l.v -> 'issues' ELSE '[]'::jsonb END)
       ), '{}')
  FROM public.campanha_facil_envios e
 CROSS JOIN LATERAL jsonb_array_elements(e.linhas) WITH ORDINALITY AS l(v, ord)
 CROSS JOIN LATERAL (SELECT regexp_replace(COALESCE(l.v ->> 'phone', ''), '\D', '', 'g') AS digitos) d
 WHERE e.expira_em > now()
   AND jsonb_typeof(e.linhas) = 'array'
   AND NOT EXISTS (SELECT 1 FROM public.campanha_facil_contatos c WHERE c.envio_id = e.id);

-- ── 5. A chave da aba ───────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_campanhas_whatsapp_20261007()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_campanhas_whatsapp_20261007;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_campanhas_whatsapp_20261007() IS
  'Retrato do catalogo antes de ver_campanhas_whatsapp (07/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_campanhas_whatsapp_20261007()
  UNION ALL
  SELECT * FROM (VALUES
    -- A aba do operador: recebe a parte dele da campanha e envia pelo WhatsApp.
    ('ver_campanhas_whatsapp', ARRAY['bookplay']::TEXT[], ARRAY['operador']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261007150000 soma ver_campanhas_whatsapp.';

-- Nasce ligada para o operador da BookPlay (quem recebe a campanha); o resto
-- nasce desligado e o painel decide.
UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object('ver_campanhas_whatsapp', true)
 WHERE cp.empresa_id IN (SELECT e.id FROM public.empresas e WHERE e.slug = 'bookplay')
   AND cp.cargo = 'operador'
   AND NOT (cp.permissoes ? 'ver_campanhas_whatsapp');

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ── 6. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
DECLARE n_envios INTEGER; n_sem INTEGER;
BEGIN
  IF to_regclass('public.campanha_facil_contatos') IS NULL THEN
    RAISE EXCEPTION 'A tabela campanha_facil_contatos não foi criada.';
  END IF;

  IF has_table_privilege('authenticated', 'public.campanha_facil_contatos', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.campanha_facil_contatos', 'status', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.campanha_facil_contatos', 'mensagem', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.campanha_facil_contatos', 'operador_id', 'UPDATE') THEN
    RAISE EXCEPTION 'O operador pode alterar mais do que status e edição da mensagem.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_campanhas_whatsapp') THEN
    RAISE EXCEPTION 'A chave nova nao entrou no catalogo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_campanha_facil')
     OR NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_calendario') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: chaves antigas sumiram.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp
      JOIN public.empresas e ON e.id = cp.empresa_id AND e.slug = 'bookplay'
     WHERE cp.cargo = 'operador'
       AND (cp.permissoes ->> 'ver_campanhas_whatsapp')::boolean IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'O operador da BookPlay ficou sem a aba Campanhas de WhatsApp.';
  END IF;

  -- Todo envio válido com planilha ganhou as mensagens.
  SELECT count(*) INTO n_envios FROM public.campanha_facil_envios e
   WHERE e.expira_em > now() AND jsonb_typeof(e.linhas) = 'array' AND jsonb_array_length(e.linhas) > 0;
  SELECT count(*) INTO n_sem FROM public.campanha_facil_envios e
   WHERE e.expira_em > now() AND jsonb_typeof(e.linhas) = 'array' AND jsonb_array_length(e.linhas) > 0
     AND NOT EXISTS (SELECT 1 FROM public.campanha_facil_contatos c WHERE c.envio_id = e.id);
  IF n_sem > 0 THEN
    RAISE EXCEPTION '% de % envios válidos ficaram sem mensagens.', n_sem, n_envios;
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261007150000', 'campanhas_whatsapp', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
