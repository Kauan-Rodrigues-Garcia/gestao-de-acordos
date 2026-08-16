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
    titulo: 'Arcade Master',   descricao: 'Achou o segredo da máquina.' },
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
