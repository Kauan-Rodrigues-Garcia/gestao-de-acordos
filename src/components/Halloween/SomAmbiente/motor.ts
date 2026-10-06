/**
 * motor.ts — quem toca o Som ambiente.
 *
 * Um só por aba, fora do React: trocar de página remonta o `Layout`, e a música
 * não pode parar por isso. O botão e o painel só leem o estado (`useSomAmbiente`)
 * e chamam as ações daqui.
 *
 * ## Duas fontes
 *
 *   - FÁBRICA: os seis temas de terror e as duas músicas (`preferencias.ts`),
 *     em `public/sounds/` junto da trilha da mensagem de outubro. Tocam
 *     em sequência, como playlist (ou repetem uma, com «Repetir»), num
 *     `<audio>`. O volume é nosso, de 0 a 100.
 *   - PLAYLIST da pessoa (Spotify ou YouTube): o player oficial da plataforma,
 *     num iframe que mora no «palco» (`div` no `body`, também fora do React).
 *     Com o painel aberto, o palco se encaixa no espaço que o painel reserva;
 *     fechado, sai da tela e continua tocando. Mover o iframe no DOM o
 *     recarregaria — por isso ele nunca muda de pai.
 *
 * ## O que o navegador não deixa
 *
 * Som antes do primeiro clique da pessoa na página. Com «Tocar ao entrar»
 * ligado e um F5, o motor fica `aguardando` e começa no primeiro toque ou
 * tecla. O Spotify ainda pede o play no próprio player na primeira vez — o
 * clique no nosso botão não atravessa o iframe — e não aceita volume de fora.
 *
 * ## Dois jeitos de usar
 *
 * O super_admin tem o player inteiro. Os demais cargos, a versão enxuta: só
 * as faixas de fábrica (sem «Minhas playlists») e volume de 0 a
 * `VOLUME_MAX_ENXUTO`. A regra mora AQUI, não só no painel: a playlist que
 * ficou salva no navegador, ou um volume gravado acima do teto, não tocam.
 *
 * ## Quem mais fala
 *
 * A mensagem de outubro (Halloween) tem trilha própria: enquanto ela está
 * aberta, `silenciar('halloween')` pausa o som ambiente, e ele volta sozinho
 * quando ela fecha.
 */
import { useSyncExternalStore } from 'react';
import { enderecoYoutube, uriSpotify, type LinkExterno } from './links';
import {
  ARQUIVOS, FAIXAS_DA_SEQUENCIA, GANHO, PADRAO, ehEmbutida, esquecerPosicao, gravarPosicao, gravarPreferencias,
  lerPosicao, lerPreferencias, linkDaPlaylist,
  type FaixaEmbutida, type PreferenciasSom,
} from './preferencias';

export type EstadoSom =
  | 'parado'
  /** Baixando a música ou abrindo o player. */
  | 'carregando'
  /** Pronto, esperando o primeiro gesto da pessoa na página. */
  | 'aguardando'
  | 'tocando'
  | 'pausado'
  | 'erro';

export interface InstantaneoSom {
  estado: EstadoSom;
  prefs: PreferenciasSom;
  /** Alguém (a mensagem de outubro) pediu silêncio. */
  silenciado: boolean;
  /** A faixa que está de fato no ar — pode ser diferente de `prefs.faixa` por um instante. */
  noAr: string | null;
  /** O player do Spotify/YouTube já está montado no palco. */
  playerAberto: boolean;
  /** Player inteiro (super_admin) ou a versão enxuta. */
  completo: boolean;
  /** Teto do volume para esta pessoa: 100 no completo, `VOLUME_MAX_ENXUTO` no enxuto. */
  volumeMax: number;
  erro: string | null;
  /** De quem é a sessão do som (o modo Batman grava por pessoa). */
  perfil: string | null;
}

/** Teto de volume de quem não é super_admin. */
export const VOLUME_MAX_ENXUTO = 50;

/** Curva de volume: o controle anda em passos que o ouvido percebe iguais. */
export function ganhoDoVolume(volume: number): number {
  const v = Math.min(100, Math.max(0, volume)) / 100;
  return v <= 0 ? 0 : Math.pow(v, 1.5);
}

