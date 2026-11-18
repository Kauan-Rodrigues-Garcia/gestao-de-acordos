/**
 * O Excel do Banco de Horas: .xlsx escrito à mão (o mesmo do painel antigo,
 * conferido abrindo no Excel em 17/11/2026), agora empacotado pelo `fflate`.
 *
 * Horas saem como TEMPO do Excel (`[h]:mm`), que soma; positivas em azul,
 * negativas em vermelho, vencendo em amarelo; filtro em cada coluna e total
 * por SUBTOTAL, que respeita o filtro.
 */
import { strToU8, zipSync } from 'fflate';
import {
  type FiltroSituacao, type Pessoa, type Visao,
  grupoDe, grupos, ordemNatural, porSetor, somaDoMes,
} from './calculos';
import { data as fmtData, diaMes, mesCurto, mesLongo, somaMeses } from './formato';

type TipoColuna = 'txt' | 'h' | 'hp' | 'hn' | 'hv' | 'int';
interface Coluna { t: string; w?: number; k: TipoColuna; semTotal?: boolean }
type Celula = string | number | null;
interface Aba { nome: string; topo?: string[]; cols: Coluna[]; linhas: Celula[][]; total?: boolean; semFiltro?: boolean }

const X = (s: unknown) => String(s ?? '')
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const col = (i: number) => {
  let s = '';
  let k = i + 1;
  while (k) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); }
  return s;
};

// estilos: 0 normal · 1 cabeçalho · 2 horas · 3 título · 4 negrito · 5 horas negrito · 6 positivas · 7 negativas · 8 inteiro · 9 subtítulo · 10 vencendo · 11 inteiro negrito
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="[h]:mm"/></numFmts>
<fonts count="6"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF1C5CAB"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF7C7F87"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF7A5000"/><name val="Calibri"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2A78D6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6F0FC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFDEAEA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4DA"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFE4E6EA"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="5" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="3" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const ESTILO_HORA: Record<TipoColuna, number> = { txt: 0, h: 2, hp: 6, hn: 7, hv: 10, int: 8 };

