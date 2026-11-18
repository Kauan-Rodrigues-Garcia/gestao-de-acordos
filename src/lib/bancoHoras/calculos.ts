/**
 * As contas do Banco de Horas, portadas do painel antigo sem mudar a regra.
 *
 *   * Positivo/negativo é o SALDO DO BANCO inteiro (antes era pelos 3 meses e
 *     as negativas antigas sumiam — Priscila −176h20).
 *   * «Vence no dia 25»: o próximo dia de vencimento com hora positiva a partir
 *     da data do saldo; sem nenhum, o próximo dia 25.
 *   * «Mês em que a hora foi feita» = mês do vencimento − 12. É dedução (o DP
 *     só manda o vencimento), não confirmada pelo DP.
 *   * A mesma matrícula em dois setores conta uma vez: fica o registro com o
 *     saldo mais recente.
 */
import {
  data as fmtData, diaMes, empresaCurta, horas, plural, somaDias, somaMeses, titulo,
} from './formato';
import type { PosicaoBH, Vencimento } from './tipos';

export interface Pessoa {
  /** `empresaCode|matrícula` */
  key: string;
  mat: string;
  nome: string;
  saldo: number;
  em: string | null;
  venc: Vencimento[];
  setor: string;
  /** `empresaCode|setor do DP`, como o vínculo guarda. */
  setorChave: string;
  depto: string;
  empresa: string;
  /** Positivas que já venceram e continuam no saldo. */
  vencidas: number;
  /** Positivas que vencem até o próximo dia de vencimento. */
  vprox: number;
  v60: number;
  v90: number;
  /** Soma dos vencimentos: deveria bater com o saldo. */
  soma: number;
  /** Minutos por mês em que foram feitos (`aaaa-mm`). */
  mes: Record<string, number>;
}

export interface Visao {
  data: string;
  pessoas: Pessoa[];
  dups: { keep: Pessoa; drop: Pessoa }[];
  /** O próximo dia de vencimento. */
  prox: string;
  d60: string;
  d90: string;
  mesAtual: string;
  /** Os 3 últimos meses, do mais antigo ao atual. */
  ult3: string[];
  /** Todos os meses com hora, do mais recente ao mais antigo. */
  meses: string[];
}

export function montarVisao(pos: PosicaoBH): Visao {
  const byKey = new Map<string, Pessoa>();
  const dups: Visao['dups'] = [];
  for (const s of Object.values(pos.setores)) {
    for (const p of s.people) {
      const key = `${s.empresaCode}|${p.mat}`;
      const rec: Pessoa = {
        key, mat: p.mat, nome: titulo(p.nome), saldo: p.saldo, em: p.em,
        venc: [...p.venc].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
        setor: titulo(s.setor), setorChave: `${s.empresaCode}|${s.setor}`,
        depto: s.depto ? titulo(s.depto) : '—', empresa: empresaCurta(s.empresa),
        vencidas: 0, vprox: 0, v60: 0, v90: 0, soma: 0, mes: {},
      };
      const old = byKey.get(key);
      if (old) {
        const keep = (rec.em || '') > (old.em || '') ? rec : old;
        byKey.set(key, keep);
        dups.push({ keep, drop: keep === rec ? old : rec });
      } else byKey.set(key, rec);
    }
  }
  const pessoas = [...byKey.values()];

  let prox: string | null = null;
  for (const p of pessoas) for (const [d, v] of p.venc) if (d >= pos.date && v > 0 && (!prox || d < prox)) prox = d;
  if (!prox) {
    const d = new Date(`${pos.date}T12:00:00`);
    if (d.getDate() > 25) d.setMonth(d.getMonth() + 1);
    d.setDate(25);
    prox = d.toISOString().slice(0, 10);
  }
  const d60 = somaDias(pos.date, 60);
  const d90 = somaDias(pos.date, 90);
  const meses = new Set<string>();
  for (const p of pessoas) {
    for (const [d, v] of p.venc) {
      p.soma += v;
      const feito = somaMeses(d.slice(0, 7), -12);
      p.mes[feito] = (p.mes[feito] || 0) + v;
      meses.add(feito);
      if (v <= 0) continue;
      if (d < pos.date) p.vencidas += v;
      else {
        if (d <= prox) p.vprox += v;
        if (d <= d60) p.v60 += v;
        if (d <= d90) p.v90 += v;
      }
    }
  }
  const mesAtual = pos.date.slice(0, 7);
  return {
    data: pos.date, pessoas, dups, prox, d60, d90, mesAtual,
    ult3: [-2, -1, 0].map(k => somaMeses(mesAtual, k)),
    meses: [...meses].sort().reverse(),
  };
}

