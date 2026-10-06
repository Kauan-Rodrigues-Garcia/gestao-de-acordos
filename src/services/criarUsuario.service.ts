/**
 * Criar usuário pela administração — lado cliente.
 *
 * Chama /api/criar-usuario, que confere no servidor quem pede (a régua da
 * policy `perfis_admin_insert`) e grava o cargo com a service_role. A tela
 * esconder o botão é conveniência; quem manda é a rota.
 */
import { supabase } from '@/lib/supabase';

export interface NovoUsuario {
  nome: string;
  email: string;
  senha: string;
  perfil: string;
  usuario: string | null;
  setor_id: string | null;
  empresa_id: string;
}

export async function criarUsuario(novo: NovoUsuario): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  let resp: Response;
  try {
    resp = await fetch('/api/criar-usuario', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(novo),
    });
  } catch {
    throw new Error('Endpoint de criação de usuário indisponível. Verifique sua conexão.');
  }
  if (resp.status === 404) {
    throw new Error('Endpoint /api/criar-usuario não encontrado. A rota não subiu no deploy.');
  }
  const corpo = (await resp.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!resp.ok || !corpo.id) {
    throw new Error(corpo.error || `Falha ao criar o usuário (${resp.status}).`);
  }
  return corpo.id;
}
