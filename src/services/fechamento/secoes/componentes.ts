/**
 * componentes.ts — as peças de interface que se repetem entre seções.
 *
 * Cartão, pílula de quartil e cabeçalho de seção aparecem em quase toda página
 * do relatório. Desenhá-los em cada arquivo produziria seis cartões
 * ligeiramente diferentes — e "ligeiramente diferente" é exatamente o que faz
 * uma apresentação parecer montada às pressas.
 */

import { esc, pct, brl } from '../formato';
import { COR_QUARTIL, COR_NEUTRA } from '../graficos/paleta';
import type { LinhaOperadorFechamento } from '../tipos';

export interface Cartao {
  rotulo: string;
  valor: string;
  apoio?: string | null;
  /** Cor do valor e da faixa lateral. Omitir usa a cor de texto padrão. */
  cor?: string | null;
}

export function htmlCartao(c: Cartao): string {
  const estilo = c.cor ? ` style="--cor-acento:${c.cor}"` : '';
  const corValor = c.cor ? ` style="color:${c.cor}"` : '';
  return `<div class="cartao"${estilo}>
    <span class="cartao-rotulo">${esc(c.rotulo)}</span>
    <strong class="cartao-valor"${corValor}>${esc(c.valor)}</strong>
    ${c.apoio ? `<span class="cartao-apoio">${esc(c.apoio)}</span>` : ''}
  </div>`;
}

/** Grade de cartões. Entrada `null` é descartada — card que não tem o que dizer não aparece. */
export function htmlCartoes(
  cartoes: ReadonlyArray<Cartao | null>,
  classe = '',
): string {
  const html = cartoes.filter((c): c is Cartao => c !== null).map(htmlCartao).join('');
  return html ? `<div class="cartoes${classe ? ` ${classe}` : ''}">${html}</div>` : '';
}

/** Pílula colorida do quartil. `null` vira travessão — sem meta não há quartil. */
export function htmlPilulaQuartil(quartil: number | null): string {
  if (quartil === null) return '<span class="fraco">—</span>';
  const cor = COR_QUARTIL[quartil] ?? COR_NEUTRA;
  return `<span class="pilula"><i style="background:${cor}"></i>${quartil}º</span>`;
}

/**
 * A maior meta que a pessoa bateu no mês.
 *
 * `degrau` 1 = 1ª meta, 2 = 2ª meta…; `0` = tem meta e não bateu nenhuma.
 * `null` = sem meta cadastrada — ausência de alvo, não "não bateu".
 *
 * A contagem é `metasBatidas`, que a coleta já calcula com a mesma régua da
 * planilha da gerência (`metaAtingida`). Aqui só se acha o VALOR daquele
 * degrau, para o relatório dizer "2ª meta · R$ 150 mil" e não só um número.
 */
export interface MetaBatida {
  degrau: number;
  /** Valor do degrau batido. `null` quando não bateu nenhum. */
  valor: number | null;
  /** Quantos degraus o mês tinha, a meta principal incluída. */
  total: number;
}

export function metaBatidaDe(
  o: Pick<LinhaOperadorFechamento, 'meta' | 'metasExtras' | 'metasBatidas'>,
): MetaBatida | null {
  if (o.meta === null || o.meta <= 0) return null;
  const degraus = [o.meta, ...o.metasExtras].filter(v => v > 0).sort((a, b) => a - b);
  const degrau = Math.min(Math.max(o.metasBatidas, 0), degraus.length);
  return { degrau, valor: degrau > 0 ? degraus[degrau - 1] : null, total: degraus.length };
}

/** "2ª meta", ou "Nenhuma" — o rótulo curto, para tabela e legenda. */
export function rotuloMetaBatida(m: MetaBatida | null): string {
  if (m === null) return 'Sem meta';
  return m.degrau > 0 ? `${m.degrau}ª meta` : 'Nenhuma';
}

/**
 * Selo da meta batida: discreto, com o valor do degrau embaixo.
 *
 * Sem meta vira travessão, como as outras colunas que dependem dela.
 */
export function htmlMetaBatida(m: MetaBatida | null): string {
  if (m === null) return '<span class="fraco">—</span>';
  if (m.degrau === 0) return '<span class="meta-batida nenhuma">Nenhuma</span>';
  const apoio = m.total > 1 ? `${brl(m.valor as number)} · de ${m.total}` : brl(m.valor as number);
  return `<span class="meta-batida">${esc(rotuloMetaBatida(m))}</span>`
    + `<span class="sub">${esc(apoio)}</span>`;
}

/** Percentual colorido, ou travessão quando não há meta. */
export function htmlPct(valor: number | null, cor: string): string {
  if (valor === null) return '<span class="fraco">—</span>';
  return `<span style="color:${cor};font-weight:700">${esc(pct(valor))}</span>`;
}

/** Cabeçalho de seção: título, subtítulo de ajuda e o rótulo do modo apresentação. */
export function htmlCabecalhoSecao(params: {
  titulo: string;
  ajuda?: string;
  /** Aparece só no modo apresentação, acima do título. */
  rotuloSlide?: string;
  /** Conteúdo alinhado à direita do título. */
  aoLado?: string;
}): string {
  return `${params.rotuloSlide ? `<div class="slide-titulo">${esc(params.rotuloSlide)}</div>` : ''}
    <div class="painel-titulo">
      <h3>${esc(params.titulo)}</h3>
      ${params.aoLado ?? ''}
    </div>
    ${params.ajuda ? `<p class="ajuda">${esc(params.ajuda)}</p>` : ''}`;
}

/** Envelope de painel — a caixa branca com sombra. */
export function painel(conteudo: string): string {
  return `<section class="painel">${conteudo}</section>`;
}

/** Tabela com rolagem horizontal própria, para não empurrar a página. */
export function htmlTabela(cabecalho: string, corpo: string, classeExtra = ''): string {
  return `<div class="rolagem"><table class="grade${classeExtra ? ` ${classeExtra}` : ''}">
    <thead><tr>${cabecalho}</tr></thead>
    <tbody>${corpo}</tbody>
  </table></div>`;
}

export function htmlVazio(mensagem: string): string {
  return `<p class="vazio">${esc(mensagem)}</p>`;
}
