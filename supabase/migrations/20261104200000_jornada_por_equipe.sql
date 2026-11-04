-- ============================================================================
-- 20261104200000_jornada_por_equipe.sql
--
-- Abas Acesso e Retenção do Jornada também por EQUIPE (pedido de 04/11/2026).
--
-- A 20261104180000 reconhecia só o SUBGRUPO (Suporte → Acesso, Retenção →
-- Retenção). Agora uma EQUIPE com esse nome vale igual: quem está nela
-- (`perfis.equipe_id`) ganha a aba, e a liderança do setor dela acompanha.
--
-- ## O «grupo»
--
-- Cada aba trabalha sobre um grupo, que é um subgrupo OU uma equipe. As
-- funções recebem `p_grupo_id` e descobrem sozinhas o que ele é (o id é UUID,
-- não há como um subgrupo e uma equipe terem o mesmo).
--
-- ## O nome
--
-- A palavra pode estar em qualquer posição: «Suporte», «Equipe Suporte»,
-- «RETENÇÃO JORNADA». Antes só valia no começo do nome.
--
-- ## O que este arquivo faz
--
--   - `jornada_registros` ganha `equipe_id` (o lançamento feito por equipe);
--   - `jornada_metas` passa a ser por grupo (os dados, se houver, são levados);
--   - as funções fn_jornada_* são refeitas com `p_grupo_id`.
--
-- Nenhum dado de outra tabela é alterado. Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. As tabelas
-- ============================================================================

