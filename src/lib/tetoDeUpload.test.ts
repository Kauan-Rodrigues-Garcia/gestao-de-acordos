import { describe, it, expect } from 'vitest';
import { SEM_TETO, recusadoPeloTamanho, tetoDeUpload } from './tetoDeUpload';

const DEZ_MB = 10 * 1024 * 1024;

describe('tetoDeUpload', () => {
  it('super admin não tem teto', () => {
    expect(tetoDeUpload(DEZ_MB, 'super_admin')).toBe(SEM_TETO);
    expect(500 * 1024 * 1024 > tetoDeUpload(DEZ_MB, 'super_admin')).toBe(false);
  });

  it('os demais cargos seguem com o teto da tela', () => {
    for (const cargo of ['administrador', 'lider', 'operador', 'diretoria', null, undefined]) {
      expect(tetoDeUpload(DEZ_MB, cargo)).toBe(DEZ_MB);
    }
  });
});

describe('recusadoPeloTamanho', () => {
  it('reconhece a recusa de tamanho do Storage', () => {
    expect(recusadoPeloTamanho({ statusCode: '413', message: 'x' })).toBe(true);
    expect(recusadoPeloTamanho({ message: 'The object exceeded the maximum allowed size' })).toBe(true);
  });

  it('não confunde com outros erros', () => {
    expect(recusadoPeloTamanho({ statusCode: '403', message: 'new row violates row-level security policy' })).toBe(false);
    expect(recusadoPeloTamanho(null)).toBe(false);
  });
});
