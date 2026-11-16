/**
 * As contas e os formatos do Desafio Cobrança — puros, sem banco.
 * O dinheiro já chega somado (`fn_desafio_cobranca_atual`); aqui só se decide
 * o dia, o ponto do dia e a curva hora a hora do super_admin.
 */
import type { AjusteCobranca, FonteDoPlacar, LeituraPorSetor, PlacarCobranca, SetorDoDesafio, GrupoDoDia } from './desafioCobranca.service';

/** A parte de cada dia (o ponteiro anda um terço por dia num desafio de 3). */
export const metaDoDia = (p: Pick<PlacarCobranca, 'meta_geral' | 'dias'>) =>
  p.dias.length ? Math.round(p.meta_geral / p.dias.length / 1000) * 1000 : p.meta_geral;

/** Onde o ponteiro precisa estar no fim do dia `i` (0 = o primeiro). */
export function esperadoAteODia(p: Pick<PlacarCobranca, 'meta_geral' | 'dias'>, i: number): number {
  return i >= p.dias.length - 1 ? p.meta_geral : metaDoDia(p) * (i + 1);
}

/** O dia de hoje (YYYY-MM-DD) em São Paulo. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

/**
 * Qual dia do desafio é hoje. Antes do primeiro: 0 (a prévia mostra o 1º).
 * Depois do último: o último. `fase` diz qual dos três é.
 */
export function diaDoDesafio(dias: readonly string[], hoje: string): { indice: number; fase: 'antes' | 'durante' | 'depois' } {
  if (!dias.length) return { indice: 0, fase: 'antes' };
  const i = dias.indexOf(hoje);
  if (i >= 0) return { indice: i, fase: 'durante' };
  if (hoje < dias[0]) return { indice: 0, fase: 'antes' };
  if (hoje > dias[dias.length - 1]) return { indice: dias.length - 1, fase: 'depois' };
  // Um buraco no meio (fim de semana fora dos dias): o último que já passou.
  const passou = dias.filter(d => d < hoje).length;
  return { indice: Math.max(0, passou - 1), fase: 'durante' };
}

/** O ajuste vale no instante `t` (lançado antes, e não removido até lá). */
function ajusteValeEm(a: AjusteCobranca, t: string, somam: ReadonlySet<string>): boolean {
  if (a.setor_id && !somam.has(a.setor_id)) return false;
  if (a.criado_em > t) return false;
  return !a.removido_em || a.removido_em > t;
}

/**
 * Placar manual (16/11/2026): o dia vale o lançamento MAIS NOVO dos que valem —
 * lançar de novo substitui, não soma. Os anteriores ficam só no histórico.
 * Mesma regra de `fn_desafio_cobranca_montar` (migration 20261116230000).
 */
export function ultimoLancamentoPorDia<T extends Pick<AjusteCobranca, 'dia' | 'criado_em' | 'removido_em' | 'id'>>(
  ajustes: readonly T[],
): Map<string, T> {
  const tempo = (iso: string) => new Date(iso).getTime();
  const porDia = new Map<string, T>();
  // Quem chama já filtrou os válidos (na curva, «válido naquele instante»).
  for (const a of ajustes) {
    const atual = porDia.get(a.dia);
    if (!atual || tempo(a.criado_em) > tempo(atual.criado_em)
      || (tempo(a.criado_em) === tempo(atual.criado_em) && a.id > atual.id)) porDia.set(a.dia, a);
  }
  return porDia;
}

/** O que os lançamentos dão no placar: manual = último de cada dia; 59 = soma. */
export function valorDosLancamentos(ajustes: readonly AjusteCobranca[], fonte: FonteDoPlacar, dia?: string): number {
  const validos = ajustes.filter(a => !a.removido_em && (!dia || a.dia === dia));
  if (fonte === 'manual') return [...ultimoLancamentoPorDia(validos).values()].reduce((s, a) => s + a.valor, 0);
  return validos.reduce((s, a) => s + a.valor, 0);
}

