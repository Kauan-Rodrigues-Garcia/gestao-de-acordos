import { describe, it, expect } from 'vitest';
import type { ResultadoComissao } from './comissao';
import { temCardComissao } from './temCardComissao';

const base = { motivo: null, bonus: [] } as unknown as ResultadoComissao;
const com = (p: Partial<ResultadoComissao>) => ({ ...base, ...p }) as ResultadoComissao;

describe('temCardComissao', () => {
  it('sem resultado (carregando, sem permissão, erro) não tem card', () => {
    expect(temCardComissao(null)).toBe(false);
  });
  it('com faixa atual tem card', () => {
    expect(temCardComissao(base)).toBe(true);
  });
  it('nenhuma faixa ainda tem card (mostra quanto falta)', () => {
    expect(temCardComissao(com({ motivo: 'nenhuma_faixa' }))).toBe(true);
  });
  it('sem configuração ou sem meta não tem card', () => {
    expect(temCardComissao(com({ motivo: 'sem_config' }))).toBe(false);
    expect(temCardComissao(com({ motivo: 'sem_meta' }))).toBe(false);
  });
  it('sem configuração mas com bônus tem card', () => {
    expect(temCardComissao(com({ motivo: 'sem_config', bonus: [{}] as ResultadoComissao['bonus'] }))).toBe(true);
  });
});