ALTER TABLE public.jornada_registros
  ADD COLUMN IF NOT EXISTS equipe_id UUID REFERENCES public.equipes(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jornada_registros_um_grupo') THEN
    ALTER TABLE public.jornada_registros
      ADD CONSTRAINT jornada_registros_um_grupo CHECK (num_nonnulls(subgrupo_id, equipe_id) <= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jornada_registros_equipe_data
  ON public.jornada_registros (equipe_id, data);

COMMENT ON COLUMN public.jornada_registros.equipe_id IS
  'Equipe Suporte/Retencao em que a pessoa lancou (quando o grupo e a equipe, '
  'nao um subgrupo). 20261104200000.';

-- A meta passa a ser por grupo (subgrupo ou equipe).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'jornada_metas'
                AND column_name = 'subgrupo_id') THEN
    ALTER TABLE public.jornada_metas RENAME TO jornada_metas_20261104180000;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.jornada_metas (
  grupo_id       UUID PRIMARY KEY,
  -- 'subgrupo' ou 'equipe': de onde vem `grupo_id`.
  grupo          TEXT NOT NULL,
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  meta           INTEGER NOT NULL,
  -- A meta é do MÊS (pedido de 04/11/2026); a coluna fica por compatibilidade.
  periodo        TEXT NOT NULL DEFAULT 'mes',
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jornada_metas_grupo   CHECK (grupo IN ('subgrupo', 'equipe')),
  CONSTRAINT jornada_metas_meta    CHECK (meta BETWEEN 1 AND 100000),
  CONSTRAINT jornada_metas_periodo CHECK (periodo IN ('dia', 'mes'))
);

DO $$
BEGIN
  IF to_regclass('public.jornada_metas_20261104180000') IS NOT NULL THEN
    INSERT INTO public.jornada_metas (grupo_id, grupo, empresa_id, meta, periodo, atualizado_por, atualizado_em)
    SELECT subgrupo_id, 'subgrupo', empresa_id, meta, 'mes', atualizado_por, atualizado_em
      FROM public.jornada_metas_20261104180000
    ON CONFLICT (grupo_id) DO NOTHING;
    DROP TABLE public.jornada_metas_20261104180000;
  END IF;
END $$;

COMMENT ON TABLE public.jornada_metas IS
  'Meta por operador de cada grupo (subgrupo ou equipe) Suporte/Retencao do '
  'Jornada, por dia ou por mes. Escrita so por fn_jornada_meta_salvar. 20261104200000.';

ALTER TABLE public.jornada_metas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jornada_metas FROM authenticated, anon;

-- ============================================================================
-- 2. As funções antigas saem (o nome do parâmetro e o retorno mudam)
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_jornada_minhas_abas(UUID);
DROP FUNCTION IF EXISTS public.fn_jornada_painel(UUID, DATE);
DROP FUNCTION IF EXISTS public.fn_jornada_lancar(UUID, TEXT, DATE);
DROP FUNCTION IF EXISTS public.fn_jornada_meta_salvar(UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.fn_jornada_membro(UUID);
DROP FUNCTION IF EXISTS public.fn_jornada_gere(UUID);

-- ============================================================================
-- 3. O nome → a aba (agora a palavra em qualquer posição)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_jornada_tipo_subgrupo(p_nome TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
           WHEN n ~ '(^|[^a-z0-9])suporte' THEN 'acesso'
           WHEN n ~ '(^|[^a-z0-9])retenc'  THEN 'retencao'
         END
    FROM (SELECT lower(translate(btrim(COALESCE(p_nome, '')),
                   'ÇçÃãÁáÀàÂâÉéÊêÍíÓóÔôÕõÚúÜü',
                   'CcAaAaAaAaEeEeIiOoOoOoUuUu')) AS n) x;
$function$;

COMMENT ON FUNCTION public.fn_jornada_tipo_subgrupo(TEXT) IS
  'Nome de subgrupo ou equipe -> aba do Jornada: palavra suporte = acesso, '
  'retenc = retencao, resto = NULL. 20261104200000.';

-- ============================================================================
-- 4. O grupo: subgrupo ou equipe
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_jornada_grupo(p_grupo_id UUID)
RETURNS TABLE(grupo TEXT, empresa_id UUID, equipe_id UUID, setor_id UUID, tipo TEXT, nome TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT 'subgrupo', sg.empresa_id, sg.equipe_id, e.setor_id,
         public.fn_jornada_tipo_subgrupo(sg.nome), sg.nome
    FROM public.equipe_subgrupos sg
    JOIN public.equipes e ON e.id = sg.equipe_id
   WHERE sg.id = p_grupo_id
  UNION ALL
  SELECT 'equipe', e.empresa_id, e.id, e.setor_id,
         public.fn_jornada_tipo_subgrupo(e.nome), e.nome
    FROM public.equipes e
   WHERE e.id = p_grupo_id;
$function$;

COMMENT ON FUNCTION public.fn_jornada_grupo(UUID) IS
  'O que e este grupo do Jornada: subgrupo ou equipe, empresa, equipe, setor, '
  'aba (tipo) e nome. 20261104200000.';

-- A pessoa logada está neste grupo?
CREATE FUNCTION public.fn_jornada_membro(p_grupo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.perfis p
      JOIN public.fn_jornada_grupo(p_grupo_id) g ON TRUE
     WHERE p.id = (SELECT auth.uid())
       AND NOT COALESCE(p.arquivado, FALSE)
       AND p.equipe_id = g.equipe_id
       AND (g.grupo = 'equipe' OR p.subgrupo_id = p_grupo_id)
  );
$function$;

COMMENT ON FUNCTION public.fn_jornada_membro(UUID) IS
  'A pessoa logada esta neste grupo (equipe dela, ou subgrupo dentro da equipe dela)? 20261104200000.';

-- A pessoa logada é liderança deste grupo?
CREATE FUNCTION public.fn_jornada_gere(p_grupo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.fn_jornada_grupo(p_grupo_id) g
     WHERE public.fn_can_access_empresa(g.empresa_id)
       AND (
         public.fn_user_is_super_admin()
         OR public.fn_user_has_any_role(ARRAY['administrador', 'gerencia', 'diretoria'])
         OR (
           public.fn_user_has_any_role(ARRAY['lider'])
           AND g.setor_id IN (SELECT s FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s)
         )
       )
  );
$function$;

COMMENT ON FUNCTION public.fn_jornada_gere(UUID) IS
  'A pessoa logada e lideranca deste grupo (lider do setor, gerencia, '
  'diretoria, administrador, super_admin)? 20261104200000.';

-- ============================================================================
-- 5. As abas da pessoa logada
-- ============================================================================

CREATE FUNCTION public.fn_jornada_minhas_abas(p_empresa_id UUID)
RETURNS TABLE(
  grupo_id    UUID,
  grupo       TEXT,
  tipo        TEXT,
  grupo_nome  TEXT,
  equipe_nome TEXT,
  setor_nome  TEXT,
  sou_membro  BOOLEAN,
  pode_gerir  BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT x.id, x.grupo, x.tipo, x.nome, x.equipe_nome, x.setor_nome, x.membro, x.gere
    FROM (
      SELECT sg.id, 'subgrupo'::TEXT AS grupo, public.fn_jornada_tipo_subgrupo(sg.nome) AS tipo,
             sg.nome, e.nome AS equipe_nome, s.nome AS setor_nome,
             public.fn_jornada_membro(sg.id) AS membro,
             public.fn_jornada_gere(sg.id)   AS gere
        FROM public.equipe_subgrupos sg
        JOIN public.equipes e ON e.id = sg.equipe_id
        LEFT JOIN public.setores s ON s.id = e.setor_id
       WHERE sg.empresa_id = p_empresa_id
         AND public.fn_jornada_tipo_subgrupo(sg.nome) IS NOT NULL
      UNION ALL
      SELECT e.id, 'equipe'::TEXT, public.fn_jornada_tipo_subgrupo(e.nome),
             e.nome, e.nome, s.nome,
             public.fn_jornada_membro(e.id),
             public.fn_jornada_gere(e.id)
        FROM public.equipes e
        LEFT JOIN public.setores s ON s.id = e.setor_id
       WHERE e.empresa_id = p_empresa_id
         AND public.fn_jornada_tipo_subgrupo(e.nome) IS NOT NULL
    ) x
   WHERE public.fn_can_access_empresa(p_empresa_id)
     AND (x.membro OR x.gere)
   ORDER BY x.tipo, x.membro DESC, x.setor_nome, x.equipe_nome, x.nome;
$function$;

COMMENT ON FUNCTION public.fn_jornada_minhas_abas(UUID) IS
  'Grupos (subgrupo ou equipe) Suporte/Retencao que a pessoa logada alcanca '
  '(membro ou lideranca). O menu mostra a aba quando ha ao menos um. 20261104200000.';

-- ============================================================================
-- 6. O painel de um grupo num dia
-- ============================================================================

CREATE FUNCTION public.fn_jornada_painel(p_grupo_id UUID, p_dia DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid    UUID := (SELECT auth.uid());
  v_gere   BOOLEAN := public.fn_jornada_gere(p_grupo_id);
  v_membro BOOLEAN := public.fn_jornada_membro(p_grupo_id);
  v_g      RECORD;
  v_ini    DATE := date_trunc('month', p_dia)::DATE;
  v_fim    DATE := (date_trunc('month', p_dia) + INTERVAL '1 month')::DATE;
BEGIN
  IF NOT (v_gere OR v_membro) THEN
    RAISE EXCEPTION 'Sem permissao para ver este grupo.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_g FROM public.fn_jornada_grupo(p_grupo_id) LIMIT 1;

  RETURN jsonb_build_object(
    'tipo', v_g.tipo,
    'grupo', v_g.grupo,
    'pode_gerir', v_gere,
    'sou_membro', v_membro,
    'meta', (SELECT m.meta FROM public.jornada_metas m WHERE m.grupo_id = p_grupo_id),
    'periodo', 'mes',
    'pessoas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'nome', p.nome, 'foto_url', p.foto_url,
               'no_grupo', (p.equipe_id IS NOT DISTINCT FROM v_g.equipe_id
                            AND (v_g.grupo = 'equipe' OR p.subgrupo_id IS NOT DISTINCT FROM p_grupo_id)),
               'no_dia', COALESCE(c.no_dia, 0), 'no_mes', COALESCE(c.no_mes, 0))
             ORDER BY COALESCE(c.no_dia, 0) DESC, COALESCE(c.no_mes, 0) DESC, p.nome)
        FROM public.perfis p
        LEFT JOIN (
          SELECT r.perfil_id,
                 COUNT(*) FILTER (WHERE r.data = p_dia) AS no_dia,
                 COUNT(*) AS no_mes
            FROM public.jornada_registros r
           WHERE (r.subgrupo_id = p_grupo_id OR r.equipe_id = p_grupo_id)
             AND r.data >= v_ini AND r.data < v_fim
           GROUP BY r.perfil_id
        ) c ON c.perfil_id = p.id
       WHERE ((p.equipe_id = v_g.equipe_id
               AND (v_g.grupo = 'equipe' OR p.subgrupo_id = p_grupo_id)
               AND NOT COALESCE(p.arquivado, FALSE)
               AND COALESCE(p.situacao, '') <> 'desligado')
              OR c.perfil_id IS NOT NULL)
         -- O operador só vê a si mesmo; a liderança vê o grupo inteiro.
         AND (v_gere OR p.id = v_uid)
    ), '[]'::JSONB),
    'dias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dia', d.data, 'total', d.total) ORDER BY d.data)
        FROM (
          SELECT r.data, COUNT(*) AS total
            FROM public.jornada_registros r
           WHERE (r.subgrupo_id = p_grupo_id OR r.equipe_id = p_grupo_id)
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
       WHERE (r.subgrupo_id = p_grupo_id OR r.equipe_id = p_grupo_id)
         AND r.data = p_dia
         AND (v_gere OR r.perfil_id = v_uid)
    ), '[]'::JSONB)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_painel(UUID, DATE) IS
  'Meta, placar, total por dia do mes e lancamentos do dia de um grupo do '
  'Jornada. Membro ve so os proprios numeros e NRs; lideranca ve todos. 20261104200000.';

