/**
 * planilhaPremiacoes.ts — o «Relatório de Premiações e Comissões» em Excel.
 *
 * O MODELO é a planilha que circulava (18/09/2026): título, «Período: agosto de
 * 2026 · Gerado em: 17/09/2026, 08:39» e as colunas Crachá · Nome · Setor ·
 * Comissão (R$) · Premiação (R$) · Obs. A ordem e os nomes ficam; o que muda é
 * o acabamento do Gestão: faixa de título, cabeçalho colorido, zebra, moeda de
 * verdade, filtro, painel congelado e a linha de total.
 *
 * Correção de 19/09/2026: as cores passam a ser as do tema claro do Gestão
 * (`COR_GESTAO`, o azul do app, no lugar do índigo), as faixas são de cor lisa
 * (degradê some ou borra na prévia do WhatsApp e no Google Planilhas), a fonte
 * é Calibri e o valor de quem bateu sai em tamanho médio, num fundo verde claro.
 *
 * ## Recebe as linhas da tela
 *
 * As mesmas `linhas` que a aba desenha, já calculadas e na mesma ordem. Um
 * arquivo que refizesse a conta seria o primeiro lugar onde o baixado e a tela
 * discordariam.
 *
 * ## Vazio não é zero
 *
 * Célula de valor vazia = sem meta/config (a Obs. diz qual), ou a outra cidade
 * no recorte de todos os setores. Zero = tinha meta e não bateu. Os totais são
 * `SUM`, com o valor já calculado para quem abre sem motor de cálculo.
 *
 * ## Uma cidade, uma coluna
 *
 * Correção de 18/09/2026: o recorte de Birigui sai só com Premiação, e o de
 * Marília só com Comissão — título, coluna e nome da aba acompanham
 * (`tiposNoRecorte`, a mesma régua da tela). As duas colunas só quando o
 * recorte mistura cidades.
 *
 * Função pura: nada de `document`.
 */
import {
  Estilos, escXml, montarPacoteXlsx, refCelula, type Borda, type Estilo,
} from '@/lib/xlsxEstilizado';
import {
  COR_GESTAO as G, COR_TIPO_REMUNERACAO, FONTE_PLANILHA, rotuloGeradoEm,
} from '@/lib/relatorioGestao';
import {
  ROTULO_TIPO, tiposNoRecorte, valorDoTipo, type LinhaPremiacao, type TipoRemuneracao,
} from './calculoPremiacoes';

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

/** O título pelo que o recorte tem: só premiação, só comissão ou as duas. */
export function tituloPremiacoes(tipos: readonly TipoRemuneracao[]): string {
  if (tipos.length !== 1) return TITULO_PREMIACOES;
  return tipos[0] === 'premiacao' ? 'Relatório de Premiações' : 'Relatório de Comissões';
}

/** Plural do tipo, para o nome da aba e do arquivo. */
const PLURAL: Record<TipoRemuneracao, string> = { premiacao: 'Premiações', comissao: 'Comissões' };

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** `2026-08` → «agosto de 2026», como na planilha. */
export function rotuloPeriodo(mes: string): string {
  const [ano, m] = mes.split('-');
  return `${MESES[Number(m) - 1] ?? m} de ${ano}`;
}

/** «17/09/2026, 08:39» — mora em `relatorioGestao`, com o HTML. */
export { rotuloGeradoEm };

