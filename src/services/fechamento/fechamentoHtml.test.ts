/**
 * O relatório de fechamento como página.
 *
 * O que estes testes protegem, em ordem de gravidade:
 *
 *   1. **Escape.** Nome de setor e de operador são digitados por gente e vão
 *      direto para dentro do HTML. Um `<script>` num nome viraria execução no
 *      navegador de quem abrir o arquivo — que é a diretoria.
 *   2. **Autocontido.** Nenhuma referência externa. O arquivo é aberto de anexo
 *      e de pen drive, em sala de reunião, às vezes sem internet.
 *   3. **Recorte por cargo.** O relatório do operador não pode conter o nome
 *      nem o número de colega nenhum.
 */

import { describe, it, expect } from 'vitest';
import { montarHtmlFechamento, nomeArquivoFechamento } from './fechamentoHtml';
import type { DadosFechamento, LinhaOperadorFechamento } from './tipos';

function operador(over: Partial<LinhaOperadorFechamento> = {}): LinhaOperadorFechamento {
  return {
    id: 'op-1', nome: 'Kauan Teixeira', usuario: 'kauan_teixeira',
    setorNome: 'Receptivo', equipeNome: 'Matheus',
    bruto: 69_949.23, ho: 0, qtd: 231,
    meta: 130_000, pctMeta: 54, projecaoPct: 96, quartil: 2, diferenca: -2_500,
    ...over,
  };
}

function dados(over: Partial<DadosFechamento> = {}): DadosFechamento {
  return {
    alvo: {
      nivel: 'setor',
      empresaNome: 'BOOKPLAY',
      mes: '2026-07',
      mesRotulo: 'Julho 2026',
      setorNome: 'Receptivo',
      operadorNome: null,
      geradoPor: 'Kauan',
      geradoEm: '15/08/2026 às 14:32',
      mesFechado: true,
    },
    diasUteis: { total: 21, decorridos: 21 },
    quartisConfig: [
      { quartil: 1, min_pct: 100 }, { quartil: 2, min_pct: 80 },
      { quartil: 3, min_pct: 50 }, { quartil: 4, min_pct: 0 },
    ],
    resumo: {
      rotulo: 'Setor Receptivo',
      totalBruto: 1_168_344.63,
      totalHO: 0,
      qtdPagamentos: 2_934,
      meta: 1_300_000,
      pctMeta: 90,
      projecao: {
        metaDiaria: 61_904.76, esperado: 1_300_000, diferenca: -131_655.37,
        projecaoPct: 90, quartil: { quartil: 2, min_pct: 80 },
        proximo: { quartil: 1, min_pct: 100 }, paraSubir: 131_655.37,
      },
      porForma: [
        { rotulo: 'Pix', bruto: 800_000, ho: 0, qtd: 2_000, pct: 68.5 },
        { rotulo: 'Boleto', bruto: 368_344.63, ho: 0, qtd: 934, pct: 31.5 },
      ],
      porDia: Array.from({ length: 31 }, (_, i) => ({
        dia: i + 1, bruto: (i + 1) * 1_000, ho: 0, qtd: i + 1,
      })),
      melhorDia: { dia: 31, bruto: 31_000, ho: 0, qtd: 31 },
      vinculo: {
        direto: 90_733.02, extra: 36_854.48, naoTabulado: 1_040_757.13,
        qtdDireto: 193, qtdExtra: 97, qtdNaoTabulado: 2_644,
      },
    },
    operadores: [operador()],
    ranking: [operador(), operador({ id: 'op-2', nome: 'Nayara Cruz', bruto: 72_960.75 })],
    quartis: [
      { faixa: { quartil: 2, min_pct: 80 }, operadores: [operador()] },
      { faixa: { quartil: 1, min_pct: 100 }, operadores: [] },
    ],
    setores: [],
    destaques: [
      { dia: '2026-07-01', diaRotulo: '01/07 (Qua)', nome: 'Nayara Cruz', total: 9_000, pagamentos: 12 },
    ],
    avisos: ['Julho 2026 ainda está aberto: este é um retrato parcial.'],
    ...over,
  };
}

describe('montarHtmlFechamento — segurança', () => {
  it('escapa HTML vindo de nome de setor e de operador', () => {
    const html = montarHtmlFechamento(dados({
      alvo: { ...dados().alvo, setorNome: '<script>alert(1)</script>' },
      operadores: [operador({ nome: '<img src=x onerror=alert(2)>' })],
    }));

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(2)>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
  });

  it('escapa aspas — nome vai parar dentro de atributo', () => {
    const html = montarHtmlFechamento(dados({
      alvo: { ...dados().alvo, geradoPor: 'Ana" onload="x' },
    }));
    expect(html).not.toContain('onload="x');
    expect(html).toContain('&quot;');
  });
});

describe('montarHtmlFechamento — arquivo autocontido', () => {
  const html = montarHtmlFechamento(dados());

  it('não referencia nenhum host externo', () => {
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });

  it('leva CSS e o script das abas embutidos', () => {
    expect(html).toContain('<style>');
    expect(html).toContain("document.querySelectorAll('.aba')");
  });

  it('é uma página completa, com título que nomeia mês e escopo', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>Fechamento Julho 2026');
    expect(html).toContain('Setor Receptivo');
  });
});

