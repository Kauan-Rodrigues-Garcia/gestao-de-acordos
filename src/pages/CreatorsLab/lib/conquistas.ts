/**
 * conquistas.ts — o sistema de conquistas, sem React.
 *
 * Regras puras: dado o conjunto do que já foi feito, quais conquistas estão
 * desbloqueadas. Quem guarda e quem desenha são outros arquivos — aqui só a
 * decisão, que é o que dá para testar.
 */

export type IdConquista =
  | 'curious-mind'
  | 'reality-shifter'
  | 'movie-nerd'
  | 'terminal-hacker'
  | 'math-doesnt-lie'
  | 'arcade-master'
  | 'dont-touch-this'
  | 'free-time';

export interface Conquista {
  id: IdConquista;
  titulo: string;
  descricao: string;
  icone: string;
  /** Some da lista até ser desbloqueada — vira `🔒 ???`. */
  secreta: boolean;
}

export const CONQUISTAS: Conquista[] = [
  { id: 'curious-mind',    icone: '🏆', secreta: false,
    titulo: 'Curious Mind',    descricao: 'Você encontrou o Creators Lab.' },
  { id: 'reality-shifter',  icone: '🌓', secreta: false,
    titulo: 'Reality Shifter', descricao: 'Conheceu as duas realidades.' },
  { id: 'movie-nerd',       icone: '🎬', secreta: false,
    titulo: 'Movie Nerd',      descricao: 'Abriu tudo que havia no arquivo pessoal.' },
  { id: 'terminal-hacker',  icone: '💾', secreta: false,
    titulo: 'Terminal Hacker', descricao: 'Rodou cinco comandos no terminal.' },
  { id: 'math-doesnt-lie',  icone: '📐', secreta: false,
    titulo: "Math Doesn't Lie", descricao: 'Mexeu em todos os experimentos do Math Lab.' },
  { id: 'arcade-master',    icone: '🕹️', secreta: true,
    titulo: 'Arcade Master',   descricao: 'Zerou a máquina de fliperama.' },
  { id: 'dont-touch-this',  icone: '💣', secreta: true,
    titulo: 'Listening Skills: 0', descricao: 'Você apertou. Cinco vezes.' },
  { id: 'free-time',        icone: '🛋️', secreta: true,
    titulo: 'You Really Have Free Time', descricao: 'Desbloqueou todo o resto.' },
];

/** O que o usuário fez até agora. Cru, sem interpretação. */
export interface Progresso {
  entrou: boolean;
  temasVistos: string[];
  itensAbertos: string[];
  totalItens: number;
  comandosUsados: string[];
  experimentosUsados: string[];
  totalExperimentos: number;
  cliquesProibidos: number;
  segredoArcade: boolean;
}

export const PROGRESSO_VAZIO: Progresso = {
  entrou: false,
  temasVistos: [],
  itensAbertos: [],
  totalItens: 0,
  comandosUsados: [],
  experimentosUsados: [],
  totalExperimentos: 0,
  cliquesProibidos: 0,
  segredoArcade: false,
};

/** Quantos comandos distintos derrubam a conquista do terminal. */
export const COMANDOS_PARA_HACKER = 5;
/** Cliques no botão proibido até a conquista. */
export const CLIQUES_PROIBIDOS = 5;

/**
 * Quais conquistas o progresso já garante.
 *
 * `free-time` depende das outras, então é resolvida depois — e nunca depende de
 * si mesma, senão a lista jamais fecharia.
 */
