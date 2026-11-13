/**
 * Os sons dos quebra-nozes: baixinhos, e cada um colado no que se vê.
 *
 * Pedido do Cleber (12/11/2026): «sons bonitos e sem atrapalhar o pessoal». E
 * depois de ouvir a primeira versão: a musiquinha de quando eles aparecem e
 * vão embora não agradou («quero outras coisas»), faltava «um sonzinho de sino
 * na animação que balança sino» e «uma mixagem melhor». Então:
 *
 *   sino         o sino de mão, uma badalada a cada balanço (dura o que o balanço durar)
 *   tambor       o rufar da caixa, enquanto as baquetas batem
 *   corneta      «tá-tá-TAAA», quando a corneta vai à boca
 *   corda        a catraca da chave de corda
 *   palmas       as palmas dos dois, de luva: abafadas
 *   baque / pop  a caixa de presente caindo, e abrindo
 *   noz          a casca estalando
 *   brinde       as xícaras se tocando
 *   fanfarra     a faixa dos destaques descendo (celesta)
 *   cartao       uma nota por destaque, cada uma um degrau acima
 *   viva         o acorde do confete, com guizos por cima
 *   vozinha      o tagarelar de bichinho de algumas falas (13/11)
 *   música       a musiquinha animada da chamada dos destaques (13/11)
 *
 * Tudo sintetizado (Web Audio), sem arquivo. A mixagem: cada som sai de onde o
 * boneco está (um pouco para a esquerda ou para a direita), passa por um
 * compressor — nada estoura, nada some — e uma parte vai para uma sala pequena
 * (reverberação), que é o que tira o som de «bipe de computador».
 *
 * Três chaves, todas precisam estar ligadas: o super_admin (Configurações ›
 * Geral, vale para todos), a pessoa (o botão ao lado do palco, vale neste
 * navegador) e o navegador, que só deixa tocar depois de um clique ou tecla
 * na página. Aba escondida fica calada.
 */
import { useSyncExternalStore } from 'react';
import type { SomDeCena } from './deixas';

export type Som = SomDeCena | 'cartao' | 'viva' | 'noz';
export const SONS: readonly Som[] = ['sino', 'tambor', 'corneta', 'corda', 'palmas', 'baque', 'pop', 'noz', 'brinde', 'fanfarra', 'cartao', 'viva'];

export interface OpcoesDoSom {
  /** No cartão, qual deles (cada um sobe um degrau). */
  n?: number;
  /** Quanto dura o que se repete (sino, tambor, corda, palmas), em segundos. */
  dur?: number;
  /** De onde vem, em px do centro do palco. */
  x?: number;
}

const CHAVE = 'natal:quebra-nozes:sons';
/** O teto de tudo: bem abaixo da rádio do Natal. */
const VOLUME = 0.12;
/** Quanto de cada som vai para a sala. */
const SALA = 0.2;

let ligados = (() => { try { return localStorage.getItem(CHAVE) !== 'off'; } catch { return true; } })();
/** O que o super_admin decidiu para todos (`configuracao.ts`). */
let permitidos = true;
const ouvintes = new Set<() => void>();

export function ligarSonsDosQuebraNozes(v: boolean) {
  ligados = v;
  try { localStorage.setItem(CHAVE, v ? 'on' : 'off'); } catch { /* modo privado */ }
  if (!v) pararMusicaDosDestaques();
  for (const f of ouvintes) f();
}

export function permitirSonsDosQuebraNozes(v: boolean) { permitidos = v; }

export function useSonsDosQuebraNozes(): boolean {
  return useSyncExternalStore(
    f => { ouvintes.add(f); return () => { ouvintes.delete(f); }; },
    () => ligados,
  );
}

let contexto: AudioContext | null = null;
let liberado = false;

/** O primeiro gesto da pessoa libera o som (regra do navegador). */
if (typeof window !== 'undefined') {
  const liberar = () => {
    liberado = true;
    if (contexto?.state === 'suspended') void contexto.resume();
    window.removeEventListener('pointerdown', liberar, true);
    window.removeEventListener('keydown', liberar, true);
  };
  window.addEventListener('pointerdown', liberar, true);
  window.addEventListener('keydown', liberar, true);
}

