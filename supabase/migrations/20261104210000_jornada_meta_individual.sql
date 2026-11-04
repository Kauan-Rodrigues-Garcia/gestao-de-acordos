-- ============================================================================
-- 20261104210000_jornada_meta_individual.sql
--
-- Meta INDIVIDUAL nas abas Acesso e Retenção do Jornada (pedido de 04/11/2026).
--
-- A liderança já define a meta do grupo (por operador, no mês). Agora também
-- pode dar a uma pessoa uma meta só dela; quem não tem meta própria segue a do
-- grupo. Tirar a meta individual devolve a pessoa à do grupo.
--
-- Depende da 20261104200000 (grupo = subgrupo ou equipe): aplique-a antes.
--
--   - tabela `jornada_metas_pessoa` (grupo_id, perfil_id) → meta do mês;
--   - `fn_jornada_meta_pessoas_salvar(grupo, jsonb)` grava várias de uma vez,
--     SÓ a liderança (fn_jornada_gere), SÓ para quem está no grupo;
--   - `fn_jornada_painel` passa a devolver, por pessoa, `meta` (a dela ou a
--     do grupo) e `meta_propria` — e o operador só vê a si mesmo no placar;
--   - NR repetido: o mesmo NR entra UMA vez por mês em cada aba (Acesso,
--     Retenção), por qualquer pessoa; acordo com operador não impede;
--   - em lote: `fn_jornada_lancar_lote` (importar), `fn_jornada_excluir_lote`
--     (apagar vários) e `fn_jornada_exportar` (baixar NR + data, sem nome);
--   - lixeira: apagar vira `apagado_em` (não some), `fn_jornada_lixeira` lista
--     os últimos 30 dias e `fn_jornada_restaurar` devolve.
--
-- Nenhum dado de outra tabela é alterado. Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.fn_jornada_grupo(uuid)') IS NULL
     OR to_regprocedure('public.fn_jornada_gere(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes a 20261104200000_jornada_por_equipe.sql.';
  END IF;
END $$;

-- ============================================================================
-- 0. Lixeira: apagar não some mais na hora
-- ============================================================================
--
-- Pedido de 04/11/2026: quem apaga sem querer precisa recuperar. O registro
-- apagado ganha `apagado_em` e sai de tudo (painel, contagem, meta, baixar,
-- regra do NR repetido); da lixeira ele volta com `fn_jornada_restaurar`.

ALTER TABLE public.jornada_registros
  ADD COLUMN IF NOT EXISTS apagado_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apagado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.jornada_registros.apagado_em IS
  'Quando foi para a lixeira (NULL = vivo). 20261104210000.';

-- O «não repetir» vale só entre os vivos: o que está na lixeira não trava.
DROP INDEX IF EXISTS public.idx_jornada_registros_unico;
CREATE UNIQUE INDEX IF NOT EXISTS idx_jornada_registros_unico_vivo
  ON public.jornada_registros (empresa_id, tipo, perfil_id, nr, data)
  WHERE apagado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_jornada_registros_lixeira
  ON public.jornada_registros (apagado_em)
  WHERE apagado_em IS NOT NULL;

-- ============================================================================
-- 1. A tabela
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.jornada_metas_pessoa (
  grupo_id       UUID NOT NULL,
  perfil_id      UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  meta           INTEGER NOT NULL,
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (grupo_id, perfil_id),
  CONSTRAINT jornada_metas_pessoa_meta CHECK (meta BETWEEN 1 AND 100000)
);

COMMENT ON TABLE public.jornada_metas_pessoa IS
  'Meta individual do mes de uma pessoa num grupo (subgrupo ou equipe) do '
  'Jornada; sem linha, vale a meta do grupo (jornada_metas). Escrita so por '
  'fn_jornada_meta_pessoas_salvar. 20261104210000.';

ALTER TABLE public.jornada_metas_pessoa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jornada_metas_pessoa FROM authenticated, anon;

-- ============================================================================
-- 2. Gravar as metas individuais (várias de uma vez)
-- ============================================================================
--
-- p_metas = [{"perfil_id": "...", "meta": 120}, {"perfil_id": "...", "meta": null}]
-- meta nula ou 0 tira a meta individual (a pessoa volta à do grupo).

CREATE OR REPLACE FUNCTION public.fn_jornada_meta_pessoas_salvar(p_grupo_id UUID, p_metas JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_g    RECORD;
  v_item JSONB;
  v_pid  UUID;
  v_meta INTEGER;
BEGIN
  IF NOT public.fn_jornada_gere(p_grupo_id) THEN
    RAISE EXCEPTION 'So a lideranca configura a meta.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_metas, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Lista de metas invalida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_g FROM public.fn_jornada_grupo(p_grupo_id) LIMIT 1;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_metas, '[]'::JSONB)) LOOP
    v_pid  := NULLIF(v_item->>'perfil_id', '')::UUID;
    v_meta := NULLIF(v_item->>'meta', '')::INTEGER;

    IF v_pid IS NULL THEN
      RAISE EXCEPTION 'Pessoa invalida.' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(v_meta, 0) <= 0 THEN
      DELETE FROM public.jornada_metas_pessoa WHERE grupo_id = p_grupo_id AND perfil_id = v_pid;
      CONTINUE;
    END IF;
    IF v_meta > 100000 THEN
      RAISE EXCEPTION 'Meta acima do limite (100000).' USING ERRCODE = '22023';
    END IF;

    -- Só quem está no grupo recebe meta dele.
    IF NOT EXISTS (
      SELECT 1 FROM public.perfis p
       WHERE p.id = v_pid
         AND p.empresa_id = v_g.empresa_id
         AND p.equipe_id = v_g.equipe_id
         AND (v_g.grupo = 'equipe' OR p.subgrupo_id = p_grupo_id)
    ) THEN
      RAISE EXCEPTION 'Esta pessoa nao esta neste grupo.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.jornada_metas_pessoa AS m (grupo_id, perfil_id, empresa_id, meta, atualizado_por, atualizado_em)
    VALUES (p_grupo_id, v_pid, v_g.empresa_id, v_meta, (SELECT auth.uid()), NOW())
    ON CONFLICT (grupo_id, perfil_id) DO UPDATE
       SET meta           = EXCLUDED.meta,
           atualizado_por = EXCLUDED.atualizado_por,
           atualizado_em  = NOW();
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_meta_pessoas_salvar(UUID, JSONB) IS
  'Grava (ou tira, com meta nula/0) metas individuais do mes num grupo do '
  'Jornada. So a lideranca; so para quem esta no grupo. 20261104210000.';

-- ============================================================================
-- 3. O painel: meta de cada pessoa (a dela ou a do grupo)
-- ============================================================================

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
               'nome', p.nome, 'criado_em', r.criado_em)
             ORDER BY r.criado_em DESC)
        FROM public.jornada_registros r
        LEFT JOIN public.perfis p ON p.id = r.perfil_id
       WHERE (r.subgrupo_id = p_grupo_id OR r.equipe_id = p_grupo_id) AND r.apagado_em IS NULL
         AND r.data = p_dia
         AND (v_gere OR r.perfil_id = v_uid)
    ), '[]'::JSONB)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_painel(UUID, DATE) IS
  'Meta (do grupo e de cada pessoa), placar, total por dia do mes e lancamentos '
  'do dia de um grupo do Jornada. Membro ve so os proprios numeros e NRs; lideranca ve '
  'todos. 20261104210000.';

