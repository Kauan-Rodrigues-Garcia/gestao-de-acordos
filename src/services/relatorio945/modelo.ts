/**
 * modelo.ts — tipos e regras puras da importação do relatório 945.
 *
 * A regra de cobertura mora no banco (`private.r945_inicio_exigido`, migration
 * 20261026150000); aqui só o que a tela precisa para mostrar e para recusar
 * antes de mandar o arquivo — o banco recusa de novo de qualquer jeito.
 */

export type EstadoDia = 'consolidado' | 'completo' | 'parcial' | 'sem_importacao';

export interface DiaCobertura {
  data: string;
  estado: EstadoDia;
  /** Maior corte (Dt.Baixa + Horário) de um arquivo que cobriu o dia. */
  corte: string | null;
  atualizado_em: string | null;
  /** Baixas com Id.Baixa no recebimento diário. */
  diario: number;
  /** Baixas no Relatório de pagamento da diretoria. */
  diretoria: number;
}

export interface Cobertura {
  hoje: string;
  /** Dia em que o próximo arquivo precisa começar; null = qualquer dia. */
  inicio_exigido: string | null;
  /** O diário só guarda daqui em diante (1º dia do mês anterior). */
  piso_diario: string;
  ultimo_corte: string | null;
  dias: DiaCobertura[];
}

export interface FaltaNoArquivo { data: string; quantidade: number; total?: number; valor?: number }

export interface Conferencia extends Cobertura {
  /** No Relatório de pagamento, dentro do período, e fora do arquivo. Total em centavos. */
  ausentes_diretoria: FaltaNoArquivo[];
  /** No recebimento diário, dentro do período, e fora do arquivo. Valor em reais. */
  ausentes_diario: FaltaNoArquivo[];
  /** Linhas do diário sem Id.Baixa: nunca vieram de um 945. Valor em reais. */
  sem_id_diario: FaltaNoArquivo[];
}

export interface NovoPorOperador { operadorId: string; novosPagamentos: number; totalNovo: number }

export interface ResultadoImportacao945 {
  inseridos: number;
  atualizados: number;
  ignorados: number;
  removidos: number;
  diario: null | {
    inseridos: number;
    atualizados: number;
    removidos_sem_id: number;
    removidos_ausentes: number;
    novos_por_operador: NovoPorOperador[];
  };
}

export const ROTULO_ESTADO: Readonly<Record<EstadoDia, string>> = {
  consolidado: 'Consolidado',
  completo: 'Completo',
  parcial: 'Parcial',
  sem_importacao: 'Sem importação',
};

export const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const diaDaSemana = (iso: string) => DIAS_SEMANA[new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()];

/** «26/10 08:55» de um timestamptz, na hora de São Paulo. */
export function horaDoCorte(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).replace(',', '');
}

/** O corte que o parser lê vem em hora local sem fuso: «2026-10-26T08:55:00». */
export function horaDoCorteLocal(local: string | null): string {
  if (!local) return '—';
  return `${dataBR(local.slice(0, 10))} ${local.slice(11, 16)}`;
}

/**
 * O arquivo começa tarde demais? Mesma conta da função do banco: só importa se
 * o arquivo chega na zona aberta (fim ≥ exigido) e começa depois dela.
 */
export function faltaInicio(inicio: string, fim: string, exigido: string | null): boolean {
  return !!exigido && fim >= exigido && inicio > exigido;
}

/** A frase que diz o que exportar no ERP. */
export function instrucaoDeExportacao(c: Pick<Cobertura, 'inicio_exigido' | 'hoje'>): string {
  if (!c.inicio_exigido) return 'Hoje já tem arquivo cobrindo os últimos dias: pode importar o 945 de qualquer período, até só de hoje.';
  return `Exporte o relatório 945 com data inicial ${dataBR(c.inicio_exigido)} (${diaDaSemana(c.inicio_exigido)}) até hoje.`;
}

export const somaQuantidade = (xs: readonly FaltaNoArquivo[]) => xs.reduce((s, x) => s + x.quantidade, 0);
