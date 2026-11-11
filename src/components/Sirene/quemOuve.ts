/**
 * quemOuve.ts — «para quem» a sirene toca, sem tela (11/11/2026).
 *
 * No banco, «todos» é `setor_ids` e `equipe_ids` vazios, e quem ouve é quem é
 * de UM dos setores OU de UMA das equipes (migration 20261029195000). A tela
 * guarda o «todos» à parte: começar sem nada escolhido não pode virar «todos».
 *
 * Escolher o setor inteiro já inclui as equipes dele, então as equipes daquele
 * setor saem da lista de escolhidas (não ficam repetidas no banco).
 */

import { DURACAO_PADRAO_S, VOLUME_PADRAO, minutosDaHora, type CorDaSirene } from './horario';

export interface SetorDaSirene { id: string; nome: string }
export interface EquipeDaSirene { id: string; nome: string; setor_id: string | null }

export interface Alvo { todos: boolean; setores: string[]; equipes: string[] }

export const NINGUEM: Alvo = { todos: false, setores: [], equipes: [] };
export const TODOS: Alvo = { todos: true, setores: [], equipes: [] };

export const doBanco = (setores: readonly string[], equipes: readonly string[]): Alvo =>
  (setores.length === 0 && equipes.length === 0 ? { ...TODOS } : { todos: false, setores: [...setores], equipes: [...equipes] });

export const paraBanco = (a: Alvo) => (a.todos ? { setor_ids: [] as string[], equipe_ids: [] as string[] } : { setor_ids: a.setores, equipe_ids: a.equipes });

export const semNinguem = (a: Alvo) => !a.todos && a.setores.length === 0 && a.equipes.length === 0;

/** Marca ou desmarca o setor inteiro; marcar tira as equipes dele (já estão incluídas). */
export function alternarSetor(a: Alvo, setorId: string, equipes: readonly EquipeDaSirene[]): Alvo {
  if (a.setores.includes(setorId)) return { ...a, todos: false, setores: a.setores.filter(s => s !== setorId) };
  const doSetor = new Set(equipes.filter(e => e.setor_id === setorId).map(e => e.id));
  return { todos: false, setores: [...a.setores, setorId], equipes: a.equipes.filter(e => !doSetor.has(e)) };
}

/** Marca ou desmarca uma equipe sozinha. Se o setor dela já está inteiro, não muda nada. */
export function alternarEquipe(a: Alvo, equipe: EquipeDaSirene): Alvo {
  if (equipe.setor_id && a.setores.includes(equipe.setor_id)) return a;
  return a.equipes.includes(equipe.id)
    ? { ...a, todos: false, equipes: a.equipes.filter(e => e !== equipe.id) }
    : { ...a, todos: false, equipes: [...a.equipes, equipe.id] };
}

export interface GrupoDoSetor {
  /** `null`: as equipes sem setor. */
  setor: SetorDaSirene | null;
  equipes: EquipeDaSirene[];
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Os setores, cada um com as suas equipes, em ordem de nome; as equipes sem
 * setor (ou de setor que não está na lista) vão para um grupo no fim. Com
 * `busca`: fica o setor cujo nome bate (com todas as equipes) ou só as equipes
 * que batem.
 */
export function agruparPorSetor(
  setores: readonly SetorDaSirene[], equipes: readonly EquipeDaSirene[], busca = '',
): GrupoDoSetor[] {
  const termo = semAcento(busca.trim());
  const porNome = (x: { nome: string }, y: { nome: string }) => x.nome.localeCompare(y.nome, 'pt-BR');
  const conhecidos = new Set(setores.map(s => s.id));
  const grupos: GrupoDoSetor[] = [...setores].sort(porNome).map(s => ({
    setor: s, equipes: equipes.filter(e => e.setor_id === s.id).sort(porNome),
  }));
  const soltas = equipes.filter(e => !e.setor_id || !conhecidos.has(e.setor_id)).sort(porNome);
  if (soltas.length) grupos.push({ setor: null, equipes: soltas });
  if (!termo) return grupos;
  return grupos.flatMap(g => {
    if (g.setor && semAcento(g.setor.nome).includes(termo)) return [g];
    const batem = g.equipes.filter(e => semAcento(e.nome).includes(termo));
    return batem.length ? [{ ...g, equipes: batem }] : [];
  });
}

/** «Todos os setores e equipes», «Play 1, Play 2 e equipe Elite», ou «Ninguém escolhido». */
export function resumoDeQuemOuve(
  a: Alvo, setores: readonly SetorDaSirene[], equipes: readonly EquipeDaSirene[],
): string {
  if (a.todos) return 'Todos os setores e equipes';
  const nomes = [
    ...a.setores.map(id => setores.find(s => s.id === id)?.nome ?? 'setor de outra empresa'),
    ...a.equipes.map(id => `equipe ${equipes.find(e => e.id === id)?.nome ?? 'de outra empresa'}`),
  ];
  if (nomes.length === 0) return 'Ninguém escolhido';
  return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** Um horário como a tela edita (o «para quem» como `Alvo`). */
export interface HorarioNaTela {
  id: string | null;
  hora: string;
  dias: number[];
  cor: CorDaSirene;
  alvo: Alvo;
  duracao_s: number;
  volume: number;
  ativo: boolean;
  descricao: string;
}

export const HORARIO_NOVO: HorarioNaTela = {
  id: null, hora: '', dias: [], cor: 'policia', alvo: NINGUEM,
  duracao_s: DURACAO_PADRAO_S, volume: VOLUME_PADRAO, ativo: true, descricao: '',
};

/** O que ainda falta para salvar, em palavras. Vazio = pode salvar. */
export function faltaNoHorario(h: Pick<HorarioNaTela, 'hora' | 'dias' | 'alvo'>): string[] {
  const falta: string[] = [];
  if (minutosDaHora(h.hora) === null) falta.push('a hora');
  if (h.dias.length === 0) falta.push('os dias');
  if (semNinguem(h.alvo)) falta.push('para quem toca');
  return falta;
}

/** «a hora, os dias e para quem toca». */
export function juntar(partes: readonly string[]): string {
  return partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}
