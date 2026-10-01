/**
 * faixas.ts — nome, autor, ícone e cor de cada faixa.
 *
 * Fica fora do painel (que baixa sob demanda) porque o card «Tocando agora»,
 * que aparece junto do botão, também precisa disso — e ele mora no pacote de
 * entrada.
 */
import { Axe, Bug, Ghost, ListMusic, Mic, Youtube, type LucideIcon } from 'lucide-react';
import { ehEmbutida, type FaixaEmbutida, type PlaylistSalva } from './preferencias';

export interface InfoFaixa {
  nome: string;
  descricao: string;
  Icone: LucideIcon;
  /** Cor da faixa (classe `som-tom-*` em `index.css`). */
  tom: string;
}

export const EMBUTIDAS: Record<FaixaEmbutida, InfoFaixa> = {
  halloween: { nome: 'Halloween',      descricao: 'Tema de John Carpenter',         Icone: Ghost, tom: 'som-tom-halloween' },
  sexta13:   { nome: 'Sexta-Feira 13', descricao: 'Tema de Harry Manfredini',       Icone: Axe,   tom: 'som-tom-sexta13' },
  candyman:  { nome: 'Candyman',       descricao: 'Helen’s Theme, de Philip Glass', Icone: Bug,   tom: 'som-tom-candyman' },
  veigh:     { nome: 'Talvez Você Precise de Mim', descricao: 'Veigh',              Icone: Mic,   tom: 'som-tom-veigh' },
};

export function infoDaPlaylist(p: PlaylistSalva): InfoFaixa {
  const youtube = p.id.startsWith('youtube:');
  return {
    nome: p.nome,
    descricao: youtube ? 'YouTube' : 'Spotify',
    Icone: youtube ? Youtube : ListMusic,
    tom: youtube ? 'som-tom-youtube' : 'som-tom-spotify',
  };
}

/** O que mostrar de uma faixa qualquer; `null` se ela não existe mais. */
export function infoDaFaixa(id: string, playlists: PlaylistSalva[]): InfoFaixa | null {
  if (ehEmbutida(id)) return EMBUTIDAS[id];
  const p = playlists.find(x => x.id === id);
  return p ? infoDaPlaylist(p) : null;
}