/**
 * A ordem do anterior/próxima: as de fábrica da sequência e depois as
 * playlists (só no completo). O tema especial não entra — só toca escolhido.
 */
export function ordemDasFaixas(prefs: PreferenciasSom, comPlaylists = true): string[] {
  return [...FAIXAS_DA_SEQUENCIA, ...(comPlaylists ? prefs.playlists.map(p => p.id) : [])];
}

/** Próxima (ou anterior) na lista, dando a volta. Fora dela (tema especial): a primeira ou a última. */
export function vizinha(prefs: PreferenciasSom, atual: string, passo: 1 | -1, comPlaylists = true): string {
  const ordem = ordemDasFaixas(prefs, comPlaylists);
  const i = ordem.indexOf(atual);
  if (i < 0) return passo === 1 ? ordem[0] : ordem[ordem.length - 1];
  return ordem[(i + passo + ordem.length) % ordem.length];
}

// ── Estado observável ────────────────────────────────────────────────────────

let snap: InstantaneoSom = {
  estado: 'parado', prefs: PADRAO, silenciado: false, noAr: null, playerAberto: false,
  completo: false, volumeMax: VOLUME_MAX_ENXUTO, erro: null, perfil: null,
};
const ouvintes = new Set<() => void>();

function publicar(parcial: Partial<InstantaneoSom>) {
  snap = { ...snap, ...parcial };
  for (const o of ouvintes) {
    try { o(); } catch { /* quem ouve não derruba o motor */ }
  }
}

