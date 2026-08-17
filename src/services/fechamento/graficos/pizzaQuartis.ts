/**
 * pizzaQuartis.ts — quantos operadores em cada faixa de projeção.
 *
 * É o gráfico que a aba Quartis do sistema mostra, e é o que o líder aponta na
 * reunião: "metade do time está no 3º". Fatia cheia (pizza, não rosca) porque
 * aqui a leitura é de PROPORÇÃO entre faixas, não de total — o total é o
 * tamanho do time, que já está escrito ao lado.
 *
 * Quartil vazio aparece na legenda com zero, nunca como fatia invisível: saber
 * que ninguém alcançou o 1º quartil é justamente o dado que interessa.
 */

import { esc, pct } from '../formato';
import { COR_QUARTIL, COR_NEUTRA } from './paleta';

export interface FaixaPizza {
  quartil: number;
  /** % mínima de projeção da faixa — vai para a legenda. */
  minPct: number;
  quantidade: number;
}

const CX = 90, CY = 90, RAIO = 76;

export function svgPizzaQuartis(faixas: readonly FaixaPizza[]): string {
  const ordenadas = [...faixas].sort((a, b) => a.quartil - b.quartil);
  const total = ordenadas.reduce((s, f) => s + f.quantidade, 0);
  if (!total) return '';

  const cor = (q: number) => COR_QUARTIL[q] ?? COR_NEUTRA;
  const comGente = ordenadas.filter(f => f.quantidade > 0);

  let angulo = -Math.PI / 2;

  const setores = comGente.length === 1
    // Todos na mesma faixa: um `path` de volta completa teria início igual ao
    // fim e não desenharia nada. Círculo cheio.
    ? `<circle cx="${CX}" cy="${CY}" r="${RAIO}" fill="${cor(comGente[0].quartil)}">`
      + `<title>${comGente[0].quartil}º quartil: ${comGente[0].quantidade} operador(es) · 100%</title>`
      + `</circle>`
    : comGente.map(f => {
      const abertura = (f.quantidade / total) * Math.PI * 2;
      const x1 = CX + Math.cos(angulo) * RAIO;
      const y1 = CY + Math.sin(angulo) * RAIO;
      angulo += abertura;
      const x2 = CX + Math.cos(angulo) * RAIO;
      const y2 = CY + Math.sin(angulo) * RAIO;
      const maior = abertura > Math.PI ? 1 : 0;
      const proporcao = Math.round((f.quantidade / total) * 1000) / 10;
      return `<path d="M ${CX} ${CY} L ${x1.toFixed(2)} ${y1.toFixed(2)} `
        + `A ${RAIO} ${RAIO} 0 ${maior} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" `
        + `fill="${cor(f.quartil)}" stroke="var(--papel)" stroke-width="1.5">`
        + `<title>${f.quartil}º quartil: ${f.quantidade} operador(es) · ${esc(pct(proporcao))}</title>`
        + `</path>`;
    }).join('');

  // A legenda lista os QUATRO, inclusive os zerados.
  const legenda = ordenadas.map(f => {
    const proporcao = total > 0 ? Math.round((f.quantidade / total) * 1000) / 10 : 0;
    return `<li${f.quantidade === 0 ? ' class="zerado"' : ''}>
      <span class="ponto" style="background:${cor(f.quartil)}"></span>
      <span class="forma-nome">${f.quartil}º quartil <span class="fraco">· a partir de ${esc(pct(f.minPct))}</span></span>
      <span class="forma-val">${f.quantidade}</span>
      <span class="forma-pct">${esc(pct(proporcao))}</span>
    </li>`;
  }).join('');

  return `<div class="donut-bloco">
    <svg viewBox="0 0 180 180" class="donut" role="img" aria-label="Distribuição de operadores por quartil">
      ${setores}
    </svg>
    <ul class="legenda-formas">${legenda}</ul>
  </div>`;
}