function ctx(): AudioContext | null {
  if (!ligados || !permitidos || !liberado || document.hidden) return null;
  if (!contexto) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    contexto = new C();
  }
  if (contexto.state === 'suspended') void contexto.resume();
  return contexto;
}

// ── A mesa ──────────────────────────────────────────────────────────────────

/** `voz`: a vozinha tem canal próprio (o compressor do resto a segurava baixa). */
interface Mesa { entrada: AudioNode; voz: AudioNode; sala: AudioNode; chiado: AudioBuffer }
const mesas = new WeakMap<BaseAudioContext, Mesa>();

/** Um ruído que não depende de `Math.random`: o mesmo em toda máquina. */
function ruido(c: BaseAudioContext, segundos: number, canais = 1): AudioBuffer {
  const buffer = c.createBuffer(canais, Math.floor(c.sampleRate * segundos), c.sampleRate);
  let a = 0x2f6e2b1;
  for (let canal = 0; canal < canais; canal++) {
    const dados = buffer.getChannelData(canal);
    for (let i = 0; i < dados.length; i++) {
      a = (Math.imul(a, 1664525) + 1013904223) | 0;
      dados[i] = (a >>> 8) / 8388608 - 1;
    }
  }
  return buffer;
}

/** A mesa de som deste contexto: compressor, volume geral e a sala. Feita uma vez. */
function mesaDe(c: BaseAudioContext): Mesa {
  const pronta = mesas.get(c);
  if (pronta) return pronta;

  const volume = c.createGain();
  volume.gain.value = VOLUME;
  const compressor = c.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 14;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.2;
  // Um corte suave no topo: tira o «vidro» dos agudos sintetizados.
  const brilho = c.createBiquadFilter();
  brilho.type = 'lowpass';
  brilho.frequency.value = 9500;
  brilho.Q.value = 0.3;
  compressor.connect(brilho).connect(volume).connect(c.destination);

  // A sala: ruído que morre em 1,3 s, mais escuro no fim.
  const resposta = ruido(c, 1.3, 2);
  for (let canal = 0; canal < 2; canal++) {
    const dados = resposta.getChannelData(canal);
    let anterior = 0;
    for (let i = 0; i < dados.length; i++) {
      const t = i / dados.length;
      const suave = anterior + (dados[i] - anterior) * (0.75 - 0.55 * t);
      anterior = suave;
      dados[i] = suave * Math.pow(1 - t, 2.6);
    }
  }
  const sala = c.createConvolver();
  sala.buffer = resposta;
  const volta = c.createGain();
  volta.gain.value = 0.55;
  sala.connect(volta).connect(compressor);

  // O canal da vozinha: um limitador só para ela, e o mesmo corte de agudos, direto na saída.
  const limitador = c.createDynamicsCompressor();
  limitador.threshold.value = -8;
  limitador.knee.value = 6;
  limitador.ratio.value = 8;
  limitador.attack.value = 0.002;
  limitador.release.value = 0.12;
  const volumeDaVoz = c.createGain();
  // Mais alta que o resto: a fala tem de se ouvir (Cleber, 13/11/2026: «tá muito baixo»).
  volumeDaVoz.gain.value = VOLUME * 1.8;
  const brilhoDaVoz = c.createBiquadFilter();
  brilhoDaVoz.type = 'lowpass';
  brilhoDaVoz.frequency.value = 9000;
  limitador.connect(brilhoDaVoz).connect(volumeDaVoz).connect(c.destination);

  const mesa: Mesa = { entrada: compressor, voz: limitador, sala, chiado: ruido(c, 1) };
  mesas.set(c, mesa);
  return mesa;
}

// ── Os instrumentos ─────────────────────────────────────────────────────────

// Dó maior, da oitava 5 para cima.
const DO5 = 523.25, RE5 = 587.33, MI5 = 659.25, SOL5 = 783.99, LA5 = 880, DO6 = 1046.5, RE6 = 1174.66, MI6 = 1318.51, SOL6 = 1567.98;
/** A escada dos cartões: pentatônica, sobe sem nunca desafinar. */
const ESCADA = [DO5, RE5, MI5, SOL5, LA5, DO6, RE6, MI6, SOL6];

