/**
 * tocador.ts — toca a trilha do lobby presa ao relógio da contagem (`trilha.ts`).
 *
 * O volume vai por um GainNode do Web Audio, e não pelo `audio.volume`: o
 * Safari do iPhone ignora o `volume` do elemento, e a subida em curva sumiria
 * no celular. O AnalyserNode no meio do caminho dá as barrinhas do
 * equalizador do painel, que mexem com a música de verdade.
 *
 * O relógio é de quem chama (`faltaS()`): no app, a hora do banco (`solta_em`);
 * no laboratório, a hora local. A cada `sincronizar()` a música confere onde
 * deveria estar e, se fugiu mais que a tolerância, pula para lá. Assim ela
 * fica junta em todas as telas, e a bruxa nasce no drop para todo mundo.
 *
 * Pedido de 16/10/2026: quando a bruxa morre, a música abaixa rápido e para
 * (`calar`), para não atrapalhar o som da morte e a conquista. Ela só toca na
 * espera e na luta.
 */
import { contextoDoLobby } from './audio';
import { posicaoDaMusica, precisaPular, volumeDaMusica } from './trilha';

export const ARQUIVO_TRILHA = '/sons/musica/the-mad-king.mp3';
export const NOME_TRILHA = 'The Mad King';
export const AUTOR_TRILHA = 'RokNardin';
/** Quanto leva para a música sumir quando a bruxa morre (s). */
export const SUMIR_NA_MORTE_S = 0.6;

export interface EstadoTocador {
  /** Tocando agora (com som ou desligada pelo botão). */
  tocando: boolean;
  /** A pessoa desligou a música no botão. */
  mudo: boolean;
  /** Onde a música está (s). */
  posicao: number;
  /** Onde ela deveria estar (s), ou null fora da janela da trilha. */
  alvo: number | null;
  /** O volume da curva agora (0..1), mesmo com o mudo ligado. */
  volume: number;
  /** A música acabou de vez (a bruxa morreu, fugiu ou a luta acabou). */
  calada: boolean;
}

export class TocadorTrilha {
  private audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private ganho: GainNode | null = null;
  private analisador: AnalyserNode | null = null;
  private bins: Uint8Array<ArrayBuffer> | null = null;
  private mudo = false;
  private calada = false;
  private ultimoVolume = 0;

  constructor(private readonly faltaS: () => number) {
    this.audio = new Audio(ARQUIVO_TRILHA);
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';
  }

  /**
   * Chamar DENTRO do clique de «Entrar no lobby»: o navegador só deixa tocar
   * som depois de um gesto da pessoa, e o AudioContext nasce suspenso fora dele.
   */
  destravar(): void {
    if (!this.ctx) {
      this.ctx = contextoDoLobby();
      if (!this.ctx) return;
      const fonte = this.ctx.createMediaElementSource(this.audio);
      this.ganho = this.ctx.createGain();
      this.ganho.gain.value = 0;
      this.analisador = this.ctx.createAnalyser();
      this.analisador.fftSize = 64;
      this.analisador.smoothingTimeConstant = 0.75;
      this.bins = new Uint8Array(new ArrayBuffer(this.analisador.frequencyBinCount));
      // O analisador antes do ganho: as barras mostram a música, não o volume
      // (com ela baixinha no começo, depois do ganho elas ficariam mortas).
      fonte.connect(this.analisador).connect(this.ganho).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch((): void => undefined);
    if (this.audio.readyState === 0) this.audio.load();
  }

  /** Chamar várias vezes por segundo: põe a música no ponto e no volume certos. */
  sincronizar(): void {
    if (!this.ctx || !this.ganho || this.calada) return;
    const falta = this.faltaS();
    const alvo = posicaoDaMusica(falta);
    if (alvo === null) {
      if (!this.audio.paused) this.audio.pause();
      return;
    }
    if (this.audio.paused) {
      this.audio.currentTime = alvo;
      void this.audio.play().catch(() => { /* sem gesto ainda: tenta de novo no próximo passo */ });
    } else if (precisaPular(this.audio.currentTime, alvo)) {
      this.audio.currentTime = alvo;
    }
    const volume = this.mudo ? 0 : volumeDaMusica(falta);
    if (Math.abs(volume - this.ultimoVolume) > 0.0005) {
      this.ganho.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.12);
      this.ultimoVolume = volume;
    }
  }

  alternarMudo(): boolean {
    this.mudo = !this.mudo;
    this.ultimoVolume = -1;
    this.sincronizar();
    return this.mudo;
  }

  /** A bruxa morreu (ou fugiu): a música some em `SUMIR_NA_MORTE_S` e para. */
  calar(): void {
    if (this.calada) return;
    this.calada = true;
    if (!this.ctx || !this.ganho) { this.audio.pause(); return; }
    const agora = this.ctx.currentTime;
    this.ganho.gain.cancelScheduledValues(agora);
    this.ganho.gain.setValueAtTime(this.ganho.gain.value, agora);
    this.ganho.gain.linearRampToValueAtTime(0, agora + SUMIR_NA_MORTE_S);
    setTimeout(() => this.audio.pause(), SUMIR_NA_MORTE_S * 1000 + 50);
  }

  /** Para uma nova rodada (laboratório). */
  rearmar(): void {
    this.calada = false;
    this.ultimoVolume = -1;
    if (this.ganho && this.ctx) {
      this.ganho.gain.cancelScheduledValues(this.ctx.currentTime);
      this.ganho.gain.setValueAtTime(0, this.ctx.currentTime);
    }
    this.audio.pause();
  }

  /** As barrinhas do equalizador (0..1), `n` faixas. Paradas sem som. */
  barras(n: number): number[] {
    if (!this.analisador || !this.bins || this.audio.paused || this.mudo || this.calada) return new Array(n).fill(0);
    this.analisador.getByteFrequencyData(this.bins);
    const util = Math.floor(this.bins.length * 0.7);
    return Array.from({ length: n }, (_, i) => {
      const a = Math.floor((i / n) * util), b = Math.max(a + 1, Math.floor(((i + 1) / n) * util));
      let s = 0;
      for (let k = a; k < b; k++) s += this.bins![k];
      return Math.min(1, s / (b - a) / 255);
    });
  }

  estado(): EstadoTocador {
    const falta = this.faltaS();
    return {
      tocando: !this.audio.paused,
      mudo: this.mudo,
      posicao: this.audio.currentTime,
      alvo: posicaoDaMusica(falta),
      volume: this.calada ? 0 : volumeDaMusica(falta),
      calada: this.calada,
    };
  }

  /** Tocando e com som (as barrinhas só mexem assim). */
  tocandoComSom(): boolean {
    return !!this.ctx && !this.audio.paused && !this.mudo && !this.calada;
  }

  /** O contexto é do lobby inteiro (`audio.ts`): aqui só desliga os fios desta trilha. */
  destruir(): void {
    this.audio.pause();
    this.ganho?.disconnect();
    this.analisador?.disconnect();
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}
