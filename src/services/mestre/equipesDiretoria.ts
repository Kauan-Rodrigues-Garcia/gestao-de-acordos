/**
 * equipesDiretoria.ts — as equipes do Gestão dentro do Painel Diretoria.
 *
 * Pedido de 14/09/2026: no lugar das equipes que o 59 escreve, a Diretoria vê
 * as equipes que EXISTEM no sistema para o setor vinculado — no Receptivo, a do
 * Matheus e a da Luciana —, com as informações do Painel Líder: acumulado, meta,
 * faixa atual, ritmo, fechamento projetado, quartil de cada operador, quantas
 * pessoas por quartil e o operador destaque.
 *
 * ## As contas não são novas
 *
 * Tudo sai de `detalharEquipe` e `enriquecerOperadores` (`desempenhoEquipe.ts`),
 * de `operadoresDaEquipe` (quem conta onde, com clone) e de `calcularProjecao`.
 * São as funções do card de Desempenho Equipes do Painel Líder. Uma conta local
 * aqui faria a Diretoria e a liderança discordarem sobre a mesma equipe no
 * primeiro ajuste de regra.
 *
 * ## E o 59?
 *
 * A equipe do 59 (o subgrupo do ERP) continua existindo: é ela que diz de onde
 * o dinheiro veio. `separarEquipesDo59` a lê pelo vínculo com a equipe do
 * sistema — vinculada, soma na equipe do Gestão; sem vínculo, vai para uma lista
 * à parte, que é o que precisa de alguém para vincular.
 *
 * Aqui entra dado e sai número. Sem React, sem fetch.
 */
