-- ============================================================================
-- Comercial: IAs com tipo e vinculo a um operador
-- ============================================================================
--
-- Pedido de 01/10/2026. Os logins de IA do Comercial (`perfis.robo`) vendem
-- de verdade — a venda e confirmada, assinada e soma no setor. Agora:
--
--   1. Cada IA tem um TIPO (Comum, Indicacao, e outros que a gerencia criar).
--      O tipo e cadastro, nunca o nome do ERP: medido em setembro, o Antonio
--      vem sem «(Comum)» e Rafael e Tatiana vem como «(Comun)».
--
--   2. Uma IA pode ser VINCULADA a um operador por um periodo. Venda da IA
--      confirmada dentro do periodo credita o operador e a equipe dele. Fora
--      de periodo, fica com a IA: conta no setor e em equipe nenhuma, como
--      sempre foi.
--
-- ## A venda nao muda. Nunca.
--
-- `vendas.operador_id` continua sendo a IA. O credito e resolvido na LEITURA,
-- pela tabela de vinculos. Desvincular ou trocar nao toca em venda nenhuma, e
-- por isso nao ha como duplicar: o total geral e o do setor somam LINHAS, e o
-- vinculo so decide em que pessoa e em que equipe a linha aparece.
--
-- A regra do credito existe em dois lugares, e os dois se citam:
--   SQL  `fn_vendas_ia_credito` (esta migration)
--   TS   `creditoDaVenda` em `src/lib/vendasIa.ts`
-- A data e `COALESCE(data_confirmacao, data_venda)` — a confirmacao e o eixo
-- oficial do Comercial; a venda aberta, que ainda nao tem, cai na data da venda.
--
-- ## Periodo: mes inteiro ou a partir da data
--
-- Quem troca escolhe. Os dois viram o mesmo `desde`: mes inteiro e o dia 1
-- do mes escolhido. O novo vinculo SUBSTITUI tudo daquele dia em diante —
-- periodo que comecaria depois e apagado, periodo que atravessa e cortado.
-- Uma IA nunca tem dois donos na mesma data.
--
-- ## Acesso
--
-- `fn_vendas_alcanca` NAO muda: ela e o alcance de ESCRITA (lancar, confirmar,
-- excluir), e o operador nao deve editar a venda da IA so porque leva o
-- credito dela. Muda so a policy de LEITURA `vendas_select`: quem leva o
-- credito — e o lider da equipe dele — passa a enxergar a linha.
-- ============================================================================

BEGIN;

-- ── 1. Tipos de IA ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendas_ia_tipos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL CHECK (BTRIM(nome) <> '' AND LENGTH(nome) <= 40),
  ordem      INTEGER NOT NULL DEFAULT 0,
  criado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_ia_tipos_nome
  ON public.vendas_ia_tipos (empresa_id, LOWER(BTRIM(nome)));

COMMENT ON TABLE public.vendas_ia_tipos IS
  'Classificacao das IAs do Comercial (Comum, Indicacao, ...). So rotulo: nao '
  'muda regua nem credito. Escrita so por fn_vendas_ia_tipo_criar.';

INSERT INTO public.vendas_ia_tipos (empresa_id, nome, ordem)
SELECT e.id, t.nome, t.ordem
  FROM public.empresas e
 CROSS JOIN (VALUES ('Comum', 1), ('Indicação', 2)) AS t(nome, ordem)
 WHERE e.produto = 'comercial'
ON CONFLICT DO NOTHING;

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS ia_tipo_id UUID
    REFERENCES public.vendas_ia_tipos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.perfis.ia_tipo_id IS
  'Tipo da IA (vendas_ia_tipos). So faz sentido com robo = true; gravado so '
  'por fn_vendas_ia_definir_tipo.';

-- ── 2. Vinculos ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendas_ia_vinculos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ia_id       UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  operador_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE RESTRICT,
  -- Inclusive.
  desde       DATE NOT NULL,
  -- Exclusivo. NULL = em aberto.
  ate         DATE,
  criado_por  UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vendas_ia_vinculos_periodo CHECK (ate IS NULL OR ate > desde),
  CONSTRAINT vendas_ia_vinculos_nao_a_si CHECK (ia_id <> operador_id)
);

