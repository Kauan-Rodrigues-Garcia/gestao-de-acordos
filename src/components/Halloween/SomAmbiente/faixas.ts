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
  // As de 21/10/2026 entraram no lugar de todas as músicas de antes. Capas do
  // Spotify (oEmbed) e cores tiradas olhando a capa.
  // Funk
  // O preto e branco e o vermelho do «300».
  trezentosno7: {
    nome: '300 no 7', descricao: 'MC GP, MC Jvila e MC LUUKY · Dj Yuri Pedrada', capa: capa('trezentosno7'), Icone: Music,
    cor: { fundo: 'hsl(0 6% 10%)', destaque: 'hsl(0 82% 54%)' },
  },
  // Foto em preto e branco, corredor cinza-azulado: sem cor viva, destaque neutro.
  mdt: {
    nome: 'MDT', descricao: 'Mc Kelvinho e MC Jvila · Caio Passos, DJ Glenner e DJ Thi Marquez', capa: capa('mdt'), Icone: Music,
    cor: { fundo: 'hsl(210 10% 12%)', destaque: 'hsl(0 0% 90%)' },
  },
  // O vermelho escuro da festa e o vermelho do moletom.
  postounodaily: {
    nome: 'Me Postou no Daily · Festa do Big G', descricao: 'MC GP e Mc Lele JP · DJ Davi DogDog e Dj Andrabeat', capa: capa('postounodaily'), Icone: Music,
    cor: { fundo: 'hsl(355 45% 11%)', destaque: 'hsl(358 78% 55%)' },
  },
  // A capa do Deezer (o Spotify não achou a faixa): o álbum «Feliz no Simples».
  // O vermelho do conversível.
  novinhamidia: {
    nome: 'Tô com uma Novinha Mídia', descricao: 'MC IG, Mc Lele JP e MC Neguinho Prt · Oldilla', capa: capa('novinhamidia'), Icone: Music,
    cor: { fundo: 'hsl(356 40% 11%)', destaque: 'hsl(356 80% 54%)' },
  },
  // Rap e trap
  // O estádio no escuro e as luzes vermelhas.
  donodaverdade: {
    nome: 'Dono da Verdade (Ao Vivo)', descricao: 'Veigh', capa: capa('donodaverdade'), Icone: Music,
    cor: { fundo: 'hsl(0 50% 9%)', destaque: 'hsl(0 80% 56%)' },
  },
  // O escritório cinza e o azul-claro do tênis.
  clickbait: {
    nome: 'Clickbait', descricao: 'Veigh, com Niink', capa: capa('clickbait'), Icone: Music,
    cor: { fundo: 'hsl(200 8% 12%)', destaque: 'hsl(190 45% 70%)' },
  },
  // O fundo creme e o azul das tranças.
  walkemdown: {
    nome: 'Walk Em Down', descricao: 'NLE Choppa, com Roddy Ricch', capa: capa('walkemdown'), Icone: Music,
    cor: { fundo: 'hsl(35 15% 12%)', destaque: 'hsl(210 80% 64%)' },
  },
  // Capa do Deezer. O cinza-lilás das nuvens e o amarelo do título.
  mantemopique: {
    nome: 'Mantém o Pique', descricao: 'Ryu, the Runner', capa: capa('mantemopique'), Icone: Music,
    cor: { fundo: 'hsl(250 10% 12%)', destaque: 'hsl(48 95% 56%)' },
  },
  // Sertanejo
  // O sépia do palco e o bege do «PÓS».
  pos: {
    nome: 'Pós (Ao Vivo)', descricao: 'Felipe e Rodrigo', capa: capa('pos'), Icone: Music,
    cor: { fundo: 'hsl(25 25% 11%)', destaque: 'hsl(32 45% 68%)' },
  },
  // A capa toda em vermelho.
  cowboy: {
    nome: 'Nunca Namore um Cowboy (Ao Vivo)', descricao: 'João Carreiro', capa: capa('cowboy'), Icone: Music,
    cor: { fundo: 'hsl(355 35% 12%)', destaque: 'hsl(355 70% 62%)' },
  },
  // A capa no Spotify é um quadro do vídeo (16:9); o recorte quadrado pega o
  // centro. O azul-marinho da camisa listrada.
  temporaldeamor: {
    nome: 'Temporal de Amor / Página de Amigos / Não Olha Assim', descricao: 'César Menotti & Fabiano · Ao Vivo', capa: capa('temporaldeamor'), Icone: Music,
    cor: { fundo: 'hsl(220 30% 10%)', destaque: 'hsl(215 60% 64%)' },
  },
  // O palco escuro e o dourado do nome.
  umdegrau: {
    nome: 'Um Degrau na Escada (Ao Vivo)', descricao: 'Chico Rey & Paraná', capa: capa('umdegrau'), Icone: Music,
    cor: { fundo: 'hsl(35 30% 10%)', destaque: 'hsl(45 85% 58%)' },
  },
  // O DVD inteiro, 43 minutos. O azul-petróleo do título e o amarelo da moldura.
  cetadoido: {
    nome: 'Cê Tá Doido (DVD completo)', descricao: 'Ícaro e Gilmar, Panda e Humberto & Ronaldo', capa: capa('cetadoido'), Icone: Music,
    cor: { fundo: 'hsl(200 45% 12%)', destaque: 'hsl(42 90% 58%)' },
  },
  // Pop
  // O dourado de «Xscape».
  chicago: {
    nome: 'Chicago', descricao: 'Michael Jackson', capa: capa('chicago'), Icone: Music,
    cor: { fundo: 'hsl(38 30% 11%)', destaque: 'hsl(40 75% 58%)' },
  },
  // O céu vermelho atrás da estátua de «HIStory».
  theydontcare: {
    nome: "They Don't Care About Us", descricao: 'Michael Jackson', capa: capa('theydontcare'), Icone: Music,
    cor: { fundo: 'hsl(5 40% 10%)', destaque: 'hsl(8 80% 56%)' },
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
