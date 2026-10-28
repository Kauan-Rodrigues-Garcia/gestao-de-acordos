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
import { registrarLog } from '@/services/logs.service';

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
  /** A tela do super admin quando entrou, para voltar a ela ao sair. */
  voltarPara?: string;
}

/** O app do celular mora em `#/m`: lá a impersonação continua no app. */
function ehAppDoCelular(hash: string): boolean {
  return /^#\/m(?:[/?]|$)/.test(hash);
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

  // 3) Guarda a volta ANTES de trocar a sessão. Gravada depois, uma aba que
  // fechasse no meio deixava o super admin preso na conta do alvo, sem faixa
  // e sem caminho de volta.
  localStorage.setItem(K_ADMIN, JSON.stringify(salva));

  // 4) Troca a sessão do navegador para a do alvo
  const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' });
  if (error) {
    localStorage.removeItem(K_ADMIN);
    throw new Error(`Não foi possível assumir a sessão do usuário: ${error.message}`);
  }

  // 5) Persiste estado e recarrega. Fora do app do celular, a pessoa começa no
  // início dela: a tela de onde o super admin saiu (Usuários) não é dela.
  const voltarPara = window.location.hash;
  const ativa: ImpersonacaoAtiva = {
    alvoId: alvo.id,
    alvoNome: alvo.nome || 'usuário',
    adminId,
    adminNome,
    inicio: new Date().toISOString(),
    voltarPara,
  };
  localStorage.setItem(K_ATIVA, JSON.stringify(ativa));
  notificar();
  if (!ehAppDoCelular(voltarPara)) window.location.hash = '#/';
  window.location.reload();
}

/**
 * Encerra no servidor a sessão que a impersonação abriu (28/10/2026).
 *
 * Só sair do navegador deixava a sessão do alvo viva no Supabase, com um
 * refresh token que valia por semanas. `scope=local` encerra SÓ esta sessão:
 * as da pessoa, no celular e no computador dela, seguem como estavam. Vai
 * direto à API, e não por `supabase.auth.signOut`, para o app não receber um
 * SIGNED_OUT no meio da volta. Nunca lança: a volta não depende disto.
 */
async function encerrarSessaoDoAlvo(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!session?.access_token || !url || !chave) return;
    await fetch(`${url.replace(/\/$/, '')}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: chave, Authorization: `Bearer ${session.access_token}` },
    });
  } catch { /* a sessão expira sozinha */ }
}

/**
 * As outras abas acompanham a troca de conta (28/10/2026).
 *
 * A sessão do Supabase é uma só para o navegador: entrar como alguém numa aba
 * troca o token das outras também, mas elas seguiam desenhadas como o super
 * admin, gravando com a mão do alvo. Quem muda a impersonação em outra aba
 * recarrega esta. Devolve a função que desliga a escuta.
 */
export function vigiarImpersonacaoEntreAbas(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const aoMudar = (e: StorageEvent) => {
    if (e.key === K_ATIVA && e.oldValue !== e.newValue) window.location.reload();
  };
  window.addEventListener('storage', aoMudar);
  return () => window.removeEventListener('storage', aoMudar);
}

/** Volta a ser o super_admin. Recarrega ao final. */
export async function sairImpersonacao(): Promise<void> {
  const raw = typeof window !== 'undefined' ? localStorage.getItem(K_ADMIN) : null;
  const ativa = getImpersonacaoAtiva();
  localStorage.removeItem(K_ATIVA);
  localStorage.removeItem(K_ADMIN);

  // Antes de trocar de volta: depois do `setSession` o token na mão já é o do
  // super admin.
  await encerrarSessaoDoAlvo();

  if (!raw) {
    // Sem sessão salva — melhor deslogar do que ficar preso como o alvo.
    // `local`: o padrão (global) derrubaria a pessoa em todos os aparelhos.
    await supabase.auth.signOut({ scope: 'local' }).catch((): void => undefined);
    notificar();
    window.location.reload();
    return;
  }

  const salva = JSON.parse(raw) as SessaoAdminSalva;
  const { error } = await supabase.auth.setSession({
    access_token: salva.access_token,
    refresh_token: salva.refresh_token,
  });

  // Auditoria de encerramento (já de volta como admin; best-effort).
  //
  // Este log NUNCA existiu: `logs_sistema.empresa_id` é NOT NULL desde
  // 11_tenant_lockdown, o insert não preenchia a coluna (nem
  // `ImpersonacaoAtiva` nem `SessaoAdminSalva` carregam a empresa) e o erro
  // morria no `catch` abaixo. Ou seja: a trilha registrava o INÍCIO de cada
  // impersonação e nunca o fim — pela leitura dela, todo administrador que já
  // usou "entrar como" ainda estaria dentro da conta de alguém.
  //
  // `fn_log_registrar` resolve a empresa a partir do perfil de quem chama, e a
  // sessão do admin já foi restaurada acima — por isso o registro agora completa.
  if (!error && ativa) {
    const fim = new Date().toISOString();
    await registrarLog({
      acao: 'impersonar_fim',
      categoria: 'seguranca',
      severidade: 'critico',
      descricao: `Saiu do modo "entrar como" de ${ativa.alvoNome}`,
      tabela: 'auth.users',
      registroId: ativa.alvoId,
      alvoTipo: 'usuario',
      alvoRotulo: ativa.alvoNome,
      detalhes: {
        alvo_nome: ativa.alvoNome,
        inicio: ativa.inicio,
        fim,
        duracao_segundos: Math.max(
          0,
          Math.round((new Date(fim).getTime() - new Date(ativa.inicio).getTime()) / 1000),
        ),
      },
      usuarioId: salva.adminId,
    });
  }

  notificar();
  if (error) {
    // Não conseguiu restaurar — desloga para não ficar preso como o alvo. A
    // sessão do alvo já foi encerrada acima; `local` só limpa este navegador.
    await supabase.auth.signOut({ scope: 'local' }).catch((): void => undefined);
  }
  // De volta à tela onde o super admin estava quando entrou.
  if (!error && ativa?.voltarPara) window.location.hash = ativa.voltarPara;
  window.location.reload();
}
