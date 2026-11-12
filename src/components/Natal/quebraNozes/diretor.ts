/**
 * O diretor dos quebra-nozes: monta a folha de deixas de cada aparição.
 *
 * Pedido do Cleber (12/11/2026): «várias coisas aleatórias; toda vez que eles
 * aparecerem, parecer algo diferente» — e a cidade inteira vendo a mesma coisa
 * na mesma hora. Então nada aqui é gravado à mão, e nada usa `Math.random`: o
 * espetáculo é MONTADO a partir de uma semente (cidade + dia + número da
 * aparição). Mesma semente, mesmo espetáculo, em qualquer computador.
 *
 * Uma aparição é:  entrada  →  conversa (e, às vezes, um número)  →  saída.
 *
 *   9 entradas   marcha, um de cada lado, caixas de presente, o atrasado, tapete
 *                vermelho, paraquedas, a corda que acaba, o escorregão, o que espia
 *   6 números    a noz do dia (8 surpresas), fanfarra, troca de guarda, luneta,
 *                brinde, sino com aviso
 *   5 saídas     marcha, cada um para um lado, alçapão, o esquecido, pirueta
 *   3 formações  a dupla, só o diretor, só o head
 *
 * Entrada, conversa e número saem de BARALHOS (`cartaDoBaralho`): nada repete
 * até o baralho acabar. O resto (quem fica de que lado, quem lidera, o enfeite
 * do chapéu, a pose de cada fala, o tique de quem escuta, as pausas) é sorteio
 * comum. Dá bem mais de dez mil aparições diferentes antes de uma se repetir
 * inteira.
 *
 * A chamada dos destaques é outro espetáculo, mais solene: entrada, a faixa,
 * um cartão por setor, a festa, o fecho. Para não ser a mesma todo dia
 * (Cleber, 12/11/2026: «toda vez que chamar ter uma diferente»), ela tem
 *
 *   5 cerimônias   lida do pergaminho; os dois se revezando; com suspense e
 *                  rufar de tambor; anunciada pelo sino; anunciada pela corneta
 *   5 finais       palmas e confete; salva de continência; a «ola»; o brinde;
 *                  a fanfarra
 *
 * e tudo dela (entrada, abertura, cerimônia, final, fecho) sai de baralhos:
 * a de hoje nunca é a de ontem.
 *
 * O boletim é uma aparição que, no lugar da conversa, diz quem mais recebeu
 * até aquela hora (`Pedido.lider`), com o cartão da pessoa.
 *
 * As falas sabem a hora (`Pedido.hora`): «bom dia», «boa tarde», «boa noite».
 *
 * Os sons do que se vê (o sino balançando, o tambor, a corneta, as palmas, a
 * caixa caindo) não são marcados à mão: `Roteiro.fim` lê a folha pronta e põe
 * cada som na hora do gesto, com a duração do gesto.
 */
import { EPOCA } from '../musica';
import type { Cena, Deixa, Enfeite, Espetaculo, Lugar, Mexe, Movimento, Pose, Quem, SomDeCena, Surpresa } from './deixas';
import type { Cidade } from './elenco';
import {
  ABERTURAS, ATRASOS, AVISOS, BOLETINS, BRINDES, CAIXAS, CHAMADAS, CONVERSAS, CORDAS, DESPEDIDAS, DESPEDIDAS_SOLO, ESCORREGOES,
  FANFARRAS, FECHAMENTOS, LUNETA, MONOLOGOS, NOZ_ANTES, NOZ_DEPOIS, PARAQUEDAS, REVELACOES, SUSPENSES, TROCAS, VIVAS,
  type Conversa, type Opcoes, type Resposta,
} from './falas';
import { cartaDoBaralho, criarSorteio, sementeDe, type Sorteio } from './sorteio';

export interface Destaque {
  setor: string;
  /** O primeiro nome (ou nome e sobrenome curtos). */
  nome: string;
  foto: string | null;
  /** Uma linha pequena embaixo do nome («12 acordos»). Opcional. */
  feito?: string;
  /** É do setor de quem está olhando: o cartão ganha um contorno. */
  meu?: boolean;
}

export type TipoDeEspetaculo = 'parabens' | 'aparicao';
export type Formacao = 'dupla' | 'a' | 'b';
export type Entrada = 'marcha' | 'lados' | 'caixas' | 'atrasado' | 'tapete' | 'paraquedas' | 'corda' | 'escorrega' | 'espia';
export type Numero = 'noz' | 'fanfarra' | 'troca' | 'luneta' | 'brinde' | 'sino';
export type Saida = 'marcha' | 'lados' | 'alcapao' | 'esquecido' | 'pirueta';

export const ENTRADAS: readonly Entrada[] = ['marcha', 'lados', 'caixas', 'atrasado', 'tapete', 'paraquedas', 'corda', 'escorrega', 'espia'];
export const ENTRADAS_SOLO: readonly Entrada[] = ['marcha', 'caixas', 'paraquedas', 'escorrega', 'espia'];
/** As da chamada dos destaques: as solenes e mais algumas, para variar de um dia para o outro. */
export const ENTRADAS_DA_CHAMADA: readonly Entrada[] = ['tapete', 'lados', 'marcha', 'caixas', 'paraquedas', 'espia', 'atrasado', 'escorrega'];
export type Cerimonia = 'pergaminho' | 'revezamento' | 'suspense' | 'sino' | 'corneta';
export const CERIMONIAS: readonly Cerimonia[] = ['pergaminho', 'revezamento', 'suspense', 'sino', 'corneta'];
/** Com muitos setores, só as que não gastam tempo antes de cada cartão. */
const CERIMONIAS_CORRIDAS: readonly Cerimonia[] = ['pergaminho', 'revezamento'];
export type Final = 'confete' | 'salva' | 'ola' | 'brinde' | 'fanfarra';
export const FINAIS: readonly Final[] = ['confete', 'salva', 'ola', 'brinde', 'fanfarra'];
export const NUMEROS: readonly Numero[] = ['noz', 'fanfarra', 'troca', 'luneta', 'brinde', 'sino'];
export const NUMEROS_SOLO: readonly Numero[] = ['noz', 'luneta', 'sino'];
export const SAIDAS: readonly Saida[] = ['marcha', 'lados', 'alcapao', 'esquecido', 'pirueta'];
export const SAIDAS_SOLO: readonly Saida[] = ['marcha', 'alcapao', 'pirueta'];
const SURPRESAS: readonly Surpresa[] = ['estrela', 'coracao', 'nota', 'floco', 'presente', 'poeira', 'moeda', 'confete'];
const ENFEITES: readonly (Enfeite | null)[] = [null, 'azevinho', 'estrela', 'floco', 'sininho', 'azevinho'];

export interface Pedido {
  tipo: TipoDeEspetaculo;
  cidade: Cidade;
  /** O dia, contado da época do Natal (`agenda.ts`). */
  dia: number;
  /** O número da aparição no dia (0, 1, 2…). */
  indice: number;
  nomes: Record<Quem, { nome: string; artigo: 'o' | 'a' }>;
  destaques?: readonly Destaque[];
  /** O dia dos destaques, como se diz: «ontem» (o padrão) ou «sexta», na chamada de segunda-feira. */
  quando?: string;
  /** A hora em que sobem (0 a 23, de Brasília): decide entre bom dia, boa tarde e boa noite. Padrão: 10. */
  hora?: number;
  /** O boletim: quem mais recebeu até agora. Com ele, a aparição anuncia a pessoa no lugar da conversa. */
  lider?: Destaque | null;
  /** Só para o laboratório: escolhe em vez de sortear. */
  forcar?: {
    formacao?: Formacao; entrada?: Entrada; numero?: Numero | 'nenhum'; saida?: Saida; conversa?: number;
    cerimonia?: Cerimonia; final?: Final;
  };
}

