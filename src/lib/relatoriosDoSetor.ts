/**
 * relatoriosDoSetor.ts — relatório do ERP que só um setor usa.
 *
 * Pedido do Cleber em 12/11/2026: alguns setores têm relatório próprio que
 * soma no recebimento GERAL deles — nunca no operador, na equipe ou no total
 * da empresa. O primeiro é o 1017 da Manutenção (o setor que cuida do
 * colchão): as parcelas da 2ª em diante de Pix automático e cartão recorrente.
 *
 * Qual setor usa qual relatório é CADASTRO (`setor_relatorios`), não nome de
 * setor no código. O que mora aqui é só o catálogo: o que cada relatório é e
 * como a tela o chama. Relatório novo = um item aqui + o valor no CHECK de
 * `setor_relatorios.relatorio` + um parser.
 *
 * O dinheiro chega às telas por `fn_ajustes_recebimento`, com
 * `origem = 'relatorio_<código>'` (migration 20261112150000).
 */

export type CodigoRelatorioDoSetor = '1017';

export interface RelatorioDoSetor {
  codigo: CodigoRelatorioDoSetor;
  /** Como o botão e o card chamam o relatório. */
  nome: string;
  /** Uma linha: o que vem nele. */
  descricao: string;
}

export const RELATORIOS_DO_SETOR: Readonly<Record<CodigoRelatorioDoSetor, RelatorioDoSetor>> = {
  '1017': {
    codigo: '1017',
    nome: 'Relatório 1017 · recorrência',
    descricao: 'Parcelas da 2ª em diante de Pix automático e cartão recorrente pagas no mês.',
  },
};

export function ehCodigoRelatorioDoSetor(v: unknown): v is CodigoRelatorioDoSetor {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(RELATORIOS_DO_SETOR, v);
}

/** A `origem` que `fn_ajustes_recebimento` devolve para o relatório. */
export function origemDoRelatorio(codigo: CodigoRelatorioDoSetor): string {
  return `relatorio_${codigo}`;
}

/**
 * `origem` de `fn_ajustes_recebimento` → código do relatório, ou `null` quando
 * é ajuste de recebimento (ou origem ausente, em banco anterior à coluna).
 */
export function relatorioDaOrigem(origem: unknown): CodigoRelatorioDoSetor | null {
  if (typeof origem !== 'string' || !origem.startsWith('relatorio_')) return null;
  const codigo = origem.slice('relatorio_'.length);
  return ehCodigoRelatorioDoSetor(codigo) ? codigo : null;
}

/**
 * Em quais setores esta pessoa importa relatório próprio?
 *
 * Decisão do Cleber (12/11/2026): o líder do PRÓPRIO setor e o super admin, e
 * mais ninguém — nenhuma permissão de cargo abre isto. A RPC
 * `fn_relatorio_setor_importar` confere a mesma regra; aqui é só o botão.
 */
export function setoresQuePodeImportar<T extends { setorId: string }>(
  quem: { perfil: string | null | undefined; setorId: string | null | undefined },
  configurados: readonly T[],
): T[] {
  if (quem.perfil === 'super_admin') return [...configurados];
  if (quem.perfil === 'lider' && quem.setorId) return configurados.filter(c => c.setorId === quem.setorId);
  return [];
}

/** O rótulo da linha sintética na tela (forma de pagamento, gráfico). */
export function rotuloDoRelatorio(codigo: CodigoRelatorioDoSetor): string {
  return RELATORIOS_DO_SETOR[codigo].nome;
}
