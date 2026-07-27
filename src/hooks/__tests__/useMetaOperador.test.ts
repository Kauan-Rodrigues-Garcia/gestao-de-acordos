import { describe, it, expect } from 'vitest';
import { diasBaixaAnterior } from '../useMetaOperador';

describe('diasBaixaAnterior', () => {
  it('numa segunda-feira cobre sexta, sábado e domingo', () => {
    // 2026-07-20 é segunda-feira
    const dias = diasBaixaAnterior('2026-07-20');
    expect(dias).toEqual(['2026-07-17', '2026-07-18', '2026-07-19']);
  });

  it('num dia comum cobre só o dia anterior', () => {
    // 2026-07-22 é quarta → terça 21
    expect(diasBaixaAnterior('2026-07-22')).toEqual(['2026-07-21']);
    // 2026-07-23 é quinta → quarta 22
    expect(diasBaixaAnterior('2026-07-23')).toEqual(['2026-07-22']);
  });

  it('pula feriado ao definir o início mas inclui os dias até ontem', () => {
    // Sexta 2026-07-17 vira feriado → último dia útil antes de segunda 20 é quinta 16;
    // janela vai de 16 até domingo 19 (inclui a própria sexta-feriado como catch-up).
    const dias = diasBaixaAnterior('2026-07-20', ['2026-07-17']);
    expect(dias[0]).toBe('2026-07-16');
    expect(dias[dias.length - 1]).toBe('2026-07-19');
    expect(dias).toContain('2026-07-17');
  });

  it('sempre retorna ao menos um dia', () => {
    expect(diasBaixaAnterior('2026-07-22').length).toBeGreaterThanOrEqual(1);
  });
});
