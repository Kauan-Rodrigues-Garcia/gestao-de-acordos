
-- Verificar triggers na tabela acordos
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'acordos'
  AND event_object_schema = 'public'
ORDER BY trigger_name, event_manipulation;

-- Verificar colunas da tabela nr_registros
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'nr_registros'
ORDER BY ordinal_position;
