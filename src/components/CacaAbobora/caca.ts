/**
 * caca.ts — a Caça à Abóbora: o que está na tela agora, e o clique.
 *
 * A regra mora no banco (migration 20261005120000): o super_admin liga só para
 * o dia, o pg_cron solta uma abóbora a cada 30 min–1h10 e `fn_abobora_pegar`
 * decide quem achou primeiro, com o tempo medido no próprio banco. Aqui só se
 * acompanha a ÚLTIMA rodada:
 *
 *   - ao entrar, uma leitura de `abobora_rodadas`;
 *   - depois, o Broadcast `abobora:<empresa>` traz a linha inteira a cada
 *     mudança (solta, achada, sumiu). Ninguém relê o banco quando a abóbora sai
 *     — 150 abas pedindo a mesma linha no mesmo segundo é o que se evita.
 *
 * Um estado só para o app inteiro: a faixa, a abóbora e o painel de
 * Configurações perguntam a mesma coisa, e a resposta não pode divergir.
 *
 * Tabela ausente (migration pendente) = nenhuma rodada: nada aparece.
 */
import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { assinarTabela } from '@/lib/realtime';

export type SituacaoRodada = 'solta' | 'achada' | 'sumiu';

export interface RodadaAbobora {
  id:                 number;
  dia:                string;
  solta_em:           string;
  expira_em:          string;
  semente:            number;
  origem:             'sorteio' | 'teste';
  situacao:           SituacaoRodada;
  achada_em:          string | null;
  achada_por:         string | null;
  achada_por_nome:    string | null;
  /** Só com foto: a faixa mostra a foto. Sem ela, só o nome. */
  achada_por_foto:    string | null;
  ms:                 number | null;
  mais_rapida_do_dia: boolean;
}

/** Quanto tempo o nome de quem achou fica passando na faixa. */
export const FAIXA_MS = 4 * 60_000;

/**
 * Folga sobre o `expira_em` do banco antes de a abóbora sumir sozinha aqui. Quem
 * tira a abóbora da tela é o aviso do banco («sumiu»); isto só cobre o aviso
 * perdido — e um relógio de computador adiantado não pode apagá-la antes da hora.
 */
const FOLGA_EXPIRA_MS = 5 * 60_000;

export interface EstadoCaca {
  rodada:  RodadaAbobora | null;
  /** `Date.now()` até quando a faixa passa. 0 = sem faixa. */
  faixaAte: number;
}

// ── Puras (exportadas para os testes) ─────────────────────────────────────────

export function normalizarRodada(bruto: unknown): RodadaAbobora | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const r = bruto as Record<string, unknown>;
  const id = Number(r.id);
  if (!Number.isFinite(id) || typeof r.solta_em !== 'string' || typeof r.expira_em !== 'string') return null;
  const situacao = r.situacao === 'achada' || r.situacao === 'sumiu' ? r.situacao : 'solta';
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
  return {
    id,
    dia:                String(r.dia ?? ''),
    solta_em:           r.solta_em,
    expira_em:          r.expira_em,
    semente:            Number(r.semente) || 0,
    origem:             r.origem === 'teste' ? 'teste' : 'sorteio',
    situacao,
    achada_em:          texto(r.achada_em),
    achada_por:         texto(r.achada_por),
    achada_por_nome:    texto(r.achada_por_nome),
    achada_por_foto:    texto(r.achada_por_foto),
    ms:                 r.ms == null ? null : Number(r.ms),
    mais_rapida_do_dia: r.mais_rapida_do_dia === true,
  };
}

/**
 * Junta o que chegou ao que se sabe.
 *
 * - Rodada mais antiga que a atual: ignorada (aviso atrasado).
 * - A mesma rodada não volta a «solta» depois de achada ou sumida.
 * - A faixa começa quando a rodada vira «achada». `aoVivo` = o aviso acabou de
 *   chegar: conta do relógio DESTE computador, que é o que a faixa usa. Na
 *   leitura de entrada, conta da hora em que foi achada — quem entra no meio
 *   pega só o resto.
 */
