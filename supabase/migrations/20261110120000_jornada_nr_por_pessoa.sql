-- ============================================================================
-- 20261110120000_jornada_nr_por_pessoa.sql
--
-- Jornada (Acesso e Retenção): o mesmo NR com PESSOAS DIFERENTES (10/11/2026).
--
-- Pedido do Kauan: «o operador não pode fazer o mesmo cliente duas vezes —
-- essa regra está certa. Porém são 4 pessoas no suporte: às vezes a Camila
-- atendeu um cliente e uma semana depois o Léo atendeu. Pessoas diferentes
-- podem ter o mesmo NR, e o cliente tem que ficar marcado para saber que está
-- com duas pessoas.»
--
-- Até aqui (20261104210000) o NR entrava UMA vez por mês na aba, por qualquer
-- pessoa: o Léo era recusado com «já foi lançado por outra pessoa». Agora:
--
--   - a MESMA pessoa continua sem poder lançar o mesmo NR duas vezes no mês
--     (na mesma aba); vale também no importar e no restaurar da lixeira;
--   - OUTRA pessoa pode: o lançamento entra e conta para a meta dela;
--   - o NR que está com mais de uma pessoa no mês fica MARCADO:
--       · cada lançamento do painel traz `outros` — quem mais tem esse NR na
--         aba no mês (nome e o 1º dia de cada um);
--       · o painel traz `compartilhados` — os NRs do mês com 2+ pessoas
--         (liderança: os que passam pelo grupo; operador: só os que são dele);
--       · o importar devolve também quantos entraram já com outra pessoa.
--
-- O operador passa a ver o NOME de quem mais atendeu o mesmo cliente — só nos
-- NRs que são dele. Os NRs dos outros continuam fora da tela dele.
--
-- Nenhuma tabela muda e nenhum dado é alterado: só funções. Reaplicável.
-- Depende da 20261104210000.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.fn_jornada_nr_no_mes(uuid,text,text,date)') IS NULL
     OR to_regprocedure('public.fn_jornada_grupo(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes a 20261104210000_jornada_meta_individual.sql.';
  END IF;
END $$;

-- ============================================================================
-- 1. Ajudantes (internos)
-- ============================================================================

-- A pessoa já tem este NR nesta aba no mês da data?
CREATE OR REPLACE FUNCTION public.fn_jornada_nr_meu_no_mes(
  p_empresa_id UUID, p_tipo TEXT, p_nr TEXT, p_data DATE, p_perfil_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.jornada_registros r
     WHERE r.empresa_id = p_empresa_id
       AND r.tipo = p_tipo
       AND r.nr = p_nr
       AND r.perfil_id = p_perfil_id
       AND r.apagado_em IS NULL
       AND r.data >= date_trunc('month', p_data)::DATE
       AND r.data <  (date_trunc('month', p_data) + INTERVAL '1 month')::DATE
  );
$function$;

COMMENT ON FUNCTION public.fn_jornada_nr_meu_no_mes(UUID, TEXT, TEXT, DATE, UUID) IS
  'A pessoa ja lancou este NR nesta aba do Jornada no mes da data? 20261110120000.';

-- Quem MAIS tem este NR nesta aba no mês: [{perfil_id, nome, data}], data = o 1º dia de cada um.
CREATE OR REPLACE FUNCTION public.fn_jornada_nr_outros(
  p_empresa_id UUID, p_tipo TEXT, p_nr TEXT, p_data DATE, p_perfil_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('perfil_id', x.perfil_id, 'nome', btrim(p.nome), 'data', x.data)
                            ORDER BY x.data, p.nome), '[]'::JSONB)
    FROM (
      SELECT r.perfil_id, MIN(r.data) AS data
        FROM public.jornada_registros r
       WHERE r.empresa_id = p_empresa_id
         AND r.tipo = p_tipo
         AND r.nr = p_nr
         AND r.apagado_em IS NULL
         AND r.perfil_id IS DISTINCT FROM p_perfil_id
         AND r.data >= date_trunc('month', p_data)::DATE
         AND r.data <  (date_trunc('month', p_data) + INTERVAL '1 month')::DATE
       GROUP BY r.perfil_id
    ) x
    LEFT JOIN public.perfis p ON p.id = x.perfil_id;
