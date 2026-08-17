/**
 * sparkline.ts — o ritmo de uma pessoa no mês, em uma linha.
 *
 * A página individual não comporta um gráfico cheio por pessoa: com trinta
 * páginas, seriam trinta gráficos de 200px de altura. A sparkline responde a
 * mesma pergunta ("entrou espalhado ou concentrado?") ocupando o espaço de uma
 * linha de texto.
 *
 * Sem eixo e sem grade de propósito: a leitura é de FORMA, não de valor. O
 * valor exato está no cartão ao lado.
 */

import { esc, brl } from '../formato';

const W = 240, H = 40, PAD = 3;

export function svgSparkline(
  valores: readonly number[],
  opcoes: { cor?: string; rotulo?: string } = {},
): string {
  if (valores.length < 2) return '';

  const max = Math.max(...valores, 1);
  const passo = (W - PAD * 2) / (valores.length - 1);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const cor = opcoes.cor ?? 'var(--acento)';

  const pontos = valores.map((v, i) => `${(PAD + i * passo).toFixed(1)},${y(v).toFixed(1)}`);

  // Área sob a curva: dá peso visual a uma linha que, sozinha, sumiria ao lado
  // de um cartão com número grande.
  const area = `M ${PAD},${H - PAD} L ${pontos.join(' L ')} L ${(W - PAD).toFixed(1)},${H - PAD} Z`;

  const pico = valores.indexOf(max);
  const marcaPico = max > 0
    ? `<circle cx="${(PAD + pico * passo).toFixed(1)}" cy="${y(max).toFixed(1)}" r="2.5" fill="${cor}" />`
    : '';

  return `<svg class="sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" `
    + `role="img" aria-label="${esc(opcoes.rotulo ?? 'Ritmo diário no mês')}">`
    + `<path d="${area}" fill="${cor}" opacity="0.15" />`
    + `<polyline points="${pontos.join(' ')}" fill="none" stroke="${cor}" stroke-width="1.6" `
    + `stroke-linejoin="round" stroke-linecap="round" />`
    + marcaPico
    + `<title>Pico: ${esc(brl(max))}</title>`
    + `</svg>`;
}
