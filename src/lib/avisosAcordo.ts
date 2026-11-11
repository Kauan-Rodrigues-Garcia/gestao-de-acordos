/**
 * src/lib/avisosAcordo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Avisos ANTES de salvar um acordo (pedido do Cleber, 11/11/2026).
 *
 * Não bloqueiam: mostram o que parece fora do padrão e a pessoa escolhe entre
 * corrigir e salvar mesmo assim. O que bloqueia (NR/Código com letra, CPF,
 * valor zerado) continua na validação de cada formulário.
 *
 *   - número no nome do cliente;
 *   - valor acima de R$ 10.000,00 ou abaixo de R$ 10,00;
 *   - vencimento no passado (exceto acordo lançado já pago ou não pago, que é
 *     registro do que aconteceu) ou mais de 60 dias à frente.
 */
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { formatBRL } from '@/lib/money';

export const VALOR_ALTO = 10_000;
export const VALOR_BAIXO = 10;
export const DIAS_A_FRENTE = 60;

export type CampoDoAviso = 'nome' | 'valor' | 'vencimento';

export interface AvisoAcordo {
  campo: CampoDoAviso;
  texto: string;
}

export interface DadosParaAviso {
  nomeCliente: string;
  /** Os valores digitados, cada um com o nome do campo («Valor», «Entrada»…). */
  valores: { rotulo: string; valor: number }[];
  vencimento: string;
  status?: string | null;
  /** Hoje, `yyyy-MM-dd` (fuso de São Paulo — `getTodayISO`). */
  hoje: string;
}

function dataBR(iso: string): string {
  try { return format(parseISO(iso), 'dd/MM/yyyy'); } catch { return iso; }
}

export function avisosAntesDeSalvar(d: DadosParaAviso): AvisoAcordo[] {
  const avisos: AvisoAcordo[] = [];

  const nome = (d.nomeCliente ?? '').trim();
  if (/\d/.test(nome)) {
    avisos.push({ campo: 'nome', texto: `O nome do cliente tem número: «${nome}».` });
  }

  for (const { rotulo, valor } of d.valores) {
    if (!Number.isFinite(valor) || valor <= 0) continue;
    if (valor > VALOR_ALTO) {
      avisos.push({
        campo: 'valor',
        texto: `${rotulo} de ${formatBRL(valor)} — acima de ${formatBRL(VALOR_ALTO)}. Confira se o valor está certo.`,
      });
    } else if (valor < VALOR_BAIXO) {
      avisos.push({
        campo: 'valor',
        texto: `${rotulo} de ${formatBRL(valor)} — abaixo de ${formatBRL(VALOR_BAIXO)}. Confira se o valor está certo.`,
      });
    }
  }

  if (d.vencimento && d.hoje) {
    let dias: number | null = null;
    try { dias = differenceInCalendarDays(parseISO(d.vencimento), parseISO(d.hoje)); } catch { dias = null; }
    const registroDoQueAconteceu = d.status === 'pago' || d.status === 'nao_pago';
    if (dias !== null && Number.isFinite(dias)) {
      if (dias < 0 && !registroDoQueAconteceu) {
        avisos.push({
          campo: 'vencimento',
          texto: `Vencimento no passado (${dataBR(d.vencimento)}).`,
        });
      } else if (dias > DIAS_A_FRENTE) {
        avisos.push({
          campo: 'vencimento',
          texto: `Vencimento daqui a ${dias} dias (${dataBR(d.vencimento)}) — mais de ${DIAS_A_FRENTE} dias à frente.`,
        });
      }
    }
  }

  return avisos;
}
