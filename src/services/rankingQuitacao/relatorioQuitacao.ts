/**
 * relatorioQuitacao.ts — lê o relatório mensal de parcelas pagas do ERP (ex.:
 * SETEMBRO.xls, aba «Informações») e devolve os acordos QUITADOS NO MÊS, que
 * alimentam o Ranking de quitação.
 *
 * O critério (análise de setembro, 06/10/2026):
 *
 *   - «Situação Atual» = Quitação. «Situação» não serve: é o tipo do acordo na
 *     criação (924 linhas de setembro diziam Quitação ali, só 247 quitaram);
 *   - «Data da quitação» dentro do mês do arquivo. «Situação Atual» é a foto do
 *     dia da extração, então o relatório de setembro traz acordos que quitaram
 *     em outubro — esses entram pelo relatório de outubro;
 *   - um acordo conta UMA vez (Cód. Acordo), com o «Valor Acordo» — o arquivo
 *     tem uma linha por parcela paga.
 *
 * O mês do arquivo é o mês da maioria das «Dt. Pgto» (o relatório é de um mês
 * de pagamentos; data zerada do ERP, 30/12/1899, não conta).
 *
 * Puro — a leitura do arquivo (`lerRelatorioQuitacao`) carrega o xlsx só na
 * hora, como os outros importadores.
 */
import { norm, toDate } from '@/services/analitico/analiticoComum';

export interface AcordoQuitado {
  cod_acordo: string;
  operador_usuario: string;
  valor_acordo: number;
  /** `AAAA-MM-DD`. */
  data_quitacao: string;
}

export interface RelatorioQuitacao {
  /** Primeiro dia do mês do arquivo, `AAAA-MM-01`; `null` se não deu para saber. */
  mes: string | null;
  acordos: AcordoQuitado[];
  /** Linhas de parcela lidas (o arquivo inteiro, sem cabeçalho). */
  linhasLidas: number;
  /** Acordos quitados, mas em outro mês — ficam para o relatório daquele mês. */
  quitadosForaDoMes: number;
  erros: string[];
}

const COLUNAS = {
  codAcordo: 'cod.acordo',
  operador: 'operador',
  dtPgto: 'dt.pgto',
  situacaoAtual: 'situacaoatual',
  valorAcordo: 'valoracordo',
  dataQuitacao: 'datadaquitacao',
} as const;

const ROTULOS: Record<keyof typeof COLUNAS, string> = {
  codAcordo: 'Cód. Acordo', operador: 'Operador', dtPgto: 'Dt. Pgto',
  situacaoAtual: 'Situação Atual', valorAcordo: 'Valor Acordo', dataQuitacao: 'Data da quitação',
};

const iso =(d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null || v === '') return null;
  const s = String(v).trim().replace(/[R$\s]/g, '');
  // «1.234,56» (pt-BR) ou «1234.56».
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}

/** O mês da maioria das datas de pagamento, `AAAA-MM-01`. */
function mesDoArquivo(datas: (Date | null)[]): string | null {
  const conta = new Map<string, number>();
  for (const d of datas) {
    if (!d || d.getFullYear() < 2000) continue;
    const m = iso(d).slice(0, 7) + '-01';
    conta.set(m, (conta.get(m) ?? 0) + 1);
  }
  let melhor: string | null = null;
  for (const [m, n] of conta) if (!melhor || n > conta.get(melhor)!) melhor = m;
  return melhor;
}

export function extrairQuitacoes(rows: unknown[][]): RelatorioQuitacao {
  const vazio = (erro: string): RelatorioQuitacao => ({ mes: null, acordos: [], linhasLidas: 0, quitadosForaDoMes: 0, erros: [erro] });
  if (rows.length < 2) return vazio('Planilha sem dados.');

  const cab = (rows[0] ?? []).map(norm);
  const idx = Object.fromEntries(Object.entries(COLUNAS).map(([k, nome]) => [k, cab.indexOf(nome)])) as Record<keyof typeof COLUNAS, number>;
  const faltando = (Object.keys(COLUNAS) as (keyof typeof COLUNAS)[]).filter(k => idx[k] < 0);
  if (faltando.length) {
    return vazio(
      'Este não parece o relatório mensal de parcelas pagas: faltam as colunas ' +
      faltando.map(k => `«${ROTULOS[k]}»`).join(', ') + '.',
    );
  }

  const linhas = rows.slice(1).filter(r => r && r.some(c => c != null && c !== ''));
  const mes = mesDoArquivo(linhas.map(r => toDate(r[idx.dtPgto])));
  if (!mes) return { ...vazio('Não foi possível saber o mês do relatório pela coluna «Dt. Pgto».'), linhasLidas: linhas.length };

  const porAcordo = new Map<string, AcordoQuitado>();
  const foraDoMes = new Set<string>();
  for (const r of linhas) {
    if (norm(r[idx.situacaoAtual]) !== 'quitacao') continue;
    const cod = String(r[idx.codAcordo] ?? '').trim();
    const operador = String(r[idx.operador] ?? '').trim();
    const valor = numero(r[idx.valorAcordo]);
    const quitou = toDate(r[idx.dataQuitacao]);
    if (!cod || !operador || valor == null || !quitou) continue;
    const dia = iso(quitou);
    if (dia.slice(0, 7) !== mes.slice(0, 7)) { foraDoMes.add(cod); continue; }
    if (!porAcordo.has(cod)) porAcordo.set(cod, { cod_acordo: cod, operador_usuario: operador, valor_acordo: valor, data_quitacao: dia });
  }

  return { mes, acordos: [...porAcordo.values()], linhasLidas: linhas.length, quitadosForaDoMes: foraDoMes.size, erros: [] };
}

/** Lê o arquivo do ERP. Carrega o xlsx só aqui (~484 KB): a aba em si não precisa dele. */
export async function lerRelatorioQuitacao(arquivo: File): Promise<RelatorioQuitacao> {
  const { read, utils } = await import('@e965/xlsx');
  const wb = read(await arquivo.arrayBuffer(), { cellDates: true });
  const nome = wb.SheetNames.find(n => norm(n) === 'informacoes') ?? wb.SheetNames[0];
  const ws = nome ? wb.Sheets[nome] : undefined;
  if (!ws) return { mes: null, acordos: [], linhasLidas: 0, quitadosForaDoMes: 0, erros: ['Planilha vazia ou inválida.'] };
  return extrairQuitacoes(utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]);
}

/** Por operador (login do relatório), para a prévia da importação. Por valor, desempate pela quantidade. */
export function resumoPorOperador(acordos: AcordoQuitado[]): { operador: string; quitacoes: number; valor: number }[] {
  const m = new Map<string, { operador: string; quitacoes: number; valor: number }>();
  for (const a of acordos) {
    const atual = m.get(a.operador_usuario) ?? { operador: a.operador_usuario, quitacoes: 0, valor: 0 };
    atual.quitacoes += 1;
    atual.valor += a.valor_acordo;
    m.set(a.operador_usuario, atual);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor || b.quitacoes - a.quitacoes);
}
