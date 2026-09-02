-- ═══════════════════════════════════════════════════════════════════════════
-- O retrato do mês passa a congelar também o NOME DO SETOR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Terceira e última peça que faltava. `composicao_mes` guarda as pessoas,
-- `composicao_mes_equipe` o nome e o setor da equipe, `composicao_mes_lider`
-- quem liderava — e o NOME DO SETOR continuava saindo de `setores` ao vivo, sem
-- filtro de mês.
--
-- Medido em 02/09/2026: o setor "Amauri Digital" foi renomeado para "Marília
-- Digital" em 01/09 às 13:46. Filtrando agosto, o cabeçalho do grupo e o card
-- consolidado diziam "Marília Digital" — um nome que não existia no mês inteiro
-- que estava sendo mostrado.
--
-- O `setor_id` sempre esteve certo (vem de `composicao_mes_equipe.setor_id` e de
-- `composicao_mes.setor_id`); o que viajava no tempo era só o rótulo.
--
-- Mesma forma das outras duas: mês corrente reescreve, mês fechado que já tem
-- retrato não é tocado, só ganha o que falta.

CREATE TABLE IF NOT EXISTS public.composicao_mes_setor (
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  mes        TEXT NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  setor_id   UUID NOT NULL,
  nome       TEXT NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, mes, setor_id)
);

-- Sem FK para `setores`: a foto tem de sobreviver ao setor apagado depois, como
-- em `composicao_mes_equipe` e `composicao_mes_lider`.
CREATE INDEX IF NOT EXISTS composicao_mes_setor_mes_idx
  ON public.composicao_mes_setor (empresa_id, mes);

