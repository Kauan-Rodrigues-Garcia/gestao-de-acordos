-- ============================================================
-- Setor alternativo (BookPlay)
--
-- Regra nova de acumulado do setor:
--   • Setor NORMAL  → total do setor = total do relatório analítico importado
--                     (soma de TODAS as linhas carimbadas com aquele setor_id).
--                     Clones NÃO afetam o total do setor.
--   • Setor ALTERNATIVO → total do setor = soma dos usuários que pertencem a ele
--                     (membros + clonados nas equipes dele). É o caso do
--                     "Digital Amauri", que não tem relatório próprio: recebe
--                     via clones dos operadores do Play 4 / Play 5.
--
-- Esta migration só adiciona a flag; a lógica de soma vive no front
-- (DesempenhoEquipes / AnaliticoLider), que já tem as duas agregações.
-- ============================================================

ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS alternativo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.setores.alternativo IS
  'Setor alternativo (sem relatório próprio): acumulado = soma dos usuários que '
  'pertencem a ele (membros + clones), em vez do total do relatório importado.';