// ── Filtro de situação ───────────────────────────────────────────────────────

export type FiltroSituacao = 'todas' | 'pos' | 'neg' | 'vence';

/** Regra do usuário: «Só positivas» não mostra nada negativo, e vice-versa. */
export function passaSituacao(p: Pessoa, sit: FiltroSituacao): boolean {
  if (sit === 'pos') return p.saldo > 0;
  if (sit === 'neg') return p.saldo < 0;
  if (sit === 'vence') return p.vprox > 0;
  return true;
}
export const verPositivas = (sit: FiltroSituacao) => sit !== 'neg';
export const verNegativas = (sit: FiltroSituacao) => sit === 'todas' || sit === 'neg';
export const verVencimento = (sit: FiltroSituacao) => sit === 'todas' || sit === 'vence';

// ── Situação de cada pessoa ──────────────────────────────────────────────────

export type IdGrupo = 'dev' | 'vence' | 'alto' | 'ok' | 'f1' | 'f2' | 'f3';
export type TomGrupo = 'neg' | 'warn' | 'pos' | 'ok';

export interface Grupo {
  id: IdGrupo;
  titulo: string;
  descricao: string;
  tom: TomGrupo;
  /** Intensidade (0–1) para as faixas de quem deve. */
  forca: number;
}

/** Os grupos da tela Situação. Mudam com o filtro: «Só negativas» divide quem deve em faixas. */
export function grupos(v: Visao, sit: FiltroSituacao, limite: number): Grupo[] {
  if (sit === 'neg') {
    return [
      { id: 'f3', titulo: 'Devendo mais de 40h', descricao: 'Prioridade: combinar como repor', tom: 'neg', forca: 1 },
      { id: 'f2', titulo: 'Devendo de 10h a 40h', descricao: 'Acompanhar a reposição', tom: 'neg', forca: 0.7 },
      { id: 'f1', titulo: 'Devendo até 10h', descricao: 'Pouca coisa, repõe rápido', tom: 'neg', forca: 0.45 },
    ];
  }
  const todos: Grupo[] = [
    { id: 'dev', titulo: 'Devendo horas', descricao: 'Saldo negativo: precisa repor', tom: 'neg', forca: 1 },
    { id: 'vence', titulo: `Vence em ${diaMes(v.prox)}`, descricao: `Tem horas que vencem no dia ${fmtData(v.prox)}`, tom: 'warn', forca: 1 },
    { id: 'alto', titulo: `Acima de ${limite}h`, descricao: 'Muita hora guardada: programar folga', tom: 'pos', forca: 1 },
    {
      id: 'ok', titulo: 'Em dia',
      descricao: sit === 'pos' ? `Saldo positivo até ${limite}h` : `Saldo positivo até ${limite}h, nada vencendo`,
      tom: 'ok', forca: 1,
    },
  ];
  if (sit === 'vence') return todos.slice(1, 2);
  if (sit === 'pos') return todos.slice(2);
  return todos;
}

export function grupoDe(p: Pessoa, sit: FiltroSituacao, limite: number): IdGrupo {
  if (sit === 'vence') return 'vence';
  if (p.saldo < 0) {
    const h = -p.saldo / 60;
    return sit === 'neg' ? (h > 40 ? 'f3' : h >= 10 ? 'f2' : 'f1') : 'dev';
  }
  if (p.vprox > 0 && sit !== 'pos') return 'vence';
  if (p.saldo >= limite * 60) return 'alto';
  return 'ok';
}

/** O valor que o grupo mostra: o que vence, para «vence»; o saldo, para o resto. */
export const valorNoGrupo = (id: IdGrupo, p: Pessoa) => (id === 'vence' ? p.vprox : p.saldo);

// ── Totais ───────────────────────────────────────────────────────────────────

export interface Totais {
  positivas: number; nPositivas: number;
  negativas: number; nNegativas: number;
  vence: number; nVence: number;
  acimaLimite: number; nAcimaLimite: number;
}

export function totais(L: Pessoa[], limite: number): Totais {
  const t: Totais = { positivas: 0, nPositivas: 0, negativas: 0, nNegativas: 0, vence: 0, nVence: 0, acimaLimite: 0, nAcimaLimite: 0 };
  for (const p of L) {
    if (p.saldo > 0) { t.positivas += p.saldo; t.nPositivas++; }
    else if (p.saldo < 0) { t.negativas += p.saldo; t.nNegativas++; }
    if (p.vprox > 0) { t.vence += p.vprox; t.nVence++; }
    if (p.saldo >= limite * 60) { t.acimaLimite += p.saldo; t.nAcimaLimite++; }
  }
  return t;
}

