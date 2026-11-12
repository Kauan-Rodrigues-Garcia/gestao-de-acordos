/**
 * historicoElite.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A sub-aba «Histórico» do Plantão Elite (05/11/2026): todos os meses desde o
 * início do plantão, com o comparativo dia a dia, preenchido conforme os dias
 * passam.
 *
 * O banco (`fn_elite_plantao_historico`, migration 20261105160000) devolve um
 * item por dia: a dupla que estava de plantão NAQUELE dia (a escala tem
 * histórico — a troca de 01/11 não reescreve os dias antigos), quanto cada um
 * recebeu e o total do setor. Aqui só se agrupa e se compara.
 *
 * A dupla é identificada pelas PESSOAS, não pelo dia: Tiago + Agatha são a
 * mesma dupla no ímpar (até 31/10) e no par (desde 01/11).
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { metaAtingida } from '@/services/fechamentoOperadores/calculoFechamento';
import { primeiroNome, type MembroElite, type Plantao } from './plantaoElite';

// ── Resposta do banco ───────────────────────────────────────────────────────

export interface DiaHistoricoBruto {
  data: string;
  plantao: Plantao;
  membros: { id: string; valor: number; qtd: number }[];
  setor_total: number;
  setor_qtd: number;
}

/**
 * A meta individual do mês e o fechado do mês inteiro (20261111170500). Sem a
 * migration o banco não manda `metas`, e a tela esconde o painel.
 */
export interface MetaMesBruta {
  mes: string;
  id: string;
  meta: number | null;
  extras: unknown;
  fechado: number;
}

export interface RespostaHistoricoElite {
  inicio: string;
  de: string;
  ate: string;
  hoje: string;
  sou_da_dupla: boolean;
  setor: { id: string; nome: string | null } | null;
  /** `foto` desde 20261111170500. */
  pessoas: (MembroElite & { foto?: string | null })[];
  dias: DiaHistoricoBruto[];
  /** Desde 20261111170500; ausente = migration pendente. */
  metas?: MetaMesBruta[] | null;
}

export async function buscarHistoricoElite(empresaId: string): Promise<RespostaHistoricoElite> {
  const { data: r, error } = await rpcSemTipo<RespostaHistoricoElite>('fn_elite_plantao_historico', {
    p_empresa_id: empresaId,
    p_de: null,
    p_ate: null,
  });
  if (error) {
    if (/fn_elite_plantao_historico|schema cache|does not exist/i.test(error.message)) {
      throw new Error('O histórico do Plantão Elite ainda não está no banco (migration 20261105160000).');
    }
    throw new Error(error.message);
  }
  if (!r) throw new Error('O banco não devolveu o histórico do plantão.');
  return {
    ...r,
    pessoas: r.pessoas ?? [],
    metas: Array.isArray(r.metas)
      ? r.metas.map(m => ({
          ...m,
          meta: m.meta == null ? null : Number(m.meta) || null,
          fechado: Number(m.fechado) || 0,
        }))
      : null,
    dias: (r.dias ?? []).map(d => ({
      ...d,
      membros: (d.membros ?? []).map(m => ({ ...m, valor: Number(m.valor) || 0, qtd: Number(m.qtd) || 0 })),
      setor_total: Number(d.setor_total) || 0,
      setor_qtd: Number(d.setor_qtd) || 0,
    })),
  };
}

// ── O modelo ────────────────────────────────────────────────────────────────

export interface DuplaHistorico {
  /** Os ids em ordem alfabética, unidos: a mesma dupla em qualquer dia. */
  chave: string;
  ids: string[];
  /** «Tiago & Agatha», na ordem do quadro. */
  nome: string;
  /** 0, 1, 2… pela ordem em que a dupla aparece: a cor na tela. */
  indice: number;
}