export interface EspetaculoMontado extends Espetaculo {
  formacao: Formacao;
  /** O diretor ficou do lado direito (os balões trocam de lado). */
  troca: boolean;
}

/** A distância de cada um até o centro do palco, na dupla. */
const MARCA = 70;
const PASSO = 72;
const CORRIDA = 150;

const arred = (n: number) => Math.round(n * 100) / 100;

/** Quanto tempo o balão fica: o bastante para ler sem pressa. */
export function duracaoDaFala(texto: string): number {
  return arred(Math.min(5.8, Math.max(1.7, 1.2 + texto.length * 0.062)));
}

/** De que lado da tela fica um lugar (para saber para onde ele olha andando). */
function ladoDe(lugar: Lugar): number {
  if (typeof lugar === 'number') return lugar;
  if (lugar === 'esq') return -9999;
  if (lugar === 'dir') return 9999;
  return lugar[0] === 'esq' ? -9000 + lugar[1] : 9000 - lugar[1];
}

class Roteiro {
  deixas: Deixa[] = [];
  t = 0;
  resumo: string[] = [];
  marca: Record<Quem, number>;
  lugar: Record<Quem, Lugar> = { a: 'esq', b: 'dir' };
  tapete = false;

  constructor(readonly s: Sorteio, readonly em: readonly Quem[], readonly troca: boolean, readonly trocar: (texto: string) => string) {
    const sozinho = em.length === 1;
    this.marca = sozinho ? { a: 0, b: 0 } : troca ? { a: MARCA, b: -MARCA } : { a: -MARCA, b: MARCA };
  }

  get dupla() { return this.em.length === 2; }
  par(q: Quem): Quem | null { return this.dupla ? (q === 'a' ? 'b' : 'a') : null; }
  /** Para que lado `q` olha para ver o outro (0 sozinho). */
  praOutro(q: Quem): -1 | 0 | 1 {
    const p = this.par(q);
    if (!p) return 0;
    return ladoDe(this.lugar[p]) < ladoDe(this.lugar[q]) ? -1 : 1;
  }
  coxiaDe(q: Quem): 'esq' | 'dir' { return this.marca[q] < 0 || (this.marca[q] === 0 && this.s.chance(0.5)) ? 'esq' : 'dir'; }

  g(q: Quem, m: Movimento, atraso = 0) { this.deixas.push({ t: arred(this.t + atraso), q, m }); }
  todos(m: Movimento, atraso = 0) { for (const q of this.em) this.g(q, m, atraso); }
  cena(cena: Cena, atraso = 0) { this.deixas.push({ t: arred(this.t + atraso), cena }); }
  balao(q: Quem, texto: string | null, atraso = 0) { this.deixas.push({ t: arred(this.t + atraso), balao: { q, texto } }); }
  espera(s: number) { this.t = arred(this.t + s); }

  /** Anda até `para`. Devolve quanto demora; não avança o relógio. */
  anda(q: Quem, para: Lugar, o: { vel?: 1 | 2; dur?: number; atraso?: number; m?: Movimento } = {}): number {
    const de = this.lugar[q];
    const vel = o.vel ?? 1;
    const dur = arred(o.dur ?? (typeof de === 'number' && typeof para === 'number'
      ? Math.max(0.5, Math.abs(para - de) / (vel === 2 ? CORRIDA : PASSO)) : 3));
    const olha = ladoDe(para) < ladoDe(de) ? -1 : 1;
    this.g(q, { x: para, dur, olha, anda: vel, ...o.m }, o.atraso ?? 0);
    this.lugar[q] = para;
    return dur;
  }
  /** Para de andar: a batida de pé, de frente para a plateia. */
  chega(q: Quem, atraso = 0, m: Movimento = {}) { this.g(q, { anda: 0, olha: 0, reacao: 'alto', ...m }, atraso); }

  /** Entra em cena pela coxia, marchando até a marca. Devolve quanto demora. */
  entra(q: Quem, de: 'esq' | 'dir', o: { vel?: 1 | 2; dur?: number; atraso?: number; m?: Movimento; ate?: Lugar } = {}): number {
    const atraso = o.atraso ?? 0;
    this.g(q, { mostra: true, x: de, dur: 0, pose: 'sentido', olha: de === 'esq' ? 1 : -1, ...o.m }, atraso);
    this.lugar[q] = de;
    return this.anda(q, o.ate ?? this.marca[q], { vel: o.vel, dur: o.dur ?? 3.1, atraso: atraso + 0.06 }) + 0.06;
  }

  /** Uma pose para falar, quando a fala não pede nenhuma. */
  poseDeFala(q: Quem): Pose {
    const aponta: Pose = this.praOutro(q) < 0 ? 'aponta-e' : 'aponta-d';
    const opcoes: (readonly [Pose, number])[] = [['sentido', 3], ['descanso', 3], ['cintura', 2], ['ombros', 0.5]];
    if (this.dupla) opcoes.push([aponta, 0.8]);
    return this.s.pesado(opcoes);
  }

  /** Um tique de quem escuta: pequeno, e nunca muda a pose. */
  tique(q: Quem, dur: number) {
    const quando = this.s.entre(0.3, Math.max(0.4, dur - 1.3));
    const qual = this.s.int(7);
    if (qual === 0) this.g(q, { gesto: 'sim' }, quando);
    else if (qual === 1) this.g(q, { gesto: 'inclina' }, quando);
    else if (qual === 2) { this.g(q, { chave: 1 }, quando); this.g(q, { chave: 0 }, quando + 1.4); }
    else if (qual === 3) { this.g(q, { pe: true }, quando); this.g(q, { pe: false }, quando + 1.1); }
    else if (qual === 4) { this.g(q, { olha: 0 }, quando); this.g(q, { olha: this.praOutro(q) }, quando + 0.9); }
    else if (qual === 5) this.g(q, { reacao: 'estufa' }, quando);
    // 6: fica quieto.
  }

  /** Uma reação. Devolve quanto demora; quem muda de pose volta sozinho ao sentido. */
  reage(q: Quem, como: Resposta, atraso = 0): number {
    const volta = (dur: number, m: Movimento = {}) => { this.g(q, { pose: 'sentido', mexe: null, ...m }, atraso + dur); return dur; };
    switch (como) {
      case 'riso': this.g(q, { reacao: 'riso', emote: this.s.escolher(['ha!', 'haha', 'kkk', 'hehe']) }, atraso); return 1.2;
      case 'susto': this.g(q, { reacao: 'susto', emote: '!' }, atraso); return 0.9;
      case 'sim': this.g(q, { gesto: 'sim' }, atraso); return 0.9;
      case 'nao': this.g(q, { gesto: 'nao' }, atraso); return 0.9;
      case 'estufa': this.g(q, { reacao: 'estufa', pose: 'cintura' }, atraso); return volta(1.4);
      case 'pulinho': this.g(q, { reacao: 'pulinho', pose: 'bracos-cima', emote: '★' }, atraso); return volta(1);
      case 'vergonha': this.g(q, { pose: 'cobre-rosto', emote: '💧' }, atraso); return volta(1.5);
      case 'duvida': this.g(q, { gesto: 'inclina', emote: '?' }, atraso); return 1.1;
      case 'aplauso': this.g(q, { pose: 'aplaude', mexe: 'aplauso' }, atraso); return volta(1.5);
      case 'continencia': this.g(q, { pose: 'continencia' }, atraso); return volta(1.2);
      case 'ombros': this.g(q, { pose: 'ombros' }, atraso); return volta(1.1);
      case 'giro': this.g(q, { reacao: 'giro' }, atraso); return 0.9;
      case 'olha-cima': this.g(q, { gesto: 'olha-cima' }, atraso); return 1.2;
      case 'tremor': this.g(q, { reacao: 'tremor', emote: '❄' }, atraso); return 1.3;
    }
  }

