/**
 * formatacao.test.ts — tempo de espera e busca da aba de Solicitações.
 *
 * O tempo de espera vira cor na tela (âmbar > 2 h, vermelho > 1 dia), então os
 * limites são regra de negócio e não detalhe de formatação.
 */
import { describe, it, expect } from 'vitest';
import {
  esperaMs, formatarEspera, nivelEspera, combinaBusca,
  ESPERA_ATENCAO, ESPERA_CRITICA,
} from './formatacao';

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

const ABERTURA = '2026-07-30T09:00:00.000Z';
const t = (ms: number) => new Date(new Date(ABERTURA).getTime() + ms).getTime();

function pedido(over: Partial<Parameters<typeof esperaMs>[0]> = {}) {
  return { status: 'pendente', criado_em: ABERTURA, finalizado_em: null, ...over };
}

describe('esperaMs', () => {
  it('conta da abertura até agora enquanto está pendente', () => {
    expect(esperaMs(pedido(), t(40 * MIN))).toBe(40 * MIN);
  });

  it('continua contando depois de assumido — o alarme não pode sumir', () => {
    const s = pedido({ status: 'em_andamento' });
    expect(esperaMs(s, t(3 * DIA))).toBe(3 * DIA);
  });

  it('continua contando em falta_info', () => {
    expect(esperaMs(pedido({ status: 'falta_info' }), t(5 * HORA))).toBe(5 * HORA);
  });

  it('congela no carimbo quando marcado feito', () => {
    const s = pedido({ status: 'feito', finalizado_em: new Date(t(90 * MIN)).toISOString() });
    // "agora" muito depois não muda mais o número
    expect(esperaMs(s, t(10 * DIA))).toBe(90 * MIN);
  });

  it('feito sem finalizado_em cai em atualizado_em', () => {
    const s = pedido({
      status: 'feito',
      finalizado_em: null,
      atualizado_em: new Date(t(2 * HORA)).toISOString(),
    });
    expect(esperaMs(s, t(10 * DIA))).toBe(2 * HORA);
  });

  it('nunca devolve negativo se o relógio do cliente estiver atrasado', () => {
    expect(esperaMs(pedido(), t(-5 * MIN))).toBe(0);
  });

  it('data inválida vira zero em vez de NaN', () => {
    expect(esperaMs(pedido({ criado_em: 'não é data' }), t(HORA))).toBe(0);
  });
});

describe('formatarEspera', () => {
  it.each([
    [30_000,            '<1m'],
    [1 * MIN,           '1m'],
    [10 * MIN,          '10m'],
    [59 * MIN,          '59m'],
    [HORA,              '01:00h'],
    [HORA + 30 * MIN,   '01:30h'],
    [23 * HORA + 59 * MIN, '23:59h'],
    [DIA,               '1d 00h'],
    [DIA + 5 * HORA,    '1d 05h'],
    [10 * DIA + 3 * HORA, '10d 03h'],
  ])('%i ms → %s', (ms, esperado) => {
    expect(formatarEspera(ms)).toBe(esperado);
  });
});

describe('nivelEspera', () => {
  it('abaixo de 2 h é normal', () => {
    expect(nivelEspera(ESPERA_ATENCAO - 1)).toBe('normal');
  });
  it('2 h em ponto já é atenção', () => {
    expect(nivelEspera(ESPERA_ATENCAO)).toBe('atencao');
  });
  it('entre 2 h e 1 dia segue atenção', () => {
    expect(nivelEspera(ESPERA_CRITICA - 1)).toBe('atencao');
  });
  it('1 dia em ponto já é crítico', () => {
    expect(nivelEspera(ESPERA_CRITICA)).toBe('critico');
  });
});

describe('combinaBusca', () => {
  const s = {
    codigo_cliente: '2651454',
    nome_cliente:   'MARIA VERUZA GONÇALVES DA SILVA',
    whatsapp:       '83993908420',
  };

  it('termo vazio não filtra nada', () => {
    expect(combinaBusca(s, '')).toBe(true);
    expect(combinaBusca(s, '   ')).toBe(true);
  });

  it('acha pelo código inteiro ou por parte dele', () => {
    expect(combinaBusca(s, '2651454')).toBe(true);
    expect(combinaBusca(s, '26514')).toBe(true);
  });

  it('acha pelo nome ignorando caixa e acento', () => {
    expect(combinaBusca(s, 'veruza')).toBe(true);
    expect(combinaBusca(s, 'goncalves')).toBe(true);
    expect(combinaBusca(s, 'GONÇALVES')).toBe(true);
  });

  it('acha pelo WhatsApp mesmo digitado com máscara', () => {
    expect(combinaBusca(s, '(83) 99390-8420')).toBe(true);
    expect(combinaBusca(s, '99390')).toBe(true);
  });

  it('não confunde o fim do código com o começo do telefone', () => {
    // "1454" (fim do código) + "8399" (início do telefone) só casaria se os
    // campos fossem concatenados antes da comparação numérica
    expect(combinaBusca(s, '14548399')).toBe(false);
  });

  it('nega o que não existe', () => {
    expect(combinaBusca(s, 'joão')).toBe(false);
    expect(combinaBusca(s, '0000000')).toBe(false);
  });

  it('aguenta nome nulo', () => {
    expect(combinaBusca({ ...s, nome_cliente: null }, 'veruza')).toBe(false);
    expect(combinaBusca({ ...s, nome_cliente: null }, '2651454')).toBe(true);
  });
});
