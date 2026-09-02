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

/**
 * Cargo que a tela de Equipes trata como LIDERANÇA, e não como membro.
 *
 * É a mesma comparação de `AdminEquipes.ehLiderExcluido` e de
 * `lideresDisponiveis` — quem tem este cargo não aparece na lista de membros de
 * equipe nenhuma, e só pode ser ligado a uma equipe pelo espaço "Líderes".
 * Usar `isPerfilLider` aqui alargaria a regra para `elite`/`gerencia`, que a
 * tela continua tratando como membros comuns.
 */
const CARGO_DE_LIDERANCA = 'lider';

/**
 * A equipe em que o recebimento desta pessoa credita.
 *
 * ## Por que o cargo decide a precedência
 *
 * Para quem é MEMBRO, o cadastro (`perfis.equipe_id`) é a verdade: a pessoa
 * pertence àquela equipe, e um vínculo de liderança em outra não a muda de
 * lugar — mover o recebimento dela tiraria dinheiro da equipe de que ela faz
 * parte.
 *
 * Para quem tem cargo `lider` é o contrário. A tela de Equipes esconde o líder
 * de toda lista de membros e só edita `equipe_lideres`; o `perfis.equipe_id`
 * dele é resíduo do modelo antigo, invisível e ineditável pela interface. Ao
 * trocar a liderança entre duas equipes, esse resíduo fica apontando para a
 * equipe ANTIGA e continua mandando no dinheiro.
 *
 * Medido na BookPlay, setor Play 4, em 02/09/2026: Maria Oliveira lidera
 * "Maria - Capitã" e tem `perfis.equipe_id` = "Digital Bruno" (que hoje é do
 * Brunno Piccolo). Os R$ 7.916,99 dela em agosto contavam no card do Brunno.
 * Na mesma troca, Tamires Valentin ficou presa em "Maria - Capitã" sem liderar
 * nada — é a "foto do líder antigo" que reaparece assim que a equipe perde o
 * vínculo explícito.
 *
 * @param perfil     cargo da pessoa (`perfis.perfil`)
 * @param cadastro   `perfis.equipe_id`
 * @param lideranca  equipe do vínculo ÚNICO de `equipe_lideres`, se houver
 */
export function equipeQueCredita(
  perfil: string | null | undefined,
  cadastro: string | null | undefined,
  lideranca: string | null | undefined,
): string | null {
  return perfil === CARGO_DE_LIDERANCA
    ? (lideranca ?? cadastro ?? null)
    : (cadastro ?? lideranca ?? null);
}
