/**
 * Desafio do Vale: 9 médias + Cupons do Pix (migration 20261123120000).
 *
 * O banco guarda a configuração e o % de cada SETOR no mês (o 59 do setor ÷
 * a meta do setor, refeito a cada lote novo do 59). O feito de cada operador
 * (Analítico) e os cupons (Pix Automático) são somados no navegador, pela
 * RLS que cada um já tem: o operador vê o dele, o líder vê o setor.
 *
 * Configuração, liberação e fechamento: só super_admin (RLS + funções).
 */
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { PixAutoStatus } from '@/services/pix_automatico.service';

export interface FaixaVale {
  /** % mínimo da meta do setor (cortado, não arredondado). */
  pct: number;
  /** O valor do vale, em reais. */
  valor: number;
}

export interface SetorNoVale {
  setor_id: string;
  nome: string;
  cidade: string | null;
  regra: string | null;
  participa: boolean;
  /** O % que vale: o manual (fechamento oficial) ganha do automático. `null` = sem %. */
  pct: number | null;
  /** manual = fechamento oficial; projecao = onde fecha no ritmo de hoje (o padrão no mês); automatico = o realizado. */
  origem: 'manual' | 'automatico' | 'projecao' | null;
  /** O realizado até hoje (o 59 ÷ a meta), quando `pct` é a projeção. */
  pct_realizado?: number | null;
  pct_manual: number | null;
  pct_auto: number | null;
  recebido: number | null;
  meta: number | null;
  /**
   * A 2ª parte do desafio neste setor (20261123200000): 'pix' = a cada N Pix
   * aprovados, 1 cupom; 'ranking' = os `cupom_ranking_qtd` que mais receberem
   * no período dos cupons (a Manutenção, que não tem Pix automático).
   */
  cupom_regra?: 'pix' | 'ranking';
  cupom_ranking_qtd?: number;
  /** Quantas pessoas o sorteio do setor premia (20261123220000). 0 = não definido. */
  sorteio_qtd?: number;
  /** Os ganhadores do sorteio, depois de sorteado. */
  ganhadores?: GanhadorDoSorteio[];
  sorteado_em?: string | null;
}

export interface GanhadorDoSorteio { posicao: number; perfil_id: string; nome: string; cupons?: number; chances?: number }

export interface DesafioVale {
  id: string;
  titulo: string;
  premio_nome: string;
  inicio: string;
  fim: string;
  medias: number;
  faixas: FaixaVale[];
  cupom_ativo: boolean;
  cupom_inicio: string | null;
  cupom_fim: string | null;
  cupom_pix: number;
  cupom_premio: string;
  /** true = cada cupom é uma chance no sorteio; false = uma chance por pessoa com cupom. */
  sorteio_por_cupom?: boolean;
  liberado: boolean;
  /** Fechamento confirmado pelo super_admin: o prêmio é o final. */
  fechado_em: string | null;
  calculado_em: string | null;
  /** A hora do 59 que deu o % dos setores. */
  calculado_lote: string | null;
  /** Só para quem vê todos os setores (super_admin, Analítico de todos). */
  setores: SetorNoVale[] | null;
  /** Só em `fn_desafio_vale_atual`. */
  previa?: boolean;
  super_admin?: boolean;
  meu_setor?: SetorNoVale | null;
  /** O resultado gravado ao confirmar o fechamento (migration 20261123150000). */
  meu_resultado?: ResultadoVale | null;
}

/** Uma pessoa no resultado gravado no fechamento. */
export interface ResultadoVale {
  perfil_id: string;
  nome: string;
  setor_id: string | null;
  setor_nome: string | null;
  equipe_nome: string | null;
  medias: number;
  feito: number;
  meta: number | null;
  bateu: boolean;
  valor: number;
  cupons: number;
  pix_pendentes: number;
  /** Setor de ranking: a posição de quem ficou entre os N (nulo = fora ou setor de Pix). */
  ranking_posicao?: number | null;
  gravado_em?: string;
}

export interface DetalheVale extends DesafioVale {
  empresa_id: string;
  liberado_em: string | null;
  /** Todos os setores do desafio, participando ou não. */
  todos_setores: SetorNoVale[];
}

const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

