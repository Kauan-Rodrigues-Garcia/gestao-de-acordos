/**
 * apoio.ts — o que a montagem precisa saber de cada TV, sem React.
 *
 * Três perguntas que o líder faz olhando a tela:
 *   1. A TV está ligada?            → `estadoDaTv`
 *   2. Ela já mostra o que salvei?  → `estadoDaTv` (versão)
 *   3. O que estou editando já está lá, ou falta publicar? → `situacaoDoPainel`
 */
import type { AlvoTv, ConexaoTv } from './tipos';

/**
 * Sem sinal há mais disto, a TV está desligada ou sem rede. A TV dá sinal a
 * cada 30 s (`fn_tv_versao`); 75 s é perder dois e meio.
 */
export const LIMITE_ONLINE_MS = 75_000;

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

export type EstadoTv =
  /** Ligada e mostrando a versão publicada. */
  | 'em_dia'
  /** Ligada, ainda com a versão anterior — pega a nova em poucos segundos. */
  | 'atualizando'
  /** A página foi fechada (aviso do `pagehide`). */
  | 'fechada'
  /** Sem sinal: PC desligado, sem rede ou navegador travado. */
  | 'sem_sinal';

export function estadoDaTv(
  c: Pick<ConexaoTv, 'ultimo_sinal' | 'saiu_em' | 'versao_exibida'>,
  versaoPublicada: string | null | undefined,
  agora = Date.now(),
): EstadoTv {
  const sinal = ms(c.ultimo_sinal);
  const saiu = ms(c.saiu_em);
  if (!Number.isFinite(sinal)) return 'sem_sinal';
  if (Number.isFinite(saiu) && saiu >= sinal) return 'fechada';
  if (agora - sinal >= LIMITE_ONLINE_MS) return 'sem_sinal';
  const exibida = ms(c.versao_exibida);
  const publicada = ms(versaoPublicada);
  if (Number.isFinite(publicada) && !(exibida >= publicada)) return 'atualizando';
  return 'em_dia';
}

export function tvLigada(e: EstadoTv): boolean {
  return e === 'em_dia' || e === 'atualizando';
}

export type SituacaoPainel =
  /** Há mudança na tela que a TV ainda não recebeu: falta publicar. */
  | { tipo: 'rascunho' }
  | { tipo: 'sem_tv' }
  | { tipo: 'tvs_desligadas'; ultimoSinal: string | null }
  | { tipo: 'enviando'; ligadas: number }
  | { tipo: 'no_ar'; ligadas: number; total: number };

export function situacaoDoPainel(
  temRascunho: boolean,
  conexoes: Pick<ConexaoTv, 'ultimo_sinal' | 'saiu_em' | 'versao_exibida'>[],
  versaoPublicada: string | null | undefined,
  agora = Date.now(),
): SituacaoPainel {
  if (temRascunho) return { tipo: 'rascunho' };
  if (!conexoes.length) return { tipo: 'sem_tv' };
  const estados = conexoes.map(c => estadoDaTv(c, versaoPublicada, agora));
  const ligadas = estados.filter(tvLigada).length;
  if (!ligadas) {
    const ultimo = conexoes
      .map(c => c.ultimo_sinal)
      .filter((x): x is string => !!x)
      .sort()
      .pop() ?? null;
    return { tipo: 'tvs_desligadas', ultimoSinal: ultimo };
  }
  if (estados.includes('atualizando')) return { tipo: 'enviando', ligadas };
  return { tipo: 'no_ar', ligadas, total: conexoes.length };
}

export const chaveAlvo = (a: Pick<AlvoTv, 'setor_id' | 'equipe_id'>) => `${a.setor_id}:${a.equipe_id ?? ''}`;

export function rotuloAlvo(a: AlvoTv): string {
  return a.equipe_id ? `${a.setor_nome} › ${a.equipe_nome}` : `${a.setor_nome} (setor inteiro)`;
}

export function horaCurta(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === hoje.toDateString() ? hora : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
}
