/**
 * As contas dos MiniApps do CreatorsLab — funções puras, sem React.
 *
 * Moravam dentro de `components/MiniApps.tsx`. Um arquivo de componente que
 * exporta funções perde o Fast Refresh inteiro, e o teste nunca precisou do
 * componente para alcançá-las.
 */

/**
 * Interpreta dinheiro digitado em português.
 *
 * O usuário escreve "1.234,56", "1234,56", "1234.56" ou "R$ 1.234,56" — e as
 * quatro formas significam a mesma coisa. A regra: se houver vírgula, ela é o
 * separador decimal e os pontos são de milhar; sem vírgula, o ponto decide.
 */
export function lerDinheiro(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,-]/g, '').trim();
  if (!limpo) return null;

  const temVirgula = limpo.includes(',');
  const normalizado = temVirgula
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

export function formatarBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface ResultadoDesconto {
  desconto: number;
  final: number;
  erro: string | null;
}

/**
 * Desconto percentual sobre um valor.
 *
 *   desconto  = valor × percentual / 100
 *   valorFinal = valor − desconto
 *
 * Recusa valor negativo e percentual fora de 0–100: um "desconto de 150%" só
 * pode ser erro de digitação, e devolver valor negativo seria pior que avisar.
 */
export function calcularDesconto(valor: number | null, percentual: number | null): ResultadoDesconto {
  if (valor === null || percentual === null) {
    return { desconto: 0, final: 0, erro: 'Preencha os dois campos.' };
  }
  if (valor < 0) return { desconto: 0, final: 0, erro: 'O valor não pode ser negativo.' };
  if (percentual < 0 || percentual > 100) {
    return { desconto: 0, final: 0, erro: 'O desconto precisa ficar entre 0% e 100%.' };
  }
  const desconto = Math.round(valor * percentual) / 100;
  return { desconto, final: Math.round((valor - desconto) * 100) / 100, erro: null };
}

/**
 * Dias úteis entre duas datas, inclusive as pontas.
 *
 * Conta só de segunda a sexta — feriado fica de fora de propósito, porque a
 * tabela de feriados do Gestão é por empresa e por mês, e não caberia num
 * brinquedo. É a mesma simplificação que o prazo do Pix usa lá.
 */
export function diasUteisEntre(inicio: string, fim: string): number | null {
  if (!inicio || !fim) return null;
  const a = new Date(`${inicio}T12:00:00`);
  const b = new Date(`${fim}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  if (b < a) return null;

  let total = 0;
  const cursor = new Date(a);
  while (cursor <= b) {
    const dia = cursor.getDay();
    if (dia !== 0 && dia !== 6) total++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}
