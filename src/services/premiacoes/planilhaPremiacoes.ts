/**
 * planilhaPremiacoes.ts — o «Relatório de Premiações e Comissões» em Excel.
 *
 * O MODELO é a planilha que circulava (18/09/2026): título, «Período: agosto de
 * 2026 · Gerado em: 17/09/2026, 08:39» e as colunas Crachá · Nome · Setor ·
 * Comissão (R$) · Premiação (R$) · Obs. A ordem e os nomes ficam; o que muda é
 * o acabamento do Gestão: faixa de título, cabeçalho colorido, zebra, moeda de
 * verdade, filtro, painel congelado e a linha de total.
 *
 * ## Recebe as linhas da tela
 *
 * As mesmas `linhas` que a aba desenha, já calculadas e na mesma ordem. Um
 * arquivo que refizesse a conta seria o primeiro lugar onde o baixado e a tela
 * discordariam.
 *
 * ## Vazio não é zero
 *
 * Célula de valor vazia = não se aplica (a outra cidade) ou sem meta/config — a
 * Obs. diz qual. Zero = tinha meta e não bateu. Os totais são `SUM`, com o valor
 * já calculado para quem abre sem motor de cálculo.
 *
 * Função pura: nada de `document`.
 */
import {
  Estilos, escXml, montarPacoteXlsx, refCelula, type Borda, type Estilo,
} from '@/lib/xlsxEstilizado';
import type { LinhaPremiacao } from './calculoPremiacoes';

export interface DadosPlanilhaPremiacoes {
  empresaNome: string;
  /** `null` = todos os setores do alcance. */
  setorNome: string | null;
  /** `yyyy-MM`. */
  mes: string;
  /** Mês ainda aberto: valores parciais. */
  parcial: boolean;
  geradoEm: Date;
  linhas: readonly LinhaPremiacao[];
}

export const TITULO_PREMIACOES = 'Relatório de Premiações e Comissões';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** `2026-08` → «agosto de 2026», como na planilha. */
export function rotuloPeriodo(mes: string): string {
  const [ano, m] = mes.split('-');
  return `${MESES[Number(m) - 1] ?? m} de ${ano}`;
}