-- ============================================================================
-- 4. NR repetido: um NR só entra UMA vez por mês em cada aba
-- ============================================================================
--
-- Pedido de 04/11/2026: dois acessos iguais não podem existir. O mesmo NR não
-- entra duas vezes no Acesso no mesmo mês — nem pela mesma pessoa, nem por
-- outra (o mesmo vale para a Retenção). Ter acordo com algum operador NÃO
-- impede: acesso não é recebimento, a trava dos acordos não se aplica aqui.
--
-- A trava é na função (com trava de concorrência por NR), não num índice
-- único: se já houver repetido de antes, a migration não quebra.

CREATE INDEX IF NOT EXISTS idx_jornada_registros_nr
  ON public.jornada_registros (empresa_id, tipo, nr, data);

-- Já existe este NR nesta aba neste mês? Devolve quem lançou (ou NULL).
CREATE OR REPLACE FUNCTION public.fn_jornada_nr_no_mes(p_empresa_id UUID, p_tipo TEXT, p_nr TEXT, p_data DATE)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT r.perfil_id
    FROM public.jornada_registros r
   WHERE r.empresa_id = p_empresa_id
     AND r.tipo = p_tipo
     AND r.nr = p_nr
     AND r.apagado_em IS NULL
     AND r.data >= date_trunc('month', p_data)::DATE
     AND r.data <  (date_trunc('month', p_data) + INTERVAL '1 month')::DATE
   LIMIT 1;
