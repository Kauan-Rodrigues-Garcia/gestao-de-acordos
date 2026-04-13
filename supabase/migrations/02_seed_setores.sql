-- ================================================
-- SEED: Setores Iniciais — AcordosPRO
-- ================================================
-- Execute este SQL no Supabase Dashboard:
-- Supabase → SQL Editor → New query → Cole este conteúdo → Run
-- ================================================

-- 1. Criar função de seed com SECURITY DEFINER (bypassa RLS)
CREATE OR REPLACE FUNCTION public.fn_seed_setores_iniciais()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setores TEXT[] := ARRAY[
    'Em dia', 'Play 1', 'Play 2', 'Play 3',
    'Play 4', 'Play 5', 'Play 6'
  ];
  v_nome      TEXT;
  v_inseridos INT := 0;
  v_existentes INT := 0;
BEGIN
  FOREACH v_nome IN ARRAY v_setores LOOP
    IF NOT EXISTS (SELECT 1 FROM public.setores WHERE nome = v_nome) THEN
      INSERT INTO public.setores (nome, descricao, ativo)
      VALUES (v_nome, 'Setor ' || v_nome, true);
      v_inseridos := v_inseridos + 1;
    ELSE
      v_existentes := v_existentes + 1;
    END IF;
  END LOOP;
  RETURN format('Inseridos: %s | Já existentes: %s', v_inseridos, v_existentes);
END;
$$;

-- 2. Permissões
GRANT EXECUTE ON FUNCTION public.fn_seed_setores_iniciais() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seed_setores_iniciais() TO anon;

-- 3. Executar o seed
SELECT public.fn_seed_setores_iniciais() AS resultado;

-- 4. Verificar resultado
SELECT id, nome, descricao, ativo, criado_em
FROM public.setores
ORDER BY nome;
