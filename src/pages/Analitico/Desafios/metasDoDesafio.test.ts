/**
 * metasDoDesafio.test.ts
 *
 * A tradução entre o que o líder digita e o que fica gravado — a ponte por onde
 * um desafio se perde em silêncio se estiver errada.
 *
 * Os casos aqui são os que já morderam: login com caixa alta, campo em branco
 * virando meta zero, valor colado com "R$" e ponto de milhar, e a campanha
 * antiga cuja meta está gravada por login em vez de id.
 */
import { describe, it, expect } from 'vitest';
import {
  aplicarBlocoDeMetas, metasParaValores, paraCampo, valorDigitado, valoresParaMetas,
} from './metasDoDesafio';
import type { PessoaDesafio } from '@/services/desafios/types';

function pessoa(id: string, nome: string, usuario: string): PessoaDesafio {
  return {
    id, nome, usuario,
    fotoUrl: null, equipeId: 'eq1', equipeNome: 'PLAY 1',
    setorId: 'setorA', situacao: 'ativo', setores: ['setorA'], equipes: ['eq1'],
  };
}

const PESSOAS = [
  pessoa('id-kauan',  'Kauan Teixeira', 'kauan_teixeira'),
  pessoa('id-thiago', 'Thiago Alves',   'THIAGO_ALVES'),
  pessoa('id-debora', 'Débora Portela', 'debora_portela'),
];

describe('valorDigitado', () => {
  it('aceita o que sai de uma planilha', () => {
    expect(valorDigitado('40857,14')).toBeCloseTo(40857.14, 2);
    expect(valorDigitado('R$ 40.857,14')).toBeCloseTo(40857.14, 2);
    expect(valorDigitado(' 15714,29 ')).toBeCloseTo(15714.29, 2);
  });

  it('campo em branco é «não disputa», nunca meta zero', () => {
    // Zero seria lido pela tela como desafio já concluído — o pior desfecho.
    expect(valorDigitado('')).toBe(0);
    expect(valorDigitado('   ')).toBe(0);
    expect(valorDigitado(undefined)).toBe(0);
    expect(valorDigitado('abc')).toBe(0);
    expect(valorDigitado('0')).toBe(0);
    expect(valorDigitado('-500')).toBe(0);
  });
});

describe('valoresParaMetas', () => {
  it('só o positivo entra no mapa gravado', () => {
    expect(valoresParaMetas({
      'id-kauan':  '40857,14',
      'id-thiago': '',
      'id-debora': '0',
    })).toEqual({ 'id-kauan': 40857.14 });
  });

  it('mapa vazio quando ninguém recebeu valor', () => {
    expect(valoresParaMetas({ a: '', b: '  ' })).toEqual({});
  });
});

describe('metasParaValores', () => {
  it('abre os campos a partir de chaves por id', () => {
    expect(metasParaValores({ 'id-kauan': 40857.14 }, PESSOAS))
      .toEqual({ 'id-kauan': '40857,14' });
  });

  it('campanha gravada por LOGIN abre nos campos certos', () => {
    // É o caso da primeira campanha, semeada por migration a partir da planilha.
    expect(metasParaValores({ kauan_teixeira: 40857.14, THIAGO_ALVES: 15714.29 }, PESSOAS))
      .toEqual({ 'id-kauan': '40857,14', 'id-thiago': '15714,29' });
  });

  it('chave que não casa com ninguém é preservada, não descartada', () => {
    const r = metasParaValores({ alguem_que_saiu: 1000 }, PESSOAS);
    expect(r['alguem_que_saiu']).toBe('1000,00');
  });
});

describe('aplicarBlocoDeMetas', () => {
  it('casa por login normalizado e devolve o que não casou', () => {
    const { valores, naoCasaram } = aplicarBlocoDeMetas(
      'kauan_teixeira = 40857,14\nTHIAGO_ALVES = 15714,29\nfulano_inexistente = 900',
      PESSOAS, {},
    );
    expect(valores).toEqual({ 'id-kauan': '40857,14', 'id-thiago': '15714,29' });
    expect(naoCasaram).toEqual(['fulano_inexistente']);
  });

  it('aceita dois-pontos e tabulação — colar da planilha funciona', () => {
    const { valores } = aplicarBlocoDeMetas(
      'kauan_teixeira: 100\ndebora_portela\t9428,57',
      PESSOAS, {},
    );
    expect(valores).toEqual({ 'id-kauan': '100,00', 'id-debora': '9428,57' });
  });

  it('# abre comentário e linha vazia é ignorada', () => {
    const { valores, naoCasaram } = aplicarBlocoDeMetas(
      '# metas de agosto\n\nkauan_teixeira = 100  # dobrou\n',
      PESSOAS, {},
    );
    expect(valores).toEqual({ 'id-kauan': '100,00' });
    expect(naoCasaram).toEqual([]);
  });

  it('preserva o que já estava digitado e não foi citado no bloco', () => {
    const { valores } = aplicarBlocoDeMetas(
      'kauan_teixeira = 100', PESSOAS, { 'id-debora': '50,00' },
    );
    expect(valores).toEqual({ 'id-debora': '50,00', 'id-kauan': '100,00' });
  });

  it('linha sem separador não vira meta zero — é ignorada', () => {
    const { valores, naoCasaram } = aplicarBlocoDeMetas('kauan_teixeira', PESSOAS, {});
    expect(valores).toEqual({});
    expect(naoCasaram).toEqual([]);
  });
});

describe('ida e volta', () => {
  it('gravar e reabrir devolve os mesmos valores', () => {
    const digitado = { 'id-kauan': '40857,14', 'id-thiago': '15714,29' };
    const gravado  = valoresParaMetas(digitado);
    expect(metasParaValores(gravado, PESSOAS)).toEqual(digitado);
  });

  it('editar uma campanha gravada por login a MIGRA para chaves por id', () => {
    const porLogin = { kauan_teixeira: 40857.14 };
    const reaberto = metasParaValores(porLogin, PESSOAS);
    expect(valoresParaMetas(reaberto)).toEqual({ 'id-kauan': 40857.14 });
  });
});

describe('paraCampo', () => {
  it('sempre com dois decimais e vírgula', () => {
    expect(paraCampo(22000)).toBe('22000,00');
    expect(paraCampo(9428.567)).toBe('9428,57');
  });
});
