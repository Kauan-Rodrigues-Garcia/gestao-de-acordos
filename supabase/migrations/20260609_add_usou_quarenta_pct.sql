-- Armazena se o acordo parcelado usou a regra dos 40% na primeira parcela.
-- Substitui a detecção heurística via foiUsadoQuarentaPct() que falha quando
-- o valor da parcela é editado manualmente ou arredondado diferente do esperado.
ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS usou_quarenta_pct BOOLEAN NOT NULL DEFAULT FALSE;
