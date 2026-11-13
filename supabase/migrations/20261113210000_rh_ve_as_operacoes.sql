-- ============================================================================
-- O RH enxerga as operações (13/11/2026)
-- ============================================================================
--
-- O gerente do RH entra pela empresa Recursos Humanos e precisa ver a gente de
-- TODAS as operações (pedido do Cleber). Conferido no banco em 13/11: a conta
-- dele tem o cargo rh e a chave ver_quadro_pessoal, mas
--   * sem acesso a outras empresas (a chave acesso_multiempresa_permitido não
--     existe no mapa do cargo rh da empresa RH, e não há liberação);
--   * sem alcance de leitura em perfis (fn_user_escopo_perfis = -1: nenhuma
--     aba com escopo está ligada para o RH lá);
--   * sem poder ver nem gravar crachá (o escopo do RH Gestão não existe no RH).
--
-- A chave do sistema do RH passa a significar o que a tela promete:
--
--   1. fn_user_escopo_perfis: quem tem ver_quadro_pessoal lê perfis no nível
--      «empresa» (3) — em todas as empresas que alcança. Continua valendo o
--      teto de empresa (fn_minhas_empresas) da policy.
--   2. rh_cracha_select: quem tem ver_quadro_pessoal lê o crachá.
--   3. fn_rh_salvar_cracha: quem tem ver_quadro_pessoal grava o crachá (o
--      oficial é o do Quadro). Corpo igual ao de 20260824120000, só as duas
--      portas mudam.
--   4. O cargo rh da empresa Recursos Humanos pode receber acesso
--      multiempresa. A LIBERAÇÃO de cada empresa continua sendo do super admin,
--      em Configurações › Multiempresa — esta migration não libera ninguém.
--
-- ver_quadro_pessoal é explícita: o administrador não a herda, então nada
-- disto amplia o administrador.
--
-- Reverter: reaplicar fn_user_escopo_perfis de 20260903310000, a policy
-- rh_cracha_select de 20260823091000, fn_rh_salvar_cracha de 20260824120000;
-- tirar a chave do mapa do cargo rh da empresa RH.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. Leitura de pessoas ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_user_escopo_perfis()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT GREATEST(
    COALESCE(MAX(public.fn_user_escopo(a.aba)), -1),
    -- O sistema do RH (Quadro de Pessoal) lê todas as pessoas das empresas que
    -- a pessoa alcança. 20261113210000.
    CASE WHEN public.fn_user_tem('ver_quadro_pessoal') THEN 3 ELSE -1 END
  )
    FROM public.fn_abas_escopo() a;
$function$;

COMMENT ON FUNCTION public.fn_user_escopo_perfis() IS
  'Ate onde a pessoa alcanca em perfis: -1=so o proprio, 1=equipe, 2=setor, 3=empresa. O MAIOR escopo '
  'entre as abas do catalogo, e 3 para quem tem ver_quadro_pessoal (o RH, 20261113210000).';

-- ── 2. Leitura do crachá ────────────────────────────────────────────────────

ALTER POLICY rh_cracha_select ON public.rh_dados_operadores
USING (
  (SELECT public.fn_can_access_empresa(empresa_id))
  AND (
    operador_id = (SELECT auth.uid())
    OR (SELECT public.fn_user_tem('ver_quadro_pessoal'))
    OR public.fn_rh_cracha_visivel(empresa_id, operador_id)
  )
);

