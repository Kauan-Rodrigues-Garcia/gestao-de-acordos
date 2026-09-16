/**
 * bonusTexto.ts — como a tela escreve um bônus e uma lista de pessoas.
 *
 * A mesma frase na configuração da liderança e no Dashboard do operador: «R$
 * 200,00 ao bater a 4ª Meta». Sem React; os casos estão em `rascunhoBonus.test.ts`.
 */
import { formatBRL } from '@/lib/money';
import type { SituacaoBonus, TipoBonus } from '@/services/comissao/bonus';

/** `2026-09-07` → `07/09`. */
export function diaMes(iso: string | null): string {
  if (!iso) return '—';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

/** A condição do bônus, sem o valor: «ao bater a 4ª Meta». */
export function condicaoDoBonus(b: {
  tipo: TipoBonus;
  metaOrdem: number | null;
  /** O alvo como a tela deve mostrar (bruto na configuração, unidade no Dashboard). */
  alvo: number | null;
  periodoInicio: string | null;
  periodoFim: string | null;
}): string {
  if (b.tipo === 'meta') return `ao bater a ${b.metaOrdem ?? '?'}ª Meta`;
  const alvo = b.alvo !== null ? formatBRL(b.alvo) : '—';
  if (b.tipo === 'valor') return `ao chegar a ${alvo} realizados no mês`;
  const periodo = b.periodoInicio === b.periodoFim
    ? `em ${diaMes(b.periodoInicio)}`
    : `de ${diaMes(b.periodoInicio)} a ${diaMes(b.periodoFim)}`;
  return `ao fazer ${alvo} ${periodo}`;
}

export const ROTULO_TIPO_BONUS: Record<TipoBonus, string> = {
  meta: 'Meta existente',
  valor: 'Valor realizado',
  especial: 'Meta especial',
};

export const SITUACAO_BONUS: Record<SituacaoBonus, string> = {
  atingido: 'Atingido',
  em_andamento: 'Em andamento',
  aguardando: 'Período ainda não começou',
  nao_atingido: 'Não atingido',
  sem_meta: 'Sem essa meta no mês',
};

/** «Ana, Bruno e mais 4» — o resumo de uma exceção ou de um bônus com várias pessoas. */
export function resumoDeNomes(ids: readonly string[], nomeDe: ReadonlyMap<string, string>, max = 3): string {
  const nomes = ids.map(id => nomeDe.get(id) ?? 'pessoa fora do setor')
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (nomes.length <= max) return nomes.join(', ');
  return `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`;
}
