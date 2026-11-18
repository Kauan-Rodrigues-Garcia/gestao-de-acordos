/**
 * O que toda aba interna do Banco de Horas recebe da página.
 */
import type { FiltroSituacao, Pessoa, Visao } from '@/lib/bancoHoras/calculos';
import type { AbaExcel } from '@/lib/bancoHoras/excel';
import type { ModoImagem } from '@/lib/bancoHoras/imagem';
import type { PosicaoBH } from '@/lib/bancoHoras/tipos';

export type Periodo = '3' | 'todos';

export type AbaBH = 'geral' | 'situacao' | 'pessoas' | 'setores' | 'vencimentos' | 'relatorios';

export interface ContextoBH {
  visao: Visao;
  pos: PosicaoBH;
  /** Pessoas no recorte (setor + busca), sem o filtro de situação. */
  base: Pessoa[];
  /** Pessoas no recorte E na situação escolhida: o que a tela mostra. */
  F: Pessoa[];
  sit: FiltroSituacao;
  limite: number;
  setLimite: (h: number) => void;
  /** «Play 2 · busca "ana"» — para títulos de cópia e Excel. */
  filtroTxt: string;
  setorFiltro: string;
  fotoDe: (p: Pessoa) => string | null;
  /** Os meses (em que a hora foi feita) escolhidos no filtro, do mais antigo ao mais novo. */
  meses: string[];
  /** São os 3 últimos, sem nenhum tirado? (muda só o título do comparativo) */
  mesesPadrao: boolean;
  abrirPessoa: (p: Pessoa) => void;
  ir: (aba: AbaBH, opcoes?: { sit?: FiltroSituacao; setor?: string }) => void;
  excel: (abas: AbaExcel[], nome: string, L?: Pessoa[]) => void;
  imagem: (setor: string, modo?: ModoImagem) => void;
}
