/**
 * O que estes testes protegem é a promessa que a galeria faz: «todo valor vem
 * de relatório». Um template que guardasse número seria uma cópia congelada de
 * dado que muda — e a parede mostraria o mês passado com cara de hoje.
 *
 * A única exceção é o ALVO da meta diária, que a liderança pode digitar. O
 * REALIZADO nunca: `alvoDiario` existe justamente para que essa fronteira seja
 * uma função, e não um `if` espalhado pelo desenho.
 */
import { describe, it, expect } from 'vitest';
import {
  TEMPLATES, CATEGORIAS, templatesDaCategoria, alvoDiario,
} from './templates';

describe('catálogo de templates', () => {
  it('todo template tem id único', () => {
    const ids = TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo template cai numa prateleira que existe', () => {
    const validas = new Set(CATEGORIAS.map(c => c.id));
    for (const t of TEMPLATES) expect(validas.has(t.categoria)).toBe(true);
  });

  it('nenhuma prateleira fica vazia', () => {
    for (const c of CATEGORIAS) {
      expect(templatesDaCategoria(c.id).length, `prateleira ${c.id}`).toBeGreaterThan(0);
    }
  });

  it('todo template cria pelo menos uma fonte, dentro do palco', () => {
    for (const t of TEMPLATES) {
      expect(t.fontes.length, t.id).toBeGreaterThan(0);
      for (const f of t.fontes) {
        expect(f.x, `${t.id} x`).toBeGreaterThanOrEqual(-20);
        expect(f.x, `${t.id} x`).toBeLessThanOrEqual(120);
        expect(f.y, `${t.id} y`).toBeGreaterThanOrEqual(-20);
        expect(f.y, `${t.id} y`).toBeLessThanOrEqual(120);
        // Os mesmos limites do CHECK de `tv_fontes`: um template fora deles
        // seria recusado pelo banco na hora de aplicar.
        expect(f.largura, `${t.id} largura`).toBeGreaterThanOrEqual(2);
        expect(f.largura, `${t.id} largura`).toBeLessThanOrEqual(100);
      }
    }
  });

  /*
   * Este é o teste que mais importa da lista. Um `valor`, `total` ou
   * `realizado` no config de um template significaria número congelado no
   * banco — e a galeria inteira deixa de valer.
   */
  it('nenhum template guarda valor de recebimento', () => {
    const proibidas = ['valor', 'total', 'realizado', 'recebido', 'alvo'];
    for (const t of TEMPLATES) {
      for (const f of t.fontes) {
        for (const chave of Object.keys(f.config)) {
          expect(proibidas, `${t.id} guarda "${chave}"`).not.toContain(chave);
        }
      }
    }
  });

  it('o único alvo digitável é o da meta diária, e ele é declarado', () => {
    const comManual = TEMPLATES.filter(t =>
      t.fontes.some(f => 'meta_diaria_manual' in f.config));
    for (const t of comManual) {
      const f = t.fontes.find(x => 'meta_diaria_manual' in x.config)!;
      expect(f.config.modelo, `${t.id}`).toBe('diaria');
      expect(f.config.origem, `${t.id}`).toBe('manual');
    }
  });
});

describe('alvo diário', () => {
  it('sem origem manual usa o calculado da meta do mês', () => {
    expect(alvoDiario({}, 24000)).toBe(24000);
    expect(alvoDiario({ origem: 'mensal', meta_diaria_manual: 99 }, 24000)).toBe(24000);
  });

  it('com origem manual usa o valor digitado', () => {
    expect(alvoDiario({ origem: 'manual', meta_diaria_manual: 30000 }, 24000)).toBe(30000);
  });

  /*
   * Manual com valor inútil cai no calculado, e não em zero: zero faria a barra
   * de "meta de hoje" dividir por zero e a parede mostrar 0% o dia inteiro,
   * como se ninguém tivesse recebido nada.
   */
  it('manual sem valor válido volta para o calculado', () => {
    expect(alvoDiario({ origem: 'manual' }, 24000)).toBe(24000);
    expect(alvoDiario({ origem: 'manual', meta_diaria_manual: 0 }, 24000)).toBe(24000);
    expect(alvoDiario({ origem: 'manual', meta_diaria_manual: -5 }, 24000)).toBe(24000);
    expect(alvoDiario({ origem: 'manual', meta_diaria_manual: 'trinta mil' }, 24000)).toBe(24000);
  });
});