/** «17/09/2026, 08:39», no fuso da operação. */
export function rotuloGeradoEm(d: Date): string {
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function slug(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function nomeArquivoPremiacoes(d: Pick<DadosPlanilhaPremiacoes, 'mes' | 'setorNome'>): string {
  return `premiacoes-comissoes-${d.mes}-${slug(d.setorNome ?? 'todos os setores')}.xlsx`;
}

// ── Estilo ──────────────────────────────────────────────────────────────────

/** O índigo do Gestão, do escuro do título ao claro da faixa. */
const ESCURO = '312E81';
const CABECALHO = '4338CA';
const ACENTO = '4F46E5';
const FAIXA = 'EEF2FF';
const SUBTITULO = 'C7D2FE';
const TEXTO = '0F172A';
const CINZA = '64748B';
const CINZA_CLARO = '94A3B8';
const LINHA = 'E2E8F0';
const ZEBRA = 'F8FAFC';
const VERDE = '15803D';

const FORMATO_BRL = '"R$" #,##0.00';

/** A=Crachá, B=Nome, C=Setor, D=Comissão, E=Premiação, F=Obs. */
const COLUNAS = [
  { titulo: 'Crachá',         largura: 12, alinhamento: 'center' },
  { titulo: 'Nome',           largura: 40, alinhamento: 'left' },
  { titulo: 'Setor',          largura: 22, alinhamento: 'left' },
  { titulo: 'Comissão (R$)',  largura: 17, alinhamento: 'right' },
  { titulo: 'Premiação (R$)', largura: 17, alinhamento: 'right' },
  { titulo: 'Obs.',           largura: 52, alinhamento: 'left' },
] as const;
const ULTIMA = COLUNAS.length;
const COL_COMISSAO = 4;
const COL_PREMIACAO = 5;

type Celula =
  | { col: number; estilo: number; texto: string }
  | { col: number; estilo: number; valor: number; formula?: string }
  | { col: number; estilo: number };

// ── Folha ───────────────────────────────────────────────────────────────────

export function montarFolhaPremiacoes(d: DadosPlanilhaPremiacoes, estilos: Estilos): string {
  const fina = (cor: string): Borda => ({ estilo: 'thin', cor });
  const media = (cor: string): Borda => ({ estilo: 'medium', cor });
  const s = {
    titulo: estilos.id({ tamanho: 16, negrito: true, cor: 'FFFFFF', fundo: { de: ESCURO, para: ACENTO }, recuo: 1 }),
    subtitulo: estilos.id({ tamanho: 11, cor: SUBTITULO, fundo: { de: ESCURO, para: ACENTO }, recuo: 1 }),
    nota: estilos.id({ tamanho: 9, italico: true, cor: CINZA, recuo: 1 }),
    cabecalho: (h: 'left' | 'center' | 'right') =>
      estilos.id({ tamanho: 10, negrito: true, cor: 'FFFFFF', fundo: CABECALHO, horizontal: h, recuo: h === 'left' ? 1 : 0 }),
    vazio: estilos.id({ tamanho: 11, italico: true, cor: CINZA, horizontal: 'center' }),
  };
  const corpo = (zebra: boolean, e: Estilo) =>
    estilos.id({ tamanho: 10, fundo: zebra ? ZEBRA : undefined, ...e, bordas: { bottom: fina(LINHA), ...e.bordas } });
  const rodape = (e: Estilo) =>
    estilos.id({ tamanho: 10, negrito: true, fundo: FAIXA, cor: TEXTO, ...e, bordas: { top: media(ACENTO), bottom: media(ACENTO) } });

  const linhas: { altura: number; celulas: Celula[] }[] = [];
  const mesclas: string[] = [];
  const nova = (altura: number) => { const l = { altura, celulas: [] as Celula[] }; linhas.push(l); return { l, numero: linhas.length }; };
  const faixa = (altura: number, estilo: number, texto: string) => {
    const { l, numero } = nova(altura);
    l.celulas.push({ col: 1, estilo, texto });
    for (let c = 2; c <= ULTIMA; c++) l.celulas.push({ col: c, estilo });
    mesclas.push(`${refCelula(1, numero)}:${refCelula(ULTIMA, numero)}`);
  };

  const alvo = d.setorNome ?? 'Todos os setores';
  faixa(34, s.titulo, TITULO_PREMIACOES);
  faixa(22, s.subtitulo, `Período: ${rotuloPeriodo(d.mes)}  ·  Gerado em: ${rotuloGeradoEm(d.geradoEm)}`);
  faixa(20, s.nota, [
    `${d.empresaNome} · ${alvo}`,
    'Premiação: Birigui · Comissão: Marília',
    'valor = comissão por meta do mês (faixa atingida × %)',
    d.parcial ? 'mês em aberto: valores parciais' : null,
  ].filter(Boolean).join('  ·  '));
  nova(8);

  const cab = nova(24);
  COLUNAS.forEach((c, i) => cab.l.celulas.push({ col: i + 1, estilo: s.cabecalho(c.alinhamento), texto: c.titulo }));
  const linhaCabecalho = cab.numero;

  if (!d.linhas.length) {
    faixa(36, s.vazio, 'Nenhuma pessoa neste recorte.');
  }

  d.linhas.forEach((p, i) => {
    const z = i % 2 === 1;
    const { l } = nova(19);
    const valor = (col: number, v: number | null) => {
      if (v === null) { l.celulas.push({ col, estilo: corpo(z, { horizontal: 'right' }) }); return; }
      l.celulas.push({
        col,
        estilo: corpo(z, v > 0
          ? { negrito: true, cor: VERDE, formato: FORMATO_BRL, horizontal: 'right' }
          : { cor: CINZA_CLARO, formato: FORMATO_BRL, horizontal: 'right' }),
        valor: v,
      });
    };
    if (p.cracha) l.celulas.push({ col: 1, estilo: corpo(z, { horizontal: 'center', cor: TEXTO }), texto: p.cracha });
    else l.celulas.push({ col: 1, estilo: corpo(z, { horizontal: 'center' }) });
    l.celulas.push({ col: 2, estilo: corpo(z, { negrito: true, cor: TEXTO, recuo: 1 }), texto: p.nome.toUpperCase() });
    l.celulas.push({ col: 3, estilo: corpo(z, { cor: TEXTO, recuo: 1 }), texto: p.setorNome.toUpperCase() });
    valor(COL_COMISSAO, p.comissao);
    valor(COL_PREMIACAO, p.premiacao);
    l.celulas.push({ col: 6, estilo: corpo(z, { cor: CINZA, recuo: 1, tamanho: 9 }), texto: p.obs });
  });

  const primeira = linhaCabecalho + 1;
  const ultima = linhaCabecalho + d.linhas.length;
  if (d.linhas.length) {
    const soma = (col: number, v: number) => ({
      col, estilo: rodape({ formato: FORMATO_BRL, horizontal: 'right', cor: ACENTO, tamanho: 11 }),
      valor: Math.round(v * 100) / 100,
      formula: `SUM(${refCelula(col, primeira)}:${refCelula(col, ultima)})`,
    });
    const tot = nova(26);
    const pessoas = d.linhas.length;
    tot.l.celulas.push({ col: 1, estilo: rodape({ recuo: 1 }), texto: `TOTAL  ·  ${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}` });
    tot.l.celulas.push({ col: 2, estilo: rodape({}) }, { col: 3, estilo: rodape({}) });
    mesclas.push(`${refCelula(1, tot.numero)}:${refCelula(3, tot.numero)}`);
    tot.l.celulas.push(soma(COL_COMISSAO, d.linhas.reduce((t, l) => t + (l.comissao ?? 0), 0)));
    tot.l.celulas.push(soma(COL_PREMIACAO, d.linhas.reduce((t, l) => t + (l.premiacao ?? 0), 0)));
    const bateram = d.linhas.filter(l => l.estado === 'bateu').length;
    tot.l.celulas.push({ col: 6, estilo: rodape({ recuo: 1, cor: CINZA }), texto: `${bateram} ${bateram === 1 ? 'bateu' : 'bateram'} a meta` });
  }

  const xmlLinhas = linhas.map((l, i) => {
    const r = i + 1;
    const celulas = l.celulas.map(c => {
      const endereco = refCelula(c.col, r);
      if ('texto' in c) return `<c r="${endereco}" s="${c.estilo}" t="inlineStr"><is><t xml:space="preserve">${escXml(c.texto)}</t></is></c>`;
      if ('valor' in c) return `<c r="${endereco}" s="${c.estilo}">${c.formula ? `<f>${c.formula}</f>` : ''}<v>${c.valor}</v></c>`;
      return `<c r="${endereco}" s="${c.estilo}"/>`;
    }).join('');
    return `<row r="${r}" spans="1:${ULTIMA}" ht="${l.altura}" customHeight="1">${celulas}</row>`;
  }).join('');

  const painel = `<pane ySplit="${linhaCabecalho}" topLeftCell="${refCelula(1, linhaCabecalho + 1)}" activePane="bottomLeft" state="frozen"/>`
    + `<selection pane="bottomLeft" activeCell="${refCelula(1, linhaCabecalho + 1)}" sqref="${refCelula(1, linhaCabecalho + 1)}"/>`;
  const colunas = COLUNAS.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura}" customWidth="1"/>`).join('');
  const filtro = d.linhas.length
    ? `<autoFilter ref="${refCelula(1, linhaCabecalho)}:${refCelula(ULTIMA, ultima)}"/>`
    : '';

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheetPr><tabColor rgb="FF${ACENTO}"/><pageSetUpPr fitToPage="1"/></sheetPr>`
    + `<dimension ref="A1:${refCelula(ULTIMA, linhas.length)}"/>`
    + `<sheetViews><sheetView showGridLines="0" workbookViewId="0">${painel}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + `<cols>${colunas}</cols>`
    + `<sheetData>${xmlLinhas}</sheetData>`
    + filtro
    + `<mergeCells count="${mesclas.length}">${mesclas.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    + '<printOptions horizontalCentered="1"/>'
    + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>'
    + '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
    + `<headerFooter><oddFooter>&amp;L&amp;8${escXml(TITULO_PREMIACOES)} · ${escXml(rotuloPeriodo(d.mes))}&amp;R&amp;8Página &amp;P de &amp;N</oddFooter></headerFooter>`
    + '</worksheet>';
}

export function montarPlanilhaPremiacoes(d: DadosPlanilhaPremiacoes): Uint8Array<ArrayBuffer> {
  const estilos = new Estilos();
  return montarPacoteXlsx({
    folhas: [{ nome: 'Premiações e Comissões', xml: montarFolhaPremiacoes(d, estilos) }],
    estilos,
    titulo: `${TITULO_PREMIACOES} · ${rotuloPeriodo(d.mes)}`,
    geradoEm: d.geradoEm,
  });
}
