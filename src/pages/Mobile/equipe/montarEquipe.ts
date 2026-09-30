/**
 * Os números de UMA equipe para a tela do celular — sem conta nova.
 *
 * Spec: docs/superpowers/specs/2026-09-30-mobile-lideranca-design.md §2.
 *
 * Cada número sai da mesma função que o Painel do Líder usa:
 *
 *   • acumulado ............ `somarPorEquipe`       (card do Desempenho Equipes)
 *   • dias (treinamento) ... `diasDaEquipe`
 *   • ritmo, faixas ........ `detalharEquipe`       (área expandida do card)
 *   • linhas dos quartis ... `montarLinhasQuartil`  (aba Quartis, recortada na equipe)
 *
 * Unidade: na PaguePlay tudo em H.O., como o card (`mostrarHO`) e os Quartis
 * (que abrem em H.O.). A meta só existe em bruto e é convertida por
 * `metaNaUnidade`; o recebido já vem em H.O. no resumo (`total_ho`).
 */
import { metaNaUnidade } from '@/lib/unidadeValor';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import type { QuartilConfig } from '@/lib/supabase';
import {
  operadoresDaEquipe,
  type EquipeAnalitico, type OperadorEquipeInfo, type ResumoOperadorAnalitico,
} from '@/services/analitico/analitico.service';
import type { CreditoDeOrigem } from '@/services/analitico/fantasmaTransferencia';
import type { MapaRecebimentoIndireto } from '@/services/metas/recebimentoIndireto.service';
import { somarPorEquipe, diasDaEquipe } from '@/pages/Dashboard/Analitico/acumuladoDaEquipe';
import {
  detalharEquipe, enriquecerOperadores, type DetalheEquipe,
} from '@/pages/Dashboard/Analitico/desempenhoEquipe';
import {
  montarLinhasQuartil, distribuicaoQuartis, type LinhaQuartil, type PerfilOp,
} from '@/pages/Dashboard/Analitico/linhasQuartil';
import { mapaSetorDaEquipe } from '@/services/analitico/analitico.service';

/** Tudo o que a tela busca uma vez por empresa e mês — as fontes do Painel. */
export interface FontesEquipe {
  mes: string;
  hojeISO: string;
  emHO: boolean;
  /** Percentual de H.O. da aba Metas (converte a frente indireta). */
  ho: number;
  equipes: EquipeAnalitico[];
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  equipesExtrasPorOperador: Record<string, string[]>;
  resumos: ResumoOperadorAnalitico[];
  creditosDeOrigem: CreditoDeOrigem[];
  /** equipe_id → meta bruta (> 0). */
  metasEquipe: Record<string, number>;
  /** operador_id → meta direta bruta (> 0). */
  metasOperador: Record<string, number>;
  /** operador_id → meta indireta bruta `[PP]`. */
  metasIndiretas: Record<string, number>;
  indiretoMap: MapaRecebimentoIndireto;
  feriados: string[];
  contarHoje: boolean;
  quartis: QuartilConfig[];
  /** equipe_id → início do treinamento. */
  treinoMap: Record<string, string | null>;
  /** Quem conta no recebimento, com situação (a lista dos Quartis). */
  operadores: PerfilOp[];
  /** setor_id → nome. */
  setores: Record<string, string>;
}

export interface EquipeNaTela {
  id: string;
  nome: string;
  setorNome: string | null;
  treinamento: boolean;
  emHO: boolean;
  acumulado: number;
  /** Meta na unidade da tela. `null` = sem meta. */
  meta: number | null;
  totalUteis: number;
  decorridos: number;
  /** Esperado até hoje (meta diária × decorridos). `null` sem meta. */
  esperado: number | null;
  detalhe: DetalheEquipe;
  quartis: QuartilConfig[];
  /** Operadores com meta, melhor projeção primeiro. */
  linhas: LinhaQuartil[];
  semMeta: PerfilOp[];
  distribuicao: { total: number; fatias: { quartil: number; qtd: number }[] };
  /** Quem conta nesta equipe (principal + clones) — recorte do gráfico e dos pagamentos. */
  operadorIds: string[];
  /** operador_id → nome, para as listas. */
  nomes: Record<string, string>;
}

