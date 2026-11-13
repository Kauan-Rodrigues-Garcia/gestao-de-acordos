import { describe, expect, it } from 'vitest';
import { montarEspetaculo } from './diretor';
import { destaquesDeExemplo } from './exemplos';
import { falaTagarela, silabasDoTexto, tempoDeFalar } from './sons';

/** As falas de verdade de um mês de aparições e chamadas, nas duas cidades. */
function falasDoMes(): string[] {
  const falas: string[] = [];
  for (const cidade of ['birigui', 'marilia'] as const) {
    for (let dia = 0; dia < 22; dia++) {
      for (let indice = 0; indice < 4; indice++) {
        const { deixas } = montarEspetaculo({
          tipo: indice === 0 ? 'parabens' : 'aparicao', cidade, dia, indice,
          destaques: indice === 0 ? destaquesDeExemplo(cidade) : [], hora: 10 + indice * 2, lider: null,
          nomes: { a: { nome: 'Anderson', artigo: 'o' }, b: { nome: 'Jessica', artigo: 'a' } },
        } as Parameters<typeof montarEspetaculo>[0]);
        for (const d of deixas) if ('balao' in d && d.balao.texto) falas.push(d.balao.texto);
      }
    }
  }
  return falas;
}

describe('a vozinha dos quebra-nozes', () => {
  const falas = falasDoMes();

  it('tagarela em boa parte das falas, mas não em todas', () => {
    expect(falas.length).toBeGreaterThan(500);
    const comVoz = falas.filter(falaTagarela).length / falas.length;
    expect(comVoz).toBeGreaterThan(0.45);
    expect(comVoz).toBeLessThan(0.75);
  });

  it('cada sílaba do texto vira um pio com a vogal dela', () => {
    expect(silabasDoTexto('Bom dia, Cobrança!').map(s => s.vogal).join('')).toBe('oioaa');
    expect(silabasDoTexto('Bom dia')[0].consoante).toBe('estalo');
    expect(silabasDoTexto('Sorte')[0].consoante).toBe('sopro');
    expect(silabasDoTexto('…')).toEqual([]);
    // Respiro curto entre palavras, maior na vírgula.
    expect(silabasDoTexto('Bom dia, Cobrança!').map(s => s.depois)).toEqual(['palavra', 'virgula', 0, 0, 'virgula']);
  });

  it('o tagarelar dura o tempo da boca mexendo, sem passar do balão', () => {
    for (const f of falas.slice(0, 200)) {
      const falando = tempoDeFalar(f, 3);
      expect(falando).toBeGreaterThanOrEqual(0.45);
      expect(falando).toBeLessThanOrEqual(3 - 0.35);
    }
  });

  it('a mesma fala tagarela igual em todo computador', () => {
    for (const f of falas.slice(0, 50)) expect(falaTagarela(f)).toBe(falaTagarela(`${f}`));
  });
});
