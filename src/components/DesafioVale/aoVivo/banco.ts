/**
 * O sorteio ao vivo do Desafio do Vale do lado do app (26/11/2026). A regra
 * mora na migration 20261126150000.
 *
 * Como chega a cada um:
 *   - ao abrir o app, UMA leitura (`fn_vale_show_meu`): o sorteio em que a
 *     pessoa está na plateia, se houver — é o que segura o recarregar no meio;
 *   - depois, o sinal «vale» do tópico pessoal `corrida-eu:<usuario>` (o
 *     mesmo da Corrida da Sorte, `ouvirSinalVale`): abriu, começou, revelou,
 *     encerrou. Quem não está na plateia não recebe nada.
 *
 * O ganhador só existe depois de `revela_em`. Quem pede a revelação: o
 * super_admin, no segundo em que a contagem acaba; se o aviso não chegar
 * (a tela dele fechou), cada tela pede sozinha, espalhada em alguns segundos.
 */
import { useSyncExternalStore } from 'react';
import { agoraBanco, ajustarRelogio, mensagemDoErro, ouvirSinalVale, rpc } from '@/components/Corrida/banco';
import type { ShowJson } from './linhaDoTempo';

interface Resposta { agora?: string; show?: ShowJson | null }
interface Estado { show: ShowJson | null; carregado: boolean }

let estado: Estado = { show: null, carregado: false };
const ouvintes = new Set<() => void>();
function publicar(novo: Partial<Estado>): void {
  estado = { ...estado, ...novo };
  ouvintes.forEach(f => f());
}
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
export function useSorteioAoVivo(): Estado {
  return useSyncExternalStore(assinar, () => estado, () => estado);
}

const ORDEM: Record<ShowJson['estado'], number> = { aberto: 0, contagem: 1, revelado: 2, encerrado: 3, cancelado: 3 };

/** Um estado novo só vale se não andar para trás (aviso atrasado não desfaz a revelação). */
function aceitar(r: Resposta | null | undefined, daLeitura = false): void {
  if (!r) return;
  if (r.agora) ajustarRelogio(r.agora);
  const novo = r.show ?? null;
  const atual = estado.show;
  if (!novo) {
    // A leitura diz «nenhum no ar»: só apaga se não for um aviso mais novo que ela.
    if (daLeitura) publicar({ show: null, carregado: true });
    return;
  }
  if (atual && novo.id < atual.id) return;
  if (atual && novo.id === atual.id && ORDEM[novo.estado] < ORDEM[atual.estado]) return;
  publicar({ show: novo, carregado: true });
}

let lendo = false;
async function lerMeu(): Promise<void> {
  if (lendo) return;
  lendo = true;
  try {
    aceitar(await rpc<Resposta>('fn_vale_show_meu'), true);
  } catch (e) {
    // Sem a migration aplicada: o sorteio ao vivo simplesmente não aparece.
    publicar({ carregado: true });
    if (!/fn_vale_show_meu|PGRST202|schema cache/.test(String(e))) console.warn('[sorteio ao vivo] não leu', e);
  } finally {
    lendo = false;
  }
}

let usuarioLigado: string | null = null;
/** Liga o sorteio ao vivo para o usuário logado. Devolve a função que desliga. */
export function ligarSorteioAoVivo(usuario: string): () => void {
  if (usuarioLigado !== usuario) { usuarioLigado = usuario; estado = { show: null, carregado: false }; }
  void lerMeu();
  return ouvirSinalVale(payload => {
    if (payload) { aceitar(payload as Resposta); return; }
    // O canal voltou de uma queda: relê, espalhado (a plateia inteira volta junto).
    setTimeout(() => { void lerMeu(); }, Math.random() * 4_000);
  });
}

// ── A revelação ─────────────────────────────────────────────────────────────

let revelando: number | null = null;
/**
 * Pede o resultado quando a contagem acaba. `primeiro` = o super_admin (pede
 * na hora); os outros esperam o aviso e só pedem se ele não vier.
 */
export function vigiarRevelacao(show: ShowJson, primeiro: boolean): () => void {
  if (show.estado !== 'contagem' || !show.revela_em) return () => {};
  const revela = Date.parse(show.revela_em) / 1000;
  const espera = primeiro ? 0.08 : 2.5 + Math.random() * 3;
  let parar = false;
  let timer: number | undefined;
  const tentar = async () => {
    if (parar) return;
    const atual = estado.show;
    if (!atual || atual.id !== show.id || atual.estado !== 'contagem') return;
    if (revelando === show.id) { timer = window.setTimeout(tentar, 1_000); return; }
    revelando = show.id;
    try {
      aceitar(await rpc<Resposta>('fn_vale_show_revelar', { p_show: show.id }));
    } catch (e) {
      // AINDA_NAO (relógio adiantado) ou rede: tenta de novo daqui a pouco.
      if (!/AINDA_NAO/.test(String(e))) console.warn('[sorteio ao vivo] revelar', mensagemDoErro(e));
    } finally {
      revelando = null;
    }
    if (!parar && estado.show?.id === show.id && estado.show.estado === 'contagem') {
      timer = window.setTimeout(tentar, primeiro ? 600 : 2_000 + Math.random() * 2_000);
    }
  };
  timer = window.setTimeout(tentar, Math.max(0, (revela + espera - agoraBanco()) * 1000));
  return () => { parar = true; window.clearTimeout(timer); };
}

// ── O super_admin ───────────────────────────────────────────────────────────

export async function abrirSorteio(args: { setorId: string; plateia: string[]; extras: string[]; refazer: boolean }): Promise<ShowJson> {
  const r = await rpc<Resposta>('fn_vale_show_abrir', {
    p_setor: args.setorId, p_plateia: args.plateia, p_extras: args.extras, p_refazer: args.refazer,
  });
  aceitar(r);
  return r.show!;
}

export async function comecarSorteio(id: number): Promise<void> {
  aceitar(await rpc<Resposta>('fn_vale_show_comecar', { p_show: id }));
}

export async function encerrarSorteio(id: number): Promise<void> {
  aceitar(await rpc<Resposta>('fn_vale_show_encerrar', { p_show: id }));
}

export { mensagemDoErro };
