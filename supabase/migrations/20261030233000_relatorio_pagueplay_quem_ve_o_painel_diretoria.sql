-- ============================================================================
-- Relatórios PaguePlay: para quem vê o Painel Diretoria
-- 30/10/2026 · pedido do Cleber
-- ============================================================================
--
-- «Quem tem acesso ao painel de diretoria do Cofen (o do Conecta Play, que
-- traz os dados do Coren) também vai ter acesso à aba Relatórios PaguePlay e
-- vai poder importar. Hoje só eu, que sou super_admin, vejo.»
--
-- `fn_pp_relatorio_acesso` (20260911222903) pedia, além de
-- `ver_painel_diretoria`, a chave `painel_diretoria_escopo_todos_setores` — que
-- ninguém além do super_admin tinha ligada na PaguePlay. Esta versão tira essa
-- exigência: quem vê o Painel Diretoria da empresa onde moram os dados da
-- regra Cofen (a PaguePlay) vê, importa e exclui os relatórios.
--
-- A tela anda junto (`PainelDiretoria/index.tsx`, `podeVerRelatorioPP`).
--
-- O que muda junto, por usar esta função:
--   - as policies de leitura de `pp_relatorio_*` (20260911222903);
--   - `fn_pp_relatorio` (abrir, adicionar, concluir, cancelar, excluir, resumo);
--   - `private.r945_pode` (20261026150000): quem vê o Painel Diretoria passa a
--     poder importar o 945 pela aba — o mesmo arquivo que já atualiza o
--     recebimento diário do Analítico.
--
-- Só troca o corpo; mesma assinatura, mesmas grants.
--
-- Para desfazer: reaplicar o trecho de `fn_pp_relatorio_acesso` de
-- 20260911222903 (com a linha do `painel_diretoria_escopo_todos_setores`).

CREATE OR REPLACE FUNCTION public.fn_pp_relatorio_acesso(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.fn_can_access_empresa(p_empresa)
    AND public.fn_user_tem('ver_painel_diretoria')
    AND EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa AND slug = 'pagueplay');
$$;
REVOKE ALL ON FUNCTION public.fn_pp_relatorio_acesso(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pp_relatorio_acesso(uuid) TO authenticated;
