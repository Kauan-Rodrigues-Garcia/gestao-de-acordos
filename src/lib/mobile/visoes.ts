/**
 * As visões do app por cargo (Cleber, 06/10/2026 — desenho §2.0).
 *
 *   cargo                  Eu        Equipe          Setor
 *   operador               completa  só o Resumo     só o Resumo
 *   elite (recebe e vê     completa  completa        completa
 *     o Painel do Líder)
 *   líder                  —         completa        completa
 *   gerência               —         completa        completa
 *
 * «Só o Resumo» mora dentro de `/m` (`?visao=equipe|setor`) e lê os totais do
 * banco (`fn_app_resumo_visoes`) — o operador nunca entra em `/m/equipe` nem em
 * `/m/setor`, que exigem `ver_painel_lider`. Operador nunca vê quartil, lista
 * ou valor de outra pessoa.
 */
import {
  PERFIS_QUE_CONTAM_NO_RECEBIMENTO, PERFIS_QUE_SO_LIDERAM, PERFIS_QUE_SUPERVISIONAM_SETOR, ROUTE_PATHS,
} from '@/lib/index';

export type Visao = 'eu' | 'equipe' | 'setor';

export interface AcessoDasVisoes {
  /** As visões que aparecem no topo, na ordem. */
  visoes: Visao[];
  /** Equipe e setor completos (abas, pessoas, quartis) — elite para cima. */
  completo: boolean;
}

/** Quem cuida de um setor (a gerência) — pelos atributos do cargo, não pelo nome. */
export function ehGerencia(perfil: string | null | undefined): boolean {
  return (PERFIS_QUE_SUPERVISIONAM_SETOR as readonly string[]).includes(perfil ?? '');
}

/**
 * @param verPainelLider  a chave `ver_painel_lider` (o que separa o elite do
 *                        operador entre os que recebem no próprio nome)
 */
export function acessoDasVisoes(perfil: string | null | undefined, verPainelLider: boolean): AcessoDasVisoes {
  const cargo = perfil ?? '';
  if (ehGerencia(cargo) || (PERFIS_QUE_SO_LIDERAM as readonly string[]).includes(cargo)) {
    return { visoes: ['equipe', 'setor'], completo: true };
  }
  if ((PERFIS_QUE_CONTAM_NO_RECEBIMENTO as readonly string[]).includes(cargo)) {
    return { visoes: ['eu', 'equipe', 'setor'], completo: verPainelLider };
  }
  return { visoes: [], completo: false };
}

/** Para onde cada visão leva. Sem `completo`, Equipe e Setor ficam dentro de `/m`. */
export function rotaDaVisao(v: Visao, completo: boolean): string {
  if (v === 'eu') return ROUTE_PATHS.MOBILE;
  if (!completo) return `${ROUTE_PATHS.MOBILE}?visao=${v}`;
  return v === 'equipe' ? ROUTE_PATHS.MOBILE_EQUIPE : ROUTE_PATHS.MOBILE_SETOR;
}

/** A visão pedida na URL da `/m` (`?visao=`), ou «eu». */
export function visaoDaBusca(search: string): Visao {
  const v = new URLSearchParams(search).get('visao');
  return v === 'equipe' || v === 'setor' ? v : 'eu';
}
