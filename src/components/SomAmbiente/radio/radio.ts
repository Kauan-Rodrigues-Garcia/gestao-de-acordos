/**
 * radio.ts — a rádio no navegador: o estado do banco, o relógio e a votação.
 *
 * Um só por aba, fora do React, como o `motor.ts`. Quem toca é o motor (ele
 * abre o player do YouTube no ponto certo); daqui sai O QUE tocar e A PARTIR
 * DE ONDE.
 *
 * ## Leve de propósito
 *
 *   - Só liga (lê e assina o tópico `radio:geral`) quando a pessoa entra na
 *     rádio. Fora dela, nada roda.
 *   - O aviso «mudou» traz o estado inteiro: quem ouve não relê o banco a
 *     cada música. Uma mensagem por música, não por voto — a contagem fica
 *     escondida até o sorteio.
 *   - Os timers são os das viradas de fase (abre, fecha, fim), não um relógio
 *     de segundo em segundo.
 *
 * ## Quem vira a música
 *
 * Quem está OUVINDO e chega ao fim chama `fn_radio_avancar`, com um sorteio
 * de até `ESPALHA_MS` para os navegadores não baterem no mesmo instante. O
 * primeiro vira; os demais recebem a rodada que já virou. Pausado não vira:
 * rádio que ninguém ouve fica parada, e quem entra nela a faz sortear.
 */
import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { assinarTabela } from '@/lib/realtime';
import { ehMaisNova, fase, fimMs, lerEstado, proximaVirada, type EstadoRadio, type FaseRadio, type MusicaRadio } from './conta';

export interface InstantaneoRadio {
  /** Assinada e lida (a pessoa está na rádio). */
  ligada: boolean;
  /** Lendo o banco pela primeira vez. */
  carregando: boolean;
  estado: EstadoRadio | null;
  meuVoto: string | null;
  fase: FaseRadio;
  /** Super_admin: liga, desliga, pula, escolhe e mexe na votação. */
  controla: boolean;
  /** O painel pediu a versão larga (a aba Rádio do super_admin). */
  painelLargo: boolean;
  /** Pulando ou votando agora (o botão espera). */
  ocupada: boolean;
  erro: string | null;
}

/** Espalhamento do «virar» entre os navegadores que chegam ao fim. */
export const ESPALHA_MS = 1500;

let snap: InstantaneoRadio = {
  ligada: false, carregando: false, estado: null, meuVoto: null, fase: 'vazia', controla: false, painelLargo: false, ocupada: false, erro: null,
};
const ouvintes = new Set<() => void>();

function publicar(parcial: Partial<InstantaneoRadio>) {
  snap = { ...snap, ...parcial };
  for (const o of ouvintes) {
    try { o(); } catch { /* quem ouve não derruba a rádio */ }
  }
}

