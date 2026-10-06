import { describe, expect, it } from 'vitest';
import { extrairQuitacoes, resumoPorOperador } from './relatorioQuitacao';

const CAB = ['Cód. Acordo', 'Num. Parc. Acordo', 'Operador', 'Dt. Pgto', 'Recebido', 'Situação', 'Valor Acordo', 'Situação Atual', 'Data da quitação'];
const d = (s: string) => new Date(`${s}T00:00:00`);
const linha = (cod: string, op: string, pgto: string, valor: number, atual: string, quitou: string | null, parc = 1) =>
  [cod, parc, op, d(pgto), 100, 'Quitação', valor, atual, quitou ? d(quitou) : null];

describe('relatório mensal de parcelas pagas → acordos quitados no mês', () => {
  it('conta só «Situação Atual» = Quitação, com a quitação dentro do mês do arquivo', () => {
    const r = extrairQuitacoes([
      CAB,
      linha('1', 'ANA', '2026-09-02', 500, 'Quitação', '2026-09-02'),
      // Duas parcelas do mesmo acordo: conta uma vez, com o Valor Acordo.
      linha('2', 'ANA', '2026-09-05', 900, 'Quitação', '2026-09-20', 1),
      linha('2', 'ANA', '2026-09-20', 900, 'Quitação', '2026-09-20', 2),
      // «Situação» diz Quitação, mas o acordo ainda está parcelando.
      linha('3', 'BIA', '2026-09-03', 2000, 'Parcelamento', null),
      // Quitou em outubro: fica para o relatório de outubro.
      linha('4', 'BIA', '2026-09-10', 300, 'Quitação', '2026-10-05'),
      linha('5', 'BIA', '2026-09-11', 1200, 'Quitação', '2026-09-11'),
    ]);
    expect(r.erros).toEqual([]);
    expect(r.mes).toBe('2026-09-01');
    expect(r.linhasLidas).toBe(6);
    expect(r.quitadosForaDoMes).toBe(1);
    expect(r.acordos.map(a => a.cod_acordo).sort()).toEqual(['1', '2', '5']);
    expect(r.acordos.find(a => a.cod_acordo === '2')).toMatchObject({ valor_acordo: 900, data_quitacao: '2026-09-20' });
  });

  it('o ranking da prévia é por valor, desempate pela quantidade', () => {
    const r = extrairQuitacoes([
      CAB,
      linha('1', 'ANA', '2026-09-02', 500, 'Quitação', '2026-09-02'),
      linha('2', 'ANA', '2026-09-03', 400, 'Quitação', '2026-09-03'),
      linha('3', 'BIA', '2026-09-04', 1200, 'Quitação', '2026-09-04'),
    ]);
    expect(resumoPorOperador(r.acordos)).toEqual([
      { operador: 'BIA', quitacoes: 1, valor: 1200 },
      { operador: 'ANA', quitacoes: 2, valor: 900 },
    ]);
  });

  it('arquivo errado: diz quais colunas faltam', () => {
    const r = extrairQuitacoes([['Operador', 'Valor Recebido'], ['ANA', 10]]);
    expect(r.acordos).toEqual([]);
    expect(r.erros[0]).toContain('Situação Atual');
    expect(r.erros[0]).toContain('Data da quitação');
  });

  it('aceita datas como número serial do Excel e valor em texto pt-BR', () => {
    // 46267 = 2026-09-02.
    const r = extrairQuitacoes([CAB, ['9', 1, 'ANA', 46267, 100, 'Quitação', '1.234,50', 'Quitação', 46267]]);
    expect(r.acordos).toEqual([{ cod_acordo: '9', operador_usuario: 'ANA', valor_acordo: 1234.5, data_quitacao: '2026-09-02' }]);
  });
});
