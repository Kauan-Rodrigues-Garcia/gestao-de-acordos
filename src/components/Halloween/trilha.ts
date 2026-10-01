/**
 * A trilha da mensagem de outubro: o tema de Halloween tocando enquanto a
 * pessoa lê.
 *
 * Começa baixinho e sobe devagar até `VOLUME_ALVO` — fundo, não protagonista.
 * Toca só o começo da música (`TRECHO_S`) e volta ao início, com uma
 * respiração no volume na emenda para a volta não soar como um corte.
 *
 * ── O que este módulo garante ───────────────────────────────────────────────
 *
 *   1. SÓ TOCA COM A MENSAGEM. Quem chama é a `BoasVindasHalloween`, ao montar,
 *      e ela para a trilha ao desmontar. Um download que termina depois de a
 *      mensagem fechar não começa a tocar.
 *
 *   2. NUNCA DUAS AO MESMO TEMPO. Começar uma trilha para a anterior antes.
 *
 *   3. NÃO TRAVA. A música é decodificada inteira antes de tocar e a volta ao
 *      início é feita pelo próprio WebAudio (`loopEnd`), sem timer de página.
 *
 *   4. FALHA EM SILÊNCIO. Sem WebAudio, arquivo ausente, formato recusado: a
 *      mensagem segue, só sem som.
 *
 * Navegador não deixa página tocar som antes de a pessoa interagir com ela.
 * Quando a mensagem abre num F5, o contexto nasce suspenso: a trilha fica
 * `bloqueada` e começa no primeiro toque ou tecla na tela — menos no botão que
 * fecha a mensagem, para não soar um instante e calar.
 */

/** Onde o arquivo vive. `public/` é servido na raiz. */
export const ARQUIVO_TRILHA = '/sounds/halloween-tema.mp3';

/** Até onde o volume sobe. */
export const VOLUME_ALVO = 0.28;
/** De onde ele parte. */
export const VOLUME_INICIAL = 0.02;
/** Quanto tempo a subida leva. */
export const SUBIDA_S = 6;
/** Quanto da música toca antes de voltar ao início. */
export const TRECHO_S = 40;
/** A respiração na emenda: o volume desce neste tempo antes e sobe depois. */
export const RESPIRO_S = 1.2;
/** Fade de saída ao fechar a mensagem — curto, mas sem estalo. */
export const SAIDA_S = 0.35;
/** Quantas emendas deixar agendadas de uma vez (uma hora de música). */
const EMENDAS_AGENDADAS = 90;

/** Quem tem `data-hw-sem-destravar` não libera o som ao ser tocado. */
export const ATRIBUTO_SEM_DESTRAVAR = 'data-hw-sem-destravar';

export type EstadoTrilha =
  /** Baixando ou decodificando. */
  | 'carregando'
  /** Pronta, esperando o primeiro gesto da pessoa. */
  | 'bloqueada'
  | 'tocando'
  | 'muda'
  /** Sem som possível: sem WebAudio, arquivo ausente ou ilegível. */
  | 'indisponivel'
  | 'parada';

export interface Trilha {
  readonly estado: EstadoTrilha;
  /** Liga ou desliga o som sem parar a música. */
  alternarSom(): void;
  /** Para de vez. Pode ser chamada mais de uma vez. */
  parar(): void;
}

type FabricaAudio = new () => AudioContext;

function fabrica(): FabricaAudio | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: FabricaAudio; webkitAudioContext?: FabricaAudio };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** A trilha que está viva agora — no máximo uma. */
let atual: Trilha | null = null;