function normalizarSetor(s: SetorNoVale): SetorNoVale {
  return {
    ...s, pct: n(s.pct), pct_manual: n(s.pct_manual), pct_auto: n(s.pct_auto), recebido: n(s.recebido), meta: n(s.meta),
    cupom_regra: s.cupom_regra === 'ranking' ? 'ranking' : 'pix', cupom_ranking_qtd: Number(s.cupom_ranking_qtd) || 2,
    sorteio_qtd: Number(s.sorteio_qtd) || 0,
    ganhadores: (s.ganhadores ?? []).map(g => ({ ...g, posicao: Number(g.posicao) })),
  };
}

export function normalizarDesafioVale<T extends DesafioVale>(d: T): T {
  return {
    ...d,
    medias: Number(d.medias),
    cupom_pix: Number(d.cupom_pix) || 3,
    sorteio_por_cupom: d.sorteio_por_cupom === true,
    faixas: (Array.isArray(d.faixas) ? d.faixas : []).map(f => ({ pct: Number(f.pct) || 0, valor: Number(f.valor) || 0 })),
    setores: d.setores ? d.setores.map(normalizarSetor) : null,
    meu_setor: d.meu_setor ? normalizarSetor(d.meu_setor) : d.meu_setor,
    meu_resultado: d.meu_resultado ? {
      ...d.meu_resultado, medias: Number(d.meu_resultado.medias), feito: Number(d.meu_resultado.feito),
      meta: n(d.meu_resultado.meta), valor: Number(d.meu_resultado.valor),
    } : d.meu_resultado ?? null,
    ...('todos_setores' in d ? { todos_setores: ((d as unknown as DetalheVale).todos_setores ?? []).map(normalizarSetor) } : {}),
  };
}

