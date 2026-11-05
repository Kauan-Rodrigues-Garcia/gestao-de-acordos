-- ============================================================================
-- 20261104180000_jornada_acesso_e_retencao.sql
--
-- Abas «Acesso» e «Retenção» do Jornada (pedido de 04/11/2026).
--
-- Quem está no subgrupo Suporte ganha a aba Acesso; quem está no subgrupo
-- Retenção ganha a aba Retenção. Nas duas a pessoa lança só o NR e a data, e
-- a tela filtra pelo dia. A liderança configura uma meta (ex.: 100 acessos por
-- dia) que vale para cada operador do subgrupo.
--
-- ## Quem é Suporte e quem é Retenção
--
-- O NOME do subgrupo (`equipe_subgrupos.nome`), sem acento e sem caixa:
-- começa com «suporte» → aba Acesso; começa com «retenc» → aba Retenção. Não
-- há lista de pessoas: mover alguém de subgrupo na tela de Equipes já liga ou
-- desliga a aba dela.
--
-- ## Quem vê, quem lança, quem configura
--
--   membro do subgrupo   vê a aba, lança e apaga os PRÓPRIOS lançamentos, vê o
--                        placar da equipe (só contagem, não os NRs dos outros).
--   liderança            líder do setor do subgrupo, gerência, diretoria,
--                        administrador e super_admin: vê todos os lançamentos,
--                        apaga qualquer um e configura a meta.
--
-- ## O que este arquivo faz
--
--   - cria 2 tabelas vazias, sem acesso direto de `authenticated`;
--   - cria 8 funções (tipo do subgrupo, membro, gere, abas, painel, lançar,
--     excluir, salvar meta).
--
-- Nenhum dado existente é alterado. Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. As tabelas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.jornada_registros (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- 'acesso' (subgrupo Suporte) ou 'retencao' (subgrupo Retenção).
  tipo        TEXT NOT NULL,
  -- O subgrupo em que a pessoa estava ao lançar. Fica no lançamento: quem muda
  -- de subgrupo não leva a produção junto. Apagar o subgrupo não apaga o
  -- histórico — a linha só perde o vínculo.
  subgrupo_id UUID REFERENCES public.equipe_subgrupos(id) ON DELETE SET NULL,
  perfil_id   UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  nr          TEXT NOT NULL,
  data        DATE NOT NULL,
  criado_por  UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jornada_registros_tipo CHECK (tipo IN ('acesso', 'retencao')),
  CONSTRAINT jornada_registros_nr   CHECK (nr ~ '^[0-9]{1,20}$')
);

-- O mesmo NR duas vezes no mesmo dia, pela mesma pessoa, na mesma aba, é
-- clique repetido — não é produção.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jornada_registros_unico
  ON public.jornada_registros (empresa_id, tipo, perfil_id, nr, data);

CREATE INDEX IF NOT EXISTS idx_jornada_registros_subgrupo_data
  ON public.jornada_registros (subgrupo_id, data);

COMMENT ON TABLE public.jornada_registros IS
  'Lancamentos das abas Acesso (Suporte) e Retencao do Jornada: NR + data. '
  'Leitura e escrita so pelas funcoes fn_jornada_*. Ver 20261104180000.';

-- A meta de cada subgrupo. Sem linha = sem meta.
CREATE TABLE IF NOT EXISTS public.jornada_metas (
  subgrupo_id    UUID PRIMARY KEY REFERENCES public.equipe_subgrupos(id) ON DELETE CASCADE,
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  meta           INTEGER NOT NULL,
  -- 'dia': a meta é de cada dia. 'mes': a meta é do mês inteiro.
  periodo        TEXT NOT NULL DEFAULT 'dia',
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jornada_metas_meta    CHECK (meta BETWEEN 1 AND 100000),
  CONSTRAINT jornada_metas_periodo CHECK (periodo IN ('dia', 'mes'))
);

COMMENT ON TABLE public.jornada_metas IS
  'Meta por operador de cada subgrupo do Jornada (Acesso/Retencao), por dia ou '
  'por mes. Escrita so por fn_jornada_meta_salvar. Ver 20261104180000.';

-- Sem policy: ninguém lê nem escreve direto. Tudo passa pelas funções abaixo.
ALTER TABLE public.jornada_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_metas     ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jornada_registros FROM authenticated, anon;
REVOKE ALL ON public.jornada_metas     FROM authenticated, anon;

