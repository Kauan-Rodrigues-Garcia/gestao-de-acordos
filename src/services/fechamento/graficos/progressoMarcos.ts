/**
 * progressoMarcos.ts — a barra de progresso da meta, com os degraus em cima.
 *
 * As metas em cascata (`metas.meta_valor` + `metas_extras`) são degraus, não
 * alvos concorrentes: o percentual e o quartil continuam saindo da PRIMEIRA
 * meta, como na tela. Os marcos existem para o operador ver o próximo degrau
 * sem precisar de outra barra.
 *
 * Realizado acima do último marco preenche a barra por completo e informa o
 * percentual em texto. Deixar a barra transbordar o contorno é o tipo de
 * detalhe que faz o relatório inteiro parecer amador na projeção.
 */

import { esc, brl, pct as fmtPct, compacto } from '../formato';
import { corDaProjecao, COR_QUARTIL } from './paleta';

export interface Marco {
  /** Valor do degrau. */
  valor: number;
  /** Rótulo curto, tipo "2ª meta". */
  rotulo: string;
}

export interface OpcoesProgresso {
  /** Degraus adicionais, além da meta principal. Vazio = barra simples. */
  marcos?: readonly Marco[];
  /** Mostra a legenda de degraus abaixo da barra. */
  mostrarLegenda?: boolean;
}

export interface ResultadoProgresso {
  html: string;
  /** Quantos degraus (meta principal incluída) já foram superados. */
  batidos: number;
  /** O próximo degrau ainda não superado, se houver. */
  proximo: Marco | null;
}

/**
 * A barra e a contagem de degraus batidos.
 *
 * Devolve os números junto com o HTML porque quem chama precisa dizer, em
 * texto, "2 de 3 metas batidas, faltam R$ X" — e recalcular isso do lado de
 * fora seria a mesma conta escrita duas vezes.
 */
export function barraProgressoMarcos(params: {
  realizado: number;
  meta: number;
  opcoes?: OpcoesProgresso;
}): ResultadoProgresso {
  const { realizado, meta } = params;
  const opcoes = params.opcoes ?? {};

  if (!meta || meta <= 0) {
    return { html: '', batidos: 0, proximo: null };
  }

  const degraus: Marco[] = [
    { valor: meta, rotulo: '1ª meta' },
    ...(opcoes.marcos ?? []),
  ].filter(m => m.valor > 0).sort((a, b) => a.valor - b.valor);

  const teto = degraus[degraus.length - 1].valor;
  const pctDaMeta = Math.round((realizado / meta) * 1000) / 10;
  const cor = corDaProjecao(pctDaMeta);

  // A barra é desenhada contra o ÚLTIMO degrau, para os marcos ficarem em
  // posições proporcionais. O percentual mostrado continua sendo contra a
  // primeira meta — são coisas diferentes, e misturá-las foi o que motivou
  // este comentário.
  const preenchido = Math.min((realizado / teto) * 100, 100);
  const batidos = degraus.filter(m => realizado >= m.valor).length;
  const proximo = degraus.find(m => realizado < m.valor) ?? null;

  const marcasHtml = degraus.length > 1
    ? degraus.map(m => {
      const x = Math.min((m.valor / teto) * 100, 100);
      const batido = realizado >= m.valor;
      return `<i class="marco${batido ? ' batido' : ''}" style="left:${x.toFixed(1)}%" `
        + `title="${esc(m.rotulo)}: ${esc(brl(m.valor))}"></i>`;
    }).join('')
    : '';

  const legenda = opcoes.mostrarLegenda && degraus.length > 1
    ? `<ul class="marcos-legenda">${degraus.map(m => {
      const batido = realizado >= m.valor;
      return `<li class="${batido ? 'batido' : ''}">`
        + `<span class="marco-ponto" style="background:${batido ? COR_QUARTIL[1] : 'var(--borda)'}"></span>`
        + `${esc(m.rotulo)} · ${esc(compacto(m.valor))}`
        + `${batido ? ' ✓' : ''}</li>`;
    }).join('')}</ul>`
    : '';

  const html = `<div class="progresso">
    <div class="barra${degraus.length > 1 ? ' com-marcos' : ''}">
      <div class="barra-fill" style="width:${preenchido.toFixed(1)}%;background:${cor}"></div>
      ${marcasHtml}
    </div>
    <div class="progresso-legenda">
      <span>${esc(brl(realizado))} de ${esc(brl(meta))}</span>
      <span style="color:${cor};font-weight:700">${esc(fmtPct(pctDaMeta))}</span>
    </div>
    ${legenda}
  </div>`;

  return { html, batidos, proximo };
}
