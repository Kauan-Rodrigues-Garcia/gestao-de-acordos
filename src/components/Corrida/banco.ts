/**
 * banco.ts — a Corrida da Sorte do lado do app: o relógio do banco, o estado de
 * cada pessoa (`fn_corrida_minha`), a sala (quem corre e quem assiste) e os
 * avisos em tempo real. A regra mora na migration 20261020130000.
 *
 * Como chega a cada um, sem ninguém ficar perguntando:
 *
 *   - Ao abrir o app: UMA leitura do próprio estado (com cache curto).
 *   - Depois, o tópico pessoal `corrida-eu:<usuario>`: o banco manda o estado
 *     novo da pessoa quando ela entra ou sai de uma corrida, quando a corrida
 *     abre e quando chega um card de divulgação. Quem não foi chamado não
 *     recebe nada — nem fica sabendo que existe corrida.
 *   - Chamado para uma corrida, ouve também `corrida-sala:<id>`: mudou o estado
 *     (gravou, largou, encerrou), alguém entrou no lobby, alguém escolheu.
 *
 * O relógio: toda resposta e todo aviso trazem o `agora` do banco. A diferença
 * para o relógio do computador fica em `desvio`, e `agoraBanco()` é o que o
 * motor usa para saber em que segundo da corrida todo mundo está.
 */
import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { assinarTabela } from '@/lib/realtime';
import { invalidarCache, lerComCache } from '@/lib/cacheCurto';

// ── Tipos (as tabelas não estão em `database.types.ts`) ─────────────────────
export type EstadoCorrida = 'preparando' | 'aberta' | 'correndo' | 'encerrada' | 'cancelada';
/** Bichinhos (a de sempre) ou cavalos (20261022120000; sem a migration, não vem e vale bichinhos). */
export type Categoria = 'bichinhos' | 'cavalos';
export const categoriaDe = (x: { categoria?: Categoria | null } | null | undefined): Categoria => (x?.categoria === 'cavalos' ? 'cavalos' : 'bichinhos');

export interface GravacaoResumo {
  arquivo: string;
  video?: string | null;
  loop?: string | null;
  cues?: Array<[number, string]>;
  dur_video?: number | null;
  mapa: string;
  semente: number;
  faixa: string[];
  /** Corrida de cavalos: o cavalo (0 a 23) de cada raia, na ordem da `faixa`. */
  cavalos?: number[];
  parada: number;
  vencedor: string;
  dur_show?: number;
  dur_corrida?: number;
}

export interface CorridaJson {
  id: number;
  nome: string;
  premio: string | null;
  estado: EstadoCorrida;
  versao: number;
  /** O cenário do lobby (20261020210000; sem a migration, não vem). */
  tema?: 'f1' | 'hipodromo' | 'tv' | 'atual';
  /** Bichinhos ou cavalos (20261022120000). */
  categoria?: Categoria;
  criada_em: string;
  aberta_em: string | null;
  gravada_em: string | null;
  inicia_em: string | null;
  encerrada_em: string | null;
  gravacao: GravacaoResumo | null;
  vencedor: string | null;
  vencedor_nome: string | null;
  corredores: number;
  chamados: number;
  escolheram: number;
  no_lobby: number;
}

export interface PessoaJson {
  usuario: string;
  nome: string;
  setor: string | null;
  foto: string | null;
  corre: boolean;
  assiste: boolean;
  escolha: number | null;
  entrou_em: string | null;
  /** Em quem a pessoa apostou (20261020210000). */
  palpite?: string | null;
  /** Corredor sem perfil no sistema: nome e setor digitados, bichinho sorteado (20261021120000). */
  avulso?: boolean;
}

export interface DivulgacaoJson {
  id: number;
  titulo: string;
  mensagem: string;
  premio: string | null;
  criada_em: string;
  /** O tema do card (20261022120000). */
  categoria?: Categoria;
}

export interface Minha {
  agora: string;
  corrida: CorridaJson | null;
  eu: PessoaJson | null;
  divulgacao: DivulgacaoJson | null;
}

export interface Sala {
  agora: string;
  corrida: CorridaJson;
  pessoas: PessoaJson[];
}

// ── Cliente sem tipo ────────────────────────────────────────────────────────
interface ErroRpc { message: string; code?: string }
export async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const cliente = supabase as unknown as {
    rpc: (n: string, a?: Record<string, unknown>) => PromiseLike<{ data: T; error: ErroRpc | null }>;
  };
  const antes = Date.now();
  const { data, error } = await cliente.rpc(nome, args);
  if (error) throw new Error(error.message);
  const agora = (data as { agora?: string } | null)?.agora;
  if (agora) ajustarRelogio(agora, Date.now() - antes);
  return data;
}

/** Uma mensagem de erro do banco legível para gente («NAO_DA: …» → «…»). */
export function mensagemDoErro(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const i = m.indexOf(': ');
  return /^[A-Z_]+: /.test(m) ? m.slice(i + 2) : m;
}

