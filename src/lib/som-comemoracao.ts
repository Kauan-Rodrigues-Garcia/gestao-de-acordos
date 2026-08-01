/**
 * som-comemoracao.ts — os sons do catálogo de comemoração.
 *
 * Sintetizados com WebAudio, mesma escolha do `som-notificacao.ts`: sem arquivo
 * para versionar, servir e cachear, e sem `<audio>` preso ao DOM. A diferença é
 * que aqui há vários sons, cada um uma sequência de notas.
 *
 * **Falha em silêncio, sempre.** Navegador sem WebAudio ou áudio barrado pela
 * política de autoplay não pode derrubar a comemoração — o visual é o aviso, o
 * som é reforço.
 *
 * Respeita o mudo do usuário (`comemoracao:mudo` no localStorage): num call
 * center tem gente em ligação, e som surpresa em cima de uma negociação é
 * problema real.
 */
import type { SomId } from '@/pages/Comemoracoes/catalogo';

/** Uma nota da sequência. `atraso` e `duracao` em segundos. */
interface Nota {
  hz:      number;
  atraso:  number;
  duracao: number;
  /** Triangular corta melhor o ruído de sala que a senoide pura. */
  onda?:   OscillatorType;
}

const DO5 = 523.25, MI5 = 659.25, SOL5 = 783.99, DO6 = 1046.50, MI6 = 1318.51, SOL6 = 1567.98;

const SEQUENCIAS: Record<Exclude<SomId, 'nenhum'>, readonly Nota[]> = {
  // Três notas subindo, no tempo de uma respiração.
  fanfarra: [
    { hz: DO5,  atraso: 0,    duracao: 0.14 },
    { hz: MI5,  atraso: 0.11, duracao: 0.14 },
    { hz: SOL5, atraso: 0.22, duracao: 0.30 },
  ],
  // Acorde alegre, o "você conseguiu" de jogo.
  conquista: [
    { hz: DO5,  atraso: 0,    duracao: 0.12 },
    { hz: SOL5, atraso: 0.09, duracao: 0.12 },
    { hz: DO6,  atraso: 0.18, duracao: 0.12 },
    { hz: MI6,  atraso: 0.27, duracao: 0.34 },
  ],
  // Agudo e picado, sem corpo — tilintar.
  moedas: [
    { hz: SOL6, atraso: 0,    duracao: 0.06, onda: 'square' },
    { hz: DO6,  atraso: 0.07, duracao: 0.06, onda: 'square' },
    { hz: MI6,  atraso: 0.13, duracao: 0.06, onda: 'square' },
    { hz: SOL6, atraso: 0.20, duracao: 0.10, onda: 'square' },
  ],
  // Uma badalada só, com cauda longa.
  sino: [
    { hz: DO6, atraso: 0, duracao: 0.9, onda: 'sine' },
  ],
};

/** Passa por sala barulhenta sem virar alarme. */
const VOLUME = 0.22;
/** Corta os harmônicos agudos, que são os que cansam na repetição. */
const CORTE_HZ = 3200;

/** Chave do mudo por usuário. Fica no navegador: é preferência de quem ouve. */
export const CHAVE_MUDO = 'comemoracao:mudo';

export function estaMudo(): boolean {
  try {
    return localStorage.getItem(CHAVE_MUDO) === '1';
  } catch {
    return false;   // navegador sem localStorage não impede o som
  }
}

export function definirMudo(mudo: boolean): void {
  try {
    if (mudo) localStorage.setItem(CHAVE_MUDO, '1');
    else localStorage.removeItem(CHAVE_MUDO);
  } catch {
    // preferência não persistida; o som toca, e nada quebra
  }
}

type FabricaAudio = new () => AudioContext;

/** Um contexto para a sessão — navegadores limitam quantos a página abre. */
let contexto: AudioContext | null = null;

function obterContexto(): AudioContext | null {
  if (contexto) return contexto;
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: FabricaAudio; webkitAudioContext?: FabricaAudio };
  const Fabrica = w.AudioContext ?? w.webkitAudioContext;
  if (!Fabrica) return null;
  try {
    contexto = new Fabrica();
  } catch {
    return null;
  }
  return contexto;
}

/**
 * O volume escolhido na comemoração, em PERCENTUAL do padrão de cada som.
 *
 * Não é ganho absoluto de propósito: a música do líder vem masterizada alta e
 * é atenuada para 0,25, enquanto os sons sintetizados nascem calibrados em
 * 0,22. Um número absoluto único obrigaria a escolher qual dos dois estragar.
 *
 * 100 (o padrão) reproduz exatamente o comportamento anterior nos dois casos.
 */
export function fatorDeVolume(percentual: number | null | undefined): number {
  if (!Number.isFinite(percentual ?? NaN)) return 1;
  return Math.min(100, Math.max(0, percentual as number)) / 100;
}

/**
 * Toca o som do catálogo. Não devolve nada e nunca lança.
 *
 * `forcar` ignora o mudo — usado pela prévia, onde a pessoa pediu para ouvir.
 * `volumePct` é o percentual da comemoração (ver `fatorDeVolume`).
 */
