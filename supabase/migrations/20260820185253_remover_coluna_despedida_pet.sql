-- O componente de despedida e todo o runtime do antigo PET foram removidos.
-- A coluna guardava apenas se aquele aviso ja tinha sido dispensado e nao e
-- consumida por nenhuma outra regra do produto.
ALTER TABLE public.perfis
  DROP COLUMN IF EXISTS pet_despedida;
