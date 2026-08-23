/**
 * rhPercentual.ts — o «181%» do operador, sem inventar uma segunda conta.
 *
 * ## A regra: este arquivo NÃO calcula nada de novo
 *
 * O percentual de desempenho já tem dono no projeto: `calcularProjecao`, em
 * `src/lib/projecaoMetas.ts`. É ele que a aba Quartis usa, é ele que o painel
 * de metas do Dashboard usa, e foi criado exatamente porque a mesma matemática
 * escrita duas vezes produziu dois números para a mesma pergunta.
 *
 * Escrever aqui um `recebido / meta * 100` faria o RH pagar por um número que a
 * tela de Quartis não reconheceria — e a diferença só apareceria quando alguém
 * comparasse as duas telas, provavelmente depois do pagamento.
 *
 * Este arquivo faz três coisas, e nenhuma delas é aritmética de desempenho:
 *
 *   1. junta as peças que a conta exige (meta, recebido, dias úteis, quartis);
 *   2. chama `calcularProjecao`;
 *   3. devolve o resultado no formato que o lançamento congela.
 *
 * ## Mês fechado: o percentual é `recebido ÷ meta`
 *
 * Não por uma regra especial, e sim por consequência: num mês já encerrado,
 * `diasUteisDecorridos` devolve o mês inteiro, então `esperado` é a meta cheia
 * e `recebido ÷ esperado` vira `recebido ÷ meta`. A mesma fórmula responde
 * «estou no ritmo?» durante o mês e «bati a meta?» depois dele.
 *
 * ## Por que o mês de apuração não é o da competência
 *
 * A competência é o rótulo da folha (Setembro/2026); o desempenho conferido
 * nela é o do mês anterior — é o que o prazo de 02/09 do pedido implica. Quem
 * decide é `rh_fechamentos.mes_apuracao`; aqui só se recebe a data pronta.
 */

import { calcularProjecao } from '@/lib/projecaoMetas';
import {
  diasUteisDoMes, diasUteisDecorridos, QUARTIS_PADRAO,
} from '@/lib/diasUteis';
import { partesDoMes } from '@/lib/mesReferencia';
import type { MetasConfigMes, QuartilConfig } from '@/lib/supabase';

export interface EntradaPercentualRh {
  /** Mês apurado, `yyyy-MM`. */
  mesApuracao: string;
  /** Meta do operador no mês. `null` = sem meta configurada. */
  meta: number | null;
  /** Recebido do operador no mês, na MESMA base da meta. */
  recebido: number;
  /** Feriados e quartis do mês (`metas_config_mes`). `null` = padrões. */
  configMes: MetasConfigMes | null;
  /**
   * «Hoje» em `yyyy-MM-dd`, de São Paulo.
   *
   * Entra como parâmetro em vez de sair de `new Date()` aqui porque uma
   * competência de mês já encerrado não pode depender do relógio de quem abre
   * a tela — e porque teste com data fixa é a única forma de provar esta conta.
   */
  hojeISO: string;
  /**
   * Data em que a equipe começou (equipe de treinamento). `null` = mês cheio.
   *
   * Mesma correção que a aba Quartis aplica: cobrar o mês inteiro de quem
   * entrou no dia 15 faz a pessoa parecer pior do que foi.
   */
  inicioEquipeISO?: string | null;
}

export interface PercentualRh {
  /** `recebido ÷ esperado × 100`, arredondado. `null` quando não há meta. */
  percentual: number | null;
  /** A meta usada — o que vai para o snapshot. */
  meta: number | null;
  recebido: number;
  /** Quartil alcançado, quando há faixas configuradas. */
  quartil: QuartilConfig | null;
  diasUteis: number;
  diasDecorridos: number;
}

/**
 * O percentual do operador no mês apurado.
 *
 * Devolve `percentual: null` — e não zero — quando não há meta. São coisas
 * diferentes: «não bateu nada» e «não tinha meta para bater», e o RH precisa
 * saber qual dos dois está olhando antes de decidir um valor.
 */
export function calcularPercentualRh(e: EntradaPercentualRh): PercentualRh {
  const { ano, mes } = partesDoMes(e.mesApuracao);
  const feriados = e.configMes?.feriados ?? [];
  const quartis  = e.configMes?.quartis?.length ? e.configMes.quartis : QUARTIS_PADRAO;
  // `contar_dia_atual` é decisão do mês configurado; num mês já encerrado ela
  // não muda nada, porque todos os dias úteis já passaram de qualquer forma.
  const contarHoje = e.configMes?.contar_dia_atual === true;
  const inicio = e.inicioEquipeISO ?? undefined;

  const diasUteis = diasUteisDoMes(ano, mes, feriados, inicio);
  const decorridos = Math.max(
    diasUteisDecorridos(ano, mes, feriados, e.hojeISO, inicio, contarHoje), 1,
  );

  const proj = calcularProjecao({
    meta: e.meta, recebido: e.recebido,
    totalUteis: diasUteis, decorridos, quartis,
  });

  return {
    percentual: proj?.projecaoPct ?? null,
    meta: e.meta ?? null,
    recebido: e.recebido,
    quartil: proj?.quartil ?? null,
    diasUteis,
    diasDecorridos: decorridos,
  };
}

/** `181` → `"181%"`. `null` → `"—"`, que é diferente de `"0%"`. */
export function formatarPercentual(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  return `${Math.round(pct)}%`;
}

/**
 * Cor do percentual, na mesma escala que o resto do sistema já usa.
 *
 * As faixas espelham `corProjecao` de `lib/diasUteis.ts`; quem já lê o Analítico
 * reconhece o verde e o vermelho sem aprender uma legenda nova.
 */
export function corPercentual(pct: number | null | undefined): string {
  if (pct == null) return 'text-muted-foreground';
  if (pct >= 100) return 'text-emerald-500';
  if (pct >= 80)  return 'text-sky-500';
  if (pct >= 60)  return 'text-amber-500';
  return 'text-red-400';
}
