/**
 * configDoMes.ts — a CONFIGURAÇÃO de um mês fechado, como estava no mês.
 *
 * ## O buraco que isto fecha (31/10/2026)
 *
 * O retrato (`composicao_mes*`) guarda, desde 29/10/2026, também o que entra na
 * conta do mês: treinamento da equipe, regra/cidade do setor, subgrupo da
 * pessoa, e em `composicao_mes_config` o H.O. da empresa, o Pix, o ranking, as
 * carteiras do 59, a remuneração do RH, o Direto/Extra e o bônus de Pix
 * (migrations 20261029200000 e 20261031200000). Mas as telas continuavam lendo
 * as tabelas de HOJE: mudar o treinamento de uma equipe em novembro mudava os
 * dias úteis de outubro nos Quartis; trocar alguém de subgrupo mudava a
 * comissão de outubro.
 *
 * Aqui cada leitura tem as duas pontas:
 *
 *   mês fechado com o dado guardado → o retrato;
 *   mês corrente, ou mês fechado antes de guardar → a tabela de hoje, como
 *   sempre foi.
 *
 * `MES_INICIO_CONFIG` separa «guardado como vazio» de «não guardado»: antes de
 * outubro/2026 o retrato não tinha essas colunas, e nulo lá quer dizer «não
 * sei» — cai na tabela de hoje.
 *
 * Leitura só. Ninguém grava config de mês fechado: o banco recusa
 * (`fn_composicao_mes_snapshot` nunca regrava a config de mês fechado).
 */
import { supabase } from '@/lib/supabase';
import { tabelaSemTipo } from '@/lib/supabaseSemTipo';
import { lerComCache } from '@/lib/cacheCurto';
import { mesFechado } from '@/lib/fechamentoMes';
import { normalizarMes } from '@/lib/mesReferencia';
import { ehRegraDoSetor, type RegraDoSetor } from '@/lib/regraDoSetor';

/** Primeiro mês cujo retrato guarda a configuração (20261029200000). */
export const MES_INICIO_CONFIG = '2026-10';

const VALIDADE_MS = 30 * 60 * 1000;
const PREFIXO = 'config-do-mes:';

/** O mês fechou e o retrato dele guarda configuração? */
export function mesTemConfigGuardada(mes: string | null | undefined): boolean {
  if (!mes) return false;
  const m = normalizarMes(mes);
  return mesFechado(m) && m >= MES_INICIO_CONFIG;
}

// ── composicao_mes_config ───────────────────────────────────────────────────

export interface ConfigDoMes {
  /** `empresas.config` do mês — o H.O. mora em `ho_percentual`. */
  empresaConfig: Record<string, unknown>;
  /** Linhas de `analitico_ranking_config`. */
  ranking: Record<string, unknown>[];
  /** Linhas de `pix_automatico_config`. */
  pixConfig: Record<string, unknown>[];
  /** O vínculo do 59: `mestre_grupos` e `mestre_equipes` do mês. */
  carteiras: { grupos: Record<string, unknown>[]; equipes: Record<string, unknown>[] };
  /** `equipe_subgrupos`: [{id, equipe_id, nome}]. */
  subgrupos: { id: string; equipe_id: string; nome: string }[];
  /** Linhas de `rh_config_setores`. */
  rhSetores: Record<string, unknown>[];
  /** Linhas de `direto_extra_config`. */
  diretoExtra: Record<string, unknown>[];
  /** Linhas de `pix_automatico_bonus` cujo período toca o mês. */
  pixBonus: Record<string, unknown>[];
}

interface LinhaConfig {
  empresa_config: Record<string, unknown> | null;
  ranking: Record<string, unknown>[] | null;
  pix_config: Record<string, unknown>[] | null;
  carteiras: { grupos?: Record<string, unknown>[]; equipes?: Record<string, unknown>[] } | null;
  subgrupos: ConfigDoMes['subgrupos'] | null;
  rh_setores: Record<string, unknown>[] | null;
  direto_extra: Record<string, unknown>[] | null;
  pix_bonus: Record<string, unknown>[] | null;
}

