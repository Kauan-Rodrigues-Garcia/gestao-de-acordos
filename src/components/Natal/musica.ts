/**
 * musica.ts — a música ambiente do Natal, a mesma para todo mundo.
 *
 * ## Uma rádio, não um player
 *
 * Não há play nem pause: a faixa "toca" o tempo todo, contada a partir de
 * `EPOCA`. Ligar é sintonizar — entra no ponto em que a música está agora, o
 * mesmo para todos os computadores. Desligar só tira o som; o tempo continua
 * correndo, e quem religar daqui a dez minutos entra dez minutos à frente.
 *
 * ## A emenda
 *
 * A faixa (Festive Lobby Music, 2min11s) não foi feita para repetir: começa num
 * fade-in de ~2 s e termina num fade-out de ~6 s seguido de silêncio. Repetida
 * pura, faria um buraco a cada volta. Aqui a volta seguinte começa
 * `SOBREPOSICAO` segundos ANTES do fim do som da anterior — o fade-out de uma
 * cobre o fade-in da outra, com a curva que a própria música já traz. Por isso
 * dois `<audio>` que se revezam: a volta `k` toca no elemento `k % 2`.
 *
 * `<audio>` e não Web Audio: decodificada, a faixa ocuparia ~46 MB de memória,
 * e a máquina fraca da operação é quem mais sente. O elemento vai lendo o
 * arquivo aos poucos.
 *
 * ## O relógio
 *
 * A posição sai de `Date.now()`, corrigido pelo cabeçalho `Date` do próprio
 * site quando o relógio do computador está mais de `TOLERANCIA_RELOGIO_MS`
 * fora. A cada `CONFERENCIA_MS` o motor confere se o elemento não escorregou e
 * reposiciona se passou de `DERIVA_MAX_S`.
 *
 * Ligada e volume ficam no `localStorage` deste navegador. O navegador só deixa
 * tocar depois de um clique: com a música ligada da última vez, ela volta no
 * primeiro clique ou tecla da pessoa na página.
 */
import { useSyncExternalStore } from 'react';

export const ARQUIVO = '/audio/natal/festive-lobby.mp3';
/** 1º de novembro de 2026, meia-noite em Brasília: o "0:00" da rádio. */
export const EPOCA = Date.UTC(2026, 10, 1, 3, 0, 0);
/** Onde o som começa e termina dentro do arquivo (medido no próprio áudio). */
export const INICIO_S = 0.23;
export const FIM_S = 129.73;
/** Quanto a volta seguinte entra antes do fim do som da anterior. */
export const SOBREPOSICAO = 4;
/** De um começo de volta ao próximo. */
export const PERIODO = FIM_S - INICIO_S - SOBREPOSICAO;

export const VOLUME_PADRAO = 30;
const FADE_MS = 700;
const CONFERENCIA_MS = 20_000;
const DERIVA_MAX_S = 0.6;
const TOLERANCIA_RELOGIO_MS = 2_000;

const CHAVE_LIGADA = 'natal:musica';
const CHAVE_VOLUME = 'natal:musica-volume';

// ── O tempo (puro) ────────────────────────────────────────────────────────────

/** Em que volta e em que ponto dela a rádio está, para um instante (ms). */
export function posicaoNaRadio(agoraMs: number): { volta: number; fase: number } {
  const s = (agoraMs - EPOCA) / 1000;
  const volta = Math.floor(s / PERIODO);
  return { volta, fase: s - volta * PERIODO };
}

/**
 * O que tem de estar soando agora: a volta atual e, nos primeiros
 * `SOBREPOSICAO` segundos dela, o fim da volta anterior. `tempo` é a posição
 * dentro do arquivo.
 */
export function oQueSoa(agoraMs: number): { volta: number; tempo: number }[] {
  const { volta, fase } = posicaoNaRadio(agoraMs);
  const soando = [{ volta, tempo: INICIO_S + fase }];
  if (fase < SOBREPOSICAO) soando.push({ volta: volta - 1, tempo: INICIO_S + PERIODO + fase });
  return soando;
}

/** Volume da tela (0–100) → do elemento. Quadrático: o ouvido não é linear. */
export const volumeDoElemento = (v: number) => Math.min(1, Math.max(0, v / 100)) ** 2;

// ── Preferência deste navegador ──────────────────────────────────────────────

function ler<T>(chave: string, padrao: T, ok: (v: string) => T | undefined): T {
  try {
    const v = localStorage.getItem(chave);
    return v === null ? padrao : ok(v) ?? padrao;
  } catch { return padrao; }
}
function gravar(chave: string, valor: string) {
  try { localStorage.setItem(chave, valor); } catch { /* modo privado */ }
}

export interface EstadoMusica { ligada: boolean; volume: number; tocando: boolean }

