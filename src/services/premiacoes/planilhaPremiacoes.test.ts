/**
 * planilhaPremiacoes.test.ts — o Excel no modelo da planilha que circulava.
 *
 * Lê o arquivo de volta (zip → XML) e confere o que a gerência usa: o título e o
 * período no formato da planilha, as colunas na ordem dela, o crachá como TEXTO
 * (crachá não é número para somar), vazio ≠ zero e o total em fórmula.
 */
import { describe, it, expect } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { LinhaPremiacao } from './calculoPremiacoes';
import {
  montarPlanilhaPremiacoes, nomeArquivoPremiacoes, rotuloGeradoEm, rotuloPeriodo,
} from './planilhaPremiacoes';

function linha(over: Partial<LinhaPremiacao>): LinhaPremiacao {
  return {
    operadorId: 'op', nome: 'Ana Rocha', equipeNome: null, setorId: 's1', setorNome: 'Receptivo',
    celula: 'Birigui', tipo: 'premiacao', cracha: '1001',
    comissao: null, premiacao: 811.3, estado: 'bateu', faixa: 2, obs: '2ª meta',
    ...over,
  };
}

const LINHAS = [
  linha({}),
  linha({ operadorId: 'b', nome: 'Bia Souza', cracha: null, premiacao: 0, estado: 'nao_bateu', faixa: null, obs: 'Não bateu a 1ª meta' }),
  linha({ operadorId: 'c', nome: 'Bruno & Cia', setorNome: 'Play 4', celula: 'Marília', tipo: 'comissao', comissao: 500, premiacao: null }),
];

/** Só Birigui: Ana, que bateu, e Bia, que não. */
const BIRIGUI = LINHAS.slice(0, 2);

function abrir(linhas = LINHAS) {
  const arquivo = montarPlanilhaPremiacoes({
    empresaNome: 'BookPlay', setorNome: 'Receptivo', mes: '2026-08', parcial: false,
    geradoEm: new Date('2026-09-17T11:39:00Z'), linhas,
  });
  const partes = unzipSync(arquivo);
  return { folha: strFromU8(partes['xl/worksheets/sheet1.xml']), partes };
}

describe('rótulos', () => {
  it('período e geração como na planilha', () => {
    expect(rotuloPeriodo('2026-08')).toBe('agosto de 2026');
    expect(rotuloGeradoEm(new Date('2026-09-17T11:39:00Z'))).toBe('17/09/2026, 08:39');
  });

  it('nome do arquivo com o tipo do recorte, mês e setor', () => {
    expect(nomeArquivoPremiacoes({ mes: '2026-08', setorNome: 'Receptivo', linhas: BIRIGUI }))
      .toBe('premiacoes-2026-08-receptivo.xlsx');
    expect(nomeArquivoPremiacoes({ mes: '2026-08', setorNome: null, linhas: LINHAS }))
      .toBe('premiacoes-comissoes-2026-08-todos-os-setores.xlsx');
  });
});

describe('recorte de uma cidade só', () => {
  function abrirBirigui() {
    const partes = unzipSync(montarPlanilhaPremiacoes({
      empresaNome: 'BookPlay', setorNome: 'Receptivo', mes: '2026-08', parcial: false,
      geradoEm: new Date('2026-09-17T11:39:00Z'), linhas: BIRIGUI,
    }));
    return {
      folha: strFromU8(partes['xl/worksheets/sheet1.xml']),
      livro: strFromU8(partes['xl/workbook.xml']),
    };
  }

  it('Birigui sai só com Premiação: sem coluna nem título de comissão', () => {
    const { folha, livro } = abrirBirigui();
    expect(folha).toContain('>Relatório de Premiações<');
    expect(folha).toContain('>Premiação (R$)<');
    expect(folha).not.toContain('Comissão');
    expect(folha).toContain('Premiação: Birigui');
    expect(livro).toContain('<sheet name="Premiações"');
  });

  it('a coluna de valor é a D, a Obs. vem logo depois, e o total soma a D', () => {
    const { folha } = abrirBirigui();
    expect(folha).toMatch(/<c r="D6" s="\d+"><v>811.3<\/v>/);
    expect(folha).toContain('>Obs.<');
    expect(folha).toMatch(/<c r="E6" s="\d+" t="inlineStr"><is><t xml:space="preserve">2ª meta<\/t>/);
    expect(folha).toContain('<f>SUM(D6:D7)</f><v>811.3</v>');
    expect(folha).toContain('<autoFilter ref="A5:E7"/>');
    expect(folha).not.toMatch(/r="F\d+"/);
  });
});

describe('a folha', () => {
  it('título, período e as colunas do modelo, na ordem', () => {
    const { folha } = abrir();
    expect(folha).toContain('Relatório de Premiações e Comissões');
    expect(folha).toContain('Período: agosto de 2026  ·  Gerado em: 17/09/2026, 08:39');
    const cabecalho = ['Crachá', 'Nome', 'Setor', 'Comissão (R$)', 'Premiação (R$)', 'Obs.']
      .map(t => folha.indexOf(`>${t}<`));
    expect(cabecalho.every(i => i > 0)).toBe(true);
    expect([...cabecalho].sort((a, b) => a - b)).toEqual(cabecalho);
  });

  it('crachá sai como texto, e nome e setor em maiúsculas', () => {
    const { folha } = abrir();
    expect(folha).toMatch(/<c r="A6" s="\d+" t="inlineStr"><is><t xml:space="preserve">1001<\/t>/);
    expect(folha).toContain('>ANA ROCHA<');
    expect(folha).toContain('>RECEPTIVO<');
  });

  it('vazio não é zero: a célula de quem não se aplica não tem valor', () => {
    const { folha } = abrir();
    // Linha 6 (Ana, Birigui): Comissão vazia, Premiação 811,3.
    expect(folha).toMatch(/<c r="D6" s="\d+"\/>/);
    expect(folha).toMatch(/<c r="E6" s="\d+"><v>811.3<\/v>/);
    // Linha 7 (Bia): tinha meta e não bateu — zero.
    expect(folha).toMatch(/<c r="E7" s="\d+"><v>0<\/v>/);
  });

  it('total em fórmula com o valor pronto, e filtro no cabeçalho', () => {
    const { folha } = abrir();
    expect(folha).toContain('<f>SUM(D6:D8)</f><v>500</v>');
    expect(folha).toContain('<f>SUM(E6:E8)</f><v>811.3</v>');
    expect(folha).toContain('<autoFilter ref="A5:F8"/>');
    expect(folha).toContain('TOTAL  ·  3 pessoas');
  });

  it('escapa o texto que vem do banco', () => {
    expect(abrir().folha).toContain('BRUNO &amp; CIA');
  });

  it('sem pessoas, aviso no lugar da tabela e sem filtro', () => {
    const { folha } = abrir([]);
    expect(folha).toContain('Nenhuma pessoa neste recorte.');
    expect(folha).not.toContain('<autoFilter');
  });

  it('cores do Gestão em faixa lisa: sem índigo e sem degradê (19/09/2026)', () => {
    const estilos = strFromU8(abrir().partes['xl/styles.xml']);
    expect(estilos).toContain('FF00648E');
    expect(estilos).not.toContain('4F46E5');
    expect(estilos).not.toContain('gradientFill');
    expect(estilos).toContain('<name val="Calibri"/>');
  });

  it('leva formato de moeda no styles.xml', () => {
    const { partes } = abrir();
    expect(strFromU8(partes['xl/styles.xml'])).toContain('formatCode="&quot;R$&quot; #,##0.00"');
  });
});
