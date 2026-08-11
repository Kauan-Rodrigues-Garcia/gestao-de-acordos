/**
 * som-notificacao.ts — o som que acompanha o card de notificação.
 *
 * ── O que mudou (11/08/2026) ────────────────────────────────────────────────
 * Até aqui o som era SINTETIZADO com WebAudio (duas notas). Passou a tocar um
 * arquivo — `/sounds/notificacao.mp3`, escolhido pelo usuário. Um som gravado
 * tem timbre que oscilador não alcança, e a escolha do som é do dono do
 * produto, não do código.
 *
 * A síntese não foi jogada fora: ela virou o PLANO B. Arquivo pode não carregar
 * (rede caiu, deploy pela metade, cache sujo) e o aviso sonoro não pode sumir
 * junto — nesse caso o oscilador cobre.
 *
 * ── Três coisas que este módulo garante ─────────────────────────────────────
 *
 *   1. FALHA EM SILÊNCIO, SEMPRE. Navegador sem WebAudio, autoplay barrado, aba
 *      sem gesto do usuário, arquivo 404 — nada disso pode derrubar a
 *      notificação. O card é o aviso; o som é reforço.
 *
 *   2. NÃO VIRA METRALHADORA. Duas notificações no mesmo segundo tocam UMA vez.
 *      Sem isso, uma importação que gera várias linhas viraria um estalo só e
 *      irritante.
 *
 *   3. DÁ PARA DESLIGAR, e a escolha sobrevive ao F5. É a diferença entre um
 *      som que ajuda e um que faz a pessoa desligar o volume da máquina — e aí
 *      ela perde também o telefone.
 */

/** Onde o arquivo vive. `public/` é servido na raiz. */
const ARQUIVO = '/sounds/notificacao.mp3';

/** Chave da preferência de som no localStorage. */
export const CHAVE_SOM = 'notificacoes:som';

/**
 * Intervalo mínimo entre dois sons.
 *
 * Um pouco acima da duração do arquivo: o segundo som não pode começar em cima
 * do primeiro, senão os dois viram ruído em vez de aviso.
 */
export const INTERVALO_MINIMO_MS = 1_500;

/**
 * Volume por urgência.
 *
 * Nenhum chega a 1: quem está em ligação não pode levar susto. A diferença
 * entre eles é pequena de propósito — é para o ouvido perceber "esse é
 * diferente", não para assustar.
 */
const VOLUME: Record<UrgenciaSom, number> = {
  critica: 0.55,
  atencao: 0.40,
  info:    0.28,
};

export type UrgenciaSom = 'critica' | 'atencao' | 'info';

// ── Preferência ─────────────────────────────────────────────────────────────

/**
 * O som está ligado? Padrão: ligado.
 *
 * Lê do localStorage a cada chamada em vez de guardar em módulo — duas abas
 * abertas do sistema é o normal aqui, e a que não recebeu o clique precisa
 * enxergar a escolha feita na outra.
 */
export function somAtivo(): boolean {
  try {
    return localStorage.getItem(CHAVE_SOM) !== 'off';
  } catch {
    // Modo privativo de alguns navegadores lança ao ler storage.
    return true;
  }
}

export function definirSomAtivo(ativo: boolean): void {
  try {
    localStorage.setItem(CHAVE_SOM, ativo ? 'on' : 'off');
  } catch {
    // Sem persistência; o som segue no padrão do módulo.
  }
}

// ── Plano A: o arquivo ──────────────────────────────────────────────────────

let audio: HTMLAudioElement | null = null;
/** O arquivo já falhou alguma vez? Então nem tenta de novo — vai direto ao B. */
let arquivoQuebrado = false;

function obterAudio(): HTMLAudioElement | null {
  if (arquivoQuebrado) return null;
  if (audio) return audio;
  if (typeof Audio === 'undefined') return null;
  try {
    audio = new Audio(ARQUIVO);
    audio.preload = 'auto';
    // Um erro no elemento (404, formato recusado) é assíncrono e não chega como
    // exceção do `play()`. Sem este ouvinte, cada notificação tentaria de novo
    // um arquivo que já se sabe que não existe.
    audio.addEventListener('error', () => { arquivoQuebrado = true; }, { once: true });
    return audio;
  } catch {
    arquivoQuebrado = true;
    return null;
  }
}

