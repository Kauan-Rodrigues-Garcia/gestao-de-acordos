/**
 * A música do tema do GTA VI (18 e 19/11/2026): «Love Is a Long Road», do Tom
 * Petty — a do primeiro trailer do jogo. O arquivo (`public/vi/musica.mp3`)
 * já começa nos 5 segundos da gravação; a música entra 7 s adiante disso, no
 * segundo 12 da gravação (`INICIO_S`), e é para lá que ela volta ao dar a
 * volta (Cleber, 16/11/2026).
 *
 * Como ela se comporta (pedido do Cleber):
 *   - começa quando a pessoa abre o convite (`ConviteVi`), BEM BAIXINHO, e vai
 *     subindo até o volume dela;
 *   - quem recusa o tema: a música some aos poucos, não de uma vez;
 *   - quem ativa: continua tocando, e passa a morar no botão do alto da tela,
 *     no lugar da música de Natal (`BotaoMusicaVi`).
 *
 * O motor vive fora do React (um `<audio>` só, do módulo): trocar de página
 * não para a música. Não é rádio como a do Natal — cada um ouve a sua, do
 * ponto em que ligou, e ela dá a volta sozinha.
 */
import { useSyncExternalStore } from 'react';

const ARQUIVO = '/vi/musica.mp3';
/** Onde a música começa, em segundos DO ARQUIVO (que já pulou 5 s): segundo 12 da gravação. */
const INICIO_S = 7;
/** O «alto» da barra de volume é, por trás, 68% do volume do computador. */
export const TETO_DO_VOLUME = 0.68;
/** A barra começa no meio. */
const VOLUME_PADRAO = 50;
/** Quanto tempo a música leva para chegar ao volume, e para sumir. */
const SUBIDA_MS = 5000;
const DESCIDA_MS = 2200;
const PASSO_MS = 60;

const CHAVE_LIGADA = 'vi:musica';
const CHAVE_VOLUME = 'vi:musica-volume';

export interface EstadoDaMusica {
  /** A pessoa quer a música (a escolha fica gravada neste navegador). */
  ligada: boolean;
  /** Está saindo som agora. */
  tocando: boolean;
  /** A barra de volume, de 0 a 100. */
  volume: number;
}

function lerLigada(): boolean {
  try { return localStorage.getItem(CHAVE_LIGADA) === '1'; } catch { return false; }
}
function lerVolume(): number {
  try {
    const v = Number(localStorage.getItem(CHAVE_VOLUME));
    return localStorage.getItem(CHAVE_VOLUME) !== null && v >= 0 && v <= 100 ? v : VOLUME_PADRAO;
  } catch { return VOLUME_PADRAO; }
}
function gravar(chave: string, valor: string) {
  try { localStorage.setItem(chave, valor); } catch { /* modo privado: vale até recarregar */ }
}

let estado: EstadoDaMusica = { ligada: false, tocando: false, volume: VOLUME_PADRAO };
if (typeof window !== 'undefined') estado = { ligada: lerLigada(), tocando: false, volume: lerVolume() };

const ouvintes = new Set<() => void>();
function mudar(parte: Partial<EstadoDaMusica>) {
  estado = { ...estado, ...parte };
  for (const aviso of ouvintes) aviso();
}
function assinar(aviso: () => void) {
  ouvintes.add(aviso);
  return () => { ouvintes.delete(aviso); };
}
export const useMusicaVi = (): EstadoDaMusica => useSyncExternalStore(assinar, () => estado);

/** O volume de verdade (0 a 1) para uma posição da barra (0 a 100). Exportada para os testes. */
export const volumeReal = (barra: number): number => Math.max(0, Math.min(100, barra)) / 100 * TETO_DO_VOLUME;

/**
 * O volume a cada passo de uma rampa: de `de` até `ate` em `duracao` ms.
 * Exportada para os testes. Sobe devagar no começo (quadrática): é o «bem
 * baixinho e vai aumentando».
 */
export function volumeNaRampa(de: number, ate: number, decorrido: number, duracao: number): number {
  const t = Math.max(0, Math.min(1, duracao <= 0 ? 1 : decorrido / duracao));
  const curva = ate >= de ? t * t : t;
  return de + (ate - de) * curva;
}

