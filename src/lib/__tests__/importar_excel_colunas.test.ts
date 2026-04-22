/**
 * Testes para a função colunasPreviewImport — congela a ordem exata das
 * colunas exibidas na tabela "Dados reconhecidos" do preview por tenant.
 *
 * REQUISITO do usuário (PaguePlay):
 *   "Em 'Dados reconhecidos' a ordem deve ser: (INSCRIÇÃO/ESTADO/CLASS./NOME/
 *    CPF/VENCIMENTO/VALOR/PARC./STATUS/WHATS/AVISOS / ERROS). NR não existe em
 *    pagueplay, nem instituição."
 */
import { describe, it, expect } from 'vitest';
import { colunasPreviewImport } from '@/lib/importar_excel_colunas';

describe('colunasPreviewImport — ordem das colunas do preview por tenant', () => {
  describe('PaguePlay (modo tabela)', () => {
    it('exibe INSCRIÇÃO/ESTADO em vez de NR, CPF após NOME, SEM INST. ao final', () => {
      const cols = colunasPreviewImport({ ehPaguePay: true, modoParsed: 'tabela' });
      expect(cols).toEqual([
        '#', '✓',
        'INSCRIÇÃO', 'ESTADO',
        'CLASS.', 'NOME', 'CPF',
        'VENCIMENTO', 'VALOR', 'PARC.', 'STATUS', 'WHATS',
        'AVISOS / ERROS',
      ]);
    });

    it('NÃO contém "NR" nem "INST." (as colunas que não existem em PaguePlay)', () => {
      const cols = colunasPreviewImport({ ehPaguePay: true, modoParsed: 'tabela' });
      expect(cols).not.toContain('NR');
      expect(cols).not.toContain('INST.');
    });

    it('modo blocos adiciona coluna BLOCO na 2ª posição', () => {
      const cols = colunasPreviewImport({ ehPaguePay: true, modoParsed: 'blocos' });
      expect(cols[0]).toBe('#');
      expect(cols[1]).toBe('BLOCO');
      expect(cols[2]).toBe('✓');
      expect(cols[3]).toBe('INSCRIÇÃO');
    });
  });

  describe('Bookplay/default (modo tabela)', () => {
    it('mantém layout legado: NR (sem ESTADO), sem CPF, INST. antes de AVISOS', () => {
      const cols = colunasPreviewImport({ ehPaguePay: false, modoParsed: 'tabela' });
      expect(cols).toEqual([
        '#', '✓',
        'NR',
        'CLASS.', 'NOME',
        'VENCIMENTO', 'VALOR', 'PARC.', 'STATUS', 'WHATS', 'INST.',
        'AVISOS / ERROS',
      ]);
    });

    it('NÃO contém INSCRIÇÃO/ESTADO/CPF (colunas exclusivas de PaguePlay)', () => {
      const cols = colunasPreviewImport({ ehPaguePay: false, modoParsed: 'tabela' });
      expect(cols).not.toContain('INSCRIÇÃO');
      expect(cols).not.toContain('ESTADO');
      expect(cols).not.toContain('CPF');
    });

    it('modo blocos adiciona coluna BLOCO na 2ª posição', () => {
      const cols = colunasPreviewImport({ ehPaguePay: false, modoParsed: 'blocos' });
      expect(cols[0]).toBe('#');
      expect(cols[1]).toBe('BLOCO');
      expect(cols[2]).toBe('✓');
      expect(cols[3]).toBe('NR');
    });
  });

  describe('Invariantes de contagem', () => {
    it('PaguePlay tabela tem exatamente 13 colunas', () => {
      expect(colunasPreviewImport({ ehPaguePay: true, modoParsed: 'tabela' })).toHaveLength(13);
    });

    it('PaguePlay blocos tem exatamente 14 colunas (+BLOCO)', () => {
      expect(colunasPreviewImport({ ehPaguePay: true, modoParsed: 'blocos' })).toHaveLength(14);
    });

    it('Bookplay tabela tem exatamente 12 colunas', () => {
      expect(colunasPreviewImport({ ehPaguePay: false, modoParsed: 'tabela' })).toHaveLength(12);
    });

    it('Bookplay blocos tem exatamente 13 colunas (+BLOCO)', () => {
      expect(colunasPreviewImport({ ehPaguePay: false, modoParsed: 'blocos' })).toHaveLength(13);
    });
  });

  describe('Contrato de renomeação semântica', () => {
    it('PaguePlay: INSCRIÇÃO aparece ANTES de ESTADO (nessa ordem)', () => {
      const cols = colunasPreviewImport({ ehPaguePay: true, modoParsed: 'tabela' });
      const idxInsc = cols.indexOf('INSCRIÇÃO');
      const idxEst  = cols.indexOf('ESTADO');
      expect(idxInsc).toBeGreaterThan(-1);
      expect(idxEst).toBeGreaterThan(-1);
      expect(idxInsc).toBeLessThan(idxEst);
    });

    it('PaguePlay: CPF aparece DEPOIS de NOME (nessa ordem)', () => {
      const cols = colunasPreviewImport({ ehPaguePay: true, modoParsed: 'tabela' });
      const idxNome = cols.indexOf('NOME');
      const idxCpf  = cols.indexOf('CPF');
      expect(idxNome).toBeGreaterThan(-1);
      expect(idxCpf).toBeGreaterThan(-1);
      expect(idxNome).toBeLessThan(idxCpf);
    });

    it('PaguePlay: CPF aparece ANTES de VENCIMENTO', () => {
      const cols = colunasPreviewImport({ ehPaguePay: true, modoParsed: 'tabela' });
      const idxCpf   = cols.indexOf('CPF');
      const idxVenc  = cols.indexOf('VENCIMENTO');
      expect(idxCpf).toBeLessThan(idxVenc);
    });
  });
});
