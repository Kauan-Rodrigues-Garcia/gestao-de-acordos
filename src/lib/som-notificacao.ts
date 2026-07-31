/**
 * som-notificacao.ts — o "ding" que acompanha o card de notificação.
 *
 * Sintetizado na hora com WebAudio em vez de tocar um arquivo. São duas notas
 * curtas: um .mp3 para isso seria um asset a versionar, servir e cachear, e um
 * `<audio>` preso ao DOM que o React teria de gerenciar.
 *
 * **Falha em silêncio, sempre.** Navegador sem WebAudio, contexto barrado pela
 * política de autoplay, aba sem gesto do usuário — nada disso pode derrubar a
 * notificação. O card é o aviso; o som é reforço.
 */

/**
 * Sol 4 e dó 5 — quarta justa na região média. Uma oitava abaixo de onde
 * mensageiro costuma tocar: avisa sem o brilho que cansa depois da décima vez.
 */
const NOTAS: readonly { hz: number; atraso: number; duracao: number }[] = [
  { hz: 392.00, atraso: 0,    duracao: 0.14 },
  { hz: 523.25, atraso: 0.07, duracao: 0.16 },
];

/**
 * Triangular, não senoide. Nessa região a senoide pura some debaixo de conversa
 * e headset ruim; a triangular tem harmônicos suficientes para atravessar.
 */
const ONDA: OscillatorType = 'triangle';

/**
 * Lowpass logo acima da segunda nota: guarda o corpo da triangular e corta os
 * harmônicos agudos, que são justamente os que incomodam com a repetição.
 */
const CORTE_HZ = 2200;

/**
 * Passa por sala barulhenta sem virar alarme — quem está em ligação não pode
 * levar susto. O card é o aviso; o som é reforço.
 */
const VOLUME = 0.24;

type FabricaAudio = new () => AudioContext;

/**
 * Um contexto para a sessão inteira.
 *
 * Navegadores limitam quantos AudioContext uma página pode abrir, e criar um
 * por notificação estouraria o limite em um dia de trabalho normal.
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

/** Toca o som. Não devolve nada e nunca lança — ver o cabeçalho. */
export function tocarSomNotificacao(): void {
  const ctx = obterContexto();
  if (!ctx) return;

  try {
    // O navegador suspende o contexto até o primeiro gesto na página. O resume
    // chega tarde para ESTE som, mas deixa o próximo pronto — e quem está
    // recebendo notificação de chat já clicou em algo bem antes.
    if (ctx.state === 'suspended') void ctx.resume();

    const inicio = ctx.currentTime;

    // Um filtro para as duas notas: elas passam juntas, não há por que duplicar.
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
      // Rampas curtas na entrada e na saída. Sem elas o oscilador começa e
      // termina no meio da onda, e o corte seco vira um clique audível.
      ganho.gain.setValueAtTime(0.0001, t0);
      ganho.gain.exponentialRampToValueAtTime(VOLUME, t0 + 0.015);
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

/** Só para teste: descarta o contexto guardado entre casos. */
export function __resetarContextoDeAudio(): void {
  contexto = null;
}
