/**
 * indicacoesResumo.ts — os números do topo da aba Indicações.
 *
 * Tudo sai da lista que a tela JÁ tem, depois do filtro de alcance («só as
 * minhas», «minha equipe», «todos»). Por isso o gráfico por dia é calculado
 * aqui, e não pela RPC `fn_indicacoes_por_dia`: a RPC devolve o recorte da RLS,
 * e o líder que escolhe «só as minhas» veria no gráfico o dia da equipe inteira
 * embaixo de um título que diz que é o dele.
 *
 * Funções puras, sem rede — testadas em `__tests__/indicacoesResumo.test.ts`.
 */

export interface IndicacaoResumivel {
  instituicao: string;
  telefone: string | null;
  data_indicacao: string;
  operador_id: string;
  criado_em?: string;
}

export interface PontoDia {
  /** 'yyyy-MM-dd'. */
  dia: string;
  quantidade: number;
}

export interface ResumoDoMes {
  total: number;
  /** Escolas distintas — sem acento, sem caixa, sem espaço sobrando. */
  escolas: number;
  hoje: number;
  /** Os últimos 7 dias corridos, hoje incluído. */
  semana: number;
  /** Dias com pelo menos uma indicação. */
  diasAtivos: number;
  melhorDia: PontoDia | null;
  /**
   * Dias úteis seguidos com indicação, contando para trás a partir de hoje.
   * Se hoje ainda não teve, começa de ontem — às 8h ninguém indicou ainda, e
   * zerar a sequência de manhã ensinaria a ignorar o número.
   */
  sequencia: number;
}

function chaveEscola(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function dia(iso: string): string {
  return String(iso).slice(0, 10);
}

/** 'yyyy-MM-dd' deslocado em dias, sem fuso. */
export function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const data = new Date(Date.UTC(a, m - 1, d + n));
  return data.toISOString().slice(0, 10);
}

function ehFimDeSemana(iso: string): boolean {
  const [a, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Uma barra por dia que teve indicação, em ordem. */
export function porDiaDasIndicacoes(itens: readonly IndicacaoResumivel[]): PontoDia[] {
  const mapa = new Map<string, number>();
  for (const i of itens) {
    const d = dia(i.data_indicacao);
    mapa.set(d, (mapa.get(d) ?? 0) + 1);
  }
  return [...mapa]
    .map(([d, quantidade]) => ({ dia: d, quantidade }))
    .sort((a, b) => (a.dia < b.dia ? -1 : 1));
}

export function resumoDoMes(itens: readonly IndicacaoResumivel[], hoje: string): ResumoDoMes {
  const dias = porDiaDasIndicacoes(itens);
  const porDia = new Map(dias.map(p => [p.dia, p.quantidade]));
  const inicioSemana = somarDias(hoje, -6);

  let melhorDia: PontoDia | null = null;
  for (const p of dias) if (!melhorDia || p.quantidade > melhorDia.quantidade) melhorDia = p;

  // A sequência anda para trás pulando sábado e domingo: fim de semana sem
  // indicação não quebra a constância de quem trabalha de segunda a sexta.
  let sequencia = 0;
  let cursor = porDia.has(hoje) ? hoje : somarDias(hoje, -1);
  for (let guarda = 0; guarda < 400; guarda++) {
    if (ehFimDeSemana(cursor)) {
      if (porDia.has(cursor)) sequencia++;
      cursor = somarDias(cursor, -1);
      continue;
    }
    if (!porDia.has(cursor)) break;
    sequencia++;
    cursor = somarDias(cursor, -1);
  }

  return {
    total: itens.length,
    escolas: new Set(itens.map(i => chaveEscola(i.instituicao))).size,
    hoje: porDia.get(hoje) ?? 0,
    semana: dias.filter(p => p.dia >= inicioSemana && p.dia <= hoje).reduce((t, p) => t + p.quantidade, 0),
    diasAtivos: dias.length,
    melhorDia,
    sequencia,
  };
}

/** A posição (1-based) da pessoa num ranking já ordenado. `null` = não está nele. */
export function posicaoNoRanking(
  ranking: readonly { operador_id: string }[],
  perfilId: string | null | undefined,
): number | null {
  if (!perfilId) return null;
  const i = ranking.findIndex(r => r.operador_id === perfilId);
  return i < 0 ? null : i + 1;
}

/** Variação contra o mês anterior, em %. `null` sem base (mês anterior zerado). */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/** As iniciais para o avatar: «Ana Clara Victorio» → «AV». */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Busca sem acento e sem caixa em escola, gestora, telefone e quem indicou. */
export function casaComBusca(
  item: { instituicao: string; gestora: string | null; telefone: string | null; perfis?: { nome: string } | null },
  termo: string,
): boolean {
  const t = chaveEscola(termo);
  if (!t) return true;
  const digitos = termo.replace(/\D/g, '');
  const alvo = chaveEscola(`${item.instituicao} ${item.gestora ?? ''} ${item.perfis?.nome ?? ''}`);
  if (alvo.includes(t)) return true;
  return digitos.length >= 3 && (item.telefone ?? '').replace(/\D/g, '').includes(digitos);
}
