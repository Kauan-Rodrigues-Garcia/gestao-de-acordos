/** O contrato de `motor.js` (JavaScript puro, ver o cabeçalho de lá). */
import type { Estilo } from './bichinhos';

export type EstadoCorrida = 'preparando' | 'aberta' | 'correndo' | 'encerrada' | 'cancelada';

export interface CorridaNoMotor {
  id: number;
  premio: string | null;
  estado: EstadoCorrida;
  /** Segundos no relógio do banco. */
  abertaEm: number | null;
  iniciaEm: number | null;
}

export interface PessoaNoMotor {
  id: string;
  nome: string;
  setor: string | null;
  foto: string | null;
  corre: boolean;
  assiste: boolean;
  /** O bichinho de quem corre (o escolhido ou o sorteado entre os três). */
  est: Estilo | null;
  /** Quando entrou no lobby (segundos no relógio do banco). */
  entrouEm: number | null;
  escolhidaEm: number | null;
}

/** A gravação de uma corrida: o que o motor reproduz. Serializada por `gravacao.ts`. */
export interface Gravacao {
  seed: number;
  mapa: string;
  fps: number;
  n: number;
  frames: number;
  dur: number;
  vencedor: number;
  tVenc: number;
  /** O id de cada pessoa, na ordem de `nomes` (o `dono` de cada bichinho aponta para cá). */
  ids: string[];
  nomes: string[];
  setores: string[];
  dono: number[];
  est: Estilo[];
  X: Int16Array;
  Y: Int16Array;
  F: Uint8Array;
  tFim: Float32Array;
  ordem: Int16Array;
  [chave: string]: unknown;
}

export interface VideosDaFesta {
  /** URLs (blob:) dos dois vídeos já baixados. */
  festa: string;
  loop: string;
  /** Os sons da festa: [segundo do vídeo, qual]. */
  cues: Array<[number, string]>;
  /** Duração do vídeo principal, em segundos. */
  dur: number;
}

export interface ResultadoGravacao {
  rec: Gravacao;
  semente: number;
  mapa: string;
  faixa: string[];
  parada: number;
  vencedor: string | null;
  durShow: number;
  /** Null quando o navegador não grava vídeo: a festa é desenhada ao vivo em cada tela. */
  video: { festa: Blob; loop: Blob; cues: Array<[number, string]>; dur: number } | null;
}

export type TelaDoMotor = 'nada' | 'preparo' | 'lobby' | 'show' | 'carregando' | 'corrida' | 'festa' | 'video' | 'cancelada';

export interface Painel {
  tela: TelaDoMotor;
  musica: { qual: 'lobby' | 'corrida' | 'vitoria' | null; tocando: boolean; pct: number };
  volume: { max: number; mudo: boolean };
  placar?: Array<{ pos: number; id: string | null; nome: string; setor: string; onde: string; est: Estilo; voce: boolean }>;
  narracao?: Array<{ t: number; txt: string }>;
  tempo?: number;
  vencedor?: { id: string | null; nome: string };
  festa?: { ef: number; acabou: boolean; replay: boolean };
  show?: { fase: string; t: number };
}

export interface OpcoesMotor {
  pista: HTMLCanvasElement;
  cerimonia: HTMLCanvasElement;
  videoFesta?: HTMLVideoElement | null;
  videoLoop?: HTMLVideoElement | null;
  sons: { lobby: string; vitoria: string; corrida?: readonly string[] };
  /** O AudioContext criado no clique («Assistir», «Testar»): o navegador só deixa tocar som depois de um clique. */
  audio?: AudioContext | null;
  aoPainel?: (painel: Painel) => void;
}

export interface Motor {
  setRelogio(agora: () => number): void;
  setEu(id: string | null): void;
  setCorrida(corrida: CorridaNoMotor | null): void;
  setPessoas(pessoas: PessoaNoMotor[]): void;
  entrou(id: string, quando: number): void;
  setGravacao(rec: Gravacao | null, extra?: { faixa: string[]; parada: number }): void;
  setVideos(videos: VideosDaFesta | null): void;
  entrar(): void;
  sair(): void;
  reagir(tipo: 'palmas' | 'torcer' | 'coracao' | 'ola'): void;
  /** Liga ou desliga o desenho do lobby (o som e a linha do tempo seguem). */
  setLobbyVisivel(visivel: boolean): void;
  volume(max?: number, mudo?: boolean): void;
  ligarEq(barras: ArrayLike<HTMLElement>): void;
  seguir(id: string | null): void;
  gravar(opcoes: {
    pessoas: Array<{ id: string; nome: string; setor: string | null; foto: string | null; est: Estilo }>;
    premio: string | null;
    aoProgresso?: (fracao: number) => void;
    cancelado?: () => boolean;
  }): Promise<ResultadoGravacao | null>;
  podeGravarVideo(): boolean;
  fontesProntas(): void;
  destruir(): void;
}

export function criarMotor(opcoes: OpcoesMotor): Motor;
