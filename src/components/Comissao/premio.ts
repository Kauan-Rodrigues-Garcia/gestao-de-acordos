/**
 * premio.ts — o percentual da faixa digitado como prêmio em reais.
 *
 * ## Por quê (pedido de 26/10/2026)
 *
 * A planilha de premiação diz o prêmio de cada meta («R$ 300,00 na 1ª Meta de
 * R$ 90.000,00»), e o banco guarda o percentual: prêmio ÷ meta × 100, com seis
 * casas (0,333333%). Digitar e conferir seis casas é onde se erra. Quando todo
 * mundo da configuração tem a MESMA meta naquela faixa, a tela deixa digitar o
 * prêmio e grava o percentual que paga exatamente esse prêmio na meta.
 *
 * ## Só com meta comum
 *
 * O percentual é da configuração; a meta é de cada pessoa. Se duas pessoas da
 * mesma configuração têm metas diferentes na faixa, o mesmo percentual paga
 * prêmios diferentes, e não existe «o prêmio» daquela faixa — ela volta ao
 * campo de percentual.
 *
 * Sem React. Os casos estão em `premio.test.ts`.
 */
import { configDoOperador, type ConfigComissao } from '@/services/comissao/comissao';
import { lerMetasExtras, type MetaLinhaBruta } from '@/services/comissao/entradaDoOperador';

/** Seis casas: o NUMERIC(9,6) do percentual (20260916140000). */
const ESCALA_PCT = 1_000_000;

/** R$ 300,00 na meta de R$ 90.000,00 → 0,333333 (%). */
export function pctDoPremio(premio: number, meta: number): number | null {
  if (!(premio > 0) || !(meta > 0)) return null;
  return Math.round((premio / meta) * 100 * ESCALA_PCT) / ESCALA_PCT;
}

/** O prêmio que o percentual paga na meta, ao centavo: 0,333333% × 90.000 → 300,00. */
export function premioDoPct(pct: number | null, meta: number): number | null {
  if (pct === null || !(meta > 0)) return null;
  return Math.round(meta * pct) / 100;
}

/** As metas de uma pessoa em ordem de faixa, como a comissão as monta. */
function degrausDaLinha(linha: MetaLinhaBruta): number[] {
  const primeira = Number(linha.meta_valor) || 0;
  if (primeira <= 0) return [];
  return [primeira, ...lerMetasExtras(linha.metas_extras)].sort((a, b) => a - b);
}

/**
 * A meta de cada faixa quando ela é a mesma para todos; `null` na faixa em que
 * divergem ou que alguém não tem. Lista vazia = ninguém com meta.
 */
export function metasEmComum(listas: readonly (readonly number[])[]): (number | null)[] {
  if (listas.length === 0) return [];
  const faixas = Math.max(...listas.map(l => l.length));
  return Array.from({ length: faixas }, (_, i) => {
    const valores = listas.map(l => l[i]);
    const primeira = valores[0];
    return primeira !== undefined && valores.every(v => v !== undefined && Math.round(v * 100) === Math.round(primeira * 100))
      ? primeira
      : null;
  });
}

/**
 * Configuração → a meta comum de cada faixa entre as pessoas que ela cobre.
 *
 * Quem a configuração cobre é decidido por `configDoOperador`, o mesmo do
 * cálculo: o padrão do setor fica só com quem não está em exceção.
 */
export function metasDeReferenciaPorConfig(params: {
  configs: readonly ConfigComissao[];
  operadores: readonly { id: string; setorOrigemId: string | null; equipeOrigemId: string | null }[];
  metas: readonly MetaLinhaBruta[];
  setorId: string;
}): Map<string, (number | null)[]> {
  const linhaDe = new Map(
    params.metas.filter(m => m.tipo === 'operador' && m.referencia_id).map(m => [m.referencia_id as string, m]),
  );
  const porConfig = new Map<string, number[][]>();
  const vistos = new Set<string>();
  for (const op of params.operadores) {
    if (op.setorOrigemId !== params.setorId || vistos.has(op.id)) continue;
    vistos.add(op.id);
    const linha = linhaDe.get(op.id);
    const degraus = linha ? degrausDaLinha(linha) : [];
    if (degraus.length === 0) continue;
    const { config } = configDoOperador({
      configs: params.configs, setorId: op.setorOrigemId, equipeId: op.equipeOrigemId, operadorId: op.id,
    });
    if (!config) continue;
    const lista = porConfig.get(config.id) ?? [];
    lista.push(degraus);
    porConfig.set(config.id, lista);
  }
  return new Map([...porConfig].map(([id, listas]) => [id, metasEmComum(listas)]));
}
