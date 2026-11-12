/**
 * gerentes.ts — quem CONCORRE e quem VOTA na Votação dos Gerentes
 * (12/11/2026, pedido do Kauan: «liberar para a operação votar nos gerentes,
 * bem editável, selecionando setores e equipes»).
 *
 *   concorrem  os gerentes (cargo `gerencia`) da operação escolhida — todos
 *              marcados, menos as contas que não parecem pessoa; quem organiza
 *              tira (férias, saiu) e inclui à mão (alguém da diretoria);
 *   votam      quem tem os cargos escolhidos (padrão: Operador) nos SETORES
 *              marcados, separados por EQUIPE — a equipe desmarcada sai inteira;
 *              depois dá para tirar e incluir pessoa por pessoa.
 *   cédula     CADA SETOR VOTA NO SEU GERENTE (12/11/2026): cada pessoa só vê
 *              os gerentes ligados ao setor dela. A ligação vem do cadastro
 *              (o setor do gerente) e quem organiza muda à mão — um gerente
 *              pode ser ligado a mais setores. Num setor com 2 gerentes, a
 *              pessoa escolhe em cada categoria qual dos dois combina mais.
 *
 * Sem banco: recebe o que `lerParticipantes` leu e o rascunho da tela.
 */
import type { Produto } from '@/lib/produto';
import { PERGUNTAS_PADRAO_GERENTES, VERSAO_PERGUNTAS_GERENTES, type Pergunta } from './cedula';
import { motivoDeConta, type EquipeDaVotacao, type GrupoDaVotacao, type Participante } from './participantes';

export const CARGOS_QUE_VOTAM = ['operador', 'lider', 'elite'] as const;
export const CARGO_GERENTE = 'gerencia';

export interface RascunhoGerentes {
  titulo: string;
  produto: Produto;
  /** Gerentes desmarcados (concorrem todos os da operação por padrão). */
  gerentesFora: string[];
  /** Contas tiradas pelo nome que voltaram. */
  gerentesVoltaram: string[];
  /** Incluídos à mão para concorrer (qualquer cargo). */
  gerentesIncluidos: string[];
  cargosEleitores: string[];
  /** Setores marcados (nenhum vem marcado). */
  setores: string[];
  /** Equipes desmarcadas dentro dos setores marcados (`sem:<setor>` = quem está sem equipe). */
  equipesFora: string[];
  eleitoresFora: string[];
  eleitoresVoltaram: string[];
  eleitoresIncluidos: string[];
  perguntas: Pergunta[];
  /** De que lista-base vieram as perguntas: mudou a base, o rascunho troca. */
  versaoPerguntas: number;
  /** Cada gerente só pode ser escolhido uma vez por quem vota. Padrão: não (costuma haver poucos gerentes). */
  umPorCandidato: boolean;
  /** O mesmo gerente em 1º em mais de uma categoria pede decisão da diretoria. Padrão: não. */
  umTitulo: boolean;
  /**
   * Setor → gerentes em quem ele vota, quando quem organiza mudou à mão. Setor
   * fora daqui segue o cadastro (os gerentes com aquele setor).
   */
  ligacoes: Record<string, string[]>;
}

export const rascunhoGerentesPadrao = (): RascunhoGerentes => ({
  titulo: 'Votação dos Gerentes', produto: 'cobranca',
  gerentesFora: [], gerentesVoltaram: [], gerentesIncluidos: [],
  cargosEleitores: ['operador'], setores: [], equipesFora: [],
  eleitoresFora: [], eleitoresVoltaram: [], eleitoresIncluidos: [],
  perguntas: PERGUNTAS_PADRAO_GERENTES.map(p => ({ ...p })), versaoPerguntas: VERSAO_PERGUNTAS_GERENTES,
  umPorCandidato: false, umTitulo: false, ligacoes: {},
});

export const semEquipe = (setorId: string) => `sem:${setorId}`;

export interface EquipeNoSetor { chave: string; nome: string; total: number }

