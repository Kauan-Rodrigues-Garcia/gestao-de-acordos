// src/pages/Analitico/recorte.ts
/**
 * O recorte de tempo do Analítico — a "lente".
 *
 * Antes eram dois controles em telas diferentes: o seletor de mês da aba
 * Analítico e o seletor de dia da aba Recebimento diário. São a mesma pergunta
 * com janelas diferentes, e separá-los obrigava a trocar de aba para mudar de
 * janela — o caminho que fez as duas telas desenharem a mesma lista duas vezes.
 *
 * O módulo é puro de propósito: a decisão "que janela é esta" precisa ter teste
 * sem montar React.
 */
import {
  deslocarMes, primeiroDiaDoMes, ultimoDiaDoMes, normalizarMes,
} from '@/lib/mesReferencia';

export type ModoRecorte = 'mes' | 'dia' | 'periodo';

export type Recorte =
  | { modo: 'mes';     mes: string }
  | { modo: 'dia';     dia: string }
  | { modo: 'periodo'; mes: string; inicio: string; fim: string };

/** 'yyyy-MM-dd' + delta dias, atravessando mês e ano. Meio-dia evita fuso. */
export function somarDias(iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** O mês ('yyyy-MM') em que a lente está, qualquer que seja o modo. */
export function mesDoRecorte(r: Recorte): string {
  return r.modo === 'dia' ? r.dia.slice(0, 7) : r.mes;
}

/** As duas pontas da janela, inclusivas, em 'yyyy-MM-dd'. */
export function intervaloDoRecorte(r: Recorte): { inicio: string; fim: string } {
  if (r.modo === 'dia')     return { inicio: r.dia, fim: r.dia };
  if (r.modo === 'periodo') return { inicio: r.inicio, fim: r.fim };
  return { inicio: primeiroDiaDoMes(r.mes), fim: ultimoDiaDoMes(r.mes) };
}

/**
 * Troca de modo preservando a janela.
 *
 * Ao ir para o dia, escolhe HOJE se hoje cai no mês em foco; senão o último dia
 * do mês. Cair em "dia 1 de um mês fechado" mostraria uma tela vazia e daria a
 * impressão de que a troca apagou os dados.
 */
export function trocarModo(r: Recorte, modo: ModoRecorte, hoje: string): Recorte {
  if (modo === r.modo) return r;
  const mes = mesDoRecorte(r);
  if (modo === 'mes') return { modo: 'mes', mes };
  if (modo === 'dia') {
    const dia = hoje.slice(0, 7) === mes ? hoje : ultimoDiaDoMes(mes);
    return { modo: 'dia', dia };
  }
  return { modo: 'periodo', mes, inicio: primeiroDiaDoMes(mes), fim: ultimoDiaDoMes(mes) };
}

/** Anda um passo para frente ou para trás, no que o modo entende por passo. */
export function deslocarRecorte(r: Recorte, delta: number): Recorte {
  if (r.modo === 'dia') return { modo: 'dia', dia: somarDias(r.dia, delta) };
  if (r.modo === 'mes') return { modo: 'mes', mes: deslocarMes(r.mes, delta) };
  return r;   // período tem duas pontas escolhidas à mão; não se desloca inteiro
}

/** O recorte vira query string, para o link ser compartilhável. */
export function queryDoRecorte(r: Recorte): Record<string, string> {
  if (r.modo === 'dia')     return { recorte: 'dia', dia: r.dia };
  if (r.modo === 'periodo') return { recorte: 'periodo', mes: r.mes, de: r.inicio, ate: r.fim };
  return { recorte: 'mes', mes: r.mes };
}

/**
 * Lê o recorte da URL. `null` = a URL não fala de recorte, e quem chama decide
 * o padrão.
 *
 * `?aba=diario` é o link antigo das notificações de importação do diário. Ele
 * continua existindo em notificações já enviadas, então continua funcionando:
 * vira o recorte de dia em hoje.
 */
export function recorteDaQuery(params: URLSearchParams, hoje: string): Recorte | null {
  if (params.get('aba') === 'diario' && !params.get('recorte')) {
    return { modo: 'dia', dia: params.get('dia') || hoje };
  }
  const modo = params.get('recorte');
  if (modo === 'dia')  return { modo: 'dia', dia: params.get('dia') || hoje };
  if (modo === 'mes')  return { modo: 'mes', mes: normalizarMes(params.get('mes')) };
  if (modo === 'periodo') {
    const mes = normalizarMes(params.get('mes'));
    return {
      modo: 'periodo',
      mes,
      inicio: params.get('de')  || primeiroDiaDoMes(mes),
      fim:    params.get('ate') || ultimoDiaDoMes(mes),
    };
  }
  return null;
}
