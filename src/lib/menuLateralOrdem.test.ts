/**
 * src/lib/menuLateralOrdem.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cenários cobertos:
 *   1. Ordem vazia devolve o menu do código, intacto
 *   2. Ordem completa reposiciona todas as abas
 *   3. Aba nova (fora da ordem salva) vai para o fim, sem sumir
 *   4. Duas abas novas mantêm entre si a ordem do código
 *   5. Rota salva que não existe mais é ignorada, sem buraco
 *   6. Ordem com rota repetida não duplica nem reordena errado
 *   7. Nenhuma aba é perdida ou inventada, em qualquer caso
 */

import { describe, it, expect } from 'vitest';
import { ordenarMenu } from './menuLateralOrdem';

const menu = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/acordos', label: 'Acordos' },
  { to: '/analitico', label: 'Analítico' },
  { to: '/lixeira', label: 'Lixeira' },
];

const rotas = (itens: { to: string }[]) => itens.map(i => i.to);

describe('ordenarMenu', () => {
  it('ordem vazia devolve o menu do código intacto', () => {
    expect(rotas(ordenarMenu(menu, []))).toEqual(
      ['/dashboard', '/acordos', '/analitico', '/lixeira'],
    );
  });

  it('ordem completa reposiciona todas as abas', () => {
    const salva = ['/lixeira', '/analitico', '/acordos', '/dashboard'];
    expect(rotas(ordenarMenu(menu, salva))).toEqual(salva);
  });

  it('aba nova vai para o fim em vez de sumir', () => {
    // A ordem foi salva antes de /tickets existir.
    const comNova = [...menu, { to: '/tickets', label: 'Tickets' }];
    const salva = ['/lixeira', '/dashboard', '/acordos', '/analitico'];
    expect(rotas(ordenarMenu(comNova, salva))).toEqual([...salva, '/tickets']);
  });

  it('duas abas novas mantêm entre si a ordem do código', () => {
    const comNovas = [
      ...menu,
      { to: '/tickets', label: 'Tickets' },
      { to: '/metas', label: 'Metas' },
    ];
    const salva = ['/acordos', '/dashboard'];
    expect(rotas(ordenarMenu(comNovas, salva))).toEqual([
      '/acordos', '/dashboard', '/analitico', '/lixeira', '/tickets', '/metas',
    ]);
  });

  it('rota salva que não existe mais é ignorada', () => {
    const salva = ['/aba-extinta', '/lixeira', '/dashboard'];
    expect(rotas(ordenarMenu(menu, salva))).toEqual([
      '/lixeira', '/dashboard', '/acordos', '/analitico',
    ]);
  });

  it('rota repetida na ordem salva não duplica nem reordena errado', () => {
    const salva = ['/lixeira', '/dashboard', '/lixeira'];
    const saida = ordenarMenu(menu, salva);
    expect(rotas(saida)).toEqual(['/lixeira', '/dashboard', '/acordos', '/analitico']);
  });

  it('nunca perde nem inventa aba', () => {
    const casos: string[][] = [
      [],
      ['/lixeira'],
      ['/aba-extinta'],
      ['/lixeira', '/analitico', '/acordos', '/dashboard'],
    ];
    for (const salva of casos) {
      const saida = ordenarMenu(menu, salva);
      expect(saida).toHaveLength(menu.length);
      expect(new Set(rotas(saida))).toEqual(new Set(rotas(menu)));
    }
  });
});