-- ============================================================================
-- 7. Lançar
-- ============================================================================

CREATE FUNCTION public.fn_jornada_lancar(p_grupo_id UUID, p_nr TEXT, p_data DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid  UUID := (SELECT auth.uid());
  v_nr   TEXT := regexp_replace(COALESCE(p_nr, ''), '\D', '', 'g');
  v_g    RECORD;
  v_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_id   UUID;
BEGIN
  IF NOT public.fn_jornada_membro(p_grupo_id) THEN
    RAISE EXCEPTION 'So quem esta neste grupo lanca aqui.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_g FROM public.fn_jornada_grupo(p_grupo_id) LIMIT 1;

  IF v_g.tipo IS NULL THEN
    RAISE EXCEPTION 'Este grupo nao e Suporte nem Retencao.' USING ERRCODE = '22023';
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

  INSERT INTO public.jornada_registros (empresa_id, tipo, subgrupo_id, equipe_id, perfil_id, nr, data, criado_por)
  VALUES (v_g.empresa_id, v_g.tipo,
          CASE WHEN v_g.grupo = 'subgrupo' THEN p_grupo_id END,
          CASE WHEN v_g.grupo = 'equipe'   THEN p_grupo_id END,
          v_uid, v_nr, p_data, v_uid)
  ON CONFLICT (empresa_id, tipo, perfil_id, nr, data) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Este NR ja foi lancado por voce nesta data.' USING ERRCODE = '23505';
  END IF;
  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_lancar(UUID, TEXT, DATE) IS
  'Lanca um NR + data na aba do grupo (subgrupo ou equipe; Acesso ou Retencao). '
  'So o membro, data ate hoje, sem repetir NR no mesmo dia. 20261104200000.';

-- ============================================================================
-- 8. Excluir
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
  SELECT r.perfil_id, COALESCE(r.subgrupo_id, r.equipe_id) AS grupo_id, r.empresa_id INTO v_r
    FROM public.jornada_registros r
   WHERE r.id = p_id;
  IF NOT FOUND THEN
    RETURN;  -- Já não existe: excluir de novo não é erro.
  END IF;

  IF NOT (
    (v_r.perfil_id = (SELECT auth.uid()) AND public.fn_can_access_empresa(v_r.empresa_id))
    OR (v_r.grupo_id IS NOT NULL AND public.fn_jornada_gere(v_r.grupo_id))
    OR public.fn_user_is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Sem permissao para apagar este lancamento.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.jornada_registros WHERE id = p_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_excluir(UUID) IS
  'Apaga um lancamento do Jornada: o proprio, ou qualquer um para a lideranca. 20261104200000.';

-- ============================================================================
-- 9. Salvar a meta
-- ============================================================================

CREATE FUNCTION public.fn_jornada_meta_salvar(p_grupo_id UUID, p_meta INTEGER, p_periodo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_g RECORD;
BEGIN
  IF NOT public.fn_jornada_gere(p_grupo_id) THEN
    RAISE EXCEPTION 'So a lideranca configura a meta.' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_meta, 0) <= 0 THEN
    DELETE FROM public.jornada_metas WHERE grupo_id = p_grupo_id;
    RETURN;
  END IF;
  IF p_periodo NOT IN ('dia', 'mes') THEN
    RAISE EXCEPTION 'Periodo invalido.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_g FROM public.fn_jornada_grupo(p_grupo_id) LIMIT 1;

  INSERT INTO public.jornada_metas AS m (grupo_id, grupo, empresa_id, meta, periodo, atualizado_por, atualizado_em)
  VALUES (p_grupo_id, v_g.grupo, v_g.empresa_id, p_meta, p_periodo, (SELECT auth.uid()), NOW())
  ON CONFLICT (grupo_id) DO UPDATE
     SET meta           = EXCLUDED.meta,
         periodo        = EXCLUDED.periodo,
         atualizado_por = EXCLUDED.atualizado_por,
         atualizado_em  = NOW();
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_meta_salvar(UUID, INTEGER, TEXT) IS
  'Grava (ou tira, com 0) a meta por operador de um grupo do Jornada. So a lideranca. 20261104200000.';

-- ── Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_jornada_tipo_subgrupo(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_grupo(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_membro(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_gere(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_minhas_abas(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_painel(UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_lancar(UUID, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_excluir(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_meta_salvar(UUID, INTEGER, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_jornada_tipo_subgrupo(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_grupo(UUID) TO authenticated;
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
     OR public.fn_jornada_tipo_subgrupo('Equipe Suporte') IS DISTINCT FROM 'acesso'
     OR public.fn_jornada_tipo_subgrupo('Retenção') IS DISTINCT FROM 'retencao'
     OR public.fn_jornada_tipo_subgrupo('JORNADA - RETENCAO') IS DISTINCT FROM 'retencao'
     OR public.fn_jornada_tipo_subgrupo('Elite') IS NOT NULL
     OR public.fn_jornada_tipo_subgrupo('Luciano') IS NOT NULL THEN
    RAISE EXCEPTION 'fn_jornada_tipo_subgrupo nao reconhece Suporte/Retencao como esperado.';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.jornada_metas'::regclass) THEN
    RAISE EXCEPTION 'jornada_metas ficou sem RLS.';
  END IF;
  IF has_table_privilege('authenticated', 'public.jornada_metas', 'SELECT')
     OR has_table_privilege('authenticated', 'public.jornada_registros', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated ainda acessa direto as tabelas do Jornada.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_jornada_lancar(uuid,text,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_jornada_lancar ficou aberta para anon.';
  END IF;
  IF to_regclass('public.jornada_metas_20261104180000') IS NOT NULL THEN
    RAISE EXCEPTION 'A tabela antiga de metas ficou para tras.';
  END IF;
END
$prova$;

COMMIT;