function slug(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function nomeArquivoPremiacoes(
  d: Pick<DadosPlanilhaPremiacoes, 'mes' | 'setorNome' | 'linhas'>,
  extensao: 'xlsx' | 'html' = 'xlsx',
): string {
  const tipos = tiposNoRecorte(d.linhas);
  const prefixo = tipos.length === 1 ? slug(PLURAL[tipos[0]]) : 'premiacoes-comissoes';
  return `${prefixo}-${d.mes}-${slug(d.setorNome ?? 'todos os setores')}.${extensao}`;
}

// ── Estilo ──────────────────────────────────────────────────────────────────

/** O azul do Gestão, do escuro do título ao claro do rodapé. */
const ESCURO = G.primarioEscuro;
const CABECALHO = G.primario;
const ACENTO = G.primario;
const FAIXA = G.realce;
const SUBTITULO = G.primarioClaro;
const TEXTO = G.texto;
const CINZA = G.fraco;
const CINZA_CLARO = G.tenue;
const LINHA = G.bordaSuave;
const ZEBRA = G.cartao;
const VERDE = G.sucesso;

const FORMATO_BRL = '"R$" #,##0.00';

interface ColunaFolha { titulo: string; largura: number; alinhamento: 'left' | 'center' | 'right' }

/** A=Crachá, B=Nome, C=Setor, depois uma coluna por tipo do recorte, e Obs. por último. */
function colunasDaFolha(tipos: readonly TipoRemuneracao[]): ColunaFolha[] {
  return [
    { titulo: 'Crachá', largura: 12, alinhamento: 'center' },
    { titulo: 'Nome',   largura: 40, alinhamento: 'left' },
    { titulo: 'Setor',  largura: 22, alinhamento: 'left' },
    ...tipos.map((t): ColunaFolha => ({ titulo: `${ROTULO_TIPO[t]} (R$)`, largura: 19, alinhamento: 'right' })),
    { titulo: 'Obs.',   largura: 52, alinhamento: 'left' },
  ];
}
/** A primeira coluna de valor. */
const COL_VALOR = 4;

type Celula =
  | { col: number; estilo: number; texto: string }
  | { col: number; estilo: number; valor: number; formula?: string }
  | { col: number; estilo: number };

// ── Folha ───────────────────────────────────────────────────────────────────

export function montarFolhaPremiacoes(d: DadosPlanilhaPremiacoes, estilos: Estilos): string {
  const fina = (cor: string): Borda => ({ estilo: 'thin', cor });
  const media = (cor: string): Borda => ({ estilo: 'medium', cor });
  const id = (e: Estilo) => estilos.id({ fonte: FONTE_PLANILHA, ...e });
  const s = {
    titulo: id({ tamanho: 15, negrito: true, cor: 'FFFFFF', fundo: ESCURO, recuo: 1 }),
    subtitulo: id({ tamanho: 10, cor: SUBTITULO, fundo: ESCURO, recuo: 1 }),
    nota: id({ tamanho: 9, italico: true, cor: CINZA, recuo: 1 }),
    cabecalho: (h: 'left' | 'center' | 'right') =>
      id({ tamanho: 10, negrito: true, cor: 'FFFFFF', fundo: CABECALHO, horizontal: h, recuo: h === 'left' ? 1 : 0 }),
    vazio: id({ tamanho: 11, italico: true, cor: CINZA, horizontal: 'center' }),
  };
  const corpo = (zebra: boolean, e: Estilo) =>
    id({ tamanho: 10, fundo: zebra ? ZEBRA : undefined, ...e, bordas: { bottom: fina(LINHA), ...e.bordas } });
  const rodape = (e: Estilo) =>
    id({ tamanho: 10, negrito: true, fundo: FAIXA, cor: ESCURO, ...e, bordas: { top: media(ACENTO), bottom: fina(ACENTO) } });

  const tipos = tiposNoRecorte(d.linhas);
  const COLUNAS = colunasDaFolha(tipos);
  const ULTIMA = COLUNAS.length;
  const colDoTipo = (t: TipoRemuneracao) => COL_VALOR + tipos.indexOf(t);

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
  /** «Premiação: Birigui», com as cidades que estão de fato no recorte. */
  const cidadesDoTipo = (t: TipoRemuneracao) =>
    [...new Set(d.linhas.filter(l => l.tipo === t && l.celula).map(l => l.celula))].join(', ');
  faixa(30, s.titulo, tituloPremiacoes(tipos));
  faixa(20, s.subtitulo, `Período: ${rotuloPeriodo(d.mes)}  ·  Gerado em: ${rotuloGeradoEm(d.geradoEm)}`);
  faixa(20, s.nota, [
    `${d.empresaNome} · ${alvo}`,
    ...tipos.map(t => (cidadesDoTipo(t) ? `${ROTULO_TIPO[t]}: ${cidadesDoTipo(t)}` : null)),
    'valor = meta do mês (faixa atingida × %)',
    d.parcial ? 'mês em aberto: valores parciais' : null,
  ].filter(Boolean).join('  ·  '));
  nova(8);

  const cab = nova(22);
  COLUNAS.forEach((c, i) => cab.l.celulas.push({ col: i + 1, estilo: s.cabecalho(c.alinhamento), texto: c.titulo }));
  const linhaCabecalho = cab.numero;

  if (!d.linhas.length) {
    faixa(36, s.vazio, 'Nenhuma pessoa neste recorte.');
  }

  d.linhas.forEach((p, i) => {
    const z = i % 2 === 1;
    const { l } = nova(20);
    const valor = (col: number, v: number | null) => {
      if (v === null) { l.celulas.push({ col, estilo: corpo(z, { horizontal: 'right' }) }); return; }
      l.celulas.push({
        col,
        // Quem bateu: verde e negrito no corpo da linha — o fundo verde claro faz
        // o destaque, não o tamanho (19/09: «médio, não grande»).
        estilo: corpo(z, v > 0
          ? { negrito: true, cor: VERDE, fundo: G.sucessoFundo, formato: FORMATO_BRL, horizontal: 'right' }
          : { cor: CINZA_CLARO, formato: FORMATO_BRL, horizontal: 'right' }),
        valor: v,
      });
    };
    // A faixa verde à esquerda de quem bateu, como na tela.
    const marca: Estilo['bordas'] = p.estado === 'bateu' ? { left: media(VERDE) } : undefined;
    if (p.cracha) l.celulas.push({ col: 1, estilo: corpo(z, { horizontal: 'center', cor: TEXTO, bordas: marca }), texto: p.cracha });
    else l.celulas.push({ col: 1, estilo: corpo(z, { horizontal: 'center', bordas: marca }) });
    l.celulas.push({ col: 2, estilo: corpo(z, { negrito: true, cor: TEXTO, recuo: 1 }), texto: p.nome.toUpperCase() });
    // O setor na cor da cidade dele: violeta premiação, azul-céu comissão.
    l.celulas.push({
      col: 3,
      estilo: corpo(z, { cor: p.tipo ? COR_TIPO_REMUNERACAO[p.tipo].texto : TEXTO, recuo: 1 }),
      texto: p.setorNome.toUpperCase(),
    });
    for (const t of tipos) valor(colDoTipo(t), valorDoTipo(p, t));
    l.celulas.push({ col: ULTIMA, estilo: corpo(z, { cor: CINZA, recuo: 1, tamanho: 9 }), texto: p.obs });
  });

  const primeira = linhaCabecalho + 1;
  const ultima = linhaCabecalho + d.linhas.length;
  if (d.linhas.length) {
    const soma = (col: number, v: number) => ({
      col, estilo: rodape({ formato: FORMATO_BRL, horizontal: 'right', cor: ACENTO }),
      valor: Math.round(v * 100) / 100,
      formula: `SUM(${refCelula(col, primeira)}:${refCelula(col, ultima)})`,
    });
    const tot = nova(24);
    const pessoas = d.linhas.length;
    tot.l.celulas.push({ col: 1, estilo: rodape({ recuo: 1 }), texto: `TOTAL  ·  ${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}` });
    tot.l.celulas.push({ col: 2, estilo: rodape({}) }, { col: 3, estilo: rodape({}) });
    mesclas.push(`${refCelula(1, tot.numero)}:${refCelula(3, tot.numero)}`);
    for (const t of tipos) {
      tot.l.celulas.push(soma(colDoTipo(t), d.linhas.reduce((acc, l) => acc + (valorDoTipo(l, t) ?? 0), 0)));
    }
    const bateram = d.linhas.filter(l => l.estado === 'bateu').length;
    tot.l.celulas.push({ col: ULTIMA, estilo: rodape({ recuo: 1, cor: CINZA }), texto: `${bateram} ${bateram === 1 ? 'bateu' : 'bateram'} a meta` });
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
    + `<headerFooter><oddFooter>&amp;L&amp;8${escXml(tituloPremiacoes(tipos))} · ${escXml(rotuloPeriodo(d.mes))}&amp;R&amp;8Página &amp;P de &amp;N</oddFooter></headerFooter>`
    + '</worksheet>';
}

export function montarPlanilhaPremiacoes(d: DadosPlanilhaPremiacoes): Uint8Array<ArrayBuffer> {
  const estilos = new Estilos();
  const tipos = tiposNoRecorte(d.linhas);
  return montarPacoteXlsx({
    folhas: [{
      nome: tipos.length === 1 ? PLURAL[tipos[0]] : 'Premiações e Comissões',
      xml: montarFolhaPremiacoes(d, estilos),
    }],
    estilos,
    titulo: `${tituloPremiacoes(tipos)} · ${rotuloPeriodo(d.mes)}`,
    geradoEm: d.geradoEm,
  });
}
