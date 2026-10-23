/**
 * regras.ts — as contas da Guerra na Corrida (23/10/2026) que o banco também
 * faz (migration 20261023150000_corrida_guerra.sql). Mudou um número aqui, mude
 * lá: o teste SQL (`guerra.sql.test.ts`) roda os dois juntos.
 *
 * A guerra é opcional: o super_admin liga numa corrida de cavalos (o card da
 * Corrida, em Configurações). Desligada, a corrida segue igual.
 *
 * ## Os três tempos
 *
 * 1. **O ataque.** Quando o líder passa de `inicioFracao` da prova, aparece o
 *    botão «ATACAR A CORRIDA!» para todo mundo. Os cliques de todos somam a
 *    PRESSÃO; cada `alvo / (n − 1)` de pressão derruba um cavalo, na ordem que a
 *    semente da corrida sorteia. O vencedor da gravação é sempre o último que
 *    sobra: a guerra NÃO muda o resultado da corrida (nem prêmio, nem palpite).
 *    Sem clique nenhum ela anda sozinha e acaba em `maxS`; com muito clique,
 *    não acaba antes de `minS` (dá tempo de ver a guerra).
 * 2. **O filme** (`FILME`): o cessar-fogo, o luto (o sobrevivente chora o
 *    Pé de Pano), a raiva e a transformação. Dura `filmeS` e é igual em toda
 *    tela, contado do `sobrou_em` do banco.
 * 3. **O chefe**: o Cavalo da Guerra quebra a janela e briga na página. A vida
 *    é dividida por todos, com o diretor de ritmo da Bruxa do Pântano
 *    (`ritmo.ts` dela, 16/10/2026): a luta dura perto de `alvoS` com 1 ou com
 *    100 pessoas. Bem à frente da linha, um anjo desce e ele o devora — é a
 *    cura (`curaDoRitmo`), a mesma conta para todo mundo, decidida no banco.
 */

export const GUERRA = {
  /** Onde a guerra começa: o líder passa desta fração da prova. */
  inicioFracao: 0.58,
  /** A pressão que derruba UM cavalo: base + por pessoa no lobby (até `maxPresentes`). */
  alvoPorMorteBase: 14,
  alvoPorMortePorPessoa: 7,
  maxPresentes: 40,
  /** A guerra dura entre `minS` e `maxS` segundos, clique o quanto clicar. */
  minS: 20,
  maxS: 60,
  /** Os cliques vão juntos: no máximo tantos por envio, um envio a cada tanto por pessoa. */
  maxCliquesPorEnvio: 40,
  envioMs: 2_500,
  freioAtaqueS: 1.5,
  /** O filme entre o último cavalo e o chefe. */
  filmeS: 21,
  /** Quanto o chefe fica na página antes de fugir. */
  prazoS: 150,
  /** A vida: base + por pessoa que atacou na guerra (até `maxPessoas`). */
  vidaBase: 400,
  vidaPorPessoa: 120,
  maxPessoas: 60,
  /** Os tiros no chefe vão em lote (um por segundo; o banco segura 0,6 s por pessoa). */
  loteMs: 1_000,
  freioGolpeS: 0.6,
  maxAcertosPorLote: 14,
  /** O maior dano de um tiro: o olho (10) com ele tonto (2×). */
  maxDanoPorAcerto: 20,
  /** Cavalo de fogo abatido e cavaleiro banido: frações da vida máxima, com teto por lote. */
  bolaFracao: 0.035,
  maxBolasPorLote: 3,
  banidoFracao: 0.06,
  maxBanidosPorLote: 1,
} as const;

/** O dano de um tiro pelo que pegou (a armadura segura; o fogo da crina não tem o que ferir). */
export const DANO = { olho: 10, cabeca: 5, corpo: 3, armadura: 1, fogo: 0 } as const;
export type ParteDoChefe = keyof typeof DANO;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** A pressão que derruba todos (fica fixa quando a guerra começa: ninguém «ressuscita» com gente chegando). */
export function alvoDaGuerra(nCavalos: number, presentes: number): number {
  return Math.max(1, nCavalos - 1) * (GUERRA.alvoPorMorteBase + GUERRA.alvoPorMortePorPessoa * clamp(presentes, 1, GUERRA.maxPresentes));
}
/**
 * A pressão que vale agora, `s` segundos depois do começo: a dos cliques mais o
 * passo sozinho (todo o alvo em `maxS`), nunca mais que o permitido até ali
 * (todo o alvo em `minS`) e nunca mais que o alvo.
 */