/** Um som que morre sozinho: sobe em `ataque` e cai até sumir em `cauda`. */
function envelope(c: BaseAudioContext, saida: AudioNode, quando: number, pico: number, cauda: number, ataque = 0.004): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0, quando);
  g.gain.linearRampToValueAtTime(pico, quando + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, quando + ataque + cauda);
  g.connect(saida);
  return g;
}

function seno(c: BaseAudioContext, saida: AudioNode, freq: number, quando: number, pico: number, cauda: number, tipo: OscillatorType = 'sine', ate?: number) {
  const o = c.createOscillator();
  o.type = tipo;
  o.frequency.setValueAtTime(freq, quando);
  if (ate) o.frequency.exponentialRampToValueAtTime(ate, quando + cauda * 0.7);
  o.connect(envelope(c, saida, quando, pico, cauda));
  o.start(quando);
  o.stop(quando + cauda + 0.08);
}

/** Um sopro de ruído filtrado: a pele do tambor, a palma, a casca. */
function sopro(c: BaseAudioContext, saida: AudioNode, quando: number, pico: number, cauda: number, filtro: BiquadFilterType, freq: number, q = 0.8) {
  const fonte = c.createBufferSource();
  fonte.buffer = mesaDe(c).chiado;
  // Cada sopro começa num ponto do ruído: dois seguidos não soam iguais.
  const de = (quando * 7.31) % 0.8;
  const f = c.createBiquadFilter();
  f.type = filtro;
  f.frequency.value = freq;
  f.Q.value = q;
  fonte.connect(f).connect(envelope(c, saida, quando, pico, cauda, 0.002));
  fonte.start(quando, de, cauda + 0.06);
}

/** Uma nota de celesta: o seno, dois harmônicos leves por cima, e a cauda. */
function celesta(c: BaseAudioContext, saida: AudioNode, freq: number, quando: number, cauda: number, forca = 1) {
  for (const [mult, ganho, dura] of [[1, 0.6, 1], [2, 0.07, 0.6], [3, 0.1, 0.45], [4.2, 0.04, 0.25]] as const) {
    seno(c, saida, freq * mult, quando, ganho * forca, cauda * dura);
  }
}

/** Uma badalada do sino de mão: parciais de sino (não são harmônicos), cada uma com a sua cauda. */
function badalada(c: BaseAudioContext, saida: AudioNode, quando: number, forca = 1, f0 = 1396.9) {
  for (const [mult, ganho, cauda] of [[0.5, 0.1, 1.1], [1, 0.5, 1], [1.004, 0.3, 0.9], [2, 0.26, 0.6], [2.76, 0.2, 0.42], [4.07, 0.11, 0.3], [5.4, 0.06, 0.2]] as const) {
    seno(c, saida, f0 * mult, quando, ganho * forca, cauda);
  }
  // O badalo batendo no metal.
  sopro(c, saida, quando, 0.12 * forca, 0.012, 'highpass', 3000);
}

/** Um guizo: bolinhas de metal agudas, curtas, e o chocalhar. */
function guizo(c: BaseAudioContext, saida: AudioNode, quando: number, forca = 1, n = 0) {
  const parciais = [2793, 3520, 4186, 4699, 5588];
  parciais.forEach((f, i) => {
    // Cada guizo desafina um tico para um lado: nunca é o mesmo sino duas vezes.
    const desvio = 1 + (((n * 7 + i * 3) % 9) - 4) * 0.004;
    seno(c, saida, f * desvio, quando + i * 0.004, (0.16 - i * 0.02) * forca, 0.13 + (i % 2) * 0.06);
  });
  sopro(c, saida, quando, 0.1 * forca, 0.05, 'highpass', 6000);
}

/** Uma batida na caixa: a pele (ruído) e o corpo (um seno grave que cai). */
function batida(c: BaseAudioContext, saida: AudioNode, quando: number, forca = 1) {
  sopro(c, saida, quando, 0.34 * forca, 0.07, 'bandpass', 1900, 0.7);
  seno(c, saida, 196, quando, 0.22 * forca, 0.08, 'sine', 150);
}

