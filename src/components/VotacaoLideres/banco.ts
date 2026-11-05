/**
 * banco.ts — a Votação da Liderança conversando com o banco (migration
 * 20261104230000). Só as funções que o LÍDER usa: a votação aberta para ele,
 * enviar os votos, os resultados liberados e o resultado de uma votação.
 *
 * Banco sem a migration: as chamadas falham com «função não existe» e
 * `faltaMigration` reconhece — o card simplesmente não aparece.
 */
import { supabase } from '@/lib/supabase';
import { PERFIL_LABELS } from '@/lib/index';
import {
  aplicarDesempates, apurar, cedulaComTodos,
  type Candidato, type Desempates, type ItemDaCedula, type MeusVotos, type Pergunta, type ResultadoDaPergunta, type Votos,
} from './cedula';

export interface RetratoDaVotacao {
  votacao: { id: string; titulo: string; produto: string; estado: string; aberta_em: string | null; liberada_em: string | null };
  perguntas: Pergunta[];
  participantes: Array<{ id: string; nome: string; foto: string | null; perfil: string | null; setor: string | null }>;
  contagem: Array<{ pergunta_id: string; candidato_id: string; votos: number }> | null;
  desempates: Array<{ pergunta_id: string; escolhido_id: string }> | null;
  /** Só em `fn_votacao_lideranca_minha`: quando a pessoa enviou (nulo = ainda não votou). */
  enviado_em?: string | null;
}

export interface ResultadoLiberado { id: string; titulo: string; liberada_em: string }

export class ErroDoBanco extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  // Funções novas ainda não estão nos tipos gerados do Supabase (como na Corrida).
  const cliente = supabase as unknown as {
    rpc: (n: string, a?: Record<string, unknown>) => PromiseLike<{ data: T; error: { message: string; code?: string } | null }>;
  };
  const { data, error } = await cliente.rpc(fn, args);
  if (error) throw new ErroDoBanco(error.message, error.code);
  return data as T;
}

/** O banco ainda não tem a migration da votação. */
export function faltaMigration(e: unknown): boolean {
  const code = e instanceof ErroDoBanco ? e.code : undefined;
  return code === 'PGRST202' || code === '42883' || /could not find the function|schema cache|does not exist/i.test(String(e instanceof Error ? e.message : e));
}

/** Mensagem que dá para mostrar ao líder (sem o prefixo técnico). */
export function mensagemDoErro(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^NAO_AUTORIZADO:\s*/, '') || 'Não deu certo. Tente de novo.';
}

export const lerMinhasVotacoes = () => rpc<RetratoDaVotacao[]>('fn_votacao_lideranca_minha');
export const lerMeusResultados = () => rpc<ResultadoLiberado[]>('fn_votacao_lideranca_meus_resultados');
export const lerResultado = (id: string) => rpc<RetratoDaVotacao>('fn_votacao_lideranca_resultado', { p_id: id });
export const enviarVotos = (id: string, votos: MeusVotos, comecouEm: string | null) =>
  rpc<void>('fn_votacao_lideranca_votar', { p_id: id, p_votos: votos, p_comecou_em: comecouEm });

/** Cédula e pessoas a partir do retrato. Sem setor (a diretoria), aparece o cargo. */
export function montarDoRetrato(r: RetratoDaVotacao): { cedula: ItemDaCedula[]; pessoas: Map<string, Candidato> } {
  const candidatos: Candidato[] = r.participantes.map(p => ({
    id: p.id,
    nome: (p.nome ?? '').trim() || 'Líder',
    foto: p.foto || null,
    perfil: p.perfil ?? 'lider',
    setor: p.setor?.trim() || PERFIL_LABELS[p.perfil ?? ''] || 'Sem setor',
  }));
  return { cedula: cedulaComTodos(r.perguntas, candidatos), pessoas: new Map(candidatos.map(c => [c.id, c])) };
}

/** O resultado final: a contagem do banco, apurada, com os desempates da diretoria. */
export function resultadosDoRetrato(r: RetratoDaVotacao, cedula: readonly ItemDaCedula[]): ResultadoDaPergunta[] {
  const votos: Votos = {};
  for (const c of r.contagem ?? []) (votos[c.pergunta_id] ??= {})[c.candidato_id] = c.votos;
  const desempates: Desempates = Object.fromEntries((r.desempates ?? []).map(d => [d.pergunta_id, d.escolhido_id]));
  return aplicarDesempates(apurar(cedula, votos), desempates);
}