export function tocarTrilhaHalloween(
  aoMudar: (estado: EstadoTrilha) => void = () => {},
  arquivo: string = ARQUIVO_TRILHA,
): Trilha {
  atual?.parar();

  let estado: EstadoTrilha = 'carregando';
  /** Função, e não comparação direta: o TS não vê `parar()` mudando `estado` entre um `await` e outro. */
  const parou = () => estado === 'parada';
  let ctx: AudioContext | null = null;
  let fonte: AudioBufferSourceNode | null = null;
  /** Mudo e saída. A subida e as emendas ficam no `envelope`. */
  let mestre: GainNode | null = null;
  let mudo = false;
  /** A aba foi escondida com a trilha tocando: volta quando ela reaparecer. */
  let pausadaPelaAba = false;

  const mudar = (novo: EstadoTrilha) => {
    if (estado === 'parada' || estado === novo) return;
    estado = novo;
    try { aoMudar(novo); } catch { /* quem ouve não derruba a trilha */ }
  };

  const tocandoOuMuda = () => (mudo ? 'muda' : 'tocando');

  const destravar = () => {
    if (!ctx || !fonte || estado !== 'bloqueada') return;
    ctx.resume().then(
      () => { if (estado === 'bloqueada' && ctx?.state === 'running') mudar(tocandoOuMuda()); },
      () => {},
    );
  };

  const aoGesto = (e: Event) => {
    if (e instanceof KeyboardEvent && e.key === 'Escape') return;
    const alvo = e.target;
    if (alvo instanceof Element && alvo.closest(`[${ATRIBUTO_SEM_DESTRAVAR}]`)) return;
    destravar();
  };

  const aoMudarAba = () => {
    if (!ctx || !fonte) return;
    if (document.hidden) {
      if (estado === 'tocando' || estado === 'muda') {
        pausadaPelaAba = true;
        void ctx.suspend().catch(() => {});
      }
    } else if (pausadaPelaAba) {
      pausadaPelaAba = false;
      void ctx.resume().catch(() => {});
    }
  };

  /** Solta ouvintes e contexto. Com `suave`, a música sai num fade curto. */
  const liberar = (suave: boolean) => {
    if (atual === trilha) atual = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', aoGesto, true);
      window.removeEventListener('keydown', aoGesto, true);
      document.removeEventListener('visibilitychange', aoMudarAba);
    }
    const c = ctx;
    ctx = null;
    if (!c) return;
    c.onstatechange = null;
    const fechar = () => {
      try { fonte?.stop(); } catch { /* já parada */ }
      void c.close().catch(() => {});
    };
    if (suave && mestre && c.state === 'running') {
      try {
        const g = mestre.gain;
        const t = c.currentTime;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0, t + SAIDA_S);
        setTimeout(fechar, SAIDA_S * 1000 + 50);
        return;
      } catch { /* cai no fechamento direto */ }
    }
    fechar();
  };

  const trilha: Trilha = {
    get estado() { return estado; },

    alternarSom() {
      if (estado === 'bloqueada') { mudo = false; destravar(); return; }
      if (!ctx || !mestre || (estado !== 'tocando' && estado !== 'muda')) return;
      mudo = !mudo;
      const g = mestre.gain;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(mudo ? 0 : 1, t + 0.25);
      mudar(tocandoOuMuda());
    },

    parar() {
      if (estado === 'parada') return;
      const tocava = estado === 'tocando' || estado === 'muda';
      estado = 'parada';
      liberar(tocava);
    },
  };
  atual = trilha;

  const Fabrica = fabrica();
  if (!Fabrica || typeof fetch === 'undefined') { mudar('indisponivel'); return trilha; }
  try {
    ctx = new Fabrica();
  } catch {
    mudar('indisponivel');
    return trilha;
  }
  const contexto = ctx;

  // O `resume()` pode ficar pendente até o navegador deixar; quem avisa que
  // deixou é o próprio contexto.
  contexto.onstatechange = () => {
    if (estado === 'bloqueada' && contexto.state === 'running') mudar(tocandoOuMuda());
  };
  window.addEventListener('pointerdown', aoGesto, true);
  window.addEventListener('keydown', aoGesto, true);
  document.addEventListener('visibilitychange', aoMudarAba);

  void (async () => {
    try {
      const resposta = await fetch(arquivo);
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const bytes = await resposta.arrayBuffer();
      if (parou()) return;
      // Na hospedagem, um arquivo que não existe volta como o index.html, com
      // 200: é a decodificação que recusa, e aí a trilha fica indisponível.
      const musica = await contexto.decodeAudioData(bytes);
      if (parou()) return;

      const trecho = Math.min(TRECHO_S, musica.duration);
      const envelope = contexto.createGain();
      mestre = contexto.createGain();
      mestre.gain.value = mudo ? 0 : 1;
      fonte = contexto.createBufferSource();
      fonte.buffer = musica;
      fonte.loop = true;
      fonte.loopStart = 0;
      fonte.loopEnd = trecho;
      fonte.connect(envelope);
      envelope.connect(mestre);
      mestre.connect(contexto.destination);

      // O relógio do contexto para enquanto ele está suspenso, então este
      // roteiro continua alinhado com a música mesmo que ela comece tarde.
      const t0 = contexto.currentTime;
      const g = envelope.gain;
      g.setValueAtTime(VOLUME_INICIAL, t0);
      g.linearRampToValueAtTime(VOLUME_ALVO, t0 + SUBIDA_S);
      if (trecho > 2 * RESPIRO_S + SUBIDA_S) {
        for (let volta = 1; volta <= EMENDAS_AGENDADAS; volta++) {
          const emenda = t0 + volta * trecho;
          g.setValueAtTime(VOLUME_ALVO, emenda - RESPIRO_S);
          g.linearRampToValueAtTime(VOLUME_INICIAL, emenda);
          g.linearRampToValueAtTime(VOLUME_ALVO, emenda + RESPIRO_S);
        }
      }
      fonte.start(t0);

      if (contexto.state === 'running') { mudar(tocandoOuMuda()); return; }
      mudar('bloqueada');
      // Com um gesto anterior na página (o clique do login), o navegador deixa.
      destravar();
    } catch {
      if (parou()) return;
      mudar('indisponivel');
      liberar(false);
    }
  })();

  return trilha;
}
