-- ============================================================
-- Migration 15: Fix username lookup via SECURITY DEFINER RPC
-- ============================================================
-- Problema: A query direta à tabela `perfis` para buscar email por username
-- falha com 400 (Bad Request) porque a RLS exige auth.uid(), mas o usuário
-- ainda não está autenticado no momento do login.
--
-- Solução: Função RPC com SECURITY DEFINER que executa fora das políticas
-- de RLS e pode ser chamada por usuários anônimos (antes do login).
--
-- NOTA IMPORTANTE (configuração manual obrigatória no Supabase Dashboard):
-- Para que o login com emails fictícios (@interno.sistema) funcione sem
-- exigir confirmação de email, desabilite a confirmação de email em:
-- Authentication > Providers > Email > Confirm email = OFF
-- ============================================================

-- Normalizar usernames existentes para lowercase (garante consistência)
UPDATE public.perfis
SET usuario = lower(btrim(usuario))
WHERE usuario IS NOT NULL
  AND usuario <> lower(btrim(usuario));

-- Função RPC pública para buscar email por username (usada no login, antes de autenticar)
CREATE OR REPLACE FUNCTION public.buscar_email_por_usuario(p_usuario TEXT)
RETURNS TEXT AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email
  FROM public.perfis
  WHERE usuario = lower(btrim(p_usuario))
    AND ativo = true
  LIMIT 1;

  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permitir que a anon key execute a função (necessário para login pré-autenticação)
GRANT EXECUTE ON FUNCTION public.buscar_email_por_usuario(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.buscar_email_por_usuario(TEXT) TO authenticated;