$function$;

COMMENT ON FUNCTION public.fn_jornada_nr_no_mes(UUID, TEXT, TEXT, DATE) IS
  'Quem ja lancou este NR nesta aba do Jornada no mes da data (NULL = ninguem). 20261104210000.';

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
  v_quem UUID;
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

  -- Duas pessoas com o mesmo NR ao mesmo tempo: uma espera a outra.
  PERFORM pg_advisory_xact_lock(hashtext('jornada:' || v_g.empresa_id || ':' || v_g.tipo || ':' || v_nr));

  v_quem := public.fn_jornada_nr_no_mes(v_g.empresa_id, v_g.tipo, v_nr, p_data);
  IF v_quem = v_uid THEN
    RAISE EXCEPTION 'Este NR ja foi lancado por voce neste mes.' USING ERRCODE = '23505';
  ELSIF v_quem IS NOT NULL THEN
    RAISE EXCEPTION 'Este NR ja foi lancado por outra pessoa neste mes.' USING ERRCODE = '23505';
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
  'ate hoje; o NR entra uma vez por mes na aba, por qualquer pessoa. 20261104210000.';

-- ============================================================================
-- 5. Em lote: importar, apagar vários, baixar
-- ============================================================================

-- Importa muitos NRs (colados ou de um arquivo). Só o membro, com as mesmas
-- regras do lançamento de um. p_itens = [{"nr": "123", "data": "2026-11-04"}]
-- Devolve quantos entraram, quantos já existiam no mês e quantos inválidos.
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
    IF public.fn_jornada_nr_no_mes(v_g.empresa_id, v_g.tipo, v_nr, v_data) IS NOT NULL THEN
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
    IF v_n > 0 THEN v_ins := v_ins + 1; ELSE v_rep := v_rep + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('inseridos', v_ins, 'repetidos', v_rep, 'invalidos', v_inv);
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_lancar_lote(UUID, JSONB) IS
  'Importa NRs + datas em lote num grupo do Jornada (so o membro; ate 5000; '
  'NR ja lancado no mes e invalidos sao contados, nao gravados). 20261104210000.';

