/**
 * publico.ts — QUEM VOTA na votação de opções (16/11/2026): «o operador, a
 * equipe, o setor ou os setores escolhidos nas configurações».
 *
 *   1. os CARGOS que votam (padrão: Operador);
 *   2. os SETORES marcados (nenhum vem marcado), de qualquer operação;
 *   3. dentro de cada setor, as EQUIPES vêm marcadas — a desmarcada sai inteira;
 *   4. pessoa por pessoa: tirar alguém, ou incluir à mão quem não entrou pelo
 *      filtro (um operador de outro setor, alguém da diretoria…).
 *
 * Contas que não parecem pessoa («Suporte Play 2») ficam fora pelo nome
 * (`motivoDeConta`), com «colocar de volta».
 *
 * Sem banco: recebe o que `lerParticipantes` leu e o rascunho da tela.
 */
import { motivoDeConta, type EquipeDaVotacao, type GrupoDaVotacao, type Participante } from '@/components/VotacaoLideres/participantes';

export interface RascunhoPublico {
  cargos: string[];
  setores: string[];
  /** Equipes desmarcadas nos setores marcados (`sem:<setor>` = quem está sem equipe). */
  equipesFora: string[];
  /** Tirados da lista um a um. */
  fora: string[];
  /** Contas tiradas pelo nome que voltaram. */
  voltaram: string[];
  /** Incluídos à mão (qualquer cargo, qualquer setor). */
  incluidos: string[];
}

export const publicoPadrao = (): RascunhoPublico => ({
  cargos: ['operador'], setores: [], equipesFora: [], fora: [], voltaram: [], incluidos: [],
});

export const semEquipe = (setorId: string) => `sem:${setorId}`;

export interface EquipeNoSetor { chave: string; nome: string; total: number }

export interface MontagemPublico {
  /** Os cargos que existem no cadastro (para os botões), com quantos tem. */
  cargos: Array<{ cargo: string; total: number }>;
  /** Grupos de setores que têm alguém com os cargos escolhidos. */
  grupos: GrupoDaVotacao[];
  porSetor: Map<string, number>;
  marcados: Set<string>;
  equipesPorSetor: Map<string, EquipeNoSetor[]>;
  /** Pelo filtro (cargos, setores, equipes), antes de tirar ninguém. */
  doFiltro: Participante[];
  contas: Array<{ p: Participante; motivo: string }>;
  incluidos: Participante[];
  eleitores: Participante[];
  equipeDe: (p: Participante) => string;
}

const porNome = (a: Participante, b: Participante) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

export function montarPublico(
  dados: { pessoas: readonly Participante[]; grupos: readonly GrupoDaVotacao[]; equipes: readonly EquipeDaVotacao[] },
  r: RascunhoPublico,
): MontagemPublico {
  const porId = new Map(dados.pessoas.map(p => [p.id, p]));
  const equipePorId = new Map(dados.equipes.map(e => [e.id, e]));

  const contaCargo = new Map<string, number>();
  for (const p of dados.pessoas) contaCargo.set(p.perfil, (contaCargo.get(p.perfil) ?? 0) + 1);
  const cargos = [...contaCargo.entries()].map(([cargo, total]) => ({ cargo, total }))
    // O mais numeroso primeiro (na prática, Operador). Ordem de botão, não acesso.
    .sort((a, b) => b.total - a.total || a.cargo.localeCompare(b.cargo));

  const pelosCargos = (p: Participante) => r.cargos.includes(p.perfil);
  const porSetor = new Map<string, number>();
  for (const p of dados.pessoas) if (p.setorId && pelosCargos(p)) porSetor.set(p.setorId, (porSetor.get(p.setorId) ?? 0) + 1);
  const grupos = dados.grupos
    .map(g => ({ ...g, setores: g.setores.filter(s => (porSetor.get(s.id) ?? 0) > 0) }))
    .filter(g => g.setores.length > 0);
  const validos = new Set(grupos.flatMap(g => g.setores.map(s => s.id)));
  const marcados = new Set(r.setores.filter(id => validos.has(id)));

  const chaveDa = (p: Participante) => (p.equipeId && equipePorId.has(p.equipeId) ? p.equipeId : semEquipe(p.setorId ?? ''));
  const equipeDe = (p: Participante) => (p.equipeId ? equipePorId.get(p.equipeId)?.nome : undefined) ?? 'Sem equipe';
  const nosMarcados = dados.pessoas.filter(p => p.setorId && marcados.has(p.setorId) && pelosCargos(p));

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
  const contas = doFiltro
    .map(p => ({ p, motivo: motivoDeConta(p.nome) }))
    .filter((c): c is { p: Participante; motivo: string } => c.motivo !== null);
  const contaFora = new Set(contas.filter(c => !r.voltaram.includes(c.p.id)).map(c => c.p.id));
  const incluidos = r.incluidos.map(id => porId.get(id)).filter((p): p is Participante => !!p).sort(porNome);
  const ja = new Set(incluidos.map(p => p.id));
  const eleitores = [
    ...doFiltro.filter(p => !ja.has(p.id) && !contaFora.has(p.id) && !r.fora.includes(p.id)),
    ...incluidos,
  ].sort(porNome);

  return { cargos, grupos, porSetor, marcados, equipesPorSetor, doFiltro, contas, incluidos, eleitores, equipeDe };
}

/** O recorte, para o registro no banco (`publico`): só o que foi escolhido. */
export function resumoDoPublico(m: MontagemPublico, r: RascunhoPublico) {
  return {
    cargos: r.cargos,
    setores: [...m.marcados],
    equipes_fora: r.equipesFora,
    tirados: r.fora,
    incluidos: r.incluidos,
  };
}
