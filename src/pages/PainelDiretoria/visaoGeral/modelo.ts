/**
 * modelo.ts — o que cada cartão da Visão geral mostra, montado sem React.
 *
 * As três fontes não se misturam:
 *
 *   - o MÊS da cidade (valor, pagamentos, série, formas) vem de
 *     `fn_mestre_diretoria_cidades`, pela cidade da CARTEIRA — por isso as
 *     cidades fecham o geral;
 *   - os SETORES da cidade vêm da grade da aba «Setores e equipes»
 *     (`buscarGradeDeSetores`), pela cidade do SETOR — o número de cada cartão
 *     de setor é exatamente o daquela aba;
 *   - a regra (Nosso produto / Cofen) é do setor, ou da carteira sem setor.
 *
 * A soma dos setores não é o valor da cidade, e não tem de ser: o colchão e o
 * que «conta só no total» não são de setor nenhum, e o Integral conta em dois.
 * A tela diz isso onde a diferença aparece.
 */
import { marcaDaCidade } from '@/lib/marca';
import type { GradeDeSetores, SetorDoPainel } from '@/services/mestre/diretoriaSetores.service';
import type {
  CarteiraDaCidade, CidadeDoMes, MesPorCidade, RegraDaCarteira, UnidadeDoDia,
} from '@/services/mestre/diretoriaCidades.service';

/** BookPlay (Birigui), PaguePlay (Marília) ou cidade sem marca. */
export type MarcaVisual = 'bp' | 'pp' | 'neutra';

export interface InfoDoSetor {
  id: string;
  nome: string;
  cidadeId: string | null;
  regra: RegraDaCarteira | null;
}

export interface SetorDaCidade {
  setorId: string;
  nome: string;
  valor: number;
  valorAnterior: number;
  temAnterior: boolean;
  operadores: number;
  linhas: number;
  regra: RegraDaCarteira;
}

export interface CidadeDaVisao {
  /** `cidadeId`, ou `sem_cidade`. É o escopo do resumo do dia. */
  chave: string;
  cidadeId: string | null;
  nome: string;
  marca: MarcaVisual;
  /** «BookPlay» / «PaguePlay», quando a cidade tem marca. */
  rotuloMarca: string | null;
  mes: CidadeDoMes;
  /** Fração do geral (0 a 1). */
  participacao: number;
  setores: SetorDaCidade[];
  /** Carteiras do 59 sem setor que contam nesta cidade (escolha do painel). */
  carteirasSemSetor: CarteiraDaCidade[];
  melhorSetor: SetorDaCidade | null;
  /** O bruto Cofen da cidade (setores e carteiras com a regra). `null` = nada Cofen. */
  cofenBruto: number | null;
}

