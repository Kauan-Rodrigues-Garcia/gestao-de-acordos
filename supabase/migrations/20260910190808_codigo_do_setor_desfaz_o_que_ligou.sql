-- ─────────────────────────────────────────────────────────────────────────────
-- Apagar o código desfaz o vínculo que ele mesmo fez
--
-- ── A lacuna que a migration anterior abriu ──────────────────────────────────
-- `20260910190216` removeu o vínculo manual de carteira. Foi a decisão certa —
-- dois caminhos para o mesmo fato divergem em vez de sincronizar —, mas ela
-- deixou um buraco: a versão anterior de `fn_setor_definir_codigo_erp`
-- deliberadamente NÃO desfazia nada ao apagar o código, e o comentário dizia o
-- porquê: «para desfazer existe o vínculo manual».
--
-- Esse argumento morreu com o vínculo manual. Sem esta correção, apagar ou
-- trocar o código deixaria a carteira presa ao setor sem nada justificando — a
-- mesma «duas verdades» invertida, um vínculo sem dono e sem porta para
-- desfazer.
--
-- ── O que muda ───────────────────────────────────────────────────────────────
-- A função passa a fazer as duas metades da transição:
--
--   • solta a carteira que o código ANTIGO amarrava, se era este setor que a
--     tinha — carteira que o código antigo aponta mas que pertence a outro setor
--     não é assunto daqui;
--   • amarra a carteira do código novo.
--
-- E devolve `desvinculou`, o nome da carteira solta, para a tela contar as duas
-- coisas na mesma mensagem. Sem isso a carteira antiga sairia do setor em
-- silêncio, e silêncio assim só aparece semanas depois, num total que não fecha.
--
-- ── Verificado ───────────────────────────────────────────────────────────────
-- Ciclo completo exercitado em produção, num bloco que aborta ao final:
--
--     ligou 25 no Play 1 ....... COB PLAY 1 - PAOLA, vinculou
--     trocou para 28 ........... soltou COB PLAY 1 - PAOLA, amarrou COB PLAY 2
--     carteira 25 sem setor .... sim
--     apagou o código .......... soltou COB PLAY 2 - EDERLANDIA
--     vínculos ao final ........ 0
--
-- ── Como voltar atrás ────────────────────────────────────────────────────────
-- A versão anterior está em `20260910184908_setor_codigo_erp.sql`. Note que ela
-- tem OUT parameters diferentes: precisa de `DROP FUNCTION` antes.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_setor_definir_codigo_erp(uuid, text);

CREATE FUNCTION public.fn_setor_definir_codigo_erp(
  p_setor_id uuid,
  p_codigo   text
)
RETURNS TABLE (setor_id uuid, codigo_erp text, carteira text, vinculou boolean, desvinculou text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_empresa  uuid;
  v_codigo   text;
  v_antigo   text;
  v_dono     text;
  v_vinculou boolean := false;
  v_carteira text;
  v_soltou   text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION
      'CODIGO_ERP_SO_SUPER_ADMIN: o codigo do relatorio 59 so pode ser alterado pelo super_admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Campo em branco é «sem código», não string vazia: string vazia entraria no
  -- índice único e o segundo setor em branco seria recusado sem motivo visível.
  v_codigo := NULLIF(TRIM(COALESCE(p_codigo, '')), '');

  SELECT s.empresa_id, s.codigo_erp INTO v_empresa, v_antigo
    FROM public.setores s WHERE s.id = p_setor_id;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'SETOR_NAO_ENCONTRADO: setor % nao existe.', p_setor_id;
  END IF;

  -- A mensagem do índice único é ilegível na tela. Aqui se diz de quem é.
  IF v_codigo IS NOT NULL THEN
    SELECT s.nome INTO v_dono
      FROM public.setores s
     WHERE s.empresa_id = v_empresa AND s.codigo_erp = v_codigo AND s.id <> p_setor_id
     LIMIT 1;
    IF v_dono IS NOT NULL THEN
      RAISE EXCEPTION
        'CODIGO_ERP_EM_USO: o codigo % ja e do setor "%". Um codigo pertence a um setor so.',
        v_codigo, v_dono;
    END IF;
  END IF;

  UPDATE public.setores s SET codigo_erp = v_codigo WHERE s.id = p_setor_id;

  /*
   * O código ANTIGO solta a carteira que ele havia amarrado.
   *
   * Só solta o que ESTE setor havia amarrado com ESTE código: carteira que o
   * código antigo aponta mas que hoje pertence a outro setor não é assunto
   * daqui.
   */
  IF v_antigo IS NOT NULL AND v_antigo IS DISTINCT FROM v_codigo THEN
    UPDATE public.mestre_grupos g
       SET setor_id         = NULL,
           estado           = 'novo',
           vinculado_por_id = NULL,
           vinculado_em     = NULL,
           observacao       = NULL,
           atualizado_em    = now()
     WHERE g.empresa_id = v_empresa
       AND g.cod_grupo_filtro = v_antigo
       AND g.setor_id = p_setor_id
    RETURNING g.nome_grupo_filtro INTO v_soltou;
  END IF;

  IF v_codigo IS NOT NULL THEN
    UPDATE public.mestre_grupos g
       SET setor_id         = p_setor_id,
           estado           = 'vinculado',
           vinculado_por_id = (SELECT auth.uid()),
           vinculado_em     = now(),
           observacao       = 'Vinculado pelo codigo do setor.',
           atualizado_em    = now()
     WHERE g.empresa_id = v_empresa
       AND g.cod_grupo_filtro = v_codigo
       AND g.setor_id IS DISTINCT FROM p_setor_id
    RETURNING g.nome_grupo_filtro INTO v_carteira;
    v_vinculou := v_carteira IS NOT NULL;

    -- Já estava vinculada: a tela ainda precisa do nome para confirmar que o
    -- número digitado é o certo.
    IF v_carteira IS NULL THEN
      SELECT g.nome_grupo_filtro INTO v_carteira
        FROM public.mestre_grupos g
       WHERE g.empresa_id = v_empresa AND g.cod_grupo_filtro = v_codigo
       LIMIT 1;
    END IF;
  END IF;

  RETURN QUERY SELECT p_setor_id, v_codigo, v_carteira, v_vinculou, v_soltou;
END;
$function$;

COMMENT ON FUNCTION public.fn_setor_definir_codigo_erp(uuid, text) IS
  'Grava o CodGrupoFiltro do setor, solta a carteira que o codigo ANTIGO '
  'amarrava e amarra a do novo. So super_admin. E a unica via de vinculo de '
  'carteira desde 20260910190216.';

REVOKE ALL ON FUNCTION public.fn_setor_definir_codigo_erp(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_setor_definir_codigo_erp(uuid, text) TO authenticated;
