/**
 * clones.ts — em que setor o homenageado deve ser comemorado.
 *
 * Um operador clonado trabalha em dois times. Até a 20260810a o banco resolvia
 * isso sozinho, unindo o setor do perfil com os das equipes clonadas: a festa
 * caía nos dois, sempre, sem ninguém pedir. Agora quem monta escolhe, e este
 * arquivo é a conta que a pergunta usa — quais setores existem para cada
 * escolhido, quem está em mais de um, e o que vai gravado.
 *
 * Espelha `fn_setores_do_operador` (20260731e): perfil + equipes clonadas. A
 * flag `conta_recebimento` do clone é ignorada aqui de propósito, pelo mesmo
 * motivo do banco — ela decide de quem é o dinheiro, não quem trabalha com quem.
 */

export interface PerfilVinculo {
  id:        string;
  setor_id?: string | null;
}

export interface CloneVinculo {
  operador_id: string;
  equipe_id:   string;
}

export interface EquipeVinculo {
  id:        string;
  setor_id?: string | null;
}

export interface MapasVinculo {
  perfis:  readonly PerfilVinculo[];
  clones:  readonly CloneVinculo[];
  equipes: readonly EquipeVinculo[];
}

/** Resposta da pergunta: um setor, ou todos eles. */
export const TODOS_OS_SETORES = 'todos';

/**
 * Setores em que o operador aparece, sem repetição e em ordem estável.
 *
 * Ordem estável porque ela vira a ordem das opções na tela: uma lista que
 * embaralha a cada render faz a pessoa clicar no item errado.
 */
export function setoresDoOperador(operadorId: string, m: MapasVinculo): string[] {
  const setorEquipe = new Map(m.equipes.map((e) => [e.id, e.setor_id ?? null]));
  const achados: string[] = [];

  const perfil = m.perfis.find((p) => p.id === operadorId);
  if (perfil?.setor_id) achados.push(perfil.setor_id);

  for (const c of m.clones) {
    if (c.operador_id !== operadorId) continue;
    const setor = setorEquipe.get(c.equipe_id);
    if (setor) achados.push(setor);
  }

  return [...new Set(achados)];
}

export interface EscolhaDeSetor {
  operadorId: string;
  setores:    string[];
}

/**
 * Quem está em 2+ setores — exatamente os que a tela precisa perguntar.
 *
 * Quem está em um só não gera pergunta: não há o que escolher, e um modal com
 * uma opção só é obstáculo, não decisão.
 */
export function homenageadosAmbiguos(
  operadorIds: readonly string[],
  m: MapasVinculo,
): EscolhaDeSetor[] {
  return operadorIds
    .map((operadorId) => ({ operadorId, setores: setoresDoOperador(operadorId, m) }))
    .filter((e) => e.setores.length > 1);
}

/** Abrir a pergunta antes de comemorar? */
export function precisaPerguntarSetor(
  operadorIds: readonly string[],
  m: MapasVinculo,
): boolean {
  return homenageadosAmbiguos(operadorIds, m).length > 0;
}

/**
 * O que vai em `comemoracao_homenageados.setores_escolhidos`.
 *
 * Sempre explícito, mesmo para quem não é clone. O banco tem um fallback para a
 * lista vazia (o setor do perfil), mas ele erraria justamente no caso do
 * operador SEM setor próprio que só existe como clone: o fallback devolveria
 * NULL e a comemoração sairia sem plateia nenhuma.
 *
 * `escolha` ausente, desconhecida ou `TODOS_OS_SETORES` devolve tudo — é o
 * comportamento de antes da 20260810a, agora deliberado.
 */
export function setoresEscolhidosPara(
  operadorId: string,
  escolha: string | undefined,
  m: MapasVinculo,
): string[] {
  const setores = setoresDoOperador(operadorId, m);
  if (!escolha || escolha === TODOS_OS_SETORES) return setores;
  return setores.includes(escolha) ? [escolha] : setores;
}