export function juntarRodada(
  atual: EstadoCaca,
  nova: RodadaAbobora,
  aoVivo: boolean,
  agora: number,
): EstadoCaca {
  const antes = atual.rodada;
  if (antes && nova.id < antes.id) return atual;
  if (antes && nova.id === antes.id && antes.situacao !== 'solta' && nova.situacao === 'solta') return atual;

  let faixaAte = antes && antes.id === nova.id ? atual.faixaAte : 0;
  const acabouDeSerAchada = nova.situacao === 'achada' && !(antes?.id === nova.id && antes.situacao === 'achada');
  if (acabouDeSerAchada) {
    faixaAte = aoVivo ? agora + FAIXA_MS : Date.parse(nova.achada_em ?? '') + FAIXA_MS || 0;
  }
  if (nova.situacao !== 'achada') faixaAte = 0;
  const igual = antes && antes.id === nova.id && antes.situacao === nova.situacao
    && antes.achada_em === nova.achada_em && antes.mais_rapida_do_dia === nova.mais_rapida_do_dia;
  if (igual && faixaAte === atual.faixaAte) return atual;
  return { rodada: nova, faixaAte };
}

export function aboboraNaTela(e: EstadoCaca, agora: number): boolean {
  const r = e.rodada;
  return !!r && r.situacao === 'solta' && agora < Date.parse(r.expira_em) + FOLGA_EXPIRA_MS;
}

export function faixaNaTela(e: EstadoCaca, agora: number): boolean {
  return e.rodada?.situacao === 'achada' && agora < e.faixaAte;
}

/** «4,213 s» até um minuto; depois, «3 min 07 s». */
export function formatarTempo(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 60_000) {
    return `${(ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} s`;
  }
  const total = Math.floor(ms / 1000);
  const min = Math.floor(total / 60);
  const seg = String(total % 60).padStart(2, '0');
  return `${min} min ${seg} s`;
}

/** Só o primeiro e o último nome — a faixa é estreita. */
export function nomeCurto(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 2) return partes.join(' ') || 'Alguém';
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

// ── O estado do app ──────────────────────────────────────────────────────────

let estado: EstadoCaca = { rodada: null, faixaAte: 0 };
const ouvintes = new Set<() => void>();

function publicar(proximo: EstadoCaca): void {
  if (proximo === estado) return;
  estado = proximo;
  for (const o of [...ouvintes]) o();
}

export function aceitarRodada(bruto: unknown, aoVivo: boolean): void {
  const nova = normalizarRodada(bruto);
  if (nova) publicar(juntarRodada(estado, nova, aoVivo, Date.now()));
}

/** Cliente sem tipo: as tabelas ainda não estão em `database.types.ts`. */
interface Consulta<T> extends PromiseLike<{ data: T; error: { message: string; code?: string } | null }> {
  select(colunas: string): Consulta<T>;
  order(coluna: string, opcoes: { ascending: boolean }): Consulta<T>;
  limit(n: number): Consulta<T>;
  eq(coluna: string, valor: unknown): Consulta<T>;
  maybeSingle(): Consulta<T>;
}
function tabela<T>(nome: string): Consulta<T> {
  return (supabase.from as unknown as (t: string) => Consulta<T>)(nome);
}
function rpc<T>(nome: string, args?: Record<string, unknown>) {
  const cliente = supabase as unknown as {
    rpc: (n: string, a?: Record<string, unknown>) => PromiseLike<{ data: T; error: { message: string } | null }>;
  };
  return cliente.rpc(nome, args);
}

async function lerUltima(): Promise<void> {
  const { data, error } = await tabela<Record<string, unknown> | null>('abobora_rodadas')
    .select('*').order('id', { ascending: false }).limit(1).maybeSingle();
  if (!error && data) aceitarRodada(data, false);
}

// Um canal por empresa, dividido por quem estiver ouvindo.
const canais = new Map<string, { cancelar: () => void; usos: number }>();

function assinar(empresaId: string): () => void {
  let canal = canais.get(empresaId);
  if (!canal) {
    void lerUltima().catch((): void => undefined);
    const cancelar = assinarTabela(
      { topico: `abobora:${empresaId}`, escutas: [{ sinal: 'abobora' }] },
      {
        onSinal: payload => aceitarRodada(payload, true),
        // Avisos do intervalo se perderam: a última rodada diz onde estamos.
        onReconectado: () => { void lerUltima().catch((): void => undefined); },
      },
    );
    canal = { cancelar, usos: 0 };
    canais.set(empresaId, canal);
  }
  const atual = canal;
  atual.usos += 1;
  return () => {
    atual.usos -= 1;
    if (atual.usos > 0 || canais.get(empresaId) !== atual) return;
    canais.delete(empresaId);
    atual.cancelar();
  };
}

