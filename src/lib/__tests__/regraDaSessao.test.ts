import { afterEach, describe, expect, it } from 'vitest';
import { isPaguePlay } from '@/lib/index';
import { definirRegraDaSessao, ouvirRegraDaSessao, regraDaSessao } from '@/lib/regraDoSetor';
import { limparVariantes, registrarVariantes } from '@/lib/variante';

afterEach(() => { definirRegraDaSessao(null); limparVariantes(); });

describe('isPaguePlay segue a regra do setor da pessoa logada', () => {
  it('sem regra registrada, segue a empresa', () => {
    expect(isPaguePlay('pagueplay')).toBe(true);
    expect(isPaguePlay('bookplay')).toBe(false);
  });

  it('setor Cofen numa empresa BookPlay segue o jeito PaguePlay', () => {
    definirRegraDaSessao({ slug: 'bookplay', regra: 'cofen' });
    expect(isPaguePlay('bookplay')).toBe(true);
  });

  it('setor Nosso produto numa empresa PaguePlay segue o jeito BookPlay', () => {
    registrarVariantes([{ slug: 'pagueplay', variante: 'pagueplay' }]);
    definirRegraDaSessao({ slug: 'pagueplay', regra: 'nosso_produto' });
    expect(isPaguePlay('pagueplay')).toBe(false);
  });

  it('a regra só vale para a empresa da pessoa', () => {
    definirRegraDaSessao({ slug: 'bookplay', regra: 'cofen' });
    expect(regraDaSessao('pagueplay')).toBeNull();
    expect(isPaguePlay('pagueplay')).toBe(true);
  });

  it('avisa quem escuta só quando a regra muda', () => {
    let avisos = 0;
    const parar = ouvirRegraDaSessao(() => { avisos += 1; });
    definirRegraDaSessao({ slug: 'bookplay', regra: 'cofen' });
    definirRegraDaSessao({ slug: 'bookplay', regra: 'cofen' });
    definirRegraDaSessao(null);
    parar();
    expect(avisos).toBe(2);
  });
});
