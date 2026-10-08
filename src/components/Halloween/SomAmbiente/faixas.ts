/**
 * faixas.ts — nome, autor, ícone e cor de cada faixa.
 *
 * Fica fora do painel (que baixa sob demanda) porque o card «Tocando agora»,
 * que aparece junto do botão, também precisa disso — e ele mora no pacote de
 * entrada.
 */
import type { ComponentType } from 'react';
import { Axe, Bed, Crown, Disc3, Flame, Ghost, Guitar, Lightbulb, ListMusic, Music, Music2, Speaker, Youtube } from 'lucide-react';
import { ehEmbutida, type FaixaEmbutida, type PlaylistSalva } from './preferencias';
import { IconeCandyman } from './IconeCandyman';

export interface InfoFaixa {
  nome: string;
  descricao: string;
  /** Um ícone do lucide ou um desenho próprio, feito do pôster (Candyman). */
  Icone: ComponentType<{ className?: string }>;
  /** Cor da faixa (classe `som-tom-*` em `somAmbiente.css`). */
  tom: string;
}

export const EMBUTIDAS: Record<FaixaEmbutida, InfoFaixa> = {
  halloween: { nome: 'Halloween',      descricao: 'Tema de John Carpenter',         Icone: Ghost, tom: 'som-tom-halloween' },
  sexta13:   { nome: 'Sexta-Feira 13', descricao: 'Tema de Harry Manfredini',       Icone: Axe,   tom: 'som-tom-sexta13' },
  candyman:  { nome: 'Candyman',       descricao: 'Helen’s Theme, de Philip Glass', Icone: IconeCandyman, tom: 'som-tom-candyman' },
  stranger:  { nome: 'Stranger Things', descricao: 'Tema de Kyle Dixon e Michael Stein', Icone: Lightbulb, tom: 'som-tom-stranger' },
  pesadelo:  { nome: 'A Hora do Pesadelo', descricao: 'Tema de Charles Bernstein', Icone: Bed, tom: 'som-tom-pesadelo' },
  // «I Lied To You», do filme Sinners (2025). O arquivo começa no violão: a
  // fala da cena, antes da música, foi cortada.
  pecadores: { nome: 'Eu Menti pra Você', descricao: 'Pecadores (Sinners), com Miles Caton', Icone: Guitar, tom: 'som-tom-pecadores' },
  rainha:    { nome: 'Rainha da Finesse', descricao: 'WIU',                        Icone: Crown,   tom: 'som-tom-rainha' },
  boladao:   { nome: 'Eu Tô Boladão',  descricao: 'Funk de Canalha',                Icone: Speaker, tom: 'som-tom-boladao' },
  numb:      { nome: 'Numb',           descricao: 'Linkin Park',                    Icone: Disc3,   tom: 'som-tom-numb' },
  byob:      { nome: 'B.Y.O.B.',       descricao: 'System Of A Down',               Icone: Flame,   tom: 'som-tom-byob' },
  bicho:     { nome: 'Coisas que Aprendi com o Bicho', descricao: '2zdinizz', Icone: Music, tom: 'som-tom-bicho' },
  gemebaixo: { nome: 'Geme Baixo',     descricao: 'MC JVila, Menor MC e G.A',   Icone: Music2,  tom: 'som-tom-gemebaixo' },
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
