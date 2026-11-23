-- ============================================================================
-- Desafio do Vale: a arte obrigatória e a contagem de quem viu (23/11/2026)
-- ============================================================================
--
-- Pedido do usuário: «depois de liberar para a operação, primeiro sai a arte,
-- e o pessoal só pode fechar com "Bora pra cima", afirmando que leu — uns 3 a
-- 5 segundos para liberar o botão. E uma contagem de quem viu».
--
-- O «Bora pra cima» grava aqui (`fn_desafio_vale_vi`). Uma linha por pessoa
-- por desafio; repetir não faz nada; nunca se apaga. O registro é no banco
-- (não no navegador): outro PC ou cache limpo não mostram a arte de novo, e
-- a contagem é de verdade.
--
-- Quem vê a contagem (`fn_desafio_vale_vistos`):
--   super_admin e quem tem o Analítico de todos os setores → todos os setores;
--   o líder (Analítico do setor) → o próprio setor, para cobrar quem falta;
--   os outros → nada.
-- Conta as pessoas ativas dos setores que participam (todos os cargos, menos
-- super_admin), e lista quem ainda não viu.
--
-- Sem sinal ao vivo de propósito: cada pessoa que fecha a arte seria um sinal
-- para a empresa inteira (o mesmo cuidado das aberturas do Desafio Cobrança).
--
-- Reexecutável. Tabela nova e funções.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.desafio_vale_vistos (
  desafio_id  uuid NOT NULL REFERENCES public.desafio_vale(id) ON DELETE CASCADE,
  perfil_id   uuid NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  visto_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (desafio_id, perfil_id)
);
COMMENT ON TABLE public.desafio_vale_vistos IS
  'Quem fechou a arte do Desafio do Vale com «Bora pra cima» (leu). Uma linha por pessoa por desafio.';

ALTER TABLE public.desafio_vale_vistos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS desafio_vale_vistos_ver ON public.desafio_vale_vistos;
CREATE POLICY desafio_vale_vistos_ver ON public.desafio_vale_vistos FOR SELECT TO authenticated
  USING (perfil_id = (SELECT auth.uid()) OR (SELECT public.fn_user_is_super_admin()));
REVOKE ALL ON public.desafio_vale_vistos FROM anon;
GRANT SELECT ON public.desafio_vale_vistos TO authenticated;

-- «Bora pra cima»: grava que a pessoa viu a arte deste desafio (liberado).
CREATE OR REPLACE FUNCTION public.fn_desafio_vale_vi(p_desafio uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.desafio_vale c WHERE c.id = p_desafio AND c.ativo AND c.liberado) THEN
    RETURN false;
  END IF;
  INSERT INTO public.desafio_vale_vistos (desafio_id, perfil_id) VALUES (p_desafio, auth.uid())
  ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_vi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_vale_vi(uuid) TO authenticated;

-- A pessoa já viu a arte deste desafio?
CREATE OR REPLACE FUNCTION public.fn_desafio_vale_ja_vi(p_desafio uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.desafio_vale_vistos v WHERE v.desafio_id = p_desafio AND v.perfil_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_ja_vi(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_vale_ja_vi(uuid) TO authenticated;

-- A contagem, por setor que participa: quantos são, quantos viram e quem falta.
CREATE OR REPLACE FUNCTION public.fn_desafio_vale_vistos()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sa     boolean := coalesce(public.fn_user_is_super_admin(), false);
  v_todos  boolean;
  v_lider  boolean;
  v_setor  uuid := public.fn_user_setor_id();
  v_d      public.desafio_vale%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  v_todos := v_sa OR coalesce(public.fn_user_tem('analitico_escopo_todos_setores'), false);
  v_lider := coalesce(public.fn_user_tem('analitico_escopo_setor'), false);
  IF NOT v_todos AND NOT v_lider THEN RETURN NULL; END IF;

  SELECT * INTO v_d FROM public.desafio_vale WHERE ativo ORDER BY atualizado_em DESC LIMIT 1;
  IF v_d.id IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'liberado_em', v_d.liberado_em,
    'setores', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'nome')
        FROM (
          SELECT jsonb_build_object(
                   'setor_id', st.id, 'nome', st.nome,
                   'total', count(p.id),
                   'viram', count(v.perfil_id),
                   'faltam', coalesce(jsonb_agg(jsonb_build_object('perfil_id', p.id, 'nome', p.nome, 'cargo', p.perfil)
                                                ORDER BY p.nome) FILTER (WHERE v.perfil_id IS NULL AND p.id IS NOT NULL), '[]'::jsonb)
                 ) AS x
            FROM public.desafio_vale_setores s
            JOIN public.setores st ON st.id = s.setor_id
            LEFT JOIN public.perfis p
                   ON p.setor_id = st.id AND p.empresa_id = v_d.empresa_id
                  AND coalesce(p.ativo, true) AND NOT coalesce(p.arquivado, false)
                  AND coalesce(p.perfil, '') <> 'super_admin'
            LEFT JOIN public.desafio_vale_vistos v ON v.desafio_id = v_d.id AND v.perfil_id = p.id
           WHERE s.desafio_id = v_d.id AND s.participa
             AND (v_todos OR st.id = v_setor)
           GROUP BY st.id, st.nome
        ) t), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.fn_desafio_vale_vistos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_vale_vistos() TO authenticated;

COMMIT;
