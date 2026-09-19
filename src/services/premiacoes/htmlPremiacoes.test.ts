/**
 * htmlPremiacoes.test.ts — Premiações e Comissões em HTML (19/09/2026).
 *
 * O que se protege: a página é sempre clara e autocontida, escapa o texto do
 * banco, mostra só as colunas do tipo do recorte (como a tela e o Excel) e o
 * valor de quem bateu no selo verde, com vazio ≠ zero.
 */
import { describe, it, expect } from 'vitest';
import type { LinhaPremiacao } from './calculoPremiacoes';
import { montarHtmlPremiacoes } from './htmlPremiacoes';
import { nomeArquivoPremiacoes } from './planilhaPremiacoes';

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
  linha({ operadorId: 'c', nome: 'Bruno <b>&</b> Cia', setorNome: 'Play 4', celula: 'Marília', tipo: 'comissao', comissao: 500, premiacao: null }),
];
const BIRIGUI = LINHAS.slice(0, 2);

function html(linhas = LINHAS, parcial = false) {
  return montarHtmlPremiacoes({
    empresaNome: 'BookPlay', setorNome: 'Receptivo', mes: '2026-08', parcial,
    geradoEm: new Date('2026-09-17T11:39:00Z'), linhas,
  });
}

describe('montarHtmlPremiacoes', () => {
  it('é sempre claro e autocontido', () => {
    const h = html();
    expect(h).not.toMatch(/prefers-color-scheme/);
    expect(h).toContain('<meta name="color-scheme" content="light">');
    expect(h).not.toMatch(/<script|<link|src=|@import|https?:\/\//i);
  });

  it('escapa o texto do banco', () => {
    const h = html();
    expect(h).not.toContain('<b>&</b>');
    expect(h).toContain('Bruno &lt;b&gt;&amp;&lt;/b&gt; Cia');
  });

  it('Birigui: só Premiação, no título, no cabeçalho e nos cards', () => {
    const h = html(BIRIGUI);
    expect(h).toContain('<h1>Relatório de Premiações</h1>');
    expect(h).toContain('Premiação (R$)');
    expect(h).not.toContain('Comissão (R$)');
    expect(h).toContain('Bateram a meta');
    expect(h).not.toContain('Total a pagar');
  });

  it('as duas cidades: as duas colunas e o total a pagar', () => {
    const h = html();
    expect(h).toContain('<h1>Relatório de Premiações e Comissões</h1>');
    expect(h).toContain('Premiação (R$)');
    expect(h).toContain('Comissão (R$)');
    expect(h).toContain('Total a pagar');
  });

  it('quem bateu: selo verde com a meta ao lado; quem não bateu: R$ 0,00 comum', () => {
    const h = html(BIRIGUI);
    expect(h).toMatch(/2ª meta<\/span> <span class="valor-ok">R\$\s811,30<\/span>/);
    expect(h).toMatch(/<span class="fraco">R\$\s0,00<\/span>/);
  });

  it('avisa quando o mês está aberto', () => {
    expect(html(LINHAS, true)).toContain('ainda está aberto');
    expect(html(LINHAS, false)).not.toContain('ainda está aberto');
  });
});

describe('nomeArquivoPremiacoes em HTML', () => {
  it('mesmo nome do Excel, com a extensão .html', () => {
    expect(nomeArquivoPremiacoes({ mes: '2026-08', setorNome: 'Receptivo', linhas: BIRIGUI }, 'html'))
      .toBe('premiacoes-2026-08-receptivo.html');
  });
});
