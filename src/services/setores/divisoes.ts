/**
 * divisoes.ts — as divisões de um setor, sem banco e sem React.
 *
 * ## O que é uma divisão (05/11/2026)
 *
 * Um setor que tem metas separadas, como se fossem dois setores — o Receptivo
 * com «0800» e «Time a vencer» —, mas que continua sendo UM setor: o 59, o
 * carimbo da importação, a Diretoria e as permissões não mudam. A divisão é um
 * recorte de leitura por cima do setor (migration 20261105120500).
 *
 * Quem soma numa divisão:
 *
 *   • as EQUIPES dela — membros, líder e clones que contam, exatamente quem a
 *     equipe soma no Dashboard (`operadoresDaEquipe`);
 *   • os RECEBEDORES dela — login do relatório que recebe sem equipe
 *     (pagueplay_play1, pagueplay_jornadaplay…), casado com o cadastro pelo
 *     `perfis.usuario`.
 *
 * O que é do setor e não está em divisão nenhuma é «Sem divisão». As divisões
 * + «Sem divisão» = o total do setor, ao centavo: a divisão nunca soma o que o
 * setor não soma (ver o caso 'divisao' de `linhaNoEscopo`).
 *
 * Login do relatório SEM cadastro (linha órfã) casa pelo próprio login: o
 * Dashboard traz o login da órfã desde a migration 20261105130000. Antes dela,
 * a órfã fica em «Sem divisão», à vista.
 *
 * Nada conta duas vezes: cada pessoa está em uma divisão só (`divisaoDePessoa`),
 * cada equipe em uma (PK do banco) e cada login em uma por setor (PK do banco).
 */
import {
  operadoresDaEquipe, type FontesDeEscopo,
} from '@/services/analitico/analitico.service';
import type { EscopoAnalitico, EscopoSetor } from '@/services/analitico/escopoAnalitico';

export interface DivisaoDoSetor {
  id: string;
  setorId: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  /** Equipes da divisão (ids). */
  equipes: string[];
  /** Logins do relatório que recebem sem equipe, em minúsculas. */
  recebedores: string[];
}

/** Login como o banco guarda: minúsculo e sem espaço nas pontas. */
export function normalizarUsuario(usuario: string): string {
  return usuario.trim().toLowerCase();
}

/** As divisões ATIVAS de um setor, na ordem da tela. Vazio = setor sem divisão. */
export function divisoesDoSetor(
  todas: readonly DivisaoDoSetor[], setorId: string | null | undefined,
): DivisaoDoSetor[] {
  if (!setorId) return [];
  return todas
    .filter(d => d.setorId === setorId && d.ativo)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** A divisão em que uma equipe está, se estiver. */
export function divisaoDaEquipe(
  todas: readonly DivisaoDoSetor[], equipeId: string,
): DivisaoDoSetor | null {
  return todas.find(d => d.ativo && d.equipes.includes(equipeId)) ?? null;
}

type FontesDaEquipe = Pick<FontesDeEscopo, 'operadorEquipeMap' | 'equipesExtrasPorOperador'>;

/**
 * Pessoa → divisão, UMA divisão por pessoa (05/11/2026: «não pode contar a
 * mais nem duplicar»).
 *
 * A mesma pessoa pode cair em duas divisões — membro de uma equipe da 0800 e
 * clone numa do Time a vencer. Somar nas duas faria as divisões passarem do
 * total do setor. A ordem que decide:
 *
 *   1. a divisão da equipe DELA (a do cadastro);
 *   2. o login de recebedor (quem recebe sem equipe);
 *   3. a primeira divisão, na ordem da tela, em que ela está clonada.
 */
export function divisaoDePessoa(
  divisoes: readonly DivisaoDoSetor[],
  fontes: FontesDaEquipe,
  perfilPorUsuario: Readonly<Record<string, string>>,
): Map<string, string> {
  const ordenadas = [...divisoes].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  const divisaoDaEquipeId = new Map<string, string>();
  for (const d of ordenadas) for (const e of d.equipes) {
    if (!divisaoDaEquipeId.has(e)) divisaoDaEquipeId.set(e, d.id);
  }

  const out = new Map<string, string>();
  // 1. A equipe do cadastro.
  for (const [id, info] of Object.entries(fontes.operadorEquipeMap)) {
    const d = info.equipe_id ? divisaoDaEquipeId.get(info.equipe_id) : undefined;
    if (d) out.set(id, d);
  }
  // 2. O login de recebedor.
  for (const d of ordenadas) for (const u of d.recebedores) {
    const id = perfilPorUsuario[normalizarUsuario(u)];
    if (id && !out.has(id)) out.set(id, d.id);
  }
  // 3. O clone, na ordem da tela.
  for (const d of ordenadas) for (const e of d.equipes) {
    for (const id of operadoresDaEquipe(e, fontes)) {
      if (!out.has(id)) out.set(id, d.id);
    }
  }
  return out;
}

/** Quem soma na divisão — cada pessoa em uma divisão só (`divisaoDePessoa`). */
export function operadoresDaDivisao(
  divisao: DivisaoDoSetor,
  divisoesDoSetorTodas: readonly DivisaoDoSetor[],
  fontes: FontesDaEquipe,
  perfilPorUsuario: Readonly<Record<string, string>>,
): Set<string> {
  const out = new Set<string>();
  for (const [id, d] of divisaoDePessoa(divisoesDoSetorTodas, fontes, perfilPorUsuario)) {
    if (d === divisao.id) out.add(id);
  }
  return out;
}

/** O recorte de uma divisão, sobre o recorte do setor dela. */
export function escopoDaDivisao(
  setor: EscopoSetor,
  divisao: DivisaoDoSetor,
  divisoesDoSetorTodas: readonly DivisaoDoSetor[],
  fontes: FontesDaEquipe,
  perfilPorUsuario: Readonly<Record<string, string>>,
): EscopoAnalitico {
  return {
    tipo: 'divisao',
    setor,
    operadores: operadoresDaDivisao(divisao, divisoesDoSetorTodas, fontes, perfilPorUsuario),
    equipes: new Set(divisao.equipes),
    usuarios: new Set(divisao.recebedores.map(normalizarUsuario)),
  };
}

/** «Sem divisão»: o que é do setor e não cabe em nenhuma das divisões dele. */
export function escopoSemDivisao(
  setor: EscopoSetor,
  divisoes: readonly DivisaoDoSetor[],
  fontes: FontesDaEquipe,
  perfilPorUsuario: Readonly<Record<string, string>>,
): EscopoAnalitico {
  const equipes = new Set<string>();
  const usuarios = new Set<string>();
  for (const d of divisoes) {
    for (const e of d.equipes) equipes.add(e);
    for (const u of d.recebedores) usuarios.add(normalizarUsuario(u));
  }
  return {
    tipo: 'divisao',
    setor,
    operadores: new Set(divisaoDePessoa(divisoes, fontes, perfilPorUsuario).keys()),
    equipes,
    usuarios,
    resto: true,
  };
}

/**
 * Logins de recebedor que não acharam cadastro — a tela avisa, porque o
 * recebimento deles vai ficar em «Sem divisão».
 */
export function recebedoresSemCadastro(
  divisao: DivisaoDoSetor, perfilPorUsuario: Readonly<Record<string, string>>,
): string[] {
  return divisao.recebedores.filter(u => !perfilPorUsuario[normalizarUsuario(u)]);
}
