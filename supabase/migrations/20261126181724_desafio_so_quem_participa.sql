-- ============================================================================
-- Desafios: só vê a campanha quem participa, o setor/equipe marcados e a
-- administração (26/11/2026)
-- ============================================================================
--
-- Relato do Cleber, 26/11/2026: o selo da «Premiação da semana» (campanha da
-- Jornada Play, 3 equipes marcadas, nenhum setor) aparecia no menu lateral
-- do pessoal do Play 2. Pedido: a campanha — ativa ou encerrada — aparece só
-- para quem está configurado nela, para quem a configurou, e para super_admin
-- e administrador. Mais ninguém.
--
-- ## A causa
--
-- `fn_desafio_no_meu_alcance` (20261105120000), a régua de TODA leitura de
-- desafio (policy `desafios_select`, o selo do menu `fn_desafio_em_cartaz`,
-- `fn_desafio_dados`, o placar do dia, o contexto de equipe, o push), tinha
-- portas largas demais:
--
--   • escopo de setor: campanha SEM setor marcado → TRUE para todo cargo com
--     a chave (líder, gerência, elite, diretoria) de qualquer setor. Foi o
--     caso da «Premiação da semana» — só equipes marcadas;
--   • escopo de equipe: sem setor e sem equipe marcados → TRUE para todos;
--   • `desafios_escopo_todos_setores` → TRUE em tudo (diretoria);
--   • `visibilidade = 'todos'` (mural) → TRUE para todo mundo (nenhuma
--     campanha usa hoje; a opção sai da tela também).
--
-- ## A régua nova (nesta ordem)
--
--   1. super_admin e cargo `administrador` — tudo;
--   2. o setor dono da campanha (`desafios.setor_id`, gravado na criação com
--      o setor de quem a montou), para quem tem `desafios_configurar_setor`
--      — é «quem configurou» e a liderança que cuida dela junto;
--   3. escopo de setor: só se o setor da pessoa está MARCADO na campanha;
--   4. escopo de equipe: só se uma equipe da pessoa está MARCADA;
--   5. quem disputa (`fn_desafio_eu_disputo`, a mesma regra do ranking).
--
-- Campanha sem setor nem equipe marcados (a operação inteira, convocação por
-- planilha, lista nominal) fica só com 1, 2 e 5.
--
-- Mesma assinatura: nenhuma policy nem função que chama é recriada.
-- Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_desafio_no_meu_alcance(
  p_setor_id     UUID,
  p_regra        JSONB,
  p_visibilidade TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_setores    UUID[];
  v_equipes    UUID[];
  v_meu_setor  UUID;
BEGIN
  -- 1. A administração vê tudo.
  IF public.fn_user_is_super_admin() THEN RETURN TRUE; END IF;
  IF EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.perfil = 'administrador') THEN
    RETURN TRUE;
  END IF;

  v_meu_setor := public.fn_user_setor_id();

  -- 2. O setor dono da campanha, para quem configura no setor.
  IF p_setor_id IS NOT NULL AND v_meu_setor IS NOT NULL AND p_setor_id = v_meu_setor
     AND public.fn_user_tem('desafios_configurar_setor') THEN
    RETURN TRUE;
  END IF;

  BEGIN
    SELECT
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_regra->'participantes'->'setores')::UUID), ARRAY[]::UUID[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_regra->'participantes'->'equipes')::UUID), ARRAY[]::UUID[])
      INTO v_setores, v_equipes;
  EXCEPTION WHEN OTHERS THEN
    v_setores := ARRAY[]::UUID[]; v_equipes := ARRAY[]::UUID[];
  END;

  -- 3. Liderança do setor MARCADO (sem marcação, não é «todos os setores»).
  IF cardinality(v_setores) > 0 AND v_meu_setor = ANY (v_setores)
     AND public.fn_user_tem('desafios_escopo_setor') THEN
    RETURN TRUE;
  END IF;

  -- 4. Liderança da equipe MARCADA.
  IF cardinality(v_equipes) > 0 AND public.fn_user_equipes() && v_equipes
     AND public.fn_user_tem('desafios_escopo_equipe') THEN
    RETURN TRUE;
  END IF;

  -- 5. Quem disputa.
  IF public.fn_user_tem('desafios_escopo_individual')
     AND public.fn_desafio_eu_disputo(p_regra) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$fn$;

COMMENT ON FUNCTION public.fn_desafio_no_meu_alcance(UUID, JSONB, TEXT) IS
  'A campanha esta no alcance de leitura de quem esta logado? Administracao, setor dono (quem configura), '
  'setor ou equipe MARCADOS, ou quem disputa. Sem mural e sem todos_setores (20261126181724).';

COMMIT;
