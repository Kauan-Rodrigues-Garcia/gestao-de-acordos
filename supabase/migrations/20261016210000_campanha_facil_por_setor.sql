-- ============================================================================
-- Campanha Fácil separada por setor — 16/10/2026
-- ============================================================================
--
-- ## Por que
--
-- Pedido do Cleber: «toda essa aba tem que ser separada certinho para o setor.
-- Líder vê só o seu setor.» A verificação achou três partes valendo para a
-- BookPlay inteira (isoladas só por `empresa_id`):
--
--   • a lista de mensagens adicionadas (`campanha_facil_mensagens`) — qualquer
--     líder via, editava e excluía a mensagem de outro setor;
--   • as mensagens padrão excluídas (`campanha_facil_mensagens_ocultas`) —
--     excluir uma padrão sumia com ela em todos os setores;
--   • as configurações de desconto (`campanha_facil_descontos`) — e o nome era
--     único na empresa: salvar «Campanha julho» no setor B sobrescrevia a do
--     setor A.
--
-- E duas brechas que a tela escondia: liberar não conferia o setor (só a
-- empresa), e o histórico era só de quem lançou.
--
-- ## O que muda
--
-- 1. `fn_cf_alcanca_setor(empresa, setor)` — quem mexe na Campanha Fácil de
--    um setor: super admin; ou quem libera campanha na empresa
--    (`fn_cf_pode_liberar`) e é do setor (`perfis.setor_id`) ou tem
--    `campanha_escopo_todos_setores` (gerência para cima). É a mesma regra
--    que a tela já usava no passo 3, agora no banco.
--
-- 2. As três tabelas ganham `setor_id`. O que já existe fica no setor DE QUEM
--    CRIOU (decisão do Cleber, 16/10/2026): `criado_por` nas mensagens e nos
--    descontos, `ocultado_por` nas excluídas. Linha cujo autor não tem setor
--    fica com `setor_id` NULL: não aparece para ninguém, mas não é apagada —
--    a verificação no fim conta quantas são.
--
-- 3. Policies novas nas três: ler e escrever só no setor alcançado. Sai o
--    acesso de `anon` (as policies antigas não tinham `TO`).
--
-- 4. O nome da configuração de desconto passa a ser único no SETOR. A
--    mensagem padrão excluída, idem: cada setor esconde as suas.
--
-- 5. Histórico: os líderes do mesmo setor veem as campanhas uns dos outros
--    (decisão do Cleber, 16/10/2026). Só VER: desativar, editar, repassar,
--    relançar e excluir continuam de quem lançou (as funções já conferem
--    `criado_por`). O andamento por operador da campanha de outro líder vem
--    por `fn_campanha_facil_envios_do_lote`, sem abrir a tabela de contatos
--    (nome e telefone dos clientes continuam só com quem lançou e quem envia).
--
-- 6. Liberar confere o setor: `fn_campanha_facil_lote_criar` exige setor
--    alcançado, e um gatilho em `campanha_facil_envios` recusa operador de
--    fora do setor da campanha (cobre liberar, repassar e editar — as três
--    passam pelo INSERT de envio). Do setor é: `perfis.setor_id`, clone numa
--    equipe do setor, ou líder de equipe do setor (`equipe_lideres`) — a
--    mesma lista do passo 3 (`listarOperadoresParaCampanha`).
--
-- As favoritas não mudam: já são de cada pessoa (20261009180000).
--
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Quem alcança o setor ─────────────────────────────────────────────────

