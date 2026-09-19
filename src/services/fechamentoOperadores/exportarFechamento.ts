/**
 * exportarFechamento.ts — o Fechamento da gerência como arquivo: Excel e HTML.
 *
 * Pedido de 14/09/2026: «permitir baixar o fechamento, tanto por Excel e pela
 * página HTML». A aba substituiu a planilha da gerência, e a planilha circulava;
 * sem arquivo, alguém voltaria a copiar a tela para um Excel à mão.
 *
 * Correção de 19/09/2026 (estética): o Excel saía cru — sem cor, sem borda, sem
 * título — e o HTML era índigo e abria escuro quando o computador estava no modo
 * escuro. Agora os dois têm a cara do Gestão (`relatorioGestao`): o Excel com
 * faixa de título, os quatro cards da tela, cabeçalho azul, zebra, quartil
 * colorido, filtro e painel congelado; o HTML sempre claro, com os cards, a
 * tabela e os dois gráficos da tela.
 *
 * ## O arquivo é a tela, não outra conta
 *
 * Recebe as MESMAS `linhas` e o MESMO `resumo` que a tela desenha — já calculados
 * por `calculoFechamento` e já na ordem de `ordenarLinhasFechamento`. Nada é
 * recalculado aqui: um arquivo que refizesse a conta seria o primeiro lugar onde
 * o fechamento baixado e o fechamento na tela discordariam. Por isso também não
 * há linha de total na tabela: o «Faturamento total» da planilha deixa licença e
 * férias de fora, e uma soma da coluna diria outro número.
 *
 * ## Funções puras
 *
 * Nenhuma delas toca `document`: o teste lê a planilha de volta e confere o HTML
 * sem navegador. Entregar o arquivo e registrar o log é de `baixarFechamentoOperadores`.
 */
import { esc, brl } from '@/services/fechamento/formato';
import {
  COR_GESTAO as G, COR_QUARTIL_ARQUIVO, FONTE_PLANILHA, kpiHtml, paginaGestaoHtml,
  rotuloGeradoEm, type AvisoArquivo, type IconeGestao, type TomKpiArquivo,
} from '@/lib/relatorioGestao';
import {
  Estilos, escXml, montarPacoteXlsx, refCelula, type Borda, type Estilo,
} from '@/lib/xlsxEstilizado';
import { SITUACOES_FECHAMENTO } from './situacoes';
import type { LinhaFechamento, ResumoFechamento } from './calculoFechamento';

export interface DadosExportacaoFechamento {
  empresaNome: string;
  /** `null` = todos os setores do alcance. */
  setorNome: string | null;
  /** `yyyy-MM`. */
  mes: string;
  /** «setembro/2026». */
  mesRotulo: string;
  /** Mês ainda aberto: fechamento parcial, quartil pelo ritmo até hoje. */
  parcial: boolean;
  geradoEm: Date;
  linhas: readonly LinhaFechamento[];
  resumo: ResumoFechamento;
}

const FORMATO_BRL = '"R$" #,##0.00';
const FORMATO_PCT = '0.00%';
const FORMATO_PCT_CURTO = '0.0%';

function rotuloSituacao(codigo: string | null): string {
  return SITUACOES_FECHAMENTO.find(s => s.codigo === codigo)?.rotulo ?? '';
}

function rotuloMetaAtingida(l: LinhaFechamento): string {
  if (l.metaAtingida === null) return '';
  return l.metaAtingida === 0 ? 'nenhuma' : `${l.metaAtingida}ª meta`;
}

function rotuloQuartil(q: number | null): string {
  return q === null ? '' : `${q}º quartil`;
}

