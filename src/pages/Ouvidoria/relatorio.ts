/**
 * relatorio.ts — as contas da aba «Relatório» da Ouvidoria, sem React.
 *
 * O período filtra pela data da manifestação. «Abertas agora» e «em alerta»
 * são retrato de hoje (não dependem do período). Tempo até o retorno em dias
 * úteis (`diasUteis.ts`), só das que tiveram retorno.
 */
import { diasUteisEntre } from './diasUteis';
import {
  ASSUNTOS, CANAIS, DIAS_ALERTA, STATUS, estaAberta, type Manifestacao,
} from './ouvidoria';

export type Periodo = 'mes' | 'mes_passado' | '90d' | 'ano' | 'tudo';

export const PERIODOS: readonly { valor: Periodo; rotulo: string }[] = [
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'mes_passado', rotulo: 'Mês passado' },
  { valor: '90d', rotulo: 'Últimos 90 dias' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'tudo', rotulo: 'Tudo' },
];

/** O intervalo [de, ate] (ISO) do período; `null` = sem limite. */
export function intervaloDe(p: Periodo, hojeIso: string): { de: string | null; ate: string | null } {
  const [a, m] = [+hojeIso.slice(0, 4), +hojeIso.slice(5, 7)];
  const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  if (p === 'mes') return { de: `${a}-${pad(m)}-01`, ate: hojeIso };
  if (p === 'mes_passado') {
    const [aa, mm] = m === 1 ? [a - 1, 12] : [a, m - 1];
    return { de: `${aa}-${pad(mm)}-01`, ate: `${aa}-${pad(mm)}-${pad(ultimoDia(aa, mm))}` };
  }
  if (p === '90d') {
    const d = new Date(`${hojeIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 89);
    return { de: d.toISOString().slice(0, 10), ate: hojeIso };
  }
  if (p === 'ano') return { de: `${a}-01-01`, ate: hojeIso };
  return { de: null, ate: null };
}

export interface Fatia { chave: string; rotulo: string; valor: number }

export interface Relatorio {
  registradas: number;
  acompanhadas: number;
  concluidas: number;
  comRetorno: number;
  /** % das acompanhadas do período que tiveram retorno (0–100), ou null sem acompanhadas. */
  taxaRetorno: number | null;
  /** Média de dias úteis da manifestação ao retorno, ou null sem retorno. */
  mediaDiasRetorno: number | null;
  abertasAgora: number;
  emAlertaAgora: number;
  ticketsPendentes: number;
  porMes: Fatia[];
  porAssunto: Fatia[];
  porCanal: Fatia[];
  porStatusAbertas: Fatia[];
  porQuemRegistrou: Fatia[];
  porEncaminhado: Fatia[];
}

const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function contar<T>(lista: readonly T[], chave: (x: T) => string | null, rotulo: (k: string) => string): Fatia[] {
  const mapa = new Map<string, number>();
  for (const x of lista) {
    const k = chave(x);
    if (k) mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return [...mapa.entries()].map(([k, v]) => ({ chave: k, rotulo: rotulo(k), valor: v }))
    .sort((a, b) => b.valor - a.valor || a.rotulo.localeCompare(b.rotulo));
}

/** Os últimos `n` meses até o de hoje, com zero onde não houve nada. */
function ultimosMeses(lista: readonly Manifestacao[], hojeIso: string, n: number): Fatia[] {
  const r: Fatia[] = [];
  let [a, m] = [+hojeIso.slice(0, 4), +hojeIso.slice(5, 7)];
  for (let i = 0; i < n; i += 1) {
    const chave = `${a}-${String(m).padStart(2, '0')}`;
    r.unshift({ chave, rotulo: `${NOMES_MES[m - 1]}/${String(a).slice(2)}`, valor: 0 });
    m -= 1;
    if (m === 0) { m = 12; a -= 1; }
  }
  const idx = new Map(r.map((f, i) => [f.chave, i]));
  for (const x of lista) {
    const i = idx.get(x.data_manifestacao.slice(0, 7));
    if (i !== undefined) r[i].valor += 1;
  }
  return r;
}

export function relatorio(todas: readonly Manifestacao[], periodo: Periodo, hojeIso: string): Relatorio {
  const { de, ate } = intervaloDe(periodo, hojeIso);
  const lista = todas.filter(m => (!de || m.data_manifestacao >= de) && (!ate || m.data_manifestacao <= ate));
  const acompanhadas = lista.filter(m => m.acompanhar);
  const comRetorno = lista.filter(m => m.data_resposta);
  const dias = comRetorno.map(m => diasUteisEntre(m.data_manifestacao, m.data_resposta!));
  const abertas = todas.filter(m => m.acompanhar && estaAberta(m));
  const rotuloA = (k: string) => ASSUNTOS.find(x => x.valor === k)?.rotulo ?? k;
  const rotuloC = (k: string) => CANAIS.find(x => x.valor === k)?.rotulo ?? k;

  return {
    registradas: lista.length,
    acompanhadas: acompanhadas.length,
    concluidas: acompanhadas.filter(m => m.status === 'concluido').length,
    comRetorno: comRetorno.length,
    taxaRetorno: acompanhadas.length
      ? Math.round((acompanhadas.filter(m => m.data_resposta).length / acompanhadas.length) * 100) : null,
    mediaDiasRetorno: dias.length ? Math.round((dias.reduce((s, d) => s + d, 0) / dias.length) * 10) / 10 : null,
    abertasAgora: abertas.length,
    emAlertaAgora: abertas.filter(m => diasUteisEntre(m.data_manifestacao, hojeIso) >= DIAS_ALERTA).length,
    ticketsPendentes: todas.filter(m => m.ticket_status === 'pendente').length,
    porMes: ultimosMeses(todas, hojeIso, 6),
    porAssunto: contar(lista, m => m.assunto, rotuloA),
    porCanal: contar(lista, m => m.canal, rotuloC),
    // A ordem do caminho de um caso, não a do tamanho.
    porStatusAbertas: STATUS.filter(s => s.valor !== 'concluido')
      .map(s => ({ chave: s.valor, rotulo: s.rotulo, valor: abertas.filter(m => m.status === s.valor).length })),
    porQuemRegistrou: contar(lista, m => m.criado_por_nome, k => k),
    porEncaminhado: contar(lista.filter(m => m.responsavel_id && m.responsavel_id !== m.criado_por),
      m => m.responsavel_nome, k => k),
  };
}
