/**
 * scroll-conversa.test.ts
 *
 * O bug que gerou este arquivo: a página inteira pulava a cada mensagem e a
 * cada piscada do "digitando". Os casos abaixo travam as duas regras que
 * substituíram o `scrollIntoView` — quem está no fim acompanha, quem subiu para
 * ler fica onde está.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  estaNoFim, rolarAoFim, deveRolar, viewportDaArea, FOLGA_FIM_PX,
} from './scroll-conversa';

describe('estaNoFim', () => {
  it('exatamente no fim', () => {
    expect(estaNoFim({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
  });

  it('a poucos pixels do fim ainda conta como fim', () => {
    // Altura fracionária e zoom impedem o fim exato; sem folga o leitor seria
    // descolado sem ter rolado nada.
    expect(estaNoFim({ scrollTop: 598, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
  });

  it('logo além da folga já não é fim', () => {
    expect(estaNoFim({
      scrollTop: 600 - FOLGA_FIM_PX - 1, scrollHeight: 1000, clientHeight: 400,
    })).toBe(false);
  });

  it('rolado para o topo lendo o histórico', () => {
    expect(estaNoFim({ scrollTop: 0, scrollHeight: 1000, clientHeight: 400 })).toBe(false);
  });

  it('conversa curta, sem barra de rolagem, é sempre fim', () => {
    expect(estaNoFim({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 })).toBe(true);
  });

  it('aceita folga própria', () => {
    const area = { scrollTop: 590, scrollHeight: 1000, clientHeight: 400 };
    expect(estaNoFim(area, 5)).toBe(false);
    expect(estaNoFim(area, 20)).toBe(true);
  });
});

describe('deveRolar', () => {
  it('primeira carga rola sempre — a conversa abre no fim', () => {
    expect(deveRolar({
      primeiraCarga: true, ultimaEhMinha: false, grudadoNoFim: false,
    })).toBe(true);
  });

  it('mensagem minha rola mesmo se eu estava lendo o histórico', () => {
    expect(deveRolar({
      primeiraCarga: false, ultimaEhMinha: true, grudadoNoFim: false,
    })).toBe(true);
  });

  it('mensagem do outro rola se eu já estava no fim', () => {
    expect(deveRolar({
      primeiraCarga: false, ultimaEhMinha: false, grudadoNoFim: true,
    })).toBe(true);
  });

  it('mensagem do outro NÃO rola se eu subi para ler', () => {
    // Este é o caso do relato: a tela se mexendo sozinha durante a leitura.
    expect(deveRolar({
      primeiraCarga: false, ultimaEhMinha: false, grudadoNoFim: false,
    })).toBe(false);
  });
});

describe('rolarAoFim', () => {
  it('mexe no próprio elemento, sem envolver os ancestrais', () => {
    const scrollTo = vi.fn();
    const el = { scrollHeight: 1234, scrollTo } as unknown as HTMLElement;
    rolarAoFim(el, 'smooth');
    expect(scrollTo).toHaveBeenCalledWith({ top: 1234, behavior: 'smooth' });
  });

  it('cai no scrollTop quando o ambiente não tem scrollTo', () => {
    const el = { scrollHeight: 900, scrollTop: 0 } as unknown as HTMLElement;
    rolarAoFim(el);
    expect(el.scrollTop).toBe(900);
  });

  it('o padrão é suave', () => {
    const scrollTo = vi.fn();
    rolarAoFim({ scrollHeight: 10, scrollTo } as unknown as HTMLElement);
    expect(scrollTo).toHaveBeenCalledWith({ top: 10, behavior: 'smooth' });
  });
});

describe('viewportDaArea', () => {
  it('desce até o elemento que realmente rola no ScrollArea do Radix', () => {
    const raiz = document.createElement('div');
    const viewport = document.createElement('div');
    viewport.setAttribute('data-radix-scroll-area-viewport', '');
    raiz.appendChild(viewport);
    expect(viewportDaArea(raiz)).toBe(viewport);
  });

  it('sem raiz devolve null em vez de estourar', () => {
    expect(viewportDaArea(null)).toBeNull();
    expect(viewportDaArea(undefined)).toBeNull();
    expect(viewportDaArea(document.createElement('div'))).toBeNull();
  });
});
