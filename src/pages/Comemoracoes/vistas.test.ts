/**
 * vistas.test.ts — "eu já vi esta comemoração".
 *
 * O que se perde se isto quebrar: a comemoração volta a explodir a cada F5,
 * que é exatamente o defeito que este módulo existe para consertar.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { lerVistas, jaVista, marcarVista, limparVistas, chaveVistas } from './vistas';

const DIA = 24 * 3_600_000;

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('marcar e ler', () => {
  it('marcada agora aparece como vista', () => {
    marcarVista('u1', 'c1');
    expect(jaVista('u1', 'c1')).toBe(true);
  });

  it('não vista é falso', () => {
    expect(jaVista('u1', 'c1')).toBe(false);
  });

  it('marcar duas vezes não duplica', () => {
    marcarVista('u1', 'c1');
    marcarVista('u1', 'c1');
    expect(lerVistas('u1')).toHaveLength(1);
  });

  it('o carimbo é o da PRIMEIRA vez — é ele que decide a poda', () => {
    marcarVista('u1', 'c1', 1_000);
    marcarVista('u1', 'c1', 5_000);
    expect(lerVistas('u1', 5_000)[0].ts).toBe(1_000);
  });
});

describe('separação por usuário', () => {
  it('o que eu vi não conta para o colega no mesmo computador', () => {
    marcarVista('u1', 'c1');
    expect(jaVista('u2', 'c1')).toBe(false);
  });

  it('cada usuário tem a própria chave', () => {
    expect(chaveVistas('u1')).not.toBe(chaveVistas('u2'));
  });

  it('sem usuário ainda funciona, sem quebrar', () => {
    marcarVista(null, 'c1');
    expect(jaVista(null, 'c1')).toBe(true);
  });
});

describe('poda', () => {
  it('acima de 7 dias some', () => {
    const agora = 100 * DIA;
    marcarVista('u1', 'antiga', agora - 8 * DIA);
    marcarVista('u1', 'nova',   agora - 1 * DIA);

    const vistas = lerVistas('u1', agora);
    expect(vistas.map((v) => v.id)).toEqual(['nova']);
  });

  it('comemoração de 8 dias atrás pode aparecer de novo — e tudo bem, ela já saiu do ar', () => {
    const agora = 100 * DIA;
    marcarVista('u1', 'c1', agora - 8 * DIA);
    expect(jaVista('u1', 'c1', agora)).toBe(false);
  });

  it('a lista tem teto e mantém as mais novas', () => {
    for (let i = 0; i < 250; i++) marcarVista('u1', `c${i}`, 1_000 + i);
    const vistas = lerVistas('u1', 2_000);
    expect(vistas).toHaveLength(200);
    expect(vistas.at(-1)!.id).toBe('c249');
  });
});

describe('resiliência', () => {
  it('JSON estragado vira lista vazia em vez de derrubar a tela', () => {
    localStorage.setItem(chaveVistas('u1'), '{isso não é json');
    expect(lerVistas('u1')).toEqual([]);
    expect(jaVista('u1', 'c1')).toBe(false);
  });

  it('conteúdo com formato inesperado é descartado item a item', () => {
    localStorage.setItem(chaveVistas('u1'), JSON.stringify([
      { id: 'bom', ts: Date.now() },
      { id: 123, ts: 'ontem' },
      null,
      'solto',
    ]));
    expect(lerVistas('u1').map((v) => v.id)).toEqual(['bom']);
  });

  it('localStorage indisponível não lança — pior caso é repetir num F5', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => marcarVista('u1', 'c1')).not.toThrow();
  });
});

describe('limparVistas', () => {
  it('esquece tudo daquele usuário', () => {
    marcarVista('u1', 'c1');
    limparVistas('u1');
    expect(jaVista('u1', 'c1')).toBe(false);
  });
});
