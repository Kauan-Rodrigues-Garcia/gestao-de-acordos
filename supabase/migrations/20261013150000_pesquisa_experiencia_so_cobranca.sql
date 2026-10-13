-- ============================================================================
-- Pesquisa de experiência: desligada, e só da cobrança — 13/10/2026
-- ============================================================================
--
-- Pedido do Cleber: «desativa ela, não é para aparecer para mais ninguém. A
-- pesquisa é somente da cobrança: o comercial não deveria participar. Tira do
-- total de usuários todo perfil do comercial e, se algum votou, desconsidera
-- o voto e tira da conta.»
--
-- O comercial é a empresa `comercial` (setores PERFORMANCE e Vendas Bookplay).
-- Medido antes, em 13/10/2026:
--
--   público ........ 461 pessoas (90 do comercial)  → 371
--   respostas ...... 252 (2 do comercial, líderes de Vendas Bookplay) → 250
--
-- 1. Desliga a pesquisa. Pela tabela, não por `fn_pesquisa_experiencia_ligar`:
--    a função cobra o super_admin pela sessão, e a migration não tem sessão.
-- 2. O público (`fn_pesquisa_experiencia_publico`) deixa o comercial de fora.
-- 3. O voto do comercial NÃO é apagado: a policy de leitura deixa de mostrá-lo,
--    e o card soma só o que lê. A linha fica no banco, se um dia precisar.
--    A empresa conferida é a do retrato (`empresa_id` da resposta), a da hora
--    do voto.
-- 4. Se a pesquisa for ligada de novo, o comercial não recebe a pergunta
--    (`_estado` responde desligada para ele) e não consegue votar (`_votar`).
--
-- Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── Quem é do comercial ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pesquisa_experiencia_eh_comercial(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id AND e.slug = 'comercial');
$function$;

REVOKE ALL ON FUNCTION public.fn_pesquisa_experiencia_eh_comercial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pesquisa_experiencia_eh_comercial(uuid) TO authenticated;

-- ── 1. Desligar ─────────────────────────────────────────────────────────────
UPDATE public.pesquisa_experiencia_config
   SET ligada = FALSE, desligada_em = now(), desligada_por_nome = 'Cleber'
 WHERE id = 1 AND ligada;

-- ── 2. O público, sem o comercial ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pesquisa_experiencia_publico()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('config_sub_geral')) THEN
    RAISE EXCEPTION 'sem acesso' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT count(*)::int FROM public.perfis p
           WHERE p.ativo AND p.perfil::text <> 'super_admin'
             AND NOT public.fn_pesquisa_experiencia_eh_comercial(p.empresa_id));
END;
$function$;

-- ── 3. O voto do comercial sai da leitura ───────────────────────────────────
DROP POLICY IF EXISTS pesquisa_experiencia_respostas_leitura ON public.pesquisa_experiencia_respostas;
CREATE POLICY pesquisa_experiencia_respostas_leitura ON public.pesquisa_experiencia_respostas
  FOR SELECT TO authenticated
  USING (
    (usuario_id = (SELECT auth.uid()) OR (SELECT public.fn_user_tem('config_sub_geral')))
    AND NOT public.fn_pesquisa_experiencia_eh_comercial(empresa_id)
  );

-- ── 4. Ligada de novo, o comercial não vê nem vota ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pesquisa_experiencia_estado()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'ligada', COALESCE((SELECT c.ligada FROM public.pesquisa_experiencia_config c WHERE c.id = 1), FALSE)
              AND NOT EXISTS (
                SELECT 1 FROM public.perfis p
                 WHERE p.id = (SELECT auth.uid()) AND public.fn_pesquisa_experiencia_eh_comercial(p.empresa_id)
              ),
    'respondeu', EXISTS (
      SELECT 1 FROM public.pesquisa_experiencia_respostas r WHERE r.usuario_id = (SELECT auth.uid())
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_pesquisa_experiencia_votar(p_nota text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sem sessão' USING ERRCODE = '42501';
  END IF;
  IF p_nota IS NULL OR p_nota NOT IN ('ruim', 'media', 'boa') THEN
    RAISE EXCEPTION 'nota inválida: %', p_nota USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE((SELECT c.ligada FROM public.pesquisa_experiencia_config c WHERE c.id = 1), FALSE) THEN
    RAISE EXCEPTION 'a pesquisa está desligada' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.perfis p
              WHERE p.id = v_uid AND public.fn_pesquisa_experiencia_eh_comercial(p.empresa_id)) THEN
    RAISE EXCEPTION 'a pesquisa é só da cobrança' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pesquisa_experiencia_respostas
         (usuario_id, nome, cargo, empresa_id, empresa_nome, setor_id, setor_nome, nota)
  SELECT p.id, p.nome, COALESCE(cg.nome, p.perfil::text), p.empresa_id, e.nome, p.setor_id, s.nome, p_nota
    FROM public.perfis p
    LEFT JOIN public.cargos   cg ON cg.slug = p.perfil::text
    LEFT JOIN public.empresas e  ON e.id = p.empresa_id
    LEFT JOIN public.setores  s  ON s.id = p.setor_id
   WHERE p.id = v_uid
  ON CONFLICT (usuario_id) DO UPDATE
     SET nota = EXCLUDED.nota, nota_em = now();
END;
$function$;

-- ── Verificação ─────────────────────────────────────────────────────────────
DO $verificacao$
BEGIN
  IF (SELECT ligada FROM public.pesquisa_experiencia_config WHERE id = 1) THEN
    RAISE EXCEPTION 'A pesquisa continua ligada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE slug = 'comercial') THEN
    RAISE EXCEPTION 'Não achei a empresa comercial: nada seria excluído.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_pesquisa_experiencia_eh_comercial(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon executa fn_pesquisa_experiencia_eh_comercial.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261013150000', 'pesquisa_experiencia_so_cobranca', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
