export type Modalidade = 'pagamento' | 'conciliacao';
export type Valores = { total: number; coren: number; cofen: number; pp: number };

/** Todos os valores monetários são inteiros em centavos, inclusive na RPC. */
export interface Pagamento extends Valores {
  id_baixa: string;
  data: string;
  data_pagamento: string;
  uf: string;
  acordo: string;
  parcela: string;
  forma: string;
  ia: string;
}

export interface RelatorioLido {
  linhas: Pagamento[];
  totais: Valores;
  duplicadas: number;
  rodapeConferido: boolean;
  camposConferidos: (keyof Valores)[];
  inicio: string;
  fim: string;
  modalidade: Modalidade | null;
}

export interface ResumoSalvo {
  hoje: string;
  primeiraImportacaoPendente: boolean;
  quantidade: number;
  grupos: (Valores & { data: string; data_pagamento: string; uf: string; forma: string; ia: string })[];
  dias: { data: string; importado_em: string; completo: boolean; quantidade: number }[];
  ultimaImportacao: string | null;
}

export const zerarValores = (): Valores => ({ total: 0, coren: 0, cofen: 0, pp: 0 });
export const CAMPOS_VALOR = ['total', 'coren', 'cofen', 'pp'] as const;

/** Não arredonda valores ambíguos nem converte células inválidas em zero. */
export function centavos(valor: unknown): number {
  if (typeof valor === 'number') {
    const n = Math.round(valor * 100);
    if (!Number.isFinite(valor) || !Number.isSafeInteger(n) || Math.abs(valor * 100 - n) > 0.00001) {
      throw new Error('Valor numérico inválido ou com mais de duas casas decimais.');
    }
    return n;
  }
  let s = String(valor ?? '').trim().replace(/^R\$\s*/, '');
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  if (!/^-?\d+(?:[,.]\d{1,2})?$/.test(s)) throw new Error(`Valor monetário inválido: "${s}".`);
  const negativo = s.startsWith('-');
  const [inteiro, decimal = ''] = s.replace('-', '').split(/[,.]/);
  const n = Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(n)) throw new Error('Valor excede o limite de precisão.');
  return negativo ? -n : n;
}

export function somarValores(destino: Valores, origem: Valores) {
  for (const k of CAMPOS_VALOR) {
    destino[k] += origem[k];
    if (!Number.isSafeInteger(destino[k])) throw new Error('Soma excede o limite de precisão.');
  }
}

export function diaAnterior(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function validarPeriodo(inicio: string, fim: string, hoje: string, primeira: boolean) {
  if (!inicio || !fim || inicio > fim || fim > hoje) throw new Error('Confira o período: início até fim, sem datas futuras.');
  // Carga histórica não libera a atualização diária. Uma importação que inclua
  // hoje precisa cobrir ontem também até a primeira conclusão bem-sucedida.
  if (primeira && fim === hoje && inicio > diaAnterior(hoje)) {
    throw new Error('A primeira importação do dia deve incluir ontem e hoje.');
  }
}

export const formatarCentavos = (n: number) => (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
