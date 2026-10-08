import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALTURA, LARGURA, NUMERO_DA_PARTE, ORDEM, QUADROS, TODOS_OS_QUADROS, ZUMBIS,
  centroDaParte, gradeDa, montarQuadro, parteNoPonto, zumbiDaRodada,
} from './zumbis';

describe('os zumbis', () => {
  it('são 8, com id e nome próprios — o mesmo número que o banco sorteia', () => {
    expect(ZUMBIS).toHaveLength(8);
    expect(new Set(ZUMBIS.map(z => z.id)).size).toBe(8);
    expect(new Set(ZUMBIS.map(z => z.nome)).size).toBe(8);
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../../supabase/migrations/20261007200000_caca_zumbis.sql'), 'utf8',
    );
    expect(sql).toContain(`generate_series(0, ${ZUMBIS.length - 1})`);
    expect(sql).toContain(`zumbi BETWEEN 0 AND ${ZUMBIS.length - 1}`);
  });

  it('toda letra das grades tem cor na paleta do zumbi, e toda linha de uma grade tem a mesma largura', () => {
    for (const z of ZUMBIS) {
      const grades = [...ORDEM.map(p => gradeDa(z, p)), ...z.enfeites];
      for (const g of grades) {
        for (const linha of g.linhas) {
          for (const letra of linha) {
            if (letra === '.') continue;
            expect(z.paleta[letra], `${z.id}: letra «${letra}» sem cor`).toMatch(/^#[0-9a-f]{6}$/i);
          }
        }
      }
      for (const p of ORDEM) {
        const g = gradeDa(z, p);
        const larguras = new Set(g.linhas.map(l => l.length));
        expect(larguras.size <= 1, `${z.id}/${p}: linhas de larguras diferentes`).toBe(true);
      }
    }
  });

  it('nada sai do sprite em nenhum quadro, parado ou andando', () => {
    for (const z of ZUMBIS) {
      for (const q of TODOS_OS_QUADROS) {
        for (const g of [...ORDEM.map(p => ({ ...gradeDa(z, p), parte: p })), ...z.enfeites]) {
          if (g.linhas.length === 0) continue;
          const [dx, dy] = q.desloca[g.parte] ?? [0, 0];
          const maior = Math.max(0, ...g.linhas.map(l => l.length));
          expect(g.x + dx >= 0 && g.x + dx + maior <= LARGURA, `${z.id}: sai pelo lado`).toBe(true);
          expect(g.y + dy >= 0 && g.y + dy + g.linhas.length <= ALTURA, `${z.id}: sai por cima ou por baixo`).toBe(true);
        }
      }
    }
  });

  it('o mapa de peças decide o tiro: cabeça é headshot, o resto é corpo, o vão é parede', () => {
    for (const z of ZUMBIS) {
      const img = montarQuadro(z, QUADROS[0]);
      const olho = centroDaParte(img, NUMERO_DA_PARTE.cabeca);
      expect(parteNoPonto(img, olho.x, olho.y), z.id).toBe(NUMERO_DA_PARTE.cabeca);
      const peito = centroDaParte(img, NUMERO_DA_PARTE.tronco);
      expect(parteNoPonto(img, peito.x, peito.y), z.id).not.toBe(NUMERO_DA_PARTE.cabeca);
      expect(parteNoPonto(img, peito.x, peito.y), z.id).toBeGreaterThan(0);
    }
    // O canto de baixo à direita é sempre vão (entre o braço e o pé).
    expect(parteNoPonto(montarQuadro(ZUMBIS[0], QUADROS[0]), LARGURA - 1, ALTURA - 6)).toBe(0);
  });

  it('o tiro tem um pixel de tolerância: raspar a borda da cabeça ainda é cabeça', () => {
    const img = montarQuadro(ZUMBIS[0], QUADROS[0]);
    // A linha 0 fica acima da cabeça do Operador (ela começa na linha 2).
    expect(parteNoPonto(img, 12, 1)).toBe(NUMERO_DA_PARTE.cabeca);
    expect(parteNoPonto(img, 12, 0)).toBe(0);
  });

  it('o zumbi da rodada: o do banco, ou pela semente nas rodadas antigas', () => {
    expect(zumbiDaRodada({ zumbi: 2, semente: 999 })).toBe(ZUMBIS[2]);
    expect(zumbiDaRodada({ zumbi: null, semente: 13 })).toBe(ZUMBIS[13 % 8]);
    expect(zumbiDaRodada({ zumbi: null, semente: -5 })).toBe(ZUMBIS[5]);
  });
});
