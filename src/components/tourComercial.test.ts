/**
 * tourComercial.test.ts — o tour do Comercial fica na aba Vendas.
 *
 * Até 21/09/2026 o Comercial via o tour de acordos, que navegava para
 * /acordos — rota que o Comercial não abre.
 */
import { describe, it, expect } from 'vitest';
import { passosDoComercial } from './tourComercial';

const tudo = () => true;

describe('passosDoComercial', () => {
  it('começa nas boas-vindas e nunca sai da aba Vendas', () => {
    const passos = passosDoComercial(tudo);
    expect(passos[0].title).toMatch(/Gestão Comercial/);
    for (const p of passos) {
      if (p.route) expect(p.route).toBe('/vendas');
      expect(`${p.title} ${p.body}`).not.toMatch(/acordo/i);
    }
  });

  it('aponta para os alvos que a aba Vendas marca', () => {
    const alvos = passosDoComercial(tudo).map(p => p.target).filter(Boolean);
    expect(alvos).toEqual([
      '[data-tour="vendas-metricas"]', '[data-tour="nova-venda"]', '[data-tour="colar-vendas"]',
      '[data-tour="vendas-filtros"]', '[data-tour="vendas-tabela"]',
    ]);
  });

  it('sem chave de lançar, os passos de lançar saem; sem ver_vendas, só as boas-vindas', () => {
    const semLancar = passosDoComercial(c => c !== 'criar_vendas').map(p => p.target);
    expect(semLancar).not.toContain('[data-tour="nova-venda"]');
    expect(semLancar).not.toContain('[data-tour="colar-vendas"]');
    expect(passosDoComercial(() => false)).toHaveLength(1);
  });
});
