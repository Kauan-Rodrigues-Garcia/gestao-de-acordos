/**
 * barrasDiarias.ts — o recebimento dia a dia do mês, com a meta por cima.
 *
 * O mês INTEIRO entra, inclusive os dias zerados: é a régua do calendário que
 * dá sentido à barra. Um gráfico só com os dias que tiveram movimento esconde
 * exatamente o que o líder quer ver — os buracos.
 *
 * Fim de semana e feriado ficam marcados no eixo. Sem isso, uma sequência de
 * três dias vazios parece equipe parada quando foi feriadão.
 *
 * `viewBox` com `preserveAspectRatio` faz o gráfico acompanhar a largura sem
 * JavaScript — é o que mantém o relatório legível projetado e no celular.
 */

import { esc, brl, compacto } from '../formato';

export interface DiaBarra {
  /** 1..31. */
  dia: number;
  valor: number;
  qtd: number;
  /** Fim de semana ou feriado — marcado no eixo, mas continua contando. */
  naoUtil?: boolean;
}

export interface OpcoesBarrasDiarias {
  /** Linha tracejada de referência. `null` quando não há meta. */
  metaDiaria?: number | null;
  /** Destaca um dia (o de hoje, num mês em curso). */
  diaDestacado?: number | null;
  altura?: number;
}

const L = 46, R = 14, T = 16, B = 30;
const LARGURA_UTIL = 720;

export function svgBarrasDiarias(
  dias: readonly DiaBarra[],
  opcoes: OpcoesBarrasDiarias = {},
): string {
  if (!dias.length) return '';

  const alturaUtil = opcoes.altura ?? 190;
  const W = L + LARGURA_UTIL + R;
  const H = T + alturaUtil + B;
  const metaDiaria = opcoes.metaDiaria ?? null;

  /**
   * A escala acomoda a META, e não só o maior dia. Sem isso, uma meta diária
   * acima do melhor dia do mês desenharia a linha fora da área visível — e o
   * gráfico contaria a história errada: "todo dia bateu a meta".
   */
  const maxValor = Math.max(...dias.map(d => d.valor), metaDiaria ?? 0, 1);

  const passo = LARGURA_UTIL / dias.length;
  const larguraBarra = Math.max(passo * 0.62, 2);
  const y = (v: number) => T + alturaUtil - (v / maxValor) * alturaUtil;

  const grade = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const valor = maxValor * (1 - f);
    const yy = T + alturaUtil * f;
    return `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" `
      + `stroke="var(--borda)" stroke-width="1" opacity="0.6" />`
      + `<text x="${L - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-size="9.5" `
      + `fill="var(--fraco)">${esc(compacto(valor))}</text>`;
  }).join('');

  // Faixa de fundo dos dias não úteis — desenhada ANTES das barras para ficar
  // por baixo. É contexto, não dado.
  const faixasNaoUteis = dias.map((d, i) => {
    if (!d.naoUtil) return '';
    const x = L + i * passo;
    return `<rect x="${x.toFixed(1)}" y="${T}" width="${passo.toFixed(1)}" `
      + `height="${alturaUtil}" fill="var(--fraco)" opacity="0.07" />`;
  }).join('');

  const barras = dias.map((d, i) => {
    if (d.valor <= 0) return '';
    const x = L + i * passo + (passo - larguraBarra) / 2;
    // Piso de 1,5px: um dia com movimento pequeno precisa aparecer como
    // movimento, não como dia vazio.
    const altura = Math.max((d.valor / maxValor) * alturaUtil, 1.5);
    const destaque = opcoes.diaDestacado === d.dia;
    return `<rect x="${x.toFixed(1)}" y="${(T + alturaUtil - altura).toFixed(1)}" `
      + `width="${larguraBarra.toFixed(1)}" height="${altura.toFixed(1)}" rx="1.5" `
      + `fill="var(--acento)" opacity="${destaque ? '1' : '0.85'}"`
      + `${destaque ? ' stroke="var(--texto)" stroke-width="1"' : ''}>`
      + `<title>Dia ${d.dia}: ${esc(brl(d.valor))} · ${d.qtd} pagamento(s)</title></rect>`;
  }).join('');

  const rotulos = dias.map((d, i) => {
    if (d.dia !== 1 && d.dia % 5 !== 0) return '';
    const x = L + i * passo + passo / 2;
    return `<text x="${x.toFixed(1)}" y="${H - 12}" text-anchor="middle" `
      + `font-size="10.5" fill="var(--fraco)">${d.dia}</text>`;
  }).join('');

  const linhaMeta = metaDiaria && metaDiaria > 0
    ? `<line x1="${L}" y1="${y(metaDiaria).toFixed(1)}" x2="${W - R}" y2="${y(metaDiaria).toFixed(1)}" `
      + `stroke="${COR_LINHA_META}" stroke-width="1.5" stroke-dasharray="5 4" />`
      + `<text x="${W - R}" y="${Math.max(y(metaDiaria) - 5, T + 9).toFixed(1)}" text-anchor="end" `
      + `font-size="10" fill="${COR_LINHA_META}" font-weight="600">`
      + `meta/dia útil ${esc(brl(metaDiaria))}</text>`
    : '';

  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" `
    + `role="img" aria-label="Recebimento por dia do mês">`
    + `${faixasNaoUteis}${grade}${barras}${linhaMeta}${rotulos}</svg>`;
}

/** Vermelho da linha de meta — fixo, é referência e não faixa de desempenho. */
const COR_LINHA_META = '#ef4444';