/** Uma nota de corneta de brinquedo: dente de serra abafado, com um tremido no fim da nota longa. */
function sopradinha(c: BaseAudioContext, saida: AudioNode, freq: number, quando: number, dura: number, forca = 1) {
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(freq * 0.985, quando);
  o.frequency.linearRampToValueAtTime(freq, quando + 0.03);
  if (dura > 0.25) {
    const tremido = c.createOscillator();
    tremido.frequency.value = 5.5;
    const fundo = c.createGain();
    fundo.gain.setValueAtTime(0, quando);
    fundo.gain.linearRampToValueAtTime(freq * 0.008, quando + dura);
    tremido.connect(fundo).connect(o.frequency);
    tremido.start(quando);
    tremido.stop(quando + dura + 0.1);
  }
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(700, quando);
  f.frequency.linearRampToValueAtTime(1700, quando + 0.04);
  f.frequency.linearRampToValueAtTime(1100, quando + dura);
  const g = c.createGain();
  g.gain.setValueAtTime(0, quando);
  g.gain.linearRampToValueAtTime(0.2 * forca, quando + 0.025);
  g.gain.setValueAtTime(0.2 * forca, quando + Math.max(0.03, dura - 0.05));
  g.gain.linearRampToValueAtTime(0, quando + dura);
  o.connect(f).connect(g).connect(saida);
  o.start(quando);
  o.stop(quando + dura + 0.05);
}

/** Quantas vezes cabe o que se repete, sem passar de um teto. */
const vezes = (dur: number | undefined, passo: number, padrao: number, teto: number) =>
  Math.max(1, Math.min(teto, Math.round((dur ?? padrao) / passo)));

/**
 * Desenha um som no contexto, a partir de `t`. Separado de `tocarSom` para o
 * laboratório conseguir medir cada um num contexto fora do ar.
 */
export function desenharSom(c: BaseAudioContext, som: Som, t: number, o: OpcoesDoSom = {}) {
  const mesa = mesaDe(c);
  // De onde vem: o boneco da esquerda soa um pouco à esquerda.
  const lado = c.createStereoPanner();
  lado.pan.value = Math.max(-0.55, Math.min(0.55, (o.x ?? 0) / 420));
  const paraSala = c.createGain();
  paraSala.gain.value = SALA;
  lado.connect(mesa.entrada);
  lado.connect(paraSala).connect(mesa.sala);
  const s: AudioNode = lado;

  switch (som) {
    case 'sino': {
      // O balanço vai e volta a cada 0,2 s: uma badalada por ida, a da volta mais fraca.
      const n = vezes(o.dur, 0.2, 1.4, 12);
      for (let i = 0; i < n; i++) badalada(c, s, t + i * 0.2, i % 2 === 0 ? 0.6 : 0.36);
      break;
    }
    case 'tambor': {
      const n = vezes(o.dur, 0.1, 1.5, 40);
      for (let i = 0; i < n; i++) batida(c, s, t + i * 0.1, (i % 4 === 0 ? 0.85 : 0.5) * (0.6 + 0.4 * (i / n)));
      break;
    }
    case 'corneta':
      sopradinha(c, s, DO5, t, 0.1);
      sopradinha(c, s, DO5, t + 0.14, 0.1);
      sopradinha(c, s, SOL5, t + 0.28, 0.42);
      break;
    case 'corda': {
      const n = vezes(o.dur, 0.09, 1.3, 20);
      for (let i = 0; i < n; i++) {
        sopro(c, s, t + i * 0.09, 0.2, 0.014, 'highpass', 2200);
        seno(c, s, i % 2 ? 1250 : 1500, t + i * 0.09, 0.14, 0.02, 'triangle', 900);
      }
      break;
    }
    case 'palmas': {
      const n = vezes(o.dur, 0.34, 1.4, 8);
      // As mãos se encontram 0,17 s depois de o gesto começar, e daí a cada 0,34 s.
      // Cada palma são dois estalos colados: o corpo e o estalo.
      for (let i = 0; i < n; i++) {
        const quando = t + 0.17 + i * 0.34;
        sopro(c, s, quando, 0.62, 0.05, 'bandpass', 1150, 0.7);
        sopro(c, s, quando + 0.012, 0.4, 0.035, 'bandpass', 2100, 0.9);
      }
      break;
    }
    case 'baque':
      seno(c, s, 130, t, 0.7, 0.16, 'sine', 55);
      sopro(c, s, t, 0.25, 0.06, 'lowpass', 420);
      break;
    case 'pop':
      seno(c, s, 320, t, 0.4, 0.07, 'sine', 760);
      sopro(c, s, t, 0.1, 0.02, 'highpass', 2500);
      break;
    case 'noz':
      sopro(c, s, t, 0.4, 0.03, 'highpass', 2400);
      seno(c, s, 1500, t, 0.5, 0.07, 'triangle', 680);
      seno(c, s, 1100, t + 0.07, 0.3, 0.07, 'triangle', 500);
      break;
    case 'brinde':
      celesta(c, s, MI6, t, 0.9, 0.6);
      celesta(c, s, SOL6, t + 0.035, 1.1, 0.5);
      break;
    case 'fanfarra':
      [SOL5, DO6, MI6].forEach((f, i) => celesta(c, s, f, t + i * 0.16, 1.1));
      celesta(c, s, DO6, t + 0.62, 1.8, 0.8);
      celesta(c, s, SOL6, t + 0.62, 1.8, 0.5);
      break;
    case 'cartao': {
      const n = o.n ?? 0;
      celesta(c, s, ESCADA[((n % ESCADA.length) + ESCADA.length) % ESCADA.length], t, 1, 0.9);
      break;
    }
    case 'viva':
      [DO5, MI5, SOL5].forEach(f => celesta(c, s, f, t, 2, 0.7));
      [DO6, MI6, SOL6, MI6, SOL6].forEach((f, i) => celesta(c, s, f, t + 0.12 + i * 0.09, 0.9, 0.5));
      [0.5, 0.7, 0.5, 0.3].forEach((forca, i) => guizo(c, s, t + 0.1 + i * 0.15, forca * 0.7, i));
      break;
  }
  return lado;
}

