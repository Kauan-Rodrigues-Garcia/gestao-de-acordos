import { describe, it, expect } from 'vitest';
import { emGruposParalelos } from './emGruposParalelos';

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('emGruposParalelos', () => {
  it('processa todos os itens, uma vez cada', async () => {
    const vistos: number[] = [];
    await emGruposParalelos([1, 2, 3, 4, 5, 6, 7], n => String(n), 3, async n => { vistos.push(n); });
    expect(vistos.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('nunca passa do limite de grupos ao mesmo tempo', async () => {
    let agora = 0, pico = 0;
    await emGruposParalelos(Array.from({ length: 12 }, (_, i) => i), n => String(n), 4, async () => {
      agora++; pico = Math.max(pico, agora);
      await esperar(5);
      agora--;
    });
    expect(pico).toBe(4);
  });

  it('o mesmo grupo (o par Direto/Extra do mesmo NR) nunca roda junto', async () => {
    const ordem: string[] = [];
    const ativosPorNr = new Map<string, number>();
    let sobreposicao = false;
    const itens = [
      { nr: '111', lado: 'direto' }, { nr: '111', lado: 'extra' },
      { nr: '222', lado: 'direto' }, { nr: '333', lado: 'direto' },
    ];
    await emGruposParalelos(itens, i => i.nr, 4, async i => {
      const n = (ativosPorNr.get(i.nr) ?? 0) + 1;
      ativosPorNr.set(i.nr, n);
      if (n > 1) sobreposicao = true;
      await esperar(5);
      ordem.push(`${i.nr}-${i.lado}`);
      ativosPorNr.set(i.nr, n - 1);
    });
    expect(sobreposicao).toBe(false);
    // Dentro do grupo, a ordem de entrada é mantida.
    expect(ordem.indexOf('111-direto')).toBeLessThan(ordem.indexOf('111-extra'));
  });

  it('lista vazia não faz nada', async () => {
    let chamou = false;
    await emGruposParalelos([], () => 'x', 4, async () => { chamou = true; });
    expect(chamou).toBe(false);
  });
});