function assinar(o: () => void) {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

export function useRadio(): InstantaneoRadio {
  return useSyncExternalStore(assinar, () => snap, () => snap);
}

export const radioAgora = (): InstantaneoRadio => snap;

/** O motor ouve por aqui: a música mudou (ou chegou o primeiro estado). */
const aoMudarMusica = new Set<() => void>();
export function ouvirMusica(fn: () => void): () => void {
  aoMudarMusica.add(fn);
  return () => { aoMudarMusica.delete(fn); };
}

// ── Relógio do banco ─────────────────────────────────────────────────────────

let desvio = 0;
/** Agora, pela hora do banco (ms). */
export const agoraBanco = (): number => Date.now() + desvio;

function ajustarRelogio(agoraIso: unknown, idaEVoltaMs: number) {
  const t = typeof agoraIso === 'string' ? Date.parse(agoraIso) : NaN;
  if (Number.isFinite(t)) desvio = t + idaEVoltaMs / 2 - Date.now();
}

// ── Banco ────────────────────────────────────────────────────────────────────

interface ErroRpc { message: string }
async function rpc(nome: string, args?: Record<string, unknown>): Promise<unknown> {
  const cliente = supabase as unknown as {
    rpc: (n: string, a?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: ErroRpc | null }>;
  };
  const antes = Date.now();
  const { data, error } = await cliente.rpc(nome, args);
  if (error) throw new Error(error.message);
  ajustarRelogio((data as { agora?: unknown } | null)?.agora, Date.now() - antes);
  return data;
}

const TEXTOS: Record<string, string> = {
  NAO_AUTORIZADO: 'A rádio ainda não está liberada para você.',
  RODADA_PASSOU: 'Essa música já acabou.',
  VOTACAO_ENCERRADA: 'A votação já fechou.',
  VOTACAO_FECHADA: 'A votação ainda não abriu.',
  CANDIDATA_INVALIDA: 'Essa música não está na votação.',
  RADIO_DESLIGADA: 'A rádio está desligada. Ligue antes.',
  MUSICA_REPETIDA: 'Essa música já está no ar ou na votação.',
};

/** Erro do banco («CODIGO: texto») → texto para gente. */
export function textoDoErro(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const codigo = /^([A-Z_]+): /.exec(m)?.[1];
  if (codigo && TEXTOS[codigo]) return TEXTOS[codigo];
  if (codigo) return m.slice(codigo.length + 2);
  return /fetch|network|rede/i.test(m) ? 'Sem conexão. Confira a internet.' : 'A rádio não respondeu. Tente de novo.';
}

/** O que `fn_radio_ler` / `fn_radio_avancar` devolvem. */
function aplicarLido(bruto: unknown) {
  const o = bruto as { meu_voto?: unknown; controla?: unknown } | null;
  const novo = lerEstado(bruto);
  if (!novo) return;
  aplicar(novo, typeof o?.meu_voto === 'string' ? o.meu_voto : null);
  publicar({ controla: o?.controla === true });
}

/** Um estado novo (lido ou avisado). `meuVoto` `undefined`: mantém, se a rodada é a mesma. */
function aplicar(novo: EstadoRadio, meuVoto?: string | null) {
  if (!ehMaisNova(novo, snap.estado)) return;
  const antes = snap.estado;
  const mudouMusica = !antes || antes.rodada !== novo.rodada || antes.atual?.video !== novo.atual?.video;
  const voto = meuVoto !== undefined ? meuVoto : (antes?.rodada === novo.rodada ? snap.meuVoto : null);
  publicar({ estado: novo, meuVoto: voto, fase: fase(novo, agoraBanco()), erro: null });
  marcarViradas();
  if (mudouMusica) avisarMotor();
}

function avisarMotor() {
  for (const fn of aoMudarMusica) { try { fn(); } catch { /* ok */ } }
}

// ── Timers das viradas ───────────────────────────────────────────────────────

let timerFase: ReturnType<typeof setTimeout> | null = null;
let timerVirar: ReturnType<typeof setTimeout> | null = null;
let ouvindo = false;

function marcarViradas() {
  if (timerFase) { clearTimeout(timerFase); timerFase = null; }
  if (timerVirar) { clearTimeout(timerVirar); timerVirar = null; }
  if (!snap.ligada) return;
  const e = snap.estado;
  const agora = agoraBanco();
  const f = fase(e, agora);
  if (f !== snap.fase) publicar({ fase: f });

  const prox = proximaVirada(e, agora);
  if (prox !== null) timerFase = setTimeout(marcarViradas, Math.max(50, prox - agora + 30));

  const fim = fimMs(e);
  if (ouvindo && e && fim !== null) {
    timerVirar = setTimeout(() => { timerVirar = null; void virar('fim'); }, Math.max(0, fim - agora) + Math.random() * ESPALHA_MS);
  }
}

let virando = false;
let tentativasFim = 0;

async function virar(motivo: 'fim' | 'pular' | 'erro') {
  const e = snap.estado;
  if (!e || virando) return;
  virando = true;
  if (motivo === 'pular') publicar({ ocupada: true });
  try {
    aplicarLido(await rpc('fn_radio_avancar', { p_rodada: e.rodada, p_motivo: motivo }));
    // O banco achou cedo (relógio do banco diferente do que medimos): tenta de
    // novo daqui a pouco, poucas vezes.
    if (motivo === 'fim' && snap.estado?.rodada === e.rodada && snap.estado.atual && tentativasFim < 3) {
      tentativasFim++;
      setTimeout(() => { if (snap.estado?.rodada === e.rodada) void virar('fim'); }, 2000);
    } else {
      tentativasFim = 0;
    }
  } catch (err) {
    publicar({ erro: textoDoErro(err) });
  } finally {
    virando = false;
    if (motivo === 'pular') publicar({ ocupada: false });
  }
}

// ── Ligar e desligar ─────────────────────────────────────────────────────────

let soltarCanal: (() => void) | null = null;

async function ler() {
  try {
    aplicarLido(await rpc('fn_radio_ler'));
  } catch (err) {
    publicar({ erro: textoDoErro(err) });
  } finally {
    publicar({ carregando: false });
  }
  // O motor esperava a primeira leitura (mesmo que tenha dado erro).
  avisarMotor();
  // Rádio parada (ninguém ouvia, ou nunca tocou): quem está ouvindo a faz sortear.
  const e = snap.estado;
  const fim = fimMs(e);
  if (ouvindo && e?.no_ar && (fim === null || agoraBanco() > fim + 2000)) void virar('fim');
}

/** Entrou na rádio: assina o tópico e lê. Chamar de novo não faz nada. */
export function ligarRadio(): void {
  if (snap.ligada) return;
  publicar({ ligada: true, carregando: true, erro: null });
  soltarCanal = assinarTabela(
    { topico: 'radio:geral', escutas: [{ sinal: 'mudou' }] },
    {
      onSinal: payload => {
        const novo = lerEstado(payload);
        if (novo) aplicar(novo);
      },
      // Avisos do intervalo da queda se perderam: relê.
      onReconectado: () => { void ler(); },
    },
  );
  void ler();
}

/** Saiu da rádio: solta o tópico e os timers. */
export function desligarRadio(): void {
  ouvindo = false;
  soltarCanal?.();
  soltarCanal = null;
  if (timerFase) { clearTimeout(timerFase); timerFase = null; }
  if (timerVirar) { clearTimeout(timerVirar); timerVirar = null; }
  publicar({ ligada: false, carregando: false, fase: 'vazia', erro: null });
}

/**
 * O motor diz se a pessoa está OUVINDO (tocando) ou só com a rádio pausada.
 * Só quem ouve vira a música no fim.
 */
export function definirOuvindo(sim: boolean): void {
  if (ouvindo === sim) return;
  ouvindo = sim;
  marcarViradas();
  // Voltou a ouvir com a música já acabada: vira agora.
  const fim = fimMs(snap.estado);
  if (sim && snap.ligada && snap.estado?.no_ar && !snap.carregando && (fim === null || agoraBanco() > fim + 2000)) void virar('fim');
}

// ── Ações ────────────────────────────────────────────────────────────────────

export async function votar(video: string): Promise<void> {
  const e = snap.estado;
  if (!e || snap.fase !== 'votando') return;
  const antes = snap.meuVoto;
  if (antes === video) return;
  publicar({ meuVoto: video, erro: null });
  try {
    await rpc('fn_radio_votar', { p_rodada: e.rodada, p_video: video });
  } catch (err) {
    if (snap.estado?.rodada === e.rodada) publicar({ meuVoto: antes, erro: textoDoErro(err) });
  }
}

/** Só o super_admin: sorteia a próxima já. */
export function pularRadio(): void {
  if (!snap.controla || snap.ocupada) return;
  void virar('pular');
}

/** O player não conseguiu tocar esta música: tira do catálogo e vira. */
export function falhouNaRadio(): void {
  void virar('erro');
}

/**
 * O vídeo acabou no player. Chega pela mensagem do iframe, que não sofre o
 * freio de timer das abas escondidas (o navegador segura `setTimeout` de aba
 * em segundo plano por até 1 min): é ele que vira a música de quem ouve a
 * rádio com o sistema minimizado.
 */
export function fimNaRadio(): void {
  if (ouvindo) void virar('fim');
}

/** Só o super_admin: tira a música do ar da rádio para sempre e pula. */
export async function tirarDaRadio(): Promise<void> {
  const video = snap.estado?.atual?.video;
  if (!video || !snap.controla || snap.ocupada) return;
  publicar({ ocupada: true });
  try {
    await rpc('fn_radio_musica_tirar', { p_video: video });
  } catch (err) {
    publicar({ ocupada: false, erro: textoDoErro(err) });
    return;
  }
  publicar({ ocupada: false });
  await virar('pular');
}

// ── Controle (super_admin) ───────────────────────────────────────────────────

/** Uma ação do controle: trava o botão, aplica o estado que o banco devolve. */
async function controlar(nome: string, args: Record<string, unknown>): Promise<boolean> {
  if (!snap.controla || snap.ocupada) return false;
  publicar({ ocupada: true, erro: null });
  try {
    aplicarLido(await rpc(nome, args));
    return true;
  } catch (err) {
    publicar({ erro: textoDoErro(err) });
    return false;
  } finally {
    publicar({ ocupada: false });
  }
}

/** Liga (começa já) ou desliga (para para todo mundo) a rádio. */
export function ligarNoAr(sim: boolean): Promise<boolean> {
  return controlar('fn_radio_ligar', { p_ligar: sim });
}

/** Põe uma música do catálogo no ar agora. */
export function tocarNaRadio(video: string): Promise<boolean> {
  return controlar('fn_radio_tocar', { p_video: video });
}

/** Troca a candidata da posição `posicao` (0 a 2). Os votos nela caem. */
export function trocarCandidata(posicao: number, video: string): Promise<boolean> {
  const e = snap.estado;
  if (!e) return Promise.resolve(false);
  return controlar('fn_radio_candidata_trocar', { p_rodada: e.rodada, p_posicao: posicao + 1, p_video: video });
}

/** Sorteia 3 candidatas novas. Os votos da rodada caem. */
export function sortearCandidatas(): Promise<boolean> {
  const e = snap.estado;
  if (!e) return Promise.resolve(false);
  return controlar('fn_radio_candidatas_sortear', { p_rodada: e.rodada });
}

export interface MusicaDoCatalogo extends MusicaRadio {
  tocou_em: string | null;
}

/** Busca no catálogo (título, canal ou estilo). Vazio: as primeiras 40. */
export async function buscarNoCatalogo(termo: string): Promise<MusicaDoCatalogo[]> {
  const r = await rpc('fn_radio_musicas', { p_busca: termo.trim() || null });
  if (!Array.isArray(r)) return [];
  return r.flatMap(x => {
    const m = lerEstado({ rodada: 0, atual: x })?.atual;
    const tocou = (x as { tocou_em?: unknown }).tocou_em;
    return m ? [{ ...m, tocou_em: typeof tocou === 'string' ? tocou : null }] : [];
  });
}

/** A aba Rádio do super_admin pede o painel largo (o botão do header obedece). */
export function definirPainelLargo(sim: boolean): void {
  if (snap.painelLargo !== sim) publicar({ painelLargo: sim });
}

// ── Catálogo (super_admin) ───────────────────────────────────────────────────

export interface EstiloRadio {
  id: number;
  nome: string;
  playlist: string | null;
  ativo: boolean;
  importado_em: string | null;
  musicas: number;
  fora: number;
}

export async function lerCatalogo(): Promise<EstiloRadio[]> {
  const r = await rpc('fn_radio_catalogo') as { estilos?: EstiloRadio[] } | null;
  return Array.isArray(r?.estilos) ? r.estilos : [];
}

export async function salvarEstilo(id: number | null, nome: string, playlist: string | null, ativo: boolean): Promise<number> {
  return await rpc('fn_radio_estilo_salvar', { p_id: id, p_nome: nome, p_playlist: playlist, p_ativo: ativo }) as number;
}

export async function apagarEstilo(id: number): Promise<void> {
  await rpc('fn_radio_estilo_apagar', { p_id: id });
}

export async function importarMusicas(estilo: number, musicas: unknown[]): Promise<{ musicas: number; sairam: number }> {
  return await rpc('fn_radio_importar', { p_estilo: estilo, p_musicas: musicas, p_substituir: true }) as { musicas: number; sairam: number };
}
