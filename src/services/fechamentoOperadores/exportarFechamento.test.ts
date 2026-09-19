/**
 * Baixar o Fechamento em Excel e em HTML — pedido de 14/09/2026.
 *
 * O que se protege:
 *   1. a ORDEM do arquivo é a da tela (quartil), e não outra;
 *   2. na planilha, número é número — a gerência soma e filtra no Excel;
 *   3. no HTML, nome digitado por gente é escapado, e nada é carregado de fora
 *      (o arquivo circula por e-mail e abre sem internet);
 *   4. (19/09/2026) o HTML é sempre claro, e o Excel tem estilo — título, cards,
 *      cabeçalho, filtro — com a tabela logo abaixo dos cards.
 */
import { describe, it, expect } from 'vitest';
import { read, utils, type WorkSheet } from '@e965/xlsx';
import { strFromU8, unzipSync } from 'fflate';
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

function lerPlanilha(d: DadosExportacaoFechamento) {
  return read(montarPlanilhaFechamento(d), { type: 'array' });
}

/** A linha do cabeçalho da tabela (em cima dela ficam o título e os cards). */
function linhaDoCabecalho(aba: WorkSheet): number {
  for (let r = 1; r <= 30; r++) if (aba[`A${r}`]?.v === 'Operador') return r;
  throw new Error('cabeçalho não encontrado');
}

describe('montarPlanilhaFechamento', () => {
  it('a aba Fechamento tem as colunas da tela, na ordem do quartil', () => {
    const wb = lerPlanilha(dados());
    const linhas = utils.sheet_to_json<(string | number)[]>(wb.Sheets.Fechamento, { header: 1, blankrows: false });
    const i = linhas.findIndex(l => l[0] === 'Operador');
    expect(linhas[i]).toEqual([
      'Operador', 'Equipe', 'Fechamento', 'Meta', 'Meta atingida', 'D.U. trabalhado',
      'Situação', 'Alcance meta', 'Quartil', 'Média fat. D.U.',
    ]);
    expect(linhas.slice(i + 1).map(l => l[0])).toEqual(['Primeira <b>Colocada</b>', 'Quarto Lugar', 'Sem Meta']);
  });

  it('valores são números, e não texto formatado', () => {
    const wb = lerPlanilha(dados());
    const aba = wb.Sheets.Fechamento;
    const r = linhaDoCabecalho(aba) + 1;
    expect(aba[`C${r}`].t).toBe('n');
    expect(aba[`C${r}`].v).toBe(120_000);
    expect(aba[`H${r}`].t).toBe('n');
    expect(aba[`H${r}`].v).toBeCloseTo(1.2);
    expect(aba[`I${r}`].v).toBe('1º quartil');
    expect(aba[`G${r}`].v).toBe('ASSÍDUO');
  });

  it('título, os quatro cards e a tabela com filtro e painel congelado', () => {
    const wb = lerPlanilha(dados());
    const aba = wb.Sheets.Fechamento;
    expect(aba.A1.v).toBe('Fechamento · Receptivo');
    const textos = Object.values(aba).map(c => (c as { v?: unknown })?.v);
    for (const card of ['FATURAMENTO TOTAL', 'MÉDIA POR DIA ÚTIL', 'MÉDIA POR FUNCIONÁRIO', 'PREENCHIDOS']) {
      expect(textos).toContain(card);
    }
    // O card de faturamento é número em reais, como o da tela.
    expect(textos).toContain(140_000);

    const folha = strFromU8(unzipSync(montarPlanilhaFechamento(dados()))['xl/worksheets/sheet1.xml']);
    const cab = linhaDoCabecalho(aba);
    expect(folha).toContain(`<autoFilter ref="A${cab}:J${cab + 3}"/>`);
    expect(folha).toContain(`ySplit="${cab}"`);
    expect(folha).toContain('showGridLines="0"');
  });

  it('as cores são as do Gestão, e não o índigo antigo', () => {
    const estilos = strFromU8(unzipSync(montarPlanilhaFechamento(dados()))['xl/styles.xml']);
    expect(estilos).toContain('FF00648E');
    expect(estilos).not.toContain('4F46E5');
    expect(estilos).toContain('formatCode="&quot;R$&quot; #,##0.00"');
  });

  it('a aba Resumo traz os cards da tela', () => {
    const wb = lerPlanilha(dados());
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

  it('é sempre claro: nada de modo escuro, e o navegador é avisado', () => {
    const html = montarHtmlFechamentoOperadores(dados());
    expect(html).not.toMatch(/prefers-color-scheme/);
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).toContain('color-scheme:light');
    // O azul do Gestão como tema, e não o índigo antigo (o índigo que sobra é
    // o do 2º quartil, a mesma cor de `COR_QUARTIL` na tela).
    expect(html).toContain('--primario:#00648E');
    expect(html).not.toMatch(/--acento:#6366f1/i);
  });

  it('traz os quatro cards da tela', () => {
    const html = montarHtmlFechamentoOperadores(dados());
    for (const card of ['Faturamento total', 'Média por dia útil', 'Média por funcionário', 'Preenchidos']) {
      expect(html).toContain(`<div class="rot">${card}</div>`);
    }
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
