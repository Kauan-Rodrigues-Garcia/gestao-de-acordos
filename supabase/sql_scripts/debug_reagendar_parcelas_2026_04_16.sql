-- Diagnóstico: acordos PaguePay pagos com grupo
-- Ver numero_parcela vs parcelas para entender quando o botão deve aparecer
SELECT 
  nr_cliente,
  tipo,
  status,
  parcelas,
  numero_parcela,
  acordo_grupo_id,
  CASE 
    WHEN (numero_parcela IS NULL OR numero_parcela = 0) THEN 'numero_parcela nulo/zero'
    WHEN parcelas IS NULL THEN 'parcelas total nulo'
    WHEN numero_parcela < parcelas THEN 'DEVE mostrar Reagendar (parcela atual < total)'
    WHEN numero_parcela >= parcelas THEN 'NÃO mostrar Reagendar (é a última parcela)'
    ELSE 'outro'
  END AS deve_reagendar,
  data_cadastro
FROM acordos
WHERE status = 'pago'
  AND acordo_grupo_id IS NOT NULL
  AND tipo IN ('boleto', 'pix')
ORDER BY data_cadastro DESC
LIMIT 20;