ALTER TABLE public.composicao_mes_setor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS composicao_mes_setor_leitura ON public.composicao_mes_setor;
CREATE POLICY composicao_mes_setor_leitura ON public.composicao_mes_setor
  FOR SELECT USING (
    public.fn_user_acesso_multiempresa()
    OR empresa_id = (SELECT p.empresa_id FROM public.perfis p WHERE p.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS composicao_mes_setor_super_admin_total ON public.composicao_mes_setor;
CREATE POLICY composicao_mes_setor_super_admin_total ON public.composicao_mes_setor
  FOR ALL USING (public.fn_user_is_super_admin())
  WITH CHECK (public.fn_user_is_super_admin());

GRANT SELECT ON public.composicao_mes_setor TO authenticated;
GRANT ALL    ON public.composicao_mes_setor TO service_role;

COMMENT ON TABLE public.composicao_mes_setor IS
  'O nome de cada setor NAQUELE mes. O setor_id do retrato sempre esteve certo; '
  'o rotulo e que vinha de setores ao vivo e viajava no tempo — agosto aparecia '
  'com um setor renomeado em setembro (20260903350000).';

-- ─────────────────────────────────────────────────────────────────────────────
-- A função grava as quatro tabelas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_composicao_mes_snapshot(p_empresa_id uuid, p_mes text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linhas          INTEGER;
  v_equipes         INTEGER;
  v_lideres         INTEGER;
  v_setores         INTEGER;
  v_antes_operador  INTEGER;
  v_antes_equipe    INTEGER;
  v_mes_corrente    TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_fechado         BOOLEAN;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.fn_can_access_empresa(p_empresa_id)
    OR NOT (
      public.fn_user_is_super_admin()
      OR public.fn_user_has_any_role(
        ARRAY['lider','elite','gerencia','diretoria','administrador']
      )
    )
  ) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: usuário não pode gerar este retrato'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NULL
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: sessão ausente' USING ERRCODE = '42501';
  END IF;

  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  SELECT count(*) INTO v_antes_operador
    FROM public.composicao_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes;
  SELECT count(*) INTO v_antes_equipe
    FROM public.composicao_mes_equipe
   WHERE empresa_id = p_empresa_id AND mes = p_mes;

  v_fechado := p_mes < v_mes_corrente AND v_antes_operador > 0;

  IF NOT v_fechado THEN
    DELETE FROM public.composicao_mes
     WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_equipe
     WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_lider
     WHERE empresa_id = p_empresa_id AND mes = p_mes;
    DELETE FROM public.composicao_mes_setor
     WHERE empresa_id = p_empresa_id AND mes = p_mes;
  END IF;

  -- ── Setores ───────────────────────────────────────────────────────────────
  INSERT INTO public.composicao_mes_setor (empresa_id, mes, setor_id, nome)
  SELECT p_empresa_id, p_mes, s.id, s.nome
    FROM public.setores s
   WHERE s.empresa_id = p_empresa_id
     AND (NOT v_fechado OR NOT EXISTS (
       SELECT 1 FROM public.composicao_mes_setor cs
        WHERE cs.empresa_id = p_empresa_id AND cs.mes = p_mes AND cs.setor_id = s.id))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_setores = ROW_COUNT;

  -- ── Equipes ───────────────────────────────────────────────────────────────
  INSERT INTO public.composicao_mes_equipe
    (empresa_id, mes, equipe_id, nome, setor_id)
  SELECT p_empresa_id, p_mes, e.id, e.nome, e.setor_id
    FROM public.equipes e
   WHERE e.empresa_id = p_empresa_id
     AND (NOT v_fechado OR NOT EXISTS (
       SELECT 1 FROM public.composicao_mes_equipe ce
        WHERE ce.empresa_id = p_empresa_id AND ce.mes = p_mes AND ce.equipe_id = e.id))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_equipes = ROW_COUNT;

  -- ── Liderança: a regra de `lideresDaEquipe.ts`, resolvida aqui uma vez só ──
  INSERT INTO public.composicao_mes_lider (empresa_id, mes, equipe_id, lider_id, ordem)
  WITH explicitos AS (
    SELECT el.equipe_id, el.lider_id, el.criado_em
      FROM public.equipe_lideres el
      JOIN public.perfis p ON p.id = el.lider_id AND p.perfil = 'lider'
     WHERE el.empresa_id = p_empresa_id
  ),
  ja_lidera AS (SELECT DISTINCT lider_id FROM explicitos),
  reserva AS (
    SELECT e.id AS equipe_id, p.id AS lider_id, p.nome
      FROM public.equipes e
      JOIN public.perfis p ON p.equipe_id = e.id AND p.perfil = 'lider'
     WHERE e.empresa_id = p_empresa_id
       AND p.id NOT IN (SELECT lider_id FROM ja_lidera)
       AND NOT EXISTS (SELECT 1 FROM explicitos x WHERE x.equipe_id = e.id)
    UNION
    SELECT c.equipe_id, p.id, p.nome
      FROM public.equipe_operadores_clones c
      JOIN public.perfis p ON p.id = c.operador_id AND p.perfil = 'lider'
     WHERE c.empresa_id = p_empresa_id
       AND p.id NOT IN (SELECT lider_id FROM ja_lidera)
       AND NOT EXISTS (SELECT 1 FROM explicitos x WHERE x.equipe_id = c.equipe_id)
  ),
  lista AS (
    SELECT equipe_id, lider_id,
           row_number() OVER (PARTITION BY equipe_id ORDER BY criado_em, lider_id)::INTEGER AS ordem
      FROM explicitos
    UNION ALL
    SELECT equipe_id, lider_id,
           (100 + row_number() OVER (PARTITION BY equipe_id ORDER BY nome, lider_id))::INTEGER
      FROM reserva
  )
  SELECT p_empresa_id, p_mes, l.equipe_id, l.lider_id, l.ordem
    FROM lista l
   WHERE NOT v_fechado OR NOT EXISTS (
     SELECT 1 FROM public.composicao_mes_lider cl
      WHERE cl.empresa_id = p_empresa_id AND cl.mes = p_mes AND cl.equipe_id = l.equipe_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_lideres = ROW_COUNT;

  -- ── Pessoas ───────────────────────────────────────────────────────────────
  INSERT INTO public.composicao_mes
    (empresa_id, mes, operador_id, equipe_id, equipe_nome, setor_id,
     situacao, equipes_clone)
  SELECT p_empresa_id, p_mes, p.id, v.equipe_id,
         COALESCE(e.nome, 'Sem equipe'), COALESCE(e.setor_id, p.setor_id),
         COALESCE(p.situacao, 'ativo'),
         COALESCE((
           SELECT array_agg(c.equipe_id)
             FROM public.equipe_operadores_clones c
            WHERE c.empresa_id = p_empresa_id
              AND c.operador_id = p.id
              AND COALESCE(c.conta_recebimento, TRUE)
         ), '{}'::UUID[])
    FROM public.perfis p
    LEFT JOIN LATERAL (
      SELECT (array_agg(DISTINCT el.equipe_id))[1] AS equipe_id
        FROM public.equipe_lideres el
       WHERE el.empresa_id = p_empresa_id
         AND el.lider_id   = p.id
      HAVING count(DISTINCT el.equipe_id) = 1
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT CASE
               WHEN p.perfil = 'lider' THEN COALESCE(l.equipe_id, p.equipe_id)
               ELSE COALESCE(p.equipe_id, l.equipe_id)
             END AS equipe_id
    ) v ON TRUE
    LEFT JOIN public.equipes e ON e.id = v.equipe_id
   WHERE p.empresa_id = p_empresa_id
     AND (NOT v_fechado OR NOT EXISTS (
       SELECT 1 FROM public.composicao_mes cm
        WHERE cm.empresa_id = p_empresa_id AND cm.mes = p_mes AND cm.operador_id = p.id))
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  PERFORM public.fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'info',
    p_descricao  => CASE WHEN v_fechado THEN format(
      'Completou a composição do mês fechado %s — %s operador(es), %s equipe(s), %s liderança(s) e %s setor(es) que faltavam',
      p_mes, v_linhas, v_equipes, v_lideres, v_setores
    ) ELSE format(
      'Regerou a composição do mês %s — %s operador(es), %s equipe(s), %s liderança(s) e %s setor(es)',
      p_mes, v_linhas, v_equipes, v_lideres, v_setores
    ) END,
    p_empresa_id => p_empresa_id,
    p_tabela     => 'composicao_mes',
    p_alvo_tipo  => 'composicao_mes',
    p_alvo_rotulo=> p_mes,
    p_detalhes   => jsonb_build_object(
      'mes', p_mes, 'preservado', v_fechado,
      'operadores', v_linhas, 'equipes', v_equipes,
      'lideres', v_lideres, 'setores', v_setores,
      'operadores_antes', v_antes_operador, 'equipes_antes', v_antes_equipe
    ),
    p_origem     => 'automatico'
  );

  RETURN v_linhas;
END;
$function$;

COMMENT ON FUNCTION public.fn_composicao_mes_snapshot(uuid, text) IS
  'Retrato mensal em QUATRO tabelas: composicao_mes (pessoas), _equipe (nome e '
  'setor da equipe), _lider (quem liderava) e _setor (nome do setor). Mes '
  'CORRENTE reescreve inteiro; mes FECHADO que ja tem retrato so acrescenta o '
  'que falta (20260903330000/340000/350000).';

-- ── Preenche o mês corrente ─────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT empresa_id, mes FROM public.composicao_mes
     WHERE mes = to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM')
  LOOP
    PERFORM public.fn_composicao_mes_snapshot(r.empresa_id, r.mes);
  END LOOP;
END $$;
