/**
 * Redefinição de senha pelo admin — lado cliente.
 *
 * Chama /api/alterar-senha, que valida o cargo no servidor via service_role.
 * A validação da UI (esconder o campo) é só conveniência; quem manda é a rota.
 */
import { supabase } from '@/lib/supabase';

export const MIN_SENHA = 6;

/**
 * Redefine a senha de outro usuário. Ao concluir, o botão de chave volta a
 * aparecer para ele definir uma senha própria (perfis.senha_alterada = false).
 */
export async function redefinirSenhaDeUsuario(
  alvoUserId: string,
  novaSenha: string,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  let resp: Response;
  try {
    resp = await fetch('/api/alterar-senha', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ alvoUserId, novaSenha }),
    });
  } catch {
    throw new Error('Endpoint de troca de senha indisponível. Verifique sua conexão.');
  }
  if (resp.status === 404) {
    // No dev, o plugin vite-plugins/dev-api.ts serve /api dentro do próprio
    // `npm run dev` — um 404 aqui significa que a rota não subiu no deploy.
    throw new Error('Endpoint /api/alterar-senha não encontrado. A rota não subiu no deploy.');
  }
  if (!resp.ok) {
    const { error } = await resp.json().catch(() => ({ error: `Erro ${resp.status}` }));
    throw new Error(error || `Falha ao redefinir a senha (${resp.status}).`);
  }
}