/**
 * O estado da caça, acompanhando a empresa em que a pessoa está. Redesenha
 * sozinho quando a faixa acaba — ninguém precisa ficar perguntando a hora.
 */
export function useCacaAbobora(empresaId: string | null | undefined): EstadoCaca {
  const valor = useSyncExternalStore(
    o => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
    () => estado,
  );
  const [, redesenhar] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!empresaId) return;
    return assinar(empresaId);
  }, [empresaId]);

  // O fim da faixa, e a folga do fim da abóbora se o aviso do banco se perder.
  useEffect(() => {
    const agora = Date.now();
    const marcos = [valor.faixaAte];
    if (valor.rodada?.situacao === 'solta') marcos.push(Date.parse(valor.rodada.expira_em) + FOLGA_EXPIRA_MS);
    const proximo = Math.min(...marcos.filter(m => m > agora));
    if (!Number.isFinite(proximo)) return;
    const t = setTimeout(redesenhar, Math.min(proximo - agora + 50, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [valor]);

  return valor;
}

// ── O clique ─────────────────────────────────────────────────────────────────

export interface ResultadoPegar {
  ganhou: boolean;
  rodada: RodadaAbobora | null;
  erro:   string | null;
}

/** Quem chega primeiro ao banco leva. A resposta já atualiza a faixa. */
export async function pegarAbobora(rodadaId: number): Promise<ResultadoPegar> {
  const { data, error } = await rpc<{ ganhou?: boolean; rodada?: unknown } | null>(
    'fn_abobora_pegar', { p_rodada: rodadaId },
  );
  if (error) return { ganhou: false, rodada: null, erro: error.message };
  const rodada = normalizarRodada(data?.rodada);
  if (rodada) aceitarRodada(rodada, true);
  return { ganhou: data?.ganhou === true, rodada, erro: null };
}

// ── O painel do super_admin (Configurações → Geral) ──────────────────────────

export interface ConfigCaca {
  dia:                string | null;
  ligada_em:          string | null;
  ligada_por_nome:    string | null;
  desligada_em:       string | null;
  desligada_por_nome: string | null;
  proxima_em:         string | null;
}

export interface PainelCaca {
  /** `false` = a migration ainda não foi aplicada. */
  disponivel: boolean;
  config:     ConfigCaca | null;
  /** As mais recentes primeiro. */
  rodadas:    RodadaAbobora[];
  hoje:       string | null;
}

export async function lerPainelCaca(): Promise<PainelCaca> {
  const [cfg, rods, hoje] = await Promise.all([
    tabela<ConfigCaca | null>('abobora_caca').select('*').eq('id', 1).maybeSingle(),
    tabela<Record<string, unknown>[] | null>('abobora_rodadas').select('*').order('id', { ascending: false }).limit(40),
    rpc<string | null>('fn_abobora_hoje'),
  ]);
  if (rods.error) return { disponivel: false, config: null, rodadas: [], hoje: null };
  return {
    disponivel: true,
    config:     cfg.error ? null : cfg.data,
    rodadas:    (rods.data ?? []).map(normalizarRodada).filter((r): r is RodadaAbobora => r !== null),
    hoje:       hoje.error ? null : hoje.data,
  };
}

export async function ligarCaca(ligar: boolean): Promise<{ erro: string | null }> {
  const { error } = await rpc<null>('fn_abobora_ligar', { p_ligar: ligar });
  return { erro: error?.message ?? null };
}

export async function soltarAboboraAgora(): Promise<{ erro: string | null }> {
  const { error } = await rpc<number | null>('fn_abobora_soltar_agora');
  return { erro: error?.message ?? null };
}

/** Só para os testes: o estado é de módulo e vazaria de um caso para o outro. */
export function __resetCacaParaTestes(): void {
  estado = { rodada: null, faixaAte: 0 };
  ouvintes.clear();
  for (const c of canais.values()) c.cancelar();
  canais.clear();
}
