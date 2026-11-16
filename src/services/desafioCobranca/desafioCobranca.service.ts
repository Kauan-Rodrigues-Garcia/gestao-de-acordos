/**
 * Desafio Cobrança «para folgar mais cedo» (migration 20261116150000).
 *
 * O placar vem pronto do banco (`fn_desafio_cobranca_atual`): o 59 por grupo,
 * só grupo ligado a setor que soma (ou grupo avulso marcado), mais os ajustes
 * do super_admin. A tela não
 * soma recebimento nenhum — só desenha.
 *
 * Configuração, ajustes e o detalhe hora a hora: só super_admin (a RLS e as
 * funções recusam os demais).
 */
import { supabase } from '@/lib/supabase';

export interface DiaDoPlacar {
  dia: string;
  valor_59: number;
  ajuste: number;
  total: number;
  /** Hora do retrato do 59 que deu este dia. */
  lido_em: string | null;
}

export type FonteDoPlacar = '59' | 'manual';

export interface PlacarCobranca {
  id: string;
  titulo: string;
  subtitulo: string;
  dias: string[];
  meta_geral: number;
  premio_dia: string | null;
  premio_hora: string;
  premio_requisito: string;
  /** 1º nível individual: 4,5 médias = 1 hora mais cedo. */
  regra_medias: number;
  regra_premio: string;
  /** 2º nível individual: 5 médias = sai às 14:00. */
  regra_medias_maior: number;
  regra_premio_maior: string;
  /** Grupos do 59 sem setor que somam assim mesmo (cod). Ex.: «COB PLAY - EM DIA» (61). */
  grupos_avulsos: string[];
  /** De onde vem o placar: '59' (o 59 + ajustes) ou 'manual' (só os lançamentos do super_admin). */
  fonte: FonteDoPlacar;
  liberado: boolean;
  /** A hora do dado: o retrato do 59 mais novo, ou o último lançamento no manual. */
  atualizado_em: string | null;
  por_dia: DiaDoPlacar[];
  total: number;
  /** Só em `fn_desafio_cobranca_atual`: super_admin vendo antes de liberar. */
  previa?: boolean;
  super_admin?: boolean;
  /** Só em `fn_desafio_cobranca_atual`: a pessoa já viu a abertura (registro no banco, 1 vez por desafio). */
  ja_abriu?: boolean;
  /** Só em `fn_desafio_cobranca_tv`: o Natal está liberado na empresa (as cores da TV). */
  natal?: boolean;
}

export interface SetorDoDesafio {
  setor_id: string;
  nome: string;
  cidade: string | null;
  regra: string | null;
  soma: boolean;
  ve: boolean;
}

export interface GrupoDoDia {
  dia: string;
  cod: string;
  nome: string;
  setor_id: string | null;
  pagamentos: number;
  valor: number;
}

export interface LeituraPorSetor {
  lido_em: string;
  dia: string;
  setor_id: string | null;
  /** Só no grupo sem setor: o cod dele (para o avulso que soma). */
  cod?: string | null;
  valor: number;
}

export interface AjusteCobranca {
  id: string;
  dia: string;
  setor_id: string | null;
  valor: number;
  motivo: string;
  criado_em: string;
  criado_por: string | null;
  removido_em: string | null;
}

export interface DetalheCobranca extends PlacarCobranca {
  ativo: boolean;
  empresa_id: string;
  liberado_em: string | null;
  setores: SetorDoDesafio[];
  grupos: GrupoDoDia[];
  horas: LeituraPorSetor[];
  leituras: string[];
  ajustes: AjusteCobranca[];
  /** Quantas pessoas já viram a abertura. */
  aberturas?: number;
  lote_59: { importado_em: string | null } | null;
}

/** O banco devolve numeric como texto às vezes: tudo vira número aqui. */
function lerPlacar<T extends PlacarCobranca>(cru: unknown): T | null {
  if (!cru || typeof cru !== 'object') return null;
  const p = cru as Record<string, unknown>;
  const n = (v: unknown) => Number(v) || 0;
  const base = {
    ...p,
    meta_geral: n(p.meta_geral),
    regra_medias: n(p.regra_medias),
    // Sem a coluna (migration antiga): o padrão, 5 médias às 14:00.
    regra_medias_maior: n(p.regra_medias_maior) || 5,
    regra_premio_maior: typeof p.regra_premio_maior === 'string' ? p.regra_premio_maior : 'sai às 14:00',
    total: n(p.total),
    grupos_avulsos: Array.isArray(p.grupos_avulsos) ? (p.grupos_avulsos as unknown[]).map(String) : [],
    // Sem a coluna (migration antiga): o 59.
    fonte: p.fonte === 'manual' ? 'manual' : '59',
    dias: Array.isArray(p.dias) ? (p.dias as string[]) : [],
    por_dia: Array.isArray(p.por_dia)
      ? (p.por_dia as Record<string, unknown>[]).map(d => ({
        dia: String(d.dia), valor_59: n(d.valor_59), ajuste: n(d.ajuste), total: n(d.total),
        lido_em: (d.lido_em as string | null) ?? null,
      }))
      : [],
  } as Record<string, unknown>;
  if (Array.isArray(p.grupos)) base.grupos = (p.grupos as Record<string, unknown>[]).map(g => ({ ...g, valor: n(g.valor), pagamentos: n(g.pagamentos) }));
  if (Array.isArray(p.horas)) base.horas = (p.horas as Record<string, unknown>[]).map(h => ({ ...h, valor: n(h.valor) }));
  if (Array.isArray(p.ajustes)) base.ajustes = (p.ajustes as Record<string, unknown>[]).map(a => ({ ...a, valor: n(a.valor) }));
  return base as unknown as T;
}

