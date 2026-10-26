-- ============================================================================
-- O crachá preenchido pela própria pessoa (26/10/2026)
-- ============================================================================
--
-- Um cartão no canto da tela, no molde da pesquisa de experiência, pede o
-- número do crachá (até 8 dígitos) a quem ainda não tem um cadastrado. Mora no
-- mesmo lugar de sempre, `rh_dados_operadores`, que o RH Gestão e o Fechamento
-- já leem — o número digitado aqui chega pronto lá.
--
-- Até agora só gravavam crachá `fn_rh_salvar_cracha` (rh_editar_cracha) e
-- `fn_fechamento_salvar_cracha` (fechamento_editar). As duas exigem cargo e
-- alcance sobre OUTRA pessoa. As funções daqui só enxergam `auth.uid()`:
--
--   fn_meu_cracha_estado()          { tem_cracha } — o próprio, nada mais
--   fn_meu_cracha_salvar(p_cracha)  grava o próprio, só se ainda estiver vazio
--
-- ## Só preenche, nunca troca
--
-- O crachá vai para a folha de pagamento. Quem já tem um número cadastrado não
-- troca por aqui: correção continua com o RH, pelas telas de sempre. A função
-- recusa, e a tela nem aparece para quem já tem.
--
-- ## Repetido não diz de quem é
--
-- `fn_fechamento_salvar_cracha` diz o nome do dono porque quem usa é o RH.
-- Aqui quem digita é a própria pessoa, e o nome de outro operador não é da
-- conta dela: a mensagem só diz que o número já está em uso.
--
-- Como em `fn_rh_salvar_cracha`, o snapshot das competências ABERTAS acompanha
-- e a trilha do RH registra; competência finalizada não é tocada.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.fn_meu_cracha_estado()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('tem_cracha', EXISTS (
    SELECT 1
      FROM public.perfis p
      JOIN public.rh_dados_operadores d
        ON d.operador_id = p.id AND d.empresa_id = p.empresa_id
     WHERE p.id = auth.uid()
       AND d.cracha IS NOT NULL
       AND btrim(d.cracha) <> ''
  ));
$function$;

REVOKE ALL ON FUNCTION public.fn_meu_cracha_estado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_meu_cracha_estado() TO authenticated;

COMMENT ON FUNCTION public.fn_meu_cracha_estado() IS
  'Se quem está logado já tem crachá em rh_dados_operadores. Não devolve o '
  'número. Ver 20261026160000.';

CREATE OR REPLACE FUNCTION public.fn_meu_cracha_salvar(p_cracha TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu     UUID := auth.uid();
  v_cracha TEXT := btrim(COALESCE(p_cracha, ''));
  v_emp    UUID;
  v_nome   TEXT;
  v_atual  TEXT;
  v_qtd    INTEGER;
  v_fech   UUID;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada: entre de novo.' USING ERRCODE = '42501';
  END IF;

  IF v_cracha !~ '^[0-9]{1,8}$' THEN
    RAISE EXCEPTION 'O crachá tem até 8 números.' USING ERRCODE = '22023';
  END IF;

  SELECT p.empresa_id, COALESCE(NULLIF(btrim(p.nome), ''), 'Alguém')
    INTO v_emp, v_nome
    FROM public.perfis p
   WHERE p.id = v_eu AND p.ativo;

  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT d.cracha INTO v_atual
    FROM public.rh_dados_operadores d
   WHERE d.empresa_id = v_emp AND d.operador_id = v_eu
   FOR UPDATE;

  IF v_atual IS NOT NULL AND btrim(v_atual) <> '' THEN
    IF v_atual = v_cracha THEN
      RETURN v_cracha;
    END IF;
    RAISE EXCEPTION 'Você já tem um crachá cadastrado. Para trocar, fale com o RH.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rh_dados_operadores d
     WHERE d.empresa_id = v_emp
       AND d.cracha = v_cracha
       AND d.operador_id <> v_eu
  ) THEN
    RAISE EXCEPTION 'Esse número já está cadastrado para outra pessoa. Confira o seu crachá; se estiver certo, fale com o RH.'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.rh_dados_operadores (
    empresa_id, operador_id, cracha, atualizado_por, atualizado_por_nome
  ) VALUES (
    v_emp, v_eu, v_cracha, v_eu, v_nome
  )
  ON CONFLICT (empresa_id, operador_id) DO UPDATE
    SET cracha              = EXCLUDED.cracha,
        atualizado_por      = EXCLUDED.atualizado_por,
        atualizado_por_nome = EXCLUDED.atualizado_por_nome,
        atualizado_em       = NOW();

  UPDATE public.rh_lancamentos l
     SET cracha_snapshot = v_cracha,
         atualizado_em = NOW()
    FROM public.rh_fechamentos f
   WHERE f.id = l.fechamento_id
     AND f.status = 'aberto'
     AND l.empresa_id = v_emp
     AND l.operador_id = v_eu
     AND l.cracha_snapshot IS DISTINCT FROM v_cracha;

  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  IF v_qtd > 0 THEN
    SELECT l.fechamento_id INTO v_fech
      FROM public.rh_lancamentos l
      JOIN public.rh_fechamentos f ON f.id = l.fechamento_id
     WHERE l.operador_id = v_eu
       AND l.empresa_id = v_emp
       AND f.status = 'aberto'
     ORDER BY f.competencia DESC
     LIMIT 1;

    IF v_fech IS NOT NULL THEN
      PERFORM public.fn_rh_evento(
        v_fech, NULL, 'operador', 'cracha_definido',
        v_nome || ' informou o próprio crachá como ' || v_cracha);
    END IF;
  END IF;

  RETURN v_cracha;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_meu_cracha_salvar(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_meu_cracha_salvar(TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_meu_cracha_salvar(TEXT) IS
  'A própria pessoa informa o crachá (até 8 dígitos) quando ainda não tem um. Não '
  'troca crachá existente — isso é com o RH. Ver 20261026160000.';

COMMIT;