  /** `q` vai até `p`, dá corda nele, e `p` estica como mola. */
  daCorda(q: Quem, p: Quem) {
    const lado = this.praOutro(q);
    this.g(q, { pose: lado < 0 ? 'da-corda-e' : 'da-corda-d', mexe: 'corda', olha: lado });
    this.g(p, { chave: 2 }, 0.2);
    this.espera(1.5);
    this.g(q, { pose: 'sentido', mexe: null, olha: 0 });
    this.g(p, { ritmo: 'rapido', pose: 'bracos-cima', reacao: 'mola', emote: '!', chave: 1, olha: 0 });
    this.espera(0.8);
    this.g(p, { ritmo: null, pose: 'sentido' });
    this.g(p, { chave: 0 }, 1.6);
  }

  /** Uma fala: o balão, a mandíbula, quem escuta, e a reação no fim. */
  fala(q: Quem, bruto: string, o: Opcoes & { olha?: -1 | 0 | 1; curta?: boolean } = {}) {
    const texto = this.trocar(bruto);
    const calado = texto === '…';
    const dur = calado ? 1.5 : o.curta ? Math.min(1.5, duracaoDaFala(texto)) : duracaoDaFala(texto);
    const p = this.par(q);
    if (o.fx === 'ajeita') {
      this.g(q, { pose: 'chapeu', gesto: 'inclina' });
      this.espera(1);
    }
    const m: Movimento = {
      fala: calado ? 0 : (1 + this.s.int(3)) as 1 | 2 | 3,
      pose: o.pose ?? this.poseDeFala(q),
      olha: o.olha ?? (this.s.chance(0.4) ? 0 : this.praOutro(q)),
      itemD: o.item ?? null,
    };
    if (o.mexe) m.mexe = o.mexe;
    if (calado) m.emote = '…';
    this.g(q, m);
    this.balao(q, calado ? null : texto);
    if (o.fx === 'espirro') {
      this.g(q, { gesto: 'espirro' }, 0.5);
      if (p) this.g(p, { reacao: 'susto', emote: '!' }, 1.4);
    }
    if (p) {
      this.g(p, { ouve: true, olha: this.praOutro(p) });
      if (!o.fx && dur > 2.3 && this.s.chance(0.45)) this.tique(p, dur);
    }
    this.espera(dur);
    this.g(q, { fala: 0, mexe: o.mexe ? null : undefined });
    this.balao(q, null);
    if (p) this.g(p, { ouve: false });

    // O que vem logo depois da fala.
    if (o.fx === 'murcha') {
      this.g(q, { ritmo: 'lento', pose: 'sem-corda', chave: 0, emote: 'zzz', olha: 0 });
      this.espera(1.5);
      this.g(q, { ritmo: null }, 0.1);
      return;
    }
    if (o.fx === 'da-corda' && p) { this.daCorda(q, p); return; }
    if (o.fx === 'acenam') {
      this.todos({ pose: 'tchau', mexe: 'aceno', olha: 0 });
      this.espera(1.7);
      this.todos({ pose: 'sentido', mexe: null });
      this.espera(0.3);
      return;
    }
    let pausa = this.s.entre(0.25, 0.55);
    if (o.r && p) pausa = Math.max(pausa, this.reage(p, o.r) * 0.75);
    if (o.eu) pausa = Math.max(pausa, this.reage(q, o.eu, o.r ? 0.15 : 0) * 0.85);
    this.espera(pausa);
  }

  /** Uma conversa inteira. `s` é quem está sozinho. */
  conversa(linhas: Conversa, sozinho?: Quem) {
    for (const [quem, texto, opcoes] of linhas) {
      const q: Quem = quem === 's' ? (sozinho ?? this.em[0]) : quem;
      if (!this.em.includes(q)) continue;
      this.fala(q, texto, opcoes);
    }
    this.todos({ pose: 'sentido', olha: 0, itemD: null, mexe: null });
    this.espera(0.3);
  }

  fim(): Espetaculo {
    const deixas = emOrdem(this.deixas);
    return { deixas: emOrdem([...deixas, ...sonsDoQueSeVe(deixas)]), duracao: arred(this.t), resumo: this.resumo };
  }
}

function emOrdem(deixas: readonly Deixa[]): Deixa[] {
  return deixas.map((d, i) => ({ d, i })).sort((x, y) => x.d.t - y.d.t || x.i - y.i).map(({ d }) => d);
}

const SOM_DO_MEXE: Partial<Record<Mexe, SomDeCena>> = { sino: 'sino', tambor: 'tambor', corda: 'corda', aplauso: 'palmas' };

/**
 * Os sons que acompanham os gestos, tirados da folha pronta: o sino enquanto
 * a mão balança, o tambor enquanto as baquetas batem, a catraca da corda, as
 * palmas, a corneta quando vai à boca, a caixa de presente caindo e abrindo.
 * Cada um com a duração do gesto e o lugar do boneco (`x`).
 */
function sonsDoQueSeVe(deixas: readonly Deixa[]): Deixa[] {
  const sons: Deixa[] = [];
  const estado: Record<Quem, { x: number; mexe: Mexe | null; desde: number; corneta: boolean }> = {
    a: { x: 0, mexe: null, desde: 0, corneta: false },
    b: { x: 0, mexe: null, desde: 0, corneta: false },
  };
  const fechar = (q: Quem, t: number) => {
    const e = estado[q];
    const som = e.mexe ? SOM_DO_MEXE[e.mexe] : undefined;
    if (som && t - e.desde > 0.15) sons.push({ t: e.desde, cena: { som, dur: arred(t - e.desde), x: e.x } });
    e.mexe = null;
  };
  let fim = 0;
  for (const d of deixas) {
    fim = Math.max(fim, d.t);
    if ('cena' in d) {
      if ('caixa' in d.cena && d.cena.caixa.estado === 'cai') sons.push({ t: arred(d.t + 0.48), cena: { som: 'baque', x: d.cena.caixa.x } });
      if ('caixa' in d.cena && d.cena.caixa.estado === 'abre') sons.push({ t: d.t, cena: { som: 'pop', x: d.cena.caixa.x } });
      continue;
    }
    if (!('m' in d)) continue;
    const e = estado[d.q];
    if (typeof d.m.x === 'number') e.x = d.m.x;
    if (d.m.mexe !== undefined && d.m.mexe !== e.mexe) {
      fechar(d.q, d.t);
      if (d.m.mexe) { e.mexe = d.m.mexe; e.desde = d.t; }
    }
    if (d.m.mostra === false) fechar(d.q, d.t);
    if (d.m.itemD !== undefined) e.corneta = d.m.itemD === 'corneta';
    // A corneta toca quando vai à boca (a mesma pose serve para o gole da xícara, que é mudo).
    if (d.m.pose === 'corneta' && e.corneta) sons.push({ t: arred(d.t + 0.25), cena: { som: 'corneta', x: e.x } });
  }
  fechar('a', fim);
  fechar('b', fim);
  return sons;
}

// ── As entradas ─────────────────────────────────────────────────────────────

function entrarMarchando(r: Roteiro, solene: boolean, lado: 'esq' | 'dir' = r.s.escolher(['esq', 'dir'] as const)) {
  // Entra na frente quem vai mais longe.
  const ordem = [...r.em].sort((x, y) => (lado === 'esq' ? r.marca[y] - r.marca[x] : r.marca[x] - r.marca[y]));
  const bastao = solene || r.s.chance(0.45);
  const tambor = r.dupla && (solene || r.s.chance(0.4));
  let fim = 0;
  ordem.forEach((q, i) => {
    const atraso = i * 1.05;
    const m: Movimento = i === 0 && bastao ? { itemD: 'bastao', pose: 'aponta-cima', firme: true }
      : i === 1 && tambor ? { peito: 'tambor', pose: 'tambor', mexe: 'tambor', firme: true, itemD: 'baqueta', itemE: 'baqueta' } : {};
    const dur = r.entra(q, lado, { atraso, m, dur: 3.1 + i * 0.25 });
    r.chega(q, atraso + dur, { mexe: null });
    r.g(q, { pose: 'sentido', firme: false, itemD: null, itemE: null, peito: null }, atraso + dur + 0.55);
    fim = Math.max(fim, atraso + dur + 0.7);
  });
  r.espera(fim);
}

