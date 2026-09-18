/**
 * xlsxEstilizado.ts — as peças para escrever um Excel COM estilo, sem ExcelJS.
 *
 * `@e965/xlsx` (a edição comunitária do SheetJS) ignora estilo na escrita: sai
 * célula sem cor, sem borda, sem fonte. Cabeçalho colorido, faixa zebrada,
 * painel congelado e formato de moeda precisam do `styles.xml`, então o pacote
 * OOXML é montado à mão e compactado com `fflate` (~8 KB, contra ~1 MB do ExcelJS).
 *
 * Nasceu dentro do Acumulado por mês da PaguePlay (16/09/2026) e saiu de lá
 * quando o Fechamento › Premiações e Comissões (18/09/2026) precisou do mesmo:
 * quem desenha a folha continua sendo cada relatório; aqui ficam só o registro
 * de estilos e o pacote.
 *
 * Funções puras: nada de `document`.
 */
import { strToU8, zipSync } from 'fflate';

export const FONTE_PADRAO = 'Arial';
const TEXTO_PADRAO = '0F172A';

export type Borda = { estilo: 'thin' | 'medium'; cor: string };
/** Cor lisa, ou degradê da esquerda (`de`) para a direita (`para`). */
export type Fundo = string | { de: string; para: string };
export interface Estilo {
  tamanho?: number;
  negrito?: boolean;
  italico?: boolean;
  cor?: string;
  fundo?: Fundo;
  /** Código de formato do Excel (`"R$" #,##0.00`). Cada código ganha um id próprio. */
  formato?: string;
  horizontal?: 'left' | 'center' | 'right';
  recuo?: number;
  /** Quebra o texto na largura da coluna. */
  quebrar?: boolean;
  bordas?: Partial<Record<'left' | 'right' | 'top' | 'bottom', Borda>>;
}

