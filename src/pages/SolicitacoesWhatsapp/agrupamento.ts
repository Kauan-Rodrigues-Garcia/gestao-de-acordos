/**
 * agrupamento.ts — como os pedidos se dividem na tela.
 *
 * ## O problema que isto resolve
 *
 * Até 16/08/2026 a aba tinha DUAS listas: "em aberto" e "finalizados". Em
 * produção, em aberto eram 67 pedidos de 15 solicitantes diferentes, atendidos
 * por 3 pessoas — tudo numa fila corrida. E 32 dos 59 em andamento já tinham
 * passado do prazo de 5 dias, o que pintava metade da lista de vermelho. Uma
 * marca que aparece em metade da tela não aponta nada: vira o fundo.
 *
 * O agrupamento por pessoa existia, mas só ligava quando uma equipe era
 * escolhida no filtro — ou seja, quase nunca, já que a aba abre sem filtro.
 *
 * ## Os quatro baldes
 *
 *   comigo     — eu assumi e ainda não fechei. É a minha mesa.
 *   fila       — ninguém pegou ainda. Esperando alguém.
 *   outros     — está em andamento, mas com outra pessoa.
 *   concluidos — histórico.
 *
 * ## Um só conjunto de regras serve aos dois papéis
 *
 * Quem ATENDE vê os quatro. Quem só enxerga os PRÓPRIOS pedidos nunca é
 * responsável por nada (ser responsável dá visão geral), então `comigo` nasce
 * vazio para essa pessoa e o bloco some sozinho — e `outros`, agrupado por
 * responsável, vira exatamente o que foi pedido: "João está com 3 pedidos
 * seus".
 *
 * Não há ramo por papel aqui de propósito. A diferença entre as duas telas é
 * consequência dos dados, não de um `if`.
 */
import type {
  SolicitacaoWhatsapp, PessoaResumo,
} from '@/services/solicitacoesWhatsapp.service';

export type Balde = 'comigo' | 'fila' | 'outros' | 'concluidos';

/**
 * Em que balde este pedido cai.
 *
 * `falta_info` NÃO ganha balde próprio: em produção são zero linhas, e um bloco
 * para um estado que nunca aconteceu seria desenhar para o código em vez de
 * para a operação. Ele segue quem atende, como qualquer pedido em andamento.
 *
 * Pedido em andamento SEM responsável cai na fila, não em `outros`. Acontece
 * quando alguém muda o status sem assumir; ninguém está com ele, e "esperando
 * alguém" é literalmente a situação.
 */
export function baldeDoPedido(
  s: Pick<SolicitacaoWhatsapp, 'status' | 'responsavel_id'>,
  usuarioId: string | null,
): Balde {
  if (s.status === 'feito')     return 'concluidos';
  if (s.status === 'pendente')  return 'fila';
  if (!s.responsavel_id)        return 'fila';
  return s.responsavel_id === usuarioId ? 'comigo' : 'outros';
}

export interface Baldes {
  comigo:     SolicitacaoWhatsapp[];
  fila:       SolicitacaoWhatsapp[];
  outros:     SolicitacaoWhatsapp[];
  concluidos: SolicitacaoWhatsapp[];
}

const maisAntigoPrimeiro = (a: SolicitacaoWhatsapp, b: SolicitacaoWhatsapp) =>
  a.criado_em.localeCompare(b.criado_em);

const maisNovoPrimeiro = (a: SolicitacaoWhatsapp, b: SolicitacaoWhatsapp) =>
  b.criado_em.localeCompare(a.criado_em);

/**
 * Divide a lista nos quatro baldes, cada um já na ordem em que será lido.
 *
 * Os três baldes em aberto vêm do **mais antigo para o mais novo**: o que
 * espera há mais tempo sobe. Dentro de um balde a prioridade já é uniforme
 * (todos meus, ou todos na fila), então a espera passa a ser o único critério
 * que importa — diferente da lista única antiga, onde ela vinha por último
 * justamente para o pedido velho de outra pessoa não empurrar o meu para baixo.
 *
 * Concluídos vêm ao contrário: é histórico, e o de ontem interessa mais que o
 * do mês passado.
 */
export function separarEmBaldes(
  lista: SolicitacaoWhatsapp[],
  usuarioId: string | null,
): Baldes {
  const baldes: Baldes = { comigo: [], fila: [], outros: [], concluidos: [] };
  for (const s of lista) baldes[baldeDoPedido(s, usuarioId)].push(s);

  baldes.comigo.sort(maisAntigoPrimeiro);
  baldes.fila.sort(maisAntigoPrimeiro);
  baldes.outros.sort(maisAntigoPrimeiro);
  baldes.concluidos.sort(maisNovoPrimeiro);
  return baldes;
}

// ── Agrupamento por pessoa ───────────────────────────────────────────────────

/** Por qual das duas pessoas do pedido agrupar. */
export type Eixo = 'solicitante' | 'responsavel';

export interface GrupoPessoa {
  /** id da pessoa, ou `SEM_PESSOA` quando o pedido não tem esse lado. */
  id:     string;
  pessoa: PessoaResumo | null;
  itens:  SolicitacaoWhatsapp[];
}

/** Chave do grupo dos pedidos sem a pessoa do eixo (fila sem responsável). */
export const SEM_PESSOA = '__sem_pessoa__';

/**
 * Agrupa por solicitante ou por responsável, preservando a ordem que a lista
 * já trazia dentro de cada grupo.
 *
 * Grupos ordenados **por nome**, não por tamanho: a ordem precisa ser a mesma
 * entre duas aberturas da aba. Uma lista que se reordena sozinha a cada
 * mudança de status obriga a procurar de novo onde estava a pessoa.
 *
 * O grupo sem pessoa vai por último — é o resto, não é ninguém.
 */
export function agruparPor(
  lista: SolicitacaoWhatsapp[],
  eixo: Eixo,
): GrupoPessoa[] {
  const mapa = new Map<string, GrupoPessoa>();

  for (const s of lista) {
    const id = (eixo === 'solicitante' ? s.solicitante_id : s.responsavel_id) ?? SEM_PESSOA;
    const pessoa = (eixo === 'solicitante' ? s.solicitante : s.responsavel) ?? null;

    let grupo = mapa.get(id);
    if (!grupo) {
      grupo = { id, pessoa, itens: [] };
      mapa.set(id, grupo);
    }
    // O primeiro pedido do grupo pode ter vindo sem o join resolvido; qualquer
    // um dos seguintes que tenha nome serve para batizar o bloco.
    if (!grupo.pessoa && pessoa) grupo.pessoa = pessoa;
    grupo.itens.push(s);
  }

  return [...mapa.values()].sort((a, b) => {
    if (a.id === SEM_PESSOA) return 1;
    if (b.id === SEM_PESSOA) return -1;
    return (a.pessoa?.nome ?? '').localeCompare(b.pessoa?.nome ?? '', 'pt-BR');
  });
}

/**
 * Vale a pena agrupar esta lista?
 *
 * Um grupo só é um cabeçalho com o nome de quem já está no topo da tela — custo
 * visual sem informação. É o que aconteceria com a fila de quem só vê os
 * próprios pedidos: um bloco "Fulano", com Fulano sendo quem está olhando.
 */
export function valeAgrupar(grupos: GrupoPessoa[]): boolean {
  return grupos.length > 1;
}
