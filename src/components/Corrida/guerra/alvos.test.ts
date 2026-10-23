import { describe, expect, it } from 'vitest';
import { alvos, ATRIBUTO_TEXTO, blocoDe, criarEfeitos, nomeDe } from './alvos.js';

/** Um relógio de mentira: o teste decide quando os efeitos vencem. */
function relogio() {
  const fila: Array<{ fn: () => void; em: number }> = []; let agora = 0;
  return { agendar: (fn: () => void, ms: number) => { fila.push({ fn, em: agora + ms }); }, andar(ms: number) { agora += ms; for (const t of fila.splice(0).sort((a, b) => a.em - b.em)) if (t.em <= agora) t.fn(); else fila.push(t); } };
}
function pagina() {
  document.body.innerHTML = `<div id="app">
    <a><span data-alvo-feitico="aba">Acordos</span></a>
    <div data-bloco-feitico data-nome-feitico="Recebido"><b data-alvo-feitico="valor">R$ 1.234,50</b></div>
    <table><tbody><tr data-alvo-feitico="linha"><td>1</td></tr><tr data-alvo-feitico="linha"><td>2</td></tr></tbody></table>
  </div>`;
  // o jsdom não mede nada: diz que tudo está na tela
  for (const el of document.querySelectorAll('*')) (el as HTMLElement).getClientRects = () => [{}] as unknown as DOMRectList;
  return document.getElementById('app')!;
}

describe('os alvos do Gestão', () => {
  it('acha valores, abas e linhas pelo atributo', () => {
    const a = alvos(pagina());
    expect(a.valores()).toHaveLength(1); expect(a.abas()).toHaveLength(1); expect(a.linhas()).toHaveLength(2);
    const v = a.valores()[0];
    expect(blocoDe(v).dataset.nomeFeitico).toBe('Recebido');
    expect(nomeDe(v)).toBe('Recebido');
    expect(nomeDe(a.abas()[0])).toBe('Acordos');
  });

  it('o efeito só põe coisa por cima e volta sozinho: o texto do React nunca muda', () => {
    const app = pagina(), r = relogio(), ef = criarEfeitos(r.agendar), v = alvos(app).valores()[0];
    ef.aplicar(v, { classes: ['gx-fome'], texto: 'R$ 0,00', vars: { '--gx-rot': '9deg' } }, 1000);
    expect(v.textContent).toBe('R$ 1.234,50');
    expect(v.getAttribute(ATRIBUTO_TEXTO)).toBe('R$ 0,00');
    expect(v.classList.contains('gx-fome')).toBe(true);
    expect(ef.tem(v, 'gx-fome')).toBe(true);
    ef.trocarTexto(v, 'R$ 10,00'); expect(v.getAttribute(ATRIBUTO_TEXTO)).toBe('R$ 10,00');
    r.andar(1000);
    expect(v.classList.contains('gx-fome')).toBe(false);
    expect(v.hasAttribute(ATRIBUTO_TEXTO)).toBe(false);
    expect(v.style.getPropertyValue('--gx-rot')).toBe('');
    expect(v.textContent).toBe('R$ 1.234,50');
  });

  it('reaplicar estica o prazo; desfazerTudo limpa a página inteira', () => {
    const app = pagina(), r = relogio(), ef = criarEfeitos(r.agendar), [l1, l2] = alvos(app).linhas();
    ef.aplicar(l1, { classes: ['gx-peste'] }, 1000);
    r.andar(600); ef.aplicar(l1, { classes: ['gx-peste'] }, 1000);
    r.andar(600); expect(l1.classList.contains('gx-peste')).toBe(true);   // o primeiro prazo não vale mais
    ef.aplicar(l2, { classes: ['gx-morte'] }, 0);   // 0: até alguém desfazer
    ef.desfazerTudo(false);
    expect(app.querySelectorAll('.gx-peste, .gx-morte, [data-gx-texto]')).toHaveLength(0);
  });
});
