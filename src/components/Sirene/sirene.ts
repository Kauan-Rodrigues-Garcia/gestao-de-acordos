/**
 * sirene.ts — a sirene: os horários do meu setor, o toque solto e o painel.
 *
 * Duas tabelas (migration 20261029160000): `sirene_agendamentos` (os horários
 * fixos, com cor e setores) e `sirene_toques` (o «Tocar agora»). Cada tela lê
 * só o que é para o setor dela (`fn_sirene_ler`) e marca o timer pela hora do
 * banco; o super admin vê e mexe em tudo pelo cartão de Configurações
 * (`admin/SireneConfig.tsx`). O banco avisa pelo sinal `permissoes` (o caminho
 * do jumpscare) e cada tela relê.
 *
 * Sem a migration, ninguém ouve nada e nada quebra.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { assinarSinal } from '@/lib/sinais';
import { corDaSirene, duracaoSegura, type Agendamento, type CorDaSirene } from './horario';

export interface ToqueSolto {
  id: string;
  cor: CorDaSirene;
  duracaoMs: number;
  tocaEm: number;
}

export interface MinhaSirene {
  agendamentos: Agendamento[];
  toque: ToqueSolto | null;
}

type Rpc = (n: string, a?: Record<string, unknown>) => PromiseLike<{
  data: unknown; error: { message: string } | null;
}>;
const rpc: Rpc = (n, a) => (supabase.rpc as unknown as Rpc)(n, a);

/** relógio do banco − relógio local, em ms. */
let desvioMs = 0;

function acertarRelogio(agoraIso: unknown, pedidoEm: number): void {
  const agora = new Date(String(agoraIso ?? '')).getTime();
  // Meio caminho da ida e volta: a hora do banco é a de quando ele respondeu.
  if (Number.isFinite(agora)) desvioMs = agora - (pedidoEm + (Date.now() - pedidoEm) / 2);
}

export function agoraDoServidor(): number {
  return Date.now() + desvioMs;
}

function lerAgendamento(x: Record<string, unknown>): Agendamento {
  return {
    id: String(x.id),
    hora: String(x.hora ?? ''),
    dias: Array.isArray(x.dias) ? x.dias.map(Number) : [],
    cor: corDaSirene(String(x.cor)).slug,
    duracao_s: duracaoSegura(x.duracao_s),
    descricao: typeof x.descricao === 'string' ? x.descricao : null,
  };
}

// ── O que toca para mim: um só para o app inteiro ───────────────────────────

let minha: MinhaSirene = { agendamentos: [], toque: null };
let carregando: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

async function ler(): Promise<void> {
  const pedidoEm = Date.now();
  const { data, error } = await rpc('fn_sirene_ler');
  if (error || !data) return;
  const d = data as Record<string, unknown>;
  acertarRelogio(d.agora, pedidoEm);
  const t = d.toque as Record<string, unknown> | null;
  const tocaEm = t ? new Date(String(t.toca_em)).getTime() : NaN;
  minha = {
    agendamentos: Array.isArray(d.agendamentos) ? (d.agendamentos as Record<string, unknown>[]).map(lerAgendamento) : [],
    toque: t && Number.isFinite(tocaEm)
      ? { id: String(t.id), cor: corDaSirene(String(t.cor)).slug, duracaoMs: duracaoSegura(t.duracao_s) * 1000, tocaEm }
      : null,
  };
  for (const o of ouvintes) o();
}

function carregar(forcar = false): Promise<void> {
  if (!carregando || forcar) carregando = ler().catch((): void => undefined);
  return carregando;
}

/** Os horários do meu setor e o último toque solto. Escuta o sinal da empresa. */
export function useMinhaSirene(empresaId: string | null | undefined): MinhaSirene {
  const valor = useSyncExternalStore(
    o => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
    () => minha,
  );

  useEffect(() => { void carregar(); }, []);

  useEffect(() => {
    if (!empresaId) return;
    return assinarSinal('permissoes', empresaId, {
      onMudou: s => { if (s.tabela === 'sirene') void carregar(true); },
      onReconectado: () => { void carregar(true); },
    });
  }, [empresaId]);

  // Virou o dia com a aba aberta dias a fio: relê de vez em quando, sem pressa.
  useEffect(() => {
    const id = window.setInterval(() => { void carregar(true); }, 6 * 3_600_000 + Math.random() * 600_000);
    return () => window.clearInterval(id);
  }, []);

  return valor;
}

