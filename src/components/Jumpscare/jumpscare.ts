/**
 * jumpscare.ts — a imagem em tela cheia, para todo mundo, num horário marcado.
 *
 * Uma linha em `jumpscare` (migration 20261023160000). O super_admin envia a
 * imagem e marca a hora em Configurações > Geral; o banco avisa todas as
 * empresas pelo sinal `permissoes` (o mesmo caminho da liberação do
 * Halloween), e cada tela relê e marca o timer para o horário DO BANCO.
 *
 * ## Nunca presa na tela (Cleber, 23/10/2026)
 *
 * «Não pode ser possível bugar a imagem para alguém.» As travas, cada uma
 * independente das outras:
 *
 *   - a duração tem teto (`DURACAO_MAX_MS`), aqui e no CHECK do banco;
 *   - a imagem só entra depois de baixada e decodificada — se não chegou a
 *     tempo, ela não aparece, em vez de aparecer quebrada ou atrasada;
 *   - só dispara dentro da janela (`TOLERANCIA_ATRASO_MS`): quem chega
 *     atrasado, volta para a aba ou acorda o computador depois, não vê;
 *   - cada agendamento dispara uma vez por aba;
 *   - a camada (`JumpscareOverlay`) some por timer, por animação CSS que
 *     termina invisível, e na hora em que a aba é escondida; e não pega clique.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { assinarSinal } from '@/lib/sinais';

export const BUCKET_JUMPSCARE = 'jumpscare';
export const DURACAO_PADRAO_MS = 300;
export const DURACAO_MIN_MS = 100;
export const DURACAO_MAX_MS = 2000;
/** Depois do horário, quanto tempo ainda vale disparar (timer atrasado, aba lenta). */
export const TOLERANCIA_ATRASO_MS = 1500;
/** Quanto antes do horário a imagem começa a baixar (mais um sorteio de até 60 s). */
export const BAIXAR_ANTES_MS = 120_000;

export interface Agendamento {
  imagemPath: string | null;
  /** ISO, ou `null` quando não há nada marcado. */
  disparaEm: string | null;
  duracaoMs: number;
  agendadoPorNome: string | null;
}

/** A duração sempre dentro da faixa, venha o que vier. */
export function duracaoSegura(ms: unknown): number {
  const n = Math.round(Number(ms));
  if (!Number.isFinite(n)) return DURACAO_PADRAO_MS;
  return Math.min(DURACAO_MAX_MS, Math.max(DURACAO_MIN_MS, n));
}

/**
 * O que fazer agora com um horário marcado, pelo relógio do banco:
 * `esperar` (falta `emMs`), `disparar` (dentro da janela) ou `perdido`.
 */
export function momentoDoDisparo(
  disparaEmIso: string | null, agoraServidorMs: number,
): { fase: 'esperar'; emMs: number } | { fase: 'disparar' } | { fase: 'perdido' } {
  if (!disparaEmIso) return { fase: 'perdido' };
  const alvo = new Date(disparaEmIso).getTime();
  if (!Number.isFinite(alvo)) return { fase: 'perdido' };
  const falta = alvo - agoraServidorMs;
  if (falta > 0) return { fase: 'esperar', emMs: falta };
  if (-falta <= TOLERANCIA_ATRASO_MS) return { fase: 'disparar' };
  return { fase: 'perdido' };
}

// ── O estado: um só para o app inteiro ───────────────────────────────────────

let atual: Agendamento | null = null;
/** relógio do banco − relógio local, em ms. */
let desvioMs = 0;
let carregando: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

function avisar() { for (const o of ouvintes) o(); }

type Rpc = (n: string, a?: Record<string, unknown>) => PromiseLike<{
  data: Record<string, unknown> | null; error: { message: string } | null;
}>;
const rpc: Rpc = (n, a) => (supabase.rpc as unknown as Rpc)(n, a);