-- Uma chave do painel, no mapa de casa OU no da empresa da campanha — o mesmo
-- critério de `fn_cf_pode_liberar`.
CREATE OR REPLACE FUNCTION public.fn_cf_tem(p_empresa UUID, p_chave TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_user_tem(p_chave)
      OR EXISTS (
        SELECT 1
          FROM public.perfis p
          JOIN public.cargos_permissoes cp
            ON cp.empresa_id = p_empresa AND cp.cargo = p.perfil
         WHERE p.id = (SELECT auth.uid())
           AND COALESCE((cp.permissoes ->> p_chave)::BOOLEAN, FALSE)
      );
$function$;

COMMENT ON FUNCTION public.fn_cf_tem(UUID, TEXT) IS
  'Chave do painel para a Campanha Fácil: mapa de casa ou o da empresa. Ver 20261016210000.';

REVOKE ALL ON FUNCTION public.fn_cf_tem(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cf_tem(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_cf_alcanca_setor(p_empresa UUID, p_setor UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p_setor IS NOT NULL
     AND (
       public.fn_user_is_super_admin()
       OR (
         public.fn_cf_pode_liberar(p_empresa)
         AND EXISTS (SELECT 1 FROM public.setores s WHERE s.id = p_setor AND s.empresa_id = p_empresa)
         AND (
           p_setor = public.fn_user_setor_id()
           OR public.fn_cf_tem(p_empresa, 'campanha_escopo_todos_setores')
         )
       )
     );
$function$;

COMMENT ON FUNCTION public.fn_cf_alcanca_setor(UUID, UUID) IS
  'Quem mexe na Campanha Fácil do setor: super admin, ou quem libera campanha na empresa e é do setor '
  '(ou tem campanha_escopo_todos_setores). Ver 20261016210000.';

REVOKE ALL ON FUNCTION public.fn_cf_alcanca_setor(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cf_alcanca_setor(UUID, UUID) TO authenticated;

-- ── 2. Mensagens, excluídas e descontos ganham o setor ──────────────────────

ALTER TABLE public.campanha_facil_mensagens
  ADD COLUMN IF NOT EXISTS setor_id UUID REFERENCES public.setores(id) ON DELETE CASCADE;
ALTER TABLE public.campanha_facil_mensagens_ocultas
  ADD COLUMN IF NOT EXISTS setor_id UUID REFERENCES public.setores(id) ON DELETE CASCADE;
ALTER TABLE public.campanha_facil_descontos
  ADD COLUMN IF NOT EXISTS setor_id UUID REFERENCES public.setores(id) ON DELETE CASCADE;

-- O que já existe vai para o setor de quem criou (se o setor é da empresa).
UPDATE public.campanha_facil_mensagens t
   SET setor_id = p.setor_id
  FROM public.perfis p
  JOIN public.setores s ON s.id = p.setor_id
 WHERE p.id = t.criado_por
   AND s.empresa_id = t.empresa_id
   AND t.setor_id IS NULL;

UPDATE public.campanha_facil_descontos t
   SET setor_id = p.setor_id
  FROM public.perfis p
  JOIN public.setores s ON s.id = p.setor_id
 WHERE p.id = t.criado_por
   AND s.empresa_id = t.empresa_id
   AND t.setor_id IS NULL;

UPDATE public.campanha_facil_mensagens_ocultas t
   SET setor_id = p.setor_id
  FROM public.perfis p
  JOIN public.setores s ON s.id = p.setor_id
 WHERE p.id = t.ocultado_por
   AND s.empresa_id = t.empresa_id
   AND t.setor_id IS NULL;

-- Linha nova sempre com setor. NOT VALID: a antiga sem autor com setor fica
-- (invisível), em vez de travar a migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cf_mensagens_setor_obrigatorio') THEN
    ALTER TABLE public.campanha_facil_mensagens
      ADD CONSTRAINT cf_mensagens_setor_obrigatorio CHECK (setor_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cf_descontos_setor_obrigatorio') THEN
    ALTER TABLE public.campanha_facil_descontos
      ADD CONSTRAINT cf_descontos_setor_obrigatorio CHECK (setor_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cf_ocultas_setor_obrigatorio') THEN
    ALTER TABLE public.campanha_facil_mensagens_ocultas
      ADD CONSTRAINT cf_ocultas_setor_obrigatorio CHECK (setor_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- Índices do filtro da tela (empresa + setor) e as unicidades por setor.
DROP INDEX IF EXISTS public.idx_cf_mensagens_empresa;
CREATE INDEX IF NOT EXISTS idx_cf_mensagens_setor
  ON public.campanha_facil_mensagens (empresa_id, setor_id, criado_em);

DROP INDEX IF EXISTS public.uq_cf_descontos_empresa_nome;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cf_descontos_setor_nome
  ON public.campanha_facil_descontos (empresa_id, setor_id, lower(nome));

-- A chave era (empresa, modelo): um setor escondia de todos. Passa a ser por
-- setor — o `upsert` da tela usa `empresa_id,setor_id,template_id`.
ALTER TABLE public.campanha_facil_mensagens_ocultas
  DROP CONSTRAINT IF EXISTS campanha_facil_mensagens_ocultas_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cf_ocultas_setor
  ON public.campanha_facil_mensagens_ocultas (empresa_id, setor_id, template_id);

-- ── 3. Policies por setor ───────────────────────────────────────────────────
--
-- As `*_super_admin_total` do baseline ficam como estão.

REVOKE ALL ON public.campanha_facil_mensagens FROM anon;
REVOKE ALL ON public.campanha_facil_descontos FROM anon;
REVOKE ALL ON public.campanha_facil_mensagens_ocultas FROM anon;

DROP POLICY IF EXISTS cf_mensagens_select ON public.campanha_facil_mensagens;
CREATE POLICY cf_mensagens_select ON public.campanha_facil_mensagens
  FOR SELECT TO authenticated
  USING (public.fn_cf_alcanca_setor(empresa_id, setor_id));

DROP POLICY IF EXISTS cf_mensagens_insert ON public.campanha_facil_mensagens;
CREATE POLICY cf_mensagens_insert ON public.campanha_facil_mensagens
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_cf_alcanca_setor(empresa_id, setor_id));

DROP POLICY IF EXISTS cf_mensagens_update ON public.campanha_facil_mensagens;
CREATE POLICY cf_mensagens_update ON public.campanha_facil_mensagens
  FOR UPDATE TO authenticated
  USING (public.fn_cf_alcanca_setor(empresa_id, setor_id))
  WITH CHECK (public.fn_cf_alcanca_setor(empresa_id, setor_id));

DROP POLICY IF EXISTS cf_mensagens_delete ON public.campanha_facil_mensagens;
CREATE POLICY cf_mensagens_delete ON public.campanha_facil_mensagens
  FOR DELETE TO authenticated
  USING (public.fn_cf_alcanca_setor(empresa_id, setor_id));

DROP POLICY IF EXISTS cf_descontos_select ON public.campanha_facil_descontos;
CREATE POLICY cf_descontos_select ON public.campanha_facil_descontos
  FOR SELECT TO authenticated
  USING (public.fn_cf_alcanca_setor(empresa_id, setor_id));

DROP POLICY IF EXISTS cf_descontos_insert ON public.campanha_facil_descontos;
CREATE POLICY cf_descontos_insert ON public.campanha_facil_descontos
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_cf_alcanca_setor(empresa_id, setor_id));

DROP POLICY IF EXISTS cf_descontos_update ON public.campanha_facil_descontos;
CREATE POLICY cf_descontos_update ON public.campanha_facil_descontos
  FOR UPDATE TO authenticated
  USING (public.fn_cf_alcanca_setor(empresa_id, setor_id))
  WITH CHECK (public.fn_cf_alcanca_setor(empresa_id, setor_id));

DROP POLICY IF EXISTS cf_descontos_delete ON public.campanha_facil_descontos;
CREATE POLICY cf_descontos_delete ON public.campanha_facil_descontos
  FOR DELETE TO authenticated
  USING (public.fn_cf_alcanca_setor(empresa_id, setor_id));

DROP POLICY IF EXISTS cf_ocultas_select ON public.campanha_facil_mensagens_ocultas;
CREATE POLICY cf_ocultas_select ON public.campanha_facil_mensagens_ocultas
  FOR SELECT TO authenticated
  USING (public.fn_cf_alcanca_setor(empresa_id, setor_id));

DROP POLICY IF EXISTS cf_ocultas_insert ON public.campanha_facil_mensagens_ocultas;
CREATE POLICY cf_ocultas_insert ON public.campanha_facil_mensagens_ocultas
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_cf_alcanca_setor(empresa_id, setor_id));

-- O `upsert` de ocultar faz UPDATE quando a linha já existe.
DROP POLICY IF EXISTS cf_ocultas_update ON public.campanha_facil_mensagens_ocultas;
CREATE POLICY cf_ocultas_update ON public.campanha_facil_mensagens_ocultas
  FOR UPDATE TO authenticated
  USING (public.fn_cf_alcanca_setor(empresa_id, setor_id))
  WITH CHECK (public.fn_cf_alcanca_setor(empresa_id, setor_id));

DROP POLICY IF EXISTS cf_ocultas_delete ON public.campanha_facil_mensagens_ocultas;
CREATE POLICY cf_ocultas_delete ON public.campanha_facil_mensagens_ocultas
  FOR DELETE TO authenticated
  USING (public.fn_cf_alcanca_setor(empresa_id, setor_id));

-- ── 4. Histórico: os líderes do setor veem as campanhas uns dos outros ──────

CREATE INDEX IF NOT EXISTS idx_cf_lotes_setor
  ON public.campanha_facil_lotes (setor_id, criado_em DESC);

DROP POLICY IF EXISTS cf_lotes_select ON public.campanha_facil_lotes;
CREATE POLICY cf_lotes_select ON public.campanha_facil_lotes
  FOR SELECT TO authenticated
  USING (
    criado_por = (SELECT auth.uid())
    OR public.fn_cf_alcanca_setor(empresa_id, setor_id)
  );

-- Os votos da campanha do setor (os da própria já vêm pela _select_autor).
DROP POLICY IF EXISTS cf_avaliacoes_select_setor ON public.campanha_facil_avaliacoes;
CREATE POLICY cf_avaliacoes_select_setor ON public.campanha_facil_avaliacoes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campanha_facil_lotes l
     WHERE l.id = campanha_facil_avaliacoes.lote_id
       AND public.fn_cf_alcanca_setor(l.empresa_id, l.setor_id)
  ));

-- O andamento por operador de uma campanha visível — só os números, sem
-- nenhum dado de cliente. Para a campanha de outro líder do setor, que não
-- lê `campanha_facil_envios` nem `campanha_facil_contatos`.
CREATE OR REPLACE FUNCTION public.fn_campanha_facil_envios_do_lote(p_lote UUID)
RETURNS TABLE (
  id UUID, lote_id UUID, setor_id UUID, operador_id UUID, operador_nome TEXT,
  titulo TEXT, arquivo_nome TEXT, qtd INTEGER, repasse BOOLEAN, ativa BOOLEAN,
  criado_em TIMESTAMPTZ, expira_em TIMESTAMPTZ, criado_por_nome TEXT,
  total INTEGER, enviados INTEGER, nao_enviados INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.campanha_facil_lotes l
     WHERE l.id = p_lote
       AND (l.criado_por = (SELECT auth.uid()) OR public.fn_cf_alcanca_setor(l.empresa_id, l.setor_id))
  ) THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.lote_id, e.setor_id, e.operador_id, e.operador_nome,
         e.titulo, e.arquivo_nome, e.qtd, e.repasse, e.ativa,
         e.criado_em, e.expira_em, e.criado_por_nome,
         count(c.id)::INTEGER,
         count(c.id) FILTER (WHERE c.status = 'enviado')::INTEGER,
         count(c.id) FILTER (WHERE c.status = 'nao_enviado')::INTEGER
    FROM public.campanha_facil_envios e
    LEFT JOIN public.campanha_facil_contatos c ON c.envio_id = e.id
   WHERE e.lote_id = p_lote
   GROUP BY e.id
   ORDER BY e.criado_em;
END;
$function$;

COMMENT ON FUNCTION public.fn_campanha_facil_envios_do_lote(UUID) IS
  'Andamento por envio de uma campanha que o líder vê (a dele ou do setor). Só números. Ver 20261016210000.';

REVOKE ALL ON FUNCTION public.fn_campanha_facil_envios_do_lote(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_envios_do_lote(UUID) TO authenticated;

-- ── 5. Liberar confere o setor ──────────────────────────────────────────────

-- A mesma da 20261007190000, com o setor obrigatório e alcançado.
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
  IF v_setor IS NULL THEN
    RAISE EXCEPTION 'Escolha o setor da campanha.';
  END IF;
  IF NOT public.fn_cf_alcanca_setor(v_empresa, v_setor) THEN
    RAISE EXCEPTION 'Você só pode liberar campanha para o seu setor.' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.fn_campanha_facil_lote_criar(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_lote_criar(JSONB) TO authenticated;

-- Quem é do setor para receber: o do setor, o clone numa equipe dele e o
-- líder de uma equipe dele. Espelha `listarOperadoresParaCampanha`.
CREATE OR REPLACE FUNCTION public.fn_cf_pessoa_no_setor(p_pessoa UUID, p_setor UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = p_pessoa AND p.setor_id = p_setor)
      OR EXISTS (
        SELECT 1 FROM public.equipe_operadores_clones c
          JOIN public.equipes e ON e.id = c.equipe_id
         WHERE c.operador_id = p_pessoa AND e.setor_id = p_setor
      )
      OR EXISTS (
        SELECT 1 FROM public.equipe_lideres el
          JOIN public.equipes e ON e.id = el.equipe_id
         WHERE el.lider_id = p_pessoa AND e.setor_id = p_setor
      );
$function$;

REVOKE ALL ON FUNCTION public.fn_cf_pessoa_no_setor(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cf_pessoa_no_setor(UUID, UUID) TO authenticated;

-- Todo envio nasce pelas funções (liberar, repassar, editar): o gatilho vale
-- para as três sem reescrevê-las. Campanha antiga sem setor segue como era.
CREATE OR REPLACE FUNCTION public.fn_cf_envio_do_setor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.setor_id IS NOT NULL AND NOT public.fn_cf_pessoa_no_setor(NEW.operador_id, NEW.setor_id) THEN
    RAISE EXCEPTION 'Há operador de fora do setor da campanha na lista.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cf_envio_do_setor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cf_envio_do_setor ON public.campanha_facil_envios;
CREATE TRIGGER trg_cf_envio_do_setor
  BEFORE INSERT ON public.campanha_facil_envios
  FOR EACH ROW EXECUTE FUNCTION public.fn_cf_envio_do_setor();

-- ── 6. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
DECLARE
  v_msg INTEGER;
  v_desc INTEGER;
  v_ocu INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('campanha_facil_mensagens', 'campanha_facil_descontos', 'campanha_facil_mensagens_ocultas')
       AND policyname NOT LIKE '%super_admin_total'
       AND COALESCE(qual, '') || COALESCE(with_check, '') NOT LIKE '%fn_cf_alcanca_setor%'
  ) THEN
    RAISE EXCEPTION 'Sobrou policy da Campanha Fácil que não olha o setor.';
  END IF;
  IF has_table_privilege('anon', 'public.campanha_facil_mensagens', 'SELECT')
     OR has_table_privilege('anon', 'public.campanha_facil_descontos', 'SELECT')
     OR has_table_privilege('anon', 'public.campanha_facil_mensagens_ocultas', 'SELECT') THEN
    RAISE EXCEPTION 'anon ainda lê as tabelas da Campanha Fácil.';
  END IF;
  IF has_table_privilege('authenticated', 'public.campanha_facil_lotes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.campanha_facil_lotes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.campanha_facil_lotes', 'DELETE') THEN
    RAISE EXCEPTION 'campanha_facil_lotes aceita escrita direta.';
  END IF;
  IF has_table_privilege('authenticated', 'public.campanha_facil_envios', 'INSERT') THEN
    RAISE EXCEPTION 'O navegador grava envio direto.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cf_envio_do_setor' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'O gatilho do setor no envio não foi criado.';
  END IF;

  -- O que ficou sem setor (autor sem setor): invisível, não apagado.
  SELECT count(*) INTO v_msg  FROM public.campanha_facil_mensagens         WHERE setor_id IS NULL;
  SELECT count(*) INTO v_desc FROM public.campanha_facil_descontos         WHERE setor_id IS NULL;
  SELECT count(*) INTO v_ocu  FROM public.campanha_facil_mensagens_ocultas WHERE setor_id IS NULL;
  RAISE NOTICE 'Sem setor (autor sem setor): % mensagens, % descontos, % excluídas.', v_msg, v_desc, v_ocu;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261016210000', 'campanha_facil_por_setor', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