describe('montarHtmlFechamento — conteúdo', () => {
  it('traz as abas de operadores, quartis, ranking e destaques', () => {
    const html = montarHtmlFechamento(dados());
    for (const aba of ['Fechamento', 'Operadores', 'Quartis', 'Ranking', 'Destaques do dia']) {
      expect(html).toContain(`>${aba}</button>`);
    }
  });

  it('a aba da diretoria só existe quando há comparativo de setores', () => {
    expect(montarHtmlFechamento(dados())).not.toContain('Painel da Diretoria');

    const comSetores = montarHtmlFechamento(dados({
      setores: [{
        id: 's1', nome: 'Receptivo', bruto: 1_168_344.63, ho: 0, qtd: 2_934,
        meta: 1_300_000, pctMeta: 90, operadores: 14, pctDaEmpresa: 42.1,
      }],
    }));
    expect(comSetores).toContain('Painel da Diretoria');
    expect(comSetores).toContain('Comparativo entre setores');
  });

  it('quartil sem ninguém não vira bloco vazio na tela', () => {
    const html = montarHtmlFechamento(dados());
    expect(html).toContain('2º quartil');
    expect(html).not.toContain('1º quartil');
  });

  it('o bloco de vínculo some quando o setor não usa Direto/Extra', () => {
    const d = dados();
    const semVinculo = montarHtmlFechamento({
      ...d, resumo: { ...d.resumo, vinculo: null },
    });
    expect(semVinculo).not.toContain('Composição por vínculo');
    expect(montarHtmlFechamento(d)).toContain('Composição por vínculo');
  });

  it('os avisos aparecem — número redondo sem ressalva não se reconcilia depois', () => {
    expect(montarHtmlFechamento(dados())).toContain('retrato parcial');
  });
});

describe('montarHtmlFechamento — recorte do operador', () => {
  it('o relatório do operador não cita colega nenhum', () => {
    const html = montarHtmlFechamento(dados({
      alvo: {
        ...dados().alvo, nivel: 'operador',
        setorNome: null, operadorNome: 'Kauan Teixeira',
      },
      resumo: { ...dados().resumo, rotulo: 'Kauan Teixeira' },
      operadores: [],
      ranking: [operador()],
      quartis: [],
      destaques: [],
      setores: [],
    }));

    expect(html).not.toContain('Nayara Cruz');
    expect(html).not.toContain('>Operadores</button>');
    expect(html).not.toContain('>Ranking</button>');
    expect(html).toContain('Kauan Teixeira');
  });
});

describe('montarHtmlFechamento — a página abre de verdade', () => {
  /**
   * Um relatório com uma tag mal fechada abre em branco no navegador de quem
   * recebeu — e só se descobre na reunião. Aqui o HTML é parseado e a navegação
   * por abas é conferida contra o DOM real, não contra substring.
   */
  const doc = new DOMParser().parseFromString(montarHtmlFechamento(dados()), 'text/html');

  it('parseia sem erro e monta a estrutura esperada', () => {
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelector('title')?.textContent).toContain('Fechamento Julho 2026');
    expect(doc.querySelectorAll('style').length).toBe(1);
  });

  it('cada botão de aba aponta para um painel que existe', () => {
    const botoes = [...doc.querySelectorAll('.aba')];
    expect(botoes.length).toBeGreaterThan(1);
    for (const b of botoes) {
      const alvo = b.getAttribute('data-alvo');
      expect(alvo, 'botão sem data-alvo').toBeTruthy();
      expect(doc.getElementById(alvo as string), `painel ${alvo} não existe`).not.toBeNull();
    }
    expect(botoes.length).toBe(doc.querySelectorAll('.conteudo').length);
  });

  it('exatamente uma aba nasce ativa', () => {
    expect(doc.querySelectorAll('.aba.ativa').length).toBe(1);
    expect(doc.querySelectorAll('.conteudo.ativa').length).toBe(1);
  });

  it('os gráficos são SVG embutido, sem imagem remota', () => {
    expect(doc.querySelectorAll('svg').length).toBeGreaterThan(0);
    expect(doc.querySelectorAll('img').length).toBe(0);
  });
});

describe('nomeArquivoFechamento', () => {
  it('data ordenável na frente, sem acento e sem espaço', () => {
    expect(nomeArquivoFechamento(dados())).toBe('fechamento-2026-07-receptivo.html');
  });

  it('usa o nome do operador quando o relatório é individual', () => {
    const nome = nomeArquivoFechamento(dados({
      alvo: { ...dados().alvo, nivel: 'operador', operadorNome: 'José Vitória' },
    }));
    expect(nome).toBe('fechamento-2026-07-jose-vitoria.html');
  });

  it('cai na empresa quando não há setor nem operador', () => {
    const nome = nomeArquivoFechamento(dados({
      alvo: { ...dados().alvo, setorNome: null, operadorNome: null },
    }));
    expect(nome).toBe('fechamento-2026-07-bookplay.html');
  });
});
