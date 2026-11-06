import { afterEach, describe, expect, it } from 'vitest';
import { criarFalasDosDuendes, quebrarFala, REPERTORIO_DUENDES } from './falasDosDuendes';
import { criarRodada, REPERTORIO } from '../../iglu/falas';
import { invasaoRecente, NOTICIA_FRESCA_MS, registrarInvasao } from '../../noticiaDoGrinch';

/** Um sorteio repetível. */
function sorteador(semente: number) {
  let s = semente;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

const todas = [
  ...REPERTORIO_DUENDES.CHEGADA, ...REPERTORIO_DUENDES.GRINCH, ...REPERTORIO_DUENDES.URSO,
  ...REPERTORIO_DUENDES.NATAL, ...REPERTORIO_DUENDES.FIM, ...Object.values(REPERTORIO_DUENDES.TRABALHO).flat(),
];

describe('as falas dos duendes', () => {
  it('toda fala cabe no balão: três linhas de até 22 letras', () => {
    for (const f of todas) {
      const linhas = quebrarFala(f);
      expect(linhas.length, f).toBeLessThanOrEqual(3);
      // uma palavra só pode passar de 22 se for maior que a linha; não há nenhuma assim
      for (const l of linhas) expect(l.length, f).toBeLessThanOrEqual(22);
    }
  });

  it('quebra sem cortar palavra e sem perder texto', () => {
    const f = 'Relatório pro Urso: janela, árvore, presentes…';
    expect(quebrarFala(f).join(' ')).toBe(f);
  });

  it('a chegada não repete até acabar o monte', () => {
    const falas = criarFalasDosDuendes(sorteador(7));
    const n = REPERTORIO_DUENDES.CHEGADA.length;
    const ditas = Array.from({ length: n }, () => falas.fala(0, 'chegada'));
    expect(new Set(ditas).size).toBe(n);
  });

  it('o da prancheta fala do Urso na maior parte das vezes', () => {
    const falas = criarFalasDosDuendes(sorteador(11));
    const urso = new Set<string>(REPERTORIO_DUENDES.URSO);
    const ditas = Array.from({ length: 40 }, () => falas.fala(2, 'trabalho'));
    expect(ditas.filter(f => urso.has(f)).length).toBeGreaterThan(20);
  });

  it('são muitas falas', () => {
    expect(todas.length).toBeGreaterThanOrEqual(80);
  });
});

describe('o Urso fica sabendo', () => {
  afterEach(() => { localStorage.clear(); });

  it('a notícia vale por três horas', () => {
    const agora = 1_800_000_000_000;
    expect(invasaoRecente(agora)).toBe(false);
    registrarInvasao(agora);
    expect(invasaoRecente(agora + 60_000)).toBe(true);
    expect(invasaoRecente(agora + NOTICIA_FRESCA_MS + 1)).toBe(false);
  });

  it('com a notícia fresca, a segunda conversa é a fofoca do Grinch', () => {
    const fofocas = new Set(REPERTORIO.FOFOCA_DO_GRINCH.map(c => c.join('|')));
    const r = criarRodada(null, 10, sorteador(3), true);
    r.proxima('pescando');
    expect(fofocas.has(r.proxima('pescando').join('|'))).toBe(true);
  });

  it('sem a notícia, nada de fofoca', () => {
    const fofocas = new Set(REPERTORIO.FOFOCA_DO_GRINCH.map(c => c.join('|')));
    for (let s = 1; s < 30; s++) {
      const r = criarRodada(null, 10, sorteador(s), false);
      for (let i = 0; i < 6; i++) expect(fofocas.has(r.proxima('pescando').join('|'))).toBe(false);
    }
  });
});
