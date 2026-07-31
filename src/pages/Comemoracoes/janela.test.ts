/**
 * janela.test.ts — quando a comemoração está no ar.
 *
 * É aritmética de relógio: erra por um sinal trocado e o erro aparece na frente
 * do time inteiro, com a festa no horário errado ou nunca.
 */
import { describe, it, expect } from 'vitest';
import {
  estaNoAr, fimMs, inicioMs, msAteComecar, proximaDaFila, vaiComecar,
  desvioDoServidor, estaAgendada, jaPassou, validarAgendamento,
  HORIZONTE_TIMER_MS, MAX_DIAS_AGENDAMENTO, TOLERANCIA_PASSADO_MS,
  type Exibivel,
} from './janela';

const T0 = new Date('2026-07-31T14:00:00.000Z').getTime();

function c(over: Partial<Exibivel> = {}): Exibivel {
  return {
    id: 'c1',
    inicia_em: new Date(T0).toISOString(),
    duracao_s: 20,
    cancelada_em: null,
    ...over,
  };
}

describe('inicioMs / fimMs', () => {
  it('fim é o início mais a duração', () => {
    expect(fimMs(c())).toBe(T0 + 20_000);
  });

  it('data inválida vira 0 em vez de NaN', () => {
    // NaN em comparação é sempre false, e a comemoração ficaria invisível sem
    // ninguém entender por quê.
    expect(inicioMs(c({ inicia_em: 'xx' }))).toBe(0);
  });

  it('duração negativa não faz o fim andar para trás', () => {
    expect(fimMs(c({ duracao_s: -5 }))).toBe(T0);
  });
});

describe('estaNoAr', () => {
  it('no instante exato do início já está no ar', () => {
    expect(estaNoAr(c(), T0)).toBe(true);
  });

  it('no meio da duração', () => {
    expect(estaNoAr(c(), T0 + 10_000)).toBe(true);
  });

  it('no instante do fim já saiu', () => {
    expect(estaNoAr(c(), T0 + 20_000)).toBe(false);
  });

  it('antes de começar, não', () => {
    expect(estaNoAr(c(), T0 - 1)).toBe(false);
  });

  it('cancelada nunca está no ar, mesmo dentro da janela', () => {
    expect(estaNoAr(c({ cancelada_em: new Date().toISOString() }), T0 + 5_000)).toBe(false);
  });
});

describe('vaiComecar', () => {
  it('dentro do horizonte, sim', () => {
    expect(vaiComecar(c({ inicia_em: new Date(T0 + 60_000).toISOString() }), T0)).toBe(true);
  });

  it('além do horizonte, não — o timer seria longo demais', () => {
    const longe = new Date(T0 + HORIZONTE_TIMER_MS + 1000).toISOString();
    expect(vaiComecar(c({ inicia_em: longe }), T0)).toBe(false);
  });

  it('já começou não conta como "vai começar"', () => {
    expect(vaiComecar(c(), T0 + 1)).toBe(false);
  });

  it('cancelada não agenda timer', () => {
    const futura = c({ inicia_em: new Date(T0 + 60_000).toISOString(), cancelada_em: 'x' });
    expect(vaiComecar(futura, T0)).toBe(false);
  });
});

describe('msAteComecar', () => {
  it('conta o que falta', () => {
    expect(msAteComecar(c({ inicia_em: new Date(T0 + 5_000).toISOString() }), T0)).toBe(5_000);
  });

  it('nunca é negativo', () => {
    expect(msAteComecar(c(), T0 + 99_000)).toBe(0);
  });
});

