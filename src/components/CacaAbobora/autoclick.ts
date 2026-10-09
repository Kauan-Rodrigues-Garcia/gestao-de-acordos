/**
 * autoclick.ts — quem está atirando no chefão com autoclick.
 *
 * ## O pedido (09/10/2026)
 *
 * «Teria como detectar quem está a usar autoclick?» Dá, com pistas — não com
 * certeza. O app mede os cliques de cada um durante a luta e manda, com o
 * lote, um código de MOTIVOS; o banco soma (migration 20261009120000) e o
 * super_admin vê a lista em Configurações → Geral. Ninguém perde dano sozinho:
 * a decisão é de quem olha.
 *
 * ## As pistas
 *
 * Fortes (contam como suspeita):
 *   ritmo      intervalos de máquina: muitos cliques seguidos com o mesmo
 *              espaço entre eles. Gente varia 15–40 ms de um clique para o
 *              outro; o autoclick, 1–3 ms.
 *   rapido     mais de 20 cliques por segundo, sustentados por 2 s. Nem quem
 *              clica «em borboleta» segura isso.
 *   sintetico  clique que não veio do mouse (`isTrusted` falso): script no
 *              console. Este nem vira tiro — `cenaChefao.tsx` ignora.
 *
 * Fracas (só aparecem como pista; sozinhas explicam-se):
 *   seguro     o botão volta sempre no mesmo tempo (ou na hora). Touchpad com
 *              «toque para clicar» também faz isso.
 *   parado     o mouse não mexe nem um pixel por muitos cliques. Tem gente que
 *              espera o chefão passar com a mão parada.
 *
 * E uma que o BANCO conta sozinho, sem depender do app: lotes que chegam no
 * teto de 12 acertos (`lotes_no_teto`). Ninguém acerta 12 vezes por segundo um
 * alvo que dança e desvia.
 *
 * ## O que escapa
 *
 * Autoclick com intervalo sorteado e mexendo o mouse passa pelo ritmo; aí só
 * sobra a velocidade e o teto. É detecção, não trava.
 */

export const MOTIVO = {
  ritmo: 1,
  rapido: 2,
  sintetico: 4,
  seguro: 8,
  parado: 16,
} as const;

/** As pistas que contam como suspeita (o banco usa a mesma máscara: `& 7`). */
export const MOTIVOS_FORTES = MOTIVO.ritmo | MOTIVO.rapido | MOTIVO.sintetico;

export const NOME_DO_MOTIVO: Readonly<Record<keyof typeof MOTIVO, string>> = {
  ritmo: 'ritmo de máquina',
  rapido: 'rápido demais',
  sintetico: 'clique por script',
  seguro: 'botão sempre igual',
  parado: 'mouse parado',
};

export interface Clique {
  /** `event.timeStamp`, em ms. */
  t: number;
  x: number;
  y: number;
  /** `event.isTrusted`: veio do mouse de verdade. */
  confiavel: boolean;
  /** Quanto o botão ficou apertado, em ms (null = ainda não soltou). */
  segurou: number | null;
}

/** Quantos cliques a análise olha, e de quanto tempo para trás. */
export const JANELA_CLIQUES = 40;
export const JANELA_MS = 6_000;

/** Intervalo maior que isto separa duas rajadas. */
const PAUSA_MS = 400;
/** Rajada mínima para julgar o ritmo. */
const RAJADA_MIN = 15;
/** Ritmo de máquina: desvio-padrão dos intervalos abaixo disto (ms) e desta fração da média. */
const RITMO_DESVIO_MS = 4;
const RITMO_FRACAO = 0.06;
/** Rápido demais: cliques em 2 s. */
const RAPIDO_EM_2S = 40;
/** Botão sempre igual: desvio abaixo disto, ou sempre solto quase na hora. */
const SEGURO_DESVIO_MS = 1.5;
const SEGURO_NA_HORA_MS = 8;
const SEGURO_MIN = 12;
/** Mouse parado: tantos cliques seguidos no mesmo pixel. */
const PARADO_MIN = 15;

