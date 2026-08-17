/**
 * tipos.ts — o formato do relatório de fechamento do mês.
 *
 * Um tipo só, consumido por dois lados que não se conhecem:
 *
 *   `fechamento.service.ts`  monta a partir do banco
 *   `fechamentoHtml.ts`      transforma em página
 *
 * A separação é o que permite testar o desenho do relatório sem Supabase e a
 * coleta sem DOM — e é o que impede o gerador de HTML de sair fazendo query
 * própria e produzir um número diferente do painel que a pessoa acabou de ver.
 */

import type { QuartilConfig } from '@/lib/supabase';
import type { ResultadoProjecao } from '@/lib/projecaoMetas';

/**
 * Quanto do mundo este relatório enxerga.
 *
 * A escolha NÃO é do usuário — sai do cargo, pela mesma função que o dashboard
 * usa (`veTodosOsSetores`). Um líder não escolhe baixar "a empresa inteira", e
 * um operador não escolhe baixar o setor: seria a mesma pergunta de sempre
 * ("quem eu enxergo?") respondida por um segundo caminho, que é como as telas
 * deste projeto já divergiram antes.
 *
 *   operador  → só ele
 *   setor     → o setor dele (líder, elite, gerência)
 *   diretoria → todos os setores, com o comparativo entre eles
 */
export type NivelFechamento = 'operador' | 'setor' | 'diretoria';

export interface AlvoFechamento {
  nivel: NivelFechamento;
  empresaNome: string;
  /** `yyyy-MM`. */
  mes: string;
  /** "Agosto 2026". */
  mesRotulo: string;
  setorNome: string | null;
  operadorNome: string | null;
  /** Quem clicou em baixar, e quando — o relatório vai circular fora do sistema. */
  geradoPor: string;
  geradoEm: string;
  /** O mês já estava fechado quando o relatório saiu? */
  mesFechado: boolean;
}

/** Uma fatia do total, por forma de pagamento. */
export interface FatiaForma {
  rotulo: string;
  bruto: number;
  ho: number;
  qtd: number;
  /** % sobre o total do escopo — pré-calculada, para o HTML não fazer conta. */
  pct: number;
}

export interface PontoDia {
  /** 1..31. */
  dia: number;
  bruto: number;
  ho: number;
  qtd: number;
}

/** O bloco "quanto entrou e como" de um escopo qualquer (pessoa, setor, empresa). */
export interface ResumoFechamento {
  rotulo: string;
  totalBruto: number;
  totalHO: number;
  qtdPagamentos: number;
  meta: number | null;
  /** `recebido ÷ meta × 100`, limitado. `0` quando não há meta. */
  pctMeta: number;
  /** `null` sem meta ou sem dias úteis — a tela precisa dizer coisas diferentes. */
  projecao: ResultadoProjecao | null;
  porForma: FatiaForma[];
  porDia: PontoDia[];
  /** O melhor dia do mês no escopo. `null` num mês sem movimento. */
  melhorDia: PontoDia | null;
  /** Classificação Direto/Extra. `null` quando o setor não usa a lógica. */
  vinculo: {
    direto: number;
    extra: number;
    naoTabulado: number;
    qtdDireto: number;
    qtdExtra: number;
    qtdNaoTabulado: number;
  } | null;
}

/** Uma linha da tabela de operadores — o "detalhamento do painel do líder". */
export interface LinhaOperadorFechamento {
  id: string;
  nome: string;
  usuario: string;
  setorNome: string | null;
  equipeNome: string | null;
  bruto: number;
  ho: number;
  qtd: number;
  meta: number | null;
  pctMeta: number;
  /** `null` sem meta — não é "0% de projeção", é "sem meta cadastrada". */
  projecaoPct: number | null;
  quartil: number | null;
  /** `recebido − esperado`. `null` sem meta. */
  diferenca: number | null;
  /**
   * Degraus adicionais de meta (`metas.metas_extras`), já ordenados.
   *
   * São degraus, não alvos concorrentes: `pctMeta` e `quartil` continuam
   * saindo da PRIMEIRA meta, como na tela.
   */
  metasExtras: number[];
  /** Quantos degraus (a meta principal incluída) foram superados. */
  metasBatidas: number;
  /** Recebimento por dia do mês, 1..31 — alimenta a sparkline individual. */
  porDia: number[];
  /** Formas de pagamento da pessoa. Vazio quando não houve movimento. */
  porForma: FatiaForma[];
}

/** Um operador dentro de uma faixa de quartil. */
export interface FaixaQuartilFechamento {
  faixa: QuartilConfig;
  operadores: LinhaOperadorFechamento[];
}