export function pressaoEfetiva(pressao: number, alvo: number, s: number): number {
  if (!(s >= 0) || !(alvo > 0)) return 0;
  return Math.min(alvo, pressao + (alvo * s) / GUERRA.maxS, (alvo * s) / GUERRA.minS);
}
/** Quantos cavalos já caíram com essa pressão (no máximo todos menos o vencedor). */
export function mortesPela(efetiva: number, alvo: number, nCavalos: number): number {
  const n = nCavalos - 1;
  if (n <= 0 || !(alvo > 0)) return 0;
  return clamp(Math.floor((efetiva / alvo) * n + 1e-9), 0, n);
}
/** A ordem das mortes (as raias), pela semente da corrida: igual em toda tela. O vencedor fica de fora. */
export function ordemDasMortes(semente: number, nCavalos: number, vencedor: number): number[] {
  const raias = [...Array(nCavalos).keys()].filter(i => i !== vencedor);
  let a = (semente ^ 0x9e3779b1) >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = raias.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [raias[i], raias[j]] = [raias[j], raias[i]]; }
  return raias;
}
export function vidaDoChefe(pessoas: number): number {
  return GUERRA.vidaBase + GUERRA.vidaPorPessoa * clamp(pessoas, 1, GUERRA.maxPessoas);
}

/** O filme: quando cada parte começa, em segundos desde o `sobrou_em`. */
export const FILME = { cessar: 0, luto: 3.1, raiva: 10.3, transforma: 13.9, revela: 16.9, estoura: 18.05, chefe: GUERRA.filmeS } as const;
export type ParteDoFilme = keyof typeof FILME;
export function parteDoFilme(s: number): ParteDoFilme {
  if (s >= FILME.chefe) return 'chefe';
  if (s >= FILME.revela) return 'revela';
  if (s >= FILME.transforma) return 'transforma';
  if (s >= FILME.raiva) return 'raiva';
  if (s >= FILME.luto) return 'luto';
  return 'cessar';
}

/**
 * O diretor de ritmo (o da Bruxa, com os tempos desta luta). A vida tem uma
 * LINHA IDEAL que cai reta até zero em `alvoS`; o dano de cada lote é
 * multiplicado pela distância até ela (à frente vale menos, atrás vale mais e,
 * passado o `alvoS`, o teto sobe a cada segundo). Antes de `minS` a vida não
 * desce do `piso`. O multiplicador é o mesmo para todos naquele instante: o
 * ranking soma o dano ANTES dele, então continua justo.
 */
export const RITMO = {
  alvoS: 90,
  minS: 50,
  forca: 7,
  multMin: 0.25,
  multMax: 5,
  misericordiaPorS: 1,
  piso: 0.05,
  /** O anjo: bem à frente da linha, no máximo a cada tanto, até tanto da luta. */
  curaAFrente: 0.15,
  curaIntervaloS: 10,
  curaMax: 0.25,
  curaAteS: 110,
} as const;

export function alvoDaVida(t: number): number {
  return clamp(1 - t / RITMO.alvoS, 0, 1);
}
export function ritmoDaLuta(t: number, fracao: number): number {
  if (!(t >= 0)) return 1;
  const teto = RITMO.multMax + Math.max(0, t - RITMO.alvoS) * RITMO.misericordiaPorS;
  return Math.min(teto, Math.max(RITMO.multMin, Math.exp(RITMO.forca * (fracao - alvoDaVida(t)))));
}
/** Quanto o anjo devolve (fração da vida máxima), ou 0. */
export function curaDoRitmo(t: number, fracao: number, desdeAUltimaS: number): number {
  if (t < 0 || t >= RITMO.curaAteS || desdeAUltimaS < RITMO.curaIntervaloS) return 0;
  const aFrente = alvoDaVida(t) - fracao;
  if (aFrente < RITMO.curaAFrente) return 0;
  return Math.min(RITMO.curaMax, aFrente - 0.05);
}

/** Um lote de tiros, como a tela manda. */
export interface LoteDeGolpes { dano: number; acertos: number; bolas: number; banidos: number }
/** O dano bruto de um lote, com os tetos do banco (o que passa disso é jogado fora). */
export function danoBruto(l: LoteDeGolpes, vidaMax: number): number {
  const acertos = clamp(Math.floor(l.acertos || 0), 0, GUERRA.maxAcertosPorLote);
  const dano = clamp(l.dano || 0, 0, acertos * GUERRA.maxDanoPorAcerto);
  const bolas = clamp(Math.floor(l.bolas || 0), 0, GUERRA.maxBolasPorLote);
  const banidos = clamp(Math.floor(l.banidos || 0), 0, GUERRA.maxBanidosPorLote);
  return dano + bolas * GUERRA.bolaFracao * vidaMax + banidos * GUERRA.banidoFracao * vidaMax;
}
