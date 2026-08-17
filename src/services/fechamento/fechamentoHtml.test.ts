/**
 * O relatório de fechamento como página.
 *
 * O que estes testes protegem, em ordem de gravidade:
 *
 *   1. **Escape.** Nome de setor e de operador são digitados por gente e vão
 *      direto para dentro do HTML. Um `<script>` num nome viraria execução no
 *      navegador de quem abrir o arquivo — que é a diretoria.
 *   2. **Recorte por cargo.** O relatório do operador não pode conter o nome
 *      nem o número de colega nenhum. É o ponto mais arriscado do módulo: uma
 *      página por pessoa é onde é mais fácil vazar gente de outro setor.
 *   3. **Autocontido.** Nenhuma referência externa. O arquivo é aberto de anexo
 *      e de pen drive, em sala de reunião, às vezes sem internet.
 *   4. **Estrutura.** Toda aba aponta para um painel que existe, e o documento
 *      parseia — um HTML gerado por string não quebra, só abre em branco.
 */

import { describe, it, expect } from 'vitest';
import { montarHtmlFechamento, nomeArquivoFechamento } from './fechamentoHtml';
import { fraseVeredito } from './secoes/capa';
import { TETO_PAGINAS_INDIVIDUAIS } from './secoes/individual';
import type {
  DadosFechamento, LinhaOperadorFechamento, BlocoPixFechamento,
} from './tipos';

// ── Fábricas ─────────────────────────────────────────────────────────────────

function operador(over: Partial<LinhaOperadorFechamento> = {}): LinhaOperadorFechamento {
  return {
    id: 'op-1', nome: 'Kauan Teixeira', usuario: 'kauan_teixeira',
    setorNome: 'Receptivo', equipeNome: 'Matheus',
    bruto: 69_949.23, ho: 0, qtd: 231,
    meta: 130_000, pctMeta: 54, projecaoPct: 96, quartil: 2, diferenca: -2_500,
    metasExtras: [], metasBatidas: 0,
    porDia: [1000, 0, 2500, 900], porForma: [
      { rotulo: 'Pix', bruto: 40_000, ho: 0, qtd: 140, pct: 57.2 },
      { rotulo: 'Boleto', bruto: 29_949.23, ho: 0, qtd: 91, pct: 42.8 },
    ],
    ...over,
  };
}

function pixBloco(over: Partial<BlocoPixFechamento> = {}): BlocoPixFechamento {
  return {
    total: 48_200, acordos: 96, comissao: 12_050, pctComissao: 0.25,
    ranking: [
      { id: 'op-1', nome: 'Kauan Teixeira', valor: 30_000, acordos: 60, comissao: 7_500 },
      { id: 'op-2', nome: 'Nayara Cruz', valor: 18_200, acordos: 36, comissao: 4_550 },
    ],
    metasPorEquipe: [
      {
        equipeId: 'e1', nome: 'Matheus', realizado: 30_000, acordos: 60,
        meta: 40_000, metaAcordos: 70, pctValor: 75, projecao: 88,
      },
      {
        equipeId: 'e2', nome: 'Bryan', realizado: 18_200, acordos: 36,
        meta: null, metaAcordos: null, pctValor: 0, projecao: null,
      },
    ],
    consolidado: { realizado: 48_200, meta: 40_000, pctValor: 120, projecao: 135 },
    dobra: { requisito: 18, alcancado: 96, atingida: true, comissaoComDobra: 24_100 },
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
    operadores: [operador(), operador({ id: 'op-2', nome: 'Nayara Cruz', bruto: 72_960.75 })],
    ranking: [operador(), operador({ id: 'op-2', nome: 'Nayara Cruz', bruto: 72_960.75 })],
    quartis: [
      { faixa: { quartil: 2, min_pct: 80 }, operadores: [operador()] },
      { faixa: { quartil: 1, min_pct: 100 }, operadores: [] },
    ],
    setores: [],
    destaques: [
      { dia: '2026-07-01', diaRotulo: '01/07 (Qua)', nome: 'Nayara Cruz', total: 9_000, pagamentos: 12 },
    ],
    pix: pixBloco(),
    comparativo: {
      mesAnterior: '2026-06', mesAnteriorRotulo: 'Junho 2026', temBase: true,
      brutoAnterior: 1_000_000, qtdAnterior: 2_500, metaAnterior: 1_200_000,
      variacaoBruto: 168_344.63, variacaoBrutoPct: 16.8,
      variacaoQtd: 434, variacaoQtdPct: 17.4,
      posicaoAnteriorPorOperador: { 'op-1': 2, 'op-2': 1 },
    },
    curiosidades: [
      { titulo: 'Dia de pico', destaque: 'Dia 31', texto: 'R$ 31.000,00 em 31 pagamentos.' },
    ],
    operadoresSemPagina: 0,
    metasExtrasEscopo: [],
    avisos: ['Julho 2026 ainda está aberto: este é um retrato parcial.'],
    ...over,
  };
}

