
-- Contagem de registros por tabela
SELECT 'nr_registros' AS tabela, COUNT(*) AS total FROM public.nr_registros
UNION ALL
SELECT 'acordos',        COUNT(*) FROM public.acordos
UNION ALL
SELECT 'lixeira_acordos', COUNT(*) FROM public.lixeira_acordos;