function entrarPelosLados(r: Roteiro) {
  let fim = 0;
  for (const q of r.em) {
    const dur = r.entra(q, r.coxiaDe(q), { dur: 3 });
    r.g(q, { anda: 0, reacao: 'alto', olha: r.praOutro(q) }, dur);
    fim = dur;
  }
  r.espera(fim + 0.35);
  if (r.dupla) {
    r.todos({ pose: 'continencia' });
    r.espera(1.1);
  }
  r.todos({ pose: 'sentido', olha: 0 });
  r.espera(0.4);
}

function entrarDeCaixa(r: Roteiro) {
  const ordem = r.s.embaralhar(r.em);
  ordem.forEach((q, i) => {
    r.cena({ caixa: { q, x: r.marca[q], estado: 'cai' } }, i * 0.45);
    r.g(q, { x: r.marca[q], dur: 0, olha: 0 }, i * 0.45);
    r.lugar[q] = r.marca[q];
  });
  r.espera(2.2 + (ordem.length - 1) * 0.45);
  ordem.forEach((q, i) => {
    const quando = i * 1.25;
    r.cena({ caixa: { q, x: r.marca[q], estado: 'abre' } }, quando);
    r.g(q, { mostra: true, salto: 'sobe', pose: 'bracos-cima', emote: i === 0 ? '★' : '♪' }, quando + 0.12);
    if (i === 1) r.g(ordem[0], { reacao: 'susto', emote: '!' }, quando + 0.3);
    r.cena({ caixa: { q, x: r.marca[q], estado: 'some' } }, quando + 1.1);
    r.g(q, { pose: 'sentido' }, quando + 1.2);
  });
  r.espera(ordem.length * 1.25 + 0.7);
  const [disse, ouviu] = r.s.escolher(CAIXAS);
  r.fala(ordem[ordem.length - 1], disse, { pose: 'bracos-cima', olha: 0 });
  if (r.dupla) r.fala(ordem[0], ouviu, { r: 'riso' });
}

function entrarAtrasado(r: Roteiro) {
  const [pontual, atrasado] = r.s.embaralhar(r.em);
  const dur = r.entra(pontual, r.coxiaDe(pontual), { dur: 3 });
  r.chega(pontual, dur);
  r.espera(dur + 0.6);
  // Olha o relógio, bate o pé, olha para onde o outro devia vir.
  r.g(pontual, { itemE: 'relogio', pose: 'relogio' });
  r.espera(1.5);
  const lado = r.coxiaDe(atrasado);
  r.g(pontual, { itemE: null, pose: 'cintura', pe: true, olha: lado === 'esq' ? -1 : 1, emote: '…' });
  r.espera(1.3);
  const corrida = r.entra(atrasado, lado, { vel: 2, dur: 1.5 });
  r.g(atrasado, { anda: 0, olha: 0, reacao: 'tropeco' }, corrida);
  r.g(pontual, { pe: false, olha: r.praOutro(pontual), gesto: 'nao' }, corrida + 0.2);
  r.espera(corrida + 1);
  const [desculpa, resposta] = r.s.escolher(ATRASOS);
  r.fala(atrasado, desculpa, { pose: 'ombros' });
  r.fala(pontual, resposta, { pose: 'cintura', r: 'vergonha' });
  r.todos({ pose: 'sentido', olha: 0 });
}

function entrarNoTapete(r: Roteiro) {
  const lado = r.s.escolher(['esq', 'dir'] as const);
  r.cena({ tapete: true });
  r.tapete = true;
  r.espera(1.1);
  entrarMarchando(r, true, lado);
}

function entrarDeParaquedas(r: Roteiro) {
  const ordem = r.s.embaralhar(r.em);
  const quemCai = ordem[0];
  const quemAnda = ordem[1] ?? null;
  if (quemAnda) {
    const dur = r.entra(quemAnda, r.coxiaDe(quemAnda), { dur: 2.8 });
    r.chega(quemAnda, dur);
    r.espera(dur + 0.5);
    r.g(quemAnda, { itemD: 'luneta', pose: 'luneta', gesto: 'olha-cima', emote: '?' });
    r.espera(0.7);
  }
  r.g(quemCai, { x: r.marca[quemCai], dur: 0, olha: 0 });
  r.lugar[quemCai] = r.marca[quemCai];
  r.g(quemCai, { mostra: true, salto: 'paraquedas', pose: 'equilibra' }, 0.05);
  r.espera(3.05);
  r.g(quemCai, { pose: 'sentido' });
  if (quemAnda) r.g(quemAnda, { itemD: null, pose: 'sentido', reacao: 'susto', emote: '!' }, 0.05);
  r.espera(0.8);
  const [disse, ouviu] = r.s.escolher(PARAQUEDAS);
  r.fala(quemCai, disse, { pose: 'cintura' });
  if (quemAnda) r.fala(quemAnda, ouviu, { r: 'ombros' });
}

function entrarSemCorda(r: Roteiro) {
  const [ajuda, semCorda] = r.s.embaralhar(r.em);
  const dur = r.entra(ajuda, r.coxiaDe(ajuda), { dur: 2.8 });
  r.chega(ajuda, dur);
  r.espera(dur + 0.3);
  // O outro vem devagar e para no meio do caminho.
  const lado = r.coxiaDe(semCorda);
  const parou: Lugar = [lado, 190];
  const ate = r.entra(semCorda, lado, { dur: 2.6, ate: parou, m: { chave: 1 } });
  r.g(ajuda, { olha: lado === 'esq' ? -1 : 1 }, 0.6);
  r.g(semCorda, { anda: 0, olha: 0, ritmo: 'lento', pose: 'sem-corda', chave: 0, emote: 'zzz' }, ate);
  r.espera(ate + 1.3);
  const [reclama, agradece] = r.s.escolher(CORDAS);
  r.g(ajuda, { gesto: 'nao', emote: '!' });
  r.espera(0.8);
  r.fala(ajuda, reclama, { pose: 'cintura', olha: lado === 'esq' ? -1 : 1 });
  const perto = r.anda(ajuda, [lado, 190 + 48], { vel: 2, dur: 1.9 });
  r.g(ajuda, { anda: 0 }, perto);
  r.espera(perto + 0.1);
  r.daCorda(ajuda, semCorda);
  const volta = r.anda(ajuda, r.marca[ajuda], { vel: 2, dur: 1.9 });
  r.chega(ajuda, volta);
  const vem = r.anda(semCorda, r.marca[semCorda], { vel: 2, dur: 2.1, atraso: 0.4 });
  r.chega(semCorda, vem + 0.4);
  r.espera(vem + 0.9);
  r.fala(semCorda, agradece, { pose: 'cintura', r: 'riso' });
}

