-- ═══════════════════════════════════════════════════════════════════════════
-- Preenche `composicao_mes_setor` de AGOSTO/2026 com o nome de 31/08
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Terceiro companheiro de `reconstruir_composicao_2026_08_pelos_logs.sql` e
-- `reconstruir_lideranca_2026_08_pelos_logs.sql`. Rodar UMA vez, depois da
-- migration `20260903350000`.
--
-- Mesma fonte e mesmo instante alvo: `logs_sistema` e 2026-09-01 03:00:00+00
-- (31/08 às 23:59:59 em São Paulo).
--
-- Só um setor mudou de nome depois do alvo: "Amauri Digital" virou "Marília
-- Digital" em 01/09 às 13:46. Setor criado depois de 31/08 fica de fora — não
-- existia no mês.

BEGIN;

WITH t AS (SELECT TIMESTAMPTZ '2026-09-01 03:00:00+00' AS quando),
mud AS (
  SELECT l.registro_id::uuid AS id, l.antes, l.criado_em FROM public.logs_sistema l, t
   WHERE l.tabela='setores' AND l.acao='setor_alterado' AND l.criado_em > t.quando),
val AS (
  SELECT DISTINCT ON (m.id, k) m.id, k AS campo, m.antes->k AS valor
    FROM mud m CROSS JOIN LATERAL jsonb_object_keys(m.antes) k
   ORDER BY m.id, k, m.criado_em),
nasc AS (
  SELECT l.registro_id::uuid AS id FROM public.logs_sistema l, t
   WHERE l.tabela='setores' AND l.acao='setor_criado' AND l.criado_em > t.quando),
setores31 AS (
  SELECT s.id, s.empresa_id,
    COALESCE((SELECT valor FROM val v WHERE v.id=s.id AND v.campo='nome'), to_jsonb(s.nome))#>>'{}' AS nome
   FROM public.setores s WHERE s.id NOT IN (SELECT id FROM nasc))
INSERT INTO public.composicao_mes_setor (empresa_id, mes, setor_id, nome)
SELECT s.empresa_id, '2026-08', s.id, s.nome
  FROM setores31 s
 WHERE s.empresa_id IN (SELECT DISTINCT empresa_id FROM public.composicao_mes WHERE mes='2026-08')
ON CONFLICT DO NOTHING;

COMMIT;
