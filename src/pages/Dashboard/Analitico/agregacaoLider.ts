/**
 * agregacaoLider.ts — as contas da visão de líder do Analítico.
 *
 * ## Por que isto saiu do componente
 *
 * `AnaliticoLider.tsx` tinha 1.063 linhas, e no meio delas moravam quatro
 * `useMemo` que decidem NÚMERO — quem entra no total do setor, como os
 * operadores se agrupam por equipe quando há clones, e de onde vem cada card.
 * Lógica dentro de `useMemo` só é exercitada montando a tela inteira: nenhum
 * desses quatro tinha teste, e os três incidentes de clone que o projeto já
 * teve nasceram exatamente aí.
 *
 * Aqui são funções puras — entra dado, sai número. O componente ficou com o
 * que é dele: estado, efeitos e JSX.
 *
 * ## A regra que atravessa o arquivo inteiro
 *
 * Um operador CLONADO conta no setor da equipe que o tomou emprestado **sem
 * sair** do setor de origem. Todo lugar que pergunta "este operador conta neste
 * setor?" usa `setoresDoOperador` — a mesma função do serviço, não uma cópia.
 * Quando o card do setor usava essa regra e o "Total recebido" usava
 * `info.setor_id === setorId`, os dois discordavam na tela.
 */
import {
  setoresDoOperador,
  type ResumoOperadorAnalitico,
  type ResumoMensalAnalitico,
  type EquipeAnalitico,
  type OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';
import { setorSomaPorUsuarios } from '@/services/analitico/escopoAnalitico';
import type { AnaliticoRecebimento } from '@/lib/supabase';

/** Tudo o que é preciso para responder onde cada operador conta. */
export interface VinculosOperador {
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  /** equipe_id em que o operador é clone que conta no recebimento. */
  equipesExtras: Record<string, string[]>;
  /** equipe_id → setor_id do setor dono da equipe. */
  setorDaEquipe: Map<string, string>;
}

/** O recebimento deste operador conta neste setor? */
export function contaNoSetor(
  operadorId: string, setorId: string, v: VinculosOperador,
): boolean {
  return setoresDoOperador(
    operadorId, v.operadorEquipeMap, v.equipesExtras, v.setorDaEquipe,
  ).has(setorId);
}

export interface FiltroEscopo {
  setorId?: string | null;
  equipeId?: string | null;
}

/**
 * Resumos que sobram depois dos filtros de setor e equipe.
 *
 * O filtro de setor inclui os clonados de outro setor; o de equipe inclui quem
 * é clone naquela equipe. Sem essas duas inclusões o "Total recebido" ficava
 * menor que o card de setor do Desempenho Equipes, que já as fazia.
 */
export function filtrarResumos(
  resumos: ResumoOperadorAnalitico[],
  { setorId, equipeId }: FiltroEscopo,
  v: VinculosOperador,
): ResumoOperadorAnalitico[] {
  let base = resumos;
  if (setorId) {
    base = base.filter(r => contaNoSetor(r.operador_id, setorId, v));
  }
  if (equipeId) {
    base = base.filter(r =>
      v.operadorEquipeMap[r.operador_id]?.equipe_id === equipeId
      || (v.equipesExtras[r.operador_id] ?? []).includes(equipeId));
  }
  return base;
}

export interface GrupoEquipe {
  equipeId: string | null;
  equipeNome: string;
  items: ResumoOperadorAnalitico[];
}

/**
 * Agrupa os operadores por equipe para a aba "Por operador".
 *
 * Um operador clonado aparece na(s) equipe(s) em que foi clonado, não só na
 * própria. Com filtro de setor, ele só entra nas equipes DAQUELE setor — assim
 * um clone do Play 5 no Digital aparece sob "Digital", e não sob "Play 5", que
 * é a equipe de origem, de outro setor.
 *
 * Quem não caiu em nenhuma equipe visível vai para "Sem equipe", e mesmo esse
 * grupo respeita o filtro de setor.
 */
export function agruparPorEquipe(
  resumos: ResumoOperadorAnalitico[],
  equipes: EquipeAnalitico[],
  { setorId }: FiltroEscopo,
  v: VinculosOperador,
): GrupoEquipe[] {
  const eqInfo = new Map(equipes.map(e => [e.id, e] as const));
  const base = setorId
    ? resumos.filter(r => contaNoSetor(r.operador_id, setorId, v))
    : resumos;

  const grupos = new Map<string, GrupoEquipe>();
  const adicionar = (
    chave: string, equipeId: string | null, nome: string, r: ResumoOperadorAnalitico,
  ) => {
    let g = grupos.get(chave);
    if (!g) { g = { equipeId, equipeNome: nome, items: [] }; grupos.set(chave, g); }
    // O mesmo operador pode chegar duas vezes (própria equipe + clone dela).
    if (!g.items.some(x => x.operador_id === r.operador_id)) g.items.push(r);
  };

  for (const r of base) {
    const info = v.operadorEquipeMap[r.operador_id];
    const candidatas = new Set<string>();
    if (info?.equipe_id) candidatas.add(info.equipe_id);
    for (const extra of v.equipesExtras[r.operador_id] ?? []) candidatas.add(extra);

    let entrouEmAlguma = false;
    for (const eqId of candidatas) {
      const e = eqInfo.get(eqId);
      const eqSetor = e?.setor_id ?? (eqId === info?.equipe_id ? info?.setor_id ?? null : null);
      if (setorId && eqSetor !== setorId) continue;
      const nome = e?.nome
        ?? (eqId === info?.equipe_id ? info?.equipe_nome ?? 'Sem equipe' : 'Equipe');
      adicionar(eqId, eqId, nome, r);
      entrouEmAlguma = true;
    }
    if (!entrouEmAlguma && (!setorId || info?.setor_id === setorId)) {
      adicionar('__sem__', null, info?.equipe_nome ?? 'Sem equipe', r);
    }
  }

  return [...grupos.values()].filter(g => g.items.length > 0);
}

export interface MetricasLider {
  totalRecebido: number;
  totalHo: number;
  totalOperadores: number;
  totalPagamentos: number;
  periodoInicio: string | null;
  periodoFim: string | null;
}

export interface EntradaMetricas {
  setorId?: string | null;
  equipeId?: string | null;
  /** Snapshot gravado na importação — a verdade quando não há filtro. */
  snapshot: ResumoMensalAnalitico | null;
  resumosFiltrados: ResumoOperadorAnalitico[];
  orfaosPorSetor: Record<string, { total: number; qtd: number }>;
  totalPorSetor: Record<string, { total: number; ho: number; qtd: number }>;
  setoresAlternativos: ReadonlySet<string>;
  isPaguePlay: boolean;
}

/**
 * Os números dos cards. Tudo sai do relatório ANALÍTICO — nunca da tabulação.
 *
 * São três origens, nesta ordem:
 *
 * 1. **Sem filtro** → o snapshot salvo na importação. É o único que não muda
 *    quando alguém apaga linhas depois: reflete o relatório como ele chegou.
 *    Sem snapshot, devolve `null` e a tela mostra o esqueleto de carregamento.
 * 2. **Setor normal, sem equipe** → o total CARIMBADO por `setor_id` no
 *    relatório. Clone não mexe nesse número, e é isso que se quer: o dinheiro
 *    foi creditado ao setor pelo próprio relatório.
 * 3. **Setor alternativo, PaguePlay, ou filtro de equipe** → soma dos resumos
 *    (membros + clones). `setorSomaPorUsuarios` é quem decide, e é a mesma
 *    função que o dashboard e o Painel Líder consultam — esta tela já foi a
 *    única a usar o carimbo também na PaguePlay, e por isso divergia.
 *
 * No caso 3, filtrando por SETOR (sem equipe), os órfãos daquele setor entram
 * no total: sem operador vinculado, eles só têm o setor da importação, e ficar
 * de fora faria o setor parecer ter recebido menos do que recebeu.
 */
export function calcularMetricas(e: EntradaMetricas): MetricasLider | null {
  const { setorId, equipeId, snapshot } = e;

  if (!setorId && !equipeId) {
    if (!snapshot) return null;
    return {
      totalRecebido:   snapshot.total_recebido,
      totalHo:         snapshot.total_ho,
      totalOperadores: snapshot.total_operadores,
      totalPagamentos: snapshot.total_pagamentos,
      periodoInicio:   snapshot.periodo_inicio,
      periodoFim:      snapshot.periodo_fim,
    };
  }

  const somaPorUsuarios = setorId
    ? setorSomaPorUsuarios({
        isPaguePlay: e.isPaguePlay,
        alternativo: e.setoresAlternativos.has(setorId),
      })
    : false;

  if (setorId && !equipeId && !somaPorUsuarios) {
    const total = e.totalPorSetor[setorId];
    return {
      totalRecebido:   total?.total ?? 0,
      totalHo:         total?.ho ?? 0,
      totalOperadores: e.resumosFiltrados.length,
      totalPagamentos: total?.qtd ?? 0,
      periodoInicio:   snapshot?.periodo_inicio ?? null,
      periodoFim:      snapshot?.periodo_fim ?? null,
    };
  }

  const orfaos = setorId && !equipeId ? e.orfaosPorSetor[setorId] : undefined;
  return {
    totalRecebido:   e.resumosFiltrados.reduce((s, r) => s + r.total_recebido, 0)
                     + (orfaos?.total ?? 0),
    totalHo:         e.resumosFiltrados.reduce((s, r) => s + r.total_ho, 0),
    totalOperadores: e.resumosFiltrados.length,
    totalPagamentos: e.resumosFiltrados.reduce((s, r) => s + r.total_pagamentos, 0)
                     + (orfaos?.qtd ?? 0),
    periodoInicio:   snapshot?.periodo_inicio ?? null,
    periodoFim:      snapshot?.periodo_fim ?? null,
  };
}

/** Perfis do setor em foco — base para limpar/remover sem passar do escopo. */
export function perfilIdsDoSetor(
  operadorEquipeMap: Record<string, OperadorEquipeInfo>,
  setorId: string | null | undefined,
): string[] {
  if (!setorId) return [];
  return Object.entries(operadorEquipeMap)
    .filter(([, info]) => info.setor_id === setorId)
    .map(([id]) => id);
}

/**
 * Órfãos que o usuário pode ver.
 *
 * Órfão não tem operador, então pertence ao setor da importação: o `setor_id`
 * carimbado na linha e, na falta dele, o setor de quem importou. Líder e
 * gerência veem só os do próprio setor; diretoria e admin veem todos.
 */
export function filtrarOrfaosDoSetor(
  orfaos: AnaliticoRecebimento[],
  restritoAoSetor: boolean,
  operadorEquipeMap: Record<string, OperadorEquipeInfo>,
  setorId: string | null | undefined,
): AnaliticoRecebimento[] {
  if (!restritoAoSetor) return orfaos;
  return orfaos.filter(o =>
    (o.setor_id ?? operadorEquipeMap[o.importado_por_id ?? '']?.setor_id) === setorId);
}

export interface FiltroData { inicio: string; fim: string }

/** Recorte por data das linhas de um operador expandido. Sem filtro, tudo. */
export function filtrarLinhasPorData(
  linhas: AnaliticoRecebimento[],
  filtro: FiltroData | undefined,
): AnaliticoRecebimento[] {
  if (!filtro || (!filtro.inicio && !filtro.fim)) return linhas;
  return linhas.filter(l => {
    if (filtro.inicio && l.data_pagamento < filtro.inicio) return false;
    if (filtro.fim    && l.data_pagamento > filtro.fim)    return false;
    return true;
  });
}
