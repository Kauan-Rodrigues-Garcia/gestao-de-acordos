/**
 * planilhaAcumulado.ts — o «Acumulado por mês» da PaguePlay como Excel formatado.
 *
 * Pedido de 16/09/2026: um botão no Relatório PaguePlay do Painel Diretoria que
 * baixa o acumulado por mês «com estética profissional, não uma planilha simples»,
 * numa aba o relatório de pagamento e noutra o de conciliação (sem cartão de
 * crédito), por estado, como a tabela da tela. Ajuste do mesmo dia: sem a
 * coluna «% do ano», e uma terceira aba só com a parte da PaguePlay (HO) da
 * conciliação, em degradê de verde para azul.
 *
 * ## Por que o XML é escrito aqui
 *
 * `@e965/xlsx` ignora estilo na escrita. O registro de estilos e o pacote OOXML
 * moram em `@/lib/xlsxEstilizado`; aqui fica só o desenho da folha.
 *
 * ## Totais são fórmula com valor pronto
 *
 * Total da linha e total do mês saem como `SUM` — quem
 * receber o arquivo e corrigir uma célula vê o total acompanhar. Cada fórmula
 * leva o valor já calculado (`<v>`), para que visualizadores sem motor de
 * cálculo (prévia do WhatsApp, Google Drive) mostrem os números; o Excel
 * recalcula ao abrir (`fullCalcOnLoad`).
 *
 * Função pura: nada de `document`. O teste lê o arquivo de volta.
 */
import {
  Estilos, escXml as esc, montarPacoteXlsx, refCelula as ref, type Borda, type Estilo, type Fundo,
} from '@/lib/xlsxEstilizado';
import { MESES_ABREVIADOS, type AnoAcumulado } from './acumuladoMensal';

export interface Paleta {
  /** Faixa do título. */
  escuro: string;
  /** Linha de cabeçalho da tabela. */
  cabecalho: string;
  /** Destaques: ano, melhor mês, total geral. */
  acento: string;
  /** Faixa do ano e rodapé. */
  faixa: string;
  /** Texto secundário sobre o escuro. */
  subtitulo: string;
  /**
   * Cores da ponta direita, para um degradê horizontal. Sem isso, cor lisa.
   * Faixas mescladas usam `gradientFill`; cabeçalho e rodapé são células
   * soltas, e cada uma recebe o tom da sua coluna — um degradê por célula
   * repetiria a listra quinze vezes.
   */
  degrade?: Pick<Paleta, 'escuro' | 'cabecalho' | 'faixa'>;
}

/** As cores do próprio relatório: Pagamento é o tema verde, Conciliação o azul. */
export const PALETA_PAGAMENTO: Paleta = { escuro: '14532D', cabecalho: '166534', acento: '15803D', faixa: 'DCFCE7', subtitulo: 'BBF7D0' };
export const PALETA_CONCILIACAO: Paleta = { escuro: '1E3A8A', cabecalho: '1D4ED8', acento: '1D4ED8', faixa: 'DBEAFE', subtitulo: 'BFDBFE' };
/** A parte da PaguePlay na conciliação: do verde ao azul, destaque no meio-termo. */
export const PALETA_PAGUEPLAY: Paleta = {
  escuro: PALETA_PAGAMENTO.escuro, cabecalho: PALETA_PAGAMENTO.cabecalho, faixa: PALETA_PAGAMENTO.faixa,
  acento: '0F766E', subtitulo: 'CCFBF1',
  degrade: { escuro: PALETA_CONCILIACAO.escuro, cabecalho: PALETA_CONCILIACAO.cabecalho, faixa: PALETA_CONCILIACAO.faixa },
};

export interface AbaAcumulado {
  /** Nome da aba (até 31 caracteres, sem `[]:*?/\`). */
  nome: string;
  titulo: string;
  subtitulo: string;
  /** Linha fina abaixo do título: quando foi gerado, de onde vêm os números. */
  nota: string;
  /** Rótulo da linha de total de cada ano. */
  rotuloTotal: string;
  paleta: Paleta;
  anos: AnoAcumulado[];
}

