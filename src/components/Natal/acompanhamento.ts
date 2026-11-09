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

/**
 * O filtro da lista (09/11/2026): as três situações e, dentro de «entrou»,
 * COMO entrou — vídeo inteiro ou pulando. Os quatro cartões do resumo
 * (assistiu, pulou, adiou, pendente) são atalhos para estes filtros.
 */
export type FiltroDoNatal = 'todas' | SituacaoDoNatal | 'assistiu' | 'pulou';
export const FILTROS_DO_NATAL: readonly FiltroDoNatal[] = ['todas', 'entrou', 'assistiu', 'pulou', 'adiou', 'pendente'];
export const ROTULO_FILTRO: Record<FiltroDoNatal, string> = {
  todas: 'Todas', entrou: 'Entrou no Natal', assistiu: 'Assistiu inteiro', pulou: 'Pulou o vídeo',
  adiou: 'Deixou para depois', pendente: 'Ainda não abriu',
};

export function passaNoFiltro(p: PessoaDoNatal, filtro: FiltroDoNatal): boolean {
  if (filtro === 'todas') return true;
  if (filtro === 'assistiu' || filtro === 'pulou') return comoEntrou(p) === filtro;
  return situacaoDoNatal(p) === filtro;
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

/**
 * O filtro de setor do card (09/11/2026): o setor da pessoa vira uma chave
 * «empresa|setor», porque o mesmo nome de setor pode existir em duas empresas.
 * Quem está sem setor cai em `SEM_SETOR`.
 */
export const SEM_SETOR = '__sem_setor__';

export function chaveDoSetor(p: Pick<PessoaDoNatal, 'empresa_nome' | 'setor_nome'>): string {
  return p.setor_nome ? `${p.empresa_nome ?? ''}|${p.setor_nome}` : SEM_SETOR;
}

export interface SetorDoNatal {
  chave: string;
  rotulo: string;
  total: number;
}

/**
 * Os setores das pessoas, em ordem de nome, com quantas pessoas cada um tem.
 * Nome repetido em empresas diferentes leva a empresa no rótulo; «Sem setor»
 * fica por último.
 */
export function setoresDasPessoas(pessoas: readonly PessoaDoNatal[]): SetorDoNatal[] {
  const mapa = new Map<string, { setor: string; empresa: string | null; total: number }>();
  for (const p of pessoas) {
    const chave = chaveDoSetor(p);
    const atual = mapa.get(chave);
    if (atual) atual.total += 1;
    else mapa.set(chave, { setor: p.setor_nome ?? 'Sem setor', empresa: p.empresa_nome, total: 1 });
  }
  const vezesDoNome = new Map<string, number>();
  for (const [chave, s] of mapa) if (chave !== SEM_SETOR) vezesDoNome.set(s.setor, (vezesDoNome.get(s.setor) ?? 0) + 1);
  return [...mapa.entries()]
    .map(([chave, s]) => ({
      chave,
      rotulo: chave !== SEM_SETOR && (vezesDoNome.get(s.setor) ?? 0) > 1 && s.empresa ? `${s.setor} · ${s.empresa}` : s.setor,
      total: s.total,
    }))
    .sort((a, b) => {
      if (a.chave === SEM_SETOR) return 1;
      if (b.chave === SEM_SETOR) return -1;
      return a.rotulo.localeCompare(b.rotulo, 'pt-BR');
    });
}
