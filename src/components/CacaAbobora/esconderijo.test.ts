import { describe, expect, it } from 'vitest';
import { caixaLivre, elementoDeAcao, sorteador } from './esconderijo';

describe('sorteador', () => {
  it('a mesma semente dá a mesma sequência, entre 0 e 1', () => {
    const a = sorteador(123);
    const b = sorteador(123);
    const sa = Array.from({ length: 5 }, a);
    expect(sa).toEqual(Array.from({ length: 5 }, b));
    expect(sa.every(n => n >= 0 && n < 1)).toBe(true);
    expect(Array.from({ length: 5 }, sorteador(124))).not.toEqual(sa);
  });
});

describe('elementoDeAcao', () => {
  it('botão, link, campo e o que está dentro deles', () => {
    document.body.innerHTML = `
      <main id="palco">
        <button id="b"><span id="dentro">Salvar</span></button>
        <a id="a" href="#/x">ir</a>
        <input id="i" />
        <div id="linha" role="row"></div>
        <div id="fundo"></div>
      </main>`;
    const el = (id: string) => document.getElementById(id)!;
    expect(elementoDeAcao(el('b'), 'auto')).toBe(true);
    expect(elementoDeAcao(el('dentro'), 'auto')).toBe(true);
    expect(elementoDeAcao(el('a'), 'auto')).toBe(true);
    expect(elementoDeAcao(el('i'), 'auto')).toBe(true);
    expect(elementoDeAcao(el('linha'), 'auto')).toBe(true);
    expect(elementoDeAcao(el('fundo'), 'auto')).toBe(false);
    // Linha de tabela clicável sem papel nenhum: o cursor de mãozinha entrega.
    expect(elementoDeAcao(el('fundo'), 'pointer')).toBe(true);
  });
});

describe('caixaLivre', () => {
  function cena() {
    document.body.innerHTML = `
      <main id="palco"><div id="fundo"></div><button id="botao">ok</button></main>
      <div id="chat"></div>`;
    return {
      palco: document.getElementById('palco')!,
      fundo: document.getElementById('fundo')!,
      botao: document.getElementById('botao')!,
      chat:  document.getElementById('chat')!,
    };
  }

  it('só fundo em volta: livre', () => {
    const { palco, fundo } = cena();
    const ambiente = { pilhaNoPonto: () => [fundo], cursorDe: () => 'auto' };
    expect(caixaLivre({ x: 100, y: 100, lado: 40 }, palco, null, 14, ambiente)).toBe(true);
  });

  it('um botão na folga em volta já reprova o lugar', () => {
    const { palco, fundo, botao } = cena();
    // O botão fica só no canto de baixo à direita da folga.
    const ambiente = {
      pilhaNoPonto: (x: number, y: number) => (x > 150 && y > 150 ? [botao] : [fundo]),
      cursorDe: () => 'auto',
    };
    expect(caixaLivre({ x: 100, y: 100, lado: 40 }, palco, null, 14, ambiente)).toBe(false);
  });

  it('algo de fora do conteúdo por cima (a bolha do chat, um diálogo) reprova', () => {
    const { palco, chat } = cena();
    const ambiente = { pilhaNoPonto: () => [chat], cursorDe: () => 'auto' };
    expect(caixaLivre({ x: 100, y: 100, lado: 40 }, palco, null, 14, ambiente)).toBe(false);
  });

  it('a própria abóbora não conta contra o lugar dela', () => {
    const { palco, fundo } = cena();
    const propria = document.createElement('button');
    document.body.appendChild(propria);
    const ambiente = { pilhaNoPonto: () => [propria, fundo], cursorDe: () => 'auto' };
    expect(caixaLivre({ x: 100, y: 100, lado: 40 }, palco, propria, 14, ambiente)).toBe(true);
  });
});