export function tocarSomComemoracao(som: SomId, forcar = false, volumePct = 100): void {
  if (som === 'nenhum') return;
  if (!forcar && estaMudo()) return;

  const fator = fatorDeVolume(volumePct);
  if (fator <= 0) return;

  const sequencia = SEQUENCIAS[som];
  if (!sequencia) return;

  const ctx = obterContexto();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') void ctx.resume();

    const inicio = ctx.currentTime;

    // Um filtro para a sequência inteira: as notas passam juntas.
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = CORTE_HZ;
    filtro.connect(ctx.destination);

    for (const nota of sequencia) {
      const oscilador = ctx.createOscillator();
      const ganho     = ctx.createGain();

      oscilador.type = nota.onda ?? 'triangle';
      oscilador.frequency.value = nota.hz;

      const t0 = inicio + nota.atraso;
      // Rampas curtas na entrada e na saída: sem elas o corte seco do
      // oscilador vira um clique audível.
      ganho.gain.setValueAtTime(0.0001, t0);
      ganho.gain.exponentialRampToValueAtTime(VOLUME * fator, t0 + 0.012);
      ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + nota.duracao);

      oscilador.connect(ganho);
      ganho.connect(filtro);

      oscilador.start(t0);
      oscilador.stop(t0 + nota.duracao + 0.02);
    }
  } catch {
    // Sem som. A comemoração segue.
  }
}

/**
 * Volume da música enviada pelo líder.
 *
 * Bem mais baixo que o padrão: o arquivo já vem masterizado alto, e isto toca
 * em cima de gente em ligação. Os sons do catálogo são sintetizados no volume
 * certo, então não usam este valor.
 */
const VOLUME_ARQUIVO = 0.25;

/** Quanto dura o esmaecimento no fim. Curto — não é fim de show. */
const FADE_MS = 700;

export interface OpcoesSom {
  /** Segundo em que a música começa. */
  inicio?:  number;
  /**
   * Por quantos segundos toca. É a DURAÇÃO DA COMEMORAÇÃO — o som termina
   * junto com o card, não antes nem depois.
   */
  duracao?: number;
  /** Percentual do volume padrão (ver `fatorDeVolume`). Ausente = 100. */
  volume?:  number;
}

/**
 * Toca um arquivo de som enviado pelo líder.
 *
 * Não passa pelo WebAudio: um `<audio>` avulso basta e evita baixar e decodar o
 * arquivo à mão. Como o Storage responde a Range request, pular para o segundo
 * 40 não baixa os 40 primeiros.
 *
 * @returns função que interrompe a reprodução com um esmaecimento curto. Quem
 *          exibe a comemoração PRECISA chamá-la ao tirar o card da tela —
 *          senão a música continua tocando depois da festa acabar.
 */
export function tocarArquivoDeSom(
  url: string,
  forcar = false,
  opcoes?: OpcoesSom | null,
): () => void {
  if (!forcar && estaMudo()) return () => {};

  const fator = fatorDeVolume(opcoes?.volume ?? 100);
  if (fator <= 0) return () => {};

  try {
    const audio = new Audio(url);
    audio.volume = VOLUME_ARQUIVO * fator;

    let timerFim:  ReturnType<typeof setTimeout>  | null = null;
    let timerFade: ReturnType<typeof setInterval> | null = null;
    let encerrado = false;

    const limparTimers = () => {
      if (timerFim)  { clearTimeout(timerFim);   timerFim = null; }
      if (timerFade) { clearInterval(timerFade); timerFade = null; }
    };

    /** Baixa o volume aos poucos e pausa. Cortar seco soa como falha. */
    const esmaecer = (ms = FADE_MS) => {
      if (encerrado) return;
      encerrado = true;
      if (timerFim) { clearTimeout(timerFim); timerFim = null; }

      const passo = 50;
      const queda = audio.volume / Math.max(1, ms / passo);
      timerFade = setInterval(() => {
        const proximo = audio.volume - queda;
        if (proximo <= 0.01) {
          limparTimers();
          try { audio.pause(); } catch { /* já parou */ }
          return;
        }
        audio.volume = proximo;
      }, passo);
    };

    /** Corte rápido — usado quando o card sai antes da hora. */
    const parar = () => esmaecer(250);

    const comecar = () => {
      const inicio = opcoes?.inicio ?? 0;
      if (inicio > 0) audio.currentTime = inicio;
      void audio.play().catch(() => {});

      const duracao = opcoes?.duracao ?? 0;
      if (duracao > 0) {
        // Começa a esmaecer ANTES do fim, para o silêncio coincidir com a
        // saída do card em vez de vir depois dela.
        const ateOFade = Math.max(0, duracao * 1000 - FADE_MS);
        timerFim = setTimeout(() => esmaecer(), ateOFade);
      }
    };

    // O `seek` só vale depois de o navegador conhecer a duração; antes disso
    // atribuir `currentTime` é ignorado em silêncio.
    if ((opcoes?.inicio ?? 0) > 0) {
      audio.addEventListener('loadedmetadata', comecar, { once: true });
      audio.load();
    } else {
      comecar();
    }

    return parar;
  } catch {
    // Sem som. A comemoração segue.
    return () => {};
  }
}

/** Só para teste: descarta o contexto guardado entre casos. */
export function __resetarContextoDeAudio(): void {
  contexto = null;
}
