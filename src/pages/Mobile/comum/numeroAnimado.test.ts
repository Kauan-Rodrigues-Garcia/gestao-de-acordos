import { describe, expect, it } from 'vitest';
import { duracaoDaSubida, subirDevagar, suavizar, valorNoInstante } from './numeroAnimado';

describe('subida de «aposta» dos cards do operador', () => {
  it('dura mais quanto maior o salto, entre ~2 s e 3,2 s', () => {
    expect(duracaoDaSubida(100, 100)).toBe(0);
    expect(duracaoDaSubida(0, 5)).toBeGreaterThanOrEqual(1800);
    const dezenas = duracaoDaSubida(1_000, 1_050);
    const milhares = duracaoDaSubida(1_000, 6_000);
    const muito = duracaoDaSubida(0, 5_000_000);
    expect(dezenas).toBeLessThan(milhares);
    expect(milhares).toBeLessThan(muito);
    expect(muito).toBe(3_200);
    // A descida (pagamento que saiu) usa o tamanho do salto, não o sinal.
    expect(duracaoDaSubida(6_000, 1_000)).toBe(milhares);
  });

  it('sobe num ritmo mais constante que a curva padrão, e chega no alvo', () => {
    // No primeiro terço a curva padrão já andou quase 70%; a da aposta, bem menos.
    expect(suavizar(1 / 3)).toBeGreaterThan(0.69);
    expect(subirDevagar(1 / 3)).toBeLessThan(0.56);
    expect(subirDevagar(1)).toBe(1);
    expect(valorNoInstante(0, 1_000, 1, subirDevagar)).toBe(1_000);
    expect(valorNoInstante(0, 1_000, 0.5, subirDevagar)).toBe(750);
  });
});