// ── O teste: só nesta aba, nada gravado ──────────────────────────────────────

const EVENTO_TESTE = 'sirene:teste';

export interface PedidoDeTeste { cor: CorDaSirene; duracaoMs: number }

export function testarEmMim(cor: CorDaSirene, duracaoS: number): void {
  window.dispatchEvent(new CustomEvent<PedidoDeTeste>(EVENTO_TESTE, {
    detail: { cor, duracaoMs: duracaoSegura(duracaoS) * 1000 },
  }));
}

export function ouvirTeste(f: (p: PedidoDeTeste) => void): () => void {
  const h = (e: Event) => f((e as CustomEvent<PedidoDeTeste>).detail);
  window.addEventListener(EVENTO_TESTE, h);
  return () => window.removeEventListener(EVENTO_TESTE, h);
}

// ── O painel do super admin ─────────────────────────────────────────────────

export interface AgendamentoNoPainel extends Agendamento {
  setor_ids: string[];
  ativo: boolean;
}

export interface ToqueNoPainel {
  id: string;
  cor: CorDaSirene;
  setor_ids: string[];
  duracao_s: number;
  toca_em: string;
  criado_por_nome: string | null;
}

export interface Painel {
  agendamentos: AgendamentoNoPainel[];
  toques: ToqueNoPainel[];
}

function lerPainel(data: unknown): Painel {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    agendamentos: Array.isArray(d.agendamentos)
      ? (d.agendamentos as Record<string, unknown>[]).map(x => ({
          ...lerAgendamento(x),
          setor_ids: Array.isArray(x.setor_ids) ? x.setor_ids.map(String) : [],
          ativo: x.ativo !== false,
        }))
      : [],
    toques: Array.isArray(d.toques)
      ? (d.toques as Record<string, unknown>[]).map(x => ({
          id: String(x.id),
          cor: corDaSirene(String(x.cor)).slug,
          setor_ids: Array.isArray(x.setor_ids) ? x.setor_ids.map(String) : [],
          duracao_s: duracaoSegura(x.duracao_s),
          toca_em: String(x.toca_em),
          criado_por_nome: typeof x.criado_por_nome === 'string' ? x.criado_por_nome : null,
        }))
      : [],
  };
}

export async function lerPainelDaSirene(): Promise<{ painel: Painel | null; erro: string | null }> {
  const pedidoEm = Date.now();
  const { data, error } = await rpc('fn_sirene_painel');
  if (error) return { painel: null, erro: error.message };
  acertarRelogio((data as Record<string, unknown> | null)?.agora, pedidoEm);
  return { painel: lerPainel(data), erro: null };
}

export interface Rascunho {
  id: string | null;
  hora: string;
  dias: number[];
  cor: CorDaSirene;
  setor_ids: string[];
  duracao_s: number;
  ativo: boolean;
  descricao: string;
}

export async function salvarAgendamento(r: Rascunho): Promise<{ erro: string | null }> {
  const { error } = await rpc('fn_sirene_salvar', {
    p_id: r.id, p_hora: r.hora, p_dias: r.dias, p_cor: r.cor, p_setor_ids: r.setor_ids,
    p_duracao_s: duracaoSegura(r.duracao_s), p_ativo: r.ativo, p_descricao: r.descricao,
  });
  return { erro: error?.message ?? null };
}

export async function apagarAgendamento(id: string): Promise<{ erro: string | null }> {
  const { error } = await rpc('fn_sirene_apagar', { p_id: id });
  return { erro: error?.message ?? null };
}

export async function tocarAgora(cor: CorDaSirene, setorIds: string[], duracaoS: number): Promise<{ painel: Painel | null; erro: string | null }> {
  const { data, error } = await rpc('fn_sirene_tocar', {
    p_cor: cor, p_setor_ids: setorIds, p_duracao_s: duracaoSegura(duracaoS),
  });
  if (error) return { painel: null, erro: error.message };
  return { painel: lerPainel(data), erro: null };
}
