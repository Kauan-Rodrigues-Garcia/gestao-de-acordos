/**
 * faixas.ts — nome, autor, capa e cores de cada faixa.
 *
 * Fica fora do painel (que baixa sob demanda) porque o card «Tocando agora»,
 * que aparece junto do botão, também precisa disso — e ele mora no pacote de
 * entrada.
 *
 * ## Capa e cores (13/10/2026)
 *
 * As capas vêm do Spotify (oEmbed público, 300×300) e moram em
 * `public/sounds/capas/`: a tela não depende do Spotify para abrir.
 *
 * As duas cores saíram da própria capa, medidas uma vez (matiz dominante entre
 * os pixels saturados, no Chromium) e ajustadas à mão — e não na hora, na tela
 * de cada um: metade das capas é quase preto e branco (Halloween, Saw,
 * Provavelmente), e a média daria um cinza que não diz nada.
 *
 *   `fundo`    escuro, o chão do «Tocando agora» — texto claro por cima;
 *   `destaque` o tom vivo da capa (o laranja do título de Halloween, o
 *              vermelho do balão de IT), no play e no equalizador. Capa sem
 *              cor nenhuma ganha destaque neutro: inventar uma cor mentiria
 *              sobre o disco.
 */
import type { ComponentType } from 'react';
import { Ghost, ListMusic, Music, Youtube } from 'lucide-react';
import { ehEmbutida, type FaixaEmbutida, type PlaylistSalva } from './preferencias';

export interface CorFaixa {
  /** Fundo escuro do «Tocando agora». Qualquer cor CSS. */
  fundo: string;
  /** O tom vivo da capa. Qualquer cor CSS. */
  destaque: string;
}

export interface InfoFaixa {
  nome: string;
  descricao: string;
  /** Capa do disco. Sem ela (playlists, ou a imagem não carregou), vale o ícone. */
  capa?: string;
  Icone: ComponentType<{ className?: string }>;
  cor: CorFaixa;
}

const capa = (id: string) => `/sounds/capas/${id}.jpg`;

