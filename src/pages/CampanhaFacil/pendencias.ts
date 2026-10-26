/**
 * pendencias.ts — as pendências da campanha, separadas por tipo (26/10/2026).
 *
 * Antes só a pendência grave (valor que vira R$ 0) tinha o «Tirar da
 * campanha»; quem estava só sem WhatsApp aparecia como «Revisar» e não tinha
 * como sair. Pedido do usuário: qualquer dado faltando é pendência, cada tipo
 * contado à parte (50 sem telefone, 50 sem nome) e dá para tirar todos de uma
 * vez, sem o líder corrigir um por um.
 */
import type { CampaignItem } from './lib/campaign-core';
import { PENDENCIA_PARCELA_MINIMA } from './parcela-minima';

/**
 * Não é pendência do cliente: aparece em todos quando nenhum operador foi
 * marcado, e se resolve marcando operador, não tirando gente.
 */
const PENDENCIA_DO_FORMULARIO = 'Quem encaminhará não informado';

export interface GrupoDePendencia {
  motivo: string;
  quantidade: number;
  /** Estraga o texto da mensagem (valor que vira R$ 0). */
  grave: boolean;
  /** Impede exportar e liberar até resolver (a parcela mínima). */
  trava: boolean;
}

/** As pendências do cliente que contam — sem a do formulário. */
export function pendenciasDoItem(item: Pick<CampaignItem, 'issues'>): string[] {
  return item.issues.filter((m) => m !== PENDENCIA_DO_FORMULARIO);
}

/** Os grupos, os que travam primeiro, depois os graves, depois os maiores. */
export function agruparPendencias(items: readonly CampaignItem[]): GrupoDePendencia[] {
  const grupos = new Map<string, GrupoDePendencia>();
  for (const item of items) {
    for (const motivo of pendenciasDoItem(item)) {
      let g = grupos.get(motivo);
      if (!g) {
        g = { motivo, quantidade: 0, grave: false, trava: motivo === PENDENCIA_PARCELA_MINIMA };
        grupos.set(motivo, g);
      }
      g.quantidade += 1;
      if (item.blockingIssues.includes(motivo)) g.grave = true;
    }
  }
  return [...grupos.values()].sort((a, b) =>
    Number(b.trava) - Number(a.trava)
    || Number(b.grave) - Number(a.grave)
    || b.quantidade - a.quantidade
    || a.motivo.localeCompare(b.motivo, 'pt-BR'));
}

/** As linhas a tirar: as do motivo, ou todas com alguma pendência. */
export function linhasComPendencia(items: readonly CampaignItem[], motivo?: string): number[] {
  return items
    .filter((i) => (motivo ? i.issues.includes(motivo) : pendenciasDoItem(i).length > 0))
    .map((i) => i.rowNumber);
}
