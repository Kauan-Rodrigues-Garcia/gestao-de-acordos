/**
 * jornada.ts — as contas puras das abas Acesso e Retenção.
 */
import type { TipoJornada } from '@/services/jornada/jornada.service';

export interface TextosDoTipo {
  titulo: string;
  /** O nome que a equipe ou o subgrupo tem: «Suporte», «Retenção». */
  grupo: string;
  /** Plural do que se conta: «acessos», «retenções». */
  unidade: string;
  /** Singular: «acesso», «retenção». */
  unidadeUm: string;
}

export const TEXTOS: Record<TipoJornada, TextosDoTipo> = {
  acesso:   { titulo: 'Acesso',   grupo: 'Suporte',     unidade: 'acessos',   unidadeUm: 'acesso' },
  retencao: { titulo: 'Retenção', grupo: 'Retenção',    unidade: 'retenções', unidadeUm: 'retenção' },
};

/** «1 acesso», «3 acessos». */
export function contagem(n: number, tipo: TipoJornada): string {
  const t = TEXTOS[tipo];
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? t.unidadeUm : t.unidade}`;
}

/**
 * Percentual da meta, CORTADO e não arredondado (99,6% não vira 100%: quem
 * não bateu não aparece como se tivesse batido). `null` sem meta.
 */
export function percentual(feito: number, meta: number | null): number | null {
  if (!meta || meta <= 0) return null;
  return Math.floor((feito / meta) * 100);
}

// ─── Até quatro metas no mês (05/11/2026) ──────────────────────────────────

/** Quantas metas o mês pode ter: a 1ª e mais três faixas. */
export const MAX_METAS = 4;
export const ORDINAIS = ['1ª', '2ª', '3ª', '4ª'] as const;

export interface SituacaoMetas {
  /** Quantas metas a pessoa já bateu (0 a 4). */
  batidas: number;
  /** A próxima meta a bater; a última, quando bateu todas. `null` sem meta. */
  alvo: number | null;
  /** Índice do alvo (0 = 1ª). */
  indiceAlvo: number;
  /** Quanto falta para o alvo. Zero quando bateu todas. */
  faltam: number;
  /** Bateu a última meta configurada. */
  todas: boolean;
}

/**
 * Onde a pessoa está nas metas do mês: quantas bateu e qual é a próxima.
 * `metas` em ordem crescente (a 1ª primeiro); vazia = sem meta.
 */
export function situacaoMetas(feito: number, metas: readonly number[]): SituacaoMetas {
  const validas = metas.filter(m => m > 0);
  if (validas.length === 0) return { batidas: 0, alvo: null, indiceAlvo: 0, faltam: 0, todas: false };
  const batidas = validas.filter(m => feito >= m).length;
  const todas = batidas === validas.length;
  const indiceAlvo = todas ? validas.length - 1 : batidas;
  const alvo = validas[indiceAlvo];
  return { batidas, alvo, indiceAlvo, faltam: Math.max(alvo - feito, 0), todas };
}

/**
 * As metas digitadas (texto) viram números, ou o motivo de não poderem:
 * campo do meio em branco, fora do limite ou fora de ordem crescente.
 * Em branco no fim é só não ter aquela faixa.
 */
export function lerMetas(campos: readonly string[], limite = 100000): { metas: number[]; erro: string | null } {
  let ultimo = campos.length - 1;
  while (ultimo >= 0 && !campos[ultimo]) ultimo--;
  const usados = campos.slice(0, ultimo + 1);
  if (usados.some(c => !c)) return { metas: [], erro: 'Preencha as metas em ordem, sem pular.' };
  const metas = usados.map(Number);
  if (metas.some(m => !Number.isFinite(m) || m < 1 || m > limite)) {
    return { metas: [], erro: `Cada meta vai de 1 a ${limite.toLocaleString('pt-BR')}.` };
  }
  for (let i = 1; i < metas.length; i++) {
    if (metas[i] <= metas[i - 1]) {
      return { metas: [], erro: `A ${ORDINAIS[i]} meta tem de ser maior que a ${ORDINAIS[i - 1]}.` };
    }
  }
  return { metas, erro: null };
}

/** Todos os dias do mês de `diaISO` até `limiteISO` (inclusive), em ISO. */
export function diasDoMesAte(diaISO: string, limiteISO: string): string[] {
  const [ano, mes] = diaISO.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dias: string[] = [];
  for (let d = 1; d <= ultimo; d++) {
    const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (iso > limiteISO) break;
    dias.push(iso);
  }
  return dias;
}

/** Anda `delta` dias numa data ISO (sem fuso: é calendário, não instante). */
export function somarDias(diaISO: string, delta: number): string {
  const [a, m, d] = diaISO.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** «ter» para 2026-11-03. */
export function diaDaSemana(diaISO: string): string {
  const [a, m, d] = diaISO.split('-').map(Number);
  return SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

/** «terça, 04 de novembro» — o título do dia aberto. */
export function diaPorExtenso(diaISO: string): string {
  const [a, m, d] = diaISO.split('-').map(Number);
  const nomeSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(a, m - 1, d)));
  return `${nomeSemana.replace('-feira', '')}, ${String(d).padStart(2, '0')} de ${MESES[m - 1]}`;
}

/** «novembro de 2026». */
export function mesPorExtenso(diaISO: string): string {
  const [a, m] = diaISO.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

/** Hora local de São Paulo de um instante: «14:32». */
export function horaSaoPaulo(instante: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(new Date(instante));
}

/** Iniciais para o avatar sem foto: «Ana Paula Souza» → «AS». */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

/**
 * O nome curto da tag de cada NR (para a liderança saber de quem é): o
 * primeiro nome; quando dois têm o mesmo primeiro nome, o sobrenome entra
 * como inicial — «Maria S.» e «Maria P.». Chave = id da pessoa.
 */
export function nomesCurtos(pessoas: { id: string; nome: string | null }[]): Map<string, string> {
  const partes = new Map(pessoas.map(p => [p.id, (p.nome ?? '').trim().split(/\s+/).filter(Boolean)]));
  const porPrimeiro = new Map<string, number>();
  for (const ps of partes.values()) {
    const k = (ps[0] ?? '').toLocaleLowerCase('pt-BR');
    porPrimeiro.set(k, (porPrimeiro.get(k) ?? 0) + 1);
  }
  const curtos = new Map<string, string>();
  for (const [id, ps] of partes) {
    if (ps.length === 0) { curtos.set(id, '?'); continue; }
    const repetido = (porPrimeiro.get(ps[0].toLocaleLowerCase('pt-BR')) ?? 0) > 1;
    curtos.set(id, repetido && ps.length > 1 ? `${ps[0]} ${ps[ps.length - 1][0].toUpperCase()}.` : ps[0]);
  }
  return curtos;
}