export function conquistasDesbloqueadas(p: Progresso): Set<IdConquista> {
  const feito = new Set<IdConquista>();

  if (p.entrou) feito.add('curious-mind');
  if (p.temasVistos.length >= 2) feito.add('reality-shifter');

  // Só conta quando existe o que abrir: com o arquivo pessoal ainda vazio,
  // "abriu tudo" seria verdade sem que ninguém tivesse aberto nada.
  if (p.totalItens > 0 && p.itensAbertos.length >= p.totalItens) feito.add('movie-nerd');

  if (p.comandosUsados.length >= COMANDOS_PARA_HACKER) feito.add('terminal-hacker');

  if (p.totalExperimentos > 0 && p.experimentosUsados.length >= p.totalExperimentos) {
    feito.add('math-doesnt-lie');
  }

  if (p.cliquesProibidos >= CLIQUES_PROIBIDOS) feito.add('dont-touch-this');
  if (p.segredoArcade) feito.add('arcade-master');

  // A última: todas as outras, sem contar ela própria.
  const outras = CONQUISTAS.filter(c => c.id !== 'free-time');
  if (outras.every(c => feito.has(c.id))) feito.add('free-time');

  return feito;
}

/** As que acabaram de cair, comparando dois instantes. */
export function novasConquistas(
  antes: Set<IdConquista>, depois: Set<IdConquista>,
): IdConquista[] {
  return [...depois].filter(id => !antes.has(id));
}

/** Chaves de lista do progresso — as que se unem em vez de se substituir. */
const LISTAS = [
  'temasVistos', 'itensAbertos', 'comandosUsados', 'experimentosUsados',
] as const;

/** Chaves numéricas — vale o maior, nunca o mais recente. */
const NUMEROS = ['totalItens', 'totalExperimentos', 'cliquesProibidos'] as const;

/**
 * Junta dois progressos.
 *
 * Existe porque o progresso agora tem DUAS moradas: o navegador (instantâneo)
 * e o banco (preso à pessoa). Ao abrir o Lab as duas versões podem discordar —
 * alguém jogou no celular ontem, hoje abre no computador do trabalho onde o
 * localStorage está vazio.
 *
 * A regra é que progresso **não retrocede**: lista vira união, número vira o
 * maior, booleano vira "algum dos dois". Não existe caso em que "esqueci" seja
 * a resposta certa — ninguém des-descobre um Easter Egg.
 *
 * Repare que isso torna a ordem dos argumentos irrelevante, o que é
 * exatamente o que se quer de uma junção que não tem árbitro de relógio.
 */
export function mesclarProgresso(a: Progresso, b: Progresso): Progresso {
  const juntos: Progresso = { ...a, ...b };

  for (const chave of LISTAS) {
    juntos[chave] = [...new Set([...(a[chave] ?? []), ...(b[chave] ?? [])])];
  }
  for (const chave of NUMEROS) {
    juntos[chave] = Math.max(a[chave] ?? 0, b[chave] ?? 0);
  }
  juntos.entrou        = !!a.entrou || !!b.entrou;
  juntos.segredoArcade = !!a.segredoArcade || !!b.segredoArcade;

  return juntos;
}

/**
 * Um objeto qualquer virado `Progresso` confiável.
 *
 * O que volta do banco é `jsonb`: pode estar velho, incompleto ou com o tipo
 * errado se alguém editou à mão. Em vez de confiar, normaliza campo a campo
 * contra `PROGRESSO_VAZIO` — assim uma linha estragada vira progresso zerado,
 * e não uma página que quebra ao chamar `.length` de `undefined`.
 */
export function normalizarProgresso(cru: unknown): Progresso {
  if (!cru || typeof cru !== 'object') return { ...PROGRESSO_VAZIO };
  const o = cru as Record<string, unknown>;

  const lista = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const numero = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;

  return {
    entrou:             o.entrou === true,
    temasVistos:        lista(o.temasVistos),
    itensAbertos:       lista(o.itensAbertos),
    totalItens:         numero(o.totalItens),
    comandosUsados:     lista(o.comandosUsados),
    experimentosUsados: lista(o.experimentosUsados),
    totalExperimentos:  numero(o.totalExperimentos),
    cliquesProibidos:   numero(o.cliquesProibidos),
    segredoArcade:      o.segredoArcade === true,
  };
}