// ── O relógio do banco ──────────────────────────────────────────────────────
let desvio = 0, melhorIda = Infinity, desvioEm = 0;
/** Acerta o relógio com o `agora` de uma resposta; a medida da ida mais curta vale mais (o atraso da rede pesa menos). */
export function ajustarRelogio(agoraIso: string, idaEVoltaMs = 0): void {
  const agora = Date.parse(agoraIso); if (!Number.isFinite(agora)) return;
  const medida = agora + idaEVoltaMs / 2 - Date.now();
  const velha = Date.now() - desvioEm > 5 * 60_000;
  if (idaEVoltaMs <= melhorIda || velha || Math.abs(medida - desvio) > 5_000) {
    desvio = medida; melhorIda = idaEVoltaMs || melhorIda; desvioEm = Date.now();
  }
}
/** Agora, no relógio do banco, em segundos. */
export const agoraBanco = (): number => (Date.now() + desvio) / 1000;
export const segundos = (iso: string | null | undefined): number | null => (iso ? Date.parse(iso) / 1000 : null);

// ── O estado de cada pessoa (store de módulo) ───────────────────────────────
interface Estado { minha: Minha | null; sala: Sala | null; carregado: boolean }
let estado: Estado = { minha: null, sala: null, carregado: false };
const ouvintes = new Set<() => void>();
function publicar(novo: Partial<Estado>): void {
  estado = { ...estado, ...novo };
  ouvintes.forEach(f => f());
}
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
export function useCorridaMinha(): Estado {
  return useSyncExternalStore(assinar, () => estado, () => estado);
}
export const estadoAtual = (): Estado => estado;

function aceitarMinha(m: Minha | null): void {
  if (!m) return;
  ajustarRelogio(m.agora);
  const sala = estado.sala && m.corrida && estado.sala.corrida.id === m.corrida.id
    ? { ...estado.sala, corrida: m.corrida.versao >= estado.sala.corrida.versao ? m.corrida : estado.sala.corrida }
    : null;
  publicar({ minha: m, sala, carregado: true });
}

/** Um estado da corrida que chegou pela sala: só vale se for mais novo (`versao`). */
function aceitarCorrida(c: CorridaJson | undefined, agora?: string): void {
  if (!c) return;
  if (agora) ajustarRelogio(agora);
  const m = estado.minha;
  const novaMinha = m && m.corrida && m.corrida.id === c.id && c.versao >= m.corrida.versao ? { ...m, corrida: c } : m;
  const s = estado.sala;
  const novaSala = s && s.corrida.id === c.id && c.versao >= s.corrida.versao ? { ...s, corrida: c } : s;
  publicar({ minha: novaMinha, sala: novaSala });
}

const CHAVE_MINHA = 'corrida:minha';
async function lerMinha(forcar = false): Promise<void> {
  if (forcar) invalidarCache(CHAVE_MINHA);
  try {
    aceitarMinha(await lerComCache(CHAVE_MINHA, 20_000, () => rpc<Minha>('fn_corrida_minha')));
  } catch (e) {
    // Sem a migration aplicada (ou fora do ar): a corrida simplesmente não aparece.
    publicar({ carregado: true });
    if (!/fn_corrida_minha|PGRST202|schema cache/.test(String(e))) console.warn('[corrida] não leu o estado', e);
  }
}
/** Relê depois de um intervalo aleatório: 250 telas não perguntam no mesmo segundo. */
function relerEspalhado(maxMs: number): void {
  setTimeout(() => { void lerMinha(true); if (estado.sala) void lerSala(estado.sala.corrida.id); }, Math.random() * maxMs);
}

export async function lerSala(corridaId: number): Promise<Sala | null> {
  try {
    const s = await rpc<Sala>('fn_corrida_sala', { p_corrida: corridaId });
    publicar({ sala: s });
    return s;
  } catch (e) {
    console.warn('[corrida] não leu a sala', e);
    return null;
  }
}

/** Entra no lobby (marca a entrada e lê a sala inteira). */
export async function entrarNoLobby(corridaId: number): Promise<Sala> {
  const s = await rpc<Sala>('fn_corrida_entrar', { p_corrida: corridaId });
  publicar({ sala: s });
  return s;
}

export async function escolherBichinho(corridaId: number, escolha: number): Promise<void> {
  aceitarMinha(await rpc<Minha>('fn_corrida_escolher', { p_corrida: corridaId, p_escolha: escolha }));
}

export async function fecharDivulgacao(id: number): Promise<void> {
  aceitarMinha(await rpc<Minha>('fn_corrida_divulgacao_fechar', { p_divulgacao: id }));
}

/** A conferência de 30 s: quem entrou no lobby e o aviso não trouxe. */
export async function conferirLobby(corridaId: number): Promise<void> {
  const s = estado.sala; if (!s || s.corrida.id !== corridaId) return;
  const desde = s.pessoas.reduce<string | null>((m, p) => (p.entrou_em && (!m || p.entrou_em > m) ? p.entrou_em : m), null);
  try {
    const r = await rpc<{ agora: string; entraram: Array<{ usuario: string; entrou_em: string }> }>('fn_corrida_lobby', { p_corrida: corridaId, p_desde: desde });
    aplicarEntradas(corridaId, r.entraram);
  } catch { /* a próxima conferência tenta de novo */ }
}