export interface PontoDaHora { lido_em: string; total: number; dia: number }

/**
 * A curva hora a hora: em cada retrato do 59, quanto o desafio somava (todos
 * os dias) e quanto o dia `dia` somava. Só setor que soma; ajuste entra a
 * partir da hora em que foi lançado.
 */
export function curvaHoraAHora(entrada: {
  leituras: readonly string[];
  horas: readonly LeituraPorSetor[];
  ajustes: readonly AjusteCobranca[];
  setores: readonly SetorDoDesafio[];
  /** Grupos sem setor que somam (cod). */
  avulsos?: readonly string[];
  /** 'manual': a curva é a dos lançamentos (um ponto por lançamento ou remoção); o 59 não entra. */
  fonte?: FonteDoPlacar;
  dia: string;
}): PontoDaHora[] {
  const somam = new Set(entrada.setores.filter(s => s.soma).map(s => s.setor_id));
  const avulsos = new Set(entrada.avulsos ?? []);
  const iso = (t: string) => new Date(t).toISOString();
  const normal = entrada.ajustes.map(a => ({ ...a, criado_em: iso(a.criado_em), removido_em: a.removido_em ? iso(a.removido_em) : null }));

  if (entrada.fonte === 'manual') {
    const instantes = [...new Set(normal.flatMap(a => (a.removido_em ? [a.criado_em, a.removido_em] : [a.criado_em])))].sort();
    return instantes.map(t => {
      const aj = normal.filter(a => ajusteValeEm(a, t, somam));
      const porDia = ultimoLancamentoPorDia(aj);
      return {
        lido_em: t,
        total: [...porDia.values()].reduce((s, a) => s + a.valor, 0),
        dia: porDia.get(entrada.dia)?.valor ?? 0,
      };
    });
  }

  const porHora = new Map<string, LeituraPorSetor[]>();
  for (const h of entrada.horas) {
    const lista = porHora.get(h.lido_em) ?? [];
    lista.push(h);
    porHora.set(h.lido_em, lista);
  }
  const tempo = (iso: string) => new Date(iso).getTime();
  return [...new Set(entrada.leituras)]
    .sort((a, b) => tempo(a) - tempo(b))
    .map(t => {
      const linhas = (porHora.get(t) ?? []).filter(h =>
        h.setor_id ? somam.has(h.setor_id) : !!h.cod && avulsos.has(h.cod));
      const aj = normal.filter(a => ajusteValeEm(a, iso(t), somam));
      const total = linhas.reduce((s, h) => s + h.valor, 0) + aj.reduce((s, a) => s + a.valor, 0);
      const dia = linhas.filter(h => h.dia === entrada.dia).reduce((s, h) => s + h.valor, 0)
        + aj.filter(a => a.dia === entrada.dia).reduce((s, a) => s + a.valor, 0);
      return { lido_em: t, total, dia };
    });
}

/** A hora cheia (0–23) de um instante, em São Paulo. */
export function horaEmSaoPaulo(iso: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date(iso))) % 24;
}

/**
 * O robô sobe o 59 de hora em hora (ex.: 09:10, 10:07, 11:07, 12:16). Uma hora
 * sem retrato NÃO perde dinheiro — o retrato seguinte traz tudo o que tem data
 * do dia —, mas some do hora a hora. Esta conta diz quais horas faltaram, para
 * a tela mostrar o buraco em vez de pular calada.
 *
 * Conta da 1ª hora com retrato até: a hora de agora, se o dia é hoje e já
 * passou da meia hora (o robô às vezes chega 16 min depois); senão, a anterior.
 * Em dia que já acabou, até a última hora com retrato. Nunca passa das 18h.
 */