function entrarEscorregando(r: Roteiro) {
  const ordem = r.s.embaralhar(r.em);
  const escorrega = ordem[0];
  const firme = ordem[1] ?? null;
  if (firme) {
    const dur = r.entra(firme, r.coxiaDe(firme), { dur: 2.8 });
    r.chega(firme, dur);
    r.espera(dur + 0.5);
  }
  const lado = r.coxiaDe(escorrega);
  const passou = r.marca[escorrega] + (lado === 'esq' ? 30 : -30);
  r.g(escorrega, { mostra: true, x: lado, dur: 0, pose: 'equilibra', olha: 0, emote: '!' });
  r.g(escorrega, { x: passou, dur: 1.7, curva: 'cubic-bezier(.08, .62, .3, 1)' }, 0.06);
  r.lugar[escorrega] = passou;
  r.g(escorrega, { reacao: 'tropeco' }, 1.5);
  if (firme) r.g(firme, { reacao: 'tropeco', emote: '!' }, 1.55);
  r.espera(2.3);
  r.g(escorrega, { x: r.marca[escorrega], dur: 0.5, curva: 'ease-out', pose: 'sentido' });
  r.lugar[escorrega] = r.marca[escorrega];
  r.espera(0.8);
  const [disse, ouviu] = r.s.escolher(ESCORREGOES);
  r.fala(escorrega, disse, { pose: 'ombros' });
  if (firme) r.fala(firme, ouviu, { r: 'riso' });
}

function entrarEspiando(r: Roteiro) {
  const curioso = r.s.escolher(r.em);
  const lado = r.coxiaDe(curioso);
  r.g(curioso, { mostra: true, x: lado, dur: 0, pose: lado === 'esq' ? 'espia-d' : 'espia-e', olha: 0 });
  r.g(curioso, { x: [lado, 50], dur: 0.7, curva: 'cubic-bezier(.2, .8, .3, 1)' }, 0.06);
  r.g(curioso, { emote: '?' }, 0.9);
  r.g(curioso, { gesto: 'inclina' }, 1.6);
  r.g(curioso, { x: lado, dur: 0.4, curva: 'ease-in' }, 2.7);
  r.g(curioso, { mostra: false }, 3.15);
  r.lugar[curioso] = lado;
  r.espera(3.7);
  if (r.dupla && r.s.chance(0.5)) entrarPelosLados(r);
  else entrarMarchando(r, false, lado);
}

const COMO_ENTRAR: Record<Entrada, (r: Roteiro) => void> = {
  marcha: r => entrarMarchando(r, false),
  lados: entrarPelosLados,
  caixas: entrarDeCaixa,
  atrasado: entrarAtrasado,
  tapete: entrarNoTapete,
  paraquedas: entrarDeParaquedas,
  corda: entrarSemCorda,
  escorrega: entrarEscorregando,
  espia: entrarEspiando,
};

// ── Os números ──────────────────────────────────────────────────────────────

function numeroDaNoz(r: Roteiro) {
  const quebra = r.s.escolher(r.em);
  const ajuda = r.par(quebra);
  const surpresa = r.s.escolher(SURPRESAS);
  r.resumo.push(`noz: ${surpresa}`);
  r.fala(quebra, r.s.escolher(NOZ_ANTES), { item: 'noz', pose: 'brinda', olha: 0 });
  // A noz vai para a boca: a mandíbula abre, a mão segura o queixo.
  r.g(quebra, { itemD: 'noz', pose: 'brinda', boca: 9, olha: 0 });
  r.espera(0.6);
  r.g(quebra, { itemD: null, pose: 'queixo' });
  if (ajuda) {
    r.g(ajuda, { pose: r.praOutro(ajuda) < 0 ? 'da-corda-e' : 'da-corda-d', mexe: 'corda', olha: r.praOutro(ajuda) });
    r.g(quebra, { chave: 2 }, 0.1);
  } else r.g(quebra, { chave: 2 });
  r.espera(1.2);
  // Fecha de uma vez: a casca voa e a surpresa sobe.
  r.g(quebra, { boca: 0, chave: 0, reacao: 'alto' });
  if (ajuda) r.g(ajuda, { pose: 'sentido', mexe: null });
  const x = typeof r.lugar[quebra] === 'number' ? (r.lugar[quebra] as number) : 0;
  r.cena({ noz: { x, surpresa } }, 0.05);
  if (surpresa === 'confete') r.cena({ confete: r.s.int(100000) }, 0.15);
  r.g(quebra, { pose: 'sentido' }, 0.5);
  r.espera(1.3);
  const [achou, comenta] = r.s.escolher(NOZ_DEPOIS[surpresa]);
  const triste = surpresa === 'poeira';
  r.fala(quebra, achou, { pose: triste ? 'ombros' : 'bracos-cima', eu: triste ? 'vergonha' : undefined, r: triste ? 'riso' : 'pulinho' });
  r.fala(ajuda ?? quebra, comenta, { r: ajuda ? 'sim' : undefined });
}

function numeroDaFanfarra(r: Roteiro) {
  const [corneta, tambor] = r.s.embaralhar(r.em);
  r.g(corneta, { itemD: 'corneta', pose: 'corneta', olha: 0, emote: '♪' });
  r.g(tambor, { peito: 'tambor', pose: 'tambor', mexe: 'tambor', itemD: 'baqueta', itemE: 'baqueta', olha: 0 });
  r.g(corneta, { emote: '♫' }, 1.1);
  r.g(tambor, { emote: '♪' }, 1.7);
  r.g(corneta, { emote: '♪' }, 2.3);
  r.espera(3.1);
  r.todos({ pose: 'sentido', mexe: null, itemD: null, itemE: null, peito: null });
  r.espera(0.4);
  r.conversa(r.s.escolher(FANFARRAS));
}

function numeroDaTroca(r: Roteiro) {
  r.cena({ placas: null });
  r.todos({ pose: 'continencia', olha: 0 });
  r.espera(1);
  r.todos({ pose: 'sentido' });
  const [frente, tras] = r.s.embaralhar(r.em);
  const destino = { [frente]: r.marca[tras], [tras]: r.marca[frente] } as Record<Quem, number>;
  const dur = r.anda(frente, destino[frente], { m: { frente: true } });
  r.anda(tras, destino[tras]);
  r.chega(frente, dur, { frente: false });
  r.chega(tras, dur);
  r.marca = { ...r.marca, ...destino };
  r.espera(dur + 0.4);
  r.todos({ pose: 'continencia' });
  r.espera(0.9);
  r.todos({ pose: 'sentido' });
  r.cena({ placas: { ...r.marca } }, 0.2);
  r.espera(0.5);
  r.conversa(r.s.escolher(TROCAS));
}

function numeroDaLuneta(r: Roteiro) {
  const vigia = r.s.escolher(r.em);
  const outro = r.par(vigia);
  const [ve, conta] = r.s.escolher(LUNETA);
  r.g(vigia, { itemD: 'luneta', pose: 'luneta', olha: -1 });
  r.g(vigia, { olha: 1 }, 0.9);
  r.g(vigia, { olha: 0 }, 1.8);
  r.espera(2.2);
  r.fala(vigia, ve, { item: 'luneta', pose: 'luneta', olha: 0 });
  r.fala(vigia, conta, { item: 'luneta', pose: 'luneta', olha: 0, r: outro ? r.s.escolher(['sim', 'riso', 'duvida'] as const) : undefined });
  r.todos({ pose: 'sentido', itemD: null, olha: 0 });
  r.espera(0.3);
}

function numeroDoBrinde(r: Roteiro) {
  r.todos({ itemD: 'xicara', pose: 'segura', olha: 0 });
  r.espera(0.7);
  for (const [quem, texto] of r.s.escolher(BRINDES)) {
    r.fala(quem as Quem, texto, { item: 'xicara', pose: 'brinda' });
    r.g(quem as Quem, { itemD: 'xicara' });
  }
  r.todos({ itemD: 'xicara', pose: 'brinda', olha: 0, emote: '♥' });
  r.cena({ som: 'brinde' }, 0.3);
  r.espera(0.9);
  r.todos({ pose: 'corneta', mexe: 'gole' });
  r.espera(1.6);
  r.todos({ pose: 'sentido', mexe: null, itemD: null });
  r.espera(0.4);
}