let descanso = 0;

/**
 * Monta a mesa de som antes da hora. A primeira vez custa (o contexto de
 * áudio, o compressor, a resposta da sala): feita no primeiro som, era um
 * engasgo no meio do espetáculo. O palco chama enquanto ainda está escondido.
 */
export function prepararSonsDosQuebraNozes() {
  window.clearTimeout(descanso);
  const c = ctx();
  if (c) mesaDe(c);
}

/** Acabou o espetáculo: passadas as caudas, o áudio dorme (não fica uma linha de som aberta o dia inteiro). */
export function descansarSonsDosQuebraNozes() {
  window.clearTimeout(descanso);
  descanso = window.setTimeout(() => { if (contexto?.state === 'running') void contexto.suspend(); }, 6_000);
}

// ── A vozinha ───────────────────────────────────────────────────────────────
//
// Pedido do Cleber (13/11/2026): de vez em quando, enquanto o balão abre, um
// «bichinho falando», como nos jogos em que o diálogo vem com um tagarelar e
// não com voz de verdade. Na segunda rodada (mesmo dia): «mais fofinho, mais
// sincronizado e mais alto».
//
// O jeito escolhido é o do «animalese» (Animal Crossing): cada sílaba do
// próprio texto vira um pio curto, bem agudo, com o timbre da vogal dela — o
// «a» aberto, o «i» fininho, o «u» fechadinho —, como uma boca pequena
// falando rápido. Consoante de estalo (p, t, k…) ganha um tique; de sopro
// (s, x, f…), um chiadinho. A frase desce de leve e termina subindo na
// pergunta; a exclamação sobe e fica mais forte. O tagarelar dura o tempo da
// boca mexendo (a fala inteira, menos o finzinho de leitura).

/** DESLIGADA a pedido do Cleber (13/11/2026: «tira a voz dos quebra-nozes, urgente»). Para voltar, `true`. */
const VOZINHA_LIGADA = false;
/** Uma em cada quantas falas tagarela, mais ou menos (o resto fica só no balão). */
const CHANCE_DA_VOZINHA = 0.6;
/** O volume da vozinha sobre os outros sons (ela tem de se ouvir por cima da música). */
const VOLUME_DA_VOZINHA = 2.4;

