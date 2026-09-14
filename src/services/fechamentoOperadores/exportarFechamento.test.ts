/**
 * Baixar o Fechamento em Excel e em HTML — pedido de 14/09/2026.
 *
 * O que se protege:
 *   1. a ORDEM do arquivo é a da tela (quartil), e não outra;
 *   2. na planilha, número é número — a gerência soma e filtra no Excel;
 *   3. no HTML, nome digitado por gente é escapado, e nada é carregado de fora
 *      (o arquivo circula por e-mail e abre sem internet).
 */
import { describe, it, expect } from 'vitest';
import { read, utils } from '@e965/xlsx';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import {
  montarLinhaFechamento, ordenarLinhasFechamento, resumirFechamento,
  type EntradaLinhaFechamento,
} from './calculoFechamento';
import {
  montarPlanilhaFechamento, montarHtmlFechamentoOperadores, nomeArquivoFechamentoOperadores,
  type DadosExportacaoFechamento,
} from './exportarFechamento';

function entrada(parcial: Partial<EntradaLinhaFechamento>): EntradaLinhaFechamento {
  return {
    operadorId: parcial.nome ?? 'op', nome: 'Operador', equipeNome: 'Equipe Matheus',
    fechamento: 0, meta: null, metasExtras: [], duTrabalhado: null, situacao: null,
    totalUteis: 22, decorridos: 22, ...parcial,
  };
}

function dados(over: Partial<DadosExportacaoFechamento> = {}): DadosExportacaoFechamento {
  const linhas = ordenarLinhasFechamento([
    montarLinhaFechamento(entrada({ nome: 'Quarto Lugar', fechamento: 20_000, meta: 100_000, duTrabalhado: 20, situacao: 'assiduo' }), QUARTIS_PADRAO),
    montarLinhaFechamento(entrada({ nome: 'Primeira <b>Colocada</b>', fechamento: 120_000, meta: 100_000, duTrabalhado: 21, situacao: 'assiduo' }), QUARTIS_PADRAO),
    montarLinhaFechamento(entrada({ nome: 'Sem Meta', fechamento: 5_000 }), QUARTIS_PADRAO),
  ]);
  return {
    empresaNome: 'BookPlay',
    setorNome: 'Receptivo',
    mes: '2026-09',
    mesRotulo: 'setembro/2026',
    parcial: false,
    geradoEm: new Date('2026-09-14T18:30:00Z'),
    linhas,
    resumo: resumirFechamento(linhas, QUARTIS_PADRAO),
    ...over,
  };
}

async function lerPlanilha(d: DadosExportacaoFechamento) {
  const buffer = await montarPlanilhaFechamento(d);
  return read(buffer, { type: 'array' });
}

describe('montarPlanilhaFechamento', () => {
  it('a aba Fechamento tem as colunas da tela, na ordem do quartil', async () => {
    const wb = await lerPlanilha(dados());
    const linhas = utils.sheet_to_json<(string | number)[]>(wb.Sheets.Fechamento, { header: 1 });
    expect(linhas[0]).toEqual([
      'Operador', 'Equipe', 'Fechamento', 'Meta', 'Meta atingida', 'D.U. trabalhado',
      'Situação', 'Alcance meta', 'Quartil', 'Média fat. D.U.',
    ]);
    expect(linhas.slice(1).map(l => l[0])).toEqual(['Primeira <b>Colocada</b>', 'Quarto Lugar', 'Sem Meta']);
  });

  it('valores são números, e não texto formatado', async () => {
    const wb = await lerPlanilha(dados());
    const aba = wb.Sheets.Fechamento;
    expect(aba.C2.t).toBe('n');
    expect(aba.C2.v).toBe(120_000);
    expect(aba.H2.t).toBe('n');
    expect(aba.H2.v).toBeCloseTo(1.2);
    expect(aba.I2.v).toBe('1º quartil');
    expect(aba.G2.v).toBe('ASSÍDUO');
  });

  it('a aba Resumo traz os cards da tela', async () => {
    const wb = await lerPlanilha(dados());
    const resumo = utils.sheet_to_json<(string | number)[]>(wb.Sheets.Resumo, { header: 1 });
    const faturamento = resumo.find(l => l[0] === 'Faturamento total');
    expect(faturamento?.[1]).toBe(140_000);
  });
});

describe('montarHtmlFechamentoOperadores', () => {
  it('escapa o nome digitado', () => {
    const html = montarHtmlFechamentoOperadores(dados());
    expect(html).not.toContain('<b>Colocada</b>');
    expect(html).toContain('Primeira &lt;b&gt;Colocada&lt;/b&gt;');
  });

  it('segue a ordem da tela', () => {
    const html = montarHtmlFechamentoOperadores(dados());
    const primeira = html.indexOf('Primeira &lt;b&gt;');
    const quarto = html.indexOf('Quarto Lugar');
    const semMeta = html.indexOf('Sem Meta');
    expect(primeira).toBeGreaterThan(-1);
    expect(primeira).toBeLessThan(quarto);
    expect(quarto).toBeLessThan(semMeta);
  });

  it('é autocontido: nada de script, imagem ou folha de fora', () => {
    const html = montarHtmlFechamentoOperadores(dados());
    expect(html).not.toMatch(/<script|<link|src=|@import|https?:\/\//i);
  });

  it('diz de onde é, e avisa quando o mês ainda está aberto', () => {
    expect(montarHtmlFechamentoOperadores(dados())).toContain('Receptivo');
    expect(montarHtmlFechamentoOperadores(dados())).not.toContain('parcial');
    expect(montarHtmlFechamentoOperadores(dados({ parcial: true }))).toContain('parcial');
    expect(montarHtmlFechamentoOperadores(dados({ setorNome: null }))).toContain('Todos os setores');
  });
});

describe('nomeArquivoFechamentoOperadores', () => {
  it('mês e setor, sem acento nem espaço', () => {
    expect(nomeArquivoFechamentoOperadores(dados({ setorNome: 'Núcleo de Gestão' }), 'xlsx'))
      .toBe('fechamento-operadores-2026-09-nucleo-de-gestao.xlsx');
    expect(nomeArquivoFechamentoOperadores(dados({ setorNome: null }), 'html'))
      .toBe('fechamento-operadores-2026-09-todos-os-setores.html');
  });
});