-- Apaga vários (para a lixeira): os próprios, ou qualquer um para a liderança.
CREATE OR REPLACE FUNCTION public.fn_jornada_excluir_lote(p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_n INTEGER;
BEGIN
  IF COALESCE(array_length(p_ids, 1), 0) > 5000 THEN
    RAISE EXCEPTION 'No maximo 5000 por vez.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.jornada_registros r
     SET apagado_em = NOW(), apagado_por = (SELECT auth.uid())
   WHERE r.id = ANY(COALESCE(p_ids, '{}'))
     AND r.apagado_em IS NULL
     AND (
       (r.perfil_id = (SELECT auth.uid()) AND public.fn_can_access_empresa(r.empresa_id))
       OR public.fn_jornada_gere(COALESCE(r.subgrupo_id, r.equipe_id))
       OR public.fn_user_is_super_admin()
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_excluir_lote(UUID[]) IS
  'Manda varios lancamentos do Jornada para a lixeira: os proprios, ou qualquer '
  'um para a lideranca. Os sem permissao sao ignorados. 20261104210000.';

-- Os NRs de um período, para baixar. Operador: só os dele. Sem nome.
CREATE OR REPLACE FUNCTION public.fn_jornada_exportar(p_grupo_id UUID, p_ini DATE, p_fim DATE)
RETURNS TABLE(nr TEXT, data DATE)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_gere BOOLEAN := public.fn_jornada_gere(p_grupo_id);
BEGIN
  IF NOT (v_gere OR public.fn_jornada_membro(p_grupo_id)) THEN
    RAISE EXCEPTION 'Sem permissao para ver este grupo.' USING ERRCODE = '42501';
  END IF;
  IF p_ini IS NULL OR p_fim IS NULL OR p_fim < p_ini OR p_fim - p_ini > 400 THEN
    RAISE EXCEPTION 'Periodo invalido.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT r.nr, r.data
    FROM public.jornada_registros r
   WHERE (r.subgrupo_id = p_grupo_id OR r.equipe_id = p_grupo_id) AND r.apagado_em IS NULL
     AND r.data BETWEEN p_ini AND p_fim
     AND (v_gere OR r.perfil_id = (SELECT auth.uid()))
   ORDER BY r.data, r.criado_em;
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_exportar(UUID, DATE, DATE) IS
  'NR e data dos lancamentos de um grupo do Jornada num periodo (ate 400 '
  'dias), para baixar. Operador: so os proprios. 20261104210000.';

-- ============================================================================
-- 6. Lixeira: apagar (vai para a lixeira), ver e restaurar
-- ============================================================================

-- Apagar um: vai para a lixeira. O próprio, ou qualquer um para a liderança.
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
   WHERE r.id = p_id AND r.apagado_em IS NULL;
  IF NOT FOUND THEN
    RETURN;  -- Já não existe (ou já está na lixeira): não é erro.
  END IF;

  IF NOT (
    (v_r.perfil_id = (SELECT auth.uid()) AND public.fn_can_access_empresa(v_r.empresa_id))
    OR (v_r.grupo_id IS NOT NULL AND public.fn_jornada_gere(v_r.grupo_id))
    OR public.fn_user_is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Sem permissao para apagar este lancamento.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.jornada_registros
     SET apagado_em = NOW(), apagado_por = (SELECT auth.uid())
   WHERE id = p_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_excluir(UUID) IS
  'Manda um lancamento do Jornada para a lixeira: o proprio, ou qualquer um '
  'para a lideranca. 20261104210000.';

-- O que está na lixeira (últimos 30 dias). Operador: só os dele.
CREATE OR REPLACE FUNCTION public.fn_jornada_lixeira(p_grupo_id UUID)
RETURNS TABLE(id UUID, nr TEXT, data DATE, apagado_em TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_gere BOOLEAN := public.fn_jornada_gere(p_grupo_id);
BEGIN
  IF NOT (v_gere OR public.fn_jornada_membro(p_grupo_id)) THEN
    RAISE EXCEPTION 'Sem permissao para ver este grupo.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id, r.nr, r.data, r.apagado_em
    FROM public.jornada_registros r
   WHERE (r.subgrupo_id = p_grupo_id OR r.equipe_id = p_grupo_id)
     AND r.apagado_em IS NOT NULL
     AND r.apagado_em > NOW() - INTERVAL '30 days'
     AND (v_gere OR r.perfil_id = (SELECT auth.uid()))
   ORDER BY r.apagado_em DESC
   LIMIT 2000;
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_lixeira(UUID) IS
  'Lancamentos apagados de um grupo do Jornada nos ultimos 30 dias (NR, data, '
  'quando). Operador: so os proprios. 20261104210000.';

-- Restaurar da lixeira. Volta só se o NR não foi lançado de novo no mês.
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
    SELECT r.id, r.empresa_id, r.tipo, r.nr, r.data
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
    IF public.fn_jornada_nr_no_mes(v_r.empresa_id, v_r.tipo, v_r.nr, v_r.data) IS NOT NULL THEN
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
  'lideranca); o NR ja lancado de novo no mes fica na lixeira. 20261104210000.';

-- ── Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_jornada_meta_pessoas_salvar(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_painel(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_jornada_meta_pessoas_salvar(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_painel(UUID, DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_jornada_nr_no_mes(UUID, TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_jornada_lancar(UUID, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_lancar_lote(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_excluir(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_lixeira(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_restaurar(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_jornada_excluir(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_lixeira(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_restaurar(UUID[]) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_jornada_excluir_lote(UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_jornada_exportar(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_jornada_lancar(UUID, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_lancar_lote(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_excluir_lote(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_jornada_exportar(UUID, DATE, DATE) TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.jornada_metas_pessoa'::regclass) THEN
    RAISE EXCEPTION 'jornada_metas_pessoa ficou sem RLS.';
  END IF;
  IF has_table_privilege('authenticated', 'public.jornada_metas_pessoa', 'SELECT')
     OR has_table_privilege('authenticated', 'public.jornada_metas_pessoa', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated ainda acessa direto jornada_metas_pessoa.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_jornada_meta_pessoas_salvar(uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_jornada_lancar_lote(uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_jornada_excluir_lote(uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_jornada_exportar(uuid,date,date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_jornada_lixeira(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_jornada_restaurar(uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_jornada_nr_no_mes(uuid,text,text,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_jornada_meta_pessoas_salvar ficou aberta para anon.';
  END IF;
END
$prova$;

COMMIT;
