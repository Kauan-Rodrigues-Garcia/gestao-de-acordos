import { describe, expect, it } from 'vitest';
import type { Deixa } from './deixas';
import { CERIMONIAS, ENTRADAS, ENTRADAS_SOLO, FINAIS, NUMEROS, SAIDAS, montarEspetaculo, type Destaque, type Pedido } from './diretor';
import { emQuadrinhos } from './quadrinho';

const NOMES: Pedido['nomes'] = { a: { nome: 'Anderson', artigo: 'o' }, b: { nome: 'Jessica', artigo: 'a' } };
const DESTAQUES: Destaque[] = [
  { setor: 'Play 1', nome: 'Camila Souza', foto: null },
  { setor: 'Play 2', nome: 'Rafael Costa', foto: null },
  { setor: 'Receptivo', nome: 'Felipe Nunes', foto: null },
];
const pedido = (mais: Partial<Pedido> = {}): Pedido => ({ tipo: 'aparicao', cidade: 'birigui', dia: 12, indice: 1, nomes: NOMES, ...mais });

const falas = (deixas: readonly Deixa[]) => deixas.flatMap(d => ('balao' in d && d.balao.texto ? [`${d.balao.q}: ${d.balao.texto}`] : []));
const cartoes = (deixas: readonly Deixa[]) => deixas.flatMap(d => ('cena' in d && 'cartao' in d.cena ? [d.cena.cartao] : []));

/** O que todo quadrinho tem de cumprir. */
function conferir(p: Pedido, rotulo: string) {
  const inteiro = montarEspetaculo(p);
  const q = emQuadrinhos(inteiro);

  // As mesmas falas, na mesma ordem, e os mesmos cartões.
  expect(falas(q.deixas), `${rotulo}: falas`).toEqual(falas(inteiro.deixas));
  expect(cartoes(q.deixas), `${rotulo}: cartões`).toEqual(cartoes(inteiro.deixas));
  expect(q.formacao).toBe(inteiro.formacao);

  // Em ordem, dentro da duração, e nunca mais comprido que o original.
  for (let i = 1; i < q.deixas.length; i++) expect(q.deixas[i].t, `${rotulo}: fora de ordem`).toBeGreaterThanOrEqual(q.deixas[i - 1].t);
  for (const d of q.deixas) expect(d.t >= 0 && d.t <= q.duracao, `${rotulo}: hora ${d.t}`).toBe(true);
  expect(q.duracao, `${rotulo}: duração`).toBeLessThanOrEqual(inteiro.duracao + 0.01);

  // Nada que se repita, deslize ou voe.
  for (const d of q.deixas) {
    if ('m' in d) {
      const m = d.m;
      expect(m.anda || m.mexe || m.fala || m.salto || m.gesto || m.emote || m.ouve || m.chave || m.pe, `${rotulo}: movimento que se repete`).toBeFalsy();
      if (m.reacao) expect(m.reacao).toBe('quadro');
      if (m.x !== undefined) expect(m.dur, `${rotulo}: desliza`).toBe(0);
    } else if ('cena' in d) {
      expect('caixa' in d.cena || 'confete' in d.cena || 'noz' in d.cena, `${rotulo}: coisa que voa`).toBe(false);
      if ('som' in d.cena) expect(d.cena.som).toBe('fanfarra');
    }
  }

  // Quem fala está em cena, de boca aberta, e dá o pulinho do quadro.
  const emCena = { a: false, b: false };
  const boca = { a: 0, b: 0 };
  let pulou: Record<string, number> = {};
  for (const d of q.deixas) {
    if ('m' in d) {
      if (d.m.mostra !== undefined) emCena[d.q] = d.m.mostra;
      if (d.m.boca !== undefined) boca[d.q] = d.m.boca;
      if (d.m.reacao === 'quadro') pulou = { ...pulou, [d.q]: d.t };
    } else if ('balao' in d && d.balao.texto) {
      expect(emCena[d.balao.q], `${rotulo}: ${d.balao.q} fala fora de cena`).toBe(true);
      expect(boca[d.balao.q], `${rotulo}: ${d.balao.q} fala de boca fechada`).toBeGreaterThan(0);
      expect(pulou[d.balao.q], `${rotulo}: sem o pulinho do quadro`).toBe(d.t);
    }
  }

  // No fim ninguém fica no palco, nenhum balão fica aberto, e o véu desce.
  expect(emCena, `${rotulo}: ficou no palco`).toEqual({ a: false, b: false });
  for (const quem of ['a', 'b'] as const) {
    const dele = q.deixas.filter(d => 'balao' in d && d.balao.q === quem);
    const ultimo = dele[dele.length - 1];
    if (ultimo && 'balao' in ultimo) expect(ultimo.balao.texto, `${rotulo}: balão aberto`).toBeNull();
  }
  const veus = q.deixas.flatMap(d => ('cena' in d && 'veu' in d.cena ? [d.cena.veu] : []));
  expect(veus).toEqual([true, false]);
  return { inteiro, q };
}

