/**
 * Histórico do operador — a parte pura: a situação de cada campanha, o filtro
 * pelo voto e o agrupamento por mês.
 */
import type { Participacao } from './campanhasWhatsapp.service';

export type FiltroVoto = 'todas' | 'positivas' | 'negativas' | 'sem_voto';

export type SituacaoParticipacao = 'aberta' | 'pausada' | 'encerrada';

export function situacaoDaParticipacao(p: Pick<Participacao, 'ativa' | 'encerrada_em'>): SituacaoParticipacao {
  if (p.encerrada_em) return 'encerrada';
  return p.ativa ? 'aberta' : 'pausada';
}

export function casaVoto(p: Pick<Participacao, 'bom'>, filtro: FiltroVoto): boolean {
  if (filtro === 'positivas') return p.bom === true;
  if (filtro === 'negativas') return p.bom === false;
  if (filtro === 'sem_voto') return p.bom === null;
  return true;
}

export interface ResumoHistorico {
  campanhas: number;
  positivas: number;
  negativas: number;
  semVoto: number;
  mensagens: number;
  enviadas: number;
}

export function resumirHistorico(lista: readonly Participacao[]): ResumoHistorico {
  const r: ResumoHistorico = { campanhas: lista.length, positivas: 0, negativas: 0, semVoto: 0, mensagens: 0, enviadas: 0 };
  for (const p of lista) {
    if (p.bom === true) r.positivas++;
    else if (p.bom === false) r.negativas++;
    else r.semVoto++;
    r.mensagens += p.total;
    r.enviadas += p.enviados;
  }
  return r;
}

/** «2026-10» pelo lançamento, no fuso local. */
export function chaveMes(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nomeMes(chave: string): string {
  const [a, m] = chave.split('-').map(Number);
  const s = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Por mês, do mais novo para o mais antigo, mantendo a ordem de dentro. */
export function porMes<T extends Pick<Participacao, 'lancada_em'>>(lista: readonly T[]): [string, T[]][] {
  const mapa = new Map<string, T[]>();
  for (const p of lista) {
    const k = chaveMes(p.lancada_em);
    mapa.set(k, [...(mapa.get(k) ?? []), p]);
  }
  return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}
