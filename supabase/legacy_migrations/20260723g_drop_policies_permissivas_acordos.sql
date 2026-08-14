-- ═══════════════════════════════════════════════════════════════════════════
-- ITEM 3 (a causa real) — remover policies PERMISSIVAS legadas de acordos
-- ═══════════════════════════════════════════════════════════════════════════
-- Diagnóstico (pg_policies) revelou duas policies criadas MANUALMENTE no banco
-- (não existiam nos arquivos de migration), permissivas e sem recorte de setor:
--
--   • acordos_select_empresa_2026  (SELECT)  qual: empresa_id IN (perfis do user)
--   • acordos_delete_empresa       (DELETE)  qual: empresa_id IN (perfis do user)
--
-- Como as policies de RLS são combinadas por OR, qualquer usuário autenticado
-- via acordos_select_empresa_2026 enxergava TODOS os acordos da empresa —
-- anulando a acordos_select (por setor). Era ESTE o vazamento entre setores,
-- não a view nem o fail-open (esses também foram corrigidos, mas esta policy
-- mantinha o furo aberto). O DELETE tinha o mesmo problema.
--
-- Remoção: o SELECT passa a ser governado só por acordos_select (por setor) e o
-- DELETE por acordos_delete_own (próprio) + acordos_delete_admin (gestão).

DROP POLICY IF EXISTS "acordos_select_empresa_2026" ON public.acordos;
DROP POLICY IF EXISTS "acordos_delete_empresa"      ON public.acordos;