function desvio(xs: readonly number[]): { media: number; desvio: number } {
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - media) ** 2, 0) / xs.length;
  return { media, desvio: Math.sqrt(v) };
}

/**
 * As pistas de um punhado de cliques recentes (do mais velho para o mais
 * novo). Devolve os bits de `MOTIVO`.
 */
export function analisarCliques(cliques: readonly Clique[]): number {
  let bits = 0;
  if (cliques.some(c => !c.confiavel)) bits |= MOTIVO.sintetico;

  // Ritmo: a rajada mais recente sem pausa.
  let inicio = cliques.length - 1;
  while (inicio > 0 && cliques[inicio].t - cliques[inicio - 1].t <= PAUSA_MS) inicio -= 1;
  const rajada = cliques.slice(inicio);
  if (rajada.length >= RAJADA_MIN + 1) {
    const intervalos = rajada.slice(1).map((c, i) => c.t - rajada[i].t);
    const { media, desvio: d } = desvio(intervalos);
    if (media > 0 && d < Math.max(RITMO_DESVIO_MS, media * RITMO_FRACAO)) bits |= MOTIVO.ritmo;
  }

  // Rápido: quantos cabem em 2 s, no pior trecho.
  for (let i = 0, j = 0; j < cliques.length; j++) {
    while (cliques[j].t - cliques[i].t > 2_000) i += 1;
    if (j - i + 1 >= RAPIDO_EM_2S) { bits |= MOTIVO.rapido; break; }
  }

  // Botão sempre igual.
  const seguros = cliques.map(c => c.segurou).filter((s): s is number => s !== null);
  if (seguros.length >= SEGURO_MIN) {
    const { desvio: d } = desvio(seguros);
    if (d < SEGURO_DESVIO_MS || seguros.every(s => s <= SEGURO_NA_HORA_MS)) bits |= MOTIVO.seguro;
  }

  // Mouse parado: a maior sequência no mesmo pixel.
  let seguidos = 1;
  for (let i = 1; i < cliques.length; i++) {
    seguidos = cliques[i].x === cliques[i - 1].x && cliques[i].y === cliques[i - 1].y ? seguidos + 1 : 1;
    if (seguidos >= PARADO_MIN) { bits |= MOTIVO.parado; break; }
  }
  return bits;
}

export function nomesDosMotivos(bits: number): string[] {
  return (Object.keys(MOTIVO) as (keyof typeof MOTIVO)[])
    .filter(k => (bits & MOTIVO[k]) !== 0)
    .map(k => NOME_DO_MOTIVO[k]);
}

// ── O que o banco guardou de cada um ────────────────────────────────────────

export interface FichaDeCliques {
  usuario:       string;
  nome:          string;
  dano:          number;
  acertos:       number;
  headshots:     number;
  /** Cliques na tela durante a luta (no chefão ou fora). */
  cliques:       number;
  lotes:         number;
  lotes_no_teto: number;
  /** Lotes que chegaram com pista forte. */
  suspeitas:     number;
  motivos:       number;
  /** Do primeiro ao último lote. */
  segundos:      number;
}

export type Nivel = 'suspeito' | 'atencao' | 'limpo';

export interface Avaliacao {
  nivel: Nivel;
  /** Em palavras, para a lista do super_admin. */
  motivos: string[];
  /** Cliques por segundo, na média da luta. */
  cps: number;
}

/** Lotes com pista forte para virar «suspeito» (um só pode ser azar). */
export const SUSPEITAS_PARA_SUSPEITO = 3;
/** Teto: de quantos lotes para cima conta, e que fração deles no teto. */
const TETO_MIN_LOTES = 8;
const TETO_FRACAO = 0.5;

export function avaliarFicha(f: FichaDeCliques): Avaliacao {
  const motivos = nomesDosMotivos(f.motivos);
  const teto = f.lotes >= TETO_MIN_LOTES && f.lotes_no_teto / f.lotes >= TETO_FRACAO;
  if (teto) motivos.push(`${f.lotes_no_teto} de ${f.lotes} lotes no teto`);
  const script = (f.motivos & MOTIVO.sintetico) !== 0;
  const nivel: Nivel = script || teto || f.suspeitas >= SUSPEITAS_PARA_SUSPEITO
    ? 'suspeito'
    : f.suspeitas > 0 || f.motivos !== 0 || f.lotes_no_teto > 0
      ? 'atencao'
      : 'limpo';
  return { nivel, motivos, cps: f.cliques / Math.max(1, f.segundos) };
}

