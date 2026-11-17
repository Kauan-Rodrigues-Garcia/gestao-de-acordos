/**
 * «Por setor» na aba Minhas campanhas — a visão do super admin (16/11/2026).
 *
 * «Quando o super admin acessar a aba, ele terá informado separado, detalhado
 *  por setor, qual setor está encaminhando as campanhas que fez hoje — assim
 *  tem uma noção em vez de entrar na conta de um líder.»
 *
 * As campanhas LANÇADAS no dia (`lancada_em`, a primeira liberação — relançar
 * não muda o dia), agrupadas pelo setor, com o andamento de quem encaminha.
 * A parte pura mora aqui; a leitura é `listarCampanhasDoDia` + o andamento de
 * cada uma (`fn_campanha_facil_envios_do_lote`, só números).
 */
import type { LoteCampanha, PlacarOperador } from './campanhaFacilEnvios.service';

export interface Andamento { total: number; enviados: number; nao: number }

export interface CampanhaDoDia {
  lote: LoteCampanha;
  /** `null` = o andamento não veio (erro na leitura): conta só o `total` do lote. */
  placar: PlacarOperador[] | null;
  andamento: Andamento;
  /** Quem recebeu e já mandou tudo (enviada ou «não deu»). */
  concluiram: number;
  operadores: number;
}

export interface LiderDoDia {
  id: string;
  nome: string;
  /** As campanhas dele no setor, da mais nova para a mais antiga. */
  campanhas: CampanhaDoDia[];
  andamento: Andamento;
  /** A mais recente dele no dia (ISO). */
  ultima: string;
}

export interface SetorDoDia {
  setorId: string;
  nome: string;
  campanhas: CampanhaDoDia[];
  andamento: Andamento;
  /** Pessoas diferentes que receberam mensagem no dia, e quantas já acabaram tudo. */
  operadores: number;
  concluiram: number;
  /** Quem lançou e quantas campanhas, de quem lançou mais para quem lançou menos. */
  lideres: LiderDoDia[];
  /** A campanha mais recente do setor no dia (ISO). */
  ultima: string | null;
}

/** As que o super admin acompanha: com envio, pela ordem do lançamento. */
export function campanhaDoDia(lote: LoteCampanha, placar: PlacarOperador[] | null): CampanhaDoDia {
  const lista = placar ?? [];
  const andamento = lista.reduce<Andamento>(
    (s, o) => ({ total: s.total + o.total, enviados: s.enviados + o.enviados, nao: s.nao + o.nao_enviados }),
    { total: 0, enviados: 0, nao: 0 },
  );
  // Sem o placar (ou a campanha ficou sem contato), o total é o do lançamento.
  if (andamento.total === 0) andamento.total = lote.total;
  return {
    lote, placar,
    andamento,
    concluiram: lista.filter((o) => o.total > 0 && o.enviados + o.nao_enviados >= o.total).length,
    operadores: lista.length,
  };
}

export function faltam(a: Andamento): number {
  return Math.max(a.total - a.enviados - a.nao, 0);
}

/** Enviadas sobre o total, cortado (não arredondado): 99,6% não vira 100%. */
export function pctEnviado(a: Andamento): number {
  return a.total > 0 ? Math.floor((a.enviados / a.total) * 100) : 0;
}

/** Enviadas + «não deu»: quanto da campanha já teve resposta do operador. */
export function pctTratado(a: Andamento): number {
  return a.total > 0 ? Math.floor((Math.min(a.enviados + a.nao, a.total) / a.total) * 100) : 0;
}

const SEM_SETOR = '__sem_setor__';

/**
 * Agrupa as campanhas do dia por setor. Os setores da lista sem campanha não
 * entram aqui — a tela mostra «sem campanha hoje» à parte com `setoresSemCampanha`.
 *
 * Ordem: quem mais tem mensagem para mandar no dia primeiro; empate, o nome.
 */