function rotuloAlcance(fracao: number): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function pctInteiro(fracao: number): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function slug(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function preenchidos(d: DadosExportacaoFechamento): number {
  return d.linhas.filter(l => l.duTrabalhado !== null && l.situacao !== null).length;
}

export function nomeArquivoFechamentoOperadores(
  d: Pick<DadosExportacaoFechamento, 'mes' | 'setorNome'>,
  extensao: 'xlsx' | 'html',
): string {
  return `fechamento-operadores-${d.mes}-${slug(d.setorNome ?? 'todos os setores')}.${extensao}`;
}

interface CardFechamento {
  rotulo: string;
  /** Número = reais; texto = contagem pronta («3 de 10»); `null` = sem valor. */
  valor: number | string | null;
  detalhe: string;
  tom: TomKpiArquivo;
  icone: IconeGestao;
}

/** Os quatro cards da tela, na mesma ordem — o Excel e o HTML leem daqui. */
function cardsDoFechamento(d: DadosExportacaoFechamento): CardFechamento[] {
  const r = d.resumo;
  const p = preenchidos(d);
  return [
    {
      rotulo: 'Faturamento total', valor: r.faturamentoTotal,
      detalhe: 'Fechamento de quem tem situação, sem licença e férias', tom: 'primario', icone: 'wallet',
    },
    {
      rotulo: 'Média por dia útil', valor: r.mediaPorDiaUtil,
      detalhe: 'Soma dos fechamentos ÷ média de D.U. trabalhado', tom: 'neutro', icone: 'calendario',
    },
    {
      rotulo: 'Média por funcionário', valor: r.mediaPorFuncionario,
      detalhe: `Faturamento total ÷ ${r.comSituacao} com situação`, tom: 'neutro', icone: 'pessoas',
    },
    {
      rotulo: 'Preenchidos', valor: `${p} de ${d.linhas.length}`,
      detalhe: 'Operadores com D.U. e situação informados',
      tom: d.linhas.length > 0 && p === d.linhas.length ? 'sucesso' : 'alerta',
      icone: 'prancheta',
    },
  ];
}

// ── Excel ───────────────────────────────────────────────────────────────────

type Celula =
  | { col: number; estilo: number; texto: string }
  | { col: number; estilo: number; valor: number }
  | { col: number; estilo: number };

/** Monta uma folha linha a linha e devolve o `worksheet.xml`. */
class Folha {
  readonly linhas: { altura: number; celulas: Celula[] }[] = [];
  readonly mesclas: string[] = [];

  constructor(readonly ultimaColuna: number) {}

  nova(altura: number) {
    const l = { altura, celulas: [] as Celula[] };
    this.linhas.push(l);
    return { l, numero: this.linhas.length };
  }

  /** Uma linha inteira mesclada, com o texto na primeira célula. */
  faixa(altura: number, estilo: number, texto: string) {
    const { l, numero } = this.nova(altura);
    l.celulas.push({ col: 1, estilo, texto });
    for (let c = 2; c <= this.ultimaColuna; c++) l.celulas.push({ col: c, estilo });
    this.mesclas.push(`${refCelula(1, numero)}:${refCelula(this.ultimaColuna, numero)}`);
  }

  xml(p: {
    larguras: readonly number[];
    congelarAte?: number;
    filtro?: string;
    corAba: string;
    rodape: string;
  }): string {
    const xmlLinhas = this.linhas.map((l, i) => {
      const r = i + 1;
      const celulas = l.celulas.map(c => {
        const endereco = refCelula(c.col, r);
        if ('texto' in c) return `<c r="${endereco}" s="${c.estilo}" t="inlineStr"><is><t xml:space="preserve">${escXml(c.texto)}</t></is></c>`;
        if ('valor' in c) return `<c r="${endereco}" s="${c.estilo}"><v>${c.valor}</v></c>`;
        return `<c r="${endereco}" s="${c.estilo}"/>`;
      }).join('');
      return `<row r="${r}" spans="1:${this.ultimaColuna}" ht="${l.altura}" customHeight="1">${celulas}</row>`;
    }).join('');

    const painel = p.congelarAte
      ? `<pane ySplit="${p.congelarAte}" topLeftCell="${refCelula(1, p.congelarAte + 1)}" activePane="bottomLeft" state="frozen"/>`
        + `<selection pane="bottomLeft" activeCell="${refCelula(1, p.congelarAte + 1)}" sqref="${refCelula(1, p.congelarAte + 1)}"/>`
      : '';
    const colunas = p.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheetPr><tabColor rgb="FF${p.corAba}"/><pageSetUpPr fitToPage="1"/></sheetPr>`
      + `<dimension ref="A1:${refCelula(this.ultimaColuna, Math.max(1, this.linhas.length))}"/>`
      + `<sheetViews><sheetView showGridLines="0" workbookViewId="0">${painel}</sheetView></sheetViews>`
      + '<sheetFormatPr defaultRowHeight="15"/>'
      + `<cols>${colunas}</cols>`
      + `<sheetData>${xmlLinhas}</sheetData>`
      + (p.filtro ? `<autoFilter ref="${p.filtro}"/>` : '')
      + (this.mesclas.length ? `<mergeCells count="${this.mesclas.length}">${this.mesclas.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
      + '<printOptions horizontalCentered="1"/>'
      + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>'
      + '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
      + `<headerFooter><oddFooter>&amp;L&amp;8${escXml(p.rodape)}&amp;R&amp;8Página &amp;P de &amp;N</oddFooter></headerFooter>`
      + '</worksheet>';
  }
}

/** Os estilos das duas folhas, com a fonte e as cores do Gestão. */
function estilosDoFechamento(estilos: Estilos) {
  const fina = (cor: string): Borda => ({ estilo: 'thin', cor });
  const media = (cor: string): Borda => ({ estilo: 'medium', cor });
  const id = (e: Estilo) => estilos.id({ fonte: FONTE_PLANILHA, tamanho: 10, cor: G.texto, ...e });
  return {
    fina, media, id,
    titulo: id({ tamanho: 15, negrito: true, cor: 'FFFFFF', fundo: G.primarioEscuro, recuo: 1 }),
    subtitulo: id({ cor: G.primarioClaro, fundo: G.primarioEscuro, recuo: 1 }),
    nota: id({ tamanho: 9, italico: true, cor: G.fraco, recuo: 1 }),
    alerta: id({ tamanho: 9, negrito: true, cor: G.alerta, fundo: G.alertaFundo, recuo: 1 }),
    cabecalho: (h: 'left' | 'center' | 'right') =>
      id({ negrito: true, cor: 'FFFFFF', fundo: G.primario, horizontal: h, recuo: h === 'left' ? 1 : 0 }),
    secao: id({ tamanho: 11, negrito: true, cor: G.primarioEscuro, bordas: { bottom: media(G.primario) } }),
    corpo: (zebra: boolean, e: Estilo) =>
      id({ fundo: zebra ? G.cartao : undefined, ...e, bordas: { bottom: fina(G.bordaSuave), ...e.bordas } }),
  };
}

const COR_DO_TOM: Record<TomKpiArquivo, { valor: string; fundo: string; borda: string }> = {
  primario: { valor: G.primario, fundo: 'EAF3F7', borda: '9CC4D6' },
  neutro: { valor: G.texto, fundo: G.cartao, borda: G.borda },
  sucesso: { valor: G.sucesso, fundo: 'EEF8F0', borda: 'A9D8B4' },
  alerta: { valor: G.alerta, fundo: 'FDF6EC', borda: 'E9C48C' },
};

/** Onde cada card fica nas 10 colunas da tabela: [primeira, última]. */
const VAOS_DOS_CARDS: readonly [number, number][] = [[1, 2], [3, 5], [6, 7], [8, 10]];

const COLUNAS_FECHAMENTO: readonly { titulo: string; largura: number; alinhamento: 'left' | 'center' | 'right' }[] = [
  { titulo: 'Operador', largura: 32, alinhamento: 'left' },
  { titulo: 'Equipe', largura: 22, alinhamento: 'left' },
  { titulo: 'Fechamento', largura: 16, alinhamento: 'right' },
  { titulo: 'Meta', largura: 16, alinhamento: 'right' },
  { titulo: 'Meta atingida', largura: 14, alinhamento: 'center' },
  { titulo: 'D.U. trabalhado', largura: 14, alinhamento: 'center' },
  { titulo: 'Situação', largura: 19, alinhamento: 'center' },
  { titulo: 'Alcance meta', largura: 14, alinhamento: 'right' },
  { titulo: 'Quartil', largura: 13, alinhamento: 'center' },
  { titulo: 'Média fat. D.U.', largura: 16, alinhamento: 'right' },
];

function folhaFechamento(d: DadosExportacaoFechamento, estilos: Estilos): string {
  const s = estilosDoFechamento(estilos);
  const ULTIMA = COLUNAS_FECHAMENTO.length;
  const f = new Folha(ULTIMA);
  const alvo = d.setorNome ?? 'Todos os setores';

  f.faixa(30, s.titulo, `Fechamento · ${alvo}`);
  f.faixa(20, s.subtitulo, `${d.empresaNome}  ·  ${d.mesRotulo}  ·  ${d.linhas.length} operadores  ·  Gerado em: ${rotuloGeradoEm(d.geradoEm)}`);
  if (d.parcial) {
    f.faixa(20, s.alerta, `${d.mesRotulo} ainda está aberto: fechamento parcial, e o quartil segue o ritmo até o dia em que foi baixado.`);
  } else {
    f.faixa(18, s.nota, 'Na ordem da tela: por quartil. D.U. trabalhado e situação são os informados pela gerência.');
  }
  f.nova(8);

  // Os cards: rótulo, valor e detalhe, cada um num vão de colunas com moldura.
  const cards = cardsDoFechamento(d);
  const linhasDoCard = [f.nova(18), f.nova(26), f.nova(18)];
  cards.forEach((card, i) => {
    const [ini, fim] = VAOS_DOS_CARDS[i];
    const cor = COR_DO_TOM[card.tom];
    const borda = s.fina(cor.borda);
    linhasDoCard.forEach(({ l, numero }, k) => {
      for (let col = ini; col <= fim; col++) {
        const bordas: Estilo['bordas'] = {
          ...(col === ini ? { left: borda } : {}),
          ...(col === fim ? { right: borda } : {}),
          ...(k === 0 ? { top: borda } : {}),
          ...(k === 2 ? { bottom: borda } : {}),
        };
        const base: Estilo = { fundo: cor.fundo, bordas, recuo: 1 };
        const estilo = k === 0
          ? s.id({ ...base, tamanho: 8, negrito: true, cor: G.fraco })
          : k === 1
            ? s.id({ ...base, tamanho: 14, negrito: true, cor: cor.valor, formato: typeof card.valor === 'number' ? FORMATO_BRL : undefined, horizontal: 'left' })
            : s.id({ ...base, tamanho: 8, italico: true, cor: G.fraco });
        if (col !== ini) { l.celulas.push({ col, estilo }); continue; }
        if (k === 0) l.celulas.push({ col, estilo, texto: card.rotulo.toUpperCase() });
        else if (k === 1) {
          if (typeof card.valor === 'number') l.celulas.push({ col, estilo, valor: Math.round(card.valor * 100) / 100 });
          else l.celulas.push({ col, estilo, texto: card.valor ?? '—' });
        } else l.celulas.push({ col, estilo, texto: card.detalhe });
      }
      f.mesclas.push(`${refCelula(ini, numero)}:${refCelula(fim, numero)}`);
    });
  });
  f.nova(10);

  const cab = f.nova(22);
  COLUNAS_FECHAMENTO.forEach((c, i) => cab.l.celulas.push({ col: i + 1, estilo: s.cabecalho(c.alinhamento), texto: c.titulo }));
  const linhaCabecalho = cab.numero;

  if (!d.linhas.length) f.faixa(34, s.id({ tamanho: 11, italico: true, cor: G.fraco, horizontal: 'center' }), 'Nenhum operador neste recorte.');

  d.linhas.forEach((o, i) => {
    const z = i % 2 === 1;
    const q = o.quartil !== null ? COR_QUARTIL_ARQUIVO[o.quartil] : undefined;
    const { l } = f.nova(20);
    const vazio = (col: number, h: 'left' | 'center' | 'right') => l.celulas.push({ col, estilo: s.corpo(z, { horizontal: h }) });
    const dinheiro = (col: number, v: number | null, e: Estilo = {}) => {
      if (v === null) { vazio(col, 'right'); return; }
      l.celulas.push({ col, estilo: s.corpo(z, { formato: FORMATO_BRL, horizontal: 'right', ...e }), valor: v });
    };

    // A faixa colorida do quartil à esquerda, como na tela.
    l.celulas.push({
      col: 1,
      estilo: s.corpo(z, { negrito: true, recuo: 1, bordas: q ? { left: s.media(q.faixa) } : undefined }),
      texto: o.nome,
    });
    if (o.equipeNome) l.celulas.push({ col: 2, estilo: s.corpo(z, { cor: G.fraco, recuo: 1 }), texto: o.equipeNome });
    else vazio(2, 'left');
    dinheiro(3, o.fechamento, { negrito: true });
    dinheiro(4, o.meta);
    const meta = rotuloMetaAtingida(o);
    if (meta) {
      l.celulas.push({
        col: 5,
        estilo: s.corpo(z, o.metaAtingida ? { horizontal: 'center', negrito: true, cor: G.primario } : { horizontal: 'center', cor: G.fraco }),
        texto: meta,
      });
    } else vazio(5, 'center');
    if (o.duTrabalhado !== null) l.celulas.push({ col: 6, estilo: s.corpo(z, { horizontal: 'center' }), valor: o.duTrabalhado });
    else vazio(6, 'center');
    const situacao = rotuloSituacao(o.situacao);
    if (situacao) l.celulas.push({ col: 7, estilo: s.corpo(z, { horizontal: 'center', tamanho: 9 }), texto: situacao });
    else vazio(7, 'center');
    if (o.alcance !== null) {
      l.celulas.push({
        col: 8,
        estilo: s.corpo(z, { formato: FORMATO_PCT, horizontal: 'right', negrito: true, cor: q?.texto ?? G.texto }),
        valor: o.alcance,
      });
    } else vazio(8, 'right');
    if (q) {
      l.celulas.push({
        col: 9,
        estilo: s.corpo(z, { horizontal: 'center', negrito: true, tamanho: 9, cor: q.texto, fundo: q.fundo }),
        texto: rotuloQuartil(o.quartil),
      });
    } else vazio(9, 'center');
    dinheiro(10, o.mediaPorDu);
  });

  const ultima = linhaCabecalho + d.linhas.length;
  return f.xml({
    larguras: COLUNAS_FECHAMENTO.map(c => c.largura),
    congelarAte: linhaCabecalho,
    filtro: d.linhas.length ? `${refCelula(1, linhaCabecalho)}:${refCelula(ULTIMA, ultima)}` : undefined,
    corAba: G.primario,
    rodape: `Fechamento · ${alvo} · ${d.mesRotulo}`,
  });
}

function folhaResumo(d: DadosExportacaoFechamento, estilos: Estilos): string {
  const s = estilosDoFechamento(estilos);
  const r = d.resumo;
  const f = new Folha(4);
  const alvo = d.setorNome ?? 'Todos os setores';

  f.faixa(30, s.titulo, `Resumo · ${alvo}`);
  f.faixa(20, s.subtitulo, `${d.empresaNome}  ·  ${d.mesRotulo}${d.parcial ? ' (parcial)' : ''}`);
  f.nova(10);

  const cabecalho = (titulos: readonly string[]) => {
    const { l } = f.nova(22);
    titulos.forEach((t, i) => l.celulas.push({ col: i + 1, estilo: s.cabecalho(i === 0 ? 'left' : 'right'), texto: t }));
    for (let c = titulos.length + 1; c <= 4; c++) l.celulas.push({ col: c, estilo: s.cabecalho('right') });
  };
  const rotulo = (z: boolean, e: Estilo = {}) => s.corpo(z, { recuo: 1, ...e });
  const numero = (z: boolean, formato?: string, e: Estilo = {}) => s.corpo(z, { horizontal: 'right', formato, ...e });

  // Os cards da tela.
  cabecalho(['Indicador', 'Valor']);
  const indicadores: [string, number | null, string | undefined][] = [
    ['Faturamento total', r.faturamentoTotal, FORMATO_BRL],
    ['Média por dia útil', r.mediaPorDiaUtil, FORMATO_BRL],
    ['Média por funcionário', r.mediaPorFuncionario, FORMATO_BRL],
    ['Operadores', d.linhas.length, undefined],
    ['Com situação', r.comSituacao, undefined],
    ['Preenchidos', preenchidos(d), undefined],
  ];
  indicadores.forEach(([nome, v, formato], i) => {
    const z = i % 2 === 1;
    const { l } = f.nova(20);
    l.celulas.push({ col: 1, estilo: rotulo(z, { negrito: i === 0 }), texto: nome });
    if (v === null) l.celulas.push({ col: 2, estilo: numero(z), texto: '—' });
    else l.celulas.push({ col: 2, estilo: numero(z, formato, i === 0 ? { negrito: true, cor: G.primario } : {}), valor: v });
    l.celulas.push({ col: 3, estilo: s.corpo(z, {}) }, { col: 4, estilo: s.corpo(z, {}) });
  });
  f.nova(12);

  // Quartis.
  cabecalho(['Quartil', 'Operadores', 'Representatividade']);
  r.porQuartil.forEach((q, i) => {
    const z = i % 2 === 1;
    const cor = COR_QUARTIL_ARQUIVO[q.quartil];
    const { l } = f.nova(20);
    l.celulas.push({
      col: 1,
      estilo: rotulo(z, { negrito: true, cor: cor?.texto, bordas: cor ? { left: s.media(cor.faixa) } : undefined }),
      texto: rotuloQuartil(q.quartil),
    });
    l.celulas.push({ col: 2, estilo: numero(z), valor: q.qtd });
    l.celulas.push({ col: 3, estilo: numero(z, FORMATO_PCT_CURTO), valor: q.pct });
    l.celulas.push({ col: 4, estilo: s.corpo(z, {}) });
  });
  f.nova(12);

  // Situações, na ordem da planilha.
  cabecalho(['Situação', 'Operadores', 'Representatividade', 'Fechamento']);
  r.porSituacao.forEach((sit, i) => {
    const z = i % 2 === 1;
    const apagado = sit.qtd === 0 ? { cor: G.tenue } : {};
    const { l } = f.nova(20);
    l.celulas.push({ col: 1, estilo: rotulo(z, apagado), texto: rotuloSituacao(sit.codigo) });
    l.celulas.push({ col: 2, estilo: numero(z, undefined, apagado), valor: sit.qtd });
    l.celulas.push({ col: 3, estilo: numero(z, FORMATO_PCT_CURTO, apagado), valor: sit.pct });
    l.celulas.push({ col: 4, estilo: numero(z, FORMATO_BRL, apagado), valor: sit.fechamento });
  });

  return f.xml({
    larguras: [30, 20, 22, 20],
    corAba: G.primarioEscuro,
    rodape: `Resumo do fechamento · ${alvo} · ${d.mesRotulo}`,
  });
}

/**
 * A planilha, em duas abas: `Fechamento` (os cards e a tabela) e `Resumo` (os
 * cards e as contagens dos gráficos).
 *
 * Valor e alcance entram como NÚMERO com formato de célula, e não como texto
 * «R$ 1.234,56»: a gerência soma, filtra e ordena no Excel, e texto não soma.
 * Estilo exige o pacote montado à mão (`xlsxEstilizado`) — o SheetJS ignora cor
 * e borda na escrita.
 */
export function montarPlanilhaFechamento(d: DadosExportacaoFechamento): Uint8Array<ArrayBuffer> {
  const estilos = new Estilos();
  return montarPacoteXlsx({
    folhas: [
      { nome: 'Fechamento', xml: folhaFechamento(d, estilos) },
      { nome: 'Resumo', xml: folhaResumo(d, estilos) },
    ],
    estilos,
    titulo: `Fechamento · ${d.setorNome ?? 'Todos os setores'} · ${d.mesRotulo}`,
    geradoEm: d.geradoEm,
  });
}

// ── HTML ────────────────────────────────────────────────────────────────────

const TRACO = '<span class="tenue">—</span>';

function seloQuartil(q: number | null): string {
  const cor = q !== null ? COR_QUARTIL_ARQUIVO[q] : undefined;
  if (!cor) return TRACO;
  return `<span class="pill" style="background:#${cor.fundo};color:#${cor.texto}">${esc(rotuloQuartil(q))}</span>`;
}

/** Barras horizontais: o gráfico da tela, sem biblioteca e sem script. */
function barras(itens: readonly { rotulo: string; qtd: number; pct: number; cor: string }[]): string {
  const maior = Math.max(1, ...itens.map(i => i.qtd));
  return itens.map(i => `<div class="barra">
  <span>${esc(i.rotulo)}</span>
  <span class="trilho"><i style="width:${((i.qtd / maior) * 100).toFixed(1)}%;background:${i.cor}"></i></span>
  <span class="q"><b>${i.qtd}</b> · ${esc(pctInteiro(i.pct))}</span>
</div>`).join('\n');
}

/**
 * A página: cabeçalho como o da tela, os quatro cards, a tabela na ordem da tela
 * e os dois gráficos de contagem.
 *
 * Autocontida — CSS embutido, sem script, sem imagem, sem fonte de fora: o
 * arquivo abre de anexo e de pen drive, sem internet. Sempre clara. Todo texto
 * que veio do banco passa por `esc`.
 */
export function montarHtmlFechamentoOperadores(d: DadosExportacaoFechamento): string {
  const r = d.resumo;
  const alvo = d.setorNome ?? 'Todos os setores';

  const cards = cardsDoFechamento(d).map(c => kpiHtml({
    rotulo: c.rotulo,
    valor: c.valor === null ? '—' : typeof c.valor === 'number' ? brl(c.valor) : c.valor,
    detalhe: c.detalhe,
    tom: c.tom,
    icone: c.icone,
  })).join('\n');

  const linhas = d.linhas.map(l => {
    const cor = l.quartil !== null ? COR_QUARTIL_ARQUIVO[l.quartil] : undefined;
    const meta = rotuloMetaAtingida(l);
    return `<tr>
<td class="nome"${cor ? ` style="box-shadow:inset 3px 0 0 0 #${cor.faixa}"` : ''}>${esc(l.nome)}${l.equipeNome ? `<small>${esc(l.equipeNome)}</small>` : ''}</td>
<td class="n"><strong>${esc(brl(l.fechamento))}</strong></td>
<td class="n">${l.meta === null ? '<span class="fraco" style="font-family:var(--sans);font-style:italic;font-size:11px">sem meta</span>' : esc(brl(l.meta))}</td>
<td class="c">${!meta ? TRACO : l.metaAtingida ? `<span class="pill" style="background:rgba(0,100,142,.12);color:#${G.primario}">${esc(meta)}</span>` : `<span class="fraco" style="font-size:11px">${esc(meta)}</span>`}</td>
<td class="c n">${l.duTrabalhado ?? TRACO}</td>
<td style="font-size:11px">${esc(rotuloSituacao(l.situacao)) || TRACO}</td>
<td class="n"${cor && l.alcance !== null ? ` style="color:#${cor.texto};font-weight:700"` : ''}>${l.alcance === null ? TRACO : esc(rotuloAlcance(l.alcance))}</td>
<td class="c">${seloQuartil(l.quartil)}</td>
<td class="n">${l.mediaPorDu === null ? TRACO : esc(brl(l.mediaPorDu))}</td>
</tr>`;
  }).join('\n');

  const tabela = d.linhas.length === 0
    ? '<div class="cartao c fraco">Nenhum operador neste recorte.</div>'
    : `<div class="tabela"><table>
<thead><tr>
  <th>Operador</th><th class="n">Fechamento</th><th class="n">Meta</th><th class="c">Meta atingida</th>
  <th class="c">D.U. trabalhado</th><th>Situação</th><th class="n">Alcance meta</th><th class="c">Quartil</th><th class="n">Média fat. D.U.</th>
</tr></thead>
<tbody>
${linhas}
</tbody>
</table></div>`;

  const quartis = barras(r.porQuartil.map(q => ({
    rotulo: rotuloQuartil(q.quartil), qtd: q.qtd, pct: q.pct,
    cor: `#${COR_QUARTIL_ARQUIVO[q.quartil]?.faixa ?? G.primario}`,
  })));
  const comGente = r.porSituacao.filter(s => s.qtd > 0);
  const situacoes = comGente.length
    ? barras(comGente.map(s => ({ rotulo: rotuloSituacao(s.codigo), qtd: s.qtd, pct: s.pct, cor: '#0075A9' })))
    : '<p class="fraco" style="margin:0">Nenhuma situação informada.</p>';

  const avisos: AvisoArquivo[] = d.parcial
    ? [{ tom: 'alerta', texto: `${d.mesRotulo} ainda está aberto: este fechamento é parcial, e o quartil segue o ritmo até o dia em que foi baixado.` }]
    : [];

  return paginaGestaoHtml({
    tituloAba: `Fechamento · ${alvo} · ${d.mesRotulo}`,
    icone: 'prancheta',
    titulo: `Fechamento · ${alvo}`,
    subtitulo: `Fechamento mensal por operador · ${d.mesRotulo} · ${d.linhas.length} operadores`,
    empresaNome: d.empresaNome,
    geradoEm: d.geradoEm,
    avisos,
    corpo: `<div class="kpis">${cards}</div>
${tabela}
<div class="grade2">
  <div class="cartao"><h2>Funcionários por quartil</h2><p class="leg">Quantos operadores em cada faixa de alcance da meta</p>${quartis}</div>
  <div class="cartao"><h2>Funcionários por situação</h2><p class="leg">Só as situações com alguém</p>${situacoes}</div>
</div>`,
  });
}