function aplicarEntradas(corridaId: number, entraram: Array<{ usuario: string; entrou_em: string }> | undefined): void {
  const s = estado.sala; if (!s || s.corrida.id !== corridaId || !entraram?.length) return;
  const quando = new Map(entraram.map(e => [e.usuario, e.entrou_em]));
  let mudou = false;
  const pessoas = s.pessoas.map(p => {
    const q = quando.get(p.usuario);
    if (q && !p.entrou_em) { mudou = true; return { ...p, entrou_em: q }; }
    return p;
  });
  if (mudou) publicar({ sala: { ...s, pessoas } });
}

function aplicarPalpite(corridaId: number, usuario: string, palpite: string | null): void {
  const s = estado.sala; if (!s || s.corrida.id !== corridaId) return;
  publicar({ sala: { ...s, pessoas: s.pessoas.map(p => (p.usuario === usuario ? { ...p, palpite } : p)) } });
}

/** O palpite: aparece na hora na própria tela; o banco avisa os outros. */
export async function palpitar(corridaId: number, usuario: string, alvo: string): Promise<void> {
  const antes = estado.sala?.pessoas.find(p => p.usuario === usuario)?.palpite ?? null;
  aplicarPalpite(corridaId, usuario, alvo);
  try {
    const r = await rpc<{ palpite: string | null }>('fn_corrida_palpitar', { p_corrida: corridaId, p_alvo: alvo });
    aplicarPalpite(corridaId, usuario, r.palpite);
  } catch (e) {
    aplicarPalpite(corridaId, usuario, antes);
    throw e;
  }
}

function aplicarEscolha(corridaId: number, usuario: string, escolha: number): void {
  const s = estado.sala; if (!s || s.corrida.id !== corridaId) return;
  publicar({ sala: { ...s, pessoas: s.pessoas.map(p => (p.usuario === usuario ? { ...p, escolha } : p)) } });
}

// ── Os avisos ───────────────────────────────────────────────────────────────
let canalEu: (() => void) | null = null, canalSala: (() => void) | null = null, salaOuvida = 0, usuarioAtual: string | null = null;

/** Liga a corrida para o usuário logado. Devolve a função que desliga. */
export function ligarCorrida(usuario: string): () => void {
  if (usuarioAtual !== usuario) {
    usuarioAtual = usuario;
    estado = { minha: null, sala: null, carregado: false };
  }
  void lerMinha();
  canalEu?.();
  canalEu = assinarTabela(
    { topico: `corrida-eu:${usuario}`, escutas: [{ sinal: 'corrida' }] },
    {
      onSinal: payload => aceitarMinha(payload as unknown as Minha),
      onReconectado: () => relerEspalhado(8_000),
    },
  );
  const tirarSala = assinar(() => ouvirSala());
  ouvirSala();
  return () => {
    tirarSala();
    canalEu?.(); canalEu = null;
    canalSala?.(); canalSala = null; salaOuvida = 0;
  };
}

function ouvirSala(): void {
  const id = estado.minha?.corrida?.id ?? 0;
  if (id === salaOuvida) return;
  canalSala?.(); canalSala = null; salaOuvida = id;
  if (id) canalSala = assinarSala(id);
}

/** Ouve a sala de uma corrida (o super_admin assistindo sem ter sido chamado também). Devolve a função que desliga. */
export function assinarSala(id: number): () => void {
  return assinarTabela(
    { topico: `corrida-sala:${id}`, escutas: [{ sinal: 'estado' }, { sinal: 'lobby' }, { sinal: 'escolha' }, { sinal: 'pessoas' }, { sinal: 'palpite' }] },
    {
      onSinal: (payload, sinal) => {
        const p = payload as { agora?: string; corrida?: CorridaJson; entraram?: Array<{ usuario: string; entrou_em: string }>; usuario?: string; escolha?: number; palpite?: string | null };
        if (p.agora) ajustarRelogio(p.agora);
        if (sinal === 'lobby') { aplicarEntradas(id, p.entraram); return; }
        if (sinal === 'palpite') { if (p.usuario) aplicarPalpite(id, p.usuario, p.palpite ?? null); return; }
        aceitarCorrida(p.corrida, p.agora);
        if (sinal === 'escolha' && p.usuario != null && p.escolha != null) aplicarEscolha(id, p.usuario, p.escolha);
        // Mudou quem corre ou quem assiste: o papel de cada um pode ter mudado.
        if (sinal === 'pessoas') relerEspalhado(5_000);
        // Gravou: a sala passa a ter a gravação (relê para pegar as escolhas fechadas).
        if (sinal === 'estado' && estado.sala && p.corrida?.gravada_em && !estado.sala.corrida.gravada_em) setTimeout(() => { void lerSala(id); }, Math.random() * 4_000);
      },
      onReconectado: () => relerEspalhado(8_000),
    },
  );
}

// ── Os arquivos da gravação ─────────────────────────────────────────────────
export const BUCKET = 'corridas';
export async function baixarArquivo(caminho: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
  if (error || !data) throw new Error(error?.message ?? 'não baixou');
  return data;
}
