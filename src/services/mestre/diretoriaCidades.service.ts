/**
 * diretoriaCidades.service.ts — a Visão geral do Painel Diretoria por cidade,
 * e o resumo de um dia.
 *
 * Duas leituras e uma escrita, todas na migration 20261003170000:
 *
 *   fn_mestre_diretoria_cidades   o mês: geral + cada cidade + as carteiras
 *   fn_mestre_diretoria_dia       um dia: total, formas, cada setor/carteira
 *   fn_mestre_carteira_classificar  cidade e regra de carteira sem setor
 *
 * ## A cidade é da carteira
 *
 * Cada linha do 59 tem uma carteira, e a carteira tem uma cidade (a do setor
 * vinculado, ou a escolhida no painel). Por isso as cidades FECHAM o total —
 * coisa que somar setores nunca faria (o Integral conta em dois, o colchão em
 * nenhum). O teste `diretoriaPorCidade.sql.test.ts` amarra isso à Visão geral
 * de sempre.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { espiarDo59, esquecerLeiturasDo59, lerDo59 } from './cache59';
import type { DiaDaSerie, FormaDePagamento } from './diretoria.service';

const n = (v: unknown): number => Number(v) || 0;

export type RegraDaCarteira = 'nosso_produto' | 'cofen';
const regraOuNula = (v: unknown): RegraDaCarteira | null => (v === 'cofen' || v === 'nosso_produto' ? v : null);

/** O mês de um escopo (o geral ou uma cidade). */
export interface MesDoEscopo {
  valor: number;
  /** Pagamentos (linhas do 59). */
  linhas: number;
  operadores: number;
  /** A parte do valor que é colchão — conta no total, em setor nenhum. */
  colchao: number;
  /** O mês anterior até o MESMO dia. */
  valorAnterior: number;
  /** O mês anterior inteiro, e em quantos dias houve recebimento nele. */
  mesAnteriorTotal: number;
  mesAnteriorDias: number;
  serie: DiaDaSerie[];
  formas: FormaDePagamento[];
}

export interface CidadeDoMes extends MesDoEscopo {
  /** `null` = «sem cidade»: carteiras sem setor que ninguém classificou. */
  cidadeId: string | null;
  nome: string | null;
}

export interface CarteiraDaCidade {
  cod: string;
  nome: string;
  valor: number;
  linhas: number;
  operadores: number;
  valorAnterior: number;
  estado: string;
  setorId: string | null;
  setorNome: string | null;
  cidadeId: string | null;
  regra: RegraDaCarteira | null;
}

export interface MesPorCidade {
  mes: string;
  mesAnterior: string;
  diaCorte: number;
  diasNoMes: number;
  temLote: boolean;
  temLoteAnterior: boolean;
  geral: MesDoEscopo;
  cidades: CidadeDoMes[];
  carteiras: CarteiraDaCidade[];
}

interface EscopoCru {
  valor: unknown; linhas: unknown; operadores: unknown; colchao: unknown;
  valor_anterior: unknown; mes_anterior_total: unknown; mes_anterior_dias: unknown;
  serie: { dia: unknown; valor: unknown; valor_anterior: unknown; dentro_do_corte: boolean }[];
  formas: { forma: string; valor: unknown; qtd: unknown }[];
}

interface MesCru {
  mes: string; mes_anterior: string; dia_corte: unknown; dias_no_mes: unknown;
  tem_lote: boolean; tem_lote_anterior: boolean;
  geral: EscopoCru;
  cidades: (EscopoCru & { cidade_id: string | null; nome: string | null })[];
  carteiras: {
    cod: string; nome: string; valor: unknown; linhas: unknown; operadores: unknown; valor_anterior: unknown;
    estado: string; setor_id: string | null; setor_nome: string | null; cidade_id: string | null; regra: unknown;
  }[];
}

function escopo(c: EscopoCru): MesDoEscopo {
  return {
    valor: n(c.valor),
    linhas: n(c.linhas),
    operadores: n(c.operadores),
    colchao: n(c.colchao),
    valorAnterior: n(c.valor_anterior),
    mesAnteriorTotal: n(c.mes_anterior_total),
    mesAnteriorDias: n(c.mes_anterior_dias),
    serie: (c.serie ?? []).map(d => ({
      dia: n(d.dia), valor: n(d.valor), valorAnterior: n(d.valor_anterior), dentroDoCorte: d.dentro_do_corte === true,
    })),
    // O mês anterior por forma não vem: a tela mostra o mês, não a variação.
    formas: (c.formas ?? []).map(f => ({ forma: f.forma, valor: n(f.valor), qtd: n(f.qtd), valorAnterior: 0 })),
  };
}

