/**
 * equipeDoLider.ts — a equipe que o recebimento do líder credita.
 *
 * ## O defeito que isto corrige
 *
 * Um líder também atende: as linhas dele entram no relatório analítico como as
 * de qualquer um, com `operador_id` preenchido. Mas o card da equipe soma por
 * `operadorEquipeMap`, que monta a equipe a partir de `perfis.equipe_id` — e
 * esse campo é o modelo LEGADO. Quem foi vinculado pela tela de Equipes está em
 * `equipe_lideres` (migration `20260725b`) e continua com `perfis.equipe_id`
 * NULO.
 *
 * Resultado medido na BookPlay em 2026-08: R$ 4.597,92 recebidos por cargos de
 * liderança no mês, dos quais os R$ 1.316,17 de Matheus Costa — líder explícito
 * da equipe "Matheus" — não entravam em card de equipe nenhum. O dinheiro
 * aparecia no total do SETOR (que sai do carimbo do relatório) e sumia da
 * equipe, então setor ≠ soma das equipes dele.
 *
 * ## A regra
 *
 * Vale o legado quando existe; na falta dele, o vínculo explícito — e só quando
 * ele é ÚNICO. Um líder que comanda três equipes não tem "a sua equipe": somar
 * o recebimento dele nas três contaria o mesmo dinheiro três vezes no mesmo
 * setor, e escolher uma no escuro seria pior que não escolher. Esse caso fica
 * como está (conta no setor, não na equipe), que é o comportamento de hoje.
 *
 * É a mesma forma de `lideresDaEquipe.ts`: quando há dois níveis de
 * configuração, o mais específico decide — não se somam os dois.
 */

/** Vínculo de `equipe_lideres`. */
export interface VinculoLiderEquipe {
  equipe_id: string;
  lider_id: string;
}

/**
 * `lider_id` → `equipe_id`, só para quem lidera EXATAMENTE uma equipe.
 *
 * Quem lidera duas ou mais fica de fora do mapa — ver o cabeçalho. Vínculo
 * repetido para a mesma equipe (a tabela permite) não conta como duas.
 */
export function equipeUnicaPorLider(
  vinculos: ReadonlyArray<VinculoLiderEquipe>,
): Record<string, string> {
  const equipesPorLider = new Map<string, Set<string>>();
  for (const v of vinculos) {
    if (!v?.lider_id || !v?.equipe_id) continue;
    const atual = equipesPorLider.get(v.lider_id);
    if (atual) atual.add(v.equipe_id);
    else equipesPorLider.set(v.lider_id, new Set([v.equipe_id]));
  }

  const saida: Record<string, string> = {};
  for (const [liderId, equipes] of equipesPorLider) {
    if (equipes.size === 1) saida[liderId] = [...equipes][0];
  }
  return saida;
}
