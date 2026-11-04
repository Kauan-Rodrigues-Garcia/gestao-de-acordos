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
