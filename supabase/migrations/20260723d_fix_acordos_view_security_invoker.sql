-- ═══════════════════════════════════════════════════════════════════════════
-- ITEM 3 (revisão) — a RLS de acordos não pegava por causa de uma VIEW
-- ═══════════════════════════════════════════════════════════════════════════
-- A migration 20260723b corrigiu a RLS da TABELA acordos, mas a listagem de
-- acordos (acordos.service.ts) lê da VIEW `acordos_deduplicados` quando não há
-- filtro de mês. Views no Postgres executam com os privilégios do DONO (quem
-- criou — normalmente superusuário) e, por padrão, IGNORAM a RLS da tabela
-- base. Ou seja: o líder lia todos os setores pela view, driblando a RLS.
--
-- A última recriação da view (20260507_sort_hoje_priority.sql) usou um
-- `CREATE VIEW` simples, sem `security_invoker` — então a view rodava como dono
-- e via tudo. (O comentário antigo que dizia "security_invoker por padrão no
-- Supabase" está incorreto: o padrão do Postgres é o oposto.)
--
-- Correção: fazer a view executar com os privilégios de QUEM CONSULTA
-- (security_invoker), aí a RLS de acordos (20260723b) passa a valer também
-- através da view — líder/elite/gerência ficam presos ao próprio setor.
--
-- Requer Postgres 15+ (Supabase já usa). Idempotente.

ALTER VIEW public.acordos_deduplicados SET (security_invoker = true);

-- Defesa em profundidade: a mesma proteção na view de resumo por código
-- (hoje sem uso visual, mas agrega acordos da empresa toda).
ALTER VIEW public.vw_resumo_codigo SET (security_invoker = true);