CREATE INDEX IF NOT EXISTS idx_vendas_ia_vinculos_ia
  ON public.vendas_ia_vinculos (ia_id, desde);
CREATE INDEX IF NOT EXISTS idx_vendas_ia_vinculos_operador
  ON public.vendas_ia_vinculos (operador_id);

COMMENT ON TABLE public.vendas_ia_vinculos IS
  'Periodo [desde, ate) em que as vendas de uma IA creditam um operador. Sem '
  'sobreposicao por IA — garantido por fn_vendas_ia_vincular, a unica escrita.';

-- O historico das trocas. A tabela de vinculos e o estado; aqui fica quem
-- mudou o que, porque a troca reescreve o credito de vendas ja feitas.
CREATE TABLE IF NOT EXISTS public.vendas_ia_vinculos_historico (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ia_id       UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  operador_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  desde       DATE NOT NULL,
  antes       JSONB NOT NULL,
  depois      JSONB NOT NULL,
  autor_id    UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendas_ia_vinculos_historico_ia
  ON public.vendas_ia_vinculos_historico (ia_id, criado_em DESC);

-- ── 3. RLS: leitura por quem acessa a empresa; escrita so pelas RPCs ────────

ALTER TABLE public.vendas_ia_tipos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_ia_vinculos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_ia_vinculos_historico ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.vendas_ia_tipos              FROM anon;
REVOKE ALL ON TABLE public.vendas_ia_vinculos           FROM anon;
REVOKE ALL ON TABLE public.vendas_ia_vinculos_historico FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.vendas_ia_tipos              FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.vendas_ia_vinculos           FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.vendas_ia_vinculos_historico FROM authenticated;
GRANT SELECT ON TABLE public.vendas_ia_tipos              TO authenticated;
GRANT SELECT ON TABLE public.vendas_ia_vinculos           TO authenticated;
GRANT SELECT ON TABLE public.vendas_ia_vinculos_historico TO authenticated;

DROP POLICY IF EXISTS vendas_ia_tipos_select ON public.vendas_ia_tipos;
CREATE POLICY vendas_ia_tipos_select ON public.vendas_ia_tipos
  FOR SELECT TO authenticated
  USING (public.fn_can_access_empresa(empresa_id));

-- O vinculo e lido DENTRO da policy de `vendas` (o EXISTS abaixo roda com o
-- direito de quem consulta). Sem esta leitura, o operador nunca enxergaria a
-- venda da IA dele. Nao e dado sensivel: diz que IA trabalha para quem.
DROP POLICY IF EXISTS vendas_ia_vinculos_select ON public.vendas_ia_vinculos;
CREATE POLICY vendas_ia_vinculos_select ON public.vendas_ia_vinculos
  FOR SELECT TO authenticated
  USING (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS vendas_ia_vinculos_historico_select ON public.vendas_ia_vinculos_historico;
CREATE POLICY vendas_ia_vinculos_historico_select ON public.vendas_ia_vinculos_historico
  FOR SELECT TO authenticated
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND (SELECT public.fn_user_tem('usuarios_editar_cargo'))
  );

-- ── 4. A regra do credito ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vendas_ia_credito(p_ia_id UUID, p_data DATE)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT vi.operador_id
    FROM public.vendas_ia_vinculos vi
   WHERE vi.ia_id = p_ia_id
     AND vi.desde <= p_data
     AND (vi.ate IS NULL OR p_data < vi.ate)
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_ia_credito(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_ia_credito(UUID, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_ia_credito(UUID, DATE) IS
  'Quem leva o credito da venda desta IA nesta data. NULL = ninguem, fica com a '
  'IA. Espelho em TS: creditoDaVenda (src/lib/vendasIa.ts) — mudam juntos.';

-- ── 5. Vincular, trocar e desvincular ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vendas_ia_vincular(
  p_ia_id       UUID,
  p_operador_id UUID,   -- NULL = desvincular a partir de p_desde
  p_desde       DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ia      public.perfis%ROWTYPE;
  v_op      public.perfis%ROWTYPE;
  v_antes   JSONB;
  v_depois  JSONB;
  v_anterior public.vendas_ia_vinculos%ROWTYPE;
BEGIN
  IF NOT (SELECT public.fn_user_tem('usuarios_editar_cargo')) THEN
    RAISE EXCEPTION 'Vincular IA exige a permissão de editar cargo de usuários.'
      USING ERRCODE = '42501';
  END IF;

  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'Informe a partir de quando o vínculo vale.' USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE na IA: dois cliques ao mesmo tempo esperam um pelo outro, e o
  -- segundo enxerga o que o primeiro gravou. E o que garante «sem
  -- sobreposicao» sem btree_gist.
  SELECT * INTO v_ia FROM public.perfis WHERE id = p_ia_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IA não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_can_access_empresa(v_ia.empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(v_ia.robo, FALSE) THEN
    RAISE EXCEPTION '% não está marcado como IA.', v_ia.nome USING ERRCODE = '22023';
  END IF;

  IF p_operador_id IS NOT NULL THEN
    SELECT * INTO v_op FROM public.perfis WHERE id = p_operador_id;
    IF NOT FOUND OR v_op.empresa_id <> v_ia.empresa_id THEN
      RAISE EXCEPTION 'Operador não encontrado nesta empresa.' USING ERRCODE = 'P0002';
    END IF;
    IF COALESCE(v_op.robo, FALSE) THEN
      RAISE EXCEPTION 'IA não pode ser vinculada a outra IA.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_op.arquivado, FALSE) THEN
      RAISE EXCEPTION '% está arquivado.', v_op.nome USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(vi) ORDER BY vi.desde), '[]'::jsonb) INTO v_antes
    FROM public.vendas_ia_vinculos vi WHERE vi.ia_id = p_ia_id;

  -- O novo periodo substitui tudo de p_desde em diante.
  DELETE FROM public.vendas_ia_vinculos
   WHERE ia_id = p_ia_id AND desde >= p_desde;

  UPDATE public.vendas_ia_vinculos
     SET ate = p_desde
   WHERE ia_id = p_ia_id
     AND desde < p_desde
     AND (ate IS NULL OR ate > p_desde);

  IF p_operador_id IS NOT NULL THEN
    -- Mesmo operador logo antes, colado: estende em vez de picotar.
    SELECT * INTO v_anterior FROM public.vendas_ia_vinculos
     WHERE ia_id = p_ia_id AND ate = p_desde AND operador_id = p_operador_id;

    IF FOUND THEN
      UPDATE public.vendas_ia_vinculos SET ate = NULL WHERE id = v_anterior.id;
    ELSE
      INSERT INTO public.vendas_ia_vinculos
        (empresa_id, ia_id, operador_id, desde, ate, criado_por)
      VALUES
        (v_ia.empresa_id, p_ia_id, p_operador_id, p_desde, NULL, (SELECT auth.uid()));
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(vi) ORDER BY vi.desde), '[]'::jsonb) INTO v_depois
    FROM public.vendas_ia_vinculos vi WHERE vi.ia_id = p_ia_id;

  INSERT INTO public.vendas_ia_vinculos_historico
    (empresa_id, ia_id, operador_id, desde, antes, depois, autor_id)
  VALUES
    (v_ia.empresa_id, p_ia_id, p_operador_id, p_desde, v_antes, v_depois, (SELECT auth.uid()));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_ia_vincular(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_ia_vincular(UUID, UUID, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_ia_vincular(UUID, UUID, DATE) IS
  'Vincula (operador), troca ou desvincula (operador NULL) uma IA a partir de '
  'p_desde. Substitui todo periodo de p_desde em diante. Unica escrita em '
  'vendas_ia_vinculos; grava historico.';

-- ── 6. Tipo da IA ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_vendas_ia_definir_tipo(p_ia_id UUID, p_tipo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_ia public.perfis%ROWTYPE;
BEGIN
  IF NOT (SELECT public.fn_user_tem('usuarios_editar_cargo')) THEN
    RAISE EXCEPTION 'Definir o tipo da IA exige a permissão de editar cargo de usuários.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ia FROM public.perfis WHERE id = p_ia_id;
  IF NOT FOUND OR NOT public.fn_can_access_empresa(v_ia.empresa_id) THEN
    RAISE EXCEPTION 'IA não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT COALESCE(v_ia.robo, FALSE) THEN
    RAISE EXCEPTION '% não está marcado como IA.', v_ia.nome USING ERRCODE = '22023';
  END IF;
  IF p_tipo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vendas_ia_tipos t
     WHERE t.id = p_tipo_id AND t.empresa_id = v_ia.empresa_id
  ) THEN
    RAISE EXCEPTION 'Tipo de IA não encontrado nesta empresa.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.perfis SET ia_tipo_id = p_tipo_id WHERE id = p_ia_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_ia_definir_tipo(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_ia_definir_tipo(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_vendas_ia_tipo_criar(p_empresa_id UUID, p_nome TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_nome TEXT := BTRIM(COALESCE(p_nome, ''));
  v_id   UUID;
BEGIN
  IF NOT (SELECT public.fn_user_tem('usuarios_editar_cargo')) THEN
    RAISE EXCEPTION 'Criar tipo de IA exige a permissão de editar cargo de usuários.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;
  IF v_nome = '' OR LENGTH(v_nome) > 40 THEN
    RAISE EXCEPTION 'O nome do tipo precisa ter de 1 a 40 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.vendas_ia_tipos t
     WHERE t.empresa_id = p_empresa_id AND LOWER(BTRIM(t.nome)) = LOWER(v_nome)
  ) THEN
    RAISE EXCEPTION 'Já existe um tipo de IA chamado %.', v_nome USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.vendas_ia_tipos (empresa_id, nome, ordem, criado_por)
  VALUES (
    p_empresa_id, v_nome,
    COALESCE((SELECT MAX(ordem) FROM public.vendas_ia_tipos WHERE empresa_id = p_empresa_id), 0) + 1,
    (SELECT auth.uid())
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_ia_tipo_criar(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_ia_tipo_criar(UUID, TEXT) TO authenticated;

-- ── 7. O cadastro das IAs, para a tela e para o placar ──────────────────────
--
-- DEFINER porque `perfis_select` recorta pelo escopo da aba Usuarios: o
-- operador nao le o perfil da IA, e sem o nome e o tipo dela o card «Vendas
-- via IA» ficaria em branco. Devolve so rotulo — login, nome, tipo, vinculo.

CREATE OR REPLACE FUNCTION public.fn_vendas_ia_cadastro(p_empresa_id UUID)
RETURNS TABLE(
  ia_id         UUID,
  ia_nome       TEXT,
  ia_usuario    TEXT,
  ia_situacao   TEXT,
  setor_nome    TEXT,
  tipo_id       UUID,
  tipo_nome     TEXT,
  vinculo_id    UUID,
  operador_id   UUID,
  operador_nome TEXT,
  desde         DATE,
  ate           DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id, p.nome, p.usuario, p.situacao, s.nome,
         t.id, t.nome,
         vi.id, vi.operador_id, o.nome, vi.desde, vi.ate
    FROM public.perfis p
    LEFT JOIN public.setores s            ON s.id = p.setor_id
    LEFT JOIN public.vendas_ia_tipos t    ON t.id = p.ia_tipo_id
    LEFT JOIN public.vendas_ia_vinculos vi ON vi.ia_id = p.id
    LEFT JOIN public.perfis o             ON o.id = vi.operador_id
   WHERE p.empresa_id = p_empresa_id
     AND public.fn_can_access_empresa(p_empresa_id)
     AND COALESCE(p.robo, FALSE)
     AND NOT COALESCE(p.arquivado, FALSE)
   ORDER BY p.nome, vi.desde;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_ia_cadastro(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_ia_cadastro(UUID) TO authenticated;

-- ── 8. Leitura de `vendas`: quem leva o credito enxerga a linha ─────────────
--
-- Tudo igual a 20260915100000, mais o ultimo OR. O EXISTS e por linha, mas so
-- ha vinculo para IA, e o indice (ia_id, desde) o resolve sem varrer.

DROP POLICY IF EXISTS vendas_select ON public.vendas;
CREATE POLICY vendas_select ON public.vendas
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_tem('ver_vendas'))
    AND public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = (SELECT auth.uid())
      OR (SELECT public.fn_user_escopo('vendas')) >= 3
      OR (
        (SELECT public.fn_user_escopo('vendas')) = 2
        AND setor_id IN (
          SELECT s FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s
        )
      )
      OR (
        (SELECT public.fn_user_escopo('vendas')) = 1
        AND equipe_id IN (
          SELECT e.equipe_id FROM public.fn_equipes_com_lideranca((SELECT auth.uid())) AS e
        )
      )
      OR EXISTS (
        SELECT 1
          FROM public.vendas_ia_vinculos vi
         WHERE vi.ia_id = vendas.operador_id
           AND vi.desde <= COALESCE(vendas.data_confirmacao, vendas.data_venda)
           AND (vi.ate IS NULL OR COALESCE(vendas.data_confirmacao, vendas.data_venda) < vi.ate)
           AND (
             vi.operador_id = (SELECT auth.uid())
             OR (
               (SELECT public.fn_user_escopo('vendas')) = 1
               AND public.fn_vendas_equipe_que_credita(vi.operador_id) IN (
                 SELECT e.equipe_id FROM public.fn_equipes_com_lideranca((SELECT auth.uid())) AS e
               )
             )
           )
      )
    )
  );

COMMENT ON POLICY vendas_select ON public.vendas IS
  'A propria venda sempre, desde que a aba esteja ligada. Acima disso, o nivel '
  'de fn_user_escopo(''vendas''): 3 = empresa, 2 = setores da pessoa, 1 = equipes. '
  'E a venda de IA vinculada: quem leva o credito e o lider da equipe dele '
  '(20261001150000). fn_vendas_alcanca (escrita) NAO tem este ultimo caso.';

-- ── 9. Fechamento do setor: equipe e natureza pelo credito ──────────────────
--
-- Igual a 20260915160000, com `deste` resolvendo o credito antes de decidir
-- equipe e natureza. Total e destinos nao mudam — o vinculo nunca tira linha
-- de setor nenhum.

CREATE OR REPLACE FUNCTION public.fn_vendas_fechamento_do_setor(
  p_empresa_id UUID, p_setor_id UUID, p_mes DATE
)
RETURNS TABLE(
  escopo          TEXT,
  chave           TEXT,
  rotulo          TEXT,
  linhas          INTEGER,
  valor           NUMERIC,
  linhas_na_regua INTEGER,
  valor_na_regua  NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_escopo INTEGER;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  v_escopo := public.fn_user_escopo('vendas');

  IF v_escopo < 2 THEN
    RAISE EXCEPTION 'O fechamento mostra a conta do setor inteiro, e seu acesso em Vendas alcança menos que isso.'
      USING ERRCODE = '42501';
  END IF;

  IF v_escopo = 2 AND p_setor_id NOT IN (
    SELECT s FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s
  ) THEN
    RAISE EXCEPTION 'Este setor está fora do seu alcance em Vendas.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH lote AS (
    SELECT l.id
      FROM public.vendas_lotes l
     WHERE l.empresa_id = p_empresa_id
       AND l.mes        = DATE_TRUNC('month', p_mes)::DATE
       AND l.origem     = 'geral'
       AND l.estado     = 'vigente'
     LIMIT 1
  ),
  base AS (
    SELECT r.nr_documento,
           r.valor_total,
           r.conta_na_meta,
           r.valor_na_meta,
           COALESCE(r.data_confirmacao, r.data_venda) AS data_credito,
           f.estado   AS franquia_estado,
           f.setor_id AS franquia_setor,
           public.fn_vendas_perfil_do_login(r.empresa_id, r.login_vendedor) AS perfil_id
      FROM public.vendas_relatorio r
      LEFT JOIN public.vendas_franquias f
        ON f.empresa_id = r.empresa_id AND f.codigo = r.codigo_franquia
     WHERE r.lote_id = (SELECT id FROM lote)
  ),
  destinada AS (
    SELECT b.*,
           CASE
             WHEN b.franquia_estado IS NULL
               OR b.franquia_estado = 'novo'      THEN 'sem_franquia'
             WHEN b.franquia_estado = 'ignorado'  THEN 'ignorada'
             WHEN b.perfil_id IS NULL             THEN 'sem_operador'
             WHEN b.franquia_setor = p_setor_id   THEN 'deste_setor'
             ELSE 'outro_setor'
           END AS destino
      FROM base b
  ),
  -- O credito: venda de IA vinculada na data vira do operador do vinculo.
  creditada AS (
    SELECT d.*,
           COALESCE(public.fn_vendas_ia_credito(d.perfil_id, d.data_credito), d.perfil_id) AS credito_id
      FROM destinada d
     WHERE d.destino = 'deste_setor'
  ),
  deste AS (
    SELECT c.*,
           public.fn_vendas_equipe_que_credita(c.credito_id) AS equipe_id,
           COALESCE((SELECT p.robo FROM public.perfis p WHERE p.id = c.credito_id), FALSE) AS e_robo
      FROM creditada c
  )
  SELECT 'total', NULL::TEXT, 'Retrato do mês',
         COUNT(*)::INTEGER, COALESCE(SUM(d.valor_total), 0),
         COUNT(*) FILTER (WHERE d.conta_na_meta)::INTEGER,
         COALESCE(SUM(d.valor_na_meta), 0)
    FROM destinada d

  UNION ALL
  SELECT 'destino', d.destino,
         CASE d.destino
           WHEN 'deste_setor'  THEN 'Deste setor'
           WHEN 'outro_setor'  THEN 'De outro setor'
           WHEN 'sem_operador' THEN 'Login sem perfil no sistema'
           WHEN 'sem_franquia' THEN 'Franquia que ninguém vinculou'
           ELSE 'Franquia ignorada'
         END,
         COUNT(*)::INTEGER, COALESCE(SUM(d.valor_total), 0),
         COUNT(*) FILTER (WHERE d.conta_na_meta)::INTEGER,
         COALESCE(SUM(d.valor_na_meta), 0)
    FROM destinada d
   GROUP BY d.destino

  UNION ALL
  SELECT 'equipe',
         COALESCE(e.equipe_id::TEXT, 'sem_equipe'),
         COALESCE((SELECT q.nome FROM public.equipes q WHERE q.id = e.equipe_id), 'Sem equipe'),
         COUNT(*)::INTEGER, COALESCE(SUM(e.valor_total), 0),
         COUNT(*) FILTER (WHERE e.conta_na_meta)::INTEGER,
         COALESCE(SUM(e.valor_na_meta), 0)
    FROM deste e
   GROUP BY e.equipe_id

  UNION ALL
  SELECT 'natureza',
         CASE WHEN e.e_robo THEN 'robo' ELSE 'humano' END,
         CASE WHEN e.e_robo THEN 'Automação' ELSE 'Pessoas' END,
         COUNT(*)::INTEGER, COALESCE(SUM(e.valor_total), 0),
         COUNT(*) FILTER (WHERE e.conta_na_meta)::INTEGER,
         COALESCE(SUM(e.valor_na_meta), 0)
    FROM deste e
   GROUP BY e.e_robo

  UNION ALL
  SELECT 'conferencia', 'em_vendas', 'Gravado em Vendas',
         COUNT(*)::INTEGER, COALESCE(SUM(v.valor_total), 0),
         COUNT(*) FILTER (WHERE v.conta_na_meta)::INTEGER,
         COALESCE(SUM(v.valor_na_meta), 0)
    FROM public.vendas v
   WHERE v.empresa_id = p_empresa_id
     AND v.setor_id   = p_setor_id
     AND v.data_confirmacao >= DATE_TRUNC('month', p_mes)::DATE
     AND v.data_confirmacao <  (DATE_TRUNC('month', p_mes) + INTERVAL '1 month')::DATE;
END;
$function$;

-- ── 10. Verificacao ─────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF to_regclass('public.vendas_ia_vinculos') IS NULL
     OR to_regclass('public.vendas_ia_tipos') IS NULL
     OR to_regclass('public.vendas_ia_vinculos_historico') IS NULL THEN
    RAISE EXCEPTION 'Tabelas de IA nao foram criadas.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'perfis' AND column_name = 'ia_tipo_id'
  ) THEN
    RAISE EXCEPTION 'perfis.ia_tipo_id nao foi criada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'vendas' AND policyname = 'vendas_select'
       AND qual ILIKE '%vendas_ia_vinculos%'
  ) THEN
    RAISE EXCEPTION 'vendas_select nao enxerga o vinculo de IA.';
  END IF;
  IF (SELECT COUNT(*) FROM public.vendas_ia_tipos t
        JOIN public.empresas e ON e.id = t.empresa_id
       WHERE e.produto = 'comercial') < 2 THEN
    RAISE EXCEPTION 'Os tipos Comum e Indicacao nao foram semeados.';
  END IF;
END;
$verificacao$;

COMMIT;