export interface MontagemGerentes {
  /** Os gerentes da operação (antes de tirar). */
  gerentesDaOperacao: Participante[];
  contasGerentes: Array<{ p: Participante; motivo: string }>;
  candidatos: Participante[];
  /** Os grupos de setores da operação que têm alguém com os cargos que votam. */
  grupos: GrupoDaVotacao[];
  /** Quantos com os cargos que votam há em cada setor. */
  porSetor: Map<string, number>;
  /** As equipes de cada setor marcado, com quantos votariam. */
  equipesPorSetor: Map<string, EquipeNoSetor[]>;
  /** Pelo filtro (setores, equipes, cargos), antes de tirar ninguém. */
  doFiltro: Participante[];
  contasEleitores: Array<{ p: Participante; motivo: string }>;
  eleitores: Participante[];
  /** A equipe (nome) de cada eleitor, para a lista. */
  equipeDe: (p: Participante) => string;
  /** Setores marcados que ainda valem nesta operação. */
  marcados: Set<string>;
  /** Os gerentes (concorrendo) em quem um setor vota. */
  gerentesDoSetor: (setorId: string) => Participante[];
  /** A ligação do setor foi mudada à mão (não é a do cadastro). */
  ligadoAMao: (setorId: string) => boolean;
  /** Eleitor → os gerentes da cédula dele (ids). */
  cedulaPorEleitor: Map<string, string[]>;
  /** Quem votaria sem nenhum gerente na cédula (sem setor, ou setor sem gerente ligado). */
  semGerente: Participante[];
  /** Setores de quem vota que têm um gerente só: ali o voto é automático. */
  setoresComUm: string[];
  /** Gerentes concorrendo que nenhum eleitor vê. */
  gerentesSemEleitor: Participante[];
}

/** Quantos gerentes cada operação tem (os botões de operação). Filtro de dado, não de acesso. */
export function gerentesPorOperacao(pessoas: readonly Participante[]): Map<Produto, number> {
  const n = new Map<Produto, number>();
  for (const p of pessoas) if (p.produto && p.perfil === CARGO_GERENTE) n.set(p.produto, (n.get(p.produto) ?? 0) + 1);
  return n;
}

const porNome = (a: Participante, b: Participante) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

