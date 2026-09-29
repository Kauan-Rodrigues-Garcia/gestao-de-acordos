/**
 * equipeDoLider.ts — em que equipes uma pessoa está.
 *
 * ## A regra (29/09/2026)
 *
 * «Ou a pessoa está em uma equipe e tem uma equipe, ou a pessoa não está em uma
 * equipe e ela não tem uma equipe, isso para líderes ou operadores.»
 * «Se tem 2 equipes, soma em todas que faz parte, não só em uma, só não
 * duplica o recebimento no geral.»
 *
 * Está numa equipe quem a tela de Equipes mostra nela, por um destes três
 * caminhos — e nenhum outro:
 *
 *   membro  `perfis.equipe_id` de quem NÃO tem cargo `lider`. A tela esconde o
 *           líder de toda lista de membros, então no líder esse campo é resíduo
 *           do modelo antigo, invisível e ineditável — e deixa de existir aqui.
 *           Era ele que mandava os R$ 7.916,99 de agosto da Maria Oliveira
 *           (lidera «Maria - Capitã») para o card do Brunno («Digital Bruno»).
 *   líder   `equipe_lideres`, todas as equipes que a pessoa lidera.
 *   clone   `equipe_operadores_clones` com `conta_recebimento`.
 *
 * Quem está em várias recebe o dinheiro INTEIRO em cada uma: R$ 4 mil e três
 * equipes são R$ 4 mil em cada card. O que não duplica é o setor e o geral —
 * `setoresDoOperador` devolve um conjunto, e o total da empresa soma a pessoa
 * uma vez.
 *
 * ## O que isto substitui
 *
 * `equipeQueCredita`/`equipeUnicaPorLider` davam UMA equipe por pessoa: o
 * cadastro mandava no membro, a liderança mandava no líder, e quem liderava
 * várias não contava em nenhuma. Em setembro de 2026 eram quatro líderes da
 * BookPlay nessa situação (Brunno com 6 equipes, Samara com 5, Yann com 4,
 * Daniele com 2).
 *
 * A mesma regra vive no banco em `fn_equipes_do_operador` (migration
 * 20260929141516). Se as duas discordarem, a tela mostra uma equipe e o banco
 * recorta outra.
 */

/** Vínculo de `equipe_lideres`. */
export interface VinculoLiderEquipe {
  equipe_id: string;
  lider_id: string;
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
 * `lider_id` → equipes que ele lidera, sem repetição e na ordem do vínculo.
 *
 * Vínculo repetido para a mesma equipe (a tabela permite) não conta como dois.
 */
export function equipesLideradasPorPessoa(
  vinculos: ReadonlyArray<VinculoLiderEquipe>,
): Record<string, string[]> {
  const saida: Record<string, string[]> = {};
  for (const v of vinculos) {
    if (!v?.lider_id || !v?.equipe_id) continue;
    const atual = (saida[v.lider_id] ??= []);
    if (!atual.includes(v.equipe_id)) atual.push(v.equipe_id);
  }
  return saida;
}

/**
 * Todas as equipes em que a pessoa está, sem repetição.
 *
 * A ordem é estável e diz qual vem primeiro quando a tela precisa de UMA para
 * rotular (nome e setor da linha da pessoa): a de membro, depois as que lidera,
 * depois os clones. Para o dinheiro a ordem não importa — ele entra em todas.
 *
 * @param perfil     cargo da pessoa (`perfis.perfil`)
 * @param membro     `perfis.equipe_id` — ignorado para cargo `lider`
 * @param lideradas  equipes de `equipe_lideres`
 * @param clones     equipes de `equipe_operadores_clones` que contam
 */
export function equipesDaPessoa(
  perfil: string | null | undefined,
  membro: string | null | undefined,
  lideradas: ReadonlyArray<string> = [],
  clones: ReadonlyArray<string> = [],
): string[] {
  const saida: string[] = [];
  const incluir = (id: string | null | undefined) => {
    if (id && !saida.includes(id)) saida.push(id);
  };
  if (perfil !== CARGO_DE_LIDERANCA) incluir(membro);
  for (const id of lideradas) incluir(id);
  for (const id of clones) incluir(id);
  return saida;
}

/**
 * As equipes de uma pessoa, do jeito que o resto do sistema deve perguntar.
 *
 * Mesma regra das funções do banco `fn_equipes_de_alcance` e
 * `fn_equipe_principal` (migration 20260929141516).
 *
 *   todas      — as equipes em que a pessoa está (membro ou líder).
 *   principal  — UMA equipe, para o que só aceita uma (config de Direto/Extra,
 *                comissão, meta da equipe, carimbo de solicitação): a única,
 *                quando só há uma; havendo várias, a de membro. Líder de várias
 *                não tem principal — escolher uma no escuro seria pior.
 *   lideradas  — as que lidera.
 */
export interface EquipesDoPerfil {
  principal: string | null;
  todas: string[];
  lideradas: string[];
}

export function equipesDoPerfil(
  perfil: string | null | undefined,
  cadastro: string | null | undefined,
  lideradas: ReadonlyArray<string>,
): EquipesDoPerfil {
  const unicas = equipesDaPessoa(null, null, lideradas);
  const todas = equipesDaPessoa(perfil, cadastro, unicas);
  const membro = perfil !== CARGO_DE_LIDERANCA ? (cadastro ?? null) : null;
  const principal = todas.length === 1 ? todas[0] : membro;
  return { principal, todas, lideradas: unicas };
}