// ── Segurança ────────────────────────────────────────────────────────────────

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

  it('escapa nos campos NOVOS: Pix, curiosidades e índice individual', () => {
    const html = montarHtmlFechamento(dados({
      pix: pixBloco({
        ranking: [{ id: 'x', nome: '<b>Pix</b>', valor: 1, acordos: 1, comissao: 1 }],
        metasPorEquipe: [{
          equipeId: 'e', nome: '"><script>x</script>', realizado: 1, acordos: 1,
          meta: 10, metaAcordos: 1, pctValor: 10, projecao: 10,
        }],
      }),
      curiosidades: [{ titulo: '<i>t</i>', destaque: '<u>d</u>', texto: '<em>x</em>' }],
      operadores: [operador({ nome: '<span>Nome</span>' })],
    }));

    expect(html).not.toContain('<b>Pix</b>');
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<i>t</i>');
    expect(html).not.toContain('<span>Nome</span>');
  });
});

// ── Autocontenção ────────────────────────────────────────────────────────────

describe('montarHtmlFechamento — arquivo autocontido', () => {
  const html = montarHtmlFechamento(dados());

  it('não referencia nenhum host externo', () => {
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });

  it('leva CSS e o script de navegação embutidos', () => {
    expect(html).toContain('<style>');
    expect(html).toContain('apresentando');
  });

  it('é uma página completa, com título que nomeia mês e escopo', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>Fechamento Julho 2026');
    expect(html).toContain('Setor Receptivo');
  });
});

// ── Estrutura no DOM ─────────────────────────────────────────────────────────

describe('montarHtmlFechamento — a página abre de verdade', () => {
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

  it('o controle do modo apresentação existe e nasce escondido pelo CSS', () => {
    expect(doc.querySelector('#btn-apresentar')).not.toBeNull();
    expect(doc.querySelector('.controle-slides')).not.toBeNull();
    expect(doc.querySelector('#slide-posicao')?.textContent).toContain('de');
  });

  it('sem JavaScript o documento continua legível — nenhuma seção é escondida no markup', () => {
    // A primeira nasce ativa; as demais dependem do CSS `.conteudo{display:none}`,
    // e a regra de impressão devolve todas. Nada é removido do HTML.
    expect(doc.querySelectorAll('.conteudo').length).toBeGreaterThan(1);
    expect(doc.body.textContent).toContain('Ranking do mês');
  });
});

// ── Conteúdo e presença condicional ─────────────────────────────────────────