function planilha(a: Aba): string {
  const topo = a.topo || [];
  const hr = topo.length ? topo.length + 2 : 1;
  const n = a.linhas.length;
  let xml = '';
  topo.forEach((t, i) => { xml += `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr" s="${i === 0 ? 3 : 9}"><is><t>${X(t)}</t></is></c></row>`; });
  xml += `<row r="${hr}" ht="30" customHeight="1">${a.cols.map((c, j) => `<c r="${col(j)}${hr}" t="inlineStr" s="1"><is><t>${X(c.t)}</t></is></c>`).join('')}</row>`;
  a.linhas.forEach((L, i) => {
    const r = hr + 1 + i;
    xml += `<row r="${r}">${a.cols.map((c, j) => {
      const v = L[j];
      const ref = col(j) + r;
      if (v == null || v === '') return '';
      if (c.k === 'txt' || typeof v === 'string') return `<c r="${ref}" t="inlineStr" s="0"><is><t>${X(v)}</t></is></c>`;
      if (c.k === 'int') return `<c r="${ref}" s="8"><v>${v}</v></c>`;
      return `<c r="${ref}" s="${ESTILO_HORA[c.k]}"><v>${(Math.abs(v) / 1440).toFixed(10)}</v></c>`;
    }).join('')}</row>`;
  });
  if (a.total && n) {
    const r = hr + n + 1;
    xml += `<row r="${r}">${a.cols.map((c, j) => (j === 0
      ? `<c r="A${r}" t="inlineStr" s="4"><is><t>Total</t></is></c>`
      : (c.k === 'txt' || c.semTotal) ? ''
        : `<c r="${col(j)}${r}" s="${c.k === 'int' ? 11 : 5}"><f>SUBTOTAL(109,${col(j)}${hr + 1}:${col(j)}${hr + n})</f></c>`)).join('')}</row>`;
  }
  const ultima = col(a.cols.length - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${hr}" topLeftCell="A${hr + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${a.cols.map((c, j) => `<col min="${j + 1}" max="${j + 1}" width="${c.w || 14}" customWidth="1"/>`).join('')}</cols>
<sheetData>${xml}</sheetData>${n && !a.semFiltro ? `<autoFilter ref="A${hr}:${ultima}${hr + n}"/>` : ''}</worksheet>`;
}

/** As abas viram um .xlsx (bytes). */
export function montarXlsx(abas: Aba[]): Uint8Array {
  const nomes: string[] = [];
  const usado = new Set<string>();
  for (const a of abas) {
    let nome = a.nome.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
    const base = nome;
    let i = 2;
    while (usado.has(nome)) nome = `${base.slice(0, 28)} ${i++}`;
    usado.add(nome);
    nomes.push(nome);
  }
  const inicio = (a: Aba) => ((a.topo || []).length ? (a.topo || []).length + 2 : 1);
  const comFiltro = abas.map((a, i) => ({ a, i })).filter(x => x.a.linhas.length && !x.a.semFiltro);
  const arquivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((_a, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes.map((n, i) => `<sheet name="${X(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${comFiltro.length ? `<definedNames>${comFiltro.map(({ a, i }) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${X(nomes[i]).replace(/'/g, "''")}'!$A$${inicio(a)}:$${col(a.cols.length - 1)}$${inicio(a) + a.linhas.length}</definedName>`).join('')}</definedNames>` : ''}</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_a, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(ESTILOS),
  };
  abas.forEach((a, i) => { arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(planilha(a)); });
  return zipSync(arquivos);
}

// ── As abas do Banco de Horas ────────────────────────────────────────────────

export type AbaExcel = 'resumo' | 'setores' | 'pessoas' | 'positivas' | 'negativas' | 'vence' | 'meses' | 'situacao';

export const ABAS_EXCEL: { id: AbaExcel; titulo: string; descricao: string }[] = [
  { id: 'resumo', titulo: 'Resumo', descricao: 'Totais do banco, situação e os últimos 3 meses' },
  { id: 'setores', titulo: 'Setores', descricao: 'Um setor por linha: positivas, negativas, vencimento, meses' },
  { id: 'pessoas', titulo: 'Pessoas', descricao: 'Todo mundo, com a situação e as horas de cada mês' },
  { id: 'positivas', titulo: 'Positivas', descricao: 'Só quem tem horas guardadas, da maior para a menor' },
  { id: 'negativas', titulo: 'Negativas', descricao: 'Só quem está devendo, com a faixa da dívida' },
  { id: 'vence', titulo: 'Vencimentos', descricao: 'Quem tem horas vencendo em até 90 dias, por setor' },
  { id: 'meses', titulo: 'Meses', descricao: 'Positivas e negativas de cada mês' },
  { id: 'situacao', titulo: 'Situação', descricao: 'Cada pessoa no seu grupo (devendo, vence, acima do limite, em dia)' },
];

const P_ = (v: number) => (v > 0 ? v : null);
const N_ = (v: number) => (v < 0 ? -v : null);

export function abasDoBancoDeHoras(
  quais: Set<AbaExcel>, v: Visao, L: Pessoa[], sit: FiltroSituacao, limite: number, filtro: string,
  /** Os meses escolhidos na tela; sem eles, os 3 últimos. */
  mesesEscolhidos: string[] = v.ult3,
): Aba[] {
  const todosMeses = [...new Set([...v.ult3, ...v.meses])].sort().reverse();
  const ult3 = [...mesesEscolhidos].sort().reverse();
  const quando = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const topo = (t: string) => [t, `Banco de horas · saldo em ${fmtData(v.data)} · ${filtro || 'todos os setores'} · gerado em ${quando}`];
  const defs = grupos(v, sit, limite);
  const nomeGrupo = (p: Pessoa) => defs.find(d => d.id === grupoDe(p, sit, limite))?.titulo ?? '';
  const A: Aba[] = [];
  const G = porSetor(L, todosMeses, sit, limite).sort((a, b) => ordemNatural(a.setor, b.setor));

  if (quais.has('resumo')) {
    let bp = 0; let bn = 0; let np = 0; let nn = 0; let vp = 0; let nv = 0;
    const cont: Record<string, number> = {};
    for (const p of L) {
      if (p.saldo > 0) { bp += p.saldo; np++; } else if (p.saldo < 0) { bn += p.saldo; nn++; }
      if (p.vprox > 0) { vp += p.vprox; nv++; }
      const g = grupoDe(p, sit, limite);
      cont[g] = (cont[g] || 0) + 1;
    }
    const linhas: Celula[][] = [
      ['Horas positivas (guardadas)', bp, np], ['Horas negativas (devendo)', -bn, nn], [`Vence em ${fmtData(v.prox)}`, vp, nv],
      ...defs.map(d => [`Situação: ${d.titulo}`, null, cont[d.id] || 0]),
    ];
    for (const m of ult3) {
      const s = somaDoMes(L, m);
      linhas.push([`Feitas em ${mesCurto(m)} · positivas`, s.pos, s.nPos], [`Feitas em ${mesCurto(m)} · negativas`, -s.neg, s.nNeg]);
    }
    A.push({ nome: 'Resumo', topo: topo('Resumo do banco de horas'), semFiltro: true,
      cols: [{ t: 'Indicador', w: 44, k: 'txt' }, { t: 'Horas', w: 14, k: 'h' }, { t: 'Pessoas', w: 11, k: 'int' }], linhas });
  }
  if (quais.has('setores')) {
    A.push({ nome: 'Setores', topo: topo('Banco de horas por setor'), total: true,
      cols: [{ t: 'Setor', w: 30, k: 'txt' }, { t: 'Departamento', w: 18, k: 'txt' }, { t: 'Empresa', w: 12, k: 'txt' }, { t: 'Pessoas', w: 10, k: 'int' },
        { t: 'Pessoas positivas', w: 11, k: 'int' }, { t: 'Horas positivas', w: 12, k: 'hp' }, { t: 'Média positiva por pessoa', w: 12, k: 'h', semTotal: true },
        { t: 'Pessoas negativas', w: 11, k: 'int' }, { t: 'Horas negativas (devendo)', w: 13, k: 'hn' },
        { t: 'Saldo do setor', w: 12, k: 'h', semTotal: true }, { t: 'Saldo é', w: 10, k: 'txt' }, { t: `Vence ${diaMes(v.prox)}`, w: 11, k: 'hv' }, { t: 'Pessoas vencendo', w: 11, k: 'int' },
        ...ult3.flatMap<Coluna>(m => [{ t: `${mesCurto(m)} positivas`, w: 11, k: 'hp' }, { t: `${mesCurto(m)} negativas`, w: 11, k: 'hn' }])],
      linhas: G.map(s => [s.setor, s.depto, s.empresa, s.n, s.nPos, s.bPos || null, s.nPos ? s.bPos / s.nPos : null, s.nNeg, N_(s.bNeg),
        Math.abs(s.saldo), s.saldo < 0 ? 'devendo' : 'positivo', s.vprox || null, s.nV,
        ...ult3.flatMap(m => [s.mes[m] ? P_(s.mes[m].pos) : null, s.mes[m] ? N_(s.mes[m].neg) : null])]) });
  }
  const colsP = (extra: Coluna[] = []): Coluna[] => [{ t: 'Nome', w: 34, k: 'txt' }, { t: 'Matrícula', w: 11, k: 'txt' }, { t: 'Setor', w: 26, k: 'txt' },
    { t: 'Departamento', w: 16, k: 'txt' }, { t: 'Empresa', w: 11, k: 'txt' }, ...extra];
  const idP = (p: Pessoa): Celula[] => [p.nome, p.mat, p.setor, p.depto, p.empresa];
  const porSetorENome = (a: Pessoa, b: Pessoa) => ordemNatural(a.setor, b.setor) || a.nome.localeCompare(b.nome, 'pt-BR');
  if (quais.has('pessoas')) {
    A.push({ nome: 'Pessoas', topo: topo('Todas as pessoas'), total: true,
      cols: colsP([{ t: 'Situação', w: 20, k: 'txt' }, { t: 'Horas positivas', w: 12, k: 'hp' }, { t: 'Horas negativas (devendo)', w: 13, k: 'hn' },
        { t: `Vence ${diaMes(v.prox)}`, w: 11, k: 'hv' }, { t: 'Vence em até 90 dias', w: 12, k: 'h' },
        ...todosMeses.flatMap<Coluna>(m => [{ t: `${mesCurto(m)} positivas`, w: 11, k: 'hp' }, { t: `${mesCurto(m)} negativas`, w: 11, k: 'hn' }])]),
      linhas: [...L].sort(porSetorENome).map(p => [...idP(p), nomeGrupo(p), P_(p.saldo), N_(p.saldo), p.vprox || null, p.v90 || null,
        ...todosMeses.flatMap(m => [P_(p.mes[m] || 0), N_(p.mes[m] || 0)])]) });
  }
  if (quais.has('positivas')) {
    A.push({ nome: 'Positivas', topo: topo('Quem tem horas positivas (guardadas)'), total: true,
      cols: colsP([{ t: 'Horas positivas', w: 12, k: 'hp' }, { t: `Vence ${diaMes(v.prox)}`, w: 11, k: 'hv' }, { t: 'Vence em até 90 dias', w: 12, k: 'h' },
        { t: 'Situação', w: 20, k: 'txt' }, ...ult3.map<Coluna>(m => ({ t: `Feitas em ${mesCurto(m)}`, w: 11, k: 'hp' }))]),
      linhas: L.filter(p => p.saldo > 0).sort((a, b) => b.saldo - a.saldo)
        .map(p => [...idP(p), p.saldo, p.vprox || null, p.v90 || null, nomeGrupo(p), ...ult3.map(m => P_(p.mes[m] || 0))]) });
  }
  if (quais.has('negativas')) {
    A.push({ nome: 'Negativas', topo: topo('Quem está devendo horas'), total: true,
      cols: colsP([{ t: 'Horas devendo', w: 12, k: 'hn' }, { t: 'Faixa', w: 18, k: 'txt' }, ...ult3.map<Coluna>(m => ({ t: `Devendo em ${mesCurto(m)}`, w: 11, k: 'hn' }))]),
      linhas: L.filter(p => p.saldo < 0).sort((a, b) => a.saldo - b.saldo).map(p => {
        const h = -p.saldo / 60;
        return [...idP(p), -p.saldo, h > 40 ? 'Mais de 40h' : h >= 10 ? 'De 10h a 40h' : 'Até 10h', ...ult3.map(m => N_(p.mes[m] || 0))];
      }) });
  }
  if (quais.has('vence')) {
    A.push({ nome: `Vence ${diaMes(v.prox).replace('/', '-')}`, topo: topo(`Horas que vencem em ${fmtData(v.prox)} e nos próximos 90 dias`), total: true,
      cols: [{ t: 'Setor', w: 26, k: 'txt' }, { t: 'Nome', w: 34, k: 'txt' }, { t: 'Matrícula', w: 11, k: 'txt' }, { t: `Vence ${diaMes(v.prox)}`, w: 11, k: 'hv' },
        { t: 'Vence em até 60 dias', w: 12, k: 'h' }, { t: 'Vence em até 90 dias', w: 12, k: 'h' }, { t: 'Horas positivas no banco', w: 13, k: 'hp' }],
      linhas: L.filter(p => p.v90 > 0).sort((a, b) => ordemNatural(a.setor, b.setor) || b.vprox - a.vprox)
        .map(p => [p.setor, p.nome, p.mat, p.vprox || null, p.v60 || null, p.v90 || null, P_(p.saldo)]) });
  }
  if (quais.has('meses')) {
    A.push({ nome: 'Meses', topo: topo('Horas por mês em que foram feitas'), total: true,
      cols: [{ t: 'Mês', w: 16, k: 'txt' }, { t: 'Horas positivas', w: 12, k: 'hp' }, { t: 'Pessoas positivas', w: 11, k: 'int' },
        { t: 'Horas negativas (devendo)', w: 13, k: 'hn' }, { t: 'Pessoas negativas', w: 11, k: 'int' }, { t: 'Vencem em', w: 12, k: 'txt' }],
      linhas: todosMeses.map(m => {
        const s = somaDoMes(L, m);
        const venc = somaMeses(m, 12);
        return [mesLongo(m), s.pos || null, s.nPos, N_(s.neg), s.nNeg, `25/${venc.slice(5)}/${venc.slice(0, 4)}`];
      }) });
  }
  if (quais.has('situacao')) {
    const ordem = defs.map(d => d.id);
    A.push({ nome: 'Situação', topo: topo('Cada pessoa no seu grupo'), total: true,
      cols: [{ t: 'Situação', w: 22, k: 'txt' }, ...colsP().slice(0, 3), { t: 'Horas positivas', w: 12, k: 'hp' },
        { t: 'Horas negativas (devendo)', w: 13, k: 'hn' }, { t: `Vence ${diaMes(v.prox)}`, w: 11, k: 'hv' }],
      linhas: [...L].sort((a, b) => ordem.indexOf(grupoDe(a, sit, limite)) - ordem.indexOf(grupoDe(b, sit, limite)) || Math.abs(b.saldo) - Math.abs(a.saldo))
        .map(p => [nomeGrupo(p), p.nome, p.mat, p.setor, P_(p.saldo), N_(p.saldo), p.vprox || null]) });
  }
  return A;
}

export function baixarArquivo(blob: Blob, nome: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export function baixarExcel(nome: string, abas: Aba[]) {
  const bytes = montarXlsx(abas);
  baixarArquivo(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nome);
}