export const EMBUTIDAS: Record<FaixaEmbutida, InfoFaixa> = {
  saw: {
    nome: 'Hello Zepp', descricao: 'Jogos Mortais · Charlie Clouser', capa: capa('saw'), Icone: Ghost,
    cor: { fundo: 'hsl(351 22% 12%)', destaque: 'hsl(354 78% 56%)' },
  },
  deadsilence: {
    nome: 'Dead Silence', descricao: 'Gritos Mortais · Charlie Clouser', capa: capa('deadsilence'), Icone: Ghost,
    cor: { fundo: 'hsl(10 30% 13%)', destaque: 'hsl(8 75% 60%)' },
  },
  it: {
    nome: 'Every 27 Years', descricao: 'It: A Coisa · Benjamin Wallfisch', capa: capa('it27'), Icone: Ghost,
    cor: { fundo: 'hsl(215 16% 13%)', destaque: 'hsl(355 80% 57%)' },
  },
  halloween: {
    nome: 'Halloween', descricao: 'Tema de John Carpenter', capa: capa('halloween'), Icone: Ghost,
    cor: { fundo: 'hsl(30 6% 11%)', destaque: 'hsl(28 92% 56%)' },
  },
  stranger: {
    nome: 'Stranger Things', descricao: 'Tema de Kyle Dixon e Michael Stein', capa: capa('stranger'), Icone: Ghost,
    cor: { fundo: 'hsl(0 45% 9%)', destaque: 'hsl(0 85% 57%)' },
  },
  provavelmente: {
    nome: 'Provavelmente', descricao: 'Hungria', capa: capa('provavelmente'), Icone: Music,
    cor: { fundo: 'hsl(220 6% 13%)', destaque: 'hsl(0 0% 90%)' },
  },
  doiwannaknow: {
    nome: 'Do I Wanna Know?', descricao: 'Arctic Monkeys', capa: capa('doiwannaknow'), Icone: Music,
    cor: { fundo: 'hsl(190 10% 10%)', destaque: 'hsl(0 0% 92%)' },
  },
  novobalanco: {
    nome: 'Novo Balanço', descricao: 'Veigh', capa: capa('novobalanco'), Icone: Music,
    cor: { fundo: 'hsl(30 28% 15%)', destaque: 'hsl(36 85% 60%)' },
  },
  raindance: {
    nome: 'Raindance', descricao: 'Dave, com Tems', capa: capa('raindance'), Icone: Music,
    cor: { fundo: 'hsl(40 22% 13%)', destaque: 'hsl(43 90% 62%)' },
  },
  // Capa amarela com o vestido verde-azulado: o fundo vem do vestido, o
  // destaque do dourado do título «Decretos Reais».
  leao: {
    nome: 'Leão', descricao: 'Marília Mendonça', capa: capa('leao'), Icone: Music,
    cor: { fundo: 'hsl(186 34% 13%)', destaque: 'hsl(44 88% 58%)' },
  },
  // As de 14/10/2026, cores tiradas olhando a capa.
  // A parede escura da favela e o creme do título.
  poesiaacustica: {
    nome: 'Poesia Acústica #6', descricao: 'Era uma Vez · Pineapple StormTv', capa: capa('poesiaacustica'), Icone: Music,
    cor: { fundo: 'hsl(28 20% 12%)', destaque: 'hsl(50 80% 70%)' },
  },
  // O céu azul atrás do Veigh.
  vidachique: {
    nome: 'Vida Chique', descricao: 'Veigh', capa: capa('vidachique'), Icone: Music,
    cor: { fundo: 'hsl(205 30% 13%)', destaque: 'hsl(203 70% 64%)' },
  },
  // O diabinho roxo no fundo preto.
  malvadinho: {
    nome: 'Malvadinho', descricao: 'MC Luuky · DJ JB Mix', capa: capa('malvadinho'), Icone: Music,
    cor: { fundo: 'hsl(282 32% 10%)', destaque: 'hsl(286 72% 64%)' },
  },
  // O palco azul do «Ao Vivo».
  infiel: {
    nome: 'Infiel', descricao: 'Marília Mendonça', capa: capa('infiel'), Icone: Music,
    cor: { fundo: 'hsl(232 40% 13%)', destaque: 'hsl(226 85% 68%)' },
  },
  // A tinta azul-marinho e o pêssego de «Bloom».
  innerbloom: {
    nome: 'Innerbloom', descricao: 'RÜFÜS DU SOL', capa: capa('innerbloom'), Icone: Music,
    cor: { fundo: 'hsl(222 36% 13%)', destaque: 'hsl(22 72% 70%)' },
  },
  // A faixa marrom do topo e o cáqui do violão.
  deixemeir: {
    nome: 'Deixe Me Ir', descricao: '1Kilo · Baviera, Pablo Martins e Knust', capa: capa('deixemeir'), Icone: Music,
    cor: { fundo: 'hsl(35 26% 12%)', destaque: 'hsl(42 42% 64%)' },
  },
  // Papel cru com quatro quadrantes; o laranja é o único tom vivo.
  somebody: {
    nome: 'Somebody That I Used To Know', descricao: 'Gotye, com Kimbra', capa: capa('somebody'), Icone: Music,
    cor: { fundo: 'hsl(36 10% 12%)', destaque: 'hsl(30 88% 56%)' },
  },
};

const COR_SPOTIFY: CorFaixa = { fundo: 'hsl(141 30% 11%)', destaque: 'hsl(141 70% 48%)' };
const COR_YOUTUBE: CorFaixa = { fundo: 'hsl(0 30% 11%)', destaque: 'hsl(0 78% 58%)' };

export function infoDaPlaylist(p: PlaylistSalva): InfoFaixa {
  const youtube = p.id.startsWith('youtube:');
  return {
    nome: p.nome,
    descricao: p.descricao ?? (youtube ? 'YouTube' : 'Spotify'),
    ...(p.capa ? { capa: p.capa } : {}),
    Icone: youtube ? Youtube : ListMusic,
    cor: youtube ? COR_YOUTUBE : COR_SPOTIFY,
  };
}

/** O que mostrar de uma faixa qualquer; `null` se ela não existe mais. */
export function infoDaFaixa(id: string, playlists: PlaylistSalva[]): InfoFaixa | null {
  if (ehEmbutida(id)) return EMBUTIDAS[id];
  const p = playlists.find(x => x.id === id);
  return p ? infoDaPlaylist(p) : null;
}

/** As variáveis CSS das cores da faixa, para o `style` de quem a pinta. */
export function estiloDaFaixa(info: InfoFaixa): Record<'--som-fundo' | '--som-destaque', string> {
  return { '--som-fundo': info.cor.fundo, '--som-destaque': info.cor.destaque };
}