/** Converte a linha crua. Exportada para os testes. */
export function configDaLinha(l: LinhaConfig): ConfigDoMes {
  return {
    empresaConfig: l.empresa_config ?? {},
    ranking:       l.ranking ?? [],
    pixConfig:     l.pix_config ?? [],
    carteiras:     { grupos: l.carteiras?.grupos ?? [], equipes: l.carteiras?.equipes ?? [] },
    subgrupos:     l.subgrupos ?? [],
    rhSetores:     l.rh_setores ?? [],
    diretoExtra:   l.direto_extra ?? [],
    pixBonus:      l.pix_bonus ?? [],
  };
}

/**
 * A configuração guardada do mês. `null` = mês aberto, mês sem config guardada
 * ou leitura falhando — quem chama segue com a tabela de hoje.
 */
export async function buscarConfigDoMes(
  empresaId: string | null | undefined, mes: string | null | undefined,
): Promise<ConfigDoMes | null> {
  if (!empresaId || !mesTemConfigGuardada(mes)) return null;
  const m = normalizarMes(mes as string);
  return lerComCache(
    `${PREFIXO}config:${empresaId}:${m}`,
    VALIDADE_MS,
    async () => {
      const { data, error } = await tabelaSemTipo<LinhaConfig>('composicao_mes_config')
        .select('empresa_config, ranking, pix_config, carteiras, subgrupos, rh_setores, direto_extra, pix_bonus')
        .eq('empresa_id', empresaId).eq('mes', m);
      if (error || !data?.length) return null;
      return configDaLinha(data[0]);
    },
    { guardarSe: v => v !== null },
  );
}

/** O percentual de H.O. guardado no mês, ou `null` (não guardado / mês aberto). */
export async function buscarHoPercentualDoMes(
  empresaId: string | null | undefined, mes: string | null | undefined,
): Promise<number | null> {
  const cfg = await buscarConfigDoMes(empresaId, mes);
  const v = Number(cfg?.empresaConfig?.ho_percentual);
  return cfg && Number.isFinite(v) && v > 0 ? v : null;
}

// ── Treinamento das equipes ─────────────────────────────────────────────────

export interface TreinamentoDaEquipe {
  id: string;
  treinamento: boolean | null;
  treinamento_inicio: string | null;
}

interface LinhaTreinoRetrato {
  equipe_id: string;
  treinamento: boolean | null;
  treinamento_inicio: string | null;
}

/** Retrato por cima de hoje: a equipe que estava no mês leva o treinamento do mês. Exportada para os testes. */
export function treinamentoComRetrato(
  hoje: readonly TreinamentoDaEquipe[], retrato: readonly LinhaTreinoRetrato[],
): TreinamentoDaEquipe[] {
  const doMes = new Map(retrato.filter(r => r.treinamento !== null).map(r => [r.equipe_id, r]));
  const saida: TreinamentoDaEquipe[] = hoje.map(e => {
    const r = doMes.get(e.id);
    return r ? { id: e.id, treinamento: r.treinamento, treinamento_inicio: r.treinamento_inicio } : e;
  });
  // A equipe excluída depois do mês só existe no retrato.
  const vistas = new Set(hoje.map(e => e.id));
  for (const r of doMes.values()) {
    if (!vistas.has(r.equipe_id)) {
      saida.push({ id: r.equipe_id, treinamento: r.treinamento, treinamento_inicio: r.treinamento_inicio });
    }
  }
  return saida;
}

/**
 * Só o retrato: equipe → treinamento do mês fechado. `null` = mês aberto ou
 * não guardado (quem chama já tem a tabela de hoje em mãos e segue com ela).
 */
export async function buscarTreinamentoDoRetrato(
  empresaId: string, mes: string | null | undefined,
): Promise<ReadonlyMap<string, TreinamentoDaEquipe> | null> {
  if (!mesTemConfigGuardada(mes)) return null;
  const { data, error } = await tabelaSemTipo<LinhaTreinoRetrato>('composicao_mes_equipe')
    .select('equipe_id, treinamento, treinamento_inicio')
    .eq('empresa_id', empresaId).eq('mes', normalizarMes(mes as string));
  if (error || !data?.length) return null;
  return new Map(data.filter(r => r.treinamento !== null).map(r => [r.equipe_id, {
    id: r.equipe_id, treinamento: r.treinamento, treinamento_inicio: r.treinamento_inicio,
  }]));
}

