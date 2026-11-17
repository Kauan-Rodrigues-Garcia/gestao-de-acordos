/**
 * intro.ts — o roteiro da inicialização do computador, sem React.
 * ─────────────────────────────────────────────────────────────────────────────
 * O Gestão escurece até o preto e a rota muda. O que vem depois é a máquina
 * fictícia ligando: autoteste, a marca do sistema, a tela de entrada com o
 * nome de quem está logado, e a área de trabalho.
 *
 * Qual sequência roda é decidido AQUI, por função pura, porque é uma decisão
 * com três eixos que se cruzam (primeira visita ou não, movimento reduzido ou
 * não, pular ou não) e é o tipo de coisa que só dá errado em uma das
 * combinações — a que ninguém abriu no navegador.
 *
 * ## As regras
 *
 *  • Todo roteiro COMEÇA em preto. O escurecimento do Gestão termina em preto,
 *    e é isso que deixa a emenda invisível.
 *  • Na primeira visita a sequência é completa e inclui a escolha de aparência,
 *    que espera a pessoa. Não tem como pular a escolha: pular leva ATÉ ela.
 *  • Nas visitas seguintes é curta, de poucos segundos, e pular encerra.
 *  • Com movimento reduzido não há sequência: é uma passagem só, sem nada que
 *    pisque ou trema. Encurtar a sequência normal seria piorar — piscar mais
 *    rápido é exatamente o que a pessoa pediu para não ver.
 */

export type EtapaIntro =
  | 'preto'       // a tela ainda apagada, logo depois do escurecimento
  | 'autoteste'   // as linhas do teste de inicialização
  | 'aparencia'   // a escolha do sistema (só na primeira visita)
  | 'marca'       // a marca do sistema carregando
  | 'entrada'     // a tela de entrada, com nome e foto de quem está logado
  | 'passagem';   // a versão de movimento reduzido: um cartão, e só

export interface PassoIntro {
  etapa: EtapaIntro;
  /** Quanto dura, em ms. `null` = espera a pessoa (clique ou tecla). */
  duracaoMs: number | null;
  /** Tem algo que pisca, treme ou varre a tela neste passo. */
  agitado: boolean;
}

export interface OpcoesIntro {
  /** A pessoa nunca escolheu uma aparência neste navegador. */
  primeiraVisita: boolean;
  movimentoReduzido: boolean;
  /** Quantas linhas o autoteste do tema tem. */
  linhasAutoteste: number;
}

/** Tempo de cada linha do autoteste. Menos que isso e o olho não lê. */
export const PASSO_LINHA_MS = 320;
/** Respiro depois da última linha do autoteste. */
export const PAUSA_AUTOTESTE_MS = 520;
/** Teto da versão curta. "Poucos segundos" é uma promessa, e esta é a régua. */
export const TETO_VISITA_REPETIDA_MS = 4000;

export function roteiroDaIntro(o: OpcoesIntro): PassoIntro[] {
  if (o.movimentoReduzido) {
    return o.primeiraVisita
      ? [
          { etapa: 'aparencia', duracaoMs: null, agitado: false },
          { etapa: 'passagem',  duracaoMs: 1600, agitado: false },
        ]
      : [{ etapa: 'passagem', duracaoMs: 1400, agitado: false }];
  }

  if (o.primeiraVisita) {
    // Quantidade estragada (NaN, negativa, infinita) vira zero linhas: sobra
    // só o respiro, em vez de uma duração que nunca termina.
    const linhas = Number.isFinite(o.linhasAutoteste)
      ? Math.min(Math.max(Math.floor(o.linhasAutoteste), 0), 40)
      : 0;
    return [
      { etapa: 'preto',     duracaoMs: 600, agitado: false },
      { etapa: 'autoteste', duracaoMs: linhas * PASSO_LINHA_MS + PAUSA_AUTOTESTE_MS, agitado: true },
      { etapa: 'aparencia', duracaoMs: null, agitado: false },
      { etapa: 'marca',     duracaoMs: 2400, agitado: true },
      { etapa: 'entrada',   duracaoMs: 2800, agitado: false },
    ];
  }

  return [
    { etapa: 'preto',   duracaoMs: 260,  agitado: false },
    { etapa: 'marca',   duracaoMs: 1250, agitado: true },
    { etapa: 'entrada', duracaoMs: 1400, agitado: false },
  ];
}

/** Soma do que roda sozinho. Passos que esperam a pessoa não entram. */
export function duracaoAutomaticaMs(roteiro: PassoIntro[]): number {
  return roteiro.reduce((soma, p) => soma + (p.duracaoMs ?? 0), 0);
}

/**
 * O passo seguinte, ou `null` quando a inicialização acabou.
 *
 * Aceita índice fora do roteiro sem quebrar: vira "acabou".
 */
export function proximoPasso(roteiro: PassoIntro[], indice: number): number | null {
  const proximo = indice + 1;
  return proximo >= 0 && proximo < roteiro.length ? proximo : null;
}

/**
 * Para onde vai quem pediu para pular (clique ou tecla).
 *
 * Pular nunca atravessa um passo que espera a pessoa: a escolha de aparência
 * da primeira visita não tem resposta padrão, então pular leva ATÉ ela. Quem
 * já está nela não pula — escolhe. Sem passo de espera pela frente, pular
 * encerra (`null`).
 */
export function aoPular(roteiro: PassoIntro[], indice: number): number | null {
  const atual = roteiro[indice];
  if (atual && atual.duracaoMs === null) return indice;

  for (let i = indice + 1; i < roteiro.length; i++) {
    if (roteiro[i].duracaoMs === null) return i;
  }
  return null;
}

/** O roteiro tem algum passo em que a pessoa escolhe a aparência? */
export function pedeAparencia(roteiro: PassoIntro[]): boolean {
  return roteiro.some(p => p.etapa === 'aparencia');
}
