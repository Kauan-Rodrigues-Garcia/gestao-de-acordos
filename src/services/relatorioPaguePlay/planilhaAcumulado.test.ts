import { describe, expect, it } from 'vitest';
import { read, utils } from '@e965/xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { montarAcumuladoMensal } from './acumuladoMensal';
import { abasAcumulado, nomeArquivoAcumulado } from './baixarAcumulado';
import { montarPlanilhaAcumulado } from './planilhaAcumulado';
import type { ResumoSalvo } from './modelo';

type Grupo = ResumoSalvo['grupos'][number];
const grupo = (data: string, uf: string, total: number, data_pagamento = data): Grupo =>
  ({ data, data_pagamento, uf, forma: 'Pix', ia: '', total, coren: 0, cofen: 0, pp: 0 });
const resumo = (grupos: Grupo[]): ResumoSalvo =>
  ({ hoje: '2026-09-16', primeiraImportacaoPendente: false, quantidade: grupos.length, grupos, dias: [], ultimaImportacao: '2026-09-16T13:05:00Z' });

describe('acumulado por mês', () => {
  it('pivota pela Data (competência), ordena pelo total e traz todos os anos, o mais recente primeiro', () => {
    const anos = montarAcumuladoMensal([
      grupo('2026-01-10', 'SP', 1000, '2026-02-01'),
      grupo('2026-01-11', 'SP', 500),
      grupo('2026-03-05', 'PE', 9000),
      grupo('2026-03-06', 'SP', 250),
      grupo('2025-12-31', 'RJ', 700),
    ]);
    expect(anos.map(a => a.ano)).toEqual([2026, 2025]);
    const [a2026] = anos;
    expect(a2026.regionais.map(r => r.uf)).toEqual(['PE', 'SP']);
    expect(a2026.regionais[1].meses.slice(0, 3)).toEqual([1500, 0, 250]);
    expect(a2026.totaisMes.slice(0, 3)).toEqual([1500, 0, 9250]);
    expect(a2026.total).toBe(10750);
  });

  it('mantém estorno e só some com a regional que zerou em todos os meses', () => {
    const [ano] = montarAcumuladoMensal([
      grupo('2026-04-01', 'BA', 300), grupo('2026-04-02', 'BA', -300),
      grupo('2026-05-01', 'MG', -120),
      grupo('2026-05-02', 'CE', 400), grupo('2026-06-02', 'CE', -400),
    ]);
    expect(ano.regionais.map(r => r.uf)).toEqual(['CE', 'MG']);
    expect(ano.total).toBe(-120);
  });

  it('sem pagamentos, nenhum ano', () => {
    expect(montarAcumuladoMensal([])).toEqual([]);
  });
});

describe('planilha do acumulado', () => {
  const geradoEm = new Date('2026-09-16T17:32:00Z');
  const pagamento = resumo([grupo('2026-08-03', 'SP', 123456), grupo('2026-09-01', 'SP', 10000), grupo('2026-09-01', 'PE', 55050)]);
  const conciliacao = resumo([grupo('2026-09-02', 'RJ', 99)]);
  const arquivo = montarPlanilhaAcumulado(abasAcumulado(pagamento, conciliacao, geradoEm), 'PaguePlay · Acumulado por mês', geradoEm);
  const wb = read(arquivo, { type: 'array', cellFormula: true });

  it('tem uma aba por modalidade', () => {
    expect(wb.SheetNames).toEqual(['Acumulado por mês', 'Sem cartão de crédito']);
    expect(nomeArquivoAcumulado('2026-09-16')).toBe('pagueplay-acumulado-por-mes-2026-09-16.xlsx');
  });

  it('escreve os valores em reais, com totais em fórmula e valor já calculado', () => {
    const aba = wb.Sheets['Acumulado por mês'];
    expect(aba.A1.v).toBe('Acumulado por mês');
    expect(aba.A3.v).toContain('Gerado em 16/09/2026 às 14:32');
    expect(aba.A5.v).toBe('2026  ·  2 regionais');
    expect(utils.sheet_to_json(aba, { header: 1, range: 'A6:P6' })[0]).toEqual(
      ['#', 'COREN', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez', 'Total', '% do ano']);
    expect(aba.B7.v).toBe('COREN-SP');
    expect(aba.J7.v).toBe(1234.56);
    expect(aba.K7.v).toBe(100);
    expect(aba.O7).toMatchObject({ f: 'SUM(C7:N7)', v: 1334.56 });
    expect(aba.P7).toMatchObject({ f: 'IF($O$9=0,0,O7/$O$9)' });
    expect(aba.B8.v).toBe('COREN-PE');
    expect(aba.B9.v).toBe('TOTAL RECEBIDO');
    expect(aba.K9).toMatchObject({ f: 'SUM(K7:K8)', v: 650.5 });
    expect(aba.O9).toMatchObject({ f: 'SUM(C9:N9)', v: 1885.06 });
    expect(aba['!merges']?.length).toBe(4);
  });

  it('a aba sem cartão usa o relatório de conciliação', () => {
    const aba = wb.Sheets['Sem cartão de crédito'];
    expect(aba.A1.v).toBe('Acumulado por mês (sem cartão de crédito)');
    expect(aba.B7.v).toBe('COREN-RJ');
    expect(aba.K7.v).toBe(0.99);
  });

  it('leva estilo, painel congelado e formato de moeda', () => {
    const partes = unzipSync(arquivo);
    const estilos = strFromU8(partes['xl/styles.xml']);
    expect(estilos).toContain('formatCode="&quot;R$&quot; #,##0.00');
    expect(estilos).toContain('<patternFill patternType="solid"><fgColor rgb="FF14532D"/>');
    const folha = strFromU8(partes['xl/worksheets/sheet1.xml']);
    expect(folha).toContain('<pane xSplit="2" ySplit="6" topLeftCell="C7" activePane="bottomRight" state="frozen"/>');
    expect(folha).toContain('showGridLines="0"');
  });

  it('modalidade sem importação vira aba com aviso', () => {
    const vazio = montarPlanilhaAcumulado(abasAcumulado(pagamento, resumo([]), geradoEm), 't', geradoEm);
    const aba = read(vazio, { type: 'array' }).Sheets['Sem cartão de crédito'];
    expect(aba.A5.v).toContain('Nenhum pagamento salvo');
  });
});

describe('largura das colunas', () => {
  it('alarga a coluna do mês e do total quando o valor passa da casa dos milhões', () => {
    const geradoEm = new Date('2026-09-16T17:32:00Z');
    const grande = resumo([grupo('2026-03-01', 'SP', 98765432100), grupo('2026-03-02', 'MG', 1000)]);
    const folha = strFromU8(unzipSync(montarPlanilhaAcumulado(abasAcumulado(grande, resumo([]), geradoEm), 't', geradoEm))['xl/worksheets/sheet1.xml']);
    const largura = (col: number) => Number(folha.match(new RegExp(`<col min="${col}" max="${col}" width="([0-9.]+)"`))?.[1]);
    expect(largura(3)).toBe(15.5);   // Jan, vazio
    expect(largura(5)).toBeGreaterThan(19);   // Mar, R$ 987.654.321,00
    expect(largura(15)).toBeGreaterThan(largura(5));   // Total do ano em corpo 12
  });
});