function assinar(o: () => void) {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

export function useSomAmbiente(): InstantaneoSom {
  return useSyncExternalStore(assinar, () => snap, () => snap);
}

export const lerEstadoSom = () => snap;
/** Para quem precisa reagir ao som fora do React (o modo Batman). */
export const assinarSom = assinar;

// ── Sessão ───────────────────────────────────────────────────────────────────

let perfilAtual: string | null = null;
let encerramento: ReturnType<typeof setTimeout> | null = null;
/** A pessoa quer ouvir (apertou play ou «Tocar ao entrar»). */
let querTocar = false;
/** Cada ação de tocar ganha um número; o que chega atrasado de uma ação velha é descartado. */
let geracao = 0;
const motivosSilencio = new Set<string>();

function mudarPrefs(novas: PreferenciasSom) {
  if (perfilAtual) gravarPreferencias(perfilAtual, novas);
  publicar({ prefs: novas });
}

/**
 * As preferências cabendo no que esta pessoa pode: no enxuto, volume até o
 * teto e faixa de fábrica. As playlists salvas ficam guardadas (não se perde o
 * que um super_admin cadastrou ao entrar como outra pessoa), só não tocam.
 */
export function dentroDosLimites(prefs: PreferenciasSom, completo: boolean): PreferenciasSom {
  if (completo) return prefs;
  return {
    ...prefs,
    volume: Math.min(prefs.volume, VOLUME_MAX_ENXUTO),
    faixa: ehEmbutida(prefs.faixa) ? prefs.faixa : PADRAO.faixa,
  };
}

/** O `Layout` chama ao montar com a pessoa logada. `completo`: é super_admin. */
export function iniciarSessao(perfilId: string, completo = false): void {
  if (encerramento) { clearTimeout(encerramento); encerramento = null; }
  const volumeMax = completo ? 100 : VOLUME_MAX_ENXUTO;
  if (perfilAtual === perfilId) {
    if (snap.completo !== completo) {
      publicar({ completo, volumeMax, prefs: dentroDosLimites(snap.prefs, completo) });
      if (!completo && externo) { soltarExterno(); pausar(); }
      if (audio && !fade && !audio.paused) audio.volume = volumeAlvo();
    }
    return;
  }
  if (perfilAtual) pararTudo();
  perfilAtual = perfilId;
  const prefs = dentroDosLimites(lerPreferencias(perfilId), completo);
  publicar({ prefs, completo, volumeMax, estado: 'parado', noAr: null, erro: null, perfil: perfilId });
  // F5 no meio de uma música de fábrica: volta pausada no mesmo ponto.
  const pos = lerPosicao(perfilId);
  if (pos && pos.faixa === prefs.faixa) retomarPausada(pos.faixa, pos.t);
  if (prefs.tocarAoEntrar) tocar();
}

/**
 * O `Layout` chama ao desmontar. Espera um pouco: trocar de página desmonta e
 * remonta o casco, e isso não pode cortar a música. Saiu de vez (logout)? Para.
 */
export function soltarSessao(perfilId: string): void {
  if (perfilAtual !== perfilId) return;
  if (encerramento) clearTimeout(encerramento);
  encerramento = setTimeout(() => {
    encerramento = null;
    pararTudo();
    perfilAtual = null;
    publicar({ prefs: PADRAO, estado: 'parado', noAr: null, playerAberto: false, erro: null, perfil: null });
  }, 2500);
}

// ── Gesto da pessoa ──────────────────────────────────────────────────────────

let esperandoGesto = false;

function jaInteragiu(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

function aoGesto() {
  if (!esperandoGesto) return;
  esperandoGesto = false;
  window.removeEventListener('pointerup', aoGesto, true);
  window.removeEventListener('keydown', aoGesto, true);
  if (querTocar && snap.estado === 'aguardando') {
    tocar();
  }
}

function esperarGesto() {
  if (esperandoGesto) return;
  esperandoGesto = true;
  // `pointerup`, não `pointerdown`: no toque da tela é ele que conta como gesto.
  window.addEventListener('pointerup', aoGesto, true);
  window.addEventListener('keydown', aoGesto, true);
}

// ── Fábrica: <audio> ─────────────────────────────────────────────────────────
//
// Um `<audio>` só, trocando de `src`: o navegador baixa a música aos poucos
// enquanto toca (sem decodificar 4 minutos de áudio na memória), e só baixa
// quando alguém dá play. Entradas e saídas com fade curto, no `volume`.

let audio: HTMLAudioElement | null = null;
/** Faixa carregada no `<audio>` agora. */
let carregada: FaixaEmbutida | null = null;
let fade: ReturnType<typeof setInterval> | null = null;
/** Trocando de `src` agora: o `pause` que isso dispara não é da pessoa. */
let trocando = false;
/** Ponto (s) para onde pular assim que a faixa carregar — a volta do F5. */
let pendente: number | null = null;
let ultimaGravacao = 0;

/**
 * A faixa de fábrica seguinte — é por onde a sequência anda quando uma acaba.
 * O tema especial, quando acaba, vai para a primeira da sequência.
 */
export function proximaEmbutida(faixa: FaixaEmbutida): FaixaEmbutida {
  const i = FAIXAS_DA_SEQUENCIA.indexOf(faixa);
  return FAIXAS_DA_SEQUENCIA[(i + 1) % FAIXAS_DA_SEQUENCIA.length];
}

/** O volume escolhido, já com o ganho da faixa que está carregada (`GANHO`). */
export function volumeDaFaixa(volume: number, faixa: FaixaEmbutida | null): number {
  return Math.min(1, ganhoDoVolume(volume) * (faixa ? GANHO[faixa] : 1));
}
const volumeAlvo = (volume = snap.prefs.volume) => volumeDaFaixa(volume, carregada);

/** Guarda onde a música está (no máximo a cada 3 s, ou já, com `agora`). */
function gravarOnde(agora = false) {
  const a = audio;
  if (!a || !carregada || !perfilAtual || trocando || pendente !== null) return;
  const t = performance.now();
  if (!agora && t - ultimaGravacao < 3000) return;
  ultimaGravacao = t;
  gravarPosicao(perfilAtual, { faixa: carregada, t: a.currentTime });
}

function elementoAudio(): HTMLAudioElement | null {
  if (audio) return audio;
  if (typeof Audio === 'undefined') return null;
  const a = new Audio();
  a.preload = 'auto';
  a.addEventListener('ended', () => {
    // Com «Repetir» o `loop` cuida; sem ele, segue a sequência.
    if (a !== audio || !carregada) return;
    if (perfilAtual) esquecerPosicao(perfilAtual);
    if (!querTocar) return;
    tocar(proximaEmbutida(carregada));
  });
  a.addEventListener('loadedmetadata', () => {
    if (a !== audio || pendente === null) return;
    const d = Number.isFinite(a.duration) ? a.duration : 0;
    a.currentTime = d ? Math.min(pendente, Math.max(0, d - 1)) : pendente;
    pendente = null;
  });
  a.addEventListener('timeupdate', () => { if (a === audio) gravarOnde(); });
  a.addEventListener('playing', () => {
    if (a === audio && querTocar && ehEmbutida(snap.noAr ?? '')) publicar({ estado: 'tocando', erro: null });
  });
  a.addEventListener('pause', () => {
    // Pausa que não veio daqui (tecla de mídia do teclado, fone bluetooth).
    // Trocar de `src` também dispara `pause` — essa é ignorada.
    if (a === audio && !a.ended) gravarOnde(true);
    if (a !== audio || trocando || a.ended || snap.estado !== 'tocando') return;
    querTocar = false;
    publicar({ estado: 'pausado' });
  });
  a.addEventListener('waiting', () => {
    if (a === audio && querTocar && snap.estado === 'tocando') publicar({ estado: 'carregando' });
  });
  a.addEventListener('error', () => {
    if (a !== audio || !carregada) return;
    carregada = null;
    publicar({ estado: 'erro', erro: 'Não deu para abrir esta música. Confira a internet e tente de novo.' });
  });
  audio = a;
  return a;
}

/**
 * Leva o volume do `<audio>` até 0 (`paraZero`) ou até o volume escolhido, em
 * `ms`. O alvo é relido a cada passo: mexer no controle durante o fade vale.
 */
function rampa(paraZero: boolean, ms: number, depois?: () => void) {
  const a = audio;
  if (!a) return;
  if (fade) clearInterval(fade);
  const inicio = a.volume;
  const t0 = performance.now();
  fade = setInterval(() => {
    const x = Math.min(1, (performance.now() - t0) / ms);
    const alvo = paraZero ? 0 : volumeAlvo();
    a.volume = Math.min(1, Math.max(0, inicio + (alvo - inicio) * x));
    if (x >= 1) {
      if (fade) clearInterval(fade);
      fade = null;
      depois?.();
    }
  }, 30);
}

async function tocarEmbutida(faixa: FaixaEmbutida, minha: number) {
  const a = elementoAudio();
  if (!a) { publicar({ estado: 'erro', erro: 'Este navegador não toca áudio.' }); return; }

  // Trocando de música com outra tocando: sai devagar antes.
  if (carregada !== faixa && !a.paused && a.volume > 0.01) {
    await new Promise<void>(r => rampa(true, 300, r));
    if (minha !== geracao) return;
  }
  a.loop = snap.prefs.repetir;
  if (carregada !== faixa) {
    if (fade) { clearInterval(fade); fade = null; }
    a.volume = 0;
    trocando = true;
    pendente = null;
    a.src = ARQUIVOS[faixa];
    carregada = faixa;
    publicar({ estado: 'carregando', noAr: faixa, erro: null });
  } else {
    publicar({ noAr: faixa, erro: null });
  }

  try {
    await a.play();
  } catch (e) {
    trocando = false;
    if (minha !== geracao) return;
    if (e instanceof DOMException && e.name === 'NotAllowedError') {
      // Sem gesto ainda (F5 com «Tocar ao entrar»): começa no próximo clique.
      publicar({ estado: 'aguardando' });
      esperarGesto();
    } else if (!(e instanceof DOMException && e.name === 'AbortError')) {
      publicar({ estado: 'erro', erro: 'Não deu para abrir esta música. Confira a internet e tente de novo.' });
    }
    return;
  }
  trocando = false;
  // Silêncio pedido enquanto carregava: quem libera chama `tocar()` de novo.
  if (minha !== geracao || !querTocar || snap.silenciado) { a.pause(); return; }
  publicar({ estado: 'tocando' });
  rampa(false, a.currentTime < 0.5 ? 1500 : 600);
}

function pausarEmbutida() {
  const a = audio;
  if (!a || a.paused) return;
  rampa(true, 300, () => {
    if (querTocar && !snap.silenciado) return; // voltou a tocar no meio do fade
    a.pause();
  });
}

/**
 * A volta do F5: deixa a faixa carregada no ponto em que parou, pausada. O
 * play seguinte (ou o «Tocar ao entrar») continua dali. Só baixa o cabeçalho
 * do arquivo até alguém dar play.
 */
function retomarPausada(faixa: FaixaEmbutida, t: number) {
  const a = elementoAudio();
  if (!a) return;
  a.preload = 'metadata';
  a.volume = 0;
  a.loop = snap.prefs.repetir;
  pendente = t;
  a.src = ARQUIVOS[faixa];
  carregada = faixa;
  publicar({ estado: 'pausado', noAr: faixa, erro: null });
}

if (typeof window !== 'undefined') {
  // Fechar a aba ou dar F5: grava o ponto exato, não o de até 3 s atrás.
  window.addEventListener('pagehide', () => gravarOnde(true));
}

/** Solta a música de fábrica de vez (ao trocar para uma playlist, ou no logout). */
function soltarEmbutida() {
  const a = audio;
  if (!a) return;
  if (fade) { clearInterval(fade); fade = null; }
  pendente = null;
  trocando = true;
  a.pause();
  carregada = null;
  a.removeAttribute('src');
  a.load();
  trocando = false;
}

/** Onde a música de fábrica está, para a barra de progresso. `null` sem música. */
export function progresso(): { atual: number; duracao: number } | null {
  if (!audio || !carregada || !ehEmbutida(snap.noAr ?? '')) return null;
  const duracao = Number.isFinite(audio.duration) ? audio.duration : 0;
  return { atual: audio.currentTime, duracao };
}

/** Pular para um ponto da música de fábrica. */
export function buscar(segundos: number): void {
  if (!audio || !carregada) return;
  const d = Number.isFinite(audio.duration) ? audio.duration : 0;
  audio.currentTime = Math.max(0, d ? Math.min(d - 0.25, segundos) : segundos);
}

// ── Playlist: palco e players ────────────────────────────────────────────────

const ALTURA_PALCO = 152;
let palco: HTMLDivElement | null = null;
let ancora: HTMLElement | null = null;
let quadro = 0;

interface PlayerExterno {
  link: LinkExterno;
  id: string;
  tocar(): void;
  pausar(): void;
  volume(v: number): void;
  destruir(): void;
}
let externo: PlayerExterno | null = null;

function garantirPalco(): HTMLDivElement {
  if (palco && document.body.contains(palco)) return palco;
  palco = document.createElement('div');
  palco.setAttribute('data-som-ambiente-palco', '');
  palco.setAttribute('aria-label', 'Player do Som ambiente');
  Object.assign(palco.style, {
    position: 'fixed', zIndex: '60', overflow: 'hidden', borderRadius: '12px',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(palco);
  posicionarPalco();
  return palco;
}

function posicionarPalco() {
  if (!palco) return;
  const r = ancora?.isConnected ? ancora.getBoundingClientRect() : null;
  if (r && r.width > 0) {
    Object.assign(palco.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${ALTURA_PALCO}px`,
      pointerEvents: 'auto', opacity: '1',
    });
  } else {
    // Fora da tela, mas vivo: `display: none` faria alguns players pausarem.
    Object.assign(palco.style, {
      left: '-10000px', top: '0px', width: '320px', height: `${ALTURA_PALCO}px`,
      pointerEvents: 'none', opacity: '0',
    });
  }
  palco.setAttribute('aria-hidden', r && r.width > 0 ? 'false' : 'true');
}

function acompanharAncora() {
  cancelAnimationFrame(quadro);
  if (!ancora) { posicionarPalco(); return; }
  const passo = () => {
    posicionarPalco();
    if (ancora) quadro = requestAnimationFrame(passo);
  };
  passo();
}

/** O painel reserva um espaço para o player; `null` quando fecha. */
export function ancorarPalco(el: HTMLElement | null): void {
  ancora = el;
  acompanharAncora();
}

/** O clique foi no player? O painel não deve fechar por isso. */
export function dentroDoPalco(alvo: EventTarget | null): boolean {
  return !!palco && alvo instanceof Node && palco.contains(alvo);
}

export { ALTURA_PALCO };

function playerYoutube(link: LinkExterno, id: string, minha: number): PlayerExterno {
  const quadroYt = document.createElement('iframe');
  quadroYt.src = enderecoYoutube(link, window.location.origin);
  quadroYt.title = 'Player do YouTube';
  quadroYt.allow = 'autoplay; encrypted-media; picture-in-picture';
  quadroYt.referrerPolicy = 'strict-origin-when-cross-origin';
  Object.assign(quadroYt.style, { width: '100%', height: '100%', border: '0' });

  let pronto = false;
  let tentativas = 0;
  let recusa: ReturnType<typeof setTimeout> | null = null;
  let escuta: ReturnType<typeof setInterval> | null = null;
  const enviar = (msg: Record<string, unknown>) => {
    try { quadroYt.contentWindow?.postMessage(JSON.stringify(msg), '*'); } catch { /* fechado */ }
  };
  const comando = (func: string, args: unknown[] = []) => enviar({ event: 'command', func, args, id });

  const aoMensagem = (ev: MessageEvent) => {
    if (ev.source !== quadroYt.contentWindow) return;
    let dado: { event?: string; info?: unknown };
    try { dado = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data; } catch { return; }
    if (!dado || typeof dado !== 'object') return;
    if (dado.event === 'onReady' || (dado.event === 'initialDelivery' && !pronto)) {
      if (pronto) return;
      pronto = true;
      if (escuta) { clearInterval(escuta); escuta = null; }
      comando('setVolume', [snap.prefs.volume]);
      if (querTocar && !snap.silenciado) comando('playVideo');
      // Se o navegador recusar o autoplay, o player fica parado esperando o
      // play dele: avisa em vez de girar «Abrindo o player…» para sempre.
      recusa = setTimeout(() => {
        if (minha === geracaoExterno && snap.estado === 'carregando') publicar({ estado: 'aguardando' });
      }, 4000);
      return;
    }
    if (dado.event === 'onError' && minha === geracaoExterno) {
      const codigo = typeof dado.info === 'number' ? dado.info : 0;
      publicar({
        estado: 'erro',
        erro: codigo === 100 ? 'Vídeo não encontrado ou privado.'
          : codigo === 101 || codigo === 150 ? 'Quem publicou não deixa tocar fora do YouTube.'
          : 'O YouTube não conseguiu tocar este link.',
      });
      return;
    }
    let estadoYt: number | undefined;
    if (dado.event === 'onStateChange' && typeof dado.info === 'number') estadoYt = dado.info;
    if (dado.event === 'infoDelivery' && dado.info && typeof dado.info === 'object') {
      const ps = (dado.info as { playerState?: unknown }).playerState;
      if (typeof ps === 'number') estadoYt = ps;
    }
    if (estadoYt === undefined || minha !== geracaoExterno) return;
    if (estadoYt === 1) { querTocar = true; publicar({ estado: 'tocando', erro: null }); }
    else if (estadoYt === 2) publicar({ estado: snap.silenciado ? snap.estado : 'pausado' });
    else if (estadoYt === 3 && snap.estado !== 'tocando') publicar({ estado: 'carregando' });
  };
  window.addEventListener('message', aoMensagem);

  quadroYt.addEventListener('load', () => {
    // O player só manda eventos depois de ouvir «listening»; repete até responder.
    enviar({ event: 'listening', id, channel: 'widget' });
    escuta = setInterval(() => {
      if (pronto || ++tentativas > 20) { if (escuta) clearInterval(escuta); escuta = null; return; }
      enviar({ event: 'listening', id, channel: 'widget' });
    }, 400);
  });

  garantirPalco().appendChild(quadroYt);

  return {
    link, id,
    tocar: () => comando('playVideo'),
    pausar: () => comando('pauseVideo'),
    volume: v => comando('setVolume', [v]),
    destruir: () => {
      if (escuta) clearInterval(escuta);
      if (recusa) clearTimeout(recusa);
      window.removeEventListener('message', aoMensagem);
      quadroYt.remove();
    },
  };
}

interface ControleSpotify {
  play(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
  addListener(evento: string, cb: (e: { data?: { isPaused?: boolean; isBuffering?: boolean } }) => void): void;
}
interface ApiSpotify {
  createController(el: HTMLElement, opcoes: Record<string, unknown>, cb: (c: ControleSpotify) => void): void;
}
let apiSpotify: Promise<ApiSpotify> | null = null;

function carregarApiSpotify(): Promise<ApiSpotify> {
  if (apiSpotify) return apiSpotify;
  apiSpotify = new Promise<ApiSpotify>((resolve, reject) => {
    const w = window as unknown as { onSpotifyIframeApiReady?: (api: ApiSpotify) => void };
    w.onSpotifyIframeApiReady = api => resolve(api);
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    s.onerror = () => { apiSpotify = null; s.remove(); reject(new Error('Spotify fora do ar')); };
    document.head.appendChild(s);
  });
  return apiSpotify;
}

function playerSpotify(link: LinkExterno, id: string, minha: number): PlayerExterno {
  const casca = document.createElement('div');
  Object.assign(casca.style, { width: '100%', height: '100%' });
  const alvo = document.createElement('div');
  casca.appendChild(alvo);
  garantirPalco().appendChild(casca);

  let controle: ControleSpotify | null = null;
  let morto = false;

  carregarApiSpotify().then(api => {
    if (morto) return;
    api.createController(alvo, { uri: uriSpotify(link), width: '100%', height: ALTURA_PALCO }, c => {
      if (morto) { try { c.destroy(); } catch { /* ok */ } return; }
      controle = c;
      c.addListener('ready', () => {
        if (minha !== geracaoExterno) return;
        // O Spotify costuma recusar o play antes de a pessoa tocar no player
        // dele; tentamos, e se não vier `playback_update`, o painel avisa.
        if (querTocar && !snap.silenciado) { try { c.play(); } catch { /* recusado */ } }
        if (snap.estado === 'carregando') publicar({ estado: 'aguardando' });
      });
      c.addListener('playback_update', e => {
        if (minha !== geracaoExterno || !e.data) return;
        if (e.data.isPaused) {
          if (!snap.silenciado && snap.estado === 'tocando') publicar({ estado: 'pausado' });
        } else if (!e.data.isBuffering) {
          querTocar = true;
          publicar({ estado: 'tocando', erro: null });
        }
      });
    });
  }, () => {
    if (minha === geracaoExterno) publicar({ estado: 'erro', erro: 'O Spotify não respondeu. Confira a internet ou tente o YouTube.' });
  });

  return {
    link, id,
    tocar: () => { try { controle?.resume(); } catch { /* recusado */ } },
    pausar: () => { try { controle?.pause(); } catch { /* ok */ } },
    volume: () => { /* o Spotify não aceita volume de fora */ },
    destruir: () => {
      morto = true;
      try { controle?.destroy(); } catch { /* ok */ }
      casca.remove();
    },
  };
}

let geracaoExterno = 0;

function soltarExterno() {
  if (!externo) return;
  externo.destruir();
  externo = null;
  geracaoExterno++;
  publicar({ playerAberto: false });
}

function tocarExterna(faixaId: string, minha: number) {
  const salva = snap.prefs.playlists.find(p => p.id === faixaId);
  const link = salva ? linkDaPlaylist(salva) : null;
  if (!link) { publicar({ estado: 'erro', erro: 'Este link não abre mais.' }); return; }

  if (externo?.id === faixaId) {
    publicar({ noAr: faixaId });
    externo.tocar();
    return;
  }
  // Sem gesto ainda (F5 com «Tocar ao entrar»): o player abriria mudo e parado.
  if (!jaInteragiu()) {
    publicar({ estado: 'aguardando', noAr: faixaId, erro: null });
    esperarGesto();
    return;
  }
  soltarExterno();
  geracaoExterno++;
  publicar({ estado: 'carregando', noAr: faixaId, erro: null });
  if (minha !== geracao) return;
  externo = link.plataforma === 'youtube'
    ? playerYoutube(link, faixaId, geracaoExterno)
    : playerSpotify(link, faixaId, geracaoExterno);
  publicar({ playerAberto: true });
}

// ── Ações ────────────────────────────────────────────────────────────────────

/** Toca a faixa escolhida (ou troca para `faixa` e toca). */
export function tocar(faixa?: string): void {
  // No enxuto, só as faixas de fábrica.
  if (faixa && !snap.completo && !ehEmbutida(faixa)) return;
  if (faixa && faixa !== snap.prefs.faixa) mudarPrefs({ ...snap.prefs, faixa });
  querTocar = true;
  const minha = ++geracao;
  if (snap.silenciado) { publicar({ estado: 'pausado', noAr: snap.prefs.faixa }); return; }
  const alvo = snap.prefs.faixa;
  if (ehEmbutida(alvo)) {
    soltarExterno();
    void tocarEmbutida(alvo, minha);
  } else {
    soltarEmbutida();
    tocarExterna(alvo, minha);
  }
}

export function pausar(): void {
  querTocar = false;
  geracao++;
  if (externo) externo.pausar();
  pausarEmbutida();
  if (snap.estado !== 'parado') publicar({ estado: 'pausado' });
}

export function alternar(): void {
  if (snap.estado === 'tocando' || snap.estado === 'carregando') pausar();
  else tocar();
}

/** Escolher na lista: se já está tocando, troca na hora; se não, só marca. */
export function escolher(faixa: string): void {
  if (faixa === snap.prefs.faixa && (snap.estado === 'tocando' || snap.estado === 'carregando')) return;
  tocar(faixa);
}

export function pular(passo: 1 | -1): void {
  tocar(vizinha(snap.prefs, snap.prefs.faixa, passo, snap.completo));
}

export function definirVolume(volume: number): void {
  const v = Math.round(Math.min(snap.volumeMax, Math.max(0, volume)));
  if (v === snap.prefs.volume) return;
  mudarPrefs({ ...snap.prefs, volume: v });
  // Durante um fade, quem leva ao volume novo é a própria rampa.
  if (audio && !fade && !audio.paused) audio.volume = volumeAlvo(v);
  externo?.volume(v);
}

export function definirTocarAoEntrar(ligado: boolean): void {
  mudarPrefs({ ...snap.prefs, tocarAoEntrar: ligado });
}

export function definirRepetir(ligado: boolean): void {
  mudarPrefs({ ...snap.prefs, repetir: ligado });
  if (audio) audio.loop = ligado;
}

/** Liga ou desliga a chuva do modo Batman (lida em `Batman/gotham/regente.ts`). */
export function definirChuva(ligada: boolean): void {
  mudarPrefs({ ...snap.prefs, chuva: ligada });
}

export function salvarPlaylists(playlists: PreferenciasSom['playlists'], faixa?: string): void {
  if (!snap.completo) return;
  const novaFaixa = faixa ?? (ehEmbutida(snap.prefs.faixa) || playlists.some(p => p.id === snap.prefs.faixa)
    ? snap.prefs.faixa
    : PADRAO.faixa);
  const saiuDoAr = snap.noAr && !ehEmbutida(snap.noAr) && !playlists.some(p => p.id === snap.noAr);
  mudarPrefs({ ...snap.prefs, playlists, faixa: novaFaixa });
  if (saiuDoAr) {
    soltarExterno();
    publicar({ estado: 'parado', noAr: null });
    querTocar = false;
  }
}

/** Pausa enquanto `motivo` pedir; volta sozinho quando todos liberarem. */
export function silenciar(motivo: string): void {
  motivosSilencio.add(motivo);
  if (snap.silenciado) return;
  const tocava = querTocar;
  publicar({ silenciado: true, estado: snap.estado === 'tocando' || snap.estado === 'carregando' ? 'pausado' : snap.estado });
  if (externo) externo.pausar();
  pausarEmbutida();
  querTocar = tocava;
}

export function liberarSilencio(motivo: string): void {
  if (!motivosSilencio.delete(motivo) || motivosSilencio.size) return;
  publicar({ silenciado: false });
  if (querTocar) tocar();
}

function pararTudo() {
  querTocar = false;
  geracao++;
  soltarExterno();
  soltarEmbutida();
  audio = null;
  if (esperandoGesto) {
    esperandoGesto = false;
    window.removeEventListener('pointerup', aoGesto, true);
    window.removeEventListener('keydown', aoGesto, true);
  }
}
