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

/*
 * Desde 09/11/2026 também as funções de quem organiza e da diretoria (abaixo
 * de «Quem organiza»): gravar e abrir, acompanhar, encerrar, desempatar e
 * liberar o resultado. O banco confere o cargo em cada uma.
 */

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

// ── Quem organiza (super_admin) e a diretoria (09/11/2026) ──────────────────

export type EstadoDaVotacao = 'rascunho' | 'aberta' | 'encerrada' | 'liberada' | 'cancelada';

/** Uma linha de `fn_votacao_lideranca_listar` (diretoria e super_admin). */
export interface VotacaoNaLista {
  id: string;
  titulo: string;
  produto: string;
  estado: EstadoDaVotacao;
  perguntas: number;
  participantes: number;
  votaram: number;
  criada_em: string;
  aberta_em: string | null;
  encerrada_em: string | null;
  liberada_em: string | null;
  cancelada_em: string | null;
}

/** O retrato da diretoria: com os horários de quem já votou (nunca em quem). */
export interface ApuracaoDaVotacao extends RetratoDaVotacao {
  envios: Array<{ eleitor_id: string; nome: string | null; comecou_em?: string | null; enviado_em: string; respondidas: number }> | null;
}

export interface NovaVotacao {
  titulo: string;
  produto: string;
  setorIds: string[];
  cargos: string[];
  perguntas: Pergunta[];
  participantes: string[];
}

/**
 * Grava a votação e abre para os líderes. Se abrir falhar (já há outra aberta
 * na operação), o rascunho recém-criado é cancelado: não fica votação solta.
 */
export async function liberarParaOsLideres(v: NovaVotacao): Promise<string> {
  const id = await rpc<string>('fn_votacao_lideranca_salvar', {
    p_id: null, p_titulo: v.titulo, p_produto: v.produto, p_setor_ids: v.setorIds, p_cargos: v.cargos,
    p_perguntas: v.perguntas.map(p => ({ id: p.id, emoji: p.emoji, texto: p.texto })), p_participantes: v.participantes,
  });
  try {
    await rpc<void>('fn_votacao_lideranca_mudar', { p_id: id, p_acao: 'abrir' });
  } catch (e) {
    await rpc<void>('fn_votacao_lideranca_mudar', { p_id: id, p_acao: 'cancelar' }).catch((): undefined => undefined);
    throw e;
  }
  return id;
}

export const listarVotacoes = () => rpc<VotacaoNaLista[]>('fn_votacao_lideranca_listar');
export const lerApuracao = (id: string) => rpc<ApuracaoDaVotacao>('fn_votacao_lideranca_apuracao', { p_id: id });

/**
 * O acompanhamento (10/11/2026). O super_admin lê o registro, que traz a
 * contagem também com a votação ABERTA (a parcial); a tela usa só a contagem
 * e os horários, nunca em quem cada um votou. Sem ser super_admin o banco
 * recusa, e vale a apuração da diretoria: a contagem só depois de encerrada.
 */
export async function lerAcompanhamento(id: string): Promise<{ retrato: ApuracaoDaVotacao; comParcial: boolean }> {
  try {
    const r = await rpc<ApuracaoDaVotacao & { votos?: unknown; eventos?: unknown }>('fn_votacao_lideranca_registro', { p_id: id });
    const { votos: _votos, eventos: _eventos, ...retrato } = r;
    return { retrato, comParcial: true };
  } catch (e) {
    if (!(e instanceof ErroDoBanco) || e.code !== '42501') throw e;
    const retrato = await lerApuracao(id);
    return { retrato, comParcial: retrato.contagem !== null };
  }
}
export const encerrarVotacao =(id: string) => rpc<void>('fn_votacao_lideranca_mudar', { p_id: id, p_acao: 'encerrar' });
export const cancelarVotacao = (id: string) => rpc<void>('fn_votacao_lideranca_mudar', { p_id: id, p_acao: 'cancelar' });
export const desempatar = (id: string, perguntaId: string, escolhidoId: string) =>
  rpc<void>('fn_votacao_lideranca_desempatar', { p_id: id, p_pergunta: perguntaId, p_escolhido: escolhidoId });
export const liberarResultado = (id: string) => rpc<void>('fn_votacao_lideranca_liberar', { p_id: id });

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
