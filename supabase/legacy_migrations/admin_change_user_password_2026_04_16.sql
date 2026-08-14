-- ─────────────────────────────────────────────────────────────────────────────
-- admin_change_user_password
--
-- Troca a senha de um usuário via auth.admin.updateUserById do Supabase.
-- Não usa pgcrypto (gen_salt). Usa a função interna extensions.encrypt.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remover versão anterior se existir
DROP FUNCTION IF EXISTS public.admin_change_user_password(uuid, text);

-- Recriar usando auth schema diretamente (sem pgcrypto)
CREATE OR REPLACE FUNCTION public.admin_change_user_password(
  p_user_id    uuid,
  p_new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  encrypted_pw text;
BEGIN
  -- Verifica se quem chama é administrador, lider ou super_admin
  IF NOT EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid()
      AND perfil IN ('administrador', 'super_admin', 'lider')
  ) THEN
    RAISE EXCEPTION 'Permissão negada: apenas administradores podem alterar senhas.';
  END IF;

  -- Criptografar usando a função interna do Supabase (bcrypt via auth schema)
  encrypted_pw := auth.crypt(p_new_password, auth.gen_salt('bf'));

  -- Atualizar diretamente na tabela auth.users
  UPDATE auth.users
  SET
    encrypted_password = encrypted_pw,
    updated_at         = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado: %', p_user_id;
  END IF;
END;
$$;

-- Dar permissão de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.admin_change_user_password(uuid, text) TO authenticated;
