/**
 * testeLocal.test.ts — o ensaio não pode escapar.
 *
 * A garantia inteira do botão "Testar" é esta: nada de banco, nada de rede. Se
 * um dia alguém trocar o CustomEvent por um INSERT "para simplificar", estes
 * casos são o que denuncia.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { dispararTeste, ouvirTeste, EVENTO_TESTE, type ComemoracaoTeste } from './testeLocal';

function comemoracao(over: Partial<ComemoracaoTeste> = {}): ComemoracaoTeste {
  return {
    titulo: 'META BATIDA!',
    mensagem: null,
    homenageados: [{ id: 'op1', nome: 'Ana Silva', foto_url: null }],
    efeito: 'confete',
    som: 'fanfarra',
    gifUrl: null,
    somUrl: null,
    somInicioS: 0,
    layout: {},
    duracaoS: 20,
    ...over,
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('dispararTeste', () => {
  it('o ouvinte recebe a comemoração montada', () => {
    const recebido = vi.fn();
    const parar = ouvirTeste(recebido);

    dispararTeste(comemoracao({ titulo: 'ENSAIO' }));

    expect(recebido).toHaveBeenCalledTimes(1);
    expect(recebido.mock.calls[0][0].titulo).toBe('ENSAIO');
    parar();
  });

  it('depois de cancelar, não recebe mais', () => {
    const recebido = vi.fn();
    ouvirTeste(recebido)();
    dispararTeste(comemoracao());
    expect(recebido).not.toHaveBeenCalled();
  });

  it('dois ouvintes recebem o mesmo ensaio', () => {
    const a = vi.fn(); const b = vi.fn();
    const pa = ouvirTeste(a); const pb = ouvirTeste(b);
    dispararTeste(comemoracao());
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    pa(); pb();
  });

  it('leva o layout e a mídia escolhidos', () => {
    const recebido = vi.fn();
    const parar = ouvirTeste(recebido);

    dispararTeste(comemoracao({
      layout: { titulo: { x: 20, y: 30, escala: 1.2 } },
      gifUrl: 'https://exemplo/gif.gif',
      somUrl: 'https://exemplo/som.mp3',
      somInicioS: 45,
    }));

    const c = recebido.mock.calls[0][0] as ComemoracaoTeste;
    expect(c.layout.titulo).toEqual({ x: 20, y: 30, escala: 1.2 });
    expect(c.gifUrl).toBe('https://exemplo/gif.gif');
    expect(c.somUrl).toBe('https://exemplo/som.mp3');
    // O ensaio leva o ponto de partida da música; a duração é a da animação.
    expect(c.somInicioS).toBe(45);
    parar();
  });

  it('falha ao despachar não derruba a tela de montagem', () => {
    vi.spyOn(window, 'dispatchEvent').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(() => dispararTeste(comemoracao())).not.toThrow();
  });

  it('evento sem detalhe é ignorado', () => {
    const recebido = vi.fn();
    const parar = ouvirTeste(recebido);
    window.dispatchEvent(new CustomEvent(EVENTO_TESTE));
    expect(recebido).not.toHaveBeenCalled();
    parar();
  });
});
