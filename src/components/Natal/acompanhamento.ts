/**
 * acompanhamento.ts — o card de Configurações › Geral que acompanha o presente
 * de Natal: quem já entrou no tema, quem assistiu o vídeo inteiro, quem pulou,
 * quem deixou para depois e quem ainda não abriu, separado por cidade
 * (Cleber, 09/11/2026).
 *
 * Os dados vêm de `fn_natal_abertura_painel` (migration 20261109150000), só
 * para o super_admin. Aqui só a conta, pura, para os testes.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { videoDaCidade } from './abertura';

export interface PessoaDoNatal {
  usuario_id: string;
  nome: string | null;
  cargo: string | null;
  empresa_nome: string | null;
  setor_nome: string | null;
  /** A cidade do setor, sem acento (`birigui`, `marilia`, outra) ou `null`. */
  cidade: string | null;
  video: 'birigui' | 'marilia' | null;
  assistiu_em: string | null;
  pulou_em: string | null;
  liberou_em: string | null;
  adiou_vezes: number;
}

export interface PainelDoNatal {
  liberacao: { liberado_em: string; liberado_por_nome: string | null } | null;
  pessoas: PessoaDoNatal[];
}

export async function lerPainelDoNatal(): Promise<PainelDoNatal> {
  const { data, error } = await rpcSemTipo<PainelDoNatal>('fn_natal_abertura_painel', {});
  if (error) throw new Error(error.message);
  return { liberacao: data?.liberacao ?? null, pessoas: data?.pessoas ?? [] };
}

/** As três abas do card. «Sem cidade» (ou outra) vê o vídeo de Birigui. */
export type GrupoDaCidade = 'birigui' | 'marilia' | 'sem';
export const ROTULO_GRUPO: Record<GrupoDaCidade, string> = {
  birigui: 'Birigui', marilia: 'Marília', sem: 'Sem cidade',
};

export function grupoDaCidade(cidade: string | null): GrupoDaCidade {
  if (!cidade) return 'sem';
  if (videoDaCidade(cidade) === 'marilia') return 'marilia';
  return cidade.trim().toLowerCase() === 'birigui' ? 'birigui' : 'sem';
}

/**
 * Onde a pessoa está:
 *   entrou    — já está no Natal (assistindo até o fim ou pulando);
 *   adiou     — abriu, fechou no meio e deixou para depois;
 *   pendente  — ainda não abriu o presente.
 */
export type SituacaoDoNatal = 'entrou' | 'adiou' | 'pendente';
export const ROTULO_SITUACAO: Record<SituacaoDoNatal, string> = {
  entrou: 'Entrou no Natal', adiou: 'Deixou para depois', pendente: 'Ainda não abriu',
};

export function situacaoDoNatal(p: Pick<PessoaDoNatal, 'liberou_em' | 'adiou_vezes'>): SituacaoDoNatal {
  if (p.liberou_em) return 'entrou';
  if (p.adiou_vezes > 0) return 'adiou';
  return 'pendente';
}

/** Como a pessoa entrou: o vídeo inteiro ou pulando (quem fez os dois, vale o primeiro). */
export function comoEntrou(p: Pick<PessoaDoNatal, 'liberou_em' | 'assistiu_em' | 'pulou_em'>): 'assistiu' | 'pulou' | null {
  if (!p.liberou_em) return null;
  if (p.assistiu_em && (!p.pulou_em || p.assistiu_em <= p.pulou_em)) return 'assistiu';
  return p.pulou_em ? 'pulou' : 'assistiu';
}

export interface ResumoDoGrupo {
  total: number;
  entrou: number;
  assistiu: number;
  pulou: number;
  adiou: number;
  pendente: number;
}

export function resumirGrupo(pessoas: readonly PessoaDoNatal[]): ResumoDoGrupo {
  const r: ResumoDoGrupo = { total: pessoas.length, entrou: 0, assistiu: 0, pulou: 0, adiou: 0, pendente: 0 };
  for (const p of pessoas) {
    const s = situacaoDoNatal(p);
    r[s] += 1;
    const como = comoEntrou(p);
    if (como) r[como] += 1;
  }
  return r;
}

export function separarPorGrupo(pessoas: readonly PessoaDoNatal[]): Record<GrupoDaCidade, PessoaDoNatal[]> {
  const g: Record<GrupoDaCidade, PessoaDoNatal[]> = { birigui: [], marilia: [], sem: [] };
  for (const p of pessoas) g[grupoDaCidade(p.cidade)].push(p);
  return g;
}
