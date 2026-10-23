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
  /** 0 a 1 (operador 0.12, super_admin 1). */
  volume?: number;
  leve?: boolean;
  /** Quantas pessoas de mentira atiram junto (só no ensaio). */
  sims?: number;
  /** O que não vira tiro (padrão: `[data-chefona-livre]`, o menu). */
  livre?: string;
}

export interface PalcoGuerra {
  atualizar(e: EstadoGuerra): void;
  destruir(): void;
}

export function criarPalcoGuerra(o: OpcoesPalcoGuerra): PalcoGuerra;
