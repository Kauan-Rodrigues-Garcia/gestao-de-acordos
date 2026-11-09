import { describe, expect, it } from 'vitest';
import { diasUteisEntre, ehDiaUtil, feriadosDoAno } from './diasUteis';

describe('dias úteis da Ouvidoria', () => {
  it('feriados nacionais, com a Sexta-feira Santa móvel e a Consciência Negra desde 2024', () => {
    const f2026 = feriadosDoAno(2026);
    expect(f2026.has('2026-04-03')).toBe(true); // Páscoa 05/04/2026
    expect(f2026.has('2026-11-02')).toBe(true);
    expect(f2026.has('2026-11-20')).toBe(true);
    expect(feriadosDoAno(2025).has('2025-04-18')).toBe(true); // Páscoa 20/04/2025
    expect(feriadosDoAno(2023).has('2023-11-20')).toBe(false);
    // Carnaval é ponto facultativo, não feriado.
    expect(ehDiaUtil('2026-02-16')).toBe(true);
  });

  it('fim de semana e feriado não contam', () => {
    expect(ehDiaUtil('2026-11-07')).toBe(false); // sábado
    expect(ehDiaUtil('2026-11-02')).toBe(false); // Finados
    expect(ehDiaUtil('2026-11-09')).toBe(true);
  });

  it('conta os dias úteis depois da abertura até hoje', () => {
    expect(diasUteisEntre('2026-11-09', '2026-11-09')).toBe(0);
    expect(diasUteisEntre('2026-11-06', '2026-11-09')).toBe(1); // sexta → segunda
    expect(diasUteisEntre('2026-10-30', '2026-11-06')).toBe(4); // 02/11 é feriado
    expect(diasUteisEntre('2026-11-10', '2026-11-09')).toBe(0);
  });
});