/** Um número do texto: a mesma fala tagarela igual em todo computador. */
function numeroDoTexto(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Se esta fala ganha a vozinha. Exportada para os testes. */
export function falaTagarela(texto: string): boolean {
  return (numeroDoTexto(texto) % 1000) / 1000 < CHANCE_DA_VOZINHA;
}

type Vogal = 'a' | 'e' | 'i' | 'o' | 'u';
/** Os dois formantes de cada vogal, já numa «boca pequena» (uns 35% acima da voz adulta). */
const FORMANTES: Record<Vogal, readonly [number, number]> = {
  a: [1080, 1650], e: [680, 2500], i: [420, 3000], o: [700, 1250], u: [480, 1080],
};
const ESTALO = /[pbtdkgcq]/;
const SOPRO = /[szxfjvh]/;

export interface Silaba {
  vogal: Vogal;
  consoante: 'estalo' | 'sopro' | null;
  /** O respiro depois dela: fim de palavra (curto) ou vírgula/ponto (maior). */
  depois: 0 | 'palavra' | 'virgula';
}

/** O texto em sílabas faladas (uma por grupo de vogais), com os respiros entre palavras. Exportada para os testes. */
export function silabasDoTexto(texto: string): Silaba[] {
  const limpo = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const silabas: Silaba[] = [];
  for (const parte of limpo.split(/(\s+|[,.;:!?…]+)/)) {
    if (!parte) continue;
    const ultima = silabas[silabas.length - 1];
    if (/[,.;:!?…]/.test(parte)) { if (ultima) ultima.depois = 'virgula'; continue; }
    if (/^\s+$/.test(parte)) { if (ultima && !ultima.depois) ultima.depois = 'palavra'; continue; }
    for (const m of parte.replace(/[^a-z]+/g, '').matchAll(/([^aeiouy]*)([aeiouy]+)/g)) {
      const antes = m[1];
      const v = (m[2][0] === 'y' ? 'i' : m[2][0]) as Vogal;
      silabas.push({ vogal: v, consoante: ESTALO.test(antes) ? 'estalo' : SOPRO.test(antes) ? 'sopro' : null, depois: 0 });
    }
  }
  return silabas;
}

/** Quanto tempo a boca mexe numa fala de `duracao` s: quase o balão inteiro (sobra um respiro no fim). */
export function tempoDeFalar(texto: string, duracao: number): number {
  return Math.max(0.45, duracao - 0.35);
}

/** Quanto pesa cada respiro, em sílabas. */
const RESPIRO = { palavra: 0.45, virgula: 1.6 } as const;

/**
 * Um pio: dente de serra na altura da voz, passando por dois filtros nos
 * formantes da vogal (é isso que dá o «a», o «i»), com um seno por baixo para
 * ficar redondo. Começa um tico acima e escorrega para a nota.
 */
function pio(c: BaseAudioContext, saida: AudioNode, f0: number, s: Silaba, quando: number, dura: number, forca: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, quando);
  g.gain.linearRampToValueAtTime(forca, quando + 0.012);
  g.gain.setValueAtTime(forca, quando + dura * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, quando + dura);
  g.connect(saida);

  const fonte = c.createOscillator();
  fonte.type = 'sawtooth';
  fonte.frequency.setValueAtTime(f0 * 1.07, quando);
  fonte.frequency.exponentialRampToValueAtTime(f0, quando + 0.035);
  const [f1, f2] = FORMANTES[s.vogal];
  for (const [freq, ganho] of [[f1, 0.55], [f2, 0.32]] as const) {
    const filtro = c.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = freq;
    filtro.Q.value = 5;
    const v = c.createGain();
    v.gain.value = ganho;
    fonte.connect(filtro).connect(v).connect(g);
  }
  const corpo = c.createOscillator();
  corpo.type = 'sine';
  corpo.frequency.setValueAtTime(f0 * 1.07, quando);
  corpo.frequency.exponentialRampToValueAtTime(f0, quando + 0.035);
  const cv = c.createGain();
  cv.gain.value = 0.22;
  corpo.connect(cv).connect(g);
  for (const o of [fonte, corpo]) { o.start(quando); o.stop(quando + dura + 0.02); }

  if (s.consoante === 'estalo') sopro(c, saida, Math.max(0, quando - 0.004), 0.32 * forca, 0.009, 'bandpass', 3200, 1.2);
  if (s.consoante === 'sopro') sopro(c, saida, Math.max(0, quando - 0.018), 0.16 * forca, 0.024, 'highpass', 5200);
}

/**
 * O tagarelar de uma fala, na voz de quem fala (`voz`, em Hz), espalhado pelos
 * `falando` segundos em que a boca mexe. Sílaba demais para o tempo: fala mais
 * rápido, até um limite, e daí pula algumas.
 */
