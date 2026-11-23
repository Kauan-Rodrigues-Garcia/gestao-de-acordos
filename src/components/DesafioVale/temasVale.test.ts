import { describe, expect, it } from 'vitest';
import { atributosDoTema } from '@/components/DesafioCobranca/temas';
import { TEMA_VALE_CAMPANHA, TEMA_VALE_NATAL_CLARO, TEMA_VALE_NOITE_DE_NATAL, temaDoVale } from './temasVale';

describe('as cores da gaveta do vale seguem o Gestão de quem olha (23/11/2026)', () => {
  it('Natal ligado no claro: Natal claro; no escuro: Noite de Natal', () => {
    expect(temaDoVale(true, false).id).toBe('vale-natal-claro');
    expect(temaDoVale(true, true).id).toBe('noite-de-natal');
  });

  it('sem Natal: Campanha, no claro e no escuro', () => {
    expect(temaDoVale(false, false).id).toBe('vale-campanha');
    expect(temaDoVale(false, true).id).toBe('vale-campanha');
  });

  it('só os de Natal ligam os enfeites', () => {
    expect(atributosDoTema(TEMA_VALE_NATAL_CLARO)).toHaveProperty('data-natal', '');
    expect(atributosDoTema(TEMA_VALE_NOITE_DE_NATAL)).toHaveProperty('data-natal', '');
    expect(atributosDoTema(TEMA_VALE_CAMPANHA)).not.toHaveProperty('data-natal');
  });

  it('o Natal claro é claro de verdade: fundo branco e texto escuro', () => {
    expect(TEMA_VALE_NATAL_CLARO.cores.noite).toBe('#ffffff');
    expect(TEMA_VALE_NATAL_CLARO.cores.texto).toBe('#0f172a');
  });

  it('cada tema traz todas as variáveis de cor', () => {
    for (const t of [TEMA_VALE_CAMPANHA, TEMA_VALE_NATAL_CLARO, TEMA_VALE_NOITE_DE_NATAL]) {
      const vars = atributosDoTema(t).style as Record<string, string>;
      expect(Object.keys(vars).length).toBeGreaterThanOrEqual(33);
    }
  });
});