// ── Estilos ─────────────────────────────────────────────────────────────────

const TEXTO = '0F172A';
const TEXTO_VALOR = '1E293B';
const CINZA = '64748B';
const CINZA_CLARO = '94A3B8';
const LINHA = 'E2E8F0';
const ZEBRA = 'F8FAFC';

/** Zero vira «–», como o «—» da tela; negativo (estorno) em vermelho. */
const FORMATO_BRL = '"R$" #,##0.00;[Red]\\-"R$" #,##0.00;"–"';

// ── Folha ───────────────────────────────────────────────────────────────────

/** A=#, B=COREN, C..N=Jan..Dez, O=Total. */
const COL_MES = 3;
const COL_TOTAL = COL_MES + 12;

/**
 * Largura de coluna pelo maior valor dela: um total na casa dos milhões não
 * cabe na largura de um mês comum, e o Excel troca o número por `####`.
 * A unidade de largura é o dígito da fonte padrão (Arial 10); `escala` cobre o
 * total geral, em corpo 12.
 */
function larguraMoeda(centavos: number[], minimo: number, escala = 1): number {
  const maior = Math.max(0, ...centavos.map(c => (Math.abs(c) / 100)
    .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length + (c < 0 ? 4 : 3)));
  return Math.max(minimo, Math.ceil((maior * escala + 3) * 2) / 2);
}

function larguras(anos: AnoAcumulado[]): number[] {
  const meses = MESES_ABREVIADOS.map((_, m) => larguraMoeda(anos.flatMap(a => [a.totaisMes[m], ...a.regionais.map(r => r.meses[m])]), 15.5));
  const total = Math.max(
    larguraMoeda(anos.flatMap(a => a.regionais.map(r => r.total)), 18),
    larguraMoeda(anos.map(a => a.total), 18, 1.2),
  );
  return [5, 20, ...meses, total];
}

