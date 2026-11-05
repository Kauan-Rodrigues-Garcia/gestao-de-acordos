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
 *
 * ## O volume (Cleber, 04/11/2026)
 *
 * «Não pode ficar alto para ninguém»: a barra vai de 0 a 100, sem número na
 * tela, e por trás isso é de 0 a `TETO_DO_VOLUME` (25%) do volume do
 * elemento. O padrão é o alto da barra, os 25%.
 *
 * ## A primeira vez (Cleber, 04/11/2026)
 *
 * Quem abre o presente ouve a faixa DO COMEÇO, só ela, no volume da barra
 * (`tocarAbertura`). Quando essa primeira volta chega ao fim, a rádio de
 * todo mundo entra por cima do fade-out dela, como na emenda de sempre — e
 * daí em diante a pessoa ouve o mesmo que todos. Enquanto ela toca, a rádio
 * não entra — nem quando o botão da música monta, com o tema chegando atrás
 * do bilhete (05/11/2026: entrava, e a música tocava dobrada).
 *
 * ## Uma aba só (05/11/2026)
 *
 * Com o sistema aberto em duas abas, cada uma tocava a sua cópia — a música
 * soava dobrada. Agora só uma aba tem a vez de soar (Web Locks, `pedirAVez`):
 * a primeira que pede; as outras esperam na fila, caladas, e uma delas assume
 * se aquela fechar. Ligar a música no botão ou abrir o presente toma a vez
 * para a aba onde se clicou. Ligar, desligar e o volume valem para todas as
 * abas (o evento `storage`).
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

/** A barra (0–100) vira, por trás, de 0 a este tanto do volume do elemento. */
export const TETO_DO_VOLUME = 0.25;
/** O alto da barra: os 25%. */
export const VOLUME_PADRAO = 100;

const FADE_MS = 700;
const CONFERENCIA_MS = 20_000;
const DERIVA_MAX_S = 0.6;
const TOLERANCIA_RELOGIO_MS = 2_000;

const CHAVE_LIGADA = 'natal:musica';
/** `-2`: a barra mudou de escala em 04/11/2026 (o volume antigo não vale mais). */
const CHAVE_VOLUME = 'natal:musica-volume-2';

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

/** Volume da barra (0–100) → do elemento: de 0 a `TETO_DO_VOLUME`. */
export const volumeDoElemento = (v: number) => TETO_DO_VOLUME * Math.min(1, Math.max(0, v / 100));

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

export interface EstadoMusica {
  ligada: boolean;
  volume: number;
  tocando: boolean;
  /** O aviso de «dá para desligar aqui», uma vez, depois da abertura (`agendarAvisoDaMusica`). */
  aviso: boolean;
}

let estado: EstadoMusica = {
  ligada: typeof window !== 'undefined' && ler(CHAVE_LIGADA, false, v => v === '1'),
  volume: typeof window !== 'undefined'
    ? ler(CHAVE_VOLUME, VOLUME_PADRAO, v => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : undefined; })
    : VOLUME_PADRAO,
  tocando: false,
  aviso: false,
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

/** O mesmo relógio da rádio, para o que mais anda junto para todos (o trenzinho). */
export const relogioNatal = agora;
export const conferirRelogioNatal = () => { void conferirRelogio().then(corrigiu => { if (ativo && corrigiu) sintonizar(); }); };
/** Só no `npm run dev`: adianta o relógio do Natal (o «Ver o sorteio agora» do trenzinho). */
export const adiantarRelogioNatalParaTeste = (ms: number) => {
  if (!import.meta.env.DEV) return;
  desvioMs += ms;
  if (ativo) sintonizar();
};

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
/** A primeira volta de quem abriu o presente, do começo (`tocarAbertura`). */
let abertura: HTMLAudioElement | null = null;
/** Quantos botões de música estão na tela (o tema de Natal ligado). */
let montados = 0;

// ── Uma aba só ────────────────────────────────────────────────────────────────

const NOME_DA_VEZ = 'natal:musica';
const temTrava = typeof navigator !== 'undefined' && 'locks' in navigator;
/** Esta aba pode soar? Sem a Web Locks (navegador antigo), sempre. */
let vez = !temTrava;
let soltarVez: (() => void) | null = null;
/** O pedido que ganhou a vez (para saber, quando um pedido cai, se era ele). */
let donoDaVez: object | null = null;
let pedidoNaFila: AbortController | null = null;
const querSoar = () => ativo || abertura !== null;

