import { describe, expect, it } from 'vitest';
import { tempoDesde } from './formatos';

describe('tempoDesde — o «há quanto tempo» do cartão do contato', () => {
  const hoje = new Date('2026-09-19T12:00:00-03:00');

  it('anos e meses', () => {
    expect(tempoDesde('2025-03-10T09:00:00-03:00', hoje)).toBe('há 1 ano e 6 meses');
    expect(tempoDesde('2024-09-01T09:00:00-03:00', hoje)).toBe('há 2 anos');
    expect(tempoDesde('2026-08-01T09:00:00-03:00', hoje)).toBe('há 1 mês');
  });

  it('menos de um mês conta em dias', () => {
    expect(tempoDesde('2026-09-07T09:00:00-03:00', hoje)).toBe('há 12 dias');
    expect(tempoDesde('2026-09-18T09:00:00-03:00', hoje)).toBe('há 1 dia');
    expect(tempoDesde('2026-09-19T08:00:00-03:00', hoje)).toBe('desde hoje');
  });
});