-- ============================================================================
-- 2. Tipo do subgrupo, membro e liderança
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_jornada_tipo_subgrupo(p_nome TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
           WHEN n LIKE 'suporte%' THEN 'acesso'
           WHEN n LIKE 'retenc%'  THEN 'retencao'
         END
    FROM (SELECT lower(translate(btrim(COALESCE(p_nome, '')),
                   'ÇçÃãÁáÀàÂâÉéÊêÍíÓóÔôÕõÚúÜü',
                   'CcAaAaAaAaEeEeIiOoOoOoUuUu')) AS n) x;
$function$;

COMMENT ON FUNCTION public.fn_jornada_tipo_subgrupo(TEXT) IS
  'Nome do subgrupo -> aba do Jornada: suporte* = acesso, retenc* = retencao, '
  'resto = NULL. 20261104180000.';

-- A pessoa logada está neste subgrupo?
CREATE OR REPLACE FUNCTION public.fn_jornada_membro(p_subgrupo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.perfis p
      JOIN public.equipe_subgrupos sg ON sg.id = p.subgrupo_id AND sg.equipe_id = p.equipe_id
     WHERE p.id = (SELECT auth.uid())
       AND p.subgrupo_id = p_subgrupo_id
       AND NOT COALESCE(p.arquivado, FALSE)
  );
$function$;

COMMENT ON FUNCTION public.fn_jornada_membro(UUID) IS
  'A pessoa logada esta neste subgrupo (e o subgrupo e da equipe dela)? 20261104180000.';

-- A pessoa logada é liderança deste subgrupo?
CREATE OR REPLACE FUNCTION public.fn_jornada_gere(p_subgrupo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.equipe_subgrupos sg
      JOIN public.equipes e ON e.id = sg.equipe_id
     WHERE sg.id = p_subgrupo_id
       AND public.fn_can_access_empresa(sg.empresa_id)
       AND (
         public.fn_user_is_super_admin()
         OR public.fn_user_has_any_role(ARRAY['administrador', 'gerencia', 'diretoria'])
         OR (
           public.fn_user_has_any_role(ARRAY['lider'])
           AND e.setor_id IN (SELECT s FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s)
         )
       )
  );
$function$;

COMMENT ON FUNCTION public.fn_jornada_gere(UUID) IS
  'A pessoa logada e lideranca deste subgrupo (lider do setor, gerencia, '
  'diretoria, administrador, super_admin)? 20261104180000.';

-- ============================================================================
-- 3. As abas da pessoa logada
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_jornada_minhas_abas(p_empresa_id UUID)
RETURNS TABLE(
  subgrupo_id   UUID,
  tipo          TEXT,
  subgrupo_nome TEXT,
  equipe_nome   TEXT,
  setor_nome    TEXT,
  sou_membro    BOOLEAN,
  pode_gerir    BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT x.id, x.tipo, x.nome, x.equipe_nome, x.setor_nome, x.membro, x.gere
    FROM (
      SELECT sg.id, public.fn_jornada_tipo_subgrupo(sg.nome) AS tipo, sg.nome,
             e.nome AS equipe_nome, s.nome AS setor_nome,
             public.fn_jornada_membro(sg.id) AS membro,
             public.fn_jornada_gere(sg.id)   AS gere
        FROM public.equipe_subgrupos sg
        JOIN public.equipes e ON e.id = sg.equipe_id
        LEFT JOIN public.setores s ON s.id = e.setor_id
       WHERE sg.empresa_id = p_empresa_id
         AND public.fn_can_access_empresa(p_empresa_id)
         AND public.fn_jornada_tipo_subgrupo(sg.nome) IS NOT NULL
    ) x
   WHERE x.membro OR x.gere
   ORDER BY x.tipo, x.membro DESC, x.setor_nome, x.equipe_nome, x.nome;
$function$;

COMMENT ON FUNCTION public.fn_jornada_minhas_abas(UUID) IS
  'Subgrupos Suporte/Retencao que a pessoa logada alcanca (membro ou lideranca). '
  'O menu mostra a aba quando ha ao menos um. 20261104180000.';

-- ============================================================================
-- 4. O painel de um subgrupo num dia
-- ============================================================================
--
-- Devolve:
--   meta, periodo        a meta do subgrupo (NULL = sem meta);
--   pode_gerir, sou_membro;
--   pessoas              quem está no subgrupo (e quem lançou nele no mês), com
--                        a contagem do dia e do mês — só números;
--   dias                 total por dia do mês (o meu, para o membro; o da
--                        equipe, para a liderança);
--   registros            os lançamentos do dia (os meus, para o membro; todos,
--                        para a liderança).

CREATE OR REPLACE FUNCTION public.fn_jornada_painel(p_subgrupo_id UUID, p_dia DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid     UUID := (SELECT auth.uid());
  v_gere    BOOLEAN := public.fn_jornada_gere(p_subgrupo_id);
  v_membro  BOOLEAN := public.fn_jornada_membro(p_subgrupo_id);
  v_sg      RECORD;
  v_ini     DATE := date_trunc('month', p_dia)::DATE;
  v_fim     DATE := (date_trunc('month', p_dia) + INTERVAL '1 month')::DATE;
BEGIN
  IF NOT (v_gere OR v_membro) THEN
    RAISE EXCEPTION 'Sem permissao para ver este subgrupo.' USING ERRCODE = '42501';
  END IF;

  SELECT sg.id, sg.equipe_id, sg.empresa_id, public.fn_jornada_tipo_subgrupo(sg.nome) AS tipo
    INTO v_sg
    FROM public.equipe_subgrupos sg
   WHERE sg.id = p_subgrupo_id;

  RETURN jsonb_build_object(
    'tipo', v_sg.tipo,
    'pode_gerir', v_gere,
    'sou_membro', v_membro,
    'meta', (SELECT m.meta FROM public.jornada_metas m WHERE m.subgrupo_id = p_subgrupo_id),
    'periodo', COALESCE((SELECT m.periodo FROM public.jornada_metas m WHERE m.subgrupo_id = p_subgrupo_id), 'dia'),
    'pessoas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'nome', p.nome, 'foto_url', p.foto_url,
               'no_subgrupo', p.subgrupo_id IS NOT DISTINCT FROM p_subgrupo_id,
               'no_dia', COALESCE(c.no_dia, 0), 'no_mes', COALESCE(c.no_mes, 0))
             ORDER BY COALESCE(c.no_dia, 0) DESC, COALESCE(c.no_mes, 0) DESC, p.nome)
        FROM public.perfis p
        LEFT JOIN (
          SELECT r.perfil_id,
                 COUNT(*) FILTER (WHERE r.data = p_dia) AS no_dia,
                 COUNT(*) AS no_mes
            FROM public.jornada_registros r
           WHERE r.subgrupo_id = p_subgrupo_id
             AND r.data >= v_ini AND r.data < v_fim
           GROUP BY r.perfil_id
        ) c ON c.perfil_id = p.id
       WHERE (p.subgrupo_id = p_subgrupo_id AND p.equipe_id = v_sg.equipe_id
              AND NOT COALESCE(p.arquivado, FALSE)
              AND COALESCE(p.situacao, '') <> 'desligado')
          OR c.perfil_id IS NOT NULL
    ), '[]'::JSONB),
    'dias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dia', d.data, 'total', d.total) ORDER BY d.data)
        FROM (
          SELECT r.data, COUNT(*) AS total
            FROM public.jornada_registros r
           WHERE r.subgrupo_id = p_subgrupo_id
             AND r.data >= v_ini AND r.data < v_fim
             AND (v_gere OR r.perfil_id = v_uid)
           GROUP BY r.data
        ) d
    ), '[]'::JSONB),
    'registros', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'nr', r.nr, 'data', r.data, 'perfil_id', r.perfil_id,
               'nome', p.nome, 'criado_em', r.criado_em)
             ORDER BY r.criado_em DESC)
        FROM public.jornada_registros r
        LEFT JOIN public.perfis p ON p.id = r.perfil_id
       WHERE r.subgrupo_id = p_subgrupo_id
         AND r.data = p_dia
         AND (v_gere OR r.perfil_id = v_uid)
    ), '[]'::JSONB)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_painel(UUID, DATE) IS
  'Meta, placar da equipe, total por dia do mes e lancamentos do dia de um '
  'subgrupo do Jornada. Membro ve os proprios NRs; lideranca ve todos. 20261104180000.';

