/**
 * chipsFisicos.service.ts — a camada de acesso da separação Chips Físicos.
 *
 * Leitura direta, escrita por RPC — o mesmo desenho do Controle de Números. A
 * RLS de `chips_fisicos` recorta o que cada pessoa enxerga (os próprios, o
 * setor, ou todos), então a leitura não repete filtro nenhum. Cadastrar,
 * alterar status e excluir passam por `fn_chips_fisicos_*`, que conferem a
 * chave e o alcance e normalizam o número. Migration 20260921160000.
 *
 * `database.types.ts` ainda não conhece a tabela, por isso o cliente sem schema
 * (`db`) e as linhas declaradas aqui — como em `numeros.service.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Operadora, PessoaDoChip, StatusChip } from './chipsFisicosRegras';

const db = supabase as unknown as SupabaseClient;

type ChamadaRpc = (nome: string, args: Record<string, unknown>) =>
  Promise<{ data: unknown; error: unknown }>;

const rpc = supabase.rpc.bind(supabase) as unknown as ChamadaRpc;

export interface ChipFisicoRow {
  id: string;
  empresa_id: string;
  operador_id: string;
  numero: string;
  operadora: Operadora | null;
  observacao: string | null;
  status: StatusChip;
  status_desde: string;
  prazo_ate: string | null;
  status_por: string | null;
  status_por_nome: string | null;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface PessoaChipRow extends PessoaDoChip {
  ativo: boolean;
}

export interface Resultado<T = void> {
  ok: boolean;
  dados?: T;
  erro?: string;
}

interface ErroPostgres { code?: string; message?: string }

/**
 * A tabela ainda não existe no banco: a migration não foi aplicada. O PostgREST
 * responde `PGRST205` (tabela fora do cache do schema) e o Postgres `42P01`.
 */
export function eTabelaAusente(erro: unknown): boolean {
  const e = (erro ?? {}) as ErroPostgres;
  return e.code === 'PGRST205' || e.code === '42P01'
      || e.code === 'PGRST202' || e.code === '42883';
}

/** A frase que a tela mostra. As RPCs já levantam frases prontas. */
export function mensagemDeErro(erro: unknown): string {
  const e = (erro ?? {}) as ErroPostgres;
  if (eTabelaAusente(erro)) {
    return 'Chips Físicos ainda não foi instalado no banco.';
  }
  if (e.code === '23505' && e.message?.includes('chips_fisicos_numero_por_empresa')) {
    return 'Este chip já está cadastrado.';
  }
  if (e.code === '23514') {
    return 'Algum campo está fora do formato. Confira o número e o tempo.';
  }
  return e.message ?? 'Não foi possível concluir a operação.';
}

function falha(erro: unknown): Resultado<never> {
  return { ok: false, erro: mensagemDeErro(erro) };
}

// ── Leituras ─────────────────────────────────────────────────────────────────

export async function listarChipsFisicos(empresaId: string): Promise<ChipFisicoRow[]> {
  const { data, error } = await db
    .from('chips_fisicos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('criado_em');
  if (error) throw error;
  return (data as ChipFisicoRow[]) ?? [];
}

/**
 * As pessoas que a tela precisa nomear: as de um setor, ou as da empresa toda
 * (`setorId` nulo, para quem enxerga todos os setores). Inativas vêm junto —
 * um chip de quem foi desligado continua precisando de dono na tela —, e a
 * tela separa pelo `ativo`.
 */
export async function listarPessoas(
  empresaId: string, setorId: string | null,
): Promise<PessoaChipRow[]> {
  let q = supabase
    .from('perfis')
    .select('id, nome, foto_url, setor_id, ativo')
    .eq('empresa_id', empresaId);
  if (setorId) q = q.eq('setor_id', setorId);
  const { data, error } = await q.order('nome');
  if (error) throw error;
  return (data as PessoaChipRow[]) ?? [];
}

// ── Escritas ─────────────────────────────────────────────────────────────────

export interface ChipParaSalvar {
  /** Ausente = cadastrar. */
  id?: string;
  /** Dono do chip. Ausente no cadastro = quem está logado. */
  operadorId?: string | null;
  numero: string;
  operadora: Operadora | null;
  observacao: string;
}

/** Cadastra ou corrige. Devolve o id do chip. */
export async function salvarChipFisico(c: ChipParaSalvar): Promise<Resultado<string>> {
  const { data, error } = await rpc('fn_chips_fisicos_salvar', {
    p_id: c.id ?? null,
    p_operador_id: c.operadorId ?? null,
    p_numero: c.numero,
    p_operadora: c.operadora,
    p_observacao: c.observacao,
  });
  if (error) return falha(error);
  return { ok: true, dados: typeof data === 'string' ? data : undefined };
}

/** `minutos` nulo = sem tempo. */
export async function alterarStatusChip(
  id: string, status: StatusChip, minutos: number | null,
): Promise<Resultado> {
  const { error } = await rpc('fn_chips_fisicos_alterar_status', {
    p_id: id, p_status: status, p_minutos: minutos,
  });
  if (error) return falha(error);
  return { ok: true };
}

export async function excluirChipFisico(id: string): Promise<Resultado> {
  const { error } = await rpc('fn_chips_fisicos_excluir', { p_id: id });
  if (error) return falha(error);
  return { ok: true };
}
