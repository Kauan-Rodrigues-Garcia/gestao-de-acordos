/**
 * A linha do tempo do sorteio ao vivo (26/11/2026) — pura, sem tela.
 *
 * Toda a plateia calcula a MESMA cena a partir do estado do banco e do
 * relógio do banco (`agoraBanco`): recarregar no meio cai no segundo certo.
 *
 *   contagem:  revela_em − 7 s … − 5 s   «preparando»
 *              revela_em − 5 s … 0       5, 4, 3, 2, 1
 *              depois de revela_em        o rolo gira, à espera do banco
 *   revelado:  a partir de `base` (o maior entre revela_em e revelado_em),
 *              cada ganhador tem GIRO s de rolo freando + PAUSA s parado
 *
 * Antes do «revelado» o ganhador não existe nem no banco: o rolo gira com os
 * nomes de quem concorre, e nenhum nome é favorecido.
 */

export type EstadoShow = 'aberto' | 'contagem' | 'revelado' | 'encerrado' | 'cancelado';

export interface PessoaDoShow { perfil_id: string; nome: string; foto?: string | null }
export interface GanhadorDoShow extends PessoaDoShow { posicao: number }

export interface ShowJson {
  id: number;
  setor_id: string;
  setor_nome: string | null;
  premio: string;
  estado: EstadoShow;
  qtd: number;
  criado_em: string;
  revela_em: string | null;
  revelado_em: string | null;
  encerrado_em: string | null;
  plateia: number;
  concorrentes: PessoaDoShow[];
  ganhadores: GanhadorDoShow[] | null;
}

export const PREPARO_S = 2;
export const CONTAGEM_S = 5;
export const GIRO_S = 3.4;
export const PAUSA_S = 2.4;
const PASSOS_DO_GIRO = 32;
const GIRO_LIVRE_POR_S = 14;

export type Cena =
  | { fase: 'aguardando' }
  | { fase: 'preparando' }
  | { fase: 'contagem'; numero: number; fracao: number }
  | { fase: 'sorteando'; nome: string | null }
  | { fase: 'revelando'; indice: number; parado: boolean; nome: string | null; progresso: number }
  | { fase: 'final' }
  | { fase: 'fim' };

const seg = (iso: string | null | undefined): number | null => (iso ? Date.parse(iso) / 1000 : null);
const freio = (p: number) => 1 - Math.pow(1 - p, 3);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** O segundo (relógio do banco) em que o ganhador `i` começa a girar. */
export function inicioDoGiro(show: ShowJson, i: number): number | null {
  const revela = seg(show.revela_em);
  const revelado = seg(show.revelado_em);
  if (revela === null && revelado === null) return null;
  const base = Math.max(revela ?? 0, revelado ?? 0);
  return base + i * (GIRO_S + PAUSA_S);
}

/** O fim da cena: o último ganhador parado. */
export function fimDaRevelacao(show: ShowJson): number | null {
  const n = show.ganhadores?.length ?? 0;
  const ini = inicioDoGiro(show, Math.max(0, n - 1));
  return n && ini !== null ? ini + GIRO_S : null;
}

/** Quem ainda está no rolo quando o ganhador `i` gira: os que já ganharam saem. */
export function roloDoGanhador(show: ShowJson, i: number): PessoaDoShow[] {
  const ja = new Set((show.ganhadores ?? []).slice(0, i).map(g => g.perfil_id));
  const resto = show.concorrentes.filter(c => !ja.has(c.perfil_id));
  const g = show.ganhadores?.[i];
  // O ganhador sempre está no rolo (um extra pode não ter vindo na lista).
  return g && !resto.some(c => c.perfil_id === g.perfil_id) ? [...resto, g] : resto;
}

export function cenaDoShow(show: ShowJson, agora: number): Cena {
  if (show.estado === 'encerrado' || show.estado === 'cancelado') return { fase: 'fim' };
  if (show.estado === 'aberto') return { fase: 'aguardando' };
  const revela = seg(show.revela_em);
  if (revela === null) return { fase: 'aguardando' };

  const giroLivre = (): string | null => {
    const lista = show.concorrentes;
    return lista.length ? lista[mod(Math.floor(agora * GIRO_LIVRE_POR_S), lista.length)].nome : null;
  };

  if (show.estado === 'contagem' || !show.ganhadores?.length) {
    if (agora < revela - CONTAGEM_S) return { fase: 'preparando' };
    if (agora < revela) {
      const falta = revela - agora;
      return { fase: 'contagem', numero: Math.min(CONTAGEM_S, Math.ceil(falta)), fracao: falta - Math.floor(falta) };
    }
    return { fase: 'sorteando', nome: giroLivre() };
  }

  const ganhadores = show.ganhadores;
  for (let i = 0; i < ganhadores.length; i++) {
    const ini = inicioDoGiro(show, i)!;
    if (agora < ini) {
      // Entre um ganhador e o próximo (ou antes do primeiro): o anterior fica parado.
      return i === 0 ? { fase: 'sorteando', nome: giroLivre() } : { fase: 'revelando', indice: i - 1, parado: true, nome: ganhadores[i - 1].nome, progresso: 1 };
    }
    if (agora < ini + GIRO_S) {
      const rolo = roloDoGanhador(show, i);
      const alvo = Math.max(0, rolo.findIndex(c => c.perfil_id === ganhadores[i].perfil_id));
      const p = (agora - ini) / GIRO_S;
      const passo = Math.floor(PASSOS_DO_GIRO * freio(p));
      const nome = rolo.length ? rolo[mod(alvo - PASSOS_DO_GIRO + passo, rolo.length)].nome : ganhadores[i].nome;
      return { fase: 'revelando', indice: i, parado: false, nome, progresso: p };
    }
    if (i === ganhadores.length - 1 || agora < inicioDoGiro(show, i + 1)!) {
      if (i === ganhadores.length - 1 && agora >= ini + GIRO_S + PAUSA_S) return { fase: 'final' };
      return { fase: 'revelando', indice: i, parado: true, nome: ganhadores[i].nome, progresso: 1 };
    }
  }
  return { fase: 'final' };
}

/** Os ganhadores que já pararam no rolo (o resto ainda não pode aparecer). */
export function ganhadoresMostrados(show: ShowJson, cena: Cena): GanhadorDoShow[] {
  const g = show.ganhadores ?? [];
  if (cena.fase === 'final') return g;
  if (cena.fase === 'revelando') return g.slice(0, cena.parado ? cena.indice + 1 : cena.indice);
  return [];
}
