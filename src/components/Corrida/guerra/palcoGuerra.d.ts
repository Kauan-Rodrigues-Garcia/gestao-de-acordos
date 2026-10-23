import type { LoteDeGolpes } from './regras';
import type { EstadoGuerra } from './tipos';

export interface OpcoesPalcoGuerra {
  /** Um div solto no body: o palco é dono dele (e o esvazia no `destruir`). */
  raiz: HTMLElement;
  /** Onde estão os alvos (`data-alvo-feitico`) e o que treme. Padrão: o body. */
  pagina?: HTMLElement;
  /** O relógio do banco, em ms (`agoraBanco`). */
  agora: () => number;
  estado: EstadoGuerra;
  /** O número e o dono do cavalo que sobrou (para o título e o HUD). */
  numero?: number | string;
  dono?: string;
  /** Quem está olhando (para destacar no placar). */
  eu?: string;
  /** A janela da corrida, para estourar em cacos (o canvas é lido, se der). */
  janela?: { rect: DOMRect; canvas?: HTMLCanvasElement | null } | null;
  /** Os tiros desta tela a cada `GUERRA.loteMs`. `false`: freado, o lote volta para o próximo. */
  aoGolpear?: (l: LoteDeGolpes) => Promise<boolean>;
  /** Só no ensaio: os tiros da gente de mentira. */
  aoGolpearSim?: (quem: string, l: LoteDeGolpes) => void;
  aoFim?: (venceu: boolean) => void;
  /** 0 a 1 (operador 0.12, super_admin 1), já com a barrinha de volume da janela. */
  volume?: number;
  /** O modo leve do app: a qualidade automática começa (e fica) no leve. */
  leve?: boolean;
  /** Quantas pessoas de mentira atiram junto (só no ensaio). */
  sims?: number;
  /** O que não vira tiro (padrão: `[data-chefona-livre]`, o menu). */
  livre?: string;
  /**
   * O escudo (padrão: ligado): todo clique na página é tiro. Desligado (o super_admin, como na
   * Bruxa), só vira tiro o clique em cima de um alvo; o resto chega no Gestão.
   */
  escudo?: boolean;
  /** A música do anjo descendo (padrão: `/sons/guerra/anjo-celestial.mp3`). */
  musicaAnjo?: string;
}

export type AtaqueDoChefe = 'cabecada' | 'investida' | 'sopro' | 'invocar' | 'cavaleiros';

export interface PalcoGuerra {
  atualizar(e: EstadoGuerra): void;
  /** O teste do chefe: um ataque agora. */
  forcar(tipo: AtaqueDoChefe): void;
  /** O teste do chefe: quantos robôs atiram junto. */
  simular(n: number): void;
  /** O volume (0 a 1) agora: a barrinha da janela da corrida. */
  volume(v: number): void;
  /** O nível da qualidade automática agora: 0 leve, 1 normal, 2 forte. */
  readonly qualidade: 0 | 1 | 2;
  destruir(): void;
}

export function criarPalcoGuerra(o: OpcoesPalcoGuerra): PalcoGuerra;