export interface DiaHistorico {
  data: string;
  dia: number;
  mes: string;
  plantao: Plantao;
  dupla: string | null;
  total: number;
  qtd: number;
  porMembro: { id: string; nome: string; valor: number; qtd: number }[];
  setorTotal: number;
  setorQtd: number;
  /** Fatia da dupla no total do setor (0-1); nulo sem setor no dia. */
  participacao: number | null;
  /** Soma da dupla do dia 1 até este, no mês. */
  acumuladoMes: number;
  /** O setor ou a dupla receberam algo: o dia entra na média. */
  comMovimento: boolean;
  hoje: boolean;
}

export interface ResumoDuplaMes {
  chave: string;
  total: number;
  dias: number;
  media: number;
}

/**
 * Uma pessoa no mês, contra a meta individual dela. `degraus` = a 1ª meta e as
 * extras, em ordem (a leitura da Comissão e do Fechamento); `batidas` = quantos
 * degraus o fechado cobre (`metaAtingida`): 0 = nenhuma, nulo = sem meta.
 */
export interface MetaPessoaMes {
  id: string;
  nome: string;
  foto: string | null;
  dupla: DuplaHistorico | null;
  /** O recebido do mês inteiro, todo dia (régua da aba Fechamento). */
  fechado: number;
  /** O que a pessoa trouxe nos próprios dias de plantão, no mês. */
  noPlantao: number;
  degraus: number[];
  batidas: number | null;
  /** fechado ÷ 1ª meta (fração); nulo sem meta. */
  alcance: number | null;
  /** A próxima meta ainda não batida e quanto falta; nulo se bateu todas ou sem meta. */
  proxima: { nivel: number; valor: number; falta: number } | null;
}

export interface MesHistorico {
  mes: string;
  diasNoMes: number;
  /** `dias[d - 1]` é o dia `d`; nulo antes do início do plantão ou no futuro. */
  dias: (DiaHistorico | null)[];
  total: number;
  setorTotal: number;
  participacao: number | null;
  diasComMovimento: number;
  media: number;
  melhor: DiaHistorico | null;
  porDupla: ResumoDuplaMes[];
  emAndamento: boolean;
  /** Nulo = o banco ainda não manda as metas (migration 20261111170500). */
  metas: MetaPessoaMes[] | null;
}

export interface RitmoDoMes {
  /** O dia de hoje no mês: a comparação vai do dia 1 até ele. */
  ateODia: number;
  mes: string;
  atual: number;
  mesAnterior: string;
  anterior: number;
  /** Variação contra o mês anterior até o mesmo dia; nulo se o anterior foi zero. */
  variacao: number | null;
}

export interface PessoaHistorico {
  id: string;
  nome: string;
  total: number;
  dias: number;
  media: number;
}

