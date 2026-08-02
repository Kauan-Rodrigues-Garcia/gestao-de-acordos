/**
 * mesReferencia.test.ts — as contas de calendário do seletor de mês.
 *
 * O que se perde se isto quebrar: o dashboard mostra o mês errado, ou uma
 * projeção inventada em cima de um mês já fechado. São números que a liderança
 * usa para cobrar meta, então o erro sai caro e é silencioso.
 */
import { describe, it, expect } from 'vitest';
import { getTodayISO } from '@/lib/index';
import {
  mesValido, mesAtual, normalizarMes, partesDoMes, deslocarMes,
  primeiroDiaDoMes, ultimoDiaDoMes, diasNoMes, ehMesAtual, rotuloDoMes,
  podeAvancar, podeVoltar, diasDecorridos, MESES_HISTORICO,
} from './mesReferencia';

describe('mesValido', () => {
  it('aceita yyyy-MM', () => {
    expect(mesValido('2026-08')).toBe(true);
    expect(mesValido('2026-01')).toBe(true);
    expect(mesValido('2026-12')).toBe(true);
  });

  it('recusa mês fora de 1..12', () => {
    expect(mesValido('2026-00')).toBe(false);
    expect(mesValido('2026-13')).toBe(false);
  });

  it('recusa formato solto', () => {
    for (const v of ['2026-8', '08/2026', '2026-08-01', '', null, undefined, 42, {}]) {
      expect(mesValido(v)).toBe(false);
    }
  });
});

describe('mesAtual', () => {
  it('é o mês de hoje em São Paulo, não o da máquina', () => {
    // `getTodayISO` já resolve o fuso; aqui só garantimos que não voltamos a
    // usar `new Date().getMonth()`, que troca de mês antes da empresa quando a
    // máquina está em UTC.
    expect(mesAtual()).toBe(getTodayISO().slice(0, 7));
  });
});

describe('normalizarMes', () => {
  it('deixa passar o que é válido', () => {
    expect(normalizarMes('2025-11')).toBe('2025-11');
  });

  it('lixo cai no mês atual em vez de quebrar a tela', () => {
    for (const v of [null, undefined, '', 'ontem', '2026-13']) {
      expect(normalizarMes(v)).toBe(mesAtual());
    }
  });
});

describe('partesDoMes', () => {
  it('devolve o mês em base 1, como o banco guarda', () => {
    expect(partesDoMes('2026-01')).toEqual({ ano: 2026, mes: 1 });
    expect(partesDoMes('2026-12')).toEqual({ ano: 2026, mes: 12 });
  });
});

describe('deslocarMes', () => {
  it('anda para trás e para frente', () => {
    expect(deslocarMes('2026-08', -1)).toBe('2026-07');
    expect(deslocarMes('2026-08',  1)).toBe('2026-09');
  });

  it('vira o ano nas duas pontas', () => {
    expect(deslocarMes('2026-01', -1)).toBe('2025-12');
    expect(deslocarMes('2025-12',  1)).toBe('2026-01');
  });

  it('pula mais de um ano', () => {
    expect(deslocarMes('2026-03', -15)).toBe('2024-12');
  });

  it('zero devolve o mesmo mês', () => {
    expect(deslocarMes('2026-08', 0)).toBe('2026-08');
  });
});

describe('primeiro e último dia', () => {
  it('mês de 31', () => {
    expect(primeiroDiaDoMes('2026-08')).toBe('2026-08-01');
    expect(ultimoDiaDoMes('2026-08')).toBe('2026-08-31');
  });

  it('mês de 30', () => {
    expect(ultimoDiaDoMes('2026-04')).toBe('2026-04-30');
  });

  it('fevereiro comum e bissexto', () => {
    expect(ultimoDiaDoMes('2026-02')).toBe('2026-02-28');
    expect(ultimoDiaDoMes('2024-02')).toBe('2024-02-29');
  });

  it('o intervalo cobre o mês inteiro, sem vazar para o vizinho', () => {
    // É este par que vira `vencimento >= inicio AND vencimento <= fim` na
    // filtragem dos acordos: um dia a mais soma o acordo do mês seguinte.
    const inicio = primeiroDiaDoMes('2026-02');
    const fim    = ultimoDiaDoMes('2026-02');
    expect('2026-02-01' >= inicio && '2026-02-01' <= fim).toBe(true);
    expect('2026-02-28' >= inicio && '2026-02-28' <= fim).toBe(true);
    expect('2026-03-01' <= fim).toBe(false);
    expect('2026-01-31' >= inicio).toBe(false);
  });
});

describe('diasNoMes', () => {
  it('conta certo em todos os formatos de mês', () => {
    expect(diasNoMes('2026-01')).toBe(31);
    expect(diasNoMes('2026-04')).toBe(30);
    expect(diasNoMes('2026-02')).toBe(28);
    expect(diasNoMes('2024-02')).toBe(29);
    expect(diasNoMes('2026-12')).toBe(31);
  });
});

describe('ehMesAtual', () => {
  it('reconhece o mês corrente', () => {
    expect(ehMesAtual(mesAtual())).toBe(true);
    expect(ehMesAtual(deslocarMes(mesAtual(), -1))).toBe(false);
  });
});

describe('rotuloDoMes', () => {
  it('escreve o nome do mês em português', () => {
    expect(rotuloDoMes('2026-08')).toBe('Agosto 2026');
    expect(rotuloDoMes('2026-03')).toBe('Março 2026');
    expect(rotuloDoMes('2025-12')).toBe('Dezembro 2025');
  });
});

describe('limites da navegação', () => {
  it('não avança além do mês corrente — não há dado no futuro', () => {
    expect(podeAvancar(mesAtual())).toBe(false);
    expect(podeAvancar(deslocarMes(mesAtual(), 1))).toBe(false);
    expect(podeAvancar(deslocarMes(mesAtual(), -1))).toBe(true);
  });

  it('volta até o teto do histórico e para', () => {
    expect(podeVoltar(mesAtual())).toBe(true);
    expect(podeVoltar(deslocarMes(mesAtual(), -(MESES_HISTORICO - 1)))).toBe(true);
    expect(podeVoltar(deslocarMes(mesAtual(), -MESES_HISTORICO))).toBe(false);
  });
});

describe('diasDecorridos', () => {
  it('no mês corrente, é o dia de hoje', () => {
    expect(diasDecorridos('2026-08', '2026-08-02')).toBe(2);
    expect(diasDecorridos('2026-08', '2026-08-27')).toBe(27);
  });

  it('mês fechado devolve o mês inteiro', () => {
    // O defeito que isto impede: olhar julho no dia 02 de agosto dividiria o
    // mês inteiro por 2 e projetaria ~15× o valor real.
    expect(diasDecorridos('2026-07', '2026-08-02')).toBe(31);
    expect(diasDecorridos('2026-02', '2026-08-02')).toBe(28);
  });

  it('mês futuro não tem dia decorrido', () => {
    expect(diasDecorridos('2026-09', '2026-08-02')).toBe(0);
  });

  it('num mês fechado a projeção pelo ritmo dá o próprio realizado', () => {
    const recebido = 90_000;
    const projecao = (recebido / diasDecorridos('2026-07', '2026-08-02')) * diasNoMes('2026-07');
    expect(Math.round(projecao)).toBe(recebido);
  });
});
