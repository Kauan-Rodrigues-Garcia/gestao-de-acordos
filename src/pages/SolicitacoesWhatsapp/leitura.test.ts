/**
 * leitura.test.ts — a bolinha vermelha é de cada um.
 *
 * O caso que originou este arquivo está em "líder abrindo a conversa não apaga
 * o aviso do responsável": era exatamente o que acontecia com o carimbo único
 * `lida_em`, e é o que estes testes impedem de voltar.
 */
import { describe, it, expect } from 'vitest';
import {
  contarNaoLidas, cursoresPorConversa, foiLidaPorOutro,
  type Leitura, type MensagemLida,
} from './leitura';

const EU     = 'u-eu';
const OUTRO  = 'u-outro';
const LIDER  = 'u-lider';
const CONV   = 's-1';

function msg(over: Partial<MensagemLida> = {}): MensagemLida {
  return {
    solicitacao_id: CONV,
    autor_id:       OUTRO,
    criado_em:      '2026-07-31T10:00:00.000Z',
    ...over,
  };
}

function leitura(over: Partial<Leitura> = {}): Leitura {
  return {
    solicitacao_id: CONV,
    usuario_id:     EU,
    lido_ate:       '2026-07-31T09:00:00.000Z',
    ...over,
  };
}

describe('cursoresPorConversa', () => {
  it('pega só os meus cursores', () => {
    const mapa = cursoresPorConversa(
      [leitura(), leitura({ usuario_id: OUTRO, lido_ate: '2026-07-31T23:00:00.000Z' })],
      EU,
    );
    expect(mapa.size).toBe(1);
    expect(mapa.get(CONV)).toBe(new Date('2026-07-31T09:00:00.000Z').getTime());
  });

  it('duplicata fica com o mais recente', () => {
    const mapa = cursoresPorConversa(
      [leitura(), leitura({ lido_ate: '2026-07-31T18:00:00.000Z' })],
      EU,
    );
    expect(mapa.get(CONV)).toBe(new Date('2026-07-31T18:00:00.000Z').getTime());
  });

  it('data inválida é ignorada em vez de virar NaN', () => {
    expect(cursoresPorConversa([leitura({ lido_ate: 'xx' })], EU).size).toBe(0);
  });
});

describe('contarNaoLidas', () => {
  it('sem cursor nenhum, tudo do outro está por ler', () => {
    const r = contarNaoLidas([msg(), msg()], [], EU);
    expect(r[CONV]).toBe(2);
  });

  it('minha própria mensagem nunca conta', () => {
    const r = contarNaoLidas([msg({ autor_id: EU }), msg()], [], EU);
    expect(r[CONV]).toBe(1);
  });

  it('conta só o que veio depois do meu cursor', () => {
    const r = contarNaoLidas(
      [
        msg({ criado_em: '2026-07-31T08:00:00.000Z' }),  // antes, já lida
        msg({ criado_em: '2026-07-31T10:00:00.000Z' }),  // depois
        msg({ criado_em: '2026-07-31T11:00:00.000Z' }),  // depois
      ],
      [leitura()],   // li até 09:00
      EU,
    );
    expect(r[CONV]).toBe(2);
  });

  it('mensagem exatamente no instante do cursor conta como lida', () => {
    const r = contarNaoLidas(
      [msg({ criado_em: '2026-07-31T09:00:00.000Z' })],
      [leitura()],
      EU,
    );
    expect(r[CONV]).toBeUndefined();
  });

  it('O BUG: o líder ler não apaga o meu aviso', () => {
    // Era o comportamento antigo — bastava um carimbo de qualquer um.
    const r = contarNaoLidas(
      [msg({ criado_em: '2026-07-31T10:00:00.000Z' })],
      [leitura({ usuario_id: LIDER, lido_ate: '2026-07-31T23:00:00.000Z' })],
      EU,
    );
    expect(r[CONV]).toBe(1);
  });

  it('separa as conversas', () => {
    const r = contarNaoLidas(
      [msg(), msg({ solicitacao_id: 's-2' }), msg({ solicitacao_id: 's-2' })],
      [leitura({ solicitacao_id: 's-2', lido_ate: '2026-07-31T23:00:00.000Z' })],
      EU,
    );
    expect(r[CONV]).toBe(1);
    expect(r['s-2']).toBeUndefined();
  });

  it('sem mensagens devolve objeto vazio', () => {
    expect(contarNaoLidas([], [leitura()], EU)).toEqual({});
  });
});

describe('foiLidaPorOutro', () => {
  const minha = msg({ autor_id: EU, criado_em: '2026-07-31T10:00:00.000Z' });

  it('o outro leu depois de eu escrever', () => {
    expect(foiLidaPorOutro(
      minha,
      [leitura({ usuario_id: OUTRO, lido_ate: '2026-07-31T10:30:00.000Z' })],
      EU,
    )).toBe(true);
  });

  it('o outro só leu o que veio antes', () => {
    expect(foiLidaPorOutro(
      minha,
      [leitura({ usuario_id: OUTRO, lido_ate: '2026-07-31T09:00:00.000Z' })],
      EU,
    )).toBe(false);
  });

  it('o meu próprio cursor não confirma nada', () => {
    // Abrir a conversa não é o outro ter lido.
    expect(foiLidaPorOutro(
      minha,
      [leitura({ usuario_id: EU, lido_ate: '2026-07-31T23:00:00.000Z' })],
      EU,
    )).toBe(false);
  });

  it('cursor de outra conversa não conta', () => {
    expect(foiLidaPorOutro(
      minha,
      [leitura({ solicitacao_id: 's-2', usuario_id: OUTRO, lido_ate: '2026-07-31T23:00:00.000Z' })],
      EU,
    )).toBe(false);
  });

  it('ninguém leu ainda', () => {
    expect(foiLidaPorOutro(minha, [], EU)).toBe(false);
  });

  it('basta UM dos participantes ter lido', () => {
    expect(foiLidaPorOutro(
      minha,
      [
        leitura({ usuario_id: OUTRO, lido_ate: '2026-07-31T09:00:00.000Z' }),
        leitura({ usuario_id: LIDER, lido_ate: '2026-07-31T11:00:00.000Z' }),
      ],
      EU,
    )).toBe(true);
  });
});
