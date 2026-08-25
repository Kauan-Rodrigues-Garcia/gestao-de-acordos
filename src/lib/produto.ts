/**
 * produto.ts — que PRODUTO esta empresa opera?
 *
 * ## A distinção que faltava
 *
 * O sistema tratava «empresa» e «tipo de operação» como a mesma coisa, porque
 * durante um ano elas foram: existiam BookPlay e PaguePlay, as duas cobrando.
 * `isPaguePlay` nunca significou «que empresa é esta» — significou «qual das
 * duas variações da cobrança», uma pergunta que só faz sentido DENTRO da
 * cobrança.
 *
 * Com Comercial e RH a diferença fica visível: são empresas do mesmo grupo, no
 * mesmo banco, e não compartilham regra de cálculo, relatório nem tela com a
 * cobrança. Não é uma variação — é outro produto.
 *
 *   cobranca   BookPlay, PaguePlay   (duas empresas, um produto)
 *   comercial  Comercial             (vendas)
 *   rh         Recursos Humanos
 *
 * ## Lista branca, não lista negra
 *
 * A régua antiga do menu era por exclusão: `hiddenForPaguePay`,
 * `hiddenForBookplay`. Com dois tenants funcionava; com quatro, uma aba sem
 * marcação aparece em TODOS — inclusive nos produtos que ninguém revisou. Foi
 * o que aconteceu: o Comercial abriu mostrando Acordos, Novo Acordo e Campanha
 * Fácil, a operação de cobrança inteira, vazia. E a aba Metas, escondida nas
 * duas empresas reais, aparecia lá — o único lugar onde ninguém pensou nela.
 *
 * A partir daqui a pergunta é «em quais produtos esta aba existe?», e a
 * resposta omitida significa NENHUM. Esquecer de declarar some com a aba, em
 * vez de vazá-la para um produto onde ela não faz sentido.
 */
import type { Empresa } from '@/lib/supabase';

export type Produto = 'cobranca' | 'comercial' | 'rh';

export const PRODUTOS: readonly Produto[] = ['cobranca', 'comercial', 'rh'] as const;

/**
 * O produto de cada slug conhecido.
 *
 * Existe para o instante em que o slug já é conhecido (vem do build ou do
 * hostname) e a linha de `empresas` ainda não voltou do banco. Sem ele, o menu
 * pisca vazio a cada carregamento.
 *
 * A verdade é a coluna `empresas.produto` — este mapa é atalho, não fonte.
 */
const POR_SLUG: Readonly<Record<string, Produto>> = {
  bookplay:  'cobranca',
  pagueplay: 'cobranca',
  comercial: 'comercial',
  rh:        'rh',
};

function normalizar(valor: string | null | undefined): string {
  return valor?.trim().toLowerCase() ?? '';
}

/** É um produto que o sistema conhece? */
export function ehProduto(valor: unknown): valor is Produto {
  return typeof valor === 'string' && (PRODUTOS as readonly string[]).includes(valor);
}

/**
 * O produto desta empresa, ou `null` quando ainda não dá para saber.
 *
 * `null` é resposta legítima e importante: acontece enquanto a empresa carrega,
 * e acontece se alguém criar uma empresa com slug novo sem declarar o produto.
 * Quem chama trata `null` como «não mostre nada ainda» — nunca como «cobrança».
 * Devolver um padrão aqui seria reinventar o vazamento que este arquivo existe
 * para fechar.
 */
export function produtoDaEmpresa(
  empresa: Pick<Empresa, 'slug'> & { produto?: string | null } | null | undefined,
  slugDoSite?: string | null,
): Produto | null {
  if (empresa && ehProduto(empresa.produto)) return empresa.produto;

  const slug = normalizar(empresa?.slug) || normalizar(slugDoSite);
  return POR_SLUG[slug] ?? null;
}

/** Só o slug, para quem ainda não tem a linha da empresa em mãos. */
export function produtoDoSlug(slug: string | null | undefined): Produto | null {
  return POR_SLUG[normalizar(slug)] ?? null;
}

/**
 * Esta aba/rota existe neste produto?
 *
 * `declarados` indefinido devolve `false` de propósito — é a lista branca. E
 * `produtoAtual` nulo também: enquanto não se sabe onde a pessoa está, não se
 * mostra nada.
 */
export function produtoPermite(
  declarados: readonly Produto[] | undefined,
  produtoAtual: Produto | null,
): boolean {
  if (!declarados || declarados.length === 0) return false;
  if (!produtoAtual) return false;
  return declarados.includes(produtoAtual);
}

/** O nome do produto na tela, para avisos e telas de espera. */
export function rotuloDoProduto(produto: Produto | null): string {
  switch (produto) {
    case 'cobranca':  return 'Cobrança';
    case 'comercial': return 'Comercial';
    case 'rh':        return 'Recursos Humanos';
    default:          return 'Sem produto definido';
  }
}
