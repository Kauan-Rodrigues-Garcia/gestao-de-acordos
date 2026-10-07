-- ============================================================================
-- Campanhas de WhatsApp: histórico, desativar/editar/relançar, excluir, Fone 2
-- e o 403 ao liberar
-- ============================================================================
--
-- ## O erro (Cleber, 07/10/2026)
--
-- «Liberar» devolvia 403: `new row violates row-level security policy for
-- table "campanha_facil_envios"`. A policy de INSERT (20260929100000) exige
-- `empresa_id = fn_user_empresa_id()` — a empresa DE CASA de quem libera — e
-- `fn_user_tem` lê o mapa de cargos da empresa de casa. Quem tem acesso a mais
-- de uma empresa e libera na BookPlay (a tela usa a empresa ATIVA) era barrado.
--
-- Agora quem grava envio é o banco, por RPC (`fn_campanha_facil_*`), e a
-- permissão é `fn_cf_pode_liberar(empresa)`: super admin, ou empresa acessível
-- com `ver_campanha_facil` (no mapa de casa OU no da empresa da campanha — o
-- mesmo mapa que a tela usa). O INSERT direto em `campanha_facil_envios` sai.
--
-- ## O pedido
--
-- «O líder acompanha quantas campanhas enviou por mês, com um resumo de cada
--  uma: a mensagem usada e tudo mais. Para cada campanha, quem encaminhou,
--  quantas, se faltou alguma — com um botão de atualizar. Botão de excluir. E
--  um de desativar o acesso: some na hora para todo mundo, o líder edita (a
--  mensagem e quem recebe) e relança.»
--
-- «O que foi copiado ou enviado no botão do WhatsApp fica preso com a pessoa:
--  na redistribuição, as presas voltam para os donos e cada um recebe só o que
--  falta para todos ficarem com a mesma quantidade (aproximadamente).»
--
-- ## O que muda
--
-- • `campanha_facil_lotes`: UMA LINHA POR CAMPANHA. É o histórico — não vence.
--   Guarda título, a mensagem-modelo, o setor, o total e, quando a campanha
--   encerra, o PLACAR por operador congelado (`placar`). Os contatos (nome,
--   telefone) continuam saindo com a faxina: o histórico não guarda dado de
--   cliente.
--
-- • `ativa` em lote, envio e contato (cópia, para a policy não fazer JOIN por
--   linha). Desativada, a campanha some para o operador: ele não lê nem marca.
--   A aba aberta tira a campanha na hora pelo sinal `campanhas:<operador>`.
--
-- • `variaveis` no contato: os valores do modelo ({{nome}}, {{quitacao}}, …)
--   sem CPF. É o que deixa o líder trocar a mensagem e o banco refazer o texto
--   dos pendentes (`fn_cf_renderizar`).
--
-- • `telefone2` / `whatsapp2`: o segundo número do relatório.
--
-- • Relançar renova os 2 dias. Desativada há mais de 2 dias, encerra.
--
-- Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Quem pode liberar ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cf_pode_liberar(p_empresa UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_user_is_super_admin()
      OR (
        p_empresa = ANY (public.fn_empresas_acessiveis())
        AND (
          public.fn_user_tem('ver_campanha_facil')
          OR EXISTS (
            SELECT 1
              FROM public.perfis p
              JOIN public.cargos_permissoes cp
                ON cp.empresa_id = p_empresa AND cp.cargo = p.perfil
             WHERE p.id = (SELECT auth.uid())
               AND COALESCE((cp.permissoes ->> 'ver_campanha_facil')::BOOLEAN, FALSE)
          )
        )
      );
$function$;

COMMENT ON FUNCTION public.fn_cf_pode_liberar(UUID) IS
  'Quem libera campanha na empresa: super admin, ou empresa acessível com ver_campanha_facil '
  '(mapa de casa ou o da empresa). Ver 20261007190000.';

REVOKE ALL ON FUNCTION public.fn_cf_pode_liberar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cf_pode_liberar(UUID) TO authenticated;

-- ── 2. A campanha (o histórico) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campanha_facil_lotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id        UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  setor_nome      TEXT,
  titulo          TEXT NOT NULL,
  arquivo_nome    TEXT NOT NULL DEFAULT '',
  -- O modelo com as variáveis. NULL nas campanhas de antes desta migration.
  modelo          TEXT,
  -- Relatório sem colunas de valor (245): o modelo não pode citar valores.
  sem_valores     BOOLEAN NOT NULL DEFAULT FALSE,
  total           INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  ativa           BOOLEAN NOT NULL DEFAULT FALSE,
  lancada_em      TIMESTAMPTZ,
  desativada_em   TIMESTAMPTZ,
  relancada_em    TIMESTAMPTZ,
  editada_em      TIMESTAMPTZ,
  criado_por      UUID NOT NULL DEFAULT auth.uid() REFERENCES public.perfis(id) ON DELETE CASCADE,
  criado_por_nome TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 days'),
  -- A faxina congela o placar e apaga os contatos.
  encerrada_em    TIMESTAMPTZ,
  -- [{operador_id, nome, total, enviados, nao_enviados}]
  placar          JSONB
);

