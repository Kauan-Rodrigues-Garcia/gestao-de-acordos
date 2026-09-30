/**
 * A barra das faixas de meta do cartão principal da tela mínima.
 *
 * A escala começa em ZERO e vai até a maior entre a última faixa e o recebido
 * (com uma folga de 4%). O preenchimento é a % do caminho — aparece desde o
 * primeiro real recebido.
 *
 * Correção de 30/09/2026: a versão anterior começava a escala um pouco abaixo da
 * 1ª faixa para espalhar os marcos; quem estava abaixo desse ponto via a barra
 * VAZIA até quase bater a 1ª meta. «Quero que apareça conforme a % que a pessoa
 * atingiu.»
 */

export interface EscalaRegua {
  /** Largura preenchida, em % da barra. */
  cheio: number;
  marcos: { ordem: number; pct: number }[];
}

export function escalaDaRegua(recebido: number, faixas: readonly number[]): EscalaRegua {
  if (faixas.length === 0) return { cheio: 0, marcos: [] };
  const ultima = faixas[faixas.length - 1];
  const fim = Math.max(ultima, recebido) * 1.04;
  const pct = (v: number) => (fim > 0 ? Math.min(100, Math.max(0, (v / fim) * 100)) : 0);
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
