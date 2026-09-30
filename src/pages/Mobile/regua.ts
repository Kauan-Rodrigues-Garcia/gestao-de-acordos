/**
 * A régua das faixas de meta do cartão principal da tela mínima.
 *
 * Com a escala começando em zero, faixas de 34, 37, 40 e 43 mil ficariam
 * amontoadas no último quinto da barra. A escala começa um pouco abaixo da 1ª
 * faixa e termina um pouco acima da maior entre a última faixa e o recebido:
 * cada degrau ganha espaço para ser lido. O cheio é travado entre 0 e 100.
 */

export interface EscalaRegua {
  /** Largura preenchida, em % da barra. */
  cheio: number;
  marcos: { ordem: number; pct: number }[];
}

export function escalaDaRegua(recebido: number, faixas: readonly number[]): EscalaRegua {
  if (faixas.length === 0) return { cheio: 0, marcos: [] };
  const primeira = faixas[0];
  const ultima = faixas[faixas.length - 1];
  const inicio = Math.max(0, primeira - Math.max((ultima - primeira) * 0.4, primeira * 0.1));
  const fim = Math.max(ultima, recebido) * 1.06;
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - inicio) / (fim - inicio)) * 100));
  return {
    cheio: recebido <= 0 ? 0 : pct(recebido),
    marcos: faixas.map((v, i) => ({ ordem: i + 1, pct: pct(v) })),
  };
}

/** «Hoje», «Ontem» ou «dd/MM». Datas `yyyy-MM-dd`, sem fuso (são datas do ERP). */
export function rotuloDoDia(data: string, hoje: string): string {
  if (data === hoje) return 'Hoje';
  const [a, m, d] = hoje.split('-').map(Number);
  const ontem = new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
  if (data === ontem) return 'Ontem';
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}
