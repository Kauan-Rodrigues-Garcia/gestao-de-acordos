import { afterEach, describe, expect, it } from 'vitest';
import { pegarCamada } from './camada';

afterEach(() => { document.body.innerHTML = ''; });

function palcoRolado(scrollTop: number) {
  const main = document.createElement('main');
  document.body.appendChild(main);
  main.getBoundingClientRect = () => ({ left: 240, top: 88, right: 1100, bottom: 640, width: 860, height: 552, x: 240, y: 88, toJSON: () => ({}) });
  Object.defineProperty(main, 'scrollTop', { value: scrollTop, writable: true });
  return main;
}

describe('a camada do zumbi', () => {
  it('janela ↔ conteúdo: o que nasce num ponto da página continua nele depois de rolar', () => {
    const main = palcoRolado(300);
    const { camada, soltar } = pegarCamada(main);
    const c = camada.paraConteudo(500, 200);
    expect(c).toEqual({ x: 260, y: 412 });
    expect(camada.paraTela(c.x, c.y)).toEqual({ x: 500, y: 200 });
    // A folha anda ao contrário da rolagem.
    expect(camada.folha.style.transform).toBe('translate(0px, -300px)');
    soltar();
  });

  it('uma lâmina só, dividida; a última a soltar apaga', () => {
    const main = palcoRolado(0);
    const a = pegarCamada(main);
    const b = pegarCamada(main);
    expect(a.camada).toBe(b.camada);
    expect(document.querySelectorAll('.zb-camada')).toHaveLength(1);
    a.soltar();
    a.soltar();
    expect(document.querySelectorAll('.zb-camada')).toHaveLength(1);
    b.soltar();
    expect(document.querySelectorAll('.zb-camada')).toHaveLength(0);
  });
});