export function desenharVozinha(c: BaseAudioContext, texto: string, voz: number, t: number, x = 0, falando = tempoDeFalar(texto, 3)) {
  const mesa = mesaDe(c);
  const lado = c.createStereoPanner();
  lado.pan.value = Math.max(-0.5, Math.min(0.5, x / 420));
  const volume = c.createGain();
  volume.gain.value = VOLUME_DA_VOZINHA;
  const paraSala = c.createGain();
  paraSala.gain.value = SALA * 0.5;
  volume.connect(lado);
  lado.connect(mesa.voz);
  lado.connect(paraSala).connect(mesa.sala);

  let semente = numeroDoTexto(texto) || 1;
  const proximo = () => { semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0; return semente / 4294967296; };
  let silabas = silabasDoTexto(texto);
  if (silabas.length === 0) silabas = [{ vogal: 'a', consoante: null, depois: 0 }];
  // As sílabas e os respiros enchem o tempo da boca mexendo. Mais de uns 13 pios
  // por segundo vira chiado: sobrando sílaba, pula algumas.
  const peso = (lista: readonly Silaba[]) => lista.reduce((t, x, i) => t + 1 + (x.depois && i < lista.length - 1 ? RESPIRO[x.depois] : 0), 0);
  const cabem = Math.max(2, Math.floor(falando / 0.077));
  if (peso(silabas) > cabem) {
    const todas = silabas;
    const n = Math.max(2, Math.round(todas.length * cabem / peso(todas)));
    silabas = Array.from({ length: n }, (_, i) => todas[Math.floor(i * todas.length / n)]);
  }
  // Nem arrastado demais: no máximo 0,16 s por sílaba.
  const passo = Math.min(0.16, falando / peso(silabas));
  let quando = t;
  const pergunta = /\?\s*$/.test(texto);
  const exclama = /!\s*$/.test(texto);
  // Uma melodia de fala: degraus pequenos, que nunca desafinam.
  const DEGRAUS = [0, 2, 4, 2, 5, 0, 7, 4];
  silabas.forEach((s, i) => {
    const ultima = i === silabas.length - 1;
    const desce = 1 - 0.06 * (i / silabas.length);
    let semitom = DEGRAUS[Math.floor(proximo() * DEGRAUS.length)];
    if (ultima && pergunta) semitom = 9;
    if (ultima && exclama) semitom = 7;
    const f0 = voz * desce * Math.pow(2, semitom / 12);
    const forca = ultima && exclama ? 0.95 : 0.62 + proximo() * 0.28;
    pio(c, volume, f0, s, quando + (proximo() - 0.5) * passo * 0.15, Math.min(0.11, passo * 0.92), forca);
    quando += passo * (1 + (s.depois && !ultima ? RESPIRO[s.depois] : 0));
  });
  return lado;
}

/** A vozinha de uma fala, se for das que tagarelam e as três chaves deixarem. `duracao`: quanto o balão fica. */
export function tocarVozinha(texto: string, voz: number, x = 0, duracao = 3) {
  if (!VOZINHA_LIGADA || !falaTagarela(texto)) return;
  window.clearTimeout(descanso);
  const c = ctx();
  if (!c) return;
  const falando = tempoDeFalar(texto, duracao);
  const no = desenharVozinha(c, texto, voz, c.currentTime + 0.03, x, falando);
  window.setTimeout(() => no.disconnect(), (falando + 2) * 1000);
}

// ── A musiquinha dos destaques ─────────────────────────────────────────────
//
// Pedido do Cleber (13/11/2026): uma música animada enquanto os destaques vão
// sendo anunciados. Composta aqui (nada de música conhecida), em Dó maior a
// 126 batidas por minuto: baixo de «pom-pá», acordes leves nos tempos fracos,
// a melodia na celesta e um chocalho bem baixinho. Oito compassos que se
// repetem. Vai sendo marcada aos pouquinhos (um compasso à frente), então não
// pesa nada, e cala na hora em que a pessoa desliga o som.

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const BATIDA_S = 60 / 126;
const COLCHEIA_S = BATIDA_S / 2;
/** O volume da música, abaixo dos sons do espetáculo e da vozinha. */
const VOLUME_DA_MUSICA = 0.32;