type Rpc = (nome: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
// `bind`: solto do cliente, o `rpc` perde o `this` («reading 'rest'»).
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;

/** Sem a migration aplicada, a função não existe: o desafio só não aparece. */
const semMigration = (e: { message: string; code?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /fn_desafio_cobranca/.test(e.message));

export async function buscarDesafioCobranca(): Promise<PlacarCobranca | null> {
  const { data, error } = await rpc('fn_desafio_cobranca_atual');
  if (error) {
    if (semMigration(error)) return null;
    throw new Error(error.message);
  }
  return lerPlacar<PlacarCobranca>(data);
}

export async function buscarDesafioCobrancaTv(token: string): Promise<PlacarCobranca | null> {
  const { data, error } = await rpc('fn_desafio_cobranca_tv', { p_token: token });
  if (error) {
    if (semMigration(error)) return null;
    throw new Error(error.message);
  }
  return lerPlacar<PlacarCobranca>(data);
}

export async function buscarDetalheCobranca(): Promise<DetalheCobranca | null> {
  const { data, error } = await rpc('fn_desafio_cobranca_detalhe');
  if (error) {
    if (semMigration(error)) return null;
    throw new Error(error.message);
  }
  return lerPlacar<DetalheCobranca>(data);
}

/**
 * Grava no banco que a pessoa viu a abertura (uma vez; repetir não faz nada).
 * Sem a migration nova, não faz nada — o navegador ainda lembra.
 */
export async function marcarAbertura(desafioId: string): Promise<void> {
  const { error } = await rpc('fn_desafio_cobranca_abri', { p_desafio: desafioId });
  if (error && !semMigration(error)) throw new Error(error.message);
}

export async function lerAgora(desafioId: string): Promise<number> {
  const { data, error } = await rpc('fn_desafio_cobranca_ler_agora', { p_desafio: desafioId });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

// As tabelas novas ainda não estão em `database.types.ts`: um molde mínimo.
interface Resposta { error: { message: string } | null }
interface Consulta extends PromiseLike<Resposta> { eq: (coluna: string, valor: string) => PromiseLike<Resposta> }
interface TabelaSolta {
  update: (dados: Record<string, unknown>) => Consulta;
  insert: (dados: Record<string, unknown>) => PromiseLike<Resposta>;
  upsert: (dados: Record<string, unknown>, opcoes: { onConflict: string }) => PromiseLike<Resposta>;
}
const tabela = (nome: string) => (supabase as unknown as { from: (t: string) => TabelaSolta }).from(nome);

export interface ConfigDoDesafio {
  titulo: string;
  subtitulo: string;
  dias: string[];
  meta_geral: number;
  premio_dia: string | null;
  premio_hora: string;
  premio_requisito: string;
  regra_medias: number;
  regra_premio: string;
  regra_medias_maior: number;
  regra_premio_maior: string;
}

export async function salvarConfig(id: string, c: ConfigDoDesafio): Promise<void> {
  const { error } = await tabela('desafio_cobranca').update({ ...c }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function liberar(id: string, liberado: boolean): Promise<void> {
  const { error } = await tabela('desafio_cobranca').update({ liberado }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function salvarSetor(desafioId: string, s: Pick<SetorDoDesafio, 'setor_id' | 'soma' | 've'>): Promise<void> {
  const { error } = await tabela('desafio_cobranca_setores')
    .upsert({ desafio_id: desafioId, setor_id: s.setor_id, soma: s.soma, ve: s.ve }, { onConflict: 'desafio_id,setor_id' });
  if (error) throw new Error(error.message);
}

/** De onde vem o placar de todo mundo (Gestão e TV). */
export async function salvarFonte(id: string, fonte: FonteDoPlacar): Promise<void> {
  const { error } = await tabela('desafio_cobranca').update({ fonte }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Os grupos sem setor que somam no desafio. */
export async function salvarGruposAvulsos(id: string, cods: readonly string[]): Promise<void> {
  const { error } = await tabela('desafio_cobranca').update({ grupos_avulsos: [...new Set(cods)] }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function lancarAjuste(a: { desafioId: string; dia: string; setorId: string | null; valor: number; motivo: string; criadoPor: string }): Promise<void> {
  const { error } = await tabela('desafio_cobranca_ajustes').insert({
    desafio_id: a.desafioId, dia: a.dia, setor_id: a.setorId, valor: a.valor, motivo: a.motivo.trim(), criado_por: a.criadoPor,
  });
  if (error) throw new Error(error.message);
}

export async function removerAjuste(id: string, removidoPor: string): Promise<void> {
  const { error } = await tabela('desafio_cobranca_ajustes')
    .update({ removido_em: new Date().toISOString(), removido_por: removidoPor }).eq('id', id);
  if (error) throw new Error(error.message);
}
