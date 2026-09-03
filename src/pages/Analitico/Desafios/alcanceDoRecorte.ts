/**
 * alcanceDoRecorte.ts — quem o recorte da campanha alcança, na hora de montá-la.
 *
 * ## Por que isto não é `participaDaCampanha`
 *
 * `participaDaCampanha` responde a pergunta do RANKING: esta pessoa disputa?
 * Ela aplica as exclusões e o mapa de metas, porque no ranking os dois já
 * foram decididos.
 *
 * Aqui a pergunta é da CONFIGURAÇÃO: quem o recorte que estou montando pega?
 * As exclusões ficam de fora de propósito — elas são justamente o que a tela
 * serve para escolher, e aplicá-las faria a pessoa sumir da lista no clique em
 * que foi excluída, sem como voltar. O mapa de metas idem: a aba Metas existe
 * para preenchê-lo, e filtrar por ele deixaria a aba vazia até alguém digitar
 * o primeiro número.
 *
 * ## Um lugar só
 *
 * A mesma resposta é pedida pelo seletor de participação e pela aba de metas.
 * Antes cada uma respondia à sua maneira — e a aba de metas respondia errado,
 * listando a empresa inteira em vez de quem estava na campanha.
 */
import type { ParticipantesDesafio, PessoaDesafio } from '@/services/desafios/types';

/**
 * A campanha tem algum recorte?
 *
 * `false` significa «vale para todo mundo que a enxerga» — que é uma campanha
 * legítima, e é como toda campanha nasce. Não é um estado de erro; é o estado
 * que a tela precisa ANUNCIAR em vez de despejar trezentos nomes.
 *
 * A lista de operadores conta como recorte, mas as exclusões não: excluir
 * alguém de «todo mundo» continua sendo «todo mundo menos ele».
 */
export function temRecorte(
  participantes: ParticipantesDesafio,
  travadoNoSetor?: string | null,
): boolean {
  if (travadoNoSetor) return true;
  return (
    (participantes.setores?.length ?? 0) > 0
    || (participantes.equipes?.length ?? 0) > 0
    || (participantes.cargos?.length ?? 0) > 0
    || (participantes.operadores?.length ?? 0) > 0
  );
}

/**
 * As pessoas que o recorte alcança.
 *
 * As quatro dimensões são um E: marcar um setor E um cargo pede quem está nos
 * dois. Lista vazia numa dimensão é «sem recorte ali», não «ninguém» — a mesma
 * leitura de `participaDaCampanha`.
 *
 * `travadoNoSetor` é quem só configura o próprio setor: a campanha nasce presa
 * a ele, e ele vence a lista de setores da tela.
 */
export function alcancadosPeloRecorte(
  pessoas: readonly PessoaDesafio[],
  participantes: ParticipantesDesafio,
  travadoNoSetor?: string | null,
): PessoaDesafio[] {
  const setores    = travadoNoSetor ? [travadoNoSetor] : (participantes.setores ?? []);
  const equipes    = participantes.equipes    ?? [];
  const cargos     = participantes.cargos     ?? [];
  const operadores = participantes.operadores ?? [];
  const convidados = participantes.convidados ?? [];

  return pessoas.filter(p => {
    // O convidado de teste entra por cima do recorte, como no ranking: ele é
    // super admin e nunca casaria com setor, equipe ou cargo.
    if (convidados.includes(p.id)) return true;
    if (operadores.length && !operadores.includes(p.id)) return false;
    if (setores.length && !p.setores.some(s => setores.includes(s))) return false;
    if (equipes.length && !p.equipes.some(e => equipes.includes(e))) return false;
    if (cargos.length && !cargos.includes(p.perfil)) return false;
    return true;
  });
}

/**
 * Quantos de fato ficam na campanha: o alcance menos as exclusões.
 *
 * É o número que a tela mostra como «N no desafio», e o único que responde à
 * pergunta que quem configura está fazendo.
 */
export function contarNoDesafio(
  alcancados: readonly PessoaDesafio[],
  excluidos: readonly string[],
): number {
  if (!excluidos.length) return alcancados.length;
  const fora = new Set(excluidos);
  return alcancados.reduce((n, p) => (fora.has(p.id) ? n : n + 1), 0);
}