function numeroDoSino(r: Roteiro) {
  const arauto = r.s.escolher(r.em);
  const outro = r.par(arauto);
  const [chama, aviso] = r.s.escolher(AVISOS);
  r.g(arauto, { itemD: 'sino', pose: 'brinda', mexe: 'sino', olha: 0, emote: '♪' });
  if (outro) r.g(outro, { reacao: 'susto', emote: '!' }, 0.25);
  r.espera(1.5);
  r.g(arauto, { mexe: null });
  r.fala(arauto, chama, { item: 'sino', pose: 'brinda', olha: 0 });
  r.fala(arauto, aviso, { item: 'sino', pose: 'cintura', olha: 0, r: outro ? r.s.escolher(['sim', 'riso', 'continencia'] as const) : undefined });
  r.todos({ pose: 'sentido', itemD: null });
  r.espera(0.3);
}

const COMO_APRESENTAR: Record<Numero, (r: Roteiro) => void> = {
  noz: numeroDaNoz, fanfarra: numeroDaFanfarra, troca: numeroDaTroca, luneta: numeroDaLuneta, brinde: numeroDoBrinde, sino: numeroDoSino,
};

// ── As saídas ───────────────────────────────────────────────────────────────

function fecharCenario(r: Roteiro) {
  r.cena({ placas: null });
  if (r.tapete) { r.cena({ tapete: false }, 0.3); r.tapete = false; }
}

function sairMarchando(r: Roteiro, lado: 'esq' | 'dir' = r.s.escolher(['esq', 'dir'] as const)) {
  // Sai na frente quem está mais perto da coxia.
  const ordem = [...r.em].sort((x, y) => (lado === 'esq' ? r.marca[x] - r.marca[y] : r.marca[y] - r.marca[x]));
  let fim = 0;
  ordem.forEach((q, i) => {
    const dur = r.anda(q, lado, { dur: 3, atraso: i * 0.7 });
    r.g(q, { mostra: false }, i * 0.7 + dur + 0.05);
    fim = i * 0.7 + dur + 0.1;
  });
  r.espera(fim);
}

function sairPelosLados(r: Roteiro) {
  if (r.dupla) {
    for (const q of r.em) r.g(q, { pose: 'continencia', olha: r.praOutro(q) });
    r.espera(1.1);
    r.todos({ pose: 'sentido' });
    r.espera(0.3);
  }
  let fim = 0;
  for (const q of r.em) {
    const dur = r.anda(q, r.coxiaDe(q), { dur: 2.9 });
    r.g(q, { mostra: false }, dur + 0.05);
    fim = dur + 0.1;
  }
  r.espera(fim);
}

function sairPeloAlcapao(r: Roteiro) {
  r.em.forEach((q, i) => {
    const quando = i * 0.4;
    r.g(q, { pose: 'bracos-cima', salto: 'pulo' }, quando);
    r.g(q, { salto: 'desce' }, quando + 0.62);
    r.g(q, { mostra: false }, quando + 1.26);
  });
  r.espera(1.4 + (r.em.length - 1) * 0.4);
}

function sairEsquecido(r: Roteiro) {
  const [vai, fica] = r.s.embaralhar(r.em);
  const lado = r.s.escolher(['esq', 'dir'] as const);
  r.g(fica, { pose: 'tchau', mexe: 'aceno', olha: 0 });
  const dur = r.anda(vai, lado, { dur: 2.9 });
  r.g(vai, { mostra: false }, dur + 0.05);
  r.espera(dur + 0.5);
  // Percebe que ficou sozinho.
  r.g(fica, { mexe: null, pose: 'sentido', olha: lado === 'esq' ? -1 : 1 });
  r.g(fica, { olha: lado === 'esq' ? 1 : -1 }, 0.6);
  r.g(fica, { olha: lado === 'esq' ? -1 : 1, reacao: 'susto', emote: '!' }, 1.2);
  r.espera(2);
  const corrida = r.anda(fica, lado, { vel: 2, dur: 1.7 });
  r.g(fica, { mostra: false }, corrida + 0.05);
  r.espera(corrida + 0.1);
}

function sairDePirueta(r: Roteiro) {
  r.todos({ reacao: 'giro' });
  r.espera(0.9);
  r.todos({ pose: 'bracos-cima', reacao: 'pulinho' });
  r.espera(1.1);
  r.todos({ pose: 'sentido' });
  if (r.dupla) sairPelosLados(r); else sairMarchando(r);
}

const COMO_SAIR: Record<Saida, (r: Roteiro) => void> = {
  marcha: r => sairMarchando(r), lados: sairPelosLados, alcapao: sairPeloAlcapao, esquecido: sairEsquecido, pirueta: sairDePirueta,
};

// ── Os espetáculos ──────────────────────────────────────────────────────────

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Os dias úteis desde o começo do Natal (o dia 0 é um domingo). */
function diasUteisAte(dia: number): number {
  const resto = ((dia % 7) + 7) % 7;
  return Math.floor(dia / 7) * 5 + Math.min(5, Math.max(0, resto - 1));
}

/**
 * Onde este espetáculo está na fila. As três aparições marcadas do dia andam
 * em fila, de um dia útil para o outro. A chamada das dez anda um lugar por
 * dia útil. O que é chamado na hora tem a fila dele, e anda um lugar por
 * chamada. Dentro da fila, cada baralho anda uma carta por vez (`naFila`): a
 * conversa de hoje nunca é a da vez passada, e só volta depois de passarem
 * todas as outras.
 */
function lugarNosBaralhos(p: Pedido): { n: number; fila: string } {
  if (p.indice >= 1 && p.indice <= 3) return { n: diasUteisAte(p.dia) * 3 + p.indice - 1, fila: '' };
  if (p.indice === 0) return { n: diasUteisAte(p.dia), fila: ':dez' };
  return { n: p.indice, fila: ':avulsa' };
}

/**
 * A fila repartida em blocos do tamanho de `cartas`, cada bloco com as cartas
 * embaralhadas: diz a carta da posição `n` e quantas de um tipo já passaram
 * antes dela, na fila inteira — sem precisar percorrer a fila.
 *
 * É o que deixa cada baralho andar uma carta por vez. A conversa dos dois sai
 * de um baralho e o monólogo de outro: se cada um usasse o número da aparição,
 * pulava cartas (as aparições do outro), e pulando carta um baralho pode
 * repetir a anterior na virada da volta. Contando só as aparições de cada
 * formação, a de hoje nunca é a da vez passada.
 */
function naFila<T>(cartas: readonly T[], n: number, chave: string): { carta: T; antes: (conta: (carta: T) => boolean) => number } {
  const tamanho = cartas.length;
  const bloco = Math.floor(n / tamanho);
  const posicao = ((n % tamanho) + tamanho) % tamanho;
  const ordem = criarSorteio(sementeDe(chave, bloco)).embaralhar(cartas);
  return {
    carta: ordem[posicao],
    antes: conta => bloco * cartas.filter(conta).length + ordem.slice(0, posicao).filter(conta).length,
  };
}

/** De cada vinte aparições, catorze são dos dois, três só do diretor e três só do head. */
const FORMACOES_DA_FILA: readonly Formacao[] = [...Array<Formacao>(14).fill('dupla'), 'a', 'a', 'a', 'b', 'b', 'b'];
/** De cada cinco, três têm um número (a noz, a luneta, o brinde…). */
const TEM_NUMERO: readonly boolean[] = [true, true, true, false, false];

