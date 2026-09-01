/**
 * O slug vira endereço digitado à mão atrás de uma TV. Cada caso aqui é um
 * jeito de o CHECK de `tv_telas` recusar o cadastro — e recusar com erro de
 * banco quem só digitou "Recepção" é o tipo de aspereza que faz alguém desistir
 * da ferramenta no primeiro uso.
 */
import { describe, it, expect } from 'vitest';
import { normalizarSlug } from './slug';

describe('normalizarSlug', () => {
  it('tira acento e mantém a letra', () => {
    expect(normalizarSlug('Recepção')).toBe('recepcao');
    expect(normalizarSlug('Manutenção')).toBe('manutencao');
  });

  it('espaço vira hífen', () => {
    expect(normalizarSlug('TV da Recepção')).toBe('tv-da-recepcao');
  });

  it('derruba maiúscula — não dá para ver Caps Lock num teclado atrás da TV', () => {
    expect(normalizarSlug('PLAY 3')).toBe('play-3');
  });

  it('não deixa hífen na ponta, que o CHECK recusa', () => {
    expect(normalizarSlug('  Play 5  ')).toBe('play-5');
    expect(normalizarSlug('--recepcao--')).toBe('recepcao');
    expect(normalizarSlug('Play / Mix')).toBe('play-mix');
  });

  it('junta pontuação repetida num hífen só', () => {
    expect(normalizarSlug('Play 1 -- 3')).toBe('play-1-3');
    expect(normalizarSlug('Receptivo / Play 4')).toBe('receptivo-play-4');
  });

  it('corta em 40 e ainda assim não termina em hífen', () => {
    // O corte cru poderia deixar "...-" na ponta e reprovar no CHECK justamente
    // no nome comprido — que é quando ninguém desconfia do tamanho.
    const gerado = normalizarSlug('a'.repeat(38) + ' bc');
    expect(gerado.length).toBeLessThanOrEqual(40);
    expect(gerado.endsWith('-')).toBe(false);
  });

  it('entrada só de pontuação devolve vazio, e quem chama trata', () => {
    expect(normalizarSlug('///')).toBe('');
    expect(normalizarSlug('')).toBe('');
  });

  it('o que já está certo passa intacto', () => {
    expect(normalizarSlug('recepcao')).toBe('recepcao');
    expect(normalizarSlug('play-3')).toBe('play-3');
  });
});
