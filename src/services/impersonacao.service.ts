/**
 * Impersonação de usuário (login real) — lado cliente.
 *
 * Fluxo:
 *  - iniciarImpersonacao: salva a sessão do super_admin, pede um token do alvo
 *    ao /api/impersonar-usuario (que valida super_admin no servidor) e troca a
 *    sessão do navegador para a do alvo via verifyOtp.
 *  - sairImpersonacao: restaura a sessão salva do super_admin.
 *
 * A sessão do admin fica guardada no localStorage para sobreviver a reloads —
 * assim a faixa "Você está como X" e o botão Sair continuam funcionando.
 */
import { supabase } from '@/lib/supabase';

const K_ADMIN = 'impersonacao:admin';
const K_ATIVA = 'impersonacao:ativa';

interface SessaoAdminSalva {
  access_token: string;
  refresh_token: string;
  adminId: string;
  adminNome: string;
}

export interface ImpersonacaoAtiva {
  alvoId: string;
  alvoNome: string;
  adminId: string;
  adminNome: string;
  inicio: string;
}

export function getImpersonacaoAtiva(): ImpersonacaoAtiva | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(K_ATIVA);
    return raw ? (JSON.parse(raw) as ImpersonacaoAtiva) : null;
  } catch {
    return null;
  }
}

/** Evento disparado quando a impersonação começa/termina (para a faixa reagir). */
export const IMPERSONACAO_EVENT = 'impersonacao:mudou';
function notificar() {
  window.dispatchEvent(new Event(IMPERSONACAO_EVENT));
}

/**
 * Entra como o usuário-alvo. Recarrega a página ao final para o app montar
 * já com a sessão do alvo.
 */
export async function iniciarImpersonacao(
  alvoUserId: string,
  adminId: string,
  adminNome: string,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || !session.refresh_token) {
    throw new Error('Sessão do administrador não encontrada. Faça login novamente.');
  }

  // 1) Guarda a sessão do admin para poder voltar
  const salva: SessaoAdminSalva = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    adminId,
    adminNome,
  };

  // 2) Pede o token do alvo (o servidor valida que sou super_admin)
  let resp: Response;
  try {
    resp = await fetch('/api/impersonar-usuario', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ alvoUserId }),
    });
  } catch {
    // Em dev o /api é servido pelo plugin vite-plugins/dev-api.ts (npm run dev).
    throw new Error('Endpoint de impersonação indisponível. Verifique a conexão e tente novamente.');
  }
  if (resp.status === 404) {
    throw new Error('Endpoint /api/impersonar-usuario não está sendo servido neste ambiente.');
  }
  if (!resp.ok) {
    const { error } = await resp.json().catch(() => ({ error: `Erro ${resp.status}` }));
    throw new Error(error || `Falha ao impersonar (${resp.status}).`);
  }
  const { token_hash, alvo } = (await resp.json()) as {
    token_hash: string;
    alvo: { id: string; nome: string };
  };

  // 3) Troca a sessão do navegador para a do alvo
  const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' });
  if (error) {
    throw new Error(`Não foi possível assumir a sessão do usuário: ${error.message}`);
  }

  // 4) Persiste estado e recarrega
  localStorage.setItem(K_ADMIN, JSON.stringify(salva));
  const ativa: ImpersonacaoAtiva = {
    alvoId: alvo.id,
    alvoNome: alvo.nome || 'usuário',
    adminId,
    adminNome,
    inicio: new Date().toISOString(),
  };
  localStorage.setItem(K_ATIVA, JSON.stringify(ativa));
  notificar();
  window.location.reload();
}

/** Volta a ser o super_admin. Recarrega ao final. */
export async function sairImpersonacao(): Promise<void> {
  const raw = typeof window !== 'undefined' ? localStorage.getItem(K_ADMIN) : null;
  const ativa = getImpersonacaoAtiva();
  localStorage.removeItem(K_ATIVA);
  localStorage.removeItem(K_ADMIN);

  if (!raw) {
    // Sem sessão salva — melhor deslogar do que ficar preso como o alvo.
    await supabase.auth.signOut();
    notificar();
    window.location.reload();
    return;
  }

  const salva = JSON.parse(raw) as SessaoAdminSalva;
  const { error } = await supabase.auth.setSession({
    access_token: salva.access_token,
    refresh_token: salva.refresh_token,
  });

  // Auditoria de encerramento (já de volta como admin; best-effort)
  if (!error && ativa) {
    try {
      // NOTA: logs_sistema.empresa_id é NOT NULL no banco e não é preenchido aqui
      // (ImpersonacaoAtiva/SessaoAdminSalva não carregam empresa_id) — o insert já
      // falhava silenciosamente (catch abaixo), pré-existente a este fix de tipos.
      await supabase.from('logs_sistema').insert({
        usuario_id: salva.adminId,
        acao: 'impersonar_fim',
        tabela: 'auth.users',
        registro_id: ativa.alvoId,
        detalhes: { alvo_nome: ativa.alvoNome, inicio: ativa.inicio, fim: new Date().toISOString() },
      } as never);
    } catch {/* segue */}
  }

  notificar();
  if (error) {
    // Não conseguiu restaurar — desloga para não ficar preso como o alvo.
    await supabase.auth.signOut();
  }
  window.location.reload();
}