-- ── 3. Gravação do crachá ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_rh_salvar_cracha(
  p_empresa_id UUID, p_operador_id UUID, p_cracha TEXT
)
RETURNS public.rh_dados_operadores
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_d      public.rh_dados_operadores;
  v_nome   TEXT;
  v_op     RECORD;
  v_qtd    INTEGER;
  v_fech   UUID;
  v_alvo   TEXT;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'RH_EMPRESA: esta empresa nao e sua.' USING ERRCODE = '42501';
  END IF;
  -- O RH do Quadro de Pessoal (ver_quadro_pessoal) também grava: o crachá
  -- oficial é o do Quadro (13/11/2026).
  IF NOT (public.fn_rh_pode('rh_editar_cracha') OR public.fn_user_tem('ver_quadro_pessoal')) THEN
    RAISE EXCEPTION 'RH_SEM_PERMISSAO: voce nao pode editar cracha.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.setor_id, p.equipe_id INTO v_op
    FROM public.perfis p
   WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id;

  IF v_op.id IS NULL THEN
    RAISE EXCEPTION 'RH_OPERADOR_INEXISTENTE: operador nao encontrado nesta empresa.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- O cracha respeita o mesmo escopo do resto do modulo: quem nao enxerga a
  -- pessoa nao cadastra o cracha dela.
  IF NOT (public.fn_user_tem('ver_quadro_pessoal')
          OR public.fn_rh_lancamento_visivel(p_empresa_id, v_op.setor_id, v_op.equipe_id)) THEN
    RAISE EXCEPTION 'RH_FORA_DO_ESCOPO: este operador nao esta no seu escopo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  INSERT INTO public.rh_dados_operadores (
    empresa_id, operador_id, cracha, atualizado_por, atualizado_por_nome
  ) VALUES (
    p_empresa_id, p_operador_id, NULLIF(TRIM(p_cracha), ''), auth.uid(), v_nome
  )
  ON CONFLICT (empresa_id, operador_id) DO UPDATE
    SET cracha = EXCLUDED.cracha,
        atualizado_por = EXCLUDED.atualizado_por,
        atualizado_por_nome = EXCLUDED.atualizado_por_nome,
        atualizado_em = NOW()
  RETURNING * INTO v_d;

  -- O snapshot das competencias ABERTAS acompanha. Finalizada nao: folha que
  -- ja circulou nao muda porque alguem cadastrou um numero hoje.
  UPDATE public.rh_lancamentos l
     SET cracha_snapshot = v_d.cracha,
         atualizado_em = NOW()
    FROM public.rh_fechamentos f
   WHERE f.id = l.fechamento_id
     AND f.status = 'aberto'
     AND l.empresa_id = p_empresa_id
     AND l.operador_id = p_operador_id
     AND l.cracha_snapshot IS DISTINCT FROM v_d.cracha;

  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  -- A trilha registra so quando o snapshot mudou de fato. `rh_eventos` exige
  -- um fechamento, entao sem competencia aberta nao ha evento a escrever — o
  -- cadastro vale para a proxima, e a tabela `rh_dados_operadores` ja guarda
  -- autor e data.
  IF v_qtd > 0 THEN
    SELECT l.fechamento_id INTO v_fech
      FROM public.rh_lancamentos l
      JOIN public.rh_fechamentos f ON f.id = l.fechamento_id
     WHERE l.operador_id = p_operador_id
       AND l.empresa_id = p_empresa_id
       AND f.status = 'aberto'
     ORDER BY f.competencia DESC
     LIMIT 1;

    SELECT COALESCE(NULLIF(TRIM(p.nome), ''), '—') INTO v_alvo
      FROM public.perfis p WHERE p.id = p_operador_id;

    IF v_fech IS NOT NULL THEN
      PERFORM public.fn_rh_evento(
        v_fech, NULL, 'operador', 'cracha_definido',
        'Definiu o cracha de ' || v_alvo
          || COALESCE(' como ' || v_d.cracha, ' como vazio'));
    END IF;
  END IF;

  RETURN v_d;
END;
$function$;

-- ── 4. O cargo rh da empresa RH pode receber acesso multiempresa ────────────

UPDATE public.cargos_permissoes cp
   SET permissoes = COALESCE(cp.permissoes, '{}'::jsonb) || jsonb_build_object('acesso_multiempresa_permitido', true),
       atualizado_em = NOW()
  FROM public.empresas e
 WHERE e.id = cp.empresa_id
   AND e.produto = 'rh'
   AND cp.cargo = 'rh'
   AND COALESCE((cp.permissoes->>'acesso_multiempresa_permitido')::boolean, false) = false;

COMMIT;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
--   select pg_get_functiondef('public.fn_user_escopo_perfis()'::regprocedure) like '%ver_quadro_pessoal%';
--   select qual from pg_policies where policyname = 'rh_cracha_select';
--   select cp.permissoes->>'acesso_multiempresa_permitido'
--     from cargos_permissoes cp join empresas e on e.id = cp.empresa_id
--    where e.produto = 'rh' and cp.cargo = 'rh';
