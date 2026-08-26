/** Som exclusivo do chat. Não interfere na preferência nem no áudio do sino. */
const ARQUIVO = '/sounds/chat-notificacao.mp3';
const VOLUME = 0.48;
const INTERVALO_MINIMO_MS = 900;

let audio: HTMLAudioElement | null = null;
let arquivoQuebrado = false;
let ultimoToque = 0;

function obterAudio(): HTMLAudioElement | null {
  if (arquivoQuebrado || typeof Audio === 'undefined') return null;
  if (audio) return audio;
  try {
    audio = new Audio(ARQUIVO);
    audio.preload = 'auto';
    audio.addEventListener('error', () => { arquivoQuebrado = true; }, { once: true });
    return audio;
  } catch {
    arquivoQuebrado = true;
    return null;
  }
}

/** Baixa o pequeno MP3 no primeiro gesto, antes de a primeira mensagem chegar. */
export function prepararSomChat(): void {
  const el = obterAudio();
  if (!el) return;
  try { el.load(); } catch { /* áudio é reforço; a notificação visual continua */ }
}

/**
 * Cada mensagem ganha card. O intervalo existe só para não sobrepor o mesmo
 * áudio numa rajada e transformar o aviso em ruído.
 */
export function tocarSomChat(): void {
  const agora = Date.now();
  if (agora - ultimoToque < INTERVALO_MINIMO_MS) return;
  ultimoToque = agora;

  const el = obterAudio();
  if (!el) return;
  try {
    el.volume = VOLUME;
    el.currentTime = 0;
    const reproducao = el.play();
    if (reproducao && typeof reproducao.catch === 'function') {
      void reproducao.catch((): void => { /* sem som; card continua */ });
    }
  } catch {
    // Autoplay bloqueado ou dispositivo sem saída: o card segue funcionando.
  }
}

/** Somente para testes. */
export function __resetarSomChat(): void {
  audio = null;
  arquivoQuebrado = false;
  ultimoToque = 0;
}
