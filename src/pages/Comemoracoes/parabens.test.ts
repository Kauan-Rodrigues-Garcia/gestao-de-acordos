/**
 * parabens.test.ts — o convite e as frases do parabéns.
 *
 * O que se perde se isto quebrar: a festa da equipe chamando para parabenizar
 * "Ana", um convite vazio no meio da tela, ou `undefined` gravado como frase.
 */
import { describe, it, expect } from 'vitest';
import {
  COLEGAS_DO_ENSAIO, FRASES_POR_ALVO, alvoDosParabens, chamadasDoConvite, colegasQueCabem,
  sortearFraseDoAlvo, textoDoBotao, textoDoHomenageado, textoEnviado, type AlvoParabens,
} from './parabens';

const ALVOS: AlvoParabens[] = ['individual', 'grupo', 'equipe', 'setor'];

describe('alvoDosParabens', () => {
  it('equipe e setor mandam; sem eles, conta as pessoas', () => {
    expect(alvoDosParabens('equipe', 0)).toBe('equipe');
    expect(alvoDosParabens('setor', 0)).toBe('setor');
    expect(alvoDosParabens('operadores', 1)).toBe('individual');
    expect(alvoDosParabens('operadores', 3)).toBe('grupo');
    expect(alvoDosParabens(undefined, 1)).toBe('individual');
  });
});

describe('convite', () => {
  it('fala de quem é a festa', () => {
    expect(chamadasDoConvite({ alvo: 'individual', nome: 'Ana', doMeuTime: false })[0]).toContain('Ana');
    expect(chamadasDoConvite({ alvo: 'equipe', nome: 'Águias', doMeuTime: false })[0]).toContain('equipe Águias');
    expect(chamadasDoConvite({ alvo: 'setor', nome: 'Cobrança', doMeuTime: false })[0]).toContain('setor Cobrança');
  });

  it('para quem é do time, fala com ele', () => {
    expect(chamadasDoConvite({ alvo: 'equipe', nome: 'Águias', doMeuTime: true })[0]).toMatch(/^Sua equipe/);
    expect(chamadasDoConvite({ alvo: 'setor', nome: 'Cobrança', doMeuTime: true })[0]).toMatch(/^Nosso setor/);
  });

  it('sem nome, nunca sai frase pela metade', () => {
    for (const alvo of ALVOS) {
      const chamadas = chamadasDoConvite({ alvo, nome: '', doMeuTime: false });
      expect(chamadas.length).toBeGreaterThan(1);
      for (const c of chamadas) expect(c).not.toMatch(/undefined|null| {2}/);
    }
  });

  it('botão e confirmação mudam com o tipo da festa', () => {
    expect(textoDoBotao({ alvo: 'individual', nome: 'Ana', doMeuTime: false })).toBe('Parabenizar Ana');
    expect(textoDoBotao({ alvo: 'grupo', nome: 'Ana e João', doMeuTime: false })).toBe('Parabenizar o time');
    expect(textoDoBotao({ alvo: 'equipe', nome: 'Águias', doMeuTime: false })).toBe('Parabenizar a equipe');
    expect(textoDoBotao({ alvo: 'setor', nome: '', doMeuTime: false })).toBe('Parabenizar o setor');
    expect(textoEnviado({ alvo: 'individual', nome: 'Ana', doMeuTime: false })).toBe('Você parabenizou Ana!');
    expect(textoEnviado({ alvo: 'equipe', nome: '', doMeuTime: false })).toBe('Você parabenizou a equipe!');
  });

  it('o festejado é avisado no singular ou no plural', () => {
    expect(textoDoHomenageado('individual')).toMatch(/te parabenizando/);
    expect(textoDoHomenageado('equipe')).toMatch(/parabenizando vocês/);
  });
});

describe('sortearFraseDoAlvo', () => {
  it('sai da lista do tipo da festa', () => {
    for (const alvo of ALVOS) {
      for (let i = 0; i < 20; i += 1) expect(FRASES_POR_ALVO[alvo]).toContain(sortearFraseDoAlvo(alvo));
    }
  });

  it('cada tipo tem frases próprias', () => {
    expect(FRASES_POR_ALVO.equipe).not.toEqual(FRASES_POR_ALVO.individual);
    expect(FRASES_POR_ALVO.setor).not.toEqual(FRASES_POR_ALVO.equipe);
  });

  it('aleatório fora de [0,1) não estoura a lista', () => {
    expect(sortearFraseDoAlvo('setor', () => 1)).toBe(FRASES_POR_ALVO.setor.at(-1));
    expect(sortearFraseDoAlvo('setor', () => -1)).toBe(FRASES_POR_ALVO.setor[0]);
  });
});

describe('ensaio', () => {
  it('os colegas de mentira chegam antes de a festa acabar', () => {
    expect(colegasQueCabem(5).every((c) => c.aposMs <= 3_500)).toBe(true);
    expect(colegasQueCabem(60)).toHaveLength(COLEGAS_DO_ENSAIO.length);
    expect(colegasQueCabem(15).length).toBeGreaterThan(3);
  });
});
