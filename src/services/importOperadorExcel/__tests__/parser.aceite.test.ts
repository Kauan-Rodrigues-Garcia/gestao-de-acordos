/**
 * Teste de aceite — roda contra os 3 arquivos reais SE estiverem presentes
 * (calibração local). Em CI/sem os arquivos, é pulado. Prova os números do spec.
 *
 * Dir dos arquivos: env PLANILHAS_DIR ou o Downloads padrão.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { selecionarAbaOperacional } from '../selecionarAba';
import { lerAbaOperacional, type ResolverOperador } from '../parser';
import { somarEscala5, arredondar2HalfUp } from '../consolidar';

const DIR = process.env.PLANILHAS_DIR ?? 'C:/Users/Windows/Downloads';
const ARQUIVOS = ['Luciana.xlsx', 'Bryan.xlsx', 'Matheus.xlsx'];
const temArquivos = ARQUIVOS.every(a => existsSync(`${DIR}/${a}`));

// Resolver de teste: cada login vira um "operador" distinto (id = login).
const resolver: ResolverOperador = (login) => (login ? { id: login, nome: login, setorId: null } : null);

const ESPERADO: Record<string, { verdes: number; pend: number; ops: number; bruto: string }> = {
  'Luciana.xlsx': { verdes: 43, pend: 13, ops: 5, bruto: '128.55715' },
  'Bryan.xlsx':   { verdes: 213, pend: 34, ops: 7, bruto: '333.49950' },
  'Matheus.xlsx': { verdes: 42, pend: 9, ops: 6, bruto: '81.03855' },
};

describe.skipIf(!temArquivos)('parser — aceite com arquivos reais', () => {
  const arredondadosPorOperador: string[] = [];

  for (const arq of ARQUIVOS) {
    it(arq, async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(`${DIR}/${arq}`);
      const sel = selecionarAbaOperacional(arq, wb.worksheets.map(w => w.name));
      expect(sel.ok).toBe(true);
      const ws = wb.getWorksheet(sel.aba!)!;
      const res = await lerAbaOperacional(ws, {
        principal: sel.principal, nomeArquivo: arq, hashArquivo: 'test', resolverOperador: resolver,
      });
      const e = ESPERADO[arq];
      expect(res.totais.verdesPagas).toBe(e.verdes);
      expect(res.totais.pendentes).toBe(e.pend);
      expect(res.totais.operadoresComPendencia).toBe(e.ops);
      expect(res.totais.totalPendenteBruto).toBe(e.bruto);
      res.consolidado.forEach(c => arredondadosPorOperador.push(c.totalArredondado));
    });
  }

  it('soma dos PIX arredondados por operador = R$ 543,12', () => {
    const soma = somarEscala5(arredondadosPorOperador);
    expect(arredondar2HalfUp(soma)).toBe('543.12');
  });
});