function trocador(p: Pedido, sozinho: Quem | null) {
  const { a, b } = p.nomes;
  const par = sozinho === 'a' ? b : a;
  const artigo = (n: { nome: string; artigo: 'o' | 'a' }) => `${n.artigo} ${n.nome}`;
  const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const hora = p.hora ?? 10;
  const [saudacao, umaSaudacao, periodo] = hora < 12 ? ['Bom dia', 'um bom dia', 'da manhã']
    : hora < 18 ? ['Boa tarde', 'uma boa tarde', 'da tarde'] : ['Boa noite', 'uma boa noite', 'da noite'];
  const ontem = p.quando ?? 'ontem';
  const mapa: Record<string, string> = {
    a: a.nome, b: b.nome, ob: artigo(b), Ob: maiuscula(artigo(b)),
    par: par.nome, opar: artigo(par), Opar: maiuscula(artigo(par)),
    // Eles falam com a «Cobrança», não com a cidade (Cleber, 12/11/2026).
    cidade: 'Cobrança',
    Saudacao: saudacao, saudacao: saudacao.toLowerCase(), umasaudacao: umaSaudacao, periodo,
    Mes: MESES[new Date(EPOCA + p.dia * 86_400_000).getUTCMonth()],
    ontem, Ontem: maiuscula(ontem),
    lider: p.lider?.nome ?? '', setorlider: p.lider?.setor ?? '',
  };
  return (texto: string) => texto.replace(/\{(\w+)\}/g, (tudo, chave: string) => mapa[chave] ?? tudo);
}

function vestir(r: Roteiro, p: Pedido) {
  for (const q of r.em) r.g(q, { enfeite: criarSorteio(sementeDe('enfeite', p.cidade, p.dia, q)).escolher(ENFEITES) });
}

function montarAparicao(p: Pedido, s: Sorteio): EspetaculoMontado {
  const { n, fila } = lugarNosBaralhos(p);
  const vez = naFila(FORMACOES_DA_FILA, n, `formacao:${p.cidade}${fila}`);
  // O boletim é sempre dos dois.
  const formacao: Formacao = p.forcar?.formacao ?? (p.lider ? 'dupla' : vez.carta);
  const em: Quem[] = formacao === 'dupla' ? ['a', 'b'] : [formacao];
  const sozinho = formacao === 'dupla' ? null : formacao;
  const r = new Roteiro(s, em, s.chance(0.5), trocador(p, sozinho));
  const chave = `${p.cidade}:${formacao === 'dupla' ? 'dupla' : 'solo'}${fila}`;
  // A vez desta formação: quantas aparições dela já passaram. É a posição nos baralhos dela.
  const m = vez.antes(carta => (carta === 'dupla') === (formacao === 'dupla'));
  // O boletim marcado é um por dia: os baralhos dele andam uma carta por dia útil.
  const nDoBoletim = p.indice >= 1 && p.indice <= 3 ? diasUteisAte(p.dia) : n;
  const boletim = p.lider && !sozinho ? cartaDoBaralho(BOLETINS.map((_, i) => i), nDoBoletim, `boletim:${chave}`) : null;

  const entrada = p.forcar?.entrada ?? (boletim === null
    ? cartaDoBaralho(sozinho ? ENTRADAS_SOLO : ENTRADAS, m, `entrada:${chave}`)
    : cartaDoBaralho(ENTRADAS, nDoBoletim, `entrada:${chave}:boletim`));
  const conversas = sozinho ? MONOLOGOS : CONVERSAS;
  const qual = p.forcar?.conversa ?? cartaDoBaralho(conversas.map((_, i) => i), m, `conversa:${chave}`);
  const comNumero = naFila(TEM_NUMERO, m, `tem-numero:${chave}`);
  const temNumero = p.forcar?.numero ? p.forcar.numero !== 'nenhum' : boletim === null && comNumero.carta;
  const numero = !temNumero ? null
    : p.forcar?.numero && p.forcar.numero !== 'nenhum' ? p.forcar.numero
    : cartaDoBaralho(sozinho ? NUMEROS_SOLO : NUMEROS, comNumero.antes(tem => tem), `numero:${chave}`);
  const saida = p.forcar?.saida ?? s.escolher(sozinho ? SAIDAS_SOLO : SAIDAS);
  r.resumo.push(`formação: ${formacao}${r.troca && !sozinho ? ' (trocados)' : ''}`, `entrada: ${entrada}`, boletim === null ? `conversa: nº ${qual}` : `boletim: nº ${boletim}`, `número: ${numero ?? '—'}`, `saída: ${saida}`);

  vestir(r, p);
  r.cena({ veu: true });
  r.espera(0.5);
  COMO_ENTRAR[entrada](r);
  r.todos({ pose: 'sentido', olha: 0, anda: 0 });
  r.cena({ placas: { ...(em.includes('a') ? { a: r.marca.a } : {}), ...(em.includes('b') ? { b: r.marca.b } : {}) } });
  r.espera(0.7);

  const numeroAntes = numero !== null && s.chance(0.4);
  if (numero && numeroAntes) COMO_APRESENTAR[numero](r);
  if (boletim !== null) {
    // O boletim: a conversa chama, a faixa desce, o cartão sobe com o nome, e os dois comentam.
    const { antes, anuncio, depois } = BOLETINS[boletim % BOLETINS.length];
    r.conversa(antes);
    r.cena({ letreiro: 'Cobrança' });
    r.cena({ som: 'fanfarra' }, 0.15);
    r.espera(1);
    r.cena({ cartao: 0 }, 0.3);
    r.fala(anuncio[0] as Quem, anuncio[1], { ...anuncio[2], olha: 0 });
    r.conversa(depois);
    r.cena({ cartoes: 'somem' });
    r.cena({ letreiro: null }, 0.3);
    r.espera(0.5);
  } else {
    r.conversa(conversas[qual % conversas.length], sozinho ?? undefined);
  }
  if (numero && !numeroAntes) COMO_APRESENTAR[numero](r);

  // A despedida e a saída.
  if (s.chance(0.75)) r.fala(s.escolher(em), cartaDoBaralho(sozinho ? DESPEDIDAS_SOLO : DESPEDIDAS, boletim === null ? m : nDoBoletim, `tchau:${chave}${boletim === null ? '' : ':boletim'}`), { pose: 'tchau', mexe: 'aceno', olha: 0 });
  r.todos({ pose: 'sentido', mexe: null, olha: 0 });
  fecharCenario(r);
  r.espera(0.4);
  COMO_SAIR[saida](r);
  r.cena({ veu: false });
  r.espera(1);
  return { ...r.fim(), formacao, troca: r.troca && !sozinho };
}

/** A festa depois do último cartão. */
function festejar(r: Roteiro, final: Final, leitor: Quem, outro: Quem) {
  const confete = (atraso: number) => r.cena({ confete: r.s.int(100000) }, atraso);
  switch (final) {
    case 'confete':
      r.todos({ pose: 'aplaude', mexe: 'aplauso', olha: 0 });
      confete(0.2);
      r.espera(2.2);
      break;
    case 'salva':
      r.todos({ pose: 'continencia', olha: 0 });
      r.espera(1.2);
      r.todos({ pose: 'bracos-cima', reacao: 'pulinho', emote: '★' });
      confete(0.1);
      r.espera(1.5);
      break;
    case 'ola':
      r.g(leitor, { reacao: 'giro', olha: 0 });
      r.g(outro, { reacao: 'giro', olha: 0 }, 0.35);
      r.espera(1.2);
      r.todos({ pose: 'bracos-cima', reacao: 'pulinho' });
      confete(0.1);
      r.espera(1.4);
      break;
    case 'brinde':
      r.todos({ itemD: 'xicara', pose: 'segura', olha: 0 });
      r.espera(0.7);
      r.todos({ itemD: 'xicara', pose: 'brinda', emote: '♥' });
      r.cena({ som: 'brinde' }, 0.3);
      r.espera(1.5);
      break;
    case 'fanfarra':
      r.g(leitor, { itemD: 'corneta', pose: 'corneta', olha: 0, emote: '♪' });
      r.g(outro, { peito: 'tambor', pose: 'tambor', mexe: 'tambor', itemD: 'baqueta', itemE: 'baqueta', olha: 0 });
      r.g(outro, { emote: '♫' }, 0.9);
      r.espera(2);
      r.todos({ pose: 'bracos-cima', mexe: null, itemD: null, itemE: null, peito: null });
      confete(0.1);
      r.espera(1.3);
      break;
  }
  r.todos({ pose: 'sentido', mexe: null, itemD: null, itemE: null, peito: null });
}

