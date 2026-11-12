/**
 * As contas do detalhe visual do relatório do setor (o 1017): por dia e tipo,
 * por tipo, e a busca da tabela. Puro, para o teste provar sem tela.
 */
import type { LinhaDoRelatorio } from './relatorioDoSetor.service';

export interface PontoDoDia {
  /** 'dd' para o eixo. */
  dia: string;
  /** 'yyyy-MM-dd'. */
  data: string;
  total: number;
  /** Valor por tipo (chave = tipo como veio do ERP). */
  porTipo: Record<string, number>;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Os tipos do mês, do maior valor para o menor (ordem das barras e da legenda). */
export function tiposDoMes(linhas: readonly LinhaDoRelatorio[]): { tipo: string; linhas: number; valor: number }[] {
  const m = new Map<string, { linhas: number; valor: number }>();
  for (const l of linhas) {
    const t = l.tipo ?? 'Sem tipo';
    const a = m.get(t) ?? { linhas: 0, valor: 0 };
    a.linhas += 1;
    a.valor += l.valor;
    m.set(t, a);
  }
  return [...m.entries()]
    .map(([tipo, a]) => ({ tipo, linhas: a.linhas, valor: centavos(a.valor) }))
    .sort((a, b) => b.valor - a.valor);
}

/**
 * Um ponto por dia do mês, do dia 1 ao último dia com pagamento — os dias
 * vazios aparecem como zero, senão o gráfico esconderia justamente os vales
 * entre os vencimentos fixos.
 */
export function porDia(linhas: readonly LinhaDoRelatorio[], mes: string): PontoDoDia[] {
  const m = new Map<string, Record<string, number>>();
  let ultimo = 0;
  for (const l of linhas) {
    if (!l.pagamento.startsWith(mes.slice(0, 7))) continue;
    const t = l.tipo ?? 'Sem tipo';
    const r = m.get(l.pagamento) ?? {};
    r[t] = (r[t] ?? 0) + l.valor;
    m.set(l.pagamento, r);
    ultimo = Math.max(ultimo, Number(l.pagamento.slice(8, 10)));
  }
  const pontos: PontoDoDia[] = [];
  for (let d = 1; d <= ultimo; d++) {
    const dd = String(d).padStart(2, '0');
    const data = `${mes.slice(0, 7)}-${dd}`;
    const r = m.get(data) ?? {};
    const porTipo = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, centavos(v)]));
    pontos.push({ dia: dd, data, porTipo, total: centavos(Object.values(r).reduce((s, v) => s + v, 0)) });
  }
  return pontos;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * A busca da tabela: NR, código do cliente ou franquia, sem acento e sem caixa.
 * Filtro por dia opcional (clique na barra do gráfico).
 */
export function filtrarLinhas(
  linhas: readonly LinhaDoRelatorio[],
  busca: string,
  dia: string | null,
): LinhaDoRelatorio[] {
  const q = semAcento(busca.trim());
  return linhas
    .filter(l => !dia || l.pagamento === dia)
    .filter(l => !q
      || semAcento(l.nr).includes(q)
      || semAcento(l.codCliente ?? '').includes(q)
      || semAcento(l.franquia ?? '').includes(q))
    .sort((a, b) => b.pagamento.localeCompare(a.pagamento) || b.valor - a.valor);
}