/**
 * Aquece o arquivo depois do primeiro gesto do usuário.
 *
 * Navegador só libera áudio depois de um clique/tecla na página. Chamar isto no
 * primeiro gesto faz o download acontecer ANTES da primeira notificação — sem
 * isso, o primeiro som chegaria com o atraso do download, quando o card já
 * estaria saindo da tela.
 */
export function prepararSomNotificacao(): void {
  const el = obterAudio();
  if (!el) return;
  try { el.load(); } catch { /* noop */ }
}

// ── Plano B: os dois osciladores ────────────────────────────────────────────

/** Sol 4 e dó 5 — quarta justa na região média, longe do brilho que cansa. */
const NOTAS: readonly { hz: number; atraso: number; duracao: number }[] = [
  { hz: 392.00, atraso: 0,    duracao: 0.14 },
  { hz: 523.25, atraso: 0.07, duracao: 0.16 },
];

/** Triangular: na região média a senoide some debaixo de conversa e headset ruim. */
const ONDA: OscillatorType = 'triangle';
/** Lowpass logo acima da segunda nota — guarda o corpo, corta o que incomoda. */
const CORTE_HZ = 2200;

type FabricaAudio = new () => AudioContext;

/**
 * Um contexto para a sessão inteira. Navegadores limitam quantos AudioContext
 * uma página abre, e um por notificação estouraria o limite em um dia de
 * trabalho.
 */
let contexto: AudioContext | null = null;

function fabrica(): FabricaAudio | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: FabricaAudio;
    webkitAudioContext?: FabricaAudio;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function obterContexto(): AudioContext | null {
  if (contexto) return contexto;
  const Fabrica = fabrica();
  if (!Fabrica) return null;
  try {
    contexto = new Fabrica();
  } catch {
    return null;
  }
  return contexto;
}

function tocarSintetizado(volume: number): void {
  const ctx = obterContexto();
  if (!ctx) return;

  try {
    // O navegador suspende o contexto até o primeiro gesto na página. O resume
    // chega tarde para ESTE som, mas deixa o próximo pronto.
    if (ctx.state === 'suspended') void ctx.resume();

    const inicio = ctx.currentTime;

    // Um filtro para as duas notas: elas passam juntas.
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = CORTE_HZ;
    filtro.connect(ctx.destination);

    for (const nota of NOTAS) {
      const oscilador = ctx.createOscillator();
      const ganho     = ctx.createGain();

      oscilador.type = ONDA;
      oscilador.frequency.value = nota.hz;

      const t0 = inicio + nota.atraso;
      // Rampas curtas na entrada e na saída: sem elas o oscilador começa e
      // termina no meio da onda, e o corte seco vira um clique audível.
      ganho.gain.setValueAtTime(0.0001, t0);
      ganho.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), t0 + 0.015);
      ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + nota.duracao);

      oscilador.connect(ganho);
      ganho.connect(filtro);

      oscilador.start(t0);
      oscilador.stop(t0 + nota.duracao + 0.02);
    }
  } catch {
    // Sem som. A notificação segue.
  }
}

// ── Porta de entrada ────────────────────────────────────────────────────────

let ultimoToqueMs = 0;

/**
 * Toca o som da notificação. Não devolve nada e nunca lança — ver o cabeçalho.
 *
 * @param urgencia define o volume. Omitido = `info`, o mais discreto.
 */
export function tocarSomNotificacao(urgencia: UrgenciaSom = 'info'): void {
  if (!somAtivo()) return;

  const agora = Date.now();
  if (agora - ultimoToqueMs < INTERVALO_MINIMO_MS) return;
  ultimoToqueMs = agora;

  const volume = VOLUME[urgencia] ?? VOLUME.info;
  const el = obterAudio();

  if (!el) { tocarSintetizado(volume); return; }

  try {
    el.volume = volume;
    // Rebobina: sem isto, a segunda chamada com o áudio no fim não toca nada.
    el.currentTime = 0;
    const p = el.play();
    // `play()` devolve promessa rejeitada quando o autoplay é barrado ou o
    // arquivo não decodifica. Aí o plano B assume — sem `catch`, viraria
    // "unhandled rejection" no console e som nenhum.
    if (p && typeof p.catch === 'function') {
      p.catch(() => { tocarSintetizado(volume); });
    }
  } catch {
    tocarSintetizado(volume);
  }
}

/** Só para teste: descarta o que este módulo guardou entre casos. */
export function __resetarSomNotificacao(): void {
  contexto = null;
  audio = null;
  arquivoQuebrado = false;
  ultimoToqueMs = 0;
}