const inteiro = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);

export function normalizarFichas(bruto: unknown): FichaDeCliques[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((b): FichaDeCliques[] => {
    if (!b || typeof b !== 'object') return [];
    const r = b as Record<string, unknown>;
    if (typeof r.usuario !== 'string') return [];
    return [{
      usuario: r.usuario,
      nome: typeof r.nome === 'string' && r.nome.trim() ? r.nome : 'Alguém',
      dano: inteiro(r.dano), acertos: inteiro(r.acertos), headshots: inteiro(r.headshots),
      cliques: inteiro(r.cliques), lotes: inteiro(r.lotes), lotes_no_teto: inteiro(r.lotes_no_teto),
      suspeitas: inteiro(r.suspeitas), motivos: inteiro(r.motivos), segundos: Math.max(1, inteiro(r.segundos)),
    }];
  });
}

const PESO: Readonly<Record<Nivel, number>> = { suspeito: 0, atencao: 1, limpo: 2 };

/** Os suspeitos primeiro, depois quem tem pista, depois o resto, cada grupo pelo dano. */
export function ordenarFichas(fs: readonly FichaDeCliques[]): { ficha: FichaDeCliques; avaliacao: Avaliacao }[] {
  return fs
    .map(ficha => ({ ficha, avaliacao: avaliarFicha(ficha) }))
    .sort((a, b) => PESO[a.avaliacao.nivel] - PESO[b.avaliacao.nivel] || b.ficha.dano - a.ficha.dano);
}

// ── Na tela (o detector da luta) ────────────────────────────────────────────

export interface Colheita {
  /** Cliques desde a última colheita. */
  cliques: number;
  /** Os bits de `MOTIVO` dos cliques recentes. */
  suspeita: number;
}

export interface Detector {
  /** O que vai com o próximo lote. Zera o contador. */
  colher(): Colheita;
  /** O lote não entrou (freio): o que foi colhido volta para o próximo. */
  devolver(c: Colheita): void;
  parar(): void;
}

/**
 * Ouve os cliques da página inteira enquanto o chefão está na tela (na fase
 * de captura, sem atrapalhar ninguém) e guarda os últimos `JANELA_CLIQUES`.
 */
export function criarDetector(alvo: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): Detector {
  const cliques: Clique[] = [];
  const apertados = new Map<number, Clique>();
  let contados = 0;
  let devolvidos = 0;

  const desce = (e: Event) => {
    const p = e as PointerEvent;
    if (p.button !== 0) return;
    const c: Clique = { t: p.timeStamp, x: p.clientX, y: p.clientY, confiavel: p.isTrusted, segurou: null };
    cliques.push(c);
    apertados.set(p.pointerId, c);
    contados += 1;
    const limite = p.timeStamp - JANELA_MS;
    while (cliques.length > JANELA_CLIQUES || (cliques.length > 0 && cliques[0].t < limite)) cliques.shift();
  };
  const sobe = (e: Event) => {
    const p = e as PointerEvent;
    const c = apertados.get(p.pointerId);
    if (!c) return;
    apertados.delete(p.pointerId);
    c.segurou = Math.max(0, p.timeStamp - c.t);
  };
  const opcoes = { capture: true, passive: true } as const;
  alvo.addEventListener('pointerdown', desce, opcoes);
  alvo.addEventListener('pointerup', sobe, opcoes);

  return {
    colher() {
      const c = { cliques: contados, suspeita: analisarCliques(cliques) | devolvidos };
      contados = 0;
      devolvidos = 0;
      return c;
    },
    devolver(c) {
      contados += c.cliques;
      devolvidos |= c.suspeita;
    },
    parar() {
      alvo.removeEventListener('pointerdown', desce, opcoes);
      alvo.removeEventListener('pointerup', sobe, opcoes);
    },
  };
}
