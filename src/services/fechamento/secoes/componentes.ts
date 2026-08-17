/**
 * componentes.ts — as peças de interface que se repetem entre seções.
 *
 * Cartão, pílula de quartil e cabeçalho de seção aparecem em quase toda página
 * do relatório. Desenhá-los em cada arquivo produziria seis cartões
 * ligeiramente diferentes — e "ligeiramente diferente" é exatamente o que faz
 * uma apresentação parecer montada às pressas.
 */

import { esc, pct } from '../formato';
import { COR_QUARTIL, COR_NEUTRA } from '../graficos/paleta';

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
  return `<span class="pilula" style="background:${cor}22;color:${cor}">${quartil}º</span>`;
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
export function htmlTabela(cabecalho: string, corpo: string): string {
  return `<div class="rolagem"><table class="grade">
    <thead><tr>${cabecalho}</tr></thead>
    <tbody>${corpo}</tbody>
  </table></div>`;
}

export function htmlVazio(mensagem: string): string {
  return `<p class="vazio">${esc(mensagem)}</p>`;
}
