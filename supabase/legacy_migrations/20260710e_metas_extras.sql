-- ============================================================
-- Migration: metas adicionais (2026-07-10) — BookPlay
--
-- Cada meta (setor/equipe/operador) pode ter metas extras (2ª, 3ª, …)
-- guardadas como array de valores em `metas_extras`. A 1ª meta continua
-- em `meta_valor` e é a única que influencia quartil/percentual; as
-- extras só aparecem na barra de progresso depois que a 1ª é batida.
-- ============================================================

ALTER TABLE public.metas
  ADD COLUMN IF NOT EXISTS metas_extras JSONB NOT NULL DEFAULT '[]'::jsonb;
