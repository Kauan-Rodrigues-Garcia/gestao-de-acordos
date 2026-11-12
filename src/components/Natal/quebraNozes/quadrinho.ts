/**
 * O espetáculo em quadrinhos, para o modo leve (Cleber, 12/11/2026: «uma
 * posição por fala, para parecer como se fosse um quadrinho mesmo, passando as
 * falas»).
 *
 * É o MESMO espetáculo que o resto da cidade vê — as mesmas falas, na mesma
 * ordem, os mesmos cartões —, sem o que se mexe: ninguém entra andando, nada
 * balança, a mandíbula não bate. Cada fala é um quadro: os bonecos aparecem já
 * na pose daquela fala, com o que têm na mão, e o balão troca. Entre um quadro
 * e outro sobra só um pulinho de quem fala e o balão abrindo.
 *
 * Sai da folha de deixas pronta (`diretor.ts`), sem sortear nada de novo:
 *
 *   - o tempo morto (entradas, números, saídas) é cortado; fica o tempo de
 *     ler cada fala, e uma pausa curta entre elas;
 *   - a cada balão que abre, uma foto do estado dos dois bonecos naquele
 *     instante (lugar, pose, para onde olha, o que seguram);
 *   - do cenário ficam o chão, o tapete, as plaquinhas, a faixa e os cartões;
 *     caixa de presente, confete e noz saem (são coisas que voam);
 *   - dos sons, só a fanfarra da faixa (a nota de cada cartão é do palco).
 */
import type { Deixa, Enfeite, ItemDeMao, ItemDePeito, Lugar, Movimento, Pose, Quem } from './deixas';
import type { EspetaculoMontado } from './diretor';

/** Antes do primeiro quadro: o chão sobe e eles aparecem. */
const CHEGADA = 1.1;
/** Entre um quadro e outro, quando o original tinha tempo morto no meio. */
const PAUSA = 0.45;
/** Folga em volta de cada fala: o balão não abre nem fecha colado no corte. */
const ANTES = 0.1;
const DEPOIS = 0.3;
/** A mandíbula de quem fala, parada aberta (px). */
const BOCA = 5;
/** Onde cada um fica se falar antes de ter entrado. */
const MARCA: Record<Quem, number> = { a: -70, b: 70 };

interface Estado {
  mostra: boolean;
  x: Lugar | null;
  pose: Pose;
  olha: -1 | 0 | 1;
  itemD: ItemDeMao | null;
  itemE: ItemDeMao | null;
  peito: ItemDePeito | null;
  enfeite: Enfeite | null;
}

const estadoInicial = (): Estado => ({ mostra: false, x: null, pose: 'sentido', olha: 0, itemD: null, itemE: null, peito: null, enfeite: null });

function avancar(e: Estado, m: Movimento) {
  if (m.mostra !== undefined) e.mostra = m.mostra;
  if (m.x !== undefined) e.x = m.x;
  if (m.pose) e.pose = m.pose;
  if (m.olha !== undefined) e.olha = m.olha;
  if (m.itemD !== undefined) e.itemD = m.itemD;
  if (m.itemE !== undefined) e.itemE = m.itemE;
  if (m.peito !== undefined) e.peito = m.peito;
  if (m.enfeite !== undefined) e.enfeite = m.enfeite;
}

const arred = (n: number) => Math.round(n * 100) / 100;

