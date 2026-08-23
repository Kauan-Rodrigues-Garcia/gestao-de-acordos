/**
 * estadoAtualizacao.test.ts
 *
 * O defeito que estes casos existem para impedir é sempre o mesmo: **o fio no
 * topo aceso para sempre**. Ele acontece quando um encerramento não é chamado,
 * quando é chamado duas vezes (contador negativo) ou quando uma tela zera o
 * sinal de outra que ainda está buscando.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  comecouAtualizacao, lerAtualizacao, assinarAtualizacao,
  __resetAtualizacaoParaTestes,
} from '@/lib/estadoAtualizacao';

beforeEach(() => { __resetAtualizacaoParaTestes(); });

describe('estadoAtualizacao', () => {
  it('começa parado', () => {
    expect(lerAtualizacao()).toEqual({ emAndamento: 0, desde: null, ultimoSucesso: null });
  });

  it('conta a busca em andamento', () => {
    comecouAtualizacao();
    expect(lerAtualizacao().emAndamento).toBe(1);
    expect(lerAtualizacao().desde).not.toBeNull();
  });

  it('três telas buscando ao mesmo tempo: a primeira a terminar NÃO apaga o sinal', () => {
    const a = comecouAtualizacao();
    const b = comecouAtualizacao();
    const c = comecouAtualizacao();
    expect(lerAtualizacao().emAndamento).toBe(3);

    a();
    expect(lerAtualizacao().emAndamento).toBe(2);
    b();
    c();
    expect(lerAtualizacao().emAndamento).toBe(0);
    expect(lerAtualizacao().desde).toBeNull();
  });

  it('encerrar duas vezes não leva o contador a negativo', () => {
    const encerrar = comecouAtualizacao();
    encerrar();
    encerrar();
    encerrar();
    expect(lerAtualizacao().emAndamento).toBe(0);
  });

  it('`desde` marca o início da RAJADA, não da última busca', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T10:00:00Z'));
    comecouAtualizacao();
    const inicio = lerAtualizacao().desde;

    vi.setSystemTime(new Date('2026-08-23T10:00:02Z'));
    comecouAtualizacao();
    expect(lerAtualizacao().desde).toBe(inicio);
    vi.useRealTimers();
  });

  it('carimba o último sucesso, e a falha não o sobrescreve', () => {
    const ok = comecouAtualizacao();
    ok(true);
    const carimbo = lerAtualizacao().ultimoSucesso;
    expect(carimbo).not.toBeNull();

    const falhou = comecouAtualizacao();
    falhou(false);
    expect(lerAtualizacao().ultimoSucesso).toBe(carimbo);
  });

  it('avisa os assinantes a cada mudança', () => {
    const ouvinte = vi.fn();
    assinarAtualizacao(ouvinte);
    const encerrar = comecouAtualizacao();
    expect(ouvinte).toHaveBeenCalledTimes(1);
    encerrar();
    expect(ouvinte).toHaveBeenCalledTimes(2);
  });

  it('quem cancela a assinatura para de ser avisado', () => {
    const ouvinte = vi.fn();
    const cancelar = assinarAtualizacao(ouvinte);
    cancelar();
    comecouAtualizacao();
    expect(ouvinte).not.toHaveBeenCalled();
  });

  it('o instantâneo é estável entre mudanças — sem isto o React renderiza em laço', () => {
    const antes = lerAtualizacao();
    expect(lerAtualizacao()).toBe(antes);
    comecouAtualizacao();
    expect(lerAtualizacao()).not.toBe(antes);
  });
});