export function montarEquipe(fontes: FontesEquipe, equipeId: string): EquipeNaTela | null {
  const eq = fontes.equipes.find(e => e.id === equipeId);
  if (!eq) return null;

  const [ano, mesNum] = fontes.mes.split('-').map(Number);
  const quartis = fontes.quartis.length ? fontes.quartis : QUARTIS_PADRAO;
  const inicioTreino = fontes.treinoMap[equipeId] ?? null;
  const treinamento = equipeId in fontes.treinoMap;
  const dias = diasDaEquipe({
    ano, mes: mesNum, feriados: fontes.feriados, hojeISO: fontes.hojeISO,
    contarHoje: fontes.contarHoje, inicioTreino,
  });

  const soma = somarPorEquipe({
    resumos: fontes.resumos,
    operadorEquipeMap: fontes.operadorEquipeMap,
    equipesExtrasPorOperador: fontes.equipesExtrasPorOperador,
    creditosDeOrigem: fontes.creditosDeOrigem,
  })[equipeId] ?? { bruto: 0, ho: 0, ajuste: 0 };

  const metaBruta = fontes.metasEquipe[equipeId] ?? null;
  const metaHO = metaNaUnidade(metaBruta, 'ho');
  const acumulado = fontes.emHO ? soma.ho : soma.bruto;
  const meta = fontes.emHO ? (metaHO != null && metaHO > 0 ? metaHO : null) : metaBruta;

  // Pessoas do card: a mesma regra de participação do Painel.
  const ids = operadoresDaEquipe(equipeId, fontes);
  const identidade: Record<string, { nome: string; fotoUrl: string | null }> = {};
  const nomes: Record<string, string> = {};
  for (const o of fontes.operadores) {
    nomes[o.id] = o.nome;
    const s = o.situacao ?? 'ativo';
    if (s === 'ativo' && o.arquivado !== true) identidade[o.id] = { nome: o.nome, fotoUrl: o.foto_url };
  }
  const recebidoPorOperador: Record<string, number> = {};
  for (const r of fontes.resumos) recebidoPorOperador[r.operador_id] = Number(r.total_recebido) || 0;

  const detalhe = detalharEquipe({
    acumulado, meta, totalUteis: dias.totalUteis, decorridos: dias.decorridos, quartis,
    operadores: enriquecerOperadores({
      ids, identidade, recebidoPorOperador, metaPorOperador: fontes.metasOperador,
    }),
  });

  const esperado = meta !== null && meta > 0 && dias.totalUteis > 0
    ? (meta / dias.totalUteis) * Math.max(dias.decorridos, 1)
    : null;

  const nomeDaEquipe = new Map(fontes.equipes.map(e => [e.id, e.nome] as const));
  const { porSetor, semMeta } = montarLinhasQuartil({
    anoNum: ano, mesNum, mes: fontes.mes, hojeISO: fontes.hojeISO,
    feriados: fontes.feriados, contarHoje: fontes.contarHoje, quartis,
    resumos: fontes.resumos, operadores: fontes.operadores,
    metasOp: fontes.metasOperador, metasIndiretas: fontes.metasIndiretas,
    indiretoMap: fontes.indiretoMap, emHO: fontes.emHO, ho: fontes.ho,
    setorIds: [], equipeIds: [equipeId],
    operadorEquipeMap: fontes.operadorEquipeMap,
    equipesExtrasPorOperador: fontes.equipesExtrasPorOperador,
    setorDaEquipe: mapaSetorDaEquipe(fontes.equipes), nomeDaEquipe,
    treinoMap: fontes.treinoMap,
  });
  const linhas = [...porSetor.values()].flat()
    .sort((a, b) => (b.projecao ?? -1) - (a.projecao ?? -1));

  return {
    id: eq.id,
    nome: eq.nome,
    setorNome: eq.setor_id ? fontes.setores[eq.setor_id] ?? null : null,
    treinamento,
    emHO: fontes.emHO,
    acumulado,
    meta,
    totalUteis: dias.totalUteis,
    decorridos: dias.decorridos,
    esperado,
    detalhe,
    quartis,
    linhas,
    semMeta,
    distribuicao: distribuicaoQuartis(linhas, quartis),
    operadorIds: [...ids],
    nomes,
  };
}
