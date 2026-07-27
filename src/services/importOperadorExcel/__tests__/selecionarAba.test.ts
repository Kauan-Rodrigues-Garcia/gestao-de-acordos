import { describe, it, expect } from 'vitest';
import { nomePrincipalDoArquivo, selecionarAbaOperacional, ehAbaIgnorada } from '../selecionarAba';

describe('nomePrincipalDoArquivo', () => {
  it('remove caminho e extensão', () => {
    expect(nomePrincipalDoArquivo('Luciana.xlsx')).toBe('Luciana');
    expect(nomePrincipalDoArquivo('C:\\pasta\\Bryan.xlsx')).toBe('Bryan');
    expect(nomePrincipalDoArquivo('/home/x/Matheus.XLSX')).toBe('Matheus');
    expect(nomePrincipalDoArquivo(' Luciana .xlsx')).toBe('Luciana');
  });
});

describe('selecionarAbaOperacional', () => {
  it('acha a aba com mesmo nome do arquivo (case/trim-insensitive)', () => {
    const r = selecionarAbaOperacional('Luciana.xlsx', ['Planilha1', 'pago', ' luciana ', 'Detalhes1']);
    expect(r.ok).toBe(true);
    expect(r.principal).toBe('Luciana');
    expect(r.aba).toBe(' luciana ');
  });

  it('erro claro quando a aba não existe (não escolhe outra)', () => {
    const r = selecionarAbaOperacional('Bryan.xlsx', ['Planilha1', 'pago', 'Resumo']);
    expect(r.ok).toBe(false);
    expect(r.aba).toBeUndefined();
    expect(r.error).toContain('Bryan');
    expect(r.error).toContain('não encontrada');
  });

  it('recusa quando o nome do arquivo é uma aba de resumo', () => {
    const r = selecionarAbaOperacional('pago.xlsx', ['pago', 'Planilha1']);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('resumo');
  });
});

describe('ehAbaIgnorada', () => {
  it('reconhece abas de resumo/pivô', () => {
    for (const n of ['Planilha1', 'planilha7', 'pago', 'Pagamento', 'Detalhes1', 'Resumo']) {
      expect(ehAbaIgnorada(n)).toBe(true);
    }
    expect(ehAbaIgnorada('Luciana')).toBe(false);
    expect(ehAbaIgnorada('Bryan')).toBe(false);
  });
});