let audio: HTMLAudioElement | null = null;
let rampa = 0;
let esperandoGesto: (() => void) | null = null;

function pegarAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(ARQUIVO);
    // Sem `loop`: a volta é feita à mão, para cair de novo no `INICIO_S`.
    audio.preload = 'auto';
    audio.volume = 0;
    const el = audio;
    const irAoInicio = () => { try { el.currentTime = INICIO_S; } catch { /* ainda sem duração */ } };
    irAoInicio();
    // Antes de saber a duração, alguns navegadores ignoram o salto: repete aqui.
    el.addEventListener('loadedmetadata', () => { if (el.currentTime < INICIO_S) irAoInicio(); }, { once: true });
    el.addEventListener('ended', () => {
      irAoInicio();
      if (estado.ligada && montada) void el.play().catch(() => { /* sem gesto: fica parada */ });
    });
    audio.addEventListener('playing', () => mudar({ tocando: true }));
    audio.addEventListener('pause', () => mudar({ tocando: false }));
  }
  return audio;
}

function pararRampa() {
  if (rampa) { window.clearInterval(rampa); rampa = 0; }
}

/** Leva o volume até `ate` em `duracao` ms; `aoFim` roda quando chega lá. */
function rampaAte(ate: number, duracao: number, aoFim?: () => void) {
  const a = pegarAudio();
  pararRampa();
  const de = a.volume;
  const inicio = performance.now();
  rampa = window.setInterval(() => {
    const decorrido = performance.now() - inicio;
    a.volume = Math.max(0, Math.min(1, volumeNaRampa(de, ate, decorrido, duracao)));
    if (decorrido >= duracao) { pararRampa(); aoFim?.(); }
  }, PASSO_MS);
}

function largarGesto() {
  if (!esperandoGesto) return;
  window.removeEventListener('pointerdown', esperandoGesto);
  window.removeEventListener('keydown', esperandoGesto);
  esperandoGesto = null;
}

/** Põe para tocar e sobe o volume. Sem clique na página o navegador recusa: espera o primeiro. */
function comecar() {
  const a = pegarAudio();
  largarGesto();
  const subir = () => rampaAte(volumeReal(estado.volume), SUBIDA_MS);
  if (!a.paused) { subir(); return; }
  a.volume = 0;
  a.play().then(subir).catch(() => {
    // Página recarregada, sem clique ainda: toca no primeiro toque ou tecla.
    if (!estado.ligada) return;
    esperandoGesto = () => { if (estado.ligada) comecar(); else largarGesto(); };
    window.addEventListener('pointerdown', esperandoGesto, { once: true });
    window.addEventListener('keydown', esperandoGesto, { once: true });
  });
}

/** Some aos poucos e pausa. */
function calar() {
  largarGesto();
  if (!audio || audio.paused) { pararRampa(); return; }
  rampaAte(0, DESCIDA_MS, () => { if (!estado.ligada || !montada) audio?.pause(); });
}

/** Liga ou desliga a música (o convite e o interruptor do botão). */
export function ligarMusicaVi(ligada: boolean) {
  gravar(CHAVE_LIGADA, ligada ? '1' : '0');
  mudar({ ligada });
  if (ligada) { montada = true; comecar(); } else calar();
}

/** A barra de volume, de 0 a 100. */
export function mudarVolumeVi(volume: number) {
  const v = Math.max(0, Math.min(100, Math.round(volume)));
  gravar(CHAVE_VOLUME, String(v));
  mudar({ volume: v });
  // Mexeu na barra: vale na hora, sem rampa.
  if (audio && !audio.paused && estado.ligada) { pararRampa(); audio.volume = volumeReal(v); }
}

/**
 * O botão do alto da tela existe (o tema está ligado)? Montado, a música volta
 * a tocar se a pessoa tinha deixado ligada; desmontado (tema desligado, virou
 * o dia), ela some aos poucos sem mexer na escolha.
 */
let montada = false;
export function entrarNaMusicaVi() {
  montada = true;
  if (estado.ligada) comecar();
}
export function sairDaMusicaVi() {
  montada = false;
  calar();
}