export interface HistoricoElite {
  inicio: string;
  /** id → foto (`foto_url`); vazio sem a migration 20261111170500. */
  fotos: Map<string, string>;
  /** «Receptivo»: o setor das Elites. */
  setorNome: string;
  duplas: DuplaHistorico[];
  meses: MesHistorico[];
  total: number;
  setorTotal: number;
  diasComMovimento: number;
  media: number;
  melhor: DiaHistorico | null;
  porPessoa: PessoaHistorico[];
  ritmo: RitmoDoMes | null;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/** `metas.metas_extras` → os valores positivos (a leitura de `lerMetasExtras`, da Comissão). */
function lerExtras(valor: unknown): number[] {
  return (Array.isArray(valor) ? valor : []).map(v => Number(v) || 0).filter(v => v > 0);
}

/** Dias do mês `yyyy-MM`. */
export function diasNoMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** O mês anterior a `yyyy-MM`. */
export function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

export function montarHistoricoElite(r: RespostaHistoricoElite): HistoricoElite {
  const nomes = new Map(r.pessoas.map(p => [p.id, p.nome]));
  const nomeDe = (id: string) => nomes.get(id) ?? '—';

  const duplas = new Map<string, DuplaHistorico>();
  const duplaDe = (ids: string[]): string | null => {
    if (!ids.length) return null;
    const chave = [...ids].sort().join('+');
    if (!duplas.has(chave)) {
      duplas.set(chave, {
        chave, ids,
        nome: ids.map(id => primeiroNome(nomeDe(id))).join(' & '),
        indice: duplas.size,
      });
    }
    return chave;
  };

  const meses = new Map<string, MesHistorico>();
  const mesDe = (mes: string): MesHistorico => {
    let m = meses.get(mes);
    if (!m) {
      const n = diasNoMes(mes);
      m = {
        mes, diasNoMes: n, dias: new Array<DiaHistorico | null>(n).fill(null),
        total: 0, setorTotal: 0, participacao: null, diasComMovimento: 0, media: 0,
        melhor: null, porDupla: [], emAndamento: mes === r.hoje.slice(0, 7), metas: null,
      };
      meses.set(mes, m);
    }
    return m;
  };

  const pessoas = new Map<string, PessoaHistorico>();
  const acumulado = new Map<string, number>();

  for (const d of r.dias) {
    const mes = d.data.slice(0, 7);
    const total = centavos(d.membros.reduce((s, x) => s + x.valor, 0));
    const comMovimento = total > 0 || d.setor_total > 0;
    const acc = centavos((acumulado.get(mes) ?? 0) + total);
    acumulado.set(mes, acc);

    const dia: DiaHistorico = {
      data: d.data,
      dia: Number(d.data.slice(8, 10)),
      mes,
      plantao: d.plantao,
      dupla: duplaDe(d.membros.map(x => x.id)),
      total,
      qtd: d.membros.reduce((s, x) => s + x.qtd, 0),
      porMembro: d.membros.map(x => ({ id: x.id, nome: nomeDe(x.id), valor: centavos(x.valor), qtd: x.qtd })),
      setorTotal: centavos(d.setor_total),
      setorQtd: d.setor_qtd,
      participacao: d.setor_total > 0 ? total / d.setor_total : null,
      acumuladoMes: acc,
      comMovimento,
      hoje: d.data === r.hoje,
    };

    const m = mesDe(mes);
    m.dias[dia.dia - 1] = dia;
    m.total = centavos(m.total + total);
    m.setorTotal = centavos(m.setorTotal + dia.setorTotal);
    if (comMovimento) m.diasComMovimento += 1;
    if (total > 0 && (!m.melhor || total > m.melhor.total)) m.melhor = dia;

    if (dia.dupla) {
      let pd = m.porDupla.find(x => x.chave === dia.dupla);
      if (!pd) { pd = { chave: dia.dupla, total: 0, dias: 0, media: 0 }; m.porDupla.push(pd); }
      pd.total = centavos(pd.total + total);
      if (comMovimento) pd.dias += 1;
    }

    for (const x of dia.porMembro) {
      let p = pessoas.get(x.id);
      if (!p) { p = { id: x.id, nome: x.nome, total: 0, dias: 0, media: 0 }; pessoas.set(x.id, p); }
      p.total = centavos(p.total + x.valor);
      if (comMovimento) p.dias += 1;
    }
  }

  const lista = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  for (const m of lista) {
    m.media = m.diasComMovimento > 0 ? centavos(m.total / m.diasComMovimento) : 0;
    m.participacao = m.setorTotal > 0 ? m.total / m.setorTotal : null;
    for (const pd of m.porDupla) pd.media = pd.dias > 0 ? centavos(pd.total / pd.dias) : 0;
    m.porDupla.sort((a, b) => (duplas.get(a.chave)?.indice ?? 0) - (duplas.get(b.chave)?.indice ?? 0));
  }

  const fotos = new Map<string, string>();
  for (const p of r.pessoas) if (p.foto) fotos.set(p.id, p.foto);

  if (Array.isArray(r.metas)) {
    const listaDuplas = [...duplas.values()];
    for (const m of lista) {
      const doMes = r.metas.filter(x => x.mes === m.mes);
      m.metas = metasDoMes(m, doMes, listaDuplas, nomeDe, fotos);
    }
  }

  const total = centavos(lista.reduce((s, m) => s + m.total, 0));
  const diasComMovimento = lista.reduce((s, m) => s + m.diasComMovimento, 0);
  const melhor = lista.reduce<DiaHistorico | null>(
    (best, m) => (m.melhor && (!best || m.melhor.total > best.total) ? m.melhor : best), null);

  const porPessoa = [...pessoas.values()]
    .map(p => ({ ...p, media: p.dias > 0 ? centavos(p.total / p.dias) : 0 }))
    .sort((a, b) => b.total - a.total);

  return {
    inicio: r.inicio,
    fotos,
    setorNome: r.setor?.nome ?? 'Setor',
    duplas: [...duplas.values()],
    meses: lista,
    total,
    setorTotal: centavos(lista.reduce((s, m) => s + m.setorTotal, 0)),
    diasComMovimento,
    media: diasComMovimento > 0 ? centavos(total / diasComMovimento) : 0,
    melhor,
    porPessoa,
    ritmo: ritmoDoMes(lista, r.hoje),
  };
}

/**
 * O mês de hoje contra o anterior, do dia 1 até o mesmo dia — a pergunta de
 * todo dia: «estamos à frente ou atrás do mês passado?». O mês anterior mais
 * curto (30 contra 31) compara até o último dia dele.
 */
export function ritmoDoMes(meses: MesHistorico[], hoje: string): RitmoDoMes | null {
  const mesHoje = hoje.slice(0, 7);
  const atual = meses.find(m => m.mes === mesHoje);
  const ant = meses.find(m => m.mes === mesAnterior(mesHoje));
  if (!atual || !ant) return null;
  const ateODia = Number(hoje.slice(8, 10));
  const somaAte = (m: MesHistorico, dia: number) =>
    centavos(m.dias.slice(0, Math.min(dia, m.diasNoMes)).reduce((s, d) => s + (d?.total ?? 0), 0));
  const a = somaAte(atual, ateODia);
  const b = somaAte(ant, ateODia);
  return {
    ateODia, mes: atual.mes, atual: a, mesAnterior: ant.mes, anterior: b,
    variacao: b > 0 ? (a - b) / b : null,
  };
}

export interface ComparacaoMedia {
  mesAnterior: string;
  media: number;
  mediaAnterior: number;
  /** Variação da média por plantão; nulo se o anterior não teve plantão. */
  variacao: number | null;
}

/**
 * A média por plantão do mês contra a do mês anterior. Média, e não total: o
 * primeiro mês começou no meio (19/09) e o de hoje ainda não acabou — o total
 * puniria os dois, a média não.
 */
export function compararMedia(meses: MesHistorico[], mes: string): ComparacaoMedia | null {
  const atual = meses.find(m => m.mes === mes);
  const ant = meses.find(m => m.mes === mesAnterior(mes));
  if (!atual || !ant || atual.diasComMovimento === 0) return null;
  return {
    mesAnterior: ant.mes,
    media: atual.media,
    mediaAnterior: ant.media,
    variacao: ant.media > 0 ? (atual.media - ant.media) / ant.media : null,
  };
}

/** As barras do mês: um item por dia do mês, vazio no que ainda não veio. */
export interface BarraDoDia {
  dia: number;
  total: number | null;
  dupla: string | null;
  info: DiaHistorico | null;
}

export function barrasDoMes(m: MesHistorico): BarraDoDia[] {
  return m.dias.map((d, i) => ({ dia: i + 1, total: d ? d.total : null, dupla: d?.dupla ?? null, info: d }));
}

/**
 * As linhas do comparativo: do dia 1 ao 31, quanto cada mês já somava. Antes
 * do primeiro dia com dado (o plantão começou em 19/09) e depois do último (o
 * mês de hoje, o dia 31 que não existe) fica vazio — a linha começa e para ali.
 * Entre um e outro, o dia sem dado repete a soma do anterior: quem é de dupla
 * só recebe os próprios dias, e sem isso a linha se partiria em pontos.
 */
export function acumuladoPorDia(meses: MesHistorico[]): Array<{ dia: number } & Record<string, number | null>> {
  const linhas = Array.from({ length: 31 }, (_, i) => ({ dia: i + 1 }) as { dia: number } & Record<string, number | null>);
  for (const m of meses) {
    const primeiro = m.dias.findIndex(d => d != null);
    let ultimo = -1;
    m.dias.forEach((d, i) => { if (d) ultimo = i; });
    let soma: number | null = null;
    for (let i = 0; i < 31; i += 1) {
      if (primeiro >= 0 && i >= primeiro && i <= ultimo) soma = m.dias[i]?.acumuladoMes ?? soma;
      linhas[i][m.mes] = primeiro >= 0 && i >= primeiro && i <= ultimo ? soma : null;
    }
  }
  return linhas;
}

/** Cada pessoa no mês: total, plantões e média. Maior primeiro. */
export function pessoasDoMes(m: MesHistorico, duplas: DuplaHistorico[]): (PessoaHistorico & { dupla: DuplaHistorico | null })[] {
  const porId = new Map<string, PessoaHistorico & { dupla: DuplaHistorico | null }>();
  for (const d of m.dias) {
    if (!d) continue;
    for (const p of d.porMembro) {
      let x = porId.get(p.id);
      if (!x) {
        x = { id: p.id, nome: p.nome, total: 0, dias: 0, media: 0, dupla: duplas.find(du => du.chave === d.dupla) ?? null };
        porId.set(p.id, x);
      }
      x.total = centavos(x.total + p.valor);
      if (d.comMovimento) x.dias += 1;
    }
  }
  return [...porId.values()]
    .map(x => ({ ...x, media: x.dias > 0 ? centavos(x.total / x.dias) : 0 }))
    .sort((a, b) => b.total - a.total);
}

/**
 * O painel das metas de um mês: cada pessoa com o fechado do mês, a meta e as
 * extras, quantas bateu e quanto falta para a próxima. Quem bateu mais metas
 * vem primeiro; empate, quem foi mais longe na 1ª meta; sem meta, por último.
 */
export function metasDoMes(
  m: MesHistorico,
  brutas: readonly MetaMesBruta[],
  duplas: readonly DuplaHistorico[],
  nomeDe: (id: string) => string,
  fotos: ReadonlyMap<string, string>,
): MetaPessoaMes[] {
  const noPlantao = new Map<string, number>();
  const duplaDe = new Map<string, DuplaHistorico | null>();
  for (const d of m.dias) {
    if (!d) continue;
    for (const p of d.porMembro) {
      noPlantao.set(p.id, centavos((noPlantao.get(p.id) ?? 0) + p.valor));
      if (!duplaDe.has(p.id)) duplaDe.set(p.id, duplas.find(du => du.chave === d.dupla) ?? null);
    }
  }

  return brutas
    .map(b => {
      const meta = Number(b.meta) || 0;
      const degraus = meta > 0
        ? [meta, ...lerExtras(b.extras).sort((x, y) => x - y)]
        : [];
      const fechado = centavos(Number(b.fechado) || 0);
      const batidas = metaAtingida(fechado, meta > 0 ? meta : null, degraus.slice(1));
      const nivel = batidas ?? 0;
      const proxima = meta > 0 && nivel < degraus.length
        ? { nivel: nivel + 1, valor: degraus[nivel], falta: centavos(degraus[nivel] - fechado) }
        : null;
      return {
        id: b.id,
        nome: nomeDe(b.id),
        foto: fotos.get(b.id) ?? null,
        dupla: duplaDe.get(b.id) ?? null,
        fechado,
        noPlantao: noPlantao.get(b.id) ?? 0,
        degraus,
        batidas,
        alcance: meta > 0 ? fechado / meta : null,
        proxima,
      };
    })
    .sort((a, b) =>
      (b.batidas ?? -1) - (a.batidas ?? -1)
      || (b.alcance ?? -1) - (a.alcance ?? -1)
      || b.fechado - a.fechado
      || a.nome.localeCompare(b.nome));
}

/** «set/26». */
export function rotuloMesCurto(mes: string): string {
  const s = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(new Date(`${mes}-15T12:00:00Z`)).replace('.', '');
  return `${s}/${mes.slice(2, 4)}`;
}

/** «Setembro de 2026». */
export function rotuloMesLongo(mes: string): string {
  const s = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${mes}-15T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
