-- ============================================================
-- Migration: meta proporcional (2026-07-20)
--
-- Marca uma linha de `metas` (setor, equipe ou operador) como "proporcional":
-- usado para operador que entrou recentemente ou voltou de férias, cuja meta
-- é menor que a meta cheia dos demais. É só um sinalizador — não muda o
-- cálculo de meta_valor. Serve para o futuro sistema de recompensas do pet
-- (passe de batalha, quartil, etc.) não tratar quem tem meta proporcional
-- igual a quem tem meta cheia.
-- ============================================================

ALTER TABLE public.metas
  ADD COLUMN IF NOT EXISTS meta_proporcional BOOLEAN NOT NULL DEFAULT FALSE;