export const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 1 → A, 27 → AA. */
export const letraColuna = (col: number): string => {
  let s = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
export const refCelula = (col: number, linha: number) => `${letraColuna(col)}${linha}`;

/** Primeiro id livre para formato próprio — abaixo disso são os embutidos do Excel. */
const PRIMEIRO_FORMATO = 164;

/** Cada combinação vira um `xf`; fontes, fundos, bordas e formatos iguais são reaproveitados. */
export class Estilos {
  private fontes = [`<font><sz val="10"/><name val="${FONTE_PADRAO}"/><family val="2"/></font>`];
  private fundos = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private bordas = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  private xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private formatos = new Map<string, number>();
  private indices = new Map<string, number>();

  private indice(lista: string[], xml: string) {
    const i = lista.indexOf(xml);
    return i >= 0 ? i : lista.push(xml) - 1;
  }

  private formato(codigo: string): number {
    let id = this.formatos.get(codigo);
    if (id === undefined) {
      id = PRIMEIRO_FORMATO + this.formatos.size;
      this.formatos.set(codigo, id);
    }
    return id;
  }

  id(e: Estilo): number {
    const chave = JSON.stringify(e);
    const pronto = this.indices.get(chave);
    if (pronto !== undefined) return pronto;

    const fonte = this.indice(this.fontes, `<font>${e.negrito ? '<b/>' : ''}${e.italico ? '<i/>' : ''}`
      + `<sz val="${e.tamanho ?? 10}"/><color rgb="FF${e.cor ?? TEXTO_PADRAO}"/><name val="${FONTE_PADRAO}"/><family val="2"/></font>`);
    const fundo = !e.fundo ? 0 : this.indice(this.fundos, typeof e.fundo === 'string'
      ? `<fill><patternFill patternType="solid"><fgColor rgb="FF${e.fundo}"/><bgColor indexed="64"/></patternFill></fill>`
      : `<fill><gradientFill degree="0"><stop position="0"><color rgb="FF${e.fundo.de}"/></stop>`
        + `<stop position="1"><color rgb="FF${e.fundo.para}"/></stop></gradientFill></fill>`);
    const lado = (nome: 'left' | 'right' | 'top' | 'bottom') => {
      const b = e.bordas?.[nome];
      return b ? `<${nome} style="${b.estilo}"><color rgb="FF${b.cor}"/></${nome}>` : `<${nome}/>`;
    };
    const borda = this.indice(this.bordas, `<border>${lado('left')}${lado('right')}${lado('top')}${lado('bottom')}<diagonal/></border>`);
    const formato = e.formato ? this.formato(e.formato) : 0;
    const alinhamento = `<alignment horizontal="${e.horizontal ?? 'left'}" vertical="center"`
      + `${e.recuo ? ` indent="${e.recuo}"` : ''}${e.quebrar ? ' wrapText="1"' : ''}/>`;

    const id = this.xfs.push(`<xf numFmtId="${formato}" fontId="${fonte}" fillId="${fundo}" borderId="${borda}" xfId="0"`
      + ` applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alinhamento}</xf>`) - 1;
    this.indices.set(chave, id);
    return id;
  }

  xml(): string {
    const formatos = [...this.formatos].map(([codigo, id]) => `<numFmt numFmtId="${id}" formatCode="${escXml(codigo)}"/>`);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + (formatos.length ? `<numFmts count="${formatos.length}">${formatos.join('')}</numFmts>` : '')
      + `<fonts count="${this.fontes.length}">${this.fontes.join('')}</fonts>`
      + `<fills count="${this.fundos.length}">${this.fundos.join('')}</fills>`
      + `<borders count="${this.bordas.length}">${this.bordas.join('')}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>';
  }
}

/** Uma aba pronta: o nome (até 31 caracteres, sem `[]:*?/\`) e o `worksheet.xml`. */
export interface FolhaXlsx {
  nome: string;
  xml: string;
}

/**
 * O pacote `.xlsx`: tipos, relações, pasta de trabalho, estilos e as folhas.
 *
 * `fullCalcOnLoad`: fórmula escrita com o valor pronto (`<v>`) aparece em quem
 * não calcula (prévia do WhatsApp, Google Drive), e o Excel refaz a conta ao abrir.
 */
export function montarPacoteXlsx(params: {
  folhas: readonly FolhaXlsx[];
  estilos: Estilos;
  titulo: string;
  geradoEm: Date;
}): Uint8Array<ArrayBuffer> {
  const { folhas, estilos, titulo, geradoEm } = params;
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  const arquivos: Record<string, string> = {
    '[Content_Types].xml': xml
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + `<Override PartName="/xl/workbook.xml" ContentType="${tipo}.sheet.main+xml"/>`
      + folhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${tipo}.worksheet+xml"/>`).join('')
      + `<Override PartName="/xl/styles.xml" ContentType="${tipo}.styles+xml"/>`
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '</Types>',
    '_rels/.rels': xml
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + `<Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/>`
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '</Relationships>',
    'docProps/core.xml': xml
      + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${escXml(titulo)}</dc:title><dc:creator>Gestão de Acordos</dc:creator>`
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${geradoEm.toISOString().slice(0, 19)}Z</dcterms:created>`
      + '</cp:coreProperties>',
    'xl/workbook.xml': xml
      + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}">`
      + '<bookViews><workbookView activeTab="0"/></bookViews>'
      + `<sheets>${folhas.map((f, i) => `<sheet name="${escXml(f.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
      + '<calcPr calcId="191029" fullCalcOnLoad="1"/>'
      + '</workbook>',
    'xl/_rels/workbook.xml.rels': xml
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + folhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${folhas.length + 1}" Type="${rel}/styles" Target="styles.xml"/>`
      + '</Relationships>',
    'xl/styles.xml': estilos.xml(),
  };
  folhas.forEach((f, i) => { arquivos[`xl/worksheets/sheet${i + 1}.xml`] = f.xml; });

  // `zipSync` aloca um ArrayBuffer comum; o tipo genérico dele só não diz isso ao `Blob`.
  return zipSync(Object.fromEntries(Object.entries(arquivos).map(([nome, conteudo]) => [nome, strToU8(conteudo)])), { level: 6 }) as Uint8Array<ArrayBuffer>;
}
