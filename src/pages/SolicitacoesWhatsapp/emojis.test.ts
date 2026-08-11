/**
 * emojis.test.ts — inserção no texto e memória dos recentes.
 *
 * A parte que erra nesse componente é sempre a mesma: emoji que vai para o fim
 * em vez de ir para o cursor. É o primeiro bloco abaixo.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  inserirEmoji, registrarRecente, lerRecentes, salvarRecentes,
  GRUPOS_EMOJI, MAX_RECENTES, CHAVE_RECENTES,
} from './emojis';

describe('inserirEmoji', () => {
  it('entra na posição do cursor, não no fim', () => {
    // "bom |dia" → clicou em 👍
    expect(inserirEmoji('bom dia', '👍', 4, 4)).toEqual({
      texto: 'bom 👍dia',
      cursor: 4 + '👍'.length,
    });
  });

  it('no começo do texto', () => {
    expect(inserirEmoji('dia', '👍', 0, 0).texto).toBe('👍dia');
  });

  it('no fim do texto', () => {
    expect(inserirEmoji('bom', '👍', 3, 3).texto).toBe('bom👍');
  });

  it('substitui a seleção, como qualquer digitação faria', () => {
    // "bom [dia]" selecionado
    expect(inserirEmoji('bom dia', '🎉', 4, 7).texto).toBe('bom 🎉');
  });

  it('campo que nunca teve foco (cursor nulo) joga para o fim', () => {
    expect(inserirEmoji('bom dia', '👍', null, null)).toEqual({
      texto: 'bom dia👍',
      cursor: 'bom dia👍'.length,
    });
  });

  it('posição fora do texto não corta nem estoura', () => {
    expect(inserirEmoji('oi', '👍', 99, 99).texto).toBe('oi👍');
    expect(inserirEmoji('oi', '👍', -5, -5).texto).toBe('oi👍');
  });

  it('fim antes do início não come texto', () => {
    expect(inserirEmoji('bom dia', '👍', 4, 1).texto).toBe('bom 👍dia');
  });

  it('texto vazio', () => {
    expect(inserirEmoji('', '👍', 0, 0)).toEqual({ texto: '👍', cursor: '👍'.length });
  });

  // Emoji composto (com seletor de variação) conta mais de um code unit; o
  // cursor precisa ir para depois dele INTEIRO, senão a próxima letra digitada
  // entra no meio da sequência e o emoji vira outro caractere.
  it('cursor pula o emoji composto inteiro', () => {
    const r = inserirEmoji('a', '❤️', 1, 1);
    expect(r.texto).toBe('a❤️');
    expect(r.cursor).toBe(1 + '❤️'.length);
    expect(r.texto.slice(0, r.cursor)).toBe('a❤️');
  });
});

describe('registrarRecente', () => {
  it('coloca o escolhido na frente', () => {
    expect(registrarRecente(['😀', '🎉'], '👍')).toEqual(['👍', '😀', '🎉']);
  });

  // Quem usou 👍 cinco vezes não quer cinco 👍 ocupando a fila.
  it('reusar move para a frente em vez de duplicar', () => {
    expect(registrarRecente(['😀', '👍', '🎉'], '👍')).toEqual(['👍', '😀', '🎉']);
  });

  it('não passa do teto', () => {
    const cheia = Array.from({ length: MAX_RECENTES }, (_, i) => `e${i}`);
    const nova = registrarRecente(cheia, '👍');
    expect(nova).toHaveLength(MAX_RECENTES);
    expect(nova[0]).toBe('👍');
    // O mais antigo é quem sai.
    expect(nova).not.toContain(`e${MAX_RECENTES - 1}`);
  });

  it('lista vazia', () => {
    expect(registrarRecente([], '👍')).toEqual(['👍']);
  });
});

describe('persistência dos recentes', () => {
  beforeEach(() => {
    try { localStorage.removeItem(CHAVE_RECENTES); } catch { /* noop */ }
  });

  it('vai e volta', () => {
    salvarRecentes(['👍', '🎉']);
    expect(lerRecentes()).toEqual(['👍', '🎉']);
  });

  it('sem nada guardado devolve lista vazia', () => {
    expect(lerRecentes()).toEqual([]);
  });

  it('JSON inválido não estoura', () => {
    localStorage.setItem(CHAVE_RECENTES, 'não é json');
    expect(lerRecentes()).toEqual([]);
  });

  it('valor que não é lista devolve vazio', () => {
    localStorage.setItem(CHAVE_RECENTES, '{"a":1}');
    expect(lerRecentes()).toEqual([]);
  });

  // Um item inválido quebraria a grade inteira ao desenhar.
  it('descarta itens que não são texto', () => {
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(['👍', 42, null, '🎉']));
    expect(lerRecentes()).toEqual(['👍', '🎉']);
  });

  it('salvar corta no teto', () => {
    salvarRecentes(Array.from({ length: MAX_RECENTES + 5 }, (_, i) => `e${i}`));
    expect(lerRecentes()).toHaveLength(MAX_RECENTES);
  });
});

describe('catálogo', () => {
  it('todo grupo tem id, nome, aba e itens', () => {
    for (const g of GRUPOS_EMOJI) {
      expect(g.id).toBeTruthy();
      expect(g.nome).toBeTruthy();
      expect(g.aba).toBeTruthy();
      expect(g.itens.length).toBeGreaterThan(0);
    }
  });

  it('ids não se repetem — a aba selecionada é resolvida por id', () => {
    const ids = GRUPOS_EMOJI.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
