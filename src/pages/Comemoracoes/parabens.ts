/**
 * parabens.ts — o que a festa diz para convidar o parabéns, e o que se diz
 * ao parabenizar.
 *
 * Pedido do Cleber, 15/10/2026: o botão de parabenizar tem que chamar a
 * atenção e falar diferente conforme a festa é de uma pessoa, de várias, de
 * uma equipe ou de um setor. A frase de cada parabéns continua sorteada no
 * clique e gravada na linha (ver `frases.ts`): todo mundo vê a mesma.
 *
 * Puro, sem React: tem teste.
 */
import type { AlvoTipo } from '@/services/comemoracoes.service';

export type AlvoParabens = 'individual' | 'grupo' | 'equipe' | 'setor';

export function alvoDosParabens(alvoTipo: AlvoTipo | null | undefined, homenageados: number): AlvoParabens {
  if (alvoTipo === 'equipe') return 'equipe';
  if (alvoTipo === 'setor') return 'setor';
  return homenageados > 1 ? 'grupo' : 'individual';
}

export interface ContextoParabens {
  alvo: AlvoParabens;
  /**
   * Quem é festejado, já pronto para a frase: "Ana", "Ana e João" (pessoas)
   * ou o nome da equipe/setor. Vazio = sem nome, e a frase fica genérica.
   */
  nome: string;
  /** Quem está vendo é da equipe/setor festejado — "Sua equipe bateu a meta!". */
  doMeuTime: boolean;
}

// ── Convite (o que o botão diz) ──────────────────────────────────────────────

/** As chamadas que se revezam acima do botão. Nunca vazio. */
export function chamadasDoConvite({ alvo, nome, doMeuTime }: ContextoParabens): string[] {
  switch (alvo) {
    case 'individual':
      return nome
        ? [`${nome} bateu a meta! 🏆`, `Mande seus parabéns para ${nome}`, 'Um parabéns agora faz o dia de alguém']
        : ['Meta batida! 🏆', 'Mande seus parabéns', 'Um parabéns agora faz o dia de alguém'];
    case 'grupo':
      return [
        nome ? `${nome} bateram a meta! 🏆` : 'Meta batida! 🏆',
        'Parabenize o pessoal',
        'Mostre que o time está junto',
      ];
    case 'equipe':
      if (doMeuTime) return ['Sua equipe bateu a meta! 🏆', 'Parabenize seus colegas de time', 'Vitória do time é de todo mundo'];
      return [
        nome ? `A equipe ${nome} bateu a meta! 🏆` : 'A equipe bateu a meta! 🏆',
        'Mande os parabéns para o time',
        'Reconhecer o time também é jogar junto',
      ];
    case 'setor':
      if (doMeuTime) return ['Nosso setor bateu a meta! 🏆', 'Comemore com todo mundo', 'Essa vitória é de cada um de nós'];
      return [
        nome ? `O setor ${nome} bateu a meta! 🏆` : 'O setor bateu a meta! 🏆',
        'Aplauda o setor',
        'Vitória de um setor é vitória da empresa',
      ];
  }
}

/** O texto do botão — e o nome dele para leitor de tela e teste. */
export function textoDoBotao({ alvo, nome }: ContextoParabens): string {
  if (alvo === 'individual') return nome ? `Parabenizar ${nome}` : 'Parabenizar';
  if (alvo === 'grupo') return 'Parabenizar o time';
  if (alvo === 'equipe') return 'Parabenizar a equipe';
  return 'Parabenizar o setor';
}

/** O que o botão vira depois do clique. */
export function textoEnviado({ alvo, nome }: ContextoParabens): string {
  if (alvo === 'individual') return nome ? `Você parabenizou ${nome}!` : 'Parabéns enviado!';
  if (alvo === 'grupo') return 'Você parabenizou o time!';
  if (alvo === 'equipe') return 'Você parabenizou a equipe!';
  return 'Você parabenizou o setor!';
}

/** Quem é festejado não ganha botão: ganha o aviso de que está sendo aplaudido. */
export function textoDoHomenageado(alvo: AlvoParabens): string {
  return alvo === 'individual'
    ? 'Seus colegas estão te parabenizando! 🎉'
    : 'Seus colegas estão parabenizando vocês! 🎉';
}

// ── Frases (o que cada parabéns diz no mural) ────────────────────────────────

export const FRASES_POR_ALVO: Record<AlvoParabens, readonly string[]> = {
  individual: [
    'Parabéns pela meta!', 'Você conseguiu!', 'Que orgulho!', 'Merecido demais!', 'Arrasou!',
    'É isso aí!', 'Show de bola!', 'Tá voando!', 'Mandou muito bem!', 'Inspiração pro time!',
  ],
  grupo: [
    'Parabéns, pessoal!', 'Vocês arrasaram!', 'Que turma!', 'Merecido demais!', 'Mandaram muito bem!',
    'Orgulho de vocês!', 'Juntos são imbatíveis!', 'Show de bola!',
  ],
  equipe: [
    'Parabéns, equipe!', 'Time campeão!', 'Que equipe!', 'Vocês são demais!', 'Orgulho desse time!',
    'Equipe de respeito!', 'Bora pra próxima!', 'Mandaram muito bem!',
  ],
  setor: [
    'Parabéns, setor!', 'Setor campeão!', 'Vitória de todos!', 'Que resultado!', 'Orgulho de fazer parte!',
    'Todo mundo junto!', 'Bora pra cima!', 'Que setor!',
  ],
};

/** Sorteia a frase do parabéns. `aleatorio` é injetável para o teste fixar. */
export function sortearFraseDoAlvo(alvo: AlvoParabens, aleatorio: () => number = Math.random): string {
  const lista = FRASES_POR_ALVO[alvo];
  const i = Math.floor(aleatorio() * lista.length);
  return lista[Math.min(Math.max(0, i), lista.length - 1)];
}

// ── Ensaio ───────────────────────────────────────────────────────────────────

/**
 * Colegas de mentira para o "Testar" do estúdio: chegam um a um no mural,
 * para quem monta ver como fica. Nunca vão ao banco.
 */
export const COLEGAS_DO_ENSAIO: readonly { nome: string; aposMs: number }[] = [
  { nome: 'Ana Clara', aposMs: 1_800 },
  { nome: 'Bruno',     aposMs: 3_200 },
  { nome: 'Carla',     aposMs: 4_600 },
  { nome: 'Diego',     aposMs: 6_400 },
  { nome: 'Elisa',     aposMs: 8_200 },
  { nome: 'Fábio',     aposMs: 10_500 },
  { nome: 'Gabi',      aposMs: 13_000 },
];

/** Os colegas do ensaio que cabem na duração — o último chega com folga antes do fim. */
export function colegasQueCabem(duracaoS: number): readonly { nome: string; aposMs: number }[] {
  return COLEGAS_DO_ENSAIO.filter((c) => c.aposMs <= duracaoS * 1000 - 1_500);
}