export async function buscarDesafioVale(): Promise<DesafioVale | null> {
  const { data, error } = await rpcSemTipo<DesafioVale | null>('fn_desafio_vale_atual', {});
  if (error) {
    // Migration ainda não colada: o desafio simplesmente não existe.
    if (/fn_desafio_vale_atual/.test(error.message) && /does not exist|not find|schema cache/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return data ? normalizarDesafioVale(data) : null;
}

export async function buscarDetalheVale(): Promise<DetalheVale | null> {
  const { data, error } = await rpcSemTipo<DetalheVale | null>('fn_desafio_vale_detalhe', {});
  if (error) throw new Error(error.message);
  return data ? normalizarDesafioVale(data) : null;
}

export async function recalcularVale(id: string): Promise<number> {
  const { data, error } = await rpcSemTipo<number>('fn_desafio_vale_recalcular', { p_desafio: id });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

type TabelaSolta = {
  update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => PromiseLike<{ error: { message: string } | null }> };
  upsert: (v: Record<string, unknown>, o?: { onConflict: string }) => PromiseLike<{ error: { message: string } | null }>;
};
const tabela = (nome: string) => (supabase as unknown as { from: (t: string) => TabelaSolta }).from(nome);

export interface ConfigDoVale {
  titulo: string;
  premio_nome: string;
  inicio: string;
  fim: string;
  medias: number;
  faixas: FaixaVale[];
  cupom_ativo: boolean;
  cupom_inicio: string | null;
  cupom_fim: string | null;
  cupom_pix: number;
  cupom_premio: string;
  sorteio_por_cupom: boolean;
}

export async function salvarConfigVale(id: string, c: ConfigDoVale): Promise<void> {
  const { error } = await tabela('desafio_vale').update({ ...c }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function liberarVale(id: string, liberado: boolean): Promise<void> {
  const { error } = await tabela('desafio_vale').update({ liberado }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Confirmar (ou desfazer) o fechamento: com ele, o % para de seguir o 59. */
export async function fecharVale(id: string, fechado: boolean): Promise<void> {
  const { error } = await tabela('desafio_vale')
    .update({ fechado_em: fechado ? new Date().toISOString() : null, ...(fechado ? {} : { fechado_por: null }) })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function salvarSetorVale(desafioId: string, s: {
  setor_id: string; participa?: boolean; pct_manual?: number | null; cupom_regra?: 'pix' | 'ranking'; cupom_ranking_qtd?: number;
  sorteio_qtd?: number;
}): Promise<void> {
  const { error } = await tabela('desafio_vale_setores')
    .upsert({ desafio_id: desafioId, ...s }, { onConflict: 'desafio_id,setor_id' });
  if (error) throw new Error(error.message);
}

type TabelaResultado = {
  delete: () => { eq: (c: string, v: string) => PromiseLike<{ error: { message: string } | null }> };
  insert: (v: Record<string, unknown>[]) => PromiseLike<{ error: { message: string } | null }>;
};

/**
 * Grava o resultado de cada pessoa (o fechamento). Troca o que havia: apaga e
 * insere de novo, em lotes de 500.
 */
export async function gravarResultadoVale(desafioId: string, linhas: readonly ResultadoVale[], autorId: string | null): Promise<void> {
  const t = (supabase as unknown as { from: (n: string) => TabelaResultado }).from('desafio_vale_resultado');
  const apagou = await t.delete().eq('desafio_id', desafioId);
  if (apagou.error) throw new Error(apagou.error.message);
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await t.insert(linhas.slice(i, i + 500).map(l => ({
      desafio_id: desafioId, perfil_id: l.perfil_id, nome: l.nome, setor_id: l.setor_id, setor_nome: l.setor_nome,
      equipe_nome: l.equipe_nome, medias: l.medias, feito: l.feito, meta: l.meta, bateu: l.bateu, valor: l.valor,
      cupons: l.cupons, pix_pendentes: l.pix_pendentes, gravado_por: autorId,
      ...(l.ranking_posicao != null ? { ranking_posicao: l.ranking_posicao } : {}),
    })));
    if (error) throw new Error(error.message);
  }
}

export async function apagarResultadoVale(desafioId: string): Promise<void> {
  const t = (supabase as unknown as { from: (n: string) => TabelaResultado }).from('desafio_vale_resultado');
  const { error } = await t.delete().eq('desafio_id', desafioId);
  if (error) throw new Error(error.message);
}

// ── O ranking dos setores sem Pix (a Manutenção) ────────────────────────────

export interface PessoaNoRanking { perfil_id: string; nome: string; valor: number; posicao: number; eu: boolean }

export interface RankingDoVale {
  setor_id: string;
  /** Quantos ganham (os N primeiros). */
  qtd: number;
  de: string;
  ate: string;
  pessoas: number;
  /** O valor de quem está na última vaga: quanto precisa para entrar. */
  corte: number | null;
  /** O pódio (os N primeiros, empates inclusos): todo mundo do setor vê. */
  topo: PessoaNoRanking[];
  /** A pessoa que olha (nulo = não concorre: líder, outro setor). */
  eu: PessoaNoRanking | null;
  /** A lista inteira: só líder, gerência e super_admin. */
  todos: PessoaNoRanking[] | null;
}

const pessoaNoRanking = (x: PessoaNoRanking): PessoaNoRanking => ({ ...x, valor: Number(x.valor) || 0, posicao: Number(x.posicao) || 0 });

export async function buscarRankingVale(setorId?: string | null): Promise<RankingDoVale | null> {
  const { data, error } = await rpcSemTipo<RankingDoVale | null>('fn_desafio_vale_ranking', setorId ? { p_setor: setorId } : {});
  if (error) {
    // Migration 20261123200000 ainda não colada: sem ranking.
    if (/fn_desafio_vale_ranking/.test(error.message) && /does not exist|not find|schema cache/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return {
    ...data, qtd: Number(data.qtd) || 2, corte: data.corte == null ? null : Number(data.corte),
    topo: (data.topo ?? []).map(pessoaNoRanking), eu: data.eu ? pessoaNoRanking(data.eu) : null,
    todos: data.todos ? data.todos.map(pessoaNoRanking) : null,
  };
}

// ── A arte obrigatória e quem viu (20261123235000) ──────────────────────────

const funcaoAusente = (msg: string, fn: string) => msg.includes(fn) && /does not exist|not find|schema cache/i.test(msg);

/** A pessoa já fechou a arte com «Bora pra cima»? `null` = a migration ainda não foi colada. */
export async function jaViArteVale(desafioId: string): Promise<boolean | null> {
  const { data, error } = await rpcSemTipo<boolean>('fn_desafio_vale_ja_vi', { p_desafio: desafioId });
  if (error) {
    if (funcaoAusente(error.message, 'fn_desafio_vale_ja_vi')) return null;
    throw new Error(error.message);
  }
  return data === true;
}

/** «Bora pra cima»: grava que a pessoa leu a arte. */
export async function marcarArteVista(desafioId: string): Promise<void> {
  const { error } = await rpcSemTipo<boolean>('fn_desafio_vale_vi', { p_desafio: desafioId });
  if (error && !funcaoAusente(error.message, 'fn_desafio_vale_vi')) throw new Error(error.message);
}

export interface VistosDoSetor {
  setor_id: string;
  nome: string;
  total: number;
  viram: number;
  faltam: { perfil_id: string; nome: string; cargo: string | null }[];
}

/** Quantos viram a arte, por setor (super_admin/gerência: todos; líder: o dele). */
export async function buscarVistosVale(): Promise<{ liberado_em: string | null; setores: VistosDoSetor[] } | null> {
  const { data, error } = await rpcSemTipo<{ liberado_em: string | null; setores: VistosDoSetor[] } | null>('fn_desafio_vale_vistos', {});
  if (error) {
    if (funcaoAusente(error.message, 'fn_desafio_vale_vistos')) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return { ...data, setores: (data.setores ?? []).map(x => ({ ...x, total: Number(x.total) || 0, viram: Number(x.viram) || 0, faltam: x.faltam ?? [] })) };
}

// ── O sorteio dos cupons (só super_admin) ───────────────────────────────────

export interface ConcorrenteDoSorteio { perfil_id: string; nome: string; aprovados: number; cupons: number; chances: number }
export interface SorteioFeito { concorrentes: number; chances_total: number; qtd: number; ganhadores: GanhadorDoSorteio[] }

/** Quem concorre no setor e com quantas chances, antes de sortear. */
export async function previaDoSorteio(setorId: string): Promise<ConcorrenteDoSorteio[]> {
  const { data, error } = await rpcSemTipo<{ concorrentes: ConcorrenteDoSorteio[] } | null>('fn_desafio_vale_sorteio_previa', { p_setor: setorId });
  if (error) throw new Error(error.message);
  return (data?.concorrentes ?? []).map(c => ({ ...c, aprovados: Number(c.aprovados), cupons: Number(c.cupons), chances: Number(c.chances) }));
}

/** Sorteia os ganhadores do setor no banco (fica gravado). `refazer` apaga o anterior. */
export async function sortearSetor(setorId: string, refazer = false): Promise<SorteioFeito> {
  const { data, error } = await rpcSemTipo<SorteioFeito>('fn_desafio_vale_sortear', { p_setor: setorId, p_refazer: refazer });
  if (error) throw new Error(error.message);
  return {
    concorrentes: Number(data?.concorrentes) || 0, chances_total: Number(data?.chances_total) || 0, qtd: Number(data?.qtd) || 0,
    ganhadores: (data?.ganhadores ?? []).map(g => ({ ...g, posicao: Number(g.posicao) })),
  };
}

// ── Pix do período dos cupons ────────────────────────────────────────────────

export interface PixDoCupom {
  id: string;
  operador_id: string;
  operador_nome: string | null;
  setor_id: string | null;
  nr_cliente: string;
  status: PixAutoStatus;
  criado_em: string;
}

/** Meia-noite de São Paulo (UTC−3, sem horário de verão desde 2019). */
const meiaNoiteSP = (dia: string) => `${dia}T00:00:00-03:00`;
const diaSeguinte = (dia: string) => {
  const t = Date.parse(`${dia}T12:00:00Z`) + 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
};

/**
 * Os Pix registrados de `inicio` a `fim` (dias de São Paulo). `operadorId`:
 * só os dele; `setorId`: os do setor; nenhum: o que a RLS deixar (super_admin
 * = todos). Pagina de mil em mil — o PostgREST corta calado em mil.
 */
export async function buscarPixDoCupom(params: {
  empresaId: string; inicio: string; fim: string; operadorId?: string; setorId?: string;
}): Promise<PixDoCupom[]> {
  const todas: PixDoCupom[] = [];
  const PASSO = 1000;
  for (let de = 0; de < 50_000; de += PASSO) {
    let q = supabase.from('pix_automatico_acordos')
      .select('id, operador_id, operador_nome, setor_id, nr_cliente, status, criado_em')
      .eq('empresa_id', params.empresaId)
      .gte('criado_em', meiaNoiteSP(params.inicio))
      .lt('criado_em', meiaNoiteSP(diaSeguinte(params.fim)))
      .order('criado_em', { ascending: true })
      .order('id', { ascending: true });
    if (params.operadorId) q = q.eq('operador_id', params.operadorId);
    if (params.setorId) q = q.eq('setor_id', params.setorId);
    const { data, error } = await q.range(de, de + PASSO - 1);
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as unknown as PixDoCupom[];
    todas.push(...linhas);
    if (linhas.length < PASSO) break;
  }
  return todas;
}
