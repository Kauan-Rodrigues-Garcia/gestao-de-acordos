/**
 * agruparTelas.ts — «Telas mais usadas» por tela do menu, com as abas dentro.
 *
 * ## Por que agrupar
 *
 * Desde 29/09/2026 cada aba interna é medida separada (`analitico:analitico/mes/
 * ranking`, `diretoria:mestre/vinculos`…). Listadas soltas, as abas de uma tela
 * disputam o ranking entre si: o Analítico aparecia em seis linhas pequenas e
 * uma tela de aba única passava na frente dele, mesmo com menos tempo de uso.
 *
 * Aqui a linha de cima é a tela do menu (`telaRaiz`), com o tempo e as
 * aberturas somados, e as abas vêm embaixo, cada uma com o seu número.
 *
 * ## Pessoas não somam
 *
 * `fn_uso_por_tela` devolve pessoas DISTINTAS por identificador. A mesma
 * pessoa que abriu três abas do Analítico conta uma vez em cada — somar daria
 * três. O grupo guarda o maior valor entre as abas: é um piso («ao menos N»),
 * e a tela mostra assim. Contar exato pediria outra RPC.
 */
import { telaRaiz } from '@/lib/telas-catalogo';
import type { UsoPorTela } from '@/services/uso.service';

export interface GrupoTela {
  /** A tela do menu: `analitico`, `lider`, `admin/configuracoes`. */
  raiz:      string;
  segundos:  number;
  aberturas: number;
  /** Piso de pessoas distintas: o maior valor entre as abas (ver o cabeçalho). */
  pessoasMinimo: number;
  /** Verdadeiro quando só há uma linha no grupo: aí `pessoasMinimo` é exato. */
  pessoasExato: boolean;
  /** As linhas do grupo, da mais usada para a menos. */
  abas: UsoPorTela[];
}

/** Agrupa por tela do menu, do grupo com mais tempo para o com menos. */
export function agruparPorTela(telas: ReadonlyArray<UsoPorTela>): GrupoTela[] {
  const grupos = new Map<string, GrupoTela>();

  for (const t of telas) {
    const raiz = telaRaiz(t.tela);
    const seg = Number(t.segundos) || 0;
    const abe = Number(t.aberturas) || 0;
    const pes = Number(t.pessoas) || 0;

    const g = grupos.get(raiz);
    if (!g) {
      grupos.set(raiz, {
        raiz, segundos: seg, aberturas: abe,
        pessoasMinimo: pes, pessoasExato: true, abas: [t],
      });
      continue;
    }
    g.segundos  += seg;
    g.aberturas += abe;
    g.pessoasMinimo = Math.max(g.pessoasMinimo, pes);
    g.pessoasExato  = false;
    g.abas.push(t);
  }

  const lista = [...grupos.values()];
  for (const g of lista) {
    g.abas.sort((a, b) => Number(b.segundos) - Number(a.segundos) || a.tela.localeCompare(b.tela));
  }
  return lista.sort((a, b) => b.segundos - a.segundos || a.raiz.localeCompare(b.raiz));
}

/**
 * A tela do catálogo teve uso no período?
 *
 * Com as abas no identificador, a tela do menu quase nunca aparece PURA em
 * `uso_telas`: quem abre o Analítico grava `analitico:analitico/mes/…`, e não
 * `analitico`. Comparar por igualdade listaria o Analítico como «sem uso».
 *
 * Conta como uso a própria tela ou qualquer aba DENTRO dela: `analitico`
 * vale por `analitico:*`, e `lider:desempenho` vale por `lider:desempenho/*`.
 * `acordos` NÃO vale por `acordos/novo` — é outra tela do menu, com rota
 * própria.
 */
export function telaTeveUso(tela: string, usadas: ReadonlyArray<string>): boolean {
  const filha = tela + (tela.includes(':') ? '/' : ':');
  return usadas.some(u => u === tela || u.startsWith(filha));
}
