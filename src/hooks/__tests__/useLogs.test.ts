/**
 * src/hooks/__tests__/useLogs.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Testa a função pura do hook de Logs onde os erros de fuso se esconderiam:
 * `intervaloDoPeriodo` — "Hoje" tem de começar à meia-noite LOCAL, e o
 * período personalizado não pode andar um dia por causa de UTC.
 *
 * `combinaComFiltro` saiu em 28/09/2026: as chegadas passaram a vir de uma
 * consulta com o mesmo filtro da lista, e o recorte é do banco.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { intervaloDoPeriodo, PERIODO_LABEL } from '@/hooks/useLogs';

afterEach(() => {
  vi.useRealTimers();
});

describe('intervaloDoPeriodo', () => {
  it('"hoje" começa à meia-noite local, não 24 horas atrás', () => {
    // 14h de 12/08 no fuso do ambiente de teste.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 12, 14, 30, 0));

    const { de, ate } = intervaloDoPeriodo('hoje');
    expect(ate).toBeNull();

    const inicio = new Date(de!);
    expect(inicio.getFullYear()).toBe(2026);
    expect(inicio.getMonth()).toBe(7);
    expect(inicio.getDate()).toBe(12);
    expect(inicio.getHours()).toBe(0);
    expect(inicio.getMinutes()).toBe(0);
    expect(inicio.getSeconds()).toBe(0);
  });

  it('"24h" conta a partir de agora, e é diferente de "hoje"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 12, 14, 30, 0));

    const vinteQuatro = intervaloDoPeriodo('24h');
    const hoje = intervaloDoPeriodo('hoje');
    expect(new Date(vinteQuatro.de!).getTime()).toBeLessThan(new Date(hoje.de!).getTime());
    expect(new Date(vinteQuatro.de!).getHours()).toBe(14);
  });

  it('presets de dias recuam a quantidade certa', () => {
    vi.useFakeTimers();
    const agora = new Date(2026, 7, 12, 10, 0, 0);
    vi.setSystemTime(agora);

    for (const [preset, dias] of [['7d', 7], ['30d', 30], ['90d', 90]] as const) {
      const { de } = intervaloDoPeriodo(preset);
      const esperado = agora.getTime() - dias * 86_400_000;
      expect(Math.abs(new Date(de!).getTime() - esperado)).toBeLessThan(1000);
    }
  });

  it('"tudo" não impõe limite nenhum', () => {
    expect(intervaloDoPeriodo('tudo')).toEqual({ de: null, ate: null });
  });

  it('período personalizado cobre do início do primeiro dia ao fim do último, no fuso local', () => {
    // `new Date('2026-08-12')` seria meia-noite UTC — 21h de 11/08 em São Paulo.
    // Sem a interpretação local, o filtro traria um dia a mais no começo e
    // cortaria o último dia escolhido.
    const { de, ate } = intervaloDoPeriodo('custom', '2026-08-01', '2026-08-12');

    const inicio = new Date(de!);
    expect(inicio.getDate()).toBe(1);
    expect(inicio.getHours()).toBe(0);

    const fim = new Date(ate!);
    expect(fim.getDate()).toBe(12);
    expect(fim.getHours()).toBe(23);
    expect(fim.getMinutes()).toBe(59);
  });

  it('período personalizado aceita só um dos limites', () => {
    expect(intervaloDoPeriodo('custom', null, null)).toEqual({ de: null, ate: null });
    expect(intervaloDoPeriodo('custom', '2026-08-01', null).ate).toBeNull();
    expect(intervaloDoPeriodo('custom', null, '2026-08-12').de).toBeNull();
  });

  it('todo preset tem rótulo para a barra de filtros', () => {
    for (const p of ['hoje', '24h', '7d', '30d', '90d', 'tudo', 'custom'] as const) {
      expect(PERIODO_LABEL[p]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
