/**
 * tipos.ts — o que o estúdio carrega uma vez e as etapas consultam.
 */
import type { PessoaComemoracao } from '@/services/comemoracoes.service';
import type { MidiaComemoracao } from '@/services/comemoracaoMidias.service';
import type { CloneVinculo } from '@/pages/Comemoracoes/clones';
import type { Rascunho } from './rascunho';

export interface PessoaEstudio extends PessoaComemoracao {
  setor_id:  string | null;
  equipe_id: string | null;
}

export interface DadosEstudio {
  pessoas:  PessoaEstudio[];
  equipes:  { id: string; nome: string; setor_id: string | null }[];
  setores:  { id: string; nome: string }[];
  clones:   CloneVinculo[];
  /** Músicas da empresa. null = biblioteca indisponível neste banco. */
  musicas:  MidiaComemoracao[] | null;
}

/** Atualiza parte do rascunho. */
export type MudarRascunho = (mudanca: Partial<Rascunho> | ((r: Rascunho) => Partial<Rascunho>)) => void;
