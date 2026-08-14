-- ═══════════════════════════════════════════════════════════════════════════
-- 20260714a — metas_config_mes.contar_dia_atual
--
-- Os "dias úteis já trabalhados" contavam o dia de hoje, e o dia de hoje ainda
-- está acontecendo: o analítico dele só fecha no fim do expediente. Isso inflava
-- o esperado e derrubava a projeção/quartil de todo mundo durante o dia.
--
-- Passa a ser configurável por empresa/mês na aba Metas. DEFAULT FALSE: o
-- padrão é NÃO contar o dia atual (só dias fechados). Quem quiser o
-- comportamento antigo marca a caixinha.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.metas_config_mes
  ADD COLUMN IF NOT EXISTS contar_dia_atual BOOLEAN NOT NULL DEFAULT FALSE;