$function$;

COMMENT ON FUNCTION public.fn_jornada_nr_outros(UUID, TEXT, TEXT, DATE, UUID) IS
  'Outras pessoas com este NR nesta aba do Jornada no mes (nome e 1o dia). 20261110120000.';

REVOKE ALL ON FUNCTION public.fn_jornada_nr_meu_no_mes(UUID, TEXT, TEXT, DATE, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_jornada_nr_outros(UUID, TEXT, TEXT, DATE, UUID)     FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. Lançar: só a MESMA pessoa é recusada
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_jornada_lancar(p_grupo_id UUID, p_nr TEXT, p_data DATE)
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

  -- O mesmo NR ao mesmo tempo: um espera o outro (a conferência abaixo fica certa).
  PERFORM pg_advisory_xact_lock(hashtext('jornada:' || v_g.empresa_id || ':' || v_g.tipo || ':' || v_nr));

  IF public.fn_jornada_nr_meu_no_mes(v_g.empresa_id, v_g.tipo, v_nr, p_data, v_uid) THEN
    RAISE EXCEPTION 'Este NR ja foi lancado por voce neste mes.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.jornada_registros (empresa_id, tipo, subgrupo_id, equipe_id, perfil_id, nr, data, criado_por)
  VALUES (v_g.empresa_id, v_g.tipo,
          CASE WHEN v_g.grupo = 'subgrupo' THEN p_grupo_id END,
          CASE WHEN v_g.grupo = 'equipe'   THEN p_grupo_id END,
          v_uid, v_nr, p_data, v_uid)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Este NR ja foi lancado por voce neste mes.' USING ERRCODE = '23505';
  END IF;
  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_lancar(UUID, TEXT, DATE) IS
  'Lanca um NR + data na aba do grupo (Acesso ou Retencao). So o membro, data '
  'ate hoje; a mesma pessoa lanca o NR uma vez por mes na aba; outra pessoa pode '
  '(o NR fica marcado como compartilhado no painel). 20261110120000.';

-- ============================================================================
-- 3. Importar: a mesma regra, e conta os que entraram já com outra pessoa
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_jornada_lancar_lote(p_grupo_id UUID, p_itens JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid  UUID := (SELECT auth.uid());
  v_hoje DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_g    RECORD;
  v_item JSONB;
  v_nr   TEXT;
  v_txt  TEXT;
  v_data DATE;
  v_n    INTEGER;
  v_ins  INTEGER := 0;
  v_rep  INTEGER := 0;
  v_inv  INTEGER := 0;
  v_comp INTEGER := 0;
BEGIN
  IF NOT public.fn_jornada_membro(p_grupo_id) THEN
    RAISE EXCEPTION 'So quem esta neste grupo lanca aqui.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_itens, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Lista de NRs invalida.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_itens) > 5000 THEN
    RAISE EXCEPTION 'No maximo 5000 NRs por vez.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_g FROM public.fn_jornada_grupo(p_grupo_id) LIMIT 1;
  IF v_g.tipo IS NULL THEN
    RAISE EXCEPTION 'Este grupo nao e Suporte nem Retencao.' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_nr   := regexp_replace(COALESCE(v_item->>'nr', ''), '\D', '', 'g');
    v_txt  := COALESCE(v_item->>'data', '');
    v_data := CASE WHEN v_txt ~ '^\d{4}-\d{2}-\d{2}$' THEN v_txt::DATE END;

    IF v_nr = '' OR length(v_nr) > 20 OR v_data IS NULL OR v_data > v_hoje THEN
      v_inv := v_inv + 1;
      CONTINUE;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('jornada:' || v_g.empresa_id || ':' || v_g.tipo || ':' || v_nr));
    IF public.fn_jornada_nr_meu_no_mes(v_g.empresa_id, v_g.tipo, v_nr, v_data, v_uid) THEN
      v_rep := v_rep + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.jornada_registros (empresa_id, tipo, subgrupo_id, equipe_id, perfil_id, nr, data, criado_por)
    VALUES (v_g.empresa_id, v_g.tipo,
            CASE WHEN v_g.grupo = 'subgrupo' THEN p_grupo_id END,
            CASE WHEN v_g.grupo = 'equipe'   THEN p_grupo_id END,
            v_uid, v_nr, v_data, v_uid)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      v_ins := v_ins + 1;
      IF public.fn_jornada_nr_outros(v_g.empresa_id, v_g.tipo, v_nr, v_data, v_uid) <> '[]'::JSONB THEN
        v_comp := v_comp + 1;
      END IF;
    ELSE
      v_rep := v_rep + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('inseridos', v_ins, 'repetidos', v_rep, 'invalidos', v_inv, 'compartilhados', v_comp);
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_lancar_lote(UUID, JSONB) IS
  'Importa NRs + datas em lote num grupo do Jornada (so o membro; ate 5000). NR que '
  'a pessoa ja tem no mes e invalidos sao contados, nao gravados; `compartilhados` = '
  'os que entraram e ja estao com outra pessoa. 20261110120000.';

-- ============================================================================
-- 4. Restaurar da lixeira: volta se a DONA dele não relançou o NR no mês
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_jornada_restaurar(p_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_r   RECORD;
  v_ok  INTEGER := 0;
  v_rep INTEGER := 0;
BEGIN
  IF COALESCE(array_length(p_ids, 1), 0) > 5000 THEN
    RAISE EXCEPTION 'No maximo 5000 por vez.' USING ERRCODE = '22023';
  END IF;

  FOR v_r IN
    SELECT r.id, r.empresa_id, r.tipo, r.nr, r.data, r.perfil_id
      FROM public.jornada_registros r
     WHERE r.id = ANY(COALESCE(p_ids, '{}'))
       AND r.apagado_em IS NOT NULL
       AND (
         (r.perfil_id = (SELECT auth.uid()) AND public.fn_can_access_empresa(r.empresa_id))
         OR public.fn_jornada_gere(COALESCE(r.subgrupo_id, r.equipe_id))
         OR public.fn_user_is_super_admin()
       )
     ORDER BY r.apagado_em
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('jornada:' || v_r.empresa_id || ':' || v_r.tipo || ':' || v_r.nr));
    IF public.fn_jornada_nr_meu_no_mes(v_r.empresa_id, v_r.tipo, v_r.nr, v_r.data, v_r.perfil_id) THEN
      v_rep := v_rep + 1;
      CONTINUE;
    END IF;
    UPDATE public.jornada_registros SET apagado_em = NULL, apagado_por = NULL WHERE id = v_r.id;
    v_ok := v_ok + 1;
  END LOOP;

  RETURN jsonb_build_object('restaurados', v_ok, 'repetidos', v_rep);
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_restaurar(UUID[]) IS
  'Tira lancamentos do Jornada da lixeira (os proprios, ou qualquer um para a '
  'lideranca); o que a mesma pessoa ja relancou no mes fica na lixeira. 20261110120000.';

-- ============================================================================
-- 5. O painel: cada NR com `outros`, e a lista `compartilhados` do mês
-- ============================================================================
--
-- Igual ao da 20261104210000, mais:
--   registros[].outros  quem mais tem o NR na aba no mês (nome, 1º dia);
--   compartilhados      [{nr, pessoas: [{perfil_id, nome, data}]}], os NRs do
--                       mês com 2+ pessoas — a liderança vê os que passam por
--                       este grupo; o operador, só os que são dele.

CREATE OR REPLACE FUNCTION public.fn_jornada_painel(p_grupo_id UUID, p_dia DATE)
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
  v_meta   INTEGER := (SELECT m.meta FROM public.jornada_metas m WHERE m.grupo_id = p_grupo_id);
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
    'meta', v_meta,
    'periodo', 'mes',
    'pessoas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'nome', p.nome, 'foto_url', p.foto_url,
               'no_grupo', (p.equipe_id IS NOT DISTINCT FROM v_g.equipe_id
                            AND (v_g.grupo = 'equipe' OR p.subgrupo_id IS NOT DISTINCT FROM p_grupo_id)),
               'no_dia', COALESCE(c.no_dia, 0), 'no_mes', COALESCE(c.no_mes, 0),
               'meta', COALESCE(mp.meta, v_meta),
               'meta_propria', mp.meta IS NOT NULL)
             ORDER BY COALESCE(c.no_mes, 0) DESC, p.nome)
        FROM public.perfis p
        LEFT JOIN (
          SELECT r.perfil_id,
                 COUNT(*) FILTER (WHERE r.data = p_dia) AS no_dia,
                 COUNT(*) AS no_mes
            FROM public.jornada_registros r
           WHERE (r.subgrupo_id = p_grupo_id OR r.equipe_id = p_grupo_id) AND r.apagado_em IS NULL
             AND r.data >= v_ini AND r.data < v_fim
           GROUP BY r.perfil_id
        ) c ON c.perfil_id = p.id
        LEFT JOIN public.jornada_metas_pessoa mp
          ON mp.grupo_id = p_grupo_id AND mp.perfil_id = p.id
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
           WHERE (r.subgrupo_id = p_grupo_id OR r.equipe_id = p_grupo_id) AND r.apagado_em IS NULL
             AND r.data >= v_ini AND r.data < v_fim
             AND (v_gere OR r.perfil_id = v_uid)
           GROUP BY r.data
        ) d
    ), '[]'::JSONB),
    'registros', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'nr', r.nr, 'data', r.data, 'perfil_id', r.perfil_id,
               'nome', p.nome, 'criado_em', r.criado_em,
               'outros', public.fn_jornada_nr_outros(r.empresa_id, r.tipo, r.nr, r.data, r.perfil_id))
             ORDER BY r.criado_em DESC)
        FROM public.jornada_registros r
        LEFT JOIN public.perfis p ON p.id = r.perfil_id
       WHERE (r.subgrupo_id = p_grupo_id OR r.equipe_id = p_grupo_id) AND r.apagado_em IS NULL
         AND r.data = p_dia
         AND (v_gere OR r.perfil_id = v_uid)
    ), '[]'::JSONB),
    'compartilhados', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('nr', c.nr, 'pessoas', c.pessoas) ORDER BY c.ultima DESC, c.nr)
        FROM (
          SELECT x.nr,
                 jsonb_agg(jsonb_build_object('perfil_id', x.perfil_id, 'nome', btrim(p.nome), 'data', x.data)
                           ORDER BY x.data, p.nome) AS pessoas,
                 MAX(x.data) AS ultima
            FROM (
              -- Uma linha por NR e pessoa: o 1º dia dela com o NR no mês.
              SELECT DISTINCT ON (r.nr, r.perfil_id)
                     r.nr, r.perfil_id, r.data, COALESCE(r.subgrupo_id, r.equipe_id) AS grupo_id
                FROM public.jornada_registros r
               WHERE r.empresa_id = v_g.empresa_id AND r.tipo = v_g.tipo AND r.apagado_em IS NULL
                 AND r.data >= v_ini AND r.data < v_fim
               ORDER BY r.nr, r.perfil_id, r.data
            ) x
            LEFT JOIN public.perfis p ON p.id = x.perfil_id
           GROUP BY x.nr
          HAVING COUNT(*) > 1
             AND CASE WHEN v_gere THEN bool_or(x.grupo_id = p_grupo_id)
                      ELSE bool_or(x.perfil_id = v_uid) END
        ) c
    ), '[]'::JSONB)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_painel(UUID, DATE) IS
  'Meta (do grupo e de cada pessoa), placar, total por dia e lancamentos do dia de um '
  'grupo do Jornada, com quem mais tem cada NR no mes (`outros`) e os NRs do mes com '
  '2+ pessoas (`compartilhados`). Membro ve so os proprios; lideranca ve todos. 20261110120000.';

-- ============================================================================
-- 6. Conferência
-- ============================================================================

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_jornada_nr_outros(uuid,text,text,date,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_jornada_nr_meu_no_mes(uuid,text,text,date,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Os ajudantes do NR compartilhado ficaram abertos para o app.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_jornada_painel(uuid,date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_jornada_lancar(uuid,text,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'O app perdeu o acesso ao painel ou ao lancar do Jornada.';
  END IF;
END $$;

COMMIT;
