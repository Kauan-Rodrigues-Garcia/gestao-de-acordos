/**
 * A busca do Analítico — pedido de 30/09/2026.
 *
 * O operador precisava achar um NR específico entre dezenas de recebimentos, e
 * o líder, um cliente ou uma pessoa no meio da lista inteira da equipe. Uma
 * regra só para as duas visões: o que a pessoa digita é comparado sem acento e
 * sem caixa com o código (NR na BookPlay, código do cliente na PaguePlay), o
 * nome do cliente e a empresa do relatório — e, no líder, também com o nome e
 * o login do operador.
 *
 * Código se compara também só pelos dígitos: «123.456-7» acha «1234567».
 */
import type { GrupoOperadores } from '@/pages/Analitico/ListaOperadores';

/** Minúsculas, sem acento, sem espaço nas pontas. */
export function normalizarBusca(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function soDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/** Um campo de texto contém o termo? Termo vazio casa com tudo. */
export function textoCasa(texto: string | null | undefined, termo: string): boolean {
  const t = normalizarBusca(termo);
  if (!t) return true;
  return normalizarBusca(texto).includes(t);
}

/** Código casa pelo texto ou, com 3+ dígitos no termo, só pelos dígitos. */
export function codigoCasa(codigo: string | null | undefined, termo: string): boolean {
  if (textoCasa(codigo, termo)) return true;
  const digitos = soDigitos(termo);
  return digitos.length >= 3 && soDigitos(codigo ?? '').includes(digitos);
}

export interface RecebimentoBuscavel {
  codigo: string;
  nome_cliente?: string | null;
  instituicao?: string | null;
}

/** Linha do relatório: código, cliente ou empresa. */
export function recebimentoCasaBusca(linha: RecebimentoBuscavel, termo: string): boolean {
  if (!normalizarBusca(termo)) return true;
  return codigoCasa(linha.codigo, termo)
    || textoCasa(linha.nome_cliente, termo)
    || textoCasa(linha.instituicao, termo);
}

/** Pessoa da lista do líder: nome ou login. */
export function operadorCasaBusca(op: { nome: string | null; usuario: string }, termo: string): boolean {
  if (!normalizarBusca(termo)) return true;
  return textoCasa(op.nome, termo) || textoCasa(op.usuario, termo);
}

/**
 * A lista do líder filtrada pela busca: fica quem casa pelo nome e quem tem
 * algum recebimento que casa (`comRecebimento`, vindo do banco). Equipe que
 * fica vazia sai. Os grupos que sobram mantêm a ordem e os totais de antes.
 */
export function filtrarGruposPorBusca(
  grupos: readonly GrupoOperadores[],
  termo: string,
  comRecebimento: ReadonlySet<string>,
): GrupoOperadores[] {
  if (!normalizarBusca(termo)) return [...grupos];
  const saida: GrupoOperadores[] = [];
  for (const g of grupos) {
    const itens = g.itens.filter(l => operadorCasaBusca(l, termo) || comRecebimento.has(l.operador_id));
    if (itens.length) saida.push({ ...g, itens });
  }
  return saida;
}

/**
 * O termo pronto para o `.or(... ilike ...)` do PostgREST, ou `null` quando é
 * curto demais para ir ao banco.
 *
 * Vírgula, parêntese, aspas e dois-pontos quebram a sintaxe do filtro; `%`,
 * `*` e `_` virariam coringa. Saem todos — ninguém procura um NR por eles.
 *
 * Termo só de número e pontuação («123.456-7») vai como dígitos: é assim que
 * o código costuma estar gravado.
 */
export function termoParaBanco(termo: string): string | null {
  if (/^[\d\s./-]+$/.test(termo)) {
    const digitos = soDigitos(termo);
    return digitos.length >= 3 ? digitos : null;
  }
  const limpo = termo.replace(/[,()"'\\:%*_]/g, ' ').replace(/\s+/g, ' ').trim();
  return limpo.length >= 3 ? limpo : null;
}