describe('o espetáculo em quadrinhos (modo leve)', () => {
  it('as aparições de um mês, nas duas cidades, com e sem boletim', () => {
    for (const cidade of ['birigui', 'marilia'] as const) {
      for (let dia = 1; dia < 30; dia++) {
        for (const indice of [1, 2, 3]) conferir(pedido({ cidade, dia, indice }), `${cidade} ${dia}/${indice}`);
        conferir(pedido({ cidade, dia, indice: 2, hora: 15, lider: { setor: 'Play 5', nome: 'Larissa Lima', foto: null } }), `boletim ${cidade} ${dia}`);
      }
    }
  });

  it('toda entrada, todo número e toda saída', () => {
    for (const entrada of ENTRADAS) conferir(pedido({ forcar: { formacao: 'dupla', entrada } }), `entrada ${entrada}`);
    for (const entrada of ENTRADAS_SOLO) conferir(pedido({ forcar: { formacao: 'a', entrada } }), `entrada solo ${entrada}`);
    for (const numero of NUMEROS) conferir(pedido({ forcar: { formacao: 'dupla', numero } }), `número ${numero}`);
    for (const saida of SAIDAS) conferir(pedido({ forcar: { formacao: 'dupla', saida } }), `saída ${saida}`);
  });

  it('a chamada dos destaques, em toda cerimônia e todo final', () => {
    for (const cerimonia of CERIMONIAS) {
      for (const final of FINAIS) {
        const { q } = conferir(pedido({ tipo: 'parabens', indice: 0, destaques: DESTAQUES, forcar: { cerimonia, final } }), `${cerimonia}/${final}`);
        expect(cartoes(q.deixas)).toEqual([0, 1, 2]);
        // A faixa desce e sobe.
        expect(q.deixas.flatMap(d => ('cena' in d && 'letreiro' in d.cena ? [d.cena.letreiro] : []))).toEqual(['Cobrança', null]);
      }
    }
  });

  it('é bem mais curto: sai o tempo morto, fica o tempo de ler', () => {
    let inteiro = 0;
    let curto = 0;
    for (let dia = 1; dia < 20; dia++) {
      const r = conferir(pedido({ dia, forcar: { formacao: 'dupla' } }), `dia ${dia}`);
      inteiro += r.inteiro.duracao;
      curto += r.q.duracao;
      // Cada balão fica aberto o mesmo tempo que no original (o tempo de ler não muda).
      const aberto = (deixas: readonly Deixa[]) => {
        const tempos: number[] = [];
        const desde: Record<string, number> = {};
        for (const d of deixas) {
          if (!('balao' in d)) continue;
          if (desde[d.balao.q] !== undefined) { tempos.push(d.t - desde[d.balao.q]); delete desde[d.balao.q]; }
          if (d.balao.texto) desde[d.balao.q] = d.t;
        }
        return tempos;
      };
      const [no, original] = [aberto(r.q.deixas), aberto(r.inteiro.deixas)];
      expect(no).toHaveLength(original.length);
      no.forEach((tempo, i) => expect(Math.abs(tempo - original[i])).toBeLessThan(0.15));
    }
    expect(curto).toBeLessThan(inteiro * 0.8);
  });

  it('o mesmo espetáculo dá o mesmo quadrinho, e o que não tem fala fica como está', () => {
    const e = montarEspetaculo(pedido());
    expect(emQuadrinhos(e)).toEqual(emQuadrinhos(e));
    const mudo = { ...e, deixas: e.deixas.filter(d => !('balao' in d)) };
    expect(emQuadrinhos(mudo)).toBe(mudo);
  });
});