let estado: EstadoMusica = {
  ligada: typeof window !== 'undefined' && ler(CHAVE_LIGADA, false, v => v === '1'),
  volume: typeof window !== 'undefined'
    ? ler(CHAVE_VOLUME, VOLUME_PADRAO, v => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : undefined; })
    : VOLUME_PADRAO,
  tocando: false,
};
const ouvintes = new Set<() => void>();
function mudar(parcial: Partial<EstadoMusica>) {
  estado = { ...estado, ...parcial };
  ouvintes.forEach(o => o());
}

export function useMusicaNatal(): EstadoMusica {
  return useSyncExternalStore(
    o => { ouvintes.add(o); return () => ouvintes.delete(o); },
    () => estado,
    () => estado,
  );
}

// ── O relógio ─────────────────────────────────────────────────────────────────

let desvioMs = 0;
let relogioConferido = false;
const agora = () => Date.now() + desvioMs;

/**
 * O cabeçalho `Date` tem segundo inteiro: só corrige relógio bem errado.
 * Devolve se corrigiu — aí a música precisa ser reposicionada.
 */
async function conferirRelogio(): Promise<boolean> {
  if (relogioConferido) return false;
  relogioConferido = true;
  try {
    const antes = Date.now();
    const r = await fetch(`/?relogio=${antes}`, { method: 'HEAD', cache: 'no-store' });
    const depois = Date.now();
    const data = r.headers.get('date');
    if (!data) return false;
    const servidor = new Date(data).getTime() + 500; // o meio do segundo cortado
    const desvio = servidor - (antes + depois) / 2;
    if (Math.abs(desvio) <= TOLERANCIA_RELOGIO_MS) return false;
    desvioMs = desvio;
    return true;
  } catch { return false; /* sem rede: fica o relógio do computador */ }
}

// ── O motor ───────────────────────────────────────────────────────────────────

let elementos: [HTMLAudioElement, HTMLAudioElement] | null = null;
let ativo = false;          // sintonizado agora (não só a preferência)
let fade = 0;               // 0–1, multiplica o volume
let relogios: number[] = [];
let quadroFade = 0;
let esperandoGesto = false;

function criarElementos(): [HTMLAudioElement, HTMLAudioElement] {
  const novo = () => {
    const a = new Audio(ARQUIVO);
    a.preload = 'auto';
    return a;
  };
  return [novo(), novo()];
}

/** Antes da `EPOCA` as voltas são negativas, e `-1 % 2` é `-1` em JS. */
const lado = (volta: number) => ((volta % 2) + 2) % 2;
const doVolta = (volta: number) => elementos![lado(volta)];

function aplicarVolume() {
  if (!elementos) return;
  const v = Math.min(1, Math.max(0, volumeDoElemento(estado.volume) * fade));
  elementos.forEach(a => { a.volume = v; });
}

function animarFade(alvo: number, depois?: () => void) {
  cancelAnimationFrame(quadroFade);
  const de = fade;
  const inicio = performance.now();
  const passo = (t: number) => {
    // O carimbo do quadro pode vir de antes do `performance.now()` acima: sem
    // o piso em 0, o volume sai negativo e o navegador recusa (e o fade morre).
    const p = Math.min(1, Math.max(0, (t - inicio) / FADE_MS));
    fade = de + (alvo - de) * p;
    aplicarVolume();
    if (p < 1) quadroFade = requestAnimationFrame(passo);
    else depois?.();
  };
  quadroFade = requestAnimationFrame(passo);
}

function limparRelogios() {
  relogios.forEach(t => window.clearTimeout(t));
  relogios = [];
}

/** Põe um elemento no ponto certo e toca. */
async function tocar(a: HTMLAudioElement, tempo: number) {
  if (tempo >= FIM_S + 1.5) { a.pause(); return; }
  try {
    a.currentTime = tempo;
    await a.play();
  } catch (erro) {
    if ((erro as DOMException)?.name === 'NotAllowedError') aguardarGesto();
  }
}

/** Sintoniza: toca o que deve estar soando agora e agenda a próxima volta. */
function sintonizar() {
  if (!elementos || !ativo) return;
  limparRelogios();
  // Posicionar antes de o arquivo carregar faria a música entrar atrasada
  // pelo tempo do download: espera e sintoniza com a hora de quando chegou.
  const carregando = elementos.find(a => a.readyState < HTMLMediaElement.HAVE_METADATA);
  if (carregando) {
    carregando.addEventListener('loadedmetadata', sintonizar, { once: true });
    return;
  }
  const agoraMs = agora();
  const soando = oQueSoa(agoraMs);
  const voltasSoando = new Set(soando.map(s => lado(s.volta)));
  elementos.forEach((a, i) => { if (!voltasSoando.has(i)) a.pause(); });
  soando.forEach(s => { void tocar(doVolta(s.volta), s.tempo); });
  mudar({ tocando: true });

  const { volta, fase } = posicaoNaRadio(agoraMs);
  // A próxima volta entra no ponto exato; a anterior segue até o fim do som.
  relogios.push(window.setTimeout(() => {
    if (!ativo) return;
    void tocar(doVolta(volta + 1), INICIO_S);
    relogios.push(window.setTimeout(sintonizar, (SOBREPOSICAO + 0.5) * 1000));
  }, (PERIODO - fase) * 1000));
  // Conferência: o elemento escorrega um pouco com o tempo; reposiciona.
  relogios.push(window.setTimeout(conferir, CONFERENCIA_MS));
}