const reais = (centavos: number) => String(centavos / 100);
/** Tom entre duas cores `RRGGBB`, com `t` de 0 (`de`) a 1 (`para`). */
const misturar = (de: string, para: string, t: number) => [0, 2, 4]
  .map(i => Math.round(parseInt(de.slice(i, i + 2), 16) * (1 - t) + parseInt(para.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0'))
  .join('').toUpperCase();

/** Sem `texto` nem `valor`: célula só com estilo (parte de uma faixa mesclada). */
interface Celula { col: number; estilo: number; texto?: string; valor?: string; formula?: string }

class Folha {
  private linhas: { altura: number; celulas: Celula[] }[] = [];
  readonly mesclas: string[] = [];

  linha(altura: number) {
    const l = { altura, celulas: [] as Celula[] };
    this.linhas.push(l);
    const numero = this.linhas.length;
    return {
      numero,
      texto: (col: number, estilo: number, texto: string) => l.celulas.push({ col, estilo, texto }),
      valor: (col: number, estilo: number, valor: string, formula?: string) => l.celulas.push({ col, estilo, valor, formula }),
      vazia: (col: number, estilo: number) => l.celulas.push({ col, estilo }),
    };
  }

  /** Faixa mesclada de A até O, com o estilo em todas as células (fundo e borda contínuos). */
  faixa(altura: number, estilo: number, texto: string) {
    const l = this.linha(altura);
    l.texto(1, estilo, texto);
    for (let c = 2; c <= COL_TOTAL; c++) l.vazia(c, estilo);
    this.mesclas.push(`${ref(1, l.numero)}:${ref(COL_TOTAL, l.numero)}`);
    return l.numero;
  }

  get total() { return this.linhas.length; }

  xmlLinhas(): string {
    return this.linhas.map((l, i) => {
      const r = i + 1;
      const celulas = l.celulas.map(c => {
        const endereco = ref(c.col, r);
        if (c.texto !== undefined) return `<c r="${endereco}" s="${c.estilo}" t="inlineStr"><is><t xml:space="preserve">${esc(c.texto)}</t></is></c>`;
        if (c.valor !== undefined) return `<c r="${endereco}" s="${c.estilo}">${c.formula ? `<f>${c.formula}</f>` : ''}<v>${c.valor}</v></c>`;
        return `<c r="${endereco}" s="${c.estilo}"/>`;
      }).join('');
      return `<row r="${r}" spans="1:${COL_TOTAL}" ht="${l.altura}" customHeight="1">${celulas}</row>`;
    }).join('');
  }
}

function montarFolha(aba: AbaAcumulado, estilos: Estilos): string {
  const p = aba.paleta;
  const fina = (cor: string): Borda => ({ estilo: 'thin', cor });
  const media = (cor: string): Borda => ({ estilo: 'medium', cor });
  type Tom = 'escuro' | 'cabecalho' | 'faixa';
  /** Faixa mesclada: o degradê inteiro numa célula só. */
  const faixa = (tom: Tom): Fundo => p.degrade ? { de: p[tom], para: p.degrade[tom] } : p[tom];
  /** Célula solta: o tom do degradê na altura da coluna. */
  const naColuna = (tom: Tom, col: number): string => p.degrade ? misturar(p[tom], p.degrade[tom], (col - 1) / (COL_TOTAL - 1)) : p[tom];

  const s = {
    titulo: estilos.id({ tamanho: 18, negrito: true, cor: 'FFFFFF', fundo: faixa('escuro'), recuo: 1 }),
    subtitulo: estilos.id({ tamanho: 11, cor: p.subtitulo, fundo: faixa('escuro'), recuo: 1 }),
    nota: estilos.id({ tamanho: 9, italico: true, cor: CINZA, recuo: 1 }),
    ano: estilos.id({ tamanho: 13, negrito: true, cor: p.acento, fundo: faixa('faixa'), recuo: 1, bordas: { bottom: media(p.acento) } }),
    cabecalho: (col: number, h: 'left' | 'center' | 'right') => estilos.id({ tamanho: 9, negrito: true, cor: 'FFFFFF', fundo: naColuna('cabecalho', col), horizontal: h, recuo: h === 'left' ? 1 : 0 }),
    vazio: estilos.id({ tamanho: 11, italico: true, cor: CINZA, horizontal: 'center' }),
  };
  const corpo = (zebra: boolean, e: Estilo) => estilos.id({ tamanho: 10, fundo: zebra ? ZEBRA : undefined, ...e, bordas: { bottom: fina(LINHA), ...e.bordas } });
  const rodape = (col: number, e: Estilo) => estilos.id({ tamanho: 10, negrito: true, fundo: naColuna('faixa', col), ...e, bordas: { top: media(p.acento), bottom: media(p.acento), ...e.bordas } });

  const folha = new Folha();
  folha.faixa(36, s.titulo, aba.titulo);
  folha.faixa(22, s.subtitulo, aba.subtitulo);
  folha.faixa(20, s.nota, aba.nota);
  folha.linha(8);

  let congelarAte = 0;
  if (!aba.anos.length) {
    folha.faixa(40, s.vazio, 'Nenhum pagamento salvo nesta modalidade. Importe o relatório para preencher esta aba.');
  }

  aba.anos.forEach((ano, indiceAno) => {
    if (indiceAno > 0) { folha.linha(14); folha.linha(14); }
    folha.faixa(26, s.ano, `${ano.ano}  ·  ${ano.regionais.length} ${ano.regionais.length === 1 ? 'regional' : 'regionais'}`);

    const cab = folha.linha(24);
    cab.texto(1, s.cabecalho(1, 'center'), '#');
    cab.texto(2, s.cabecalho(2, 'left'), 'COREN');
    MESES_ABREVIADOS.forEach((m, i) => cab.texto(COL_MES + i, s.cabecalho(COL_MES + i, 'right'), m));
    cab.texto(COL_TOTAL, s.cabecalho(COL_TOTAL, 'right'), 'Total');
    if (!congelarAte) congelarAte = cab.numero;

    const primeira = cab.numero + 1;
    const ultima = cab.numero + ano.regionais.length;

    ano.regionais.forEach((r, i) => {
      const z = i % 2 === 1;
      const l = folha.linha(19);
      l.valor(1, corpo(z, { tamanho: 9, cor: CINZA_CLARO, horizontal: 'center' }), String(i + 1));
      l.texto(2, corpo(z, { negrito: true, cor: TEXTO, recuo: 1, bordas: { right: fina(LINHA) } }), `COREN-${r.uf}`);
      const maior = Math.max(...r.meses);
      const melhor = maior > 0 ? r.meses.indexOf(maior) : -1;
      r.meses.forEach((v, m) => l.valor(COL_MES + m,
        corpo(z, m === melhor
          ? { negrito: true, cor: p.acento, formato: FORMATO_BRL, horizontal: 'right' }
          : { cor: v === 0 ? CINZA_CLARO : TEXTO_VALOR, formato: FORMATO_BRL, horizontal: 'right' }),
        reais(v)));
      l.valor(COL_TOTAL, corpo(z, { negrito: true, cor: TEXTO, formato: FORMATO_BRL, horizontal: 'right', bordas: { left: media('CBD5E1') } }),
        reais(r.total), `SUM(${ref(COL_MES, l.numero)}:${ref(COL_MES + 11, l.numero)})`);
    });

    const rod = folha.linha(28);
    rod.vazia(1, rodape(1, {}));
    rod.texto(2, rodape(2, { cor: TEXTO, recuo: 1 }), aba.rotuloTotal);
    ano.totaisMes.forEach((v, m) => rod.valor(COL_MES + m, rodape(COL_MES + m, { cor: TEXTO, formato: FORMATO_BRL, horizontal: 'right' }),
      reais(v), `SUM(${ref(COL_MES + m, primeira)}:${ref(COL_MES + m, ultima)})`));
    rod.valor(COL_TOTAL, rodape(COL_TOTAL, { tamanho: 12, cor: p.acento, formato: FORMATO_BRL, horizontal: 'right', bordas: { left: media('CBD5E1') } }),
      reais(ano.total), `SUM(${ref(COL_MES, rod.numero)}:${ref(COL_MES + 11, rod.numero)})`);
  });

  // Congela título e primeiro cabeçalho na vertical, # e COREN na horizontal.
  const painel = congelarAte
    ? `<pane xSplit="2" ySplit="${congelarAte}" topLeftCell="${ref(COL_MES, congelarAte + 1)}" activePane="bottomRight" state="frozen"/>`
      + `<selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight" activeCell="${ref(COL_MES, congelarAte + 1)}" sqref="${ref(COL_MES, congelarAte + 1)}"/>`
    : '';
  const colunas = larguras(aba.anos).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheetPr><tabColor rgb="FF${p.acento}"/><pageSetUpPr fitToPage="1"/></sheetPr>`
    + `<dimension ref="A1:${ref(COL_TOTAL, folha.total)}"/>`
    + `<sheetViews><sheetView showGridLines="0" workbookViewId="0">${painel}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + `<cols>${colunas}</cols>`
    + `<sheetData>${folha.xmlLinhas()}</sheetData>`
    + `<mergeCells count="${folha.mesclas.length}">${folha.mesclas.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    + '<printOptions horizontalCentered="1"/>'
    + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>'
    + '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
    + `<headerFooter><oddFooter>&amp;L&amp;8${esc(aba.titulo)}&amp;R&amp;8Página &amp;P de &amp;N</oddFooter></headerFooter>`
    + '</worksheet>';
}

// ── Pacote ──────────────────────────────────────────────────────────────────

export function montarPlanilhaAcumulado(abas: AbaAcumulado[], titulo: string, geradoEm: Date): Uint8Array<ArrayBuffer> {
  const estilos = new Estilos();
  const folhas = abas.map(a => ({ nome: a.nome, xml: montarFolha(a, estilos) }));
  return montarPacoteXlsx({ folhas, estilos, titulo, geradoEm });
}