/** Uma linha do comparativo entre setores — só no nível diretoria. */
export interface LinhaSetorFechamento {
  id: string;
  nome: string;
  bruto: number;
  ho: number;
  qtd: number;
  meta: number | null;
  pctMeta: number;
  operadores: number;
  /** % do total da empresa que passou por este setor. */
  pctDaEmpresa: number;
}

/** "Destaque do dia": quem mais recebeu em cada dia do mês. */
export interface DestaqueDiaFechamento {
  dia: string;
  diaRotulo: string;
  nome: string;
  total: number;
  pagamentos: number;
}

// ── Pix Automático ───────────────────────────────────────────────────────────

/** Uma equipe na tabela de meta de Pix. */
export interface MetaPixEquipe {
  equipeId: string;
  nome: string;
  realizado: number;
  acordos: number;
  /** `null` = equipe sem meta cadastrada. Aparece assim mesmo, com o realizado. */
  meta: number | null;
  metaAcordos: number | null;
  pctValor: number;
  /** `null` sem meta — não é 0% de projeção. */
  projecao: number | null;
}

/** Uma pessoa no ranking de Pix. */
export interface LinhaPixOperador {
  id: string;
  nome: string;
  valor: number;
  acordos: number;
  comissao: number;
}

export interface BlocoPixFechamento {
  /** Valor total de Pix no escopo e no mês. */
  total: number;
  acordos: number;
  comissao: number;
  /** Percentual de comissão aplicado ao setor, em fração (0.25 = 25%). */
  pctComissao: number;
  /** Vazio no escopo de operador — ele não vê colega. */
  ranking: LinhaPixOperador[];
  /** Vazio no escopo de operador. */
  metasPorEquipe: MetaPixEquipe[];
  /** Consolidado do setor: soma das metas das equipes. `null` sem nenhuma. */
  consolidado: { realizado: number; meta: number | null; pctValor: number; projecao: number | null } | null;
  /** Regra de comissão dobrada, quando o setor a tiver configurada. */
  dobra: {
    requisito: number;
    alcancado: number;
    atingida: boolean;
    comissaoComDobra: number;
  } | null;
}

// ── Comparativo com o mês anterior ───────────────────────────────────────────

export interface ComparativoMes {
  /** `yyyy-MM` do mês comparado. */
  mesAnterior: string;
  mesAnteriorRotulo: string;
  /** `false` = não há base de comparação; os campos abaixo ficam zerados. */
  temBase: boolean;
  brutoAnterior: number;
  qtdAnterior: number;
  metaAnterior: number | null;
  /** Variação absoluta do recebido. */
  variacaoBruto: number;
  /** Variação percentual do recebido. `null` quando a base é zero. */
  variacaoBrutoPct: number | null;
  variacaoQtd: number;
  variacaoQtdPct: number | null;
  /** Posição de cada operador no mês anterior — base da curiosidade de subida. */
  posicaoAnteriorPorOperador: Record<string, number>;
}

// ── Curiosidades ─────────────────────────────────────────────────────────────

/** Uma leitura derivada do mês. Omitida quando falta base — nunca estimada. */
export interface Curiosidade {
  titulo: string;
  destaque: string;
  texto: string;
}

export interface DadosFechamento {
  alvo: AlvoFechamento;
  diasUteis: { total: number; decorridos: number };
  quartisConfig: QuartilConfig[];
  resumo: ResumoFechamento;
  /** Vazio no nível operador — ele não vê colega. */
  operadores: LinhaOperadorFechamento[];
  /** Ordenado por valor. No nível operador traz só a própria linha. */
  ranking: LinhaOperadorFechamento[];
  quartis: FaixaQuartilFechamento[];
  /** Só no nível diretoria. */
  setores: LinhaSetorFechamento[];
  destaques: DestaqueDiaFechamento[];

  /** `null` quando o escopo não teve Pix no mês — a seção some inteira. */
  pix: BlocoPixFechamento | null;
  /** `null` quando a coleta do mês anterior falhou ou não se aplica. */
  comparativo: ComparativoMes | null;
  /** Leituras derivadas. Vazio quando nenhuma tinha base suficiente. */
  curiosidades: Curiosidade[];
  /**
   * Quantos operadores ficaram sem página individual por causa do teto.
   *
   * Eles continuam nas tabelas, no ranking e nos quartis — o teto corta a
   * seção detalhada, nunca a pessoa.
   */
  operadoresSemPagina: number;
  /** Degraus extras de meta do ESCOPO (grupo), quando houver. */
  metasExtrasEscopo: number[];
  /**
   * O que o leitor precisa saber para não interpretar errado — cobertura
   * parcial de dado, mês ainda aberto, meta ausente. Um relatório que some com
   * a ressalva vira número redondo que ninguém consegue reconciliar depois.
   */
  avisos: string[];
}