export function agruparPorSetor(
  campanhas: readonly CampanhaDoDia[],
  nomesDosSetores: ReadonlyMap<string, string> = new Map(),
): SetorDoDia[] {
  const grupos = new Map<string, CampanhaDoDia[]>();
  for (const c of campanhas) {
    const k = c.lote.setor_id ?? SEM_SETOR;
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }

  const setores: SetorDoDia[] = [];
  for (const [setorId, lista] of grupos) {
    const ordenadas = [...lista].sort((a, b) => quandoLancou(b.lote).localeCompare(quandoLancou(a.lote)));
    const andamento = ordenadas.reduce<Andamento>(
      (s, c) => ({ total: s.total + c.andamento.total, enviados: s.enviados + c.andamento.enviados, nao: s.nao + c.andamento.nao }),
      { total: 0, enviados: 0, nao: 0 },
    );

    // A mesma pessoa em duas campanhas conta uma vez; acabou só se acabou todas.
    const porPessoa = new Map<string, { total: number; tratado: number }>();
    for (const c of ordenadas) {
      for (const o of c.placar ?? []) {
        const p = porPessoa.get(o.operador_id) ?? { total: 0, tratado: 0 };
        p.total += o.total;
        p.tratado += o.enviados + o.nao_enviados;
        porPessoa.set(o.operador_id, p);
      }
    }

    const lideres = new Map<string, LiderDoDia>();
    for (const c of ordenadas) {
      const id = c.lote.criado_por;
      const l = lideres.get(id) ?? {
        id, nome: c.lote.criado_por_nome?.trim() || 'Sem nome', campanhas: [],
        andamento: { total: 0, enviados: 0, nao: 0 }, ultima: quandoLancou(c.lote),
      };
      l.campanhas.push(c);
      l.andamento = {
        total: l.andamento.total + c.andamento.total,
        enviados: l.andamento.enviados + c.andamento.enviados,
        nao: l.andamento.nao + c.andamento.nao,
      };
      lideres.set(id, l);
    }

    setores.push({
      setorId,
      nome: setorId === SEM_SETOR
        ? 'Sem setor'
        : (nomesDosSetores.get(setorId) ?? ordenadas.find((c) => c.lote.setor_nome)?.lote.setor_nome ?? 'Setor'),
      campanhas: ordenadas,
      andamento,
      operadores: porPessoa.size,
      concluiram: [...porPessoa.values()].filter((p) => p.total > 0 && p.tratado >= p.total).length,
      lideres: [...lideres.values()]
        .sort((a, b) => b.campanhas.length - a.campanhas.length || a.nome.localeCompare(b.nome, 'pt-BR')),
      ultima: ordenadas[0] ? quandoLancou(ordenadas[0].lote) : null,
    });
  }

  return setores.sort((a, b) =>
    b.andamento.total - a.andamento.total || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Os setores da lista que não lançaram campanha no dia, por nome. */
export function setoresSemCampanha(
  todos: readonly { id: string; nome: string }[],
  comCampanha: readonly SetorDoDia[],
): { id: string; nome: string }[] {
  const tem = new Set(comCampanha.map((s) => s.setorId));
  return todos.filter((s) => !tem.has(s.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Os números do dia somando os setores. */
export function totalDoDia(setores: readonly SetorDoDia[]): Andamento & { campanhas: number; lideres: number } {
  return setores.reduce(
    (s, x) => ({
      campanhas: s.campanhas + x.campanhas.length,
      // O mesmo líder em dois setores conta em cada um: é o que o cartão mostra.
      lideres: s.lideres + x.lideres.length,
      total: s.total + x.andamento.total,
      enviados: s.enviados + x.andamento.enviados,
      nao: s.nao + x.andamento.nao,
    }),
    { campanhas: 0, lideres: 0, total: 0, enviados: 0, nao: 0 },
  );
}

function quandoLancou(l: Pick<LoteCampanha, 'lancada_em' | 'criado_em'>): string {
  return l.lancada_em ?? l.criado_em;
}

/** O começo e o fim do dia LOCAL de `dia`, em ISO — o filtro do `lancada_em`. */
export function limitesDoDia(dia: Date): { de: string; ate: string } {
  const ini = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate());
  const fim = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1);
  return { de: ini.toISOString(), ate: fim.toISOString() };
}

export function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
