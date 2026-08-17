/**
 * destaques.ts — quem brilhou em cada dia, e as leituras que rendem comentário.
 *
 * As duas coisas dividem a mesma seção porque respondem a mesma pergunta com
 * granularidades diferentes: "o que valeu a pena notar neste mês?".
 */

import { esc, brl, num } from '../formato';
import { htmlTabela, htmlCabecalhoSecao, painel } from './componentes';
import type { DestaqueDiaFechamento, Curiosidade } from '../tipos';

export function secaoDestaques(
  destaques: readonly DestaqueDiaFechamento[],
  curiosidades: readonly Curiosidade[],
): string {
  if (!destaques.length && !curiosidades.length) return '';

  const blocoCuriosidades = curiosidades.length
    ? `<div class="divisor">Curiosidades do mês</div>
      <div class="curiosidades">${curiosidades.map(c => `
        <div class="curiosidade">
          <span class="titulo">${esc(c.titulo)}</span>
          <span class="destaque">${esc(c.destaque)}</span>
          <span class="texto">${esc(c.texto)}</span>
        </div>`).join('')}</div>`
    : '';

  const blocoDestaques = destaques.length
    ? `<div class="divisor">Destaque de cada dia</div>
      ${htmlTabela(
        '<th>Dia</th><th>Destaque</th><th class="n">Recebido</th><th class="n">Pagtos</th>',
        destaques.map(x => `
          <tr>
            <td>${esc(x.diaRotulo)}</td>
            <td><strong>${esc(x.nome)}</strong></td>
            <td class="n">${esc(brl(x.total))}</td>
            <td class="n">${esc(num(x.pagamentos))}</td>
          </tr>`).join(''),
      )}`
    : '';

  return painel(`${htmlCabecalhoSecao({
    titulo: 'Destaques e curiosidades',
    rotuloSlide: 'Destaques',
    ajuda: 'Leituras derivadas dos mesmos números das seções anteriores. '
      + 'Curiosidade sem base suficiente é omitida, nunca estimada.',
  })}${blocoCuriosidades}${blocoDestaques}`);
}