describe('montarHtmlFechamento — seções', () => {
  const abas = (d: DadosFechamento) =>
    [...new DOMParser().parseFromString(montarHtmlFechamento(d), 'text/html')
      .querySelectorAll('.aba')].map(b => b.textContent?.trim());

  it('traz as abas esperadas no relatório de setor', () => {
    expect(abas(dados())).toEqual([
      'Visão do mês', 'Operadores', 'Quartis', 'Ranking',
      'Pix Automático', 'Destaques', 'Fechamento individual',
    ]);
  });

  it('a aba da diretoria só existe quando há comparativo de setores', () => {
    expect(abas(dados())).not.toContain('Painel da Diretoria');
    expect(abas(dados({
      setores: [{
        id: 's1', nome: 'Receptivo', bruto: 1_168_344.63, ho: 0, qtd: 2_934,
        meta: 1_300_000, pctMeta: 90, operadores: 14, pctDaEmpresa: 42.1,
      }],
    }))).toContain('Painel da Diretoria');
  });

  it('sem Pix no mês, a seção some do menu e do corpo', () => {
    const html = montarHtmlFechamento(dados({ pix: null }));
    expect(abas(dados({ pix: null }))).not.toContain('Pix Automático');
    expect(html).not.toContain('Pix Automático');
  });

  it('o aviso de dupla contagem acompanha a seção de Pix', () => {
    expect(montarHtmlFechamento(dados())).toContain('já está contido');
  });

  it('quartil sem ninguém não vira bloco vazio na tela', () => {
    const html = montarHtmlFechamento(dados());
    expect(html).toContain('2º quartil');
    // O 1º aparece só na legenda da pizza, com zero — nunca como bloco de lista.
    expect(html).not.toContain('<h4 style="color:#22c55e">');
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

  it('o comparativo sem base informa a ausência em vez de mostrar variação', () => {
    const html = montarHtmlFechamento(dados({
      comparativo: {
        mesAnterior: '2026-06', mesAnteriorRotulo: 'Junho 2026', temBase: false,
        brutoAnterior: 0, qtdAnterior: 0, metaAnterior: null,
        variacaoBruto: 0, variacaoBrutoPct: null, variacaoQtd: 0, variacaoQtdPct: null,
        posicaoAnteriorPorOperador: {},
      },
    }));
    expect(html).toContain('sem base de comparação');
  });
});

// ── Capa e veredito ──────────────────────────────────────────────────────────

describe('fraseVeredito', () => {
  it('meta batida diz por quanto superou', () => {
    const d = dados();
    const frase = fraseVeredito({
      ...d,
      resumo: { ...d.resumo, totalBruto: 1_400_000, meta: 1_300_000, pctMeta: 107.7 },
    });
    expect(frase).toContain('bateu a meta');
    expect(frase).toContain('acima do alvo');
  });

  it('meta não batida diz quanto faltou, sem comemorar', () => {
    const frase = fraseVeredito(dados());
    expect(frase).toContain('faltaram');
    expect(frase).not.toContain('bateu a meta');
  });

  it('sem meta não inventa percentual', () => {
    const d = dados();
    const frase = fraseVeredito({ ...d, resumo: { ...d.resumo, meta: null, pctMeta: 0 } });
    expect(frase).toContain('Não havia meta cadastrada');
    expect(frase).not.toContain('%');
  });

  it('mês em curso é marcado como parcial na capa', () => {
    const html = montarHtmlFechamento(dados({
      alvo: { ...dados().alvo, mesFechado: false },
    }));
    expect(html).toContain('Retrato parcial');
  });
});

// ── Recorte por cargo ────────────────────────────────────────────────────────

describe('montarHtmlFechamento — recorte do operador', () => {
  const soEu = dados({
    alvo: {
      ...dados().alvo, nivel: 'operador',
      setorNome: null, operadorNome: 'Kauan Teixeira',
    },
    resumo: { ...dados().resumo, rotulo: 'Kauan Teixeira' },
    operadores: [operador()],
    ranking: [operador()],
    quartis: [],
    destaques: [],
    setores: [],
    pix: pixBloco({ ranking: [], metasPorEquipe: [], consolidado: null }),
  });

  const html = montarHtmlFechamento(soEu);

  it('não cita colega nenhum', () => {
    expect(html).not.toContain('Nayara Cruz');
    expect(html).not.toContain('op-2');
  });

  it('não tem tabela comparativa de operadores nem ranking', () => {
    expect(html).not.toContain('>Operadores</button>');
    expect(html).not.toContain('>Ranking</button>');
  });

  it('tem a página individual da própria pessoa', () => {
    expect(html).toContain('Fechamento individual');
    expect(html).toContain('Kauan Teixeira');
  });

  it('o Pix dele aparece, sem ranking e sem meta de equipe', () => {
    expect(html).toContain('Pix Automático');
    expect(html).not.toContain('Meta de Pix por equipe');
    expect(html).not.toContain('Ranking de Pix por operador');
  });
});

describe('montarHtmlFechamento — recorte do líder e da diretoria', () => {
  it('o relatório de líder não mostra a coluna de setor', () => {
    const html = montarHtmlFechamento(dados());
    expect(html).toContain('>Operadores</button>');
    expect(html).not.toContain('<th>Setor</th>');
  });

  it('o da diretoria mostra a coluna de setor e agrupa as páginas individuais', () => {
    const html = montarHtmlFechamento(dados({
      alvo: { ...dados().alvo, nivel: 'diretoria', setorNome: null },
      setores: [{
        id: 's1', nome: 'Receptivo', bruto: 100, ho: 0, qtd: 1,
        meta: 200, pctMeta: 50, operadores: 2, pctDaEmpresa: 100,
      }],
    }));
    expect(html).toContain('<th>Setor</th>');
    expect(html).toContain('<div class="divisor">Receptivo</div>');
  });
});

// ── Fechamento individual ────────────────────────────────────────────────────

describe('seção de fechamento individual', () => {
  const muitos = Array.from({ length: TETO_PAGINAS_INDIVIDUAIS + 5 }, (_, i) =>
    operador({ id: `op-${i}`, nome: `Operador ${i}`, bruto: 100_000 - i * 100 }));

  it('respeita o teto de páginas e informa quantos ficaram de fora', () => {
    const html = montarHtmlFechamento(dados({
      operadores: muitos, ranking: muitos, operadoresSemPagina: 5,
    }));
    const paginas = new DOMParser().parseFromString(html, 'text/html')
      .querySelectorAll('.pessoa').length;

    expect(paginas).toBe(TETO_PAGINAS_INDIVIDUAIS);
    expect(html).toContain('não ganharam página própria');
    // Quem ficou de fora continua na tabela e no ranking.
    expect(html).toContain(`Operador ${TETO_PAGINAS_INDIVIDUAIS + 4}`);
  });

  it('o índice aponta para âncoras que existem', () => {
    const doc = new DOMParser().parseFromString(montarHtmlFechamento(dados()), 'text/html');
    const links = [...doc.querySelectorAll('.indice-pessoas a')];
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      const alvo = (a.getAttribute('href') ?? '').replace('#', '');
      expect(doc.getElementById(alvo), `âncora ${alvo} não existe`).not.toBeNull();
    }
  });

  it('sem meta, informa em vez de mostrar 0%', () => {
    const html = montarHtmlFechamento(dados({
      operadores: [operador({ meta: null, pctMeta: 0, projecaoPct: null, quartil: null, diferenca: null })],
    }));
    expect(html).toContain('Sem meta cadastrada para esta pessoa');
  });

  it('sem movimento, o zero é explícito', () => {
    const html = montarHtmlFechamento(dados({
      operadores: [operador({ bruto: 0, qtd: 0, porDia: [], porForma: [] })],
    }));
    expect(html).toContain('ausência de movimento, não ausência de dado');
  });

  it('metas em cascata viram marcos e contagem de batidas', () => {
    const html = montarHtmlFechamento(dados({
      operadores: [operador({
        bruto: 150_000, meta: 100_000, metasExtras: [200_000, 300_000], metasBatidas: 1,
      })],
    }));
    expect(html).toContain('de 3 metas batidas');
    expect(html).toContain('com-marcos');
  });
});

// ── Nome do arquivo ──────────────────────────────────────────────────────────

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

// ── Peso do arquivo ──────────────────────────────────────────────────────────

describe('tamanho do arquivo', () => {
  /**
   * Teto acordado no design: 2 MB. O relatório circula por WhatsApp e por
   * e-mail, e passar disso transforma o entregável em problema de anexo.
   */
  const TETO_BYTES = 2 * 1024 * 1024;

  it('o relatório da diretoria, cheio, cabe no teto', () => {
    const operadores = Array.from({ length: 120 }, (_, i) => operador({
      id: `op-${i}`, nome: `Operador Número ${i}`, bruto: 200_000 - i * 500,
      porDia: Array.from({ length: 31 }, (_, d) => d * 100),
    }));
    const setores = Array.from({ length: 12 }, (_, i) => ({
      id: `s-${i}`, nome: `Setor ${i}`, bruto: 500_000 - i * 1000, ho: 0,
      qtd: 2000, meta: 600_000, pctMeta: 83, operadores: 10, pctDaEmpresa: 8.3,
    }));

    const html = montarHtmlFechamento(dados({
      alvo: { ...dados().alvo, nivel: 'diretoria', setorNome: null },
      operadores, ranking: operadores, setores,
      operadoresSemPagina: operadores.length - TETO_PAGINAS_INDIVIDUAIS,
    }));

    expect(new TextEncoder().encode(html).length).toBeLessThan(TETO_BYTES);
  });
});