export interface SomaMes { pos: number; neg: number; nPos: number; nNeg: number }

export function somaDoMes(L: Pessoa[], m: string): SomaMes {
  const s: SomaMes = { pos: 0, neg: 0, nPos: 0, nNeg: 0 };
  for (const p of L) {
    const v = p.mes[m] || 0;
    if (v > 0) { s.pos += v; s.nPos++; } else if (v < 0) { s.neg += v; s.nNeg++; }
  }
  return s;
}

/** O saldo acumulado no fim do mês `m` (tudo o que foi feito até ele). */
export function acumuladoAte(L: Pessoa[], m: string, sit: FiltroSituacao): number {
  let t = 0;
  for (const p of L) for (const k in p.mes) {
    if (k > m) continue;
    const v = p.mes[k];
    if (sit === 'pos') { if (v > 0) t += v; } else if (sit === 'neg') { if (v < 0) t += v; } else t += v;
  }
  return t;
}

export interface ResumoSetor {
  setor: string;
  setorChave: string;
  depto: string;
  empresa: string;
  n: number;
  nPos: number; bPos: number;
  nNeg: number; bNeg: number;
  saldo: number;
  vprox: number; nV: number;
  grupos: Partial<Record<IdGrupo, number>>;
  mes: Record<string, { pos: number; neg: number }>;
  pessoas: Pessoa[];
}

export function porSetor(L: Pessoa[], meses: string[], sit: FiltroSituacao, limite: number): ResumoSetor[] {
  const m = new Map<string, ResumoSetor>();
  for (const p of L) {
    let s = m.get(p.setor);
    if (!s) {
      s = { setor: p.setor, setorChave: p.setorChave, depto: p.depto, empresa: p.empresa, n: 0, nPos: 0, bPos: 0,
        nNeg: 0, bNeg: 0, saldo: 0, vprox: 0, nV: 0, grupos: {}, mes: {}, pessoas: [] };
      m.set(p.setor, s);
    }
    s.n++; s.saldo += p.saldo; s.pessoas.push(p);
    if (p.saldo > 0) { s.bPos += p.saldo; s.nPos++; } else if (p.saldo < 0) { s.bNeg += p.saldo; s.nNeg++; }
    if (p.vprox > 0) { s.vprox += p.vprox; s.nV++; }
    const g = grupoDe(p, sit, limite);
    s.grupos[g] = (s.grupos[g] || 0) + 1;
    for (const k of meses) {
      const v = p.mes[k] || 0;
      const x = (s.mes[k] ??= { pos: 0, neg: 0 });
      if (v > 0) x.pos += v; else x.neg += v;
    }
  }
  return [...m.values()];
}

/** Ordem natural de setor («Play 2» antes de «Play 10»). */
export const ordemNatural = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

// ── Vencimentos ──────────────────────────────────────────────────────────────

export type Janela = 'prox' | '60' | '90';
export const vencendoNa = (p: Pessoa, j: Janela) => (j === 'prox' ? p.vprox : j === '60' ? p.v60 : p.v90);
export const fimDaJanela = (v: Visao, j: Janela) => (j === 'prox' ? v.prox : j === '60' ? v.d60 : v.d90);

/** Horas positivas por mês de vencimento (para o gráfico de Vencimentos). */
export function porMesDeVencimento(L: Pessoa[], dataSaldo: string) {
  const m = new Map<string, { horas: number; pessoas: number; passou: boolean }>();
  for (const p of L) {
    const meses = new Set<string>();
    for (const [d, v] of p.venc) {
      if (v <= 0) continue;
      const k = d.slice(0, 7);
      const x = m.get(k) ?? { horas: 0, pessoas: 0, passou: d < dataSaldo };
      x.horas += v;
      if (!meses.has(k)) { x.pessoas++; meses.add(k); }
      m.set(k, x);
    }
  }
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([mes, x]) => ({ mes, ...x }));
}

/**
 * «Só o mês» (18/11/2026): as horas positivas que vencem NAQUELE mês, sem somar
 * os meses de antes — o «60/90 dias» acumula tudo até a data. Só vencimento a
 * partir da data do saldo (o que já venceu fica em `vencidas`).
 */