async function buscarMesNoBanco(empresaId: string, mes: string, diaCorte?: number | null): Promise<MesPorCidade> {
  const { data, error } = await rpcSemTipo<MesCru>('fn_mestre_diretoria_cidades', {
    p_empresa_id: empresaId, p_mes: mes, p_dia_corte: diaCorte ?? null,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('A visão por cidade não devolveu resultado.');
  return {
    mes: data.mes,
    mesAnterior: data.mes_anterior,
    diaCorte: n(data.dia_corte),
    diasNoMes: n(data.dias_no_mes),
    temLote: data.tem_lote === true,
    temLoteAnterior: data.tem_lote_anterior === true,
    geral: escopo(data.geral),
    cidades: (data.cidades ?? []).map(c => ({ ...escopo(c), cidadeId: c.cidade_id, nome: c.nome })),
    carteiras: (data.carteiras ?? []).map(c => ({
      cod: c.cod, nome: c.nome, valor: n(c.valor), linhas: n(c.linhas), operadores: n(c.operadores),
      valorAnterior: n(c.valor_anterior), estado: c.estado, setorId: c.setor_id, setorNome: c.setor_nome,
      cidadeId: c.cidade_id, regra: regraOuNula(c.regra),
    })),
  };
}

/** O mês por cidade. Guardado por alguns minutos, como o resto do 59 (`cache59.ts`). */
export function buscarMesPorCidade(empresaId: string, mes: string, diaCorte?: number | null): Promise<MesPorCidade> {
  return lerDo59(['cidades', empresaId, mes, diaCorte], () => buscarMesNoBanco(empresaId, mes, diaCorte));
}

export function espiarMesPorCidade(empresaId: string, mes: string, diaCorte?: number | null): MesPorCidade | undefined {
  return espiarDo59(['cidades', empresaId, mes, diaCorte]);
}

// ── O dia ───────────────────────────────────────────────────────────────────

/** `geral`, `sem_cidade` ou o id da cidade. */
export type EscopoDoDia = 'geral' | 'sem_cidade' | string;

export interface UnidadeDoDia {
  /** Setor, carteira sem setor, ou carteira que conta só no total. */
  tipo: 'setor' | 'sem_setor' | 'somente_geral';
  setorId: string | null;
  cod: string | null;
  nome: string;
  cidadeId: string | null;
  regra: RegraDaCarteira | null;
  valor: number;
  linhas: number;
  operadores: number;
  /** Média por dia com recebimento, no mês até o corte. */
  media: number;
  destaque: { nome: string; valor: number } | null;
}

export interface ResumoDoDia {
  mes: string;
  dia: number;
  escopo: EscopoDoDia;
  total: { valor: number; linhas: number; operadores: number; colchao: number };
  mesmoDiaAnterior: number;
  mediaDiaAnterior: number;
  formas: FormaDePagamento[];
  unidades: UnidadeDoDia[];
}

interface DiaCru {
  mes: string; dia: unknown; escopo: string;
  total: { valor: unknown; linhas: unknown; operadores: unknown; colchao: unknown };
  mesmo_dia_anterior: unknown; media_dia_anterior: unknown;
  formas: { forma: string; valor: unknown; qtd: unknown }[];
  unidades: {
    tipo: string; setor_id: string | null; cod: string | null; nome: string | null; cidade_id: string | null;
    regra: unknown; valor: unknown; linhas: unknown; operadores: unknown; media: unknown;
    destaque: { nome: string; valor: unknown } | null;
  }[];
}

const tipoDaUnidade = (t: string): UnidadeDoDia['tipo'] =>
  t === 'setor' || t === 'somente_geral' ? t : 'sem_setor';

async function buscarDiaNoBanco(
  empresaId: string, mes: string, dia: number, escopoDoDia: EscopoDoDia, diaCorte?: number | null,
): Promise<ResumoDoDia> {
  const { data, error } = await rpcSemTipo<DiaCru>('fn_mestre_diretoria_dia', {
    p_empresa_id: empresaId, p_mes: mes, p_dia: dia, p_escopo: escopoDoDia, p_dia_corte: diaCorte ?? null,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('O resumo do dia não devolveu resultado.');
  return {
    mes: data.mes,
    dia: n(data.dia),
    escopo: data.escopo,
    total: { valor: n(data.total?.valor), linhas: n(data.total?.linhas), operadores: n(data.total?.operadores), colchao: n(data.total?.colchao) },
    mesmoDiaAnterior: n(data.mesmo_dia_anterior),
    mediaDiaAnterior: n(data.media_dia_anterior),
    formas: (data.formas ?? []).map(f => ({ forma: f.forma, valor: n(f.valor), qtd: n(f.qtd), valorAnterior: 0 })),
    unidades: (data.unidades ?? []).map(u => ({
      tipo: tipoDaUnidade(u.tipo), setorId: u.setor_id, cod: u.cod, nome: u.nome ?? u.cod ?? '—',
      cidadeId: u.cidade_id, regra: regraOuNula(u.regra), valor: n(u.valor), linhas: n(u.linhas),
      operadores: n(u.operadores), media: n(u.media),
      destaque: u.destaque ? { nome: u.destaque.nome, valor: n(u.destaque.valor) } : null,
    })),
  };
}

export function buscarResumoDoDia(
  empresaId: string, mes: string, dia: number, escopoDoDia: EscopoDoDia, diaCorte?: number | null,
): Promise<ResumoDoDia> {
  return lerDo59(['dia', empresaId, mes, dia, escopoDoDia, diaCorte],
    () => buscarDiaNoBanco(empresaId, mes, dia, escopoDoDia, diaCorte));
}

export function espiarResumoDoDia(
  empresaId: string, mes: string, dia: number, escopoDoDia: EscopoDoDia, diaCorte?: number | null,
): ResumoDoDia | undefined {
  return espiarDo59(['dia', empresaId, mes, dia, escopoDoDia, diaCorte]);
}

// ── Classificar carteira sem setor ──────────────────────────────────────────

/**
 * Grava cidade e regra de uma carteira SEM setor. O banco confere a chave
 * `painel_diretoria_definir_carteira` e recusa carteira vinculada. Depois de
 * gravar, as leituras guardadas do 59 caem: o dinheiro mudou de cartão.
 */
export async function classificarCarteira(
  empresaId: string, cod: string, cidadeId: string | null, regra: RegraDaCarteira | null,
): Promise<void> {
  const { error } = await rpcSemTipo<null>('fn_mestre_carteira_classificar', {
    p_empresa_id: empresaId, p_cod: cod, p_cidade_id: cidadeId, p_regra: regra,
  });
  if (error) throw new Error(error.message);
  esquecerLeiturasDo59();
}