COMMENT ON TABLE public.campanha_facil_lotes IS
  'Uma campanha de WhatsApp liberada na Campanha Fácil — o histórico do líder. Não vence: '
  'a faxina congela o placar e apaga só os contatos. Ver 20261007190000.';

CREATE INDEX IF NOT EXISTS idx_cf_lotes_criador ON public.campanha_facil_lotes (criado_por, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cf_lotes_abertos ON public.campanha_facil_lotes (expira_em) WHERE encerrada_em IS NULL;

ALTER TABLE public.campanha_facil_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cf_lotes_select ON public.campanha_facil_lotes;
CREATE POLICY cf_lotes_select ON public.campanha_facil_lotes
  FOR SELECT TO authenticated
  USING (criado_por = (SELECT auth.uid()));

-- Escrita só pelas funções abaixo.
REVOKE ALL ON public.campanha_facil_lotes FROM anon, authenticated;
GRANT SELECT ON public.campanha_facil_lotes TO authenticated;

-- As liberações de antes viram campanhas. `total` = o que está nas abas.
INSERT INTO public.campanha_facil_lotes
  (id, empresa_id, setor_id, setor_nome, titulo, arquivo_nome, total, ativa,
   lancada_em, criado_por, criado_por_nome, criado_em, expira_em)
SELECT e.lote_id,
       (array_agg(e.empresa_id ORDER BY e.criado_em))[1],
       (array_agg(e.setor_id ORDER BY e.criado_em))[1],
       (SELECT s.nome FROM public.setores s WHERE s.id = (array_agg(e.setor_id ORDER BY e.criado_em))[1]),
       (array_agg(e.titulo ORDER BY e.criado_em))[1],
       (array_agg(e.arquivo_nome ORDER BY e.criado_em))[1],
       COALESCE((SELECT count(*) FROM public.campanha_facil_contatos c
                  JOIN public.campanha_facil_envios e2 ON e2.id = c.envio_id
                 WHERE e2.lote_id = e.lote_id), 0)::INTEGER,
       TRUE,
       min(e.criado_em),
       (array_agg(e.criado_por ORDER BY e.criado_em))[1],
       (array_agg(e.criado_por_nome ORDER BY e.criado_em))[1],
       min(e.criado_em),
       min(e.expira_em)
  FROM public.campanha_facil_envios e
 WHERE NOT EXISTS (SELECT 1 FROM public.campanha_facil_lotes l WHERE l.id = e.lote_id)
 GROUP BY e.lote_id;

-- ── 3. Envio e contato ganham o que a campanha nova precisa ────────────────

ALTER TABLE public.campanha_facil_envios ADD COLUMN IF NOT EXISTS ativa BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cf_envios_lote_fk') THEN
    ALTER TABLE public.campanha_facil_envios
      ADD CONSTRAINT cf_envios_lote_fk FOREIGN KEY (lote_id)
      REFERENCES public.campanha_facil_lotes(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cf_envios_lote ON public.campanha_facil_envios (lote_id);

ALTER TABLE public.campanha_facil_contatos ADD COLUMN IF NOT EXISTS ativa     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.campanha_facil_contatos ADD COLUMN IF NOT EXISTS telefone2 TEXT;
ALTER TABLE public.campanha_facil_contatos ADD COLUMN IF NOT EXISTS whatsapp2 TEXT;
-- Os valores do modelo, SEM CPF. NULL nos contatos de antes.
ALTER TABLE public.campanha_facil_contatos ADD COLUMN IF NOT EXISTS variaveis JSONB;

-- Na inserção, o que é do envio vem do envio (agora também `ativa`).
CREATE OR REPLACE FUNCTION public.fn_cf_contatos_do_envio()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE e RECORD;
BEGIN
  SELECT empresa_id, operador_id, criado_por, expira_em, ativa INTO e
    FROM public.campanha_facil_envios WHERE id = NEW.envio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Envio % não encontrado.', NEW.envio_id;
  END IF;
  NEW.empresa_id  := e.empresa_id;
  NEW.operador_id := e.operador_id;
  NEW.criado_por  := e.criado_por;
  NEW.expira_em   := e.expira_em;
  NEW.ativa       := e.ativa;
  NEW.status      := 'pendente';
  NEW.enviado_em  := NULL;
  NEW.atualizado_em := now();
  -- CPF nunca entra, nem pelas variáveis.
  IF NEW.variaveis IS NOT NULL THEN
    NEW.variaveis := NEW.variaveis - 'cpf';
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 4. Policies: o operador só vê campanha ativa; quem criou vê sempre ─────

DROP POLICY IF EXISTS cf_envios_select ON public.campanha_facil_envios;
CREATE POLICY cf_envios_select ON public.campanha_facil_envios
  FOR SELECT TO authenticated
  USING (
    (operador_id = (SELECT auth.uid()) AND ativa AND expira_em > now())
    OR criado_por = (SELECT auth.uid())
  );

-- Envio novo só pelas funções (ver o cabeçalho: era aqui o 403).
DROP POLICY IF EXISTS cf_envios_insert ON public.campanha_facil_envios;
REVOKE INSERT ON public.campanha_facil_envios FROM authenticated;

DROP POLICY IF EXISTS cf_contatos_select ON public.campanha_facil_contatos;
CREATE POLICY cf_contatos_select ON public.campanha_facil_contatos
  FOR SELECT TO authenticated
  USING (
    (operador_id = (SELECT auth.uid()) AND ativa AND expira_em > now())
    OR criado_por = (SELECT auth.uid())
  );

-- O gatilho copiou `criado_por` do envio, e envio só nasce pela função, que
-- confere a permissão: basta ser de quem criou.
DROP POLICY IF EXISTS cf_contatos_insert ON public.campanha_facil_contatos;
CREATE POLICY cf_contatos_insert ON public.campanha_facil_contatos
  FOR INSERT TO authenticated
  WITH CHECK (criado_por = (SELECT auth.uid()));

DROP POLICY IF EXISTS cf_contatos_update ON public.campanha_facil_contatos;
CREATE POLICY cf_contatos_update ON public.campanha_facil_contatos
  FOR UPDATE TO authenticated
  USING (operador_id = (SELECT auth.uid()) AND ativa AND expira_em > now())
  WITH CHECK (operador_id = (SELECT auth.uid()));

-- ── 5. O texto a partir do modelo ───────────────────────────────────────────
--
-- Espelha `renderTemplate` (campaign-core.js): {{ chave }} vira o valor; chave
-- sem valor vira vazio.

CREATE OR REPLACE FUNCTION public.fn_cf_renderizar(p_modelo TEXT, p_vars JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_texto TEXT := regexp_replace(COALESCE(p_modelo, ''), '\{\{\s*([A-Za-z0-9_]+)\s*\}\}', '{{\1}}', 'g');
  v_chave TEXT;
  v_valor TEXT;
BEGIN
  IF p_vars IS NOT NULL AND jsonb_typeof(p_vars) = 'object' THEN
    FOR v_chave, v_valor IN SELECT key, value FROM jsonb_each_text(p_vars) LOOP
      v_texto := replace(v_texto, '{{' || v_chave || '}}', COALESCE(v_valor, ''));
    END LOOP;
  END IF;
  RETURN regexp_replace(v_texto, '\{\{[A-Za-z0-9_]+\}\}', '', 'g');
END;
$function$;

-- ── 6. Avisar ───────────────────────────────────────────────────────────────

-- Notificação para cada operador dos envios dados, com o que ele tem pendente.
CREATE OR REPLACE FUNCTION public.fn_cf_avisar(p_envios UUID[], p_titulo TEXT, p_frase TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_n INTEGER;
BEGIN
  INSERT INTO public.notificacoes
    (usuario_id, empresa_id, titulo, mensagem, rota, autor_id, autor_nome, autor_foto)
  SELECT DISTINCT ON (e.operador_id)
         e.operador_id, e.empresa_id, p_titulo,
         e.titulo || ' · ' || x.pendentes::TEXT || ' '
           || CASE WHEN x.pendentes = 1 THEN 'mensagem' ELSE 'mensagens' END
           || ' ' || p_frase,
         '/campanhas-whatsapp?envio=' || e.id::TEXT,
         e.criado_por, a.nome, a.foto_url
    FROM public.campanha_facil_envios e
    JOIN LATERAL (
      SELECT count(*) FILTER (WHERE c.status = 'pendente') AS pendentes
        FROM public.campanha_facil_contatos c
        JOIN public.campanha_facil_envios e2 ON e2.id = c.envio_id
       WHERE e2.lote_id = e.lote_id AND e2.operador_id = e.operador_id
    ) x ON x.pendentes > 0
    LEFT JOIN public.perfis a ON a.id = e.criado_por
   WHERE e.id = ANY (p_envios)
   ORDER BY e.operador_id, e.repasse, e.criado_em;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cf_avisar(UUID[], TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Sinal para a aba aberta de cada operador da campanha («some na hora»).
CREATE OR REPLACE FUNCTION public.fn_cf_sinalizar(p_lote UUID, p_operacao TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_op UUID;
BEGIN
  FOR v_op IN
    SELECT DISTINCT e.operador_id FROM public.campanha_facil_envios e WHERE e.lote_id = p_lote
  LOOP
    PERFORM realtime.send(
      jsonb_build_object('lote_id', p_lote, 'operacao', p_operacao),
      'mudou',
      'campanhas:' || v_op::TEXT,
      TRUE);
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cf_sinalizar(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- O canal privado `campanhas:<usuario>`: só o dono ouve.
DROP POLICY IF EXISTS campanhas_sinal_receber ON realtime.messages;
CREATE POLICY campanhas_sinal_receber ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    extension = 'broadcast'
    AND split_part((SELECT realtime.topic()), ':', 1) = 'campanhas'
    AND (SELECT public.fn_realtime_posso_ouvir_usuario((SELECT realtime.topic())))
  );

-- ── 7. As ações do líder ────────────────────────────────────────────────────

-- A campanha nasce DESATIVADA: os contatos entram e só então ela é lançada
-- (`fn_campanha_facil_lote_ativar`), que avisa os operadores.
CREATE OR REPLACE FUNCTION public.fn_campanha_facil_lote_criar(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa UUID := (p ->> 'empresa_id')::UUID;
  v_setor   UUID := NULLIF(p ->> 'setor_id', '')::UUID;
  v_id      UUID;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre de novo.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_cf_pode_liberar(v_empresa) THEN
    RAISE EXCEPTION 'Você não tem permissão para liberar campanha nesta empresa.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.campanha_facil_lotes
    (empresa_id, setor_id, setor_nome, titulo, arquivo_nome, modelo, sem_valores, total,
     ativa, criado_por, criado_por_nome)
  VALUES (
    v_empresa, v_setor,
    (SELECT s.nome FROM public.setores s WHERE s.id = v_setor),
    left(COALESCE(NULLIF(btrim(p ->> 'titulo'), ''), 'Campanha'), 200),
    left(COALESCE(p ->> 'arquivo_nome', ''), 300),
    NULLIF(p ->> 'modelo', ''),
    COALESCE((p ->> 'sem_valores')::BOOLEAN, FALSE),
    GREATEST(COALESCE((p ->> 'total')::INTEGER, 0), 0),
    FALSE,
    (SELECT auth.uid()),
    (SELECT pf.nome FROM public.perfis pf WHERE pf.id = (SELECT auth.uid()))
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- Um envio por operador. `p_partes` = [{operador_id, operador_nome, qtd}].
-- Serve à liberação e ao repasse; o envio herda `ativa` e a validade da campanha.
CREATE OR REPLACE FUNCTION public.fn_campanha_facil_envios_criar(p_lote UUID, p_partes JSONB, p_repasse BOOLEAN)
RETURNS TABLE(operador UUID, envio UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE l public.campanha_facil_lotes%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.campanha_facil_lotes
   WHERE id = p_lote AND criado_por = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF l.encerrada_em IS NOT NULL THEN
    RAISE EXCEPTION 'Esta campanha já encerrou.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_partes) x
      LEFT JOIN public.perfis pf
        ON pf.id = (x ->> 'operador_id')::UUID AND pf.empresa_id = l.empresa_id
     WHERE pf.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Há operador de fora da empresa na lista.';
  END IF;

  RETURN QUERY
  INSERT INTO public.campanha_facil_envios AS e
    (empresa_id, lote_id, setor_id, operador_id, operador_nome, titulo, arquivo_nome,
     qtd, linhas, repasse, criado_por, criado_por_nome, expira_em, ativa)
  SELECT l.empresa_id, l.id, l.setor_id, pf.id,
         COALESCE(NULLIF(x ->> 'operador_nome', ''), pf.nome, ''),
         l.titulo, l.arquivo_nome,
         GREATEST(COALESCE((x ->> 'qtd')::INTEGER, 0), 0),
         NULL, COALESCE(p_repasse, FALSE), l.criado_por, l.criado_por_nome, l.expira_em, l.ativa
    FROM jsonb_array_elements(p_partes) x
    JOIN public.perfis pf ON pf.id = (x ->> 'operador_id')::UUID
  RETURNING e.operador_id, e.id;
END;
$function$;

-- Lançar / relançar (p_ativa = true) ou desativar (false).
CREATE OR REPLACE FUNCTION public.fn_campanha_facil_lote_ativar(p_lote UUID, p_ativa BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  l          public.campanha_facil_lotes%ROWTYPE;
  v_expira   TIMESTAMPTZ := now() + INTERVAL '2 days';
  v_primeira BOOLEAN;
  v_envios   UUID[];
BEGIN
  SELECT * INTO l FROM public.campanha_facil_lotes
   WHERE id = p_lote AND criado_por = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF l.encerrada_em IS NOT NULL THEN
    RAISE EXCEPTION 'Esta campanha já encerrou e não pode ser reativada.';
  END IF;

  IF p_ativa THEN
    IF l.ativa THEN RETURN; END IF;
    SELECT array_agg(e.id) INTO v_envios FROM public.campanha_facil_envios e WHERE e.lote_id = l.id;
    IF v_envios IS NULL THEN
      RAISE EXCEPTION 'A campanha não tem mensagens.';
    END IF;
    v_primeira := l.lancada_em IS NULL;

    UPDATE public.campanha_facil_lotes
       SET ativa = TRUE, desativada_em = NULL, expira_em = v_expira,
           lancada_em = COALESCE(lancada_em, now()),
           relancada_em = CASE WHEN v_primeira THEN NULL ELSE now() END
     WHERE id = l.id;
    UPDATE public.campanha_facil_envios SET ativa = TRUE, expira_em = v_expira WHERE lote_id = l.id;
    UPDATE public.campanha_facil_contatos c SET ativa = TRUE, expira_em = v_expira
      FROM public.campanha_facil_envios e
     WHERE e.id = c.envio_id AND e.lote_id = l.id;

    IF v_primeira THEN
      PERFORM public.fn_cf_avisar(v_envios, 'Campanha de WhatsApp pronta', 'para você enviar.');
    ELSE
      PERFORM public.fn_cf_avisar(v_envios, 'Campanha de WhatsApp liberada de novo',
                                  'para você enviar. O líder atualizou a campanha.');
    END IF;
    PERFORM public.fn_cf_sinalizar(l.id, 'ativada');
  ELSE
    IF NOT l.ativa THEN RETURN; END IF;
    UPDATE public.campanha_facil_lotes SET ativa = FALSE, desativada_em = now() WHERE id = l.id;
    UPDATE public.campanha_facil_envios SET ativa = FALSE WHERE lote_id = l.id;
    UPDATE public.campanha_facil_contatos c SET ativa = FALSE
      FROM public.campanha_facil_envios e
     WHERE e.id = c.envio_id AND e.lote_id = l.id;
    PERFORM public.fn_cf_sinalizar(l.id, 'desativada');
  END IF;
END;
$function$;

-- O repasse grava envios numa campanha já lançada: avisa quem recebeu.
CREATE OR REPLACE FUNCTION public.fn_campanha_facil_avisar_repasse(p_envios UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.campanha_facil_envios e
     WHERE e.id = ANY (p_envios) AND e.criado_por IS DISTINCT FROM (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_cf_avisar(
    ARRAY(SELECT e.id FROM public.campanha_facil_envios e WHERE e.id = ANY (p_envios) AND e.ativa),
    'Campanha de WhatsApp repassada', 'para você enviar (repasse de quem faltou).');
END;
$function$;

-- Excluir: some das abas e do histórico.
CREATE OR REPLACE FUNCTION public.fn_campanha_facil_lote_excluir(p_lote UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.campanha_facil_lotes WHERE id = p_lote AND criado_por = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.fn_cf_sinalizar(p_lote, 'excluida');
  DELETE FROM public.campanha_facil_lotes WHERE id = p_lote;
END;
$function$;

-- Editar uma campanha DESATIVADA: título, modelo e quem recebe.
--
-- `p_atribuicao` = [{operador_id, contatos: [id, …]}] — a divisão dos
-- PENDENTES, calculada na tela (`redistribuir`, envios.ts). Enviado e «não
-- deu» ficam com quem tem: não entram aqui. A lista tem de cobrir exatamente
-- os pendentes da campanha; se algo mudou no meio, recusa.
--
-- Modelo novo refaz o texto dos pendentes que têm `variaveis` (e descarta a
-- edição que o operador tinha feito neles).
CREATE OR REPLACE FUNCTION public.fn_campanha_facil_lote_editar(
  p_lote UUID, p_titulo TEXT, p_modelo TEXT, p_atribuicao JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  l          public.campanha_facil_lotes%ROWTYPE;
  v_titulo   TEXT;
  v_pend     INTEGER;
  v_atrib    INTEGER;
  v_distinto INTEGER;
  v_casam    INTEGER;
BEGIN
  SELECT * INTO l FROM public.campanha_facil_lotes
   WHERE id = p_lote AND criado_por = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF l.encerrada_em IS NOT NULL THEN
    RAISE EXCEPTION 'Esta campanha já encerrou.';
  END IF;
  IF l.ativa THEN
    RAISE EXCEPTION 'Desative a campanha antes de editar.';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.cf_atrib (op UUID, id UUID) ON COMMIT DROP;
  DELETE FROM pg_temp.cf_atrib;
  INSERT INTO pg_temp.cf_atrib (op, id)
  SELECT (a ->> 'operador_id')::UUID, x::UUID
    FROM jsonb_array_elements(COALESCE(p_atribuicao, '[]'::JSONB)) a
   CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(a -> 'contatos', '[]'::JSONB)) x;

  SELECT count(*) INTO v_pend
    FROM public.campanha_facil_contatos c
    JOIN public.campanha_facil_envios e ON e.id = c.envio_id
   WHERE e.lote_id = l.id AND c.status = 'pendente';
  SELECT count(*), count(DISTINCT id) INTO v_atrib, v_distinto FROM pg_temp.cf_atrib;
  SELECT count(*) INTO v_casam
    FROM pg_temp.cf_atrib a
    JOIN public.campanha_facil_contatos c ON c.id = a.id AND c.status = 'pendente'
    JOIN public.campanha_facil_envios e ON e.id = c.envio_id AND e.lote_id = l.id;
  IF v_atrib <> v_distinto OR v_atrib <> v_pend OR v_casam <> v_pend THEN
    RAISE EXCEPTION 'As mensagens da campanha mudaram. Atualize e tente de novo.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (SELECT DISTINCT op FROM pg_temp.cf_atrib) a
      LEFT JOIN public.perfis pf ON pf.id = a.op AND pf.empresa_id = l.empresa_id
     WHERE pf.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Há operador de fora da empresa na lista.';
  END IF;

  v_titulo := left(COALESCE(NULLIF(btrim(p_titulo), ''), l.titulo), 200);
  UPDATE public.campanha_facil_lotes
     SET titulo = v_titulo,
         modelo = COALESCE(NULLIF(p_modelo, ''), modelo),
         editada_em = now()
   WHERE id = l.id;
  UPDATE public.campanha_facil_envios SET titulo = v_titulo WHERE lote_id = l.id;

  -- Quem passa a receber e ainda não tinha envio nesta campanha.
  INSERT INTO public.campanha_facil_envios
    (empresa_id, lote_id, setor_id, operador_id, operador_nome, titulo, arquivo_nome,
     qtd, linhas, repasse, criado_por, criado_por_nome, expira_em, ativa)
  SELECT l.empresa_id, l.id, l.setor_id, pf.id, COALESCE(pf.nome, ''), v_titulo, l.arquivo_nome,
         0, NULL, FALSE, l.criado_por, l.criado_por_nome, l.expira_em, FALSE
    FROM (SELECT DISTINCT op FROM pg_temp.cf_atrib) a
    JOIN public.perfis pf ON pf.id = a.op
   WHERE NOT EXISTS (
     SELECT 1 FROM public.campanha_facil_envios e WHERE e.lote_id = l.id AND e.operador_id = a.op
   );

  -- Cada pendente vai para o envio (o mais antigo) do operador escolhido.
  UPDATE public.campanha_facil_contatos c
     SET envio_id = d.envio, operador_id = a.op
    FROM pg_temp.cf_atrib a
    JOIN LATERAL (
      SELECT e.id AS envio FROM public.campanha_facil_envios e
       WHERE e.lote_id = l.id AND e.operador_id = a.op
       ORDER BY e.repasse, e.criado_em
       LIMIT 1
    ) d ON TRUE
   WHERE c.id = a.id AND c.envio_id IS DISTINCT FROM d.envio;

  IF NULLIF(p_modelo, '') IS NOT NULL AND p_modelo IS DISTINCT FROM l.modelo THEN
    UPDATE public.campanha_facil_contatos c
       SET mensagem = public.fn_cf_renderizar(p_modelo, c.variaveis), mensagem_editada = NULL
      FROM public.campanha_facil_envios e
     WHERE e.id = c.envio_id AND e.lote_id = l.id
       AND c.status = 'pendente' AND c.variaveis IS NOT NULL;
  END IF;

  DELETE FROM public.campanha_facil_envios e
   WHERE e.lote_id = l.id
     AND NOT EXISTS (SELECT 1 FROM public.campanha_facil_contatos c WHERE c.envio_id = e.id);
  UPDATE public.campanha_facil_envios e
     SET qtd = (SELECT count(*) FROM public.campanha_facil_contatos c WHERE c.envio_id = e.id)
   WHERE e.lote_id = l.id;
END;
$function$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.fn_campanha_facil_lote_criar(jsonb)',
    'public.fn_campanha_facil_envios_criar(uuid,jsonb,boolean)',
    'public.fn_campanha_facil_lote_ativar(uuid,boolean)',
    'public.fn_campanha_facil_avisar_repasse(uuid[])',
    'public.fn_campanha_facil_lote_excluir(uuid)',
    'public.fn_campanha_facil_lote_editar(uuid,text,text,jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

-- ── 8. Faxina: congela o placar e apaga os contatos ─────────────────────────
--
-- Encerra a campanha ativa vencida, a desativada há mais de 2 dias e a que
-- nunca foi lançada (liberação que falhou no meio) depois de 1 dia. A
-- campanha fica no histórico com o placar; a nunca lançada sai inteira.

CREATE OR REPLACE FUNCTION public.fn_campanha_facil_envios_faxina()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_n INTEGER;
BEGIN
  UPDATE public.campanha_facil_lotes l
     SET encerrada_em = now(),
         ativa = FALSE,
         placar = COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'operador_id', x.operador_id, 'nome', x.nome, 'total', x.total,
                    'enviados', x.enviados, 'nao_enviados', x.nao_enviados) ORDER BY x.nome)
             FROM (
               SELECT e.operador_id, max(e.operador_nome) AS nome,
                      count(c.id)::INTEGER AS total,
                      count(c.id) FILTER (WHERE c.status = 'enviado')::INTEGER AS enviados,
                      count(c.id) FILTER (WHERE c.status = 'nao_enviado')::INTEGER AS nao_enviados
                 FROM public.campanha_facil_envios e
                 LEFT JOIN public.campanha_facil_contatos c ON c.envio_id = e.id
                WHERE e.lote_id = l.id
                GROUP BY e.operador_id
             ) x
         ), '[]'::JSONB)
   WHERE l.encerrada_em IS NULL
     AND (
       (l.ativa AND l.expira_em <= now())
       OR (NOT l.ativa AND l.lancada_em IS NOT NULL AND l.desativada_em <= now() - INTERVAL '2 days')
       OR (l.lancada_em IS NULL AND l.criado_em <= now() - INTERVAL '1 day')
     );

  DELETE FROM public.campanha_facil_lotes WHERE lancada_em IS NULL AND encerrada_em IS NOT NULL;

  WITH apagados AS (
    DELETE FROM public.campanha_facil_envios e
     USING public.campanha_facil_lotes l
     WHERE l.id = e.lote_id AND l.encerrada_em IS NOT NULL
    RETURNING 1
  )
  SELECT count(*)::INTEGER INTO v_n FROM apagados;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.fn_campanha_facil_envios_faxina() IS
  'Encerra campanhas vencidas (placar congelado em campanha_facil_lotes) e apaga envios e contatos. '
  'Agendada de hora em hora. Ver 20260929100000 e 20261007190000.';

REVOKE ALL ON FUNCTION public.fn_campanha_facil_envios_faxina() FROM PUBLIC, anon, authenticated;

-- ── 9. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.campanha_facil_envios e
     WHERE NOT EXISTS (SELECT 1 FROM public.campanha_facil_lotes l WHERE l.id = e.lote_id)
  ) THEN
    RAISE EXCEPTION 'Há envio sem campanha.';
  END IF;
  IF has_table_privilege('authenticated', 'public.campanha_facil_envios', 'INSERT') THEN
    RAISE EXCEPTION 'O navegador ainda grava envio direto.';
  END IF;
  IF has_table_privilege('authenticated', 'public.campanha_facil_lotes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.campanha_facil_lotes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.campanha_facil_lotes', 'DELETE') THEN
    RAISE EXCEPTION 'campanha_facil_lotes aceita escrita direta.';
  END IF;
  IF public.fn_cf_renderizar('Olá {{ primeiro_nome }}, {{nada}}fim', '{"primeiro_nome":"Ana"}'::JSONB)
     <> 'Olá Ana, fim' THEN
    RAISE EXCEPTION 'fn_cf_renderizar não espelha o renderTemplate.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'campanha-facil-envios-faxina' AND active) THEN
    RAISE EXCEPTION 'A faxina da campanha não está agendada.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261007190000', 'campanhas_historico_e_controle', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