function conferir() {
  if (!elementos || !ativo) return;
  const agoraMs = agora();
  const [atual] = oQueSoa(agoraMs);
  const a = doVolta(atual.volta);
  if (a.paused || Math.abs(a.currentTime - atual.tempo) > DERIVA_MAX_S) sintonizar();
  else relogios.push(window.setTimeout(conferir, CONFERENCIA_MS));
}

function aguardarGesto() {
  if (esperandoGesto) return;
  esperandoGesto = true;
  mudar({ tocando: false });
  const voltar = () => {
    window.removeEventListener('pointerdown', voltar, true);
    window.removeEventListener('keydown', voltar, true);
    esperandoGesto = false;
    if (ativo) sintonizar();
  };
  window.addEventListener('pointerdown', voltar, true);
  window.addEventListener('keydown', voltar, true);
}

function ligarMotor() {
  if (ativo) return;
  ativo = true;
  elementos ??= criarElementos();
  fade = 0;
  aplicarVolume();
  void conferirRelogio().then(corrigiu => { if (ativo && corrigiu) sintonizar(); });
  sintonizar();
  animarFade(1);
}

function desligarMotor() {
  if (!ativo) return;
  ativo = false;
  limparRelogios();
  mudar({ tocando: false });
  animarFade(0, () => {
    if (!ativo) elementos?.forEach(a => a.pause());
  });
}

// ── A abertura: a mesma faixa, do 0:00, só para quem abriu o presente ─────────
//
// O vídeo do presente acaba e a música começa do início, na hora, para aquela
// pessoa — a rádio de todos só entra quando a mensagem de boas-vindas sai da
// tela (`passarParaRadio`). Enquanto a abertura toca, a rádio espera.

let abertura: HTMLAudioElement | null = null;
/** Mais alto que o volume ambiente: é o momento da música, não o fundo do trabalho. */
const VOLUME_ABERTURA = 0.35;
const FADE_ABERTURA_MS = 1600;

/** Leva o volume de um elemento até `alvo`, sem depender do fade da rádio. */
function fadeDoElemento(a: HTMLAudioElement, alvo: number, ms: number, depois?: () => void) {
  const de = a.volume;
  const inicio = performance.now();
  const passo = (t: number) => {
    const p = Math.min(1, Math.max(0, (t - inicio) / ms));
    a.volume = Math.min(1, Math.max(0, de + (alvo - de) * p));
    if (p < 1) requestAnimationFrame(passo);
    else depois?.();
  };
  requestAnimationFrame(passo);
}

/** O vídeo acabou: a faixa começa do 0:00, só aqui. */
export function tocarAbertura() {
  abertura?.pause();
  const a = new Audio(ARQUIVO);
  a.volume = 0;
  abertura = a;
  void a.play().then(
    () => fadeDoElemento(a, Math.max(VOLUME_ABERTURA, volumeDoElemento(estado.volume)), FADE_ABERTURA_MS),
    () => { if (abertura === a) abertura = null; },
  );
}

/** A abertura sai devagar (sem ligar nem desligar a rádio). */
function encerrarAbertura() {
  const a = abertura;
  abertura = null;
  if (a) fadeDoElemento(a, 0, FADE_ABERTURA_MS, () => a.pause());
}

/** A mensagem saiu: a abertura dá lugar à rádio, a mesma para todo mundo. */
export function passarParaRadio() {
  encerrarAbertura();
  ligarMusica(true);
}

// ── O que a tela usa ─────────────────────────────────────────────────────────

export function ligarMusica(ligada: boolean) {
  // Mexer no botão durante a abertura já é escolher a rádio: a abertura sai.
  encerrarAbertura();
  gravar(CHAVE_LIGADA, ligada ? '1' : '0');
  mudar({ ligada });
  if (ligada) ligarMotor(); else desligarMotor();
}

export function mudarVolume(volume: number) {
  const v = Math.round(Math.min(100, Math.max(0, volume)));
  gravar(CHAVE_VOLUME, String(v));
  mudar({ volume: v });
  aplicarVolume();
}

/** O botão montou (tema de Natal ligado): volta a tocar se estava ligada. */
export function entrarNaRadio() {
  // O tema entra no meio da abertura: a rádio espera a vez dela.
  if (estado.ligada && !abertura) ligarMotor();
}

/** O botão saiu da tela (tema desligado): silencia sem mudar a preferência. */
export function sairDaRadio() {
  desligarMotor();
}
