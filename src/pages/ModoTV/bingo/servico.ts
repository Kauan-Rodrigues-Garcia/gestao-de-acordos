/**
 * servico.ts — o Bingo conversando com o banco (migration 20261030200000).
 *
 * As RPCs ainda não estão no `database.types.ts`; o cliente sem tipo é o
 * mesmo caminho de `ModoTV/servico.ts`. Quem decide o que cada um pode é o
 * banco (`fn_bingo_controla`, a cartela de cada um).
 */
import { supabase } from '@/lib/supabase';
import type {
  CandidatoBingo, ControleBingo, EstadoBingo, MinhaPartida, ResumoDoPainel, TemaBingoId, TipoVitoria,
} from './tipos';

interface Erro { message: string }

async function rpc<T>(nome: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as (
    f: string, a: Record<string, unknown>,
  ) => Promise<{ data: T; error: Erro | null }>)(nome, args);
  if (error) throw new Error(error.message || 'Erro ao falar com o banco.');
  return data;
}

// ── Controle (líder) ─────────────────────────────────────────────────────────

/** Os painéis que eu alcanço, com o jogo no ar e os anteriores de cada um. */
export const resumoDosPaineis = async (empresaId: string) =>
  (await rpc<ResumoDoPainel[] | null>('fn_bingo_resumo', { p_empresa: empresaId })) ?? [];

export const listarCandidatos = async (painelId: string) =>
  (await rpc<CandidatoBingo[] | null>('fn_bingo_candidatos', { p_painel: painelId })) ?? [];

export const partidaDoPainel = (painelId: string) =>
  rpc<ControleBingo | null>('fn_bingo_do_painel', { p_painel: painelId });

export const lerControle = (partidaId: string) =>
  rpc<ControleBingo>('fn_bingo_controle', { p_partida: partidaId });

export function criarPartida(d: {
  painelId: string; tema: TemaBingoId; participantes: string[]; autoMarcarS: number;
  premioQuina: string; premioBingo: string; somNaTv: boolean;
}): Promise<string> {
  return rpc<string>('fn_bingo_criar', {
    p_painel: d.painelId, p_tema: d.tema, p_participantes: d.participantes, p_auto_marcar_s: d.autoMarcarS,
    p_premio_quina: d.premioQuina, p_premio_bingo: d.premioBingo, p_som_na_tv: d.somNaTv,
  });
}

export const incluirParticipantes = (partidaId: string, pessoas: string[]) =>
  rpc<number>('fn_bingo_incluir', { p_partida: partidaId, p_participantes: pessoas });

export const sortearPedra = (partidaId: string, automatico = false) =>
  rpc<{ ok: boolean; ordem?: number; numero?: number; motivo?: string; proxima_pedra_em?: string | null }>(
    'fn_bingo_sortear', { p_partida: partidaId, p_automatico: automatico },
  );

export const mudarAutomatico = (partidaId: string, intervaloS: number | null, pausado: boolean) =>
  rpc<void>('fn_bingo_automatico', { p_partida: partidaId, p_intervalo_s: intervaloS, p_pausado: pausado });

export const comemorar = (partidaId: string, tipo: TipoVitoria, ganhadores: string[]) =>
  rpc<string>('fn_bingo_comemorar', { p_partida: partidaId, p_tipo: tipo, p_ganhadores: ganhadores });

export const encerrarPartida = (partidaId: string) =>
  rpc<void>('fn_bingo_encerrar', { p_partida: partidaId });

// ── Jogador ──────────────────────────────────────────────────────────────────

export const minhasPartidas = async () => (await rpc<MinhaPartida[] | null>('fn_bingo_minhas')) ?? [];

export const minhaPartida = (partidaId: string) =>
  rpc<MinhaPartida | null>('fn_bingo_minha', { p_partida: partidaId });

export const gritar = (partidaId: string, marcadas: number[]) =>
  rpc<{ ok: boolean; tipo?: TipoVitoria; motivo?: string; repetido?: boolean }>(
    'fn_bingo_gritar', { p_partida: partidaId, p_marcadas: marcadas },
  );

// ── TV ───────────────────────────────────────────────────────────────────────

export const bingoDaTv = (token: string, tique = false) =>
  rpc<EstadoBingo | null>('fn_tv_bingo', { p_token: token, p_tique: tique });
