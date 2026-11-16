import { describe, expect, it } from 'vitest';
import { atributosDoTema, temaDoDesafio, TEMAS } from './temas';

describe('as cores do desafio seguem o Gestão de quem olha (16/11/2026)', () => {
  it('sem o Natal ligado: Grafite e ouro, no claro e no escuro', () => {
    expect(temaDoDesafio(false, false).id).toBe('grafite');
    expect(temaDoDesafio(false, true).id).toBe('grafite');
  });

  it('Natal ligado no tema claro: Natal gelo', () => {
    expect(temaDoDesafio(true, false).id).toBe('natal-gelo');
  });

  it('Natal ligado no tema escuro: Noite de Natal', () => {
    expect(temaDoDesafio(true, true).id).toBe('noite-de-natal');
  });

  it('só os de Natal ligam os enfeites', () => {
    expect(atributosDoTema(temaDoDesafio(true, true))).toHaveProperty('data-natal', '');
    expect(atributosDoTema(temaDoDesafio(true, false))).toHaveProperty('data-natal', '');
    expect(atributosDoTema(temaDoDesafio(false, true))).not.toHaveProperty('data-natal');
  });

  it('cada tema traz todas as variáveis de cor', () => {
    for (const t of TEMAS) {
      const vars = atributosDoTema(t).style as Record<string, string>;
      expect(Object.keys(vars).length).toBeGreaterThanOrEqual(33);
      expect(Object.values(vars).every(v => typeof v === 'string' && v.length > 0)).toBe(true);
    }
  });
});
