/**
 * vendasCalendario.ts — o dia útil do Comercial (02/10/2026).
 *
 * Até aqui o Comercial contava segunda a sexta, sem feriado, em toda tela. O
 * pedido «em metas tem que colocar dias úteis também ser configurado» trouxe o
 * calendário do mês (`vendas_calendario_mes`): os feriados, que não contam, e
 * se o sábado conta.
 *
 * A regra existe em dois lugares, e os dois se citam:
 *   SQL  `fn_vendas_dia_util` (migration 20261002170000)
 *   TS   `ehDiaUtilComercial`, aqui
 * O placar devolve os dias úteis e os abatidos por ausência com a regra do
 * banco; a tela divide a meta com esta. Divergir faria numerador e denominador
 * falarem de meses diferentes.
 *
 * As datas são texto 'yyyy-MM-dd' e nunca passam por `new Date(iso)` sozinho —
 * meia-noite UTC é 21h do dia anterior em São Paulo.
 */
import { diasNoMes } from '@/lib/mesReferencia';

export interface CalendarioDoMes {
  /** Dias que NÃO contam, mesmo caindo em dia de trabalho ('yyyy-MM-dd'). */
  feriados: string[];
  /** Sábado conta como dia útil inteiro. */
  sabadoUtil: boolean;
}

/** Mês sem configuração: segunda a sexta, sem feriado — o que valia antes. */
export const CALENDARIO_PADRAO: CalendarioDoMes = { feriados: [], sabadoUtil: false };

function diaDaSemana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Espelho de `fn_vendas_dia_util`. */
export function ehDiaUtilComercial(iso: string, cal: CalendarioDoMes = CALENDARIO_PADRAO): boolean {
  const dow = diaDaSemana(iso);
  if (dow === 0) return false;
  if (dow === 6 && !cal.sabadoUtil) return false;
  return !cal.feriados.includes(iso);
}

/** Os dias úteis do mês 'yyyy-MM' (ou ano + mês), em ISO. */
export function listarDiasUteisComercial(
  ano: number, mes: number, cal: CalendarioDoMes = CALENDARIO_PADRAO,
): string[] {
  const chave = `${ano}-${String(mes).padStart(2, '0')}`;
  const total = diasNoMes(chave);
  const dias: string[] = [];
  for (let d = 1; d <= total; d++) {
    const iso = `${chave}-${String(d).padStart(2, '0')}`;
    if (ehDiaUtilComercial(iso, cal)) dias.push(iso);
  }
  return dias;
}

export function diasUteisComercial(ano: number, mes: number, cal?: CalendarioDoMes): number {
  return listarDiasUteisComercial(ano, mes, cal).length;
}

/** Dias úteis até `ateISO`, inclusive — o mesmo corte de `diasUteisDecorridos`. */
export function diasUteisDecorridosComercial(
  ano: number, mes: number, ateISO: string, cal?: CalendarioDoMes,
): number {
  return listarDiasUteisComercial(ano, mes, cal).filter(d => d <= ateISO).length;
}

/** Dias úteis de `desdeISO` em diante, no mês — base da meta proporcional. */
export function diasUteisDesdeComercial(
  ano: number, mes: number, desdeISO: string, cal?: CalendarioDoMes,
): number {
  return listarDiasUteisComercial(ano, mes, cal).filter(d => d >= desdeISO).length;
}

/**
 * A meta cheia reduzida aos dias que a pessoa trabalha.
 *
 * Arredonda para CIMA na quantidade (meia venda não existe, e arredondar para
 * baixo daria a meta de presente) e em centavos no valor.
 */
export function metaProporcional(
  cheia: { quantidade: number; valor: number },
  diasDaPessoa: number,
  diasDoMes: number,
): { quantidade: number; valor: number } {
  if (diasDoMes <= 0 || diasDaPessoa >= diasDoMes) return { ...cheia };
  const fator = Math.max(0, diasDaPessoa) / diasDoMes;
  return {
    quantidade: Math.ceil(cheia.quantidade * fator),
    valor: Math.round(cheia.valor * fator * 100) / 100,
  };
}
