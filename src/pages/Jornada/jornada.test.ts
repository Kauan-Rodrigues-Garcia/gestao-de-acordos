import { describe, expect, it } from 'vitest';
import {
  contagem, diaDaSemana, diaPorExtenso, diasDoMesAte, iniciais,
  percentual, somarDias,
} from './jornada';

describe('jornada — contas da aba Acesso/Retenção', () => {
  it('percentual corta, não arredonda', () => {
    expect(percentual(99, 100)).toBe(99);
    expect(percentual(199, 200)).toBe(99);
    expect(percentual(100, 100)).toBe(100);
    expect(percentual(130, 100)).toBe(130);
    expect(percentual(10, null)).toBeNull();
    expect(percentual(10, 0)).toBeNull();
  });

  it('dias do mês param no limite (hoje)', () => {
    expect(diasDoMesAte('2026-11-15', '2026-11-04')).toEqual([
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
    ]);
    expect(diasDoMesAte('2026-02-10', '2026-12-31')).toHaveLength(28);
  });

  it('anda dias atravessando o mês', () => {
    expect(somarDias('2026-11-01', -1)).toBe('2026-10-31');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('textos', () => {
    expect(contagem(1, 'acesso')).toBe('1 acesso');
    expect(contagem(1200, 'retencao')).toBe('1.200 retenções');
    expect(diaDaSemana('2026-11-04')).toBe('qua');
    expect(diaPorExtenso('2026-11-04')).toBe('quarta, 04 de novembro');
    expect(iniciais('Ana Paula Souza')).toBe('AS');
    expect(iniciais('kauan')).toBe('K');
  });
});