function montarParabens(p: Pedido, s: Sorteio, destaques: readonly Destaque[]): EspetaculoMontado {
  const em: Quem[] = ['a', 'b'];
  const r = new Roteiro(s, em, s.chance(0.5), trocador(p, null));
  // Entrada, abertura, cerimônia, final e fecho saem de baralhos: a de hoje não é a de ontem.
  const { n, fila } = lugarNosBaralhos(p);
  const chave = `${p.cidade}${fila}`;
  // Com muitos setores, o passo aperta.
  const corrido = destaques.length > 7;
  const entrada = p.forcar?.entrada ?? cartaDoBaralho(ENTRADAS_DA_CHAMADA, n, `solene:${chave}`);
  const cerimonia = p.forcar?.cerimonia ?? cartaDoBaralho(corrido ? CERIMONIAS_CORRIDAS : CERIMONIAS, n, `cerimonia:${chave}`);
  const final = p.forcar?.final ?? cartaDoBaralho(FINAIS, n, `final:${chave}`);
  const saida = p.forcar?.saida ?? s.escolher(['marcha', 'lados', 'pirueta'] as const);
  const leitor: Quem = s.chance(0.5) ? 'a' : 'b';
  const outro: Quem = leitor === 'a' ? 'b' : 'a';
  r.resumo.push('formação: dupla', `entrada: ${entrada}`, `cerimônia: ${cerimonia}`, `lê: ${leitor}`, `destaques: ${destaques.length}`, `final: ${final}`, `saída: ${saida}`);

  vestir(r, p);
  r.cena({ veu: true });
  r.espera(0.5);
  COMO_ENTRAR[entrada](r);
  r.todos({ pose: 'sentido', olha: 0, anda: 0 });
  r.cena({ placas: { ...r.marca } });
  r.espera(0.6);
  r.conversa(cartaDoBaralho(ABERTURAS, n, `abertura:${chave}`));

  // A faixa desce, e cada um pega o que vai usar.
  r.cena({ letreiro: 'Cobrança' });
  r.cena({ som: 'fanfarra' }, 0.15);
  r.g(leitor, { peito: 'pergaminho', pose: 'le', olha: 0 }, 0.4);
  if (cerimonia === 'suspense') r.g(outro, { peito: 'tambor', pose: 'tambor', itemD: 'baqueta', itemE: 'baqueta', olha: 0 }, 0.4);
  else if (cerimonia === 'sino') r.g(outro, { itemD: 'sino', pose: 'segura', olha: 0 }, 0.4);
  else if (cerimonia === 'corneta') r.g(outro, { itemD: 'corneta', pose: 'segura', olha: 0 }, 0.4);
  else r.g(outro, { pose: 'descanso', olha: r.praOutro(outro) }, 0.4);
  r.espera(1.5);

  const chamadas = s.embaralhar(CHAMADAS);
  const suspenses = s.embaralhar(SUSPENSES);
  const revelacoes = s.embaralhar(REVELACOES);
  const vivas = s.embaralhar(VIVAS);
  // Quem está com a mão ocupada não aplaude nem bate continência.
  const festas: readonly Resposta[] = cerimonia === 'pergaminho' || cerimonia === 'revezamento'
    ? ['aplauso', 'continencia', 'pulinho', 'aplauso', 'estufa', 'giro']
    : ['pulinho', 'riso', 'giro', 'pulinho', 'sim'];
  const comNomes = (texto: string, d: Destaque) => r.trocar(texto).replace('{setor}', d.setor).replace('{nome}', d.nome);

  destaques.forEach((d, i) => {
    // No revezamento, o pergaminho troca de mão a cada cartão.
    const quemLe = cerimonia === 'revezamento' && i % 2 === 1 ? outro : leitor;
    const quemFesteja = quemLe === leitor ? outro : leitor;
    if (cerimonia === 'revezamento' && i > 0) {
      r.g(quemFesteja, { peito: null, pose: 'descanso', olha: r.praOutro(quemFesteja) });
      r.g(quemLe, { peito: 'pergaminho', pose: 'le', olha: 0 }, 0.15);
      r.espera(0.5);
    }

    let texto = comNomes(chamadas[i % chamadas.length], d);
    if (cerimonia === 'suspense') {
      // Primeiro o setor, o tambor rufa, e só então o nome.
      const antes = comNomes(suspenses[i % suspenses.length], d);
      const dur = Math.max(1.4, duracaoDaFala(antes));
      r.g(quemLe, { fala: (1 + s.int(3)) as 1 | 2 | 3, pose: 'le', peito: 'pergaminho', olha: 0 });
      r.balao(quemLe, antes);
      r.g(quemFesteja, { pose: 'tambor', mexe: 'tambor', olha: 0 }, 0.25);
      r.espera(dur);
      r.g(quemLe, { fala: 0 });
      r.balao(quemLe, null);
      r.g(quemFesteja, { mexe: null });
      r.espera(0.2);
      texto = comNomes(revelacoes[i % revelacoes.length], d);
    } else if (cerimonia === 'sino') {
      r.g(quemFesteja, { pose: 'brinda', mexe: 'sino', olha: 0, emote: '♪' });
      r.espera(0.85);
      r.g(quemFesteja, { mexe: null, pose: 'segura' });
    } else if (cerimonia === 'corneta') {
      r.g(quemFesteja, { pose: 'corneta', olha: 0, emote: '♪' });
      r.espera(0.95);
      r.g(quemFesteja, { pose: 'segura' });
    }

    r.cena({ cartao: i });
    r.g(quemLe, { gesto: 'olha-cima' }, 0.1);
    r.espera(cerimonia === 'suspense' ? 0.2 : 0.5);
    const dur = corrido ? Math.min(2.2, duracaoDaFala(texto)) : duracaoDaFala(texto);
    r.g(quemLe, { fala: (1 + s.int(3)) as 1 | 2 | 3, pose: 'le', peito: 'pergaminho', olha: 0 });
    r.balao(quemLe, texto);
    // O outro comemora por cima, no fim do anúncio.
    const festa = s.escolher(festas);
    const quando = Math.max(0.6, dur - 1.1);
    const durou = r.reage(quemFesteja, festa, quando);
    r.balao(quemFesteja, vivas[i % vivas.length], quando);
    r.balao(quemFesteja, null, quando + Math.max(1.2, durou));
    r.espera(dur);
    r.g(quemLe, { fala: 0 });
    r.balao(quemLe, null);
    r.espera(corrido ? 0.5 : Math.max(0.7, quando + durou - dur + 0.2));
  });

  // A festa, e o fecho.
  r.todos({ peito: null, itemD: null, itemE: null, mexe: null, pose: 'sentido', olha: 0 });
  r.espera(0.3);
  festejar(r, final, leitor, outro);
  r.conversa(cartaDoBaralho(FECHAMENTOS, n, `fecho:${chave}`));
  r.cena({ cartoes: 'somem' });
  r.cena({ letreiro: null }, 0.3);
  fecharCenario(r);
  r.espera(0.8);
  COMO_SAIR[saida](r);
  r.cena({ veu: false });
  r.espera(1);
  return { ...r.fim(), formacao: 'dupla', troca: r.troca };
}

/** Monta o espetáculo. Mesmo pedido, mesmo espetáculo — em qualquer computador. */
export function montarEspetaculo(p: Pedido): EspetaculoMontado {
  const s = criarSorteio(sementeDe('quebra-nozes', p.tipo, p.cidade, p.dia, p.indice));
  const destaques = p.destaques ?? [];
  // Sem destaque para anunciar, a chamada vira uma aparição comum.
  return p.tipo === 'parabens' && destaques.length > 0 ? montarParabens(p, s, destaques) : montarAparicao(p, s);
}