describe('proximaDaFila', () => {
  it('nenhuma no ar devolve null', () => {
    expect(proximaDaFila([c()], T0 - 1000, new Set())).toBeNull();
  });

  it('uma no ar é escolhida', () => {
    expect(proximaDaFila([c()], T0 + 1000, new Set())?.id).toBe('c1');
  });

  it('duas no ar: ganha a que começou antes', () => {
    const antiga = c({ id: 'antiga', inicia_em: new Date(T0 - 5_000).toISOString(), duracao_s: 60 });
    const nova   = c({ id: 'nova',   inicia_em: new Date(T0).toISOString(),         duracao_s: 60 });
    expect(proximaDaFila([nova, antiga], T0 + 1_000, new Set())?.id).toBe('antiga');
  });

  it('já exibida não volta', () => {
    // Sem isto a comemoração reapareceria a cada releitura da lista.
    expect(proximaDaFila([c()], T0 + 1000, new Set(['c1']))).toBeNull();
  });

  it('a segunda entra quando a primeira sai da fila', () => {
    const a = c({ id: 'a', duracao_s: 60 });
    const b = c({ id: 'b', duracao_s: 60 });
    expect(proximaDaFila([a, b], T0 + 1_000, new Set(['a']))?.id).toBe('b');
  });

  it('cancelada não entra', () => {
    expect(proximaDaFila([c({ cancelada_em: 'x' })], T0 + 1000, new Set())).toBeNull();
  });
});

describe('estaAgendada / jaPassou', () => {
  it('futura está agendada', () => {
    expect(estaAgendada(c({ inicia_em: new Date(T0 + 60_000).toISOString() }), T0)).toBe(true);
  });

  it('no ar não é agendada', () => {
    expect(estaAgendada(c(), T0 + 1_000)).toBe(false);
  });

  it('cancelada some da agenda', () => {
    const futura = c({ inicia_em: new Date(T0 + 60_000).toISOString(), cancelada_em: 'x' });
    expect(estaAgendada(futura, T0)).toBe(false);
  });

  it('jaPassou só depois do fim', () => {
    expect(jaPassou(c(), T0 + 19_999)).toBe(false);
    expect(jaPassou(c(), T0 + 20_000)).toBe(true);
  });
});

describe('validarAgendamento', () => {
  it('daqui a uma hora está bom', () => {
    expect(validarAgendamento(new Date(T0 + 3_600_000).toISOString(), T0)).toBeNull();
  });

  it('recusa o passado', () => {
    const ontem = new Date(T0 - 24 * 3_600_000).toISOString();
    expect(validarAgendamento(ontem, T0)).toMatch(/passado/i);
  });

  it('aceita o minuto corrente, pela tolerância', () => {
    // Escolher "agora" e levar 20 s preenchendo o resto não pode ser recusado.
    expect(validarAgendamento(new Date(T0 - 30_000).toISOString(), T0)).toBeNull();
    expect(validarAgendamento(new Date(T0 - TOLERANCIA_PASSADO_MS - 1_000).toISOString(), T0))
      .toMatch(/passado/i);
  });

  it('recusa longe demais', () => {
    const longe = new Date(T0 + (MAX_DIAS_AGENDAMENTO + 1) * 24 * 3_600_000).toISOString();
    expect(validarAgendamento(longe, T0)).toMatch(/dias/i);
  });

  it('aceita o último dia permitido', () => {
    const limite = new Date(T0 + MAX_DIAS_AGENDAMENTO * 24 * 3_600_000 - 1_000).toISOString();
    expect(validarAgendamento(limite, T0)).toBeNull();
  });

  it('data inválida tem mensagem própria', () => {
    expect(validarAgendamento('qualquer coisa', T0)).toMatch(/válidas/i);
  });
});

describe('desvioDoServidor', () => {
  it('relógio local atrasado dá desvio positivo', () => {
    // O banco está 3 s à frente: somamos 3 s ao Date.now() local.
    expect(desvioDoServidor(new Date(T0 + 3_000).toISOString(), T0)).toBe(3_000);
  });

  it('relógio local adiantado dá desvio negativo', () => {
    expect(desvioDoServidor(new Date(T0 - 3_000).toISOString(), T0)).toBe(-3_000);
  });

  it('data inválida não desregula o relógio', () => {
    expect(desvioDoServidor('nao-e-data', T0)).toBe(0);
  });
});
