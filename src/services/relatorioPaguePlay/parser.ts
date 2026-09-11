import { read, utils, SSF } from '@e965/xlsx';
import { CAMPOS_VALOR, centavos, somarValores, zerarValores, type Modalidade, type Pagamento, type RelatorioLido, type Valores } from './modelo';

const normalizar = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const vazio = (v: unknown) => v == null || String(v).trim() === '';
const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

export function dataISO(v: unknown): string {
  let y: number, m: number, d: number;
  if (typeof v === 'number') {
    const date = SSF.parse_date_code(v);
    if (!date) throw new Error('Data Excel inválida.');
    ({ y, m, d } = date);
  } else if (v instanceof Date && !Number.isNaN(v.getTime())) {
    y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate();
  } else {
    const s = String(v ?? '').trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(s);
    const br = /^(\d{2})\/(\d{2})\/(\d{4})(?: .*)?$/.exec(s);
    if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
    else if (br) { y = +br[3]; m = +br[2]; d = +br[1]; }
    else throw new Error('Data ausente ou inválida.');
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new Error('Data fora do calendário.');
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Parser exclusivo desta aba: não herda descartes por operador do diário. */
export function lerLinhas(rows: unknown[][]): RelatorioLido {
  const headers = (rows[0] ?? []).map(normalizar);
  const coluna = (nomes: string[], obrigatoria = true) => {
    const matches = headers.flatMap((h, i) => nomes.includes(h) ? [i] : []);
    if (matches.length > 1) throw new Error(`Coluna ambígua: ${nomes[0]}.`);
    if (!matches.length && obrigatoria) throw new Error(`Coluna obrigatória ausente: ${nomes[0]}. Use o relatório 945 completo.`);
    return matches[0] ?? -1;
  };
  const c = {
    id_baixa: coluna(['idbaixa']), data: coluna(['data']), data_pagamento: coluna(['dtpagamento', 'datapagamento']),
    uf: coluna(['ufcoren']), acordo: coluna(['codacordo']), parcela: coluna(['parcela']),
    forma: coluna(['formapgto', 'formadepagamento']), ia: coluna(['ia'], false), periodo: coluna(['periodo'], false),
    total: coluna(['valorrecebido']), coren: coluna(['coren', 'coren5628']), cofen: coluna(['cofen', 'cofen1876']),
    pp: coluna(['pagueplay', 'pagueplay2496']),
  };
  const linhas: Pagamento[] = [], porId = new Map<string, Pagamento>();
  const totais = zerarValores(), somaArquivo = zerarValores();
  let rodape: Partial<Valores> | null = null, duplicadas = 0;
  const modalidades = new Set<Modalidade>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every(vazio)) continue;
    try {
      const identidadeVazia = ['id_baixa', 'data', 'data_pagamento', 'uf', 'acordo', 'parcela', 'forma'].every(k => vazio(row[c[k as keyof typeof c]]));
      if (identidadeVazia) {
        if (rodape) throw new Error('Mais de um rodapé de totais.');
        // Algumas exportações omitem um dos totais no rodapé. Conferir todos
        // os que existem, sem inventar zero nem dispensar valores nas linhas.
        rodape = Object.fromEntries(CAMPOS_VALOR.filter(k => !vazio(row[c[k]])).map(k => [k, centavos(row[c[k]])]));
        if (!Object.keys(rodape).length) throw new Error('Linha sem identificação nem totais.');
        continue;
      }
      if (rodape) throw new Error('Pagamento encontrado depois do rodapé.');
      const valores = Object.fromEntries(CAMPOS_VALOR.map(k => [k, centavos(row[c[k]])])) as Valores;
      const id = String(row[c.id_baixa] ?? '').trim();
      if (!/^\d+$/.test(id) || (typeof row[c.id_baixa] === 'number' && !Number.isSafeInteger(row[c.id_baixa]))) {
        throw new Error('Id.Baixa ausente ou inválido; não é possível garantir a identificação única.');
      }
      const uf = String(row[c.uf] ?? '').trim().toUpperCase();
      if (!UFS.has(uf)) throw new Error('UF Coren inválida.');
      const linha: Pagamento = {
        id_baixa: id, uf, ...valores,
        data: dataISO(row[c.data]), data_pagamento: dataISO(row[c.data_pagamento]),
        acordo: String(row[c.acordo] ?? '').trim(), parcela: String(row[c.parcela] ?? '').trim(),
        forma: String(row[c.forma] ?? '').trim(), ia: String(row[c.ia] ?? '').trim(),
      };
      if (!linha.acordo || !linha.parcela || !linha.forma) throw new Error('Acordo, parcela ou forma de pagamento ausente.');
      const periodo = normalizar(row[c.periodo]);
      if (periodo.startsWith('pagamento')) modalidades.add('pagamento');
      else if (periodo.startsWith('conciliacao')) modalidades.add('conciliacao');
      somarValores(somaArquivo, valores);
      const anterior = porId.get(id);
      if (anterior) {
        if (JSON.stringify(anterior) !== JSON.stringify(linha)) throw new Error(`Id.Baixa ${id} repetido com dados divergentes.`);
        duplicadas++;
      } else {
        porId.set(id, linha); linhas.push(linha); somarValores(totais, valores);
      }
    } catch (e) {
      throw new Error(`Linha ${i + 1}: ${e instanceof Error ? e.message : 'Dados inválidos.'}`);
    }
  }
  if (!linhas.length) throw new Error('Relatório sem pagamentos.');
  if (modalidades.size > 1) throw new Error('O arquivo mistura pagamento e conciliação.');
  if (rodape) for (const k of CAMPOS_VALOR) {
    if (rodape[k] !== undefined && rodape[k] !== somaArquivo[k]) throw new Error(`A soma de ${k} não confere com o rodapé do arquivo (diferença: ${somaArquivo[k] - rodape[k]} centavos). Nenhum dado foi importado.`);
  }
  const datas = linhas.map(l => l.data).sort();
  const camposConferidos = CAMPOS_VALOR.filter(k => rodape?.[k] !== undefined);
  return { linhas, totais, duplicadas, rodapeConferido: camposConferidos.length === 4, camposConferidos, inicio: datas[0], fim: datas[datas.length - 1], modalidade: [...modalidades][0] ?? null };
}

export function lerArquivo(buffer: ArrayBuffer): RelatorioLido {
  // Manter seriais Excel evita conversões de fuso horário em datas civis.
  const wb = read(buffer, { type: 'array', cellDates: false });
  const candidatas = wb.SheetNames.map(n => utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: null, raw: true }))
    .filter(rows => (rows[0] ?? []).some(v => normalizar(v) === 'idbaixa'));
  if (candidatas.length !== 1) throw new Error('O arquivo deve conter exatamente uma aba do relatório 945.');
  return lerLinhas(candidatas[0]);
}