/** Pede a vez de soar. `roubar`: toma de quem estiver com ela (foi um clique aqui). */
function pedirAVez(roubar: boolean) {
  if (!temTrava || vez) return;
  if (!roubar && pedidoNaFila) return;
  pedidoNaFila?.abort();
  const fila = roubar ? null : new AbortController();
  pedidoNaFila = fila;
  const pedido = {};
  navigator.locks.request(NOME_DA_VEZ, fila ? { signal: fila.signal } : { steal: true }, () => new Promise<void>(soltar => {
    if (pedidoNaFila === fila) pedidoNaFila = null;
    vez = true;
    soltarVez = soltar;
    donoDaVez = pedido;
    ganhouAVez();
  })).catch(() => {
    // Desistiu da fila, ou outra aba tomou a vez desta.
    if (fila && pedidoNaFila === fila) pedidoNaFila = null;
    if (donoDaVez !== pedido) return;
    donoDaVez = null;
    vez = false;
    soltarVez = null;
    perdeuAVez();
  });
}

/** Ninguém mais quer soar nesta aba: larga a vez (e sai da fila). */
function soltarAVez() {
  pedidoNaFila?.abort();
  pedidoNaFila = null;
  if (!temTrava || !vez) return;
  const soltar = soltarVez;
  vez = false;
  soltarVez = null;
  donoDaVez = null;
  soltar?.();
}

function ganhouAVez() {
  if (!querSoar()) { soltarAVez(); return; }
  sintonizar();
}

/** Outra aba tomou a vez: esta se cala e volta para a fila. */
function perdeuAVez() {
  limparRelogios();
  elementos?.forEach(a => a.pause());
  if (abertura) {
    // A primeira volta não continua em outra aba: aqui, vira a rádio na fila.
    abertura.pause();
    abertura = null;
    if (estado.ligada && montados > 0 && !ativo) {
      ativo = true;
      elementos ??= criarElementos();
      fade = 1;
      aplicarVolume();
    }
  }
  mudar({ tocando: false });
  if (querSoar()) pedirAVez(false);
}

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
  if (!elementos || !ativo || !vez) return;
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
  if (!elementos || !ativo || !vez) return;
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

/** `roubar`: a vez vem para esta aba mesmo que outra esteja tocando (clique aqui). */
function ligarMotor(roubar = false) {
  if (ativo) { if (roubar) pedirAVez(true); return; }
  ativo = true;
  elementos ??= criarElementos();
  fade = 0;
  aplicarVolume();
  void conferirRelogio().then(corrigiu => { if (ativo && corrigiu) sintonizar(); });
  // Sem a vez, fica na fila calada; `ganhouAVez` sintoniza quando ela chegar.
  pedirAVez(roubar);
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
  if (!querSoar()) soltarAVez();
}

// ── A abertura do presente ────────────────────────────────────────────────────

const FADE_ABERTURA_MS = 1200;

/** Leva o volume de um elemento até `alvo` (sem mexer no fade da rádio). */
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

/** A primeira volta acabou (ou quase): a rádio entra e a abertura termina sozinha no fade-out dela. */
function passarParaRadio() {
  const a = abertura;
  abertura = null;
  if (a) a.addEventListener('ended', () => a.pause(), { once: true });
  // A vez desta aba passa da primeira volta para a rádio, sem soltar no meio.
  if (estado.ligada) ligarMotor();
  else if (!querSoar()) soltarAVez();
}

/** Para a abertura de vez (desligou a música, ou o tema saiu). */
function pararAbertura() {
  const a = abertura;
  abertura = null;
  if (a) fadeDoElemento(a, 0, 500, () => a.pause());
  if (a && !ativo) mudar({ tocando: false });
  if (a && !querSoar()) soltarAVez();
}

/**
 * O bilhete do presente entrou: a faixa toca DO COMEÇO, só aqui, no volume da
 * barra. A rádio entra quando ela chega à emenda (`SOBREPOSICAO` antes do fim).
 */