-- ============================================================================
-- 5. Lançar
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_jornada_lancar(p_subgrupo_id UUID, p_nr TEXT, p_data DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid  UUID := (SELECT auth.uid());
  v_nr   TEXT := regexp_replace(COALESCE(p_nr, ''), '\D', '', 'g');
  v_sg   RECORD;
  v_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_id   UUID;
BEGIN
  IF NOT public.fn_jornada_membro(p_subgrupo_id) THEN
    RAISE EXCEPTION 'So quem esta neste subgrupo lanca aqui.' USING ERRCODE = '42501';
  END IF;

  SELECT sg.empresa_id, public.fn_jornada_tipo_subgrupo(sg.nome) AS tipo
    INTO v_sg
    FROM public.equipe_subgrupos sg
   WHERE sg.id = p_subgrupo_id;

  IF v_sg.tipo IS NULL THEN
    RAISE EXCEPTION 'Este subgrupo nao e Suporte nem Retencao.' USING ERRCODE = '22023';
  END IF;
  IF v_nr = '' OR length(v_nr) > 20 THEN
    RAISE EXCEPTION 'Informe o NR (so numeros).' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Informe a data.' USING ERRCODE = '22023';
  END IF;
  IF p_data > v_hoje THEN
    RAISE EXCEPTION 'A data nao pode ser depois de hoje.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.jornada_registros (empresa_id, tipo, subgrupo_id, perfil_id, nr, data, criado_por)
  VALUES (v_sg.empresa_id, v_sg.tipo, p_subgrupo_id, v_uid, v_nr, p_data, v_uid)
  ON CONFLICT (empresa_id, tipo, perfil_id, nr, data) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Este NR ja foi lancado por voce nesta data.' USING ERRCODE = '23505';
  END IF;
  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_lancar(UUID, TEXT, DATE) IS
  'Lanca um NR + data na aba do subgrupo (Acesso ou Retencao). So o membro, '
  'data ate hoje, sem repetir NR no mesmo dia. 20261104180000.';

-- ============================================================================
-- 6. Excluir
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_jornada_excluir(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_r RECORD;
BEGIN
  SELECT r.perfil_id, r.subgrupo_id, r.empresa_id INTO v_r
    FROM public.jornada_registros r
   WHERE r.id = p_id;
  IF NOT FOUND THEN
    RETURN;  -- Já não existe: excluir de novo não é erro.
  END IF;

  IF NOT (
    (v_r.perfil_id = (SELECT auth.uid()) AND public.fn_can_access_empresa(v_r.empresa_id))
    OR (v_r.subgrupo_id IS NOT NULL AND public.fn_jornada_gere(v_r.subgrupo_id))
    OR public.fn_user_is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Sem permissao para apagar este lancamento.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.jornada_registros WHERE id = p_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_excluir(UUID) IS
  'Apaga um lancamento do Jornada: o proprio, ou qualquer um para a lideranca. 20261104180000.';

-- ============================================================================
-- 7. Salvar a meta
-- ============================================================================
--
-- `p_meta` nulo ou zero = tirar a meta.

CREATE OR REPLACE FUNCTION public.fn_jornada_meta_salvar(p_subgrupo_id UUID, p_meta INTEGER, p_periodo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa UUID;
BEGIN
  IF NOT public.fn_jornada_gere(p_subgrupo_id) THEN
    RAISE EXCEPTION 'So a lideranca configura a meta.' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_meta, 0) <= 0 THEN
    DELETE FROM public.jornada_metas WHERE subgrupo_id = p_subgrupo_id;
    RETURN;
  END IF;
  IF p_periodo NOT IN ('dia', 'mes') THEN
    RAISE EXCEPTION 'Periodo invalido.' USING ERRCODE = '22023';
  END IF;

  SELECT sg.empresa_id INTO v_empresa FROM public.equipe_subgrupos sg WHERE sg.id = p_subgrupo_id;

  INSERT INTO public.jornada_metas AS m (subgrupo_id, empresa_id, meta, periodo, atualizado_por, atualizado_em)
  VALUES (p_subgrupo_id, v_empresa, p_meta, p_periodo, (SELECT auth.uid()), NOW())
  ON CONFLICT (subgrupo_id) DO UPDATE
     SET meta           = EXCLUDED.meta,
         periodo        = EXCLUDED.periodo,
         atualizado_por = EXCLUDED.atualizado_por,
         atualizado_em  = NOW();
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_meta_salvar(UUID, INTEGER, TEXT) IS
  'Grava (ou tira, com 0) a meta por operador de um subgrupo do Jornada. So a lideranca. 20261104180000.';

-- ── Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_jornada_tipo_subgrupo(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_membro(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_gere(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_minhas_abas(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_painel(UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_lancar(UUID, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_excluir(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_meta_salvar(UUID, INTEGER, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_jornada_tipo_subgrupo(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_membro(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_gere(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_minhas_abas(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_painel(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_lancar(UUID, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_excluir(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_meta_salvar(UUID, INTEGER, TEXT) TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF public.fn_jornada_tipo_subgrupo('Suporte') IS DISTINCT FROM 'acesso'
     OR public.fn_jornada_tipo_subgrupo(' SUPORTE 2 ') IS DISTINCT FROM 'acesso'
     OR public.fn_jornada_tipo_subgrupo('Retenção') IS DISTINCT FROM 'retencao'
     OR public.fn_jornada_tipo_subgrupo('RETENCAO') IS DISTINCT FROM 'retencao'
     OR public.fn_jornada_tipo_subgrupo('Elite') IS NOT NULL THEN
    RAISE EXCEPTION 'fn_jornada_tipo_subgrupo nao reconhece Suporte/Retencao como esperado.';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.jornada_registros'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.jornada_metas'::regclass) THEN
    RAISE EXCEPTION 'Uma tabela do Jornada ficou sem RLS.';
  END IF;
  IF has_table_privilege('authenticated', 'public.jornada_registros', 'SELECT')
     OR has_table_privilege('authenticated', 'public.jornada_metas', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated ainda acessa direto as tabelas do Jornada.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_jornada_lancar(uuid,text,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_jornada_lancar ficou aberta para anon.';
  END IF;
END
$prova$;

COMMIT;
