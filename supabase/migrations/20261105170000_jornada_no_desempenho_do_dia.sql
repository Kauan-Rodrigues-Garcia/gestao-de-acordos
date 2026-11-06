-- ============================================================================
-- 20261105170000_jornada_no_desempenho_do_dia.sql
--
-- Desempenho do Dia: quantos ACESSOS e RETENÇÕES foram lançados (pedido de
-- 05/11/2026). Só o setor Jornada tem isso; nenhum outro setor muda.
--
-- `jornada_registros` não tem leitura direta (só pelas funções fn_jornada_*),
-- então o painel pede a contagem a esta função, com o MESMO recorte das outras
-- consultas do painel: uma pessoa, uma lista de pessoas (equipe) ou um setor.
--
-- ## Só o Jornada
--
-- A função só conta gente do setor Jornada (`fn_jornada_setor_ok`, a mesma
-- regra das abas). Recorte sem ninguém do Jornada — outro setor, outra equipe,
-- a empresa inteira — devolve NULL, e a tela não mostra o bloco.
--
-- ## Quem vê o quê
--
--   administrador, gerência, diretoria, super_admin  o recorte pedido;
--   líder, elite                                     só gente dos próprios setores;
--   demais                                           só a si mesmo.
--
-- Só números (sem NR). Lançamento apagado (lixeira) não conta.
-- Somente leitura: não cria tabela nem mexe em dado. Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.fn_jornada_contagem_dia(
  p_empresa_id  UUID,
  p_dia         DATE,
  p_operador_id UUID   DEFAULT NULL,
  p_operadores  UUID[] DEFAULT NULL,
  p_setor_id    UUID   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid     UUID := (SELECT auth.uid());
  v_amplo   BOOLEAN;
  v_lider   BOOLEAN;
  v_pessoas UUID[];
  v_inicio  DATE;
  v_res     JSONB;
BEGIN
  IF p_dia IS NULL OR v_uid IS NULL OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN NULL;
  END IF;

  v_amplo := public.fn_user_is_super_admin()
          OR public.fn_user_has_any_role(ARRAY['administrador', 'gerencia', 'diretoria']);
  v_lider := public.fn_user_has_any_role(ARRAY['lider', 'elite']);

  -- As pessoas do recorte que são do Jornada (setor da equipe, ou o do cadastro).
  SELECT array_agg(p.id) INTO v_pessoas
    FROM public.perfis p
    LEFT JOIN public.equipes e ON e.id = p.equipe_id
   WHERE p.empresa_id = p_empresa_id
     AND public.fn_jornada_setor_ok(COALESCE(e.setor_id, p.setor_id))
     AND CASE
           WHEN p_operador_id IS NOT NULL                    THEN p.id = p_operador_id
           WHEN cardinality(COALESCE(p_operadores, '{}')) > 0 THEN p.id = ANY(p_operadores)
           WHEN p_setor_id IS NOT NULL                       THEN COALESCE(e.setor_id, p.setor_id) = p_setor_id
           ELSE FALSE  -- a empresa inteira não é o Jornada: sem bloco
         END
     AND (
       v_amplo
       OR (v_lider AND COALESCE(e.setor_id, p.setor_id) IN (SELECT s FROM public.fn_setores_do_operador(v_uid) AS s))
       OR p.id = v_uid
     );

  IF v_pessoas IS NULL THEN
    RETURN NULL;
  END IF;

  v_inicio := date_trunc('month', p_dia)::DATE;

  SELECT jsonb_build_object(
    'acesso',       count(*) FILTER (WHERE r.tipo = 'acesso'   AND r.data = p_dia),
    'retencao',     count(*) FILTER (WHERE r.tipo = 'retencao' AND r.data = p_dia),
    'acesso_mes',   count(*) FILTER (WHERE r.tipo = 'acesso'),
    'retencao_mes', count(*) FILTER (WHERE r.tipo = 'retencao')
  ) INTO v_res
    FROM public.jornada_registros r
   WHERE r.empresa_id = p_empresa_id
     AND r.perfil_id  = ANY(v_pessoas)
     AND r.apagado_em IS NULL
     AND r.data BETWEEN v_inicio AND p_dia;

  -- Quais abas o recorte tem: quem está num grupo Suporte (Acesso) ou Retenção.
  -- Equipe do Jornada sem nenhum dos dois (Recebimento) não ganha linha zerada.
  RETURN v_res || jsonb_build_object(
    'tem_acesso', EXISTS (
      SELECT 1 FROM public.perfis p
        LEFT JOIN public.equipes e           ON e.id  = p.equipe_id
        LEFT JOIN public.equipe_subgrupos sg ON sg.id = p.subgrupo_id
       WHERE p.id = ANY(v_pessoas)
         AND COALESCE(public.fn_jornada_tipo_subgrupo(sg.nome), public.fn_jornada_tipo_subgrupo(e.nome)) = 'acesso'),
    'tem_retencao', EXISTS (
      SELECT 1 FROM public.perfis p
        LEFT JOIN public.equipes e           ON e.id  = p.equipe_id
        LEFT JOIN public.equipe_subgrupos sg ON sg.id = p.subgrupo_id
       WHERE p.id = ANY(v_pessoas)
         AND COALESCE(public.fn_jornada_tipo_subgrupo(sg.nome), public.fn_jornada_tipo_subgrupo(e.nome)) = 'retencao')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_jornada_contagem_dia(UUID, DATE, UUID, UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_jornada_contagem_dia(UUID, DATE, UUID, UUID[], UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_jornada_contagem_dia(UUID, DATE, UUID, UUID[], UUID) IS
  'Desempenho do Dia: acessos e retencoes lancados no dia e no mes, no recorte '
  'do painel. So gente do setor Jornada; fora dele, NULL. 20261105170000.';

COMMIT;