export function montarGerentes(
  dados: { pessoas: readonly Participante[]; grupos: readonly GrupoDaVotacao[]; equipes: readonly EquipeDaVotacao[] },
  r: RascunhoGerentes,
): MontagemGerentes {
  const porId = new Map(dados.pessoas.map(p => [p.id, p]));
  const equipePorId = new Map((dados.equipes ?? []).map(e => [e.id, e]));

  // ── Quem concorre ──
  const gerentesDaOperacao = dados.pessoas.filter(p => p.perfil === CARGO_GERENTE && p.produto === r.produto).sort(porNome);
  const contasGerentes = gerentesDaOperacao
    .map(p => ({ p, motivo: motivoDeConta(p.nome) }))
    .filter((c): c is { p: Participante; motivo: string } => c.motivo !== null);
  const contaG = new Set(contasGerentes.filter(c => !r.gerentesVoltaram.includes(c.p.id)).map(c => c.p.id));
  const incluidosG = r.gerentesIncluidos.map(id => porId.get(id)).filter((p): p is Participante => !!p);
  const jaG = new Set(incluidosG.map(p => p.id));
  const candidatos = [
    ...gerentesDaOperacao.filter(p => !jaG.has(p.id) && !contaG.has(p.id) && !r.gerentesFora.includes(p.id)),
    ...incluidosG,
  ].sort(porNome);

  // ── Quem vota ──
  const votaPeloCargo = (p: Participante) => r.cargosEleitores.includes(p.perfil);
  const porSetor = new Map<string, number>();
  for (const p of dados.pessoas) {
    if (p.setorId && p.produto === r.produto && votaPeloCargo(p)) porSetor.set(p.setorId, (porSetor.get(p.setorId) ?? 0) + 1);
  }
  const grupos = dados.grupos
    .filter(g => g.produto === r.produto)
    .map(g => ({ ...g, setores: g.setores.filter(s => (porSetor.get(s.id) ?? 0) > 0) }))
    .filter(g => g.setores.length > 0);
  const validos = new Set(grupos.flatMap(g => g.setores.map(s => s.id)));
  const marcados = new Set(r.setores.filter(id => validos.has(id)));

  // A equipe de alguém: a do cadastro, se existe; senão o balde «sem equipe» do setor dele.
  const chaveDa = (p: Participante) => (p.equipeId && equipePorId.has(p.equipeId) ? p.equipeId : semEquipe(p.setorId ?? ''));
  const equipeDe = (p: Participante) => (p.equipeId && equipePorId.get(p.equipeId)?.nome) || 'Sem equipe';

  const nosMarcados = dados.pessoas.filter(p => p.setorId && marcados.has(p.setorId) && p.produto === r.produto && votaPeloCargo(p));
  const equipesPorSetor = new Map<string, EquipeNoSetor[]>();
  for (const setorId of marcados) {
    const conta = new Map<string, EquipeNoSetor>();
    for (const p of nosMarcados) {
      if (p.setorId !== setorId) continue;
      const chave = chaveDa(p);
      const e = conta.get(chave) ?? { chave, nome: chave.startsWith('sem:') ? 'Sem equipe' : equipeDe(p), total: 0 };
      e.total++;
      conta.set(chave, e);
    }
    equipesPorSetor.set(setorId, [...conta.values()].sort((a, b) =>
      Number(a.chave.startsWith('sem:')) - Number(b.chave.startsWith('sem:')) || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })));
  }

  const doFiltro = nosMarcados.filter(p => !r.equipesFora.includes(chaveDa(p))).sort(porNome);
  const contasEleitores = doFiltro
    .map(p => ({ p, motivo: motivoDeConta(p.nome) }))
    .filter((c): c is { p: Participante; motivo: string } => c.motivo !== null);
  const contaE = new Set(contasEleitores.filter(c => !r.eleitoresVoltaram.includes(c.p.id)).map(c => c.p.id));
  const incluidosE = r.eleitoresIncluidos.map(id => porId.get(id)).filter((p): p is Participante => !!p);
  const jaE = new Set(incluidosE.map(p => p.id));
  const eleitores = [
    ...doFiltro.filter(p => !jaE.has(p.id) && !contaE.has(p.id) && !r.eleitoresFora.includes(p.id)),
    ...incluidosE,
  ].sort(porNome);

  // ── A cédula: cada setor vota no seu gerente ──
  const idsCandidatos = new Set(candidatos.map(p => p.id));
  const ligadoAMao = (setorId: string) => Object.prototype.hasOwnProperty.call(r.ligacoes ?? {}, setorId);
  const gerentesDoSetor = (setorId: string): Participante[] => {
    const ids = ligadoAMao(setorId)
      ? (r.ligacoes[setorId] ?? []).filter(id => idsCandidatos.has(id))
      : candidatos.filter(g => g.setorId === setorId).map(g => g.id);
    return ids.map(id => porId.get(id)).filter((g): g is Participante => !!g).sort(porNome);
  };
  const cedulaPorEleitor = new Map<string, string[]>();
  const semGerente: Participante[] = [];
  const vistos = new Set<string>();
  const setoresDeQuemVota = new Set<string>();
  for (const e of eleitores) {
    const ids = e.setorId ? gerentesDoSetor(e.setorId).map(g => g.id).filter(id => id !== e.id) : [];
    cedulaPorEleitor.set(e.id, ids);
    if (!ids.length) semGerente.push(e);
    if (e.setorId) setoresDeQuemVota.add(e.setorId);
    ids.forEach(id => vistos.add(id));
  }
  const setoresComUm = [...setoresDeQuemVota].filter(s => gerentesDoSetor(s).length === 1);
  const gerentesSemEleitor = candidatos.filter(g => !vistos.has(g.id));

  return {
    gerentesDaOperacao, contasGerentes, candidatos, grupos, porSetor, equipesPorSetor, doFiltro, contasEleitores, eleitores, equipeDe, marcados,
    gerentesDoSetor, ligadoAMao, cedulaPorEleitor, semGerente, setoresComUm, gerentesSemEleitor,
  };
}
