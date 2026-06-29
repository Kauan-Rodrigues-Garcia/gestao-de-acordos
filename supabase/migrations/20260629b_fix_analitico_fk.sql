-- ============================================================
-- Migration: fix FK de operador_id em analitico_recebimentos
-- Problema: FK apontava para auth.users(id) — PostgREST não
--           consegue resolver joins para o schema auth.
-- Solução:  redirecionar para public.perfis(id), que tem os
--           mesmos UUIDs (perfis.id IS auth.users.id) e é
--           visível pelo PostgREST para joins via select.
-- ============================================================

ALTER TABLE public.analitico_recebimentos
  DROP CONSTRAINT IF EXISTS analitico_recebimentos_operador_id_fkey;

ALTER TABLE public.analitico_recebimentos
  ADD CONSTRAINT analitico_recebimentos_operador_id_fkey
  FOREIGN KEY (operador_id)
  REFERENCES public.perfis(id)
  ON DELETE SET NULL;
