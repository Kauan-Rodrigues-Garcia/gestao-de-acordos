-- ============================================================================
-- 20261113120000_jornada_lider_lanca_pelo_operador.sql
--
-- Jornada (Acesso e Retenção): a LIDERANÇA lança pelo operador (13/11/2026).
--
-- Pedido: «o líder conseguir lançar para o operador, selecionando
-- corretamente». Até aqui só quem está no grupo lançava, e sempre em nome de
-- si mesmo (`fn_jornada_lancar`). Agora há uma função nova:
--
--   fn_jornada_lancar_para(p_grupo_id, p_perfil_id, p_nr, p_data)
--
--   - quem pode: a liderança do grupo (`fn_jornada_gere`) para qualquer pessoa
--     que está no grupo; o próprio membro para si mesmo;
--   - a pessoa escolhida tem de estar no grupo HOJE (mesma equipe/subgrupo,
--     não arquivada, não desligada);
--   - o lançamento conta para a pessoa escolhida (`perfil_id`); quem lançou
--     fica em `criado_por`;
--   - as regras de sempre: NR só números (até 20), data até hoje, a mesma
--     pessoa não repete o NR no mês na aba (outra pessoa pode: fica marcado).
--
-- O que NÃO muda: `fn_jornada_lancar` (o operador continua lançando por ela),
-- tabelas, dados. Só uma função nova. Reaplicável.
-- Depende da 20261110120000.
--
-- Reverter: DROP FUNCTION public.fn_jornada_lancar_para(UUID, UUID, TEXT, DATE);
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.fn_jornada_nr_meu_no_mes(uuid,text,text,date,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes a 20261110120000_jornada_nr_por_pessoa.sql.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_jornada_lancar_para(
  p_grupo_id  UUID,
  p_perfil_id UUID,
  p_nr        TEXT,
  p_data      DATE
)
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
  IF p_perfil_id IS NULL THEN
    RAISE EXCEPTION 'Escolha o operador.' USING ERRCODE = '22023';
  END IF;

  -- A liderança lança por qualquer um do grupo; o membro, só por si mesmo.
  IF NOT (public.fn_jornada_gere(p_grupo_id)
          OR (p_perfil_id = v_uid AND public.fn_jornada_membro(p_grupo_id))) THEN
    RAISE EXCEPTION 'So a lideranca lanca por outra pessoa.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_g FROM public.fn_jornada_grupo(p_grupo_id) LIMIT 1;
  IF v_g.tipo IS NULL THEN
    RAISE EXCEPTION 'Este grupo nao e Suporte nem Retencao.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.perfis p
     WHERE p.id = p_perfil_id
       AND p.empresa_id = v_g.empresa_id
       AND p.equipe_id = v_g.equipe_id
       AND (v_g.grupo = 'equipe' OR p.subgrupo_id = p_grupo_id)
       AND NOT COALESCE(p.arquivado, FALSE)
       AND COALESCE(p.situacao, '') <> 'desligado'
  ) THEN
    RAISE EXCEPTION 'Esta pessoa nao esta neste grupo.' USING ERRCODE = '22023';
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

  PERFORM pg_advisory_xact_lock(hashtext('jornada:' || v_g.empresa_id || ':' || v_g.tipo || ':' || v_nr));

  IF public.fn_jornada_nr_meu_no_mes(v_g.empresa_id, v_g.tipo, v_nr, p_data, p_perfil_id) THEN
    RAISE EXCEPTION 'Este NR ja foi lancado para esta pessoa neste mes.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.jornada_registros (empresa_id, tipo, subgrupo_id, equipe_id, perfil_id, nr, data, criado_por)
  VALUES (v_g.empresa_id, v_g.tipo,
          CASE WHEN v_g.grupo = 'subgrupo' THEN p_grupo_id END,
          CASE WHEN v_g.grupo = 'equipe'   THEN p_grupo_id END,
          p_perfil_id, v_nr, p_data, v_uid)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Este NR ja foi lancado para esta pessoa neste mes.' USING ERRCODE = '23505';
  END IF;
  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_jornada_lancar_para(UUID, UUID, TEXT, DATE) IS
  'Lanca um NR + data na aba do grupo do Jornada EM NOME de uma pessoa do grupo: '
  'a lideranca por qualquer um, o membro so por si. Conta para a pessoa; criado_por '
  '= quem lancou. Mesmas regras de fn_jornada_lancar. 20261113120000.';

REVOKE ALL ON FUNCTION public.fn_jornada_lancar_para(UUID, UUID, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_jornada_lancar_para(UUID, UUID, TEXT, DATE) TO authenticated;

COMMIT;