export function horasSemRetrato(retratos: readonly string[], dia: string, agora: Date = new Date()): number[] {
  const doDia = retratos.filter(t => hojeEmSaoPaulo(new Date(t)) === dia);
  if (!doDia.length) return [];
  const horas = new Set(doDia.map(horaEmSaoPaulo));
  const primeira = Math.min(...horas);
  let ultima = Math.max(...horas);
  if (hojeEmSaoPaulo(agora) === dia) {
    const h = horaEmSaoPaulo(agora.toISOString());
    const min = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', minute: '2-digit' }).format(agora));
    ultima = Math.max(ultima, min >= 30 ? h : h - 1);
  }
  ultima = Math.min(ultima, 18);
  const faltam: number[] = [];
  for (let h = primeira; h <= ultima; h++) if (!horas.has(h)) faltam.push(h);
  return faltam;
}

/** O 59 está atrasado: em horário de expediente, o último retrato tem mais de 75 min. */
export function minutosSemO59(ultimoLote: string | null, agora: Date = new Date()): number | null {
  if (!ultimoLote) return null;
  const min = Math.floor((agora.getTime() - new Date(ultimoLote).getTime()) / 60_000);
  const h = horaEmSaoPaulo(agora.toISOString());
  return min > 75 && h >= 8 && h < 19 ? min : null;
}

export interface LinhaPorSetor {
  chave: string;
  nome: string;
  cidade: string | null;
  valor: number;
  pagamentos: number;
  /** soma = entra na meta; fora = setor que não soma; solto = grupo sem setor; avulso = grupo sem setor que soma. */
  situacao: 'soma' | 'fora' | 'solto' | 'avulso';
  /** Só em grupo sem setor. */
  cod: string | null;
}

/** O dia, por setor (e os grupos soltos à parte), do maior para o menor. */
export function porSetorNoDia(
  grupos: readonly GrupoDoDia[], setores: readonly SetorDoDesafio[], dia: string, avulsos: readonly string[] = [],
): LinhaPorSetor[] {
  const porId = new Map(setores.map(s => [s.setor_id, s]));
  const somaAvulso = new Set(avulsos);
  const linhas = new Map<string, LinhaPorSetor>();
  for (const g of grupos) {
    if (g.dia !== dia) continue;
    const s = g.setor_id ? porId.get(g.setor_id) : undefined;
    const chave = s ? s.setor_id : `grupo:${g.cod}`;
    const atual = linhas.get(chave) ?? {
      chave,
      nome: s ? s.nome : g.nome || `Grupo ${g.cod}`,
      cidade: s?.cidade ?? null,
      valor: 0,
      pagamentos: 0,
      situacao: s ? (s.soma ? 'soma' : 'fora') : somaAvulso.has(g.cod) ? 'avulso' : 'solto',
      cod: s ? null : g.cod,
    } satisfies LinhaPorSetor;
    atual.valor += g.valor;
    atual.pagamentos += g.pagamentos;
    linhas.set(chave, atual);
  }
  return [...linhas.values()].sort((a, b) => b.valor - a.valor);
}

// ── Formatos ─────────────────────────────────────────────────────────────────

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brlCurto = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
    : v >= 1000 ? `R$ ${Math.floor(v / 1000).toLocaleString('pt-BR')} mil`
      : brl(v);
/** Cortado, não arredondado: 99,6% não vira 100%. */
export const pct = (v: number, meta: number) => (meta > 0 ? Math.max(0, Math.min(Math.floor((v / meta) * 100), 100)) : 0);
/** «4,5 médias», «1 média». */
export const medias = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${n === 1 ? 'média' : 'médias'}`;

export function diaLocal(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}
export const semana = (iso: string) => diaLocal(iso).toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '');
export const semanaCurta = (iso: string) => semana(iso).slice(0, 3);
export const dataCurta = (iso: string) => diaLocal(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
export const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** «hoje e mais 2 dias», «hoje e amanhã», «último dia!». */
export function diasRestantes(total: number, hoje: number): string {
  const depois = total - 1 - hoje;
  if (depois <= 0) return 'último dia!';
  if (depois === 1) return 'hoje e amanhã';
  return `hoje e mais ${depois} dias`;
}
