/**
 * janela.test.ts — quando a comemoração está no ar.
 *
 * É aritmética de relógio: erra por um sinal trocado e o erro aparece na frente
 * do time inteiro, com a festa no horário errado ou nunca.
 */
import { describe, it, expect } from 'vitest';
import {
  estaNoAr, fimMs, inicioMs, msAteComecar, msAteDespertar, proximaDaFila,
  desvioDoServidor, estaAgendada, jaPassou, validarAgendamento,
  estaEncerrada, estadoDe,
  MAX_DIAS_AGENDAMENTO, TOLERANCIA_PASSADO_MS, VIGIA_MS,
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

describe('msAteDespertar', () => {
  const em = (ms: number, over: Partial<Exibivel> = {}) =>
    c({ id: `c${ms}`, inicia_em: new Date(T0 + ms).toISOString(), ...over });

  it('acorda no início da próxima, já dentro da janela', () => {
    expect(msAteDespertar([em(5_000)], T0)).toBe(5_050);
  });

  it('agendada com horas de antecedência ainda arma a vigia (27/10/2026)', () => {
    // O defeito: além de 30 min não havia timer nenhum, e a página aberta o
    // dia todo nunca via a festa do Luciano.
    expect(msAteDespertar([em(5 * 3_600_000)], T0)).toBe(VIGIA_MS);
  });

  it('a mais próxima manda, qualquer que seja a ordem da lista', () => {
    expect(msAteDespertar([em(50_000), em(10_000), em(3 * 3_600_000)], T0)).toBe(10_050);
  });

  it('nada agendado: não arma timer', () => {
    expect(msAteDespertar([], T0)).toBeNull();
    expect(msAteDespertar([c()], T0 + 1)).toBeNull();   // já começou
  });

  it('cancelada e finalizada não armam timer', () => {
    expect(msAteDespertar([em(60_000, { cancelada_em: 'x' })], T0)).toBeNull();
    expect(msAteDespertar([em(60_000, { finalizada_em: 'x' })], T0)).toBeNull();
  });

  it('a vigia é o teto', () => {
    expect(msAteDespertar([em(10_000)], T0, 2_000)).toBe(2_000);
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

// ── 20260801a: finalizada e os três estados ─────────────────────────────────

describe('estaEncerrada', () => {
  it('cancelada está encerrada', () => {
    expect(estaEncerrada(c({ cancelada_em: new Date(T0).toISOString() }))).toBe(true);
  });

  it('finalizada está encerrada', () => {
    expect(estaEncerrada(c({ finalizada_em: new Date(T0).toISOString() }))).toBe(true);
  });

  it('comemoração de antes da migration (sem a coluna) não está encerrada', () => {
    expect(estaEncerrada(c())).toBe(false);
  });
});

describe('finalizada não volta ao ar', () => {
  it('dentro da janela, mas finalizada: não está no ar', () => {
    // É o caso que fazia a festa repetir: a janela ainda não venceu, mas a
    // comemoração já acabou para todo mundo.
    const finalizada = c({ finalizada_em: new Date(T0 + 5_000).toISOString() });
    expect(estaNoAr(finalizada, T0 + 10_000)).toBe(false);
  });

  it('finalizada não entra na fila nem ganha timer', () => {
    const futura = c({
      inicia_em: new Date(T0 + 60_000).toISOString(),
      finalizada_em: new Date(T0).toISOString(),
    });
    expect(msAteDespertar([futura], T0)).toBeNull();
    expect(estaAgendada(futura, T0)).toBe(false);
    expect(proximaDaFila([futura], T0 + 60_001, new Set())).toBeNull();
  });
});

describe('estadoDe', () => {
  it('antes da hora: agendada', () => {
    expect(estadoDe(c({ inicia_em: new Date(T0 + 60_000).toISOString() }), T0)).toBe('agendada');
  });

  it('dentro da janela: em andamento', () => {
    expect(estadoDe(c(), T0 + 5_000)).toBe('em-andamento');
  });

  it('depois da janela: finalizada, mesmo sem ninguém ter marcado', () => {
    // Ninguém estava logado para fechar e o pg_cron só roda de madrugada. Sem
    // esta regra a comemoração não cairia em nenhuma das três listas da aba.
    expect(estadoDe(c(), T0 + 999_000)).toBe('finalizada');
  });

  it('cancelada é finalizada, mesmo dentro da janela', () => {
    const cancelada = c({ cancelada_em: new Date(T0).toISOString() });
    expect(estadoDe(cancelada, T0 + 5_000)).toBe('finalizada');
  });

  it('cancelada antes de começar também é finalizada, não agendada', () => {
    const cancelada = c({
      inicia_em: new Date(T0 + 60_000).toISOString(),
      cancelada_em: new Date(T0).toISOString(),
    });
    expect(estadoDe(cancelada, T0)).toBe('finalizada');
  });

  it('toda comemoração cai em exatamente um estado', () => {
    const casos: Exibivel[] = [
      c(),
      c({ inicia_em: new Date(T0 + 60_000).toISOString() }),
      c({ cancelada_em: new Date(T0).toISOString() }),
      c({ finalizada_em: new Date(T0).toISOString() }),
      c({ inicia_em: 'data-invalida' }),
    ];
    for (const caso of casos) {
      expect(['agendada', 'em-andamento', 'finalizada']).toContain(estadoDe(caso, T0 + 5_000));
    }
  });
});