export function vencendoNoMes(p: Pessoa, mes: string, dataSaldo: string): number {
  let t = 0;
  for (const [d, v] of p.venc) if (v > 0 && d >= dataSaldo && d.slice(0, 7) === mes) t += v;
  return t;
}

/**
 * Os meses que ainda vão vencer, tirados de quem está na lista (o setor
 * filtrado), do mais perto ao mais longe. `dia` = a primeira data de
 * vencimento do mês (o DP usa o dia 25).
 */
export function mesesParaVencer(L: Pessoa[], dataSaldo: string) {
  const m = new Map<string, { dia: string; horas: number; pessoas: Set<string> }>();
  for (const p of L) {
    for (const [d, v] of p.venc) {
      if (v <= 0 || d < dataSaldo) continue;
      const k = d.slice(0, 7);
      const x = m.get(k) ?? { dia: d, horas: 0, pessoas: new Set<string>() };
      if (d < x.dia) x.dia = d;
      x.horas += v;
      x.pessoas.add(p.key);
      m.set(k, x);
    }
  }
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([mes, x]) => ({ mes, dia: x.dia, horas: x.horas, pessoas: x.pessoas.size }));
}

// ── Conferência ──────────────────────────────────────────────────────────────

export interface Aviso { tom: 'alerta' | 'info'; titulo: string; linhas: string[] }

export function avisos(
  v: Visao, F: Pessoa[], pos: PosicaoBH, anterior: PosicaoBH | null,
  extra: { semFoto: number; semVinculo: string[] },
): Aviso[] {
  const A: Aviso[] = [];
  const keys = new Set(F.map(p => p.key));
  const dups = v.dups.filter(d => keys.has(d.keep.key));
  if (dups.length) {
    A.push({
      tom: 'alerta', titulo: `${plural(dups.length, 'pessoa aparece', 'pessoas aparecem')} em mais de um setor`,
      linhas: dups.map(d => `${d.keep.nome}: contei o registro de ${d.keep.setor} (${fmtData(d.keep.em)}) e deixei de fora o de ${d.drop.setor} (${fmtData(d.drop.em)}).`),
    });
  }
  const dif = F.filter(p => p.venc.length && p.soma !== p.saldo);
  if (dif.length) {
    A.push({
      tom: 'alerta', titulo: `Saldo diferente da soma dos meses em ${plural(dif.length, 'pessoa', 'pessoas')}`,
      linhas: [
        ...dif.map(p => `${p.nome} (${p.setor}): banco ${horas(p.saldo)}${p.saldo < 0 ? ' devendo' : ''}, os meses somam ${horas(p.soma)}.`),
        'Vale o saldo do banco. Vale pedir ao DP para conferir.',
      ],
    });
  }
  const venc = F.filter(p => p.vencidas > 0);
  if (venc.length) {
    A.push({
      tom: 'alerta',
      titulo: `${plural(venc.length, 'pessoa', 'pessoas')} com ${horas(venc.reduce((s, p) => s + p.vencidas, 0))} já vencidas ainda no saldo`,
      linhas: [venc.slice(0, 15).map(p => p.nome).join(', ') + (venc.length > 15 ? '…' : '.')],
    });
  }
  if (anterior) {
    const agora = new Set(Object.keys(pos.setores));
    const faltam = Object.entries(anterior.setores).filter(([k]) => !agora.has(k)).map(([, s]) => titulo(s.setor));
    if (faltam.length) {
      A.push({
        tom: 'alerta', titulo: `Faltam ${plural(faltam.length, 'setor', 'setores')} do relatório de ${fmtData(anterior.date)}`,
        linhas: [`${faltam.join(', ')}. Se o arquivo vier depois, é só importar.`],
      });
    }
  }
  if (extra.semVinculo.length) {
    A.push({
      tom: 'alerta',
      titulo: plural(extra.semVinculo.length, 'setor do DP sem setor do gestão ligado', 'setores do DP sem setor do gestão ligado'),
      linhas: [`${extra.semVinculo.map(titulo).join(', ')}.`, 'Quem vê só o próprio setor não enxerga esses. Ligue em «Ligar setores».'],
    });
  }
  A.push({
    tom: 'info',
    titulo: `${plural(F.length - extra.semFoto, 'pessoa', 'pessoas')} com foto do gestão, ${extra.semFoto} sem`,
    linhas: ['A foto vem do cadastro do gestão, casada pelo nome. Nome diferente do DP ou repetido no cadastro fica com a inicial.'],
  });
  return A;
}
