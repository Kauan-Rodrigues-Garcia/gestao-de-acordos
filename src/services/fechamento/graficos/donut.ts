/**
 * donut.ts — a rosca das formas de pagamento.
 *
 * Rosca, e não pizza cheia, porque o miolo é onde o total mora: quem olha de
 * longe lê o número no centro e as proporções em volta, sem procurar legenda.
 *
 * Formas além da paleta viram uma fatia "outras" com o valor somado. A
 * alternativa — repetir cor — faria duas formas diferentes parecerem a mesma.
 */

import { esc, brl, pct, compacto } from '../formato';
import { CORES_FORMA, COR_OUTRAS } from './paleta';

export interface FatiaDonut {
  rotulo: string;
  valor: number;
  qtd: number;
}

const CX = 90, CY = 90, RAIO = 70, ESPESSURA = 26;
const RAIO_TRACO = RAIO - ESPESSURA / 2;

interface FatiaResolvida extends FatiaDonut { cor: string; pctValor: number }

/**
 * Ordena por valor, corta na paleta e agrega o resto em "outras".
 *
 * Exportado porque a decisão "o que vira 'outras'" precisa de teste próprio —
 * é onde um total pode se perder em silêncio.
 */
export function resolverFatias(
  fatias: readonly FatiaDonut[],
  total: number,
): FatiaResolvida[] {
  const ordenadas = [...fatias].filter(f => f.valor > 0).sort((a, b) => b.valor - a.valor);
  const proporcao = (v: number) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0);

  if (ordenadas.length <= CORES_FORMA.length) {
    return ordenadas.map((f, i) => ({
      ...f, cor: CORES_FORMA[i], pctValor: proporcao(f.valor),
    }));
  }

  // Sobra uma vaga para o "outras", senão a agregação empurraria uma forma real
  // para fora sem que ela apareça em lugar nenhum.
  const visiveis = ordenadas.slice(0, CORES_FORMA.length - 1);
  const resto = ordenadas.slice(CORES_FORMA.length - 1);
  const somaResto = resto.reduce((s, f) => s + f.valor, 0);
  const qtdResto = resto.reduce((s, f) => s + f.qtd, 0);

  return [
    ...visiveis.map((f, i) => ({ ...f, cor: CORES_FORMA[i], pctValor: proporcao(f.valor) })),
    {
      rotulo: `Outras (${resto.length})`,
      valor: somaResto,
      qtd: qtdResto,
      cor: COR_OUTRAS,
      pctValor: proporcao(somaResto),
    },
  ];
}

export function svgDonut(fatias: readonly FatiaDonut[], total: number): string {
  const resolvidas = resolverFatias(fatias, total);
  if (!resolvidas.length || total <= 0) return '';

  let angulo = -Math.PI / 2;

  const arcos = resolvidas.map(f => {
    const abertura = (f.valor / total) * Math.PI * 2;

    // Volta inteira não pode virar arco: início e fim coincidem e o `path`
    // desenharia nada. Uma forma única no mês é um círculo.
    if (abertura >= Math.PI * 2 - 0.0001) {
      return `<circle cx="${CX}" cy="${CY}" r="${RAIO_TRACO}" fill="none" `
        + `stroke="${f.cor}" stroke-width="${ESPESSURA}">`
        + `<title>${esc(f.rotulo)}: ${esc(brl(f.valor))} (100%)</title></circle>`;
    }
    if (abertura <= 0.0001) return '';

    const x1 = CX + Math.cos(angulo) * RAIO_TRACO;
    const y1 = CY + Math.sin(angulo) * RAIO_TRACO;
    angulo += abertura;
    const x2 = CX + Math.cos(angulo) * RAIO_TRACO;
    const y2 = CY + Math.sin(angulo) * RAIO_TRACO;
    const maior = abertura > Math.PI ? 1 : 0;

    return `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${RAIO_TRACO} ${RAIO_TRACO} `
      + `0 ${maior} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${f.cor}" `
      + `stroke-width="${ESPESSURA}">`
      + `<title>${esc(f.rotulo)}: ${esc(brl(f.valor))} (${esc(pct(f.pctValor))})</title></path>`;
  }).join('');

  const legenda = resolvidas.map(f => `
    <li>
      <span class="ponto" style="background:${f.cor}"></span>
      <span class="forma-nome">${esc(f.rotulo)}</span>
      <span class="forma-val">${esc(brl(f.valor))}</span>
      <span class="forma-pct">${esc(pct(f.pctValor))}</span>
    </li>`).join('');

  return `<div class="donut-bloco">
    <svg viewBox="0 0 180 180" class="donut" role="img" aria-label="Recebimento por forma de pagamento">
      ${arcos}
      <text x="90" y="86" text-anchor="middle" font-size="11" fill="var(--fraco)">total</text>
      <text x="90" y="104" text-anchor="middle" font-size="14" font-weight="700" fill="var(--texto)">${esc(compacto(total))}</text>
    </svg>
    <ul class="legenda-formas">${legenda}</ul>
  </div>`;
}