export function emQuadrinhos(e: EspetaculoMontado): EspetaculoMontado {
  const deixas = e.deixas;

  // ── As falas: quando cada balão abre e fecha.
  const falas: { q: Quem; de: number; ate: number }[] = [];
  const aberta: Partial<Record<Quem, number>> = {};
  for (const d of deixas) {
    if (!('balao' in d)) continue;
    const { q, texto } = d.balao;
    const i = aberta[q];
    if (i !== undefined) { falas[i].ate = d.t; delete aberta[q]; }
    if (texto !== null) { aberta[q] = falas.length; falas.push({ q, de: d.t, ate: e.duracao }); }
  }
  if (falas.length === 0) return e;

  // ── Os trechos com alguém falando; o resto é tempo morto, e sai.
  const trechos: { de: number; ate: number; em: number }[] = [];
  for (const f of [...falas].sort((x, y) => x.de - y.de)) {
    const de = f.de - ANTES;
    const ate = f.ate + DEPOIS;
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && de <= ultimo.ate) ultimo.ate = Math.max(ultimo.ate, ate);
    else trechos.push({ de, ate, em: 0 });
  }
  let em = CHEGADA;
  for (const t of trechos) { t.em = em; em += t.ate - t.de + PAUSA; }
  const fimDasFalas = em - PAUSA;
  const fim = fimDasFalas + 0.5;

  /** A hora do original, na hora do quadrinho. O que cai no tempo morto vai para a beira do quadro seguinte. */
  const naHora = (t: number): number => {
    for (const trecho of trechos) {
      if (t < trecho.de) return arred(Math.max(0.3, trecho.em - 0.2));
      if (t <= trecho.ate) return arred(trecho.em + (t - trecho.de));
    }
    return arred(fim);
  };

  /** O estado dos dois logo depois da hora `t` do original. */
  const estadoEm = (t: number): Record<Quem, Estado> => {
    const estado: Record<Quem, Estado> = { a: estadoInicial(), b: estadoInicial() };
    for (const d of deixas) {
      if (d.t > t + 0.05) break;
      if ('m' in d) avancar(estado[d.q], d.m);
    }
    return estado;
  };

  const saida: Deixa[] = [];
  const emCena = new Set<Quem>();
  /** O que cada boneco já recebeu: o quadro seguinte só manda o que mudou. */
  const posto: Record<Quem, Record<string, string>> = { a: {}, b: {} };

  /** O quadro: cada boneco na pose daquele instante. Quem fala abre a boca e dá um pulinho. */
  const quadro = (tOriginal: number, t: number, quemFala: Quem | null) => {
    const estado = estadoEm(tOriginal);
    for (const q of ['a', 'b'] as const) {
      const s = estado[q];
      const fala = q === quemFala;
      // Quem fala aparece, mesmo que no original ainda estivesse escondido (dentro da caixa, descendo de paraquedas).
      const mostra = s.mostra || fala;
      if (!mostra) {
        if (emCena.has(q)) { saida.push({ t, q, m: { mostra: false } }); emCena.delete(q); posto[q] = {}; }
        continue;
      }
      // Quem está com o balão aberto continua de boca aberta.
      const falando = fala || falas.some(f => f.q === q && f.de <= tOriginal && f.ate > tOriginal + 0.05);
      const inteiro: Movimento = {
        mostra: true, x: s.x ?? MARCA[q], pose: s.pose, olha: s.olha,
        itemD: s.itemD, itemE: s.itemE, peito: s.peito, enfeite: s.enfeite,
        boca: falando ? BOCA : 0,
      };
      // Só o que mudou desde o quadro anterior: cada atributo trocado é estilo para recalcular.
      const m: Record<string, unknown> = {};
      for (const [campo, valor] of Object.entries(inteiro)) {
        const texto = JSON.stringify(valor);
        if (posto[q][campo] === texto) continue;
        posto[q][campo] = texto;
        m[campo] = valor;
      }
      if ('x' in m) m.dur = 0;
      if (fala) m.reacao = 'quadro';
      emCena.add(q);
      if (Object.keys(m).length > 0) saida.push({ t, q, m: m as Movimento });
    }
  };

  saida.push({ t: 0, cena: { veu: true } });
  // Eles chegam já no lugar e na pose do primeiro quadro, de boca fechada.
  quadro(falas[0].de, 0.35, null);

  for (const d of deixas) {
    if ('m' in d) continue;
    if ('balao' in d) {
      const t = naHora(d.t);
      if (d.balao.texto !== null) quadro(d.t, t, d.balao.q);
      saida.push({ t, balao: d.balao });
      continue;
    }
    const c = d.cena;
    // O véu é daqui; o que voa e o que cai não entra no quadrinho.
    if ('veu' in c || 'caixa' in c || 'confete' in c || 'noz' in c) continue;
    if ('som' in c && c.som !== 'fanfarra') continue;
    saida.push({ t: naHora(d.t), cena: c });
  }

  for (const q of ['a', 'b'] as const) if (emCena.has(q)) saida.push({ t: arred(fim), q, m: { mostra: false, boca: 0 } });
  saida.push({ t: arred(fim), cena: { veu: false } });

  const ordenadas = saida.map((d, i) => ({ d, i })).sort((x, y) => x.d.t - y.d.t || x.i - y.i).map(({ d }) => d);
  return { ...e, deixas: ordenadas, duracao: arred(fim + 1), resumo: ['em quadrinhos', ...e.resumo] };
}
