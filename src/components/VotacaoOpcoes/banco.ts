/**
 * banco.ts — a votação de opções falando com o banco (migration 20261116190000).
 * Sem a migration as chamadas falham com «função não existe»: o aviso não
 * aparece e a configuração explica.
 */
import { supabase } from '@/lib/supabase';
import { faltaMigration, mensagemDoErro, ErroDoBanco } from '@/components/VotacaoLideres/banco';
import { opcoesDoBanco, type OpcaoDaVotacao } from './opcoes';

export { faltaMigration, mensagemDoErro };

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  // Funções novas ainda não estão nos tipos gerados do Supabase.
  const cliente = supabase as unknown as {
    rpc: (n: string, a?: Record<string, unknown>) => PromiseLike<{ data: T; error: { message: string; code?: string } | null }>;
  };
  const { data, error } = await cliente.rpc(fn, args);
  if (error) throw new ErroDoBanco(error.message, error.code);
  return data as T;
}

export type EstadoDaVotacaoOpcoes = 'aberta' | 'encerrada' | 'cancelada';

/** Uma votação aberta para mim. */
export interface MinhaVotacaoOpcoes {
  id: string;
  titulo: string;
  pergunta: string;
  opcoes: OpcaoDaVotacao[];
  meu_voto: string | null;
  votado_em: string | null;
}

/** Uma linha do painel (super_admin). */
export interface VotacaoOpcoesNaLista {
  id: string;
  titulo: string;
  pergunta: string;
  opcoes: OpcaoDaVotacao[];
  estado: EstadoDaVotacaoOpcoes;
  eleitores: number;
  votaram: number;
  contagem: Record<string, number>;
  criada_em: string;
  encerrada_em: string | null;
  cancelada_em: string | null;
}

export interface Participacao { id: string; nome: string; setor: string | null; votado_em: string | null }

type Bruta<T> = Omit<T, 'opcoes'> & { opcoes: unknown };
const comOpcoes = <T extends { opcoes: OpcaoDaVotacao[] }>(l: Array<Bruta<T>> | null): T[] =>
  (l ?? []).map(v => ({ ...v, opcoes: opcoesDoBanco(v.opcoes) }) as T);

export const lerMinhas = async () => comOpcoes<MinhaVotacaoOpcoes>(await rpc('fn_votacao_opcoes_minhas'));
export const votar = (id: string, opcao: string) => rpc<void>('fn_votacao_opcoes_votar', { p_id: id, p_opcao: opcao });

export const listar = async () => comOpcoes<VotacaoOpcoesNaLista>(await rpc('fn_votacao_opcoes_listar'));
export const lerParticipacao = (id: string) => rpc<Participacao[]>('fn_votacao_opcoes_participacao', { p_id: id });
export const mudar = (id: string, acao: 'encerrar' | 'reabrir' | 'cancelar') => rpc<void>('fn_votacao_opcoes_mudar', { p_id: id, p_acao: acao });

export interface DadosParaLiberar {
  titulo: string;
  pergunta: string;
  opcoes: OpcaoDaVotacao[];
  eleitores: string[];
  publico: Record<string, unknown>;
}
export const liberar = (d: DadosParaLiberar) => rpc<string>('fn_votacao_opcoes_liberar', {
  p_titulo: d.titulo, p_pergunta: d.pergunta, p_opcoes: d.opcoes, p_eleitores: d.eleitores, p_publico: d.publico,
});

/** Uma votação encerrada, com a contagem, para quem foi chamado a votar (migration 20261116210000). */
export interface ResultadoVotacaoOpcoes {
  id: string;
  titulo: string;
  pergunta: string;
  opcoes: OpcaoDaVotacao[];
  eleitores: number;
  votaram: number;
  contagem: Record<string, number>;
  encerrada_em: string;
}

export const lerResultados = async () => comOpcoes<ResultadoVotacaoOpcoes>(await rpc('fn_votacao_opcoes_resultados'));
