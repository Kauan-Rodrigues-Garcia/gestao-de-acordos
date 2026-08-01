/**
 * animacoesTexto.test.ts — como o texto entra na tela.
 *
 * O que se perde se isto quebrar: título invisível na comemoração inteira (uma
 * animação que começa em opacidade 0 e nunca chega a 1 não avisa ninguém), ou
 * datilografia de dez segundos num card que dura cinco.
 */
import { describe, it, expect } from 'vitest';
import {
  ANIMACOES_TEXTO, ANIM_TEXTO_PADRAO, animTextoValida, propsAnimacaoTexto,
  type AnimTextoId,
} from './animacoesTexto';

const TODAS = ANIMACOES_TEXTO.map((a) => a.id);

describe('catálogo', () => {
  it('ids são únicos', () => {
    expect(new Set(TODAS).size).toBe(TODAS.length);
  });

  it('o padrão está no catálogo', () => {
    expect(TODAS).toContain(ANIM_TEXTO_PADRAO);
  });
});

describe('animTextoValida', () => {
  it('aceita id conhecido', () => {
    expect(animTextoValida('tremor')).toBe('tremor');
  });

  it('id de versão futura cai no padrão em vez de sumir com o texto', () => {
    expect(animTextoValida('holograma')).toBe(ANIM_TEXTO_PADRAO);
    expect(animTextoValida(null)).toBe(ANIM_TEXTO_PADRAO);
    expect(animTextoValida(undefined)).toBe(ANIM_TEXTO_PADRAO);
  });
});

describe('toda animação termina visível', () => {
  it.each(TODAS)('%s acaba em opacidade 1', (id) => {
    const { animate } = propsAnimacaoTexto(id as AnimTextoId, 0, 12);
    const alvo = animate as { opacity?: number };
    expect(alvo.opacity).toBe(1);
  });

  it.each(TODAS)('%s não repete para sempre', (id) => {
    // Texto pulsando sem parar em cima de quem está atendendo cansa em dez
    // segundos — e a comemoração pode durar um minuto.
    const { transition } = propsAnimacaoTexto(id as AnimTextoId, 0, 12);
    expect((transition as { repeat?: number }).repeat).toBeUndefined();
  });
});

describe('atraso', () => {
  it('a mensagem entra depois do título', () => {
    const titulo   = propsAnimacaoTexto('subir', 0.1, 10);
    const mensagem = propsAnimacaoTexto('subir', 0.3, 10);
    const d1 = (titulo.transition as { delay?: number }).delay ?? 0;
    const d2 = (mensagem.transition as { delay?: number }).delay ?? 0;
    expect(d2).toBeGreaterThan(d1);
  });

  it("'nenhuma' aparece pronto, sem esperar", () => {
    const { transition } = propsAnimacaoTexto('nenhuma', 0.3, 10);
    expect((transition as { duration?: number }).duration).toBe(0);
  });
});

describe('datilografia', () => {
  function duracao(comprimento: number): number {
    const { transition } = propsAnimacaoTexto('maquina', 0, comprimento);
    return (transition as { duration: number }).duration;
  }

  it('texto maior demora mais', () => {
    expect(duracao(40)).toBeGreaterThan(duracao(10));
  });

  it('tem teto — título longo não come a comemoração inteira', () => {
    expect(duracao(500)).toBeLessThanOrEqual(1.6);
  });

  it('tem piso — título de uma letra não pisca', () => {
    expect(duracao(0)).toBeGreaterThanOrEqual(0.2);
  });

  it('revela da esquerda para a direita', () => {
    const { initial, animate } = propsAnimacaoTexto('maquina', 0, 10);
    expect((initial as { clipPath?: string }).clipPath).toBe('inset(0 100% 0 0)');
    expect((animate as { clipPath?: string }).clipPath).toBe('inset(0 0% 0 0)');
  });

  it('o texto inteiro existe desde o começo — leitor de tela não lê pela metade', () => {
    // O recorte é visual: nada é removido do DOM, então a opacidade inicial
    // não pode esconder o texto de quem usa leitor.
    const { initial } = propsAnimacaoTexto('maquina', 0, 10);
    expect((initial as { opacity?: number }).opacity).toBe(1);
  });
});
