/**
 * textos.ts — o que muda na tela conforme o TIPO da votação (12/11/2026).
 *
 *   lideranca  os líderes votam uns nos outros (desde 04/11/2026)
 *   gerentes   a operação (setores e equipes escolhidos) vota nos gerentes
 *
 * A mecânica é a mesma; mudam as palavras e quem vota. O banco guarda o tipo
 * em `votacao_lideranca.tipo` (migration 20261112160000).
 */
export type TipoDaVotacao = 'lideranca' | 'gerentes';

export const ehTipoDaVotacao = (v: unknown): v is TipoDaVotacao => v === 'lideranca' || v === 'gerentes';

export interface TextosDaVotacao {
  /** «Votação da Liderança» / «Votação dos Gerentes». */
  nome: string;
  /** Quem concorre, no singular e no plural, minúsculo. */
  pessoa: string;
  pessoas: string;
  /** Com maiúscula, para rótulo de cartão sem nome. */
  Pessoa: string;
  /** O título da abertura. */
  chamada: string;
  /** Quem vota, para os avisos («os líderes» / «a operação»). */
  quemVota: string;
}

export const TEXTOS_DO_TIPO: Record<TipoDaVotacao, TextosDaVotacao> = {
  lideranca: {
    nome: 'Votação da Liderança', pessoa: 'líder', pessoas: 'líderes', Pessoa: 'Líder',
    chamada: 'Quem é quem na liderança?', quemVota: 'os líderes',
  },
  gerentes: {
    nome: 'Votação dos Gerentes', pessoa: 'gerente', pessoas: 'gerentes', Pessoa: 'Gerente',
    chamada: 'Quem é quem na gerência?', quemVota: 'a operação',
  },
};

export const textosDo = (tipo: string | null | undefined): TextosDaVotacao =>
  TEXTOS_DO_TIPO[ehTipoDaVotacao(tipo) ? tipo : 'lideranca'];
