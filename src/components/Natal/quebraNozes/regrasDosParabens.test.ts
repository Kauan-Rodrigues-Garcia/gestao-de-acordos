import { describe, expect, it } from 'vitest';
import {
  FRASES_PARA_TODOS, FRASES_PARA_UM, colegaDoEnsaio, frasesDoEspetaculo, sortearFrase, sortearOutraFrase, souDestaque, textoDoBotao,
} from './regrasDosParabens';

describe('parabéns dos quebra-nozes', () => {
  it('fala com a pessoa no boletim e com todos na chamada das dez', () => {
    expect(textoDoBotao([{ nome: 'Ana Lima' }])).toBe('Parabenizar Ana Lima');
    expect(textoDoBotao([{ nome: 'Ana Lima' }, { nome: 'Bruno Melo' }])).toBe('Parabenizar os destaques');
    expect(frasesDoEspetaculo(1)).toBe(FRASES_PARA_UM);
    expect(frasesDoEspetaculo(4)).toBe(FRASES_PARA_TODOS);
  });

  it('o sorteio fica dentro da lista, mesmo nos extremos', () => {
    expect(sortearFrase(2, () => 0)).toBe(FRASES_PARA_TODOS[0]);
    expect(sortearFrase(2, () => 1)).toBe(FRASES_PARA_TODOS[FRASES_PARA_TODOS.length - 1]);
  });

  it('quem clica de novo não recebe a mesma frase em seguida', () => {
    for (const sorteio of [0, 0.5, 0.99, 1]) {
      expect(sortearOutraFrase(2, FRASES_PARA_TODOS[0], () => sorteio)).not.toBe(FRASES_PARA_TODOS[0]);
    }
  });

  it('nenhuma frase fala de dinheiro nem de cidade', () => {
    for (const frase of [...FRASES_PARA_TODOS, ...FRASES_PARA_UM]) {
      expect(frase).not.toMatch(/R\$|\d|birigui|mar[ií]lia/i);
    }
  });

  it('reconhece o destaque só no cartão do próprio setor, sem ligar para acento', () => {
    expect(souDestaque([{ nome: 'Lúcia Dias', meu: true }], 'lucia dias')).toBe(true);
    expect(souDestaque([{ nome: 'Lúcia Dias', meu: false }], 'Lúcia Dias')).toBe(false);
    expect(souDestaque([{ nome: 'Lúcia Dias', meu: true }], '')).toBe(false);
  });

  it('os colegas do ensaio dão a volta na lista', () => {
    expect(colegaDoEnsaio(8, 2, () => 0).nome).toBe(colegaDoEnsaio(0, 2, () => 0).nome);
  });
});
