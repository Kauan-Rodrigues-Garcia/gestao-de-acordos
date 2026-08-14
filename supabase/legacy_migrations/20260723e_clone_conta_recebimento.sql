-- ═══════════════════════════════════════════════════════════════════════════
-- ITEM 1 — Caixinha "contar recebimento do clone na equipe"
-- ═══════════════════════════════════════════════════════════════════════════
-- Cada clone (equipe_operadores_clones) ganha um interruptor por (operador,
-- equipe): quando LIGADO (padrão), o recebimento do operador conta para aquela
-- equipe; quando DESLIGADO, não conta para a equipe nem para o setor daquela
-- equipe. O setor de ORIGEM do operador continua contando sempre (uma vez).
--
-- A foto/tag do líder clonado na equipe NÃO depende deste flag — continua
-- aparecendo em Desempenho Equipes mesmo com a caixinha desligada (o flag só
-- afeta a SOMA do recebimento, não a presença visual).

ALTER TABLE public.equipe_operadores_clones
  ADD COLUMN IF NOT EXISTS conta_recebimento BOOLEAN NOT NULL DEFAULT TRUE;
