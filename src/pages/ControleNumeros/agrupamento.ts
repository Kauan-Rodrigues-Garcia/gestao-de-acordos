/**
 * agrupamento.ts — como a lista de números se organiza na tela.
 *
 * ## Dois agrupamentos, e a situação é o padrão
 *
 * A lista nasceu agrupada por APARELHO (ver o cabeçalho de `ListaNumeros`), o
 * que responde «o que tem no Celular 07». O pedido de 14/09/2026 é a outra
 * pergunta do dia a dia: «quais estão aguardando 24 horas», «quais estão em
 * aquecimento». Com o agrupamento por aparelho a resposta ficava espalhada em
 * trinta cartões.
 *
 * Agora a tela abre por situação, e o aparelho vira um detalhe da linha. O
 * agrupamento por celular continua a um clique — quem está com o telefone na mão
 * ainda precisa dele.
 *
 * Função pura, fora do componente: o teste alcança sem desenhar a tabela, e o
 * componente só decide qual dos dois desenhar.
 */
import type { CelularComNumeros } from '@/hooks/useControleNumeros';
import type { NumeroRow } from '@/services/numeros/numeros.service';
import { SITUACOES, SITUACAO_LABELS, type Situacao } from '@/services/numeros/numerosRegras';

/** «Todos» dos seletores. O `Select` do shadcn recusa `value=""`. */
export const TODOS = '__todos__';

export type ModoAgrupamento = 'situacao' | 'celular';

export interface FiltrosNumeros {
  celular: string;
  situacao: string;
  posse: string;
}

export interface NumeroNoAparelho {
  aparelho: CelularComNumeros;
  numero: NumeroRow;
}

export interface GrupoSituacao {
  situacao: Situacao;
  rotulo: string;
  itens: NumeroNoAparelho[];
  /** Quantos do grupo já foram lançados ao setor — o selo do cabeçalho. */
  lancados: number;
}

/** O número passa pelos filtros de situação e posse? O de celular é do aparelho. */
export function passaNosFiltros(n: NumeroRow, filtros: FiltrosNumeros): boolean {
  return (filtros.situacao === TODOS || n.situacao === filtros.situacao)
    && (filtros.posse === TODOS || n.posse === filtros.posse);
}

const porNomeDoAparelho = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/**
 * Os números do recorte, um grupo por situação.
 *
 * A ordem dos grupos é a de `SITUACOES` — a mesma do seletor de filtro, para a
 * tela e o filtro não contarem as situações em ordens diferentes. Situação sem
 * número no recorte não vira grupo vazio.
 *
 * Dentro do grupo, pelo nome do aparelho com comparação numérica («Celular 2»
 * antes de «Celular 10») e, no mesmo aparelho, pelo número.
 */
export function agruparPorSituacao(
  aparelhos: CelularComNumeros[],
  filtros: FiltrosNumeros,
): GrupoSituacao[] {
  const porSituacao = new Map<Situacao, NumeroNoAparelho[]>();

  for (const aparelho of aparelhos) {
    if (filtros.celular !== TODOS && aparelho.celular.id !== filtros.celular) continue;
    for (const numero of aparelho.numeros) {
      if (!passaNosFiltros(numero, filtros)) continue;
      const lista = porSituacao.get(numero.situacao) ?? [];
      lista.push({ aparelho, numero });
      porSituacao.set(numero.situacao, lista);
    }
  }

  // Situação que o banco conheça e a tela ainda não: entra no fim, com o nome
  // cru, em vez de sumir da lista.
  const ordem: Situacao[] = [
    ...SITUACOES,
    ...[...porSituacao.keys()].filter(s => !SITUACOES.includes(s)),
  ];

  return ordem
    .filter(s => (porSituacao.get(s)?.length ?? 0) > 0)
    .map(situacao => {
      const itens = porSituacao.get(situacao)!.sort((a, b) =>
        porNomeDoAparelho.compare(a.aparelho.celular.identificacao, b.aparelho.celular.identificacao)
        || a.numero.numero.localeCompare(b.numero.numero));
      return {
        situacao,
        rotulo: SITUACAO_LABELS[situacao] ?? situacao,
        itens,
        lancados: itens.filter(i => i.numero.posse === 'setor').length,
      };
    });
}
