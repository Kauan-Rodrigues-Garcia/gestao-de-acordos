/**
 * O tempo das situações — as contas que o cronômetro da tela faz.
 *
 * Quem grava o prazo é o banco (`fn_numeros_situacao_prazo`); a tela só compara
 * com o relógio. O que estes testes travam é essa comparação: quando o prazo
 * conta como acabado, como a contagem é escrita, e como o tempo no proxy vira
 * «1 dia», que é o formato do pedido.
 */
import { describe, it, expect } from 'vitest';
import {
  SITUACOES, SITUACOES_COM_PRAZO, RESTRICAO_MAX_MINUTOS,
  temPrazo, eEspera, exigeTempoInformado, contaTempoDecorrido,
  estadoDoPrazo, formatarRestante, formatarDecorrido,
} from '../numerosRegras';

const AGORA = Date.UTC(2026, 8, 11, 15, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const HORA = 3_600_000;

describe('quais situações têm tempo', () => {
  it('esperas e restrição têm prazo; o proxy conta o decorrido; as outras não têm tempo', () => {
    expect(SITUACOES.filter(temPrazo)).toEqual(['aguardando_12h', 'aguardando_24h', 'em_restricao']);
    expect(SITUACOES.filter(eEspera)).toEqual(['aguardando_12h', 'aguardando_24h']);
    expect(SITUACOES.filter(exigeTempoInformado)).toEqual(['em_restricao']);
    expect(SITUACOES.filter(contaTempoDecorrido)).toEqual(['movimentando_proxy']);
  });

  it('a lista com prazo é a que o CHECK do banco exige', () => {
    // `numeros_whatsapp_prazo_coerente`: prazo existe exatamente nestas três.
    expect([...SITUACOES_COM_PRAZO].sort())
      .toEqual(['aguardando_12h', 'aguardando_24h', 'em_restricao']);
  });

  it('o teto da restrição é o da RPC: 90 dias', () => {
    expect(RESTRICAO_MAX_MINUTOS).toBe(129_600);
  });
});

describe('o prazo', () => {
  it('conta quanto falta', () => {
    expect(estadoDoPrazo(iso(AGORA + 90_000), AGORA)).toEqual({ restanteMs: 90_000, acabou: false });
  });

  it('no instante exato do fim já acabou — nada de 00:00:00 ao lado de «aguardando»', () => {
    expect(estadoDoPrazo(iso(AGORA), AGORA)).toEqual({ restanteMs: 0, acabou: true });
  });

  it('passado o fim, não conta negativo', () => {
    expect(estadoDoPrazo(iso(AGORA - 5_000), AGORA)).toEqual({ restanteMs: 0, acabou: true });
  });

  it('sem prazo, ou com prazo ilegível, não inventa contagem', () => {
    expect(estadoDoPrazo(null, AGORA)).toBeNull();
    expect(estadoDoPrazo(undefined, AGORA)).toBeNull();
    expect(estadoDoPrazo('nao-e-data', AGORA)).toBeNull();
  });
});

describe('a contagem regressiva', () => {
  it('horas, minutos e segundos', () => {
    expect(formatarRestante((11 * 3600 + 42 * 60 + 5) * 1000)).toBe('11:42:05');
  });

  it('passando de um dia, mostra os dias — a restrição vai a 90', () => {
    expect(formatarRestante((2 * 86_400 + 3 * 3600 + 12 * 60 + 44) * 1000)).toBe('2d 03:12:44');
  });

  it('arredonda o segundo para cima: o zero só aparece junto com «Pronto»', () => {
    expect(formatarRestante(500)).toBe('00:00:01');
    expect(formatarRestante(0)).toBe('00:00:00');
  });
});

describe('o tempo no proxy', () => {
  it('antes de uma hora', () => {
    expect(formatarDecorrido(iso(AGORA - 30 * 60_000), AGORA)).toBe('menos de 1 hora');
  });

  it('em horas, até completar um dia', () => {
    expect(formatarDecorrido(iso(AGORA - HORA), AGORA)).toBe('1 hora');
    expect(formatarDecorrido(iso(AGORA - 23 * HORA), AGORA)).toBe('23 horas');
  });

  it('em dias, como o pedido: «Movimentando no Proxy — 1 dia»', () => {
    expect(formatarDecorrido(iso(AGORA - 24 * HORA), AGORA)).toBe('1 dia');
    expect(formatarDecorrido(iso(AGORA - 3 * 24 * HORA - 5 * HORA), AGORA)).toBe('3 dias');
  });

  it('sem início conhecido, não desenha nada', () => {
    expect(formatarDecorrido(null, AGORA)).toBeNull();
    expect(formatarDecorrido('nao-e-data', AGORA)).toBeNull();
  });
});
