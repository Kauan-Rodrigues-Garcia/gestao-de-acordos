-- ============================================================================
-- Apagar as duas contas de teste criadas em 06/10/2026 (teste da rota
-- /api/criar-usuario):
--
--   teste cleberrr             usuário teste_clebin
--   Testeeeee cleber deletar   usuário teste_teste
--
-- Rodar no SQL Editor do Supabase. Dois passos.
-- ============================================================================


-- ── PASSO 1: conferir (só leitura) ──────────────────────────────────────────
-- Tem de aparecer EXATAMENTE as duas contas acima. Se aparecer outra coisa,
-- pare aqui.

SELECT p.id, p.nome, p.usuario, p.email, p.perfil, e.slug AS empresa, p.criado_em
  FROM public.perfis p
  LEFT JOIN public.empresas e ON e.id = p.empresa_id
 WHERE lower(p.usuario) IN ('teste_clebin', 'teste_teste');


-- ── PASSO 2: apagar ─────────────────────────────────────────────────────────
-- Apaga em auth.users; a linha de perfis sai junto (perfis_id_fkey é
-- ON DELETE CASCADE). Tudo numa transação: se qualquer conferência falhar —
-- ou se o banco recusar (histórico de mês fechado, acordo vinculado...) —
-- nada é apagado.

BEGIN;

DO $apagar$
DECLARE
  v_ids UUID[];
BEGIN
  SELECT array_agg(p.id) INTO v_ids
    FROM public.perfis p
   WHERE lower(p.usuario) IN ('teste_clebin', 'teste_teste');

  IF coalesce(array_length(v_ids, 1), 0) <> 2 THEN
    RAISE EXCEPTION 'Esperava 2 contas de teste, achei %. Nada foi apagado.',
      coalesce(array_length(v_ids, 1), 0);
  END IF;

  IF EXISTS (SELECT 1 FROM public.perfis
              WHERE id = ANY (v_ids) AND perfil::TEXT IN ('super_admin', 'administrador')) THEN
    RAISE EXCEPTION 'Uma das contas é da administração. Nada foi apagado.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users
              WHERE id = ANY (v_ids) AND created_at < '2026-10-01') THEN
    RAISE EXCEPTION 'Uma das contas é anterior a outubro/2026 — não parece teste. Nada foi apagado.';
  END IF;

  DELETE FROM auth.users WHERE id = ANY (v_ids);

  IF EXISTS (SELECT 1 FROM public.perfis WHERE id = ANY (v_ids))
     OR EXISTS (SELECT 1 FROM auth.users WHERE id = ANY (v_ids)) THEN
    RAISE EXCEPTION 'Sobrou conta ou perfil. Nada foi apagado.';
  END IF;

  RAISE NOTICE 'Apagadas as contas %', v_ids;
END
$apagar$;

COMMIT;