import { calcularProjecao } from '@/lib/projecaoMetas';
import type { QuartilConfig } from '@/lib/supabase';
import {
  operadoresDaEquipe,
  type EquipeAnalitico, type OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';
import {
  detalharEquipe, enriquecerOperadores,
  type DetalheEquipe, type OperadorNaEquipe,
} from '@/pages/Dashboard/Analitico/desempenhoEquipe';
import type { EquipeDoSetor } from './diretoriaSetores.service';

/** Uma linha de `metas` do mês. `meta_valor` chega como string do `numeric`. */
export interface MetaDoMes {
  tipo: string;
  referencia_id: string;
  meta_valor: number | string | null;
}

export interface OperadorDaEquipe extends OperadorNaEquipe {
  /** Recebido ÷ esperado até hoje, em %. `null` sem meta. */
  projecaoPct: number | null;
  /** 1..4. `null` sem meta — fica fora da distribuição, como no Painel Líder. */
  quartil: number | null;
}

export interface EquipeDiretoria {
  equipeId: string;
  nome: string;
  setorId: string | null;
  acumulado: number;
  meta: number | null;
  totalUteis: number;
  decorridos: number;
  /** Equipe de treinamento: dias úteis contados a partir do início do treino. */
  treino: boolean;
  /** Do maior recebimento para o menor. */
  operadores: OperadorDaEquipe[];
  detalhe: DetalheEquipe;
}

export interface EntradaEquipesDoSetor {
  setorId: string;
  equipes: readonly EquipeAnalitico[];
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  equipesExtrasPorOperador: Record<string, string[]>;
  resumos: readonly { operador_id: string; total_recebido: number | string }[];
  metas: readonly MetaDoMes[];
  identidade: Record<string, { nome: string; fotoUrl?: string | null }>;
  quartis: QuartilConfig[];
  /** Dias úteis de cada equipe — reduzidos na de treinamento. */
  diasDaEquipe: (equipeId: string) => { totalUteis: number; decorridos: number; treino: boolean };
}

function valorDaMeta(metas: readonly MetaDoMes[], tipo: string, id: string): number | null {
  const m = metas.find(x => x.tipo === tipo && x.referencia_id === id);
  const v = m ? Number(m.meta_valor) || 0 : 0;
  return v > 0 ? v : null;
}

/**
 * As equipes do sistema de um setor, com os números do Painel Líder.
 *
 * Equipe sem ninguém no mês aparece zerada, e não some: ela existe no Gestão, e
 * a pergunta da Diretoria é justamente «como estão as equipes deste setor».
 */
export function montarEquipesDoSetor(e: EntradaEquipesDoSetor): EquipeDiretoria[] {
  const recebidoPorOperador: Record<string, number> = {};
  for (const r of e.resumos) recebidoPorOperador[r.operador_id] = Number(r.total_recebido) || 0;

  const metaPorOperador: Record<string, number> = {};
  for (const m of e.metas) {
    if (m.tipo !== 'operador') continue;
    const v = Number(m.meta_valor) || 0;
    if (v > 0) metaPorOperador[m.referencia_id] = v;
  }

  const fontes = {
    operadorEquipeMap: e.operadorEquipeMap,
    equipesExtrasPorOperador: e.equipesExtrasPorOperador,
  };

  return e.equipes
    .filter(eq => eq.setor_id === e.setorId)
    .map(eq => {
      const ids = operadoresDaEquipe(eq.id, fontes);
      // O acumulado soma TODO id da equipe, tenha identidade ou não — é o que o
      // card do Painel Líder faz (`porEquipe`). A lista de pessoas, abaixo, só
      // mostra quem conta no recebimento e está ativo.
      let acumulado = 0;
      for (const id of ids) acumulado += recebidoPorOperador[id] ?? 0;

      const { totalUteis, decorridos, treino } = e.diasDaEquipe(eq.id);
      const meta = valorDaMeta(e.metas, 'equipe', eq.id);
      const pessoas = enriquecerOperadores({
        ids, identidade: e.identidade, recebidoPorOperador, metaPorOperador,
      });

      const operadores: OperadorDaEquipe[] = pessoas.map(op => {
        const p = calcularProjecao({
          meta: op.meta, recebido: op.recebido, totalUteis, decorridos, quartis: e.quartis,
        });
        return { ...op, projecaoPct: p?.projecaoPct ?? null, quartil: p?.quartil?.quartil ?? null };
      });

      return {
        equipeId: eq.id,
        nome: eq.nome,
        setorId: eq.setor_id,
        acumulado,
        meta,
        totalUteis,
        decorridos,
        treino,
        operadores,
        detalhe: detalharEquipe({
          acumulado, meta, totalUteis, decorridos, quartis: e.quartis, operadores: pessoas,
        }),
      };
    })
    .sort((a, b) => b.acumulado - a.acumulado || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * O recebimento de cada dia do mês, só dos operadores da equipe.
 *
 * Um ponto por dia, com zero nos dias sem pagamento: o gráfico de barras precisa
 * do buraco para mostrar que o dia existiu e não entrou nada.
 */
export function serieDiariaDaEquipe(
  linhas: readonly { operador_id: string | null; valor_recebido: number; data_pagamento: string }[],
  ids: ReadonlySet<string>,
  mes: string,
): { dia: number; valor: number }[] {
  const [ano, mesNum] = mes.split('-').map(Number);
  const dias = new Date(ano, mesNum, 0).getDate();
  const valores = new Array<number>(dias).fill(0);
  const prefixo = `${mes.slice(0, 7)}-`;
  for (const l of linhas) {
    if (!l.operador_id || !ids.has(l.operador_id)) continue;
    if (!l.data_pagamento?.startsWith(prefixo)) continue;
    const dia = Number(l.data_pagamento.slice(8, 10));
    if (dia >= 1 && dia <= dias) valores[dia - 1] += Number(l.valor_recebido) || 0;
  }
  return valores.map((valor, i) => ({ dia: i + 1, valor: Math.round(valor * 100) / 100 }));
}

/** A equipe do sistema vista pelo 59: a soma dos subgrupos ligados a ela. */
export interface EquipeVinculada59 {
  equipeId: string;
  nome: string;
  valor: number;
  linhas: number;
  liderNome: string | null;
  liderFoto: string | null;
  /** Os nomes do ERP que caíram nesta equipe. Mais de um = subgrupos juntados. */
  rotulos59: string[];
}

/**
 * Separa as equipes do 59 pelo vínculo com equipe do sistema.
 *
 * Vinculada: soma na equipe do Gestão, mesmo que o ERP a escreva em dois
 * subgrupos. Sem vínculo (`equipeId` nulo): lista à parte, na ordem do valor —
 * inclusive os rótulos que não são equipe (ATESTADOS|FERIAS), porque o dinheiro
 * deles também não chegou a equipe nenhuma.
 */
export function separarEquipesDo59(equipes: readonly EquipeDoSetor[]): {
  vinculadas: EquipeVinculada59[];
  semVinculo: EquipeDoSetor[];
} {
  const porEquipe = new Map<string, EquipeVinculada59>();
  const semVinculo: EquipeDoSetor[] = [];

  for (const e of equipes) {
    if (!e.equipeId) { semVinculo.push(e); continue; }
    let v = porEquipe.get(e.equipeId);
    if (!v) {
      v = {
        equipeId: e.equipeId,
        nome: e.equipeNome ?? e.nome,
        valor: 0, linhas: 0,
        liderNome: e.liderNome, liderFoto: e.liderFoto,
        rotulos59: [],
      };
      porEquipe.set(e.equipeId, v);
    }
    v.valor += e.valor;
    v.linhas += e.linhas;
    v.liderNome ??= e.liderNome;
    v.liderFoto ??= e.liderFoto;
    v.rotulos59.push(e.nome);
  }

  for (const v of porEquipe.values()) {
    v.valor = Math.round(v.valor * 100) / 100;
    v.rotulos59.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  return {
    vinculadas: [...porEquipe.values()].sort((a, b) => b.valor - a.valor),
    semVinculo: semVinculo.sort((a, b) => b.valor - a.valor),
  };
}
