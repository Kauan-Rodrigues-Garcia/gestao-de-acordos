import { beforeEach, describe, expect, it } from 'vitest';
import { chaveDoLembrete, lembreteVisto, marcarLembreteVisto } from './calendarioLembrete';

describe('lembrete do calendário', () => {
  beforeEach(() => localStorage.clear());

  it('nasce não visto, e fica visto depois de marcar — por pessoa e por dia', () => {
    expect(lembreteVisto('ana', '2026-10-12')).toBe(false);
    marcarLembreteVisto('ana', '2026-10-12');
    expect(lembreteVisto('ana', '2026-10-12')).toBe(true);
    expect(lembreteVisto('bia', '2026-10-12')).toBe(false);
    expect(lembreteVisto('ana', '2026-10-13')).toBe(false);
  });

  it('marcar hoje apaga os dias anteriores da mesma pessoa, e só dela', () => {
    marcarLembreteVisto('ana', '2026-10-12');
    marcarLembreteVisto('bia', '2026-10-12');
    marcarLembreteVisto('ana', '2026-10-13');
    expect(localStorage.getItem(chaveDoLembrete('ana', '2026-10-12'))).toBeNull();
    expect(lembreteVisto('ana', '2026-10-13')).toBe(true);
    expect(lembreteVisto('bia', '2026-10-12')).toBe(true);
  });

  it('sem pessoa, nunca dá como visto nem grava', () => {
    marcarLembreteVisto(null, '2026-10-12');
    expect(lembreteVisto(null, '2026-10-12')).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});