/** Acorde de cada compasso: [baixo, terça, quinta] em MIDI (baixo na oitava 3). */
const ACORDES: readonly (readonly [number, number, number])[] = [
  [48, 64, 67], // Dó
  [45, 60, 64], // Lá menor
  [41, 57, 60], // Fá
  [43, 59, 62], // Sol
  [48, 64, 67], // Dó
  [45, 60, 64], // Lá menor
  [50, 62, 65], // Ré menor
  [43, 59, 62], // Sol
];
/** A melodia, em colcheias (MIDI; `0` = pausa). */
const MELODIA: readonly (readonly number[])[] = [
  [76, 79, 84, 79, 76, 0, 79, 0],
  [81, 84, 88, 84, 81, 0, 76, 0],
  [77, 81, 84, 81, 77, 0, 81, 84],
  [86, 0, 83, 0, 79, 0, 74, 0],
  [76, 79, 84, 88, 86, 84, 79, 0],
  [81, 0, 84, 0, 88, 86, 84, 0],
  [86, 0, 89, 0, 88, 86, 84, 81],
  [83, 0, 86, 0, 91, 0, 0, 0],
];

function desenharCompasso(c: BaseAudioContext, saida: AudioNode, k: number, t: number) {
  const [baixo, terca, quinta] = ACORDES[k % ACORDES.length];
  // O baixo: a fundamental no 1, a quinta no 3, de corda beliscada.
  seno(c, saida, midi(baixo), t, 0.5, 0.32, 'triangle');
  seno(c, saida, midi(baixo + 7), t + 2 * BATIDA_S, 0.42, 0.32, 'triangle');
  // Os acordes nos tempos 2 e 4, curtinhos.
  for (const b of [1, 3]) for (const m of [terca, quinta, terca + 12]) seno(c, saida, midi(m), t + b * BATIDA_S, 0.07, 0.16);
  // A melodia.
  MELODIA[k % MELODIA.length].forEach((m, i) => { if (m) celesta(c, saida, midi(m), t + i * COLCHEIA_S, 0.42, 0.42); });
  // O chocalho, nos contratempos.
  for (let i = 1; i < 8; i += 2) sopro(c, saida, t + i * COLCHEIA_S, 0.05, 0.035, 'highpass', 7000);
}

let musica: { parar: () => void } | null = null;

/** Começa a musiquinha (se as três chaves deixarem); seguir chamando com ela tocando não faz nada. */
export function tocarMusicaDosDestaques() {
  if (musica) return;
  const c = ctx();
  if (!c) return;
  window.clearTimeout(descanso);
  const mesa = mesaDe(c);
  const volume = c.createGain();
  volume.gain.setValueAtTime(0, c.currentTime);
  volume.gain.linearRampToValueAtTime(VOLUME_DA_MUSICA, c.currentTime + 0.6);
  volume.connect(mesa.entrada);
  const compasso = 4 * BATIDA_S;
  let proximo = c.currentTime + 0.1;
  let k = 0;
  let relogio = 0;
  const marcar = () => {
    // Desligou o som no meio: para já.
    if (!ligados || !permitidos) { parar(); return; }
    while (proximo < c.currentTime + compasso + 0.3) {
      desenharCompasso(c, volume, k++, proximo);
      proximo += compasso;
    }
    relogio = window.setTimeout(marcar, compasso * 500);
  };
  const parar = () => {
    window.clearTimeout(relogio);
    musica = null;
    const agora = c.currentTime;
    volume.gain.cancelScheduledValues(agora);
    volume.gain.setValueAtTime(volume.gain.value, agora);
    volume.gain.linearRampToValueAtTime(0, agora + 0.8);
    window.setTimeout(() => volume.disconnect(), 3_000);
  };
  musica = { parar };
  marcar();
}

/** Acaba a musiquinha, com um sumiço suave. */
export function pararMusicaDosDestaques() {
  musica?.parar();
}

/** Toca um som do espetáculo, se as três chaves deixarem. */
export function tocarSom(som: Som, o: OpcoesDoSom = {}) {
  window.clearTimeout(descanso);
  const c = ctx();
  if (!c) return;
  const no = desenharSom(c, som, c.currentTime + 0.03, o);
  // O nó não fica pendurado depois que as caudas acabam.
  window.setTimeout(() => no.disconnect(), ((o.dur ?? 0) + 5) * 1000);
}
