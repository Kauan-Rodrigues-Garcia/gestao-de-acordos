/**
 * som-notificacao.ts — o "ding" que acompanha o card de notificação.
 *
 * Sintetizado na hora com WebAudio em vez de tocar um arquivo. São duas notas
 * de um sexto de segundo: um .mp3 para isso seria um asset a versionar, servir
 * e cachear, e um `<audio>` preso ao DOM que o React teria de gerenciar.
 *
 * **Falha em silêncio, sempre.** Navegador sem WebAudio, contexto barrado pela
 * política de autoplay, aba sem gesto do usuário — nada disso pode derrubar a
 * notificação. O card é o aviso; o som é reforço.
 */

/** Lá 5 e mi 6 — intervalo de quinta, o "ding-dong" curto dos mensageiros. */
const NOTAS: readonly { hz: number; atraso: number }[] = [
  { hz:  880.00, atraso: 0 },
  { hz: 1318.51, atraso: 0.085 },
];

const DURACAO_NOTA_S = 0.16;
/** Baixo de propósito: isto toca no meio do trabalho, não é um alarme. */
const VOLUME = 0.12;

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

    for (const nota of NOTAS) {
      const oscilador = ctx.createOscillator();
      const ganho     = ctx.createGain();

      oscilador.type = 'sine';
      oscilador.frequency.value = nota.hz;

      const t0 = inicio + nota.atraso;
      // Rampas curtas na entrada e na saída. Sem elas o oscilador começa e
      // termina no meio da onda, e o corte seco vira um clique audível.
      ganho.gain.setValueAtTime(0.0001, t0);
      ganho.gain.exponentialRampToValueAtTime(VOLUME, t0 + 0.015);
      ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + DURACAO_NOTA_S);

      oscilador.connect(ganho);
      ganho.connect(ctx.destination);

      oscilador.start(t0);
      oscilador.stop(t0 + DURACAO_NOTA_S + 0.02);
    }
  } catch {
    // Sem som. A notificação segue.
  }
}

/** Só para teste: descarta o contexto guardado entre casos. */
export function __resetarContextoDeAudio(): void {
  contexto = null;
}
