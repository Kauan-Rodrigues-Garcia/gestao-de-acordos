/**
 * As regras do Controle de Números, sem banco e sem tela.
 *
 * O que estes testes protegem: as TRANSIÇÕES. As mesmas perguntas são feitas em
 * três lugares — o botão da tela, o serviço antes de chamar a RPC, e a RPC
 * dentro do Postgres. Aqui elas respondem uma vez só, e o teste é o que impede
 * a tela oferecer uma ação que o banco vai recusar.
 *
 * O banco continua sendo a autoridade. Isto é o espelho dele em TypeScript.
 */
import { describe, it, expect } from 'vitest';
import {
  LIMITE_POR_CELULAR,
  SITUACOES,
  POSSES,
  MOTIVOS_RETORNO,
  SITUACAO_LABELS,
  MOTIVO_LABELS,
  cabeMaisNumero,
  vagasNoCelular,
  podeLiberarAoSetor,
  podeLancarAoOperador,
  podeDevolverALideranca,
  podeRelancarAoNucleo,
  motivoValido,
  type EstadoNumero,
} from '../numerosRegras';

/** Um número no Núcleo, ainda aquecendo. É onde todo número começa. */
function numero(over: Partial<EstadoNumero> = {}): EstadoNumero {
  return { situacao: 'em_aquecimento', posse: 'nucleo', operadorId: null, ...over };
}

const noNucleoAtivo   = numero({ situacao: 'ativo' });
const noSetorLivre    = numero({ situacao: 'ativo', posse: 'setor' });
const comOperador     = numero({ situacao: 'ativo', posse: 'setor', operadorId: 'op-1' });

describe('o catálogo de estados', () => {
  it('tem só as três situações que a operação usa hoje', () => {
    expect(SITUACOES).toEqual(['em_aquecimento', 'ativo', 'banido']);
  });

  it('tem só os dois lugares onde um número pode estar', () => {
    expect(POSSES).toEqual(['nucleo', 'setor']);
  });

  it('rotula tudo em português, para a tela não montar texto', () => {
    for (const s of SITUACOES) expect(SITUACAO_LABELS[s]).toBeTruthy();
    for (const m of MOTIVOS_RETORNO) expect(MOTIVO_LABELS[m]).toBeTruthy();
  });
});

describe('limite de números por celular', () => {
  it('são seis', () => {
    expect(LIMITE_POR_CELULAR).toBe(6);
  });

  it('cabe até o sexto, não o sétimo', () => {
    expect(cabeMaisNumero(0)).toBe(true);
    expect(cabeMaisNumero(5)).toBe(true);
    expect(cabeMaisNumero(6)).toBe(false);
    expect(cabeMaisNumero(7)).toBe(false);
  });

  it('conta as vagas que sobram, sem devolver negativo', () => {
    expect(vagasNoCelular(0)).toBe(6);
    expect(vagasNoCelular(4)).toBe(2);
    expect(vagasNoCelular(6)).toBe(0);
    expect(vagasNoCelular(9)).toBe(0);
  });
});

describe('podeLiberarAoSetor', () => {
  it('libera número ativo que está no Núcleo', () => {
    expect(podeLiberarAoSetor(noNucleoAtivo)).toBe(true);
  });

  it('não libera quem ainda aquece nem quem foi banido', () => {
    expect(podeLiberarAoSetor(numero({ situacao: 'em_aquecimento' }))).toBe(false);
    expect(podeLiberarAoSetor(numero({ situacao: 'banido' }))).toBe(false);
  });

  it('não libera de novo quem já está no setor', () => {
    expect(podeLiberarAoSetor(noSetorLivre)).toBe(false);
  });
});

describe('podeLancarAoOperador', () => {
  it('lança número que já está no setor', () => {
    expect(podeLancarAoOperador(noSetorLivre)).toBe(true);
  });

  it('troca o operador de um número já lançado', () => {
    expect(podeLancarAoOperador(comOperador)).toBe(true);
  });

  it('não lança o que o Núcleo ainda não liberou', () => {
    expect(podeLancarAoOperador(noNucleoAtivo)).toBe(false);
  });

  it('não lança número banido', () => {
    // Ele está no setor, mas entregar um número banido a um operador é dar
    // trabalho que já se sabe que não vai funcionar. O caminho é relançar.
    expect(podeLancarAoOperador(numero({ situacao: 'banido', posse: 'setor' }))).toBe(false);
  });
});

describe('podeDevolverALideranca', () => {
  it('o dono devolve o próprio número', () => {
    expect(podeDevolverALideranca(comOperador, 'op-1')).toBe(true);
  });

  it('ninguém devolve número alheio', () => {
    expect(podeDevolverALideranca(comOperador, 'op-2')).toBe(false);
  });

  it('não há o que devolver quando ninguém está com ele', () => {
    expect(podeDevolverALideranca(noSetorLivre, 'op-1')).toBe(false);
  });

  it('número banido também é devolvido — é justamente o caso comum', () => {
    const banidoComOperador = numero({ situacao: 'banido', posse: 'setor', operadorId: 'op-1' });
    expect(podeDevolverALideranca(banidoComOperador, 'op-1')).toBe(true);
  });
});

describe('podeRelancarAoNucleo', () => {
  it('relança o que está no setor, com ou sem operador', () => {
    expect(podeRelancarAoNucleo(noSetorLivre)).toBe(true);
    expect(podeRelancarAoNucleo(comOperador)).toBe(true);
  });

  it('relança número banido — é o motivo de a ação existir', () => {
    expect(podeRelancarAoNucleo(numero({ situacao: 'banido', posse: 'setor' }))).toBe(true);
  });

  it('não relança o que já está no Núcleo', () => {
    expect(podeRelancarAoNucleo(noNucleoAtivo)).toBe(false);
  });
});

describe('motivoValido', () => {
  it('aceita os quatro motivos da lista', () => {
    for (const m of MOTIVOS_RETORNO) expect(motivoValido(m)).toBe(true);
  });

  it('recusa motivo em branco — o Núcleo precisa saber o que tratar', () => {
    expect(motivoValido('')).toBe(false);
    expect(motivoValido(null)).toBe(false);
    expect(motivoValido(undefined)).toBe(false);
  });

  it('recusa motivo inventado', () => {
    expect(motivoValido('sumiu')).toBe(false);
  });
});