export function variacaoPct(atual: number, anterior: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

function marcaVisual(nome: string | null): { marca: MarcaVisual; rotulo: string | null } {
  const m = marcaDaCidade(nome);
  if (!m) return { marca: 'neutra', rotulo: null };
  return { marca: m.nome === 'BookPlay' ? 'bp' : 'pp', rotulo: m.nome };
}

const regraDe = (r: RegraDaCarteira | null | undefined): RegraDaCarteira => (r === 'cofen' ? 'cofen' : 'nosso_produto');

function setorDaGrade(s: SetorDoPainel, info: InfoDoSetor | undefined): SetorDaCidade {
  return {
    setorId: s.setorId, nome: s.setorNome, valor: s.valor, valorAnterior: s.valorAnterior,
    temAnterior: s.temAnterior, operadores: s.operadores, linhas: s.linhas, regra: regraDe(info?.regra),
  };
}

/** As cidades com cartão — as que têm nome. «Sem cidade» vira o bloco de pendências. */
export function montarCidades(
  mes: MesPorCidade,
  grade: GradeDeSetores | null,
  setores: InfoDoSetor[],
): CidadeDaVisao[] {
  const info = new Map(setores.map(s => [s.id, s]));
  const total = mes.geral.valor;
  const cidades = mes.cidades.filter(c => c.cidadeId !== null);

  const lista = cidades.map((c): CidadeDaVisao => {
    const { marca, rotulo } = marcaVisual(c.nome);
    const setoresDaCidade = (grade?.setores ?? [])
      .filter(s => info.get(s.setorId)?.cidadeId === c.cidadeId)
      .map(s => setorDaGrade(s, info.get(s.setorId)))
      .sort((a, b) => b.valor - a.valor);
    const soltas = mes.carteiras
      .filter(k => !k.setorId && k.cidadeId === c.cidadeId)
      .sort((a, b) => b.valor - a.valor);
    const cofen = setoresDaCidade.filter(s => s.regra === 'cofen').reduce((a, s) => a + s.valor, 0)
      + soltas.filter(k => k.regra === 'cofen').reduce((a, k) => a + k.valor, 0);
    const temCofen = setoresDaCidade.some(s => s.regra === 'cofen') || soltas.some(k => k.regra === 'cofen');
    return {
      chave: c.cidadeId as string,
      cidadeId: c.cidadeId,
      nome: c.nome ?? 'Cidade',
      marca, rotuloMarca: rotulo,
      mes: c,
      participacao: total > 0 ? c.valor / total : 0,
      setores: setoresDaCidade,
      carteirasSemSetor: soltas,
      melhorSetor: setoresDaCidade[0] ?? null,
      cofenBruto: temCofen ? cofen : null,
    };
  });

  // BookPlay primeiro, PaguePlay depois, o resto por nome — a ordem não muda
  // de um mês para o outro.
  const peso = (m: MarcaVisual) => (m === 'bp' ? 0 : m === 'pp' ? 1 : 2);
  return lista.sort((a, b) => peso(a.marca) - peso(b.marca) || a.nome.localeCompare(b.nome));
}

/** O dinheiro sem cidade: carteiras sem setor que ninguém classificou ainda. */
export function semCidade(mes: MesPorCidade): { valor: number; carteiras: CarteiraDaCidade[] } {
  const carteiras = mes.carteiras.filter(k => !k.setorId && !k.cidadeId).sort((a, b) => b.valor - a.valor);
  return { valor: mes.cidades.find(c => c.cidadeId === null)?.valor ?? 0, carteiras };
}

// ── O dia ───────────────────────────────────────────────────────────────────

export interface DiaSeparado {
  /** Setores e carteiras de Nosso produto, do maior para o menor. */
  nossoProduto: UnidadeDoDia[];
  /** Carteiras sem setor (Nosso produto) — contam na cidade, não em setor. */
  semSetor: UnidadeDoDia[];
  /** O que conta só no total (Retenção e afins). */
  soNoTotal: UnidadeDoDia[];
  /** Tudo que é regra Cofen — outra carteira, outra estrutura. */
  cofen: UnidadeDoDia[];
}

export function separarDia(unidades: UnidadeDoDia[]): DiaSeparado {
  const ord = (a: UnidadeDoDia, b: UnidadeDoDia) => b.valor - a.valor;
  const cofen = unidades.filter(u => u.regra === 'cofen').sort(ord);
  const resto = unidades.filter(u => u.regra !== 'cofen');
  return {
    nossoProduto: resto.filter(u => u.tipo === 'setor').sort(ord),
    semSetor: resto.filter(u => u.tipo === 'sem_setor').sort(ord),
    soNoTotal: resto.filter(u => u.tipo === 'somente_geral').sort(ord),
    cofen,
  };
}

/** A divisão Cofen de um bruto: o H.O. fica, o resto é repasse 3:1. */
export function divisaoCofen(bruto: number, ho: number): { ho: number; coren: number; cofen: number } {
  const resto = 1 - ho;
  return { ho: bruto * ho, coren: bruto * resto * 0.75, cofen: bruto * resto * 0.25 };
}

/** Média diária do mês anterior (por dia com recebimento). */
export function mediaDiaria(total: number, dias: number): number {
  return dias > 0 ? total / dias : 0;
}

/** Sábado ou domingo, para o gráfico pintar o fim de semana mais claro. */
export function ehFimDeSemana(mes: string, dia: number): boolean {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1, dia).getDay();
  return d === 0 || d === 6;
}

const DIAS_DA_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** «Quinta-feira, 15 de outubro». */
export function rotuloDoDia(mes: string, dia: number): string {
  const [a, m] = mes.split('-').map(Number);
  const semana = DIAS_DA_SEMANA[new Date(a, m - 1, dia).getDay()];
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${dia} de ${MESES[m - 1]}`;
}

/** «setembro», do `yyyy-MM`. */
export function nomeDoMes(mes: string): string {
  const m = Number(mes.split('-')[1]);
  return MESES[m - 1] ?? mes;
}
