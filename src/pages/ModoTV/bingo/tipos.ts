/**
 * tipos.ts — o Bingo do Modo TV, no formato que as RPCs devolvem
 * (migration 20261030200000).
 */

export type TemaBingoId = 'fliperama' | 'chiclete' | 'rpg' | 'galaxia' | 'aquario' | 'bloco' | 'gacha' | 'bichinho';
export type TipoVitoria = 'quina' | 'cheia';

export interface PartidaBingo {
  id: string;
  painel_id: string;
  tema: TemaBingoId;
  estado: 'aberta' | 'encerrada';
  auto_marcar_s: number;
  premio_quina: string | null;
  premio_bingo: string | null;
  som_na_tv: boolean;
  auto_intervalo_s: number | null;
  auto_pausado: boolean;
  proxima_pedra_em: string | null;
  criada_em: string;
  encerrada_em: string | null;
  participantes: number;
}

export interface GritoBingo {
  perfil_id: string;
  nome: string;
  foto: string | null;
  tipo: TipoVitoria;
  em: string;
}

export interface GanhadorBingo {
  perfil_id: string;
  nome: string;
  foto: string | null;
  numeros: number[];
  /** Índices (0–24) da linha vencedora; os 25 na cartela cheia. */
  padrao: number[];
}

export interface VitoriaBingo {
  id: string;
  tipo: TipoVitoria;
  em: string;
  ganhadores: GanhadorBingo[];
}

/** `fn_bingo_estado`: o que todos veem. */
export interface EstadoBingo {
  partida: PartidaBingo;
  /** Na ordem em que saíram. */
  pedras: number[];
  gritos: GritoBingo[];
  vitoria: VitoriaBingo | null;
  agora?: string;
}

/** `fn_bingo_minhas` / `fn_bingo_minha`: o estado e a minha cartela. */
export interface MinhaPartida extends EstadoBingo {
  numeros: number[];
  gritou_tipo: TipoVitoria | null;
}

export interface CartelaNoControle {
  perfil_id: string;
  nome: string;
  foto: string | null;
  equipe_nome: string | null;
  numeros: number[];
  gritou_em: string | null;
  gritou_tipo: TipoVitoria | null;
}

/** `fn_bingo_controle`: a central do líder. */
export interface ControleBingo extends EstadoBingo {
  cartelas: CartelaNoControle[];
  vitorias: { id: string; tipo: TipoVitoria; em: string; ganhadores: string[] | null }[];
}

export interface CandidatoBingo {
  id: string;
  nome: string;
  foto: string | null;
  equipe_id: string | null;
  equipe_nome: string | null;
}

/** `fn_bingo_resumo`: o que cada painel tem, para a central separada por setor. */
export interface ResumoDoPainel {
  painel_id: string;
  aberta: {
    id: string; tema: TemaBingoId; criada_em: string; criada_por: string | null;
    participantes: number; pedras: number; gritos: number;
  } | null;
  anteriores: {
    id: string; tema: TemaBingoId; criada_em: string; encerrada_em: string | null; criada_por: string | null;
    participantes: number; pedras: number; ganhadores: string[];
  }[];
}

/** O aviso que chega pelo canal da partida, da TV e pelo pessoal. */
export type AvisoBingo =
  | { tipo: 'pedra'; partida: string; ordem: number; numero: number }
  | { tipo: 'grito'; partida: string; quem: string; grito: TipoVitoria }
  | { tipo: 'partida' | 'vitoria' | 'convite'; partida: string };
