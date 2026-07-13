-- ═══════════════════════════════════════════════════════════════════════════
-- 20260713a — Troca de senha 1x + equipes de treinamento (dias úteis)
--
-- 1) perfis.senha_alterada — marca que o usuário já trocou a senha padrão pelo
--    botão de chave na topbar. FALSE = ainda mostra o botão; vira TRUE após a
--    1ª troca, escondendo o botão para sempre.
--
-- 2) equipes.treinamento + equipes.treinamento_inicio — uma equipe de
--    treinamento inicia as atividades no meio do mês. Quando `treinamento` é
--    TRUE, os cálculos de dias úteis (meta diária, projeção, quartil) da equipe
--    e dos seus operadores passam a contar apenas os dias úteis a partir de
--    `treinamento_inicio` (feriados antes do início são ignorados; depois,
--    entram no cálculo). A data é configurada na aba Metas.
--
-- Idempotente — pode rodar mais de uma vez sem efeito colateral.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Troca de senha 1x ─────────────────────────────────────────────────────

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS senha_alterada BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. Equipes de treinamento ────────────────────────────────────────────────

ALTER TABLE public.equipes
  ADD COLUMN IF NOT EXISTS treinamento BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.equipes
  ADD COLUMN IF NOT EXISTS treinamento_inicio DATE DEFAULT NULL;
