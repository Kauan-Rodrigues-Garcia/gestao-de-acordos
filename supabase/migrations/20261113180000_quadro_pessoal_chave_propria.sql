-- ============================================================================
-- Quadro de Pessoal: chave própria, explícita (13/11/2026)
-- ============================================================================
--
-- Pedido do Cleber: a aba é do RH. Aparece em Configurações › Permissões,
-- mas nasce DESLIGADA para todo mundo menos o RH e o super_admin; o super
-- admin libera para mais quem quiser.
--
-- Até aqui o Quadro abria pelo alcance «todos os setores» do RH Gestão, que
-- gerência e diretoria também têm. Agora é a chave `ver_quadro_pessoal`:
--
--   * EXPLÍCITA: o acesso total do administrador não a concede sozinho
--     (`fn_user_tem` só pula o mapa para chave não explícita), e a semeadura a
--     grava `false` nos cargos de acesso total. O super_admin entra pela porta
--     (`fn_user_is_super_admin()`), como a tela faz: é ele quem libera a aba.
--   * O cargo `rh` não passa por `fn_permissoes_semear_empresa` (a lista de
--     cargos dela é anterior ao RH): a linha dele recebe a chave à parte.
--   * `fn_rh_historico_mes` passa a pedir a mesma chave.
--
-- Só mexe em permissão: o crachá usa o que já existe (`fn_rh_salvar_cracha`,
-- chave `rh_editar_cracha`).
--
-- Reverter: renomear fn_permissoes_catalogo_antes_quadro_pessoal_20261113
-- de volta para fn_permissoes_catalogo; reaplicar a porta antiga de
-- fn_rh_historico_mes (20261113150000). A chave semeada fica sem efeito.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. A chave no catálogo ──────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_quadro_pessoal_20261113()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_quadro_pessoal_20261113;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_quadro_pessoal_20261113() IS
  'Retrato do catalogo antes de ver_quadro_pessoal (13/11/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_quadro_pessoal_20261113()
  UNION ALL
  SELECT * FROM (VALUES
    -- Explícita: de fábrica só o RH; o administrador não herda. O super_admin
    -- entra pela porta de cada lugar (fn_user_is_super_admin), não pelo mapa.
    ('ver_quadro_pessoal', NULL::TEXT[], ARRAY['rh']::TEXT[], true)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261113180000 soma ver_quadro_pessoal (explicita).';

-- Semeia só as chaves ausentes (o que já está configurado não muda).
DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- O cargo RH fica fora da semeadura: liga a chave na linha dele, onde faltar.
UPDATE public.cargos_permissoes
   SET permissoes = COALESCE(permissoes, '{}'::jsonb) || jsonb_build_object('ver_quadro_pessoal', true),
       atualizado_em = NOW()
 WHERE cargo = 'rh'
   AND NOT (COALESCE(permissoes, '{}'::jsonb) ? 'ver_quadro_pessoal');

-- ── 2. O histórico do mês pede a mesma chave ────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_rh_historico_mes(p_empresas uuid[], p_mes date)
RETURNS TABLE (
  tipo            text,
  dia             date,
  pessoa_id       uuid,
  pessoa_nome     text,
  cargo           text,
  empresa_id      uuid,
  setor_de_id     uuid,
  setor_de_nome   text,
  cidade_de       text,
  setor_para_id   uuid,
  setor_para_nome text,
  cidade_para     text,
  valor_de        text,
  valor_para      text,
  sentido         text,
  ausencia_tipo   text,
  ausencia_rotulo text,
  inicio          date,
  fim             date,
  feito_por       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_empresas uuid[];
BEGIN
  IF NOT (public.fn_user_tem('ver_quadro_pessoal') OR public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'Sem acesso ao histórico do RH' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(x.emp_id) INTO v_empresas
    FROM unnest(p_empresas) AS x(emp_id)
   WHERE public.fn_can_access_empresa(x.emp_id);

  -- Antes de 12/08/2026 não há log de perfis; agosto já sai incompleto.
  IF v_empresas IS NULL OR p_mes < DATE '2026-08-01' THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.fn_rh_historico_mes_eventos(v_empresas, p_mes);
END;
$fn$;

COMMENT ON FUNCTION public.fn_rh_historico_mes(uuid[], date) IS
  'Histórico do mês do RH (Quadro de Pessoal). Só leitura; exige ver_quadro_pessoal '
  '(chave explícita, 20261113180000).';

REVOKE ALL ON FUNCTION public.fn_rh_historico_mes(uuid[], date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_rh_historico_mes(uuid[], date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_rh_historico_mes(uuid[], date) TO authenticated;

COMMIT;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
--   select chave, padrao, explicita from public.fn_permissoes_catalogo()
--    where chave = 'ver_quadro_pessoal';
--   select cargo, count(*) filter (where (permissoes->>'ver_quadro_pessoal')::boolean) as ligada,
--          count(*) as linhas
--     from public.cargos_permissoes group by cargo order by cargo;