export function tocarAbertura() {
  pararAbertura();
  if (ativo) desligarMotor();
  gravar(CHAVE_LIGADA, '1');
  mudar({ ligada: true });
  const a = new Audio(ARQUIVO);
  a.volume = 0;
  abertura = a;
  // Abriu o presente aqui: a vez de soar é desta aba (as outras se calam).
  pedirAVez(true);
  const naEmenda = () => {
    if (abertura === a && a.currentTime >= FIM_S - SOBREPOSICAO) {
      a.removeEventListener('timeupdate', naEmenda);
      passarParaRadio();
    }
  };
  a.addEventListener('timeupdate', naEmenda);
  a.addEventListener('ended', () => { if (abertura === a) passarParaRadio(); }, { once: true });
  void a.play().then(
    () => { mudar({ tocando: true }); fadeDoElemento(a, volumeDoElemento(estado.volume), FADE_ABERTURA_MS); },
    // Sem permissão para tocar (não deveria: veio de um clique): vai direto para a rádio.
    () => { if (abertura === a) { abertura = null; ligarMotor(); } },
  );
}

let relogioDoAviso = 0;
/** Depois da abertura, uma vez: o aviso de onde se desliga a música. */
export function agendarAvisoDaMusica(ms: number) {
  window.clearTimeout(relogioDoAviso);
  relogioDoAviso = window.setTimeout(() => mudar({ aviso: true }), ms);
}
export function fecharAvisoDaMusica() {
  window.clearTimeout(relogioDoAviso);
  if (estado.aviso) mudar({ aviso: false });
}

// ── O que a tela usa ─────────────────────────────────────────────────────────

export function ligarMusica(ligada: boolean) {
  // Desligar no meio da primeira volta para ela; ligar com ela tocando não faz nada.
  if (!ligada) pararAbertura();
  else if (abertura) { gravar(CHAVE_LIGADA, '1'); mudar({ ligada: true }); return; }
  gravar(CHAVE_LIGADA, ligada ? '1' : '0');
  mudar({ ligada });
  // Ligou aqui, num clique: a música vem para esta aba.
  if (ligada) ligarMotor(true); else desligarMotor();
}

export function mudarVolume(volume: number) {
  const v = Math.round(Math.min(100, Math.max(0, volume)));
  gravar(CHAVE_VOLUME, String(v));
  mudar({ volume: v });
  aplicarVolume();
  if (abertura) abertura.volume = volumeDoElemento(v);
}

/** O botão montou (tema de Natal ligado): volta a tocar se estava ligada. */
export function entrarNaRadio() {
  montados++;
  // Com a primeira volta tocando (o tema acabou de entrar atrás do bilhete),
  // a rádio espera a vez dela: `passarParaRadio`.
  if (estado.ligada && !abertura) ligarMotor();
}

/** O botão saiu da tela (tema desligado): silencia sem mudar a preferência. */
export function sairDaRadio() {
  montados = Math.max(0, montados - 1);
  desligarMotor();
  // A primeira volta só para se o botão não voltou logo em seguida (remontagem).
  window.setTimeout(() => { if (montados === 0) pararAbertura(); }, 0);
}

// ── As outras abas ───────────────────────────────────────────────────────────

/** Ligou, desligou ou mexeu no volume em outra aba: vale aqui também. */
function aoMudarEmOutraAba(e: StorageEvent) {
  if (e.key === CHAVE_VOLUME && e.newValue !== null) {
    const v = Number(e.newValue);
    if (!Number.isFinite(v)) return;
    mudar({ volume: v });
    aplicarVolume();
    if (abertura) abertura.volume = volumeDoElemento(v);
  } else if (e.key === CHAVE_LIGADA) {
    const ligada = e.newValue === '1';
    if (ligada === estado.ligada) return;
    mudar({ ligada });
    if (!ligada) { pararAbertura(); desligarMotor(); }
    else if (montados > 0 && !abertura) ligarMotor();
  }
}
if (typeof window !== 'undefined') window.addEventListener('storage', aoMudarEmOutraAba);

// No `npm run dev`, recarregar este arquivo deixava a música antiga tocando
// por baixo da nova (dobrada): cala tudo antes.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('storage', aoMudarEmOutraAba);
    limparRelogios();
    elementos?.forEach(a => a.pause());
    abertura?.pause();
    soltarAVez();
  });
}