function aplicar(data: Record<string, unknown> | null, pedidoEm: number): void {
  if (!data) return;
  const agora = new Date(String(data.agora ?? '')).getTime();
  // Meio caminho da ida e volta: a hora do banco é a de quando ele respondeu.
  if (Number.isFinite(agora)) desvioMs = agora - (pedidoEm + (Date.now() - pedidoEm) / 2);
  atual = {
    imagemPath: typeof data.imagem_path === 'string' ? data.imagem_path : null,
    disparaEm: typeof data.dispara_em === 'string' ? data.dispara_em : null,
    duracaoMs: duracaoSegura(data.duracao_ms),
    agendadoPorNome: typeof data.agendado_por_nome === 'string' ? data.agendado_por_nome : null,
  };
  avisar();
}

async function ler(): Promise<void> {
  const pedidoEm = Date.now();
  const { data, error } = await rpc('fn_jumpscare_ler');
  if (error) return; // migration pendente ou fora do ar: sem jumpscare, e nada quebra.
  aplicar(data, pedidoEm);
}

function carregar(forcar = false): Promise<void> {
  if (!carregando || forcar) carregando = ler().catch((): void => undefined);
  return carregando;
}

export function agoraDoServidor(): number {
  return Date.now() + desvioMs;
}

/** O agendamento atual. Escuta o sinal da empresa em que a pessoa está. */
export function useJumpscare(empresaId: string | null | undefined): Agendamento | null {
  const valor = useSyncExternalStore(
    o => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
    () => atual,
  );

  useEffect(() => { void carregar(); }, []);

  useEffect(() => {
    if (!empresaId) return;
    return assinarSinal('permissoes', empresaId, {
      onMudou: s => { if (s.tabela === 'jumpscare') void carregar(true); },
      onReconectado: () => { void carregar(true); },
    });
  }, [empresaId]);

  return valor;
}

/** Baixa a imagem do bucket e devolve um endereço local, já decodificado. */
export async function baixarImagem(path: string): Promise<string | null> {
  // Rede caída não pode virar erro solto: sem imagem, simplesmente não aparece.
  let data: Blob | null = null;
  try {
    const r = await supabase.storage.from(BUCKET_JUMPSCARE).download(path);
    if (r.error) return null;
    data = r.data;
  } catch {
    return null;
  }
  if (!data) return null;
  const url = URL.createObjectURL(data);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return url;
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

// ── O teste: só nesta aba, nada gravado ──────────────────────────────────────

const EVENTO_TESTE = 'jumpscare:teste';

export interface PedidoDeTeste { url: string; duracaoMs: number }

/** Dispara na tela de quem pediu — e só dela. Nada passa pelo banco. */
export function dispararTeste(url: string, duracaoMs: number): void {
  window.dispatchEvent(new CustomEvent<PedidoDeTeste>(EVENTO_TESTE, {
    detail: { url, duracaoMs: duracaoSegura(duracaoMs) },
  }));
}

export function ouvirTeste(f: (p: PedidoDeTeste) => void): () => void {
  const h = (e: Event) => f((e as CustomEvent<PedidoDeTeste>).detail);
  window.addEventListener(EVENTO_TESTE, h);
  return () => window.removeEventListener(EVENTO_TESTE, h);
}

// ── O cartão de Configurações (só o super_admin passa no banco) ──────────────

export async function enviarImagem(arquivo: File): Promise<{ path: string | null; erro: string | null }> {
  const ext = (arquivo.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  // Nome novo a cada envio: o navegador não serve a imagem antiga do cache.
  const path = `${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_JUMPSCARE)
    .upload(path, arquivo, { contentType: arquivo.type, upsert: false });
  if (error) return { path: null, erro: error.message };
  return { path, erro: null };
}

export async function agendarJumpscare(
  imagemPath: string, disparaEm: Date, duracaoMs: number,
): Promise<{ erro: string | null }> {
  const pedidoEm = Date.now();
  const { data, error } = await rpc('fn_jumpscare_agendar', {
    p_imagem_path: imagemPath,
    p_dispara_em: disparaEm.toISOString(),
    p_duracao_ms: duracaoSegura(duracaoMs),
  });
  if (error) return { erro: error.message };
  aplicar(data, pedidoEm);
  return { erro: null };
}

export async function cancelarJumpscare(): Promise<{ erro: string | null }> {
  const pedidoEm = Date.now();
  const { data, error } = await rpc('fn_jumpscare_cancelar');
  if (error) return { erro: error.message };
  aplicar(data, pedidoEm);
  return { erro: null };
}
