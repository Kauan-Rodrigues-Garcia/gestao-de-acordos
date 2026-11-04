/**
 * conta.ts — as contas da rádio, puras (sem banco, sem DOM).
 *
 * A rádio não transmite áudio: o banco guarda a música no ar e a hora em que
 * ela começou (migration 20261029210000). Cada navegador faz a conta
 * `agora − início` com o relógio DO BANCO e abre o player naquele ponto.
 *
 * As janelas daqui são as mesmas do banco (`fn_radio_votar`): a votação abre
 * `ABRE_S` antes do fim e fecha `FECHA_S` antes. Mexeu aqui, mexa lá.
 */

export interface MusicaRadio {
  /** Id do vídeo no YouTube. */
  video: string;
  titulo: string;
  canal: string;
  capa: string | null;
  duracao_s: number;
  /** Nome do estilo de onde ela veio. */
  estilo: string;
}

export interface CandidataApurada extends MusicaRadio {
  votos: number;
}

export interface ResultadoRodada {
  rodada: number;
  /** `trocar`: o super_admin escolheu a que entrou. */
  motivo: 'fim' | 'pular' | 'erro' | 'trocar';
  /** O vídeo sorteado. */
  sorteada: string | null;
  /** Votos da rodada, somados. */
  votos: number;
  candidatas: CandidataApurada[];
}

export interface EstadoRadio {
  /** Ligada pelo super_admin. Desligada: sem música e sem votação. */
  no_ar: boolean;
  no_ar_desde: string | null;
  rodada: number;
  atual: MusicaRadio | null;
  inicia_em: string | null;
  candidatas: MusicaRadio[];
  anterior: ResultadoRodada | null;
}

/** A votação abre esse tanto antes do fim… */
export const ABRE_S = 60;
/** …e fecha esse tanto antes. */
export const FECHA_S = 5;
/** O resultado da rodada que acabou fica à mostra no começo da seguinte. */
export const RESULTADO_S = 30;

export type FaseRadio =
  /** Desligada pelo super_admin. */
  | 'desligada'
  /** Sem música no ar (catálogo vazio, ou ainda não leu). */
  | 'vazia'
  /** Tocando, votação ainda não abriu. */
  | 'tocando'
  | 'votando'
  /** Votação fechou, esperando o sorteio. */
  | 'encerrada';

/** Em ms, pelo relógio do banco. `null` sem música no ar. */
export function inicioMs(e: EstadoRadio | null): number | null {
  if (!e?.atual || !e.inicia_em) return null;
  const t = Date.parse(e.inicia_em);
  return Number.isFinite(t) ? t : null;
}

export function fimMs(e: EstadoRadio | null): number | null {
  const i = inicioMs(e);
  return i === null || !e?.atual ? null : i + e.atual.duracao_s * 1000;
}

/** Onde a música está, em segundos (entre 0 e a duração). */
export function posicao(e: EstadoRadio | null, agoraMs: number): number {
  const i = inicioMs(e);
  if (i === null || !e?.atual) return 0;
  return Math.min(e.atual.duracao_s, Math.max(0, (agoraMs - i) / 1000));
}

/** Quando a votação abre e fecha, em ms. Música curta: abre no começo. */
export function janela(e: EstadoRadio | null): { abre: number; fecha: number } | null {
  const i = inicioMs(e);
  const f = fimMs(e);
  if (i === null || f === null) return null;
  return { abre: Math.max(i, f - ABRE_S * 1000), fecha: f - FECHA_S * 1000 };
}

export function fase(e: EstadoRadio | null, agoraMs: number): FaseRadio {
  if (e && !e.no_ar) return 'desligada';
  const j = janela(e);
  if (!j || !e?.candidatas.length) return j ? 'tocando' : 'vazia';
  if (agoraMs < j.abre) return 'tocando';
  if (agoraMs < j.fecha) return 'votando';
  return 'encerrada';
}

/** O próximo instante em que a fase muda (para marcar o timer). `null`: nenhum. */
export function proximaVirada(e: EstadoRadio | null, agoraMs: number): number | null {
  const j = janela(e);
  const f = fimMs(e);
  if (!j || f === null) return null;
  return [j.abre, j.fecha, f].find(t => t > agoraMs) ?? null;
}

/**
 * A chance de cada candidata, de 0 a 1, na ordem dada. O peso é 1 + votos —
 * o mesmo do sorteio no banco (`fn_radio_avancar`).
 */
export function chances(votos: number[]): number[] {
  const total = votos.reduce((s, v) => s + 1 + v, 0);
  return votos.map(v => (total ? (1 + v) / total : 0));
}

/** «Mudou» chegou de uma rodada mais velha que a que já está na tela? */
export function ehMaisNova(nova: EstadoRadio, atual: EstadoRadio | null): boolean {
  return !atual || nova.rodada >= atual.rodada;
}

/** Lê o que veio do banco (ou do aviso) sem confiar no formato. */
export function lerEstado(bruto: unknown): EstadoRadio | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const o = bruto as Record<string, unknown>;
  if (typeof o.rodada !== 'number') return null;
  const atual = lerMusica(o.atual);
  const candidatas = Array.isArray(o.candidatas) ? o.candidatas.map(lerMusica).filter((m): m is MusicaRadio => !!m) : [];
  let anterior: ResultadoRodada | null = null;
  const a = o.anterior as Record<string, unknown> | null | undefined;
  if (a && typeof a === 'object' && typeof a.rodada === 'number') {
    anterior = {
      rodada: a.rodada,
      motivo: a.motivo === 'pular' || a.motivo === 'erro' || a.motivo === 'trocar' ? a.motivo : 'fim',
      sorteada: typeof a.sorteada === 'string' ? a.sorteada : null,
      votos: typeof a.votos === 'number' ? a.votos : 0,
      candidatas: Array.isArray(a.candidatas)
        ? a.candidatas.flatMap(c => {
          const m = lerMusica(c);
          const v = (c as { votos?: unknown } | null)?.votos;
          return m ? [{ ...m, votos: typeof v === 'number' ? v : 0 }] : [];
        })
        : [],
    };
  }
  return {
    no_ar: o.no_ar === true,
    no_ar_desde: typeof o.no_ar_desde === 'string' ? o.no_ar_desde : null,
    rodada: o.rodada,
    atual,
    inicia_em: atual && typeof o.inicia_em === 'string' ? o.inicia_em : null,
    candidatas,
    anterior,
  };
}

const ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;

function lerMusica(bruto: unknown): MusicaRadio | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const m = bruto as Record<string, unknown>;
  if (typeof m.video !== 'string' || !ID_VIDEO.test(m.video)) return null;
  if (typeof m.duracao_s !== 'number' || !(m.duracao_s > 0)) return null;
  return {
    video: m.video,
    titulo: typeof m.titulo === 'string' ? m.titulo : 'Música',
    canal: typeof m.canal === 'string' ? m.canal : '',
    capa: typeof m.capa === 'string' && m.capa.startsWith('https://i.ytimg.com/') ? m.capa : null,
    duracao_s: m.duracao_s,
    estilo: typeof m.estilo === 'string' ? m.estilo : '',
  };
}