/**
 * `id, treinamento, treinamento_inicio` das equipes NO MÊS — no mesmo formato
 * de `supabase.from('equipes').select('id, treinamento, treinamento_inicio')`,
 * para entrar no lugar dele dentro de um `Promise.all`.
 */
export async function buscarTreinamentoDasEquipes(
  empresaId: string, mes: string | null | undefined,
): Promise<{ data: TreinamentoDaEquipe[] | null; error: { message: string } | null }> {
  const hoje = await supabase.from('equipes')
    .select('id, treinamento, treinamento_inicio').eq('empresa_id', empresaId);
  const linhasHoje = (hoje.data as TreinamentoDaEquipe[] | null) ?? null;
  if (!mesTemConfigGuardada(mes)) return { data: linhasHoje, error: hoje.error };

  const { data: retrato, error } = await tabelaSemTipo<LinhaTreinoRetrato>('composicao_mes_equipe')
    .select('equipe_id, treinamento, treinamento_inicio')
    .eq('empresa_id', empresaId).eq('mes', normalizarMes(mes as string));
  if (error || !retrato?.length) return { data: linhasHoje, error: hoje.error };
  return { data: treinamentoComRetrato(linhasHoje ?? [], retrato), error: null };
}

// ── Regra e cidade dos setores ──────────────────────────────────────────────

export interface SetorDoMes { regra: RegraDoSetor | null; cidade_id: string | null; tipo: string | null }

/** Setor → regra/cidade/tipo DO MÊS. `null` = mês aberto ou não guardado. */
export async function buscarSetoresDoMes(
  empresaId: string | null | undefined, mes: string | null | undefined,
): Promise<ReadonlyMap<string, SetorDoMes> | null> {
  if (!empresaId || !mesTemConfigGuardada(mes)) return null;
  const m = normalizarMes(mes as string);
  return lerComCache(
    `${PREFIXO}setores:${empresaId}:${m}`,
    VALIDADE_MS,
    async () => {
      const { data, error } = await tabelaSemTipo<{ setor_id: string; regra: string | null; cidade_id: string | null; tipo: string | null }>('composicao_mes_setor')
        .select('setor_id, regra, cidade_id, tipo').eq('empresa_id', empresaId).eq('mes', m);
      if (error || !data?.length) return null;
      return new Map(data.map(s => [s.setor_id, {
        regra: ehRegraDoSetor(s.regra) ? s.regra : null,
        cidade_id: s.cidade_id,
        tipo: s.tipo,
      }]));
    },
    { guardarSe: v => v !== null },
  );
}

// ── Subgrupo de cada pessoa ─────────────────────────────────────────────────

/** Primeiro mês cujo retrato guarda o subgrupo (20261031200000). */
export const MES_INICIO_SUBGRUPO = '2026-10';

/**
 * Pessoa → subgrupo NO MÊS (nulo = sem subgrupo naquele mês). `null` = mês
 * aberto ou não guardado: quem chama usa `perfis.subgrupo_id`.
 */
export async function buscarSubgruposDasPessoasNoMes(
  empresaId: string | null | undefined, mes: string | null | undefined,
): Promise<ReadonlyMap<string, string | null> | null> {
  if (!empresaId || !mes) return null;
  const m = normalizarMes(mes);
  if (!mesFechado(m) || m < MES_INICIO_SUBGRUPO) return null;
  return lerComCache(
    `${PREFIXO}subgrupos:${empresaId}:${m}`,
    VALIDADE_MS,
    async () => {
      const { data, error } = await tabelaSemTipo<{ operador_id: string; subgrupo_id: string | null }>('composicao_mes')
        .select('operador_id, subgrupo_id').eq('empresa_id', empresaId).eq('mes', m);
      if (error || !data?.length) return null;
      return new Map(data.map(l => [l.operador_id, l.subgrupo_id]));
    },
    { guardarSe: v => v !== null },
  );
}
